import React from "react";
import ReactDOM from "react-dom/client";
import "./jarvisUpgrades";
import "./computerControl";
import "./connectedIntegrations";
import App from "./App";
import CRMInventoryIntelligence from "./CRMInventoryIntelligence";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <CRMInventoryIntelligence />
  </React.StrictMode>
);
