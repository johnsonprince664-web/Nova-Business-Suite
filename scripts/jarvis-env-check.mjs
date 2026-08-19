import { writeFileSync, mkdirSync } from "node:fs";

const status = {
  openai: Boolean(process.env.OPENAI_API_KEY),
  googleOAuth: Boolean(process.env.VITE_GOOGLE_CLIENT_ID),
  shopify: Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
  ebay: Boolean(process.env.EBAY_ACCESS_TOKEN),
  homeAssistant: Boolean(process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN),
  builtAt: new Date().toISOString()
};

console.log(`[JARVIS_ENV] OPENAI_API_KEY=${status.openai ? "present" : "missing"}`);
console.log(`[JARVIS_ENV] VITE_GOOGLE_CLIENT_ID=${status.googleOAuth ? "present" : "missing"}`);
console.log(`[JARVIS_ENV] SHOPIFY=${status.shopify ? "configured" : "not-configured"}`);
console.log(`[JARVIS_ENV] EBAY=${status.ebay ? "configured" : "not-configured"}`);
console.log(`[JARVIS_ENV] HOME_ASSISTANT=${status.homeAssistant ? "configured" : "not-configured"}`);

mkdirSync("public", { recursive: true });
writeFileSync("public/jarvis-build-status.json", JSON.stringify(status, null, 2));
