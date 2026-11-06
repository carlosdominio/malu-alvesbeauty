"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { AdminTopNav } from "@/components/AdminTopNav";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/ui/Toast";
import { DataStore } from "@/lib/dataStore";
import { BarbeariaConfig } from "@/types";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);
  const [autenticado, setAutenticado] = useState<boolean | null>(null);

  const ehPaginaLogin = pathname === "/admin/login";

  useEffect(() => {
    if (ehPaginaLogin) {
      setAutenticado(true);
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("malu_admin_auth") : null;
    const cookieToken = typeof document !== "undefined" && document.cookie.includes("malu_admin_auth=");

    if (!token && !cookieToken) {
      setAutenticado(false);
      router.replace("/admin/login");
    } else {
      setAutenticado(true);
    }
  }, [pathname, ehPaginaLogin, router]);

  useEffect(() => {
    if (!ehPaginaLogin) {
      DataStore.getConfig().then(setConfig);
    }
  }, [ehPaginaLogin]);

  // Se for a página de login, renderiza limpa
  if (ehPaginaLogin) {
    return <ToastProvider>{children}</ToastProvider>;
  }

  // Se ainda estiver verificando ou não autenticado, mostra tela de carregamento protegida
  if (autenticado === null || !autenticado) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold">Verificando credenciais...</span>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col pb-20 md:pb-8 selection:bg-amber-500 selection:text-zinc-950">
        <Header nomeBarbearia={config?.nome_barbearia} isAdmin={true} />
        <AdminTopNav />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
