const YEARLY_MULTIPLIER = 10; // 2 months free when billed yearly

// A-la-carte add-ons (see /api/addons/purchase). "ai_credits" grants
// ADDON_AI_CREDITS extra AI generations for the calendar month purchased in;
// "whatsapp_credits" grants ADDON_WHATSAPP_CREDITS extra automated WhatsApp
// sends for the calendar month purchased in; "staff" grants one extra seat
// permanently. Prices differ per type (WhatsApp costs the platform real
// money per send, priced lower to stay a genuine top-up rather than a
// second subscription) - see ADDON_PRICES.
const ADDON_PRICES = { ai_credits: 2000, whatsapp_credits: 1500, staff: 2000, registration_package: 80000, bn_registration_package: 40000 };
const ADDON_AI_CREDITS = 500;
const ADDON_WHATSAPP_CREDITS = 100;

// Founder promo: redeemable at checkout until FOUNDER_PROMO_DEADLINE, after
// which new redemptions are rejected - but a business that already redeemed
// keeps FOUNDER_DISCOUNT_RATE off every future plan payment for life (see
// db.redeemFounderCode / businesses.founder_discount).
const FOUNDER_PROMO_CODE = "FOUNDER50";
const FOUNDER_PROMO_DEADLINE = "2026-12-31T23:59:59Z";
const FOUNDER_DISCOUNT_RATE = 0.5;
// Hard cap on top of the deadline - once this many businesses have
// redeemed, the code stops working even if the deadline hasn't passed yet.
// See db.redeemFounderCode/countFounderRedemptions.
const FOUNDER_PROMO_LIMIT = 1000;

// Every new signup starts on a trial of the "pro" tier (displayed as
// "Business Starter" - see TIERS.pro) for this many days, not the free
// plan - see db.createBusiness. No new cron job needed to end it:
// effectivePlan() already treats any plan whose plan_expires_at has
// passed as "starter" on every read, so the trial just expires into the
// free tier on its own.
const TRIAL_DAYS = 14;

// Refer-and-earn: every time this many of a business's referrals make
// their first paid-plan payment, the referrer gets 1 free month - of the
// "pro" tier (Business Starter) if they're on the free plan themselves,
// or an extra free month of whatever paid plan they're already on
// otherwise. See db.js#rewardReferrerIfEligible / businesses.referral_conversions.
const REFERRAL_REWARD_EVERY = 5;

// staffLimit/aiLimit/productLimit/reportsTier are what actually
// differentiate the paid tiers now (see server/index.js and server/db.js for
// enforcement) - this is the fix for the gap flagged in CLAUDE.md's pricing
// strategy section.
// receiptLimit is separate from orderLimit - the standalone Receipt
// Generator (server/index.js /api/receipts/generate) is a free-standing
// lead-magnet tool, not tied to the orders/invoicing flow, so it's
// unlimited on every tier including Starter rather than being a paywall
// lever at all.
// reportsTier is "none"/"basic"/"standard"/"advanced" - see db.js#getReports
// for what each level actually includes.
// storefront: every tier gets a public catalog page (/store/<slug>) - see
// server/index.js's /api/store/:slug and db.js#getStorefront. Opened up to
// the free plan too since a public storefront is what lets a free-tier
// seller actually generate revenue and convert to a paid plan, not
// something worth withholding as the paywall itself; the productLimit
// each tier already carries is what naturally differentiates how much of
// a catalog a free storefront can show. pixelTrackingAvailable is a
// separate, narrower gate on top of storefront - the free plan gets the
// storefront itself but not Facebook Pixel/Google Analytics tracking on
// it (see db.js#updateStorefrontSettings/getStorefront).
//
// The fields below this line back the pricing-restructure pass: every
// feature shipped without ever being allocated to a tier gets one here.
// whatsappLimit is metered (not walled) on purpose - it's one of only two
// features with a real per-use cost (the other being aiLimit), so it works
// like a phone plan: an included allowance, then a cheap top-up via
// ADDON_WHATSAPP_CREDITS, rather than a hard stop that just loses the sale.
// expenseLimit/poLimit are monthly entry counts; supplierLimit is a total
// count (suppliers "on file", not a monthly rate); plHistoryDays caps how
// far back P&L/cashbook queries can look (Infinity = full history).
// loyaltyAvailable gates whether a business can turn its own loyalty/wallet
// toggle on at all - separate from businesses.loyalty_enabled, which is the
// business's own on/off choice once the plan allows it.
// batchLimit/posLimit are monthly counts for batch/lot tracking and POS
// sales; 0 means the feature is unavailable on that tier, matching item 8's
// own CLAUDE.md framing as serving larger businesses first.
const TIERS = {
  starter: {
    name: "Free Plan", monthly: 0, orderLimit: 20, productLimit: 4, staffLimit: 0, aiLimit: 20,
    reportsTier: "none", receiptLimit: Infinity, storefront: true, pixelTrackingAvailable: false,
    whatsappLimit: 0, expenseLimit: 20, plHistoryDays: 30, supplierLimit: 0, poLimit: 0,
    loyaltyAvailable: false, batchLimit: 0, posLimit: 0,
    tagline: "Free forever - 20 orders/month, 4 products, basic invoices, 20 AI generations, unlimited free receipts, a public storefront, and manual WhatsApp messaging - or start a 14-day free trial of Business Starter",
  },
  // Not self-serve any more (see SELF_SERVE_PLANS) - kept fully defined,
  // never deleted, purely to keep existing pre-restructure subscribers'
  // limits/pricing resolving correctly (effectivePlan/orderLimitFor/etc.
  // all fall back to PRICING.starter for any plan key that doesn't exist,
  // which would silently downgrade every grandfathered Growth business
  // if this entry were removed instead of just hidden from new signups).
  growth: {
    name: "Growth", monthly: 5000, orderLimit: Infinity, productLimit: 30, staffLimit: 0, aiLimit: 100,
    reportsTier: "basic", receiptLimit: Infinity, storefront: true, pixelTrackingAvailable: true,
    whatsappLimit: 100, expenseLimit: 200, plHistoryDays: 180, supplierLimit: 10, poLimit: 25,
    loyaltyAvailable: true, batchLimit: 0, posLimit: 0,
    tagline: "Unlimited orders, 30 products, branded invoices, a public storefront with Pixel/GA tracking, loyalty & wallet, Trackers & Document Vault in My Docs, 100 AI generations, and 100 automated WhatsApp sends/month",
  },
  // ADDON_PRICES.staff. The one self-serve plan a new 14-day trial lands
  // on (see db.createBusiness) - repriced as part of the 2-tier
  // restructure; no Compliance Calendar/Tax Tools or Loyalty & wallet on
  // this tier any more (see app.js's DOCS_PRO_PLANS for the Docs-side gate).
  pro: {
    name: "Business Starter", monthly: 9999, orderLimit: Infinity, productLimit: 100, staffLimit: 5, aiLimit: 500,
    reportsTier: "standard", receiptLimit: Infinity, storefront: true, pixelTrackingAvailable: true,
    whatsappLimit: 500, expenseLimit: 500, plHistoryDays: 365, supplierLimit: 50, poLimit: 100,
    loyaltyAvailable: false, batchLimit: 100, posLimit: 500,
    tagline: "Unlimited orders, 100 products, 5 staff seats with custom permissions, suppliers, batch tracking, POS mode, 500 automated WhatsApp sends/month, and 500 AI generations - starts with a 14-day free trial",
  },
  business: {
    name: "Business Pro", monthly: 19999, orderLimit: Infinity, productLimit: Infinity, staffLimit: 20, aiLimit: 2000,
    reportsTier: "advanced", receiptLimit: Infinity, storefront: true, pixelTrackingAvailable: true,
    whatsappLimit: 1000, expenseLimit: Infinity, plHistoryDays: Infinity, supplierLimit: Infinity, poLimit: Infinity,
    loyaltyAvailable: true, batchLimit: Infinity, posLimit: Infinity,
    tagline: "Everything in Business Starter plus 20 staff seats with custom permissions, Compliance Calendar & Tax Tools in My Docs, loyalty & wallet, 1,000 automated WhatsApp sends/month, and advanced reports",
  },
  enterprise: {
    name: "Enterprise", monthly: null, orderLimit: Infinity, productLimit: Infinity, staffLimit: Infinity, aiLimit: Infinity,
    reportsTier: "advanced", receiptLimit: Infinity, storefront: true, pixelTrackingAvailable: true,
    whatsappLimit: Infinity, expenseLimit: Infinity, plHistoryDays: Infinity, supplierLimit: Infinity, poLimit: Infinity,
    loyaltyAvailable: true, batchLimit: Infinity, posLimit: Infinity,
    tagline: "Talk to sales for volume, SLAs, white-label, and dedicated support",
  },
};

// monthly: null means "contact us" - not a fixed price, so it's excluded
// from self-serve Paystack checkout (priceFor returns null for it too).
const PRICING = Object.fromEntries(
  Object.entries(TIERS).map(([key, tier]) => [
    key,
    { ...tier, yearly: tier.monthly == null ? null : tier.monthly * YEARLY_MULTIPLIER },
  ])
);

// The 2-tier restructure's self-serve lineup - what a new signup or the
// upgrade page can actually choose. Growth is deliberately absent (closed
// to new signups, grandfathered-only - see the TIERS.growth comment
// above); Enterprise is handled separately everywhere already (contact
// sales, never a self-serve Paystack checkout).
const SELF_SERVE_PLANS = ["starter", "pro", "business"];

// Pro/Business monthly prices are admin-editable (see backend.html's
// Pricing Tiers form -> PUT /api/admin/pricing), stored as a small jsonb
// map on platform_settings rather than hardcoded here. Starter stays free,
// Enterprise stays "contact us", and Growth is a closed/legacy tier with
// no live admin control any more - only Pro/Business ever get overridden.
const OVERRIDABLE_TIERS = ["pro", "business"];

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

function reportsTierFor(plan) {
  return PRICING[plan]?.reportsTier ?? PRICING.starter.reportsTier;
}

function receiptLimitFor(plan) {
  return PRICING[plan]?.receiptLimit ?? PRICING.starter.receiptLimit;
}

function storefrontEnabledFor(plan) {
  return !!(PRICING[plan]?.storefront ?? PRICING.starter.storefront);
}

function pixelTrackingAvailableFor(plan) {
  return !!(PRICING[plan]?.pixelTrackingAvailable ?? PRICING.starter.pixelTrackingAvailable);
}

function whatsappLimitFor(plan) {
  return PRICING[plan]?.whatsappLimit ?? PRICING.starter.whatsappLimit;
}

function expenseLimitFor(plan) {
  return PRICING[plan]?.expenseLimit ?? PRICING.starter.expenseLimit;
}

function plHistoryDaysFor(plan) {
  return PRICING[plan]?.plHistoryDays ?? PRICING.starter.plHistoryDays;
}

function supplierLimitFor(plan) {
  return PRICING[plan]?.supplierLimit ?? PRICING.starter.supplierLimit;
}

function poLimitFor(plan) {
  return PRICING[plan]?.poLimit ?? PRICING.starter.poLimit;
}

function loyaltyAvailableFor(plan) {
  return !!(PRICING[plan]?.loyaltyAvailable ?? PRICING.starter.loyaltyAvailable);
}

function batchLimitFor(plan) {
  return PRICING[plan]?.batchLimit ?? PRICING.starter.batchLimit;
}

function posLimitFor(plan) {
  return PRICING[plan]?.posLimit ?? PRICING.starter.posLimit;
}

module.exports = {
  PRICING,
  SELF_SERVE_PLANS,
  priceFor,
  applyPricingOverrides,
  OVERRIDABLE_TIERS,
  orderLimitFor,
  productLimitFor,
  staffLimitFor,
  aiLimitFor,
  reportsTierFor,
  receiptLimitFor,
  storefrontEnabledFor,
  pixelTrackingAvailableFor,
  whatsappLimitFor,
  expenseLimitFor,
  plHistoryDaysFor,
  supplierLimitFor,
  poLimitFor,
  loyaltyAvailableFor,
  batchLimitFor,
  posLimitFor,
  YEARLY_MULTIPLIER,
  ADDON_PRICES,
  ADDON_AI_CREDITS,
  ADDON_WHATSAPP_CREDITS,
  FOUNDER_PROMO_CODE,
  FOUNDER_PROMO_DEADLINE,
  FOUNDER_DISCOUNT_RATE,
  FOUNDER_PROMO_LIMIT,
  TRIAL_DAYS,
  REFERRAL_REWARD_EVERY,
};
