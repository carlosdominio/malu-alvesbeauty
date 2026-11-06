"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Calendar, DollarSign, Users, Clock, Settings, MessageSquare, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { PWAInstallButton } from "./PWAInstallButton";
import { SoundNotificationButton } from "./SoundNotificationButton";

interface HeaderProps {
  nomeBarbearia?: string;
  isAdmin?: boolean;
}

export function Header({ nomeBarbearia = "Studio Malu Alves Beauty", isAdmin = false }: HeaderProps) {
  const pathname = usePathname();

  const navLinks = [
    { href: "/admin", label: "Agenda", icon: Calendar },
    { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageSquare },
    { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
    { href: "/admin/servicos", label: "Serviços", icon: Sparkles },
    { href: "/admin/clientes", label: "Clientes", icon: Users },
    { href: "/admin/horarios", label: "Horários", icon: Clock },
    { href: "/admin/config", label: "Config", icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <Link href={isAdmin ? "/admin" : "/"} className="flex items-center gap-2.5 group">
          <img
            src="/logo.jpg"
            alt="Logo Studio Malu Alves Beauty"
            className="w-10 h-10 rounded-full object-cover border border-amber-500/40 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform"
          />
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-zinc-100 group-hover:text-amber-400 transition-colors">
              {nomeBarbearia}
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-widest text-amber-500">
              {isAdmin ? "Painel de Controle" : "Studio de Sobrancelhas"}
            </p>
          </div>
        </Link>

        {/* Desktop Navigation for Admin */}
        {isAdmin && (
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all",
                    isActive
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <PWAInstallButton />
              <SoundNotificationButton />
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("malu_admin_auth");
                  document.cookie = "malu_admin_auth=; path=/; max-age=0";
                  window.location.href = "/admin/login";
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-zinc-800 transition-colors"
                title="Sair do Painel"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Sair</span>
              </button>
            </div>
          ) : (
            <Link
              href="/admin"
              className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-xl hover:bg-zinc-900 transition-colors"
            >
              Área do Dono
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
