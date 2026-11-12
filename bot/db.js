const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { DATABASE_URL, authDir } = require("./config");

let pgPool = null;

if (DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
    pgPool.on("error", (err) => {
      console.error(">>> [PostgreSQL] Erro no pool de conexão:", err.message);
    });
    console.log(">>> [PostgreSQL] Pool de conexão inicializado.");
  } catch (e) {
    console.error("Erro ao inicializar Pool PostgreSQL:", e.message);
  }
}

async function inicializarTabelaBanco() {
  if (!pgPool) return;
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS zap_session (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error("Erro ao verificar/criar tabela zap_session:", err.message);
  }
}
inicializarTabelaBanco();

// =========================================================================
// SINCRONIZAÇÃO DE SESSÃO COM SUPABASE
// =========================================================================

async function restoreAuthFromDb() {
  if (!pgPool) return false;
  try {
    const credsRes = await pgPool.query(
      "SELECT value FROM zap_session WHERE id = 'creds.json' OR id = 'creds'"
    );
    if (credsRes.rows.length === 0) return false;

    let credsObj = null;
    try {
      credsObj = JSON.parse(credsRes.rows[0].value);
    } catch (_) {}

    if (!credsObj || !credsObj.me || !credsObj.me.id) {
      console.log("ℹ️ [Auth] Nenhuma sessão ativa no banco (me ausente). Limpando para QR Code limpo.");
      await clearDbAuth();
      return false;
    }

    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const allRows = await pgPool.query(
      "SELECT id, value FROM zap_session WHERE id NOT LIKE 'bot_%'"
    );
    for (const row of allRows.rows) {
      const fileName = row.id.endsWith(".json") ? row.id : `${row.id}.json`;
      fs.writeFileSync(path.join(authDir, fileName), row.value, "utf-8");
    }
    console.log(`✅ [Auth] ${allRows.rows.length} arquivos de sessão autenticada restaurados do Supabase!`);
    return true;
  } catch (err) {
    console.error("Erro ao restaurar sessão do PostgreSQL:", err.message);
    return false;
  }
}

let isSyncing = false;
async function syncAuthToDb() {
  if (!pgPool || !fs.existsSync(authDir) || isSyncing) return;
  isSyncing = true;
  try {
    const credsPath = path.join(authDir, "creds.json");
    if (!fs.existsSync(credsPath)) {
      isSyncing = false;
      return;
    }
    const credsRaw = fs.readFileSync(credsPath, "utf-8");
    let creds = null;
    try {
      creds = JSON.parse(credsRaw);
    } catch (_) {}

    if (!creds || !creds.me || !creds.me.id) {
      isSyncing = false;
      return;
    }

    const files = fs.readdirSync(authDir);
    const upserts = [];
    for (const f of files) {
      if (f.endsWith(".json")) {
        const content = fs.readFileSync(path.join(authDir, f), "utf-8");
        upserts.push({ id: f, value: content });
      }
    }

    if (upserts.length > 0) {
      const ids = upserts.map((u) => u.id);
      const values = upserts.map((u) => u.value);
      await pgPool.query(
        `INSERT INTO zap_session (id, value, updated_at)
         SELECT unnest($1::text[]), unnest($2::text[]), NOW()
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [ids, values]
      );
      await pgPool.query(
        `INSERT INTO zap_session (id, value, updated_at) VALUES ('creds', $1, NOW())
         ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [credsRaw]
      );
      console.log(`💾 [Auth] ${upserts.length} arquivos de sessão salvos no Supabase.`);
    }
  } catch (err) {
    console.error("Erro ao sincronizar sessão com PostgreSQL:", err.message);
  } finally {
    isSyncing = false;
  }
}

async function clearDbAuth() {
  if (!pgPool) return;
  try {
    await pgPool.query("DELETE FROM zap_session WHERE id NOT LIKE 'bot_%'");
    console.log("🗑️ [Auth] Dados de sessão removidos do Supabase.");
  } catch (e) {
    console.error("Erro ao limpar dados no Supabase:", e.message);
  }
}

function clearLocalAuth() {
  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error("Erro ao remover auth_info_baileys local:", e.message);
  }
}

// =========================================================================
// ELEIÇÃO DE LÍDER (PREVENÇÃO DE CONFLITO RENDER ERRO 440)
// =========================================================================

const INSTANCE_ID = `inst-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
let isLeader = false;
let leaderHeartbeatInterval = null;

async function checkAndAcquireLeader() {
  if (!pgPool) return true;
  try {
    const now = Date.now();
    const res = await pgPool.query(`
      INSERT INTO zap_session (id, value, updated_at)
        VALUES ('bot_active_leader', $1, NOW())
        ON CONFLICT (id) DO UPDATE
          SET value = $1, updated_at = NOW()
          WHERE (
            zap_session.value::json->>'instanceId' = $2
            OR NOW() - zap_session.updated_at > INTERVAL '12 seconds'
          )
      RETURNING id
    `, [JSON.stringify({ instanceId: INSTANCE_ID, updatedAt: now }), INSTANCE_ID]);

    if (res.rows.length > 0) {
      isLeader = true;
      startLeaderHeartbeat();
      return true;
    }

    isLeader = false;
    return false;
  } catch (err) {
    console.error("Erro ao verificar liderança:", err.message);
    return true;
  }
}

function startLeaderHeartbeat() {
  if (leaderHeartbeatInterval) clearInterval(leaderHeartbeatInterval);
  leaderHeartbeatInterval = setInterval(async () => {
    if (!isLeader || !pgPool) return;
    try {
      const payload = JSON.stringify({ instanceId: INSTANCE_ID, updatedAt: Date.now() });
      await pgPool.query(
        "UPDATE zap_session SET value = $1, updated_at = NOW() WHERE id = 'bot_active_leader'",
        [payload]
      );
    } catch (_) {}
  }, 3000);
}

async function releaseLeader() {
  isLeader = false;
  if (leaderHeartbeatInterval) {
    clearInterval(leaderHeartbeatInterval);
    leaderHeartbeatInterval = null;
  }
  if (pgPool) {
    try {
      await pgPool.query("DELETE FROM zap_session WHERE id = 'bot_active_leader'");
    } catch (_) {}
  }
}

module.exports = {
  pgPool,
  INSTANCE_ID,
  restoreAuthFromDb,
  syncAuthToDb,
  clearDbAuth,
  clearLocalAuth,
  checkAndAcquireLeader,
  releaseLeader,
  isLeader: () => isLeader,
};
