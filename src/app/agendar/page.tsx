"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import {
  Calendar as CalendarIcon,
  Clock,
  Scissors,
  CheckCircle2,
  Phone,
  User,
  Flame,
  ChevronLeft,
} from "lucide-react";
import { Agendamento, BarbeariaConfig, Cliente, ExpedienteDia, HorarioSlot, Servico } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { calcularSlotsDisponiveis } from "@/lib/appointmentEngine";
import { cn, formatarData, formatarMoeda } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ReturningClientBanner } from "@/components/ReturningClientBanner";
import Link from "next/link";

export default function AgendarPage() {
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [expediente, setExpediente] = useState<ExpedienteDia[]>([]);
  const [clienteRecorrente, setClienteRecorrente] = useState<Cliente | null>(null);
  const [servicoRecorrente, setServicoRecorrente] = useState<Servico | undefined>(undefined);

  // Estados do Agendamento
  const [passo, setPasso] = useState<1 | 2 | 3>(1); // 1: Serviço, 2: Data/Hora, 3: Confirmação
  const [servicoSelecionado, setServicoSelecionado] = useState<Servico | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState<string>("");
  const [slotSelecionado, setSlotSelecionado] = useState<HorarioSlot | null>(null);
  const [slotsDisponiveis, setSlotsDisponiveis] = useState<HorarioSlot[]>([]);
  const [diaAberto, setDiaAberto] = useState<boolean>(true);
  const [motivoFechado, setMotivoFechado] = useState<string>("");

  // Dados do Cliente
  const [nomeCliente, setNomeCliente] = useState("");
  const [telefoneCliente, setTelefoneCliente] = useState("");
  const [loading, setLoading] = useState(false);
  const [agendamentoConfirmado, setAgendamentoConfirmado] = useState<Agendamento | null>(null);

  // 1. Carregar dados iniciais
  useEffect(() => {
    async function loadData() {
      const [cfg, srvs, exp] = await Promise.all([
        DataStore.getConfig(),
        DataStore.getServicos(),
        DataStore.getExpediente(),
      ]);

      setConfig(cfg);
      setServicos(srvs.filter((s) => s.ativo));
      setExpediente(exp);

      // Data de hoje como padrão
      const hoje = new Date();
      const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      setDataSelecionada(hojeStr);

      // Verificar se há cliente salvo no LocalStorage
      const salvoTel = localStorage.getItem("barber_saved_phone");
      if (salvoTel) {
        setTelefoneCliente(salvoTel);
        const cli = await DataStore.findClientePorTelefone(salvoTel);
        if (cli) {
          setClienteRecorrente(cli);
          setNomeCliente(cli.nome);
          const serv = srvs.find((s) => s.id === cli.ultimo_servico_id);
          setServicoRecorrente(serv);
        }
      }
    }
    loadData();
  }, []);

  // 2. Recalcular slots sempre que mudar o serviço ou a data
  useEffect(() => {
    async function atualizarSlots() {
      if (!servicoSelecionado || !dataSelecionada || expediente.length === 0) return;

      const [agendamentos, bloqueios] = await Promise.all([
        DataStore.getAgendamentos(dataSelecionada),
        DataStore.getBloqueios(),
      ]);

      const resultado = calcularSlotsDisponiveis({
        data: dataSelecionada,
        servico: servicoSelecionado,
        expedientes: expediente,
        agendamentosExistentes: agendamentos,
        bloqueios,
        tempoBufferMinutos: config?.tempo_buffer_minutos || 5,
      });

      setDiaAberto(resultado.aberto);
      setMotivoFechado(resultado.motivoFechado || "");
      setSlotsDisponiveis(resultado.slots);
      setSlotSelecionado(null);
    }
    atualizarSlots();
  }, [servicoSelecionado, dataSelecionada, expediente, config]);

  // Handler para re-agendamento de cliente recorrente (1 clique)
  const handleAgendarNovamente = (servico: Servico) => {
    setServicoSelecionado(servico);
    setPasso(2);
  };

  // Handler de seleção de serviço
  const handleSelecionarServico = (servico: Servico) => {
    setServicoSelecionado(servico);
    setPasso(2);
  };

  // Handler de submissão do agendamento
  const handleConfirmarAgendamento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servicoSelecionado || !dataSelecionada || !slotSelecionado || !nomeCliente || !telefoneCliente) {
      alert("Por favor, preencha todos os campos.");
      return;
    }

    setLoading(true);
    try {
      const dataHoraInicio = `${dataSelecionada}T${slotSelecionado.hora_inicio}:00`;

      const res = await fetch("/api/agendamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_nome: nomeCliente,
          cliente_telefone: telefoneCliente,
          servico: servicoSelecionado,
          horario_inicio: dataHoraInicio,
          origem: "WEB",
        }),
      });

      const resData = await res.json();
      const novoAgendamento = resData.agendamento;

      // Salvar telefone no LocalStorage para visitas futuras (cliente recorrente!)
      localStorage.setItem("barber_saved_phone", telefoneCliente);

      setAgendamentoConfirmado(novoAgendamento);
      setPasso(3);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}
    } catch (err) {
      console.error(err);
      alert("Erro ao confirmar agendamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Gerar opções dos próximos 7 dias
  const gerarProximosDias = () => {
    const dias = [];
    const hoje = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      const isoData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const nomeDia = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toLocaleDateString("pt-BR", { weekday: "short" });
      const diaNumero = d.getDate();
      dias.push({ isoData, nomeDia, diaNumero });
    }
    return dias;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 pb-20 selection:bg-amber-500 selection:text-zinc-950">
      {/* Header do Cliente */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-amber-500/20">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-base text-zinc-100 tracking-tight leading-tight">
                {config?.nome_barbearia || "Studio Malu Alves Beauty"}
              </h1>
              <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Agendamento Online Aberto
              </p>
            </div>
          </div>

          <Link
            href="/admin"
            className="text-[11px] text-zinc-400 hover:text-amber-400 font-medium px-2.5 py-1 rounded-lg border border-zinc-800 hover:border-amber-500/30 transition-colors"
          >
            Painel Dono
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 pt-6">
        {/* ========================================================================= */}
        {/* TELA DE SUCESSO (PASSO 3) */}
        {/* ========================================================================= */}
        {passo === 3 && agendamentoConfirmado && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <div className="rounded-3xl bg-zinc-900 border border-emerald-500/30 p-6 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />

              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
              </div>

              <span className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                Agendamento Confirmado!
              </span>

              <h2 className="text-2xl font-black text-white mt-3">
                Tudo Pronto, {agendamentoConfirmado.cliente_nome.split(" ")[0]}!
              </h2>

              <p className="text-xs text-zinc-400 mt-1">
                Seu horário já está reservado com exclusividade na agenda.
              </p>

              {/* Card Resumo do Agendamento */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 mt-5 text-left space-y-3">
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                  <span className="text-xs text-zinc-400">Serviço:</span>
                  <span className="text-sm font-bold text-amber-400">
                    {agendamentoConfirmado.servico_titulo}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
                  <span className="text-xs text-zinc-400">Data e Horário:</span>
                  <span className="text-sm font-bold text-zinc-200 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-amber-400" />
                    {formatarData(agendamentoConfirmado.horario_inicio)} às{" "}
                    {agendamentoConfirmado.horario_inicio.split("T")[1].slice(0, 5)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Valor Estimado:</span>
                  <span className="text-base font-extrabold text-emerald-400">
                    {formatarMoeda(agendamentoConfirmado.valor_cobrado)}
                  </span>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="mt-6 space-y-2.5">
                <a
                  href={`https://wa.me/${config?.telefone_whatsapp || ""}?text=${encodeURIComponent(
                    `Olá! Acabei de agendar meu horário para ${agendamentoConfirmado.servico_titulo} no dia ${formatarData(
                      agendamentoConfirmado.horario_inicio
                    )} às ${agendamentoConfirmado.horario_inicio.split("T")[1].slice(0, 5)}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm transition-all"
                >
                  <Phone className="w-4 h-4" />
                  <span>Enviar no WhatsApp do Studio</span>
                </a>

                <Button
                  variant="secondary"
                  className="w-full text-xs font-semibold text-zinc-300"
                  onClick={() => {
                    setPasso(1);
                    setAgendamentoConfirmado(null);
                  }}
                >
                  Fazer Outro Agendamento
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSO 1: ESCOLHA DO SERVIÇO */}
        {/* ========================================================================= */}
        {passo === 1 && (
          <div className="animate-in fade-in duration-200">
            {/* Banner de Reconhecimento de Cliente Recorrente */}
            {clienteRecorrente && servicoRecorrente && (
              <ReturningClientBanner
                cliente={clienteRecorrente}
                servicoAnterior={servicoRecorrente}
                onAgendarNovamente={handleAgendarNovamente}
                onEscolherOutro={() => setClienteRecorrente(null)}
              />
            )}

            {/* Mensagem de Boas-Vindas */}
            <div className="mb-5">
              <h2 className="text-xl font-black text-zinc-100">Escolha o Serviço</h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Toque no serviço desejado para ver os horários disponíveis.
              </p>
            </div>

            {/* Lista de Serviços */}
            <div className="space-y-3">
              {servicos.map((servico) => {
                const ehCombo = servico.titulo.toLowerCase().includes("combo");
                return (
                  <div
                    key={servico.id}
                    onClick={() => handleSelecionarServico(servico)}
                    className={cn(
                      "group relative p-4 rounded-2xl bg-zinc-900 border transition-all duration-150 cursor-pointer select-none active:scale-[0.99]",
                      ehCombo
                        ? "border-amber-500/40 hover:border-amber-400 bg-gradient-to-r from-zinc-900 via-zinc-900 to-amber-950/20"
                        : "border-zinc-800/90 hover:border-zinc-700 hover:bg-zinc-850"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-zinc-100 text-sm group-hover:text-amber-400 transition-colors">
                            {servico.titulo}
                          </h3>
                          {ehCombo && (
                            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                              <Flame className="w-3 h-3" />
                              Mais Pedido
                            </span>
                          )}
                        </div>

                        {servico.descricao && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {servico.descricao}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-3">
                          <span className="text-sm font-black text-amber-400">
                            {formatarMoeda(servico.preco)}
                          </span>
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            {servico.duracao_minutos} min
                          </span>
                        </div>
                      </div>

                      <div className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-300 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-all shrink-0 mt-1">
                        <Scissors className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PASSO 2: ESCOLHA DE DATA, HORÁRIO E DADOS DO CLIENTE */}
        {/* ========================================================================= */}
        {passo === 2 && servicoSelecionado && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-200 space-y-6">
            {/* Top Back & Serviço Selecionado */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <button
                onClick={() => setPasso(1)}
                className="flex items-center gap-1 text-xs font-semibold text-zinc-400 hover:text-amber-400 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Voltar aos serviços
              </button>

              <div className="text-right">
                <span className="text-xs font-bold text-amber-400">{servicoSelecionado.titulo}</span>
                <p className="text-[11px] text-zinc-400">
                  {formatarMoeda(servicoSelecionado.preco)} • {servicoSelecionado.duracao_minutos} min
                </p>
              </div>
            </div>

            {/* 1. SELETOR DE DIAS (Próximos 7 Dias) */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2.5">
                1. Escolha o Dia:
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {gerarProximosDias().map((dia) => {
                  const isSelected = dataSelecionada === dia.isoData;
                  return (
                    <button
                      key={dia.isoData}
                      type="button"
                      onClick={() => setDataSelecionada(dia.isoData)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all select-none",
                        isSelected
                          ? "bg-amber-500 text-zinc-950 border-amber-400 font-extrabold shadow-lg shadow-amber-500/25 scale-105"
                          : "bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-850"
                      )}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-tight">
                        {dia.nomeDia}
                      </span>
                      <span className="text-base font-black mt-0.5">{dia.diaNumero}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. SELETOR DE HORÁRIOS LIVRES */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block mb-2.5">
                2. Escolha o Horário:
              </label>

              {!diaAberto ? (
                <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center text-zinc-400 text-xs">
                  {motivoFechado || "Fechado neste dia."}
                </div>
              ) : slotsDisponiveis.length === 0 ? (
                <div className="p-5 rounded-2xl bg-zinc-900 border border-amber-500/20 text-center space-y-1">
                  <p className="text-xs font-bold text-amber-400">Todos os horários ocupados para hoje!</p>
                  <p className="text-[11px] text-zinc-400">
                    Toque em &quot;Amanhã&quot; acima para ver novos horários livres.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                  {slotsDisponiveis.map((slot) => {
                    const isSelected = slotSelecionado?.hora_inicio === slot.hora_inicio;
                    return (
                      <button
                        key={slot.hora_inicio}
                        type="button"
                        onClick={() => setSlotSelecionado(slot)}
                        className={cn(
                          "py-2.5 px-2 rounded-xl text-xs font-bold border transition-all text-center select-none",
                          isSelected
                            ? "bg-amber-500 text-zinc-950 border-amber-400 font-black shadow-md shadow-amber-500/20 scale-105"
                            : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:border-amber-500/40 hover:bg-zinc-850"
                        )}
                      >
                        {slot.hora_inicio}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. DADOS DO CLIENTE & BOTÃO DE CONFIRMAR */}
            {slotSelecionado && (
              <form
                onSubmit={handleConfirmarAgendamento}
                className="pt-4 border-t border-zinc-800 space-y-3.5 animate-in fade-in duration-150"
              >
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-300 block">
                  3. Seus Dados de Contato:
                </label>

                <div>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-400" />
                    <input
                      type="text"
                      required
                      placeholder="Seu Nome Completo"
                      value={nomeCliente}
                      onChange={(e) => setNomeCliente(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-400" />
                    <input
                      type="tel"
                      required
                      placeholder="Seu WhatsApp (ex: 11 99999-8888)"
                      value={telefoneCliente}
                      onChange={(e) => setTelefoneCliente(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Enviaremos o lembrete 2h antes no seu WhatsApp.
                  </p>
                </div>

                <Button
                  type="submit"
                  variant="gold"
                  size="lg"
                  loading={loading}
                  className="w-full font-black text-sm shadow-xl shadow-amber-500/20 mt-2"
                >
                  Confirmar Agendamento • {formatarMoeda(servicoSelecionado.preco)}
                </Button>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
