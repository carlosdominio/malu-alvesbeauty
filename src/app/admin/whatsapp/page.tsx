"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Phone,
  Send,
  Bot,
  Power,
  Zap,
  Sparkles,
  Sliders,
  RotateCcw,
  Loader2,
  QrCode,
} from "lucide-react";
import { Servico, ExpedienteDia, HorarioSlot } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { calcularSlotsDisponiveis } from "@/lib/appointmentEngine";
import { formatarMoeda, formatarTelefone } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  time: string;
}

export default function WhatsAppPage() {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [expediente, setExpediente] = useState<ExpedienteDia[]>([]);

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
  const [botStep, setBotStep] = useState<"INICIAL" | "ESCOLHENDO_SERVICO" | "ESCOLHENDO_SLOT" | "DIGITANDO_NOME" | "FINALIZADO">("INICIAL");
  const [servicoEscolhido, setServicoEscolhido] = useState<Servico | null>(null);
  const [slotsCalculados, setSlotsCalculados] = useState<HorarioSlot[]>([]);
  const [slotEscolhido, setSlotEscolhido] = useState<HorarioSlot | null>(null);
  const [dataAlvo] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Carregar dados iniciais
  useEffect(() => {
    async function load() {
      const [srvs, exp] = await Promise.all([
        DataStore.getServicos(),
        DataStore.getExpediente(),
      ]);
      setServicos(srvs.filter((s) => s.ativo));
      setExpediente(exp);
    }
    load();
  }, []);

  // 2. Polling de status real do WhatsApp (tenta direto no Render ou via /api/whatsapp)
  const getBotEndpoint = () => {
    return process.env.NEXT_PUBLIC_WHATSAPP_SERVER_URL || "https://malu-alvesbeauty.onrender.com";
  };

  const checarStatusWhatsApp = useCallback(async () => {
    try {
      // 1ª tentativa: direto no servidor do bot no Render
      let res = await fetch(`${getBotEndpoint()}/status`, { cache: "no-store" }).catch(() => null);
      
      // 2ª tentativa: proxy local /api/whatsapp
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
    const msgBoasVindas =
      `💈 *Olá! Bem-vindo à Barbearia Imperial!*\n\n` +
      `Eu sou o assistente virtual. Como posso te ajudar hoje?\n\n` +
      `Digite *1* para Agendar um Horário\n` +
      `Digite *2* para Ver Nossos Serviços e Preços\n` +
      `Digite *3* para Falar com o Dono`;

    setMensagens([
      {
        id: "msg-1",
        sender: "bot",
        text: msgBoasVindas,
        time: getHoraAtual(),
      },
    ]);
    setBotStep("INICIAL");
    setServicoEscolhido(null);
    setSlotEscolhido(null);
  }, []);

  // Inicializar o chat com mensagem de boas-vindas
  useEffect(() => {
    reiniciarChat();
  }, [reiniciarChat]);

  // Scroll automático no chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

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
        if (lower.includes("1") || lower.includes("agendar") || lower.includes("marcar") || lower.includes("corte") || lower.includes("horário")) {
          respostaBot =
            `✂️ *Escolha o serviço desejado:*\n\n` +
            servicos.map((s, idx) => `*${idx + 1}* - ${s.titulo} (${formatarMoeda(s.preco)} - ${s.duracao_minutos}min)`).join("\n") +
            `\n\n_Digite o número do serviço desejado:_`;
          setBotStep("ESCOLHENDO_SERVICO");
        } else if (lower.includes("2") || lower.includes("preço") || lower.includes("serviço")) {
          respostaBot =
            `📋 *Nossa Tabela de Serviços:*\n\n` +
            servicos.map((s) => `• *${s.titulo}*: ${formatarMoeda(s.preco)} (${s.duracao_minutos} min)`).join("\n") +
            `\n\nDigite *1* para agendar seu horário!`;
        } else {
          respostaBot =
            `💈 *Barbearia Imperial*\n\n` +
            `Para agendar um horário com facilidade, digite *1*.\n` +
            `Para ver nossos preços, digite *2*.`;
        }
      }

      // ESTÁGIO 2: ESCOLHENDO SERVIÇO
      else if (botStep === "ESCOLHENDO_SERVICO") {
        const num = parseInt(textoUsuario, 10);
        if (!isNaN(num) && num >= 1 && num <= servicos.length) {
          const srv = servicos[num - 1];
          setServicoEscolhido(srv);

          // Calcular slots livres reais do banco de dados!
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

      // ESTÁGIO 4: SALVANDO NO BANCO DE DADOS EM TEMPO REAL!
      else if (botStep === "DIGITANDO_NOME" && servicoEscolhido && slotEscolhido) {
        const nomeCliente = textoUsuario;
        const dataHoraInicio = `${dataAlvo}T${slotEscolhido.hora_inicio}:00`;

        // Salvar agendamento real no banco!
        await DataStore.createAgendamento({
          cliente_nome: nomeCliente,
          cliente_telefone: "11988887777",
          servico: servicoEscolhido,
          horario_inicio: dataHoraInicio,
          origem: "WHATSAPP",
        });

        respostaBot =
          `🎉 *AGENDAMENTO CONFIRMADO COM SUCESSO!* 🎉\n\n` +
          `👤 *Cliente:* ${nomeCliente}\n` +
          `💈 *Serviço:* ${servicoEscolhido.titulo}\n` +
          `📅 *Data:* Hoje às *${slotEscolhido.hora_inicio}*\n` +
          `💵 *Valor:* ${formatarMoeda(servicoEscolhido.preco)}\n` +
          `📍 *Local:* Barbearia Imperial\n\n` +
          `✅ _Já inseri seu horário na agenda do barbeiro! Te mandaremos uma mensagem de lembrete 2h antes._\n\n` +
          `Até mais! 👊`;
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
    }, 600);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-zinc-100">WhatsApp da Barbearia</h2>
            <Badge variant="gold" className="flex items-center gap-1 text-[10px]">
              <Zap className="w-3 h-3" />
              Robô Automático
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Conexão direta, QR Code real e simulador de atendimento em tempo real.
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
              loading={carregandoAcao || statusConexao === "CONNECTING"}
              className="flex items-center gap-1.5 text-xs font-bold"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{statusConexao === "CONNECTING" ? "Gerando QR Code..." : "Gerar QR Code Real"}</span>
            </Button>
          )}
        </div>
      </div>

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
                    {telefoneConectado ? formatarTelefone(telefoneConectado) : "Aguardando pareamento"}
                  </p>
                </div>
              </div>

              {statusConexao === "CONNECTED" && (
                <Badge variant="success" className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Conectado
                </Badge>
              )}
              {statusConexao === "CONNECTING" && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Aguardando Leitura
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
                    Seu robô está respondendo aos clientes automaticamente no número pareado.
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

            {/* Info Custo Zero */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2 mt-2">
              <Sparkles className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <p className="text-[11px] leading-relaxed">
                <strong>100% Gratuito:</strong> A conexão roda direta via WebSockets, sem taxas da Meta.
              </p>
            </div>
          </Card>
        </div>

        {/* COLUNA DIREITA: SIMULADOR DE CHAT DO WHATSAPP (7 colunas) */}
        <div className="lg:col-span-7">
          <Card className="border-zinc-800 p-0 overflow-hidden flex flex-col h-[580px] bg-[#0c1317]">
            {/* Header do Chat (Estilo WhatsApp) */}
            <div className="bg-[#1f2c34] px-4 py-3 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-md">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-1.5">
                    <span>Robô Barbearia</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  </h4>
                  <p className="text-[11px] text-zinc-400">Atendente Virtual da Barbearia</p>
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
                placeholder="Digite como se fosse o cliente (ex: 1, Quero cortar, A...)"
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
    </div>
  );
}
