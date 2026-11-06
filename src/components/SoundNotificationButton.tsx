"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { SoundNotification } from "@/lib/audioNotification";
import { useToast } from "./ui/Toast";

export function SoundNotificationButton() {
  const [enabled, setEnabled] = useState(true);
  const { toastSuccess, toastInfo } = useToast();

  useEffect(() => {
    setEnabled(SoundNotification.isEnabled());
  }, []);

  const handleToggle = async () => {
    const newState = SoundNotification.toggle();
    setEnabled(newState);

    if (newState) {
      await SoundNotification.requestNotificationPermission();
      toastSuccess(
        "Avisos Sonoros Ativados! 🔔",
        "Você ouvirá um som sempre que chegar um novo agendamento ou comprovante."
      );
    } else {
      toastInfo("Avisos Sonoros Pausados 🔕", "O som foi silenciado temporariamente.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
        enabled
          ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
          : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
      }`}
      title={enabled ? "Notificações sonoras ativas (Clique para silenciar)" : "Som desativado (Clique para ativar)"}
    >
      {enabled ? (
        <>
          <Bell className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="hidden sm:inline">Som Ativo</span>
        </>
      ) : (
        <>
          <BellOff className="w-3.5 h-3.5 text-zinc-500" />
          <span className="hidden sm:inline">Sem Som</span>
        </>
      )}
    </button>
  );
}
