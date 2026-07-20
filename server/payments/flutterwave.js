// Flutterwave provider (v3 API) - implements the shared interface documented
// in server/payments/index.js. Structurally mirrors paystack.js since
// Flutterwave's split-payment model (subaccounts + a transaction-level
// split) is close enough to Paystack's to support the same
// initializeStorefrontCheckout feature, unlike Stripe (see stripe.js).
//
// Not exercised against a real Flutterwave account in this environment -
// built directly against Flutterwave's documented v3 REST API. Test with
// real (sandbox) keys before relying on it in production.
const { ADDON_PRICES } = require("../pricing");

function getKeys(config) {
  return {
    secretKey: config?.secretKey || process.env.FLUTTERWAVE_SECRET_KEY || "",
    publicKey: config?.publicKey || process.env.FLUTTERWAVE_PUBLIC_KEY || "",
    // Flutterwave webhooks aren't HMAC-signed - the "verif-hash" header must
    // just match this pre-shared value you set on both sides (Flutterwave
    // dashboard's webhook config, and here).
    secretHash: config?.secretHash || process.env.FLUTTERWAVE_SECRET_HASH || "",
  };
}

const FLW_BASE_URL = "https://api.flutterwave.com/v3";
const supportsSplitPayments = true;

function isConfigured(config) {
  const { secretKey, publicKey } = getKeys(config);
  return !!(secretKey && publicKey);
}

function publicKey(config) {
  return getKeys(config).publicKey;
}

async function initializeTransaction({ email, plan, billingCycle, amountNaira, reference, callbackUrl, businessId, config }) {
  if (amountNaira == null) throw new Error("Unknown plan");
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: reference,
      amount: amountNaira,
      currency: "NGN",
      redirect_url: callbackUrl,
      customer: { email },
      meta: { plan, billingCycle, businessId },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Flutterwave initialize failed");
  return { authorizationUrl: body.data.link, amount: amountNaira, reference };
}

async function initializeAddonTransaction({ email, addonType, reference, callbackUrl, businessId, config }) {
  const amount = ADDON_PRICES[addonType];
  if (!amount) throw new Error("Unknown add-on type");
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: reference,
      amount,
      currency: "NGN",
      redirect_url: callbackUrl,
      customer: { email },
      meta: { addonType, businessId },
    }),
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Flutterwave initialize failed");
  return { authorizationUrl: body.data.link, amount, reference };
}

// Flutterwave doesn't HMAC-sign webhook payloads - it just echoes back
// whatever "secret hash" you configured in the dashboard as the
// "verif-hash" header, so verification is a plain constant-time string
// compare rather than a signature computation.
function verifyWebhookSignature(rawBody, signatureHeader, config) {
  const { secretHash } = getKeys(config);
  if (!secretHash || !signatureHeader) return false;
  if (signatureHeader.length !== secretHash.length) return false;
  const crypto = require("node:crypto");
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(secretHash));
}

async function verifyTransaction(reference, config) {
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Flutterwave verify failed");
  const d = body.data;
  return {
    status: d.status === "successful" ? "success" : d.status,
    amount: Math.round(Number(d.amount || 0) * 100), // normalize to minor units like Paystack's kobo, since finalizeIfSuccessful divides by 100
    currency: d.currency || "NGN",
    reference: d.tx_ref,
    metadata: d.meta || {},
  };
}

async function listBanks(config) {
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/banks/NG`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Could not load bank list");
  return body.data.map((b) => ({ name: b.name, code: b.code }));
}

async function resolveAccount(accountNumber, bankCode, config) {
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/accounts/resolve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ account_number: accountNumber, account_bank: bankCode }),
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Could not verify account - check the account number and bank");
  return { accountName: body.data.account_name };
}

// split_type "flat" + split_value in NGN mirrors Paystack's transaction_charge
// (a flat platform cut per transaction) - percentage-based platform cuts
// would need split_type "percentage" instead, computed the same way
// platformCutFor already expresses it as a percentage of the order.
async function createSubaccount({ businessName, bankCode, accountNumber, config }) {
  const { secretKey } = getKeys(config);
  const res = await fetch(`${FLW_BASE_URL}/subaccounts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      account_bank: bankCode,
      account_number: accountNumber,
      business_name: businessName,
      split_type: "flat",
      split_value: 0, // per-transaction split is set at charge time instead, see initializeStorefrontCheckout
    }),
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Could not set up online payments with this bank account");
  return { subaccountCode: body.data.subaccount_id ?? body.data.id };
}

// Flutterwave Nigeria card fees run close to Paystack's (~1.4% capped
// around NGN2000) - same "estimate only, not authoritative" caveat as
// paystack.js's version applies here.
function estimateProcessingFee(amountNaira) {
  const fee = amountNaira * 0.014;
  return Math.round(Math.min(fee, 2000));
}

const PLATFORM_CUT_FLAT_NAIRA = 50;
function platformCutFor(amountNaira, plan) {
  const pct = plan === "starter" ? 0.025 : 0.015;
  return Math.round(amountNaira * pct + PLATFORM_CUT_FLAT_NAIRA);
}

async function initializeStorefrontCheckout({ email, amountNaira, absorbFees, subaccountCode, reference, callbackUrl, businessId, orderId, plan, config }) {
  const { secretKey } = getKeys(config);
  const chargeAmount = absorbFees ? amountNaira : amountNaira + estimateProcessingFee(amountNaira);
  const platformCut = platformCutFor(amountNaira, plan);
  const res = await fetch(`${FLW_BASE_URL}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tx_ref: reference,
      amount: chargeAmount,
      currency: "NGN",
      redirect_url: callbackUrl,
      customer: { email },
      meta: { businessId, orderId },
      subaccounts: [{ id: subaccountCode, transaction_charge_type: "flat", transaction_charge: platformCut }],
    }),
  });
  const body = await res.json();
  if (!res.ok || body.status !== "success") throw new Error(body.message || "Flutterwave initialize failed");
  return { authorizationUrl: body.data.link, amount: chargeAmount, platformCut, reference };
}

// Normalizes a raw Flutterwave webhook payload into the same shape
// verifyTransaction returns, or null if this event isn't a successful
// charge - lets index.js's webhook route stay provider-agnostic.
function extractWebhookEvent(body) {
  if (body?.event !== "charge.completed" || body?.data?.status !== "successful") return null;
  const d = body.data;
  return { status: "success", amount: Math.round(Number(d.amount || 0) * 100), currency: d.currency || "NGN", reference: d.tx_ref, metadata: d.meta || {} };
}

module.exports = {
  name: "flutterwave",
  label: "Flutterwave",
  supportsSplitPayments,
  webhookSignatureHeader: "verif-hash",
  isConfigured,
  publicKey,
  initializeTransaction,
  initializeAddonTransaction,
  verifyWebhookSignature,
  extractWebhookEvent,
  verifyTransaction,
  listBanks,
  resolveAccount,
  createSubaccount,
  estimateProcessingFee,
  initializeStorefrontCheckout,
  platformCutFor,
};
