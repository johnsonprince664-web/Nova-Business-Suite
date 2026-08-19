const API_VERSION = "2026-07";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const domain = String(process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain || !token) return res.status(503).json({ configured: false, error: "Shopify credentials are not configured." });

  const query = `query JarvisShopSnapshot {
    shop { name currencyCode }
    products(first: 20) {
      nodes { id title totalInventory status }
    }
    orders(first: 20, reverse: true, sortKey: CREATED_AT) {
      nodes {
        id name createdAt displayFinancialStatus displayFulfillmentStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        customer { displayName email }
      }
    }
  }`;

  try {
    const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query })
    });
    const data = await response.json();
    if (!response.ok || data.errors) return res.status(response.status || 500).json({ error: data.errors?.[0]?.message || "Shopify request failed" });
    return res.status(200).json({ configured: true, apiVersion: API_VERSION, ...data.data });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Shopify connection failed" });
  }
}
