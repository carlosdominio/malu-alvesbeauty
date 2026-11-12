const http = require("http");
const path = require("path");
const fs = require("fs");
const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  fetchLatestBaileysVersion,
  fetchLatestWaWebVersion,
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const pino = require("pino");

// Módulos do Bot
const { PORT, authDir, RENDER_HEALTH_URL, sleep } = require("./bot/config");
const {
  INSTANCE_ID,
  restoreAuthFromDb,
  syncAuthToDb,
  clearDbAuth,
  clearLocalAuth,
  checkAndAcquireLeader,
  releaseLeader,
  isLeader,
} = require("./bot/db");
const { processarMensagemRobo, userSessions } = require("./bot/engine");
const {
  phoneToJidMap,
  setSocket,
  enviarMensagemHumana,
  notificarCancelamentoSinalExpirado,
  notificarCancelamentoAdmin,
  notificarConclusaoAdmin,
  notificarFaltaAdmin,
  notificarConfirmacaoWeb,
  notificarSolicitacaoSinalWeb,
} = require("./bot/notifications");

// Estado do serviço
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

const processedMessageIds = new Set();
setInterval(() => {
  if (processedMessageIds.size > 2000) {
    processedMessageIds.clear();
  }
}, 10 * 60 * 1000);

// Auto-ping a cada 4 minutos para impedir hibernação de containers
setInterval(async () => {
  try {
    await fetch(`${RENDER_HEALTH_URL}/health`).catch(() => {});
  } catch (_) {}
}, 4 * 60 * 1000);

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
    setSocket(null);
    await sleep(800);
  }

  try {
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
      getMessage: async () => ({ conversation: "ok" }),
    });

    setSocket(sock);

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
          setSocket(null);
        }

        isStarting = false;

        // CASO 1: 515 (restartRequired) -> QR Code escaneado com sucesso
        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          console.log(`>>> [WhatsApp][${INSTANCE_ID}] QR Code escaneado com sucesso! Reiniciando socket autenticado (515)...`);
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
        if (msgId && processedMessageIds.has(msgId)) continue;
        if (msgId) processedMessageIds.add(msgId);

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
      setSocket(null);
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
        isLeader: isLeader(),
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
    setSocket(null);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
