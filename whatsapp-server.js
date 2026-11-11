const http = require("http");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
} = require("@whiskeysockets/baileys");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const PORT = 3001;
const authDir = path.join(__dirname, "auth_info_baileys");
const dbPath = path.join(__dirname, "data_storage.json");

// Conexão com o banco PostgreSQL persistente (Supabase)
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.lsgewrzvdviqthzegowv:aEB4_2Fgg!k5EZC@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

let pgPool = null;
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

// Inicializar tabela de sessão no banco
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

// Restaurar sessão do banco de dados na inicialização
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

    // CRÍTICO: Só restaura se a sessão estiver de fato AUTENTICADA (me.id presente)
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

// Persistir arquivos da sessão autenticada no banco de dados
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

// Limpar dados do Supabase
async function clearDbAuth() {
  if (!pgPool) return;
  try {
    await pgPool.query("DELETE FROM zap_session WHERE id NOT LIKE 'bot_%'");
    console.log("🗑️ [Auth] Dados de sessão removidos do Supabase.");
  } catch (e) {
    console.error("Erro ao limpar dados no Supabase:", e.message);
  }
}

// Limpar arquivos locais
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
// ELEIÇÃO DE LÍDER E PREVENÇÃO DE CONFLITO RENDER (ERRO 440)
// =========================================================================
const INSTANCE_ID = `inst-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
let isLeader = false;
let leaderHeartbeatInterval = null;

async function checkAndAcquireLeader() {
  if (!pgPool) return true;
  try {
    const now = Date.now();

    // Tenta adquirir liderança com UPDATE atômico:
    // Só sobrescreve se o registro NÃO existe OU o heartbeat está morto (> 12s sem atualizar)
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
      // Conseguiu: somos o líder
      isLeader = true;
      startLeaderHeartbeat();
      return true;
    }

    // Outro líder está vivo
    isLeader = false;
    return false;
  } catch (err) {
    console.error("Erro ao verificar liderança:", err.message);
    // Em caso de erro de DB, permite subir para não travar
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

// =========================================================================
// ESTADO GLOBAL DO SERVIÇO
// =========================================================================
let sock = null;
let qrCodeBase64 = null;
let lastQrTime = null;
let status = "DISCONNECTED"; // "DISCONNECTED" | "CONNECTING" | "CONNECTED"
let connectedPhone = null;
let isStarting = false;
let reconnectTimeout = null;
let lastDisconnectInfo = {
  statusCode: null,
  error: null,
  time: null,
  disconnectCount: 0,
};

const userSessions = new Map();
const phoneToJidMap = new Map();
const processedMessageIds = new Set();

setInterval(() => {
  if (processedMessageIds.size > 2000) {
    processedMessageIds.clear();
  }
}, 10 * 60 * 1000);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

const VERCEL_API_URL = (process.env.APP_URL || "https://malu-alvesbeauty.vercel.app").replace(/\/$/, "");
let remoteConfigCache = null;

async function atualizarConfigRemoto() {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/config`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === "object") {
        remoteConfigCache = data;
        try {
          if (fs.existsSync(dbPath)) {
            const raw = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
            raw.config = { ...(raw.config || {}), ...data };
            fs.writeFileSync(dbPath, JSON.stringify(raw, null, 2), "utf-8");
          }
        } catch (_) {}
      }
    }
  } catch (err) {}
}

atualizarConfigRemoto();
setInterval(atualizarConfigRemoto, 30 * 1000);

// Auto-ping a cada 4 minutos para impedir que o container do Render hiberne por inatividade
const RENDER_HEALTH_URL = process.env.RENDER_EXTERNAL_URL || "https://malu-alvesbeauty.onrender.com";
setInterval(async () => {
  try {
    await fetch(`${RENDER_HEALTH_URL}/health`).catch(() => {});
  } catch (_) {}
}, 4 * 60 * 1000);

function lerBancoCentral() {
  let data = { servicos: [], agendamentos: [], clientes: [], config: {} };
  try {
    if (fs.existsSync(dbPath)) {
      data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    }
  } catch (e) {
    console.error("Erro ao ler data_storage.json:", e);
  }

  if (remoteConfigCache) {
    data.config = {
      ...(data.config || {}),
      ...remoteConfigCache,
    };
  }

  if (data.config && typeof data.config.mensagem_boas_vindas === "string" && data.config.mensagem_boas_vindas.trim().startsWith("{")) {
    try {
      const extra = JSON.parse(data.config.mensagem_boas_vindas);
      data.config = {
        ...data.config,
        ...extra,
        mensagem_boas_vindas: typeof extra.bio === "string" ? extra.bio : data.config.mensagem_boas_vindas,
      };
    } catch (e) {}
  }

  return data;
}

const servicosPadrao = [
  { id: "serv-1", titulo: "Design de Sobrancelhas Simples", preco: 30.0, duracao_minutos: 30 },
  { id: "serv-2", titulo: "Design com Henna", preco: 45.0, duracao_minutos: 45 },
  { id: "serv-3", titulo: "Brow Lamination", preco: 80.0, duracao_minutos: 50 },
  { id: "serv-4", titulo: "Epilação Facial / Buço", preco: 20.0, duracao_minutos: 15 },
];

function obterServicosAtivos() {
  const db = lerBancoCentral();
  if (db.servicos && db.servicos.length > 0) {
    return db.servicos.filter((s) => s.ativo !== false);
  }
  return servicosPadrao;
}

function obterCumprimentoHorario() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

function formatarMensagemZap(template, vars) {
  let resultado = template;
  const varsCompletas = {
    cumprimento: obterCumprimentoHorario(),
    ...vars,
  };
  for (const chave in varsCompletas) {
    const val = varsCompletas[chave] !== undefined && varsCompletas[chave] !== null ? String(varsCompletas[chave]) : "";
    resultado = resultado.split(`{${chave}}`).join(val);
  }
  return resultado;
}

function formatarListaServicosZap(servicos) {
  return servicos
    .map((s, idx) => {
      const precoOriginal = formatarMoeda(s.preco);
      if (s.em_promocao && s.preco_promocional && s.preco_promocional < s.preco) {
        const precoPromo = formatarMoeda(s.preco_promocional);
        return `*${idx + 1}* - ${s.titulo} (~${precoOriginal}~ 🔥 *${precoPromo}* PROMOÇÃO! - ${s.duracao_minutos}min)`;
      }
      return `*${idx + 1}* - ${s.titulo} (${precoOriginal} - ${s.duracao_minutos}min)`;
    })
    .join("\n");
}

function verificarRespostaCustomizada(textoLimpo, config) {
  const customizadas = config?.mensagens_zap?.respostas_personalizadas;
  if (!customizadas || !Array.isArray(customizadas)) return null;

  for (const resp of customizadas) {
    if (resp.ativo === false) continue;

    if (resp.opcao_numero && textoLimpo === resp.opcao_numero.trim().toLowerCase()) {
      return resp;
    }

    if (resp.palavras_chave) {
      const palavras = resp.palavras_chave
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

      if (palavras.some((p) => textoLimpo.includes(p))) {
        return resp;
      }
    }

    if (resp.titulo && textoLimpo.includes(resp.titulo.toLowerCase())) {
      return resp;
    }
  }

  return null;
}

function buscarClientePorTelefone(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.clientes?.find((c) => {
    const cTel = c.telefone.replace(/\D/g, "");
    return cTel === tel || cTel === tel.slice(2) || `55${cTel}` === tel;
  });
}

function buscarAgendamentoAtivo(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

  return db.agendamentos?.find((ag) => {
    if (ag.status !== "CONFIRMADO" && ag.status !== "AGUARDANDO_SINAL") return false;
    const agTel = (ag.cliente_telefone || "").replace(/\D/g, "");
    const mesmoTel = agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
    if (!mesmoTel) return false;
    const agData = ag.horario_inicio.split("T")[0];
    return agData >= hojeStr;
  });
}

function buscarAgendamentoAguardandoSinal(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.agendamentos?.find((ag) => {
    if (ag.status !== "AGUARDANDO_SINAL") return false;
    const agTel = (ag.cliente_telefone || "").replace(/\D/g, "");
    return agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
  });
}

function gerarDiasDisponiveis() {
  const dias = [];
  const hoje = new Date();

  for (let i = 0; i < 4; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);

    const diaSemanaNum = d.getDay();
    if (diaSemanaNum === 0 && i > 0) {
      continue;
    }

    const isoData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nomeFormatado = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    const rotulo = i === 0 ? `Hoje (${nomeFormatado})` : i === 1 ? `Amanhã (${nomeFormatado})` : nomeFormatado;

    dias.push({ isoData, rotulo, diaSemanaNum });
  }

  return dias;
}

function calcularHorariosParaData(dataIso) {
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const ehHoje = dataIso === hojeStr;

  const horaAtual = agora.getHours();
  const minutoAtual = agora.getMinutes();
  const minutoAtualTotal = horaAtual * 60 + minutoAtual;

  const db = lerBancoCentral();
  const agendamentosDoDia = (db.agendamentos || []).filter(
    (a) => a.status !== "CANCELADO" && a.horario_inicio.startsWith(dataIso)
  );

  const horariosOcupados = agendamentosDoDia.map((a) => {
    return a.horario_inicio.split("T")[1]?.slice(0, 5) || "00:00";
  });

  const horariosDisponiveis = [];
  const inicioExpediente = 9 * 60;
  const fimExpediente = 20 * 60;

  for (let min = inicioExpediente; min + 30 <= fimExpediente; min += 30) {
    if (min >= 12 * 60 && min < 13 * 60) continue;
    if (ehHoje && min <= minutoAtualTotal + 15) continue;

    const h = Math.floor(min / 60);
    const m = min % 60;
    const horaFormatada = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

    if (!horariosOcupados.includes(horaFormatada)) {
      horariosDisponiveis.push(horaFormatada);
    }
  }

  if (horariosDisponiveis.length === 0) {
    if (ehHoje) return [];
    return ["09:00", "09:45", "10:30", "11:15", "14:00", "15:00", "16:30", "17:15"];
  }

  return horariosDisponiveis.slice(0, 8);
}

async function salvarAgendamentoNoPainel(dados) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    console.log(`>>> [Sync Painel Admin] Status da gravação: ${res.status}`);
  } catch (err) {
    console.error("Erro ao sincronizar agendamento:", err.message);
  }
}

async function cancelarAgendamentoNoPainel(id) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELADO" }),
    });
    console.log(`>>> [Cancelamento via Zap] Status: ${res.status}`);
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err.message);
  }
}

async function aprovarComprovanteCliente(telefoneLimpo) {
  try {
    const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`);
    if (res.ok) {
      const ags = await res.json();
      const tel = String(telefoneLimpo || "").replace(/\D/g, "");
      const pendente = (ags || []).find((a) => {
        if (a.status !== "AGUARDANDO_SINAL") return false;
        const aTel = String(a.cliente_telefone || "").replace(/\D/g, "");
        return aTel === tel || aTel === tel.slice(2) || `55${aTel}` === tel;
      });
      if (pendente) {
        await fetch(`${VERCEL_API_URL}/api/agendamentos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: pendente.id,
            status: "CONFIRMADO",
            comprovante_recebido: true,
            forma_pagamento: "PIX",
          }),
        });
        console.log(`>>> [Comprovante] Agendamento ${pendente.id} aprovado com sucesso via WhatsApp!`);
        return pendente;
      }
    }
  } catch (e) {
    console.error("Erro ao aprovar comprovante via API:", e.message);
  }
  return null;
}

async function verificarSeHorarioLivre(dataHoraIso) {
  if (!dataHoraIso) return false;
  try {
    let ags = [];
    try {
      const res = await fetch(`${VERCEL_API_URL}/api/agendamentos`);
      if (res.ok) {
        ags = await res.json();
      }
    } catch (e) {}

    if (!ags || ags.length === 0) {
      const db = lerBancoCentral();
      ags = db.agendamentos || [];
    }

    const agora = new Date();
    const dataHoraAlvo = new Date(dataHoraIso);
    if (dataHoraAlvo.getTime() <= agora.getTime()) {
      return false;
    }

    const ocupado = ags.some((a) => {
      if (a.status === "CANCELADO") return false;
      return a.horario_inicio === dataHoraIso || a.horario_inicio.startsWith(dataHoraIso.slice(0, 16));
    });

    return !ocupado;
  } catch (err) {
    console.error("Erro ao verificar disponibilidade do horário:", err);
    return false;
  }
}

async function enviarMensagemHumana(remoteJid, texto) {
  if (!sock) return;
  try {
    sock.sendPresenceUpdate("composing", remoteJid).catch(() => {});
    await sock.sendMessage(remoteJid, { text: texto });
    console.log(`>>> [WhatsApp] Resposta enviada com sucesso para ${remoteJid}`);
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);
  }
}

async function resolverRemoteJid(telefone) {
  let telLimpo = String(telefone || "").replace(/\D/g, "");
  if (telLimpo.startsWith("0")) {
    telLimpo = telLimpo.replace(/^0+/, "");
  }
  if (!telLimpo) return null;

  let targetJid =
    phoneToJidMap.get(telLimpo) ||
    phoneToJidMap.get(`55${telLimpo}`) ||
    phoneToJidMap.get(telLimpo.startsWith("55") ? telLimpo.slice(2) : telLimpo);

  if (targetJid) {
    return targetJid;
  }

  if (sock) {
    try {
      const numCom55 = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
      const res = await sock.onWhatsApp(numCom55);
      if (res && res.length > 0 && res[0].exists) {
        targetJid = res[0].jid;
        phoneToJidMap.set(telLimpo, targetJid);
        phoneToJidMap.set(numCom55, targetJid);
        return targetJid;
      }

      if (numCom55.length === 13 && numCom55.startsWith("55")) {
        const ddd = numCom55.slice(2, 4);
        const semNono = `55${ddd}${numCom55.slice(5)}`;
        const resSemNono = await sock.onWhatsApp(semNono);
        if (resSemNono && resSemNono.length > 0 && resSemNono[0].exists) {
          targetJid = resSemNono[0].jid;
          phoneToJidMap.set(telLimpo, targetJid);
          phoneToJidMap.set(numCom55, targetJid);
          return targetJid;
        }
      }
    } catch (err) {
      console.error("Erro ao validar onWhatsApp:", err.message);
    }
  }

  const numFinal = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
  targetJid = `${numFinal}@s.whatsapp.net`;
  return targetJid;
}

// =========================================================================
// MOTOR CONVERSACIONAL INTELIGENTE DO STUDIO
// =========================================================================
async function processarMensagemRobo(remoteJid, textoUsuario, pushNameRaw, realPhone, ehMidia = false) {
  const textoLimpo = (textoUsuario || "").trim().toLowerCase();
  let session = userSessions.get(remoteJid) || { step: "INICIAL" };
  let resposta = "";

  const agoraMs = Date.now();
  if (!remoteConfigCache) {
    await atualizarConfigRemoto().catch(() => {});
  }
  const db = lerBancoCentral();

  // Verifica se o Atendimento Automático está ativado nas Regras do Robô
  if (db.config?.mensagens_zap?.robo_ativo === false) {
    console.log(`ℹ️ [WhatsApp] Mensagem de ${remoteJid} ignorada: Atendimento Automático desativado nas Regras.`);
    return null;
  }

  const timeoutMin = db.config?.tempo_inatividade_bot_minutos || 15;
  const timeoutMs = timeoutMin * 60 * 1000;

  if (session.step && session.step !== "INICIAL" && session.lastActivity) {
    const tempoInativo = agoraMs - session.lastActivity;
    if (tempoInativo > timeoutMs && session.step !== "AGUARDANDO_COMPROVANTE") {
      session = { step: "INICIAL", lastActivity: agoraMs };
    }
  }
  session.lastActivity = agoraMs;

  const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const telefoneFinal = realPhone || remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "");

  const clienteCadastrado = buscarClientePorTelefone(telefoneFinal);
  const agendamentoAtivo = buscarAgendamentoAtivo(telefoneFinal);
  const servicosAtivos = obterServicosAtivos();

  const pushNameLimpo = (pushNameRaw || "").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim();
  const nomeDetectado = pushNameLimpo || "Cliente";

  const ehComprovante =
    ehMidia ||
    textoLimpo.includes("comprovante") ||
    textoLimpo.includes("segue o comprovante") ||
    textoLimpo.includes("foto do comprovante") ||
    ((textoLimpo.includes("enviei") || textoLimpo.includes("mandei") || textoLimpo.includes("transferi") || textoLimpo.includes("fiz o pix")) &&
      (textoLimpo.includes("pix") || textoLimpo.includes("sinal") || textoLimpo.includes("comprovante") || textoLimpo.includes("valor")));

  if (session.step === "AGUARDANDO_COMPROVANTE" || ehComprovante) {
    const agAprovado = await aprovarComprovanteCliente(telefoneFinal);
    const agendamentoAlvo = agAprovado || buscarAgendamentoAguardandoSinal(telefoneFinal);

    if (agendamentoAlvo) {
      session = { step: "INICIAL" };
      userSessions.set(remoteJid, session);
      return (
        `📸 *Comprovante do PIX recebido com sucesso!* ✨\n\n` +
        `Olá, *${nomeDetectado}*! Identificamos o seu comprovante do sinal e o seu agendamento para *${agendamentoAlvo.servico_titulo || "o procedimento"}* está *100% CONFIRMADO* na agenda do Studio Malu Alves Beauty! 🌸\n\n` +
        `📍 *Local:* Studio Malu Alves Beauty\n` +
        `Te enviaremos uma mensagem de lembrete antes do horário. Agradecemos a preferência e esperamos por você! ✨`
      );
    } else if (session.step === "AGUARDANDO_COMPROVANTE") {
      session = { step: "INICIAL" };
      userSessions.set(remoteJid, session);
      return (
        `📸 *Comprovante recebido com sucesso!* ✨\n\n` +
        `Nossa equipe já foi notificada no painel administrativo e seu horário está garantido! Qualquer dúvida, estamos à disposição. 💖`
      );
    }
  }

  // ETAPA 1: MENU PRINCIPAL
  if (session.step === "INICIAL") {
    if (agendamentoAtivo) {
      const horaStr = agendamentoAtivo.horario_inicio.split("T")[1]?.slice(0, 5) || "";
      const dataStr = agendamentoAtivo.horario_inicio.split("T")[0].split("-").reverse().slice(0, 2).join("/");

      if (textoLimpo === "1" || textoLimpo.includes("desmarcar") || textoLimpo.includes("cancelar") || textoLimpo.includes("remarcar")) {
        await cancelarAgendamentoNoPainel(agendamentoAtivo.id);

        const diasDisponiveis = gerarDiasDisponiveis();
        session = {
          step: "ESCOLHENDO_DIA",
          servico: { id: agendamentoAtivo.servico_id, titulo: agendamentoAtivo.servico_titulo, preco: agendamentoAtivo.valor_cobrado, duracao_minutos: agendamentoAtivo.duracao_minutos || 30 },
          diasDisponiveis,
          nomeCliente: nomeDetectado,
        };

        const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        resposta =
          `✅ *Seu agendamento anterior de ${dataStr} às ${horaStr} foi cancelado.*\n\n` +
          `📅 *Escolha a nova data para seu ${agendamentoAtivo.servico_titulo}:*\n\n${listaDias}\n\n` +
          `_Digite o número da data desejada:_`;
      } else if (textoLimpo === "2" || textoLimpo.includes("novo") || textoLimpo.includes("outro")) {
        resposta =
          `✂️ *Escolha o serviço adicional desejado:*\n\n` +
          formatarListaServicosZap(servicosAtivos) +
          `\n\n_Digite o número do serviço desejado:_`;
        session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("designer") || textoLimpo.includes("atendente")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já avisei a designer e ela irá falar com você em instantes.`;
      } else {
        const cumprimento = obterCumprimentoHorario();
        resposta =
          `✨ *${cumprimento}, ${nomeDetectado}!* ✨\n\n` +
          `📅 *Você já possui um agendamento confirmado:*\n` +
          `• *${agendamentoAtivo.servico_titulo}*\n` +
          `• *Data:* ${dataStr} às *${horaStr}*\n` +
          `• *Local:* Studio Malu Alves Beauty\n\n` +
          `Como posso te ajudar hoje?\n\n` +
          `*1* ➔ Cancelar / Remarcar este horário\n` +
          `*2* ➔ Fazer um novo agendamento adicional\n` +
          `*3* ➔ Falar com a Designer\n\n` +
          `_Digite o número da opção desejada:_`;
      }
    } else {
      if (
        textoLimpo === "1" ||
        textoLimpo.includes("agendar") ||
        textoLimpo.includes("marcar") ||
        textoLimpo.includes("sobrancelha") ||
        textoLimpo.includes("horario") ||
        textoLimpo.includes("horário")
      ) {
        if (clienteCadastrado?.ultimo_servico_nome) {
          const ultimoSrv = servicosAtivos.find((s) => s.id === clienteCadastrado.ultimo_servico_id) || servicosAtivos[0];
          const diasDisponiveis = gerarDiasDisponiveis();
          session = {
            step: "ESCOLHENDO_DIA",
            servico: ultimoSrv,
            diasDisponiveis,
            nomeCliente: nomeDetectado,
          };
          const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
          const cumprimento = obterCumprimentoHorario();

          resposta =
            `✨ *${cumprimento}, ${nomeDetectado}!* ✨\n` +
            `Vamos marcar seu *${ultimoSrv.titulo}* (${formatarMoeda(ultimoSrv.preco)})?\n\n` +
            `📅 *Escolha o dia:*\n\n${listaDias}\n\n` +
            `_Digite o número do dia (ou digite *Outro* para mudar o procedimento):_`;
        } else {
          resposta =
            `✨ *Escolha o procedimento desejado:*\n\n` +
            formatarListaServicosZap(servicosAtivos) +
            `\n\n_Digite o número do procedimento desejado (ex: 1, 2 ou 3):_`;
          session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
        }
      } else if (textoLimpo === "2" || textoLimpo.includes("preço") || textoLimpo.includes("serviço") || textoLimpo.includes("procedimento")) {
        resposta =
          `📋 *Nossa Tabela de Procedimentos:*\n\n` +
          formatarListaServicosZap(servicosAtivos) +
          `\n\nDigite *1* para agendar seu horário!`;
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("humano") || textoLimpo.includes("designer")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já notifiquei a equipe e iremos te responder em instantes por aqui.`;
      } else {
        const respCustom = verificarRespostaCustomizada(textoLimpo, db.config);
        if (respCustom) {
          resposta = `${respCustom.resposta}\n\n_Digite *1* para agendar ou *Menu* para ver as opções._`;
        } else {
          const customizadas = (db.config?.mensagens_zap?.respostas_personalizadas || []).filter((r) => r.ativo);
          let linhasCustom = "";
          if (customizadas.length > 0) {
            linhasCustom = "\n" + customizadas.map((r, i) => `*${r.opcao_numero || i + 4}* ➔ ${r.titulo}`).join("\n");
          }

          const cumprimento = obterCumprimentoHorario();
          const saudacao = clienteCadastrado
            ? `${cumprimento}, ${nomeDetectado}! Que bom ter você de volta! ✨ (${clienteCadastrado.total_visitas || 1} atendimentos no Cartão Fidelidade ⭐)`
            : `${cumprimento}, ${nomeDetectado}! Bem-vinda ao Studio Malu Alves Beauty! ✨`;

          if (db.config?.mensagens_zap?.boas_vindas) {
            resposta = formatarMensagemZap(db.config.mensagens_zap.boas_vindas, {
              cliente: nomeDetectado,
              cumprimento,
              saudacao,
              opcoes_personalizadas: linhasCustom.trim(),
            });
          } else {
            resposta =
              `✨ *${saudacao}*\n\n` +
              `Como posso te ajudar hoje?\n\n` +
              `*1* ➔ Agendar um Horário\n` +
              `*2* ➔ Ver Procedimentos e Valores\n` +
              `*3* ➔ Falar com a Equipe` +
              linhasCustom +
              `\n\n_Digite o número da opção desejada:_`;
          }
        }
      }
    }
  }

  // ETAPA 2: ESCOLHENDO SERVIÇO
  else if (session.step === "ESCOLHENDO_SERVICO") {
    const num = parseInt(textoLimpo, 10);
    if (!isNaN(num) && num >= 1 && num <= servicosAtivos.length) {
      const srv = servicosAtivos[num - 1];
      const diasDisponiveis = gerarDiasDisponiveis();

      session = {
        step: "ESCOLHENDO_DIA",
        servico: srv,
        diasDisponiveis,
        nomeCliente: session.nomeCliente || nomeDetectado,
      };

      const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
      resposta =
        `✅ Procedimento selecionado: *${srv.titulo}* (${formatarMoeda(srv.preco)})\n\n` +
        `📅 *Escolha o dia para seu atendimento:*\n\n${listaDias}\n\n` +
        `_Digite o número correspondente ao dia desejado (ex: 1 ou 2):_`;
    } else {
      resposta = `Opção inválida. Digite o número de 1 a ${servicosAtivos.length} referente ao procedimento:`;
    }
  }

  // ETAPA 3: ESCOLHENDO DIA
  else if (session.step === "ESCOLHENDO_DIA") {
    if (textoLimpo === "outro" || textoLimpo.includes("mudar")) {
      resposta =
        `✨ *Escolha o procedimento desejado:*\n\n` +
        servicosAtivos.map((s, idx) => `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`).join("\n") +
        `\n\n_Digite o número do procedimento desejado:_`;
      session = { step: "ESCOLHENDO_SERVICO", nomeCliente: session.nomeCliente || nomeDetectado };
    } else {
      const numDia = parseInt(textoLimpo, 10);
      const dias = session.diasDisponiveis || gerarDiasDisponiveis();

      if (!isNaN(numDia) && numDia >= 1 && numDia <= dias.length) {
        const diaEscolhido = dias[numDia - 1];
        const horarios = calcularHorariosParaData(diaEscolhido.isoData);

        if (horarios.length === 0) {
          resposta =
            `⚠️ Todos os horários para *${diaEscolhido.rotulo}* já foram preenchidos ou o expediente encerrou!\n\n` +
            `Por favor, escolha outro dia:\n\n` +
            dias.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        } else {
          session = {
            ...session,
            step: "ESCOLHENDO_HORARIO",
            diaEscolhido,
            horariosDisponiveis: horarios,
            nomeCliente: session.nomeCliente || nomeDetectado,
          };

          const listaSlots = horarios.map((h, i) => `*${letras[i].toUpperCase()}*) ${h}`).join("\n");
          resposta =
            `📅 Dia: *${diaEscolhido.rotulo}*\n\n` +
            `🕒 *Escolha o horário livre:*\n\n${listaSlots}\n\n` +
            `_Digite a letra do horário que você prefere (ex: A, B...):_`;
        }
      } else {
        resposta = `Opção de dia inválida. Digite o número de 1 a ${dias.length}:`;
      }
    }
  }

  // ETAPA 4: ESCOLHENDO HORÁRIO
  else if (session.step === "ESCOLHENDO_HORARIO") {
    const idx = letras.indexOf(textoLimpo);

    if (idx >= 0 && session.horariosDisponiveis && idx < session.horariosDisponiveis.length) {
      const horarioEscolhido = session.horariosDisponiveis[idx];
      const nomeFinal = session.nomeCliente || nomeDetectado || "Cliente";
      const srv = session.servico || servicosAtivos[0];
      const dia = session.diaEscolhido ? session.diaEscolhido.isoData : new Date().toISOString().split("T")[0];
      const dataHoraInicio = `${dia}T${horarioEscolhido}:00`;

      const db = lerBancoCentral();
      const cfg = db.config || {};
      const exigeSinal = cfg.exigir_sinal ?? true;
      const precoFinal = srv.em_promocao && srv.preco_promocional ? srv.preco_promocional : srv.preco;
      const srvComPreco = { ...srv, preco: precoFinal };

      let valorSinal = 0;
      if (exigeSinal) {
        if (cfg.tipo_sinal === "FIXO") {
          valorSinal = cfg.sinal_valor_fixo ?? 20;
        } else {
          const pct = cfg.sinal_porcentagem ?? 30;
          valorSinal = Math.round((precoFinal * pct) / 100);
        }
      }

      salvarAgendamentoNoPainel({
        cliente_nome: nomeFinal,
        cliente_telefone: telefoneFinal,
        servico: srvComPreco,
        horario_inicio: dataHoraInicio,
        origem: "WHATSAPP",
        status: exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO",
        valor_sinal: exigeSinal ? valorSinal : undefined,
      });

      const dataFormatada = dia.split("-").reverse().slice(0, 2).join("/");

      if (exigeSinal) {
        if (cfg.mensagens_zap?.solicitacao_sinal) {
          resposta = formatarMensagemZap(cfg.mensagens_zap.solicitacao_sinal, {
            cliente: nomeFinal,
            servico: srv.titulo,
            data: dataFormatada,
            horario: horarioEscolhido,
            valor_total: formatarMoeda(precoFinal),
            valor_sinal: formatarMoeda(valorSinal),
            valor_restante: formatarMoeda(precoFinal - valorSinal),
            tipo_chave: "Celular",
            chave_pix: cfg.chave_pix || "82981430673",
            titular_pix: cfg.titular_pix || "Luisa Alves dos Santos",
            tempo_limite: cfg.tempo_limite_sinal_minutos || 30,
          });
        } else {
          resposta =
            `✨ *PRÉ-RESERVA REALIZADA!* ✨\n\n` +
            `👤 *Cliente:* ${nomeFinal}\n` +
            `✨ *Procedimento:* ${srv.titulo}\n` +
            `📅 *Data:* ${dataFormatada} às *${horarioEscolhido}*\n` +
            `💵 *Valor Total:* ${formatarMoeda(precoFinal)}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔒 *CONFIRMAÇÃO DO HORÁRIO (SINAL ANTECIPADO)*\n` +
            `Para confirmar sua vaga exclusiva na agenda e evitar cancelamentos, solicitamos um adiantamento de segurança:\n\n` +
            `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
            `_(O restante de ${formatarMoeda(precoFinal - valorSinal)} será pago no dia do atendimento)_\n\n` +
            `🔑 *CHAVE PIX (Celular):*\n` +
            `\`${cfg.chave_pix || "82981430673"}\`\n` +
            `*Titular:* ${cfg.titular_pix || "Luisa Alves dos Santos"}\n\n` +
            `⏳ *Tempo limite:* Seu horário fica pré-reservado por *${cfg.tempo_limite_sinal_minutos || 30} minutos*.\n` +
            `Por favor, responda a esta mensagem enviando a *foto ou comprovante* do PIX para confirmarmos seu horário! ✨\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
        }
        session = {
          step: "AGUARDANDO_COMPROVANTE",
          servico: srvComPreco,
          valorSinal,
          nomeCliente: nomeFinal,
          horarioEscolhido,
        };
      } else {
        if (cfg.mensagens_zap?.confirmacao_agendamento) {
          resposta = formatarMensagemZap(cfg.mensagens_zap.confirmacao_agendamento, {
            cliente: nomeFinal,
            servico: srv.titulo,
            data: dataFormatada,
            horario: horarioEscolhido,
            valor_total: formatarMoeda(precoFinal),
          });
        } else {
          resposta =
            `🎉 *AGENDAMENTO CONFIRMADO!* 🎉\n\n` +
            `👤 *Cliente:* ${nomeFinal}\n` +
            `✨ *Procedimento:* ${srv.titulo}\n` +
            `📅 *Data:* ${dataFormatada} às *${horarioEscolhido}*\n` +
            `💵 *Valor:* ${formatarMoeda(precoFinal)}\n` +
            `📍 *Local:* Studio Malu Alves Beauty\n\n` +
            `✅ _Seu horário já foi reservado na agenda da designer! Enviaremos uma mensagem de lembrete 2h antes._\n\n` +
            `Aguardamos você com muito carinho! ✨`;
        }
        session = { step: "INICIAL" };
      }
    } else {
      resposta = `Letra inválida. Por favor, digite uma das letras listadas acima (ex: A, B, C...):`;
    }
  }

  // ETAPA: SINAL EXPIRADO - RECUPERAÇÃO INTERATIVA
  else if (session.step === "SINAL_EXPIRADO_MENU") {
    const nomeCli = session.nomeCliente || nomeDetectado;
    const srv = session.servico || servicosAtivos[0];
    const dataHoraOrig = session.dataHoraOriginal;
    const horaOrigStr = dataHoraOrig ? dataHoraOrig.split("T")[1]?.slice(0, 5) : "";
    const dataPart = dataHoraOrig ? dataHoraOrig.split("T")[0] : "";
    const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

    if (
      textoLimpo === "1" ||
      textoLimpo.includes("mesmo") ||
      textoLimpo.includes("verificar") ||
      textoLimpo.includes("ainda") ||
      textoLimpo.includes("livre")
    ) {
      const livre = await verificarSeHorarioLivre(dataHoraOrig);
      const cfg = db.config || {};
      const chavePix = cfg.chave_pix || "82981430673";
      const titularPix = cfg.titular_pix || "Luisa Alves dos Santos";
      const valorSinal = session.valorSinal || Math.round((srv.preco || 30) * 0.3);
      const tempoLimite = cfg.tempo_limite_sinal_minutos || 30;

      if (livre) {
        await salvarAgendamentoNoPainel({
          cliente_nome: nomeCli,
          cliente_telefone: telefoneFinal,
          servico: srv,
          horario_inicio: dataHoraOrig,
          origem: "WHATSAPP",
          status: "AGUARDANDO_SINAL",
          valor_sinal: valorSinal,
        });

        session = {
          step: "AGUARDANDO_COMPROVANTE",
          servico: srv,
          valorSinal,
          nomeCliente: nomeCli,
          horarioEscolhido: horaOrigStr,
          dataHoraOriginal: dataHoraOrig,
          lastActivity: Date.now(),
        };

        resposta =
          `🎉 *Ótima notícia, ${nomeCli}!* ✨\n\n` +
          `O horário de *${dataFormatada} às ${horaOrigStr}* para *${srv.titulo}* ainda continua livre na agenda!\n\n` +
          `Reservamos novamente sua vaga! Para garantir com exclusividade:\n\n` +
          `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
          `🔑 *CHAVE PIX (Celular):*\n` +
          `\`${chavePix}\`\n` +
          `*Titular:* ${titularPix}\n\n` +
          `⏳ *Tempo limite:* *${tempoLimite} minutos*.\n` +
          `Por favor, envie o comprovante do PIX por aqui para confirmarmos seu horário imediatamente! 🌸`;
      } else {
        const diasDisponiveis = gerarDiasDisponiveis();
        session = {
          step: "ESCOLHENDO_DIA",
          servico: srv,
          diasDisponiveis,
          nomeCliente: nomeCli,
          lastActivity: Date.now(),
        };

        const listaDias = diasDisponiveis.map((d, i) => `*${i + 1}* - ${d.rotulo}`).join("\n");
        resposta =
          `😔 *Puxa, ${nomeCli}!* O horário de *${dataFormatada} às ${horaOrigStr}* acabou de ser preenchido por outra cliente ou já encerrou.\n\n` +
          `Mas não se preocupe! Vamos escolher outra data para o seu *${srv.titulo}*:\n\n` +
          `📅 *Escolha o melhor dia:*\n\n${listaDias}\n\n` +
          `_Digite o número da data desejada (ou digite *Menu* para escolher outro procedimento):_`;
      }
    } else if (
      textoLimpo === "2" ||
      textoLimpo.includes("menu") ||
      textoLimpo.includes("procedimento") ||
      textoLimpo.includes("serviço") ||
      textoLimpo.includes("outro") ||
      textoLimpo.includes("dias")
    ) {
      resposta =
        `✨ *Escolha o procedimento desejado:*\n\n` +
        formatarListaServicosZap(servicosAtivos) +
        `\n\n_Digite o número do procedimento desejado (ex: 1, 2 ou 3):_`;
      session = {
        step: "ESCOLHENDO_SERVICO",
        nomeCliente: nomeCli,
        lastActivity: Date.now(),
      };
    } else if (
      textoLimpo === "3" ||
      textoLimpo.includes("dono") ||
      textoLimpo.includes("designer") ||
      textoLimpo.includes("humano") ||
      textoLimpo.includes("atendente")
    ) {
      resposta = `👩‍💼 Um momento, ${nomeCli}! Já notifiquei a designer Malu Alves e ela irá falar com você em instantes por aqui. 💖`;
      session = { step: "INICIAL", lastActivity: Date.now() };
    } else {
      resposta =
        `Como posso te ajudar com a sua reserva, ${nomeCli}?\n\n` +
        `*1* ➔ Verificar se o mesmo horário (${dataFormatada} às ${horaOrigStr}) ainda está livre\n` +
        `*2* ➔ Ver outros dias e procedimentos disponíveis\n` +
        `*3* ➔ Falar com a Designer\n\n` +
        `_Digite 1, 2 ou 3:_`;
    }
  }

  session.lastActivity = Date.now();
  userSessions.set(remoteJid, session);
  return resposta;
}

// =========================================================================
// CICLO DE CONEXÃO DO WHATSAPP (BAILEYS)
// =========================================================================
async function startWhatsApp(force = false) {
  if (status === "CONNECTED") {
    console.log(`[WhatsApp][${INSTANCE_ID}] Já está CONNECTED. Mantendo conexão ativa.`);
    return;
  }

  if (!force && isStarting) {
    return;
  }

  isStarting = true;

  const canBeLeader = await checkAndAcquireLeader();
  if (!canBeLeader) {
    console.log(`ℹ️ [WhatsApp][${INSTANCE_ID}] Aguardando término da instância anterior para assumir liderança...`);
    status = "CONNECTING";
    isStarting = false;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      startWhatsApp();
    }, 2000);
    return;
  }

  status = "CONNECTING";

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (sock) {
    try {
      sock.ev?.removeAllListeners();
      if (typeof sock.end === "function") {
        sock.end(undefined);
      } else if (sock.ws) {
        sock.ws.close();
      }
    } catch (_) {}
    sock = null;
    await sleep(800);
  }

  try {
    // 1. Se a pasta local já tem creds.json (ex: pareamento em andamento ou pós-515), preserva!
    // Só restaura do banco de dados se a pasta local estiver vazia (ex: novo container do Render)
    const localCredsPath = path.join(authDir, "creds.json");
    if (!fs.existsSync(localCredsPath)) {
      await restoreAuthFromDb();
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const logger = pino({ level: "silent" });
    const { version } = await fetchLatestWaWebVersion().catch(async () => {
      return await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1053925913] }));
    });

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS("Chrome"),
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      qrTimeout: 60000,
      generateHighQualityLinkPreview: false,
      getMessage: async () => ({
        conversation: "ok",
      }),
    });

    sock.ev.on("creds.update", async () => {
      await saveCreds();
      if (state.creds?.me?.id) {
        await syncAuthToDb();
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeBase64 = await QRCode.toDataURL(qr, { margin: 2, scale: 10 });
          status = "CONNECTING";
          lastQrTime = Date.now();
          console.log(">>> [WhatsApp] QR Code real gerado para pareamento!");
        } catch (err) {
          console.error("Erro ao gerar QR Code:", err);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message || String(lastDisconnect?.error || "");

        lastDisconnectInfo = {
          statusCode: statusCode || null,
          error: errorMsg,
          time: new Date().toISOString(),
          disconnectCount: (lastDisconnectInfo.disconnectCount || 0) + 1,
        };

        if (sock) {
          try {
            sock.ev?.removeAllListeners();
            if (typeof sock.end === "function") {
              sock.end(undefined);
            } else if (sock.ws) {
              sock.ws.close();
            }
          } catch (_) {}
          sock = null;
        }

        isStarting = false;

        // CASO 1: 515 (restartRequired) -> QR Code escaneado com sucesso pelo celular!
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`>>> [WhatsApp][${INSTANCE_ID}] QR Code escaneado com sucesso! Salvando credenciais e reiniciando socket autenticado (515)...`);
          await saveCreds().catch(() => {});
          if (state.creds?.me?.id) {
            await syncAuthToDb().catch(() => {});
          }
          status = "CONNECTING";
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            startWhatsApp();
          }, 1000);
          return;
        }

        // CASO 2: 401 (loggedOut) -> Sessão desconectada
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          const jaEstavaConectado = Boolean(state.creds?.me?.id);
          if (jaEstavaConectado) {
            console.warn(">>> [WhatsApp] Sessão encerrada no celular (401 LoggedOut). Limpando dados para novo QR Code...");
            clearLocalAuth();
            await clearDbAuth();
            qrCodeBase64 = null;
            connectedPhone = null;
          }
          status = "CONNECTING";
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            startWhatsApp(true);
          }, 2000);
          return;
        }

        // CASO 3: 440 (connectionReplaced) -> Conflito temporário
        if (statusCode === 440) {
          console.warn(`>>> [WhatsApp][${INSTANCE_ID}] Conflito 440 temporário. Aguardando 5s...`);
          status = "DISCONNECTED";
          if (reconnectTimeout) clearTimeout(reconnectTimeout);
          reconnectTimeout = setTimeout(() => {
            reconnectTimeout = null;
            startWhatsApp();
          }, 5000);
          return;
        }

        // CASO 4: 428 / 408 / Timeout de QR / Queda de rede
        // MANTÉM o qrCodeBase64 em memória para NÃO PISCAR a tela do usuário!
        console.log(`>>> [WhatsApp][${INSTANCE_ID}] Rotação de conexão (${statusCode}: ${errorMsg}). Renovando...`);
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          reconnectTimeout = null;
          startWhatsApp();
        }, 1500);
      } else if (connection === "open") {
        console.log(`>>> [WhatsApp][${INSTANCE_ID}] Conectado com sucesso!`);
        status = "CONNECTED";
        qrCodeBase64 = null;
        lastQrTime = null;
        connectedPhone = sock?.user?.id?.split(":")[0] || "Conectado";
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        await syncAuthToDb();
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      if (m.type !== "notify" || !m.messages || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (
          msg.key?.fromMe ||
          !msg.key?.remoteJid ||
          msg.key.remoteJid.includes("@g.us") ||
          msg.key.remoteJid === "status@broadcast"
        ) {
          continue;
        }

        const msgId = msg.key.id;
        if (msgId && processedMessageIds.has(msgId)) {
          continue;
        }
        if (msgId) {
          processedMessageIds.add(msgId);
        }

        const remoteJid = msg.key.remoteJid;

        const messageContent =
          msg.message?.ephemeralMessage?.message ||
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message ||
          msg.message?.documentWithCaptionMessage?.message ||
          msg.message;

        const texto = (
          messageContent?.conversation ||
          messageContent?.extendedTextMessage?.text ||
          messageContent?.imageMessage?.caption ||
          messageContent?.documentMessage?.caption ||
          ""
        ).trim();

        const ehMidia = Boolean(messageContent?.imageMessage || messageContent?.documentMessage);
        const pushName = msg.pushName || "";
        const realPhone = msg.key?.participantPn || msg.key?.senderPn || "";

        const telLimpo = (realPhone || remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "")).replace(/\D/g, "");
        if (telLimpo) {
          phoneToJidMap.set(telLimpo, remoteJid);
          if (telLimpo.startsWith("55")) {
            phoneToJidMap.set(telLimpo.slice(2), remoteJid);
          } else {
            phoneToJidMap.set(`55${telLimpo}`, remoteJid);
          }
        }

        if (!texto && !ehMidia) continue;

        console.log(`>>> [WhatsApp] Mensagem recebida de ${remoteJid} (${pushName || "Cliente"}): "${texto || "[Mídia/Comprovante]"}"`);

        try {
          const resposta = await processarMensagemRobo(remoteJid, texto, pushName, realPhone, ehMidia);
          if (resposta && sock) {
            console.log(`>>> [WhatsApp] Enviando resposta para ${remoteJid}...`);
            await enviarMensagemHumana(remoteJid, resposta);
          }
        } catch (err) {
          console.error("Erro ao processar mensagem do robô:", err);
        }
      }
    });
  } catch (error) {
    console.error("Erro ao iniciar Baileys:", error);
    status = "DISCONNECTED";
    isStarting = false;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      startWhatsApp(true);
    }, 5000);
  } finally {
    isStarting = false;
  }
}

async function disconnectWhatsApp() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (_) {}
      sock.ev?.removeAllListeners();
      if (typeof sock.end === "function") {
        sock.end(undefined);
      } else if (sock.ws) {
        sock.ws.close();
      }
      sock = null;
    }
    status = "DISCONNECTED";
    qrCodeBase64 = null;
    lastQrTime = null;
    connectedPhone = null;
    userSessions.clear();
    phoneToJidMap.clear();
    processedMessageIds.clear();
    clearLocalAuth();
    await clearDbAuth();
    console.log(">>> [WhatsApp] Desconectado e dados limpos com sucesso.");
  } catch (e) {
    console.error("Erro ao desconectar:", e);
  }
}

// =========================================================================
// ROTAS DE NOTIFICAÇÃO DO STUDIO
// =========================================================================
async function notificarCancelamentoSinalExpirado(dados) {
  const { telefone, nome, dataHora, servicoTitulo, servicoId, valor, valorSinal } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const servicos = obterServicosAtivos();
  const srvObj = servicos.find((s) => s.id === servicoId || s.titulo === servicoTitulo) || {
    id: servicoId || "serv-1",
    titulo: servicoTitulo || "Design de Sobrancelhas",
    preco: Number(valor) || 30,
    duracao_minutos: 30,
  };

  const valorFinal = Number(valor) || srvObj.preco || 30;
  const sinalFinal = Number(valorSinal) || Math.round(valorFinal * 0.3);

  const mensagem = db.config?.mensagens_zap?.cancelamento_sinal_expirado
    ? formatarMensagemZap(db.config.mensagens_zap.cancelamento_sinal_expirado, {
        cliente: nome || "Cliente",
        servico: srvObj.titulo,
        data: dataFormatada,
        horario: horaStr,
        valor_sinal: formatarMoeda(sinalFinal),
      })
    : `⏳ *Aviso sobre sua pré-reserva no Studio Malu Alves Beauty* 🌸\n\n` +
      `Olá, *${nome || "Cliente"}*! O prazo para envio do sinal PIX referente ao procedimento *${srvObj.titulo}* (*${dataFormatada}* às *${horaStr}*) expirou e a vaga precisou ser liberada na agenda.\n\n` +
      `Mas você ainda pode garantir seu horário! O que prefere fazer?\n\n` +
      `*1* ➔ Verificar se o mesmo horário ainda está livre para reservar agora\n` +
      `*2* ➔ Ver outros dias e procedimentos disponíveis\n` +
      `*3* ➔ Falar com a Designer\n\n` +
      `_Digite o número da opção desejada:_`;

  userSessions.set(targetJid, {
    step: "SINAL_EXPIRADO_MENU",
    nomeCliente: nome || "Cliente",
    servico: srvObj,
    dataHoraOriginal: dataHora,
    valorSinal: sinalFinal,
    valorTotal: valorFinal,
    lastActivity: Date.now(),
  });

  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarCancelamentoAdmin(telefone, nomeCliente, dataHora) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.cancelamento_studio
    ? formatarMensagemZap(db.config.mensagens_zap.cancelamento_studio, {
        cliente: nomeCliente,
        data: dataFormatada,
        horario: horaStr,
      })
    : `⚠️ *Aviso do Studio Malu Alves Beauty* ⚠️\n\n` +
      `Olá, *${nomeCliente}*! Infelizmente a designer precisou desmarcar o seu horário de *${dataFormatada}* às *${horaStr}* devido a um imprevisto.\n\n` +
      `Pedimos sinceras desculpas pelo transtorno! Gostaria de remarcar para outro dia ou horário?\n\n` +
      `*1* ➔ Sim, ver dias e horários disponíveis\n` +
      `*2* ➔ Falar com a Designer\n\n` +
      `_Digite o número da opção desejada para remarcar:_`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarConclusaoAdmin(telefone, nomeCliente, totalVisitas) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const visitas = totalVisitas || 1;
  const elegivelDesconto = visitas > 0 && visitas % 5 === 0;

  const db = lerBancoCentral();
  let mensagem = "";

  if (db.config?.mensagens_zap?.agradecimento_fidelidade) {
    mensagem = formatarMensagemZap(db.config.mensagens_zap.agradecimento_fidelidade, {
      cliente: nomeCliente,
      visitas,
    });
  } else {
    let mensagemFidelidade = `⭐ Você possui *${visitas} ${visitas === 1 ? "atendimento realizado" : "atendimentos realizados"}* no seu Cartão Fidelidade.`;
    if (elegivelDesconto) {
      mensagemFidelidade =
        `🎉 *PARABÉNS!* Você completou seu 5º atendimento no Cartão Fidelidade!\n` +
        `🎯 No seu próximo procedimento você tem direito a um *Super Desconto Especial!*`;
    }

    mensagem =
      `✨ *Obrigada pela preferência, ${nomeCliente}!* ✨\n\n` +
      `Foi um imenso prazer atendê-la no Studio Malu Alves Beauty! Esperamos que tenha amado o resultado das suas sobrancelhas.\n\n` +
      `${mensagemFidelidade}\n\n` +
      `Quando desejar realçar seu olhar novamente, basta me mandar um *Oi* por aqui! 💖\n` +
      `Tenha um dia maravilhoso!`;
  }

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarFaltaAdmin(telefone, nomeCliente, servicoTitulo, dataHora) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const db = lerBancoCentral();

  const mensagem = db.config?.mensagens_zap?.falta_comparecimento
    ? formatarMensagemZap(db.config.mensagens_zap.falta_comparecimento, {
        cliente: nomeCliente,
        servico: servicoTitulo,
        horario: horaStr,
      })
    : `👋 *Olá, ${nomeCliente}! Tudo bem?*\n\n` +
      `Notamos que você não conseguiu comparecer ao seu horário de hoje às *${horaStr}* para o procedimento *${servicoTitulo || "Design de Sobrancelhas"}*.\n\n` +
      `Imprevistos acontecem! Se quiser escolher outro dia ou horário para fazer seu procedimento, é bem fácil:\n\n` +
      `*1* ➔ Remarcar meu horário agora\n` +
      `*2* ➔ Falar com a Equipe\n\n` +
      `_Digite o número desejado:_`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarConfirmacaoWeb(telefone, nomeCliente, servicoTitulo, dataHora, valor) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.confirmacao_agendamento
    ? formatarMensagemZap(db.config.mensagens_zap.confirmacao_agendamento, {
        cliente: nomeCliente,
        servico: servicoTitulo || "Design de Sobrancelhas",
        data: dataFormatada,
        horario: horaStr,
        valor_total: formatarMoeda(valor || 30),
      })
    : `🎉 *AGENDAMENTO CONFIRMADO VIA SITE!* ✨\n\n` +
      `Olá, *${nomeCliente}*! Seu horário foi reservado com sucesso pelo site.\n\n` +
      `• *Procedimento:* ${servicoTitulo || "Design de Sobrancelhas"}\n` +
      `• *Data:* ${dataFormatada} às *${horaStr}*\n` +
      `• *Valor:* ${formatarMoeda(valor || 30)}\n` +
      `📍 *Local:* Studio Malu Alves Beauty\n\n` +
      `✅ _Seu horário já está garantido na agenda da designer! Te mandaremos um lembrete 2h antes._\n\n` +
      `Esperamos por você! ✨`;

  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

async function notificarSolicitacaoSinalWeb(dados) {
  const { telefone, nome, servicoTitulo, dataHora, valor, valorSinal, chavePix, titularPix, tempoLimiteMinutos } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const valorTotalNum = Number(valor) || 30;
  const valorSinalNum = Number(valorSinal) || Math.round(valorTotalNum * 0.3);
  const restanteNum = Math.max(valorTotalNum - valorSinalNum, 0);

  const db = lerBancoCentral();
  const mensagem = db.config?.mensagens_zap?.solicitacao_sinal
    ? formatarMensagemZap(db.config.mensagens_zap.solicitacao_sinal, {
        cliente: nome || "Cliente",
        servico: servicoTitulo || "Design de Sobrancelhas",
        data: dataFormatada,
        horario: horaStr,
        valor_total: formatarMoeda(valorTotalNum),
        valor_sinal: formatarMoeda(valorSinalNum),
        valor_restante: formatarMoeda(restanteNum),
        tipo_chave: "Celular",
        chave_pix: chavePix || "82981430673",
        titular_pix: titularPix || "Luisa Alves dos Santos",
        tempo_limite: tempoLimiteMinutos || 30,
      })
    : `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
      `Olá, *${nome || "Cliente"}*! Recebemos sua solicitação de agendamento pelo site do Studio Malu Alves Beauty.\n\n` +
      `• *Procedimento:* ${servicoTitulo || "Design de Sobrancelhas"}\n` +
      `• *Data:* ${dataFormatada} às *${horaStr}*\n` +
      `• *Valor Total:* ${formatarMoeda(valorTotalNum)}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 *CONFIRMAÇÃO DO AGENDAMENTO (SINAL ANTECIPADO)*\n` +
      `Para garantir com exclusividade a sua vaga na agenda da designer e evitar cancelamentos, solicitamos um adiantamento de segurança:\n\n` +
      `💰 *Valor do Sinal:* *${formatarMoeda(valorSinalNum)}*\n` +
      `_(O restante de ${formatarMoeda(restanteNum)} será pago no dia do seu atendimento)_\n\n` +
      `🔑 *CHAVE PIX (Celular):*\n` +
      `\`${chavePix || "82981430673"}\`\n` +
      `*Titular:* ${titularPix || "Luisa Alves dos Santos"}\n\n` +
      `⏳ *Tempo limite:* Seu horário fica reservado por *${tempoLimiteMinutos || 30} minutos*.\n` +
      `Por favor, responda a esta mensagem enviando a *foto ou comprovante* do PIX para que o robô confirme seu horário automaticamente! ✨\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  userSessions.set(targetJid, {
    step: "AGUARDANDO_COMPROVANTE",
    servico: { titulo: servicoTitulo, preco: valorTotalNum },
    valorSinal: valorSinalNum,
    clienteNome: nome,
    horarioInicio: dataHora,
  });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

// =========================================================================
// SERVIDOR HTTP
// =========================================================================
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status, uptime: Math.round(process.uptime()) }));
    return;
  }

  if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status,
        qrCodeBase64,
        connectedPhone,
        instanceId: INSTANCE_ID,
        isLeader,
        lastDisconnectInfo,
        qrAgeSeconds: lastQrTime ? Math.round((Date.now() - lastQrTime) / 1000) : null,
        uptime: Math.round(process.uptime()),
      })
    );
    return;
  }

  if (req.url === "/start" && req.method === "POST") {
    if (status === "CONNECTED") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "WhatsApp já está conectado com sucesso!", status, connectedPhone }));
      return;
    }
    if (isStarting) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, message: "WhatsApp já está iniciando...", status }));
      return;
    }
    startWhatsApp(true);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Iniciando Baileys..." }));
    return;
  }

  if (req.url === "/disconnect" && req.method === "POST") {
    await disconnectWhatsApp();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Desconectado" }));
    return;
  }

  if (req.url === "/cancel-notify" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const dados = JSON.parse(body);
        const { tipo, telefone, nome, servicoTitulo, dataHora, motivo } = dados;
        const ehSinalExpirado = tipo === "SINAL_EXPIRADO" || (motivo && String(motivo).toLowerCase().includes("sinal"));

        if (ehSinalExpirado) {
          await notificarCancelamentoSinalExpirado(dados);
        } else {
          await notificarCancelamentoAdmin(telefone, nome, dataHora);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Cancelamento processado com sucesso" }));
      } catch (err) {
        console.error("Erro na rota /cancel-notify:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.url === "/notify" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const dados = JSON.parse(body);
        const { tipo, telefone, nome, servicoTitulo, dataHora, valor, totalVisitas, motivo } = dados;

        if (tipo === "SOLICITAR_SINAL_WEB") {
          await notificarSolicitacaoSinalWeb(dados);
        } else if (tipo === "CONFIRMACAO_WEB") {
          await notificarConfirmacaoWeb(telefone, nome, servicoTitulo, dataHora, valor);
        } else if (tipo === "CONCLUIDO") {
          await notificarConclusaoAdmin(telefone, nome, totalVisitas);
        } else if (tipo === "FALTOU") {
          await notificarFaltaAdmin(telefone, nome, servicoTitulo, dataHora);
        } else if (tipo === "SINAL_EXPIRADO" || (tipo === "CANCELADO" && String(motivo || "").toLowerCase().includes("sinal"))) {
          await notificarCancelamentoSinalExpirado(dados);
        } else if (tipo === "CANCELADO") {
          await notificarCancelamentoAdmin(telefone, nome, dataHora);
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Notificação enviada." }));
      } catch (err) {
        console.error("Erro ao enviar notificação:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Rota não encontrada" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`>>> Servidor WhatsApp nativo rodando na porta ${PORT}`);
  startWhatsApp();
});

// Desligamento limpo para liberar liderança imediatamente em novos deploys do Render
async function gracefulShutdown(signal) {
  console.log(`>>> [GracefulShutdown] Sinal ${signal} recebido. Liberando liderança da instância ${INSTANCE_ID}...`);
  await releaseLeader();
  if (sock) {
    try {
      sock.ev?.removeAllListeners();
      if (typeof sock.end === "function") {
        sock.end(undefined);
      } else if (sock.ws) {
        sock.ws.close();
      }
    } catch (_) {}
    sock = null;
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
