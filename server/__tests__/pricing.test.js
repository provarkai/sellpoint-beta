const test = require("node:test");
const assert = require("node:assert/strict");
const { PRICING, priceFor, orderLimitFor, YEARLY_MULTIPLIER } = require("../pricing");

test("starter plan is free with a 20-order monthly limit", () => {
  assert.equal(PRICING.starter.monthly, 0);
  assert.equal(orderLimitFor("starter"), 20);
});

test("paid plans have no order limit", () => {
  for (const plan of ["basic", "standard", "premium"]) {
    assert.equal(orderLimitFor(plan), Infinity);
  }
});

test("yearly price is monthly * YEARLY_MULTIPLIER for every plan", () => {
  for (const plan of Object.keys(PRICING)) {
    assert.equal(PRICING[plan].yearly, PRICING[plan].monthly * YEARLY_MULTIPLIER);
  }
});

test("priceFor returns the right value per billing cycle", () => {
  assert.equal(priceFor("basic", "monthly"), PRICING.basic.monthly);
  assert.equal(priceFor("basic", "yearly"), PRICING.basic.yearly);
});

test("priceFor returns null for an unknown plan", () => {
  assert.equal(priceFor("nonexistent", "monthly"), null);
});

test("orderLimitFor falls back to the starter limit for an unknown plan", () => {
  assert.equal(orderLimitFor("nonexistent"), PRICING.starter.orderLimit);
});
