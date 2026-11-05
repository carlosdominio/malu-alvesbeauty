import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-amber-500 selection:text-zinc-950">
      {/* Header Simples */}
      <header className="border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="Logo Studio Malu Alves Beauty"
              className="w-10 h-10 rounded-full object-cover border border-amber-500/40 shadow-md shadow-amber-500/20"
            />
            <span className="font-extrabold text-base tracking-tight text-zinc-100">
              Studio Malu Alves Beauty
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
      <main className="max-w-3xl mx-auto px-4 py-16 text-center flex-1 flex flex-col justify-center">
        {/* Logo Central em Destaque */}
        <div className="mx-auto mb-6 flex flex-col items-center">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 opacity-30 blur-md" />
            <img
              src="/logo.jpg"
              alt="Studio Malu Alves Beauty"
              className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-2 border-amber-400/80 shadow-2xl shadow-amber-500/25"
            />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-amber-400 mt-4 tracking-tight">
            Studio Malu Alves Beauty
          </h2>
        </div>

        {/* Badge VIP */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold mx-auto mb-6">
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
          Agende seu design de sobrancelhas ou procedimento em menos de 1 minuto no Studio Malu Alves Beauty. Escolha o serviço, selecione o horário e receba a confirmação instantânea.
        </p>

        {/* Botão de Ação Único */}
        <div className="mt-8 flex items-center justify-center">
          <Link href="/agendar" className="w-full sm:w-auto">
            <Button
              variant="gold"
              size="lg"
              className="w-full sm:w-auto px-10 py-4 text-base font-black shadow-xl shadow-amber-500/25 flex items-center justify-center gap-2"
            >
              <span>Agendar Meu Horário Agora</span>
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-600">
        <p>© 2026 Studio Malu Alves Beauty • Studio de Design de Sobrancelhas</p>
      </footer>
    </div>
  );
}
