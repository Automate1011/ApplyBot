// pages/api/ai.js
// Proxies Claude API calls server-side - keeps API key secure

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const { system, user, maxTokens = 1200 } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            ANTHROPIC_KEY,
        "anthropic-version":    "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: maxTokens,
        system,
        messages:   [{ role: "user", content: user }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "AI API error" });
    }

    const text = (data.content || []).map(b => b.type === "text" ? b.text : "").join("").trim();
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
}
