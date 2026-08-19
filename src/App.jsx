import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, BrainCircuit, CalendarDays, CircleDollarSign, ClipboardList,
  CloudSun, ExternalLink, FolderLock, Gem, Inbox, LayoutDashboard, Loader2, Mail,
  Menu, Mic, Package, ReceiptText, Settings, ShieldCheck, Store, Users, X
} from "lucide-react";
import { supabase } from "./lib/supabase";
import JarvisCore from "./JarvisCore";
import LegacyCRMApp from "./LegacyCRMApp";

const MODULES = [
  { id: "overview", label: "Overview", icon: Activity, kind: "jarvis", page: "Overview" },
  { id: "business", label: "Business Intel", icon: BarChart3, kind: "jarvis", page: "Business" },
  { id: "crm-dashboard", label: "CRM Dashboard", icon: LayoutDashboard, kind: "legacy", page: "Dashboard" },
  { id: "customers", label: "Customers", icon: Users, kind: "legacy", page: "Customers" },
  { id: "inventory", label: "Inventory", icon: Gem, kind: "legacy", page: "Inventory" },
  { id: "sales", label: "Sales", icon: CircleDollarSign, kind: "legacy", page: "Sales" },
  { id: "orders", label: "Orders", icon: ClipboardList, kind: "legacy", page: "Orders" },
  { id: "expenses", label: "Expenses", icon: ReceiptText, kind: "legacy", page: "Expenses" },
  { id: "tax-vault", label: "Tax Vault", icon: FolderLock, kind: "legacy", page: "Tax Vault" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, kind: "jarvis", page: "Calendar" },
  { id: "inbox", label: "Inbox", icon: Inbox, kind: "jarvis", page: "Inbox" },
  { id: "integrations", label: "Integrations", icon: Store, kind: "jarvis", page: "Integrations" },
  { id: "settings", label: "Settings", icon: Settings, kind: "jarvis", page: "Settings" }
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function EmbeddedRoute({ kind, page }) {
  useEffect(() => {
    const bodyClass = kind === "legacy" ? "jarvis-embedded-legacy" : "jarvis-embedded-core";
    document.body.classList.add(bodyClass);
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";

    const style = document.createElement("style");
    style.dataset.jarvisEmbedStyle = "true";
    style.textContent = kind === "legacy"
      ? `
        body.jarvis-embedded-legacy > #root { min-height: 100vh; background: transparent !important; }
        body.jarvis-embedded-legacy aside.fixed.inset-y-0.left-0 { display: none !important; }
        body.jarvis-embedded-legacy header.sticky { display: none !important; }
        body.jarvis-embedded-legacy .lg\\:pl-72 { padding-left: 0 !important; }
        body.jarvis-embedded-legacy main { padding: 10px !important; }
      `
      : `
        body.jarvis-embedded-core .sidebar,
        body.jarvis-embedded-core .topbar,
        body.jarvis-embedded-core .sidebar-backdrop { display: none !important; }
        body.jarvis-embedded-core .main-shell { margin-left: 0 !important; width: 100% !important; }
        body.jarvis-embedded-core .content-shell { padding: 10px !important; }
        body.jarvis-embedded-core .command-panel { display: none !important; }
        body.jarvis-embedded-core .overview-grid { grid-template-columns: 1fr !important; }
      `;
    document.head.appendChild(style);

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const wanted = normalize(page);
      const candidates = [...document.querySelectorAll("button")];
      const target = candidates.find((button) => {
        const text = normalize(button.textContent);
        return text === wanted || text.startsWith(`${wanted} `);
      });
      if (target) {
        target.click();
        window.clearInterval(timer);
      } else if (attempts > 30) {
        window.clearInterval(timer);
      }
    }, 120);

    return () => {
      window.clearInterval(timer);
      document.body.classList.remove(bodyClass);
      style.remove();
    };
  }, [kind, page]);

  return kind === "legacy" ? <LegacyCRMApp /> : <JarvisCore />;
}

function EmbeddedFrame({ module }) {
  const src = `/?mode=${module.kind}&embed=1&page=${encodeURIComponent(module.page)}`;
  return (
    <section className="glass-panel" style={{ padding: 0, overflow: "hidden", minHeight: "calc(100vh - 118px)" }}>
      <iframe
        key={`${module.kind}-${module.page}`}
        title={`${module.label} workspace`}
        src={src}
        style={{ width: "100%", height: "calc(100vh - 120px)", border: 0, display: "block", background: "transparent" }}
      />
    </section>
  );
}

function UnifiedShell() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeId, setActiveId] = useState("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [voiceState, setVoiceState] = useState("ready");
  const [voiceEnergy, setVoiceEnergy] = useState(0);
  const [lastCommand, setLastCommand] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [business, setBusiness] = useState(null);
  const [inventory, setInventory] = useState([]);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const meterFrameRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session || null);
        setAuthReady(true);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshInventory = useCallback(async () => {
    if (!session?.user?.id) return { business: null, inventory: [] };
    const businessResult = await supabase
      .from("legacy_businesses")
      .select("*")
      .eq("owner_id", session.user.id)
      .maybeSingle();
    if (businessResult.error) throw businessResult.error;
    const biz = businessResult.data;
    setBusiness(biz || null);
    if (!biz) {
      setInventory([]);
      return { business: null, inventory: [] };
    }
    const invResult = await supabase
      .from("legacy_inventory")
      .select("*")
      .eq("business_id", biz.id)
      .order("created_at", { ascending: false });
    if (invResult.error) throw invResult.error;
    const rows = invResult.data || [];
    setInventory(rows);
    return { business: biz, inventory: rows };
  }, [session?.user?.id]);

  useEffect(() => { refreshInventory().catch(() => {}); }, [refreshInventory]);

  useEffect(() => {
    if (!business?.id) return undefined;
    const channel = supabase
      .channel(`unified-legacy-${business.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "legacy_inventory", filter: `business_id=eq.${business.id}` }, () => refreshInventory())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business?.id, refreshInventory]);

  const activeModule = useMemo(() => MODULES.find((item) => item.id === activeId) || MODULES[0], [activeId]);

  const buildJarvisContext = useCallback(async () => {
    if (!session?.user?.id) return { now: new Date().toISOString(), inventory: [] };
    const bizResult = await supabase.from("legacy_businesses").select("*").eq("owner_id", session.user.id).maybeSingle();
    if (bizResult.error) throw bizResult.error;
    const biz = bizResult.data;
    if (!biz) return { now: new Date().toISOString(), inventory: [] };

    const [inv, sales, items, orders, customers] = await Promise.all([
      supabase.from("legacy_inventory").select("*").eq("business_id", biz.id),
      supabase.from("legacy_sales").select("*").eq("business_id", biz.id),
      supabase.from("legacy_sale_items").select("*").eq("business_id", biz.id),
      supabase.from("legacy_orders").select("*").eq("business_id", biz.id),
      supabase.from("legacy_customers").select("*").eq("business_id", biz.id)
    ]);
    const firstError = [inv, sales, items, orders, customers].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const inventoryRows = inv.data || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const saleById = new Map((sales.data || []).map((sale) => [sale.id, sale]));
    const monthItems = (items.data || []).filter((item) => {
      const sale = saleById.get(item.sale_id);
      return sale?.sold_at && new Date(`${sale.sold_at}T00:00:00`) >= monthStart;
    });
    const monthRevenue = monthItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_price || 0), 0);
    const monthCogs = monthItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unit_cost || 0), 0);
    const lowStock = inventoryRows.filter((item) => Number(item.qty || 0) <= Number(item.low_stock_threshold ?? 1));

    return {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
      business: {
        connected: true,
        name: biz.name || "Legacy Jewelry Co.",
        monthRevenue,
        monthRevenueFormatted: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(monthRevenue),
        monthProfit: monthRevenue - monthCogs,
        monthProfitFormatted: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(monthRevenue - monthCogs),
        inventoryUnits: inventoryRows.reduce((sum, item) => sum + Number(item.qty || 0), 0),
        inventoryStyles: inventoryRows.length,
        lowStockCount: lowStock.length,
        lowStockItems: lowStock.slice(0, 12).map((item) => ({ id: item.id, product: item.product, sku: item.sku, qty: item.qty })),
        openOrders: (orders.data || []).filter((order) => !/complete|completed|delivered|cancel|sold/i.test(order.status || "")).length,
        customers: (customers.data || []).length
      },
      inventory: inventoryRows.slice(0, 150).map((item) => ({
        id: item.id,
        product: item.product || "",
        sku: item.sku || "",
        color: item.color || "",
        metal: item.metal || "",
        carat: item.carat,
        ring_size: item.ring_size || "",
        qty: Number(item.qty || 0),
        unit_cost: Number(item.unit_cost || 0),
        sale_price: Number(item.sale_price || 0)
      })),
      connections: { legacy: true, openai: "server-managed" }
    };
  }, [session?.user?.id]);

  const performInventoryUpdate = useCallback(async (action, context) => {
    const rows = context.inventory || [];
    let matches = [];
    if (action.inventory_id) matches = rows.filter((item) => item.id === action.inventory_id);
    if (!matches.length && action.inventory_query) {
      const query = normalize(action.inventory_query);
      matches = rows.filter((item) => {
        const haystack = normalize([item.product, item.sku, item.color, item.metal, item.carat, item.ring_size].filter(Boolean).join(" "));
        return haystack.includes(query) || query.split(" ").every((part) => haystack.includes(part));
      });
    }
    if (matches.length !== 1) {
      if (!matches.length) throw new Error(`I couldn't uniquely find “${action.inventory_query || "that item"}” in the CRM.`);
      throw new Error(`I found ${matches.length} possible inventory matches. Say the SKU, color, metal, carat, or size so I change the correct one.`);
    }
    const item = matches[0];
    const newQty = Math.trunc(Number(action.new_quantity));
    if (!Number.isFinite(newQty) || newQty < 0) throw new Error("The new inventory quantity has to be zero or more.");
    const { error } = await supabase
      .from("legacy_inventory")
      .update({ qty: newQty })
      .eq("id", item.id)
      .eq("business_id", business?.id || context.business?.id || "");
    if (error) throw error;
    await refreshInventory();
    return `Done. ${item.product}${item.sku ? ` (${item.sku})` : ""} is now ${newQty} in stock. The manual CRM and JARVIS are using the same record, so both views will show the change.`;
  }, [business?.id, refreshInventory]);

  const speak = useCallback(async (text) => {
    if (!text) return;
    setVoiceState("speaking");
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(text).slice(0, 1600) })
      });
      if (!response.ok) throw new Error("Voice generation failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const meter = () => {
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
          setVoiceEnergy(Math.min(1, avg / 115));
          if (!audio.paused && !audio.ended) meterFrameRef.current = requestAnimationFrame(meter);
        };
        meter();
      }
      await audio.play();
      await new Promise((resolve) => {
        audio.onended = resolve;
        audio.onerror = resolve;
      });
      URL.revokeObjectURL(url);
    } catch {
      // The visual reply remains available even if audio playback is blocked.
    } finally {
      if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
      setVoiceEnergy(0);
      setVoiceState("ready");
    }
  }, []);

  const runCommand = useCallback(async (message) => {
    const clean = String(message || "").trim().replace(/^hey\s+jarvis[,:]?\s*/i, "");
    if (!clean) return;
    setLastCommand(clean);
    setVoiceState("thinking");
    try {
      const context = await buildJarvisContext();
      const response = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history: [], context })
      });
      const raw = await response.text();
      const data = safeJson(raw);
      if (!data) throw new Error(raw.slice(0, 180) || "JARVIS returned an unreadable response.");
      if (!response.ok) throw new Error(data.error || "JARVIS unavailable");

      let reply = String(data.reply || "I'm online.");
      if (data.action?.type === "inventory_update") {
        const result = await performInventoryUpdate(data.action, context);
        reply = result;
      } else if (data.action?.type && data.action.type !== "none") {
        reply += " That action still needs the relevant JARVIS module or approval flow, so I haven't claimed it happened.";
      }
      setLastReply(reply);
      await speak(reply);
    } catch (error) {
      const reply = `I couldn't complete that: ${error.message || "unknown error"}`;
      setLastReply(reply);
      await speak(reply);
    } finally {
      if (voiceState !== "speaking") setVoiceState("ready");
    }
  }, [buildJarvisContext, performInventoryUpdate, speak, voiceState]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (voiceState === "listening") {
      stopRecording();
      return;
    }
    if (voiceState !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
        setVoiceEnergy(0);
        setVoiceState("transcribing");
        try {
          const blob = new Blob(chunks, { type: mime });
          const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": mime }, body: blob });
          const raw = await response.text();
          const data = safeJson(raw);
          if (!data) throw new Error(raw.slice(0, 180) || "Transcription returned an unreadable response.");
          if (!response.ok) throw new Error(data.error || "Transcription failed");
          await runCommand(data.text || "");
        } catch (error) {
          setLastReply(`Voice error: ${error.message || "unknown error"}`);
          setVoiceState("ready");
        }
      };

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      let heardSpeech = false;
      let lastLoudAt = Date.now();
      const startedAt = Date.now();
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const meter = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const value of data) {
            const centered = (value - 128) / 128;
            sum += centered * centered;
          }
          const rms = Math.sqrt(sum / data.length);
          const energy = Math.min(1, rms * 7.5);
          setVoiceEnergy(energy);
          if (rms > 0.028) {
            heardSpeech = true;
            lastLoudAt = Date.now();
          }
          const silentLongEnough = heardSpeech && Date.now() - lastLoudAt > 1250;
          const maxLength = Date.now() - startedAt > 12000;
          if ((silentLongEnough || maxLength) && recorder.state === "recording") recorder.stop();
          else if (recorder.state === "recording") meterFrameRef.current = requestAnimationFrame(meter);
        };
        meter();
      }
      recorder.start(250);
      setVoiceState("listening");
    } catch (error) {
      setLastReply(`Microphone error: ${error.message || "permission unavailable"}`);
      setVoiceState("ready");
    }
  }, [runCommand, stopRecording, voiceState]);

  if (!authReady) {
    return <main className="loading-screen"><div className="mini-orb"><Loader2 className="spin" size={28} /></div><p>Linking JARVIS and Legacy CRM…</p></main>;
  }
  if (!session) return <LegacyCRMApp />;

  const displayName = session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || "Prince";
  const orbScale = 1 + voiceEnergy * 0.2;
  const orbGlow = 20 + voiceEnergy * 55;
  const stateLabel = voiceState === "listening" ? "LISTENING" : voiceState === "transcribing" ? "TRANSCRIBING" : voiceState === "thinking" ? "ANALYZING" : voiceState === "speaking" ? "SPEAKING" : "READY";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-block">
          <div className="brand-orb"><BrainCircuit size={22} /></div>
          <div><strong>J.A.R.V.I.S.</strong><span>Legacy Jewelry OS</span></div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav>
          {MODULES.map(({ id, icon: Icon, label }) => (
            <button key={id} className={activeId === id ? "active" : ""} onClick={() => { setActiveId(id); setMobileOpen(false); }}>
              <Icon size={18} /><span>{label}</span>
              {id === "inventory" && inventory.filter((item) => Number(item.qty || 0) <= Number(item.low_stock_threshold ?? 1)).length > 0 && <b>{inventory.filter((item) => Number(item.qty || 0) <= Number(item.low_stock_threshold ?? 1)).length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-mini"><span><span className="status-dot live" /> CRM live</span><span><span className="status-dot live" /> JARVIS live</span></div>
          <button className="profile-button" onClick={() => setActiveId("settings")}>
            <div className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
            <div><strong>{displayName}</strong><span>{session.user.email}</span></div>
            <Settings size={15} />
          </button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <main className="main-shell">
        <header className="topbar" style={{ minHeight: 74 }}>
          <button className="mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <div className="topbar-status"><span className="status-dot live" /><span>JARVIS + LEGACY ONLINE</span></div>
          <div className="topbar-actions" style={{ gap: 12 }}>
            <div className="weather-chip" style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <ShieldCheck size={15} /> {lastReply || `Manual CRM and JARVIS share ${inventory.length} live inventory records`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                className={`jarvis-orb ${voiceState}`}
                onClick={startRecording}
                title="Talk to JARVIS"
                style={{ width: 48, height: 48, transform: `scale(${orbScale})`, filter: `drop-shadow(0 0 ${orbGlow}px rgba(34,211,238,.55))` }}
              >
                <span className="orb-ring orb-ring-1" />
                <span className="orb-ring orb-ring-2" />
                <span className="orb-core"><Mic size={18} /></span>
              </button>
              <small style={{ minWidth: 88, color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em" }}>{stateLabel}</small>
            </div>
            <button className="icon-button" onClick={() => window.open("/?mode=legacy", "_blank")} title="Open classic CRM"><ExternalLink size={17} /></button>
          </div>
        </header>

        <div className="content-shell">
          <section className="section-header" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">UNIFIED COMMAND CENTER</p>
              <h1>{activeModule.label}</h1>
              <p>{activeModule.kind === "legacy" ? "The original Legacy CRM screen is running here with its full manual controls and original data." : "The JARVIS module is running here against the same live Legacy business database."}</p>
            </div>
            <div className="header-actions">
              {lastCommand && <span className="live-pill"><span className="status-dot live" /> Last voice: {lastCommand.slice(0, 55)}</span>}
              {activeModule.kind === "legacy" && <button className="ghost-button" onClick={() => window.open(`/?mode=legacy&page=${encodeURIComponent(activeModule.page)}`, "_blank")}><ExternalLink size={14} /> Full CRM</button>}
            </div>
          </section>
          <EmbeddedFrame module={activeModule} />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const page = params.get("page") || (mode === "legacy" ? "Dashboard" : "Overview");
  if (mode === "legacy") return <EmbeddedRoute kind="legacy" page={page} />;
  if (mode === "jarvis") return <EmbeddedRoute kind="jarvis" page={page} />;
  return <UnifiedShell />;
}
