function extractOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ memories: [] });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const user = String(body.user || "").slice(0, 4000);
  const assistant = String(body.assistant || "").slice(0, 4000);
  if (!user) return res.status(200).json({ memories: [] });

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["memories"],
    properties: {
      memories: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "content"],
          properties: {
            kind: { type: "string", enum: ["preference", "person", "business", "project", "goal", "routine", "constraint", "general"] },
            content: { type: "string", minLength: 3, maxLength: 500 }
          }
        }
      }
    }
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        store: false,
        instructions: "Extract only durable facts that would genuinely help a personal AI assistant in future conversations. Save stable preferences, goals, relationships, business facts, recurring routines, ongoing project decisions, or important constraints. Do not save transient moods, one-off questions, passwords, API keys, financial account credentials, authentication secrets, or highly sensitive data. Use third-person concise memory statements. If nothing durable is present, return an empty array.",
        input: `USER: ${user}\nASSISTANT: ${assistant}`,
        text: { format: { type: "json_schema", name: "jarvis_memory_extract", strict: true, schema } }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Memory extraction error", response.status, data?.error?.message || data);
      return res.status(200).json({ memories: [] });
    }
    const parsed = JSON.parse(extractOutputText(data) || '{"memories":[]}');
    return res.status(200).json({ memories: Array.isArray(parsed.memories) ? parsed.memories : [] });
  } catch (error) {
    console.error("Memory extraction failure", error);
    return res.status(200).json({ memories: [] });
  }
}
