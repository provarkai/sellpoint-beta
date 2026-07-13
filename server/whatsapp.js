// Thin WasenderAPI client for WhatsApp automation (Slice Five). Platform-
// level, not per-tenant: one WhatsApp Business number (connected via QR code
// in the WasenderAPI dashboard, outside this codebase) sends on behalf of
// every business's customer-facing messages - there is no per-business
// "connect your own WhatsApp" session management here, since that would need
// a much bigger lift (per-tenant session lifecycle, QR pairing UI) than a
// single trial account supports. WASENDER_API_KEY / WASENDER_WEBHOOK_SECRET
// must be set as server env vars (Railway Variables tab, never in the client
// or committed to git). Falls back gracefully when unset: callers check
// isConfigured() and use their existing wa.me deep-link flow instead.
const WASENDER_API_KEY = process.env.WASENDER_API_KEY || "";
const WASENDER_WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET || "";
const WASENDER_BASE_URL = "https://wasenderapi.com/api";

function isConfigured() {
  return !!WASENDER_API_KEY;
}

function hasWebhookSecret() {
  return !!WASENDER_WEBHOOK_SECRET;
}

// WasenderAPI docs verify webhooks by directly comparing the X-Webhook-Signature
// header to the stored secret (not an HMAC of the body) - matching that exactly
// here rather than assuming a stronger scheme the docs don't actually describe.
function verifyWebhookSignature(signatureHeader) {
  return !!WASENDER_WEBHOOK_SECRET && signatureHeader === WASENDER_WEBHOOK_SECRET;
}

// Accepts digits-only or already-E.164 phone numbers (this app stores
// customer phone numbers as digits-only, e.g. "2348012345678") and
// normalizes to the "+<digits>" E.164 format WasenderAPI expects.
function toE164(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) throw new Error("No phone number to send to");
  return "+" + digits;
}

async function sendMessage(phone, text) {
  if (!isConfigured()) throw new Error("WhatsApp sending is not configured");
  const res = await fetch(`${WASENDER_BASE_URL}/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: toE164(phone), text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.message || body.error || "WhatsApp send failed");
  return { messageId: body.data?.msgId ?? null, status: body.data?.status || "sent" };
}

module.exports = { isConfigured, hasWebhookSecret, verifyWebhookSignature, sendMessage, toE164 };
