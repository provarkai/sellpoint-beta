const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

// staffLimit/aiLimit/multiBranch are what actually differentiate the paid
// tiers now (see server/index.js and server/db.js for enforcement) - this
// is the fix for the gap flagged in CLAUDE.md's pricing strategy section.
const TIERS = {
  starter: { name: "Starter", monthly: 0, orderLimit: 30, staffLimit: 0, aiLimit: 10, multiBranch: false, reports: false, tagline: "Free - 30 orders/month, basic invoices and AI samples" },
  growth: { name: "Growth", monthly: 5000, orderLimit: Infinity, staffLimit: 0, aiLimit: 50, multiBranch: false, reports: false, tagline: "Unlimited orders, branded invoices, WhatsApp tools" },
  pro: { name: "Pro", monthly: 12000, orderLimit: Infinity, staffLimit: 3, aiLimit: 300, multiBranch: false, reports: true, tagline: "Everything in Growth plus 3 staff seats, more AI generations, and a reports view" },
  business: { name: "Business", monthly: 20000, orderLimit: Infinity, staffLimit: Infinity, aiLimit: Infinity, multiBranch: true, reports: true, tagline: "Everything in Pro plus unlimited staff, multiple branches, and priority support" },
  enterprise: { name: "Enterprise", monthly: null, orderLimit: Infinity, staffLimit: Infinity, aiLimit: Infinity, multiBranch: true, reports: true, tagline: "Custom pricing - talk to sales for volume, SLAs, and dedicated support" },
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

function staffLimitFor(plan) {
  return PRICING[plan]?.staffLimit ?? PRICING.starter.staffLimit;
}

function aiLimitFor(plan) {
  return PRICING[plan]?.aiLimit ?? PRICING.starter.aiLimit;
}

function multiBranchFor(plan) {
  return !!PRICING[plan]?.multiBranch;
}

function reportsEnabledFor(plan) {
  return !!PRICING[plan]?.reports;
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
  staffLimitFor,
  aiLimitFor,
  multiBranchFor,
  reportsEnabledFor,
  YEARLY_MULTIPLIER,
  SIMPLE_TIER_KEYS,
  visibleTiers,
};
