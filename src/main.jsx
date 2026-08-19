import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CRMInventoryIntelligence from "./CRMInventoryIntelligence";
import JarvisPortal from "./JarvisPortal";
import "./index.css";

function JarvisLauncher() {
  return (
    <button
      type="button"
      aria-label="Open JARVIS"
      title="Open JARVIS"
      onClick={() => { window.location.href = "/?jarvis=1"; }}
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 35,
        width: 58,
        height: 58,
        borderRadius: "50%",
        border: "1px solid rgba(103,232,249,.55)",
        background: "radial-gradient(circle at 35% 30%, #67e8f9 0%, #0891b2 28%, #0f172a 72%)",
        boxShadow: "0 0 30px rgba(34,211,238,.38), 0 10px 26px rgba(15,23,42,.28)",
        color: "white",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: ".08em",
        cursor: "pointer",
      }}
    >
      JARVIS
    </button>
  );
}

const params = new URLSearchParams(window.location.search);
const jarvisMode = params.get("jarvis") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {jarvisMode ? (
      <JarvisPortal />
    ) : (
      <>
        <App />
        <CRMInventoryIntelligence />
        <JarvisLauncher />
      </>
    )}
  </React.StrictMode>
);
