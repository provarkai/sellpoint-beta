const { Pool } = require("pg");
const { orderLimitFor, staffLimitFor, aiLimitFor, multiBranchFor, receiptLimitFor } = require("./pricing");
const { ValidationError, requireString, requireNumber } = require("./validate");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

// Same class as validate.js's ValidationError - OrderError predates the
// validate module and covers non-input errors too (order limit reached,
// product not found), but both map to the same 400 response in
// server/index.js, so there's no reason for them to be different classes.
const OrderError = ValidationError;

async function query(text, params) {
  return pool.query(text, params);
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
    paymentProvider: b.payment_provider,
    paymentLink: b.payment_link,
    paymentDetails: b.payment_details,
    plan: effectivePlan(b),
    billingCycle: b.billing_cycle,
    planExpiresAt: b.plan_expires_at,
  };
}
function effectivePlan(b) {
  if (b.plan !== "starter" && b.plan_expires_at && new Date(b.plan_expires_at) < new Date()) return "starter";
  return b.plan;
}
function toProductJson(p) {
  return {
    id: p.id,
    name: p.name,
    price: Number(p.price),
    stock: p.stock,
    category: p.category,
    type: p.type,
    deliveryLink: p.delivery_link,
    deliveryNote: p.delivery_note,
  };
}
function toCustomerJson(c) {
  return { id: c.id, name: c.name, phone: c.phone, location: c.location };
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
    const { rows } = await client.query(
      `INSERT INTO businesses (name, phone) VALUES ($1, $2) RETURNING *`,
      [fields.businessName || "Your Business", fields.businessPhone || ""]
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

// Pro+ gated (see server/index.js) - deeper than the free dashboard
// summary: revenue by month, top products, top customers, order status mix.
async function getReports(businessId) {
  const [revenueByMonth, topProducts, topCustomers, statusBreakdown] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, SUM(price * qty) AS revenue
       FROM orders WHERE business_id = $1 AND status IN ('Paid', 'Delivered')
       GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
      [businessId]
    ),
    query(
      `SELECT product_name, SUM(qty) AS units, SUM(price * qty) AS revenue
       FROM orders WHERE business_id = $1
       GROUP BY product_name ORDER BY units DESC LIMIT 5`,
      [businessId]
    ),
    query(
      `SELECT c.name, SUM(o.price * o.qty) AS spend, COUNT(*) AS orders
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = $1 GROUP BY c.name ORDER BY spend DESC LIMIT 5`,
      [businessId]
    ),
    query(`SELECT status, COUNT(*) AS n FROM orders WHERE business_id = $1 GROUP BY status`, [businessId]),
  ]);
  return {
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

async function updateBusiness(businessId, fields) {
  const { rows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const current = rows[0];
  if (!current) throw new OrderError("Business not found");
  const merged = {
    name: fields.businessName ?? current.name,
    phone: fields.businessPhone ?? current.phone,
    logo: fields.businessLogo ?? current.logo,
    payment_provider: fields.paymentProvider ?? current.payment_provider,
    payment_link: fields.paymentLink ?? current.payment_link,
    payment_details: fields.paymentDetails ?? current.payment_details,
    plan: fields.plan ?? current.plan,
    billing_cycle: fields.billingCycle ?? current.billing_cycle,
    plan_expires_at: fields.planExpiresAt !== undefined ? fields.planExpiresAt : current.plan_expires_at,
  };
  const { rows: updated } = await query(
    `UPDATE businesses SET name=$1, phone=$2, logo=$3, payment_provider=$4, payment_link=$5,
       payment_details=$6, plan=$7, billing_cycle=$8, plan_expires_at=$9
     WHERE id = $10 RETURNING *`,
    [
      merged.name,
      merged.phone,
      merged.logo,
      merged.payment_provider,
      merged.payment_link,
      merged.payment_details,
      merged.plan,
      merged.billing_cycle,
      merged.plan_expires_at,
      businessId,
    ]
  );
  return toBusinessJson(updated[0]);
}

async function activatePlan(businessId, plan, billingCycle) {
  const now = new Date();
  const expires = new Date(now);
  if (billingCycle === "yearly") expires.setFullYear(expires.getFullYear() + 1);
  else expires.setMonth(expires.getMonth() + 1);
  await updateBusiness(businessId, { plan, billingCycle, planExpiresAt: expires.toISOString() });
  await logEvent(businessId, "plan_upgraded", `${plan} (${billingCycle})`);
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

async function getPlatformSettings() {
  const { rows } = await query("SELECT extended_pricing_enabled FROM platform_settings WHERE id = 1");
  return { extendedPricingEnabled: !!rows[0]?.extended_pricing_enabled };
}

async function updatePlatformSettings(fields) {
  const current = await getPlatformSettings();
  const enabled = fields.extendedPricingEnabled !== undefined ? !!fields.extendedPricingEnabled : current.extendedPricingEnabled;
  await query("UPDATE platform_settings SET extended_pricing_enabled = $1 WHERE id = 1", [enabled]);
  return { extendedPricingEnabled: enabled };
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

async function inviteStaff(businessId, email) {
  const clean = requireString(email, "Email").toLowerCase();
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = staffLimitFor(effectivePlan(businessRows[0]));
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

async function incrementAiUsage(businessId) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const limit = aiLimitFor(effectivePlan(businessRows[0]));
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

// --- Branches (Business tier+) ---------------------------------------------

function toBranchJson(b) {
  return { id: b.id, name: b.name, address: b.address, createdAt: b.created_at };
}

async function listBranches(businessId) {
  const { rows } = await query("SELECT * FROM branches WHERE business_id = $1 ORDER BY created_at", [businessId]);
  return rows.map(toBranchJson);
}

async function createBranch(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  if (!multiBranchFor(effectivePlan(businessRows[0]))) throw new OrderError("Multiple branches require the Business plan");
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

async function createProduct(businessId, data) {
  const name = requireString(data.name, "Product name");
  const price = requireNumber(data.price, "Price", { min: 0 });
  const stock = requireNumber(data.stock, "Stock", { min: 0, integer: true });
  const id = uid("p");
  const { rows } = await query(
    `INSERT INTO products (id, business_id, name, price, stock, category, type, delivery_link, delivery_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      id,
      businessId,
      name,
      price,
      stock,
      data.category || "",
      data.type || "Product",
      data.deliveryLink || "",
      data.deliveryNote || "",
    ]
  );
  await logEvent(businessId, "item_created", name);
  return toProductJson(rows[0]);
}

async function deleteProduct(businessId, id) {
  await query("DELETE FROM products WHERE id = $1 AND business_id = $2", [id, businessId]);
}

async function createCustomer(businessId, data) {
  const name = requireString(data.name, "Customer name");
  const id = uid("c");
  const phone = String(data.phone || "").replace(/\D/g, "");
  await query(
    "INSERT INTO customers (id, business_id, name, phone, location) VALUES ($1,$2,$3,$4,$5)",
    [id, businessId, name, phone, data.location || ""]
  );
  await logEvent(businessId, "customer_created", name);
  return toCustomerJson({ id, name, phone, location: data.location || "" });
}

async function deleteCustomer(businessId, id) {
  await query("DELETE FROM customers WHERE id = $1 AND business_id = $2", [id, businessId]);
}

// --- Orders ---------------------------------------------------------------

async function createOrder(businessId, data) {
  const { rows: businessRows } = await query("SELECT * FROM businesses WHERE id = $1", [businessId]);
  const business = businessRows[0];
  const { rows: countRows } = await query("SELECT COUNT(*)::int AS n FROM orders WHERE business_id = $1", [businessId]);
  const limit = orderLimitFor(effectivePlan(business));
  if (countRows[0].n >= limit) throw new OrderError("Order limit reached for the current plan");

  const { rows: productRows } = await query("SELECT * FROM products WHERE id = $1 AND business_id = $2", [
    data.productId,
    businessId,
  ]);
  const product = productRows[0];
  if (!product) throw new OrderError("Product not found");
  const qty = requireNumber(data.qty ?? 1, "Quantity", { min: 1, integer: true });
  if (qty > product.stock) throw new OrderError("Not enough stock");

  await query("UPDATE products SET stock = $1 WHERE id = $2", [product.stock - qty, product.id]);
  const id = uid("o");
  const { rows } = await query(
    `INSERT INTO orders (id, business_id, product_id, product_name, product_type, customer_id, qty, price, status, delivered)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false) RETURNING *`,
    [id, businessId, product.id, product.name, product.type, data.customerId, qty, product.price, data.status || "Pending payment"]
  );
  await logEvent(businessId, "order_created", `${product.name} x ${qty}`);
  return toOrderJson(rows[0]);
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

// --- Platform-admin (cross-tenant) -------------------------------------------

async function listAllBusinesses() {
  const { rows } = await query(`
    SELECT b.*,
      (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) AS order_count,
      (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customer_count
    FROM businesses b ORDER BY b.created_at DESC
  `);
  return rows.map((b) => ({ ...toBusinessJson(b), orderCount: Number(b.order_count), customerCount: Number(b.customer_count) }));
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
  getMembership,
  createBusiness,
  getBusiness,
  getState,
  updateBusiness,
  activatePlan,
  getOwner,
  updateOwner,
  getPlatformSettings,
  updatePlatformSettings,
  createProduct,
  deleteProduct,
  createCustomer,
  deleteCustomer,
  createOrder,
  updateOrder,
  deleteOrder,
  resetData,
  loadDemoData,
  recordPayment,
  listPayments,
  getPaymentByReference,
  listAllBusinesses,
  listAllPayments,
  listStaff,
  inviteStaff,
  revokeInvite,
  removeStaff,
  getAiUsage,
  incrementAiUsage,
  getReceiptUsage,
  incrementReceiptUsage,
  listBranches,
  createBranch,
  deleteBranch,
  getReports,
};
