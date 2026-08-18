import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CloudSun,
  DollarSign,
  ExternalLink,
  Inbox,
  Link2,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Mic,
  Package,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  X
} from "lucide-react";
import { supabase } from "./lib/supabase";

const GOOGLE_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/contacts.readonly"
].join(" ");

const DEFAULT_MESSAGES = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "JARVIS core initialized. I can combine Legacy Jewelry data, weather, your Google calendar/inbox once connected, and approved actions from one command center."
  }
];

const navItems = [
  ["overview", Activity, "Overview"],
  ["assistant", BrainCircuit, "Assistant"],
  ["business", BarChart3, "Business"],
  ["calendar", CalendarDays, "Calendar"],
  ["inbox", Inbox, "Inbox"],
  ["integrations", Link2, "Integrations"],
  ["settings", Settings, "Settings"]
];

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function exactMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatClock(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDay(date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatEventWhen(value) {
  if (!value) return "All day";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDay(d)} · ${formatClock(d)}`;
}

function weatherLabel(code) {
  const map = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorms",
    96: "Storms with hail",
    99: "Severe storms"
  };
  return map[code] || "Current conditions";
}

function base64UrlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getHeader(headers = [], name) {
  return headers.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function StatCard({ icon: Icon, label, value, detail, tone = "cyan" }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon"><Icon size={19} /></div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  return <span className={`status-dot ${status}`} />;
}

function ConnectionCard({ icon: Icon, title, subtitle, status, action, onClick, disabled }) {
  return (
    <div className="connection-card">
      <div className="connection-icon"><Icon size={22} /></div>
      <div className="connection-copy">
        <div className="connection-title-row">
          <strong>{title}</strong>
          <span className="connection-status"><StatusDot status={status} />{status === "live" ? "Live" : status === "ready" ? "Ready" : "Setup"}</span>
        </div>
        <p>{subtitle}</p>
      </div>
      <button className="ghost-button" onClick={onClick} disabled={disabled}>{action}</button>
    </div>
  );
}

function JarvisOrb({ listening, thinking, speaking, onClick }) {
  const state = thinking ? "thinking" : listening ? "listening" : speaking ? "speaking" : "idle";
  return (
    <button className={`jarvis-orb ${state}`} onClick={onClick} aria-label="Activate JARVIS voice">
      <span className="orb-ring orb-ring-1" />
      <span className="orb-ring orb-ring-2" />
      <span className="orb-ring orb-ring-3" />
      <span className="orb-core"><BrainCircuit size={34} /></span>
    </button>
  );
}

function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setError(result.error.message);
    } else {
      onSignedIn?.(result.data.user);
    }
    setLoading(false);
  }

  return (
    <main className="login-shell">
      <div className="login-grid" />
      <section className="login-card">
        <div className="mini-orb"><BrainCircuit size={30} /></div>
        <p className="eyebrow">PERSONAL OPERATING SYSTEM</p>
        <h1>J.A.R.V.I.S.</h1>
        <p className="login-lead">Sign in with the same account you use for Legacy Jewelry CRM. Your business data stays protected by the existing Supabase account and row-level access rules.</p>
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
          <label>Password</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required />
          {error && <div className="login-error">{error}</div>}
          <button className="primary-button login-button" disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
            Secure sign in
          </button>
        </form>
        <p className="security-note"><ShieldCheck size={14} /> No service-role key is exposed to the browser.</p>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeView, setActiveView] = useState("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [business, setBusiness] = useState(null);
  const [crm, setCrm] = useState({ inventory: [], sales: [], saleItems: [], orders: [], expenses: [], customers: [] });
  const [crmLoading, setCrmLoading] = useState(false);
  const [crmError, setCrmError] = useState("");
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("jarvis_google_token") || "");
  const [googleProfile, setGoogleProfile] = useState(null);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [inboxItems, setInboxItems] = useState([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [calendarQuery, setCalendarQuery] = useState("");
  const [gmailQuery, setGmailQuery] = useState("");
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("jarvis_messages_v1") || "null");
      return Array.isArray(saved) && saved.length ? saved.slice(-40) : DEFAULT_MESSAGES;
    } catch {
      return DEFAULT_MESSAGES;
    }
  });
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(() => localStorage.getItem("jarvis_voice_replies") !== "false");
  const [pendingAction, setPendingAction] = useState(null);
  const [activityLog, setActivityLog] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("jarvis_activity_v1") || "[]").slice(-30);
    } catch {
      return [];
    }
  });
  const [clock, setClock] = useState(new Date());
  const recognitionRef = useRef(null);
  const sendMessageRef = useRef(null);
  const messagesEndRef = useRef(null);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York", []);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user || null);
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("jarvis_messages_v1", JSON.stringify(messages.slice(-40)));
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  useEffect(() => {
    localStorage.setItem("jarvis_activity_v1", JSON.stringify(activityLog.slice(-30)));
  }, [activityLog]);

  useEffect(() => {
    localStorage.setItem("jarvis_voice_replies", String(voiceReplies));
  }, [voiceReplies]);

  const addActivity = useCallback((label, detail = "") => {
    setActivityLog((items) => [
      ...items,
      { id: crypto.randomUUID(), label, detail, at: new Date().toISOString() }
    ].slice(-30));
  }, []);

  const loadCrm = useCallback(async () => {
    if (!user?.id) return;
    setCrmLoading(true);
    setCrmError("");
    try {
      const businessResult = await supabase
        .from("legacy_businesses")
        .select("*")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (businessResult.error) throw businessResult.error;
      const biz = businessResult.data;
      setBusiness(biz || null);
      if (!biz) {
        setCrm({ inventory: [], sales: [], saleItems: [], orders: [], expenses: [], customers: [] });
        return;
      }

      const [inventory, sales, saleItems, orders, expenses, customers] = await Promise.all([
        supabase.from("legacy_inventory").select("*").eq("business_id", biz.id).order("created_at", { ascending: false }),
        supabase.from("legacy_sales").select("*").eq("business_id", biz.id).order("sold_at", { ascending: false }),
        supabase.from("legacy_sale_items").select("*").eq("business_id", biz.id),
        supabase.from("legacy_orders").select("*").eq("business_id", biz.id).order("order_date", { ascending: false }),
        supabase.from("legacy_expenses").select("*").eq("business_id", biz.id).order("expense_date", { ascending: false }),
        supabase.from("legacy_customers").select("*").eq("business_id", biz.id).order("created_at", { ascending: false })
      ]);
      const results = [inventory, sales, saleItems, orders, expenses, customers];
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setCrm({
        inventory: inventory.data || [],
        sales: sales.data || [],
        saleItems: saleItems.data || [],
        orders: orders.data || [],
        expenses: expenses.data || [],
        customers: customers.data || []
      });
    } catch (error) {
      setCrmError(error.message || "Unable to load Legacy Jewelry data.");
    } finally {
      setCrmLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCrm();
  }, [loadCrm]);

  useEffect(() => {
    if (!business?.id) return;
    const channel = supabase
      .channel(`jarvis-legacy-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_inventory", filter: `business_id=eq.${business.id}` }, loadCrm)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sales", filter: `business_id=eq.${business.id}` }, loadCrm)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_sale_items", filter: `business_id=eq.${business.id}` }, loadCrm)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_orders", filter: `business_id=eq.${business.id}` }, loadCrm)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business?.id, loadCrm]);

  useEffect(() => {
    let cancelled = false;
    async function loadWeather(latitude, longitude, locationLabel) {
      try {
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.search = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
          hourly: "precipitation_probability",
          temperature_unit: "fahrenheit",
          wind_speed_unit: "mph",
          forecast_days: "1",
          timezone: "auto"
        }).toString();
        const response = await fetch(url);
        if (!response.ok) throw new Error("Weather unavailable");
        const data = await response.json();
        const currentHour = new Date().toISOString().slice(0, 13) + ":00";
        const index = data.hourly?.time?.findIndex((value) => value === currentHour);
        const rainChance = index >= 0 ? data.hourly?.precipitation_probability?.[index] : data.hourly?.precipitation_probability?.[0];
        if (!cancelled) {
          setWeather({
            location: locationLabel,
            temperature: data.current?.temperature_2m,
            feelsLike: data.current?.apparent_temperature,
            code: data.current?.weather_code,
            description: weatherLabel(data.current?.weather_code),
            wind: data.current?.wind_speed_10m,
            rainChance: rainChance ?? null,
            unit: "F"
          });
        }
      } catch {
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    setWeatherLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => loadWeather(position.coords.latitude, position.coords.longitude, "Current location"),
        () => loadWeather(39.9612, -82.9988, "Columbus, OH"),
        { timeout: 5000, maximumAge: 15 * 60 * 1000 }
      );
    } else {
      loadWeather(39.9612, -82.9988, "Columbus, OH");
    }
    return () => { cancelled = true; };
  }, []);

  const businessMetrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const saleById = new Map(crm.sales.map((sale) => [sale.id, sale]));
    const monthSaleItems = crm.saleItems.filter((item) => {
      const sale = saleById.get(item.sale_id);
      if (!sale?.sold_at) return false;
      return new Date(`${sale.sold_at}T00:00:00`) >= monthStart;
    });
    const monthSales = crm.sales.filter((sale) => sale.sold_at && new Date(`${sale.sold_at}T00:00:00`) >= monthStart);
    const monthRevenue = monthSaleItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0);
    const monthCogs = monthSaleItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0), 0);
    const monthDelivery = monthSales.reduce((sum, sale) => sum + Number(sale.delivery_cost || 0), 0);
    const monthProfit = monthRevenue - monthCogs - monthDelivery;
    const inventoryUnits = crm.inventory.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const inventoryValue = crm.inventory.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0), 0);
    const retailValue = crm.inventory.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.sale_price || 0), 0);
    const lowStock = crm.inventory.filter((item) => Number(item.qty || 0) <= Number(item.low_stock_threshold ?? 1));
    const openOrders = crm.orders.filter((order) => !/complete|completed|delivered|cancel|sold/i.test(order.status || ""));
    const pendingRevenue = openOrders.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.deposit || 0)), 0);
    return {
      monthRevenue,
      monthProfit,
      margin: monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0,
      inventoryUnits,
      inventoryValue,
      retailValue,
      lowStock,
      openOrders,
      pendingRevenue,
      customerCount: crm.customers.length,
      monthSalesCount: monthSales.length
    };
  }, [crm]);

  const recentSales = useMemo(() => crm.sales.slice(0, 5).map((sale) => {
    const items = crm.saleItems.filter((item) => item.sale_id === sale.id);
    const total = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0);
    return { ...sale, total, itemLabel: items.map((item) => item.product_name).filter(Boolean).join(", ") || "Sale" };
  }), [crm.sales, crm.saleItems]);

  const loadGoogleData = useCallback(async (token = googleToken, options = {}) => {
    if (!token) return;
    setGoogleLoading(true);
    setGoogleError("");
    const calendarSearch = options.calendarQuery ?? calendarQuery;
    const inboxSearch = options.gmailQuery ?? gmailQuery;
    try {
      const now = new Date();
      const max = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      calendarUrl.search = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "12",
        ...(calendarSearch ? { q: calendarSearch } : {})
      }).toString();

      const gmailUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      gmailUrl.search = new URLSearchParams({
        maxResults: "10",
        q: `${inboxSearch ? `${inboxSearch} ` : ""}in:inbox newer_than:14d -category:promotions`
      }).toString();

      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, calendarRes, gmailListRes] = await Promise.all([
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers }),
        fetch(calendarUrl, { headers }),
        fetch(gmailUrl, { headers })
      ]);
      if ([profileRes, calendarRes, gmailListRes].some((response) => response.status === 401)) {
        sessionStorage.removeItem("jarvis_google_token");
        setGoogleToken("");
        throw new Error("Google session expired. Reconnect Google.");
      }
      if (!calendarRes.ok) throw new Error("Google Calendar permission is not available.");
      if (!gmailListRes.ok) throw new Error("Gmail permission is not available.");

      const [profileData, calendarData, gmailList] = await Promise.all([
        profileRes.ok ? profileRes.json() : Promise.resolve(null),
        calendarRes.json(),
        gmailListRes.json()
      ]);

      const eventRows = (calendarData.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "Untitled event",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        when: event.start?.dateTime ? formatEventWhen(event.start.dateTime) : event.start?.date || "All day",
        location: event.location || "",
        htmlLink: event.htmlLink || ""
      }));

      const messages = (gmailList.messages || []).slice(0, 10);
      const emailDetails = await Promise.all(messages.map(async ({ id }) => {
        const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
        url.search = new URLSearchParams({ format: "metadata", metadataHeaders: "Subject" }).toString();
        url.searchParams.append("metadataHeaders", "From");
        url.searchParams.append("metadataHeaders", "Date");
        const response = await fetch(url, { headers });
        if (!response.ok) return null;
        const data = await response.json();
        const metadata = data.payload?.headers || [];
        return {
          id,
          threadId: data.threadId,
          subject: getHeader(metadata, "Subject") || "No subject",
          from: getHeader(metadata, "From") || "Unknown sender",
          date: getHeader(metadata, "Date"),
          snippet: data.snippet || "",
          unread: (data.labelIds || []).includes("UNREAD")
        };
      }));

      setGoogleProfile(profileData);
      setCalendarEvents(eventRows);
      setInboxItems(emailDetails.filter(Boolean));
      addActivity("Google synced", `${eventRows.length} events · ${emailDetails.filter(Boolean).length} inbox items`);
    } catch (error) {
      setGoogleError(error.message || "Unable to sync Google.");
    } finally {
      setGoogleLoading(false);
    }
  }, [googleToken, calendarQuery, gmailQuery, addActivity]);

  useEffect(() => {
    if (googleToken) loadGoogleData(googleToken);
  }, []); // intentionally sync once from existing session token

  const connectGoogle = useCallback(() => {
    setGoogleError("");
    if (!googleClientId) {
      setGoogleError("VITE_GOOGLE_CLIENT_ID has not been added to this deployment yet.");
      setActiveView("integrations");
      return;
    }
    const launch = () => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: GOOGLE_SCOPE,
        callback: (response) => {
          if (response.error) {
            setGoogleError(response.error_description || response.error);
            return;
          }
          sessionStorage.setItem("jarvis_google_token", response.access_token);
          setGoogleToken(response.access_token);
          addActivity("Google connected", "Calendar, Gmail and Contacts permissions authorized");
          loadGoogleData(response.access_token);
        }
      });
      client.requestAccessToken({ prompt: "consent" });
    };

    if (window.google?.accounts?.oauth2) {
      launch();
      return;
    }
    const existing = document.querySelector('script[data-jarvis-google="true"]');
    if (existing) {
      existing.addEventListener("load", launch, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.jarvisGoogle = "true";
    script.onload = launch;
    script.onerror = () => setGoogleError("Unable to load Google sign-in.");
    document.head.appendChild(script);
  }, [googleClientId, loadGoogleData, addActivity]);

  const disconnectGoogle = useCallback(() => {
    if (googleToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(googleToken, () => {});
    }
    sessionStorage.removeItem("jarvis_google_token");
    setGoogleToken("");
    setGoogleProfile(null);
    setCalendarEvents([]);
    setInboxItems([]);
    addActivity("Google disconnected");
  }, [googleToken, addActivity]);

  const speak = useCallback((text) => {
    if (!voiceReplies || !window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 900));
    utterance.rate = 1.02;
    utterance.pitch = 0.92;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceReplies]);

  const businessContext = useMemo(() => ({
    connected: Boolean(business),
    name: business?.name || "Legacy Jewelry Co.",
    monthRevenue: businessMetrics.monthRevenue,
    monthRevenueFormatted: exactMoney(businessMetrics.monthRevenue),
    monthProfit: businessMetrics.monthProfit,
    monthProfitFormatted: exactMoney(businessMetrics.monthProfit),
    marginPercent: Number(businessMetrics.margin.toFixed(1)),
    inventoryUnits: businessMetrics.inventoryUnits,
    inventoryStyles: crm.inventory.length,
    inventoryValue: businessMetrics.inventoryValue,
    retailValue: businessMetrics.retailValue,
    lowStockCount: businessMetrics.lowStock.length,
    lowStockItems: businessMetrics.lowStock.slice(0, 8).map((item) => ({ product: item.product, sku: item.sku, qty: item.qty })),
    openOrders: businessMetrics.openOrders.length,
    pendingRevenue: businessMetrics.pendingRevenue,
    customers: businessMetrics.customerCount
  }), [business, businessMetrics, crm.inventory.length]);

  const jarvisContext = useCallback(() => ({
    now: new Date().toISOString(),
    timezone,
    weather: weather ? {
      location: weather.location,
      temperature: weather.temperature,
      feelsLike: weather.feelsLike,
      description: weather.description,
      rainChance: weather.rainChance,
      wind: weather.wind,
      unit: weather.unit
    } : null,
    business: businessContext,
    calendar: calendarEvents.slice(0, 10),
    inbox: inboxItems.slice(0, 10).map((item) => ({ subject: item.subject, from: item.from, date: item.date, unread: item.unread })),
    connections: {
      legacy: Boolean(business),
      google: Boolean(googleToken),
      openai: "server-managed"
    }
  }), [timezone, weather, businessContext, calendarEvents, inboxItems, business, googleToken]);

  const executeAction = useCallback(async (action) => {
    if (!action || action.type === "none") return;
    if (action.type === "business_refresh") {
      await loadCrm();
      addActivity("Legacy refreshed", action.reason || "Requested by JARVIS");
      setPendingAction(null);
      return;
    }
    if (!googleToken) {
      setGoogleError("Connect Google before approving this action.");
      setActiveView("integrations");
      return;
    }
    const headers = { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" };
    try {
      if (action.type === "calendar_create") {
        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers,
          body: JSON.stringify({
            summary: action.title || "JARVIS event",
            start: { dateTime: action.start },
            end: { dateTime: action.end }
          })
        });
        if (!response.ok) throw new Error("Google Calendar could not create the event.");
        addActivity("Calendar event created", `${action.title} · ${formatEventWhen(action.start)}`);
        await loadGoogleData(googleToken);
      } else if (action.type === "gmail_draft") {
        const raw = `To: ${action.to}\r\nSubject: ${action.subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${action.body}`;
        const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
          method: "POST",
          headers,
          body: JSON.stringify({ message: { raw: base64UrlEncode(raw) } })
        });
        if (!response.ok) throw new Error("Gmail could not create the draft.");
        addActivity("Gmail draft created", action.subject || `Draft to ${action.to}`);
      } else if (action.type === "gmail_search") {
        setGmailQuery(action.query || "");
        setActiveView("inbox");
        await loadGoogleData(googleToken, { gmailQuery: action.query || "" });
        addActivity("Inbox searched", action.query || "Recent mail");
      } else if (action.type === "calendar_search") {
        setCalendarQuery(action.query || "");
        setActiveView("calendar");
        await loadGoogleData(googleToken, { calendarQuery: action.query || "" });
        addActivity("Calendar searched", action.query || "Upcoming events");
      }
      setPendingAction(null);
    } catch (error) {
      setGoogleError(error.message || "Action failed.");
    }
  }, [googleToken, loadCrm, loadGoogleData, addActivity]);

  const sendMessage = useCallback(async (rawMessage) => {
    const text = String(rawMessage ?? input).trim();
    if (!text || thinking) return;
    setInput("");
    setActiveView("assistant");
    const userMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((items) => [...items, userMessage]);
    setThinking(true);
    setPendingAction(null);
    try {
      const history = messages.slice(-8).map(({ role, content }) => ({ role, content }));
      const response = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history, context: jarvisContext() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "JARVIS unavailable");
      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply || "I’m online.",
        poweredBy: data.poweredBy || "JARVIS"
      };
      setMessages((items) => [...items, assistantMessage]);
      if (data.action?.type && data.action.type !== "none") setPendingAction(data.action);
      speak(assistantMessage.content);
    } catch (error) {
      const content = `I hit a connection problem: ${error.message}. The live dashboard integrations are still available.`;
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, jarvisContext, speak]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const startVoice = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessages((items) => [...items, { id: crypto.randomUUID(), role: "assistant", content: "Voice recognition is not supported in this browser. Chrome or Edge on desktop works best." }]);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      setInput(finalText || interim);
      if (finalText.trim()) sendMessageRef.current?.(finalText.trim().replace(/^hey\s+jarvis[,:]?\s*/i, ""));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [listening]);

  async function signOut() {
    disconnectGoogle();
    await supabase.auth.signOut();
  }

  const displayName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Prince";
  const greeting = clock.getHours() < 12 ? "Good morning" : clock.getHours() < 18 ? "Good afternoon" : "Good evening";
  const nextEvent = calendarEvents[0];
  const unreadCount = inboxItems.filter((item) => item.unread).length;
  const systemHealth = [Boolean(business), Boolean(weather), Boolean(googleToken), true].filter(Boolean).length;

  if (!authReady) {
    return <main className="loading-screen"><JarvisOrb thinking /><p>Initializing secure systems…</p></main>;
  }
  if (!user) return <LoginScreen onSignedIn={setUser} />;

  const renderOverview = () => (
    <div className="view-stack">
      <section className="hero-panel glass-panel">
        <div className="hero-copy">
          <p className="eyebrow">J.A.R.V.I.S. COMMAND CENTER</p>
          <h1>{greeting}, {displayName.split(" ")[0]}.</h1>
          <p className="hero-subtitle">
            {systemHealth >= 4 ? "All primary systems are online." : `${systemHealth}/4 primary systems are online.`}
            {businessMetrics.lowStock.length > 0 ? ` ${businessMetrics.lowStock.length} inventory item${businessMetrics.lowStock.length === 1 ? "" : "s"} need attention.` : " No critical inventory alerts."}
          </p>
        </div>
        <div className="hero-time">
          <strong>{formatClock(clock)}</strong>
          <span>{formatDay(clock)}</span>
          <small>{timezone}</small>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard icon={DollarSign} label="Revenue · month" value={money(businessMetrics.monthRevenue)} detail={`${businessMetrics.monthSalesCount} recorded sales`} tone="cyan" />
        <StatCard icon={BarChart3} label="Gross profit · month" value={money(businessMetrics.monthProfit)} detail={`${businessMetrics.margin.toFixed(1)}% margin`} tone="violet" />
        <StatCard icon={Boxes} label="Inventory" value={`${businessMetrics.inventoryUnits} units`} detail={`${money(businessMetrics.inventoryValue)} cost basis`} tone={businessMetrics.lowStock.length ? "amber" : "cyan"} />
        <StatCard icon={Package} label="Open orders" value={String(businessMetrics.openOrders.length)} detail={`${money(businessMetrics.pendingRevenue)} remaining`} tone="green" />
      </section>

      <section className="overview-grid">
        <div className="glass-panel command-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">VOICE + AI</p><h2>Ask JARVIS</h2></div>
            <span className="live-pill"><StatusDot status="live" /> Online</span>
          </div>
          <div className="orb-stage">
            <JarvisOrb listening={listening} thinking={thinking} speaking={speaking} onClick={startVoice} />
            <div className="orb-state">{thinking ? "ANALYZING" : listening ? "LISTENING" : speaking ? "SPEAKING" : "READY"}</div>
          </div>
          <div className="quick-prompts">
            {["Give me my business rundown", "What needs my attention?", "What is on my schedule?", "Check inventory for low stock"].map((prompt) => (
              <button key={prompt} onClick={() => sendMessage(prompt)}>{prompt}<ChevronRight size={14} /></button>
            ))}
          </div>
        </div>

        <div className="glass-panel today-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">REAL WORLD</p><h2>Today</h2></div>
            {googleLoading && <Loader2 size={17} className="spin" />}
          </div>
          <div className="today-weather">
            <CloudSun size={32} />
            <div>
              <strong>{weatherLoading ? "—" : weather ? `${Math.round(weather.temperature)}°` : "N/A"}</strong>
              <span>{weather?.description || "Weather loading"}</span>
            </div>
            <small>{weather?.rainChance != null ? `${weather.rainChance}% rain` : weather?.location || ""}</small>
          </div>
          <div className="today-row">
            <CalendarDays size={18} />
            <div><span>Next event</span><strong>{nextEvent?.title || (googleToken ? "No upcoming events" : "Connect Google Calendar")}</strong></div>
            <small>{nextEvent?.when || ""}</small>
          </div>
          <div className="today-row">
            <Mail size={18} />
            <div><span>Inbox</span><strong>{googleToken ? `${unreadCount} unread in snapshot` : "Connect Gmail"}</strong></div>
            <small>{inboxItems[0]?.subject || ""}</small>
          </div>
          <div className="today-row alert-row">
            <Bell size={18} />
            <div><span>Business alerts</span><strong>{businessMetrics.lowStock.length ? `${businessMetrics.lowStock.length} low-stock items` : "No critical alerts"}</strong></div>
            <small>{businessMetrics.lowStock[0]?.product || ""}</small>
          </div>
        </div>
      </section>

      <section className="overview-grid lower-grid">
        <div className="glass-panel">
          <div className="panel-heading"><div><p className="eyebrow">LEGACY JEWELRY</p><h2>Inventory intelligence</h2></div><button className="icon-button" onClick={loadCrm}><RefreshCw size={16} className={crmLoading ? "spin" : ""} /></button></div>
          {crmError && <div className="inline-error">{crmError}</div>}
          <div className="inventory-summary">
            <div><span>Retail potential</span><strong>{money(businessMetrics.retailValue)}</strong></div>
            <div><span>Cost basis</span><strong>{money(businessMetrics.inventoryValue)}</strong></div>
            <div><span>Customers</span><strong>{businessMetrics.customerCount}</strong></div>
          </div>
          <div className="compact-list">
            {businessMetrics.lowStock.slice(0, 4).map((item) => (
              <div className="compact-row" key={item.id}>
                <span className="attention-dot" />
                <div><strong>{item.product}</strong><small>{item.sku || item.color || "Inventory"}</small></div>
                <b>{item.qty} left</b>
              </div>
            ))}
            {!businessMetrics.lowStock.length && <div className="empty-state"><CheckCircle2 size={19} /> Inventory is above current low-stock thresholds.</div>}
          </div>
        </div>

        <div className="glass-panel">
          <div className="panel-heading"><div><p className="eyebrow">SYSTEM ACTIVITY</p><h2>Recent actions</h2></div><Activity size={18} /></div>
          <div className="activity-list">
            {activityLog.slice(-6).reverse().map((item) => (
              <div className="activity-item" key={item.id}>
                <span className="activity-marker" />
                <div><strong>{item.label}</strong><small>{item.detail || formatEventWhen(item.at)}</small></div>
                <time>{formatClock(new Date(item.at))}</time>
              </div>
            ))}
            {!activityLog.length && <div className="empty-state">Actions JARVIS takes with your approval will appear here.</div>}
          </div>
        </div>
      </section>
    </div>
  );

  const renderAssistant = () => (
    <div className="assistant-layout">
      <section className="glass-panel chat-panel">
        <div className="panel-heading chat-heading">
          <div><p className="eyebrow">J.A.R.V.I.S.</p><h2>Conversation</h2></div>
          <div className="chat-controls">
            <button className={`icon-button ${voiceReplies ? "active" : ""}`} onClick={() => setVoiceReplies((value) => !value)} title="Voice replies"><Sparkles size={16} /></button>
            <button className={`icon-button ${listening ? "active" : ""}`} onClick={startVoice} title="Speak"><Mic size={16} /></button>
          </div>
        </div>
        <div className="message-list">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              <div className="message-avatar">{message.role === "assistant" ? <BrainCircuit size={17} /> : displayName.slice(0, 1).toUpperCase()}</div>
              <div className="message-bubble">
                <p>{message.content}</p>
                {message.poweredBy && <small>{message.poweredBy}</small>}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="message assistant">
              <div className="message-avatar"><BrainCircuit size={17} /></div>
              <div className="message-bubble thinking-bubble"><span /><span /><span /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        {pendingAction && (
          <div className="approval-card">
            <div className="approval-icon"><ShieldCheck size={20} /></div>
            <div className="approval-copy">
              <span>Approval required</span>
              <strong>{pendingAction.type === "calendar_create" ? `Create calendar event: ${pendingAction.title}` : pendingAction.type === "gmail_draft" ? `Create Gmail draft: ${pendingAction.subject}` : `Run ${pendingAction.type.replaceAll("_", " ")}`}</strong>
              <small>{pendingAction.reason}</small>
            </div>
            <button className="ghost-button" onClick={() => setPendingAction(null)}>Decline</button>
            <button className="primary-button small" onClick={() => executeAction(pendingAction)}>Approve</button>
          </div>
        )}
        <form className="chat-input" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
          <button type="button" className={`mic-button ${listening ? "active" : ""}`} onClick={startVoice}><Mic size={19} /></button>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={listening ? "Listening…" : "Ask JARVIS anything…"} />
          <button className="send-button" disabled={!input.trim() || thinking}><Send size={18} /></button>
        </form>
      </section>
      <aside className="assistant-side">
        <div className="glass-panel side-card">
          <p className="eyebrow">CONTEXT</p>
          <h3>What JARVIS can see</h3>
          <div className="context-list">
            <div><StatusDot status={business ? "live" : "setup"} /> Legacy Jewelry <span>{business ? "live" : "offline"}</span></div>
            <div><StatusDot status={weather ? "live" : "setup"} /> Weather <span>{weather ? "live" : "offline"}</span></div>
            <div><StatusDot status={googleToken ? "live" : "setup"} /> Calendar <span>{googleToken ? "live" : "connect"}</span></div>
            <div><StatusDot status={googleToken ? "live" : "setup"} /> Gmail <span>{googleToken ? "live" : "connect"}</span></div>
          </div>
        </div>
        <div className="glass-panel side-card">
          <p className="eyebrow">PERMISSIONS</p>
          <h3>Action guardrails</h3>
          <div className="guardrail-list">
            <div><CheckCircle2 size={16} /> Read dashboards automatically</div>
            <div><CheckCircle2 size={16} /> Search data automatically</div>
            <div><ShieldCheck size={16} /> Calendar writes need approval</div>
            <div><ShieldCheck size={16} /> Gmail drafts need approval</div>
            <div><X size={16} /> Money/deletes are blocked</div>
          </div>
        </div>
      </aside>
    </div>
  );

  const renderBusiness = () => (
    <div className="view-stack">
      <section className="section-header">
        <div><p className="eyebrow">BUSINESS INTELLIGENCE</p><h1>Legacy Jewelry Co.</h1><p>Live operational view from your existing Supabase CRM.</p></div>
        <div className="header-actions"><button className="ghost-button" onClick={() => window.open("https://legacyjewelrycrmphonereadyfixed.vercel.app", "_blank")}>Open CRM <ExternalLink size={14} /></button><button className="primary-button" onClick={loadCrm}><RefreshCw size={15} /> Refresh</button></div>
      </section>
      <section className="stat-grid">
        <StatCard icon={DollarSign} label="Month revenue" value={exactMoney(businessMetrics.monthRevenue)} detail={`${businessMetrics.monthSalesCount} sales`} />
        <StatCard icon={BarChart3} label="Month gross profit" value={exactMoney(businessMetrics.monthProfit)} detail={`${businessMetrics.margin.toFixed(1)}% margin`} tone="violet" />
        <StatCard icon={Store} label="Retail potential" value={money(businessMetrics.retailValue)} detail={`${businessMetrics.inventoryUnits} units`} tone="green" />
        <StatCard icon={Users} label="Customers" value={String(businessMetrics.customerCount)} detail={`${businessMetrics.openOrders.length} open orders`} tone="amber" />
      </section>
      <section className="business-grid">
        <div className="glass-panel table-panel">
          <div className="panel-heading"><div><p className="eyebrow">INVENTORY</p><h2>Needs attention</h2></div><span className="live-pill"><StatusDot status={businessMetrics.lowStock.length ? "setup" : "live"} />{businessMetrics.lowStock.length} alerts</span></div>
          <div className="data-table">
            <div className="table-row table-head"><span>Product</span><span>SKU</span><span>Qty</span><span>Cost</span><span>Retail</span></div>
            {businessMetrics.lowStock.map((item) => (
              <div className="table-row" key={item.id}>
                <strong>{item.product}</strong><span>{item.sku || "—"}</span><b className="warn-text">{item.qty}</b><span>{exactMoney(item.unit_cost)}</span><span>{exactMoney(item.sale_price)}</span>
              </div>
            ))}
            {!businessMetrics.lowStock.length && <div className="empty-state roomy"><CheckCircle2 size={20} /> Nothing is below its current reorder threshold.</div>}
          </div>
        </div>
        <div className="glass-panel">
          <div className="panel-heading"><div><p className="eyebrow">SALES</p><h2>Recent</h2></div></div>
          <div className="compact-list">
            {recentSales.map((sale) => (
              <div className="compact-row sale-row" key={sale.id}>
                <div><strong>{sale.itemLabel}</strong><small>{sale.sold_at || ""} · {sale.payment_method || "payment"}</small></div>
                <b>{exactMoney(sale.total)}</b>
              </div>
            ))}
            {!recentSales.length && <div className="empty-state">No recorded sales yet.</div>}
          </div>
        </div>
      </section>
      <section className="glass-panel table-panel">
        <div className="panel-heading"><div><p className="eyebrow">ORDERS</p><h2>Open pipeline</h2></div><span>{exactMoney(businessMetrics.pendingRevenue)} remaining</span></div>
        <div className="data-table">
          <div className="table-row order-table table-head"><span>Product</span><span>Status</span><span>Total</span><span>Deposit</span><span>Remaining</span></div>
          {businessMetrics.openOrders.map((order) => (
            <div className="table-row order-table" key={order.id}>
              <strong>{order.product}</strong><span>{order.status || "Open"}</span><span>{exactMoney(order.total)}</span><span>{exactMoney(order.deposit)}</span><b>{exactMoney(Number(order.total || 0) - Number(order.deposit || 0))}</b>
            </div>
          ))}
          {!businessMetrics.openOrders.length && <div className="empty-state roomy">No open orders right now.</div>}
        </div>
      </section>
    </div>
  );

  const renderCalendar = () => (
    <div className="view-stack">
      <section className="section-header">
        <div><p className="eyebrow">GOOGLE CALENDAR</p><h1>Your next 7 days</h1><p>Search, brief, and create events through JARVIS with approval.</p></div>
        {!googleToken ? <button className="primary-button" onClick={connectGoogle}>Connect Google</button> : <button className="ghost-button" onClick={() => loadGoogleData()}><RefreshCw size={15} /> Sync</button>}
      </section>
      <section className="glass-panel">
        <form className="search-bar" onSubmit={(event) => { event.preventDefault(); loadGoogleData(googleToken, { calendarQuery }); }}><Search size={17} /><input value={calendarQuery} onChange={(e) => setCalendarQuery(e.target.value)} placeholder="Search calendar…" /><button>Search</button></form>
        {googleError && <div className="inline-error">{googleError}</div>}
        <div className="calendar-list">
          {calendarEvents.map((event) => (
            <div className="calendar-event" key={event.id}>
              <div className="date-badge"><span>{event.start ? new Date(event.start).toLocaleString("en-US", { month: "short" }) : "—"}</span><strong>{event.start ? new Date(event.start).getDate() : "—"}</strong></div>
              <div><strong>{event.title}</strong><span>{event.when}</span><small>{event.location}</small></div>
              {event.htmlLink && <button className="icon-button" onClick={() => window.open(event.htmlLink, "_blank")}><ExternalLink size={15} /></button>}
            </div>
          ))}
          {!calendarEvents.length && <div className="empty-state roomy">{googleToken ? "No matching events in the next 7 days." : "Connect Google to bring your real calendar into JARVIS."}</div>}
        </div>
      </section>
      <section className="glass-panel callout-panel"><BrainCircuit size={24} /><div><strong>Try a natural command</strong><p>“Jarvis, put a two-hour Legacy inventory block on my calendar tomorrow at 4.” I’ll prepare the event, then wait for your approval.</p></div><button className="ghost-button" onClick={() => sendMessage("Put a two-hour Legacy inventory work block on my calendar tomorrow at 4 PM")}>Try it</button></section>
    </div>
  );

  const renderInbox = () => (
    <div className="view-stack">
      <section className="section-header">
        <div><p className="eyebrow">GMAIL</p><h1>Inbox intelligence</h1><p>Search recent mail and let JARVIS prepare drafts without auto-sending.</p></div>
        {!googleToken ? <button className="primary-button" onClick={connectGoogle}>Connect Gmail</button> : <button className="ghost-button" onClick={() => loadGoogleData()}><RefreshCw size={15} /> Sync</button>}
      </section>
      <section className="glass-panel">
        <form className="search-bar" onSubmit={(event) => { event.preventDefault(); loadGoogleData(googleToken, { gmailQuery }); }}><Search size={17} /><input value={gmailQuery} onChange={(e) => setGmailQuery(e.target.value)} placeholder="Search recent inbox…" /><button>Search</button></form>
        {googleError && <div className="inline-error">{googleError}</div>}
        <div className="mail-list">
          {inboxItems.map((mail) => (
            <div className={`mail-item ${mail.unread ? "unread" : ""}`} key={mail.id}>
              <span className="mail-state" />
              <div className="mail-sender">{mail.from}</div>
              <div className="mail-copy"><strong>{mail.subject}</strong><span>{mail.snippet}</span></div>
              <time>{mail.date ? new Date(mail.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</time>
            </div>
          ))}
          {!inboxItems.length && <div className="empty-state roomy">{googleToken ? "No messages matched that search." : "Connect Gmail to let JARVIS search and summarize your inbox."}</div>}
        </div>
      </section>
      <section className="glass-panel callout-panel"><Mail size={24} /><div><strong>Draft safely</strong><p>Ask “Draft an email to ___ about ___.” JARVIS creates the draft only after you approve it. Sending remains in Gmail.</p></div><button className="ghost-button" onClick={() => setActiveView("assistant")}>Open assistant</button></section>
    </div>
  );

  const renderIntegrations = () => (
    <div className="view-stack">
      <section className="section-header"><div><p className="eyebrow">SKILLS + CONNECTORS</p><h1>JARVIS integrations</h1><p>The architecture is modular: each new service becomes another skill instead of another disconnected dashboard.</p></div></section>
      {googleError && <div className="inline-error">{googleError}</div>}
      <section className="integration-grid">
        <ConnectionCard icon={Store} title="Legacy Jewelry CRM" subtitle="Supabase auth, customers, inventory, sales, orders, live database changes." status={business ? "live" : "setup"} action="Open" onClick={() => setActiveView("business")} />
        <ConnectionCard icon={CloudSun} title="Weather" subtitle={`Live local forecast through Open-Meteo${weather?.location ? ` · ${weather.location}` : ""}.`} status={weather ? "live" : "setup"} action="View" onClick={() => setActiveView("overview")} />
        <ConnectionCard icon={CalendarDays} title="Google Calendar" subtitle="Upcoming events, search, and approved event creation." status={googleToken ? "live" : googleClientId ? "ready" : "setup"} action={googleToken ? "Sync" : "Connect"} onClick={googleToken ? () => loadGoogleData() : connectGoogle} />
        <ConnectionCard icon={Mail} title="Gmail" subtitle="Inbox search plus approved draft creation. No silent auto-send." status={googleToken ? "live" : googleClientId ? "ready" : "setup"} action={googleToken ? "View" : "Connect"} onClick={googleToken ? () => setActiveView("inbox") : connectGoogle} />
        <ConnectionCard icon={BrainCircuit} title="OpenAI brain" subtitle="GPT-5.6 reasoning through the server-side Responses API with web search when needed." status="ready" action="Assistant" onClick={() => setActiveView("assistant")} />
        <ConnectionCard icon={ShieldCheck} title="Permission engine" subtitle="Read/search automatically; external writes require approval; destructive actions are blocked." status="live" action="Rules" onClick={() => setActiveView("settings")} />
        <ConnectionCard icon={Package} title="eBay / selling channels" subtitle="Adapter slot reserved for listings, orders, inventory sync, and customer messages where APIs permit." status="setup" action="Planned" disabled />
        <ConnectionCard icon={Store} title="Shopify / storefronts" subtitle="Adapter slot for products, orders, revenue, customers, and inventory reconciliation." status="setup" action="Planned" disabled />
        <ConnectionCard icon={Activity} title="Home Assistant" subtitle="Future room/device control with explicit entity permissions and action approvals." status="setup" action="Planned" disabled />
      </section>
      <section className="glass-panel setup-panel">
        <div><p className="eyebrow">GOOGLE SETUP STATUS</p><h2>{googleClientId ? "Google OAuth client detected" : "One public OAuth value remains"}</h2><p>{googleClientId ? "This deployment can launch Google authorization." : "Add VITE_GOOGLE_CLIENT_ID in Vercel to activate the Connect Google buttons. No Google client secret is stored in the browser."}</p></div>
        {googleToken && <button className="ghost-button danger" onClick={disconnectGoogle}>Disconnect Google</button>}
      </section>
    </div>
  );

  const renderSettings = () => (
    <div className="view-stack">
      <section className="section-header"><div><p className="eyebrow">CONTROL</p><h1>JARVIS settings</h1><p>Keep the assistant useful without giving it reckless permissions.</p></div></section>
      <section className="settings-grid">
        <div className="glass-panel settings-card">
          <p className="eyebrow">VOICE</p><h2>Speech</h2>
          <label className="toggle-row"><div><strong>Voice replies</strong><span>Read JARVIS responses aloud using your browser speech engine.</span></div><button className={`toggle ${voiceReplies ? "on" : ""}`} onClick={() => setVoiceReplies((value) => !value)}><span /></button></label>
          <div className="setting-note">Voice recognition uses your browser’s speech recognition capability. Chrome/Edge desktop are the best-supported targets for this build.</div>
        </div>
        <div className="glass-panel settings-card">
          <p className="eyebrow">SECURITY</p><h2>Action policy</h2>
          <div className="policy-row"><span>Business reads</span><b>Automatic</b></div>
          <div className="policy-row"><span>Weather + web research</span><b>Automatic</b></div>
          <div className="policy-row"><span>Calendar writes</span><b>Approval required</b></div>
          <div className="policy-row"><span>Gmail drafts</span><b>Approval required</b></div>
          <div className="policy-row"><span>Payments / destructive deletes</span><b className="warn-text">Blocked</b></div>
        </div>
        <div className="glass-panel settings-card">
          <p className="eyebrow">ACCOUNT</p><h2>{displayName}</h2>
          <div className="account-email">{user.email}</div>
          <button className="ghost-button danger full" onClick={signOut}><LogOut size={15} /> Sign out</button>
        </div>
        <div className="glass-panel settings-card">
          <p className="eyebrow">LOCAL MEMORY</p><h2>Conversation continuity</h2>
          <p>Recent JARVIS conversation and action history are kept in this browser so the interface survives refreshes. Clear them whenever you want.</p>
          <button className="ghost-button" onClick={() => { setMessages(DEFAULT_MESSAGES); localStorage.removeItem("jarvis_messages_v1"); }}>Clear chat memory</button>
          <button className="ghost-button" onClick={() => { setActivityLog([]); localStorage.removeItem("jarvis_activity_v1"); }}>Clear activity</button>
        </div>
      </section>
    </div>
  );

  const view = activeView === "overview" ? renderOverview()
    : activeView === "assistant" ? renderAssistant()
      : activeView === "business" ? renderBusiness()
        : activeView === "calendar" ? renderCalendar()
          : activeView === "inbox" ? renderInbox()
            : activeView === "integrations" ? renderIntegrations()
              : renderSettings();

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand-block">
          <div className="brand-orb"><BrainCircuit size={22} /></div>
          <div><strong>J.A.R.V.I.S.</strong><span>Personal OS</span></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <nav>
          {navItems.map(([id, Icon, label]) => (
            <button key={id} className={activeView === id ? "active" : ""} onClick={() => { setActiveView(id); setMobileNav(false); }}>
              <Icon size={18} /><span>{label}</span>
              {id === "business" && businessMetrics.lowStock.length > 0 && <b>{businessMetrics.lowStock.length}</b>}
              {id === "inbox" && unreadCount > 0 && <b>{unreadCount}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-mini"><span><StatusDot status={business ? "live" : "setup"} /> Legacy</span><span><StatusDot status={googleToken ? "live" : "setup"} /> Google</span></div>
          <button className="profile-button" onClick={() => setActiveView("settings")}>
            <div className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <div><strong>{displayName}</strong><span>{user.email}</span></div>
            <Settings size={15} />
          </button>
        </div>
      </aside>
      {mobileNav && <button className="sidebar-backdrop" onClick={() => setMobileNav(false)} />}

      <main className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileNav(true)}><Menu size={19} /></button>
          <div className="topbar-status"><StatusDot status="live" /><span>JARVIS ONLINE</span></div>
          <div className="topbar-actions">
            {weather && <span className="weather-chip"><CloudSun size={15} />{Math.round(weather.temperature)}° {weather.description}</span>}
            {googleProfile?.picture && <img className="google-avatar" src={googleProfile.picture} alt="Google profile" referrerPolicy="no-referrer" />}
            <button className="icon-button" onClick={() => setActiveView("assistant")} title="Open assistant"><BrainCircuit size={17} /></button>
          </div>
        </header>
        <div className="content-shell">{view}</div>
      </main>
    </div>
  );
}
