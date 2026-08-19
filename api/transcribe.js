export const config = { api: { bodyParser: false } };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not available in this deployment." });
  }

  try {
    const audio = await readBody(req);
    if (!audio.length) return res.status(400).json({ error: "No audio received" });
    if (audio.length > 20 * 1024 * 1024) return res.status(413).json({ error: "Audio clip is too large" });

    const mime = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : mime.includes("mp4") ? "mp4" : "webm";
    const form = new FormData();
    form.append("file", new Blob([audio], { type: mime }), `jarvis-voice.${ext}`);
    form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    form.append("language", "en");
    form.append("prompt", "The speaker is talking to an AI assistant named JARVIS. Preserve names, business terms, product names, dates, amounts, and commands accurately.");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Transcription error", response.status, data?.error?.message || data);
      return res.status(response.status).json({ error: data?.error?.message || "Transcription failed" });
    }
    return res.status(200).json({ text: String(data.text || "").trim(), model: data.model || process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe" });
  } catch (error) {
    console.error("Voice transcription failure", error);
    return res.status(500).json({ error: error.message || "Voice transcription failed" });
  }
}
