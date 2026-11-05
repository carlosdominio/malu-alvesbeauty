const http = require("http");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const PORT = 3001;
const authDir = path.join(__dirname, "auth_info_baileys");
const dbPath = path.join(__dirname, "data_storage.json");

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
      return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
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

// Buscar cliente cadastrado pelo telefone
function buscarClientePorTelefone(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  return db.clientes?.find((c) => {
    const cTel = c.telefone.replace(/\D/g, "");
    return cTel === tel || cTel === tel.slice(2) || `55${cTel}` === tel;
  });
}

// Buscar agendamento ativo (CONFIRMADO) para o cliente
function buscarAgendamentoAtivo(telefoneLimpo) {
  const db = lerBancoCentral();
  const tel = telefoneLimpo.replace(/\D/g, "");
  const agora = new Date();
  const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

  return db.agendamentos?.find((ag) => {
    if (ag.status !== "CONFIRMADO") return false;
    const agTel = ag.cliente_telefone.replace(/\D/g, "");
    const mesmoTel = agTel === tel || agTel === tel.slice(2) || `55${agTel}` === tel;
    if (!mesmoTel) return false;
    const agData = ag.horario_inicio.split("T")[0];
    return agData >= hojeStr;
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
async function processarMensagemRobo(remoteJid, textoUsuario, pushNameRaw, realPhone) {
  const textoLimpo = textoUsuario.trim().toLowerCase();
  let session = userSessions.get(remoteJid) || { step: "INICIAL" };
  let resposta = "";

  const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
  const telefoneFinal = realPhone || remoteJid.replace("@s.whatsapp.net", "").replace("@lid", "").replace(/\D/g, "");

  // 1. Identificar cliente e agendamentos existentes
  const clienteCadastrado = buscarClientePorTelefone(telefoneFinal);
  const agendamentoAtivo = buscarAgendamentoAtivo(telefoneFinal);
  const servicosAtivos = obterServicosAtivos();

  // 2. Captura direta do nome do perfil do WhatsApp (sempre atualizado pelo Zap do cliente)
  const pushNameLimpo = (pushNameRaw || "").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "").trim();
  const nomeDetectado = pushNameLimpo || "Cliente";

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
          servicosAtivos.map((s, idx) => `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`).join("\n") +
          `\n\n_Digite o número do serviço desejado:_`;
        session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("designer") || textoLimpo.includes("atendente")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já avisei a designer e ela irá falar com você em instantes.`;
      } else {
        resposta =
          `✨ *Olá ${nomeDetectado}!* ✨\n\n` +
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

          resposta =
            `Olá *${nomeDetectado}*! ✨\n` +
            `Vamos marcar seu *${ultimoSrv.titulo}* (${formatarMoeda(ultimoSrv.preco)})?\n\n` +
            `📅 *Escolha o dia:*\n\n${listaDias}\n\n` +
            `_Digite o número do dia (ou digite *Outro* para mudar o procedimento):_`;
        } else {
          resposta =
            `✨ *Escolha o procedimento desejado:*\n\n` +
            servicosAtivos.map((s, idx) => `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`).join("\n") +
            `\n\n_Digite o número do procedimento desejado (ex: 1, 2 ou 3):_`;
          session = { step: "ESCOLHENDO_SERVICO", nomeCliente: nomeDetectado };
        }
      } else if (textoLimpo === "2" || textoLimpo.includes("preço") || textoLimpo.includes("serviço") || textoLimpo.includes("procedimento")) {
        resposta =
          `📋 *Nossa Tabela de Procedimentos:*\n\n` +
          servicosAtivos.map((s) => `• *${s.titulo}*: ${formatarMoeda(s.preco)} (${s.duracao_minutos} min)`).join("\n") +
          `\n\nDigite *1* para agendar seu horário!`;
      } else if (textoLimpo === "3" || textoLimpo.includes("dono") || textoLimpo.includes("humano") || textoLimpo.includes("designer")) {
        resposta = `👩‍💼 Um momento, ${nomeDetectado}! Já notifiquei a equipe e iremos te responder em instantes por aqui.`;
      } else {
        const saudacao = clienteCadastrado
          ? `Olá ${nomeDetectado}! Que bom ter você de volta! ✨ (${clienteCadastrado.total_visitas || 1} atendimentos no Cartão Fidelidade ⭐)`
          : `Olá, ${nomeDetectado}! Bem-vinda ao Studio Malu Alves Beauty! ✨`;

        resposta =
          `✨ *${saudacao}*\n\n` +
          `Como posso te ajudar hoje?\n\n` +
          `*1* ➔ Agendar um Horário\n` +
          `*2* ➔ Ver Procedimentos e Valores\n` +
          `*3* ➔ Falar com a Equipe\n\n` +
          `_Digite o número da opção desejada:_`;
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
  // ETAPA 4: ESCOLHENDO HORÁRIO ➔ CONFIRMAÇÃO DIRETA (SEM PEDIR NOME!)
  // =========================================================================
  else if (session.step === "ESCOLHENDO_HORARIO") {
    const idx = letras.indexOf(textoLimpo);

    if (idx >= 0 && session.horariosDisponiveis && idx < session.horariosDisponiveis.length) {
      const horarioEscolhido = session.horariosDisponiveis[idx];
      const nomeFinal = session.nomeCliente || nomeDetectado || "Cliente";
      const srv = session.servico || servicosAtivos[0];
      const dia = session.diaEscolhido ? session.diaEscolhido.isoData : new Date().toISOString().split("T")[0];
      const dataHoraInicio = `${dia}T${horarioEscolhido}:00`;

      // Sincronizar em tempo real com o Painel Admin do Dono!
      salvarAgendamentoNoPainel({
        cliente_nome: nomeFinal,
        cliente_telefone: telefoneFinal,
        servico: srv,
        horario_inicio: dataHoraInicio,
        origem: "WHATSAPP",
      });

      const dataFormatada = dia.split("-").reverse().slice(0, 2).join("/");

      resposta =
        `🎉 *AGENDAMENTO CONFIRMADO!* 🎉\n\n` +
        `👤 *Cliente:* ${nomeFinal}\n` +
        `✨ *Procedimento:* ${srv.titulo}\n` +
        `📅 *Data:* ${dataFormatada} às *${horarioEscolhido}*\n` +
        `💵 *Valor:* ${formatarMoeda(srv.preco)}\n` +
        `📍 *Local:* Studio Malu Alves Beauty\n\n` +
        `✅ _Seu horário já foi reservado na agenda da designer! Enviaremos uma mensagem de lembrete 2h antes._\n\n` +
        `Aguardamos você com muito carinho! ✨`;

      session = { step: "INICIAL" };
    } else {
      resposta = `Letra inválida. Por favor, digite uma das letras listadas acima (ex: A, B, C...):`;
    }
  }

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
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
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
          console.log(">>> [WhatsApp] QR Code real gerado.");
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

        // Se for 401 (loggedOut) ou credencial corrompida, limpa auth_info_baileys para permitir gerar novo QR Code
        if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
          console.log(">>> [WhatsApp] Sessão expirada/desconectada no celular. Limpando credenciais antigas para novo QR Code...");
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
          }
        }

        if (shouldReconnect) {
          setTimeout(startWhatsApp, 3000);
        }
      } else if (connection === "open") {
        console.log(">>> [WhatsApp] Conectado e Robô pronto com Captura Automática de Nome e Reconhecimento!");
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
          ""
        ).trim();

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

        if (!texto) continue;

        try {
          const resposta = await processarMensagemRobo(remoteJid, texto, pushName, realPhone);
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
      await sock.logout();
      sock = null;
    }
    status = "DISCONNECTED";
    qrCodeBase64 = null;
    connectedPhone = null;
    userSessions.clear();
    phoneToJidMap.clear();
    processedMessageIds.clear();
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    console.log(">>> [WhatsApp] Desconectado.");
  } catch (e) {
    console.error("Erro ao desconectar:", e);
  }
}

// 1. Mensagem de Cancelamento pelo Studio
async function notificarCancelamentoAdmin(telefone, nomeCliente, dataHora) {
  const targetJid = await resolverRemoteJid(telefone);
  if (!sock || !targetJid) return false;

  const horaStr = dataHora ? dataHora.split("T")[1]?.slice(0, 5) : "";
  const dataPart = dataHora ? dataHora.split("T")[0] : "";
  const dataFormatada = dataPart ? dataPart.split("-").reverse().slice(0, 2).join("/") : "hoje";

  const mensagem =
    `⚠️ *Aviso do Studio Malu Alves Beauty* ⚠️\n\n` +
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

  let mensagemFidelidade = `⭐ Você possui *${visitas} ${visitas === 1 ? "atendimento realizado" : "atendimentos realizados"}* no seu Cartão Fidelidade.`;
  if (elegivelDesconto) {
    mensagemFidelidade =
      `🎉 *PARABÉNS!* Você completou seu 5º atendimento no Cartão Fidelidade!\n` +
      `🎯 No seu próximo procedimento você tem direito a um *Super Desconto Especial!*`;
  }

  const mensagem =
    `✨ *Obrigada pela preferência, ${nomeCliente}!* ✨\n\n` +
    `Foi um imenso prazer atendê-la no Studio Malu Alves Beauty! Esperamos que tenha amado o resultado das suas sobrancelhas.\n\n` +
    `${mensagemFidelidade}\n\n` +
    `Quando desejar realçar seu olhar novamente, basta me mandar um *Oi* por aqui! 💖\n` +
    `Tenha um dia maravilhoso!`;

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

  const mensagem =
    `👋 *Olá, ${nomeCliente}! Tudo bem?*\n\n` +
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

  const mensagem =
    `🎉 *AGENDAMENTO CONFIRMADO VIA SITE!* ✨\n\n` +
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

  if (req.url === "/notify" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { tipo, telefone, nome, servicoTitulo, dataHora, valor, totalVisitas } = JSON.parse(body);

        if (tipo === "CONFIRMACAO_WEB") {
          await notificarConfirmacaoWeb(telefone, nome, servicoTitulo, dataHora, valor);
        } else if (tipo === "CONCLUIDO") {
          await notificarConclusaoAdmin(telefone, nome, totalVisitas);
        } else if (tipo === "FALTOU") {
          await notificarFaltaAdmin(telefone, nome, servicoTitulo, dataHora);
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
