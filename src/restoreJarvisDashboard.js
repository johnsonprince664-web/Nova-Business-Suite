// Restores the original JARVIS dashboard layout inside the unified shell.
// The unified embed previously hid the Ask JARVIS panel and moved voice into the top bar.
const style = document.createElement("style");
style.dataset.restoreJarvisDashboard = "true";
style.textContent = `
  /* Keep the duplicate unified-shell voice control out of the top bar. */
  body:not(.jarvis-embedded-core) .topbar-actions > div:has(.jarvis-orb) {
    display: none !important;
  }

  /* Put the original Ask JARVIS card back in its dashboard position,
     directly beside the Today/weather card. These selectors intentionally
     outrank the embed overrides injected by App.jsx. */
  body.jarvis-embedded-core.jarvis-embedded-core .overview-grid {
    grid-template-columns: minmax(0, 1.15fr) minmax(330px, .85fr) !important;
  }
  body.jarvis-embedded-core.jarvis-embedded-core .command-panel {
    display: block !important;
  }

  @media (max-width: 900px) {
    body.jarvis-embedded-core.jarvis-embedded-core .overview-grid {
      grid-template-columns: 1fr !important;
    }
  }
`;
document.head.appendChild(style);
