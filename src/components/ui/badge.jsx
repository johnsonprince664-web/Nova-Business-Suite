import React from "react";
import { cn } from "../../lib/utils";

const tones = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  gold: "bg-gold-100 text-gold-700 dark:bg-gold-500/15 dark:text-gold-300",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

export function Badge({ tone = "slate", className, children }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
