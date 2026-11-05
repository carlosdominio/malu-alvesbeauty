import { cn } from "@/lib/utils";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline" | "gold";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]";

    const sizes = {
      sm: "px-3 py-1.5 text-xs font-semibold",
      md: "px-4 py-2.5 text-sm font-semibold",
      lg: "px-6 py-3.5 text-base font-bold",
    };

    const variants = {
      primary: "bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-md shadow-amber-500/20 font-bold",
      gold: "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 shadow-lg shadow-amber-500/25 font-extrabold",
      secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/60",
      danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30",
      ghost: "hover:bg-zinc-800/60 text-zinc-300 hover:text-white",
      outline: "border border-zinc-700 hover:border-amber-500/60 text-zinc-200 hover:text-amber-400 bg-transparent",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, sizes[size], variants[variant], className)}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Carregando...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
