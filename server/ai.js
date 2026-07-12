// Thin OpenRouter client for AI Tools. OPENROUTER_API_KEY must be set as a
// server env var (Railway Variables tab, never in the client or committed to
// git) - never hardcode a key here. Falls back gracefully when unset:
// callers check isConfigured() and use their own template text instead, so
// the feature still works (just less smart) before/without a key.
// OPENROUTER_MODEL is optional - defaults to a cheap, fast general model.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

function isConfigured() {
  return !!OPENROUTER_API_KEY;
}

async function generateText(prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://sellerspoint.ng",
      "X-Title": "SellersPoint",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "OpenRouter request failed");
  const text = (body.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("OpenRouter returned no text");
  return text;
}

module.exports = { isConfigured, generateText };
