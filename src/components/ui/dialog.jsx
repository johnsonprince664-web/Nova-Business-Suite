import React, { useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../../lib/utils";

export function Dialog({ open, onOpenChange, title, description, children, className }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onOpenChange?.(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999]" role="presentation">
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange?.(false)}
          />

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={title || "Dialog"}
              className={cn(
                "pointer-events-auto relative my-auto flex max-h-[calc(100vh-1.5rem)] w-[min(720px,96vw)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100vh-3rem)]",
                className
              )}
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700 sm:px-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h2>
                  {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
                <button
                  type="button"
                  aria-label="Close dialog"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => onOpenChange?.(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
