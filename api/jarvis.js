export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

  try {
    const { message, history = [], context = {} } = req.body || {};
    if (!message || typeof message !== "string") return res.status(400).json({ error: "Message is required" });

    const instructions = [
      "You are JARVIS, the operating assistant for Legacy Jewelry Co.",
      "Be concise, practical, and action-oriented.",
      "Use the supplied Legacy CRM context when answering business or inventory questions.",
      "Never claim you changed CRM data, sent email, created calendar events, bought anything, or performed an external action unless the client explicitly reports that it completed.",
      "When asked about unavailable integrations, explain what credential or connection is missing.",
    ].join(" ");

    const input = [
      ...history.slice(-12).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
      { role: "user", content: `${message}\n\nCurrent Legacy context:\n${JSON.stringify(context).slice(0, 30000)}` },
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        instructions,
        input,
        max_output_tokens: 900,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || "OpenAI request failed" });

    const reply = data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text || "I'm online.";
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "JARVIS failed" });
  }
}
