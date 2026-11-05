"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, DollarSign, Scissors, Users, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/admin", label: "Agenda", icon: Calendar },
    { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
    { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
    { href: "/admin/servicos", label: "Serviços", icon: Scissors },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 border-t border-zinc-800/80 backdrop-blur-lg px-2 py-1.5 shadow-2xl">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2.5 rounded-2xl transition-all",
                isActive
                  ? "text-amber-400 font-bold scale-105"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              <Icon className={cn("w-5 h-5 mb-0.5", isActive ? "stroke-[2.5]" : "stroke-2")} />
              <span className="text-[10px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
