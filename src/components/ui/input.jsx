import React from "react";
import { cn } from "../../lib/utils";

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-legacy-400 focus:ring-4 focus:ring-legacy-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-legacy-900",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-legacy-400 focus:ring-4 focus:ring-legacy-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-legacy-900",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-legacy-400 focus:ring-4 focus:ring-legacy-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-legacy-900",
        className
      )}
      {...props}
    />
  );
}
