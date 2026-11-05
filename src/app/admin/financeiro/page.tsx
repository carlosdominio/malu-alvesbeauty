"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Users, CreditCard, Banknote, Zap, Award } from "lucide-react";
import { ResumoFinanceiro } from "@/types";
import { DataStore } from "@/lib/dataStore";
import { formatarMoeda, cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

export default function FinanceiroPage() {
  const [periodo, setPeriodo] = useState<"HOJE" | "SEMANA" | "MES">("HOJE");
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);

  const carregarFinanceiro = async (p: "HOJE" | "SEMANA" | "MES") => {
    setLoading(true);
    const data = await DataStore.getResumoFinanceiro(p);
    setResumo(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarFinanceiro(periodo);
  }, [periodo]);

  return (
    <div className="space-y-6">
      {/* Top Header & Seletor de Período */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-100">Painel Financeiro</h2>
          <p className="text-xs text-zinc-400">
            Controle enxuto de entradas, faturamento e tíquete médio.
          </p>
        </div>

        {/* Abas: Hoje | Semana | Mês */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 p-1 rounded-2xl">
          {(["HOJE", "SEMANA", "MES"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPeriodo(tab)}
              className={cn(
                "px-4 py-1.5 rounded-xl text-xs font-bold transition-all",
                periodo === tab
                  ? "bg-amber-500 text-zinc-950 shadow-md font-extrabold"
                  : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {tab === "HOJE" ? "Hoje" : tab === "SEMANA" ? "Esta Semana" : "Este Mês"}
            </button>
          ))}
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
    </div>
  );
}
