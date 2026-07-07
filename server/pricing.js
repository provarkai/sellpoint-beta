const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

const TIERS = {
  starter: { name: "Starter", monthly: 0, orderLimit: 20, tagline: "Free - 20 orders/month, basic invoices and AI samples" },
  basic: { name: "Basic", monthly: 5000, orderLimit: Infinity, tagline: "Unlimited orders, branded invoices, WhatsApp tools" },
  standard: { name: "Standard", monthly: 9000, orderLimit: Infinity, tagline: "Everything in Basic plus AI credits and reports" },
  premium: { name: "Premium", monthly: 15000, orderLimit: Infinity, tagline: "Everything in Standard plus staff access and priority support" },
};

const PRICING = Object.fromEntries(
  Object.entries(TIERS).map(([key, tier]) => [key, { ...tier, yearly: tier.monthly * YEARLY_MULTIPLIER }])
);

function priceFor(plan, cycle) {
  const tier = PRICING[plan];
  if (!tier) return null;
  return cycle === "yearly" ? tier.yearly : tier.monthly;
}

function orderLimitFor(plan) {
  return PRICING[plan]?.orderLimit ?? PRICING.starter.orderLimit;
}

module.exports = { PRICING, priceFor, orderLimitFor, YEARLY_MULTIPLIER };
