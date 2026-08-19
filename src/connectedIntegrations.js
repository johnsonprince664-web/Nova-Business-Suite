const fetchNative = window.fetch.bind(window);

function show(title, text) {
  if (window.JARVIS_EXTENSIONS?.openExtensionPanel) window.JARVIS_EXTENSIONS.openExtensionPanel(title, text);
  else alert(`${title}\n\n${text}`);
}

function money(value, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value || 0)); }
  catch { return `$${Number(value || 0).toFixed(2)}`; }
}

async function openShops() {
  show("Shops", "Loading connected selling channels…");
  const [shopifyRes, ebayRes] = await Promise.allSettled([
    fetchNative("/api/integrations/shopify"),
    fetchNative("/api/integrations/ebay")
  ]);
  const sections = [];

  if (shopifyRes.status === "fulfilled") {
    const res = shopifyRes.value;
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const orders = data.orders?.nodes || [];
      const products = data.products?.nodes || [];
      const revenue = orders.reduce((sum, order) => sum + Number(order.totalPriceSet?.shopMoney?.amount || 0), 0);
      const currency = orders[0]?.totalPriceSet?.shopMoney?.currencyCode || data.shop?.currencyCode || "USD";
      sections.push(`SHOPIFY — ${data.shop?.name || "Connected"}\nRecent orders: ${orders.length}\nRecent order value: ${money(revenue, currency)}\nProducts loaded: ${products.length}\nLow inventory: ${products.filter((p) => Number(p.totalInventory || 0) <= 2).length}`);
    } else sections.push(`SHOPIFY — ${data.error || "Setup needed"}\nAdd SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN in Vercel.`);
  }

  if (ebayRes.status === "fulfilled") {
    const res = ebayRes.value;
    const data = await res.json().catch(() => ({}));
    if (res.ok) sections.push(`EBAY — Connected\nInventory items loaded: ${(data.inventory || []).length}\nOrders loaded: ${(data.orders || []).length}${data.inventoryWarning ? `\nInventory warning: ${data.inventoryWarning}` : ""}${data.ordersWarning ? `\nOrders warning: ${data.ordersWarning}` : ""}`);
    else sections.push(`EBAY — ${data.error || "Setup needed"}\nAdd EBAY_ACCESS_TOKEN in Vercel.`);
  }

  show("Connected shops", sections.join("\n\n") || "No shop adapters responded.");
}

async function openHome() {
  show("Home Assistant", "Loading permitted smart-home entities…");
  const response = await fetchNative("/api/integrations/home-assistant");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return show("Home Assistant", `${data.error || "Not configured."}\n\nAdd HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN in Vercel to connect your own Home Assistant server.`);
  const useful = (data.states || []).filter((item) => ["light", "switch", "media_player", "cover"].includes(item.domain)).slice(0, 60);
  const preview = useful.slice(0, 18).map((item) => `${item.entity_id} — ${item.friendly_name} [${item.state}]`).join("\n");
  show("Home Assistant", `Connected entities: ${useful.length}\n\n${preview || "No supported light/switch/media/cover entities found."}\n\nUse the Home button again with an entity command when you're ready.`);

  if (!useful.length) return;
  const request = window.prompt("Optional Home command\nFormat: entity_id action\n\nExample:\nlight.bedroom turn_on\nlight.bedroom turn_off\nswitch.desk toggle", "");
  if (!request) return;
  const [entity_id, service] = request.trim().split(/\s+/);
  if (!entity_id || !service) return alert("Use: entity_id action");
  const domain = entity_id.split(".")[0];
  if (!window.confirm(`Approve Home Assistant action?\n\n${entity_id} → ${service}`)) return;
  const actionResponse = await fetchNative("/api/integrations/home-assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, service, entity_id })
  });
  const actionData = await actionResponse.json().catch(() => ({}));
  show("Home Assistant", actionResponse.ok ? `Completed: ${entity_id} → ${service}` : `Action failed: ${actionData.error || "Unknown error"}`);
}

function installButton(name, attribute, glyph, handler, beforeLast = true) {
  const dock = document.getElementById("jarvis-upgrade-dock");
  if (!dock || dock.querySelector(`[${attribute}]`)) return false;
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(attribute, "true");
  button.innerHTML = `<span>${name}</span> ${glyph}`;
  button.addEventListener("click", handler);
  if (beforeLast && dock.lastElementChild) dock.insertBefore(button, dock.lastElementChild);
  else dock.appendChild(button);
  return true;
}

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  const shops = installButton("Shops", "data-jarvis-shops", "▤", openShops);
  const home = installButton("Home", "data-jarvis-home", "⌂", openHome);
  if ((shops || document.querySelector("[data-jarvis-shops]")) && (home || document.querySelector("[data-jarvis-home]"))) clearInterval(timer);
  if (attempts > 60) clearInterval(timer);
}, 250);

window.JARVIS_CONNECTED = { openShops, openHome };
