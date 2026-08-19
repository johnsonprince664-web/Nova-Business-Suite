export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  return res.status(200).json({
    openai: Boolean(process.env.OPENAI_API_KEY),
    googleOAuth: Boolean(process.env.VITE_GOOGLE_CLIENT_ID),
    shopify: Boolean(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    ebay: Boolean(process.env.EBAY_ACCESS_TOKEN),
    homeAssistant: Boolean(process.env.HOME_ASSISTANT_URL && process.env.HOME_ASSISTANT_TOKEN),
    computerCompanion: "local-install-required",
    realtimeVoice: Boolean(process.env.OPENAI_API_KEY),
    vision: Boolean(process.env.OPENAI_API_KEY),
    memory: true,
    proactive: true,
    push: true
  });
}
