import React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-legacy-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-r from-gold-400 to-gold-200 px-4 py-2.5 text-legacy-950 shadow-lg shadow-gold-400/20 hover:-translate-y-0.5",
        secondary: "border border-slate-200 bg-white px-4 py-2.5 text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
        ghost: "px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
        danger: "bg-red-500 px-4 py-2.5 text-white hover:bg-red-600",
        icon: "h-10 w-10 border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800",
      },
      size: {
        default: "",
        sm: "rounded-lg px-3 py-2 text-xs",
        lg: "px-5 py-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(variants({ variant, size }), className)} {...props} />;
}
