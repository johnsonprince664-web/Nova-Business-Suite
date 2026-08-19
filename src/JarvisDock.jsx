import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, BrainCircuit, CalendarDays, Check, Cloud, Computer, Eye, Home, ImagePlus,
  Link2, Mail, MemoryStick, Mic, RefreshCw, Settings2, ShieldCheck, ShoppingBag,
  Square, Store, Volume2, Waves, X, Zap
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
    position: "fixed", right: 22, bottom: 22, zIndex: 40, width: 72, height: 72,
    borderRadius: "50%", border: "1px solid rgba(103,232,249,.68)", cursor: "pointer",
    background: "radial-gradient(circle at 34% 28%, #ecfeff 0%, #67e8f9 11%, #0891b2 31%, #0f3550 58%, #06131f 79%)",
    color: "#ecfeff", display: "grid", placeItems: "center", padding: 0,
  },
  panel: {
    position: "fixed", right: 12, bottom: 108, zIndex: 40,
    width: "min(390px, calc(100vw - 24px))", maxHeight: "min(610px, calc(100vh - 128px))",
    overflowY: "auto", borderRadius: 22, color: "#eafaff",
    border: "1px solid rgba(103,232,249,.2)",
    background: "linear-gradient(180deg, rgba(6,19,31,.99), rgba(7,17,31,.99))",
    boxShadow: "0 28px 90px rgba(2,6,23,.55),0 0 34px rgba(34,211,238,.12)",
    fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif",
  },
  card: {
    border: "1px solid rgba(148,163,184,.13)", borderRadius: 15, padding: 13,
    background: "rgba(15,23,42,.66)",
  },
  button: {
    border: "1px solid rgba(103,232,249,.22)", background: "rgba(8,145,178,.12)", color: "#cffafe",
    borderRadius: 11, padding: "9px 11px", fontWeight: 800, fontSize: 12, cursor: "pointer",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [crm, setCrm] = useState({ business: null, inventory: [], sales: [], orders: [], customers: [], expenses: [] });
  const [memories, setMemories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [history, setHistory] = useState([]);
  const [phase, setPhase] = useState("ready");
  const [liveVoice, setLiveVoice] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState({});
  const [googleToken, setGoogleToken] = useState(() => sessionStorage.getItem("jarvis_google_token") || "");
  const [googleProfile, setGoogleProfile] = useState(null);
  const [googleSnapshot, setGoogleSnapshot] = useState({ calendar: [], inbox: [], contacts: [] });
  const [weather, setWeather] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [visionBusy, setVisionBusy] = useState(false);
  const [toast, setToast] = useState("");

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceTimerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRafRef = useRef(null);
  const audioRef = useRef(null);
  const realtimePcRef = useRef(null);
  const realtimeStreamRef = useRef(null);
  const fileRef = useRef(null);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const notify = (text) => {
    setToast(String(text || ""));
    window.setTimeout(() => setToast(""), 2800);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetch("/api/integrations/status").then((r) => r.json()).then(setIntegrationStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadAll();
    const channel = supabase
      .channel(`jarvis-voice-${session.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_notifications", filter: `user_id=eq.${session.user.id}` }, loadJarvisState)
      .on("postgres_changes", { event: "*", schema: "public", table: "jarvis_tasks", filter: `user_id=eq.${session.user.id}` }, loadJarvisState)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!googleToken) return;
    refreshGoogle(googleToken).catch(() => {});
  }, [googleToken]);

  useEffect(() => () => {
    cleanupRecorder();
    stopRealtime(false);
    stopSpeaking(false);
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
      inventory: inventory.data || [], sales: sales.data || [], orders: orders.data || [],
      customers: customers.data || [], expenses: expenses.data || [],
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
      connected: Boolean(crm.business), businessName: crm.business?.name || "Legacy Jewelry Co.",
      inventoryUnits: units, inventoryStyles: crm.inventory.length, lowStockCount: lowStock,
      openOrders, customers: crm.customers.length, monthRevenue, monthRevenueFormatted: money(monthRevenue),
      monthProfit, monthProfitFormatted: money(monthProfit),
    };
  }, [crm]);

  const currentContext = () => ({
    now: new Date().toISOString(),
    timezone: prefs.home_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
    weather,
    business: summary,
    inventory: crm.inventory.slice(0, 120),
    orders: crm.orders.slice(0, 50),
    calendar: googleSnapshot.calendar.slice(0, 10),
    inbox: googleSnapshot.inbox.slice(0, 10),
    memories: memories.slice(0, 20),
    tasks: tasks.slice(0, 20),
    connections: { google: Boolean(googleToken), legacy: Boolean(crm.business) },
    extensions: integrationStatus,
  });

  function clearVoiceTimer() {
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = null;
  }

  function cleanupAnalyser() {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    analyserRafRef.current = null;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
    }
    audioContextRef.current = null;
  }

  function cleanupRecorder() {
    clearVoiceTimer();
    cleanupAnalyser();
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
  }

  function finishRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      try { recorder.stop(); } catch {}
    }
  }

  function stopSpeaking(update = true) {
    try { audioRef.current?.pause?.(); } catch {}
    audioRef.current = null;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (update && phase === "speaking") setPhase("ready");
  }

  async function startVoice() {
    if (phase === "listening" || phase === "requesting") {
      finishRecording();
      return;
    }
    if (liveVoice) {
      stopRealtime();
      return;
    }
    if (["transcribing", "thinking"].includes(phase)) return;
    stopSpeaking(false);
    await recordAndTranscribe();
  }

  async function recordAndTranscribe() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      notify("This browser cannot use JARVIS microphone recording.");
      setPhase("error");
      window.setTimeout(() => setPhase("ready"), 1800);
      return;
    }

    setPhase("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      mediaStreamRef.current = stream;

      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks = [];

      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onerror = () => {
        cleanupRecorder();
        setPhase("error");
        notify("The microphone recorder stopped unexpectedly.");
        window.setTimeout(() => setPhase("ready"), 1800);
      };
      recorder.onstop = async () => {
        const mime = recorder.mimeType || preferred || "audio/webm";
        clearVoiceTimer();
        cleanupAnalyser();
        if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 900) {
          setPhase("ready");
          notify("I didn't catch enough audio. Tap the orb and speak again.");
          return;
        }
        setPhase("transcribing");
        try {
          const response = await fetch("/api/transcribe", {
            method: "POST", headers: { "Content-Type": mime }, body: blob,
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Transcription failed");
          const text = String(data.text || "").trim();
          if (!text) {
            setPhase("ready");
            notify("I couldn't make out the words. Try again.");
            return;
          }
          await handleVoiceCommand(text);
        } catch (error) {
          setPhase("error");
          notify(error.message || "JARVIS could not transcribe the microphone.");
          window.setTimeout(() => setPhase("ready"), 1800);
        }
      };

      recorder.start(250);
      setPhase("listening");
      startSilenceDetection(stream, recorder);
      voiceTimerRef.current = window.setTimeout(() => finishRecording(), 20000);
    } catch (error) {
      cleanupRecorder();
      setPhase("error");
      const name = String(error?.name || "");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") notify("Microphone permission is blocked. Allow the mic for this site, then tap JARVIS again.");
      else notify(error.message || "Microphone access failed.");
      window.setTimeout(() => setPhase("ready"), 2200);
    }
  }

  function startSilenceDetection(stream, recorder) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let speechStartedAt = 0;
      let lastVoiceAt = 0;

      const tick = () => {
        if (recorder.state !== "recording") return;
        analyser.getByteTimeDomainData(data);
        let total = 0;
        for (let i = 0; i < data.length; i += 1) {
          const sample = (data[i] - 128) / 128;
          total += sample * sample;
        }
        const rms = Math.sqrt(total / data.length);
        const now = performance.now();
        if (rms > 0.028) {
          if (!speechStartedAt) speechStartedAt = now;
          lastVoiceAt = now;
        }
        const hasSpoken = speechStartedAt > 0;
        if (hasSpoken && now - lastVoiceAt > 1250 && now - speechStartedAt > 550) {
          finishRecording();
          return;
        }
        analyserRafRef.current = requestAnimationFrame(tick);
      };
      analyserRafRef.current = requestAnimationFrame(tick);
    } catch {}
  }

  async function handleVoiceCommand(text) {
    const lower = text.toLowerCase().trim();
    if (pendingAction && /^(yes|yeah|yep|approve|confirm|do it|go ahead|sounds good)\b/.test(lower)) {
      await approveAction();
      return;
    }
    if (pendingAction && /^(no|nope|deny|cancel|don't|do not)\b/.test(lower)) {
      await denyAction(true);
      return;
    }
    if (/\bweather|forecast|rain|temperature\b/.test(lower) && prefs.weather_enabled !== false && !weather) {
      await refreshWeather(false);
    }
    await askJarvis(text);
  }

  async function askJarvis(text) {
    const clean = String(text || "").trim();
    if (!clean) { setPhase("ready"); return; }
    setPhase("thinking");
    const prior = history.slice(-10);
    setHistory((items) => [...items, { role: "user", content: clean }].slice(-16));
    try {
      const response = await fetch("/api/jarvis", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, history: prior, context: currentContext() }),
      });
      const data = await response.json();
      const reply = String(data.reply || data.error || "I'm online.");
      setHistory((items) => [...items, { role: "assistant", content: reply }].slice(-16));
      if (data.action?.type && data.action.type !== "none") {
        await stageAction(data.action);
        setSettingsOpen(true);
      }
      remember(clean, reply);
      await speak(reply);
    } catch (error) {
      const reply = `I couldn't complete that. ${error.message || "Please try again."}`;
      await speak(reply);
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
        .map((item) => ({ user_id: session.user.id, kind: item.kind || "general", content: String(item.content).trim(), metadata: { source: "jarvis_voice" } }));
      if (rows.length) {
        await supabase.from("jarvis_memories").insert(rows);
        await loadJarvisState();
      }
    } catch {}
  }

  async function speak(text) {
    if (!text || prefs.voice_enabled === false) { setPhase("ready"); return; }
    stopSpeaking(false);
    setPhase("speaking");
    try {
      const response = await fetch("/api/speech", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: String(text).slice(0, 3900) }),
      });
      if (!response.ok) throw new Error("server voice unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setPhase("ready"); };
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setPhase("ready"); };
      await audio.play();
    } catch {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 3000));
        utterance.rate = 0.97;
        utterance.pitch = 0.9;
        utterance.onend = () => setPhase("ready");
        utterance.onerror = () => setPhase("ready");
        window.speechSynthesis.speak(utterance);
      } else setPhase("ready");
    }
  }

  async function startRealtime() {
    if (liveVoice) { stopRealtime(); return; }
    try {
      finishRecording();
      stopSpeaking(false);
      setPhase("requesting");
      const pc = new RTCPeerConnection();
      realtimePcRef.current = pc;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      realtimeStreamRef.current = stream;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      pc.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      const response = await fetch("/api/realtime", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription?.sdp, context: currentContext() }),
      });
      const answer = await response.text();
      if (!response.ok) throw new Error(answer || "Realtime voice failed");
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      setLiveVoice(true);
      setPhase("realtime");
      notify("Realtime voice is live. Just speak naturally.");
    } catch (error) {
      stopRealtime();
      notify(error.message || "Realtime voice failed");
    }
  }

  function stopRealtime(updateState = true) {
    try { realtimePcRef.current?.close?.(); } catch {}
    realtimePcRef.current = null;
    if (realtimeStreamRef.current) realtimeStreamRef.current.getTracks().forEach((track) => track.stop());
    realtimeStreamRef.current = null;
    if (updateState) {
      setLiveVoice(false);
      setPhase("ready");
    }
  }

  async function stageAction(action) {
    const local = { ...action, id: null };
    if (session?.user?.id) {
      const result = await supabase.from("jarvis_pending_actions").insert({
        user_id: session.user.id,
        action_type: action.type,
        title: action.title || action.subject || action.query || action.type,
        payload: action, status: "pending", reason: action.reason || "",
      }).select("id").single();
      if (result.data?.id) local.id = result.data.id;
    }
    setPendingAction(local);
  }

  async function approveAction() {
    const action = pendingAction;
    if (!action) { setPhase("ready"); return; }
    setPhase("thinking");
    try {
      let resultText = "Done.";
      if (action.type === "business_refresh") {
        await loadAll();
        resultText = "Legacy CRM data is refreshed.";
      } else if (["calendar_create", "calendar_search", "gmail_search", "gmail_draft"].includes(action.type)) {
        if (!googleToken) throw new Error("Google isn't connected yet. Open JARVIS settings and connect Google first.");
        resultText = await executeGoogleAction(action);
      } else throw new Error("That action isn't wired for voice approval yet.");
      if (action.id) await supabase.from("jarvis_pending_actions").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", action.id);
      await logActivity(action.type, action.title || action.subject || action.query || action.type, "completed", action);
      setPendingAction(null);
      setSettingsOpen(false);
      await speak(resultText);
    } catch (error) {
      if (action.id) await supabase.from("jarvis_pending_actions").update({ status: "failed", reason: error.message, updated_at: new Date().toISOString() }).eq("id", action.id);
      await logActivity(action.type, error.message, "failed", action);
      await speak(error.message);
    }
  }

  async function denyAction(speakResult = false) {
    if (pendingAction?.id) await supabase.from("jarvis_pending_actions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", pendingAction.id);
    setPendingAction(null);
    setSettingsOpen(false);
    if (speakResult) await speak("Canceled.");
    else setPhase("ready");
  }

  async function logActivity(actionType, summaryText, status, payload = {}) {
    if (!session?.user?.id) return;
    await supabase.from("jarvis_activity").insert({ user_id: session.user.id, action_type: actionType, summary: summaryText, status, payload });
  }

  async function connectGoogle() {
    if (!googleClientId) { notify("Google OAuth is not configured on Vercel yet."); return; }
    if (!window.google?.accounts?.oauth2) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId, scope: GOOGLE_SCOPES,
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
        const item = await response.json();
        const hs = item.payload?.headers || [];
        return { id: item.id, subject: hs.find((h) => h.name === "Subject")?.value || "(no subject)", from: hs.find((h) => h.name === "From")?.value || "", snippet: item.snippet || "" };
      }));
      setGoogleProfile(profile);
      setGoogleSnapshot({
        calendar: (calendarData.items || []).map((event) => ({ id: event.id, title: event.summary || "Untitled", when: event.start?.dateTime || event.start?.date || "", end: event.end?.dateTime || event.end?.date || "" })),
        inbox: inbox.filter(Boolean),
        contacts: (contactsData.connections || []).map((person) => ({ name: person.names?.[0]?.displayName || "", email: person.emailAddresses?.[0]?.value || "" })).filter((item) => item.name || item.email),
      });
    } catch {
      setGoogleToken("");
      setGoogleProfile(null);
      sessionStorage.removeItem("jarvis_google_token");
    }
  }

  async function executeGoogleAction(action) {
    const authHeaders = { Authorization: `Bearer ${googleToken}` };
    const jsonHeaders = { ...authHeaders, "Content-Type": "application/json" };
    if (action.type === "calendar_create") {
      const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST", headers: jsonHeaders,
        body: JSON.stringify({ summary: action.title || "JARVIS event", start: { dateTime: action.start }, end: { dateTime: action.end } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Calendar event failed");
      await refreshGoogle();
      return `Calendar event ${action.title || "created"} is ready.`;
    }
    if (action.type === "calendar_search") {
      const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=10&timeMin=${encodeURIComponent(new Date().toISOString())}&q=${encodeURIComponent(action.query || "")}`, { headers: authHeaders });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Calendar search failed");
      const events = data.items || [];
      if (!events.length) return "I didn't find a matching calendar event.";
      return `I found ${events.length} matching calendar ${events.length === 1 ? "event" : "events"}. The first is ${events[0].summary || "untitled"}.`;
    }
    if (action.type === "gmail_search") {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(action.query || "")}`, { headers: authHeaders });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gmail search failed");
      return `I found ${(data.messages || []).length} matching Gmail messages.`;
    }
    if (action.type === "gmail_draft") {
      const raw = base64Url(`To: ${action.to || ""}\r\nSubject: ${action.subject || ""}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${action.body || ""}`);
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST", headers: jsonHeaders, body: JSON.stringify({ message: { raw } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Gmail draft failed");
      return `The Gmail draft to ${action.to || "the recipient"} is ready. I did not send it.`;
    }
    return "Done.";
  }

  async function refreshWeather(requestPermission = true) {
    if (!navigator.geolocation) return null;
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: requestPermission ? 9000 : 2500, maximumAge: 10 * 60 * 1000 }));
      const { latitude, longitude } = position.coords;
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&hourly=precipitation_probability&temperature_unit=fahrenheit&forecast_days=1`);
      const data = await response.json();
      const rainChance = Math.max(0, ...(data.hourly?.precipitation_probability || [0]).slice(0, 8));
      const next = { temperature: data.current?.temperature_2m, unit: "F", description: `weather code ${data.current?.weather_code ?? "—"}`, rainChance };
      setWeather(next);
      return next;
    } catch (error) {
      if (requestPermission) notify(error.message || "Weather location unavailable.");
      return null;
    }
  }

  async function analyzeImage(file) {
    if (!file) return;
    setVisionBusy(true);
    setPhase("thinking");
    try {
      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/vision", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, prompt: "Analyze this for Legacy Jewelry and tell me what matters, including product, receipt, screenshot, or business context when relevant." }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Vision failed");
      await speak(data.result || "I couldn't extract anything useful from that image.");
    } catch (error) {
      await speak(error.message || "Vision failed.");
    } finally {
      setVisionBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
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

  async function enableNotifications() {
    if (!("Notification" in window)) { notify("Browser notifications aren't supported here."); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") notify("JARVIS browser alerts enabled.");
    else notify("Notification permission wasn't granted.");
  }

  const unread = notifications.filter((item) => !item.read_at).length;
  const active = phase !== "ready" || liveVoice;
  const phaseLabel = liveVoice ? "REALTIME VOICE" : ({
    ready: "READY — TAP TO SPEAK",
    requesting: "OPENING MICROPHONE…",
    listening: "LISTENING — TAP TO FINISH",
    transcribing: "HEARING YOU…",
    thinking: "THINKING…",
    speaking: "SPEAKING…",
    error: "MICROPHONE ERROR",
    realtime: "REALTIME VOICE",
  }[phase] || "READY");

  const glow = phase === "listening" || liveVoice
    ? "0 0 0 8px rgba(34,211,238,.16),0 0 64px rgba(34,211,238,.78),0 12px 30px rgba(2,6,23,.32)"
    : phase === "speaking"
      ? "0 0 0 7px rgba(125,211,252,.12),0 0 54px rgba(56,189,248,.62),0 12px 30px rgba(2,6,23,.32)"
      : "0 0 0 5px rgba(34,211,238,.08),0 0 34px rgba(34,211,238,.48),0 12px 30px rgba(2,6,23,.3)";

  return (
    <>
      {active && (
        <div style={{ position: "fixed", right: 20, bottom: 101, zIndex: 40, padding: "7px 11px", borderRadius: 999, border: "1px solid rgba(103,232,249,.2)", background: "rgba(6,19,31,.94)", color: "#cffafe", fontSize: 10, fontWeight: 950, letterSpacing: 1.1, boxShadow: "0 8px 28px rgba(2,6,23,.28)" }}>
          {phaseLabel}
        </div>
      )}

      <button
        type="button"
        aria-label="Talk to JARVIS"
        title={phaseLabel}
        onClick={startVoice}
        style={{ ...S.orb, transform: active ? "scale(1.06)" : "scale(1)", boxShadow: glow, transition: "transform .18s ease, box-shadow .18s ease" }}
      >
        <span style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "1px solid rgba(207,250,254,.3)" }} />
        {phase === "listening" || liveVoice ? <Waves size={31} style={{ position: "relative", zIndex: 1 }} /> : phase === "speaking" ? <Volume2 size={29} style={{ position: "relative", zIndex: 1 }} /> : <BrainCircuit size={30} style={{ position: "relative", zIndex: 1 }} />}
        {unread > 0 && <span style={{ position: "absolute", right: -2, top: -2, minWidth: 20, height: 20, borderRadius: 999, background: "#ef4444", color: "white", fontSize: 10, fontWeight: 900, display: "grid", placeItems: "center", padding: "0 5px" }}>{Math.min(unread, 99)}</span>}
      </button>

      <button
        type="button"
        aria-label="JARVIS systems"
        title="JARVIS systems and integrations"
        onClick={() => setSettingsOpen((value) => !value)}
        style={{ position: "fixed", right: 82, bottom: 21, zIndex: 40, width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(103,232,249,.22)", background: "rgba(6,19,31,.94)", color: "#94a3b8", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 8px 24px rgba(2,6,23,.22)" }}
      >
        <Settings2 size={15} />
      </button>

      {settingsOpen && (
        <section style={S.panel} aria-label="JARVIS systems panel">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderBottom: "1px solid rgba(148,163,184,.11)" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%,#67e8f9,#0891b2 34%,#0f172a 74%)", display: "grid", placeItems: "center" }}><BrainCircuit size={20} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#67e8f9", fontWeight: 950, letterSpacing: 2 }}>J.A.R.V.I.S.</div>
              <div style={{ fontSize: 15, fontWeight: 900 }}>Voice systems</div>
              <div style={{ color: "#94a3b8", fontSize: 10 }}>No chat UI · orb-first control</div>
            </div>
            <button style={{ ...S.button, padding: 8 }} onClick={() => setSettingsOpen(false)}><X size={16} /></button>
          </div>

          <div style={{ padding: 12, display: "grid", gap: 10 }}>
            <div style={{ ...S.card, textAlign: "center", padding: 18 }}>
              <button onClick={startVoice} style={{ ...S.orb, position: "relative", right: "auto", bottom: "auto", margin: "0 auto", width: 92, height: 92, boxShadow: glow }}>
                {phase === "listening" || liveVoice ? <Waves size={38} /> : phase === "speaking" ? <Volume2 size={35} /> : <Mic size={36} />}
              </button>
              <div style={{ marginTop: 12, color: active ? "#67e8f9" : "#cbd5e1", fontWeight: 950, fontSize: 11, letterSpacing: 1.2 }}>{phaseLabel}</div>
              <div style={{ marginTop: 5, color: "#64748b", fontSize: 11 }}>Tap once, speak naturally, and JARVIS auto-stops after you finish. Tap again to finish early.</div>
            </div>

            {pendingAction && (
              <div style={{ ...S.card, borderColor: "rgba(251,191,36,.36)" }}>
                <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 950, letterSpacing: 1.1 }}>VOICE APPROVAL REQUIRED</div>
                <div style={{ marginTop: 6, fontWeight: 900 }}>{pendingAction.title || pendingAction.subject || pendingAction.type}</div>
                {pendingAction.reason && <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 11 }}>{pendingAction.reason}</div>}
                <div style={{ marginTop: 9, color: "#cbd5e1", fontSize: 11 }}>Say “yes” or “approve” to continue, or “no” to cancel. You can also use these buttons.</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button style={S.button} onClick={approveAction}><Check size={14} /> Approve</button>
                  <button style={{ ...S.button, color: "#fecaca", borderColor: "rgba(248,113,113,.25)" }} onClick={() => denyAction(false)}><X size={14} /> Deny</button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <div style={S.card}><MemoryStick size={17} color="#67e8f9" /><div style={{ fontSize: 21, fontWeight: 950, marginTop: 5 }}>{memories.length}</div><div style={{ color: "#94a3b8", fontSize: 10 }}>memories</div></div>
              <div style={S.card}><Bell size={17} color="#67e8f9" /><div style={{ fontSize: 21, fontWeight: 950, marginTop: 5 }}>{unread}</div><div style={{ color: "#94a3b8", fontSize: 10 }}>alerts</div></div>
              <div style={S.card}><ShoppingBag size={17} color="#67e8f9" /><div style={{ fontSize: 18, fontWeight: 950, marginTop: 5 }}>{summary.inventoryUnits}</div><div style={{ color: "#94a3b8", fontSize: 10 }}>CRM units</div></div>
              <div style={S.card}><ShieldCheck size={17} color="#67e8f9" /><div style={{ fontSize: 18, fontWeight: 950, marginTop: 5 }}>{summary.lowStockCount}</div><div style={{ color: "#94a3b8", fontSize: 10 }}>low stock</div></div>
            </div>

            <div style={S.card}>
              <div style={{ fontWeight: 900, marginBottom: 9 }}>Voice engine</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button style={S.button} onClick={startRealtime}>{liveVoice ? <Square size={14} /> : <Zap size={14} />} {liveVoice ? "Stop realtime" : "Realtime voice"}</button>
                <button style={S.button} onClick={() => updatePreference("voice_enabled", prefs.voice_enabled === false)}><Volume2 size={14} /> Cedar {prefs.voice_enabled !== false ? "on" : "off"}</button>
                <button style={S.button} onClick={loadAll}><RefreshCw size={14} /> Refresh brain</button>
                <button style={S.button} onClick={enableNotifications}><Bell size={14} /> Alerts</button>
              </div>
            </div>

            <div style={S.card}>
              <div style={{ fontWeight: 900, marginBottom: 9 }}>Vision + context</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button style={S.button} disabled={visionBusy} onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> {visionBusy ? "Analyzing…" : "Show JARVIS image"}</button>
                <button style={S.button} onClick={() => refreshWeather(true)}><Cloud size={14} /> Weather</button>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(event) => analyzeImage(event.target.files?.[0])} />
            </div>

            <div style={S.card}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Integrations</div>
              <div style={{ display: "grid", gap: 9 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><BrainCircuit size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>OpenAI reasoning + voice</span>{statusDot(Boolean(integrationStatus.openai), integrationStatus.openai ? "LIVE" : "SETUP")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><CalendarDays size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>Google Calendar / Gmail / Contacts</span>{statusDot(Boolean(googleToken), googleToken ? "LIVE" : "SETUP")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Store size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>Shopify</span>{statusDot(Boolean(integrationStatus.shopify))}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><ShoppingBag size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>eBay</span>{statusDot(Boolean(integrationStatus.ebay))}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Home size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>Home Assistant</span>{statusDot(Boolean(integrationStatus.homeAssistant))}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Computer size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>Desktop Companion</span>{statusDot(false, "LOCAL")}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Eye size={16} color="#67e8f9" /><span style={{ flex: 1, fontSize: 12 }}>Vision</span>{statusDot(Boolean(integrationStatus.vision), integrationStatus.vision ? "LIVE" : "SETUP")}</div>
              </div>
              <div style={{ marginTop: 11, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button style={S.button} onClick={connectGoogle}><Link2 size={14} /> {googleToken ? (googleProfile?.email || "Reconnect Google") : "Connect Google"}</button>
              </div>
            </div>

            <div style={{ color: "#64748b", fontSize: 10, lineHeight: 1.5, padding: "0 3px 3px" }}>
              JARVIS stays below Legacy CRM dialogs so Inventory, Sales, Orders, and Tax Vault controls remain native and clickable.
            </div>
          </div>
        </section>
      )}

      {toast && <div style={{ position: "fixed", right: 18, bottom: 112, zIndex: 45, maxWidth: 330, borderRadius: 12, background: "#07131f", border: "1px solid rgba(103,232,249,.22)", color: "#e6fbff", padding: "10px 12px", fontSize: 12, fontWeight: 700, boxShadow: "0 14px 40px rgba(2,6,23,.4)" }}>{toast}</div>}
    </>
  );
}
