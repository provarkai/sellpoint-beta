// Thin Gemini client for AI Tools. GEMINI_API_KEY must be set as a server
// env var (Railway Variables tab, never in the client or committed to git)
// - never hardcode a key here. Falls back gracefully when unset: callers
// check isConfigured() and use their own template text instead, so the
// feature still works (just less smart) before/without a key.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-2.0-flash";

function isConfigured() {
  return !!GEMINI_API_KEY;
}

async function generateText(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const body = await res.json();
  if (!res.ok) throw new Error(body.error?.message || "Gemini request failed");
  const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

module.exports = { isConfigured, generateText };
