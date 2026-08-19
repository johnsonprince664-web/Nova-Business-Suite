import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CRMInventoryIntelligence from "./CRMInventoryIntelligence";
import JarvisPortal from "./JarvisPortal";
import JarvisDock from "./JarvisDock";
import "./index.css";

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
        <JarvisDock />
      </>
    )}
  </React.StrictMode>
);
