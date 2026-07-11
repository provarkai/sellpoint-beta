const crypto = require("node:crypto");
const { ADDON_PRICE } = require("./pricing");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

function isConfigured() {
  return !!(PAYSTACK_SECRET_KEY && PAYSTACK_PUBLIC_KEY);
}

// amountNaira is resolved by the caller (server/index.js), which has DB
// access to the admin's price overrides - this module stays a thin Paystack
// client with no pricing knowledge of its own.
async function initializeTransaction({ email, plan, billingCycle, amountNaira, reference, callbackUrl, businessId }) {
  if (amountNaira == null) throw new Error("Unknown plan");
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

// One-off a-la-carte purchases (extra AI credits / staff seat / branch) -
// same dynamic Paystack checkout as plan upgrades (not a static payment
// link) so activation stays automatic; addonType travels in metadata
// instead of plan/billingCycle.
async function initializeAddonTransaction({ email, addonType, reference, callbackUrl, businessId }) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(ADDON_PRICE * 100),
      reference,
      callback_url: callbackUrl,
      metadata: { addonType, businessId },
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Paystack initialize failed");
  return { authorizationUrl: body.data.authorization_url, amount: ADDON_PRICE };
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

// --- Seller online payments (Paystack subaccounts) -------------------------
// Subaccounts are created with percentage_charge: 0 because our platform cut
// varies by plan and can't be expressed as a single static split on the
// subaccount itself - instead it's computed per transaction and passed as
// transaction_charge at initialize time (see platformCutFor / chargeAmount
// below). Paystack still deducts its own processing fee regardless, which is
// a separate concern from our platform cut.

// Free (starter) sellers pay a higher cut since they're not on a paid plan;
// every paid tier pays the same lower cut. Both add a flat NGN50 per order.
const PLATFORM_CUT_FLAT_NAIRA = 50;
function platformCutFor(amountNaira, plan) {
  const pct = plan === "starter" ? 0.025 : 0.015;
  return Math.round(amountNaira * pct + PLATFORM_CUT_FLAT_NAIRA);
}

async function listBanks() {
  const res = await fetch(`${PAYSTACK_BASE_URL}/bank?country=nigeria&currency=NGN`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Could not load bank list");
  return body.data.map((b) => ({ name: b.name, code: b.code }));
}

async function resolveAccount(accountNumber, bankCode) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Could not verify account - check the account number and bank");
  return { accountName: body.data.account_name };
}

async function createSubaccount({ businessName, bankCode, accountNumber }) {
  const res = await fetch(`${PAYSTACK_BASE_URL}/subaccount`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: accountNumber,
      percentage_charge: 0,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Could not set up online payments with this bank account");
  return { subaccountCode: body.data.subaccount_code };
}

// Real Paystack Nigeria card fees: 1.5% + NGN100 (fee waived under NGN2500,
// capped at NGN2000). This is only used to estimate what to add on top when
// the seller chooses to pass the fee to the customer - the fee actually
// deducted from the seller's settlement is whatever Paystack calculates,
// this is not authoritative.
function estimatePaystackFee(amountNaira) {
  let fee = amountNaira * 0.015;
  if (amountNaira > 2500) fee += 100;
  return Math.round(Math.min(fee, 2000));
}

// bearer: "subaccount" always - the seller's own payout nets minus
// Paystack's real fee either way; absorbFees only controls whether we ask
// the customer to cover an estimate of that fee up front. transaction_charge
// is the platform's cut (computed from the order total, not the inflated
// chargeAmount when the customer is covering the Paystack fee) - Paystack
// routes that portion to our main account and the rest to the subaccount.
async function initializeStorefrontCheckout({ email, amountNaira, absorbFees, subaccountCode, reference, callbackUrl, businessId, orderId, plan }) {
  const chargeAmount = absorbFees ? amountNaira : amountNaira + estimatePaystackFee(amountNaira);
  const platformCut = platformCutFor(amountNaira, plan);
  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      amount: Math.round(chargeAmount * 100),
      reference,
      callback_url: callbackUrl,
      subaccount: subaccountCode,
      bearer: "subaccount",
      transaction_charge: Math.round(platformCut * 100),
      metadata: { businessId, orderId },
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.status) throw new Error(body.message || "Paystack initialize failed");
  return { authorizationUrl: body.data.authorization_url, amount: chargeAmount, platformCut };
}

module.exports = {
  isConfigured,
  initializeTransaction,
  initializeAddonTransaction,
  verifyWebhookSignature,
  verifyTransaction,
  listBanks,
  resolveAccount,
  createSubaccount,
  estimatePaystackFee,
  initializeStorefrontCheckout,
  platformCutFor,
  PAYSTACK_PUBLIC_KEY,
};
