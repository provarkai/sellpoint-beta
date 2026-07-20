// Stripe provider - implements the shared interface documented in
// server/payments/index.js, for PLATFORM billing only (plan upgrades and
// add-on purchases). Stripe does NOT support the storefront split-payment
// feature in this edition - that needs Stripe Connect (a separate seller
// onboarding flow, OAuth-based, nothing like Paystack/Flutterwave's "enter
// your bank account number" subaccounts) which isn't built here. Those
// functions throw a clear error instead of silently doing nothing; callers
// should check supportsSplitPayments before offering the feature in the UI.
//
// Not exercised against a real Stripe account in this environment - built
// directly against Stripe's documented REST API. Test with real (test-mode)
// keys before relying on it in production.
//
// Stripe's API is form-urlencoded, not JSON, and nests objects/arrays with
// bracket notation (metadata[key]=value, line_items[0][quantity]=1) - toForm
// below flattens a plain JS object into that shape.
const { ADDON_PRICES } = require("../pricing");

function toForm(obj, prefix) {
  const params = new URLSearchParams();
  function walk(value, path) {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
    } else if (typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, `${path}[${k}]`));
    } else {
      params.append(path, String(value));
    }
  }
  Object.entries(obj).forEach(([k, v]) => walk(v, prefix ? `${prefix}[${k}]` : k));
  return params;
}

function getKeys(config) {
  return {
    secretKey: config?.secretKey || process.env.STRIPE_SECRET_KEY || "",
    publicKey: config?.publicKey || process.env.STRIPE_PUBLISHABLE_KEY || "",
    webhookSecret: config?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET || "",
  };
}

const STRIPE_BASE_URL = "https://api.stripe.com/v1";
const supportsSplitPayments = false;

function isConfigured(config) {
  const { secretKey, publicKey } = getKeys(config);
  return !!(secretKey && publicKey);
}

function publicKey(config) {
  return getKeys(config).publicKey;
}

async function stripeRequest(path, config, body) {
  const { secretKey } = getKeys(config);
  const res = await fetch(`${STRIPE_BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? toForm(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Stripe request failed");
  return data;
}

// currency defaults to "usd" - Stripe's supported settlement currencies
// depend entirely on the buyer's own Stripe account/region, unlike
// Paystack/Flutterwave which are fixed to NGN. If this business/platform's
// configured currency isn't one Stripe's account supports, Stripe's API
// rejects the request with a clear error surfaced to the caller as-is.
async function initializeTransaction({ email, plan, billingCycle, amountNaira, reference, callbackUrl, businessId, config, currency }) {
  if (amountNaira == null) throw new Error("Unknown plan");
  const cur = (currency || "usd").toLowerCase();
  const data = await stripeRequest("/checkout/sessions", config, {
    mode: "payment",
    success_url: callbackUrl,
    cancel_url: callbackUrl,
    customer_email: email,
    client_reference_id: reference,
    metadata: { plan, billingCycle, businessId, reference },
    line_items: [{ price_data: { currency: cur, product_data: { name: `${plan} plan (${billingCycle})` }, unit_amount: Math.round(amountNaira * 100) }, quantity: 1 }],
  });
  return { authorizationUrl: data.url, amount: amountNaira, reference };
}

async function initializeAddonTransaction({ email, addonType, reference, callbackUrl, businessId, config, currency }) {
  const amountNaira = ADDON_PRICES[addonType];
  if (!amountNaira) throw new Error("Unknown add-on type");
  const cur = (currency || "usd").toLowerCase();
  const data = await stripeRequest("/checkout/sessions", config, {
    mode: "payment",
    success_url: callbackUrl,
    cancel_url: callbackUrl,
    customer_email: email,
    client_reference_id: reference,
    metadata: { addonType, businessId, reference },
    line_items: [{ price_data: { currency: cur, product_data: { name: addonType }, unit_amount: Math.round(amountNaira * 100) }, quantity: 1 }],
  });
  return { authorizationUrl: data.url, amount: amountNaira, reference };
}

// Stripe-Signature header shape: "t=<timestamp>,v1=<signature>[,v0=...]" -
// the signed payload is "<timestamp>.<rawBody>", HMAC-SHA256'd with the
// webhook signing secret. Multiple v1= entries can appear during a secret
// rotation window; matching any one is sufficient, same as Stripe's own
// reference implementation.
function verifyWebhookSignature(rawBody, signatureHeader, config) {
  const { webhookSecret } = getKeys(config);
  if (!webhookSecret || !signatureHeader) return false;
  const crypto = require("node:crypto");
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=")));
  const timestamp = parts.t;
  const signatures = signatureHeader.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!timestamp || !signatures.length) return false;
  const expected = crypto.createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}

// Checkout Sessions can't be fetched by an arbitrary caller-chosen reference
// directly (Stripe assigns its own session id) - the Search API is the
// documented way to look one up by client_reference_id instead. Note
// Stripe's search index is eventually consistent (can lag a few seconds
// after creation), unlike Paystack/Flutterwave's verify-by-reference which
// is immediately consistent - worth knowing if you see an occasional "not
// found" on a same-second verify.
async function verifyTransaction(reference, config) {
  const query = encodeURIComponent(`client_reference_id:'${reference}'`);
  const data = await stripeRequest(`/checkout/sessions/search?query=${query}`, config);
  const session = data.data?.[0];
  if (!session) throw new Error("Stripe checkout session not found for this reference");
  return {
    status: session.payment_status === "paid" ? "success" : session.payment_status,
    amount: session.amount_total, // already in minor units (cents), matches Paystack's kobo convention
    currency: (session.currency || "usd").toUpperCase(),
    reference: session.client_reference_id,
    metadata: session.metadata || {},
  };
}

function notSupported() {
  throw new Error("Direct seller payouts (storefront split payments) require Stripe Connect, which isn't set up in this edition. Use Paystack or Flutterwave for that feature, or extend stripe.js with Connect onboarding.");
}

// Normalizes a raw Stripe webhook event into the same shape
// verifyTransaction returns, or null if this event isn't a completed,
// paid checkout - lets index.js's webhook route stay provider-agnostic.
function extractWebhookEvent(body) {
  if (body?.type !== "checkout.session.completed") return null;
  const session = body.data?.object;
  if (!session || session.payment_status !== "paid") return null;
  return { status: "success", amount: session.amount_total, currency: (session.currency || "usd").toUpperCase(), reference: session.client_reference_id, metadata: session.metadata || {} };
}

module.exports = {
  name: "stripe",
  label: "Stripe",
  supportsSplitPayments,
  webhookSignatureHeader: "stripe-signature",
  isConfigured,
  publicKey,
  initializeTransaction,
  initializeAddonTransaction,
  verifyWebhookSignature,
  extractWebhookEvent,
  verifyTransaction,
  listBanks: notSupported,
  resolveAccount: notSupported,
  createSubaccount: notSupported,
  estimateProcessingFee: (amount) => Math.round(amount * 0.029 + 30), // Stripe's published ~2.9% + $0.30 (US card rate - actual rate depends on the buyer's account/region)
  initializeStorefrontCheckout: notSupported,
  platformCutFor: (amountNaira, plan) => Math.round(amountNaira * (plan === "starter" ? 0.025 : 0.015) + 50),
};
