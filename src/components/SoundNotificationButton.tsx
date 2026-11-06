"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  X,
  Clock,
  QrCode,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { SoundNotification } from "@/lib/audioNotification";
import { DataStore } from "@/lib/dataStore";
import { formatarMoeda, cn } from "@/lib/utils";
import { Agendamento } from "@/types";

interface PainelNotificacao {
  id: string;
  tipo: "SINAL_PENDENTE" | "COMPROVANTE" | "HOJE";
  titulo: string;
  descricao: string;
  hora: string;
  agendamento: Agendamento;
}

export function SoundNotificationButton() {
  const [enabled, setEnabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [notificacoes, setNotificacoes] = useState<PainelNotificacao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 1. Inicializar estado de som
  useEffect(() => {
    setEnabled(SoundNotification.isEnabled());
  }, []);

  // 2. Carregar notificações reais de agendamentos pendentes
  const carregarNotificacoes = async () => {
    try {
      setCarregando(true);
      const agendamentos = await DataStore.getAgendamentos();
      const agora = new Date();
      const hojeStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;

      const lista: PainelNotificacao[] = [];

      for (const ag of agendamentos) {
        if (ag.status === "CANCELADO") continue;

        const agData = ag.horario_inicio.split("T")[0];
        const horaStr = ag.horario_inicio.split("T")[1]?.slice(0, 5) || "";

        // Alerta 1: Comprovante de sinal recebido aguardando conferência
        if (ag.status === "AGUARDANDO_SINAL" && ag.comprovante_recebido) {
          lista.push({
            id: `comp-${ag.id}`,
            tipo: "COMPROVANTE",
            titulo: "Comprovante PIX Enviado!",
            descricao: `${ag.cliente_nome} enviou o comprovante do sinal (${formatarMoeda(ag.valor_sinal || 0)}).`,
            hora: horaStr,
            agendamento: ag,
          });
        }
        // Alerta 2: Aguardando sinal PIX
        else if (ag.status === "AGUARDANDO_SINAL") {
          lista.push({
            id: `sinal-${ag.id}`,
            tipo: "SINAL_PENDENTE",
            titulo: "Aguardando Sinal PIX",
            descricao: `${ag.cliente_nome} reservou ${ag.servico_titulo}. Sinal: ${formatarMoeda(ag.valor_sinal || 0)}.`,
            hora: horaStr,
            agendamento: ag,
          });
        }
        // Alerta 3: Agendamento marcado para hoje
        else if (agData === hojeStr && ag.status === "CONFIRMADO") {
          lista.push({
            id: `hoje-${ag.id}`,
            tipo: "HOJE",
            titulo: "Atendimento Hoje",
            descricao: `${ag.cliente_nome} - ${ag.servico_titulo} às ${horaStr}.`,
            hora: horaStr,
            agendamento: ag,
          });
        }
      }

      setNotificacoes(lista.slice(0, 8));
    } catch (e) {
      console.error("Erro ao carregar notificações do painel:", e);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarNotificacoes();

    // Sincronizar via BroadcastChannel e Intervalo
    let bc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        bc = new BroadcastChannel("studio_updates");
        bc.onmessage = () => {
          carregarNotificacoes();
        };
      } catch {}
    }

    const interval = setInterval(carregarNotificacoes, 15000);

    return () => {
      clearInterval(interval);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  // 3. Fechar ao clicar fora ou apertar Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Alternar som
  const handleToggleSom = async () => {
    const newState = SoundNotification.toggle();
    setEnabled(newState);
    if (newState) {
      await SoundNotification.requestNotificationPermission();
    }
  };

  // Testar som chime
  const handleTestarSom = () => {
    SoundNotification.playChime();
  };

  const totalPendentes = notificacoes.filter(
    (n) => n.tipo === "SINAL_PENDENTE" || n.tipo === "COMPROVANTE"
  ).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino de Notificações */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) carregarNotificacoes();
        }}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-150 select-none",
          isOpen
            ? "bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/20"
            : totalPendentes > 0
            ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850"
        )}
        title="Notificações do Painel e Ajustes de Som"
      >
        {totalPendentes > 0 ? (
          <BellRing className="w-4 h-4 text-amber-400 animate-pulse" />
        ) : (
          <Bell className="w-4 h-4" />
        )}

        {/* Badge do Sino com Total de Pendências */}
        {totalPendentes > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-md shadow-red-500/40 animate-in zoom-in-75 duration-150">
            {totalPendentes}
          </span>
        )}
      </button>

      {/* Dropdown / Popover de Notificações */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header do Popover */}
          <div className="p-3.5 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-100 flex items-center gap-1.5">
                  <span>Notificações do Painel</span>
                  {totalPendentes > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500/20 text-red-400 font-extrabold border border-red-500/30">
                      {totalPendentes} pendentes
                    </span>
                  )}
                </h4>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Card de Controle de Avisos Sonoros */}
          <div className="p-3 bg-gradient-to-r from-zinc-900/80 to-zinc-950 border-b border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center text-xs",
                    enabled
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                  )}
                >
                  {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-200 block">Avisos Sonoros</span>
                  <span className="text-[10px] text-zinc-400">Tocar ao chegar novo agendamento</span>
                </div>
              </div>

              {/* Botão de Ligar / Desligar Som */}
              <button
                type="button"
                onClick={handleToggleSom}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all flex items-center gap-1.5 shadow-sm active:scale-95",
                  enabled
                    ? "bg-amber-500 text-zinc-950 border-amber-400 shadow-amber-500/20"
                    : "bg-zinc-850 text-zinc-400 border-zinc-750 hover:text-zinc-200"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    enabled ? "bg-zinc-950 animate-pulse" : "bg-zinc-500"
                  )}
                />
                <span>{enabled ? "ATIVADO" : "DESATIVADO"}</span>
              </button>
            </div>

            {/* Teste Rápido de Áudio */}
            {enabled && (
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
                <span className="text-[10px] text-zinc-500">Chime harmônico de 3 notas:</span>
                <button
                  type="button"
                  onClick={handleTestarSom}
                  className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Testar Som 🔊</span>
                </button>
              </div>
            )}
          </div>

          {/* Lista de Alertas / Notificações Recentes */}
          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-900/90 p-2 space-y-1">
            {carregando && notificacoes.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                Atualizando notificações...
              </div>
            ) : notificacoes.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                <h5 className="text-xs font-bold text-zinc-300">Tudo em dia!</h5>
                <p className="text-[10px] text-zinc-500 max-w-[220px] mx-auto">
                  Nenhum sinal ou atendimento pendente no momento. Novos alertas aparecerão aqui.
                </p>
              </div>
            ) : (
              notificacoes.map((notif) => (
                <Link
                  key={notif.id}
                  href="/admin"
                  onClick={() => setIsOpen(false)}
                  className="p-2.5 rounded-xl hover:bg-zinc-900 transition-colors flex items-start gap-2.5 group block"
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                      notif.tipo === "COMPROVANTE"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : notif.tipo === "SINAL_PENDENTE"
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                    )}
                  >
                    {notif.tipo === "COMPROVANTE" ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : notif.tipo === "SINAL_PENDENTE" ? (
                      <QrCode className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "text-[11px] font-black tracking-tight truncate",
                          notif.tipo === "COMPROVANTE"
                            ? "text-emerald-400"
                            : notif.tipo === "SINAL_PENDENTE"
                            ? "text-amber-400"
                            : "text-zinc-200"
                        )}
                      >
                        {notif.titulo}
                      </span>
                      <span className="text-[9px] font-mono text-zinc-500 shrink-0">
                        {notif.hora}
                      </span>
                    </div>

                    <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
                      {notif.descricao}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Rodapé do Popover */}
          <div className="p-2.5 bg-zinc-900/90 border-t border-zinc-800 text-center">
            <Link
              href="/admin"
              onClick={() => setIsOpen(false)}
              className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center justify-center gap-1 transition-colors"
            >
              <Calendar className="w-3 h-3" />
              <span>Ver Agenda Completa</span>
              <ExternalLink className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export const NotificationBell = SoundNotificationButton;
