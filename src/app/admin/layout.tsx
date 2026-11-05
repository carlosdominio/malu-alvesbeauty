"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/ui/Toast";
import { DataStore } from "@/lib/dataStore";
import { BarbeariaConfig } from "@/types";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BarbeariaConfig | null>(null);

  useEffect(() => {
    DataStore.getConfig().then(setConfig);
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col pb-20 md:pb-8 selection:bg-amber-500 selection:text-zinc-950">
        <Header nomeBarbearia={config?.nome_barbearia} isAdmin={true} />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
        <BottomNav />
      </div>
    </ToastProvider>
  );
}
