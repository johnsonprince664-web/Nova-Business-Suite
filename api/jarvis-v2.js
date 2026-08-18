const ACTION_TYPES = [
  "none",
  "calendar_create",
  "calendar_search",
  "gmail_search",
  "gmail_draft",
  "business_refresh",
  "inventory_update"
];

const INVENTORY_FIELDS = [
  "qty",
  "sale_price",
  "unit_cost",
  "low_stock_threshold",
  "carat",
  "ring_size",
  "metal",
  "color",
  "supplier",
  "received_at"
];

function emptyAction() {
  return {
    type: "none",
    title: "",
    start: "",
    end: "",
    to: "",
    subject: "",
    body: "",
    query: "",
    reason: "",
    inventory_id: "",
    inventory_query: "",
    field: "qty",
    new_value: "",
    old_value: ""
  };
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function fallbackReply(message, context = {}) {
  const lower = String(message || "").toLowerCase();
  const business = context.business || {};
  const weather = context.weather || {};
  if (/weather|temperature|rain|forecast/.test(lower) && weather.temperature != null) {
    return `It is ${Math.round(weather.temperature)}°${weather.unit || "F"}. ${weather.rainChance != null ? `Rain chance is about ${Math.round(weather.rainChance)}%.` : ""}`.trim();
  }
  if (/revenue|sales|profit|business|legacy/.test(lower) && business.connected) {
    return `Legacy Jewelry is connected. This month shows ${business.monthRevenueFormatted || "$0"} in recorded sales, ${business.monthProfitFormatted || "$0"} estimated gross profit, and ${business.inventoryUnits || 0} units on hand.`;
  }
  if (/inventory|stock|reorder/.test(lower) && business.connected) {
    return `You currently have ${business.inventoryUnits || 0} units across ${business.inventoryStyles || 0} inventory records, with ${business.lowStockCount || 0} at or below their low-stock threshold.`;
  }
  return "JARVIS is online, but full generative reasoning is temporarily unavailable. I did not change any CRM data.";
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return res.status(400).json({ error: "Invalid JSON request" });
  }

  const message = String(body.message || "").trim().slice(0, 6000);
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  if (!message) return res.status(400).json({ error: "Message required" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(200).json({ reply: fallbackReply(message, context), intent: "local_fallback", action: emptyAction(), poweredBy: "local" });
  }

  const safeContext = {
    now: context.now || new Date().toISOString(),
    timezone: context.timezone || "America/New_York",
    weather: context.weather || null,
    business: context.business || null,
    inventory: Array.isArray(context.inventory) ? context.inventory.slice(0, 200).map((item) => ({
      id: String(item.id || ""),
      product: String(item.product || "").slice(0, 180),
      sku: String(item.sku || "").slice(0, 120),
      color: String(item.color || "").slice(0, 80),
      metal: String(item.metal || "").slice(0, 80),
      carat: item.carat ?? null,
      ring_size: String(item.ring_size || "").slice(0, 40),
      supplier: String(item.supplier || "").slice(0, 120),
      received_at: item.received_at || null,
      qty: Number(item.qty || 0),
      low_stock_threshold: Number(item.low_stock_threshold ?? 1),
      unit_cost: Number(item.unit_cost || 0),
      sale_price: Number(item.sale_price || 0)
    })) : [],
    calendar: Array.isArray(context.calendar) ? context.calendar.slice(0, 12) : [],
    inbox: Array.isArray(context.inbox) ? context.inbox.slice(0, 12) : [],
    memories: Array.isArray(context.memories) ? context.memories.slice(0, 16).map((memory) => ({
      kind: String(memory.kind || "general"),
      content: String(memory.content || "").slice(0, 600)
    })) : [],
    connections: context.connections || {},
    extensions: context.extensions || {}
  };

  const historyText = history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => `${item.role.toUpperCase()}: ${String(item.content || "").slice(0, 1200)}`)
    .join("\n");

  const instructions = `You are JARVIS, the private operating-system assistant inside Legacy Jewelry Co.'s CRM. The JARVIS interface and the manual Legacy CRM are two views of the SAME live Supabase records. Never describe them as separate inventories.

You can reason across the supplied Legacy business data, exact inventory rows, calendar, Gmail summaries, weather, persistent memories and connected system state.

Inventory write rules:
- The user is allowed to update their Legacy inventory through JARVIS when they explicitly ask.
- For an explicit inventory edit, use action.type=inventory_update.
- inventory_update may change exactly ONE existing row and exactly ONE of these fields: ${INVENTORY_FIELDS.join(", ")}.
- Use field=qty for stock count/quantity/on-hand changes.
- Use field=sale_price for selling/list price, unit_cost for cost, low_stock_threshold for reorder/low-stock threshold, carat for carat weight, ring_size for ring size, metal for metal, color for color, supplier for supplier, and received_at for received date.
- Inspect context.inventory and use the exact inventory_id whenever the request uniquely identifies one row. Also include a human-readable inventory_query.
- new_value must contain the requested value as a string. old_value must contain the currently supplied value as a string.
- Never invent an ID or old value. If multiple rows could match, do NOT propose the action. Explain which detail is needed, such as SKU, metal/color, carat, or ring size.
- Do not use inventory_update to delete a row, rename a product/SKU, create stock, create a sale, or make financial transfers.
- If the user merely asks what a value is, answer it without an action.

Other action rules:
- Never claim an external action happened unless it is already in supplied context.
- Calendar creation and Gmail drafts require the client approval flow.
- Never propose sending money, purchasing, deleting data, deleting emails, or destructive actions.
- For calendar_create, produce ISO-8601 start/end timestamps with offsets. Default to 60 minutes if duration is omitted.
- For gmail_draft, draft only; do not imply it was sent.
- For calendar_search or gmail_search, put the search phrase in query.
- If no action is needed, use type=none.
- Prefer concise, natural answers. Do not expose raw private context.

Current app context:\n${JSON.stringify(safeContext)}\n\nRecent conversation:\n${historyText || "None"}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["reply", "intent", "action"],
    properties: {
      reply: { type: "string" },
      intent: { type: "string" },
      action: {
        type: "object",
        additionalProperties: false,
        required: ["type", "title", "start", "end", "to", "subject", "body", "query", "reason", "inventory_id", "inventory_query", "field", "new_value", "old_value"],
        properties: {
          type: { type: "string", enum: ACTION_TYPES },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          query: { type: "string" },
          reason: { type: "string" },
          inventory_id: { type: "string" },
          inventory_query: { type: "string" },
          field: { type: "string", enum: INVENTORY_FIELDS },
          new_value: { type: "string" },
          old_value: { type: "string" }
        }
      }
    }
  };

  const needsWeb = /\b(latest|current|news|search the web|look up|online|release|score|weather alert)\b/i.test(message);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        instructions,
        input: message,
        store: false,
        text: {
          verbosity: "medium",
          format: { type: "json_schema", name: "jarvis_crm_response", strict: true, schema }
        },
        ...(needsWeb ? { tools: [{ type: "web_search" }] } : {})
      })
    });

    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {
      console.error("JARVIS OpenAI non-JSON response", response.status, raw.slice(0, 500));
      return res.status(200).json({ reply: fallbackReply(message, context), intent: "api_parse_fallback", action: emptyAction(), poweredBy: "local", warning: "AI returned an unreadable response" });
    }

    if (!response.ok) {
      console.error("JARVIS OpenAI error", response.status, data?.error?.message || "Unknown error");
      return res.status(200).json({ reply: fallbackReply(message, context), intent: "api_fallback", action: emptyAction(), poweredBy: "local", warning: data?.error?.message || "AI unavailable" });
    }

    const output = extractOutputText(data);
    let parsed;
    try { parsed = JSON.parse(output || "{}"); } catch {
      console.error("JARVIS structured parse failure", output.slice(0, 500));
      return res.status(200).json({ reply: fallbackReply(message, context), intent: "structured_parse_fallback", action: emptyAction(), poweredBy: data.model || "openai" });
    }

    const action = parsed.action && ACTION_TYPES.includes(parsed.action.type)
      ? { ...emptyAction(), ...parsed.action }
      : emptyAction();

    return res.status(200).json({
      reply: String(parsed.reply || "I'm online."),
      intent: String(parsed.intent || "conversation"),
      action,
      poweredBy: data.model || process.env.OPENAI_MODEL || "gpt-5.6"
    });
  } catch (error) {
    console.error("JARVIS v2 failure", error);
    return res.status(200).json({ reply: fallbackReply(message, context), intent: "error_fallback", action: emptyAction(), poweredBy: "local", warning: "JARVIS fell back safely" });
  }
}
