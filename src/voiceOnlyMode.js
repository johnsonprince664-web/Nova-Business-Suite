import { supabase } from "./lib/supabase";

const BaseRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function currency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}

async function buildBusinessContext() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) return null;

    const businessResult = await supabase.from("legacy_businesses").select("*").eq("owner_id", userId).maybeSingle();
    if (businessResult.error || !businessResult.data) return null;
    const business = businessResult.data;

    const [inventory, sales, saleItems, orders, customers] = await Promise.all([
      supabase.from("legacy_inventory").select("*").eq("business_id", business.id),
      supabase.from("legacy_sales").select("*").eq("business_id", business.id),
      supabase.from("legacy_sale_items").select("*").eq("business_id", business.id),
      supabase.from("legacy_orders").select("*").eq("business_id", business.id),
      supabase.from("legacy_customers").select("*").eq("business_id", business.id)
    ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const saleById = new Map((sales.data || []).map((sale) => [sale.id, sale]));
    const monthItems = (saleItems.data || []).filter((item) => {
      const sale = saleById.get(item.sale_id);
      return sale?.sold_at && new Date(`${sale.sold_at}T00:00:00`) >= monthStart;
    });
    const monthSales = (sales.data || []).filter((sale) => sale.sold_at && new Date(`${sale.sold_at}T00:00:00`) >= monthStart);
    const monthRevenue = monthItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0);
    const monthCogs = monthItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0), 0);
    const monthDelivery = monthSales.reduce((sum, sale) => sum + Number(sale.delivery_cost || 0), 0);
    const monthProfit = monthRevenue - monthCogs - monthDelivery;
    const inv = inventory.data || [];
    const lowStock = inv.filter((item) => Number(item.qty || 0) <= Number(item.low_stock_threshold ?? 1));
    const openOrders = (orders.data || []).filter((order) => !/complete|completed|delivered|cancel|sold/i.test(order.status || ""));

    return {
      connected: true,
      name: business.name || "Legacy Jewelry Co.",
      monthRevenue,
      monthRevenueFormatted: currency(monthRevenue),
      monthProfit,
      monthProfitFormatted: currency(monthProfit),
      marginPercent: monthRevenue > 0 ? Number(((monthProfit / monthRevenue) * 100).toFixed(1)) : 0,
      inventoryUnits: inv.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      inventoryStyles: inv.length,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.slice(0, 8).map((item) => ({ product: item.product, sku: item.sku, qty: item.qty })),
      openOrders: openOrders.length,
      pendingRevenue: openOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.deposit || 0)), 0),
      customers: (customers.data || []).length
    };
  } catch (error) {
    console.warn("Voice-only business context unavailable", error);
    return null;
  }
}

async function getWeather() {
  if (!navigator.geolocation) return null;
  try {
    const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 15 * 60 * 1000 }));
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(position.coords.latitude),
      longitude: String(position.coords.longitude),
      current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
      hourly: "precipitation_probability",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      forecast_days: "1",
      timezone: "auto"
    }).toString();
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      temperature: data.current?.temperature_2m,
      feelsLike: data.current?.apparent_temperature,
      wind: data.current?.wind_speed_10m,
      rainChance: data.hourly?.precipitation_probability?.[0] ?? null,
      unit: "F"
    };
  } catch {
    return null;
  }
}

function speakText(text) {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 1200));
  window.speechSynthesis.speak(utterance);
}

async function handleVoiceOnlyCommand(raw) {
  const message = String(raw || "").trim().replace(/^hey\s+jarvis[,:]?\s*/i, "");
  if (!message) return;

  document.body.dataset.jarvisVoiceOnly = "thinking";
  try {
    const [business, weather] = await Promise.all([buildBusinessContext(), getWeather()]);
    const context = {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      business,
      weather,
      connections: { legacy: Boolean(business), openai: "server-managed" }
    };

    const response = await fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [], context })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "JARVIS unavailable");

    let reply = String(data.reply || "I’m online.");
    if (data.action?.type && data.action.type !== "none") {
      reply += " I’ve prepared that action conceptually, but anything that changes an outside account still needs your approval in the command center.";
    }
    speakText(reply);
  } catch (error) {
    speakText(`I hit a connection problem: ${error.message || "unknown error"}.`);
  } finally {
    document.body.dataset.jarvisVoiceOnly = "idle";
  }
}

if (BaseRecognition && !BaseRecognition.__jarvisVoiceOnlyWrapped) {
  class VoiceOnlyRecognition extends BaseRecognition {
    constructor() {
      super();
      let appOnResult = null;
      const voiceHandler = (event) => {
        let finalText = "";
        for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) finalText += event.results[i][0]?.transcript || "";
        }
        if (finalText.trim()) handleVoiceOnlyCommand(finalText.trim());
      };
      Object.defineProperty(this, "onresult", {
        configurable: true,
        get: () => voiceHandler,
        set: (handler) => { appOnResult = handler; void appOnResult; }
      });
    }
  }
  VoiceOnlyRecognition.__jarvisVoiceOnlyWrapped = true;
  window.SpeechRecognition = VoiceOnlyRecognition;
  window.webkitSpeechRecognition = VoiceOnlyRecognition;
}

window.JARVIS_VOICE_ONLY = { handleVoiceOnlyCommand };
