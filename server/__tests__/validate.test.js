const test = require("node:test");
const assert = require("node:assert/strict");
const { ValidationError, requireString, requireNumber } = require("../validate");

test("requireString accepts a non-empty string and trims it", () => {
  assert.equal(requireString("  Glow Cream  ", "Product name"), "Glow Cream");
});

test("requireString rejects empty, whitespace-only, and non-string values", () => {
  for (const value of ["", "   ", undefined, null, 42]) {
    assert.throws(() => requireString(value, "Product name"), ValidationError);
  }
});

test("requireNumber accepts a valid number within bounds", () => {
  assert.equal(requireNumber("8500", "Price", { min: 0 }), 8500);
  assert.equal(requireNumber(0, "Price", { min: 0 }), 0);
});

test("requireNumber rejects non-finite values", () => {
  for (const value of ["abc", NaN, Infinity, undefined, null, {}]) {
    assert.throws(() => requireNumber(value, "Price"), ValidationError);
  }
});

test("requireNumber enforces min and max", () => {
  assert.throws(() => requireNumber(-1, "Stock", { min: 0 }), ValidationError);
  assert.throws(() => requireNumber(101, "Percent", { max: 100 }), ValidationError);
  assert.equal(requireNumber(50, "Percent", { min: 0, max: 100 }), 50);
});

test("requireNumber enforces integer when requested", () => {
  assert.throws(() => requireNumber(1.5, "Quantity", { integer: true }), ValidationError);
  assert.equal(requireNumber(2, "Quantity", { integer: true }), 2);
});
