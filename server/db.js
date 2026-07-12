const { Pool } = require("pg");
const { orderLimitFor, productLimitFor, staffLimitFor, aiLimitFor, branchLimitFor, receiptLimitFor, storefrontEnabledFor, ADDON_AI_CREDITS } = require("./pricing");
const { ValidationError, requireString, requireNumber } = require("./validate");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "shop";
}

// Loops appending a short random suffix until it finds a slug not already
// taken - collisions are rare (most business names differ) but far from
// impossible ("Glow Beauty" is a common shop name), and slugs are the
// public URL segment so they must be unique.
async function uniqueSlug(client, base) {
  const root = slugify(base);
  let candidate = root;
  for (let i = 0; i < 20; i++) {
    const { rows } = await client.query("SELECT 1 FROM businesses WHERE lower(slug) = lower($1)", [candidate]);
    if (!rows.length) return candidate;
    candidate = root + "-" + Math.random().toString(36).slice(2, 6);
  }
  return root + "-" + Date.now().toString(36);
}

// Same class as validate.js's ValidationError - OrderError predates the
// validate module and covers non-input errors too (order limit reached,
// product not found), but both map to the same 400 response in
// server/index.js, so there's no reason for them to be different classes.
const OrderError = ValidationError;

async function query(text, params) {
  return pool.query(text, params);
}

// Backs GET /api/health - a real DB round trip, not just "the process is
// alive", so an external uptime monitor actually catches a dead/unreachable
// Postgres connection, not just a crashed Node process.
async function healthCheck() {
  await query("SELECT 1");
  return true;
}

// Postgres returns `numeric` columns as strings (to avoid float precision
// loss) - coerce back to JS numbers at the JSON boundary, same shape the
// frontend already expects from the old SQLite version.
function toBusinessJson(b) {
  return {
    id: b.id,
    createdAt: b.created_at,
    businessName: b.name,
    businessPhone: b.phone,
    businessLogo: b.logo,
    businessAddress: b.address,
    paymentProvider: b.payment_provider,
    paymentLink: b.payment_link,
    paymentDetails: b.payment_details,
    plan: effectivePlan(b),
    billingCycle: b.billing_cycle,
    planExpiresAt: b.plan_expires_at,
    slug: b.slug,
    storefrontEnabled: b.storefront_enabled,
    storefrontEligible: storefrontEnabledFor(effectivePlan(b)),
    storefrontBanner: b.storefront_banner,
    socialLinks: b.social_links || {},
    whyBuyText: b.why_buy_text || "",
    paymentMode: b.payment_mode || "manual",
    absorbFees: !!b.absorb_fees,
    hasPaystackSubaccount: !!b.paystack_subaccount_code,
    paystackBankName: b.paystack_bank_name || "",
    paystackAccountName: b.paystack_account_name || "",
    paystackAccountNumberMasked: b.paystack_account_number ? "•••• " + b.paystack_account_number.slice(-4) : "",
    referralCode: b.referral_code || "",
  };
}
function effectivePlan(b) {
  if (b.plan !== "starter" && b.plan_expires_at && new Date(b.plan_expires_at) < new Date()) return "starter";
  return b.plan;
}
function toProductJson(p) {
  const discountPrice = p.discount_price == null ? null : Number(p.discount_price);
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    discountPrice: discountPrice != null && discountPrice < Number(p.price) ? discountPrice : null,
    stock: p.stock,
    category: p.category,
    type: p.type,
    deliveryLink: p.delivery_link,
    deliveryNote: p.delivery_note,
    image: p.image,
    images: p.images || [],
    description: p.description,
  };
}
function toCustomerJson(c) {
  return { id: c.id, name: c.name, phone: c.phone, email: c.email, location: c.location };
}
function toOrderJson(o) {
  return {
    id: o.id,
    productId: o.product_id,
    productName: o.product_name,
    productType: o.product_type,
    customerId: o.customer_id,
    qty: o.qty,
    price: Number(o.price),
    status: o.status,
    createdAt: o.created_at,
    delivered: !!o.delivered,
    deliveryMethod: o.delivery_method,
    dueDate: o.due_date,
  };
}
function toEventJson(e) {
  return { id: e.id, type: e.type, detail: e.detail, at: e.at };
}
function toPaymentJson(p) {
  return {
    id: p.id,
    businessId: p.business_id,
    businessName: p.business_name,
    provider: p.provider,
    reference: p.reference,
    plan: p.plan,
    billingCycle: p.billing_cycle,
    amount: Number(p.amount),
    status: p.status,
    createdAt: p.created_at,
  };
}
function toOwnerJson(o) {
  return { name: o.name, provider: o.provider, link: o.link, details: o.details };
}

async function logEvent(businessId, type, detail = "") {
  await query("INSERT INTO events (id, business_id, type, detail, at) VALUES ($1,$2,$3,$4,now())", [
    uid("e"),
    businessId,
    type,
    detail,
  ]);
}

// --- Membership / business lifecycle ---------------------------------

async function getMembership(userId) {
  const { rows } = await query(
    `SELECT m.business_id, m.role FROM business_members m WHERE m.user_id = $1`,
    [userId]
  );
  return rows[0] ? { businessId: rows[0].business_id, role: rows[0].role } : null;
}

async function createBusiness(userId, fields, email) {
  const existing = await getMembership(userId);
  if (existing) throw new OrderError("This account already has a business");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // A pending staff invite for this email takes priority over creating a
    // new business - accepting an invite means joining an existing
    // business as staff, not becoming an owner of a fresh one.
    const invite = email
      ? (await client.query("SELECT * FROM business_invites WHERE lower(email) = lower($1) LIMIT 1", [email])).rows[0]
      : null;
    if (invite) {
      const { rows: businessRows } = await client.query("SELECT * FROM businesses WHERE id = $1", [invite.business_id]);
      await client.query(
        `INSERT INTO business_members (business_id, user_id, email, role) VALUES ($1, $2, $3, 'staff')`,
        [invite.business_id, userId, email]
      );
      await client.query("DELETE FROM business_invites WHERE id = $1", [invite.id]);
      await client.query("COMMIT");
      return toBusinessJson(businessRows[0]);
    }
    const businessName = fields.businessName || "Your Business";
    const slug = await uniqueSlug(client, businessName);
    // A referral link (waitlist.html?ref=... or a real business's own
    // share link) carries the code through signup's user_metadata - look it
    // up against real businesses only (the waitlist's own codes are a
    // separate, unrelated namespace). No match just means no referrer, not
    // an error - a stale/mistyped code shouldn't block signup.
    const referredByCode = (fields.referredByCode || "").trim();
    let referredByBusinessId = null;
    if (referredByCode) {
      const { rows: refRows } = await client.query("SELECT id FROM businesses WHERE upper(referral_code) = upper($1)", [referredByCode]);
      referredByBusinessId = refRows[0]?.id || null;
    }
    const { rows } = await client.query(
      `INSERT INTO businesses (name, phone, slug, referred_by_business_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [businessName, fields.businessPhone || "", slug, referredByBusinessId]
    );
    const business = rows[0];
    await client.query(
      `INSERT INTO business_members (business_id, user_id, email, role) VALUES ($1, $2, $3, 'owner')`,
      [business.id, userId, email || ""]
    );
    await client.query("COMMIT");
    return toBusinessJson(business);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// --- Business-scoped state --------------------------------------------

async function getState(businessId) {
  const [business, products, customers, orders, events] = await Promise.all([
    query("SELECT * FROM businesses WHERE id = $1", [businessId]),
    query("SELECT * FROM products WHERE business_id = $1 ORDER BY created_at DESC", [businessId]),
    query("SELECT * FROM customers WHERE business_id = $1 ORDER BY created_at DESC", [businessId]),
    query("SELECT * FROM orders WHERE business_id = $1 ORDER BY created_at DESC", [businessId]),
    query("SELECT * FROM events WHERE business_id = $1 ORDER BY at DESC LIMIT 80", [businessId]),
  ]);
  if (!business.rows[0]) throw new OrderError("Business not found");
  return {
    business: toBusinessJson(business.rows[0]),
    products: products.rows.map(toProductJson),
    customers: customers.rows.map(toCustomerJson),
    orders: orders.rows.map(toOrderJson),
    events: events.rows.map(toEventJson),
  };
}

// Growth+ gated (see server/index.js), depth increases with plan:
// basic = revenue + status only; standard = + top 5 products/customers;
// advanced = + top 10 products/customers and a longer revenue history.
async function getReports(businessId, tier = "basic") {
  const months = tier === "advanced" ? 12 : tier === "standard" ? 6 : 3;
  const topN = tier === "advanced" ? 10 : 5;
  const includeTop = tier !== "basic";
  const [revenueByMonth, topProducts, topCustomers, statusBreakdown] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, SUM(price * qty) AS revenue
       FROM orders WHERE business_id = $1 AND status IN ('Paid', 'Delivered')
       GROUP BY 1 ORDER BY 1 DESC LIMIT $2`,
      [businessId, months]
    ),
    // Quotes aren't real sales yet and Refunded orders no longer are -
    // excluded from both so "top products/customers" reflects actual
    // committed business, not estimates or reversed sales.
    includeTop
      ? query(
          `SELECT product_name, SUM(qty) AS units, SUM(price * qty) AS revenue
           FROM orders WHERE business_id = $1 AND status NOT IN ('Quote', 'Refunded')
           GROUP BY product_name ORDER BY units DESC LIMIT $2`,
          [businessId, topN]
        )
      : Promise.resolve({ rows: [] }),
    includeTop
      ? query(
          `SELECT c.name, SUM(o.price * o.qty) AS spend, COUNT(*) AS orders
           FROM orders o JOIN customers c ON c.id = o.customer_id
           WHERE o.business_id = $1 AND o.status NOT IN ('Quote', 'Refunded') GROUP BY c.name ORDER BY spend DESC LIMIT $2`,
          [businessId, topN]
        )
      : Promise.resolve({ rows: [] }),
    query(`SELECT status, COUNT(*) AS n FROM orders WHERE business_id = $1 GROUP BY status`, [businessId]),
  ]);
  return {
    tier,
    revenueByMonth: revenueByMonth.rows.map((r) => ({ month: r.month, revenue: Number(r.revenue) })),
    topProducts: topProducts.rows.map((r) => ({ name: r.product_name, units: Number(r.units), revenue: Number(r.revenue) })),
    topCustomers: topCustomers.rows.map((r) => ({ name: r.name, spend: Number(r.spend), orders: Number(r.orders) })),
    statusBreakdown: statusBreakdown.rows.map((r) => ({ status: r.status, count: Number(r.n) })),
  };
}

async function getBusiness(businessId) {
  const { rows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  return rows[0] ? toBusinessJson(rows[0]) : null;
}

// Profile fields only - deliberately does NOT accept plan/billingCycle/
// planExpiresAt from caller-supplied fields, even though this is reachable
// from a plain authenticated tenant via PUT /api/business. Those three
// columns must only ever change through setPlan() (activatePlan/
// downgradeToStarter), which are only called from the payment
// webhook/verify flow and the explicit downgrade route - never from
// arbitrary request bodies. (Previously this function trusted
// fields.plan/billingCycle/planExpiresAt directly, which let any signed-in
// tenant grant themselves any paid tier for free via a raw PUT request.)
async function updateBusiness(businessId, fields) {
  const { rows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Business not found");
  const merged = {
    name: fields.businessName ?? current.name,
    phone: fields.businessPhone ?? current.phone,
    logo: fields.businessLogo ?? current.logo,
    address: fields.businessAddress ?? current.address,
    payment_provider: fields.paymentProvider ?? current.payment_provider,
    payment_link: fields.paymentLink ?? current.payment_link,
    payment_details: fields.paymentDetails ?? current.payment_details,
  };
  const { rows: updated } = await query(
    `UPDATE businesses SET name=$1, phone=$2, logo=$3, address=$4, payment_provider=$5, payment_link=$6,
       payment_details=$7
     WHERE id = $8 RETURNING *`,
    [
      merged.name,
      merged.phone,
      merged.logo,
      merged.address,
      merged.payment_provider,
      merged.payment_link,
      merged.payment_details,
      businessId,
    ]
  );
  return toBusinessJson(updated[0]);
}

async function setPlan(businessId, plan, billingCycle, planExpiresAt) {
  const { rows } = await query(
    "UPDATE businesses SET plan=$1, billing_cycle=$2, plan_expires_at=$3 WHERE id = $4 RETURNING *",
    [plan, billingCycle, planExpiresAt, businessId]
  );
  return toBusinessJson(rows[0]);
}

async function activatePlan(businessId, plan, billingCycle) {
  const now = new Date();
  const expires = new Date(now);
  if (billingCycle === "yearly") expires.setFullYear(expires.getFullYear() + 1);
  else expires.setMonth(expires.getMonth() + 1);
  await setPlan(businessId, plan, billingCycle, expires.toISOString());
  await logEvent(businessId, "plan_upgraded", `${plan} (${billingCycle})`);
}

// --- Referral program (real paying customers) -------------------------------

// Generated lazily on first request rather than at signup, so businesses
// created before this feature shipped self-heal instead of needing a
// backfill migration.
async function getOrCreateReferralCode(businessId) {
  const { rows } = await query("SELECT referral_code FROM businesses WHERE id = $1", [businessId]);
  if (!rows[0]) throw new OrderError("Business not found");
  if (rows[0].referral_code) return rows[0].referral_code;
  for (let i = 0; i < 20; i++) {
    const candidate = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { rows: taken } = await query("SELECT 1 FROM businesses WHERE referral_code = $1", [candidate]);
    if (taken.length) continue;
    const { rows: updated } = await query("UPDATE businesses SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code", [candidate, businessId]);
    if (updated[0]) return updated[0].referral_code;
    // Lost a race with a concurrent request generating one first - re-read.
    const { rows: retry } = await query("SELECT referral_code FROM businesses WHERE id = $1", [businessId]);
    if (retry[0]?.referral_code) return retry[0].referral_code;
  }
  throw new OrderError("Could not generate a referral code - try again");
}

// Reward: 1 free month, fired once, the moment a referred business makes its
// first successful PAID-PLAN payment (never for addon purchases or
// storefront orders, and never more than once per referred business even if
// they later upgrade again). If the referrer is on Starter, this gives them
// a month of Growth rather than "a free month of free" - otherwise it
// extends whatever paid plan they're already on.
async function rewardReferrerIfEligible(businessId) {
  const { rows } = await query("SELECT referred_by_business_id FROM businesses WHERE id = $1", [businessId]);
  const referrerId = rows[0]?.referred_by_business_id;
  if (!referrerId) return;
  const { rows: paymentCountRows } = await query(
    "SELECT COUNT(*)::int AS n FROM payments WHERE business_id = $1 AND status = 'success' AND plan NOT LIKE 'addon:%' AND plan != 'storefront_order'",
    [businessId]
  );
  if (paymentCountRows[0].n !== 1) return; // not exactly their first paid-plan payment
  const { rows: referrerRows } = await query("SELECT * FROM businesses WHERE id = $1", [referrerId]);
  const referrer = referrerRows[0];
  if (!referrer) return;
  const targetPlan = effectivePlan(referrer) === "starter" ? "growth" : referrer.plan;
  const now = new Date();
  const base = referrer.plan_expires_at && new Date(referrer.plan_expires_at) > now ? new Date(referrer.plan_expires_at) : now;
  base.setMonth(base.getMonth() + 1);
  await setPlan(referrerId, targetPlan, referrer.billing_cycle || "monthly", base.toISOString());
  await logEvent(referrerId, "referral_reward", `1 free month of ${targetPlan} for a referred business's first payment`);
}

// Immediate downgrade to Starter, at the tenant's own request. Per the
// Refund Policy, this doesn't refund unused time on the current paid
// period - it's the same "no auto-renewal" model everything already uses
// (plans lapse to Starter on their own via effectivePlan() once
// plan_expires_at passes), just triggered early by choice instead of by
// expiry.
async function downgradeToStarter(businessId) {
  const business = await setPlan(businessId, "starter", "monthly", null);
  await logEvent(businessId, "plan_downgraded", "starter");
  return business;
}

// --- Public storefront (Growth plan and above) ------------------------------

// Separate from updateBusiness (which deliberately only ever touches profile
// fields) since this needs its own validation: slug uniqueness, and a
// server-side plan check before allowing enabled=true - a tenant flipping
// this on with dev tools shouldn't work if they're on Starter, the same way
// they can't grant themselves a paid plan through the profile endpoint.
// Recognized keys only - an arbitrary object here would otherwise let
// anything be stashed in social_links, unbounded.
const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "x", "whatsapp"];

async function updateStorefrontSettings(businessId, { enabled, slug, banner, socialLinks, whyBuyText }) {
  const { rows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Business not found");
  const eligible = storefrontEnabledFor(effectivePlan(current));
  const nextEnabled = enabled !== undefined ? !!enabled && eligible : current.storefront_enabled && eligible;
  let nextSlug = current.slug;
  if (slug !== undefined) {
    const cleanSlug = slugify(slug);
    if (cleanSlug !== current.slug.toLowerCase()) {
      const { rows: taken } = await query("SELECT 1 FROM businesses WHERE lower(slug) = lower($1) AND id != $2", [cleanSlug, businessId]);
      if (taken.length) throw new OrderError("That storefront URL is already taken");
      nextSlug = cleanSlug;
    }
  }
  const nextBanner = banner !== undefined ? banner : current.storefront_banner;
  let nextSocial = current.social_links;
  if (socialLinks !== undefined && socialLinks && typeof socialLinks === "object") {
    nextSocial = Object.fromEntries(
      SOCIAL_KEYS.filter((k) => socialLinks[k]).map((k) => [k, String(socialLinks[k]).trim().slice(0, 200)])
    );
  }
  const nextWhyBuy = whyBuyText !== undefined ? String(whyBuyText).slice(0, 2000) : current.why_buy_text;
  const { rows: updated } = await query(
    "UPDATE businesses SET storefront_enabled=$1, slug=$2, storefront_banner=$3, social_links=$4, why_buy_text=$5 WHERE id = $6 RETURNING *",
    [nextEnabled, nextSlug, nextBanner, JSON.stringify(nextSocial), nextWhyBuy, businessId]
  );
  return toBusinessJson(updated[0]);
}

function toStorefrontProductJson(p) {
  const discountPrice = p.discount_price == null ? null : Number(p.discount_price);
  return { id: p.id, name: p.name, price: Number(p.price), discountPrice: discountPrice != null && discountPrice < Number(p.price) ? discountPrice : null, stock: p.stock, category: p.category, type: p.type, image: p.image, images: p.images || [], description: p.description };
}

// Public - no auth. Returns null (server/index.js 404s) unless the business
// exists, has explicitly turned the storefront on, AND is currently on an
// eligible plan - re-checked live so a lapsed/downgraded plan takes the
// storefront down automatically, not just at the moment they downgrade.
async function getStorefront(slug) {
  const { rows } = await query("SELECT * FROM businesses WHERE lower(slug) = lower($1)", [slug]);
  const business = rows[0];
  if (!business || !business.storefront_enabled || !storefrontEnabledFor(effectivePlan(business))) return null;
  const { rows: products } = await query(
    "SELECT * FROM products WHERE business_id = $1 ORDER BY created_at DESC",
    [business.id]
  );
  const { rows: completedRows } = await query(
    "SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status IN ('Paid','Delivered')",
    [business.id]
  );
  return {
    businessName: business.name,
    businessLogo: business.logo,
    businessBanner: business.storefront_banner,
    businessPhone: business.phone,
    businessAddress: business.address,
    socialLinks: business.social_links || {},
    memberSince: business.created_at,
    completedOrders: completedRows[0].n,
    whyBuyText: business.why_buy_text || "",
    onlinePaymentEnabled: business.payment_mode === "paystack" && !!business.paystack_subaccount_code,
    products: products.map(toStorefrontProductJson),
  };
}

// --- Seller online payments (Paystack subaccounts) --------------------------

async function updatePaymentSettings(businessId, { paymentMode, absorbFees }) {
  const { rows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Business not found");
  const nextMode = paymentMode !== undefined ? paymentMode : current.payment_mode;
  if (!["manual", "paystack"].includes(nextMode)) throw new OrderError("Invalid payment mode");
  if (nextMode === "paystack" && !current.paystack_subaccount_code) {
    throw new OrderError("Set up your bank account for online payments first");
  }
  const nextAbsorb = absorbFees !== undefined ? !!absorbFees : current.absorb_fees;
  const { rows: updated } = await query(
    "UPDATE businesses SET payment_mode=$1, absorb_fees=$2 WHERE id = $3 RETURNING *",
    [nextMode, nextAbsorb, businessId]
  );
  return toBusinessJson(updated[0]);
}

async function saveSubaccountDetails(businessId, { subaccountCode, bankCode, bankName, accountNumber, accountName }) {
  const { rows } = await query(
    `UPDATE businesses SET paystack_subaccount_code=$1, paystack_bank_code=$2, paystack_bank_name=$3,
       paystack_account_number=$4, paystack_account_name=$5 WHERE id = $6 RETURNING *`,
    [subaccountCode, bankCode, bankName, accountNumber, accountName, businessId]
  );
  if (!rows[0]) throw new OrderError("Business not found");
  return toBusinessJson(rows[0]);
}

// --- Storefront coupon codes -------------------------------------------------
// Seller-managed promo codes. Unique per business (not globally), so two
// sellers can both run "WELCOME10" without collision.

function toCouponJson(c) {
  return {
    id: c.id,
    code: c.code,
    discountType: c.discount_type,
    discountValue: Number(c.discount_value),
    maxUses: c.max_uses,
    usedCount: c.used_count,
    expiresAt: c.expires_at,
    active: c.active,
    createdAt: c.created_at,
  };
}

async function listCoupons(businessId) {
  const { rows } = await query("SELECT * FROM coupons WHERE business_id = $1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toCouponJson);
}

async function createCoupon(businessId, data) {
  const code = requireString(data.code, "Coupon code").toUpperCase().replace(/\s+/g, "");
  const discountType = data.discountType === "fixed" ? "fixed" : "percent";
  const discountValue = requireNumber(data.discountValue, "Discount value", { min: 0.01, max: discountType === "percent" ? 100 : undefined });
  const maxUses = data.maxUses === undefined || data.maxUses === null || data.maxUses === "" ? null : requireNumber(data.maxUses, "Max uses", { min: 1, integer: true });
  const expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  const { rows: existing } = await query("SELECT 1 FROM coupons WHERE business_id = $1 AND upper(code) = $2", [businessId, code]);
  if (existing.length) throw new OrderError("A coupon with this code already exists");
  const { rows } = await query(
    `INSERT INTO coupons (business_id, code, discount_type, discount_value, max_uses, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, code, discountType, discountValue, maxUses, expiresAt]
  );
  return toCouponJson(rows[0]);
}

async function setCouponActive(businessId, id, active) {
  const { rows } = await query("UPDATE coupons SET active=$1 WHERE id=$2 AND business_id=$3 RETURNING *", [!!active, id, businessId]);
  if (!rows[0]) throw new OrderError("Coupon not found");
  return toCouponJson(rows[0]);
}

async function deleteCoupon(businessId, id) {
  await query("DELETE FROM coupons WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// Public - validates a code against a storefront (by slug) and a cart
// subtotal, returning the discount without consuming a use (that only
// happens via redeemCoupon, called once an order/checkout actually
// completes). Shared by the storefront cart's live "Apply" preview and the
// real checkout path below, which always re-validates server-side rather
// than trusting a client-supplied discount amount.
async function validateCoupon(slug, code, subtotal) {
  const { rows: bizRows } = await query("SELECT id FROM businesses WHERE lower(slug) = lower($1)", [slug]);
  const business = bizRows[0];
  if (!business) throw new OrderError("Store not found");
  const { rows } = await query("SELECT * FROM coupons WHERE business_id = $1 AND upper(code) = upper($2)", [business.id, requireString(code, "Coupon code")]);
  const coupon = rows[0];
  if (!coupon || !coupon.active) throw new OrderError("Invalid coupon code");
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) throw new OrderError("This coupon has expired");
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) throw new OrderError("This coupon has reached its usage limit");
  const value = Number(coupon.discount_value);
  const discount = coupon.discount_type === "fixed" ? Math.min(value, subtotal) : Math.round(subtotal * (value / 100) * 100) / 100;
  return { couponId: coupon.id, code: coupon.code, discountType: coupon.discount_type, discountValue: value, discount, total: Math.max(0, subtotal - discount) };
}

async function redeemCoupon(couponId) {
  await query("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1", [couponId]);
}

// Public checkout path (no session) - looks the business up by slug the same
// way the storefront itself does, re-checking storefront eligibility so a
// downgraded/disabled store can't still take payments through a stale link.
async function checkoutStorefront(slug, { items, buyerName, buyerPhone, buyerEmail, buyerLocation, couponCode }) {
  const { rows } = await query("SELECT * FROM businesses WHERE lower(slug) = lower($1)", [slug]);
  const business = rows[0];
  if (!business || !business.storefront_enabled || !storefrontEnabledFor(effectivePlan(business))) {
    throw new OrderError("This storefront is not available");
  }
  if (business.payment_mode !== "paystack" || !business.paystack_subaccount_code) {
    throw new OrderError("Online payment is not enabled for this store");
  }
  if (!Array.isArray(items) || !items.length) throw new OrderError("Your cart is empty");
  const name = requireString(buyerName, "Your name");
  const email = requireString(buyerEmail, "Your email");

  const customer = await createCustomer(business.id, { name, phone: buyerPhone || "", email, location: buyerLocation || "" });
  const orderIds = [];
  let total = 0;
  for (const item of items) {
    const order = await createOrder(business.id, { productId: item.productId, customerId: customer.id, qty: item.qty || 1, status: "Pending payment" });
    orderIds.push(order.id);
    total += Number(order.price) * order.qty;
  }
  // Re-validate server-side rather than trusting a client-supplied discount -
  // the storefront's "Apply" button is just a preview.
  let couponId = null;
  if (couponCode) {
    const result = await validateCoupon(slug, couponCode, total);
    couponId = result.couponId;
    total = result.total;
  }
  if (couponId) await redeemCoupon(couponId);
  return { businessId: business.id, subaccountCode: business.paystack_subaccount_code, absorbFees: !!business.absorb_fees, plan: effectivePlan(business), orderIds, total, email };
}

// Looks up a single business-owned order (created directly in the
// dashboard, not through the public storefront cart) plus its customer's
// email, for generating an ad-hoc Paystack payment link to send over
// WhatsApp - separate from checkoutStorefront since there's no cart/slug
// involved here, just one existing order.
async function getOrderForPaymentLink(businessId, orderId) {
  const { rows } = await query(
    `SELECT o.id, o.price, o.qty, o.status, c.email AS customer_email
     FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.business_id = $2`,
    [orderId, businessId]
  );
  const row = rows[0];
  if (!row) throw new OrderError("Order not found");
  if (!row.customer_email) throw new OrderError("This customer has no email on file - add one to generate a payment link");
  const { rows: bizRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const business = bizRows[0];
  if (business.payment_mode !== "paystack" || !business.paystack_subaccount_code) {
    throw new OrderError("Online payments are not set up for this business");
  }
  return {
    amountNaira: Number(row.price) * row.qty,
    email: row.customer_email,
    subaccountCode: business.paystack_subaccount_code,
    absorbFees: !!business.absorb_fees,
    plan: effectivePlan(business),
  };
}

// --- Logistics providers (dispatch/courier credentials, generic) -----------

function toLogisticsJson(l) {
  return { id: l.id, name: l.name, apiKey: l.api_key, apiBase: l.api_base, notes: l.notes, createdAt: l.created_at };
}

async function listLogisticsProviders(businessId) {
  const { rows } = await query("SELECT * FROM logistics_providers WHERE business_id = $1 ORDER BY created_at", [businessId]);
  return rows.map(toLogisticsJson);
}

async function createLogisticsProvider(businessId, data) {
  const name = requireString(data.name, "Provider name");
  const { rows } = await query(
    "INSERT INTO logistics_providers (business_id, name, api_key, api_base, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [businessId, name, data.apiKey || "", data.apiBase || "", data.notes || ""]
  );
  return toLogisticsJson(rows[0]);
}

async function deleteLogisticsProvider(businessId, id) {
  await query("DELETE FROM logistics_providers WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- SellersPoint's own payout details (genuine singleton) -----------------

async function getOwner() {
  const { rows } = await query("SELECT * FROM owner_payment WHERE id = 1");
  return toOwnerJson(rows[0]);
}

async function updateOwner(fields) {
  const { rows } = await query("SELECT * FROM owner_payment WHERE id = 1");
  const current = rows[0];
  const { rows: updated } = await query(
    "UPDATE owner_payment SET name=$1, provider=$2, link=$3, details=$4 WHERE id = 1 RETURNING *",
    [fields.name ?? current.name, fields.provider ?? current.provider, fields.link ?? current.link, fields.details ?? current.details]
  );
  return toOwnerJson(updated[0]);
}

const PLATFORM_SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "x", "whatsapp", "linkedin"];

async function getPlatformSettings() {
  const { rows } = await query("SELECT extended_pricing_enabled, pricing_overrides, social_links FROM platform_settings WHERE id = 1");
  return { extendedPricingEnabled: !!rows[0]?.extended_pricing_enabled, pricingOverrides: rows[0]?.pricing_overrides || {}, socialLinks: rows[0]?.social_links || {} };
}

async function updatePlatformSettings(fields) {
  const current = await getPlatformSettings();
  const enabled = fields.extendedPricingEnabled !== undefined ? !!fields.extendedPricingEnabled : current.extendedPricingEnabled;
  let socialLinks = current.socialLinks;
  if (fields.socialLinks !== undefined) {
    socialLinks = {};
    for (const key of PLATFORM_SOCIAL_KEYS) {
      const value = (fields.socialLinks[key] || "").trim();
      if (value) socialLinks[key] = value;
    }
  }
  await query("UPDATE platform_settings SET extended_pricing_enabled = $1, social_links = $2 WHERE id = 1", [enabled, JSON.stringify(socialLinks)]);
  return { ...current, extendedPricingEnabled: enabled, socialLinks };
}

async function getPublicSocialLinks() {
  const { rows } = await query("SELECT social_links FROM platform_settings WHERE id = 1");
  return rows[0]?.social_links || {};
}

async function updatePricingOverrides(overrides) {
  const current = await getPlatformSettings();
  const merged = { ...current.pricingOverrides, ...overrides };
  await query("UPDATE platform_settings SET pricing_overrides = $1 WHERE id = 1", [JSON.stringify(merged)]);
  return { ...current, pricingOverrides: merged };
}

// --- Add-on purchases (a-la-carte, on top of any plan) ----------------------

async function recordAddonPurchase(businessId, type) {
  const month = type === "ai_credits" ? currentMonth() : null;
  await query("INSERT INTO addon_purchases (business_id, type, month) VALUES ($1, $2, $3)", [businessId, type, month]);
}

async function getAddonAiBonus(businessId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'ai_credits' AND month = $2",
    [businessId, currentMonth()]
  );
  return rows[0].n * ADDON_AI_CREDITS;
}

async function getAddonSeatBonus(businessId) {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'staff'", [businessId]);
  return rows[0].n;
}

async function getAddonBranchBonus(businessId) {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'branch'", [businessId]);
  return rows[0].n;
}

// --- Staff seats --------------------------------------------------------

function toStaffJson(m) {
  return { userId: m.user_id, email: m.email, role: m.role, createdAt: m.created_at };
}
function toInviteJson(i) {
  return { id: i.id, email: i.email, createdAt: i.created_at };
}

async function listStaff(businessId) {
  const [members, invites] = await Promise.all([
    query("SELECT * FROM business_members WHERE business_id = $1 ORDER BY created_at", [businessId]),
    query("SELECT * FROM business_invites WHERE business_id = $1 ORDER BY created_at", [businessId]),
  ]);
  return {
    owner: members.rows.filter((m) => m.role === "owner").map(toStaffJson)[0] || null,
    staff: members.rows.filter((m) => m.role === "staff").map(toStaffJson),
    invites: invites.rows.map(toInviteJson),
  };
}

async function effectiveStaffLimit(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const base = staffLimitFor(effectivePlan(businessRows[0]));
  return base === Infinity ? base : base + (await getAddonSeatBonus(businessId));
}

async function inviteStaff(businessId, email) {
  const clean = requireString(email, "Email").toLowerCase();
  const limit = await effectiveStaffLimit(businessId);
  const { staff } = await listStaff(businessId);
  if (staff.length >= limit) throw new OrderError("Staff seat limit reached for the current plan");
  const existing = await query(
    "SELECT 1 FROM business_members WHERE business_id = $1 AND lower(email) = $2",
    [businessId, clean]
  );
  if (existing.rows.length) throw new OrderError("This person is already on your team");
  await query(
    "INSERT INTO business_invites (business_id, email) VALUES ($1, $2) ON CONFLICT (business_id, email) DO NOTHING",
    [businessId, clean]
  );
  return listStaff(businessId);
}

async function revokeInvite(businessId, email) {
  await query("DELETE FROM business_invites WHERE business_id = $1 AND lower(email) = lower($2)", [businessId, email]);
  return listStaff(businessId);
}

async function removeStaff(businessId, userId) {
  await query("DELETE FROM business_members WHERE business_id = $1 AND user_id = $2 AND role = 'staff'", [businessId, userId]);
  return listStaff(businessId);
}

// --- AI usage -------------------------------------------------------------

function currentMonth() {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

async function getAiUsage(businessId) {
  const month = currentMonth();
  const { rows } = await query("SELECT count FROM ai_usage WHERE business_id = $1 AND month = $2", [businessId, month]);
  return rows[0]?.count || 0;
}

async function effectiveAiLimit(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const base = aiLimitFor(effectivePlan(businessRows[0]));
  return base === Infinity ? base : base + (await getAddonAiBonus(businessId));
}

async function incrementAiUsage(businessId) {
  const limit = await effectiveAiLimit(businessId);
  const month = currentMonth();
  const used = await getAiUsage(businessId);
  if (used >= limit) throw new OrderError("AI generation limit reached for the current plan this month");
  await query(
    `INSERT INTO ai_usage (business_id, month, count) VALUES ($1, $2, 1)
     ON CONFLICT (business_id, month) DO UPDATE SET count = ai_usage.count + 1`,
    [businessId, month]
  );
  return used + 1;
}

// --- Receipt Generator usage (free-standing lead-magnet tool) --------------

async function getReceiptUsage(businessId) {
  const month = currentMonth();
  const { rows } = await query("SELECT count FROM receipt_usage WHERE business_id = $1 AND month = $2", [businessId, month]);
  return rows[0]?.count || 0;
}

async function incrementReceiptUsage(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = receiptLimitFor(effectivePlan(businessRows[0]));
  const month = currentMonth();
  const used = await getReceiptUsage(businessId);
  if (used >= limit) throw new OrderError("Free receipt limit reached for the current plan this month");
  await query(
    `INSERT INTO receipt_usage (business_id, month, count) VALUES ($1, $2, 1)
     ON CONFLICT (business_id, month) DO UPDATE SET count = receipt_usage.count + 1`,
    [businessId, month]
  );
  return used + 1;
}

// --- Branches (Pro: 1, Business: 20, plus purchasable add-ons) -------------

function toBranchJson(b) {
  return { id: b.id, name: b.name, address: b.address, createdAt: b.created_at };
}

async function listBranches(businessId) {
  const { rows } = await query("SELECT * FROM branches WHERE business_id = $1 ORDER BY created_at", [businessId]);
  return rows.map(toBranchJson);
}

async function effectiveBranchLimit(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const base = branchLimitFor(effectivePlan(businessRows[0]));
  return base === Infinity ? base : base + (await getAddonBranchBonus(businessId));
}

async function createBranch(businessId, data) {
  const limit = await effectiveBranchLimit(businessId);
  const existing = await listBranches(businessId);
  if (existing.length >= limit) throw new OrderError("Branch limit reached for the current plan");
  const name = requireString(data.name, "Branch name");
  const { rows } = await query(
    "INSERT INTO branches (business_id, name, address) VALUES ($1, $2, $3) RETURNING *",
    [businessId, name, data.address || ""]
  );
  await logEvent(businessId, "branch_created", name);
  return toBranchJson(rows[0]);
}

async function deleteBranch(businessId, id) {
  await query("DELETE FROM branches WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- Products / customers ------------------------------------------------

const MAX_PRODUCT_IMAGES = 5;
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  const clean = images.filter((s) => typeof s === "string" && s.trim());
  if (clean.length > MAX_PRODUCT_IMAGES) throw new OrderError(`A product can have at most ${MAX_PRODUCT_IMAGES} photos`);
  return clean;
}

// Unset (undefined/null/"") clears the discount rather than erroring, since
// that's how a seller removes a discount via the same field they set it in.
function parseDiscountPrice(value, price) {
  if (value === undefined || value === null || value === "") return null;
  const n = requireNumber(value, "Discount price", { min: 0 });
  if (n >= price) throw new OrderError("Discount price must be lower than the regular price");
  return n;
}

async function createProduct(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM products WHERE business_id = $1", [businessId]);
  const limit = productLimitFor(effectivePlan(businessRows[0]));
  if (countRows[0].n >= limit) throw new OrderError("Product listing limit reached for the current plan");
  const name = requireString(data.name, "Product name");
  const price = requireNumber(data.price, "Price", { min: 0 });
  const stock = requireNumber(data.stock, "Stock", { min: 0, integer: true });
  const discountPrice = parseDiscountPrice(data.discountPrice, price);
  const images = normalizeImages(data.images);
  const id = uid("p");
  const { rows } = await query(
    `INSERT INTO products (id, business_id, name, price, discount_price, stock, category, type, delivery_link, delivery_note, image, images, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      id,
      businessId,
      name,
      price,
      discountPrice,
      stock,
      data.category || "",
      data.type || "Product",
      data.deliveryLink || "",
      data.deliveryNote || "",
      images[0] || data.image || "",
      JSON.stringify(images),
      data.description || "",
    ]
  );
  await logEvent(businessId, "item_created", name);
  return toProductJson(rows[0]);
}

async function updateProduct(businessId, id, data) {
  const { rows } = await query("SELECT * FROM products WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Product not found");
  const name = data.name !== undefined ? requireString(data.name, "Product name") : current.name;
  const price = data.price !== undefined ? requireNumber(data.price, "Price", { min: 0 }) : Number(current.price);
  const stock = data.stock !== undefined ? requireNumber(data.stock, "Stock", { min: 0, integer: true }) : current.stock;
  const discountPrice = data.discountPrice !== undefined ? parseDiscountPrice(data.discountPrice, price) : current.discount_price;
  const images = data.images !== undefined ? normalizeImages(data.images) : current.images;
  const image = data.images !== undefined ? images[0] || "" : data.image !== undefined ? data.image : current.image;
  const { rows: updated } = await query(
    `UPDATE products SET name=$1, price=$2, discount_price=$3, stock=$4, category=$5, type=$6, delivery_link=$7, delivery_note=$8, image=$9, images=$10, description=$11
     WHERE id = $12 AND business_id = $13 RETURNING *`,
    [
      name,
      price,
      discountPrice,
      stock,
      data.category !== undefined ? data.category : current.category,
      data.type !== undefined ? data.type : current.type,
      data.deliveryLink !== undefined ? data.deliveryLink : current.delivery_link,
      data.deliveryNote !== undefined ? data.deliveryNote : current.delivery_note,
      image,
      JSON.stringify(images),
      data.description !== undefined ? data.description : current.description,
      id,
      businessId,
    ]
  );
  return toProductJson(updated[0]);
}

async function deleteProduct(businessId, id) {
  await query("DELETE FROM products WHERE id = $1 AND business_id = $2", [id, businessId]);
}

async function createCustomer(businessId, data) {
  const name = requireString(data.name, "Customer name");
  const id = uid("c");
  const phone = String(data.phone || "").replace(/\D/g, "");
  const email = String(data.email || "").trim();
  await query(
    "INSERT INTO customers (id, business_id, name, phone, email, location) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, businessId, name, phone, email, data.location || ""]
  );
  await logEvent(businessId, "customer_created", name);
  return toCustomerJson({ id, name, phone, email, location: data.location || "" });
}

async function deleteCustomer(businessId, id) {
  await query("DELETE FROM customers WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- Orders ---------------------------------------------------------------

// Quotes are a pre-commitment estimate, not a real sale yet - they don't
// touch stock and don't count against the plan's order limit (both only
// apply once a quote is actually converted into a real order via
// convertQuoteToOrder below).
async function createOrder(businessId, data) {
  const isQuote = data.status === "Quote";
  const qty = requireNumber(data.qty ?? 1, "Quantity", { min: 1, integer: true });
  const dueDate = data.dueDate ? new Date(data.dueDate).toISOString() : null;

  let product;
  if (isQuote) {
    const { rows: productRows } = await query("SELECT * FROM products WHERE id = $1 AND business_id = $2", [data.productId, businessId]);
    product = productRows[0];
    if (!product) throw new OrderError("Product not found");
  } else {
    const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
    const business = businessRows[0];
    const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status != 'Quote'", [businessId]);
    const limit = orderLimitFor(effectivePlan(business));
    if (countRows[0].n >= limit) throw new OrderError("Order limit reached for the current plan");

    // Atomic check-and-decrement: baking "enough stock?" into the UPDATE's
    // WHERE clause (instead of reading stock, checking it in JS, then
    // writing a computed value back) closes a race where two concurrent
    // checkouts for the same product could both pass a stale read and
    // oversell it.
    const { rows: productRows } = await query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2 AND business_id = $3 AND stock >= $1 RETURNING *",
      [qty, data.productId, businessId]
    );
    product = productRows[0];
    if (!product) {
      const { rows: existing } = await query("SELECT 1 FROM products WHERE id = $1 AND business_id = $2", [data.productId, businessId]);
      throw new OrderError(existing[0] ? "Not enough stock" : "Product not found");
    }
  }
  const id = uid("o");
  const deliveryMethod = ["self", "rider", "sellerspoint"].includes(data.deliveryMethod) ? data.deliveryMethod : "self";
  // Orders bill at the discounted price when one's active - the discount is
  // a real selling price, not just a display label.
  const discountPrice = product.discount_price == null ? null : Number(product.discount_price);
  const sellingPrice = discountPrice != null && discountPrice < Number(product.price) ? discountPrice : product.price;
  const { rows } = await query(
    `INSERT INTO orders (id, business_id, product_id, product_name, product_type, customer_id, qty, price, status, delivered, delivery_method, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11) RETURNING *`,
    [id, businessId, product.id, product.name, product.type, data.customerId, qty, sellingPrice, data.status || "Pending payment", deliveryMethod, dueDate]
  );
  await logEvent(businessId, isQuote ? "quote_created" : "order_created", `${product.name} x ${qty}`);
  return toOrderJson(rows[0]);
}

// Turns a Quote into a real order - this is the moment stock actually gets
// reserved and the plan's order limit actually gets checked, since a quote
// itself was neither.
async function convertQuoteToOrder(businessId, id) {
  const { rows } = await query("SELECT * FROM orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Order not found");
  if (current.status !== "Quote") throw new OrderError("This order is not a quote");

  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status != 'Quote'", [businessId]);
  const limit = orderLimitFor(effectivePlan(businessRows[0]));
  if (countRows[0].n >= limit) throw new OrderError("Order limit reached for the current plan");

  const { rows: productRows } = await query(
    "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *",
    [current.qty, current.product_id]
  );
  if (!productRows[0]) throw new OrderError("Not enough stock to convert this quote");

  const { rows: updated } = await query("UPDATE orders SET status='Pending payment' WHERE id=$1 RETURNING *", [id]);
  await logEvent(businessId, "quote_converted", current.product_name);
  return toOrderJson(updated[0]);
}

async function updateOrder(businessId, id, changes) {
  const { rows } = await query("SELECT * FROM orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Order not found");

  if (changes.markPaid) {
    const { rows: productRows } = await query("SELECT * FROM products WHERE id = $1", [current.product_id]);
    const delivered = productRows[0]?.type === "Digital product" ? true : !!current.delivered;
    const { rows: updated } = await query("UPDATE orders SET status='Paid', delivered=$1 WHERE id=$2 RETURNING *", [
      delivered,
      id,
    ]);
    await logEvent(businessId, "order_paid", current.product_name);
    return toOrderJson(updated[0]);
  }
  if (changes.deliver) {
    const newStatus = current.status === "Pending payment" ? "Paid" : current.status;
    const { rows: updated } = await query("UPDATE orders SET status=$1, delivered=true WHERE id=$2 RETURNING *", [
      newStatus,
      id,
    ]);
    await logEvent(businessId, "digital_delivered", current.product_name);
    return toOrderJson(updated[0]);
  }
  if (changes.refund) {
    if (current.status === "Refunded") throw new OrderError("This order is already refunded");
    if (changes.restock) await query("UPDATE products SET stock = stock + $1 WHERE id = $2", [current.qty, current.product_id]);
    const { rows: updated } = await query("UPDATE orders SET status='Refunded' WHERE id=$1 RETURNING *", [id]);
    await logEvent(businessId, "order_refunded", `${current.product_name}${changes.restock ? " (restocked)" : ""}`);
    return toOrderJson(updated[0]);
  }
  const status = changes.status ?? current.status;
  const delivered = changes.delivered ?? current.delivered;
  const { rows: updated } = await query("UPDATE orders SET status=$1, delivered=$2 WHERE id=$3 RETURNING *", [
    status,
    delivered,
    id,
  ]);
  return toOrderJson(updated[0]);
}

async function deleteOrder(businessId, id) {
  await query("DELETE FROM orders WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- Reset / demo data -----------------------------------------------------

async function resetData(businessId) {
  await query("DELETE FROM products WHERE business_id = $1", [businessId]);
  await query("DELETE FROM customers WHERE business_id = $1", [businessId]);
  await query("DELETE FROM orders WHERE business_id = $1", [businessId]);
  await query("DELETE FROM events WHERE business_id = $1", [businessId]);
}

async function loadDemoData(businessId) {
  await resetData(businessId);
  const p1 = await createProduct(businessId, { name: "Glow Body Cream", price: 8500, stock: 12, category: "Beauty", type: "Product" });
  await createProduct(businessId, { name: "Mini Handbag", price: 12000, stock: 4, category: "Fashion", type: "Product" });
  await createProduct(businessId, { name: "Wireless Earbuds", price: 18500, stock: 8, category: "Gadgets", type: "Product" });
  const c1 = await createCustomer(businessId, { name: "Amina Bello", phone: "2348012345678", location: "Lagos" });
  await createCustomer(businessId, { name: "Chidi Okafor", phone: "2348098765432", location: "Abuja" });
  const order = await createOrder(businessId, { productId: p1.id, customerId: c1.id, qty: 2, status: "Paid" });
  await updateOrder(businessId, order.id, { markPaid: true });
}

// --- Payments ---------------------------------------------------------------

async function recordPayment({ businessId, provider, reference, plan, billingCycle, amount, status, rawPayload }) {
  const { rows: existing } = await query("SELECT id FROM payments WHERE reference = $1", [reference]);
  if (existing.length) return false; // already processed
  await query(
    `INSERT INTO payments (id, business_id, provider, reference, plan, billing_cycle, amount, status, raw_payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid("pay"), businessId, provider, reference, plan, billingCycle, amount, status, typeof rawPayload === "string" ? rawPayload : JSON.stringify(rawPayload || {})]
  );
  return true;
}

async function listPayments(businessId) {
  const { rows } = await query("SELECT * FROM payments WHERE business_id = $1 ORDER BY created_at DESC LIMIT 50", [businessId]);
  return rows.map(toPaymentJson);
}

async function getPaymentByReference(reference) {
  const { rows } = await query("SELECT * FROM payments WHERE reference = $1", [reference]);
  return rows[0] ? toPaymentJson(rows[0]) : null;
}

// --- Founding Members waitlist (pre-launch growth capture) -----------------
// Deliberately separate from the real business/auth flow - signup.html
// already creates a working account today. This just captures a lead plus a
// shareable referral code for the founding-member growth program.

function toWaitlistJson(w) {
  return {
    id: w.id,
    businessName: w.business_name,
    ownerName: w.owner_name,
    email: w.email,
    referralCode: w.referral_code,
    readinessScore: w.readiness_score,
    createdAt: w.created_at,
  };
}

async function uniqueReferralCode() {
  for (let i = 0; i < 20; i++) {
    const candidate = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { rows } = await query("SELECT 1 FROM waitlist WHERE referral_code = $1", [candidate]);
    if (!rows.length) return candidate;
  }
  return Date.now().toString(36).toUpperCase();
}

async function createWaitlistEntry(data) {
  const businessName = requireString(data.businessName, "Business name");
  const ownerName = requireString(data.ownerName, "Owner name");
  const email = requireString(data.email, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new OrderError("Enter a valid email address");
  const { rows: existing } = await query("SELECT 1 FROM waitlist WHERE lower(email) = $1", [email]);
  if (existing.length) throw new OrderError("This email is already on the waitlist");
  const referralCode = await uniqueReferralCode();
  // Accepts both this project's original field names and the landing page
  // template's shorter ones (challenge/readinessScore/referredBy) so the
  // template's own JS doesn't need reshaping to match the API.
  const currentChallenges = data.currentChallenges || data.challenge || "";
  const referredByCode = data.referredByCode || data.referredBy || "";
  const readinessScoreRaw = data.readinessScore;
  const readinessScore = readinessScoreRaw === null || readinessScoreRaw === undefined || readinessScoreRaw === "" ? null : Math.round(Number(readinessScoreRaw));
  const { rows } = await query(
    `INSERT INTO waitlist (business_name, owner_name, email, phone, country, state, business_category, business_size, years_in_business, current_challenges, referral_code, referred_by_code, newsletter_opt_in, readiness_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [
      businessName,
      ownerName,
      email,
      data.phone || "",
      data.country || "",
      data.state || "",
      data.businessCategory || "",
      data.businessSize || "",
      data.yearsInBusiness || "",
      currentChallenges,
      referralCode,
      referredByCode,
      !!data.newsletterOptIn,
      Number.isFinite(readinessScore) ? readinessScore : null,
    ]
  );
  return toWaitlistJson(rows[0]);
}

async function getWaitlistStats() {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total,
      COUNT(DISTINCT NULLIF(country, ''))::int AS countries,
      COUNT(DISTINCT NULLIF(business_category, ''))::int AS categories
     FROM waitlist`
  );
  return { total: rows[0].total, countries: rows[0].countries, categories: rows[0].categories };
}

// --- Top-of-funnel analytics -------------------------------------------------

const ALLOWED_EVENT_TYPES = ["landing_view", "signup_completed", "storefront_view", "demo_started", "assessment_completed"];

async function trackEvent({ eventType, path, sessionId, meta }) {
  if (!ALLOWED_EVENT_TYPES.includes(eventType)) return; // silently drop unknown types - not user-facing, no error needed
  await query(
    "INSERT INTO analytics_events (event_type, path, session_id, meta) VALUES ($1,$2,$3,$4)",
    [eventType, String(path || "").slice(0, 200), String(sessionId || "").slice(0, 100), JSON.stringify(meta || {})]
  );
}

// Powers the platform-admin Analytics view - counts per event type, plus a
// daily trend for the last 30 days so growth/drop-off is visible at a
// glance without needing a separate charting tool.
async function getAnalyticsSummary() {
  const [totals, daily] = await Promise.all([
    query("SELECT event_type, COUNT(*)::int AS n FROM analytics_events GROUP BY event_type"),
    query(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, event_type, COUNT(*)::int AS n
       FROM analytics_events WHERE created_at > now() - interval '30 days'
       GROUP BY 1, 2 ORDER BY 1 DESC`
    ),
  ]);
  return {
    totals: totals.rows.map((r) => ({ eventType: r.event_type, count: r.n })),
    daily: daily.rows.map((r) => ({ day: r.day, eventType: r.event_type, count: r.n })),
  };
}

// --- Audit log ("who did what, when") --------------------------------------

async function recordAuditLog({ userId, businessId, method, path, statusCode }) {
  await query(
    "INSERT INTO audit_log (user_id, business_id, method, path, status_code) VALUES ($1,$2,$3,$4,$5)",
    [userId, businessId, method, path, statusCode]
  );
}

// Business-scoped view (Settings > Activity Log) - joins business_members
// to show an email instead of a bare user_id where the actor is still a
// member of this business (a removed staff member's past actions still
// show up, just without an email attached).
async function listAuditLog(businessId, limit = 50) {
  const { rows } = await query(
    `SELECT a.*, m.email FROM audit_log a
     LEFT JOIN business_members m ON m.user_id = a.user_id AND m.business_id = a.business_id
     WHERE a.business_id = $1 ORDER BY a.created_at DESC LIMIT $2`,
    [businessId, limit]
  );
  return rows.map((r) => ({ id: r.id, email: r.email || "", method: r.method, path: r.path, statusCode: r.status_code, createdAt: r.created_at }));
}

// Cross-tenant view (platform admin) - includes the business name so a
// platform operator can tell which tenant an action belongs to.
async function listAllAuditLog(limit = 100) {
  const { rows } = await query(
    `SELECT a.*, b.name AS business_name FROM audit_log a
     LEFT JOIN businesses b ON b.id = a.business_id
     ORDER BY a.created_at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ id: r.id, businessName: r.business_name || "", method: r.method, path: r.path, statusCode: r.status_code, createdAt: r.created_at }));
}

// --- Platform-admin (cross-tenant) -------------------------------------------

// Everything under a business (products/customers/orders/branches/staff/
// invites/usage counters/payments) cascades via "on delete cascade" FKs -
// this is deliberately just the one statement. Returns the member user_ids
// first so the caller (server/index.js, which has the Supabase admin
// client) can optionally delete the actual auth accounts too - db.js has
// no Supabase Auth access of its own.
async function deleteBusiness(businessId) {
  const { rows: members } = await query("SELECT user_id FROM business_members WHERE business_id = $1", [businessId]);
  await query("DELETE FROM businesses WHERE id = $1", [businessId]);
  return members.map((m) => m.user_id);
}

async function listAllBusinesses() {
  const month = currentMonth();
  const { rows } = await query(
    `SELECT b.*,
      (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) AS order_count,
      (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customer_count,
      COALESCE((SELECT count FROM ai_usage a WHERE a.business_id = b.id AND a.month = $1), 0) AS ai_used,
      COALESCE((SELECT COUNT(*)::int FROM addon_purchases ap WHERE ap.business_id = b.id AND ap.type = 'ai_credits' AND ap.month = $1), 0) AS ai_addon_count
    FROM businesses b ORDER BY b.created_at DESC`,
    [month]
  );
  return rows.map((b) => {
    const baseLimit = aiLimitFor(effectivePlan(b));
    const aiLimit = baseLimit === Infinity ? null : baseLimit + Number(b.ai_addon_count) * ADDON_AI_CREDITS;
    return { ...toBusinessJson(b), orderCount: Number(b.order_count), customerCount: Number(b.customer_count), aiUsed: Number(b.ai_used), aiLimit };
  });
}

async function listAllPayments() {
  const { rows } = await query(`
    SELECT p.*, b.name AS business_name
    FROM payments p JOIN businesses b ON b.id = p.business_id
    ORDER BY p.created_at DESC LIMIT 100
  `);
  return rows.map(toPaymentJson);
}

module.exports = {
  OrderError,
  healthCheck,
  getMembership,
  createBusiness,
  getBusiness,
  getState,
  updateBusiness,
  activatePlan,
  getOrCreateReferralCode,
  rewardReferrerIfEligible,
  downgradeToStarter,
  updateStorefrontSettings,
  getStorefront,
  updatePaymentSettings,
  saveSubaccountDetails,
  checkoutStorefront,
  listCoupons,
  createCoupon,
  setCouponActive,
  deleteCoupon,
  validateCoupon,
  getOrderForPaymentLink,
  listLogisticsProviders,
  createLogisticsProvider,
  deleteLogisticsProvider,
  getOwner,
  updateOwner,
  getPlatformSettings,
  updatePlatformSettings,
  getPublicSocialLinks,
  updatePricingOverrides,
  createProduct,
  updateProduct,
  deleteProduct,
  createCustomer,
  deleteCustomer,
  createOrder,
  convertQuoteToOrder,
  updateOrder,
  deleteOrder,
  resetData,
  loadDemoData,
  recordPayment,
  listPayments,
  getPaymentByReference,
  listAllBusinesses,
  listAllPayments,
  createWaitlistEntry,
  getWaitlistStats,
  trackEvent,
  getAnalyticsSummary,
  recordAuditLog,
  listAuditLog,
  listAllAuditLog,
  deleteBusiness,
  listStaff,
  inviteStaff,
  revokeInvite,
  removeStaff,
  effectiveStaffLimit,
  getAiUsage,
  incrementAiUsage,
  effectiveAiLimit,
  getReceiptUsage,
  incrementReceiptUsage,
  listBranches,
  createBranch,
  deleteBranch,
  effectiveBranchLimit,
  getReports,
  recordAddonPurchase,
};
