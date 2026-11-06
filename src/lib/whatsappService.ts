import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState as initMultiFileAuthState,
  WASocket,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs";
import { DataStore } from "./dataStore";
import { calcularSlotsDisponiveis } from "./appointmentEngine";
import { formatarMoeda } from "./utils";
import { Servico, HorarioSlot } from "@/types";

interface SessionState {
  step: "INICIAL" | "ESCOLHENDO_SERVICO" | "ESCOLHENDO_SLOT" | "DIGITANDO_NOME" | "AGUARDANDO_COMPROVANTE";
  servicoEscolhido?: Servico;
  slotsDisponiveis?: HorarioSlot[];
  slotEscolhido?: HorarioSlot;
  dataAlvo?: string;
}

class WhatsAppBotService {
  private sock: WASocket | null = null;
  private qrCodeBase64: string | null = null;
  private status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" = "DISCONNECTED";
  private connectedPhone: string | null = null;
  private userSessions: Map<string, SessionState> = new Map();
  private authDir = path.join(process.cwd(), "auth_info_baileys");

  public getStatus() {
    return {
      status: this.status,
      qrCodeBase64: this.qrCodeBase64,
      connectedPhone: this.connectedPhone,
    };
  }

  public async start(): Promise<void> {
    if (this.status === "CONNECTED" || this.status === "CONNECTING") {
      return;
    }

    this.status = "CONNECTING";
    this.qrCodeBase64 = null;

    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // eslint-disable-next-line react-hooks/rules-of-hooks
      const { state, saveCreds } = await initMultiFileAuthState(this.authDir);

      const logger = pino({ level: "silent" });

      this.sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ["Studio Malu Alves Beauty", "Chrome", "1.0.0"],
      });

      this.sock.ev.on("creds.update", saveCreds);

      this.sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeBase64 = await QRCode.toDataURL(qr);
            this.status = "CONNECTING";
            console.log("QR Code real gerado com sucesso para o WhatsApp!");
          } catch (err) {
            console.error("Erro ao gerar imagem do QR Code:", err);
          }
        }

        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !==
            DisconnectReason.loggedOut;

          console.log(
            "Conexão do WhatsApp fechada devido a:",
            lastDisconnect?.error,
            ", reconectar:",
            shouldReconnect
          );

          this.status = "DISCONNECTED";
          this.qrCodeBase64 = null;
          this.connectedPhone = null;

          if (shouldReconnect) {
            setTimeout(() => this.start(), 3000);
          }
        } else if (connection === "open") {
          console.log("WhatsApp conectado com sucesso!");
          this.status = "CONNECTED";
          this.qrCodeBase64 = null;
          this.connectedPhone = this.sock?.user?.id?.split(":")[0] || "Conectado";
        }
      });

      // Tratar mensagens recebidas de clientes reais no WhatsApp
      this.sock.ev.on("messages.upsert", async (m) => {
        if (m.type !== "notify") return;

        for (const msg of m.messages) {
          if (!msg.key?.fromMe && msg.key?.remoteJid && !msg.key.remoteJid.includes("@g.us")) {
            await this.processIncomingMessage(msg);
          }
        }
      });
    } catch (error) {
      console.error("Erro ao inicializar Baileys:", error);
      this.status = "DISCONNECTED";
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.sock) {
        await this.sock.logout();
        this.sock = null;
      }
      this.status = "DISCONNECTED";
      this.qrCodeBase64 = null;
      this.connectedPhone = null;

      // Limpar pasta de autenticação
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error("Erro ao desconectar WhatsApp:", e);
    }
  }

  private async processIncomingMessage(msg: proto.IWebMessageInfo) {
    const remoteJid = msg.key?.remoteJid;
    if (!remoteJid || !this.sock) return;

    const temImagem = !!msg.message?.imageMessage;
    const temDocumento = !!msg.message?.documentMessage;

    const textoUsuario = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.documentMessage?.caption ||
      ""
    ).trim();

    if (!textoUsuario && !temImagem && !temDocumento) return;

    const pushName = msg.pushName || "Cliente";
    const telefoneLimpo = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");

    let session = this.userSessions.get(remoteJid) || { step: "INICIAL" };
    const lower = textoUsuario.toLowerCase();

    // =========================================================================
    // VERIFICAÇÃO INTELIGENTE DE COMPROVANTE DE SINAL VIA PIX
    // =========================================================================
    const agendamentosHoje = await DataStore.getAgendamentos();
    const agendamentoPendente = agendamentosHoje.find(
      (a) =>
        a.cliente_telefone.replace(/\D/g, "") === telefoneLimpo &&
        a.status === "AGUARDANDO_SINAL"
    );

    const ehPalavraChaveComprovante =
      lower.includes("comprovante") ||
      lower.includes("pago") ||
      lower.includes("pix") ||
      lower.includes("transferi") ||
      lower.includes("enviei") ||
      lower.includes("mandei") ||
      lower.includes("segue");

    if (agendamentoPendente && (temImagem || temDocumento || ehPalavraChaveComprovante || session.step === "AGUARDANDO_COMPROVANTE")) {
      // Atualizar agendamento informando que o comprovante foi enviado pelo cliente
      try {
        await DataStore.updateStatusAgendamento(agendamentoPendente.id, "AGUARDANDO_SINAL");
        // Registrar flag comprovante_recebido
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/agendamentos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: agendamentoPendente.id,
            comprovante_recebido: true,
          }),
        }).catch(() => null);
      } catch (err) {
        console.error("Erro ao registrar comprovante:", err);
      }

      const respostaComprovante =
        `📸 *Comprovante recebido com sucesso, ${agendamentoPendente.cliente_nome.split(" ")[0]}!* ✨\n\n` +
        `O seu horário hoje às *${agendamentoPendente.horario_inicio.split("T")[1]?.slice(0, 5)}* está garantido e protegido!\n` +
        `Nossa equipe já está conferindo a transferência e você receberá a confirmação definitiva aqui em instantes.\n\n` +
        `Muito obrigada pela preferência! 🌸`;

      session = { step: "INICIAL" };
      this.userSessions.set(remoteJid, session);

      try {
        await this.sock.sendMessage(remoteJid, { text: respostaComprovante });
      } catch (err) {
        console.error("Erro ao enviar confirmação de comprovante:", err);
      }
      return;
    }

    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const [servicos, expedientes, config] = await Promise.all([
      DataStore.getServicos(),
      DataStore.getExpediente(),
      DataStore.getConfig(),
    ]);

    const servicosAtivos = servicos.filter((s) => s.ativo);

    let respostaTexto = "";

    // 1. ESTÁGIO INICIAL
    if (session.step === "INICIAL") {
      // Verificar se é cliente recorrente
      const clienteExistente = await DataStore.findClientePorTelefone(telefoneLimpo);

      if (
        lower.includes("1") ||
        lower.includes("agendar") ||
        lower.includes("marcar") ||
        lower.includes("sobrancelha") ||
        lower.includes("design") ||
        lower.includes("atendimento") ||
        lower.includes("horário") ||
        lower.includes("horario") ||
        lower.includes("horário")
      ) {
        respostaTexto =
          `✂️ *Escolha o serviço desejado:*\n\n` +
          servicosAtivos
            .map(
              (s, idx) =>
                `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`
            )
            .join("\n") +
          `\n\n_Digite o número do serviço desejado:_`;

        session = { step: "ESCOLHENDO_SERVICO", dataAlvo: hojeStr };
      } else if (lower.includes("2") || lower.includes("preço") || lower.includes("serviço")) {
        respostaTexto =
          `📋 *Nossa Tabela de Serviços:*\n\n` +
          servicosAtivos
            .map((s) => `• *${s.titulo}*: ${formatarMoeda(s.preco)} (${s.duracao_minutos} min)`)
            .join("\n") +
          `\n\nDigite *1* para agendar seu horário!`;
      } else {
        const saudacao = clienteExistente
          ? `Olá ${clienteExistente.nome.split(" ")[0]}! Bom te ver de novo! ✨`
          : `Olá, ${pushName}! Bem-vinda ao Studio Malu Alves Beauty! ✨`;

        respostaTexto =
          `💈 *${saudacao}*\n\n` +
          `Como posso te ajudar hoje?\n\n` +
          `*1* - Agendar um Horário\n` +
          `*2* - Ver Serviços e Preços\n` +
          `*3* - Falar com o Dono\n\n` +
          `_Digite o número da opção desejada:_`;
      }
    }

    // 2. ESCOLHENDO SERVIÇO
    else if (session.step === "ESCOLHENDO_SERVICO") {
      const num = parseInt(textoUsuario, 10);
      if (!isNaN(num) && num >= 1 && num <= servicosAtivos.length) {
        const srv = servicosAtivos[num - 1];

        // Calcular horários livres reais
        const [agendamentos, bloqueios] = await Promise.all([
          DataStore.getAgendamentos(session.dataAlvo || hojeStr),
          DataStore.getBloqueios(),
        ]);

        const resultado = calcularSlotsDisponiveis({
          data: session.dataAlvo || hojeStr,
          servico: srv,
          expedientes,
          agendamentosExistentes: agendamentos,
          bloqueios,
        });

        if (resultado.slots.length === 0) {
          respostaTexto = `⚠️ Não há mais horários disponíveis para hoje para *${srv.titulo}*. Gostaria de ver amanhã? Digite *Sim*.`;
        } else {
          const letras = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
          const listaSlots = resultado.slots
            .slice(0, 8)
            .map((slot, i) => `*${letras[i]}*) ${slot.hora_inicio}`)
            .join("\n");

          respostaTexto =
            `✅ Serviço: *${srv.titulo}* (${formatarMoeda(srv.preco)})\n\n` +
            `📅 *Horários livres para HOJE:*\n\n${listaSlots}\n\n` +
            `_Digite a letra do horário desejado (ex: A):_`;

          session = {
            ...session,
            step: "ESCOLHENDO_SLOT",
            servicoEscolhido: srv,
            slotsDisponiveis: resultado.slots,
          };
        }
      } else {
        respostaTexto = `Opção inválida. Digite o número correspondente ao serviço (ex: 1, 2, 3...):`;
      }
    }

    // 3. ESCOLHENDO HORÁRIO
    else if (session.step === "ESCOLHENDO_SLOT" && session.slotsDisponiveis) {
      const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
      const index = letras.indexOf(lower);

      if (index >= 0 && index < session.slotsDisponiveis.length) {
        const slot = session.slotsDisponiveis[index];
        session = {
          ...session,
          step: "DIGITANDO_NOME",
          slotEscolhido: slot,
        };

        respostaTexto =
          `🕒 Horário escolhido: *${slot.hora_inicio}*.\n\n` +
          `Por favor, digite seu *Nome Completo* para confirmarmos na agenda:`;
      } else {
        respostaTexto = `Letra inválida. Digite a letra correspondente ao horário (ex: A, B, C...):`;
      }
    }

    // 4. DIGITANDO NOME & CONFIRMANDO NO BANCO DE DADOS
    else if (
      session.step === "DIGITANDO_NOME" &&
      session.servicoEscolhido &&
      session.slotEscolhido
    ) {
      const nomeCliente = textoUsuario;
      const dataHoraInicio = `${session.dataAlvo || hojeStr}T${session.slotEscolhido.hora_inicio}:00`;

      const exigeSinal = config.exigir_sinal ?? true;
      const valorSinal =
        config.tipo_sinal === "FIXO"
          ? config.sinal_valor_fixo ?? 20
          : Math.round(
              (session.servicoEscolhido.preco * (config.sinal_porcentagem ?? 30)) / 100
            );

      // Criar agendamento no sistema
      await DataStore.createAgendamento({
        cliente_nome: nomeCliente,
        cliente_telefone: telefoneLimpo,
        servico: session.servicoEscolhido,
        horario_inicio: dataHoraInicio,
        origem: "WHATSAPP",
        status: exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO",
        valor_sinal: exigeSinal ? valorSinal : undefined,
      });

      if (exigeSinal) {
        respostaTexto =
          `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
          `👤 *Cliente:* ${nomeCliente}\n` +
          `✨ *Procedimento:* ${session.servicoEscolhido.titulo}\n` +
          `📅 *Data:* Hoje às *${session.slotEscolhido.hora_inicio}*\n` +
          `💵 *Valor Total:* ${formatarMoeda(session.servicoEscolhido.preco)}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔒 *GARANTIA DO SEU HORÁRIO*\n` +
          `Para confirmar com exclusividade a sua vaga na agenda e evitar cancelamentos, solicitamos um pequeno sinal de:\n\n` +
          `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
          `_(O restante de ${formatarMoeda(session.servicoEscolhido.preco - valorSinal)} será pago no studio no dia do atendimento)_\n\n` +
          `🔑 *CHAVE PIX (Celular):*\n` +
          `\`${config.chave_pix || "82981430673"}\`\n` +
          `*Titular:* ${config.titular_pix || "Luisa Alves dos Santos"}\n\n` +
          `⏳ *Atenção:* Seu horário fica pré-reservado por *${config.tempo_limite_sinal_minutos || 30} minutos*.\n` +
          `Por favor, envie o comprovante do PIX respondendo a esta mensagem para confirmarmos seu horário! ✨\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`;

        session = { step: "AGUARDANDO_COMPROVANTE" };
      } else {
        respostaTexto =
          `🎉 *AGENDAMENTO CONFIRMADO!* 🎉\n\n` +
          `👤 *Cliente:* ${nomeCliente}\n` +
          `✨ *Procedimento:* ${session.servicoEscolhido.titulo}\n` +
          `📅 *Data:* Hoje às *${session.slotEscolhido.hora_inicio}*\n` +
          `💵 *Valor:* ${formatarMoeda(session.servicoEscolhido.preco)}\n` +
          `📍 *Local:* Studio Malu Alves Beauty\n\n` +
          `✅ _Seu horário já foi reservado na agenda da designer! Enviaremos um lembrete 2h antes._\n\n` +
          `Aguardamos você! ✨`;

        session = { step: "INICIAL" };
      }
    }

    this.userSessions.set(remoteJid, session);

    // Enviar mensagem de volta
    try {
      await this.sock.sendMessage(remoteJid, { text: respostaTexto });
    } catch (err) {
      console.error("Erro ao enviar mensagem no WhatsApp:", err);
    }
  }
}

// Exportar instância Singleton
const globalForWhatsApp = global as unknown as { whatsAppBotInstance?: WhatsAppBotService };
export const whatsAppBot = globalForWhatsApp.whatsAppBotInstance || new WhatsAppBotService();
if (process.env.NODE_ENV !== "production") globalForWhatsApp.whatsAppBotInstance = whatsAppBot;
