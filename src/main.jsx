import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CRMInventoryIntelligence from "./CRMInventoryIntelligence";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");

// The classic/embedded Legacy CRM must keep its original browser interaction
// environment. JARVIS enhancement modules patch browser APIs and global DOM
// behavior, so only load them for the unified/JARVIS shell — never inside
// ?mode=legacy CRM screens.
if (mode !== "legacy") {
  void import("./jarvisUpgrades");
  void import("./orbVoiceEnhancements");
  void import("./voiceOnlyMode");
  void import("./computerControl");
  void import("./connectedIntegrations");
  void import("./pushSetup");
  void import("./jarvisCrmBridge");
  void import("./restoreJarvisDashboard");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <CRMInventoryIntelligence />
  </React.StrictMode>
);
