const crypto = require("node:crypto");
const { priceFor } = require("./pricing");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

function isConfigured() {
  return !!(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY);
}

async function initializeTransaction({ email, plan, billingCycle, reference, callbackUrl, businessId }) {
  const amountNaira = priceFor(plan, billingCycle);
  if (amountNaira === null) throw new Error("Unknown plan");
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amountNaira * 100), // Paystack expects kobo
      reference,
      callback_url: callbackUrl,
      // businessId travels here because the webhook is a server-to-server
      // call with no session - metadata is the only way it learns which
      // tenant's plan to activate.
      metadata: { plan, billingCycle, businessId },
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Paystack initialize failed");
  return { authorizationUrl: body.data.authorization_url, amount: amountNaira };
}

// Paystack signs the raw request body with HMAC SHA512 using the secret key -
// must verify against the raw bytes, not the re-serialized parsed JSON, since
// key ordering/whitespace differences would break the signature.
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!PAYSTACK_SECRET_KEY || !signatureHeader) return false;
  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

// Used both by the webhook handler (belt-and-suspenders against spoofed
// events) and by the upgrade page's return leg, since local dev has no
// public URL for Paystack to reach with a webhook.
async function verifyTransaction(reference) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Paystack verify failed");
  return body.data; // { status: "success"|..., amount, reference, metadata, customer, ... }
}

module.exports = {
  isConfigured,
  initializeTransaction,
  verifyWebhookSignature,
  verifyTransaction,
  PAYSTACK_PUBLIC_KEY,
};
