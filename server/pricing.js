const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

// A-la-carte add-ons (see /api/addons/purchase): every add-on costs the
// same flat NGN 2,000, one-off, on top of any plan. "ai_credits" grants
// ADDON_AI_CREDITS extra AI generations for the calendar month purchased in;
// "staff" and "branch" grant one extra seat/branch permanently.
const ADDON_PRICE = 2000;
const ADDON_AI_CREDITS = 500;

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
  YEARLY_MULTIPLIER,
  ADDON_PRICE,
  ADDON_AI_CREDITS,
};
