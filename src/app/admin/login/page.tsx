"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, senha }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErro(data.error || "Usuário ou senha incorretos.");
        setLoading(false);
        return;
      }

      // Salva sessão localmente
      if (data.token) {
        localStorage.setItem("malu_admin_auth", data.token);
        document.cookie = `malu_admin_auth=${data.token}; path=/; max-age=2592000; SameSite=Lax`;
      }

      router.push("/admin");
      router.refresh();
    } catch (err) {
      console.error(err);
      setErro("Falha ao conectar com o servidor. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center px-4 selection:bg-amber-500 selection:text-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo & Título */}
        <div className="text-center space-y-3">
          <div className="relative inline-block mx-auto">
            <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-300 opacity-40 blur-md" />
            <img
              src="/logo.jpg"
              alt="Logo Studio Malu Alves Beauty"
              className="relative w-20 h-20 rounded-full object-cover border-2 border-amber-400/80 shadow-2xl mx-auto"
            />
          </div>

          <div>
            <h1 className="text-xl font-black text-zinc-100 tracking-tight">
              Studio Malu Alves Beauty
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Acesso exclusivo para gerenciamento do painel
            </p>
          </div>
        </div>

        {/* Card do Formulário */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 shadow-2xl backdrop-blur-sm space-y-5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-400 pb-1 border-b border-zinc-800">
            <ShieldCheck className="w-4 h-4" />
            <span>Login Administrativo</span>
          </div>

          {erro && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-900/50 text-red-300 text-xs text-center font-medium">
              {erro}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Usuário */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 block">Usuário</label>
              <div className="relative">
                <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Ex: admin"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-300 block">Senha de Acesso</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={mostrarSenha ? "text" : "password"}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Digite sua senha"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title={mostrarSenha ? "Ocultar senha" : "Ver senha"}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botão Entrar */}
            <Button
              type="submit"
              variant="gold"
              size="lg"
              disabled={loading}
              className="w-full text-sm font-black flex items-center justify-center gap-2 mt-2 shadow-lg shadow-amber-500/20"
            >
              <span>{loading ? "Entrando..." : "Acessar Painel"}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
