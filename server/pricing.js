const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

const TIERS = {
  starter: { name: "Starter", monthly: 0, orderLimit: 30, tagline: "Free - 30 orders/month, basic invoices and AI samples" },
  growth: { name: "Growth", monthly: 5000, orderLimit: Infinity, tagline: "Unlimited orders, branded invoices, WhatsApp tools" },
  pro: { name: "Pro", monthly: 8500, orderLimit: Infinity, tagline: "Everything in Growth plus AI credits and reports" },
  business: { name: "Business", monthly: 20000, orderLimit: Infinity, tagline: "Everything in Pro plus staff access and priority support" },
  enterprise: { name: "Enterprise", monthly: null, orderLimit: Infinity, tagline: "Custom pricing - talk to sales for volume, SLAs, and dedicated support" },
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

// Growth/Pro/Business are priced differently today but don't gate anything
// different in the product yet (no staff seats, AI credits, or reports
// exist), so only Starter + Growth are offered by default. The full ladder
// stays defined so plan lookups (priceFor/orderLimitFor/effectivePlan) never
// break, and a platform admin can turn the rest on once those features
// actually exist to justify the price gap - see platform_settings.
const SIMPLE_TIER_KEYS = ["starter", "growth"];

function visibleTiers(extendedPricingEnabled) {
  const keys = extendedPricingEnabled ? Object.keys(PRICING) : SIMPLE_TIER_KEYS;
  return Object.fromEntries(keys.map((key) => [key, PRICING[key]]));
}

module.exports = { PRICING, priceFor, orderLimitFor, YEARLY_MULTIPLIER, SIMPLE_TIER_KEYS, visibleTiers };
