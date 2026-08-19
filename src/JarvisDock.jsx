import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BrainCircuit, CalendarDays, Camera, Check, ChevronRight, CircleDot,
  Cloud, Computer, ExternalLink, Eye, Home, ImagePlus, Link2, Mail,
  MemoryStick, Mic, MicOff, RefreshCw, Send, Settings2, ShieldCheck, ShoppingBag,
  Sparkles, Square, Store, Volume2, Waves, X, Zap
} from "lucide-react";
import { supabase } from "./lib/supabase";

const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/contacts.readonly",
].join(" ");

const DEFAULT_PREFS = {
  voice_enabled: true,
  proactive_enabled: true,
  weather_enabled: true,
  require_approval_external_writes: true,
  preferred_name: "Prince",
  home_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  settings: {},
};

const S = {
  orb: {
    position: "fixed", right: 22, bottom: 22, zIndex: 40, width: 66, height: 66,
    borderRadius: "50%", border: "1px solid rgba(103,232,249,.62)", cursor: "pointer",
    background: "radial-gradient(circle at 34% 28%, #d8fbff 0%, #67e8f9 10%, #0891b2 30%, #0f3550 57%, #06131f 78%)",
    color: "#ecfeff", boxShadow: "0 0 0 5px rgba(34,211,238,.08),0 0 34px rgba(34,211,238,.48),0 12px 30px rgba(2,6,23,.3)",
    display: "grid", placeItems: "center", padding: 0,
  },
  panel: {
    position: "fixed", right: 12, bottom: 98, zIndex: 40,
    width: "min(452px, calc(100vw - 24px))", height: "min(690px, calc(100vh - 116px))",
    borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column",
    color: "#eafaff", border: "1px solid rgba(103,232,249,.22)",
    background: "linear-gradient(180deg, rgba(6,19,31,.985), rgba(7,17,31,.985))",
    boxShadow: "0 28px 90px rgba(2,6,23,.55),0 0 36px rgba(34,211,238,.14)",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  tab: (active) => ({
    border: 0, borderRadius: 10, padding: "8px 11px", cursor: "pointer", fontWeight: 800, fontSize: 11,
    color: active ? "#ecfeff" : "#94a3b8", background: active ? "rgba(8,145,178,.2)" : "transparent",
  }),
  card: {
    border: "1px solid rgba(148,163,184,.13)", borderRadius: 16, padding: 13,
    background: "rgba(15,23,42,.66)",
  },
  button: {
    border: "1px solid rgba(103,232,249,.22)", background: "rgba(8,145,178,.12)", color: "#cffafe",
    borderRadius: 11, padding: "9px 11px", fontWeight: 800, fontSize: 12, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  },
  input: {
    flex: 1, minWidth: 0, border: "1px solid rgba(148,163,184,.18)", borderRadius: 13,
    background: "rgba(15,23,42,.86)", color: "white", padding: "11px 12px", outline: "none", fontSize: 13,
  },
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function firstNumber(record, keys) {
  for (const key of keys) {
    const n = Number(record?.[key]);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(safeNumber(value));
}

function base64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function waitForIce(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2200);
    const handler = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timeout);
        pc.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handler);
  });
}

function statusDot(live, text) {
  return <span style={{ fontSize: 11, fontWeight: 900, color: live ? "#86efac" : "#fbbf24" }}>● {text || (live ? "LIVE" : "SETUP")}</span>;
}

export default function JarvisDock() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("chat");
  const [session, setSession] = useState(null);
  const [crm, setCrm] = useState({ business: null, inventory: [], sales: [], orders: [], customers: [], expenses: [] });
  const [memories, setMemories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [messages, setMessages] = useState([{ role: "assistant", content: "JARVIS online. Legacy CRM is protected and connected." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveVoice, setLiveVoice] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState({});
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("jarvis_google_token") || "");
  const [googleProfile, setGoogleProfile] = useState(null);
  const [googleSnapshot, setGoogleSnapshot] = useState({ calendar: [], inbox: [], contacts: [] });
  const [weather, setWeather] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [storeSnapshots, setStoreSnapshots] = useState({ shopify: null, ebay: null, homeAssistant: null });
  const [toast, setToast] = useState("");

  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceTimerRef = useRef(null);
  const audioRef = useRef(null);
  const realtimePcRef = useRef(null);
  const realtimeStreamRef = useRef(null);
  const fileRef = useRef(null);
  const messageEndRef = useRef(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const notify = (text) => {
    setToast(String(text || ""));
    window.setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadAll();
    const channel = supabase
      .channel(`jarvis-dock-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_notifications", filter: `user_id=eq.${session.user.id}` }, () => loadJarvisState())
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_tasks", filter: `user_id=eq.${session.user.id}` }, () => loadJarvisState())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/integrations/status").then((r) => r.json()).then(setIntegrationStatus).catch(() => {});
    if (googleToken) refreshGoogle(googleToken);
    window.setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  }, [open]);

  useEffect(() => {
    if (!googleToken) return;
    refreshGoogle(googleToken).catch(() => {});
  }, [googleToken]);

  useEffect(() => {
    if (open) messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  useEffect(() => () => {
    stopVoice(false);
    stopRealtime(false);
    if (audioRef.current) audioRef.current.pause();
  }, []);

  async function loadAll() {
    await Promise.all([loadCrm(), loadJarvisState()]);
  }

  async function loadCrm() {
    const uid = session?.user?.id;
    if (!uid) return;
    const businessResult = await supabase.from("legacy_businesses").select("*").eq("owner_id", uid).maybeSingle();
    const business = businessResult.data || null;
    if (!business) return;
    const [inventory, sales, orders, customers, expenses] = await Promise.all([
      supabase.from("legacy_inventory").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("legacy_sales").select("*").eq("business_id", business.id).order("sold_at", { ascending: false }).limit(300),
      supabase.from("legacy_orders").select("*").eq("business_id", business.id).order("order_date", { ascending: false }).limit(200),
      supabase.from("legacy_customers").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(300),
      supabase.from("legacy_expenses").select("*").eq("business_id", business.id).order("expense_date", { ascending: false }).limit(300),
    ]);
    setCrm({
      business,
      inventory: inventory.data || [],
      sales: sales.data || [],
      orders: orders.data || [],
      customers: customers.data || [],
      expenses: expenses.data || [],
    });
  }

  async function loadJarvisState() {
    const uid = session?.user?.id;
    if (!uid) return;
    const [memoryResult, taskResult, prefResult, notificationResult] = await Promise.all([
      supabase.from("jarvis_memories").select("*").eq("user_id", uid).order("updated_at", { ascending: false }).limit(50),
      supabase.from("jarvis_tasks").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
      supabase.from("jarvis_preferences").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("jarvis_notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(30),
    ]);
    setMemories(memoryResult.data || []);
    setTasks(taskResult.data || []);
    setNotifications(notificationResult.data || []);
    if (prefResult.data) setPrefs({ ...DEFAULT_PREFS, ...prefResult.data });
  }

  const summary = useMemo(() => {
    const units = crm.inventory.reduce((sum, item) => sum + safeNumber(item.qty), 0);
    const lowStock = crm.inventory.filter((item) => safeNumber(item.qty) <= safeNumber(item.low_stock_threshold ?? 1)).length;
    const openOrders = crm.orders.filter((order) => !["completed", "canceled", "cancelled"].includes(String(order.status || "").toLowerCase())).length;
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthSales = crm.sales.filter((sale) => new Date(sale.sold_at || sale.created_at || 0) >= monthStart);
    const monthRevenue = monthSales.reduce((sum, sale) => sum + firstNumber(sale, ["total", "total_amount", "sale_total", "amount", "gross_revenue"]), 0);
    const monthProfit = monthSales.reduce((sum, sale) => sum + firstNumber(sale, ["profit", "gross_profit", "net_profit", "estimated_profit"]), 0);
    return {
      connected: Boolean(crm.business),
      businessName: crm.business?.name || "Legacy Jewelry Co.",
      inventoryUnits: units,
      inventoryStyles: crm.inventory.length,
      lowStockCount: lowStock,
      openOrders,
      customers: crm.customers.length,
      monthRevenue,
      monthRevenueFormatted: money(monthRevenue),
      monthProfit,
      monthProfitFormatted: money(monthProfit),
    };
  }, [crm]);

  const currentContext = () => ({
    now: new Date().toISOString(),
    timezone: prefs.home_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    weather,
    business: summary,
    inventory: crm.inventory.slice(0, 100),
    orders: crm.orders.slice(0, 40),
    calendar: googleSnapshot.calendar.slice(0, 10),
    inbox: googleSnapshot.inbox.slice(0, 10),
    memories: memories.slice(0, 20),
    tasks: tasks.slice(0, 20),
    connections: { google: Boolean(googleToken), legacy: Boolean(crm.business) },
    extensions: integrationStatus,
  });

  async function send(text = input) {
    const clean = String(text || "").trim();
    if (!clean || busy) return;
    setInput("");
    setBusy(true);
    setOpen(true);
    const prior = messages.slice(-10);
    setMessages((items) => [...items, { role: "user", content: clean }]);
    try {
      const response = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history: prior, context: currentContext() }),
      });
      const data = await response.json();
      const reply = String(data.reply || data.error || "I’m online.");
      setMessages((items) => [...items, { role: "assistant", content: reply }]);
      if (data.action?.type && data.action.type !== "none") await stageAction(data.action);
      await remember(clean, reply);
      if (prefs.voice_enabled !== false) speak(reply);
    } catch (error) {
      const reply = `I couldn't complete that: ${error.message}`;
      setMessages((items) => [...items, { role: "assistant", content: reply }]);
    } finally {
      setBusy(false);
    }
  }

  async function remember(userText, assistantText) {
    if (!session?.user?.id) return;
    try {
      const response = await fetch("/api/memory-extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userText, assistant: assistantText }),
      });
      const data = await response.json();
      const extracted = Array.isArray(data.memories) ? data.memories : [];
      const existing = new Set(memories.map((item) => String(item.content || "").trim().toLowerCase()));
      const rows = extracted
        .filter((item) => item?.content && !existing.has(String(item.content).trim().toLowerCase()))
        .map((item) => ({ user_id: session.user.id, kind: item.kind || "general", content: String(item.content).trim(), metadata: { source: "jarvis_chat" } }));
      if (rows.length) {
        await supabase.from("jarvis_memories").insert(rows);
        await loadJarvisState();
      }
    } catch {}
  }

  async function speak(text) {
    if (!text || prefs.voice_enabled === false) return;
    try {
      if (audioRef.current) audioRef.current.pause();
      const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: String(text).slice(0, 3900) }) });
      if (!response.ok) throw new Error("server voice unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3000));
        utterance.rate = 0.97; utterance.pitch = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    }
  }

  function clearVoiceTimer() {
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = null;
  }

  function stopVoice(updateState = true) {
    clearVoiceTimer();
    try { recognitionRef.current?.abort?.(); } catch {}
    recognitionRef.current = null;
    try {
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    } catch {}
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (updateState) setListening(false);
  }

  async function startVoice() {
    if (listening) { stopVoice(); return; }
    setOpen(true);
    if (liveVoice) { stopRealtime(); return; }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = "en-US"; rec.continuous = false; rec.interimResults = true; rec.maxAlternatives = 1;
      recognitionRef.current = rec;
      let finalText = "";
      rec.onstart = () => { setListening(true); voiceTimerRef.current = window.setTimeout(() => { try { rec.stop(); } catch {} }, 12000); };
      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const text = event.results[i]?.[0]?.transcript || "";
          if (event.results[i].isFinal) finalText += text; else interim += text;
        }
        if (interim) setInput(interim);
      };
      rec.onerror = () => { clearVoiceTimer(); setListening(false); };
      rec.onend = () => {
        clearVoiceTimer(); recognitionRef.current = null; setListening(false);
        const text = finalText.trim();
        if (text) { setInput(""); send(text); }
      };
      try { rec.start(); } catch { setListening(false); }
      return;
    }
    await recordAndTranscribe();
  }

  async function recordAndTranscribe() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearVoiceTimer(); setListening(false);
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try {
          const response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Transcription failed");
          if (data.text) send(data.text);
        } catch (error) { notify(error.message); }
      };
      recorder.start(); setListening(true);
      voiceTimerRef.current = window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 12000);
    } catch (error) {
      setListening(false); notify(error.message || "Microphone permission is required.");
    }
  }

  async function startRealtime() {
    if (liveVoice) { stopRealtime(); return; }
    try {
      stopVoice();
      const pc = new RTCPeerConnection();
      realtimePcRef.current = pc;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      pc.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
      const dataChannel = pc.createDataChannel("oai-events");
      dataChannel.onmessage = (event) => {
        try {
          const item = JSON.parse(event.data);
          const transcript = item?.transcript || item?.text || "";
          if (transcript && /transcript.*completed|conversation\.item\.input_audio_transcription\.completed/i.test(String(item.type || ""))) {
            setMessages((items) => [...items, { role: "user", content: transcript }]);
          }
        } catch {}
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const response = await fetch("/api/realtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sdp: pc.localDescription?.sdp, context: currentContext() }) });
      const answer = await response.text();
      if (!response.ok) throw new Error(answer || "Realtime voice failed");
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      setLiveVoice(true); setOpen(true); notify("Realtime voice connected");
    } catch (error) {
      stopRealtime(); notify(error.message || "Realtime voice failed");
    }
  }

  function stopRealtime(updateState = true) {
    try { realtimePcRef.current?.close?.(); } catch {}
    realtimePcRef.current = null;
    if (realtimeStreamRef.current) realtimeStreamRef.current.getTracks().forEach((track) => track.stop());
    realtimeStreamRef.current = null;
    if (updateState) setLiveVoice(false);
  }

  async function stageAction(action) {
    const local = { ...action, id: null };
    if (session?.user?.id) {
      const result = await supabase.from("jarvis_pending_actions").insert({
        user_id: session.user.id,
        action_type: action.type,
        title: action.title || action.subject || action.query || action.type,
        payload: action,
        status: "pending",
        reason: action.reason || "",
      }).select("id").single();
      if (result.data?.id) local.id = result.data.id;
    }
    setPendingAction(local);
  }

  async function approveAction() {
    const action = pendingAction;
    if (!action) return;
    try {
      if (action.type === "business_refresh") {
        await loadAll();
      } else if (["calendar_create", "calendar_search", "gmail_search", "gmail_draft"].includes(action.type)) {
        if (!googleToken) throw new Error("Connect Google first.");
        await executeGoogleAction(action);
      } else {
        throw new Error("That action is not wired for approval yet.");
      }
      if (action.id) await supabase.from("jarvis_pending_actions").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", action.id);
      await logActivity(action.type, action.title || action.subject || action.query || action.type, "completed", action);
      setPendingAction(null); notify("Action completed");
    } catch (error) {
      if (action.id) await supabase.from("jarvis_pending_actions").update({ status: "failed", reason: error.message, updated_at: new Date().toISOString() }).eq("id", action.id);
      await logActivity(action.type, error.message, "failed", action);
      notify(error.message);
    }
  }

  async function denyAction() {
    if (pendingAction?.id) await supabase.from("jarvis_pending_actions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", pendingAction.id);
    setPendingAction(null);
  }

  async function logActivity(actionType, summaryText, status, payload = {}) {
    if (!session?.user?.id) return;
    await supabase.from("jarvis_activity").insert({ user_id: session.user.id, action_type: actionType, summary: summaryText, status, payload });
  }

  async function connectGoogle() {
    if (!googleClientId) { notify("VITE_GOOGLE_CLIENT_ID is not configured yet."); return; }
    if (!window.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = resolve; script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: GOOGLE_SCOPES,
      callback: (response) => {
        if (response.access_token) {
          setGoogleToken(response.access_token);
          sessionStorage.setItem("jarvis_google_token", response.access_token);
        }
      },
    });
    client.requestAccessToken({ prompt: googleToken ? "" : "consent" });
  }

  async function refreshGoogle(token = googleToken) {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [profileResponse, calendarResponse, gmailResponse, contactsResponse] = await Promise.all([
        fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers }),
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(new Date().toISOString())}`, { headers }),
        fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=is%3Ainbox", { headers }),
        fetch("https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=20", { headers }),
      ]);
      if (profileResponse.status === 401) throw new Error("Google session expired");
      const profile = profileResponse.ok ? await profileResponse.json() : null;
      const calendarData = calendarResponse.ok ? await calendarResponse.json() : { items: [] };
      const gmailData = gmailResponse.ok ? await gmailResponse.json() : { messages: [] };
      const contactsData = contactsResponse.ok ? await contactsResponse.json() : { connections: [] };
      const inbox = await Promise.all((gmailData.messages || []).slice(0, 6).map(async (message) => {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers });
        if (!response.ok) return null;
        const data = await response.json();
        const headersList = data.payload?.headers || [];
        return {
          id: data.id,
          subject: headersList.find((h) => h.name === "Subject")?.value || "(no subject)",
          from: headersList.find((h) => h.name === "From")?.value || "",
          snippet: data.snippet || "",
        };
      }));
      setGoogleProfile(profile);
      setGoogleSnapshot({
        calendar: (calendarData.items || []).map((event) => ({ id: event.id, title: event.summary || "Untitled", when: event.start?.dateTime || event.start?.date || "", end: event.end?.dateTime || event.end?.date || "" })),
        inbox: inbox.filter(Boolean),
        contacts: (contactsData.connections || []).map((person) => ({ name: person.names?.[0]?.displayName || "", email: person.emailAddresses?.[0]?.value || "" })).filter((item) => item.name || item.email),
      });
    } catch (error) {
      setGoogleToken(""); setGoogleProfile(null); sessionStorage.removeItem("jarvis_google_token");
      if (String(error.message).includes("expired")) notify("Google connection expired. Reconnect when ready.");
    }
  }

  async function executeGoogleAction(action) {
    const headers = { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" };
    if (action.type === "calendar_create") {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST", headers,
        body: JSON.stringify({ summary: action.title || "JARVIS event", start: { dateTime: action.start }, end: { dateTime: action.end } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Calendar event failed");
      setMessages((items) => [...items, { role: "assistant", content: `Calendar event created: ${data.summary || action.title}.` }]);
      await refreshGoogle();
      return;
    }
    if (action.type === "calendar_search") {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(new Date().toISOString())}&q=${encodeURIComponent(action.query || "")}`;
      const response = await fetch(url, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Calendar search failed");
      const text = (data.items || []).slice(0, 5).map((event) => `${event.summary || "Untitled"} — ${event.start?.dateTime || event.start?.date || ""}`).join("\n") || "No matching calendar events.";
      setMessages((items) => [...items, { role: "assistant", content: text }]);
      return;
    }
    if (action.type === "gmail_search") {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(action.query || "")}`, { headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gmail search failed");
      setMessages((items) => [...items, { role: "assistant", content: `I found ${(data.messages || []).length} matching Gmail messages.` }]);
      return;
    }
    if (action.type === "gmail_draft") {
      const raw = `To: ${action.to || ""}\r\nSubject: ${action.subject || ""}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${action.body || ""}`;
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { method: "POST", headers, body: JSON.stringify({ message: { raw: base64Url(raw) } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gmail draft failed");
      setMessages((items) => [...items, { role: "assistant", content: `Gmail draft created${action.to ? ` for ${action.to}` : ""}. I did not send it.` }]);
    }
  }

  async function analyzeImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Choose an image file."); return; }
    setVisionBusy(true); setOpen(true); setTab("chat");
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      setMessages((items) => [...items, { role: "user", content: `Analyze image: ${file.name}` }]);
      const response = await fetch("/api/vision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, prompt: "Analyze this image for JARVIS. If it is jewelry, inventory, a receipt, document, product, screen, or business-related image, extract the useful details and tell me what matters next." }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Vision failed");
      setMessages((items) => [...items, { role: "assistant", content: data.result || "Image analyzed." }]);
      if (prefs.voice_enabled !== false) speak(data.result || "Image analyzed.");
    } catch (error) { notify(error.message); }
    finally { setVisionBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function refreshWeather(requestPermission = true) {
    if (!navigator.geolocation) { notify("Location is not available in this browser."); return; }
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: requestPermission ? 9000 : 2500, maximumAge: 10 * 60 * 1000 }));
      const { latitude, longitude } = position.coords;
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&hourly=precipitation_probability&temperature_unit=fahrenheit&forecast_days=1`);
      const data = await response.json();
      const rainChance = Math.max(0, ...(data.hourly?.precipitation_probability || [0]).slice(0, 8));
      const next = { temperature: data.current?.temperature_2m, unit: "F", description: `weather code ${data.current?.weather_code ?? "—"}`, rainChance };
      setWeather(next); return next;
    } catch (error) { if (requestPermission) notify(error.message || "Weather location unavailable."); }
  }

  async function updatePreference(key, value) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (!session?.user?.id) return;
    await supabase.from("jarvis_preferences").upsert({
      user_id: session.user.id,
      voice_enabled: next.voice_enabled,
      proactive_enabled: next.proactive_enabled,
      weather_enabled: next.weather_enabled,
      require_approval_external_writes: true,
      preferred_name: next.preferred_name,
      home_timezone: next.home_timezone,
      settings: next.settings || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  }

  async function queueDesktop(command, args, label) {
    if (!session?.user?.id) return;
    const result = await supabase.from("jarvis_device_commands").insert({ user_id: session.user.id, device: "desktop", command, args, status: "pending" });
    if (result.error) notify(result.error.message); else { notify(`${label} queued for the desktop companion`); await logActivity(`desktop_${command}`, label, "queued", args); }
  }

  async function loadExternal(name) {
    try {
      const response = await fetch(`/api/integrations/${name}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${name} unavailable`);
      setStoreSnapshots((current) => ({ ...current, [name === "home-assistant" ? "homeAssistant" : name]: data }));
    } catch (error) { notify(error.message); }
  }

  async function toggleHomeAssistant(entity) {
    const domain = String(entity.entity_id || "").split(".")[0];
    const response = await fetch("/api/integrations/home-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, service: "toggle", entity_id: entity.entity_id }) });
    const data = await response.json();
    if (!response.ok) notify(data.error || "Home Assistant action failed"); else { notify(`Toggled ${entity.friendly_name || entity.entity_id}`); loadExternal("home-assistant"); }
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { notify("Browser notifications are not supported here."); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      new Notification("JARVIS", { body: "Browser alerts are enabled for this device." });
      notify("Browser alerts enabled");
    } else notify("Notification permission was not granted");
  }

  const unread = notifications.filter((item) => !item.read_at).length;
  const orbActive = listening || liveVoice;

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close JARVIS" : "Open JARVIS"}
        title={liveVoice ? "JARVIS realtime voice active" : listening ? "JARVIS is listening" : "Open JARVIS"}
        onClick={() => setOpen((value) => !value)}
        style={{ ...S.orb, transform: orbActive ? "scale(1.055)" : "scale(1)", boxShadow: orbActive ? "0 0 0 7px rgba(34,211,238,.14),0 0 52px rgba(34,211,238,.72),0 12px 30px rgba(2,6,23,.3)" : S.orb.boxShadow }}
      >
        <span style={{ position: "absolute", inset: 7, borderRadius: "50%", border: "1px solid rgba(207,250,254,.3)" }} />
        <BrainCircuit size={29} style={{ position: "relative", zIndex: 1 }} />
        {unread > 0 && <span style={{ position: "absolute", right: -2, top: -2, minWidth: 20, height: 20, borderRadius: 999, background: "#ef4444", color: "white", fontSize: 10, fontWeight: 900, display: "grid", placeItems: "center", padding: "0 5px" }}>{Math.min(unread, 99)}</span>}
      </button>

      {open && (
        <section style={S.panel} aria-label="JARVIS assistant panel">
          <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderBottom: "1px solid rgba(148,163,184,.12)", background: "rgba(8,20,34,.92)" }}>
            <button onClick={startVoice} style={{ width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(103,232,249,.45)", background: "radial-gradient(circle at 35% 30%,#67e8f9,#0891b2 34%,#0f172a 74%)", color: "white", cursor: "pointer", display: "grid", placeItems: "center" }} title="Talk to JARVIS">
              {listening ? <Waves size={21} /> : <BrainCircuit size={21} />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#67e8f9", fontWeight: 950, letterSpacing: 2.2 }}>J.A.R.V.I.S.</div>
              <div style={{ fontSize: 15, fontWeight: 900 }}>Legacy Intelligence</div>
              <div style={{ fontSize: 10, color: orbActive ? "#67e8f9" : "#94a3b8" }}>{liveVoice ? "REALTIME VOICE ACTIVE" : listening ? "LISTENING…" : `${summary.inventoryUnits} units · ${summary.lowStockCount} low stock · ${summary.openOrders} open orders`}</div>
            </div>
            <button style={{ ...S.button, padding: 8 }} title="Realtime voice" onClick={startRealtime}>{liveVoice ? <Square size={16} /> : <Zap size={16} />}</button>
            <button style={{ ...S.button, padding: 8 }} title="Close JARVIS" onClick={() => setOpen(false)}><X size={17} /></button>
          </header>

          <div style={{ display: "flex", gap: 3, padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,.1)" }}>
            {[["chat", "Chat"], ["system", "System"], ["integrations", "Integrations"]].map(([id, label]) => <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>)}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", color: "#64748b", fontSize: 10 }}>{integrationStatus.openai ? statusDot(true, "AI") : statusDot(false, "LOCAL")}</div>
          </div>

          {tab === "chat" && (
            <div style={{ minHeight: 0, flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                  <button style={S.button} onClick={() => send("Give me a concise Legacy inventory and low-stock briefing.")}><Sparkles size={14} /> Inventory</button>
                  <button style={S.button} onClick={() => send("Analyze Legacy Jewelry right now and tell me the most important next move.")}><BrainCircuit size={14} /> Business</button>
                  <button style={S.button} onClick={() => refreshWeather(true).then((w) => w && send("Give me a useful weather briefing for today."))}><Cloud size={14} /> Weather</button>
                </div>

                {messages.map((message, index) => (
                  <div key={`${index}-${message.role}`} style={{ marginLeft: message.role === "user" ? "12%" : 0, marginBottom: 8, padding: "10px 11px", borderRadius: 13, background: message.role === "user" ? "rgba(8,145,178,.18)" : "rgba(30,41,59,.72)", border: "1px solid rgba(148,163,184,.09)", lineHeight: 1.42, fontSize: 13 }}>
                    <div style={{ fontSize: 9, fontWeight: 950, letterSpacing: 1.3, color: message.role === "user" ? "#67e8f9" : "#cbd5e1", marginBottom: 3 }}>{message.role === "user" ? "YOU" : "JARVIS"}</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
                  </div>
                ))}
                {busy && <div style={{ color: "#67e8f9", fontSize: 12, padding: 8 }}><RefreshCw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} /> Thinking…</div>}

                {pendingAction && (
                  <div style={{ ...S.card, borderColor: "rgba(251,191,36,.35)", marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 950, color: "#fbbf24", letterSpacing: 1.3 }}>APPROVAL REQUIRED</div>
                    <div style={{ fontWeight: 900, marginTop: 5 }}>{pendingAction.title || pendingAction.subject || pendingAction.type}</div>
                    {pendingAction.reason && <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{pendingAction.reason}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button style={S.button} onClick={approveAction}><Check size={14} /> Approve</button>
                      <button style={{ ...S.button, color: "#fecaca", borderColor: "rgba(248,113,113,.25)" }} onClick={denyAction}><X size={14} /> Deny</button>
                    </div>
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>

              <div style={{ padding: 10, borderTop: "1px solid rgba(148,163,184,.1)" }}>
                <div style={{ display: "flex", gap: 7 }}>
                  <input style={S.input} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} placeholder="Ask JARVIS anything…" />
                  <button style={{ ...S.button, padding: 10 }} onClick={() => send()} disabled={busy} title="Send"><Send size={16} /></button>
                  <button style={{ ...S.button, padding: 10, color: listening ? "#67e8f9" : "#cffafe" }} onClick={startVoice} title={listening ? "Stop listening" : "Talk to JARVIS"}>{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
                  <button style={{ ...S.button, padding: 10 }} onClick={() => fileRef.current?.click()} disabled={visionBusy} title="JARVIS vision"><ImagePlus size={16} /></button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(event) => analyzeImage(event.target.files?.[0])} />
                </div>
              </div>
            </div>
          )}

          {tab === "system" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <div style={S.card}><MemoryStick size={17} color="#67e8f9" /><div style={{ fontSize: 22, fontWeight: 950, marginTop: 5 }}>{memories.length}</div><div style={{ color: "#94a3b8", fontSize: 11 }}>persistent memories</div></div>
                <div style={S.card}><CircleDot size={17} color="#67e8f9" /><div style={{ fontSize: 22, fontWeight: 950, marginTop: 5 }}>{tasks.filter((task) => task.status !== "completed").length}</div><div style={{ color: "#94a3b8", fontSize: 11 }}>open tasks</div></div>
                <div style={S.card}><Bell size={17} color="#67e8f9" /><div style={{ fontSize: 22, fontWeight: 950, marginTop: 5 }}>{unread}</div><div style={{ color: "#94a3b8", fontSize: 11 }}>unread alerts</div></div>
                <div style={S.card}><Volume2 size={17} color="#67e8f9" /><div style={{ fontSize: 13, fontWeight: 950, marginTop: 7 }}>{prefs.voice_enabled !== false ? "CEDAR ON" : "VOICE OFF"}</div><div style={{ color: "#94a3b8", fontSize: 11 }}>assistant speech</div></div>
              </div>

              <div style={{ ...S.card, marginTop: 10 }}>
                <div style={{ fontWeight: 900, marginBottom: 9 }}>Core controls</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <button style={S.button} onClick={() => updatePreference("voice_enabled", prefs.voice_enabled === false)}><Volume2 size={14} /> Voice {prefs.voice_enabled !== false ? "on" : "off"}</button>
                  <button style={S.button} onClick={startRealtime}>{liveVoice ? <Square size={14} /> : <Waves size={14} />} {liveVoice ? "Stop live voice" : "Realtime voice"}</button>
                  <button style={S.button} onClick={loadAll}><RefreshCw size={14} /> Refresh brain</button>
                  <button style={S.button} onClick={enableNotifications}><Bell size={14} /> Browser alerts</button>
                </div>
              </div>

              {weather && <div style={{ ...S.card, marginTop: 10 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Cloud size={17} color="#67e8f9" /><b>Weather</b></div><div style={{ fontSize: 23, fontWeight: 950, marginTop: 7 }}>{Math.round(weather.temperature)}°F</div><div style={{ color: "#94a3b8", fontSize: 12 }}>Rain chance up to {Math.round(weather.rainChance || 0)}%</div></div>}

              <div style={{ ...S.card, marginTop: 10 }}>
                <div style={{ fontWeight: 900 }}>Recent tasks</div>
                <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
                  {tasks.slice(0, 6).map((task) => <div key={task.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: task.status === "completed" ? "#4ade80" : "#67e8f9" }} /><span style={{ flex: 1 }}>{task.title}</span><span style={{ color: "#64748b", fontSize: 10 }}>{task.priority || "normal"}</span></div>)}
                  {!tasks.length && <div style={{ color: "#64748b", fontSize: 12 }}>No saved JARVIS tasks yet.</div>}
                </div>
              </div>
            </div>
          )}

          {tab === "integrations" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              <div style={{ display: "grid", gap: 9 }}>
                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Link2 size={17} color="#67e8f9" /><b>Google Workspace</b><span style={{ marginLeft: "auto" }}>{statusDot(Boolean(googleToken))}</span></div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>{googleProfile?.email || "Calendar · Gmail · Contacts"}</div>
                  <div style={{ display: "flex", gap: 7, marginTop: 9 }}><button style={S.button} onClick={connectGoogle}>{googleToken ? "Reconnect" : "Connect Google"}</button>{googleToken && <button style={S.button} onClick={() => refreshGoogle()}><RefreshCw size={14} /> Refresh</button>}</div>
                  {googleToken && <div style={{ color: "#64748b", fontSize: 10, marginTop: 8 }}>{googleSnapshot.calendar.length} upcoming events · {googleSnapshot.inbox.length} inbox snapshots · {googleSnapshot.contacts.length} contacts</div>}
                </div>

                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><ShoppingBag size={17} color="#67e8f9" /><b>Commerce</b></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
                    <button style={S.button} onClick={() => loadExternal("shopify")}><Store size={14} /> Shopify {integrationStatus.shopify ? "✓" : "—"}</button>
                    <button style={S.button} onClick={() => loadExternal("ebay")}><ShoppingBag size={14} /> eBay {integrationStatus.ebay ? "✓" : "—"}</button>
                  </div>
                  {storeSnapshots.shopify && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 8 }}>{storeSnapshots.shopify.shop?.name || "Shopify"}: {storeSnapshots.shopify.products?.nodes?.length || 0} products · {storeSnapshots.shopify.orders?.nodes?.length || 0} recent orders</div>}
                  {storeSnapshots.ebay && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 5 }}>eBay: {storeSnapshots.ebay.inventory?.length || 0} inventory items · {storeSnapshots.ebay.orders?.length || 0} orders</div>}
                </div>

                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Home size={17} color="#67e8f9" /><b>Home Assistant</b><span style={{ marginLeft: "auto" }}>{statusDot(Boolean(integrationStatus.homeAssistant))}</span></div>
                  <button style={{ ...S.button, marginTop: 9 }} onClick={() => loadExternal("home-assistant")}>Load devices</button>
                  {storeSnapshots.homeAssistant?.states?.length > 0 && <div style={{ display: "grid", gap: 6, marginTop: 9 }}>{storeSnapshots.homeAssistant.states.filter((item) => ["light", "switch", "fan"].includes(item.domain)).slice(0, 8).map((entity) => <button key={entity.entity_id} style={{ ...S.button, justifyContent: "space-between" }} onClick={() => toggleHomeAssistant(entity)}><span>{entity.friendly_name}</span><span style={{ color: "#94a3b8" }}>{entity.state}</span></button>)}</div>}
                </div>

                <div style={S.card}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Computer size={17} color="#67e8f9" /><b>Desktop Companion</b><span style={{ marginLeft: "auto" }}>{statusDot(false, "LOCAL")}</span></div>
                  <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 6 }}>Commands are queued safely through Supabase and only run when your Windows companion is signed in.</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
                    <button style={S.button} onClick={() => queueDesktop("open_app", { app: "chrome" }, "Open Chrome")}><Computer size={14} /> Chrome</button>
                    <button style={S.button} onClick={() => queueDesktop("open_app", { app: "spotify" }, "Open Spotify")}><Computer size={14} /> Spotify</button>
                    <button style={S.button} onClick={() => queueDesktop("open_app", { app: "calculator" }, "Open Calculator")}><Computer size={14} /> Calculator</button>
                    <button style={S.button} onClick={() => queueDesktop("lock_pc", {}, "Lock PC")}><ShieldCheck size={14} /> Lock PC</button>
                  </div>
                </div>

                <div style={{ ...S.card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><Eye size={16} color="#67e8f9" /><div style={{ fontWeight: 900, marginTop: 4 }}>Vision</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{integrationStatus.vision ? "Ready" : "Needs OpenAI"}</div></div>
                  <div><Waves size={16} color="#67e8f9" /><div style={{ fontWeight: 900, marginTop: 4 }}>Realtime</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{integrationStatus.realtimeVoice ? "Ready" : "Needs OpenAI"}</div></div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {toast && <div style={{ position: "fixed", right: 22, bottom: open ? 804 : 100, zIndex: 45, maxWidth: 320, borderRadius: 12, padding: "10px 12px", background: "#0f172a", color: "white", border: "1px solid rgba(103,232,249,.2)", boxShadow: "0 16px 40px rgba(0,0,0,.35)", fontSize: 12, fontWeight: 800 }}>{toast}</div>}
    </>
  );
}
