"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, DollarSign, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  // Os 4 botões mais importantes para a operação diária no mobile
  const items = [
    { href: "/admin", label: "Agenda", icon: Calendar },
    { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
    { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-lg px-2 py-1.5 shadow-2xl safe-area-pb">
      <div className="grid grid-cols-4 items-center justify-items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 w-full rounded-2xl transition-all select-none",
                isActive
                  ? "text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/20 scale-105"
                  : "text-zinc-400 hover:text-zinc-200 active:scale-95"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 mb-0.5 transition-transform",
                  isActive ? "stroke-[2.5] scale-110" : "stroke-2"
                )}
              />
              <span className="text-[11px] truncate max-w-full text-center leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
