import Link from "next/link";
import { Sparkles, ArrowRight, DollarSign, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-amber-500 selection:text-zinc-950">
      {/* Header Simples */}
      <header className="border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-zinc-950 shadow-md shadow-amber-500/20 font-black">
              <Sparkles className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="font-extrabold text-base tracking-tight text-zinc-100">
              malu.alvesbeauty
            </span>
          </div>

          <Link
            href="/admin"
            className="text-xs font-bold text-zinc-400 hover:text-amber-400 px-3 py-1.5 rounded-xl border border-zinc-800 hover:border-amber-500/30 transition-all"
          >
            Acesso do Dono
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-3xl mx-auto px-4 py-12 text-center flex-1 flex flex-col justify-center">
        {/* Badge VIP */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mx-auto mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Studio de Design de Sobrancelhas</span>
        </div>

        {/* Título Principal */}
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight sm:leading-none">
          Realce o seu olhar no seu tempo. <br />
          <span className="bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 bg-clip-text text-transparent">
            Sem filas e sem espera.
          </span>
        </h1>

        <p className="text-sm sm:text-base text-zinc-400 mt-4 max-w-lg mx-auto leading-relaxed">
          Agende seu design de sobrancelhas ou procedimento em menos de 1 minuto na malu.alvesbeauty. Escolha o serviço, selecione o horário e receba a confirmação instantânea.
        </p>

        {/* Botões de Ação */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/agendar" className="w-full sm:w-auto">
            <Button
              variant="gold"
              size="lg"
              className="w-full sm:w-auto px-8 py-4 text-base font-black shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2"
            >
              <span>Agendar Meu Horário Agora</span>
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>

          <Link href="/admin" className="w-full sm:w-auto">
            <Button
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto px-6 py-4 text-sm font-bold text-zinc-300 hover:text-white"
            >
              <span>Painel de Controle (Dono)</span>
            </Button>
          </Link>
        </div>

        {/* Benefícios Rápidos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-14 text-left">
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <Clock className="w-6 h-6 text-amber-400 mb-2" />
            <h3 className="text-sm font-bold text-zinc-200">Horários em Tempo Real</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Veja exatamente os horários livres hoje e nos próximos dias.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <Users className="w-6 h-6 text-emerald-400 mb-2" />
            <h3 className="text-sm font-bold text-zinc-200">Cliente Recorrente</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Re-agende seu procedimento com apenas 1 clique ao abrir o link.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <DollarSign className="w-6 h-6 text-amber-400 mb-2" />
            <h3 className="text-sm font-bold text-zinc-200">Financeiro Enxuto</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Controle de faturamento, tíquete médio e entradas por Pix e cartão.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        <p>© 2026 malu.alvesbeauty • Studio de Design de Sobrancelhas</p>
      </footer>
    </div>
  );
}
