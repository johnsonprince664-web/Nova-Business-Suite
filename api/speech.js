export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not available in this deployment." });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const text = String(body.text || "").trim().slice(0, 4096);
  if (!text) return res.status(400).json({ error: "Text is required" });

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice: process.env.OPENAI_VOICE || "cedar",
        input: text,
        response_format: "mp3",
        speed: 0.97,
        instructions:
          "Use a refined masculine personal-assistant voice with a calm low-to-mid register, crisp articulation, understated confidence, and a subtle British-inspired cadence. Sound composed, highly intelligent, warm, dryly personable, and natural, like a capable private AI speaking to one person nearby. Keep responses conversational and concise. Avoid exaggerated cheerfulness, an announcer tone, robotic rhythm, theatrical acting, or an exact imitation of any specific actor or fictional performance."
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI speech error", response.status, errorText.slice(0, 1000));
      return res.status(response.status).json({ error: errorText || "Speech generation failed" });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("JARVIS speech failure", error);
    return res.status(500).json({ error: error.message || "Speech generation failed" });
  }
}
