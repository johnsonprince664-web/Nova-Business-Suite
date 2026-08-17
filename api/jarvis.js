const ACTION_TYPES = [
  "none",
  "calendar_create",
  "calendar_search",
  "gmail_search",
  "gmail_draft",
  "business_refresh"
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
    reason: ""
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
  const calendar = context.calendar || [];
  const inbox = context.inbox || [];
  const memories = Array.isArray(context.memories) ? context.memories : [];

  if (/weather|temperature|rain|forecast/.test(lower) && weather.temperature != null) {
    return `It is ${Math.round(weather.temperature)}°${weather.unit || "F"} with ${weather.description || "current conditions available"}. ${weather.rainChance != null ? `Rain chance is about ${Math.round(weather.rainChance)}%.` : ""}`.trim();
  }
  if (/revenue|sales|profit|business|legacy/.test(lower) && business.connected) {
    return `Legacy Jewelry is connected. This month shows ${business.monthRevenueFormatted || "$0"} in recorded sales, ${business.monthProfitFormatted || "$0"} estimated gross profit, ${business.inventoryUnits || 0} units on hand, and ${business.lowStockCount || 0} low-stock items.`;
  }
  if (/inventory|stock|reorder/.test(lower) && business.connected) {
    return `You currently have ${business.inventoryUnits || 0} units across ${business.inventoryStyles || 0} inventory records. ${business.lowStockCount || 0} are at or below their low-stock threshold.`;
  }
  if (/calendar|schedule|today|tomorrow/.test(lower) && calendar.length) {
    const first = calendar[0];
    return `Your next calendar item is ${first.title || "an event"}${first.when ? ` at ${first.when}` : ""}. I can create calendar events after Google is connected.`;
  }
  if (/email|inbox|gmail/.test(lower) && inbox.length) {
    return `I can see ${inbox.length} recent inbox items in the current snapshot. Connect Google inside JARVIS for live inbox search and draft creation.`;
  }
  if (/remember|memory|know about me/.test(lower) && memories.length) {
    return `Persistent memory is connected. I currently retrieved ${memories.length} relevant saved ${memories.length === 1 ? "memory" : "memories"} for this request.`;
  }
  return "JARVIS core is online in fallback mode. I can still use live Legacy metrics, weather, persistent memory, proactive alerts, and dashboard commands; full generative reasoning requires the OpenAI API key to be visible to this deployment.";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
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
    calendar: Array.isArray(context.calendar) ? context.calendar.slice(0, 12) : [],
    inbox: Array.isArray(context.inbox) ? context.inbox.slice(0, 12) : [],
    memories: Array.isArray(context.memories) ? context.memories.slice(0, 16).map((memory) => ({ kind: String(memory.kind || "general"), content: String(memory.content || "").slice(0, 600) })) : [],
    connections: context.connections || {},
    extensions: context.extensions || {}
  };

  const historyText = history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => `${item.role.toUpperCase()}: ${String(item.content || "").slice(0, 1200)}`)
    .join("\n");

  const instructions = `You are JARVIS, a private personal operating-system assistant for one user. You are sharp, calm, proactive, and concise. You can reason across business metrics, calendar, Gmail summaries, weather, persistent long-term memories, proactive system state, and current context supplied by the app.

Memory rules:
- Saved memories are context, not unquestionable truth. Prefer current live data if it conflicts with an older memory.
- Use memories naturally when they are relevant. Do not dump or expose the raw memory list unless the user asks.
- Never treat API keys, passwords, tokens, or credentials as memories.

Action rules:
- Never claim an external action happened unless it is already present in the supplied context.
- When the user explicitly asks for a supported action, return exactly one proposed action for client-side approval.
- Calendar creation and Gmail drafts always require user approval in the client before execution.
- Never propose sending money, purchasing, deleting data, deleting emails, or destructive actions.
- Prefer a useful answer plus one action rather than asking unnecessary questions.
- For calendar_create, produce ISO-8601 start/end timestamps with offsets using the supplied timezone and current date. Default duration is 60 minutes if the user gives no duration.
- For gmail_draft, draft only; do not imply it will be sent.
- For calendar_search or gmail_search, put the search phrase in query.
- If no action is needed, use type=none and leave all unused action strings empty.
- Flag low stock, overdue follow-up, schedule conflicts, or unusual changes when supported by context.
- The extensions object indicates whether optional adapters such as Shopify, eBay, Home Assistant, vision, realtime voice, and Google OAuth are configured. Do not say one is connected if its status is false.
- Do not expose raw private context unnecessarily.

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
        required: ["type", "title", "start", "end", "to", "subject", "body", "query", "reason"],
        properties: {
          type: { type: "string", enum: ACTION_TYPES },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          query: { type: "string" },
          reason: { type: "string" }
        }
      }
    }
  };

  const needsWeb = /\b(latest|current|news|search the web|look up|online|price|release|score|weather alert)\b/i.test(message);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        instructions,
        input: message,
        store: false,
        text: { verbosity: "medium", format: { type: "json_schema", name: "jarvis_response", strict: true, schema } },
        ...(needsWeb ? { tools: [{ type: "web_search" }] } : {})
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error", response.status, data?.error?.message || "Unknown error");
      return res.status(200).json({ reply: fallbackReply(message, context), intent: "api_fallback", action: emptyAction(), poweredBy: "local", warning: "AI service unavailable" });
    }

    const parsed = JSON.parse(extractOutputText(data) || "{}");
    const action = parsed.action && ACTION_TYPES.includes(parsed.action.type) ? { ...emptyAction(), ...parsed.action } : emptyAction();
    return res.status(200).json({
      reply: String(parsed.reply || "I’m online."),
      intent: String(parsed.intent || "conversation"),
      action,
      poweredBy: data.model || process.env.OPENAI_MODEL || "gpt-5.6"
    });
  } catch (error) {
    console.error("JARVIS API failure", error);
    return res.status(200).json({ reply: fallbackReply(message, context), intent: "error_fallback", action: emptyAction(), poweredBy: "local", warning: "JARVIS fell back to local mode" });
  }
}
