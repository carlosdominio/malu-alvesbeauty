"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, DollarSign, Sparkles, Users, MessageSquare, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/admin", label: "Agenda", icon: Calendar },
    { href: "/admin/whatsapp", label: "Whats", icon: MessageSquare },
    { href: "/admin/financeiro", label: "Finanças", icon: DollarSign },
    { href: "/admin/servicos", label: "Serviços", icon: Sparkles },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
    { href: "/admin/horarios", label: "Horários", icon: Clock },
    { href: "/admin/config", label: "Config", icon: Settings },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-lg px-1 py-1.5 shadow-2xl">
      <div className="grid grid-cols-7 items-center justify-items-center">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-1 px-0.5 w-full rounded-xl transition-all",
                isActive
                  ? "text-amber-400 font-bold scale-105"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon className={cn("w-4 h-4 mb-0.5", isActive ? "stroke-[2.5]" : "stroke-2")} />
              <span className="text-[9px] truncate max-w-full text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
