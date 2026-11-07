const http = require("http");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  BufferJSON,
  initAuthCreds,
  proto,
} = require("@whiskeysockets/baileys");
const { Pool } = require("pg");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const PORT = 3001;
const authDir = path.join(__dirname, "auth_info_baileys");
const dbPath = path.join(__dirname, "data_storage.json");

// Conexão com o banco PostgreSQL persistente para evitar perda de pareamento no Render
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.lsgewrzvdviqthzegowv:aEB4_2Fgg!k5EZC@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

let pgPool = null;
try {
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pgPool.on("error", (err) => {
    console.error(">>> [PostgreSQL] Erro inesperado no cliente de conexão:", err.message);
  });
  console.log(">>> [PostgreSQL] Pool de conexão inicializado para sessões WhatsApp.");
} catch (e) {
  console.error("Erro ao inicializar Pool PostgreSQL:", e.message);
}

// Adaptador de autenticação Baileys no PostgreSQL
async function usePostgresAuthState() {
  if (!pgPool) {
    console.log("⚠️ [Auth] PostgreSQL indisponível. Usando auth_info_baileys local.");
    return useMultiFileAuthState(authDir);
  }

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

  const readData = async (id) => {
    try {
      const res = await pgPool.query("SELECT value FROM zap_session WHERE id = $1", [id]);
      if (res.rows.length === 0) return null;
      return JSON.parse(res.rows[0].value, BufferJSON.reviver);
    } catch (e) {
      return null;
    }
  };

  const writeData = async (id, data) => {
    try {
      const value = JSON.stringify(data, BufferJSON.replacer);
      await pgPool.query(
        "INSERT INTO zap_session (id, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET value = $2, updated_at = NOW()",
        [id, value]
      );
    } catch (e) {
      console.error(`❌ [PostgreSQL] Erro ao salvar ${id}:`, e.message);
    }
  };

  const removeData = async (id) => {
    try {
      await pgPool.query("DELETE FROM zap_session WHERE id = $1", [id]);
    } catch (e) {
      console.error(`❌ [PostgreSQL] Erro ao remover ${id}:`, e.message);
    }
  };

  const credsData = (await readData("creds")) || initAuthCreds();

  const state = {
    creds: credsData,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await readData(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          })
        );
        return data;
      },
      set: async (data) => {
        const tasks = [];
        for (const category in data) {
          for (const id in data[category]) {
            const value = data[category][id];
            tasks.push(
              value ? writeData(`${category}-${id}`, value) : removeData(`${category}-${id}`)
            );
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  const saveCreds = () => writeData("creds", state.creds);
  console.log("✅ [PostgreSQL] Sessão do WhatsApp vinculada com persistência no banco de dados!");
  return { state, saveCreds };
}

async function clearPostgresSession() {
  if (!pgPool) return;
  try {
    await pgPool.query("DELETE FROM zap_session");
    console.log("🗑️ [PostgreSQL] Sessão do WhatsApp apagada do banco.");
  } catch (e) {
    console.error("❌ Erro ao apagar sessão no PostgreSQL:", e.message);
  }
}

let sock = null;
let qrCodeBase64 = null;
let status = "DISCONNECTED"; // "DISCONNECTED" | "CONNECTING" | "CONNECTED"
let connectedPhone = null;

// Controle de sessões dos clientes, mapa de JIDs e deduplicação de mensagens
const userSessions = new Map();
const phoneToJidMap = new Map();
const processedMessageIds = new Set();

// Limpar IDs antigos a cada 10 minutos
setInterval(() => {
  if (processedMessageIds.size > 2000) {
    processedMessageIds.clear();
  }
}, 10 * 60 * 1000);

// Monitor de inatividade de conversas (a cada 2 minutos)
setInterval(async () => {
  if (!sock) return;
  try {
    const db = lerBancoCentral();
    const timeoutMin = db.config?.tempo_inatividade_bot_minutos || 15;
    const timeoutMs = timeoutMin * 60 * 1000;
    const agoraMs = Date.now();
    const stepsMonitorados = ["ESCOLHENDO_SERVICO", "ESCOLHENDO_DIA", "ESCOLHENDO_HORARIO", "SINAL_EXPIRADO_MENU"];

    for (const [jid, session] of userSessions.entries()) {
      if (session && stepsMonitorados.includes(session.step) && session.lastActivity) {
        if (agoraMs - session.lastActivity >= timeoutMs && !session.avisoInatividadeEnviado) {
          session.avisoInatividadeEnviado = true;
          const nomeCli = session.nomeCliente || "Cliente";

          const msgInatividade = db.config?.mensagens_zap?.inatividade_encerramento
            ? formatarMensagemZap(db.config.mensagens_zap.inatividade_encerramento, { cliente: nomeCli })
            : `🌸 *Atendimento pausado por inatividade* ⏳\n\n` +
              `Olá, *${nomeCli}*! Notamos que você não respondeu há algum tempo, então encerramos este atendimento para liberar o sistema.\n\n` +
              `Quando desejar agendar ou tirar dúvidas no *Studio Malu Alves Beauty*, basta nos mandar um *Oi* por aqui! Teremos o maior prazer em atender você! ✨`;

          console.log(`>>> [Inatividade Auto-Close] Encerrando sessão de ${jid} (${nomeCli}) após ${timeoutMin} minutos de inatividade.`);
          userSessions.set(jid, { step: "INICIAL", lastActivity: agoraMs });
          await enviarMensagemHumana(jid, msgInatividade);
        }
      }
    }
  } catch (err) {
    console.error("Erro no monitor de inatividade:", err);
  }
}, 2 * 60 * 1000);

// Helper para sleep/delay
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Helper para formatar moeda
function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

// Ler dados do storage central
function lerBancoCentral() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
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
  } catch (e) {
    console.error("Erro ao ler data_storage.json:", e);
  }
  return { servicos: [], agendamentos: [], clientes: [], config: {} };
}

// Serviços Padrão do Studio
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
  const cumprimento = obterCumprimentoHorario();
  const varsCompletas = {
    cumprimento,
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

// Buscar cliente cadastrado pelo telefone
function buscarClientePorTelefone(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.clientes?.find((c) => {
    const cTel = c.telefone.replace(/\D/g, "");
    return cTel === tel || cTel === tel.slice(2) || `55${cTel}` === tel;
  });
}

// Buscar agendamento ativo (CONFIRMADO ou AGUARDANDO_SINAL) para o cliente
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

// Buscar agendamento que esteja aguardando comprovante de sinal
function buscarAgendamentoAguardandoSinal(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.agendamentos?.find((ag) => {
    if (ag.status !== "AGUARDANDO_SINAL") return false;
    const agTel = (ag.cliente_telefone || "").replace(/\D/g, "");
    return agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
  });
}

// Gerar lista de 4 dias disponíveis (Hoje, Amanhã, +2 dias)
function gerarDiasDisponiveis() {
  const dias = [];
  const hoje = new Date();

  for (let i = 0; i < 4; i++) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() + i);

    const diaSemanaNum = d.getDay();
    if (diaSemanaNum === 0 && i > 0) {
      continue; // Pular domingo se fechado
    }

    const isoData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nomeFormatado = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
    const rotulo = i === 0 ? `Hoje (${nomeFormatado})` : i === 1 ? `Amanhã (${nomeFormatado})` : nomeFormatado;

    dias.push({ isoData, rotulo, diaSemanaNum });
  }

  return dias;
}

// Cálculo de horários livres para um dia específico
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
    const hora = a.horario_inicio.split("T")[1]?.slice(0, 5) || "00:00";
    return hora;
  });

  const horariosDisponiveis = [];
  const inicioExpediente = 9 * 60; // 09:00
  const fimExpediente = 20 * 60; // 20:00

  for (let min = inicioExpediente; min + 30 <= fimExpediente; min += 30) {
    if (min >= 12 * 60 && min < 13 * 60) continue; // Almoço

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

// Gravação de agendamento no Next.js (Vercel ou Local)
async function salvarAgendamentoNoPainel(dados) {
  try {
    const appUrl = (process.env.APP_URL || "https://malu-alvesbeauty.vercel.app").replace(/\/$/, "");
    const res = await fetch(`${appUrl}/api/agendamentos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    console.log(`>>> [Sync Painel Admin] Status da gravação: ${res.status}`);
  } catch (err) {
    console.error("Erro ao sincronizar agendamento:", err.message);
  }
}

// Cancelar agendamento ativo via API
async function cancelarAgendamentoNoPainel(id) {
  try {
    const appUrl = (process.env.APP_URL || "https://malu-alvesbeauty.vercel.app").replace(/\/$/, "");
    const res = await fetch(`${appUrl}/api/agendamentos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CANCELADO" }),
    });
    console.log(`>>> [Cancelamento via Zap] Status: ${res.status}`);
  } catch (err) {
    console.error("Erro ao cancelar agendamento:", err.message);
  }
}

// Aprovar comprovante de sinal e confirmar agendamento no painel
async function aprovarComprovanteCliente(telefoneLimpo) {
  try {
    const appUrl = (process.env.APP_URL || "https://malu-alvesbeauty.vercel.app").replace(/\/$/, "");
    const res = await fetch(`${appUrl}/api/agendamentos`);
    if (res.ok) {
      const ags = await res.json();
      const tel = String(telefoneLimpo || "").replace(/\D/g, "");
      const pendente = (ags || []).find((a) => {
        if (a.status !== "AGUARDANDO_SINAL") return false;
        const aTel = String(a.cliente_telefone || "").replace(/\D/g, "");
        return aTel === tel || aTel === tel.slice(2) || `55${aTel}` === tel;
      });
      if (pendente) {
        await fetch(`${appUrl}/api/agendamentos`, {
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

// Verificar se um horário específico (ex: 2026-11-07T10:00:00) continua disponível na agenda
async function verificarSeHorarioLivre(dataHoraIso) {
  if (!dataHoraIso) return false;
  try {
    const appUrl = (process.env.APP_URL || "https://malu-alvesbeauty.vercel.app").replace(/\/$/, "");
    let ags = [];
    try {
      const res = await fetch(`${appUrl}/api/agendamentos`);
      if (res.ok) {
        ags = await res.json();
      }
    } catch (e) {
      // Fallback local
    }
    if (!ags || ags.length === 0) {
      const db = lerBancoCentral();
      ags = db.agendamentos || [];
    }

    const agora = new Date();
    const dataHoraAlvo = new Date(dataHoraIso);
    if (dataHoraAlvo.getTime() <= agora.getTime()) {
      return false; // Horário já no passado
    }

    // O horário está ocupado se houver algum agendamento ativo (não cancelado)
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

// Envio com COMPORTAMENTO HUMANO ANTI-BAN
async function enviarMensagemHumana(remoteJid, texto) {
  if (!sock) return;
  try {
    await sock.sendPresenceUpdate("composing", remoteJid);
    const delayDigitacao = Math.min(Math.max(texto.length * 15, 1300), 2600);
    await sleep(delayDigitacao);
    await sock.sendPresenceUpdate("paused", remoteJid);
    await sock.sendMessage(remoteJid, { text: texto });
    console.log(`>>> [WhatsApp] Mensagem enviada para ${remoteJid}`);
  } catch (err) {
    console.error("Erro ao enviar mensagem humana:", err);
  }
}

async function resolverRemoteJid(telefone) {
  let telLimpo = String(telefone || "").replace(/\D/g, "");
  // Remover zeros à esquerda (ex: 082994247688 -> 82994247688)
  if (telLimpo.startsWith("0")) {
    telLimpo = telLimpo.replace(/^0+/, "");
  }
  if (!telLimpo) return null;

  // 1. Verificar se já temos no mapa de conversas ativas
  let targetJid =
    phoneToJidMap.get(telLimpo) ||
    phoneToJidMap.get(`55${telLimpo}`) ||
    phoneToJidMap.get(telLimpo.startsWith("55") ? telLimpo.slice(2) : telLimpo);

  if (targetJid) {
    console.log(`>>> [JID Resolver] Encontrado no cache para ${telLimpo}: ${targetJid}`);
    return targetJid;
  }

  // 2. Se temos Baileys sock conectado, consultar o WhatsApp diretamente
  if (sock) {
    try {
      const numCom55 = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
      const res = await sock.onWhatsApp(numCom55);
      if (res && res.length > 0 && res[0].exists) {
        targetJid = res[0].jid;
        console.log(`>>> [JID Resolver] onWhatsApp validou com sucesso: ${numCom55} -> ${targetJid}`);
        phoneToJidMap.set(telLimpo, targetJid);
        phoneToJidMap.set(numCom55, targetJid);
        return targetJid;
      }

      // Se não encontrou, testar variação de 8 dígitos (sem o 9) para celulares brasileiros
      if (numCom55.length === 13 && numCom55.startsWith("55")) {
        const ddd = numCom55.slice(2, 4);
        const semNono = `55${ddd}${numCom55.slice(5)}`;
        const resSemNono = await sock.onWhatsApp(semNono);
        if (resSemNono && resSemNono.length > 0 && resSemNono[0].exists) {
          targetJid = resSemNono[0].jid;
          console.log(`>>> [JID Resolver] onWhatsApp validou sem 9º dígito: ${semNono} -> ${targetJid}`);
          phoneToJidMap.set(telLimpo, targetJid);
          phoneToJidMap.set(numCom55, targetJid);
          return targetJid;
        }
      }
    } catch (err) {
      console.error("Erro ao validar onWhatsApp:", err.message);
    }
  }

  // 3. Fallback padrão
  const numFinal = telLimpo.startsWith("55") ? telLimpo : `55${telLimpo}`;
  targetJid = `${numFinal}@s.whatsapp.net`;
  console.log(`>>> [JID Resolver] Usando JID padrão: ${targetJid}`);
  return targetJid;
}

// =========================================================================
// MOTOR CONVERSACIONAL INTELIGENTE COM CAPTURA AUTOMÁTICA DE NOME
// =========================================================================
async function processarMensagemRobo(remoteJid, textoUsuario, pushNameRaw, realPhone, ehMidia = false) {
  const textoLimpo = (textoUsuario || "").trim().toLowerCase();
  let session = userSessions.get(remoteJid) || { step: "INICIAL" };
  let resposta = "";

  const agoraMs = Date.now();
  const db = lerBancoCentral();
  const timeoutMin = db.config?.tempo_inatividade_bot_minutos || 15;
  const timeoutMs = timeoutMin * 60 * 1000;

  // Auto-reset por inatividade caso a conversa anterior tenha sido abandonada
  if (session.step && session.step !== "INICIAL" && session.lastActivity) {
    const tempoInativo = agoraMs - session.lastActivity;
    if (tempoInativo > timeoutMs && session.step !== "AGUARDANDO_COMPROVANTE") {
      console.log(`>>> [Inatividade] Sessão de ${remoteJid} expirou (${Math.round(tempoInativo / 60000)}m > ${timeoutMin}m). Resetando para INICIAL.`);
      session = { step: "INICIAL", lastActivity: agoraMs };
    }
  }
  session.lastActivity = agoraMs;

  const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const telefoneFinal = realPhone || remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "");

  // 1. Identificar cliente e agendamentos existentes
  const clienteCadastrado = buscarClientePorTelefone(telefoneFinal);
  const agendamentoAtivo = buscarAgendamentoAtivo(telefoneFinal);
  const servicosAtivos = obterServicosAtivos();

  // 2. Captura direta do nome do perfil do WhatsApp (sempre atualizado pelo Zap do cliente)
  const pushNameLimpo = (pushNameRaw || "").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim();
  const nomeDetectado = pushNameLimpo || "Cliente";

  // 3. Verificação de envio de comprovante PIX
  const ehComprovante =
    ehMidia ||
    textoLimpo.includes("comprovante") ||
    textoLimpo.includes("pago") ||
    textoLimpo.includes("pagamento") ||
    textoLimpo.includes("pix") ||
    textoLimpo.includes("enviei") ||
    textoLimpo.includes("transferi") ||
    textoLimpo.includes("mandei");

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

  // =========================================================================
  // ETAPA 1: MENU PRINCIPAL INTELIGENTE
  // =========================================================================
  if (session.step === "INICIAL") {
    // SE O CLIENTE JÁ POSSUI UM AGENDAMENTO ATIVO PENDENTE:
    if (agendamentoAtivo) {
      const horaStr = agendamentoAtivo.horario_inicio.split("T")[1]?.slice(0, 5) || "";
      const dataStr = agendamentoAtivo.horario_inicio.split("T")[0].split("-").reverse().slice(0, 2).join("/");

      if (textoLimpo === "1" || textoLimpo.includes("desmarcar") || textoLimpo.includes("cancelar") || textoLimpo.includes("remarcar")) {
        // Cancelar agendamento atual e oferecer remarcação
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
    }
    // SE É CLIENTE RECORRENTE OU NOVO SEM AGENDAMENTO ATIVO:
    else {
      if (
        textoLimpo === "1" ||
        textoLimpo.includes("agendar") ||
        textoLimpo.includes("marcar") ||
        textoLimpo.includes("sobrancelha") ||
        textoLimpo.includes("horario") ||
        textoLimpo.includes("horário")
      ) {
        // Se já tem histórico e último serviço conhecido
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
        // Checar se o cliente digitou uma das novas opções customizadas cadastradas pelo ADM
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

  // =========================================================================
  // ETAPA 2: ESCOLHENDO SERVIÇO
  // =========================================================================
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

  // =========================================================================
  // ETAPA 3: ESCOLHENDO DIA
  // =========================================================================
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

  // =========================================================================
  // ETAPA 4: ESCOLHENDO HORÁRIO ➔ CONFIRMAÇÃO DIRETA (COM SINAL SE ATIVADO)
  // =========================================================================
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

      // Sincronizar em tempo real com o Painel Admin do Dono!
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

  // =========================================================================
  // ETAPA: SINAL EXPIRADO - RECUPERAÇÃO INTERATIVA
  // =========================================================================
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
      // Verificar em tempo real se o mesmo horário continua vago
      const livre = await verificarSeHorarioLivre(dataHoraOrig);
      const cfg = db.config || {};
      const chavePix = cfg.chave_pix || "82981430673";
      const titularPix = cfg.titular_pix || "Luisa Alves dos Santos";
      const valorSinal = session.valorSinal || Math.round((srv.preco || 30) * 0.3);
      const tempoLimite = cfg.tempo_limite_sinal_minutos || 30;

      if (livre) {
        // Horário continua disponível! Reativa a reserva no sistema
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

async function startWhatsApp() {
  if (status === "CONNECTED" || status === "CONNECTING") {
    return;
  }

  status = "CONNECTING";
  qrCodeBase64 = null;

  try {
    const { state, saveCreds } = await usePostgresAuthState();
    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["Studio Malu Alves Beauty", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeBase64 = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          status = "CONNECTING";
          console.log(">>> [WhatsApp] QR Code real gerado para pareamento.");
        } catch (err) {
          console.error("Erro no QR:", err);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`Conexão fechada. Status: ${statusCode}, Reconectar: ${shouldReconnect}`);
        status = "DISCONNECTED";
        qrCodeBase64 = null;
        connectedPhone = null;

        // Se for 401 (loggedOut) ou desconexão manual pelo aparelho, limpa sessão no banco para permitir novo QR Code
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log(">>> [WhatsApp] Sessão desconectada no celular. Limpando credenciais antigas do PostgreSQL...");
          await clearPostgresSession();
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
        }

        if (shouldReconnect) {
          console.log(">>> [WhatsApp] Reconectando automaticamente em 3 segundos com credenciais salvas...");
          setTimeout(startWhatsApp, 3000);
        }
      } else if (connection === "open") {
        console.log(">>> [WhatsApp] Conectado com sucesso com sessão persistida no PostgreSQL!");
        status = "CONNECTED";
        qrCodeBase64 = null;
        connectedPhone = sock?.user?.id?.split(":")[0] || "Conectado";
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
        const texto = (
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.documentMessage?.caption ||
          ""
        ).trim();

        const ehMidia = Boolean(msg.message?.imageMessage || msg.message?.documentMessage);
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

        try {
          const resposta = await processarMensagemRobo(remoteJid, texto, pushName, realPhone, ehMidia);
          if (resposta && sock) {
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
  }
}

async function disconnectWhatsApp() {
  try {
    if (sock) {
      await sock.logout().catch(() => {});
      sock = null;
    }
    status = "DISCONNECTED";
    qrCodeBase64 = null;
    connectedPhone = null;
    userSessions.clear();
    phoneToJidMap.clear();
    processedMessageIds.clear();
    await clearPostgresSession();
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    console.log(">>> [WhatsApp] Desconectado e banco limpo.");
  } catch (e) {
    console.error("Erro ao desconectar:", e);
  }
}

// 0. Mensagem Educada e Interativa de Liberação de Vaga por Sinal PIX Expirado
async function notificarCancelamentoSinalExpirado(dados) {
  const { telefone, nome, dataHora, servicoTitulo, servicoId, valor, valorSinal } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) {
    console.error(`>>> [Sinal Expirado] Não foi possível resolver targetJid para telefone: ${telefone}`);
    return false;
  }

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

  console.log(`>>> [Sinal Expirado] Enviando recuperação interativa para ${targetJid} (${nome})...`);
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

// 1. Mensagem de Cancelamento pelo Studio
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

  console.log(`>>> [Cancelamento] Enviando mensagem para ${targetJid} (${nomeCliente})...`);
  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

// 2. Mensagem de Agradecimento após Conclusão do Atendimento
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

  console.log(`>>> [Agradecimento] Enviando mensagem para ${targetJid} (${nomeCliente})...`);
  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

// 3. Mensagem Personalizada de Falta
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

  console.log(`>>> [Falta] Enviando mensagem de remarcação para ${targetJid} (${nomeCliente})...`);
  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

// 4. Mensagem de Confirmação quando o agendamento é feito pelo PWA / Site
async function notificarConfirmacaoWeb(telefone, nomeCliente, servicoTitulo, dataHora, valor) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) {
    console.error(`>>> [WhatsApp] Não foi possível resolver targetJid para telefone: ${telefone}`);
    return false;
  }

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

  console.log(`>>> [Confirmacao Web] Enviando comprovante para ${targetJid} (${nomeCliente})...`);
  userSessions.set(targetJid, { step: "INICIAL" });
  await enviarMensagemHumana(targetJid, mensagem);
  return true;
}

// 5. Mensagem de Solicitação de Sinal Antecipado via PIX
async function notificarSolicitacaoSinalWeb(dados) {
  const { telefone, nome, servicoTitulo, dataHora, valor, valorSinal, chavePix, titularPix, tempoLimiteMinutos } = dados;
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) {
    console.error(`>>> [WhatsApp] Não foi possível resolver targetJid para envio de sinal: ${telefone}`);
    return false;
  }

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

  console.log(`>>> [Sinal Web] Enviando solicitação de PIX para ${targetJid} (${nome})...`);
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

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status, qrCodeBase64, connectedPhone }));
    return;
  }

  if (req.url === "/start" && req.method === "POST") {
    startWhatsApp();
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
        res.end(JSON.stringify({ success: true, message: `Notificação enviada.` }));
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
