import { DataStore } from "@/lib/dataStore";
import { Servico, BarbeariaConfig, RespostaAutomatica } from "@/types";
import { formatarMoeda } from "@/lib/utils";
import { obterCumprimentoHorario } from "@/lib/whatsappTemplates";

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

        return (
          `📸 *Comprovante do PIX recebido com sucesso!* ✨\n\n` +
          `Olá, *${session.clienteNome || pushName || "Cliente"}*! Confirmamos o recebimento do sinal para *${session.servico?.titulo || "o procedimento"}*.\n\n` +
          `✅ *Seu agendamento está 100% CONFIRMADO na agenda do Studio Malu Alves Beauty!* 🌸\n\n` +
          `📍 *Local:* Studio Malu Alves Beauty\n` +
          `Te enviaremos um lembrete antes do seu atendimento. Agradecemos a preferência e esperamos por você! ✨`
        );
      }
    }

    // =========================================================================
    // RESPOSTAS AUTOMÁTICAS CUSTOMIZADAS (Localização, Formas de Pagamento, etc.)
    // =========================================================================
    const customResp = this.buscarRespostaCustomizada(textoLower, zapCfg?.respostas_personalizadas);
    if (customResp) {
      return customResp.resposta;
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

      // Envia menu inicial padrão
      session.step = "INICIAL";
      sessions.set(telLimpo, session);
      return this.gerarTextoBoasVindas(config, zapCfg?.respostas_personalizadas);
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

        return (
          `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
          `👤 *Cliente:* ${nomeCliente}\n` +
          `✨ *Procedimento:* ${srv.titulo}\n` +
          `📅 *Data:* ${dataFormatada} às *${session.slot}*\n` +
          `💵 *Valor Total:* ${formatarMoeda(precoFinal)}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔒 *CONFIRMAÇÃO DO AGENDAMENTO (SINAL ANTECIPADO)*\n` +
          `Para garantir com exclusividade a sua vaga na agenda da designer, solicitamos um adiantamento de segurança:\n\n` +
          `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
          `_(O restante será pago no dia do seu atendimento)_\n\n` +
          `🔑 *CHAVE PIX:*\n` +
          `\`${chavePix}\`\n` +
          `*Titular:* ${titular}\n\n` +
          `⏳ *Tempo limite:* Seu horário fica reservado por *${tempoLimite} minutos*.\n` +
          `Por favor, responda a esta mensagem enviando a *foto ou comprovante* do PIX para que o robô confirme seu horário automaticamente! ✨`
        );
      }

      session.step = "FINALIZADO";
      sessions.set(telLimpo, session);

      return (
        `🎉 *AGENDAMENTO CONFIRMADO!* ✨\n\n` +
        `Olá, *${nomeCliente}*! Seu horário foi reservado com sucesso no Studio Malu Alves Beauty.\n\n` +
        `• *Procedimento:* ${srv.titulo}\n` +
        `• *Data:* ${dataFormatada} às *${session.slot}*\n` +
        `• *Valor:* ${formatarMoeda(precoFinal)}\n` +
        `📍 *Local:* Studio Malu Alves Beauty\n\n` +
        `✅ _Seu horário já está garantido na agenda da designer! Te mandaremos um lembrete antes do atendimento._\n\n` +
        `Esperamos por você! 🌸`
      );
    }

    return null;
  }

  // =========================================================================
  // AUXILIARES
  // =========================================================================

  private static buscarRespostaCustomizada(textoLower: string, respostas?: RespostaAutomatica[]): RespostaAutomatica | null {
    if (!respostas || !Array.isArray(respostas)) return null;

    for (const r of respostas) {
      if (!r.ativo) continue;

      if (r.opcao_numero && textoLower === r.opcao_numero.trim().toLowerCase()) {
        return r;
      }

      if (r.palavras_chave) {
        const palavras = r.palavras_chave.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
        if (palavras.some((p) => textoLower.includes(p))) {
          return r;
        }
      }

      if (r.titulo && textoLower.includes(r.titulo.toLowerCase())) {
        return r;
      }
    }

    return null;
  }

  private static gerarTextoBoasVindas(config: BarbeariaConfig, customizadas?: RespostaAutomatica[]): string {
    const cumprimento = obterCumprimentoHorario();
    const nomeStudio = config.nome_barbearia || "Studio Malu Alves Beauty";

    let opcoesExtras = "";
    if (customizadas && customizadas.length > 0) {
      opcoesExtras = customizadas
        .filter((c) => c.ativo)
        .map((c, i) => `*${i + 4}* ➔ ${c.titulo}`)
        .join("\n");
      if (opcoesExtras) opcoesExtras = `\n${opcoesExtras}`;
    }

    return (
      `✨ *${cumprimento}! Bem-vinda ao ${nomeStudio}!* ✨\n\n` +
      `Eu sou a assistente virtual do Studio. Como posso te ajudar hoje?\n\n` +
      `*1* ➔ Agendar um Horário\n` +
      `*2* ➔ Ver Nossos Procedimentos e Valores\n` +
      `*3* ➔ Falar com a Equipe${opcoesExtras}\n\n` +
      `_Digite o número da opção desejada:_`
    );
  }

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
