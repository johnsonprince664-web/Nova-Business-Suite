import React from "react";
import ReactDOM from "react-dom/client";
import "./jarvisUpgrades";
import "./orbVoiceEnhancements";
import "./voiceOnlyMode";
import "./computerControl";
import "./connectedIntegrations";
import "./pushSetup";
import App from "./App";
import CRMInventoryIntelligence from "./CRMInventoryIntelligence";
import "./index.css";

// Unified JARVIS shell + original Legacy CRM production entrypoint.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <CRMInventoryIntelligence />
  </React.StrictMode>
);