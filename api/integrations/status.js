export default function handler(_req, res) {
  res.status(200).json({
    openai: Boolean(process.env.OPENAI_API_KEY),
    shopify: Boolean(process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    ebay: Boolean(process.env.EBAY_ACCESS_TOKEN || process.env.EBAY_OAUTH_TOKEN),
    homeAssistant: Boolean(process.env.HOME_ASSISTANT_TOKEN && process.env.HOME_ASSISTANT_URL),
  });
}
