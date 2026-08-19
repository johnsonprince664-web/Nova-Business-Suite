export default async function handler(req, res) {
  const base = String(process.env.HOME_ASSISTANT_URL || "").replace(/\/$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!base || !token) return res.status(503).json({ configured: false, error: "Home Assistant credentials are not configured." });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    if (req.method === "GET") {
      const response = await fetch(`${base}/api/states`, { headers });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.message || "Home Assistant request failed" });
      const states = (Array.isArray(data) ? data : []).slice(0, 500).map((item) => ({
        entity_id: item.entity_id,
        state: item.state,
        friendly_name: item.attributes?.friendly_name || item.entity_id,
        domain: String(item.entity_id || "").split(".")[0]
      }));
      return res.status(200).json({ configured: true, states });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const domain = String(body.domain || "").replace(/[^a-z0-9_]/g, "");
      const service = String(body.service || "").replace(/[^a-z0-9_]/g, "");
      const entityId = String(body.entity_id || "");
      if (!domain || !service || !entityId) return res.status(400).json({ error: "domain, service and entity_id are required" });
      const safeServices = new Set(["turn_on", "turn_off", "toggle", "open_cover", "close_cover", "media_play", "media_pause"]);
      if (!safeServices.has(service)) return res.status(400).json({ error: "That Home Assistant service is not allowed through JARVIS yet." });
      const response = await fetch(`${base}/api/services/${domain}/${service}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ entity_id: entityId })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.message || "Home Assistant action failed" });
      return res.status(200).json({ ok: true, result: data });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Home Assistant connection failed" });
  }
}
