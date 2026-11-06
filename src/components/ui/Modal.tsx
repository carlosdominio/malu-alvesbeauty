"use client";

import { X } from "lucide-react";
import React, { useEffect } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  maxWidth = "md",
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto overflow-x-hidden">
      {/* Backdrop com blur sofisticado */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Caixa do Diálogo com Brilho Superior e Bordas Arredondadas */}
      <div
        className={cn(
          "relative w-full bg-zinc-900/95 border border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-black/90 z-10 max-h-[92vh] overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-200",
          maxWidthClasses[maxWidth]
        )}
      >
        {/* Luz Ambiente Dourada no Topo (contida para não gerar scroll horizontal) */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute top-0 left-0 -mt-12 -ml-12 w-44 h-44 bg-amber-500/5 rounded-full blur-3xl" />
        </div>

        {/* Cabeçalho do Modal */}
        <div className="flex items-start justify-between gap-3 pb-3 sm:pb-4 border-b border-zinc-800/80 relative">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                {title}
              </h3>
              {description && (
                <p className="text-xs text-zinc-400 mt-0.5 leading-snug sm:leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-all border border-zinc-700/60 shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="pt-3 sm:pt-4 relative">{children}</div>
      </div>
    </div>
  );
}
