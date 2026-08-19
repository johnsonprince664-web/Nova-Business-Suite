const root = document.documentElement;
const AudioCtx = window.AudioContext || window.webkitAudioContext;

const meter = {
  input: 0,
  output: 0,
  inputActive: 0,
  smooth: 0,
  raf: 0,
  phase: 0
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function normalizeRms(rms) {
  return clamp01((rms - 0.006) * 15);
}

function setLevel(kind, value) {
  meter[kind] = clamp01(value);
}

function renderOrb() {
  const target = Math.max(meter.output, meter.input * 0.92);
  meter.smooth += (target - meter.smooth) * (target > meter.smooth ? 0.34 : 0.13);
  if (meter.smooth < 0.004) meter.smooth = 0;

  const now = performance.now();
  meter.phase = now / 1000;
  const drift = meter.smooth;
  const x = Math.sin(meter.phase * 8.3) * drift * 5.5;
  const y = Math.cos(meter.phase * 6.7) * drift * 3.5;
  const rotate = Math.sin(meter.phase * 5.2) * drift * 2.1;

  root.style.setProperty("--jarvis-audio-level", meter.smooth.toFixed(4));
  root.style.setProperty("--jarvis-orb-x", `${x.toFixed(2)}px`);
  root.style.setProperty("--jarvis-orb-y", `${y.toFixed(2)}px`);
  root.style.setProperty("--jarvis-orb-rotate", `${rotate.toFixed(2)}deg`);

  const speaking = meter.output > 0.018;
  const listening = !speaking && meter.inputActive > 0;
  document.body.dataset.jarvisAudioMode = speaking ? "speaking" : listening ? "listening" : "idle";

  meter.raf = requestAnimationFrame(renderOrb);
}

if (!meter.raf) meter.raf = requestAnimationFrame(renderOrb);

function injectOrbStyles() {
  if (document.getElementById("jarvis-audio-reactive-styles")) return;
  const style = document.createElement("style");
  style.id = "jarvis-audio-reactive-styles";
  style.textContent = `
    :root {
      --jarvis-audio-level: 0;
      --jarvis-orb-x: 0px;
      --jarvis-orb-y: 0px;
      --jarvis-orb-rotate: 0deg;
    }

    .jarvis-orb {
      transform:
        translate3d(var(--jarvis-orb-x), var(--jarvis-orb-y), 0)
        rotate(var(--jarvis-orb-rotate))
        scale(calc(1 + (var(--jarvis-audio-level) * .23))) !important;
      transition: transform 54ms linear, filter 100ms ease !important;
      will-change: transform, filter;
    }

    .jarvis-orb .orb-core {
      transform: scale(calc(1 + (var(--jarvis-audio-level) * .18)));
      filter:
        brightness(calc(1 + (var(--jarvis-audio-level) * .7)))
        drop-shadow(0 0 calc(12px + (var(--jarvis-audio-level) * 28px)) rgba(86, 226, 255, .72));
      transition: transform 48ms linear, filter 70ms linear;
      will-change: transform, filter;
    }

    .jarvis-orb .orb-ring-1 {
      opacity: calc(.52 + (var(--jarvis-audio-level) * .46));
      filter: drop-shadow(0 0 calc(4px + (var(--jarvis-audio-level) * 14px)) rgba(77, 225, 255, .7));
    }

    .jarvis-orb .orb-ring-2 {
      opacity: calc(.35 + (var(--jarvis-audio-level) * .52));
      filter: drop-shadow(0 0 calc(2px + (var(--jarvis-audio-level) * 12px)) rgba(67, 209, 255, .6));
    }

    .jarvis-orb .orb-ring-3 {
      opacity: calc(.24 + (var(--jarvis-audio-level) * .6));
    }

    .jarvis-orb::before,
    .jarvis-orb::after {
      content: "";
      position: absolute;
      inset: 50%;
      pointer-events: none;
      border-radius: 50%;
      transform: translate(-50%, -50%) scale(calc(1 + (var(--jarvis-audio-level) * .85)));
      transition: transform 55ms linear, opacity 70ms linear;
    }

    .jarvis-orb::before {
      width: 118%;
      height: 118%;
      border: 1px solid rgba(77, 224, 255, calc(.08 + (var(--jarvis-audio-level) * .42)));
      box-shadow:
        0 0 calc(10px + (var(--jarvis-audio-level) * 30px)) rgba(55, 213, 255, calc(.08 + (var(--jarvis-audio-level) * .28))),
        inset 0 0 calc(8px + (var(--jarvis-audio-level) * 20px)) rgba(80, 229, 255, calc(.05 + (var(--jarvis-audio-level) * .22)));
    }

    .jarvis-orb::after {
      width: 145%;
      height: 145%;
      border: 1px solid rgba(100, 228, 255, calc(.035 + (var(--jarvis-audio-level) * .18)));
      opacity: calc(.2 + (var(--jarvis-audio-level) * .8));
    }

    body[data-jarvis-audio-mode="listening"] .jarvis-orb {
      filter: drop-shadow(0 0 calc(7px + (var(--jarvis-audio-level) * 19px)) rgba(63, 219, 255, .42));
    }

    body[data-jarvis-audio-mode="speaking"] .jarvis-orb {
      filter:
        saturate(1.18)
        drop-shadow(0 0 calc(10px + (var(--jarvis-audio-level) * 25px)) rgba(98, 228, 255, .55));
    }

    @media (prefers-reduced-motion: reduce) {
      .jarvis-orb,
      .jarvis-orb .orb-core,
      .jarvis-orb::before,
      .jarvis-orb::after {
        transform: none !important;
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectOrbStyles();

function attachStreamMeter(stream, kind = "input") {
  if (!AudioCtx || !stream || stream.__jarvisMeterAttached?.[kind]) return;
  stream.__jarvisMeterAttached = { ...(stream.__jarvisMeterAttached || {}), [kind]: true };

  let ctx;
  try {
    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.46;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let stopped = false;

    if (kind === "input") meter.inputActive += 1;

    const loop = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      setLevel(kind, normalizeRms(rms));
      requestAnimationFrame(loop);
    };
    loop();

    const tracks = stream.getAudioTracks();
    const stop = () => {
      if (stopped) return;
      if (tracks.some((track) => track.readyState === "live")) return;
      stopped = true;
      if (kind === "input") meter.inputActive = Math.max(0, meter.inputActive - 1);
      setLevel(kind, 0);
      ctx.close().catch(() => {});
    };
    tracks.forEach((track) => track.addEventListener("ended", stop));
  } catch (error) {
    console.warn("JARVIS audio meter unavailable", error?.message || error);
    ctx?.close?.().catch(() => {});
  }
}

// Meter every microphone stream used by normal voice and Realtime voice.
if (navigator.mediaDevices?.getUserMedia && !navigator.mediaDevices.__jarvisMeterWrapped) {
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function jarvisGetUserMedia(constraints) {
    const stream = await originalGetUserMedia(constraints);
    if (constraints?.audio) attachStreamMeter(stream, "input");
    return stream;
  };
  navigator.mediaDevices.__jarvisMeterWrapped = true;
}

// Realtime responses arrive as MediaStreams on hidden audio elements. Watch for them
// and meter the remote stream so the same orb reacts while JARVIS is talking.
const meteredAudio = new WeakSet();
function discoverRealtimeAudio() {
  document.querySelectorAll("audio").forEach((audio) => {
    if (!audio.srcObject || meteredAudio.has(audio)) return;
    meteredAudio.add(audio);
    attachStreamMeter(audio.srcObject, "output");
  });
}
setInterval(discoverRealtimeAudio, 350);

let activeTts = null;
let activeTtsContext = null;

function finishUtterance(utterance, eventName = "end") {
  setLevel("output", 0);
  if (eventName === "error") utterance?.onerror?.(new Event("error"));
  else utterance?.onend?.(new Event("end"));
}

async function playOpenAiSpeech(utterance) {
  const text = String(utterance?.text || "").trim();
  if (!text) return finishUtterance(utterance);

  const response = await fetch("/api/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    let message = "Voice generation failed";
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeTts = audio;

  const cleanup = async () => {
    setLevel("output", 0);
    URL.revokeObjectURL(url);
    if (activeTts === audio) activeTts = null;
    if (activeTtsContext) {
      try { await activeTtsContext.close(); } catch {}
      activeTtsContext = null;
    }
  };

  if (AudioCtx) {
    try {
      const ctx = new AudioCtx();
      activeTtsContext = ctx;
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      const samples = new Uint8Array(analyser.fftSize);
      const loop = () => {
        if (audio.paused || audio.ended) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        setLevel("output", Math.min(1, normalizeRms(Math.sqrt(sum / samples.length)) * 1.25));
        requestAnimationFrame(loop);
      };
      audio.addEventListener("play", loop, { once: true });
    } catch (error) {
      console.warn("JARVIS output meter unavailable", error?.message || error);
    }
  }

  audio.onplay = () => utterance?.onstart?.(new Event("start"));
  audio.onended = async () => {
    await cleanup();
    utterance?.onend?.(new Event("end"));
  };
  audio.onerror = async () => {
    await cleanup();
    utterance?.onerror?.(new Event("error"));
  };

  await audio.play();
}

function cancelOpenAiSpeech() {
  if (activeTts) {
    try {
      activeTts.pause();
      activeTts.currentTime = 0;
    } catch {}
    activeTts = null;
  }
  setLevel("output", 0);
  if (activeTtsContext) {
    activeTtsContext.close().catch(() => {});
    activeTtsContext = null;
  }
}

// The React app already calls speechSynthesis.speak(). Intercept that existing call so
// the UI/state callbacks keep working while audio comes from OpenAI instead of Windows TTS.
if (window.speechSynthesis && !window.speechSynthesis.__jarvisOpenAiVoice) {
  const synth = window.speechSynthesis;
  const nativeSpeak = synth.speak.bind(synth);
  const nativeCancel = synth.cancel.bind(synth);

  const replacementSpeak = (utterance) => {
    cancelOpenAiSpeech();
    nativeCancel();
    playOpenAiSpeech(utterance).catch((error) => {
      console.warn("OpenAI JARVIS voice fell back to browser TTS", error?.message || error);
      // Preserve a usable assistant if the API/audio endpoint is temporarily unavailable.
      try { nativeSpeak(utterance); } catch { finishUtterance(utterance, "error"); }
    });
  };

  const replacementCancel = () => {
    cancelOpenAiSpeech();
    nativeCancel();
  };

  try {
    Object.defineProperty(synth, "speak", { configurable: true, value: replacementSpeak });
    Object.defineProperty(synth, "cancel", { configurable: true, value: replacementCancel });
    synth.__jarvisOpenAiVoice = true;
  } catch (error) {
    try {
      synth.speak = replacementSpeak;
      synth.cancel = replacementCancel;
      synth.__jarvisOpenAiVoice = true;
    } catch {
      console.warn("Could not replace browser TTS with JARVIS voice", error?.message || error);
    }
  }
}
