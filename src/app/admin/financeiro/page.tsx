"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  Banknote,
  Zap,
  Award,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { ResumoFinanceiro } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { formatarMoeda, cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export default function FinanceiroPage() {
  const [periodo, setPeriodo] = useState<"HOJE" | "SEMANA" | "MES">("HOJE");
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal de Limpeza Financeira
  const [modalLimparAberto, setModalLimparAberto] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [modoLimpeza, setModoLimpeza] = useState<"PERIODO" | "TODOS">("PERIODO");

  const { toastSuccess, toastError } = useToast();

  const carregarFinanceiro = async (p: "HOJE" | "SEMANA" | "MES") => {
    setLoading(true);
    const data = await DataStore.getResumoFinanceiro(p);
    setResumo(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarFinanceiro(periodo);
  }, [periodo]);

  const handleExecutarLimpeza = async () => {
    setLimpando(true);
    try {
      const periodoAlvo = modoLimpeza === "PERIODO" ? periodo : "TODOS";
      await DataStore.limparHistoricoFinanceiro(periodoAlvo);
      await carregarFinanceiro(periodo);
      setModalLimparAberto(false);
      toastSuccess(
        "Histórico Financeiro Limpo! 🗑️",
        modoLimpeza === "PERIODO"
          ? `Os registros de ${periodo === "HOJE" ? "Hoje" : periodo === "SEMANA" ? "Esta Semana" : "Este Mês"} foram zerados com sucesso.`
          : "Todos os registros financeiros acumulados foram zerados."
      );
    } catch (e) {
      console.error("Erro ao limpar financeiro:", e);
      toastError("Erro ao Limpar", "Não foi possível limpar o histórico financeiro.");
    } finally {
      setLimpando(false);
    }
  };

  const periodoLabel = periodo === "HOJE" ? "Hoje" : periodo === "SEMANA" ? "Esta Semana" : "Este Mês";

  return (
    <div className="space-y-6">
      {/* Top Header & Seletor de Período + Botão Limpar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-100">Painel Financeiro</h2>
          <p className="text-xs text-zinc-400">
            Controle enxuto de entradas, faturamento e tíquete médio.
          </p>
        </div>

        {/* Ações: Abas (Hoje | Semana | Mês) e Botão Limpar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
            {(["HOJE", "SEMANA", "MES"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setPeriodo(tab)}
                className={cn(
                  "px-3.5 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all",
                  periodo === tab
                    ? "bg-amber-500 text-zinc-950 shadow-md font-extrabold"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                {tab === "HOJE" ? "Hoje" : tab === "SEMANA" ? "Esta Semana" : "Este Mês"}
              </button>
            ))}
          </div>

          {/* Botão para Limpar Histórico Financeiro */}
          <Button
            variant="danger"
            size="sm"
            onClick={() => setModalLimparAberto(true)}
            className="flex items-center gap-1.5 text-xs font-bold shrink-0"
            title="Limpar Histórico Financeiro"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Limpar Histórico</span>
            <span className="sm:hidden">Limpar</span>
          </Button>
        </div>
      </div>

      {loading || !resumo ? (
        <div className="p-12 text-center text-zinc-500 text-sm">Calculando financeiro...</div>
      ) : (
        <>
          {/* Cards Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Faturamento Total */}
            <Card className="border-amber-500/30 bg-gradient-to-br from-zinc-900 to-amber-950/20">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Faturamento {periodo === "HOJE" ? "de Hoje" : periodo === "SEMANA" ? "da Semana" : "do Mês"}
                </span>
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-3xl font-black text-zinc-100 mt-2">
                {formatarMoeda(resumo.faturamento_total)}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1">Total bruto faturado</p>
            </Card>

            {/* Card 2: Total Atendimentos */}
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Atendimentos Realizados
                </span>
                <div className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-300 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-3xl font-black text-zinc-100 mt-2">
                {resumo.total_atendimentos}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1">Clientes atendidos</p>
            </Card>

            {/* Card 3: Tíquete Médio */}
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Tíquete Médio
                </span>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <h3 className="text-3xl font-black text-emerald-400 mt-2">
                {formatarMoeda(resumo.ticket_medio)}
              </h3>
              <p className="text-[11px] text-zinc-400 mt-1">Média gasta por cliente</p>
            </Card>
          </div>

          {/* Formas de Pagamento */}
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-zinc-300 mb-3">
              Divisão por Forma de Pagamento
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* PIX */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-400">Pix</span>
                  <h4 className="text-lg font-black text-zinc-100">
                    {formatarMoeda(resumo.por_forma_pagamento.pix)}
                  </h4>
                </div>
              </div>

              {/* DINHEIRO */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-400">Dinheiro</span>
                  <h4 className="text-lg font-black text-zinc-100">
                    {formatarMoeda(resumo.por_forma_pagamento.dinheiro)}
                  </h4>
                </div>
              </div>

              {/* CARTÃO */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-400">Cartão (Débito/Crédito)</span>
                  <h4 className="text-lg font-black text-zinc-100">
                    {formatarMoeda(resumo.por_forma_pagamento.cartao)}
                  </h4>
                </div>
              </div>
            </div>
          </div>

          {/* Serviços Mais Vendidos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span>Serviços Mais Vendidos</span>
              </CardTitle>
            </CardHeader>

            {resumo.servicos_mais_vendidos.length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">Nenhum serviço computado no período.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {resumo.servicos_mais_vendidos.map((s, index) => (
                  <div key={s.titulo} className="py-3 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-amber-400">
                        {index + 1}º
                      </span>
                      <span className="font-semibold text-zinc-200">{s.titulo}</span>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-zinc-100">{formatarMoeda(s.total)}</span>
                      <p className="text-[11px] text-zinc-400">{s.quantidade} {s.quantidade === 1 ? "atendimento" : "atendimentos"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal de Confirmação para Limpar Histórico Financeiro */}
      <Modal
        isOpen={modalLimparAberto}
        onClose={() => setModalLimparAberto(false)}
        title="Limpar Histórico Financeiro?"
        description="Zere os registros de faturamento e atendimentos concluídos para começar com o caixa limpo."
        icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/30 text-xs text-red-300 leading-relaxed space-y-2">
            <p className="font-bold text-red-200">⚠️ Atenção: Esta ação reinicia os dados de faturamento!</p>
            <p>
              Os agendamentos futuros e pendentes na agenda <strong>NÃO</strong> serão apagados. Apenas os atendimentos concluídos e valores faturados serão limpos.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-2">
              Selecione o que você deseja limpar:
            </label>
            <div className="space-y-2.5">
              <label
                onClick={() => setModoLimpeza("PERIODO")}
                className={cn(
                  "p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all",
                  modoLimpeza === "PERIODO"
                    ? "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                )}
              >
                <div>
                  <p className="text-xs font-black text-zinc-100 flex items-center gap-1.5">
                    <span>📅</span>
                    <span>Apenas registros de {periodoLabel}</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Limpa somente os registros financeiros computados em {periodoLabel.toLowerCase()}.
                  </p>
                </div>
                <input
                  type="radio"
                  name="modoLimpeza"
                  checked={modoLimpeza === "PERIODO"}
                  onChange={() => setModoLimpeza("PERIODO")}
                  className="w-4 h-4 text-amber-500 bg-zinc-900 border-zinc-700 focus:ring-0"
                />
              </label>

              <label
                onClick={() => setModoLimpeza("TODOS")}
                className={cn(
                  "p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition-all",
                  modoLimpeza === "TODOS"
                    ? "bg-red-500/10 border-red-500/40 text-red-300 shadow-sm shadow-red-500/10"
                    : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                )}
              >
                <div>
                  <p className="text-xs font-black text-zinc-100 flex items-center gap-1.5">
                    <span>💣</span>
                    <span>Todo o Histórico Financeiro Acumulado</span>
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Zera 100% de todo o histórico financeiro e atendimentos concluídos de todos os períodos.
                  </p>
                </div>
                <input
                  type="radio"
                  name="modoLimpeza"
                  checked={modoLimpeza === "TODOS"}
                  onChange={() => setModoLimpeza("TODOS")}
                  className="w-4 h-4 text-red-500 bg-zinc-900 border-zinc-700 focus:ring-0"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              variant="ghost"
              size="md"
              onClick={() => setModalLimparAberto(false)}
              className="flex-1 text-zinc-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={handleExecutarLimpeza}
              loading={limpando}
              className="flex-1 font-bold shadow-lg shadow-red-500/20"
            >
              Confirmar Limpeza
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
