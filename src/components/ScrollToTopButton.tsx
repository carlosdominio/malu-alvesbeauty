"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== "undefined") {
        setIsVisible(window.scrollY > 260);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={cn(
        "fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-30",
        "w-11 h-11 rounded-2xl bg-zinc-950/90 border border-amber-500/40 text-amber-400",
        "hover:bg-amber-500 hover:text-zinc-950 hover:border-amber-400",
        "shadow-xl shadow-black/60 backdrop-blur-md transition-all duration-200 active:scale-90",
        "flex items-center justify-center group animate-in fade-in zoom-in-75"
      )}
      title="Voltar ao topo"
      aria-label="Voltar ao topo da página"
    >
      <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
    </button>
  );
}
