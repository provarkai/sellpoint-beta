const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

// staffLimit/aiLimit/branchLimit/productLimit/reportsTier are what actually
// differentiate the paid tiers now (see server/index.js and server/db.js for
// enforcement) - this is the fix for the gap flagged in CLAUDE.md's pricing
// strategy section.
// receiptLimit is separate from orderLimit - the standalone Receipt
// Generator (server/index.js /api/receipts/generate) is a free-standing
// lead-magnet tool, not tied to the orders/invoicing flow, so it gets its
// own monthly cap that's generous even on Starter.
// branchLimit is the number of *extra* branches allowed beyond the
// business's main location (0 = single location only).
// reportsTier is "none"/"basic"/"standard"/"advanced" - see db.js#getReports
// for what each level actually includes.
const TIERS = {
  starter: { name: "Starter", monthly: 0, orderLimit: 30, productLimit: 5, staffLimit: 0, aiLimit: 10, branchLimit: 0, reportsTier: "none", receiptLimit: 50, tagline: "Free - 30 orders/month, 5 products, basic invoices and AI samples" },
  growth: { name: "Growth", monthly: 5000, orderLimit: Infinity, productLimit: 30, staffLimit: 0, aiLimit: 50, branchLimit: 0, reportsTier: "basic", receiptLimit: Infinity, tagline: "Unlimited orders, 30 products, branded invoices, unlimited free receipts" },
  pro: { name: "Pro", monthly: 12000, orderLimit: Infinity, productLimit: 100, staffLimit: 3, aiLimit: 500, branchLimit: 1, reportsTier: "standard", receiptLimit: Infinity, tagline: "Everything in Growth plus 3 staff, a second branch, more AI generations, and sales reports" },
  business: { name: "Business", monthly: 20000, orderLimit: Infinity, productLimit: Infinity, staffLimit: 20, aiLimit: 5000, branchLimit: 20, reportsTier: "advanced", receiptLimit: Infinity, tagline: "Everything in Pro plus up to 20 staff, 20 branches, and advanced reports" },
  enterprise: { name: "Enterprise", monthly: null, orderLimit: Infinity, productLimit: Infinity, staffLimit: Infinity, aiLimit: Infinity, branchLimit: Infinity, reportsTier: "advanced", receiptLimit: Infinity, tagline: "Talk to sales for volume, SLAs, white-label, and dedicated support" },
};

// monthly: null means "contact us" - not a fixed price, so it's excluded
// from self-serve Paystack checkout (priceFor returns null for it too).
const PRICING = Object.fromEntries(
  Object.entries(TIERS).map(([key, tier]) => [
    key,
    { ...tier, yearly: tier.monthly == null ? null : tier.monthly * YEARLY_MULTIPLIER },
  ])
);

function priceFor(plan, cycle) {
  const tier = PRICING[plan];
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

// Only Starter + Growth are offered by default (SIMPLE_TIER_KEYS). The full
// ladder stays defined so plan lookups (priceFor/orderLimitFor/
// effectivePlan) never break, and a platform admin can turn the rest on
// from backend.html once satisfied the gating above holds up.
const SIMPLE_TIER_KEYS = ["starter", "growth"];

function visibleTiers(extendedPricingEnabled) {
  const keys = extendedPricingEnabled ? Object.keys(PRICING) : SIMPLE_TIER_KEYS;
  return Object.fromEntries(keys.map((key) => [key, PRICING[key]]));
}

module.exports = {
  PRICING,
  priceFor,
  orderLimitFor,
  productLimitFor,
  staffLimitFor,
  aiLimitFor,
  branchLimitFor,
  reportsTierFor,
  receiptLimitFor,
  YEARLY_MULTIPLIER,
  SIMPLE_TIER_KEYS,
  visibleTiers,
};
