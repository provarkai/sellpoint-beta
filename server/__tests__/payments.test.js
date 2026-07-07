const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

// payments.js reads PAYSTACK_SECRET_KEY at module-load time, so set it
// before requiring the module.
process.env.PAYSTACK_SECRET_KEY = "test_secret_key";
const { verifyWebhookSignature } = require("../payments");

function sign(rawBody) {
  return crypto.createHmac("sha512", "test_secret_key").update(rawBody).digest("hex");
}

test("verifyWebhookSignature accepts a correctly signed body", () => {
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success" }));
  assert.equal(verifyWebhookSignature(rawBody, sign(rawBody)), true);
});

test("verifyWebhookSignature rejects a tampered body", () => {
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success" }));
  const signature = sign(rawBody);
  const tamperedBody = Buffer.from(JSON.stringify({ event: "charge.success", amount: 999999999 }));
  assert.equal(verifyWebhookSignature(tamperedBody, signature), false);
});

test("verifyWebhookSignature rejects a missing signature", () => {
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success" }));
  assert.equal(verifyWebhookSignature(rawBody, undefined), false);
});

test("verifyWebhookSignature rejects a garbage signature of different length", () => {
  const rawBody = Buffer.from(JSON.stringify({ event: "charge.success" }));
  assert.equal(verifyWebhookSignature(rawBody, "not-a-real-signature"), false);
});
