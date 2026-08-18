import React, { useEffect, useState } from "react";
import { BrainCircuit, X } from "lucide-react";
import JarvisCore from "./JarvisCore";

export default function LegacyJarvisOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open JARVIS"
          title="Open JARVIS"
          style={{
            position: "fixed",
            left: "calc(18rem + 18px)",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 45,
            width: 58,
            height: 58,
            borderRadius: "999px",
            border: "1px solid rgba(34,211,238,.45)",
            background: "radial-gradient(circle at 35% 30%, rgba(103,232,249,.95), rgba(8,145,178,.9) 35%, rgba(15,23,42,.96) 74%)",
            color: "white",
            display: "grid",
            placeItems: "center",
            boxShadow: "0 0 0 5px rgba(34,211,238,.08), 0 0 34px rgba(34,211,238,.42), 0 12px 34px rgba(15,23,42,.3)",
            cursor: "pointer"
          }}
        >
          <BrainCircuit size={25} />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="JARVIS assistant"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(2,6,23,.78)",
            backdropFilter: "blur(10px)",
            padding: 12,
            overflow: "auto"
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close JARVIS"
            title="Close JARVIS"
            style={{
              position: "fixed",
              right: 20,
              top: 18,
              zIndex: 100,
              width: 42,
              height: 42,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(15,23,42,.9)",
              color: "white",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              boxShadow: "0 10px 30px rgba(0,0,0,.3)"
            }}
          >
            <X size={20} />
          </button>

          <div style={{ minHeight: "calc(100vh - 24px)", borderRadius: 24, overflow: "hidden" }}>
            <JarvisCore />
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 1023px) {
          button[aria-label="Open JARVIS"] {
            left: 16px !important;
            top: auto !important;
            bottom: 18px !important;
            transform: none !important;
          }
        }
      `}</style>
    </>
  );
}
