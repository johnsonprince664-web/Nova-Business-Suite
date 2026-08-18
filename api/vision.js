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
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not available in this deployment." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const image = String(body.image || "");
  const prompt = String(body.prompt || "Analyze this image for JARVIS and explain what matters.").slice(0, 2000);
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image)) return res.status(400).json({ error: "A PNG, JPEG, or WEBP image is required." });
  if (image.length > 14_000_000) return res.status(413).json({ error: "Image is too large." });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6",
        store: false,
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image }
          ]
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Vision error", response.status, data?.error?.message || data);
      return res.status(response.status).json({ error: data?.error?.message || "Vision failed" });
    }
    return res.status(200).json({ result: extractOutputText(data) || "I could not extract a useful result from that image." });
  } catch (error) {
    console.error("Vision failure", error);
    return res.status(500).json({ error: error.message || "Vision failed" });
  }
}
