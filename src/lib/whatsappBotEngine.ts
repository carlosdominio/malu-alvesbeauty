import { DataStore } from "@/lib/dataStore";
import { Servico, BarbeariaConfig } from "@/types";
import { formatarMoeda } from "@/lib/utils";
import {
  formatarMensagem,
  gerarTextoBoasVindas,
  MENSAGENS_PADRAO,
  encontrarRespostaCustomizada,
} from "@/lib/whatsappTemplates";

interface BotSession {
  step: "INICIAL" | "ESCOLHENDO_SERVICO" | "ESCOLHENDO_DIA" | "ESCOLHENDO_SLOT" | "DIGITANDO_NOME" | "AGUARDANDO_COMPROVANTE" | "FINALIZADO";
  servico?: Servico;
  diaIso?: string;
  slot?: string;
  clienteNome?: string;
  valorSinal?: number;
  agendamentoId?: string;
  lastActivity: number;
}

// Armazena em memória as sessões ativas dos clientes
const sessions = new Map<string, BotSession>();

export class WhatsAppBotEngine {
  /**
   * Processa uma mensagem recebida e retorna o texto da resposta (ou null se não responder)
   */
  static async processMessage(
    telefone: string,
    textoRaw: string,
    pushName?: string,
    ehMidia: boolean = false
  ): Promise<string | null> {
    const telLimpo = telefone.replace(/\D/g, "");
    if (!telLimpo) return null;

    const texto = (textoRaw || "").trim();
    const textoLower = texto.toLowerCase();

    // 1. Carrega as configurações atuais da barbearia / studio
    const config: BarbeariaConfig = await DataStore.getConfig();
    const zapCfg = config.mensagens_zap;

    // Se o Atendimento Automático estiver pausado nas Regras, não responde
    if (zapCfg?.robo_ativo === false) {
      console.log(`[BotEngine] Atendimento automático desativado. Ignorando mensagem de ${telLimpo}`);
      return null;
    }

    // 2. Recupera ou cria a sessão do cliente
    const agora = Date.now();
    let session = sessions.get(telLimpo) || {
      step: "INICIAL",
      lastActivity: agora,
    };

    // Timeout de inatividade (padrão 15 min)
    const timeoutMin = config.tempo_inatividade_bot_minutos || 15;
    if (session.step !== "INICIAL" && session.step !== "AGUARDANDO_COMPROVANTE") {
      if (agora - session.lastActivity > timeoutMin * 60 * 1000) {
        session = { step: "INICIAL", lastActivity: agora };
      }
    }
    session.lastActivity = agora;

    const servicosTodos = await DataStore.getServicos();
    const servicos = servicosTodos.filter((s) => s.ativo);

    const ehSaudacao = /^(oi|olá|ola|bom dia|boa tarde|boa noite|menu|in[ií]cio|come[çc]ar|start)$/i.test(textoLower);

    // =========================================================================
    // TRATAMENTO DE COMPROVANTE PIX (SE ESTIVER AGUARDANDO)
    // =========================================================================
    if (session.step === "AGUARDANDO_COMPROVANTE" || ehMidia || textoLower.includes("comprovante") || textoLower.includes("pix")) {
      if (session.step === "AGUARDANDO_COMPROVANTE" || ehMidia) {
        session.step = "INICIAL";
        sessions.set(telLimpo, session);

        // Se houver agendamento pendente de sinal, confirma
        if (session.agendamentoId) {
          try {
            await DataStore.updateStatusAgendamento(session.agendamentoId, "CONFIRMADO", "PIX");
          } catch (e) {
            console.error("[BotEngine] Erro ao atualizar status para confirmado:", e);
          }
        }

        const dataFormatada = session.diaIso
          ? session.diaIso.split("-").reverse().slice(0, 2).join("/")
          : "";
        const templateConfirmacao = zapCfg?.confirmacao_agendamento || MENSAGENS_PADRAO.confirmacao_agendamento;
        const msgConfirmada = formatarMensagem(templateConfirmacao, {
          cliente: session.clienteNome || pushName || "Cliente",
          servico: session.servico?.titulo || "Procedimento",
          data: dataFormatada,
          horario: session.slot || "",
          valor_total: session.servico?.preco ? formatarMoeda(session.servico.preco) : "",
        });

        return (
          `📸 *Comprovante do PIX recebido e confirmado com sucesso!* ✨\n\n` +
          msgConfirmada
        );
      }
    }

    // =========================================================================
    // RESPOSTAS AUTOMÁTICAS CUSTOMIZADAS (Localização, Formas de Pagamento, etc.)
    // =========================================================================
    const customResp = encontrarRespostaCustomizada(textoLower, zapCfg?.respostas_personalizadas);
    if (customResp) {
      return formatarMensagem(customResp.resposta, {
        cliente: pushName || "Cliente",
      });
    }

    // =========================================================================
    // ETAPA 1: MENU INICIAL
    // =========================================================================
    if (session.step === "INICIAL" || ehSaudacao) {
      if (textoLower === "1" || textoLower.includes("agendar") || textoLower.includes("marcar")) {
        session.step = "ESCOLHENDO_SERVICO";
        sessions.set(telLimpo, session);
        return this.gerarMenuServicos(servicos);
      }

      if (textoLower === "2" || textoLower.includes("procedimento") || textoLower.includes("valor") || textoLower.includes("tabela") || textoLower.includes("preço")) {
        return this.gerarTabelaPrecos(servicos);
      }

      if (textoLower === "3" || textoLower.includes("equipe") || textoLower.includes("atendente") || textoLower.includes("humano")) {
        return (
          `👩‍💼 *Atendimento com a Equipe*\n\n` +
          `Um momento! Já notifiquei a equipe do Studio Malu Alves Beauty. Uma de nossas especialistas vai te responder aqui assim que terminar o atendimento em andamento.\n\n` +
          `_Se preferir agendar imediatamente de forma automática, digite *1* a qualquer momento._`
        );
      }

      // Envia menu inicial padrão carregado das configurações personalizadas
      session.step = "INICIAL";
      sessions.set(telLimpo, session);
      return gerarTextoBoasVindas(config, pushName);
    }

    // =========================================================================
    // ETAPA 2: ESCOLHENDO SERVIÇO
    // =========================================================================
    if (session.step === "ESCOLHENDO_SERVICO") {
      const idx = parseInt(texto) - 1;
      let servicoEscolhido: Servico | undefined;

      if (!isNaN(idx) && idx >= 0 && idx < servicos.length) {
        servicoEscolhido = servicos[idx];
      } else {
        servicoEscolhido = servicos.find((s) => textoLower.includes(s.titulo.toLowerCase()));
      }

      if (!servicoEscolhido) {
        return (
          `⚠️ Opção não reconhecida.\n\n` +
          `Por favor, digite o *número* correspondente ao serviço desejado:\n\n` +
          this.gerarMenuServicos(servicos)
        );
      }

      session.servico = servicoEscolhido;
      session.step = "ESCOLHENDO_DIA";
      sessions.set(telLimpo, session);

      return this.gerarMenuDias(servicoEscolhido);
    }

    // =========================================================================
    // ETAPA 3: ESCOLHENDO DIA
    // =========================================================================
    if (session.step === "ESCOLHENDO_DIA") {
      const diasDisponiveis = this.obterProximosDias();
      const numDia = parseInt(texto) - 1;

      if (isNaN(numDia) || numDia < 0 || numDia >= diasDisponiveis.length) {
        return (
          `⚠️ Opção inválida. Digite o número do dia desejado:\n\n` +
          this.gerarMenuDias(session.servico!)
        );
      }

      const diaEscolhido = diasDisponiveis[numDia];
      session.diaIso = diaEscolhido.isoData;
      session.step = "ESCOLHENDO_SLOT";
      sessions.set(telLimpo, session);

      const slots = this.gerarHorariosExemplo(diaEscolhido.isoData);
      return (
        `📅 *Horários disponíveis para ${diaEscolhido.rotulo}:*\n\n` +
        slots.map((s, i) => `*${i + 1}* ➔ ${s}`).join("\n") +
        `\n\n_Digite o número do horário desejado:_`
      );
    }

    // =========================================================================
    // ETAPA 4: ESCOLHENDO HORÁRIO (SLOT)
    // =========================================================================
    if (session.step === "ESCOLHENDO_SLOT") {
      const slots = this.gerarHorariosExemplo(session.diaIso!);
      const numSlot = parseInt(texto) - 1;
      let slotEscolhido: string | undefined;

      if (!isNaN(numSlot) && numSlot >= 0 && numSlot < slots.length) {
        slotEscolhido = slots[numSlot];
      } else {
        slotEscolhido = slots.find((s) => s === texto || s.startsWith(texto));
      }

      if (!slotEscolhido) {
        return (
          `⚠️ Horário inválido. Escolha um dos números abaixo:\n\n` +
          slots.map((s, i) => `*${i + 1}* ➔ ${s}`).join("\n")
        );
      }

      session.slot = slotEscolhido;
      session.step = "DIGITANDO_NOME";
      sessions.set(telLimpo, session);

      return (
        `Perfeito! Horário escolhido: *${slotEscolhido}*.\n\n` +
        `✍️ Para finalizar a reserva na agenda, por favor digite o seu *Nome Completo*:`
      );
    }

    // =========================================================================
    // ETAPA 5: DIGITANDO NOME E CRIAÇÃO DO AGENDAMENTO
    // =========================================================================
    if (session.step === "DIGITANDO_NOME") {
      const nomeCliente = texto.length >= 2 ? texto : pushName || "Cliente";
      session.clienteNome = nomeCliente;

      const srv = session.servico!;
      const dataHoraIso = `${session.diaIso}T${session.slot}:00`;
      const precoFinal = srv.em_promocao && srv.preco_promocional ? srv.preco_promocional : srv.preco;

      const exigeSinal = Boolean(config.exigir_sinal);
      const valorSinal = exigeSinal
        ? config.tipo_sinal === "FIXO" && config.sinal_valor_fixo
          ? config.sinal_valor_fixo
          : Math.round((precoFinal * (config.sinal_porcentagem || 30)) / 100)
        : 0;

      // Cria agendamento no banco
      try {
        const novoAgendamento = await DataStore.createAgendamento({
          cliente_nome: nomeCliente,
          cliente_telefone: telLimpo,
          servico: { ...srv, preco: precoFinal },
          horario_inicio: dataHoraIso,
          origem: "WHATSAPP",
          status: exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO",
          valor_sinal: valorSinal,
        });
        session.agendamentoId = novoAgendamento.id;
      } catch (e) {
        console.error("[BotEngine] Erro ao criar agendamento:", e);
      }

      const dataFormatada = (session.diaIso || "").split("-").reverse().slice(0, 2).join("/");

      if (exigeSinal && valorSinal > 0) {
        session.step = "AGUARDANDO_COMPROVANTE";
        session.valorSinal = valorSinal;
        sessions.set(telLimpo, session);

        const chavePix = config.chave_pix || "82981430673";
        const titular = config.titular_pix || "Luisa Alves dos Santos";
        const tempoLimite = config.tempo_limite_sinal_minutos || 30;

        const templateSinal = zapCfg?.solicitacao_sinal || MENSAGENS_PADRAO.solicitacao_sinal;
        return formatarMensagem(templateSinal, {
          cliente: nomeCliente,
          servico: srv.titulo,
          data: dataFormatada,
          horario: session.slot,
          valor_total: formatarMoeda(precoFinal),
          valor_sinal: formatarMoeda(valorSinal),
          valor_restante: formatarMoeda(Math.max(0, precoFinal - valorSinal)),
          chave_pix: chavePix,
          tipo_chave: "Chave PIX",
          titular_pix: titular,
          tempo_limite: tempoLimite,
        });
      }

      session.step = "FINALIZADO";
      sessions.set(telLimpo, session);

      const templateConfirmacao = zapCfg?.confirmacao_agendamento || MENSAGENS_PADRAO.confirmacao_agendamento;
      return formatarMensagem(templateConfirmacao, {
        cliente: nomeCliente,
        servico: srv.titulo,
        data: dataFormatada,
        horario: session.slot,
        valor_total: formatarMoeda(precoFinal),
      });
    }

    return null;
  }

  // =========================================================================
  // AUXILIARES
  // =========================================================================

  private static gerarMenuServicos(servicos: Servico[]): string {
    return (
      `🌸 *Nossos Procedimentos Disponíveis:*\n\n` +
      servicos
        .map((s, idx) => {
          const preco = s.em_promocao && s.preco_promocional ? `🔥 *${formatarMoeda(s.preco_promocional)}*` : `*${formatarMoeda(s.preco)}*`;
          return `*${idx + 1}* ➔ ${s.titulo} (${preco} • ${s.duracao_minutos}min)`;
        })
        .join("\n") +
      `\n\n_Digite o número do procedimento que você deseja:_`
    );
  }

  private static gerarTabelaPrecos(servicos: Servico[]): string {
    return (
      `📋 *Tabela de Procedimentos e Valores*\n\n` +
      servicos
        .map((s, idx) => {
          const precoOriginal = formatarMoeda(s.preco);
          if (s.em_promocao && s.preco_promocional) {
            return `*${idx + 1}.* ${s.titulo}\n   ~${precoOriginal}~ ➔ 🔥 *${formatarMoeda(s.preco_promocional)}* (${s.duracao_minutos} min)`;
          }
          return `*${idx + 1}.* ${s.titulo}\n   💰 *${precoOriginal}* (${s.duracao_minutos} min)`;
        })
        .join("\n\n") +
      `\n\n_Para agendar o seu horário, digite *1* a qualquer momento!_`
    );
  }

  private static obterProximosDias() {
    const hoje = new Date();
    const dias = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      const diaSemana = d.getDay();
      if (diaSemana === 0 && i > 0) continue; // Pula domingos futuros se fechado

      const isoData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const nomeFormatado = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
      const rotulo = i === 0 ? `Hoje (${nomeFormatado})` : i === 1 ? `Amanhã (${nomeFormatado})` : nomeFormatado;
      dias.push({ isoData, rotulo });
    }
    return dias;
  }

  private static gerarMenuDias(servico: Servico): string {
    const dias = this.obterProximosDias();
    return (
      `✨ Procedimento: *${servico.titulo}*\n\n` +
      `Escolha o dia desejado:\n\n` +
      dias.map((d, i) => `*${i + 1}* ➔ ${d.rotulo}`).join("\n") +
      `\n\n_Digite o número correspondente ao dia:_`
    );
  }

  private static gerarHorariosExemplo(dataIso: string): string[] {
    const agora = new Date();
    const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
    const ehHoje = dataIso === hojeStr;
    const horaAtual = agora.getHours();

    const horariosPadrao = ["09:00", "09:45", "10:30", "11:15", "14:00", "15:00", "16:00", "17:00", "18:00"];

    if (!ehHoje) return horariosPadrao;

    return horariosPadrao.filter((h) => {
      const [hora] = h.split(":").map(Number);
      return hora > horaAtual;
    });
  }
}
