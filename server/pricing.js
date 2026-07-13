const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

// A-la-carte add-ons (see /api/addons/purchase). "ai_credits" grants
// ADDON_AI_CREDITS extra AI generations for the calendar month purchased in;
// "whatsapp_credits" grants ADDON_WHATSAPP_CREDITS extra automated WhatsApp
// sends for the calendar month purchased in; "staff" and "branch" grant one
// extra seat/branch permanently. Prices differ per type (WhatsApp costs the
// platform real money per send, priced lower to stay a genuine top-up
// rather than a second subscription) - see ADDON_PRICES.
const ADDON_PRICES = { ai_credits: 2000, whatsapp_credits: 1500, staff: 2000, branch: 2000 };
const ADDON_AI_CREDITS = 500;
const ADDON_WHATSAPP_CREDITS = 100;

// staffLimit/aiLimit/branchLimit/productLimit/reportsTier are what actually
// differentiate the paid tiers now (see server/index.js and server/db.js for
// enforcement) - this is the fix for the gap flagged in CLAUDE.md's pricing
// strategy section.
// receiptLimit is separate from orderLimit - the standalone Receipt
// Generator (server/index.js /api/receipts/generate) is a free-standing
// lead-magnet tool, not tied to the orders/invoicing flow, so it gets its
// own monthly cap that's generous even on Starter.
// branchLimit is the number of branches allowed beyond the business's main
// location (0 = single location only).
// reportsTier is "none"/"basic"/"standard"/"advanced" - see db.js#getReports
// for what each level actually includes.
// storefront: every tier gets a public catalog page (/store/<slug>) - see
// server/index.js's /api/store/:slug and db.js#getStorefront. Opened up to
// Starter too (previously Growth+ only) since a public storefront is what
// lets a free-tier seller actually generate revenue and convert to a paid
// plan, not something worth withholding as the paywall itself; the
// productLimit each tier already carries is what naturally differentiates
// how much of a catalog a free storefront can show.
//
// The fields below this line back the pricing-restructure pass: every
// feature shipped without ever being allocated to a tier gets one here.
// whatsappLimit is metered (not walled) on purpose - it's one of only two
// features with a real per-use cost (the other being aiLimit), so it works
// like a phone plan: an included allowance, then a cheap top-up via
// ADDON_WHATSAPP_CREDITS, rather than a hard stop that just loses the sale.
// expenseLimit/poLimit are monthly entry counts; supplierLimit is a total
// count (suppliers "on file", not a monthly rate); plHistoryDays caps how
// far back P&L/cashbook queries can look (Infinity = full history).
// loyaltyAvailable gates whether a business can turn its own loyalty/wallet
// toggle on at all - separate from businesses.loyalty_enabled, which is the
// business's own on/off choice once the plan allows it.
// batchLimit/posLimit are monthly counts for batch/lot tracking and POS
// sales; 0 means the feature is unavailable on that tier, matching item 8's
// own CLAUDE.md framing as serving larger/multi-branch businesses first.
const TIERS = {
  starter: {
    name: "Starter", monthly: 0, orderLimit: 30, productLimit: 5, staffLimit: 0, aiLimit: 10, branchLimit: 0,
    reportsTier: "none", receiptLimit: 50, storefront: true,
    whatsappLimit: 0, expenseLimit: 20, plHistoryDays: 30, supplierLimit: 2, poLimit: 5,
    loyaltyAvailable: false, batchLimit: 0, posLimit: 0,
    tagline: "Free - 30 orders/month, 5 products, basic invoices, AI samples, a public storefront, and manual WhatsApp messaging",
  },
  growth: {
    name: "Growth", monthly: 5000, orderLimit: Infinity, productLimit: 30, staffLimit: 0, aiLimit: 50, branchLimit: 0,
    reportsTier: "basic", receiptLimit: Infinity, storefront: true,
    whatsappLimit: 100, expenseLimit: 200, plHistoryDays: 180, supplierLimit: 10, poLimit: 25,
    loyaltyAvailable: true, batchLimit: 0, posLimit: 0,
    tagline: "Unlimited orders, 30 products, branded invoices, a public storefront, unlimited free receipts, loyalty & wallet, and 100 automated WhatsApp sends/month",
  },
  pro: {
    name: "Pro", monthly: 12000, orderLimit: Infinity, productLimit: 100, staffLimit: 3, aiLimit: 500, branchLimit: 1,
    reportsTier: "standard", receiptLimit: Infinity, storefront: true,
    whatsappLimit: 500, expenseLimit: 500, plHistoryDays: 365, supplierLimit: 50, poLimit: 100,
    loyaltyAvailable: true, batchLimit: 100, posLimit: 500,
    tagline: "Everything in Growth plus 3 staff, a second branch, suppliers, batch tracking, POS mode, 500 automated WhatsApp sends/month, and more AI generations",
  },
  business: {
    name: "Business", monthly: 20000, orderLimit: Infinity, productLimit: Infinity, staffLimit: 20, aiLimit: 5000, branchLimit: 20,
    reportsTier: "advanced", receiptLimit: Infinity, storefront: true,
    whatsappLimit: 2000, expenseLimit: Infinity, plHistoryDays: Infinity, supplierLimit: Infinity, poLimit: Infinity,
    loyaltyAvailable: true, batchLimit: Infinity, posLimit: Infinity,
    tagline: "Everything in Pro plus up to 20 staff, 20 branches, 2,000 automated WhatsApp sends/month, and advanced reports",
  },
  enterprise: {
    name: "Enterprise", monthly: null, orderLimit: Infinity, productLimit: Infinity, staffLimit: Infinity, aiLimit: Infinity, branchLimit: Infinity,
    reportsTier: "advanced", receiptLimit: Infinity, storefront: true,
    whatsappLimit: Infinity, expenseLimit: Infinity, plHistoryDays: Infinity, supplierLimit: Infinity, poLimit: Infinity,
    loyaltyAvailable: true, batchLimit: Infinity, posLimit: Infinity,
    tagline: "Talk to sales for volume, SLAs, white-label, and dedicated support",
  },
};

// monthly: null means "contact us" - not a fixed price, so it's excluded
// from self-serve Paystack checkout (priceFor returns null for it too).
const PRICING = Object.fromEntries(
  Object.entries(TIERS).map(([key, tier]) => [
    key,
    { ...tier, yearly: tier.monthly == null ? null : tier.monthly * YEARLY_MULTIPLIER },
  ])
);

// Growth/Pro/Business monthly prices are admin-editable (see backend.html's
// Pricing Tiers form -> PUT /api/admin/pricing), stored as a small jsonb
// map on platform_settings rather than hardcoded here. Starter stays free
// and Enterprise stays "contact us" - only these three ever get overridden.
const OVERRIDABLE_TIERS = ["growth", "pro", "business"];

function applyPricingOverrides(overrides = {}) {
  return Object.fromEntries(
    Object.entries(PRICING).map(([key, tier]) => {
      if (!OVERRIDABLE_TIERS.includes(key) || overrides[key] == null) return [key, tier];
      const monthly = Number(overrides[key]);
      return [key, { ...tier, monthly, yearly: monthly * YEARLY_MULTIPLIER }];
    })
  );
}

function priceFor(plan, cycle, overrides) {
  const tier = applyPricingOverrides(overrides)[plan];
  if (!tier) return null;
  return cycle === "yearly" ? tier.yearly : tier.monthly;
}

function orderLimitFor(plan) {
  return PRICING[plan]?.orderLimit ?? PRICING.starter.orderLimit;
}

function productLimitFor(plan) {
  return PRICING[plan]?.productLimit ?? PRICING.starter.productLimit;
}

function staffLimitFor(plan) {
  return PRICING[plan]?.staffLimit ?? PRICING.starter.staffLimit;
}

function aiLimitFor(plan) {
  return PRICING[plan]?.aiLimit ?? PRICING.starter.aiLimit;
}

function branchLimitFor(plan) {
  return PRICING[plan]?.branchLimit ?? PRICING.starter.branchLimit;
}

function reportsTierFor(plan) {
  return PRICING[plan]?.reportsTier ?? PRICING.starter.reportsTier;
}

function receiptLimitFor(plan) {
  return PRICING[plan]?.receiptLimit ?? PRICING.starter.receiptLimit;
}

function storefrontEnabledFor(plan) {
  return !!(PRICING[plan]?.storefront ?? PRICING.starter.storefront);
}

function whatsappLimitFor(plan) {
  return PRICING[plan]?.whatsappLimit ?? PRICING.starter.whatsappLimit;
}

function expenseLimitFor(plan) {
  return PRICING[plan]?.expenseLimit ?? PRICING.starter.expenseLimit;
}

function plHistoryDaysFor(plan) {
  return PRICING[plan]?.plHistoryDays ?? PRICING.starter.plHistoryDays;
}

function supplierLimitFor(plan) {
  return PRICING[plan]?.supplierLimit ?? PRICING.starter.supplierLimit;
}

function poLimitFor(plan) {
  return PRICING[plan]?.poLimit ?? PRICING.starter.poLimit;
}

function loyaltyAvailableFor(plan) {
  return !!(PRICING[plan]?.loyaltyAvailable ?? PRICING.starter.loyaltyAvailable);
}

function batchLimitFor(plan) {
  return PRICING[plan]?.batchLimit ?? PRICING.starter.batchLimit;
}

function posLimitFor(plan) {
  return PRICING[plan]?.posLimit ?? PRICING.starter.posLimit;
}

module.exports = {
  PRICING,
  priceFor,
  applyPricingOverrides,
  OVERRIDABLE_TIERS,
  orderLimitFor,
  productLimitFor,
  staffLimitFor,
  aiLimitFor,
  branchLimitFor,
  reportsTierFor,
  receiptLimitFor,
  storefrontEnabledFor,
  whatsappLimitFor,
  expenseLimitFor,
  plHistoryDaysFor,
  supplierLimitFor,
  poLimitFor,
  loyaltyAvailableFor,
  batchLimitFor,
  posLimitFor,
  YEARLY_MULTIPLIER,
  ADDON_PRICES,
  ADDON_AI_CREDITS,
  ADDON_WHATSAPP_CREDITS,
};
