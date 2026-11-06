"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextData {
  showToast: (toast: Omit<ToastMessage, "id">) => void;
  toastSuccess: (title: string, message?: string) => void;
  toastError: (title: string, message?: string) => void;
  toastWarning: (title: string, message?: string) => void;
  toastInfo: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextData>({} as ToastContextData);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastMessage, "id">) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const newToast: ToastMessage = { id, type, title, message, duration };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const toastSuccess = useCallback(
    (title: string, message?: string) => showToast({ type: "success", title, message }),
    [showToast]
  );

  const toastError = useCallback(
    (title: string, message?: string) => showToast({ type: "error", title, message }),
    [showToast]
  );

  const toastWarning = useCallback(
    (title: string, message?: string) => showToast({ type: "warning", title, message }),
    [showToast]
  );

  const toastInfo = useCallback(
    (title: string, message?: string) => showToast({ type: "info", title, message }),
    [showToast]
  );

  return (
    <ToastContext.Provider
      value={{ showToast, toastSuccess, toastError, toastWarning, toastInfo }}
    >
      {children}

      {/* Floating Toasts Container (Mobile-Optimized & Desktop) */}
      <div className="fixed top-3 left-3 right-3 sm:left-auto sm:right-4 sm:top-4 z-50 flex flex-col gap-2 sm:max-w-sm pointer-events-none">
        {toasts.map((toast) => {
          const isSuccess = toast.type === "success";
          const isError = toast.type === "error";
          const isWarning = toast.type === "warning";

          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border shadow-2xl backdrop-blur-md flex items-start gap-2.5 sm:gap-3 animate-in slide-in-from-top-2 fade-in duration-200 transition-all",
                isSuccess && "bg-zinc-950/95 border-emerald-500/40 text-zinc-100 shadow-emerald-950/30",
                isError && "bg-zinc-950/95 border-red-500/40 text-zinc-100 shadow-red-950/30",
                isWarning && "bg-zinc-950/95 border-amber-500/40 text-zinc-100 shadow-amber-950/30",
                !isSuccess && !isError && !isWarning && "bg-zinc-950/95 border-zinc-700/80 text-zinc-100 shadow-black/50"
              )}
            >
              {/* Icon */}
              <div className="shrink-0 mt-0.5">
                {isSuccess && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />}
                {isError && <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />}
                {isWarning && <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0 pr-1">
                <h5 className="text-xs sm:text-xs font-black tracking-tight text-white truncate">
                  {toast.title}
                </h5>
                {toast.message && (
                  <p className="text-[11px] sm:text-xs text-zinc-300/90 mt-0.5 leading-snug line-clamp-2">
                    {toast.message}
                  </p>
                )}
              </div>

              {/* Close button */}
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0 -mr-1 -mt-0.5"
                title="Fechar notificação"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
