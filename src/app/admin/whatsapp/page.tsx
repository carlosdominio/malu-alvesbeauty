"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Phone,
  Send,
  Bot,
  Power,
  Zap,
  Sliders,
  RotateCcw,
  Loader2,
  QrCode,
  MessageSquare,
  ListPlus,
  Plus,
  Pencil,
  Trash2,
  Check,
  Save,
  HelpCircle,
  FileText,
} from "lucide-react";
import { Servico, ExpedienteDia, HorarioSlot, BarbeariaConfig, RespostaAutomatica } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { calcularSlotsDisponiveis } from "@/lib/appointmentEngine";
import { formatarMoeda, formatarTelefone, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  MENSAGENS_PADRAO,
  RESPOSTAS_PADRAO_EXEMPLOS,
  formatarMensagem,
  gerarTextoBoasVindas,
  formatarListaServicosZap,
  encontrarRespostaCustomizada,
} from "@/lib/whatsappTemplates";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  time: string;
}

export default function WhatsAppPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [expediente, setExpediente] = useState<ExpedienteDia[]>([]);
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);
  const { toastSuccess, toastWarning, toastInfo } = useToast();

  // Sub-abas: Conexão/Simulador, Modelos de Mensagens, Novas Opções Customizadas
  const [subAba, setSubAba] = useState<"CONEXAO" | "MENSAGENS" | "OPCOES">("CONEXAO");

  // Estados Reais da Conexão Baileys
  const [statusConexao, setStatusConexao] = useState<"DISCONNECTED" | "CONNECTING" | "CONNECTED">("DISCONNECTED");
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [telefoneConectado, setTelefoneConectado] = useState<string | null>(null);
  const [carregandoAcao, setCarregandoAcao] = useState(false);

  const [lembrete2hAtivo, setLembrete2hAtivo] = useState(true);
  const [botAtivo, setBotAtivo] = useState(true);

  // Estados do Simulador de Chat em Tempo Real
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [inputMensagem, setInputMensagem] = useState("");
  const [botStep, setBotStep] = useState<"INICIAL" | "ESCOLHENDO_SERVICO" | "ESCOLHENDO_SLOT" | "DIGITANDO_NOME" | "AGUARDANDO_COMPROVANTE" | "FINALIZADO">("INICIAL");
  const [servicoEscolhido, setServicoEscolhido] = useState<Servico | null>(null);
  const [slotsCalculados, setSlotsCalculados] = useState<HorarioSlot[]>([]);
  const [slotEscolhido, setSlotEscolhido] = useState<HorarioSlot | null>(null);
  const [dataAlvo] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // ESTADOS DA ABA: MODELOS DE MENSAGENS
  // =========================================================================
  const [msgBoasVindas, setMsgBoasVindas] = useState("");
  const [msgSolicitacaoSinal, setMsgSolicitacaoSinal] = useState("");
  const [msgConfirmacao, setMsgConfirmacao] = useState("");
  const [msgLembrete, setMsgLembrete] = useState("");
  const [msgAgradecimento, setMsgAgradecimento] = useState("");
  const [msgFalta, setMsgFalta] = useState("");
  const [msgCancelamento, setMsgCancelamento] = useState("");
  const [msgSinalExpirado, setMsgSinalExpirado] = useState("");
  const [msgInatividade, setMsgInatividade] = useState("");
  const [salvandoMensagens, setSalvandoMensagens] = useState(false);
  const [mensagemSalvaSucesso, setMensagemSalvaSucesso] = useState(false);

  // =========================================================================
  // ESTADOS DA ABA: NOVAS OPÇÕES & RESPOSTAS AUTOMÁTICAS
  // =========================================================================
  const [respostasCustom, setRespostasCustom] = useState<RespostaAutomatica[]>([]);
  const [modalOpcaoAberta, setModalOpcaoAberta] = useState(false);
  const [editandoOpcao, setEditandoOpcao] = useState<RespostaAutomatica | null>(null);
  const [opcaoParaExcluir, setOpcaoParaExcluir] = useState<RespostaAutomatica | null>(null);

  // Form de Opção Customizada
  const [formOpcaoNumero, setFormOpcaoNumero] = useState("4");
  const [formOpcaoTitulo, setFormOpcaoTitulo] = useState("");
  const [formOpcaoPalavras, setFormOpcaoPalavras] = useState("");
  const [formOpcaoResposta, setFormOpcaoResposta] = useState("");
  const [formOpcaoAtivo, setFormOpcaoAtivo] = useState(true);

  // 1. Carregar dados iniciais
  useEffect(() => {
    async function load() {
      const [srvs, exp, cfg] = await Promise.all([
        DataStore.getServicos(),
        DataStore.getExpediente(),
        DataStore.getConfig(),
      ]);
      setServicos(srvs.filter((s) => s.ativo));
      setExpediente(exp);
      setConfig(cfg);

      // Inicializa os textos dos templates a partir do config ou padrão
      const zapCfg = cfg.mensagens_zap;
      setMsgBoasVindas(zapCfg?.boas_vindas || MENSAGENS_PADRAO.boas_vindas);
      setMsgSolicitacaoSinal(zapCfg?.solicitacao_sinal || MENSAGENS_PADRAO.solicitacao_sinal);
      setMsgConfirmacao(zapCfg?.confirmacao_agendamento || MENSAGENS_PADRAO.confirmacao_agendamento);
      setMsgLembrete(zapCfg?.lembrete_2h || MENSAGENS_PADRAO.lembrete_2h);
      setMsgAgradecimento(zapCfg?.agradecimento_fidelidade || MENSAGENS_PADRAO.agradecimento_fidelidade);
      setMsgFalta(zapCfg?.falta_comparecimento || MENSAGENS_PADRAO.falta_comparecimento);
      setMsgCancelamento(zapCfg?.cancelamento_studio || MENSAGENS_PADRAO.cancelamento_studio);
      setMsgSinalExpirado(zapCfg?.cancelamento_sinal_expirado || MENSAGENS_PADRAO.cancelamento_sinal_expirado);
      setMsgInatividade(zapCfg?.inatividade_encerramento || MENSAGENS_PADRAO.inatividade_encerramento);

      // Inicializa as respostas customizadas
      setRespostasCustom(zapCfg?.respostas_personalizadas || RESPOSTAS_PADRAO_EXEMPLOS);
    }
    load();
  }, []);

  // 2. Polling de status real do WhatsApp
  const getBotEndpoint = () => {
    return process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL || "https://malu-alvesbeauty.onrender.com";
  };

  const checarStatusWhatsApp = useCallback(async () => {
    try {
      let res = await fetch(`${getBotEndpoint()}/status`, { cache: "no-store" }).catch(() => null);
      if (!res || !res.ok) {
        res = await fetch("/api/whatsapp", { cache: "no-store" }).catch(() => null);
      }
      if (res && res.ok) {
        const data = await res.json();
        setStatusConexao(data.status);
        setQrCodeBase64(data.qrCodeBase64);
        setTelefoneConectado(data.connectedPhone);
      }
    } catch (e) {
      console.error("Erro ao verificar status do WhatsApp:", e);
    }
  }, []);

  useEffect(() => {
    checarStatusWhatsApp();
    const interval = setInterval(checarStatusWhatsApp, 2500);
    return () => clearInterval(interval);
  }, [checarStatusWhatsApp]);

  // Iniciar conexão real (gerar QR Code)
  const handleIniciarConexao = async () => {
    setCarregandoAcao(true);
    try {
      const res = await fetch(`${getBotEndpoint()}/start`, { method: "POST" }).catch(() => null);
      if (!res || !res.ok) {
        await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "START" }),
        });
      }
      await checarStatusWhatsApp();
      toastInfo("Conexão Solicitada 📱", "Iniciando Baileys e gerando QR Code...");
    } catch (err) {
      console.error(err);
    } finally {
      setCarregandoAcao(false);
    }
  };

  // Desconectar WhatsApp
  const handleDesconectar = async () => {
    setCarregandoAcao(true);
    try {
      const res = await fetch(`${getBotEndpoint()}/disconnect`, { method: "POST" }).catch(() => null);
      if (!res || !res.ok) {
        await fetch("/api/whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "DISCONNECT" }),
        });
      }
      await checarStatusWhatsApp();
      toastInfo("WhatsApp Desconectado 🔌", "A conexão com o aparelho foi encerrada com sucesso.");
    } catch (err) {
      console.error(err);
    } finally {
      setCarregandoAcao(false);
    }
  };

  const getHoraAtual = () => {
    const d = new Date();
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const reiniciarChat = useCallback(() => {
    const msgBoasVindasTexto = gerarTextoBoasVindas(config || undefined);
    setMensagens([
      {
        id: "msg-1",
        sender: "bot",
        text: msgBoasVindasTexto,
        time: getHoraAtual(),
      },
    ]);
    setBotStep("INICIAL");
    setServicoEscolhido(null);
    setSlotEscolhido(null);
  }, [config]);

  // Inicializar o chat com mensagem de boas-vindas
  useEffect(() => {
    reiniciarChat();
  }, [reiniciarChat]);

  // Scroll automático no chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  // =========================================================================
  // SALVAR MODELOS DE MENSAGENS
  // =========================================================================
  const handleSalvarModelosMensagens = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvandoMensagens(true);
    try {
      const cfgAtual = await DataStore.getConfig();
      const novoConfig: BarbeariaConfig = {
        ...cfgAtual,
        mensagens_zap: {
          ...(cfgAtual.mensagens_zap || {}),
          boas_vindas: msgBoasVindas,
          solicitacao_sinal: msgSolicitacaoSinal,
          confirmacao_agendamento: msgConfirmacao,
          lembrete_2h: msgLembrete,
          agradecimento_fidelidade: msgAgradecimento,
          falta_comparecimento: msgFalta,
          cancelamento_studio: msgCancelamento,
          cancelamento_sinal_expirado: msgSinalExpirado,
          inatividade_encerramento: msgInatividade,
          respostas_personalizadas: respostasCustom,
        },
      };

      await DataStore.updateConfig(novoConfig);
      setConfig(novoConfig);
      setMensagemSalvaSucesso(true);
      setTimeout(() => setMensagemSalvaSucesso(false), 3000);
      toastSuccess("Modelos de Mensagens Salvos! 💬", "Os novos textos automáticos já estão em vigor no atendimento.");
    } catch (err) {
      console.error("Erro ao salvar mensagens do WhatsApp:", err);
      toastWarning("Erro ao Salvar", "Não foi possível salvar os modelos. Tente novamente.");
    } finally {
      setSalvandoMensagens(false);
    }
  };

  // =========================================================================
  // GERENCIAR OPÇÕES CUSTOMIZADAS
  // =========================================================================
  const abrirModalNovaOpcao = () => {
    setEditandoOpcao(null);
    const proximoNum = respostasCustom.length + 4;
    setFormOpcaoNumero(String(proximoNum));
    setFormOpcaoTitulo("");
    setFormOpcaoPalavras("");
    setFormOpcaoResposta("");
    setFormOpcaoAtivo(true);
    setModalOpcaoAberta(true);
  };

  const abrirModalEditarOpcao = (op: RespostaAutomatica) => {
    setEditandoOpcao(op);
    setFormOpcaoNumero(op.opcao_numero || "4");
    setFormOpcaoTitulo(op.titulo);
    setFormOpcaoPalavras(op.palavras_chave || "");
    setFormOpcaoResposta(op.resposta);
    setFormOpcaoAtivo(op.ativo);
    setModalOpcaoAberta(true);
  };

  const handleSalvarOpcaoCustomizada = async (e: React.FormEvent) => {
    e.preventDefault();
    let listaAtualizada: RespostaAutomatica[];

    if (editandoOpcao) {
      listaAtualizada = respostasCustom.map((item) =>
        item.id === editandoOpcao.id
          ? {
              ...item,
              opcao_numero: formOpcaoNumero.trim(),
              titulo: formOpcaoTitulo.trim(),
              palavras_chave: formOpcaoPalavras.trim(),
              resposta: formOpcaoResposta.trim(),
              ativo: formOpcaoAtivo,
            }
          : item
      );
    } else {
      const nova: RespostaAutomatica = {
        id: `resp-${Date.now()}`,
        opcao_numero: formOpcaoNumero.trim(),
        titulo: formOpcaoTitulo.trim(),
        palavras_chave: formOpcaoPalavras.trim(),
        resposta: formOpcaoResposta.trim(),
        ativo: formOpcaoAtivo,
      };
      listaAtualizada = [...respostasCustom, nova];
    }

    setRespostasCustom(listaAtualizada);
    setModalOpcaoAberta(false);

    // Salvar imediatamente no config
    const cfgAtual = await DataStore.getConfig();
    const novoConfig: BarbeariaConfig = {
      ...cfgAtual,
      mensagens_zap: {
        ...(cfgAtual.mensagens_zap || {}),
        respostas_personalizadas: listaAtualizada,
      },
    };
    await DataStore.updateConfig(novoConfig);
    setConfig(novoConfig);
    toastSuccess(
      editandoOpcao ? "Opção Atualizada! ✏️" : "Nova Opção Criada! ➕",
      `A opção "${formOpcaoTitulo}" foi sincronizada com o robô.`
    );
  };

  const handleToggleAtivoOpcao = async (id: string) => {
    const listaAtualizada = respostasCustom.map((op) =>
      op.id === id ? { ...op, ativo: !op.ativo } : op
    );
    setRespostasCustom(listaAtualizada);

    const cfgAtual = await DataStore.getConfig();
    const novoConfig: BarbeariaConfig = {
      ...cfgAtual,
      mensagens_zap: {
        ...(cfgAtual.mensagens_zap || {}),
        respostas_personalizadas: listaAtualizada,
      },
    };
    await DataStore.updateConfig(novoConfig);
    setConfig(novoConfig);
    toastInfo("Status da Opção Alterado", "A visibilidade da opção no menu foi atualizada.");
  };

  const confirmarExcluirOpcao = async () => {
    if (!opcaoParaExcluir) return;
    const nome = opcaoParaExcluir.titulo;
    const listaAtualizada = respostasCustom.filter((op) => op.id !== opcaoParaExcluir.id);
    setRespostasCustom(listaAtualizada);
    setOpcaoParaExcluir(null);

    const cfgAtual = await DataStore.getConfig();
    const novoConfig: BarbeariaConfig = {
      ...cfgAtual,
      mensagens_zap: {
        ...(cfgAtual.mensagens_zap || {}),
        respostas_personalizadas: listaAtualizada,
      },
    };
    await DataStore.updateConfig(novoConfig);
    setConfig(novoConfig);
    toastWarning("Opção Removida 🗑️", `A opção "${nome}" foi excluída do menu do robô.`);
  };

  // Motor conversacional do Bot do WhatsApp
  const handleEnviarMensagem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMensagem.trim()) return;

    const textoUsuario = inputMensagem.trim();
    setInputMensagem("");

    // Adiciona mensagem do usuário
    const novaMsgUsuario: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textoUsuario,
      time: getHoraAtual(),
    };

    setMensagens((prev) => [...prev, novaMsgUsuario]);

    // Resposta do Robô
    setTimeout(async () => {
      let respostaBot = "";
      const lower = textoUsuario.toLowerCase();

      // ESTÁGIO 1: MENU PRINCIPAL
      if (botStep === "INICIAL") {
        if (lower.includes("1") || lower.includes("agendar") || lower.includes("marcar") || lower.includes("sobrancelha") || lower.includes("horário")) {
          respostaBot =
            `✨ *Escolha o procedimento desejado:*\n\n` +
            formatarListaServicosZap(servicos) +
            `\n\n_Digite o número do procedimento desejado:_`;
          setBotStep("ESCOLHENDO_SERVICO");
        } else if (lower.includes("2") || lower.includes("preço") || lower.includes("serviço") || lower.includes("procedimento")) {
          respostaBot =
            `📋 *Nossa Tabela de Procedimentos:*\n\n` +
            formatarListaServicosZap(servicos) +
            `\n\nDigite *1* para agendar seu horário!`;
        } else if (lower.includes("3") || lower.includes("falar") || lower.includes("equipe") || lower.includes("designer")) {
          respostaBot = `👩‍💼 Um momento! Já notifiquei a designer Malu e ela irá falar com você em instantes.`;
        } else {
          // Verificar se bate com opções customizadas cadastradas pelo ADM
          const respCustom = encontrarRespostaCustomizada(lower, respostasCustom);
          if (respCustom) {
            respostaBot = `${respCustom.resposta}\n\n_Digite *1* para agendar ou *Menu* para voltar às opções._`;
          } else {
            respostaBot = gerarTextoBoasVindas(config || undefined);
          }
        }
      }

      // ESTÁGIO 2: ESCOLHENDO SERVIÇO
      else if (botStep === "ESCOLHENDO_SERVICO") {
        const num = parseInt(textoUsuario, 10);
        if (!isNaN(num) && num >= 1 && num <= servicos.length) {
          const srvBase = servicos[num - 1];
          const precoEfetivo = srvBase.em_promocao && srvBase.preco_promocional ? srvBase.preco_promocional : srvBase.preco;
          const srv = { ...srvBase, preco: precoEfetivo };
          setServicoEscolhido(srv);

          // Calcular slots livres reais do banco de dados
          const [agendamentos, bloqueios] = await Promise.all([
            DataStore.getAgendamentos(dataAlvo),
            DataStore.getBloqueios(),
          ]);

          const resultado = calcularSlotsDisponiveis({
            data: dataAlvo,
            servico: srv,
            expedientes: expediente,
            agendamentosExistentes: agendamentos,
            bloqueios,
          });

          if (resultado.slots.length === 0) {
            respostaBot = `⚠️ Não temos mais horários disponíveis para hoje para *${srv.titulo}*. Gostaria de ver horários para amanhã? Digite *Sim*.`;
          } else {
            setSlotsCalculados(resultado.slots);
            const letras = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
            const listaHorarios = resultado.slots
              .slice(0, 8)
              .map((slot, i) => `*${letras[i]}*) ${slot.hora_inicio}`)
              .join("\n");

            respostaBot =
              `✅ Serviço selecionado: *${srv.titulo}* (${formatarMoeda(srv.preco)})\n\n` +
              `📅 *Horários disponíveis para HOJE:*\n\n${listaHorarios}\n\n` +
              `_Digite a letra do horário desejado (ex: A):_`;
            setBotStep("ESCOLHENDO_SLOT");
          }
        } else {
          respostaBot = `Opção inválida. Digite o número correspondente ao serviço (ex: 1, 2, 3...):`;
        }
      }

      // ESTÁGIO 3: ESCOLHENDO HORÁRIO
      else if (botStep === "ESCOLHENDO_SLOT") {
        const letras = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];
        const index = letras.indexOf(lower);

        if (index >= 0 && index < slotsCalculados.length) {
          const slot = slotsCalculados[index];
          setSlotEscolhido(slot);
          respostaBot =
            `🕒 Horário escolhido: *${slot.hora_inicio}*.\n\n` +
            `Por favor, digite seu *Nome Completo* para confirmarmos na agenda:`;
          setBotStep("DIGITANDO_NOME");
        } else {
          respostaBot = `Letra inválida. Digite a letra correspondente ao horário (ex: A, B, C...):`;
        }
      }

      // ESTÁGIO 4: SALVANDO NO BANCO DE DADOS EM TEMPO REAL
      else if (botStep === "DIGITANDO_NOME" && servicoEscolhido && slotEscolhido) {
        const nomeCliente = textoUsuario;
        const dataHoraInicio = `${dataAlvo}T${slotEscolhido.hora_inicio}:00`;

        const cfg = await DataStore.getConfig();
        const exigeSinal = cfg.exigir_sinal ?? true;
        const valorSinal =
          cfg.tipo_sinal === "FIXO"
            ? cfg.sinal_valor_fixo ?? 20
            : Math.round((servicoEscolhido.preco * (cfg.sinal_porcentagem ?? 30)) / 100);

        // Salvar agendamento real no banco
        await DataStore.createAgendamento({
          cliente_nome: nomeCliente,
          cliente_telefone: "11988887777",
          servico: servicoEscolhido,
          horario_inicio: dataHoraInicio,
          origem: "WHATSAPP",
          status: exigeSinal ? "AGUARDANDO_SINAL" : "CONFIRMADO",
          valor_sinal: exigeSinal ? valorSinal : undefined,
        });

        if (exigeSinal) {
          if (cfg.mensagens_zap?.solicitacao_sinal) {
            respostaBot = formatarMensagem(cfg.mensagens_zap.solicitacao_sinal, {
              cliente: nomeCliente,
              servico: servicoEscolhido.titulo,
              data: "Hoje",
              horario: slotEscolhido.hora_inicio,
              valor_total: formatarMoeda(servicoEscolhido.preco),
              valor_sinal: formatarMoeda(valorSinal),
              valor_restante: formatarMoeda(servicoEscolhido.preco - valorSinal),
              tipo_chave: "Celular",
              chave_pix: cfg.chave_pix || "82981430673",
              titular_pix: cfg.titular_pix || "Luisa Alves dos Santos",
              tempo_limite: cfg.tempo_limite_sinal_minutos || 30,
            });
          } else {
            respostaBot =
              `✨ *PRÉ-RESERVA REALIZADA COM SUCESSO!* ✨\n\n` +
              `👤 *Cliente:* ${nomeCliente}\n` +
              `✨ *Procedimento:* ${servicoEscolhido.titulo}\n` +
              `📅 *Data:* Hoje às *${slotEscolhido.hora_inicio}*\n` +
              `💵 *Valor Total:* ${formatarMoeda(servicoEscolhido.preco)}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🔒 *GARANTIA DO SEU HORÁRIO*\n` +
              `Para confirmar com exclusividade a sua vaga na agenda e evitar cancelamentos, solicitamos um sinal de:\n\n` +
              `💰 *Valor do Sinal:* *${formatarMoeda(valorSinal)}*\n` +
              `_(O restante de ${formatarMoeda(servicoEscolhido.preco - valorSinal)} será pago no dia do atendimento)_\n\n` +
              `🔑 *CHAVE PIX (Celular):*\n` +
              `\`${cfg.chave_pix || "82981430673"}\`\n` +
              `*Titular:* ${cfg.titular_pix || "Luisa Alves dos Santos"}\n\n` +
              `⏳ *Atenção:* Seu horário fica pré-reservado por *${cfg.tempo_limite_sinal_minutos || 30} minutos*.\n` +
              `Por favor, envie o comprovante do PIX respondendo a esta mensagem para confirmarmos seu horário! ✨\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          }
          setBotStep("AGUARDANDO_COMPROVANTE");
        } else {
          if (cfg.mensagens_zap?.confirmacao_agendamento) {
            respostaBot = formatarMensagem(cfg.mensagens_zap.confirmacao_agendamento, {
              cliente: nomeCliente,
              servico: servicoEscolhido.titulo,
              data: "Hoje",
              horario: slotEscolhido.hora_inicio,
              valor_total: formatarMoeda(servicoEscolhido.preco),
            });
          } else {
            respostaBot =
              `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* 🎉\n\n` +
              `👤 *Cliente:* ${nomeCliente}\n` +
              `✨ *Procedimento:* ${servicoEscolhido.titulo}\n` +
              `📅 *Data:* Hoje às *${slotEscolhido.hora_inicio}*\n` +
              `💵 *Valor:* ${formatarMoeda(servicoEscolhido.preco)}\n` +
              `📍 *Local:* Studio Malu Alves Beauty\n\n` +
              `✅ _Já inseri seu horário na agenda da designer! Te mandaremos uma mensagem de lembrete 2h antes._\n\n` +
              `Aguardamos você! ✨`;
          }
          setBotStep("FINALIZADO");
        }
      }

      // ESTÁGIO 5: RECEBIMENTO DO COMPROVANTE
      else if (botStep === "AGUARDANDO_COMPROVANTE") {
        respostaBot =
          `📸 *Comprovante recebido com sucesso!* ✨\n\n` +
          `O seu horário hoje às *${slotEscolhido?.hora_inicio || ""}* está garantido e protegido!\n` +
          `Nossa equipe já está conferindo a transferência e você receberá a confirmação definitiva aqui em instantes.\n\n` +
          `Muito obrigada pela preferência! 🌸`;
        setBotStep("FINALIZADO");
      }

      // FINALIZADO OU REINÍCIO
      else {
        respostaBot = `Se precisar de um novo agendamento, digite *1* para recomeçar.`;
        setBotStep("INICIAL");
      }

      setMensagens((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: respostaBot,
          time: getHoraAtual(),
        },
      ]);
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-zinc-100">WhatsApp do Studio</h2>
            <Badge variant="gold" className="flex items-center gap-1 text-[10px]">
              <Zap className="w-3 h-3" />
              Robô Inteligente
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Conexão direta, personalização de mensagens, respostas automáticas e simulador em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {statusConexao === "CONNECTED" ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDesconectar}
              loading={carregandoAcao}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              <Power className="w-3.5 h-3.5" />
              <span>Desconectar WhatsApp</span>
            </Button>
          ) : (
            <Button
              variant="gold"
              size="sm"
              onClick={handleIniciarConexao}
              loading={carregandoAcao || (statusConexao === "CONNECTING" && !qrCodeBase64)}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>
                {statusConexao === "CONNECTING" && !qrCodeBase64
                  ? "Conectando..."
                  : statusConexao === "CONNECTING"
                  ? "Atualizar QR Code"
                  : "Gerar QR Code Real"}
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Sub-abas de Navegação */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 overflow-x-auto">
        <button
          type="button"
          onClick={() => setSubAba("CONEXAO")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            subAba === "CONEXAO"
              ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
          )}
        >
          <Bot className="w-4 h-4" />
          <span>Robô & Simulador</span>
        </button>

        <button
          type="button"
          onClick={() => setSubAba("MENSAGENS")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            subAba === "MENSAGENS"
              ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
          )}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Editar Mensagens Enviadas</span>
        </button>

        <button
          type="button"
          onClick={() => setSubAba("OPCOES")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            subAba === "OPCOES"
              ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
              : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
          )}
        >
          <ListPlus className="w-4 h-4" />
          <span>Novas Opções & Respostas</span>
          {respostasCustom.length > 0 && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.2 rounded-full font-black",
                subAba === "OPCOES" ? "bg-zinc-950 text-amber-400" : "bg-amber-500/20 text-amber-300"
              )}
            >
              {respostasCustom.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: CONEXÃO E SIMULADOR */}
      {/* ========================================================================= */}
      {subAba === "CONEXAO" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* COLUNA ESQUERDA: STATUS DA CONEXÃO & QR CODE REAL (5 colunas) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Card de Status da Conexão */}
            <Card className="border-zinc-800">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100">Status do WhatsApp</h4>
                    <p className="text-xs text-zinc-400 font-mono">
                      {telefoneConectado
                        ? formatarTelefone(telefoneConectado)
                        : statusConexao === "CONNECTING" && !qrCodeBase64
                        ? "Restabelecendo..."
                        : "Aguardando pareamento"}
                    </p>
                  </div>
                </div>

                {statusConexao === "CONNECTED" && (
                  <Badge variant="success" className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Conectado
                  </Badge>
                )}
                {statusConexao === "CONNECTING" && qrCodeBase64 && (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Aguardando Leitura
                  </Badge>
                )}
                {statusConexao === "CONNECTING" && !qrCodeBase64 && (
                  <Badge variant="warning" className="flex items-center gap-1 bg-amber-500/10 border-amber-500/30 text-amber-300">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                    Reconectando Sessão...
                  </Badge>
                )}
                {statusConexao === "DISCONNECTED" && (
                  <Badge variant="danger">Desconectado</Badge>
                )}
              </div>

              {/* Conteúdo do Card: QR Code REAL gerado pelo Baileys */}
              <div className="pt-4">
                {statusConexao === "CONNECTED" ? (
                  <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h5 className="text-sm font-black text-emerald-400">WhatsApp Conectado com Sucesso!</h5>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Seu robô está respondendo às clientes automaticamente no número pareado. Sessão salva com persistência no banco de dados.
                    </p>
                  </div>
                ) : qrCodeBase64 ? (
                  <div className="text-center p-4 bg-zinc-950 border-2 border-amber-500/40 rounded-2xl space-y-3 shadow-xl">
                    <div className="bg-white p-3 rounded-2xl inline-block mx-auto shadow-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCodeBase64}
                        alt="QR Code Real do WhatsApp"
                        className="w-48 h-48 block mx-auto"
                      />
                    </div>
                    <div>
                      <h5 className="text-sm font-black text-amber-400">Aponte a câmera do WhatsApp agora</h5>
                      <p className="text-xs text-zinc-300 mt-1">
                        No WhatsApp: <strong>Aparelhos Conectados ➔ Conectar Aparelho</strong>
                      </p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        O código atualiza automaticamente se expirar.
                      </p>
                    </div>
                  </div>
                ) : statusConexao === "CONNECTING" ? (
                  <div className="text-center p-6 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-zinc-200">Restabelecendo conexão...</h5>
                      <p className="text-xs text-zinc-400 mt-1">
                        Carregando credenciais salvas no banco de dados e conectando ao WhatsApp...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                      <Power className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-zinc-200">WhatsApp Desconectado</h5>
                      <p className="text-xs text-zinc-400 mt-1">
                        Clique no botão abaixo para gerar o QR Code oficial e conectar seu aparelho.
                      </p>
                    </div>
                    <Button
                      variant="gold"
                      size="md"
                      onClick={handleIniciarConexao}
                      loading={carregandoAcao}
                      className="w-full font-bold text-xs"
                    >
                      Gerar QR Code Agora
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Card de Configuração das Automações */}
            <Card className="border-zinc-800 space-y-3.5">
              <div className="flex items-center gap-2 pb-2 border-b border-zinc-800">
                <Sliders className="w-4 h-4 text-amber-400" />
                <h4 className="text-sm font-bold text-zinc-100">Regras do Robô</h4>
              </div>

              {/* Switch 1: Robô Ativo */}
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-zinc-200 block">Atendimento Automático</span>
                  <span className="text-zinc-400 text-[11px]">Responder novos agendamentos 24/7</span>
                </div>
                <input
                  type="checkbox"
                  checked={botAtivo}
                  onChange={(e) => setBotAtivo(e.target.checked)}
                  className="w-5 h-5 rounded-lg accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Switch 2: Lembretes 2h antes */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-zinc-800/80">
                <div>
                  <span className="font-bold text-zinc-200 block">Lembrete 2h Antes (Anti-Falta)</span>
                  <span className="text-zinc-400 text-[11px]">Pede confirmação de presença no Zap</span>
                </div>
                <input
                  type="checkbox"
                  checked={lembrete2hAtivo}
                  onChange={(e) => setLembrete2hAtivo(e.target.checked)}
                  className="w-5 h-5 rounded-lg accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Atalho para Configurações de Mensagens */}
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs flex items-center justify-between">
                <span className="text-zinc-400 text-[11px]">Personalize os textos do robô:</span>
                <button
                  type="button"
                  onClick={() => setSubAba("MENSAGENS")}
                  className="text-amber-400 hover:text-amber-300 font-bold text-xs underline"
                >
                  Editar Modelos ➔
                </button>
              </div>
            </Card>
          </div>

          {/* COLUNA DIREITA: SIMULADOR DE CHAT DO WHATSAPP (7 colunas) */}
          <div className="lg:col-span-7">
            <Card className="border-zinc-800 p-0 overflow-hidden flex flex-col h-[600px] bg-[#0c1317]">
              {/* Header do Chat (Estilo WhatsApp) */}
              <div className="bg-[#1f2c34] px-4 py-3 flex items-center justify-between border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-md">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                      <span>Atendente Virtual</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </h4>
                    <p className="text-[11px] text-zinc-400">Atendente do Studio Malu Alves Beauty</p>
                  </div>
                </div>

                <button
                  onClick={reiniciarChat}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
                  title="Reiniciar conversa"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar Teste</span>
                </button>
              </div>

              {/* Área de Mensagens */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[radial-gradient(#1f2c34_1px,transparent_1px)] [background-size:16px_16px]">
                <div className="text-center my-2">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 bg-[#182229] px-3 py-1 rounded-full border border-zinc-800">
                    Teste o Atendimento em Tempo Real
                  </span>
                </div>

                {mensagens.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"} animate-in fade-in duration-150`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-md ${
                        msg.sender === "user"
                          ? "bg-[#005c4b] text-zinc-100 rounded-tr-none"
                          : "bg-[#202c33] text-zinc-100 rounded-tl-none border border-zinc-750"
                      }`}
                    >
                      <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <span className="text-[10px] text-zinc-400 mt-1 block text-right">
                        {msg.time}
                      </span>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input de Envio */}
              <form
                onSubmit={handleEnviarMensagem}
                className="bg-[#1f2c34] p-3 border-t border-zinc-800 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputMensagem}
                  onChange={(e) => setInputMensagem(e.target.value)}
                  placeholder="Digite como se fosse a cliente (ex: 1, 2, 4, A...)"
                  className="flex-1 bg-[#2a3942] border border-zinc-700/60 rounded-xl px-4 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  className="w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 flex items-center justify-center transition-transform active:scale-95 shrink-0 shadow-md shadow-amber-500/20"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: EDITAR MODELOS DE MENSAGENS ENVIADAS */}
      {/* ========================================================================= */}
      {subAba === "MENSAGENS" && (
        <form onSubmit={handleSalvarModelosMensagens} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span>Textos e Mensagens Automáticas</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Personalize as mensagens que o robô do Studio envia para as clientes no WhatsApp.
              </p>
            </div>

            <Button
              type="submit"
              variant="gold"
              size="sm"
              loading={salvandoMensagens}
              className="flex items-center gap-1.5 text-xs font-bold shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>{mensagemSalvaSucesso ? "Salvo com Sucesso!" : "Salvar Alterações"}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 1. MENSAGEM DE BOAS-VINDAS / MENU INICIAL */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">1. Boas-Vindas & Menu Inicial</h4>
                  <p className="text-[11px] text-zinc-400">Primeira resposta enviada quando a cliente manda mensagem</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgBoasVindas(MENSAGENS_PADRAO.boas_vindas)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgBoasVindas}
                onChange={(e) => setMsgBoasVindas(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis automáticas: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{opcoes_personalizadas}"}</code>
              </p>
            </div>

            {/* 2. SOLICITAÇÃO DE SINAL ANTECIPADO (PIX ANTI-FALTA) */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-amber-500/30 space-y-2.5 shadow-sm shadow-amber-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-amber-300">2. Cobrança de Sinal PIX (Anti-Falta)</h4>
                  <p className="text-[11px] text-zinc-400">Enviada ao reservar para solicitar o adiantamento de segurança</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgSolicitacaoSinal(MENSAGENS_PADRAO.solicitacao_sinal)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgSolicitacaoSinal}
                onChange={(e) => setMsgSolicitacaoSinal(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{servico}"}</code>, <code className="text-amber-400">{"{data}"}</code>, <code className="text-amber-400">{"{horario}"}</code>, <code className="text-amber-400">{"{valor_total}"}</code>, <code className="text-amber-400">{"{valor_sinal}"}</code>, <code className="text-amber-400">{"{chave_pix}"}</code>, <code className="text-amber-400">{"{titular_pix}"}</code>
              </p>
            </div>

            {/* 3. CONFIRMAÇÃO DE AGENDAMENTO DEFINITIVO */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">3. Confirmação de Agendamento</h4>
                  <p className="text-[11px] text-zinc-400">Enviada após aprovação do PIX ou quando agendado diretamente</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgConfirmacao(MENSAGENS_PADRAO.confirmacao_agendamento)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgConfirmacao}
                onChange={(e) => setMsgConfirmacao(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{servico}"}</code>, <code className="text-amber-400">{"{data}"}</code>, <code className="text-amber-400">{"{horario}"}</code>, <code className="text-amber-400">{"{valor_total}"}</code>
              </p>
            </div>

            {/* 4. LEMBRETE 2H ANTES (ANTI-FALTA) */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">4. Lembrete de Horário (2h Antes)</h4>
                  <p className="text-[11px] text-zinc-400">Enviada 2 horas antes do atendimento pedindo confirmação</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgLembrete(MENSAGENS_PADRAO.lembrete_2h)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgLembrete}
                onChange={(e) => setMsgLembrete(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{servico}"}</code>, <code className="text-amber-400">{"{horario}"}</code>
              </p>
            </div>

            {/* 5. AGRADECIMENTO & CARTÃO FIDELIDADE */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">5. Conclusão & Cartão Fidelidade</h4>
                  <p className="text-[11px] text-zinc-400">Enviada ao marcar o atendimento como CONCLUÍDO na agenda</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgAgradecimento(MENSAGENS_PADRAO.agradecimento_fidelidade)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgAgradecimento}
                onChange={(e) => setMsgAgradecimento(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{visitas}"}</code>
              </p>
            </div>

            {/* 6. AVISO DE FALTA & REMARCAÇÃO */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">6. Notificação de Falta / Remarcar</h4>
                  <p className="text-[11px] text-zinc-400">Enviada ao registrar FALTOU no atendimento</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgFalta(MENSAGENS_PADRAO.falta_comparecimento)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={6}
                value={msgFalta}
                onChange={(e) => setMsgFalta(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{servico}"}</code>, <code className="text-amber-400">{"{horario}"}</code>
              </p>
            </div>

            {/* 7. CANCELAMENTO PELO STUDIO */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">7. Cancelamento pelo Studio / Desmarcação</h4>
                  <p className="text-[11px] text-zinc-400">Enviada quando você precisa cancelar um agendamento da cliente</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgCancelamento(MENSAGENS_PADRAO.cancelamento_studio)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={4}
                value={msgCancelamento}
                onChange={(e) => setMsgCancelamento(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{data}"}</code>, <code className="text-amber-400">{"{horario}"}</code>
              </p>
            </div>

            {/* 8. LIBERAÇÃO DE VAGA POR SINAL EXPIRADO */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">8. Liberação de Vaga por Sinal Expirado (com Menu de Recuperação)</h4>
                  <p className="text-[11px] text-zinc-400">Enviada quando a pré-reserva expira sem o envio do comprovante PIX, oferecendo opções interativas</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgSinalExpirado(MENSAGENS_PADRAO.cancelamento_sinal_expirado)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={7}
                value={msgSinalExpirado}
                onChange={(e) => setMsgSinalExpirado(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>, <code className="text-amber-400">{"{servico}"}</code>, <code className="text-amber-400">{"{data}"}</code>, <code className="text-amber-400">{"{horario}"}</code>, <code className="text-amber-400">{"{valor_sinal}"}</code>
              </p>
            </div>

            {/* 9. ENCERRAMENTO POR INATIVIDADE */}
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">9. Encerramento Educado por Inatividade</h4>
                  <p className="text-[11px] text-zinc-400">Enviada quando o cliente para de responder no meio de uma escolha de procedimento/horário</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMsgInatividade(MENSAGENS_PADRAO.inatividade_encerramento)}
                  className="text-[11px] text-zinc-400 hover:text-amber-400 underline font-semibold"
                >
                  Restaurar Padrão
                </button>
              </div>

              <textarea
                rows={4}
                value={msgInatividade}
                onChange={(e) => setMsgInatividade(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono leading-relaxed focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-zinc-500">
                Variáveis: <code className="text-amber-400">{"{cliente}"}</code>
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="gold"
              size="lg"
              loading={salvandoMensagens}
              className="font-bold text-xs shadow-lg shadow-amber-500/20"
            >
              <Save className="w-4 h-4 mr-2" />
              <span>{mensagemSalvaSucesso ? "Mensagens Salvas com Sucesso!" : "Salvar Todas as Mensagens"}</span>
            </Button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: NOVAS OPÇÕES & RESPOSTAS AUTOMÁTICAS */}
      {/* ========================================================================= */}
      {subAba === "OPCOES" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800">
            <div>
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <ListPlus className="w-4 h-4 text-amber-400" />
                <span>Opções Adicionais com Resposta Automática</span>
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Crie novas opções no menu do robô (ex: Endereço, Formas de Pagamento, Cuidados) com respostas instantâneas.
              </p>
            </div>

            <Button
              variant="gold"
              size="sm"
              onClick={abrirModalNovaOpcao}
              className="flex items-center gap-1.5 text-xs font-bold shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Opção</span>
            </Button>
          </div>

          {/* Dica explicativa */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-start gap-2.5">
            <HelpCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Como funciona:</strong> As opções ativas abaixo são inseridas automaticamente no menu de boas-vindas do seu WhatsApp. Se a cliente digitar o número correspondente ou qualquer uma das palavras-chave configuradas, o robô enviará a resposta instantaneamente!
            </p>
          </div>

          {/* Lista de Opções Customizadas */}
          {respostasCustom.length === 0 ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2">
              <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
              <h4 className="text-sm font-bold text-zinc-300">Nenhuma opção personalizada cadastrada</h4>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Clique no botão acima para adicionar sua primeira opção com resposta automática (ex: Endereço do Studio, Cuidados, etc.).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {respostasCustom.map((op, idx) => (
                <div
                  key={op.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3",
                    op.ativo ? "bg-zinc-900 border-zinc-800" : "bg-zinc-900/40 border-zinc-800/40 opacity-60"
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-amber-500 text-zinc-950 font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                          {op.opcao_numero || idx + 4}
                        </span>
                        <h4 className="font-bold text-sm text-zinc-100">{op.titulo}</h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleAtivoOpcao(op.id)}
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1",
                          op.ativo
                            ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                            : "text-zinc-400 bg-zinc-800 border-zinc-700"
                        )}
                      >
                        {op.ativo ? <Check className="w-3 h-3" /> : null}
                        <span>{op.ativo ? "Ativa no Robô" : "Inativa"}</span>
                      </button>
                    </div>

                    {op.palavras_chave && (
                      <p className="text-[11px] text-zinc-400">
                        <span className="text-zinc-500 font-semibold">Gatilhos / Palavras: </span>
                        <span className="font-mono text-amber-400/90">{op.palavras_chave}</span>
                      </p>
                    )}

                    <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {op.resposta}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => abrirModalEditarOpcao(op)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Editar Opção"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpcaoParaExcluir(op)}
                      className="p-1.5 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Excluir Opção"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CRIAR / EDITAR OPÇÃO CUSTOMIZADA */}
      {/* ========================================================================= */}
      <Modal
        isOpen={modalOpcaoAberta}
        onClose={() => setModalOpcaoAberta(false)}
        title={editandoOpcao ? "Editar Opção do Robô" : "Nova Opção com Resposta Automática"}
        description="Configure o número, título do menu e a mensagem que o robô irá enviar."
        icon={<ListPlus className="w-5 h-5 text-amber-400" />}
      >
        <form onSubmit={handleSalvarOpcaoCustomizada} className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-bold text-zinc-300 block mb-1">Nº Opção</label>
              <input
                type="text"
                required
                value={formOpcaoNumero}
                onChange={(e) => setFormOpcaoNumero(e.target.value)}
                placeholder="4"
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 font-black text-center focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="col-span-3">
              <label className="text-xs font-bold text-zinc-300 block mb-1">Título da Opção (no Menu)</label>
              <input
                type="text"
                required
                value={formOpcaoTitulo}
                onChange={(e) => setFormOpcaoTitulo(e.target.value)}
                placeholder="Ex: Localização / Endereço do Studio"
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">
              Palavras-chave Adicionais (separadas por vírgula)
            </label>
            <input
              type="text"
              value={formOpcaoPalavras}
              onChange={(e) => setFormOpcaoPalavras(e.target.value)}
              placeholder="Ex: endereco, onde fica, mapa, rua, local"
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Se a cliente digitar qualquer uma dessas palavras, o robô responderá com esta mensagem.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Texto da Resposta Automática</label>
            <textarea
              rows={5}
              required
              value={formOpcaoResposta}
              onChange={(e) => setFormOpcaoResposta(e.target.value)}
              placeholder="Ex: 📍 Nosso Studio fica localizado na Rua Principal, nº 123 - Centro..."
              className="w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 leading-relaxed font-mono"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="opcaoAtivoCheckbox"
              checked={formOpcaoAtivo}
              onChange={(e) => setFormOpcaoAtivo(e.target.checked)}
              className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
            />
            <label htmlFor="opcaoAtivoCheckbox" className="text-xs font-semibold text-zinc-300 cursor-pointer">
              Ativar esta opção imediatamente no menu do robô
            </label>
          </div>

          <Button type="submit" variant="gold" size="lg" className="w-full font-bold">
            Salvar Opção
          </Button>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: EXCLUSÃO DE OPÇÃO CUSTOMIZADA */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!opcaoParaExcluir}
        onClose={() => setOpcaoParaExcluir(null)}
        title="Excluir Opção do Robô?"
        description="Esta opção será removida do menu automático do WhatsApp."
        icon={<Trash2 className="w-5 h-5 text-red-400" />}
        maxWidth="sm"
      >
        {opcaoParaExcluir && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
              <strong className="text-zinc-200 block mb-1">
                Opção {opcaoParaExcluir.opcao_numero}: {opcaoParaExcluir.titulo}
              </strong>
              <p className="text-zinc-400 line-clamp-2">{opcaoParaExcluir.resposta}</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setOpcaoParaExcluir(null)}
                className="flex-1 text-zinc-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={confirmarExcluirOpcao}
                className="flex-1 font-bold shadow-lg shadow-red-500/20"
              >
                Sim, Excluir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
