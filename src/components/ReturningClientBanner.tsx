"use client";

import { Cliente, Servico } from "@/types";
import { formatarData } from "@/lib/utils";
import { Sparkles, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "./ui/Button";

interface ReturningClientBannerProps {
  cliente: Cliente;
  servicoAnterior?: Servico;
  onAgendarNovamente: (servico: Servico) => void;
  onEscolherOutro: () => void;
}

export function ReturningClientBanner({
  cliente,
  servicoAnterior,
  onAgendarNovamente,
  onEscolherOutro,
}: ReturningClientBannerProps) {
  if (!servicoAnterior) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-900 border-2 border-amber-500/40 p-5 shadow-2xl shadow-amber-500/10 mb-6">
      {/* Glow highlight */}
      <div className="absolute top-0 right-0 -mt-6 -mr-6 w-28 h-28 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start gap-3.5">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
          <Sparkles className="w-6 h-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
              Cliente Vip • {cliente.total_visitas}ª visita
            </span>
          </div>

          <h3 className="text-lg font-black text-zinc-100 mt-1.5">
            Olá, {cliente.nome}! 👋
          </h3>

          <p className="text-xs text-zinc-300 mt-1">
            Quer marcar novamente seu{" "}
            <strong className="text-amber-400 font-bold">{servicoAnterior.titulo}</strong>?
          </p>

          {cliente.ultima_visita && (
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Última visita: {formatarData(cliente.ultima_visita)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3.5 border-t border-zinc-800/80 flex flex-col sm:flex-row gap-2.5">
        <Button
          variant="gold"
          size="md"
          className="flex-1 flex items-center justify-center gap-2 text-zinc-950 font-black shadow-md shadow-amber-500/20"
          onClick={() => onAgendarNovamente(servicoAnterior)}
        >
          <span>Agendar Novamente</span>
          <ArrowRight className="w-4 h-4" />
        </Button>

        <Button
          variant="secondary"
          size="md"
          className="flex items-center justify-center gap-1.5 text-xs text-zinc-300 hover:text-white"
          onClick={onEscolherOutro}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Outro Serviço</span>
        </Button>
      </div>
    </div>
  );
}
