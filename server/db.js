const crypto = require("crypto");
const { Pool, types } = require("pg");
const {
  orderLimitFor, productLimitFor, staffLimitFor, aiLimitFor, branchLimitFor, receiptLimitFor, storefrontEnabledFor,
  whatsappLimitFor, expenseLimitFor, plHistoryDaysFor, supplierLimitFor, poLimitFor, loyaltyAvailableFor, batchLimitFor, posLimitFor,
  ADDON_AI_CREDITS, ADDON_WHATSAPP_CREDITS, FOUNDER_PROMO_CODE, FOUNDER_PROMO_DEADLINE,
} = require("./pricing");
const { ValidationError, requireString, requireNumber } = require("./validate");
const { isValidCurrency } = require("./currencies");

// By default node-postgres parses `date` columns (OID 1082) into a JS Date
// at local-server-midnight, which shifts to the previous/next day once
// serialized to JSON on any server not running in UTC (expense_date /
// reconciliation_date are the only `date`-typed columns in the schema).
// Returning the raw "YYYY-MM-DD" string instead sidesteps that entirely.
types.setTypeParser(1082, (val) => val);

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
    currency: b.currency || "NGN",
    loyaltyEnabled: !!b.loyalty_enabled,
    loyaltyEarnRate: Number(b.loyalty_earn_rate ?? 1),
    loyaltyRedeemValue: Number(b.loyalty_redeem_value ?? 1),
    autoReminderEnabled: !!b.auto_reminder_enabled,
    autoReminderDaysAfter: Number(b.auto_reminder_days_after ?? 2),
    shipbubbleSenderAddressCode: b.shipbubble_sender_address_code || null,
    regType: b.reg_type || null,
    regStatus: b.reg_status || "not_started",
    regNote: b.reg_note || "",
    tin: b.tin || "",
    scumlStatus: b.scuml_status || "not_started",
    founderDiscount: !!b.founder_discount,
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
    barcode: p.barcode || "",
    weight: p.weight != null ? Number(p.weight) : null,
    showInStorefront: p.show_in_storefront !== false,
    costPrice: p.cost_price != null ? Number(p.cost_price) : null,
  };
}
function toCustomerJson(c) {
  return { id: c.id, name: c.name, phone: c.phone, email: c.email, location: c.location, loyaltyPoints: Number(c.loyalty_points ?? 0), walletBalance: Number(c.wallet_balance ?? 0), createdAt: c.created_at };
}
// o.items, when present, is the raw order_items rows (or the in-memory
// lineItems createOrder just inserted) for this order - real multi-item
// orders always have at least one. Legacy top-level productId/productName/
// qty/price fields are kept and derived from the FIRST item (falling back
// to the orders row's own legacy columns for pre-migration orders that
// somehow have zero order_items) purely so any code that hasn't been
// updated to read `items` yet still shows something reasonable rather than
// breaking outright.
function toOrderJson(o) {
  const items = (o.items || []).map((i) => ({
    productId: i.product_id ?? i.productId,
    productName: i.product_name ?? i.productName,
    productType: i.product_type ?? i.productType,
    qty: i.qty,
    price: Number(i.price),
  }));
  const first = items[0] || { productId: o.product_id, productName: o.product_name, productType: o.product_type, qty: o.qty, price: Number(o.price || 0) };
  return {
    id: o.id,
    items,
    itemsSummary: items.length > 1 ? `${items[0].productName} +${items.length - 1} more` : first.productName,
    subtotal: Number(o.subtotal ?? first.price * (first.qty || 1)),
    productId: first.productId,
    productName: first.productName,
    productType: first.productType,
    customerId: o.customer_id,
    qty: first.qty,
    price: first.price,
    status: o.status,
    createdAt: o.created_at,
    delivered: !!o.delivered,
    deliveryMethod: o.delivery_method,
    deliveryFee: Number(o.delivery_fee || 0),
    dueDate: o.due_date,
    shipbubbleOrderId: o.shipbubble_order_id || null,
    shipbubbleTrackingUrl: o.shipbubble_tracking_url || null,
    shipbubbleStatus: o.shipbubble_status || null,
    shipbubbleCourierName: o.shipbubble_courier_name || null,
    shipbubbleTrackingCode: o.shipbubble_tracking_code || null,
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
        `INSERT INTO business_members (business_id, user_id, email, role) VALUES ($1, $2, $3, $4)`,
        [invite.business_id, userId, email, invite.role]
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
    const currency = isValidCurrency(fields.currency) ? fields.currency : "NGN";
    const { rows } = await client.query(
      `INSERT INTO businesses (name, phone, slug, referred_by_business_id, currency) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [businessName, fields.businessPhone || "", slug, referredByBusinessId, currency]
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
  const itemsByOrder = await loadItemsForOrders(orders.rows.map((o) => o.id));
  return {
    business: toBusinessJson(business.rows[0]),
    products: products.rows.map(toProductJson),
    customers: customers.rows.map(toCustomerJson),
    orders: orders.rows.map((o) => toOrderJson({ ...o, items: itemsByOrder[o.id] || [] })),
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
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, SUM(subtotal) AS revenue
       FROM orders WHERE business_id = $1 AND status IN ('Paid', 'Delivered')
       GROUP BY 1 ORDER BY 1 DESC LIMIT $2`,
      [businessId, months]
    ),
    // Quotes aren't real sales yet and Refunded orders no longer are -
    // excluded from both so "top products/customers" reflects actual
    // committed business, not estimates or reversed sales. Queries
    // order_items directly (not orders) since this is inherently about
    // individual products sold across potentially multi-item orders.
    includeTop
      ? query(
          `SELECT oi.product_name, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue
           FROM order_items oi JOIN orders o ON o.id = oi.order_id
           WHERE o.business_id = $1 AND o.status NOT IN ('Quote', 'Refunded')
           GROUP BY oi.product_name ORDER BY units DESC LIMIT $2`,
          [businessId, topN]
        )
      : Promise.resolve({ rows: [] }),
    includeTop
      ? query(
          `SELECT c.name, SUM(o.subtotal) AS spend, COUNT(*) AS orders
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

// Day-bucketed series backing the Reports tab's chart (revenue, order
// count, and net profit over a date range) - same revenue/expense sources
// as getProfitAndLoss, just grouped per day instead of summed once.
async function getReportsChart(businessId, { from, to } = {}) {
  const rangeFrom = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rangeTo = to || new Date().toISOString().slice(0, 10);
  const [revenueRows, expenseRows] = await Promise.all([
    query(
      `SELECT created_at::date AS day, COALESCE(SUM(subtotal), 0) AS revenue, COUNT(*) AS orders
       FROM orders WHERE business_id = $1 AND status IN ('Paid', 'Delivered') AND created_at::date >= $2 AND created_at::date <= $3
       GROUP BY 1`,
      [businessId, rangeFrom, rangeTo]
    ),
    query(
      `SELECT expense_date AS day, COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY 1`,
      [businessId, rangeFrom, rangeTo]
    ),
  ]);
  const revenueByDay = {}, ordersByDay = {}, expensesByDay = {};
  revenueRows.rows.forEach((r) => { revenueByDay[r.day] = Number(r.revenue); ordersByDay[r.day] = Number(r.orders); });
  expenseRows.rows.forEach((r) => { expensesByDay[r.day] = Number(r.total); });
  const days = [];
  for (let d = new Date(rangeFrom + "T00:00:00Z"); d <= new Date(rangeTo + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }
  return days.map((day) => ({
    date: day,
    revenue: revenueByDay[day] || 0,
    orders: ordersByDay[day] || 0,
    profit: (revenueByDay[day] || 0) - (expensesByDay[day] || 0),
  }));
}

// --- Expenses, cashbook, P&L, daily reconciliation ---------------------

const EXPENSE_CATEGORIES = [
  "Inventory & Stock",
  "Rent",
  "Salaries & Wages",
  "Transport & Logistics",
  "Utilities",
  "Marketing & Ads",
  "Fees & Charges",
  "Equipment",
  "Other",
];

function toExpenseJson(e) {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
    date: e.expense_date,
    createdAt: e.created_at,
  };
}

function normalizeDateInput(value) {
  // Accepts "YYYY-MM-DD" (from a date <input>) or an ISO timestamp; falls
  // back to today if missing/invalid rather than erroring, since a date is
  // always optional in these forms (defaults to "now").
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

async function createExpense(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = expenseLimitFor(effectivePlan(businessRows[0]));
  if (limit !== Infinity) {
    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS n FROM expenses WHERE business_id = $1 AND created_at >= date_trunc('month', now())",
      [businessId]
    );
    if (countRows[0].n >= limit) throw new OrderError("Expense logging limit reached for the current plan this month");
  }
  const category = EXPENSE_CATEGORIES.includes(data.category) ? data.category : "Other";
  const description = requireString(data.description, "Description");
  const amount = requireNumber(data.amount, "Amount", { min: 0.01 });
  const expenseDate = normalizeDateInput(data.date);
  const { rows } = await query(
    `INSERT INTO expenses (business_id, category, description, amount, expense_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [businessId, category, description, amount, expenseDate]
  );
  await logEvent(businessId, "expense_logged", `${category}: ${description} (${amount})`);
  return toExpenseJson(rows[0]);
}

async function listExpenses(businessId, { from, to } = {}) {
  const conditions = ["business_id = $1"];
  const params = [businessId];
  if (from) {
    params.push(from);
    conditions.push(`expense_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`expense_date <= $${params.length}`);
  }
  const { rows } = await query(
    `SELECT * FROM expenses WHERE ${conditions.join(" AND ")} ORDER BY expense_date DESC, created_at DESC`,
    params
  );
  return rows.map(toExpenseJson);
}

async function deleteExpense(businessId, id) {
  const { rows } = await query("DELETE FROM expenses WHERE id = $1 AND business_id = $2 RETURNING id", [id, businessId]);
  if (!rows[0]) throw new OrderError("Expense not found");
}

function toFeedbackJson(f) {
  return { id: f.id, message: f.message, rating: f.rating, createdAt: f.created_at };
}

async function createFeedback(businessId, data) {
  const message = requireString(data.message, "Feedback message");
  const rating = data.rating !== undefined && data.rating !== null && data.rating !== "" ? requireNumber(data.rating, "Rating", { min: 1, max: 5, integer: true }) : null;
  const { rows } = await query(
    `INSERT INTO feedback (business_id, message, rating) VALUES ($1, $2, $3) RETURNING *`,
    [businessId, message, rating]
  );
  await logEvent(businessId, "feedback_submitted", message.slice(0, 80));
  return toFeedbackJson(rows[0]);
}

async function listFeedback(businessId) {
  const { rows } = await query("SELECT * FROM feedback WHERE business_id = $1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toFeedbackJson);
}

// Combined cash-in (paid/delivered orders) + cash-out (expenses) ledger,
// sorted oldest-first with a running balance - a simple cashbook view, not a
// full double-entry ledger. Defaults to the last 30 days if no range given,
// since an unbounded query could return years of orders for an old business.
// Clips a requested (or default) "from" date to how far back the business's
// plan is allowed to look (plHistoryDaysFor) - the requester can ask for
// more, they just can't get more than their plan's history window.
async function clipHistoryFrom(businessId, requestedFrom) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const days = plHistoryDaysFor(effectivePlan(businessRows[0]));
  if (days === Infinity) return requestedFrom;
  const earliestAllowed = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return !requestedFrom || requestedFrom < earliestAllowed ? earliestAllowed : requestedFrom;
}

async function getCashbook(businessId, { from, to } = {}) {
  const rangeFrom = await clipHistoryFrom(businessId, from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const rangeTo = to || new Date().toISOString().slice(0, 10);
  const [orderRows, expenseRows] = await Promise.all([
    query(
      `SELECT o.id, o.created_at::date AS date, o.subtotal AS amount,
         (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.created_at ASC LIMIT 1) AS first_item_name
       FROM orders o WHERE o.business_id = $1 AND o.status IN ('Paid', 'Delivered')
         AND o.created_at::date >= $2 AND o.created_at::date <= $3`,
      [businessId, rangeFrom, rangeTo]
    ),
    query(
      `SELECT id, expense_date AS date, category, description, amount FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3`,
      [businessId, rangeFrom, rangeTo]
    ),
  ]);
  const entries = [
    ...orderRows.rows.map((o) => ({
      date: o.date,
      type: "in",
      description: Number(o.item_count) > 1 ? `${o.first_item_name} +${Number(o.item_count) - 1} more` : o.first_item_name || "Order",
      amount: Number(o.amount),
      refId: o.id,
    })),
    ...expenseRows.rows.map((e) => ({
      date: e.date,
      type: "out",
      description: `${e.category}: ${e.description}`,
      amount: Number(e.amount),
      refId: e.id,
    })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let balance = 0;
  const withBalance = entries.map((e) => {
    balance += e.type === "in" ? e.amount : -e.amount;
    return { ...e, balance };
  });
  return {
    from: rangeFrom,
    to: rangeTo,
    entries: withBalance,
    totalIn: entries.filter((e) => e.type === "in").reduce((s, e) => s + e.amount, 0),
    totalOut: entries.filter((e) => e.type === "out").reduce((s, e) => s + e.amount, 0),
  };
}

// Revenue minus expenses for the range, with an expense-by-category
// breakdown. No cost-of-goods-sold line - this app doesn't track a per-unit
// cost price today, so "net profit" here is revenue minus logged expenses,
// not a true gross-margin P&L.
async function getProfitAndLoss(businessId, { from, to } = {}) {
  const rangeFrom = await clipHistoryFrom(businessId, from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const rangeTo = to || new Date().toISOString().slice(0, 10);
  const [revenueRows, expenseRows, categoryRows, cogsRows] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(subtotal), 0) AS revenue FROM orders
       WHERE business_id = $1 AND status IN ('Paid', 'Delivered') AND created_at::date >= $2 AND created_at::date <= $3`,
      [businessId, rangeFrom, rangeTo]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3`,
      [businessId, rangeFrom, rangeTo]
    ),
    query(
      `SELECT category, SUM(amount) AS total FROM expenses
       WHERE business_id = $1 AND expense_date >= $2 AND expense_date <= $3
       GROUP BY category ORDER BY total DESC`,
      [businessId, rangeFrom, rangeTo]
    ),
    // Cost of goods sold - each line item's cost_price is snapshotted at
    // sale time (see createOrder), so this stays accurate even if a
    // product's cost changes later. Separate from expensesTotal, which is
    // operating cost (rent, fuel, etc.), not product cost.
    query(
      `SELECT COALESCE(SUM(oi.cost_price * oi.qty), 0) AS total FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.business_id = $1 AND o.status IN ('Paid', 'Delivered') AND o.created_at::date >= $2 AND o.created_at::date <= $3`,
      [businessId, rangeFrom, rangeTo]
    ),
  ]);
  const revenue = Number(revenueRows.rows[0].revenue);
  const expensesTotal = Number(expenseRows.rows[0].total);
  const costOfGoodsSold = Number(cogsRows.rows[0].total);
  return {
    from: rangeFrom,
    to: rangeTo,
    revenue,
    expensesTotal,
    netProfit: revenue - expensesTotal,
    costOfGoodsSold,
    grossProfit: revenue - costOfGoodsSold,
    expensesByCategory: categoryRows.rows.map((r) => ({ category: r.category, total: Number(r.total) })),
  };
}

function toReconciliationJson(r) {
  return {
    id: r.id,
    date: r.reconciliation_date,
    expectedCash: Number(r.expected_cash),
    countedCash: Number(r.counted_cash),
    variance: Number(r.variance),
    notes: r.notes,
    createdAt: r.created_at,
  };
}

// expected_cash is a snapshot (paid-order revenue minus expenses for that
// single day) computed once at save time - see the schema.sql comment for
// why this deliberately isn't recalculated on read.
async function upsertReconciliation(businessId, data) {
  const date = normalizeDateInput(data.date);
  const countedCash = requireNumber(data.countedCash, "Counted cash", { min: 0 });
  const notes = (data.notes || "").toString().slice(0, 2000);
  const [revenueRows, expenseRows] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(subtotal), 0) AS revenue FROM orders
       WHERE business_id = $1 AND status IN ('Paid', 'Delivered') AND created_at::date = $2`,
      [businessId, date]
    ),
    query(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE business_id = $1 AND expense_date = $2`, [businessId, date]),
  ]);
  const expectedCash = Number(revenueRows.rows[0].revenue) - Number(expenseRows.rows[0].total);
  const variance = countedCash - expectedCash;
  const { rows } = await query(
    `INSERT INTO cash_reconciliations (business_id, reconciliation_date, expected_cash, counted_cash, variance, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (business_id, reconciliation_date)
     DO UPDATE SET counted_cash = $4, expected_cash = $3, variance = $5, notes = $6
     RETURNING *`,
    [businessId, date, expectedCash, countedCash, variance, notes]
  );
  await logEvent(businessId, "cash_reconciled", `${date}: counted ${countedCash}, expected ${expectedCash} (variance ${variance})`);
  return toReconciliationJson(rows[0]);
}

async function listReconciliations(businessId, limit = 30) {
  const { rows } = await query(
    `SELECT * FROM cash_reconciliations WHERE business_id = $1 ORDER BY reconciliation_date DESC LIMIT $2`,
    [businessId, limit]
  );
  return rows.map(toReconciliationJson);
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
  if (fields.loyaltyEnabled === true && !current.loyalty_enabled && !loyaltyAvailableFor(effectivePlan(current))) {
    throw new OrderError("Loyalty & wallet is available on the Growth plan and above");
  }
  const merged = {
    name: fields.businessName ?? current.name,
    phone: fields.businessPhone ?? current.phone,
    logo: fields.businessLogo ?? current.logo,
    address: fields.businessAddress ?? current.address,
    payment_provider: fields.paymentProvider ?? current.payment_provider,
    payment_link: fields.paymentLink ?? current.payment_link,
    payment_details: fields.paymentDetails ?? current.payment_details,
    currency: isValidCurrency(fields.currency) ? fields.currency : current.currency,
    loyalty_enabled: fields.loyaltyEnabled ?? current.loyalty_enabled,
    loyalty_earn_rate: fields.loyaltyEarnRate !== undefined ? requireNumber(fields.loyaltyEarnRate, "Loyalty earn rate", { min: 0 }) : current.loyalty_earn_rate,
    loyalty_redeem_value: fields.loyaltyRedeemValue !== undefined ? requireNumber(fields.loyaltyRedeemValue, "Loyalty redeem value", { min: 0 }) : current.loyalty_redeem_value,
    auto_reminder_enabled: fields.autoReminderEnabled ?? current.auto_reminder_enabled,
    auto_reminder_days_after: fields.autoReminderDaysAfter !== undefined ? requireNumber(fields.autoReminderDaysAfter, "Days after due", { min: 1, max: 30, integer: true }) : current.auto_reminder_days_after,
  };
  const { rows: updated } = await query(
    `UPDATE businesses SET name=$1, phone=$2, logo=$3, address=$4, payment_provider=$5, payment_link=$6,
       payment_details=$7, currency=$8, loyalty_enabled=$9, loyalty_earn_rate=$10, loyalty_redeem_value=$11,
       auto_reminder_enabled=$12, auto_reminder_days_after=$13
     WHERE id = $14 RETURNING *`,
    [
      merged.name,
      merged.phone,
      merged.logo,
      merged.address,
      merged.payment_provider,
      merged.payment_link,
      merged.payment_details,
      merged.currency,
      merged.loyalty_enabled,
      merged.loyalty_earn_rate,
      merged.loyalty_redeem_value,
      merged.auto_reminder_enabled,
      merged.auto_reminder_days_after,
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

// The registration package bundles a few months of Pro as a bonus - Pro
// (not just Growth) because Calendar/Tax Tools require Pro, and the whole
// point is the business can actually use them right after registering.
// Only applied if the business is on Starter or Growth, so it can never
// downgrade or shorten a plan that's already equal or better than Pro.
async function grantBonusProMonths(businessId, months) {
  const business = await getBusiness(businessId);
  if (!business || !["starter", "growth"].includes(business.plan)) return;
  const expires = new Date();
  expires.setMonth(expires.getMonth() + months);
  await setPlan(businessId, "pro", "monthly", expires.toISOString());
  await logEvent(businessId, "plan_upgraded", `pro (${months}mo bonus - registration package)`);
}

// The code itself stops being redeemable after FOUNDER_PROMO_DEADLINE, but
// a business that already redeemed keeps the discount for life - the flag
// on businesses, not the code's validity window, is what payments check.
async function redeemFounderCode(businessId, code) {
  const submitted = requireString(code, "Promo code").trim().toUpperCase();
  if (submitted !== FOUNDER_PROMO_CODE) throw new OrderError("Invalid promo code");
  if (Date.now() > new Date(FOUNDER_PROMO_DEADLINE).getTime()) throw new OrderError("This promo code has expired");
  const business = await getBusiness(businessId);
  if (!business) throw new OrderError("Business not found");
  if (business.founderDiscount) return business;
  await query("UPDATE businesses SET founder_discount = true WHERE id = $1", [businessId]);
  await logEvent(businessId, "founder_discount_redeemed", "50% off for life");
  return getBusiness(businessId);
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

// --- Public storefront (all plans, including free Starter) -----------------

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
    "SELECT * FROM products WHERE business_id = $1 AND show_in_storefront ORDER BY created_at DESC",
    [business.id]
  );
  const { rows: completedRows } = await query(
    "SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status IN ('Paid','Delivered')",
    [business.id]
  );
  // Storefront customers can only pick SellersPoint Logistics if the
  // platform admin has it enabled AND this specific business has set up a
  // pickup address (same two gates the dashboard's order form checks).
  const logistics = await getRawLogisticsSettings();
  const shippingAvailable = logistics.enabled && !!business.shipbubble_sender_address_code;
  // Shown client-side so the displayed total (courier quote + markup)
  // matches exactly what checkoutStorefront actually charges - the
  // storefront never sees ShipBubble credentials, just this one number.
  const shippingMarkup = shippingAvailable ? Number(logistics.flatFee || 0) : 0;
  return {
    businessName: business.name,
    businessLogo: business.logo,
    businessBanner: business.storefront_banner,
    businessPhone: business.phone,
    businessAddress: business.address,
    socialLinks: business.social_links || {},
    currency: business.currency || "NGN",
    memberSince: business.created_at,
    completedOrders: completedRows[0].n,
    whyBuyText: business.why_buy_text || "",
    onlinePaymentEnabled: business.payment_mode === "paystack" && !!business.paystack_subaccount_code,
    shippingAvailable,
    shippingMarkup,
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
async function checkoutStorefront(slug, { items, buyerName, buyerPhone, buyerEmail, buyerLocation, couponCode, deliveryMethod, shipbubbleRequestToken, shipbubbleServiceCode, shipbubbleCourierId, shipbubbleQuotedCost }) {
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

  const customer = await findOrCreateCustomerByPhone(business.id, { name, phone: buyerPhone || "", email, location: buyerLocation || "" });
  // One multi-item order per storefront purchase (not one order per cart
  // product) - a customer buying several products now gets a single
  // order/receipt/WhatsApp confirmation instead of N of each. Delivery/
  // shipping fields (if the buyer picked SellersPoint Logistics and already
  // got a quote via getShipbubbleQuotePublic) pass straight into
  // createOrder, same as the dashboard's pre-payment quote flow.
  const order = await createOrder(business.id, {
    items, customerId: customer.id, status: "Pending payment", source: "storefront",
    deliveryMethod, shipbubbleRequestToken, shipbubbleServiceCode, shipbubbleCourierId, shipbubbleQuotedCost,
  });
  let total = Number(order.subtotal) + Number(order.deliveryFee || 0);
  // Re-validate server-side rather than trusting a client-supplied discount -
  // the storefront's "Apply" button is just a preview.
  let couponId = null;
  if (couponCode) {
    const result = await validateCoupon(slug, couponCode, total);
    couponId = result.couponId;
    total = result.total;
  }
  if (couponId) await redeemCoupon(couponId);
  return { businessId: business.id, subaccountCode: business.paystack_subaccount_code, absorbFees: !!business.absorb_fees, plan: effectivePlan(business), orderIds: [order.id], total, email };
}

// Looks up a single business-owned order (created directly in the
// dashboard, not through the public storefront cart) plus its customer's
// email, for generating an ad-hoc Paystack payment link to send over
// WhatsApp - separate from checkoutStorefront since there's no cart/slug
// involved here, just one existing order.
async function getOrderForPaymentLink(businessId, orderId) {
  const { rows } = await query(
    `SELECT o.id, o.subtotal, o.status, c.email AS customer_email
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
    amountNaira: Number(row.subtotal),
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

// --- SellersPoint Logistics (item 7): admin-controlled fee on the platform-run
// delivery option, alongside a seller's own self/rider arrangements --------

const DEFAULT_LOGISTICS_SETTINGS = { enabled: false, flatFee: 0, percentFee: 0, apiBase: "", apiKey: "" };

async function getRawLogisticsSettings() {
  const { rows } = await query("SELECT logistics_settings FROM platform_settings WHERE id = 1");
  return { ...DEFAULT_LOGISTICS_SETTINGS, ...(rows[0]?.logistics_settings || {}) };
}

// Admin-facing: full settings, but api_key is masked the same way the
// Paystack account number is elsewhere - never round-tripped in full once set.
async function getLogisticsSettingsForAdmin() {
  const settings = await getRawLogisticsSettings();
  return {
    enabled: settings.enabled,
    flatFee: Number(settings.flatFee),
    percentFee: Number(settings.percentFee),
    apiBase: settings.apiBase,
    apiKeySet: !!settings.apiKey,
    apiKeyMasked: settings.apiKey ? "•••• " + settings.apiKey.slice(-4) : "",
  };
}

async function updateLogisticsSettings(fields) {
  const current = await getRawLogisticsSettings();
  const next = {
    enabled: fields.enabled !== undefined ? !!fields.enabled : current.enabled,
    flatFee: fields.flatFee !== undefined ? requireNumber(fields.flatFee, "Flat fee", { min: 0 }) : current.flatFee,
    percentFee: fields.percentFee !== undefined ? requireNumber(fields.percentFee, "Percent fee", { min: 0, max: 100 }) : current.percentFee,
    apiBase: fields.apiBase !== undefined ? String(fields.apiBase).trim() : current.apiBase,
    // Only overwrite the stored key if a new non-empty one was actually
    // submitted - the admin UI never receives the real key back, so leaving
    // the field blank on save must mean "keep the existing key," not "clear it."
    apiKey: fields.apiKey ? String(fields.apiKey).trim() : current.apiKey,
  };
  await query("UPDATE platform_settings SET logistics_settings = $1 WHERE id = 1", [JSON.stringify(next)]);
  return getLogisticsSettingsForAdmin();
}

// Dashboard-facing (any authenticated seller): only what's needed to offer
// and price the option at order-creation time - never the API credentials.
async function getPublicLogisticsInfo() {
  const settings = await getRawLogisticsSettings();
  return { enabled: settings.enabled, flatFee: Number(settings.flatFee), percentFee: Number(settings.percentFee) };
}

function computeLogisticsFee(subtotal, settings) {
  return Math.round(Number(subtotal) * (Number(settings.percentFee) / 100) + Number(settings.flatFee));
}

async function updatePricingOverrides(overrides) {
  const current = await getPlatformSettings();
  const merged = { ...current.pricingOverrides, ...overrides };
  await query("UPDATE platform_settings SET pricing_overrides = $1 WHERE id = 1", [JSON.stringify(merged)]);
  return { ...current, pricingOverrides: merged };
}

// --- Add-on purchases (a-la-carte, on top of any plan) ----------------------

async function recordAddonPurchase(businessId, type) {
  const month = type === "ai_credits" || type === "whatsapp_credits" ? currentMonth() : null;
  await query("INSERT INTO addon_purchases (business_id, type, month) VALUES ($1, $2, $3)", [businessId, type, month]);
}

async function getAddonAiBonus(businessId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'ai_credits' AND month = $2",
    [businessId, currentMonth()]
  );
  return rows[0].n * ADDON_AI_CREDITS;
}

async function getAddonWhatsAppBonus(businessId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'whatsapp_credits' AND month = $2",
    [businessId, currentMonth()]
  );
  return rows[0].n * ADDON_WHATSAPP_CREDITS;
}

async function getAddonSeatBonus(businessId) {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'staff'", [businessId]);
  return rows[0].n;
}

async function getAddonBranchBonus(businessId) {
  const { rows } = await query("SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type = 'branch'", [businessId]);
  return rows[0].n;
}

async function hasPurchasedRegistrationPackage(businessId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM addon_purchases WHERE business_id = $1 AND type IN ('registration_package','bn_registration_package')",
    [businessId]
  );
  return rows[0].n > 0;
}

// --- Staff seats --------------------------------------------------------

function toStaffJson(m) {
  return { userId: m.user_id, email: m.email, role: m.role, createdAt: m.created_at };
}
function toInviteJson(i) {
  return { id: i.id, email: i.email, role: i.role, createdAt: i.created_at };
}

const NON_OWNER_ROLES = ["manager", "sales_staff", "accountant"];

async function listStaff(businessId) {
  const [members, invites] = await Promise.all([
    query("SELECT * FROM business_members WHERE business_id = $1 ORDER BY created_at", [businessId]),
    query("SELECT * FROM business_invites WHERE business_id = $1 ORDER BY created_at", [businessId]),
  ]);
  return {
    owner: members.rows.filter((m) => m.role === "owner").map(toStaffJson)[0] || null,
    staff: members.rows.filter((m) => NON_OWNER_ROLES.includes(m.role)).map(toStaffJson),
    invites: invites.rows.map(toInviteJson),
  };
}

async function effectiveStaffLimit(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const base = staffLimitFor(effectivePlan(businessRows[0]));
  return base === Infinity ? base : base + (await getAddonSeatBonus(businessId));
}

async function inviteStaff(businessId, email, role) {
  const clean = requireString(email, "Email").toLowerCase();
  if (!NON_OWNER_ROLES.includes(role)) throw new OrderError("Role must be manager, sales_staff, or accountant");
  const limit = await effectiveStaffLimit(businessId);
  const { staff } = await listStaff(businessId);
  if (staff.length >= limit) throw new OrderError("Staff seat limit reached for the current plan");
  const existing = await query(
    "SELECT 1 FROM business_members WHERE business_id = $1 AND lower(email) = $2",
    [businessId, clean]
  );
  if (existing.rows.length) throw new OrderError("This person is already on your team");
  await query(
    "INSERT INTO business_invites (business_id, email, role) VALUES ($1, $2, $3) ON CONFLICT (business_id, email) DO UPDATE SET role = excluded.role",
    [businessId, clean, role]
  );
  return listStaff(businessId);
}

async function revokeInvite(businessId, email) {
  await query("DELETE FROM business_invites WHERE business_id = $1 AND lower(email) = lower($2)", [businessId, email]);
  return listStaff(businessId);
}

async function updateStaffRole(businessId, userId, role) {
  if (!NON_OWNER_ROLES.includes(role)) throw new OrderError("Role must be manager, sales_staff, or accountant");
  const { rows } = await query(
    "UPDATE business_members SET role = $1 WHERE business_id = $2 AND user_id = $3 AND role != 'owner' RETURNING *",
    [role, businessId, userId]
  );
  if (!rows[0]) throw new OrderError("Team member not found");
  return listStaff(businessId);
}

async function removeStaff(businessId, userId) {
  await query("DELETE FROM business_members WHERE business_id = $1 AND user_id = $2 AND role != 'owner'", [businessId, userId]);
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

// WhatsApp is metered the same way AI is - a monthly count against a plan
// limit, toppable up via the whatsapp_credits add-on - since it's one of
// only two features here with a real per-use cost (see pricing.js).
async function getWhatsAppUsage(businessId) {
  const { rows } = await query(
    "SELECT COUNT(*)::int AS n FROM whatsapp_messages WHERE business_id = $1 AND direction = 'out' AND created_at >= date_trunc('month', now())",
    [businessId]
  );
  return rows[0].n;
}

async function effectiveWhatsAppLimit(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const base = whatsappLimitFor(effectivePlan(businessRows[0]));
  return base === Infinity ? base : base + (await getAddonWhatsAppBonus(businessId));
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

// Empty string normalizes to null so the partial unique index (which
// excludes null/empty) doesn't collide across every product that simply
// hasn't been given a barcode yet.
function normalizeBarcode(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

async function assertBarcodeAvailable(businessId, barcode, excludeProductId) {
  if (!barcode) return;
  const { rows } = await query(
    "SELECT id FROM products WHERE business_id = $1 AND barcode = $2 AND id != COALESCE($3, '')",
    [businessId, barcode, excludeProductId || null]
  );
  if (rows[0]) throw new OrderError("Another product already uses this barcode");
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
  const barcode = normalizeBarcode(data.barcode);
  await assertBarcodeAvailable(businessId, barcode);
  const id = uid("p");
  const weight = data.weight !== undefined && data.weight !== "" && data.weight !== null ? requireNumber(data.weight, "Weight", { min: 0 }) : null;
  const costPrice = data.costPrice !== undefined && data.costPrice !== "" && data.costPrice !== null ? requireNumber(data.costPrice, "Cost price", { min: 0 }) : null;
  const { rows } = await query(
    `INSERT INTO products (id, business_id, name, price, discount_price, stock, category, type, delivery_link, delivery_note, image, images, description, barcode, weight, show_in_storefront, cost_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
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
      barcode,
      weight,
      data.showInStorefront !== false,
      costPrice,
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
  const barcode = data.barcode !== undefined ? normalizeBarcode(data.barcode) : current.barcode;
  if (data.barcode !== undefined) await assertBarcodeAvailable(businessId, barcode, id);
  const weight = data.weight !== undefined ? (data.weight === "" || data.weight === null ? null : requireNumber(data.weight, "Weight", { min: 0 })) : current.weight;
  const showInStorefront = data.showInStorefront !== undefined ? data.showInStorefront !== false : current.show_in_storefront;
  const costPrice = data.costPrice !== undefined ? (data.costPrice === "" || data.costPrice === null ? null : requireNumber(data.costPrice, "Cost price", { min: 0 })) : current.cost_price;
  const { rows: updated } = await query(
    `UPDATE products SET name=$1, price=$2, discount_price=$3, stock=$4, category=$5, type=$6, delivery_link=$7, delivery_note=$8, image=$9, images=$10, description=$11, barcode=$12, weight=$13, show_in_storefront=$14, cost_price=$15
     WHERE id = $16 AND business_id = $17 RETURNING *`,
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
      barcode,
      weight,
      showInStorefront,
      costPrice,
      id,
      businessId,
    ]
  );
  return toProductJson(updated[0]);
}

async function getProductByBarcode(businessId, code) {
  const barcode = normalizeBarcode(code);
  if (!barcode) throw new OrderError("Enter or scan a barcode first");
  const { rows } = await query("SELECT * FROM products WHERE business_id = $1 AND barcode = $2", [businessId, barcode]);
  if (!rows[0]) throw new OrderError("No product found with that barcode");
  return toProductJson(rows[0]);
}

// --- Batch/lot tracking (scaffold - see schema.sql comment; not yet wired
// into stock deduction) ------------------------------------------------

function toBatchJson(b) {
  return { id: b.id, productId: b.product_id, batchNumber: b.batch_number, quantity: b.quantity, expiryDate: b.expiry_date, costPrice: b.cost_price == null ? null : Number(b.cost_price), createdAt: b.created_at };
}

async function createBatch(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = batchLimitFor(effectivePlan(businessRows[0]));
  if (limit === 0) throw new OrderError("Batch tracking isn't available on your current plan");
  if (limit !== Infinity) {
    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS n FROM product_batches WHERE business_id = $1 AND created_at >= date_trunc('month', now())",
      [businessId]
    );
    if (countRows[0].n >= limit) throw new OrderError("Batch logging limit reached for the current plan this month");
  }
  const { rows: productRows } = await query("SELECT id FROM products WHERE id = $1 AND business_id = $2", [data.productId, businessId]);
  if (!productRows[0]) throw new OrderError("Product not found");
  const quantity = requireNumber(data.quantity, "Quantity", { min: 0, integer: true });
  const costPrice = data.costPrice === undefined || data.costPrice === null || data.costPrice === "" ? null : requireNumber(data.costPrice, "Cost price", { min: 0 });
  const expiryDate = data.expiryDate ? normalizeDateInput(data.expiryDate) : null;
  const { rows } = await query(
    `INSERT INTO product_batches (business_id, product_id, batch_number, quantity, expiry_date, cost_price)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, data.productId, String(data.batchNumber || "").trim(), quantity, expiryDate, costPrice]
  );
  return toBatchJson(rows[0]);
}

async function listBatches(businessId, productId) {
  const conditions = ["business_id = $1"];
  const params = [businessId];
  if (productId) {
    params.push(productId);
    conditions.push(`product_id = $${params.length}`);
  }
  const { rows } = await query(`SELECT * FROM product_batches WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`, params);
  return rows.map(toBatchJson);
}

async function deleteBatch(businessId, id) {
  const { rows } = await query("DELETE FROM product_batches WHERE id = $1 AND business_id = $2 RETURNING id", [id, businessId]);
  if (!rows[0]) throw new OrderError("Batch not found");
}

// --- Dedicated POS mode (scaffold) --------------------------------------
// Reuses createOrder per cart line rather than a bespoke code path, so
// stock decrement, plan order-limit, loyalty accrual, and delivery-fee
// logic all stay in one place. customerId is optional - a walk-in sale
// with no customer record on file is a normal POS case.
// One multi-item order per checkout (not one order per cart product) - a
// real POS sale with several products now produces a single order/receipt,
// matching how createOrder supports items[] directly. The POS monthly
// limit counts checkouts ("sales"), not line items, so it's now a flat +1
// per call regardless of cart size.
async function posCheckout(businessId, { items, customerId }) {
  if (!Array.isArray(items) || !items.length) throw new OrderError("Cart is empty");
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = posLimitFor(effectivePlan(businessRows[0]));
  if (limit === 0) throw new OrderError("POS mode isn't available on your current plan");
  if (limit !== Infinity) {
    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND source = 'pos' AND created_at >= date_trunc('month', now())",
      [businessId]
    );
    if (countRows[0].n + 1 > limit) throw new OrderError("POS sale limit reached for the current plan this month");
  }
  const order = await createOrder(businessId, { items, customerId: customerId || null, status: "Paid", source: "pos" });
  return [order];
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

// Storefront checkout uses this instead of createCustomer so a repeat buyer
// (matched by phone) reuses their existing customer record - and therefore
// their existing loyalty points/wallet balance/CRM segment/timeline -
// instead of silently getting a brand-new customer row on every purchase.
// The dashboard's own "Add customer" form still calls createCustomer
// directly, since a seller manually adding a contact is a deliberate action
// that shouldn't be silently merged into an existing record.
async function findOrCreateCustomerByPhone(businessId, data) {
  const phone = String(data.phone || "").replace(/\D/g, "");
  if (phone) {
    const { rows } = await query("SELECT * FROM customers WHERE business_id = $1 AND phone = $2 LIMIT 1", [businessId, phone]);
    if (rows[0]) return toCustomerJson(rows[0]);
  }
  return createCustomer(businessId, data);
}

// --- CRM depth: customer timelines, smart segmentation ---------------------

const DORMANT_DAYS = 60;

// Segments are computed on read, not stored, so they're always current and
// need no migration/backfill as order history changes:
// - New: no completed (Paid/Delivered) purchase yet.
// - At Risk: has purchased before but nothing in the last DORMANT_DAYS.
// - VIP: top ~20% of this business's paying customers by total spend
//   (relative, not a fixed currency figure, since spend scale varies by
//   business size and now also by display currency).
// - Repeat: 2+ completed purchases, not otherwise VIP/At Risk.
// - Active: exactly 1 recent completed purchase.
function computeSegments(customers) {
  const spenders = customers.map((c) => c.totalSpend).filter((s) => s > 0).sort((a, b) => b - a);
  const vipCount = Math.max(1, Math.ceil(spenders.length * 0.2));
  const vipThreshold = spenders.length ? spenders[Math.min(vipCount, spenders.length) - 1] : Infinity;
  const now = Date.now();
  return customers.map((c) => {
    let segment;
    if (c.paidOrderCount === 0) segment = "New";
    else if (c.lastOrderAt && now - new Date(c.lastOrderAt).getTime() > DORMANT_DAYS * 24 * 60 * 60 * 1000) segment = "At Risk";
    else if (c.totalSpend > 0 && c.totalSpend >= vipThreshold) segment = "VIP";
    else if (c.paidOrderCount >= 2) segment = "Repeat";
    else segment = "Active";
    return { ...c, segment };
  });
}

async function listCustomersWithSegments(businessId) {
  const { rows } = await query(
    `SELECT c.*,
       COALESCE(SUM(CASE WHEN o.status IN ('Paid','Delivered') THEN o.subtotal ELSE 0 END), 0) AS total_spend,
       COUNT(CASE WHEN o.status IN ('Paid','Delivered') THEN 1 END) AS paid_order_count,
       MAX(CASE WHEN o.status IN ('Paid','Delivered') THEN o.created_at END) AS last_order_at
     FROM customers c
     LEFT JOIN orders o ON o.customer_id = c.id AND o.business_id = c.business_id
     WHERE c.business_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [businessId]
  );
  const customers = rows.map((r) => ({
    ...toCustomerJson(r),
    totalSpend: Number(r.total_spend),
    paidOrderCount: Number(r.paid_order_count),
    lastOrderAt: r.last_order_at,
  }));
  return computeSegments(customers);
}

function toCustomerNoteJson(n) {
  return { id: n.id, note: n.note, createdAt: n.created_at };
}

async function addCustomerNote(businessId, customerId, note) {
  const { rows: exists } = await query("SELECT 1 FROM customers WHERE id = $1 AND business_id = $2", [customerId, businessId]);
  if (!exists[0]) throw new OrderError("Customer not found");
  const text = requireString(note, "Note");
  const { rows } = await query(
    "INSERT INTO customer_notes (business_id, customer_id, note) VALUES ($1, $2, $3) RETURNING *",
    [businessId, customerId, text]
  );
  return toCustomerNoteJson(rows[0]);
}

async function deleteCustomerNote(businessId, noteId) {
  const { rows } = await query("DELETE FROM customer_notes WHERE id = $1 AND business_id = $2 RETURNING id", [noteId, businessId]);
  if (!rows[0]) throw new OrderError("Note not found");
}

// Full picture for one customer: profile + segment, every order (including
// Quotes/Refunded, unlike the revenue-facing aggregates elsewhere, since a
// timeline should show everything that happened), and the freeform note log
// - merged into one chronological feed for the UI.
async function getCustomerTimeline(businessId, customerId) {
  const { rows: customerRows } = await query("SELECT * FROM customers WHERE id = $1 AND business_id = $2", [customerId, businessId]);
  if (!customerRows[0]) throw new OrderError("Customer not found");
  const [segmented, orderRows, noteRows, loyaltyRows, walletRows] = await Promise.all([
    listCustomersWithSegments(businessId),
    query("SELECT * FROM orders WHERE customer_id = $1 AND business_id = $2 ORDER BY created_at DESC", [customerId, businessId]),
    query("SELECT * FROM customer_notes WHERE customer_id = $1 AND business_id = $2 ORDER BY created_at DESC", [customerId, businessId]),
    query("SELECT * FROM loyalty_ledger WHERE customer_id = $1 AND business_id = $2 ORDER BY created_at DESC", [customerId, businessId]),
    query("SELECT * FROM wallet_ledger WHERE customer_id = $1 AND business_id = $2 ORDER BY created_at DESC", [customerId, businessId]),
  ]);
  const customer = segmented.find((c) => c.id === customerId) || { ...toCustomerJson(customerRows[0]), totalSpend: 0, paidOrderCount: 0, lastOrderAt: null, segment: "New" };
  const itemsByOrder = await loadItemsForOrders(orderRows.rows.map((o) => o.id));
  return {
    customer,
    orders: orderRows.rows.map((o) => toOrderJson({ ...o, items: itemsByOrder[o.id] || [] })),
    notes: noteRows.rows.map(toCustomerNoteJson),
    loyaltyLedger: loyaltyRows.rows.map((r) => ({ id: r.id, points: r.points, reason: r.reason, createdAt: r.created_at })),
    walletLedger: walletRows.rows.map((r) => ({ id: r.id, amount: Number(r.amount), reason: r.reason, createdAt: r.created_at })),
  };
}

// --- Suppliers & purchase orders --------------------------------------------

function toSupplierJson(s) {
  return { id: s.id, name: s.name, phone: s.phone, email: s.email, address: s.address, notes: s.notes, createdAt: s.created_at };
}

async function createSupplier(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = supplierLimitFor(effectivePlan(businessRows[0]));
  if (limit !== Infinity) {
    const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM suppliers WHERE business_id = $1", [businessId]);
    if (countRows[0].n >= limit) throw new OrderError("Supplier limit reached for the current plan");
  }
  const name = requireString(data.name, "Supplier name");
  const { rows } = await query(
    `INSERT INTO suppliers (business_id, name, phone, email, address, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, name, String(data.phone || "").trim(), String(data.email || "").trim(), String(data.address || "").trim(), String(data.notes || "").trim()]
  );
  return toSupplierJson(rows[0]);
}

async function listSuppliers(businessId) {
  const { rows } = await query("SELECT * FROM suppliers WHERE business_id = $1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toSupplierJson);
}

async function deleteSupplier(businessId, id) {
  await query("DELETE FROM suppliers WHERE id = $1 AND business_id = $2", [id, businessId]);
}

const PO_STATUSES = ["Draft", "Ordered", "Received", "Cancelled"];

function toPurchaseOrderItemJson(i) {
  return { id: i.id, productId: i.product_id, productName: i.product_name, qty: Number(i.qty), unitCost: Number(i.unit_cost) };
}

async function createPurchaseOrder(businessId, data) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new OrderError("Add at least one item to the purchase order");
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const poLimit = poLimitFor(effectivePlan(businessRows[0]));
  if (poLimit !== Infinity) {
    const { rows: countRows } = await query(
      "SELECT COUNT(*)::int AS n FROM purchase_orders WHERE business_id = $1 AND created_at >= date_trunc('month', now())",
      [businessId]
    );
    if (countRows[0].n >= poLimit) throw new OrderError("Purchase order limit reached for the current plan this month");
  }
  const supplierId = data.supplierId || null;
  const notes = String(data.notes || "").trim();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: poRows } = await client.query(
      `INSERT INTO purchase_orders (business_id, supplier_id, status, notes) VALUES ($1,$2,'Draft',$3) RETURNING *`,
      [businessId, supplierId, notes]
    );
    const po = poRows[0];
    for (const item of items) {
      const qty = requireNumber(item.qty, "Item quantity", { min: 1, integer: true });
      const unitCost = requireNumber(item.unitCost ?? 0, "Item unit cost", { min: 0 });
      const { rows: productRows } = await client.query("SELECT name FROM products WHERE id = $1 AND business_id = $2", [item.productId, businessId]);
      if (!productRows[0]) throw new OrderError("One of the selected products was not found");
      await client.query(
        `INSERT INTO purchase_order_items (business_id, purchase_order_id, product_id, product_name, qty, unit_cost) VALUES ($1,$2,$3,$4,$5,$6)`,
        [businessId, po.id, item.productId, productRows[0].name, qty, unitCost]
      );
    }
    await client.query("COMMIT");
    await logEvent(businessId, "purchase_order_created", `${items.length} item(s)`);
    return getPurchaseOrder(businessId, po.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listPurchaseOrders(businessId) {
  const { rows } = await query(
    `SELECT po.*, s.name AS supplier_name,
       COALESCE(SUM(i.qty * i.unit_cost), 0) AS total_cost,
       COALESCE(SUM(i.qty), 0) AS total_items
     FROM purchase_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN purchase_order_items i ON i.purchase_order_id = po.id
     WHERE po.business_id = $1
     GROUP BY po.id, s.name
     ORDER BY po.created_at DESC`,
    [businessId]
  );
  const { rows: itemRows } = await query(
    `SELECT i.* FROM purchase_order_items i JOIN purchase_orders po ON po.id = i.purchase_order_id WHERE po.business_id = $1`,
    [businessId]
  );
  const itemsByPo = {};
  itemRows.forEach((i) => (itemsByPo[i.purchase_order_id] = itemsByPo[i.purchase_order_id] || []).push(toPurchaseOrderItemJson(i)));
  return rows.map((r) => ({
    id: r.id,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name || "No supplier",
    status: r.status,
    notes: r.notes,
    totalCost: Number(r.total_cost),
    totalItems: Number(r.total_items),
    createdAt: r.created_at,
    receivedAt: r.received_at,
    items: itemsByPo[r.id] || [],
  }));
}

async function getPurchaseOrder(businessId, id) {
  const { rows } = await query(
    `SELECT po.*, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.id = $1 AND po.business_id = $2`,
    [id, businessId]
  );
  const po = rows[0];
  if (!po) throw new OrderError("Purchase order not found");
  const { rows: itemRows } = await query("SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY id", [id]);
  return {
    id: po.id,
    supplierId: po.supplier_id,
    supplierName: po.supplier_name || "No supplier",
    status: po.status,
    notes: po.notes,
    createdAt: po.created_at,
    receivedAt: po.received_at,
    items: itemRows.map(toPurchaseOrderItemJson),
  };
}

// Stock only ever changes here, once, on the Draft/Ordered -> Received
// transition - re-receiving an already-Received PO is rejected so stock
// can't be double-counted by clicking the status dropdown twice.
async function updatePurchaseOrderStatus(businessId, id, status) {
  if (!PO_STATUSES.includes(status)) throw new OrderError("Invalid purchase order status");
  const { rows } = await query("SELECT * FROM purchase_orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Purchase order not found");
  if (status === "Received") {
    if (current.status === "Received") throw new OrderError("This purchase order has already been received");
    const { rows: itemRows } = await query("SELECT * FROM purchase_order_items WHERE purchase_order_id = $1", [id]);
    for (const item of itemRows) {
      await query("UPDATE products SET stock = stock + $1 WHERE id = $2 AND business_id = $3", [item.qty, item.product_id, businessId]);
    }
    await query("UPDATE purchase_orders SET status = 'Received', received_at = now() WHERE id = $1", [id]);
    await logEvent(businessId, "purchase_order_received", `${itemRows.length} item(s) restocked`);
  } else {
    await query("UPDATE purchase_orders SET status = $1 WHERE id = $2", [status, id]);
  }
  return getPurchaseOrder(businessId, id);
}

async function deletePurchaseOrder(businessId, id) {
  const { rows } = await query("SELECT status FROM purchase_orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  if (!rows[0]) throw new OrderError("Purchase order not found");
  if (rows[0].status === "Received") throw new OrderError("Received purchase orders can't be deleted - they're part of your stock history");
  await query("DELETE FROM purchase_orders WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- Loyalty points & wallet credit (retention mechanics) ------------------

// Called once, at most, per order - the first time it reaches Paid/Delivered
// (guarded by checking loyalty_ledger for an existing row against this
// order_id, not by which status transition triggered it, since a single
// order can pass through several - markPaid, then deliver, etc - and should
// only ever earn points once).
async function awardLoyaltyPointsIfNeeded(businessId, order) {
  if (!order || !["Paid", "Delivered"].includes(order.status) || !order.customer_id) return;
  const { rows: bizRows } = await query("SELECT loyalty_enabled, loyalty_earn_rate FROM businesses WHERE id = $1", [businessId]);
  const business = bizRows[0];
  if (!business?.loyalty_enabled) return;
  const { rows: existing } = await query("SELECT 1 FROM loyalty_ledger WHERE order_id = $1", [order.id]);
  if (existing[0]) return;
  const orderTotal = Number(order.subtotal);
  const points = Math.floor((orderTotal / 100) * Number(business.loyalty_earn_rate));
  if (points <= 0) return;
  await query("UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id = $2 AND business_id = $3", [points, order.customer_id, businessId]);
  await query(
    "INSERT INTO loyalty_ledger (business_id, customer_id, points, reason, order_id) VALUES ($1,$2,$3,'Earned from order',$4)",
    [businessId, order.customer_id, points, order.id]
  );
}

async function redeemLoyaltyPoints(businessId, customerId, points, reason) {
  const pointsToRedeem = requireNumber(points, "Points", { min: 1, integer: true });
  const redeemReason = requireString(reason, "Reason");
  const { rows } = await query("SELECT loyalty_points FROM customers WHERE id = $1 AND business_id = $2", [customerId, businessId]);
  if (!rows[0]) throw new OrderError("Customer not found");
  if (pointsToRedeem > rows[0].loyalty_points) throw new OrderError("Customer doesn't have that many points");
  await query("UPDATE customers SET loyalty_points = loyalty_points - $1 WHERE id = $2", [pointsToRedeem, customerId]);
  await query(
    "INSERT INTO loyalty_ledger (business_id, customer_id, points, reason) VALUES ($1,$2,$3,$4)",
    [businessId, customerId, -pointsToRedeem, redeemReason]
  );
}

// amount can be positive (credit, e.g. refund-as-store-credit or goodwill)
// or negative (debit, e.g. redeemed against an in-person sale) - a negative
// amount that would take the balance below zero is rejected.
async function adjustWallet(businessId, customerId, amount, reason) {
  const delta = requireNumber(amount, "Amount", { min: -1000000000, max: 1000000000 });
  if (delta === 0) throw new OrderError("Amount can't be zero");
  const adjustReason = requireString(reason, "Reason");
  const { rows } = await query("SELECT wallet_balance FROM customers WHERE id = $1 AND business_id = $2", [customerId, businessId]);
  if (!rows[0]) throw new OrderError("Customer not found");
  if (Number(rows[0].wallet_balance) + delta < 0) throw new OrderError("That would take the wallet balance below zero");
  await query("UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id = $2", [delta, customerId]);
  await query(
    "INSERT INTO wallet_ledger (business_id, customer_id, amount, reason) VALUES ($1,$2,$3,$4)",
    [businessId, customerId, delta, adjustReason]
  );
}

// --- Orders ---------------------------------------------------------------

async function loadItemsForOrder(orderId) {
  const { rows } = await query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at ASC", [orderId]);
  return rows;
}

// Batched (avoids N+1) - used wherever orders are listed in bulk (getState,
// reports use their own aggregate queries instead). Returns a map keyed by
// order_id so callers can attach `.items` to each order row before mapping
// through toOrderJson.
async function loadItemsForOrders(orderIds) {
  if (!orderIds.length) return {};
  const { rows } = await query("SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY created_at ASC", [orderIds]);
  const map = {};
  rows.forEach((r) => {
    (map[r.order_id] = map[r.order_id] || []).push(r);
  });
  return map;
}

// Quotes are a pre-commitment estimate, not a real sale yet - they don't
// touch stock and don't count against the plan's order limit (both only
// apply once a quote is actually converted into a real order via
// convertQuoteToOrder below).
//
// data.items is [{productId, qty}] - a real multi-item order, one row per
// order plus N order_items rows. For back-compat with any caller still
// passing a single {productId, qty} directly (none should after this
// change, but kept as a safe fallback), that shape is normalized into a
// one-item array below.
async function createOrder(businessId, data) {
  const isQuote = data.status === "Quote";
  const items = Array.isArray(data.items) && data.items.length ? data.items : data.productId ? [{ productId: data.productId, qty: data.qty }] : [];
  if (!items.length) throw new OrderError("Add at least one product");
  const dueDate = data.dueDate ? new Date(data.dueDate).toISOString() : null;

  if (!isQuote) {
    const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
    const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status != 'Quote'", [businessId]);
    const limit = orderLimitFor(effectivePlan(businessRows[0]));
    if (countRows[0].n >= limit) throw new OrderError("Order limit reached for the current plan");
  }

  const id = uid("o");
  const deliveryMethod = ["self", "rider", "sellerspoint"].includes(data.deliveryMethod) ? data.deliveryMethod : "self";
  let deliveryFee = 0;
  let pendingRequestToken = null, pendingServiceCode = null, pendingCourierId = null;
  if (deliveryMethod === "sellerspoint") {
    const logistics = await getRawLogisticsSettings();
    if (!logistics.enabled) throw new OrderError("SellersPoint Logistics isn't available yet - choose self delivery or a dispatch rider instead.");
    // The real ShipBubble cost must be quoted (getShipbubbleQuote) and a
    // courier chosen BEFORE the order is created, not after - otherwise the
    // customer can never pay the accurate total (products + real shipping)
    // in one payment. The chosen courier's request_token/service_code/
    // courier_id are stored so bookShipbubbleShipment can finalize the
    // actual shipment later without re-quoting or re-charging.
    pendingRequestToken = requireString(data.shipbubbleRequestToken, "Shipping quote");
    pendingServiceCode = requireString(data.shipbubbleServiceCode, "Courier selection");
    pendingCourierId = requireString(data.shipbubbleCourierId, "Courier selection");
    const quotedCost = requireNumber(data.shipbubbleQuotedCost, "Quoted shipping cost", { min: 0 });
    deliveryFee = quotedCost + Number(logistics.flatFee || 0);
  }
  const source = ["dashboard", "pos", "storefront"].includes(data.source) ? data.source : "dashboard";

  // Wrapped in a transaction (same pattern as createPurchaseOrder above) -
  // with multiple items, a stock decrement on item 2 failing must not
  // leave item 1's already-decremented stock stranded uncommitted.
  const client = await pool.connect();
  let lineItems = [], subtotal = 0, orderRow;
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const qty = requireNumber(item.qty ?? 1, "Quantity", { min: 1, integer: true });
      let product;
      if (isQuote) {
        // Quotes don't touch stock - only a real order (below) does, since
        // a quote is a pre-commitment estimate, not a reservation.
        const { rows: productRows } = await client.query("SELECT * FROM products WHERE id = $1 AND business_id = $2", [item.productId, businessId]);
        product = productRows[0];
        if (!product) throw new OrderError("Product not found");
      } else {
        // Atomic check-and-decrement: baking "enough stock?" into the
        // UPDATE's WHERE clause (instead of reading stock, checking it in
        // JS, then writing a computed value back) closes a race where two
        // concurrent checkouts for the same product could both pass a
        // stale read and oversell it.
        const { rows: productRows } = await client.query(
          "UPDATE products SET stock = stock - $1 WHERE id = $2 AND business_id = $3 AND stock >= $1 RETURNING *",
          [qty, item.productId, businessId]
        );
        product = productRows[0];
        if (!product) {
          const { rows: existing } = await client.query("SELECT 1 FROM products WHERE id = $1 AND business_id = $2", [item.productId, businessId]);
          throw new OrderError(existing[0] ? "Not enough stock for one of the items in this order" : "Product not found");
        }
      }
      // Orders bill at the discounted price when one's active - the
      // discount is a real selling price, not just a display label.
      const discountPrice = product.discount_price == null ? null : Number(product.discount_price);
      const sellingPrice = discountPrice != null && discountPrice < Number(product.price) ? discountPrice : Number(product.price);
      lineItems.push({ productId: product.id, productName: product.name, productType: product.type, qty, price: sellingPrice, costPrice: Number(product.cost_price || 0) });
      subtotal += sellingPrice * qty;
    }

    const { rows } = await client.query(
      `INSERT INTO orders (id, business_id, customer_id, status, delivered, delivery_method, due_date, delivery_fee, source, subtotal, shipbubble_pending_request_token, shipbubble_pending_service_code, shipbubble_pending_courier_id)
       VALUES ($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, businessId, data.customerId, data.status || "Pending payment", deliveryMethod, dueDate, deliveryFee, source, subtotal, pendingRequestToken, pendingServiceCode, pendingCourierId]
    );
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_type, qty, price, cost_price) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, li.productId, li.productName, li.productType, li.qty, li.price, li.costPrice]
      );
    }
    await client.query("COMMIT");
    orderRow = { ...rows[0], items: lineItems };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const itemsSummary = lineItems.map((li) => `${li.productName} x ${li.qty}`).join(", ");
  await logEvent(businessId, isQuote ? "quote_created" : "order_created", itemsSummary);
  await awardLoyaltyPointsIfNeeded(businessId, orderRow);
  return toOrderJson(orderRow);
}

// Turns a Quote into a real order - this is the moment stock actually gets
// reserved and the plan's order limit actually gets checked, since a quote
// itself was neither. Wrapped in a transaction (same reasoning as
// createOrder) since multiple items must all reserve stock together or not
// at all.
async function convertQuoteToOrder(businessId, id) {
  const { rows } = await query("SELECT * FROM orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Order not found");
  if (current.status !== "Quote") throw new OrderError("This order is not a quote");

  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1 AND status != 'Quote'", [businessId]);
  const limit = orderLimitFor(effectivePlan(businessRows[0]));
  if (countRows[0].n >= limit) throw new OrderError("Order limit reached for the current plan");

  const items = await loadItemsForOrder(id);
  const client = await pool.connect();
  let updated;
  try {
    await client.query("BEGIN");
    for (const item of items) {
      const { rows: productRows } = await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING *",
        [item.qty, item.product_id]
      );
      if (!productRows[0]) throw new OrderError(`Not enough stock to convert this quote (${item.product_name})`);
    }
    const { rows: updatedRows } = await client.query("UPDATE orders SET status='Pending payment' WHERE id=$1 RETURNING *", [id]);
    updated = updatedRows[0];
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await logEvent(businessId, "quote_converted", items.map((i) => `${i.product_name} x ${i.qty}`).join(", "));
  return toOrderJson({ ...updated, items });
}

async function updateOrder(businessId, id, changes) {
  const { rows } = await query("SELECT * FROM orders WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Order not found");
  const items = await loadItemsForOrder(id);
  const itemsSummary = items.map((i) => `${i.product_name} x ${i.qty}`).join(", ") || current.product_name;

  if (changes.markPaid) {
    // Auto-delivered only when EVERY item is a digital product - a mixed
    // cart (one digital + one physical item) still needs real delivery.
    const delivered = items.length > 0 ? items.every((i) => i.product_type === "Digital product") : !!current.delivered;
    const { rows: updated } = await query("UPDATE orders SET status='Paid', delivered=$1 WHERE id=$2 RETURNING *", [
      delivered,
      id,
    ]);
    await logEvent(businessId, "order_paid", itemsSummary);
    const orderRow = { ...updated[0], items };
    await awardLoyaltyPointsIfNeeded(businessId, orderRow);
    return toOrderJson(orderRow);
  }
  if (changes.deliver) {
    const newStatus = current.status === "Pending payment" ? "Paid" : current.status;
    const { rows: updated } = await query("UPDATE orders SET status=$1, delivered=true WHERE id=$2 RETURNING *", [
      newStatus,
      id,
    ]);
    await logEvent(businessId, "digital_delivered", itemsSummary);
    const orderRow = { ...updated[0], items };
    await awardLoyaltyPointsIfNeeded(businessId, orderRow);
    return toOrderJson(orderRow);
  }
  if (changes.refund) {
    if (current.status === "Refunded") throw new OrderError("This order is already refunded");
    // Restocks every line item, not just one product - a refund on a
    // multi-item order returns everything in it.
    if (changes.restock) {
      for (const item of items) {
        await query("UPDATE products SET stock = stock + $1 WHERE id = $2", [item.qty, item.product_id]);
      }
    }
    const { rows: updated } = await query("UPDATE orders SET status='Refunded' WHERE id=$1 RETURNING *", [id]);
    await logEvent(businessId, "order_refunded", `${itemsSummary}${changes.restock ? " (restocked)" : ""}`);
    return toOrderJson({ ...updated[0], items });
  }
  const status = changes.status ?? current.status;
  const delivered = changes.delivered ?? current.delivered;
  const { rows: updated } = await query("UPDATE orders SET status=$1, delivered=$2 WHERE id=$3 RETURNING *", [
    status,
    delivered,
    id,
  ]);
  const orderRow = { ...updated[0], items };
  await awardLoyaltyPointsIfNeeded(businessId, orderRow);
  return toOrderJson(orderRow);
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

// Full cross-tenant detail for one business - powers backend.html's "View
// Details" panel. Reuses listStaff (same function the business's own
// Settings > Team tab uses) rather than re-querying business_members here.
async function getBusinessDetailForAdmin(businessId) {
  const month = currentMonth();
  const { rows } = await query(
    `SELECT b.*,
      (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) AS order_count,
      (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customer_count,
      (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) AS product_count,
      COALESCE((SELECT count FROM ai_usage a WHERE a.business_id = b.id AND a.month = $2), 0) AS ai_used,
      COALESCE((SELECT COUNT(*)::int FROM addon_purchases ap WHERE ap.business_id = b.id AND ap.type = 'ai_credits' AND ap.month = $2), 0) AS ai_addon_count
    FROM businesses b WHERE b.id = $1`,
    [businessId, month]
  );
  const b = rows[0];
  if (!b) throw new OrderError("Business not found");
  const baseLimit = aiLimitFor(effectivePlan(b));
  const aiLimit = baseLimit === Infinity ? null : baseLimit + Number(b.ai_addon_count) * ADDON_AI_CREDITS;

  const [staff, paymentRows, activityRows] = await Promise.all([
    listStaff(businessId),
    query("SELECT * FROM payments WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20", [businessId]),
    query("SELECT * FROM audit_log WHERE business_id = $1 ORDER BY created_at DESC LIMIT 20", [businessId]),
  ]);

  return {
    business: {
      ...toBusinessJson(b),
      orderCount: Number(b.order_count),
      customerCount: Number(b.customer_count),
      productCount: Number(b.product_count),
      aiUsed: Number(b.ai_used),
      aiLimit,
    },
    staff,
    payments: paymentRows.rows.map(toPaymentJson),
    activity: activityRows.rows.map((r) => ({ method: r.method, path: r.path, statusCode: r.status_code, createdAt: r.created_at })),
  };
}

// --- SellersPoint Docs: business registration (CAC incorporation) ----------
// Fulfilled manually via backend.html's Registration Queue for now (no CAC
// accreditation yet) - see advanceBusinessRegistration, the single function
// both the manual admin action and a future automated API-poll job will
// call, so accreditation becomes a backend swap rather than a rebuild.

function toSharesJson(s) {
  if (!s) return { ordinaryIssuedShare: 0, preferenceIssuedShare: 0, pricePerShare: 0 };
  return {
    ordinaryIssuedShare: Number(s.ordinary_issued_share),
    preferenceIssuedShare: Number(s.preference_issued_share),
    pricePerShare: Number(s.price_per_share),
  };
}
function toAffiliateJson(a) {
  return {
    id: a.id,
    affiliateType: a.affiliate_type || [],
    isCorporate: a.is_corporate,
    firstname: a.firstname,
    surname: a.surname,
    otherName: a.other_name,
    corporateName: a.corporate_name,
    email: a.email,
    phoneNumber: a.phone_number,
    idType: a.id_type,
    idNumber: a.id_number,
    hasIdImage: !!a.id_image,
    hasSignature: !!a.signature,
    hasPassport: !!a.passport,
    isShareholder: a.is_shareholder,
    allottedOrdinaryShares: Number(a.allotted_ordinary_shares),
    allottedPreferenceShares: Number(a.allotted_preference_shares),
    createdAt: a.created_at,
  };
}
function toPscJson(p) {
  return {
    id: p.id,
    affiliateId: p.affiliate_id,
    ownsDirectShares: p.owns_direct_shares,
    sharePercent: Number(p.share_percent),
    isPep: p.is_pep,
    hasSignificantControl: p.has_significant_control,
    createdAt: p.created_at,
  };
}

async function getDocsRegistration(businessId) {
  const [bizRows, sharesRows, affiliateRows, pscRows, hasPurchasedPackage] = await Promise.all([
    query("SELECT * FROM businesses WHERE id = $1", [businessId]),
    query("SELECT * FROM business_registration_shares WHERE business_id = $1", [businessId]),
    query("SELECT * FROM business_registration_affiliates WHERE business_id = $1 ORDER BY created_at", [businessId]),
    query("SELECT * FROM business_registration_psc WHERE business_id = $1 ORDER BY created_at", [businessId]),
    hasPurchasedRegistrationPackage(businessId),
  ]);
  const b = bizRows.rows[0];
  if (!b) throw new OrderError("Business not found");
  return {
    business: {
      ...toBusinessJson(b),
      regReservationCode: b.reg_reservation_code || "",
      regTransactionRef: b.reg_transaction_ref || "",
      regNatureOfBusinessCategory: b.reg_nature_of_business_category || "",
      regNatureOfBusiness: b.reg_nature_of_business || "",
      regObjects: b.reg_objects || [],
      regAddress: b.reg_address || {},
      hasRegCertificate: !!b.reg_certificate,
      regExistingNumber: b.reg_existing_number || "",
      hasPurchasedPackage,
    },
    shares: toSharesJson(sharesRows.rows[0]),
    affiliates: affiliateRows.rows.map(toAffiliateJson),
    psc: pscRows.rows.map(toPscJson),
  };
}

async function saveRegistrationDetails(businessId, data) {
  const regType = requireString(data.regType, "Registration type");
  if (!["business_name", "llc", "partnership"].includes(regType)) throw new OrderError("Invalid registration type");
  await query(
    `UPDATE businesses SET reg_type=$1, reg_nature_of_business_category=$2, reg_nature_of_business=$3,
     reg_objects=$4, reg_address=$5 WHERE id=$6`,
    [
      regType,
      data.natureOfBusinessCategory || "",
      data.natureOfBusiness || "",
      JSON.stringify(data.objects || []),
      JSON.stringify(data.address || {}),
      businessId,
    ]
  );
  return getDocsRegistration(businessId);
}

async function saveRegistrationShares(businessId, data) {
  await query(
    `INSERT INTO business_registration_shares (business_id, ordinary_issued_share, preference_issued_share, price_per_share, updated_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (business_id) DO UPDATE SET ordinary_issued_share=$2, preference_issued_share=$3, price_per_share=$4, updated_at=now()`,
    [businessId, Number(data.ordinaryIssuedShare) || 0, Number(data.preferenceIssuedShare) || 0, Number(data.pricePerShare) || 0]
  );
  return getDocsRegistration(businessId);
}

async function addRegistrationAffiliate(businessId, data) {
  const { rows } = await query(
    `INSERT INTO business_registration_affiliates
     (business_id, affiliate_type, is_corporate, firstname, surname, other_name, corporate_name, email, phone_number,
      id_type, id_number, id_image, signature, passport, is_shareholder, allotted_ordinary_shares, allotted_preference_shares)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [
      businessId,
      data.affiliateType || [],
      !!data.isCorporate,
      data.firstname || "",
      data.surname || "",
      data.otherName || "",
      data.corporateName || "",
      data.email || "",
      data.phoneNumber || "",
      data.idType || "",
      data.idNumber || "",
      data.idImage || "",
      data.signature || "",
      data.passport || "",
      !!data.isShareholder,
      Number(data.allottedOrdinaryShares) || 0,
      Number(data.allottedPreferenceShares) || 0,
    ]
  );
  return toAffiliateJson(rows[0]);
}

async function deleteRegistrationAffiliate(businessId, affiliateId) {
  await query("DELETE FROM business_registration_affiliates WHERE id=$1 AND business_id=$2", [affiliateId, businessId]);
}

async function addRegistrationPsc(businessId, data) {
  const { rows } = await query(
    `INSERT INTO business_registration_psc (business_id, affiliate_id, owns_direct_shares, share_percent, is_pep, has_significant_control)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, data.affiliateId || null, !!data.ownsDirectShares, Number(data.sharePercent) || 0, !!data.isPep, !!data.hasSignificantControl]
  );
  return toPscJson(rows[0]);
}

async function submitBusinessRegistration(businessId) {
  const { rows } = await query("SELECT reg_type, reg_address FROM businesses WHERE id=$1", [businessId]);
  const b = rows[0];
  if (!b) throw new OrderError("Business not found");
  if (!b.reg_type) throw new OrderError("Choose a registration type first");
  const { rows: affiliateRows } = await query("SELECT id FROM business_registration_affiliates WHERE business_id=$1", [businessId]);
  if (!affiliateRows.length) throw new OrderError("Add at least one affiliate (director/shareholder/etc.) before submitting");
  await query("UPDATE businesses SET reg_status='submitted' WHERE id=$1", [businessId]);
  return getDocsRegistration(businessId);
}

// Cross-tenant queue for backend.html's Registration Queue tab - every
// business currently mid-flight (submitted/in_review/action_needed).
async function listRegistrationQueue() {
  const { rows } = await query(
    `SELECT id, name, reg_type, reg_status, reg_note, created_at
     FROM businesses WHERE reg_status IN ('submitted','in_review','action_needed')
     ORDER BY created_at`
  );
  return rows.map((b) => ({ id: b.id, businessName: b.name, regType: b.reg_type, regStatus: b.reg_status, regNote: b.reg_note, createdAt: b.created_at }));
}

// The single fulfillment entry point - called today from the manual admin
// action in backend.html, and (once CAC accreditation clears) from an
// automated job polling the CAC API status endpoint with the exact same
// shape of update, so no second code path needs to exist later.
async function advanceBusinessRegistration(businessId, { status, note, certificate, tin, scumlStatus }) {
  if (!["in_review", "action_needed", "approved"].includes(status)) throw new OrderError("Invalid status");
  const sets = ["reg_status=$1", "reg_note=$2"];
  const params = [status, note || ""];
  let i = 3;
  if (certificate) { sets.push(`reg_certificate=$${i++}`); params.push(certificate); }
  if (tin) { sets.push(`tin=$${i++}`); params.push(tin); }
  if (scumlStatus) { sets.push(`scuml_status=$${i++}`); params.push(scumlStatus); }
  params.push(businessId);
  await query(`UPDATE businesses SET ${sets.join(",")} WHERE id=$${i}`, params);
  return getBusinessDetailForAdmin(businessId);
}

// --- SellersPoint Docs Phase 2: Trackers & Document Vault -------------------
// Compliance Calendar and the PAYE Calculator are computed client-side from
// this data plus statutory date math - no server-side support needed for
// either (see app.js).

function toTrackerJson(t) {
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    dueDate: t.due_date,
    recurrence: t.recurrence,
    status: t.status,
    note: t.note,
    hasProof: !!t.proof_document,
    createdAt: t.created_at,
  };
}

async function listTrackers(businessId) {
  const { rows } = await query("SELECT * FROM docs_trackers WHERE business_id=$1 ORDER BY due_date", [businessId]);
  return rows.map(toTrackerJson);
}

async function createTracker(businessId, data) {
  const name = requireString(data.name, "Tracker name");
  const category = requireString(data.category, "Category");
  const dueDate = requireString(data.dueDate, "Due date");
  const { rows } = await query(
    `INSERT INTO docs_trackers (business_id, name, category, due_date, recurrence, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [businessId, name, category, dueDate, data.recurrence || "none", data.note || ""]
  );
  return toTrackerJson(rows[0]);
}

async function updateTracker(businessId, id, data) {
  const sets = [];
  const params = [];
  let i = 1;
  if (data.status !== undefined) { sets.push(`status=$${i++}`); params.push(data.status); }
  if (data.note !== undefined) { sets.push(`note=$${i++}`); params.push(data.note); }
  if (data.proofDocument) { sets.push(`proof_document=$${i++}`); params.push(data.proofDocument); }
  if (data.dueDate !== undefined) { sets.push(`due_date=$${i++}`); params.push(data.dueDate); }
  if (!sets.length) throw new OrderError("Nothing to update");
  params.push(businessId, id);
  const { rows } = await query(`UPDATE docs_trackers SET ${sets.join(",")} WHERE business_id=$${i++} AND id=$${i} RETURNING *`, params);
  if (!rows[0]) throw new OrderError("Tracker not found");
  return toTrackerJson(rows[0]);
}

async function deleteTracker(businessId, id) {
  await query("DELETE FROM docs_trackers WHERE id=$1 AND business_id=$2", [id, businessId]);
}

function toVaultItemJson(v) {
  return { id: v.id, name: v.name, docType: v.doc_type, file: v.file, createdAt: v.created_at, source: "upload" };
}

// Aggregates real uploads with documents already produced elsewhere in
// Docs (registration certificate, tracker proof-of-completion, filings)
// into one list, same concept as the mockup's vaultItems() but over real
// data.
async function listVaultItems(businessId) {
  const [uploadRows, bizRows, trackerRows, filingRows] = await Promise.all([
    query("SELECT * FROM docs_vault_items WHERE business_id=$1 ORDER BY created_at DESC", [businessId]),
    query("SELECT reg_certificate, created_at FROM businesses WHERE id=$1", [businessId]),
    query("SELECT id, name, proof_document, created_at FROM docs_trackers WHERE business_id=$1 AND proof_document != ''", [businessId]),
    query("SELECT id, filing_type, period, status, created_at FROM docs_filings WHERE business_id=$1", [businessId]),
  ]);
  const items = uploadRows.rows.map(toVaultItemJson);
  const biz = bizRows.rows[0];
  if (biz?.reg_certificate) {
    items.push({ id: "reg-certificate", name: "Business Registration Certificate", docType: "Registration", file: biz.reg_certificate, createdAt: biz.created_at, source: "registration" });
  }
  trackerRows.rows.forEach((t) => {
    items.push({ id: "tracker-" + t.id, name: t.name + " - Proof", docType: "Tracker", file: t.proof_document, createdAt: t.created_at, source: "tracker" });
  });
  filingRows.rows.forEach((f) => {
    items.push({ id: "filing-" + f.id, name: `${f.filing_type} filing${f.period ? " - " + f.period : ""}`, docType: "Tax", file: "", status: f.status, createdAt: f.created_at, source: "filing" });
  });
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return items;
}

async function createVaultItem(businessId, data) {
  const name = requireString(data.name, "Document name");
  const file = requireString(data.file, "File");
  const { rows } = await query(
    "INSERT INTO docs_vault_items (business_id, name, doc_type, file) VALUES ($1,$2,$3,$4) RETURNING *",
    [businessId, name, data.docType || "Other", file]
  );
  return toVaultItemJson(rows[0]);
}

// --- SellersPoint Docs Phase 3: Tax Suite (Payroll/Payslip/Annual Certificate) --

function toEmployeeJson(e) {
  return { id: e.id, name: e.name, grossAnnual: Number(e.gross_annual), annualRent: Number(e.annual_rent), createdAt: e.created_at };
}
async function listEmployees(businessId) {
  const { rows } = await query("SELECT * FROM docs_employees WHERE business_id=$1 ORDER BY created_at", [businessId]);
  return rows.map(toEmployeeJson);
}
async function createEmployee(businessId, data) {
  const name = requireString(data.name, "Employee name");
  const grossAnnual = Number(data.grossAnnual);
  if (!grossAnnual || grossAnnual <= 0) throw new OrderError("Gross salary is required");
  const { rows } = await query(
    "INSERT INTO docs_employees (business_id, name, gross_annual, annual_rent) VALUES ($1,$2,$3,$4) RETURNING *",
    [businessId, name, grossAnnual, Number(data.annualRent) || 0]
  );
  return toEmployeeJson(rows[0]);
}
async function deleteEmployee(businessId, id) {
  await query("DELETE FROM docs_employees WHERE id=$1 AND business_id=$2", [id, businessId]);
}

// --- SellersPoint Docs Phase 3: E-Invoicing ---------------------------------
// IRN/CSID are generated locally (crypto.randomBytes, same intent as the
// mockup's Math.random() stub) - not a real NRS call. Swap-in point once
// the platform is NRS/Access-Point-Provider integrated.

function toInvoiceJson(i) {
  return { id: i.id, buyerName: i.buyer_name, buyerTin: i.buyer_tin, description: i.description, amount: Number(i.amount), vat: Number(i.vat), irn: i.irn, csid: i.csid, createdAt: i.created_at };
}
async function listInvoices(businessId) {
  const { rows } = await query("SELECT * FROM docs_invoices WHERE business_id=$1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toInvoiceJson);
}
async function createInvoice(businessId, data) {
  const buyerName = requireString(data.buyerName, "Buyer name");
  const amount = Number(data.amount);
  if (!amount || amount <= 0) throw new OrderError("Amount is required");
  const vat = amount * 0.075;
  const irn = "IRN-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const csid = "CSID-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  const { rows } = await query(
    "INSERT INTO docs_invoices (business_id, buyer_name, buyer_tin, description, amount, vat, irn, csid) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [businessId, buyerName, data.buyerTin || "", data.description || "", amount, vat, irn, csid]
  );
  return toInvoiceJson(rows[0]);
}


// --- SellersPoint Docs Phase 3: Filings (VAT + CAC Annual Return) ----------

function toFilingJson(f) {
  return { id: f.id, filingType: f.filing_type, period: f.period, amount: f.amount == null ? null : Number(f.amount), status: f.status, createdAt: f.created_at };
}
async function listFilings(businessId) {
  const { rows } = await query("SELECT * FROM docs_filings WHERE business_id=$1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toFilingJson);
}
async function createFiling(businessId, data) {
  const filingType = requireString(data.filingType, "Filing type");
  const { rows } = await query(
    "INSERT INTO docs_filings (business_id, filing_type, period, amount) VALUES ($1,$2,$3,$4) RETURNING *",
    [businessId, filingType, data.period || "", data.amount == null ? null : Number(data.amount)]
  );
  return toFilingJson(rows[0]);
}

// --- Platform admins (who can access backend.html) --------------------------

async function isPlatformAdmin(email) {
  if (!email) return false;
  const { rows } = await query("SELECT 1 FROM platform_admins WHERE email = $1", [email.toLowerCase()]);
  return rows.length > 0;
}

async function listPlatformAdmins() {
  const { rows } = await query("SELECT email, added_by, created_at FROM platform_admins ORDER BY created_at");
  return rows.map((r) => ({ email: r.email, addedBy: r.added_by, createdAt: r.created_at }));
}

async function addPlatformAdmin(email, addedBy) {
  const normalized = requireString(email, "Email").toLowerCase();
  await query("INSERT INTO platform_admins (email, added_by) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING", [normalized, addedBy || null]);
  return { email: normalized };
}

async function removePlatformAdmin(email) {
  await query("DELETE FROM platform_admins WHERE email = $1", [(email || "").toLowerCase()]);
}

// Called once on server start (see server/index.js) - keeps
// PLATFORM_ADMIN_EMAILS as a self-healing bootstrap for platform_admins.
async function seedPlatformAdminsFromEnv(emails) {
  for (const email of emails) {
    await query("INSERT INTO platform_admins (email, added_by) VALUES ($1,'env') ON CONFLICT (email) DO NOTHING", [email.toLowerCase()]);
  }
}

// --- WhatsApp automation (Slice Five) ---------------------------------------

function toWhatsAppMessageJson(m) {
  return { id: m.id, orderId: m.order_id, direction: m.direction, phone: m.phone, body: m.body, status: m.status, messageType: m.message_type, createdAt: m.created_at };
}

async function recordWhatsAppMessage(businessId, { orderId, direction, phone, body, status, wasenderMessageId, messageType, campaignId }) {
  const { rows } = await query(
    `INSERT INTO whatsapp_messages (business_id, order_id, direction, phone, body, status, wasender_message_id, message_type, campaign_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [businessId || null, orderId || null, direction, phone, body || "", status || "sent", wasenderMessageId || null, messageType || "other", campaignId || null]
  );
  return toWhatsAppMessageJson(rows[0]);
}

async function updateWhatsAppMessageStatusByWasenderId(wasenderMessageId, status) {
  if (!wasenderMessageId) return;
  await query("UPDATE whatsapp_messages SET status = $1 WHERE wasender_message_id = $2", [status, wasenderMessageId]);
}

async function listWhatsAppMessages(businessId, orderId) {
  const conditions = ["business_id = $1"];
  const params = [businessId];
  if (orderId) {
    params.push(orderId);
    conditions.push(`order_id = $${params.length}`);
  }
  const { rows } = await query(`SELECT * FROM whatsapp_messages WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`, params);
  return rows.map(toWhatsAppMessageJson);
}

// Sends a payment reminder for a specific order via the platform WhatsApp
// number and logs it - used by the dashboard's "Follow up on payments" list
// as the real-send alternative to the existing wa.me deep-link flow.
async function assertWhatsAppQuotaAvailable(businessId) {
  const [used, limit] = await Promise.all([getWhatsAppUsage(businessId), effectiveWhatsAppLimit(businessId)]);
  if (used >= limit) throw new OrderError("You've used all your WhatsApp sends for this month. Upgrade your plan or buy more WhatsApp credits to keep sending.");
}

// stage (1/2/3) only varies the copy for the automated multi-touch
// follow-up (see isOrderDueForAutoReminder below) - the manual "Remind via
// WhatsApp" button in the dashboard calls this with no stage and keeps the
// original one-size "friendly reminder" text.
function reminderText({ stage, customerName, businessName, itemsText, currency, total }) {
  const amount = `${currency} ${total.toLocaleString()}`;
  if (stage === 2) {
    return `Hi ${customerName}, following up again on your order for ${itemsText} (${amount}) - it's still reserved for you. Reply here or complete payment to secure it.`;
  }
  if (stage === 3) {
    return `Hi ${customerName}, this is a final reminder about your pending order for ${itemsText} (${amount}) from ${businessName}. We'll release the stock if we don't hear back soon.`;
  }
  if (stage === 1) {
    return `Hi ${customerName}, just checking in - your order for ${itemsText} (${amount}) from ${businessName} is still pending payment. Let us know if you have any questions!`;
  }
  return `Hello ${customerName}, this is a friendly reminder from ${businessName} about your pending order for ${itemsText} (${amount}). Please complete payment so we can process it. Thank you!`;
}

async function sendPaymentReminder(businessId, orderId, whatsapp, messageType = "reminder", stage) {
  await assertWhatsAppQuotaAvailable(businessId);
  const { rows } = await query(
    `SELECT o.*, c.phone AS customer_phone, c.name AS customer_name FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.business_id = $2`,
    [orderId, businessId]
  );
  const order = rows[0];
  if (!order) throw new OrderError("Order not found");
  if (!order.customer_phone) throw new OrderError("This customer has no phone number on file");
  const { rows: businessRows } = await query("SELECT name, currency FROM businesses WHERE id = $1", [businessId]);
  const business = businessRows[0];
  const currency = business?.currency || "NGN";
  const total = Number(order.subtotal);
  const items = await loadItemsForOrder(orderId);
  const itemsText = items.map((i) => `${i.product_name} x ${i.qty}`).join(", ") || order.product_name;
  const text = reminderText({ stage, customerName: order.customer_name || "there", businessName: business?.name || "us", itemsText, currency, total });
  const result = await whatsapp.sendMessage(order.customer_phone, text);
  await recordWhatsAppMessage(businessId, { orderId, direction: "out", phone: order.customer_phone, body: text, status: result.status, wasenderMessageId: result.messageId, messageType });
  return { sent: true, phone: order.customer_phone };
}

// Best-effort, idempotent per order (checked via message_type, not the
// status-transition that triggered it, so Paid -> Packed -> Paid doesn't
// re-send) - callers in server/index.js call this unconditionally after any
// order-create/status-change that results in "Paid" and it silently no-ops
// if WhatsApp isn't configured, the order has no phone on file, or a
// confirmation was already sent. Errors are swallowed (logged, not thrown)
// so a WhatsApp hiccup never fails the underlying order operation.
// baseUrl (e.g. "https://sellpoint-beta-production.up.railway.app", built
// per-request from req.protocol/req.get("host") by the caller - same
// pattern already used for Paystack callback URLs elsewhere in
// server/index.js) is used to build a publicly fetchable receipt-image URL,
// since WasenderAPI's image attachments require a public URL, not base64.
async function sendPaidConfirmationIfNeeded(businessId, order, whatsapp, baseUrl) {
  if (!whatsapp.isConfigured() || !order || order.status !== "Paid") return;
  try {
    const { rows: existing } = await query("SELECT 1 FROM whatsapp_messages WHERE order_id = $1 AND message_type = 'paid_confirmation'", [order.id]);
    if (existing[0]) return;
    const [used, limit] = await Promise.all([getWhatsAppUsage(businessId), effectiveWhatsAppLimit(businessId)]);
    if (used >= limit) return; // over quota - silently skip, same as any other WhatsApp hiccup here
    const { rows: custRows } = await query("SELECT phone, name FROM customers WHERE id = $1", [order.customerId]);
    const customerPhone = custRows[0]?.phone;
    if (!customerPhone) return;
    const { rows: bizRows } = await query("SELECT name, currency FROM businesses WHERE id = $1", [businessId]);
    const business = bizRows[0];
    const total = Number(order.subtotal ?? Number(order.price) * order.qty);
    const itemsText = order.itemsSummary || `${order.productName} x ${order.qty}`;
    const text = `Hello ${custRows[0]?.name || "there"}, we've received your payment for ${itemsText} (${business?.currency || "NGN"} ${total.toLocaleString()}). Thank you for shopping with ${business?.name || "us"}!`;
    const imageUrl = baseUrl ? `${baseUrl}/api/receipts/${encodeURIComponent(order.id)}/image.png` : undefined;
    const result = await whatsapp.sendMessage(customerPhone, text, { imageUrl });
    await recordWhatsAppMessage(businessId, { orderId: order.id, direction: "out", phone: customerPhone, body: text, status: result.status, wasenderMessageId: result.messageId, messageType: "paid_confirmation" });
  } catch (err) {
    console.error("WhatsApp paid confirmation failed:", err.message);
  }
}

// Backs the public (unauthenticated) receipt-image endpoint that
// WasenderAPI's servers fetch when sending the paid-confirmation image -
// looked up by order id alone (no business scoping), same trust model as
// the order id itself: unguessable (timestamp + random hex, see uid()), not
// sequential/enumerable, so this is an acceptable exposure for a receipt
// image containing only that one order's own details.
async function getOrderReceiptInfo(orderId) {
  const { rows } = await query(
    `SELECT o.*, c.name AS customer_name, b.name AS business_name, b.currency
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     JOIN businesses b ON b.id = o.business_id
     WHERE o.id = $1`,
    [orderId]
  );
  const row = rows[0];
  if (!row) throw new OrderError("Order not found");
  const items = await loadItemsForOrder(orderId);
  return {
    businessName: row.business_name,
    items: items.length
      ? items.map((i) => ({ productName: i.product_name, qty: i.qty, unitPrice: Number(i.price) }))
      : [{ productName: row.product_name, qty: row.qty, unitPrice: Number(row.price) }],
    total: Number(row.subtotal ?? Number(row.price) * row.qty),
    currency: row.currency || "NGN",
    customerName: row.customer_name,
    orderId: row.id,
    date: new Date(row.created_at).toISOString().slice(0, 10),
  };
}

// Bulk-sends reminders for every Pending-payment order over 24h old with a
// phone on file, stopping early on what looks like a rate-limit error
// (rather than hammering the API and failing every remaining send too) -
// the free WasenderAPI trial this was built against is limited to 1
// request/minute, so a real business's whole overdue list often can't
// finish in one call; the caller reports how many sent vs. how many are
// left to retry.
async function sendAllReminders(businessId, whatsapp) {
  const { rows } = await query(
    `SELECT o.id FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = $1 AND o.status = 'Pending payment' AND c.phone IS NOT NULL AND c.phone != ''
       AND o.created_at < now() - interval '24 hours'
     ORDER BY o.created_at ASC`,
    [businessId]
  );
  const results = [];
  for (const row of rows) {
    try {
      await sendPaymentReminder(businessId, row.id, whatsapp);
      results.push({ orderId: row.id, sent: true });
    } catch (err) {
      results.push({ orderId: row.id, sent: false, error: err.message });
      if (/rate limit|too many|429|used all your WhatsApp sends/i.test(err.message)) break;
    }
  }
  return { total: rows.length, sent: results.filter((r) => r.sent).length, results };
}

// --- AI Automation: campaigns + proactive reminders (Slice Three item 3) --

// Resolves a campaign's audience spec to customers with a phone on file.
// "segment" reuses the same CRM segmentation shown as filter pills in the
// Customers tab; "overdue" reuses the same Pending-payment population as
// sendAllReminders but grouped by customer (one message per customer, not
// per order, since a customer with 3 overdue orders shouldn't get 3 texts).
async function resolveCampaignAudience(businessId, audience) {
  if (audience?.type === "all") {
    const { rows } = await query(
      `SELECT id, phone, name FROM customers WHERE business_id = $1 AND phone IS NOT NULL AND phone != ''`,
      [businessId]
    );
    return rows.map((r) => ({ customerId: r.id, phone: r.phone, name: r.name }));
  }
  if (audience?.type === "segment") {
    const valid = ["New", "At Risk", "VIP", "Repeat", "Active"];
    if (!valid.includes(audience.segment)) throw new OrderError("Invalid segment");
    const customers = await listCustomersWithSegments(businessId);
    return customers.filter((c) => c.segment === audience.segment && c.phone).map((c) => ({ customerId: c.id, phone: c.phone, name: c.name }));
  }
  if (audience?.type === "overdue") {
    const { rows } = await query(
      `SELECT DISTINCT c.id AS customer_id, c.phone, c.name FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = $1 AND o.status = 'Pending payment' AND c.phone IS NOT NULL AND c.phone != ''`,
      [businessId]
    );
    return rows.map((r) => ({ customerId: r.customer_id, phone: r.phone, name: r.name }));
  }
  throw new OrderError("Invalid audience type");
}

// Sends one composed message to every matching customer's WhatsApp, grouped
// under a single campaign_id so the send history can be reported as one
// batch. Stops early on quota/rate-limit (same shape as sendAllReminders)
// and reports partial success rather than throwing away completed sends.
async function sendCampaign(businessId, { audience, message }, whatsapp) {
  const text = requireString(message, "Message");
  const recipients = await resolveCampaignAudience(businessId, audience);
  const campaignId = crypto.randomUUID();
  const results = [];
  for (const r of recipients) {
    try {
      await assertWhatsAppQuotaAvailable(businessId);
      const personalized = text.replace(/\{name\}/g, r.name || "there");
      const result = await whatsapp.sendMessage(r.phone, personalized);
      await recordWhatsAppMessage(businessId, { orderId: null, direction: "out", phone: r.phone, body: personalized, status: result.status, wasenderMessageId: result.messageId, messageType: "campaign", campaignId });
      results.push({ customerId: r.customerId, sent: true });
    } catch (err) {
      results.push({ customerId: r.customerId, sent: false, error: err.message });
      if (/used all your WhatsApp sends|rate limit|too many|429/i.test(err.message)) break;
    }
  }
  return { campaignId, total: recipients.length, sent: results.filter((r) => r.sent).length, results };
}

// --- Recurring campaigns: a persisted, schedulable "Send Campaign" -----------
// The one-off sendCampaign() above is reused as-is by the scheduler once a
// campaign is due (see runRecurringCampaignScan in server/scheduler.js) -
// this section only adds the CRUD + "what's due" query around it.

function toRecurringCampaignJson(c) {
  return {
    id: c.id,
    name: c.name,
    message: c.message,
    audienceType: c.audience_type,
    segment: c.segment,
    frequency: c.frequency,
    enabled: c.enabled,
    lastSentAt: c.last_sent_at,
    createdAt: c.created_at,
  };
}

async function listRecurringCampaigns(businessId) {
  const { rows } = await query("SELECT * FROM recurring_campaigns WHERE business_id = $1 ORDER BY created_at DESC", [businessId]);
  return rows.map(toRecurringCampaignJson);
}

async function createRecurringCampaign(businessId, data) {
  const name = requireString(data.name, "Name");
  const message = requireString(data.message, "Message");
  const frequency = ["weekly", "monthly"].includes(data.frequency) ? data.frequency : null;
  if (!frequency) throw new OrderError("Frequency must be weekly or monthly");
  const audienceType = data.audienceType === "segment" ? "segment" : "all";
  const segment = audienceType === "segment" ? requireString(data.segment, "Segment") : null;
  const { rows } = await query(
    `INSERT INTO recurring_campaigns (business_id, name, message, audience_type, segment, frequency)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [businessId, name, message, audienceType, segment, frequency]
  );
  return toRecurringCampaignJson(rows[0]);
}

async function updateRecurringCampaign(businessId, id, data) {
  const { rows } = await query("SELECT * FROM recurring_campaigns WHERE id = $1 AND business_id = $2", [id, businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Recurring campaign not found");
  const name = data.name !== undefined ? requireString(data.name, "Name") : current.name;
  const message = data.message !== undefined ? requireString(data.message, "Message") : current.message;
  const frequency = data.frequency !== undefined ? data.frequency : current.frequency;
  if (!["weekly", "monthly"].includes(frequency)) throw new OrderError("Frequency must be weekly or monthly");
  const enabled = data.enabled !== undefined ? !!data.enabled : current.enabled;
  const { rows: updated } = await query(
    `UPDATE recurring_campaigns SET name=$1, message=$2, frequency=$3, enabled=$4 WHERE id=$5 AND business_id=$6 RETURNING *`,
    [name, message, frequency, enabled, id, businessId]
  );
  return toRecurringCampaignJson(updated[0]);
}

async function deleteRecurringCampaign(businessId, id) {
  const { rows } = await query("DELETE FROM recurring_campaigns WHERE id = $1 AND business_id = $2 RETURNING id", [id, businessId]);
  if (!rows[0]) throw new OrderError("Recurring campaign not found");
}

// Cross-business: called once per scheduler tick, same shape as
// listBusinessesWithAutoReminderEnabled. "Due" = never sent, or last sent
// longer ago than the campaign's own frequency window.
async function listDueRecurringCampaigns() {
  const { rows } = await query(
    `SELECT * FROM recurring_campaigns
     WHERE enabled = true
       AND (
         last_sent_at IS NULL
         OR (frequency = 'weekly' AND last_sent_at < now() - interval '7 days')
         OR (frequency = 'monthly' AND last_sent_at < now() - interval '30 days')
       )`
  );
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    message: r.message,
    audienceType: r.audience_type,
    segment: r.segment,
  }));
}

async function markRecurringCampaignSent(id) {
  await query("UPDATE recurring_campaigns SET last_sent_at = now() WHERE id = $1", [id]);
}
// Multi-touch, not one-shot: up to 3 reminders per order at increasing
// delays (1/3/7 days unpaid), then it stops entirely - matches a common
// payment-recovery cadence without feeling spammy. daysAfter (the
// business's configurable first-touch delay) only controls stage 1; stage
// 2/3 offsets are fixed constants so the settings UI doesn't need to grow
// three separate delay inputs. sentCount is how many auto_reminder rows
// already exist for this order (0/1/2), so this doubles as "which stage is
// next" - stage N is only offered once N-1 have already gone out.
const FOLLOW_UP_STAGE_DAYS = [null, 1, 3, 7]; // index 0 unused, stage 1/2/3
function isOrderDueForAutoReminder({ orderCreatedAt, lastAutoReminderAt, sentCount = 0, daysAfter, now = new Date() }) {
  if (sentCount >= 3) return false;
  const stage = sentCount + 1;
  const delayDays = stage === 1 ? daysAfter : FOLLOW_UP_STAGE_DAYS[stage];
  const anchor = lastAutoReminderAt ? new Date(lastAutoReminderAt) : new Date(orderCreatedAt);
  const cutoff = new Date(now.getTime() - delayDays * 24 * 60 * 60 * 1000);
  return anchor < cutoff;
}

async function listBusinessesWithAutoReminderEnabled() {
  const { rows } = await query("SELECT id, auto_reminder_days_after FROM businesses WHERE auto_reminder_enabled = true");
  return rows;
}

// Called by the scheduler (server/scheduler.js) once per business opted
// into auto-reminders. Fetches candidate orders with their last auto-reminder
// timestamp and how many have gone out so far, then filters in JS with
// isOrderDueForAutoReminder rather than duplicating the date math in SQL -
// keeps the eligibility rule in one place and independently unit-testable.
async function sendAutoRemindersForBusiness(businessId, daysAfter, whatsapp) {
  const { rows } = await query(
    `SELECT o.id, o.created_at, MAX(wm.created_at) AS last_auto_reminder_at, COUNT(wm.id)::int AS sent_count
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN whatsapp_messages wm ON wm.order_id = o.id AND wm.message_type = 'auto_reminder'
     WHERE o.business_id = $1 AND o.status = 'Pending payment' AND c.phone IS NOT NULL AND c.phone != ''
     GROUP BY o.id, o.created_at`,
    [businessId]
  );
  const due = rows.filter((r) => isOrderDueForAutoReminder({ orderCreatedAt: r.created_at, lastAutoReminderAt: r.last_auto_reminder_at, sentCount: r.sent_count, daysAfter }));
  const results = [];
  for (const row of due) {
    try {
      await assertWhatsAppQuotaAvailable(businessId);
      await sendPaymentReminder(businessId, row.id, whatsapp, "auto_reminder", row.sent_count + 1);
      results.push({ orderId: row.id, sent: true });
    } catch (err) {
      results.push({ orderId: row.id, sent: false, error: err.message });
      if (/used all your WhatsApp sends|rate limit|too many|429/i.test(err.message)) break;
    }
  }
  return { businessId, total: due.length, sent: results.filter((r) => r.sent).length };
}

// --- ShipBubble: real courier booking behind "SellersPoint Logistics" ------
// shipbubble client is passed in by the caller (server/index.js), same
// convention as sendPaymentReminder(businessId, orderId, whatsapp) - keeps
// db.js provider-agnostic rather than importing ./shipbubble directly.

async function setShipbubbleSenderAddress(businessId, addressCode) {
  const { rows } = await query("UPDATE businesses SET shipbubble_sender_address_code = $1 WHERE id = $2 RETURNING *", [addressCode, businessId]);
  if (!rows[0]) throw new OrderError("Business not found");
  return toBusinessJson(rows[0]);
}

// Computes a whole cart's shipping weight from each product's own stored
// weight (see the "weight" column on products) rather than asking the
// seller/customer to type one in - sum(product.weight * qty), floored at
// 1kg so a quote never fails just because every item in the cart has an
// unset/zero weight.
function computeCartWeight(items) {
  const total = items.reduce((sum, i) => sum + (Number(i.weight) || 0) * i.qty, 0);
  return Math.max(1, total);
}

// Quotes ShipBubble rates BEFORE the order exists (and before the customer
// pays) - so the customer can pay the real, accurate total (products +
// actual shipping cost) in one payment instead of paying an estimate now
// and a shipping top-up later. Takes the cart's items/customer directly
// (there's no order row yet) rather than looking them up by orderId, unlike
// the old post-order-creation rate fetch this replaces. Returns the raw
// ShipBubble response (request_token + couriers list) for the client to
// render and choose from; the client's choice then travels into
// createOrder (see above) to lock in the price.
// Shared by both getShipbubbleQuote (dashboard, existing customer) and
// getShipbubbleQuotePublic (storefront, no customer row yet) - resolves
// products into ShipBubble package_items with weight split proportionally
// by quantity (see computeCartWeight), validates the receiver address, and
// fetches rates. senderAddressCode/receiver are pre-resolved by the caller
// since dashboard and storefront look them up differently.
async function fetchShipbubbleQuoteRates(businessId, { items, senderAddressCode, receiverName, receiverEmail, receiverPhone, receiverAddress, dimensions, categoryId }, shipbubble) {
  const packageItems = [];
  const cartWithWeights = [];
  for (const item of items) {
    const qty = requireNumber(item.qty ?? 1, "Quantity", { min: 1, integer: true });
    const { rows: productRows } = await query("SELECT name, price, weight FROM products WHERE id = $1 AND business_id = $2", [item.productId, businessId]);
    const product = productRows[0];
    if (!product) throw new OrderError("Product not found");
    cartWithWeights.push({ weight: product.weight, qty });
    packageItems.push({ name: product.name, description: product.name, unit_weight: "0", unit_amount: String(product.price), quantity: String(qty) });
  }
  // ShipBubble wants a weight per item line, but this app only tracks one
  // total package weight (computeCartWeight) - split it proportionally by
  // quantity so the sum across lines still equals the real total, rather
  // than reporting a misleadingly precise per-product weight we don't have.
  const totalWeight = computeCartWeight(cartWithWeights);
  const totalQty = cartWithWeights.reduce((s, i) => s + i.qty, 0) || 1;
  packageItems.forEach((pi) => { pi.unit_weight = String((totalWeight / totalQty).toFixed(2)); });

  const receiver = await shipbubble.validateAddress({
    name: receiverName || "Customer",
    email: receiverEmail || "noemail@sellerspoint.ng",
    phone: receiverPhone || "",
    address: receiverAddress,
  });
  return shipbubble.fetchRates({
    senderAddressCode,
    receiverAddressCode: receiver.address_code,
    pickupDate: new Date().toISOString().slice(0, 10),
    categoryId,
    packageItems,
    packageDimension: dimensions || { length: 20, width: 20, height: 20 },
  });
}

async function getShipbubbleQuote(businessId, { items, customerId, receiverAddress, dimensions, categoryId }, shipbubble) {
  requireString(receiverAddress, "Delivery address");
  requireString(categoryId, "Package category");
  if (!Array.isArray(items) || !items.length) throw new OrderError("Add at least one product");
  const { rows: bizRows } = await query("SELECT shipbubble_sender_address_code FROM businesses WHERE id = $1", [businessId]);
  const senderAddressCode = bizRows[0]?.shipbubble_sender_address_code;
  if (!senderAddressCode) throw new OrderError("Set up your pickup address in Settings first");
  const { rows: customerRows } = await query("SELECT name, phone, email FROM customers WHERE id = $1 AND business_id = $2", [customerId, businessId]);
  const customer = customerRows[0];
  if (!customer) throw new OrderError("Customer not found");
  return fetchShipbubbleQuoteRates(businessId, {
    items, senderAddressCode, receiverName: customer.name, receiverEmail: customer.email, receiverPhone: customer.phone, receiverAddress, dimensions, categoryId,
  }, shipbubble);
}

// Public (unauthenticated) storefront variant - no customer row exists yet
// at quote time (that only happens at actual checkout, via
// findOrCreateCustomerByPhone), so the buyer's name/phone/email are passed
// straight through instead of looked up. categoryId defaults to a generic
// catch-all so anonymous storefront shoppers aren't asked to pick a
// ShipBubble package category themselves.
const STOREFRONT_DEFAULT_CATEGORY_ID = "20754594"; // "Light weight items"
async function getShipbubbleQuotePublic(slug, { items, buyerName, buyerEmail, buyerPhone, receiverAddress }, shipbubble) {
  requireString(receiverAddress, "Delivery address");
  if (!Array.isArray(items) || !items.length) throw new OrderError("Your cart is empty");
  const { rows } = await query("SELECT * FROM businesses WHERE lower(slug) = lower($1)", [slug]);
  const business = rows[0];
  if (!business || !business.storefront_enabled || !storefrontEnabledFor(effectivePlan(business))) {
    throw new OrderError("This storefront is not available");
  }
  const senderAddressCode = business.shipbubble_sender_address_code;
  if (!senderAddressCode) throw new OrderError("Shipping isn't set up for this store yet");
  const logistics = await getRawLogisticsSettings();
  if (!logistics.enabled) throw new OrderError("SellersPoint Logistics isn't available yet");
  return fetchShipbubbleQuoteRates(business.id, {
    items, senderAddressCode, receiverName: buyerName, receiverEmail: buyerEmail, receiverPhone: buyerPhone, receiverAddress,
    dimensions: { length: 20, width: 20, height: 20 }, categoryId: STOREFRONT_DEFAULT_CATEGORY_ID,
  }, shipbubble);
}

// Finalizes the real shipment using the courier already chosen and locked
// in at order-creation time (see createOrder + getShipbubbleQuote above) -
// no re-quoting, and delivery_fee is NOT recomputed here, since the
// customer already paid based on the quoted cost; this just turns that
// quote into a real, dispatched shipment. Clears the pending fields once
// booked so this can't be called twice for the same order.
async function bookShipbubbleShipment(businessId, orderId, shipbubble) {
  const { rows: existing } = await query(
    "SELECT shipbubble_pending_request_token, shipbubble_pending_service_code, shipbubble_pending_courier_id FROM orders WHERE id = $1 AND business_id = $2",
    [orderId, businessId]
  );
  const order = existing[0];
  if (!order) throw new OrderError("Order not found");
  if (!order.shipbubble_pending_request_token) throw new OrderError("This order has no shipping quote to book - it may already be booked, or was created before shipping was set up.");
  const shipment = await shipbubble.createShipment({
    requestToken: order.shipbubble_pending_request_token,
    serviceCode: order.shipbubble_pending_service_code,
    courierId: order.shipbubble_pending_courier_id,
  });
  const { rows } = await query(
    `UPDATE orders SET shipbubble_order_id=$1, shipbubble_tracking_url=$2, shipbubble_status=$3, shipbubble_courier_name=$4,
       shipbubble_pending_request_token=NULL, shipbubble_pending_service_code=NULL, shipbubble_pending_courier_id=NULL
     WHERE id=$5 AND business_id=$6 RETURNING *`,
    [shipment.order_id, shipment.tracking_url, shipment.status, shipment.courier?.name || null, orderId, businessId]
  );
  if (!rows[0]) throw new OrderError("Order not found");
  return toOrderJson({ ...rows[0], items: await loadItemsForOrder(orderId) });
}

// Manual "Refresh Tracking" pull - the courier's own tracking_code is null
// at booking time (only assigned once the courier processes the shipment),
// so this re-fetches current status + tracking_code on demand rather than
// relying on a webhook (deliberately out of scope for this pass).
async function refreshShipbubbleTracking(businessId, orderId, shipbubble) {
  const { rows: existing } = await query("SELECT shipbubble_order_id FROM orders WHERE id = $1 AND business_id = $2", [orderId, businessId]);
  const order = existing[0];
  if (!order) throw new OrderError("Order not found");
  if (!order.shipbubble_order_id) throw new OrderError("This order has no shipment booked yet");
  const shipment = await shipbubble.getShipment(order.shipbubble_order_id);
  const { rows } = await query(
    `UPDATE orders SET shipbubble_status=$1, shipbubble_tracking_code=$2
     WHERE id=$3 AND business_id=$4 RETURNING *`,
    [shipment?.status || null, shipment?.courier?.tracking_code || null, orderId, businessId]
  );
  return toOrderJson({ ...rows[0], items: await loadItemsForOrder(orderId) });
}

module.exports = {
  OrderError,
  healthCheck,
  recordWhatsAppMessage,
  updateWhatsAppMessageStatusByWasenderId,
  listWhatsAppMessages,
  sendPaymentReminder,
  sendPaidConfirmationIfNeeded,
  sendAllReminders,
  resolveCampaignAudience,
  sendCampaign,
  listRecurringCampaigns,
  createRecurringCampaign,
  updateRecurringCampaign,
  deleteRecurringCampaign,
  listDueRecurringCampaigns,
  markRecurringCampaignSent,
  isOrderDueForAutoReminder,
  listBusinessesWithAutoReminderEnabled,
  sendAutoRemindersForBusiness,
  computeSegments,
  setShipbubbleSenderAddress,
  getShipbubbleQuote,
  getShipbubbleQuotePublic,
  bookShipbubbleShipment,
  refreshShipbubbleTracking,
  getOrderReceiptInfo,
  EXPENSE_CATEGORIES,
  createExpense,
  listExpenses,
  deleteExpense,
  createFeedback,
  listFeedback,
  getCashbook,
  getProfitAndLoss,
  upsertReconciliation,
  listReconciliations,
  listCustomersWithSegments,
  addCustomerNote,
  deleteCustomerNote,
  getCustomerTimeline,
  createSupplier,
  listSuppliers,
  deleteSupplier,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrderStatus,
  deletePurchaseOrder,
  redeemLoyaltyPoints,
  adjustWallet,
  getProductByBarcode,
  createBatch,
  listBatches,
  deleteBatch,
  posCheckout,
  getMembership,
  createBusiness,
  getBusiness,
  getState,
  updateBusiness,
  activatePlan,
  grantBonusProMonths,
  redeemFounderCode,
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
  getLogisticsSettingsForAdmin,
  updateLogisticsSettings,
  getPublicLogisticsInfo,
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
  getBusinessDetailForAdmin,
  getDocsRegistration,
  saveRegistrationDetails,
  saveRegistrationShares,
  addRegistrationAffiliate,
  deleteRegistrationAffiliate,
  addRegistrationPsc,
  submitBusinessRegistration,
  hasPurchasedRegistrationPackage,
  listRegistrationQueue,
  advanceBusinessRegistration,
  listTrackers,
  createTracker,
  updateTracker,
  deleteTracker,
  listVaultItems,
  createVaultItem,
  listEmployees,
  createEmployee,
  deleteEmployee,
  listInvoices,
  createInvoice,
  listFilings,
  createFiling,
  isPlatformAdmin,
  listPlatformAdmins,
  addPlatformAdmin,
  removePlatformAdmin,
  seedPlatformAdminsFromEnv,
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
  updateStaffRole,
  removeStaff,
  effectiveStaffLimit,
  getAiUsage,
  incrementAiUsage,
  effectiveAiLimit,
  getWhatsAppUsage,
  effectiveWhatsAppLimit,
  getReceiptUsage,
  incrementReceiptUsage,
  listBranches,
  createBranch,
  deleteBranch,
  effectiveBranchLimit,
  getReports,
  getReportsChart,
  recordAddonPurchase,
};
