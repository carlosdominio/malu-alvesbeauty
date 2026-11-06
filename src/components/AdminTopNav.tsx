"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  DollarSign,
  Sparkles,
  Users,
  MessageSquare,
  Clock,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminTopNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/admin", label: "Agenda", icon: Calendar },
    { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
    { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
    { href: "/admin/servicos", label: "Serviços", icon: Sparkles },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
    { href: "/admin/horarios", label: "Horários", icon: Clock },
    { href: "/admin/config", label: "Configurações", icon: Settings },
  ];

  return (
    <div className="md:hidden sticky top-16 z-30 bg-zinc-950/95 border-b border-zinc-850/80 backdrop-blur-md py-2.5 px-3">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all select-none shrink-0",
                isActive
                  ? "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-zinc-950 shadow-md shadow-amber-500/25 scale-[1.02]"
                  : "bg-zinc-900/90 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-850 active:scale-95"
              )}
            >
              <Icon
                className={cn(
                  "w-3.5 h-3.5",
                  isActive ? "stroke-[2.5] text-zinc-950" : "text-amber-500"
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
