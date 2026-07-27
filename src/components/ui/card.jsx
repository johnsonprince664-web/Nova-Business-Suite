import React from "react";
import { cn } from "../../lib/utils";

export function Card({ className, children }) {
  return (
    <div className={cn(
      "rounded-2xl border border-slate-200/80 bg-white shadow-soft dark:border-slate-700/70 dark:bg-slate-900",
      className
    )}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }) {
  return <div className={cn("flex items-start justify-between gap-4 p-5 pb-3", className)}>{children}</div>;
}

export function CardContent({ className, children }) {
  return <div className={cn("p-5 pt-2", className)}>{children}</div>;
}
