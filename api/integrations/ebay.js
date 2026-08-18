export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const token = process.env.EBAY_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ configured: false, error: "eBay OAuth access token is not configured." });

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };
  try {
    const [inventoryResponse, ordersResponse] = await Promise.all([
      fetch("https://api.ebay.com/sell/inventory/v1/inventory_item?limit=50", { headers }),
      fetch("https://api.ebay.com/sell/fulfillment/v1/order?limit=50", { headers })
    ]);
    const inventory = await inventoryResponse.json();
    const orders = await ordersResponse.json();
    if (!inventoryResponse.ok && !ordersResponse.ok) {
      return res.status(502).json({ error: inventory?.errors?.[0]?.message || orders?.errors?.[0]?.message || "eBay request failed" });
    }
    return res.status(200).json({
      configured: true,
      inventory: inventoryResponse.ok ? inventory.inventoryItems || [] : [],
      inventoryWarning: inventoryResponse.ok ? null : inventory?.errors?.[0]?.message,
      orders: ordersResponse.ok ? orders.orders || [] : [],
      ordersWarning: ordersResponse.ok ? null : orders?.errors?.[0]?.message
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || "eBay connection failed" });
  }
}
