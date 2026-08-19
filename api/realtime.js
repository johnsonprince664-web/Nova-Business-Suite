export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not available in this deployment." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const sdp = String(body.sdp || "");
  const context = body.context && typeof body.context === "object" ? body.context : {};
  if (!sdp) return res.status(400).json({ error: "Missing WebRTC SDP offer" });

  const compactContext = JSON.stringify({
    timezone: context.timezone || "America/New_York",
    weather: context.weather || null,
    business: context.business || null,
    calendar: Array.isArray(context.calendar) ? context.calendar.slice(0, 8) : [],
    memories: Array.isArray(context.memories) ? context.memories.slice(0, 10) : []
  }).slice(0, 12000);

  const session = {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
    output_modalities: ["audio"],
    instructions: `You are JARVIS, the user's private personal AI operating system and trusted everyday assistant. Use a refined masculine presence with a calm low-to-mid register, crisp articulation, understated confidence, subtle dry warmth, and a slight British-inspired cadence. Speak naturally to one person nearby: composed, intelligent, friendly, concise, and capable. Avoid an announcer voice, robotic rhythm, exaggerated cheerfulness, theatrical acting, or an exact imitation of any specific actor or fictional performance. You may use the supplied snapshot as context, but never invent external actions or say you changed calendars, stores, devices, files, or money unless a separate approved action actually executed. When the user asks for an unsupported write action, explain briefly that it needs approval through the command center. Current snapshot: ${compactContext}`,
    audio: {
      input: {
        noise_reduction: { type: "far_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "en" },
        turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true }
      },
      output: { voice: process.env.OPENAI_VOICE || "cedar", speed: 0.98 }
    }
  };

  try {
    const form = new FormData();
    form.append("sdp", new Blob([sdp], { type: "application/sdp" }), "offer.sdp");
    form.append("session", new Blob([JSON.stringify(session)], { type: "application/json" }), "session.json");
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const answer = await response.text();
    if (!response.ok) {
      console.error("Realtime error", response.status, answer.slice(0, 1000));
      return res.status(response.status).json({ error: answer || "Realtime connection failed" });
    }
    res.setHeader("Content-Type", "application/sdp");
    return res.status(201).send(answer);
  } catch (error) {
    console.error("Realtime setup failure", error);
    return res.status(500).json({ error: error.message || "Realtime setup failed" });
  }
}
