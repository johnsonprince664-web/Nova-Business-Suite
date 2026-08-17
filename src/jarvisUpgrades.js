import { supabase } from "./lib/supabase";

const nativeFetch = window.fetch.bind(window);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = {
  memories: [],
  notifications: [],
  notificationChannel: null,
  realtimePc: null,
  realtimeDc: null,
  realtimeStream: null,
  realtimeAudio: null,
  liveVoice: false,
  status: {},
  lastContext: null,
  dockReady: false
};

function words(text) {
  return new Set(String(text || "").toLowerCase().match(/[a-z0-9$]+/g)?.filter((word) => word.length > 2) || []);
}

function rankMemories(query, rows) {
  const q = words(query);
  const now = Date.now();
  return [...rows]
    .map((row) => {
      const terms = words(row.content);
      let overlap = 0;
      for (const term of q) if (terms.has(term)) overlap += 1;
      const ageDays = Math.max(0, (now - new Date(row.updated_at || row.created_at || now).getTime()) / 86400000);
      const recency = Math.max(0, 2.5 - ageDays / 30);
      return { ...row, _score: overlap * 3 + recency };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 12)
    .map(({ _score, ...row }) => row);
}

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

async function loadMemories(query = "") {
  try {
    const session = await getSession();
    if (!session?.user?.id) return [];
    const { data, error } = await supabase
      .from("jarvis_memories")
      .select("id,kind,content,metadata,created_at,updated_at")
      .eq("user_id", session.user.id)
      .order("updated_at", { ascending: false })
      .limit(80);
    if (error) throw error;
    state.memories = data || [];
    return rankMemories(query, state.memories);
  } catch (error) {
    console.warn("JARVIS memory retrieval unavailable", error?.message || error);
    return [];
  }
}

async function persistExtractedMemories(userText, assistantText) {
  try {
    const session = await getSession();
    if (!session?.user?.id || !userText) return;
    const response = await nativeFetch("/api/memory-extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: userText, assistant: assistantText || "" })
    });
    if (!response.ok) return;
    const data = await response.json();
    const candidates = Array.isArray(data.memories) ? data.memories : [];
    for (const memory of candidates) {
      const content = String(memory.content || "").trim();
      if (!content) continue;
      const { data: existing } = await supabase
        .from("jarvis_memories")
        .select("id")
        .eq("user_id", session.user.id)
        .eq("content", content)
        .limit(1);
      if (existing?.length) continue;
      await supabase.from("jarvis_memories").insert({
        user_id: session.user.id,
        kind: memory.kind || "general",
        content,
        metadata: { source: "conversation", auto_extracted: true }
      });
    }
    if (candidates.length) await loadMemories(userText);
  } catch (error) {
    console.warn("JARVIS memory save unavailable", error?.message || error);
  }
}

// Add durable-memory retrieval to every existing /api/jarvis turn without having to
// duplicate the React dashboard state. The API receives only the most relevant memories.
window.fetch = async function jarvisFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const method = String(init?.method || "GET").toUpperCase();
  if (method === "POST" && /\/api\/jarvis(?:\?|$)/.test(url) && typeof init.body === "string") {
    try {
      const payload = JSON.parse(init.body);
      const relevant = await loadMemories(payload.message || "");
      payload.context = {
        ...(payload.context || {}),
        memories: relevant.map((memory) => ({ kind: memory.kind, content: memory.content })),
        extensions: state.status
      };
      state.lastContext = payload.context;
      window.__jarvisLastContext = payload.context;
      const response = await nativeFetch(input, { ...init, body: JSON.stringify(payload) });
      response.clone().json().then((data) => {
        persistExtractedMemories(payload.message, data?.reply || "");
      }).catch(() => {});
      return response;
    } catch (error) {
      console.warn("JARVIS memory wrapper fell back", error?.message || error);
    }
  }
  return nativeFetch(input, init);
};

function voiceToast(message, tone = "info", timeout = 4200) {
  let node = document.getElementById("jarvis-voice-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "jarvis-voice-toast";
    document.body.appendChild(node);
  }
  node.dataset.tone = tone;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node._timer);
  if (timeout) node._timer = setTimeout(() => node.classList.remove("show"), timeout);
}

function preferredAudioMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((mime) => window.MediaRecorder?.isTypeSupported?.(mime)) || "";
}

class JarvisSpeechRecognition {
  constructor() {
    this.lang = "en-US";
    this.interimResults = true;
    this.continuous = false;
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this._recorder = null;
    this._stream = null;
    this._ctx = null;
    this._raf = null;
    this._stopping = false;
    this._heardSpeech = false;
  }

  start() {
    this._start().catch((error) => {
      const code = error?.name === "NotAllowedError" ? "not-allowed" : error?.name === "NotFoundError" ? "audio-capture" : "network";
      voiceToast(`Voice error: ${error?.message || code}`, "error", 7000);
      this.onerror?.({ error: code, message: error?.message || String(error) });
      this.onend?.();
    });
  }

  async _start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("This browser cannot record microphone audio.");
    this._stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });
    const mimeType = preferredAudioMime();
    const recorder = new MediaRecorder(this._stream, mimeType ? { mimeType } : undefined);
    this._recorder = recorder;
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onerror = (event) => {
      voiceToast(`Recorder error: ${event.error?.message || "microphone recording failed"}`, "error", 7000);
    };
    recorder.onstop = async () => {
      cancelAnimationFrame(this._raf);
      this._stream?.getTracks().forEach((track) => track.stop());
      try { await this._ctx?.close(); } catch {}
      if (!chunks.length) {
        this.onerror?.({ error: "no-speech", message: "No microphone audio was captured." });
        voiceToast("I didn't capture any audio. Try speaking immediately after pressing the orb.", "warn", 6000);
        this.onend?.();
        return;
      }
      try {
        voiceToast("Transcribing…", "info", 0);
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const response = await nativeFetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": blob.type || "audio/webm" },
          body: blob
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Transcription failed");
        const transcript = String(data.text || "").trim();
        if (!transcript) {
          this.onerror?.({ error: "no-speech", message: "No speech detected." });
          voiceToast("I couldn't hear any words. Try again a little closer to the microphone.", "warn", 6000);
        } else {
          const result = [{ transcript, confidence: 1 }];
          result.isFinal = true;
          const results = [result];
          this.onresult?.({ resultIndex: 0, results });
          voiceToast(`Heard: “${transcript}”`, "success", 4500);
        }
      } catch (error) {
        this.onerror?.({ error: "network", message: error.message });
        voiceToast(`Voice transcription failed: ${error.message}`, "error", 8000);
      } finally {
        this.onend?.();
      }
    };

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this._ctx.createMediaStreamSource(this._stream);
    const analyser = this._ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const started = performance.now();
    let speechLastSeen = 0;
    this._heardSpeech = false;
    const monitor = () => {
      if (!this._recorder || this._recorder.state === "inactive") return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      const elapsed = performance.now() - started;
      if (rms > 0.018) {
        this._heardSpeech = true;
        speechLastSeen = performance.now();
      }
      if (this._heardSpeech && performance.now() - speechLastSeen > 1050 && elapsed > 900) this.stop();
      else if (!this._heardSpeech && elapsed > 8000) this.stop();
      else if (elapsed > 18000) this.stop();
      else this._raf = requestAnimationFrame(monitor);
    };

    recorder.start(200);
    this.onstart?.();
    voiceToast("Listening — speak now…", "listening", 0);
    this._raf = requestAnimationFrame(monitor);
  }

  stop() {
    if (this._stopping) return;
    this._stopping = true;
    if (this._recorder && this._recorder.state !== "inactive") this._recorder.stop();
  }

  abort() {
    this.stop();
  }
}

// Force the working recorder/transcription implementation even on browsers that expose
// a flaky Web Speech API. The existing React mic/orb code continues to work unchanged.
window.SpeechRecognition = JarvisSpeechRecognition;
window.webkitSpeechRecognition = JarvisSpeechRecognition;

async function waitForIceGathering(pc, timeoutMs = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await Promise.race([
    new Promise((resolve) => {
      const handler = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", handler);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", handler);
    }),
    sleep(timeoutMs)
  ]);
}

async function stopRealtimeVoice() {
  try { state.realtimeDc?.close(); } catch {}
  try { state.realtimePc?.close(); } catch {}
  state.realtimeStream?.getTracks().forEach((track) => track.stop());
  if (state.realtimeAudio) state.realtimeAudio.remove();
  state.realtimePc = null;
  state.realtimeDc = null;
  state.realtimeStream = null;
  state.realtimeAudio = null;
  state.liveVoice = false;
  document.querySelector("[data-jarvis-live]")?.classList.remove("active");
  const label = document.querySelector("[data-jarvis-live] span");
  if (label) label.textContent = "Live voice";
  voiceToast("Realtime voice ended.", "info", 2500);
}

async function startRealtimeVoice() {
  if (state.liveVoice) return stopRealtimeVoice();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    const pc = new RTCPeerConnection();
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.style.display = "none";
    document.body.appendChild(audio);
    pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    const dc = pc.createDataChannel("oai-events");
    dc.onopen = () => voiceToast("Realtime JARVIS is live. Just talk — you can interrupt him too.", "success", 5500);
    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "conversation.item.input_audio_transcription.completed" && data.transcript) {
          voiceToast(`You: ${data.transcript}`, "listening", 3000);
        }
        if (data.type === "response.output_audio_transcript.done" && data.transcript) {
          window.dispatchEvent(new CustomEvent("jarvis:realtime-response", { detail: data.transcript }));
        }
        if (data.type === "error") voiceToast(`Realtime error: ${data.error?.message || "unknown error"}`, "error", 7000);
      } catch {}
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(pc.connectionState) && state.liveVoice) stopRealtimeVoice();
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);
    const context = { ...(state.lastContext || window.__jarvisLastContext || {}), memories: await loadMemories("current priorities preferences") };
    const response = await nativeFetch("/api/realtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: pc.localDescription?.sdp || offer.sdp, context })
    });
    if (!response.ok) {
      let message = "Realtime voice setup failed";
      try { message = (await response.json()).error || message; } catch { message = await response.text() || message; }
      throw new Error(message);
    }
    const answer = await response.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    state.realtimePc = pc;
    state.realtimeDc = dc;
    state.realtimeStream = stream;
    state.realtimeAudio = audio;
    state.liveVoice = true;
    const button = document.querySelector("[data-jarvis-live]");
    button?.classList.add("active");
    const label = button?.querySelector("span");
    if (label) label.textContent = "End voice";
  } catch (error) {
    await stopRealtimeVoice();
    voiceToast(`Realtime voice failed: ${error.message}`, "error", 9000);
  }
}

async function imageToDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

async function runVision(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    return voiceToast("Vision currently accepts PNG, JPEG, or WEBP images.", "warn", 6000);
  }
  try {
    voiceToast("JARVIS vision is analyzing the image…", "info", 0);
    const image = await imageToDataUrl(file);
    const prompt = window.prompt("What do you want JARVIS to look for?", "Tell me what is in this image and anything important I should know.") || "Analyze this image and explain what matters.";
    const response = await nativeFetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, prompt })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Vision failed");
    openExtensionPanel("Vision result", data.result || "No result returned.");
    voiceToast("Vision analysis complete.", "success", 2500);
  } catch (error) {
    voiceToast(`Vision failed: ${error.message}`, "error", 8000);
  }
}

function showSystemNotification(notification) {
  const title = notification.title || "JARVIS";
  const body = notification.body || "Something needs your attention.";
  if ("Notification" in window && Notification.permission === "granted") {
    navigator.serviceWorker?.ready.then((registration) => {
      registration.showNotification(title, {
        body,
        tag: notification.dedupe_key || notification.id || title,
        icon: "/jarvis-icon.svg",
        badge: "/jarvis-icon.svg",
        data: { source: notification.source || "jarvis" }
      });
    }).catch(() => new Notification(title, { body }));
  }
  voiceToast(`${title}: ${body}`, notification.severity === "urgent" ? "error" : "warn", 7500);
}

async function loadNotifications() {
  try {
    const session = await getSession();
    if (!session?.user?.id) return [];
    const { data, error } = await supabase
      .from("jarvis_notifications")
      .select("*")
      .eq("user_id", session.user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    state.notifications = data || [];
    updateAlertBadge();
    return state.notifications;
  } catch (error) {
    console.warn("JARVIS notification load unavailable", error?.message || error);
    return [];
  }
}

function updateAlertBadge() {
  const badge = document.querySelector("[data-jarvis-alert-badge]");
  if (!badge) return;
  const count = state.notifications.length;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = count === 0;
}

async function markNotificationsRead() {
  try {
    const session = await getSession();
    if (!session?.user?.id) return;
    await supabase.from("jarvis_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.user.id).is("read_at", null);
    state.notifications = [];
    updateAlertBadge();
  } catch {}
}

async function initNotificationStream() {
  const session = await getSession();
  if (!session?.user?.id) return;
  if (state.notificationChannel) await supabase.removeChannel(state.notificationChannel);
  state.notificationChannel = supabase
    .channel(`jarvis-notifications-${session.user.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_notifications", filter: `user_id=eq.${session.user.id}` }, (payload) => {
      state.notifications.unshift(payload.new);
      updateAlertBadge();
      showSystemNotification(payload.new);
    })
    .subscribe();
  await loadNotifications();
}

async function requestNotifications() {
  if (!("Notification" in window)) return voiceToast("This browser does not support system notifications.", "warn", 5000);
  const permission = await Notification.requestPermission();
  voiceToast(permission === "granted" ? "JARVIS system notifications enabled." : "Notifications were not enabled.", permission === "granted" ? "success" : "warn", 4000);
}

async function refreshStatus() {
  try {
    const response = await nativeFetch("/api/integrations/status");
    if (response.ok) state.status = await response.json();
  } catch {}
  return state.status;
}

function prettyStatus(value) {
  if (value === true) return "CONNECTED";
  if (value === "local-install-required") return "COMPANION NEEDED";
  return "SETUP NEEDED";
}

async function openExtensionPanel(title = "JARVIS extensions", customBody = "") {
  let panel = document.getElementById("jarvis-extension-panel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "jarvis-extension-panel";
    document.body.appendChild(panel);
  }
  if (customBody) {
    panel.innerHTML = `<button class="jx-close" aria-label="Close">×</button><p class="jx-eyebrow">J.A.R.V.I.S.</p><h2>${escapeHtml(title)}</h2><div class="jx-result">${escapeHtml(customBody)}</div>`;
  } else {
    const status = await refreshStatus();
    const notifications = await loadNotifications();
    const rows = [
      ["OpenAI brain", status.openai],
      ["Realtime voice", status.realtimeVoice],
      ["Vision", status.vision],
      ["Persistent memory", status.memory],
      ["Proactive jobs", status.proactive],
      ["Google Calendar + Gmail", status.googleOAuth],
      ["Shopify", status.shopify],
      ["eBay", status.ebay],
      ["Home Assistant", status.homeAssistant],
      ["Computer control", status.computerCompanion],
      ["Mobile/system notifications", status.push]
    ];
    panel.innerHTML = `
      <button class="jx-close" aria-label="Close">×</button>
      <p class="jx-eyebrow">J.A.R.V.I.S.</p><h2>Extensions & system status</h2>
      <div class="jx-status-list">${rows.map(([name, value]) => `<div><span>${escapeHtml(name)}</span><b data-ok="${value === true}">${prettyStatus(value)}</b></div>`).join("")}</div>
      <div class="jx-panel-actions"><button data-jx-notify>Enable notifications</button><button data-jx-read>Clear ${notifications.length} alerts</button></div>
      <div class="jx-alert-list">${notifications.slice(0, 8).map((item) => `<article><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body || "")}</span></article>`).join("") || "<small>No unread proactive alerts.</small>"}</div>
    `;
    panel.querySelector("[data-jx-notify]")?.addEventListener("click", requestNotifications);
    panel.querySelector("[data-jx-read]")?.addEventListener("click", async () => { await markNotificationsRead(); openExtensionPanel(); });
  }
  panel.querySelector(".jx-close")?.addEventListener("click", () => panel.classList.remove("open"));
  panel.classList.add("open");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function injectStyles() {
  if (document.getElementById("jarvis-upgrade-styles")) return;
  const style = document.createElement("style");
  style.id = "jarvis-upgrade-styles";
  style.textContent = `
    #jarvis-voice-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,18px);z-index:9999;max-width:min(680px,calc(100vw - 32px));padding:11px 16px;border-radius:12px;border:1px solid rgba(82,233,255,.22);background:rgba(3,12,22,.94);color:#dff9ff;font:600 11px/1.45 Inter,system-ui,sans-serif;box-shadow:0 18px 60px rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:.2s ease;backdrop-filter:blur(18px)}
    #jarvis-voice-toast.show{opacity:1;transform:translate(-50%,0)}
    #jarvis-voice-toast[data-tone="error"]{border-color:rgba(255,125,145,.42);color:#ffc2cc}#jarvis-voice-toast[data-tone="warn"]{border-color:rgba(255,203,107,.38);color:#ffe0a3}#jarvis-voice-toast[data-tone="success"]{border-color:rgba(101,245,181,.35);color:#a7f8d5}#jarvis-voice-toast[data-tone="listening"]{border-color:rgba(82,233,255,.5);box-shadow:0 0 35px rgba(82,233,255,.12),0 18px 60px rgba(0,0,0,.45)}
    #jarvis-upgrade-dock{position:fixed;right:18px;bottom:18px;z-index:5000;display:flex;gap:7px;align-items:center;padding:7px;border:1px solid rgba(82,233,255,.14);border-radius:14px;background:rgba(3,10,19,.9);backdrop-filter:blur(20px);box-shadow:0 14px 50px rgba(0,0,0,.38)}
    #jarvis-upgrade-dock button{position:relative;display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border:1px solid rgba(82,233,255,.12);border-radius:9px;background:rgba(82,233,255,.035);color:#a9bdcc;font:700 9px Inter,system-ui;cursor:pointer}#jarvis-upgrade-dock button:hover,#jarvis-upgrade-dock button.active{border-color:rgba(82,233,255,.4);color:#65efff;background:rgba(82,233,255,.1)}
    #jarvis-upgrade-dock .jx-badge{position:absolute;right:-5px;top:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:#ffcb6b;color:#1b1200;font-size:8px;display:grid;place-items:center}#jarvis-upgrade-dock .jx-badge[hidden]{display:none}
    #jarvis-extension-panel{position:fixed;right:18px;bottom:74px;z-index:4999;width:min(420px,calc(100vw - 36px));max-height:min(700px,calc(100vh - 100px));overflow:auto;padding:22px;border:1px solid rgba(82,233,255,.18);border-radius:18px;background:linear-gradient(145deg,rgba(9,20,35,.98),rgba(3,9,18,.98));color:#eaf8ff;box-shadow:0 28px 90px rgba(0,0,0,.55);backdrop-filter:blur(24px);opacity:0;transform:translateY(14px) scale(.98);pointer-events:none;transition:.2s ease}#jarvis-extension-panel.open{opacity:1;transform:none;pointer-events:auto}
    #jarvis-extension-panel .jx-close{position:absolute;right:12px;top:10px;width:31px;height:31px;border:0;border-radius:9px;background:rgba(255,255,255,.04);color:#91a7b9;font-size:20px;cursor:pointer}#jarvis-extension-panel .jx-eyebrow{margin:0 0 6px;color:#52e9ff;font:700 9px 'Space Mono',monospace;letter-spacing:.16em}#jarvis-extension-panel h2{margin:0 0 17px;font:800 18px Inter,sans-serif}
    .jx-status-list{display:grid;gap:1px;border:1px solid rgba(82,233,255,.08);border-radius:12px;overflow:hidden}.jx-status-list>div{display:flex;justify-content:space-between;gap:12px;padding:10px 11px;background:rgba(255,255,255,.018);font:600 9px Inter,sans-serif}.jx-status-list span{color:#9aafbf}.jx-status-list b{color:#ffcb6b;font-size:8px}.jx-status-list b[data-ok="true"]{color:#65f5b5}.jx-panel-actions{display:flex;gap:8px;margin:13px 0}.jx-panel-actions button{height:34px;border:1px solid rgba(82,233,255,.14);border-radius:9px;background:rgba(82,233,255,.04);color:#a8dbe4;font:700 9px Inter;cursor:pointer}.jx-alert-list{display:grid;gap:8px}.jx-alert-list article{padding:10px;border-radius:10px;background:rgba(255,203,107,.04);border:1px solid rgba(255,203,107,.09)}.jx-alert-list strong,.jx-alert-list span{display:block}.jx-alert-list strong{font-size:9px;color:#ffe0a3}.jx-alert-list span,.jx-alert-list small{margin-top:4px;color:#8599aa;font-size:8px;line-height:1.5}.jx-result{white-space:pre-wrap;color:#c9dbe7;font:500 10px/1.7 Inter,sans-serif;border:1px solid rgba(82,233,255,.08);background:rgba(255,255,255,.018);border-radius:12px;padding:14px}
    @media(max-width:650px){#jarvis-upgrade-dock{right:9px;bottom:9px}#jarvis-upgrade-dock button span{display:none}#jarvis-upgrade-dock button{width:36px;padding:0;justify-content:center}#jarvis-extension-panel{right:9px;bottom:60px;width:calc(100vw - 18px)}}
  `;
  document.head.appendChild(style);
}

function buildDock() {
  if (state.dockReady || document.getElementById("jarvis-upgrade-dock")) return;
  state.dockReady = true;
  const dock = document.createElement("div");
  dock.id = "jarvis-upgrade-dock";
  dock.innerHTML = `
    <button type="button" data-jarvis-live title="Low-latency realtime speech-to-speech"><span>Live voice</span> ◉</button>
    <button type="button" data-jarvis-vision title="Analyze a photo with JARVIS Vision"><span>Vision</span> ◫</button>
    <button type="button" data-jarvis-extensions title="JARVIS extensions and proactive alerts"><span>Systems</span> ⚙<i class="jx-badge" data-jarvis-alert-badge hidden>0</i></button>
  `;
  document.body.appendChild(dock);
  dock.querySelector("[data-jarvis-live]")?.addEventListener("click", startRealtimeVoice);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.hidden = true;
  input.addEventListener("change", () => { const file = input.files?.[0]; input.value = ""; runVision(file); });
  document.body.appendChild(input);
  dock.querySelector("[data-jarvis-vision]")?.addEventListener("click", () => input.click());
  dock.querySelector("[data-jarvis-extensions]")?.addEventListener("click", () => openExtensionPanel());
  updateAlertBadge();
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("/sw.js", { scope: "/" }); } catch (error) { console.warn("JARVIS service worker registration failed", error); }
}

async function init() {
  injectStyles();
  buildDock();
  await refreshStatus();
  await loadMemories();
  await initNotificationStream();
  await registerServiceWorker();
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id) setTimeout(() => initNotificationStream(), 0);
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

window.JARVIS_EXTENSIONS = {
  startRealtimeVoice,
  stopRealtimeVoice,
  openExtensionPanel,
  loadMemories,
  loadNotifications,
  refreshStatus
};
