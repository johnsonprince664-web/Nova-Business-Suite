import { supabase } from "./lib/supabase";

const originalFetch = window.fetch.bind(window);
const ALLOWED_FIELDS = new Set([
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
]);

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
}

function displayField(field) {
  return {
    qty: "stock quantity",
    sale_price: "sale price",
    unit_cost: "unit cost",
    low_stock_threshold: "low-stock threshold",
    carat: "carat",
    ring_size: "ring size",
    metal: "metal",
    color: "color",
    supplier: "supplier",
    received_at: "received date"
  }[field] || field;
}

function parseValue(field, value) {
  if (["qty", "low_stock_threshold"].includes(field)) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number) || number < 0) throw new Error(`${displayField(field)} must be zero or more.`);
    return number;
  }
  if (["sale_price", "unit_cost", "carat"].includes(field)) {
    const number = Number(String(value).replace(/[$,]/g, ""));
    if (!Number.isFinite(number) || number < 0) throw new Error(`${displayField(field)} must be a valid non-negative number.`);
    return number;
  }
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${displayField(field)} cannot be blank.`);
  if (field === "received_at" && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Received date must use YYYY-MM-DD.");
  return text.slice(0, 180);
}

async function getBusiness(userId) {
  const result = await supabase.from("legacy_businesses").select("id,name").eq("owner_id", userId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Legacy Jewelry business record was not found.");
  return result.data;
}

async function getInventory(businessId) {
  const result = await supabase.from("legacy_inventory").select("*").eq("business_id", businessId);
  if (result.error) throw result.error;
  return result.data || [];
}

function resolveInventory(action, rows) {
  if (action.inventory_id) {
    const exact = rows.filter((row) => row.id === action.inventory_id);
    if (exact.length === 1) return exact[0];
  }
  const query = normalize(action.inventory_query);
  if (!query) throw new Error("Tell me which inventory item you want changed.");
  const pieces = query.split(" ").filter(Boolean);
  const matches = rows.filter((row) => {
    const haystack = normalize([
      row.product,
      row.sku,
      row.color,
      row.metal,
      row.carat,
      row.ring_size,
      row.supplier
    ].filter(Boolean).join(" "));
    return haystack.includes(query) || pieces.every((piece) => haystack.includes(piece));
  });
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`I couldn't find a unique CRM inventory match for “${action.inventory_query}”.`);
  throw new Error(`I found ${matches.length} matching inventory rows. Include the SKU, metal/color, carat, or ring size so I change the right one.`);
}

async function executeInventoryAction(action) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) throw new Error("Sign in before JARVIS changes CRM data.");

  const field = String(action.field || "qty");
  if (!ALLOWED_FIELDS.has(field)) throw new Error(`JARVIS is not allowed to change the ${field || "requested"} field yet.`);

  const business = await getBusiness(user.id);
  const rows = await getInventory(business.id);
  const item = resolveInventory(action, rows);
  const oldValue = item[field];
  const newValue = parseValue(field, action.new_value ?? action.new_quantity);

  const result = await supabase
    .from("legacy_inventory")
    .update({ [field]: newValue })
    .eq("id", item.id)
    .eq("business_id", business.id)
    .select("*")
    .single();
  if (result.error) throw result.error;

  try {
    await supabase.from("jarvis_activity").insert({
      user_id: user.id,
      action_type: "inventory_update",
      title: `Updated ${item.product}`,
      detail: `${displayField(field)}: ${oldValue ?? "—"} → ${newValue}`,
      status: "completed",
      metadata: { inventory_id: item.id, field, old_value: oldValue, new_value: newValue }
    });
  } catch {
    // CRM update is authoritative even if the optional activity log schema differs.
  }

  window.dispatchEvent(new CustomEvent("jarvis:crm-updated", { detail: { table: "legacy_inventory", id: item.id, field, value: newValue } }));

  const unit = field === "sale_price" || field === "unit_cost" ? `$${Number(newValue).toFixed(2)}` : String(newValue);
  return `Done. ${item.product}${item.sku ? ` (${item.sku})` : ""} ${displayField(field)} is now ${unit}. The manual CRM and JARVIS are editing the same Legacy record.`;
}

function jsonResponse(payload, response) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    statusText: "OK",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Jarvis-Bridge": "legacy-crm",
      ...(response?.headers?.get("X-Vercel-Id") ? { "X-Vercel-Id": response.headers.get("X-Vercel-Id") } : {})
    }
  });
}

window.fetch = async function jarvisAwareFetch(input, init) {
  const requestUrl = typeof input === "string" ? input : input?.url;
  if (!requestUrl || !/\/api\/jarvis(?:\?|$)/.test(requestUrl)) return originalFetch(input, init);

  const upgradedUrl = requestUrl.replace(/\/api\/jarvis(?=\?|$)/, "/api/jarvis-v2");
  let response;
  try {
    response = await originalFetch(upgradedUrl, init);
  } catch (error) {
    return jsonResponse({ reply: `I couldn't reach the JARVIS service: ${error.message || "network error"}.`, intent: "bridge_error", action: { type: "none" }, poweredBy: "JARVIS" });
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return jsonResponse({
      reply: "I received an unreadable server response instead of JSON. I did not change any CRM data.",
      intent: "bridge_parse_error",
      action: { type: "none" },
      poweredBy: "JARVIS",
      warning: raw.slice(0, 160)
    }, response);
  }

  if (!response.ok) {
    return jsonResponse({
      reply: data?.error ? `I couldn't complete that: ${data.error}` : "JARVIS is temporarily unavailable.",
      intent: "bridge_http_error",
      action: { type: "none" },
      poweredBy: data?.poweredBy || "JARVIS"
    }, response);
  }

  if (data?.action?.type === "inventory_update") {
    try {
      const reply = await executeInventoryAction(data.action);
      return jsonResponse({ ...data, reply, action: { type: "none" }, intent: "inventory_update_completed" }, response);
    } catch (error) {
      return jsonResponse({
        ...data,
        reply: `I didn't change anything: ${error.message || "the inventory update failed"}`,
        action: { type: "none" },
        intent: "inventory_update_blocked"
      }, response);
    }
  }

  return jsonResponse(data, response);
};

window.JARVIS_CRM_BRIDGE = { executeInventoryAction };
