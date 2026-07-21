const test = require("node:test");
const assert = require("node:assert/strict");
const { isOrderDueForAutoReminder, computeSegments } = require("../db");

test("isOrderDueForAutoReminder: false when order younger than daysAfter", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const orderCreatedAt = new Date("2026-07-12T00:00:00Z"); // 1 day old
  assert.equal(isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt: null, daysAfter: 2, now }), false);
});

test("isOrderDueForAutoReminder: false immediately after stage 1 was sent, before stage 2's own delay", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const orderCreatedAt = new Date("2026-07-01T00:00:00Z");
  const lastAutoReminderAt = new Date("2026-07-12T00:00:00Z"); // stage 1 sent yesterday, stage 2 needs 3 days
  assert.equal(isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt, sentCount: 1, daysAfter: 2, now }), false);
});

test("isOrderDueForAutoReminder: true for stage 2 once its own follow-up delay has passed", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const orderCreatedAt = new Date("2026-07-01T00:00:00Z");
  const lastAutoReminderAt = new Date("2026-07-05T00:00:00Z"); // 8 days ago, stage 2 only needs 3
  assert.equal(isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt, sentCount: 1, daysAfter: 2, now }), true);
});

test("isOrderDueForAutoReminder: false once all 3 follow-up stages have already been sent", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const orderCreatedAt = new Date("2026-07-01T00:00:00Z");
  const lastAutoReminderAt = new Date("2026-07-01T00:00:00Z");
  assert.equal(isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt, sentCount: 3, daysAfter: 2, now }), false);
});

test("isOrderDueForAutoReminder: true when order old enough and never reminded", () => {
  const now = new Date("2026-07-13T00:00:00Z");
  const orderCreatedAt = new Date("2026-07-10T00:00:00Z"); // 3 days old
  assert.equal(isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt: null, daysAfter: 2, now }), true);
});

test("computeSegments: New for customers with no paid orders", () => {
  const [c] = computeSegments([{ id: "1", totalSpend: 0, paidOrderCount: 0, lastOrderAt: null }]);
  assert.equal(c.segment, "New");
});

test("computeSegments: At Risk for customers dormant past DORMANT_DAYS", () => {
  const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const [c] = computeSegments([{ id: "1", totalSpend: 5000, paidOrderCount: 1, lastOrderAt: old }]);
  assert.equal(c.segment, "At Risk");
});

test("computeSegments: VIP assigned only to top spenders, not everyone with spend", () => {
  const now = new Date().toISOString();
  const customers = [
    { id: "1", totalSpend: 100000, paidOrderCount: 1, lastOrderAt: now },
    { id: "2", totalSpend: 500, paidOrderCount: 1, lastOrderAt: now },
    { id: "3", totalSpend: 400, paidOrderCount: 1, lastOrderAt: now },
    { id: "4", totalSpend: 300, paidOrderCount: 1, lastOrderAt: now },
    { id: "5", totalSpend: 200, paidOrderCount: 1, lastOrderAt: now },
  ];
  const segmented = computeSegments(customers);
  assert.equal(segmented.find((c) => c.id === "1").segment, "VIP");
  assert.notEqual(segmented.find((c) => c.id === "5").segment, "VIP");
});
