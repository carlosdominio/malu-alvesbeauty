"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar as CalendarIcon,
  Plus,
  Ban,
  CheckCircle,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Zap,
  Users,
  Award,
  Clock,
  CheckCheck,
  XCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Agendamento, BarbeariaConfig, Cliente, FormaPagamento, Servico, StatusAgendamento } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { formatarMoeda, formatarTelefone, cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

type FiltroAba = "AGUARDANDO_SINAL" | "PENDENTES" | "CONCLUIDOS" | "TODOS" | "CANCELADOS";

export default function AgendaPage() {
  const [dataFiltro, setDataFiltro] = useState<string>("");
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Aba de Filtro da Agenda (Padrão: AGUARDANDO_SINAL para foco imediato nas pré-reservas)
  const [abaAtiva, setAbaAtiva] = useState<FiltroAba>("AGUARDANDO_SINAL");

  const { toastSuccess, toastWarning, toastInfo } = useToast();

  // Modais
  const [modalBloqueioAberto, setModalBloqueioAberto] = useState(false);
  const [modalNovoAgendamentoAberto, setModalNovoAgendamentoAberto] = useState(false);
  const [modalConcluirAberto, setModalConcluirAberto] = useState(false);
  const [agendamentoParaConcluir, setAgendamentoParaConcluir] = useState<Agendamento | null>(null);
  const [formaPagamentoSelecionada, setFormaPagamentoSelecionada] = useState<FormaPagamento>("PIX");
  const [confirmarStatusModal, setConfirmarStatusModal] = useState<{
    aberto: boolean;
    agendamento: Agendamento | null;
    novoStatus: "CANCELADO" | "FALTOU" | null;
  }>({ aberto: false, agendamento: null, novoStatus: null });

  // Form de Bloqueio
  const [bloqueioMotivo, setBloqueioMotivo] = useState("Pausa / Almoço");
  const [bloqueioInicio, setBloqueioInicio] = useState("12:00");
  const [bloqueioFim, setBloqueioFim] = useState("13:00");

  // Form de Novo Agendamento Manual
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoServicoId, setNovoServicoId] = useState("");
  const [novoHorario, setNovoHorario] = useState("10:00");

  // Data de Hoje
  const hoje = new Date();
  const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const ehHoje = dataFiltro === hojeStr;

  // Carregar agendamentos e clientes da API em tempo real
  const carregarDados = useCallback(async (silencioso = false) => {
    if (!dataFiltro) return;
    if (!silencioso) setLoading(true);
    try {
      const [resAg, resCli, srvs, cfg] = await Promise.all([
        fetch(`/api/agendamentos?data=${dataFiltro}`, { cache: "no-store" }),
        fetch(`/api/clientes`, { cache: "no-store" }),
        DataStore.getServicos(),
        DataStore.getConfig(),
      ]);

      if (resAg.ok) {
        const ags = await resAg.json();
        setAgendamentos(ags);
      }
      if (resCli.ok) {
        const clis = await resCli.json();
        setClientes(clis);
      }
      setServicos(srvs.filter((s) => s.ativo));
      setConfig(cfg);
      if (srvs.length > 0 && !novoServicoId) {
        setNovoServicoId(srvs[0].id);
      }
    } catch (err) {
      console.error("Erro ao carregar dados da API:", err);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, [dataFiltro, novoServicoId]);

  useEffect(() => {
    setDataFiltro(hojeStr);
  }, [hojeStr]);

  // Polling em tempo real a cada 2 segundos
  useEffect(() => {
    carregarDados();
    const interval = setInterval(() => {
      carregarDados(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [carregarDados]);

  // Handlers de Mudança de Data
  const mudarDia = (delta: number) => {
    const [ano, mes, dia] = dataFiltro.split("-").map(Number);
    const data = new Date(ano, mes - 1, dia);
    data.setDate(data.getDate() + delta);
    const novaDataStr = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
    setDataFiltro(novaDataStr);
  };

  // Handler de Status
  const handleStatusChange = async (
    id: string,
    novoStatus: StatusAgendamento,
    forma?: FormaPagamento
  ) => {
    // Atualização otimista imediata na interface
    setAgendamentos((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: novoStatus, forma_pagamento: forma || a.forma_pagamento } : a
      )
    );

    const ag = agendamentos.find((a) => a.id === id);

    try {
      await fetch("/api/agendamentos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: novoStatus, forma_pagamento: forma }),
      });
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
    }

    carregarDados(true);

    if (ag) {
      const telLimpo = ag.cliente_telefone.replace(/\D/g, "");
      const clienteCadastrado = clientes.find((c) => c.telefone.replace(/\D/g, "") === telLimpo);
      const totalVisitas = (clienteCadastrado?.total_visitas || 0) + (novoStatus === "CONCLUIDO" ? 1 : 0);

      // Disparar notificações automáticas para o WhatsApp do cliente
      if (novoStatus === "CONCLUIDO") {
        fetch("/api/whatsapp/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "CONCLUIDO",
            telefone: ag.cliente_telefone,
            nome: ag.cliente_nome,
            totalVisitas,
          }),
        }).catch(console.error);
      } else if (novoStatus === "CANCELADO") {
        fetch("/api/whatsapp/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "CANCELADO",
            telefone: ag.cliente_telefone,
            nome: ag.cliente_nome,
            dataHora: ag.horario_inicio,
          }),
        }).catch(console.error);

        toastWarning(
          "Agendamento Cancelado",
          `Cliente ${ag.cliente_nome} notificado no WhatsApp com opção para remarcar.`
        );
      } else if (novoStatus === "FALTOU") {
        fetch("/api/whatsapp/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "FALTOU",
            telefone: ag.cliente_telefone,
            nome: ag.cliente_nome,
            servicoTitulo: ag.servico_titulo,
            dataHora: ag.horario_inicio,
          }),
        }).catch(console.error);

        toastInfo(
          "Cliente Faltou",
          `Mensagem amigável de remarcação enviada no WhatsApp de ${ag.cliente_nome}.`
        );
      } else if (novoStatus === "CONFIRMADO") {
        toastSuccess(
          "Agendamento Reaberto",
          `Agendamento de ${ag.cliente_nome} retornado para a fila de atendimento.`
        );
      }
    }
  };

  // Abrir Modal de Conclusão com Forma de Pagamento
  const abrirModalConcluir = (ag: Agendamento) => {
    setAgendamentoParaConcluir(ag);
    setFormaPagamentoSelecionada(ag.forma_pagamento || "PIX");
    setModalConcluirAberto(true);
  };

  const confirmarConclusao = async () => {
    if (!agendamentoParaConcluir) return;
    await handleStatusChange(agendamentoParaConcluir.id, "CONCLUIDO", formaPagamentoSelecionada);
    toastSuccess(
      "Atendimento Concluído!",
      `Mensagem de agradecimento com pontos de fidelidade enviada no Zap de ${agendamentoParaConcluir.cliente_nome}.`
    );
    setModalConcluirAberto(false);
    setAgendamentoParaConcluir(null);
  };

  // Handler de Criar Bloqueio
  const handleSalvarBloqueio = async (e: React.FormEvent) => {
    e.preventDefault();
    await DataStore.addBloqueio({
      data_inicio: `${dataFiltro}T${bloqueioInicio}:00`,
      data_fim: `${dataFiltro}T${bloqueioFim}:00`,
      motivo: bloqueioMotivo,
    });
    toastSuccess("Horário Bloqueado!", `Bloqueio (${bloqueioInicio} às ${bloqueioFim}) salvo.`);
    setModalBloqueioAberto(false);
    carregarDados();
  };

  // Handler de Novo Agendamento Manual
  const handleCriarAgendamentoManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const servico = servicos.find((s) => s.id === novoServicoId);
    if (!servico) return;

    await fetch("/api/agendamentos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_nome: novoNome,
        cliente_telefone: novoTelefone,
        servico,
        horario_inicio: `${dataFiltro}T${novoHorario}:00`,
        origem: "MANUAL",
      }),
    });

    toastSuccess("Agendamento Criado!", `${novoNome} agendado para às ${novoHorario}.`);
    setNovoNome("");
    setNovoTelefone("");
    setModalNovoAgendamentoAberto(false);
    carregarDados();
  };

  // Métricas de contagem por status
  const limiteMaximo = config?.limite_maximo_agendamentos_dia || 15;
  const agendamentosAguardandoSinal = agendamentos.filter((a) => a.status === "AGUARDANDO_SINAL");
  const agendamentosPendentes = agendamentos.filter((a) => a.status === "CONFIRMADO");
  const agendamentosConcluidos = agendamentos.filter((a) => a.status === "CONCLUIDO");
  const agendamentosCancelados = agendamentos.filter((a) => a.status === "CANCELADO" || a.status === "FALTOU");

  const totalAgendados = agendamentos.filter((a) => a.status !== "CANCELADO").length;
  const faturamentoHoje = agendamentosConcluidos.reduce((acc, a) => acc + a.valor_cobrado, 0);
  const diaLotado = totalAgendados >= limiteMaximo;

  // Filtragem dos agendamentos a serem exibidos de acordo com a aba selecionada
  const agendamentosFiltrados = agendamentos.filter((ag) => {
    if (abaAtiva === "AGUARDANDO_SINAL") return ag.status === "AGUARDANDO_SINAL";
    if (abaAtiva === "PENDENTES") return ag.status === "CONFIRMADO";
    if (abaAtiva === "CONCLUIDOS") return ag.status === "CONCLUIDO";
    if (abaAtiva === "CANCELADOS") return ag.status === "CANCELADO" || ag.status === "FALTOU";
    return true; // "TODOS"
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-zinc-100">Agenda do Dia</h2>
            <Badge variant="success" className="text-[10px] flex items-center gap-1 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Tempo Real Ativo
            </Badge>
            {diaLotado && (
              <Badge variant="danger" className="text-[10px] font-bold">
                ⚠️ Lotação Máxima Atingida
              </Badge>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Gerencie sua fila de atendimento, conclua atendimentos e acompanhe em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setModalBloqueioAberto(true)}
            className="flex items-center gap-1.5 text-xs text-amber-400 border-amber-500/30"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Bloquear Horário</span>
          </Button>

          <Button
            variant="gold"
            size="sm"
            onClick={() => setModalNovoAgendamentoAberto(true)}
            className="flex items-center gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Agendamento</span>
          </Button>
        </div>
      </div>

      {/* Seletor de Data & Mini Cards de Resumo */}
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          ehHoje ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
        )}
      >
        {/* Controle da Data */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
          <button
            onClick={() => mudarDia(-1)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <input
              type="date"
              value={dataFiltro}
              onChange={(e) => setDataFiltro(e.target.value)}
              className="bg-transparent text-zinc-100 font-bold text-sm text-center focus:outline-none cursor-pointer"
            />
            <p className="text-[11px] text-amber-400 font-semibold mt-0.5">
              {new Date(`${dataFiltro}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })}
            </p>
          </div>

          <button
            onClick={() => mudarDia(1)}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Capacidade do Dia */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-center">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-zinc-400 flex items-center gap-1 font-semibold">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              Lotação do Dia:
            </span>
            <span className={cn("font-black", diaLotado ? "text-red-400" : "text-zinc-200")}>
              {totalAgendados} / {limiteMaximo} atendimentos
            </span>
          </div>
          <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
            <div
              className={cn(
                "h-full transition-all duration-300 rounded-full",
                diaLotado ? "bg-red-500" : totalAgendados / limiteMaximo > 0.7 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${Math.min((totalAgendados / limiteMaximo) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Resumo Financeiro do Dia */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-around">
          <div className="text-center">
            <span className="text-xl font-black text-emerald-400">{agendamentosConcluidos.length}</span>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Atendidos</p>
          </div>
          <div className="h-8 w-px bg-zinc-800" />
          <div className="text-center">
            <span className="text-xl font-black text-amber-400">{formatarMoeda(faturamentoHoje)}</span>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Faturado</p>
          </div>
        </div>

        {/* Botão Voltar para Hoje - Oculto quando já estiver em Hoje */}
        {!ehHoje && (
          <div className="flex items-center">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setDataFiltro(hojeStr)}
              className="w-full text-xs font-bold h-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            >
              📅 Voltar para Hoje
            </Button>
          </div>
        )}
      </div>

      {/* Banner de Aviso de Comprovantes / Sinais Pendentes */}
      {agendamentosAguardandoSinal.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">💰</span>
            <div>
              <p className="text-xs font-extrabold text-amber-300">
                {agendamentosAguardandoSinal.length === 1
                  ? "1 agendamento aguardando confirmação do sinal PIX"
                  : `${agendamentosAguardandoSinal.length} agendamentos aguardando confirmação do sinal PIX`}
              </p>
              <p className="text-[11px] text-zinc-400">
                Confira o comprovante no WhatsApp e aprove com 1 clique para confirmar a vaga na agenda.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="gold"
            onClick={() => setAbaAtiva("AGUARDANDO_SINAL")}
            className="text-xs font-bold shrink-0"
          >
            Ver Pendentes
          </Button>
        </div>
      )}

      {/* ABAS DE FILTRAGEM INTELIGENTE (Fila Limpa de Atendimento) */}
      <div className="flex items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
        {/* Aba Aguardando Sinal */}
        <button
          onClick={() => setAbaAtiva("AGUARDANDO_SINAL")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            abaAtiva === "AGUARDANDO_SINAL"
              ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/25"
              : agendamentosAguardandoSinal.length > 0
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Aguardando Sinal</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-black",
              abaAtiva === "AGUARDANDO_SINAL"
                ? "bg-zinc-950 text-amber-400"
                : agendamentosAguardandoSinal.length > 0
                ? "bg-amber-500 text-zinc-950 animate-pulse"
                : "bg-zinc-800 text-zinc-300"
            )}
          >
            {agendamentosAguardandoSinal.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("PENDENTES")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            abaAtiva === "PENDENTES"
              ? "bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          )}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Fila / Confirmados</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-black",
              abaAtiva === "PENDENTES" ? "bg-zinc-950 text-amber-400" : "bg-zinc-800 text-zinc-300"
            )}
          >
            {agendamentosPendentes.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("CONCLUIDOS")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            abaAtiva === "CONCLUIDOS"
              ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          )}
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span>Concluídos Hoje</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-black",
              abaAtiva === "CONCLUIDOS" ? "bg-zinc-950 text-emerald-400" : "bg-zinc-800 text-zinc-300"
            )}
          >
            {agendamentosConcluidos.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("TODOS")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            abaAtiva === "TODOS"
              ? "bg-zinc-100 text-zinc-950 shadow-md"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span>Todos do Dia</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-black",
              abaAtiva === "TODOS" ? "bg-zinc-950 text-zinc-100" : "bg-zinc-800 text-zinc-300"
            )}
          >
            {agendamentos.length}
          </span>
        </button>

        <button
          onClick={() => setAbaAtiva("CANCELADOS")}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
            abaAtiva === "CANCELADOS"
              ? "bg-red-500 text-zinc-950 shadow-md shadow-red-500/20"
              : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
          )}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Cancelados / Faltas</span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded-md text-[10px] font-black",
              abaAtiva === "CANCELADOS" ? "bg-zinc-950 text-red-400" : "bg-zinc-800 text-zinc-300"
            )}
          >
            {agendamentosCancelados.length}
          </span>
        </button>
      </div>

      {/* Lista / Timeline de Agendamentos */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 text-sm">Carregando agendamentos...</div>
        ) : agendamentosFiltrados.length === 0 ? (
          <div className="p-12 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 text-center space-y-2">
            <CalendarIcon className="w-10 h-10 text-zinc-600 mx-auto stroke-1" />
            <h4 className="text-base font-bold text-zinc-300">
              {abaAtiva === "AGUARDANDO_SINAL"
                ? "Nenhum agendamento aguardando sinal no momento"
                : abaAtiva === "PENDENTES"
                ? "Nenhum cliente aguardando na fila"
                : abaAtiva === "CONCLUIDOS"
                ? "Nenhum atendimento concluído ainda hoje"
                : abaAtiva === "CANCELADOS"
                ? "Nenhum cancelamento para esta data"
                : "Nenhum agendamento para este dia"}
            </h4>
            <p className="text-xs text-zinc-500">
              {abaAtiva === "AGUARDANDO_SINAL"
                ? "Todos os sinais foram aprovados e não há pagamentos pendentes."
                : abaAtiva === "PENDENTES"
                ? "Sua fila de espera está livre. Novos agendamentos no Zap aparecerão aqui em tempo real."
                : "Selecione outra aba para visualizar."}
            </p>
          </div>
        ) : (
          agendamentosFiltrados.map((ag) => {
            const horaInicio = ag.horario_inicio.split("T")[1]?.slice(0, 5) || "--:--";
            const horaFim = ag.horario_fim.split("T")[1]?.slice(0, 5) || "--:--";

            // Buscar histórico do cliente para selo de fidelidade
            const telLimpo = ag.cliente_telefone.replace(/\D/g, "");
            const clienteCadastrado = clientes.find((c) => c.telefone.replace(/\D/g, "") === telLimpo);
            const totalVisitas = clienteCadastrado?.total_visitas || 0;
            const clienteFiel = totalVisitas >= 3;
            const mereceDesconto = totalVisitas > 0 && totalVisitas % 5 === 0;

            return (
              <div
                key={ag.id}
                className={cn(
                  "p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4",
                  ag.status === "CONCLUIDO"
                    ? "bg-zinc-900/40 border-zinc-800/60 opacity-80"
                    : ag.status === "CANCELADO"
                    ? "bg-red-950/10 border-red-900/30 opacity-60"
                    : ag.status === "FALTOU"
                    ? "bg-amber-950/10 border-amber-900/30 opacity-70"
                    : "bg-zinc-900 border-zinc-800 shadow-md"
                )}
              >
                {/* Horário & Info do Cliente */}
                <div className="flex items-start gap-4">
                  {/* Badge de Horário */}
                  <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-zinc-950 border border-zinc-800 shrink-0">
                    <span className="text-sm font-black text-amber-400">{horaInicio}</span>
                    <span className="text-[10px] text-zinc-500">{horaFim}</span>
                  </div>

                  {/* Detalhes */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-zinc-100 text-base">{ag.cliente_nome}</h4>

                      {/* Selo de Fidelidade & Desconto Permanente */}
                      {mereceDesconto && (
                        <Badge variant="gold" className="text-[10px] flex items-center gap-1 font-bold animate-pulse">
                          <Award className="w-3 h-3 text-amber-400" />
                          🎯 5º Atendimento (Desconto Fidelidade!)
                        </Badge>
                      )}
                      {!mereceDesconto && clienteFiel && (
                        <Badge variant="gold" className="text-[10px] flex items-center gap-1 font-semibold">
                          ⭐ Cliente Fiel ({totalVisitas} atendimentos)
                        </Badge>
                      )}

                      {ag.origem === "WHATSAPP" && (
                        <Badge variant="gold" className="text-[10px] flex items-center gap-1 font-bold">
                          <Zap className="w-2.5 h-2.5" />
                          Via WhatsApp
                        </Badge>
                      )}
                      {ag.status === "AGUARDANDO_SINAL" &&
                        (ag.comprovante_recebido ? (
                          <Badge
                            variant="success"
                            className="text-[10px] flex items-center gap-1 font-bold animate-pulse bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          >
                            📸 Comprovante Enviado
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="text-[10px] flex items-center gap-1 font-bold">
                            <Clock className="w-2.5 h-2.5" />
                            Aguardando Sinal ({formatarMoeda(ag.valor_sinal || 0)})
                          </Badge>
                        ))}
                      {ag.status === "CONFIRMADO" && <Badge variant="warning">Aguardando Atendimento</Badge>}
                      {ag.status === "CONCLUIDO" && (
                        <Badge variant="success">
                          Concluído • {ag.forma_pagamento || "Pago"}
                        </Badge>
                      )}
                      {ag.status === "FALTOU" && <Badge variant="danger">Não Compareceu</Badge>}
                      {ag.status === "CANCELADO" && <Badge variant="neutral">Cancelado</Badge>}
                    </div>

                    <p className="text-xs text-amber-400 font-semibold mt-0.5">
                      {ag.servico_titulo} • {formatarMoeda(ag.valor_cobrado)}
                    </p>

                    {ag.status === "AGUARDANDO_SINAL" && ag.valor_sinal && (
                      <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                        💰 Sinal: <strong>{formatarMoeda(ag.valor_sinal)}</strong> • Restante no studio:{" "}
                        {formatarMoeda(ag.valor_cobrado - ag.valor_sinal)}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-400">
                      <span>{formatarTelefone(ag.cliente_telefone)}</span>
                    </div>
                  </div>
                </div>

                {/* Ações Rápidas */}
                <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-800 flex-wrap justify-end">
                  {/* Link WhatsApp */}
                  <a
                    href={`https://wa.me/55${ag.cliente_telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-zinc-800 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
                    title="Chamar no WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>

                  {ag.status === "AGUARDANDO_SINAL" && (
                    <>
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={async () => {
                          await handleStatusChange(ag.id, "CONFIRMADO");
                          toastSuccess(
                            "Sinal Confirmado!",
                            `O agendamento de ${ag.cliente_nome} foi confirmado com sucesso na agenda.`
                          );
                        }}
                        className="text-xs font-black shadow-md shadow-amber-500/20"
                      >
                        <CheckCheck className="w-3.5 h-3.5 mr-1" />
                        Aprovar Sinal
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setConfirmarStatusModal({
                            aberto: true,
                            agendamento: ag,
                            novoStatus: "CANCELADO",
                          })
                        }
                        className="text-xs font-bold"
                      >
                        Liberar Vaga
                      </Button>
                    </>
                  )}

                  {ag.status === "CONFIRMADO" && (
                    <>
                      <Button
                        variant="gold"
                        size="sm"
                        onClick={() => abrirModalConcluir(ag)}
                        className="text-xs font-bold"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" />
                        Concluir
                      </Button>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          setConfirmarStatusModal({
                            aberto: true,
                            agendamento: ag,
                            novoStatus: "FALTOU",
                          })
                        }
                        className="text-xs text-amber-400 hover:text-amber-300"
                      >
                        Faltou
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          setConfirmarStatusModal({
                            aberto: true,
                            agendamento: ag,
                            novoStatus: "CANCELADO",
                          })
                        }
                        className="text-xs"
                      >
                        Cancelar
                      </Button>
                    </>
                  )}

                  {ag.status !== "CONFIRMADO" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleStatusChange(ag.id, "CONFIRMADO")}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Reabrir
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL CONCLUIR ATENDIMENTO */}
      <Modal
        isOpen={modalConcluirAberto}
        onClose={() => setModalConcluirAberto(false)}
        title="Finalizar Atendimento"
        description="Confirme o recebimento e selecione a forma de pagamento"
        icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
      >
        {agendamentoParaConcluir && (
          <div className="space-y-5">
            {/* Card Elegante do Atendimento */}
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-amber-500">
                  {agendamentoParaConcluir.servico_titulo}
                </span>
                <h4 className="font-extrabold text-white text-base mt-0.5">
                  {agendamentoParaConcluir.cliente_nome}
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {formatarTelefone(agendamentoParaConcluir.cliente_telefone)}
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  Total
                </span>
                <p className="text-xl font-black text-amber-400 mt-0.5">
                  {formatarMoeda(agendamentoParaConcluir.valor_cobrado)}
                </p>
              </div>
            </div>

            {/* Seleção de Forma de Pagamento */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2.5">
                Como o cliente pagou?
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    { id: "PIX", label: "Pix", icon: "⚡" },
                    { id: "CARTAO", label: "Cartão", icon: "💳" },
                    { id: "DINHEIRO", label: "Dinheiro", icon: "💵" },
                  ] as { id: FormaPagamento; label: string; icon: string }[]
                ).map((forma) => {
                  const isSel = formaPagamentoSelecionada === forma.id;
                  return (
                    <button
                      key={forma.id}
                      type="button"
                      onClick={() => setFormaPagamentoSelecionada(forma.id)}
                      className={cn(
                        "py-3.5 px-3 rounded-2xl border text-xs font-black transition-all flex flex-col items-center justify-center gap-1 select-none",
                        isSel
                          ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-[1.02]"
                          : "bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850"
                      )}
                    >
                      <span className="text-base">{forma.icon}</span>
                      <span>{forma.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setModalConcluirAberto(false)}
                className="text-zinc-400 hover:text-white"
              >
                Voltar
              </Button>
              <Button
                variant="gold"
                size="md"
                className="flex-1 font-black shadow-lg shadow-amber-500/20"
                onClick={confirmarConclusao}
              >
                <span>Confirmar Recebimento</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL CONFIRMAÇÃO DE FALTA OU CANCELAMENTO */}
      <Modal
        isOpen={confirmarStatusModal.aberto}
        onClose={() => setConfirmarStatusModal({ aberto: false, agendamento: null, novoStatus: null })}
        title={confirmarStatusModal.novoStatus === "FALTOU" ? "Marcar Falta do Cliente?" : "Cancelar Agendamento?"}
        description={
          confirmarStatusModal.novoStatus === "FALTOU"
            ? "O atendimento será registrado como falta no histórico do cliente."
            : "O horário será liberado imediatamente para novos agendamentos."
        }
        icon={
          confirmarStatusModal.novoStatus === "FALTOU" ? (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          ) : (
            <XCircle className="w-5 h-5 text-red-400" />
          )
        }
      >
        {confirmarStatusModal.agendamento && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-400 font-medium">Cliente</p>
                <h4 className="font-bold text-zinc-100 text-sm">{confirmarStatusModal.agendamento.cliente_nome}</h4>
                <p className="text-xs text-amber-400 font-semibold mt-0.5">
                  {confirmarStatusModal.agendamento.servico_titulo}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-zinc-400 font-medium">Horário</span>
                <p className="text-sm font-extrabold text-zinc-200">
                  {confirmarStatusModal.agendamento.horario_inicio.split("T")[1]?.slice(0, 5)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setConfirmarStatusModal({ aberto: false, agendamento: null, novoStatus: null })}
                className="flex-1 text-zinc-400 hover:text-white"
              >
                Voltar
              </Button>
              <Button
                variant={confirmarStatusModal.novoStatus === "FALTOU" ? "gold" : "danger"}
                size="md"
                onClick={async () => {
                  if (confirmarStatusModal.agendamento && confirmarStatusModal.novoStatus) {
                    await handleStatusChange(confirmarStatusModal.agendamento.id, confirmarStatusModal.novoStatus);
                    setConfirmarStatusModal({ aberto: false, agendamento: null, novoStatus: null });
                  }
                }}
                className="flex-1 font-bold"
              >
                {confirmarStatusModal.novoStatus === "FALTOU" ? "Confirmar Falta" : "Sim, Cancelar"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL BLOQUEAR HORÁRIO */}
      <Modal
        isOpen={modalBloqueioAberto}
        onClose={() => setModalBloqueioAberto(false)}
        title="Bloquear Horário na Agenda"
        description="Impeça novos agendamentos online neste intervalo selecionado"
        icon={<Ban className="w-5 h-5 text-amber-500" />}
      >
        <form onSubmit={handleSalvarBloqueio} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Motivo do Bloqueio</label>
            <input
              type="text"
              required
              value={bloqueioMotivo}
              onChange={(e) => setBloqueioMotivo(e.target.value)}
              placeholder="Ex: Almoço, Médico, Compromisso Pessoal"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Hora Início</label>
              <input
                type="time"
                required
                value={bloqueioInicio}
                onChange={(e) => setBloqueioInicio(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Hora Fim</label>
              <input
                type="time"
                required
                value={bloqueioFim}
                onChange={(e) => setBloqueioFim(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <Button type="submit" variant="gold" size="lg" className="w-full font-bold">
            Salvar Bloqueio
          </Button>
        </form>
      </Modal>

      {/* MODAL NOVO AGENDAMENTO MANUAL */}
      <Modal
        isOpen={modalNovoAgendamentoAberto}
        onClose={() => setModalNovoAgendamentoAberto(false)}
        title="Novo Agendamento Manual"
        description="Cadastre um atendimento presencial ou agendado por telefone"
        icon={<Plus className="w-5 h-5 text-amber-500" />}
      >
        <form onSubmit={handleCriarAgendamentoManual} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Nome do Cliente</label>
            <input
              type="text"
              required
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex: João Silva"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">WhatsApp</label>
            <input
              type="tel"
              required
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(e.target.value)}
              placeholder="Ex: 82994247688"
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Serviço</label>
              <select
                value={novoServicoId}
                onChange={(e) => setNovoServicoId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              >
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titulo} ({formatarMoeda(s.preco)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Horário</label>
              <input
                type="time"
                required
                value={novoHorario}
                onChange={(e) => setNovoHorario(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <Button type="submit" variant="gold" size="lg" className="w-full font-bold">
            Adicionar na Agenda
          </Button>
        </form>
      </Modal>
    </div>
  );
}
