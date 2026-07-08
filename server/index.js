const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const db = require("./db");
const { requireAuthOnly, requireAuth, requirePlatformAdmin } = require("./auth");
const payments = require("./payments");
const pricing = require("./pricing");
const { PRICING } = pricing;

const app = express();
const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || "0.0.0.0";

app.use(
  express.json({
    limit: "5mb", // 5mb to allow base64 logo uploads
    verify: (req, res, buf) => {
      req.rawBody = buf; // needed to verify the Paystack webhook signature
    },
  })
);

// Static pages are served unauthenticated at the HTTP layer - auth now lives
// in a Supabase session inside the browser, which a plain navigation/address
// bar request has no way to attach as a header. Each page's own script
// checks for a session client-side and redirects to login.html if missing;
// the real enforcement is server-side, on the /api/* routes below.
app.use(express.static(ROOT));

// Every db.* call now hits Postgres (async), so a single async-aware wrapper
// covers all routes - a synchronous try/catch would return before an awaited
// rejection surfaces.
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof db.OrderError) {
        res.status(400).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: err.message || "Internal server error" });
      }
    }
  };
}

// Shared by the webhook and the verify-by-reference fallback (local dev has
// no public URL for Paystack to reach with a webhook, so the upgrade page's
// return leg calls /api/payments/verify/:reference to activate immediately).
// db.recordPayment() dedupes by reference so a plan is never double-activated
// if both paths fire for the same transaction.
async function finalizeIfSuccessful(txData) {
  if (!txData || txData.status !== "success") return false;
  const { reference, amount, metadata } = txData || {};
  const plan = metadata?.plan;
  const businessId = metadata?.businessId;
  if (!reference || !plan || !businessId) return false;
  const billingCycle = metadata?.billingCycle === "yearly" ? "yearly" : "monthly";
  const isNew = await db.recordPayment({
    businessId,
    provider: "paystack",
    reference,
    plan,
    billingCycle,
    amount: (amount || 0) / 100,
    status: "success",
    rawPayload: txData,
  });
  if (isNew) await db.activatePlan(businessId, plan, billingCycle);
  return isNew;
}

// Public by design: the Supabase anon key is meant to be embedded in
// browser code (it only grants what Supabase's own auth rules allow) - this
// just avoids hardcoding it into a checked-in file, so the same frontend
// works against whichever Supabase project the server is configured for.
app.get(
  "/api/config",
  handle(async (req, res) => {
    res.json({ supabaseUrl: process.env.SUPABASE_URL, supabaseAnonKey: process.env.SUPABASE_ANON_KEY });
  })
);

// --- Onboarding -------------------------------------------------------------

app.post(
  "/api/businesses",
  requireAuthOnly,
  handle(async (req, res) => {
    const business = await db.createBusiness(req.user.id, req.body || {}, req.user.email);
    res.status(201).json(business);
  })
);

app.get(
  "/api/me",
  requireAuthOnly,
  handle(async (req, res) => {
    const membership = await db.getMembership(req.user.id);
    if (!membership) return res.json({ user: { id: req.user.id, email: req.user.email }, business: null, role: null });
    const business = await db.getBusiness(membership.businessId);
    res.json({ user: { id: req.user.id, email: req.user.email }, business, role: membership.role });
  })
);

// --- Tenant-scoped app -------------------------------------------------------

app.get(
  "/api/state",
  requireAuth,
  handle(async (req, res) => res.json(await db.getState(req.businessId)))
);

app.put(
  "/api/business",
  requireAuth,
  handle(async (req, res) => res.json(await db.updateBusiness(req.businessId, req.body || {})))
);

app.get(
  "/api/owner",
  handle(async (req, res) => res.json(await db.getOwner()))
);
app.put(
  "/api/owner",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.updateOwner(req.body || {})))
);

app.post(
  "/api/products",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createProduct(req.businessId, req.body || {})))
);
app.delete(
  "/api/products/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteProduct(req.businessId, req.params.id);
    res.status(204).end();
  })
);

app.post(
  "/api/customers",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createCustomer(req.businessId, req.body || {})))
);
app.delete(
  "/api/customers/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteCustomer(req.businessId, req.params.id);
    res.status(204).end();
  })
);

app.post(
  "/api/orders",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createOrder(req.businessId, req.body || {})))
);
app.patch(
  "/api/orders/:id",
  requireAuth,
  handle(async (req, res) => res.json(await db.updateOrder(req.businessId, req.params.id, req.body || {})))
);
app.delete(
  "/api/orders/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteOrder(req.businessId, req.params.id);
    res.status(204).end();
  })
);

app.post(
  "/api/demo",
  requireAuth,
  handle(async (req, res) => {
    await db.loadDemoData(req.businessId);
    res.json(await db.getState(req.businessId));
  })
);
app.post(
  "/api/reset",
  requireAuth,
  handle(async (req, res) => {
    await db.resetData(req.businessId);
    res.json(await db.getState(req.businessId));
  })
);
app.get(
  "/api/pricing",
  handle(async (req, res) => {
    const settings = await db.getPlatformSettings();
    res.json(pricing.visibleTiers(settings.extendedPricingEnabled));
  })
);

// --- Staff seats (owner-only management, any member can view) --------------

app.get(
  "/api/staff",
  requireAuth,
  handle(async (req, res) => {
    const business = await db.getBusiness(req.businessId);
    const roster = await db.listStaff(req.businessId);
    res.json({ ...roster, limit: pricing.staffLimitFor(business.plan) });
  })
);
app.post(
  "/api/staff/invite",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can invite staff" });
    const roster = await db.inviteStaff(req.businessId, (req.body || {}).email);
    res.status(201).json(roster);
  })
);
app.delete(
  "/api/staff/invites/:email",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage staff" });
    res.json(await db.revokeInvite(req.businessId, req.params.email));
  })
);
app.delete(
  "/api/staff/:userId",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can remove staff" });
    res.json(await db.removeStaff(req.businessId, req.params.userId));
  })
);

// --- AI Tools (server-side so the monthly limit can't be bypassed) ---------

app.get(
  "/api/ai/usage",
  requireAuth,
  handle(async (req, res) => {
    const business = await db.getBusiness(req.businessId);
    res.json({ used: await db.getAiUsage(req.businessId), limit: pricing.aiLimitFor(business.plan) });
  })
);
app.post(
  "/api/ai/generate",
  requireAuth,
  handle(async (req, res) => {
    const { tool, productId, customerId, detail } = req.body || {};
    const state = await db.getState(req.businessId);
    const product = state.products.find((p) => p.id === productId);
    const customer = state.customers.find((c) => c.id === customerId);
    const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
    const revenue = state.orders.reduce((s, o) => s + (state.products.find((p) => p.id === o.productId)?.price || o.price || 0) * o.qty, 0);
    const tally = {};
    state.orders.forEach((o) => {
      const n = state.products.find((p) => p.id === o.productId)?.name || o.productName;
      if (n) tally[n] = (tally[n] || 0) + o.qty;
    });
    const bestSeller = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    const texts = {
      caption: `New arrival: ${product?.name || "our product"}.\n\nClean quality, fair price, and ready for fast delivery. Price: ${money(product?.price || 0)}.\n\nSend a message now to order before stock runs out.`,
      reply: `Hello ${customer?.name || "there"}, thanks for reaching out.\n\n${(detail || "").trim() || "Yes, this item is available."}\n\nI can reserve it for you now and send your invoice immediately.`,
      reminder: `Hello ${customer?.name || "there"}, this is a friendly reminder about your pending order.\n\nPlease complete payment so we can process delivery. Thank you for choosing us.`,
      summary: `Sales summary:\n\nTotal orders: ${state.orders.length}\nTotal recorded revenue: ${money(revenue)}\nBest-selling item: ${bestSeller || "Not enough sales yet"}\nPending payments: ${state.orders.filter((o) => o.status === "Pending payment").length}\n\nSuggested action: follow up pending payments and restock fast-moving products.`,
    };
    const text = texts[tool];
    if (!text) return res.status(400).json({ error: "Unknown AI tool" });
    const used = await db.incrementAiUsage(req.businessId);
    const business = await db.getBusiness(req.businessId);
    res.json({ text, used, limit: pricing.aiLimitFor(business.plan) });
  })
);

// --- Receipt Generator (free lead-magnet tool, separate from orders) -------

app.get(
  "/api/receipts/usage",
  requireAuth,
  handle(async (req, res) => {
    const business = await db.getBusiness(req.businessId);
    res.json({ used: await db.getReceiptUsage(req.businessId), limit: pricing.receiptLimitFor(business.plan) });
  })
);
app.post(
  "/api/receipts/generate",
  requireAuth,
  handle(async (req, res) => {
    const { customerName, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Add at least one item" });
    }
    const cleanItems = items.map((it) => ({
      name: String(it?.name || "").trim() || "Item",
      qty: Math.max(1, Number(it?.qty) || 1),
      price: Math.max(0, Number(it?.price) || 0),
    }));
    const total = cleanItems.reduce((s, it) => s + it.qty * it.price, 0);
    const used = await db.incrementReceiptUsage(req.businessId);
    const business = await db.getBusiness(req.businessId);
    const reference = "SP-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
    const receipt = {
      reference,
      businessName: business.businessName,
      businessLogo: business.businessLogo,
      businessPhone: business.businessPhone,
      businessAddress: business.businessAddress,
      customerName: String(customerName || "").trim(),
      items: cleanItems,
      total,
      issuedAt: new Date().toISOString(),
      poweredBy: "SellersPoint",
    };
    res.json({ receipt, used, limit: pricing.receiptLimitFor(business.plan) });
  })
);

// --- Reports (Growth+, depth increases with plan) ---------------------------

app.get(
  "/api/reports",
  requireAuth,
  handle(async (req, res) => {
    const business = await db.getBusiness(req.businessId);
    const tier = pricing.reportsTierFor(business.plan);
    if (tier === "none") {
      return res.status(403).json({ error: "Reports are available on the Growth plan and above" });
    }
    res.json(await db.getReports(req.businessId, tier));
  })
);

// --- Branches (Business+) -----------------------------------------------------

app.get(
  "/api/branches",
  requireAuth,
  handle(async (req, res) => res.json(await db.listBranches(req.businessId)))
);
app.post(
  "/api/branches",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createBranch(req.businessId, req.body || {})))
);
app.delete(
  "/api/branches/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteBranch(req.businessId, req.params.id);
    res.status(204).end();
  })
);

// --- Payments ----------------------------------------------------------------

app.post(
  "/api/payments/initialize",
  requireAuth,
  handle(async (req, res) => {
    const { plan, billingCycle } = req.body || {};
    const email = req.user.email; // already signed in - no need to re-collect it
    const settings = await db.getPlatformSettings();
    const visible = pricing.visibleTiers(settings.extendedPricingEnabled);
    if (!visible[plan] || plan === "starter") return res.status(400).json({ error: "Invalid plan" });
    if (visible[plan].monthly == null) return res.status(400).json({ error: "This plan requires contacting sales" });
    if (!payments.isConfigured()) {
      return res.status(400).json({ error: "Paystack is not configured on this server" });
    }
    const reference = `sp_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const callbackUrl = `${req.protocol}://${req.get("host")}/upgrade.html?reference=${reference}`;
    const cycle = billingCycle === "yearly" ? "yearly" : "monthly";
    const result = await payments.initializeTransaction({
      email,
      plan,
      billingCycle: cycle,
      reference,
      callbackUrl,
      businessId: req.businessId,
    });
    res.json({ authorizationUrl: result.authorizationUrl, amount: result.amount, reference });
  })
);

app.get(
  "/api/payments/verify/:reference",
  requireAuth,
  handle(async (req, res) => {
    const txData = await payments.verifyTransaction(req.params.reference);
    if (txData.metadata?.businessId && txData.metadata.businessId !== req.businessId) {
      return res.status(403).json({ error: "This payment does not belong to your business" });
    }
    const activated = await finalizeIfSuccessful(txData);
    const business = await db.getBusiness(req.businessId);
    res.json({ status: txData.status, activated, plan: business.plan });
  })
);

app.post(
  "/api/payments/webhook",
  handle(async (req, res) => {
    const signature = req.headers["x-paystack-signature"];
    if (!payments.verifyWebhookSignature(req.rawBody, signature)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    const event = req.body || {};
    if (event.event === "charge.success") await finalizeIfSuccessful(event.data);
    res.status(200).json({ received: true });
  })
);

// --- Platform admin (cross-tenant, SellersPoint's own operators only) -----------

app.get(
  "/api/admin/businesses",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.listAllBusinesses()))
);

app.get(
  "/api/admin/payments",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.listAllPayments()))
);

app.get(
  "/api/admin/settings",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.getPlatformSettings()))
);
app.put(
  "/api/admin/settings",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.updatePlatformSettings(req.body || {})))
);

app.listen(PORT, HOST, () => {
  console.log(`SellersPoint running at http://${HOST}:${PORT}`);
});
