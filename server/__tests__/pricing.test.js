const test = require("node:test");
const assert = require("node:assert/strict");
const { PRICING, priceFor, orderLimitFor, YEARLY_MULTIPLIER } = require("../pricing");

test("starter plan is free with a 20-order monthly limit", () => {
  assert.equal(PRICING.starter.monthly, 0);
  assert.equal(orderLimitFor("starter"), 20);
});

test("paid plans have no order limit", () => {
  for (const plan of ["growth", "pro", "business", "enterprise"]) {
    assert.equal(orderLimitFor(plan), Infinity);
  }
});

test("yearly price is monthly * YEARLY_MULTIPLIER for every plan with a fixed price", () => {
  for (const plan of Object.keys(PRICING)) {
    if (PRICING[plan].monthly == null) {
      assert.equal(PRICING[plan].yearly, null); // Enterprise: "contact us", not a fixed price
    } else {
      assert.equal(PRICING[plan].yearly, PRICING[plan].monthly * YEARLY_MULTIPLIER);
    }
  }
});

test("priceFor returns the right value per billing cycle", () => {
  assert.equal(priceFor("growth", "monthly"), PRICING.growth.monthly);
  assert.equal(priceFor("growth", "yearly"), PRICING.growth.yearly);
});

test("priceFor returns null for an unknown plan", () => {
  assert.equal(priceFor("nonexistent", "monthly"), null);
});

test("priceFor returns null for enterprise (contact-sales, no fixed price)", () => {
  assert.equal(priceFor("enterprise", "monthly"), null);
  assert.equal(priceFor("enterprise", "yearly"), null);
});

test("orderLimitFor falls back to the starter limit for an unknown plan", () => {
  assert.equal(orderLimitFor("nonexistent"), PRICING.starter.orderLimit);
});

test("applyPricingOverrides replaces monthly/yearly only for the self-serve paid tiers (pro/business)", () => {
  const { applyPricingOverrides } = require("../pricing");
  const overridden = applyPricingOverrides({ growth: 6000, pro: 15000 });
  assert.equal(overridden.growth.monthly, PRICING.growth.monthly); // growth is a closed legacy tier, no longer overridable
  assert.equal(overridden.pro.monthly, 15000);
  assert.equal(overridden.pro.yearly, 150000);
  assert.equal(overridden.business.monthly, PRICING.business.monthly); // untouched
  assert.equal(overridden.starter.monthly, 0); // never overridable
});

test("applyPricingOverrides with no overrides returns the same prices as PRICING", () => {
  const { applyPricingOverrides } = require("../pricing");
  const overridden = applyPricingOverrides();
  for (const plan of Object.keys(PRICING)) {
    assert.equal(overridden[plan].monthly, PRICING[plan].monthly);
  }
});
