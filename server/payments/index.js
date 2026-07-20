// Multi-provider payment gateway - picks one active provider (Paystack,
// Flutterwave, or Stripe; see ./paystack.js, ./flutterwave.js, ./stripe.js)
// and re-exports its interface with the EXACT same function signatures the
// original single-provider server/payments.js had, so every existing call
// site in server/index.js works completely unchanged.
//
// Every provider module implements the same interface:
//   isConfigured(config) -> bool
//   publicKey(config) -> string
//   initializeTransaction({email, plan, billingCycle, amountNaira, reference, callbackUrl, businessId, config})
//     -> {authorizationUrl, amount, reference}
//   initializeAddonTransaction({email, addonType, reference, callbackUrl, businessId, config})
//     -> {authorizationUrl, amount, reference}
//   verifyWebhookSignature(rawBody, signatureHeader, config) -> bool
//   verifyTransaction(reference, config)
//     -> {status: "success"|other, amount /* minor units, e.g. kobo/cents */, currency, reference, metadata}
//   listBanks(config) / resolveAccount(accountNumber, bankCode, config) / createSubaccount({..., config})
//     -> only Paystack/Flutterwave support these (supportsSplitPayments: true); Stripe throws
//   estimateProcessingFee(amountNaira) -> number (estimate only, not authoritative)
//   platformCutFor(amountNaira, plan) -> number
//   initializeStorefrontCheckout({..., config}) -> {authorizationUrl, amount, platformCut, reference}
//
// The active provider + its config are loaded ONCE (at server startup, see
// initPaymentConfig() called from server/index.js) and cached here, so every
// function below stays synchronous exactly like the old env-var-only module
// was - reloadPaymentConfig() re-reads platform_settings on demand (called
// after the admin saves new settings) rather than every call site needing
// to await a DB read.
const db = require("../db");
const paystack = require("./paystack");
const flutterwave = require("./flutterwave");
const stripe = require("./stripe");

const PROVIDERS = { paystack, flutterwave, stripe };

let activeProviderName = process.env.PAYMENT_PROVIDER || "paystack";
let activeConfig = {};

async function reloadPaymentConfig() {
  const settings = await db.getPaymentConfigForProvider().catch(() => null);
  if (settings?.activeProvider && PROVIDERS[settings.activeProvider]) {
    activeProviderName = settings.activeProvider;
  }
  activeConfig = settings?.providers?.[activeProviderName] || {};
}

function provider() {
  return PROVIDERS[activeProviderName] || paystack;
}

module.exports = {
  reloadPaymentConfig,
  providerNames: Object.keys(PROVIDERS),
  activeProviderName: () => activeProviderName,
  supportsSplitPayments: () => provider().supportsSplitPayments,
  isConfigured: () => provider().isConfigured(activeConfig),
  publicKey: () => provider().publicKey(activeConfig),
  initializeTransaction: (args) => provider().initializeTransaction({ ...args, config: activeConfig }),
  initializeAddonTransaction: (args) => provider().initializeAddonTransaction({ ...args, config: activeConfig }),
  webhookSignatureHeader: () => provider().webhookSignatureHeader,
  verifyWebhookSignature: (rawBody, signatureHeader) => provider().verifyWebhookSignature(rawBody, signatureHeader, activeConfig),
  extractWebhookEvent: (body) => provider().extractWebhookEvent(body),
  verifyTransaction: (reference) => provider().verifyTransaction(reference, activeConfig),
  listBanks: () => provider().listBanks(activeConfig),
  resolveAccount: (accountNumber, bankCode) => provider().resolveAccount(accountNumber, bankCode, activeConfig),
  createSubaccount: (args) => provider().createSubaccount({ ...args, config: activeConfig }),
  estimateProcessingFee: (amountNaira) => provider().estimateProcessingFee(amountNaira),
  platformCutFor: (amountNaira, plan) => provider().platformCutFor(amountNaira, plan),
  initializeStorefrontCheckout: (args) => provider().initializeStorefrontCheckout({ ...args, config: activeConfig }),
};
