"use client";

import { useEffect, useState } from "react";
import {
  Users,
  Search,
  MessageCircle,
  Scissors,
  Award,
  DollarSign,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Cliente } from "@/types";
import { formatarMoeda, formatarTelefone, formatarDataHora } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch("/api/clientes", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setClientes(data);
        }
      } catch (err) {
        console.error("Erro ao carregar clientes:", err);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.nome.toLowerCase().includes(busca.toLowerCase()) ||
      c.telefone.includes(busca)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-zinc-100">Clientes & Fidelidade</h2>
            <Badge variant="gold" className="flex items-center gap-1 text-[10px] font-bold">
              <Award className="w-3 h-3 text-amber-400" />
              Histórico Permanente
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Base de clientes, histórico de visitas e controle de descontos por frequência.
          </p>
        </div>

        {/* Busca */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome ou WhatsApp..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 font-medium"
          />
        </div>
      </div>

      {/* Cards de Métricas Gerais de Clientes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-black text-zinc-100">{clientes.length}</span>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Total de Clientes</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-black text-emerald-400">
              {clientes.filter((c) => c.total_visitas >= 3).length}
            </span>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Clientes Recorrentes (3+)</p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xl font-black text-sky-400">
              {clientes.filter((c) => c.total_visitas > 0 && c.total_visitas % 5 === 0).length}
            </span>
            <p className="text-[10px] uppercase font-bold text-zinc-400">Elegíveis para Desconto</p>
          </div>
        </div>
      </div>

      {/* Lista de Clientes */}
      {loading ? (
        <div className="p-12 text-center text-zinc-500 text-sm">Carregando histórico de clientes...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div className="p-12 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 text-center space-y-2">
          <Users className="w-10 h-10 text-zinc-600 mx-auto stroke-1" />
          <h4 className="text-base font-bold text-zinc-300">Nenhum cliente encontrado</h4>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clientesFiltrados.map((cliente) => {
            const visitas = cliente.total_visitas || 1;
            const pontuacao = visitas % 5 === 0 ? 5 : visitas % 5;
            const elegivelDesconto = visitas > 0 && visitas % 5 === 0;

            return (
              <Card key={cliente.id} className="border-zinc-800 p-4 space-y-3 relative overflow-hidden">
                {elegivelDesconto && (
                  <div className="absolute top-0 right-0 bg-gradient-to-l from-amber-500 to-amber-600 text-zinc-950 px-3 py-0.5 text-[10px] font-black uppercase rounded-bl-xl shadow-md">
                    🎯 Desconto Fidelidade Liberado!
                  </div>
                )}

                {/* Info Principal */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-amber-400 font-black text-sm">
                      {cliente.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-bold text-zinc-100 text-sm">{cliente.nome}</h4>
                      <p className="text-xs text-zinc-400">{formatarTelefone(cliente.telefone)}</p>
                    </div>
                  </div>

                  <a
                    href={`https://wa.me/55${cliente.telefone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-zinc-800 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                    title="Chamar no WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                </div>

                {/* Cartão Fidelidade Visual */}
                <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-400 font-semibold flex items-center gap-1">
                      <Scissors className="w-3 h-3 text-amber-400" />
                      Cartão Fidelidade:
                    </span>
                    <span className="font-bold text-zinc-200">
                      {visitas} {visitas === 1 ? "corte realizado" : "cortes realizados"}
                    </span>
                  </div>

                  {/* 5 Bolinhas do Cartão Fidelidade */}
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    {[1, 2, 3, 4, 5].map((step) => {
                      const preenchido = step <= pontuacao;
                      const ehEstrela = step === 5;

                      return (
                        <div
                          key={step}
                          className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-all ${
                            preenchido
                              ? ehEstrela
                                ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-md shadow-amber-500/20"
                                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : "bg-zinc-900 border-zinc-800 text-zinc-600"
                          }`}
                        >
                          {ehEstrela ? "⭐ 5º" : `${step}º`}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detalhes de Visita & Gastos */}
                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-500" />
                    Último corte:{" "}
                    <strong className="text-zinc-300">
                      {cliente.ultima_visita ? formatarDataHora(cliente.ultima_visita) : "Hoje"}
                    </strong>
                  </span>

                  {cliente.total_gasto ? (
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-amber-400" />
                      Total gasto:{" "}
                      <strong className="text-amber-400">{formatarMoeda(cliente.total_gasto)}</strong>
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
