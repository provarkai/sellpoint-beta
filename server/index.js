const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const Sentry = require("@sentry/node");
const rateLimit = require("express-rate-limit");
const db = require("./db");
const { CURRENCIES } = require("./currencies");
const { requireAuthOnly, requireAuth, requirePlatformAdmin, supabaseAdmin } = require("./auth");
const payments = require("./payments");
const pricing = require("./pricing");
const ai = require("./ai");

// Optional - error monitoring. Falls back to console.error-only (already
// happening in handle() below) when SENTRY_DSN isn't set, same
// graceful-degradation pattern as the Paystack/OpenRouter keys.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

const app = express();
const ROOT = path.join(__dirname, "..");
const PORT = process.env.PORT || 5174;
const HOST = process.env.HOST || "0.0.0.0";

// Deploy targets (Railway/Render) sit behind a reverse proxy - without this,
// express-rate-limit sees every request as coming from the proxy's IP and
// either rate-limits everyone together or refuses to start.
app.set("trust proxy", 1);

// Security headers (clickjacking/MIME-sniffing/HSTS/etc.). CSP is
// deliberately left off: this app relies on inline onclick="..." handlers
// throughout every page (not a build step that could add nonces easily),
// so a real Content-Security-Policy would need `unsafe-inline` for
// script-src anyway - which defeats most of what CSP is for - or a much
// larger refactor away from inline handlers first. Cross-Origin-*-Policy
// headers are also disabled since they can silently break the CDN scripts
// (jsPDF/html2canvas/XLSX/QRCode/Supabase-via-esm.sh) and Google OAuth
// redirect flow this app depends on, and there's no way to verify that
// breakage without a real browser.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginOpenerPolicy: false }));

// General ceiling across the whole API (well above real usage, just a
// backstop against scraping/abuse) - the webhook is excluded since Paystack
// is a legitimate high-volume caller, not a user. req.path inside a
// middleware mounted via app.use("/api", apiLimiter) is relative to that
// mount point (e.g. "/payments/webhook", not "/api/payments/webhook") -
// req.originalUrl still has the full path regardless of mounting, so that's
// what this must compare against or the skip silently never matches.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => { const p = canonicalApiPath(req); return p === "/api/payments/webhook" || p === "/api/health"; },
});
// Business/account creation is the highest-value target for spam signups.
const createBusinessLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many accounts created from this device - try again later." } });
// Public, unauthenticated form - same spam-resistance shape as account creation.
const waitlistLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions from this device - try again later." } });
// Fires on every page view, so it needs real headroom - still bounded so it
// can't be used to flood the analytics_events table.
const trackLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

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
// no-cache (not no-store) so the browser still sends a conditional request
// and can use a 304 - this app ships frequent small JS/CSS fixes, and a
// stale cached script silently running old logic is worse than one extra
// revalidation round trip per load.
app.use(express.static(ROOT, { etag: true, lastModified: true, cacheControl: true, maxAge: 0, setHeaders: (res) => res.setHeader("Cache-Control", "no-cache") }));

// API versioning: /api/v1/* is an alias for /api/* - same routes, same
// behavior. This exists so future external integrations (Slice Four/Five
// payment/marketplace partners) have a stable versioned base to build
// against from day one, instead of depending on an unprefixed path that
// could change shape later with nothing to fall back to. The existing
// frontend keeps calling unprefixed /api/* untouched - nothing about its
// behavior changes. A real v2, if a genuinely breaking change is ever
// needed, would get its own explicit route definitions rather than this
// alias. Rewriting req.url (not req.originalUrl - Express keeps that as the
// true incoming path regardless) means downstream code that compares
// req.originalUrl against a specific path must go through
// canonicalApiPath() below, or a versioned call silently bypasses it.
app.use((req, res, next) => {
  if (req.url === "/api/v1" || req.url.startsWith("/api/v1/")) req.url = "/api" + req.url.slice("/api/v1".length);
  next();
});
function canonicalApiPath(req) {
  return req.originalUrl.replace(/^\/api\/v1(\/|$)/, "/api$1");
}

app.use("/api", apiLimiter);

// Audit trail for authenticated mutating actions - "who did what, when".
// Registered here (not as a per-route middleware) so it doesn't need adding
// to every single route definition; res.on("finish") fires after the whole
// pipeline (including whichever per-route auth middleware ran) completes,
// so req.user/req.businessId are already populated by then if the route is
// authenticated. Unauthenticated mutations (waitlist signup, storefront
// checkout) are intentionally not logged here - they're already covered by
// the separate analytics_events tracking, and there's no user to attribute
// them to anyway.
app.use((req, res, next) => {
  res.on("finish", () => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
    if (!req.user) return;
    if (canonicalApiPath(req) === "/api/track") return;
    db.recordAuditLog({
      userId: req.user.id,
      businessId: req.businessId || null,
      method: req.method,
      path: canonicalApiPath(req),
      statusCode: res.statusCode,
    }).catch((err) => console.error("Audit log write failed:", err.message));
  });
  next();
});

// Clean shareable storefront URLs (/store/my-shop) instead of a query
// string - store.js reads the slug back out of location.pathname. Static
// serving above already ran and found nothing at this path, so this always
// falls through to here for any /store/* request.
app.get("/store/:slug", (req, res) => res.sendFile(path.join(ROOT, "store.html")));

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
        if (process.env.SENTRY_DSN) Sentry.captureException(err);
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
  const businessId = metadata?.businessId;
  if (!reference || !businessId) return false;

  // Add-on purchases (one-off, no plan/billingCycle in metadata) fulfill
  // differently from plan upgrades - recorded in the same payments table
  // for a unified audit trail, but plan is a synthetic "addon:<type>" tag
  // rather than a real tier, and there's no activatePlan step.
  if (metadata?.addonType) {
    const isNew = await db.recordPayment({
      businessId,
      provider: "paystack",
      reference,
      plan: `addon:${metadata.addonType}`,
      billingCycle: "onetime",
      amount: (amount || 0) / 100,
      status: "success",
      rawPayload: txData,
    });
    if (isNew) await db.recordAddonPurchase(businessId, metadata.addonType);
    return isNew;
  }

  // A storefront customer paying for their own cart online - orderId here
  // is a comma-joined list (a cart can be several products/orders in one
  // Paystack transaction). Marks each one Paid; doesn't touch plan/billing.
  if (metadata?.orderId) {
    const isNew = await db.recordPayment({
      businessId,
      provider: "paystack",
      reference,
      plan: "storefront_order",
      billingCycle: "onetime",
      amount: (amount || 0) / 100,
      status: "success",
      rawPayload: txData,
    });
    if (isNew) {
      for (const orderId of metadata.orderId.split(",")) {
        await db.updateOrder(businessId, orderId, { markPaid: true }).catch(() => {});
      }
    }
    return isNew;
  }

  const plan = metadata?.plan;
  if (!plan) return false;
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
  if (isNew) {
    await db.activatePlan(businessId, plan, billingCycle);
    await db.rewardReferrerIfEligible(businessId).catch((err) => console.error("Referral reward failed:", err.message));
  }
  return isNew;
}

// Public - point an external uptime monitor (UptimeRobot, Better Stack,
// etc.) at this. Does a real DB round trip so it catches a dead Postgres
// connection, not just "the Node process is still running".
app.get(
  "/api/health",
  handle(async (req, res) => {
    await db.healthCheck();
    res.json({ status: "ok", time: new Date().toISOString() });
  })
);

// Public - top-of-funnel analytics beacon (landing views, signup
// completion, storefront traffic). No auth, no PII - session_id is a
// random client-generated token, not tied to identity.
app.post(
  "/api/track",
  trackLimiter,
  handle(async (req, res) => {
    const { eventType, path, sessionId, meta } = req.body || {};
    await db.trackEvent({ eventType, path, sessionId, meta });
    res.status(204).end();
  })
);

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

// Public - powers the social icons in the landing page footer.
app.get(
  "/api/social-links",
  handle(async (req, res) => res.json(await db.getPublicSocialLinks()))
);

// --- Founding Members waitlist (pre-launch growth capture) -----------------

app.post(
  "/api/waitlist",
  waitlistLimiter,
  handle(async (req, res) => {
    const entry = await db.createWaitlistEntry(req.body || {});
    res.status(201).json(entry);
  })
);

app.get(
  "/api/waitlist/stats",
  handle(async (req, res) => res.json(await db.getWaitlistStats()))
);

// --- Onboarding -------------------------------------------------------------

app.post(
  "/api/businesses",
  createBusinessLimiter,
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

app.post(
  "/api/business/downgrade",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can change the plan" });
    res.json(await db.downgradeToStarter(req.businessId));
  })
);

// Real-customer referral program - any team member can see/share the link,
// not just the owner (this is separate from the pre-launch waitlist's own
// referral system on founding-members.html).
app.get(
  "/api/business/referral",
  requireAuth,
  handle(async (req, res) => res.json({ referralCode: await db.getOrCreateReferralCode(req.businessId) }))
);

// Owner-only - "who did what" for this business's own team, not visible to
// staff (matches the same owner-only gating as staff/payment management).
app.get(
  "/api/audit-log",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can view the activity log" });
    res.json(await db.listAuditLog(req.businessId));
  })
);

// --- Public storefront (Growth+) --------------------------------------------

app.put(
  "/api/business/storefront",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can change storefront settings" });
    res.json(await db.updateStorefrontSettings(req.businessId, req.body || {}));
  })
);

// Public, no auth - this is the page a business's customers land on.
app.get(
  "/api/store/:slug",
  handle(async (req, res) => {
    const storefront = await db.getStorefront(req.params.slug);
    if (!storefront) return res.status(404).json({ error: "Storefront not found" });
    res.json(storefront);
  })
);

// --- Seller online payments (optional - manual bank transfer stays the ------
// --- default and always available) ------------------------------------------

app.get(
  "/api/paystack/banks",
  requireAuth,
  handle(async (req, res) => {
    if (!payments.isConfigured()) return res.status(400).json({ error: "Paystack is not configured on this server" });
    res.json(await payments.listBanks());
  })
);

app.post(
  "/api/paystack/resolve-account",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can set up online payments" });
    if (!payments.isConfigured()) return res.status(400).json({ error: "Paystack is not configured on this server" });
    const { accountNumber, bankCode } = req.body || {};
    if (!accountNumber || !bankCode) return res.status(400).json({ error: "Account number and bank are required" });
    res.json(await payments.resolveAccount(accountNumber, bankCode));
  })
);

app.post(
  "/api/business/paystack-subaccount",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can set up online payments" });
    if (!payments.isConfigured()) return res.status(400).json({ error: "Paystack is not configured on this server" });
    const { bankCode, bankName, accountNumber } = req.body || {};
    if (!bankCode || !bankName || !accountNumber) return res.status(400).json({ error: "Bank, account number, and bank name are required" });
    const business = await db.getBusiness(req.businessId);
    const { accountName } = await payments.resolveAccount(accountNumber, bankCode);
    const { subaccountCode } = await payments.createSubaccount({ businessName: business.businessName, bankCode, accountNumber });
    res.json(await db.saveSubaccountDetails(req.businessId, { subaccountCode, bankCode, bankName, accountNumber, accountName }));
  })
);

app.put(
  "/api/business/payment-settings",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can change payment settings" });
    res.json(await db.updatePaymentSettings(req.businessId, req.body || {}));
  })
);

// Public, no auth - a storefront visitor previewing a coupon against their
// cart before checkout. Doesn't consume a use - that only happens once an
// order is actually placed through /checkout below.
app.post(
  "/api/store/:slug/apply-coupon",
  handle(async (req, res) => {
    const { code, subtotal } = req.body || {};
    const result = await db.validateCoupon(req.params.slug, code, Number(subtotal) || 0);
    res.json(result);
  })
);

// Public, no auth - a storefront visitor paying for their cart online.
app.post(
  "/api/store/:slug/checkout",
  handle(async (req, res) => {
    if (!payments.isConfigured()) return res.status(400).json({ error: "Online payment is not available right now" });
    const { items, buyerName, buyerPhone, buyerEmail, buyerLocation, couponCode } = req.body || {};
    const result = await db.checkoutStorefront(req.params.slug, { items, buyerName, buyerPhone, buyerEmail, buyerLocation, couponCode });
    const reference = `spord_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const callbackUrl = `${req.protocol}://${req.get("host")}/store/${req.params.slug}?reference=${reference}`;
    const initialized = await payments.initializeStorefrontCheckout({
      email: result.email,
      amountNaira: result.total,
      absorbFees: result.absorbFees,
      subaccountCode: result.subaccountCode,
      reference,
      callbackUrl,
      businessId: result.businessId,
      orderId: result.orderIds.join(","),
      plan: result.plan,
    });
    res.json({ authorizationUrl: initialized.authorizationUrl, amount: initialized.amount, reference });
  })
);

// Generates a one-off Paystack payment link for an existing order created
// directly in the dashboard (not through the public storefront cart), so
// the seller can send it over WhatsApp alongside/instead of manual bank
// details on the "Pending payment" message.
app.post(
  "/api/orders/:id/payment-link",
  requireAuth,
  handle(async (req, res) => {
    if (!payments.isConfigured()) return res.status(400).json({ error: "Online payment is not available right now" });
    const info = await db.getOrderForPaymentLink(req.businessId, req.params.id);
    const reference = `spord_link_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const callbackUrl = `${req.protocol}://${req.get("host")}/app.html`;
    const initialized = await payments.initializeStorefrontCheckout({
      email: info.email,
      amountNaira: info.amountNaira,
      absorbFees: info.absorbFees,
      subaccountCode: info.subaccountCode,
      reference,
      callbackUrl,
      businessId: req.businessId,
      orderId: req.params.id,
      plan: info.plan,
    });
    res.json({ authorizationUrl: initialized.authorizationUrl });
  })
);

// --- Storefront coupon codes -------------------------------------------------

app.get(
  "/api/coupons",
  requireAuth,
  handle(async (req, res) => res.json(await db.listCoupons(req.businessId)))
);
app.post(
  "/api/coupons",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage coupons" });
    res.status(201).json(await db.createCoupon(req.businessId, req.body || {}));
  })
);
app.patch(
  "/api/coupons/:id",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage coupons" });
    res.json(await db.setCouponActive(req.businessId, req.params.id, (req.body || {}).active));
  })
);
app.delete(
  "/api/coupons/:id",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage coupons" });
    await db.deleteCoupon(req.businessId, req.params.id);
    res.status(204).end();
  })
);

// --- Logistics providers (dispatch/courier credentials, generic) -----------

app.get(
  "/api/logistics",
  requireAuth,
  handle(async (req, res) => res.json(await db.listLogisticsProviders(req.businessId)))
);
app.post(
  "/api/logistics",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage logistics providers" });
    res.status(201).json(await db.createLogisticsProvider(req.businessId, req.body || {}));
  })
);
app.delete(
  "/api/logistics/:id",
  requireAuth,
  handle(async (req, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the business owner can manage logistics providers" });
    await db.deleteLogisticsProvider(req.businessId, req.params.id);
    res.status(204).end();
  })
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
app.put(
  "/api/products/:id",
  requireAuth,
  handle(async (req, res) => res.json(await db.updateProduct(req.businessId, req.params.id, req.body || {})))
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

// --- CRM depth: customer timelines, smart segmentation -----------------------

app.get(
  "/api/customers/segments",
  requireAuth,
  handle(async (req, res) => res.json(await db.listCustomersWithSegments(req.businessId)))
);
app.get(
  "/api/customers/:id/timeline",
  requireAuth,
  handle(async (req, res) => res.json(await db.getCustomerTimeline(req.businessId, req.params.id)))
);
app.post(
  "/api/customers/:id/notes",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.addCustomerNote(req.businessId, req.params.id, (req.body || {}).note)))
);
app.delete(
  "/api/customers/:customerId/notes/:noteId",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteCustomerNote(req.businessId, req.params.noteId);
    res.status(204).end();
  })
);

// --- Suppliers & purchase orders ---------------------------------------------

app.get(
  "/api/suppliers",
  requireAuth,
  handle(async (req, res) => res.json(await db.listSuppliers(req.businessId)))
);
app.post(
  "/api/suppliers",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createSupplier(req.businessId, req.body || {})))
);
app.delete(
  "/api/suppliers/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteSupplier(req.businessId, req.params.id);
    res.status(204).end();
  })
);
app.get(
  "/api/purchase-orders",
  requireAuth,
  handle(async (req, res) => res.json(await db.listPurchaseOrders(req.businessId)))
);
app.post(
  "/api/purchase-orders",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createPurchaseOrder(req.businessId, req.body || {})))
);
app.get(
  "/api/purchase-orders/:id",
  requireAuth,
  handle(async (req, res) => res.json(await db.getPurchaseOrder(req.businessId, req.params.id)))
);
app.patch(
  "/api/purchase-orders/:id",
  requireAuth,
  handle(async (req, res) => res.json(await db.updatePurchaseOrderStatus(req.businessId, req.params.id, (req.body || {}).status)))
);
app.delete(
  "/api/purchase-orders/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deletePurchaseOrder(req.businessId, req.params.id);
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
app.post(
  "/api/orders/:id/convert",
  requireAuth,
  handle(async (req, res) => res.json(await db.convertQuoteToOrder(req.businessId, req.params.id)))
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
    res.json(pricing.applyPricingOverrides(settings.pricingOverrides));
  })
);
app.get(
  "/api/currencies",
  handle(async (req, res) => res.json(CURRENCIES))
);

// --- Staff seats (owner-only management, any member can view) --------------

app.get(
  "/api/staff",
  requireAuth,
  handle(async (req, res) => {
    const roster = await db.listStaff(req.businessId);
    res.json({ ...roster, limit: await db.effectiveStaffLimit(req.businessId) });
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
    res.json({ used: await db.getAiUsage(req.businessId), limit: await db.effectiveAiLimit(req.businessId) });
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
    const currency = state.business.currency || "NGN";
    const currencyLocale = CURRENCIES[currency]?.locale || "en-NG";
    const money = (n) => currency + " " + Number(n || 0).toLocaleString(currencyLocale);
    // "description" is used from the product setup form before the product
    // is saved (no productId yet), so it reads name/price/category/type
    // straight off the request body with the saved product as a fallback.
    const draftName = req.body.name || product?.name || "this product";
    const draftType = req.body.type || product?.type || "Product";
    const draftCategory = req.body.category || product?.category || "";
    const draftPrice = req.body.price ?? product?.price ?? 0;
    const draftExtra = (detail || "").trim();
    // "Paid revenue" means what it says - Quotes aren't real sales yet and
    // Refunded orders no longer are, so both are excluded here (and from
    // the best-seller tally below) so the AI never states an inflated
    // number as fact.
    const revenue = state.orders.filter((o) => ["Paid", "Delivered"].includes(o.status)).reduce((s, o) => s + (state.products.find((p) => p.id === o.productId)?.price || o.price || 0) * o.qty, 0);
    const tally = {};
    state.orders.forEach((o) => {
      if (o.status === "Quote" || o.status === "Refunded") return;
      const n = state.products.find((p) => p.id === o.productId)?.name || o.productName;
      if (n) tally[n] = (tally[n] || 0) + o.qty;
    });
    const bestSeller = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    // "ask" answers free-form questions about the business ("Who owes me
    // money?", "What should I restock?") using real state, not a canned
    // message - this backs the AI Assistant chat, matching what the landing
    // page's chat mockup demonstrates.
    const question = (req.body.question || "").trim();
    const pending = state.orders.filter((o) => o.status === "Pending payment");
    const owedByCustomer = {};
    pending.forEach((o) => {
      const name = state.customers.find((c) => c.id === o.customerId)?.name || "a customer";
      const amt = (state.products.find((p) => p.id === o.productId)?.price || o.price || 0) * o.qty;
      owedByCustomer[name] = (owedByCustomer[name] || 0) + amt;
    });
    const lowStock = state.products.filter((p) => p.stock < 5);
    function askFallback(q) {
      const lower = q.toLowerCase();
      if (/owe|pending|unpaid/.test(lower)) {
        const entries = Object.entries(owedByCustomer);
        return entries.length ? "Customers who owe you money: " + entries.map(([n, a]) => `${n} (${money(a)})`).join(", ") + "." : "No one currently owes you money - all orders are paid up.";
      }
      if (/restock|low stock|running out/.test(lower)) {
        return lowStock.length ? "Restock soon: " + lowStock.map((p) => `${p.name} (${p.stock} left)`).join(", ") + "." : "Nothing is low on stock right now.";
      }
      if (/best.?sell|top product|sold best|popular/.test(lower)) {
        return bestSeller ? `Your best-selling item is ${bestSeller}.` : "Not enough sales yet to tell what's selling best.";
      }
      if (/summar|how.*(doing|business)|today|revenue/.test(lower)) {
        return `You have ${state.orders.length} orders on record and ${money(revenue)} in paid revenue so far.`;
      }
      return `I can help with questions about payments, restocking, and top sellers. Right now: ${state.orders.length} orders, ${money(revenue)} paid revenue, best seller ${bestSeller || "none yet"}, ${pending.length} orders pending payment.`;
    }
    // "insight" - a single trend-based observation for the dashboard,
    // comparing each product's units sold in the last 7 days against the
    // 7 days before that. Real data, not a canned message.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const recentQty = {}, previousQty = {};
    state.orders.forEach((o) => {
      const t = new Date(o.createdAt).getTime();
      const name = state.products.find((p) => p.id === o.productId)?.name || o.productName;
      if (!name) return;
      if (t > now - 7 * DAY_MS) recentQty[name] = (recentQty[name] || 0) + o.qty;
      else if (t > now - 14 * DAY_MS) previousQty[name] = (previousQty[name] || 0) + o.qty;
    });
    let trending = null;
    for (const name of Object.keys(recentQty)) {
      const prev = previousQty[name] || 0;
      const growthPct = prev > 0 ? Math.round(((recentQty[name] - prev) / prev) * 100) : null;
      if (growthPct !== null && growthPct > 0 && (!trending || growthPct > trending.growthPct)) trending = { name, growthPct };
    }
    const insightFallback = trending
      ? `${trending.name} is selling ${trending.growthPct}% faster than last week. Consider increasing stock before demand outpaces supply.`
      : lowStock.length
      ? `${lowStock[0].name} is running low (${lowStock[0].stock} left) - restock soon to avoid missing sales.`
      : bestSeller
      ? `${bestSeller} is your best seller so far. Keep it well stocked.`
      : "Add a few orders to start seeing trend insights here.";
    // Fallback templates - used when OPENROUTER_API_KEY isn't configured, or
    // if the OpenRouter call itself fails, so the feature degrades instead
    // of breaking outright.
    const templates = {
      ask: askFallback(question || "summary"),
      insight: insightFallback,
      caption: `New arrival: ${product?.name || "our product"}.\n\nClean quality, fair price, and ready for fast delivery. Price: ${money(product?.price || 0)}.\n\nSend a message now to order before stock runs out.`,
      reply: `Hello ${customer?.name || "there"}, thanks for reaching out.\n\n${(detail || "").trim() || "Yes, this item is available."}\n\nI can reserve it for you now and send your invoice immediately.`,
      reminder: `Hello ${customer?.name || "there"}, this is a friendly reminder about your pending order.\n\nPlease complete payment so we can process delivery. Thank you for choosing us.`,
      summary: `Sales summary:\n\nTotal orders: ${state.orders.length}\nTotal recorded revenue: ${money(revenue)}\nBest-selling item: ${bestSeller || "Not enough sales yet"}\nPending payments: ${state.orders.filter((o) => o.status === "Pending payment").length}\n\nSuggested action: follow up pending payments and restock fast-moving products.`,
      description: `${draftName}${draftCategory ? ` - ${draftCategory}` : ""}. A quality ${draftType.toLowerCase()} priced at ${money(draftPrice)}${draftExtra ? `. ${draftExtra}` : ""}, with fast delivery and great value for the price.`,
    };
    const prompts = {
      ask: `You are a helpful AI business assistant for a Nigerian small business called "${state.business.businessName}". Answer the owner's question using ONLY this real data - never invent numbers or names: total orders ${state.orders.length}, paid revenue ${money(revenue)}, best-selling item "${bestSeller || "none yet"}", customers who owe money: ${Object.entries(owedByCustomer).map(([n, a]) => `${n} owes ${money(a)}`).join("; ") || "none"}, low stock items: ${lowStock.map((p) => `${p.name} (${p.stock} left)`).join(", ") || "none"}. Question: "${question || "How is my business doing?"}". Answer in 2-3 sentences, plain text, specific and direct - if the data doesn't cover the question, say so honestly instead of guessing.`,
      insight: `You are an AI business assistant for a Nigerian small business called "${state.business.businessName}". Write ONE short, specific, actionable insight (1-2 sentences, plain text, no markdown) based ONLY on this real data - never invent numbers: ${trending ? `"${trending.name}" sold ${trending.growthPct}% more units in the last 7 days than the 7 days before that.` : "no clear week-over-week sales trend yet."} Low stock items: ${lowStock.map((p) => `${p.name} (${p.stock} left)`).join(", ") || "none"}. Best seller overall: ${bestSeller || "none yet"}. Sound like a sharp business advisor, not a generic tip.`,
      caption: `Write a short, upbeat WhatsApp-style product caption (3-4 sentences max, no hashtags) for a Nigerian small business selling "${product?.name || "a product"}" priced at ${money(product?.price || 0)}. Make it sound like a real seller, not an ad agency.`,
      reply: `Write a short, friendly WhatsApp reply from a Nigerian small business to a customer named ${customer?.name || "a customer"} who asked: "${(detail || "is this available?").trim()}". Confirm availability and offer to send an invoice. 2-4 sentences.`,
      reminder: `Write a polite, brief WhatsApp payment reminder from a Nigerian small business to a customer named ${customer?.name || "a customer"} about a pending order. 2-3 sentences, not pushy.`,
      summary: `Write a short sales summary for a Nigerian small business owner based on this data: ${state.orders.length} total orders, ${money(revenue)} paid revenue, best-selling item "${bestSeller || "none yet"}", ${state.orders.filter((o) => o.status === "Pending payment").length} orders still pending payment. End with one concrete suggested action. 4-5 sentences.`,
      description: `Write a short storefront product description (2-3 sentences, plain text, no markdown, no hashtags, no emojis) for a Nigerian small business selling "${draftName}"${draftCategory ? ` (category: ${draftCategory})` : ""}, a ${draftType.toLowerCase()} priced at ${money(draftPrice)}.${draftExtra ? ` Extra details to weave in naturally: ${draftExtra}.` : ""} Describe what it is, who it's for, and why it's worth buying.`,
    };
    if (!templates[tool]) return res.status(400).json({ error: "Unknown AI tool" });
    let text = templates[tool];
    let used = await db.getAiUsage(req.businessId);
    const limit = await db.effectiveAiLimit(req.businessId);
    // Only a genuine AI call counts against the monthly quota - a template
    // fallback (no key configured, over quota, or the API call itself
    // failing) costs nothing and always still works, degraded.
    if (ai.isConfigured() && used < limit) {
      try {
        text = await ai.generateText(prompts[tool]);
        used = await db.incrementAiUsage(req.businessId);
      } catch (err) {
        console.error("OpenRouter generation failed, falling back to template:", err.message);
      }
    }
    res.json({ text, used, limit });
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
    const { businessName, customerName, items, businessPhone, businessAddress, includeVat } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Add at least one item" });
    }
    if (!String(customerName || "").trim()) {
      return res.status(400).json({ error: "Customer name is required" });
    }
    const cleanItems = items.map((it) => ({
      name: String(it?.name || "").trim() || "Item",
      qty: Math.max(1, Number(it?.qty) || 1),
      price: Math.max(0, Number(it?.price) || 0),
    }));
    const total = cleanItems.reduce((s, it) => s + it.qty * it.price, 0);
    const vat = includeVat ? Math.round(total * 0.075 * 100) / 100 : 0;
    const used = await db.incrementReceiptUsage(req.businessId);
    const business = await db.getBusiness(req.businessId);
    const reference = "SP-" + Date.now().toString(36).toUpperCase() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase();
    const receipt = {
      reference,
      // The receipt form lets the seller type these in directly (so this
      // free tool doesn't require a trip to Settings first) - fall back to
      // the saved business profile when left blank.
      businessName: String(businessName || "").trim() || business.businessName,
      businessLogo: business.businessLogo,
      businessPhone: String(businessPhone || "").trim() || business.businessPhone,
      businessAddress: String(businessAddress || "").trim() || business.businessAddress,
      customerName: String(customerName || "").trim(),
      items: cleanItems,
      subtotal: total,
      vatRate: includeVat ? 0.075 : 0,
      vat,
      total: total + vat,
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

// --- Expenses, cashbook, P&L, daily reconciliation ---------------------------
// Available on every plan (basic bookkeeping, not a premium analytics
// feature) - unlike /api/reports above.

app.get(
  "/api/expenses",
  requireAuth,
  handle(async (req, res) => {
    res.json({
      expenses: await db.listExpenses(req.businessId, { from: req.query.from, to: req.query.to }),
      categories: db.EXPENSE_CATEGORIES,
    });
  })
);
app.post(
  "/api/expenses",
  requireAuth,
  handle(async (req, res) => res.status(201).json(await db.createExpense(req.businessId, req.body || {})))
);
app.delete(
  "/api/expenses/:id",
  requireAuth,
  handle(async (req, res) => {
    await db.deleteExpense(req.businessId, req.params.id);
    res.status(204).end();
  })
);
app.get(
  "/api/cashbook",
  requireAuth,
  handle(async (req, res) => res.json(await db.getCashbook(req.businessId, { from: req.query.from, to: req.query.to })))
);
app.get(
  "/api/profit-loss",
  requireAuth,
  handle(async (req, res) => res.json(await db.getProfitAndLoss(req.businessId, { from: req.query.from, to: req.query.to })))
);
app.get(
  "/api/reconciliations",
  requireAuth,
  handle(async (req, res) => res.json(await db.listReconciliations(req.businessId)))
);
app.post(
  "/api/reconciliations",
  requireAuth,
  handle(async (req, res) => res.json(await db.upsertReconciliation(req.businessId, req.body || {})))
);

// --- Branches (Business+) -----------------------------------------------------

app.get(
  "/api/branches",
  requireAuth,
  handle(async (req, res) => {
    const branches = await db.listBranches(req.businessId);
    res.json({ branches, limit: await db.effectiveBranchLimit(req.businessId) });
  })
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

// --- Add-on purchases (a-la-carte, on top of any plan) ----------------------

const ADDON_TYPES = ["ai_credits", "staff", "branch"];

app.post(
  "/api/addons/purchase",
  requireAuth,
  handle(async (req, res) => {
    const { type } = req.body || {};
    if (!ADDON_TYPES.includes(type)) return res.status(400).json({ error: "Unknown add-on" });
    if (!payments.isConfigured()) {
      return res.status(400).json({ error: "Paystack is not configured on this server" });
    }
    const reference = `spaddon_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const callbackUrl = `${req.protocol}://${req.get("host")}/upgrade.html?reference=${reference}`;
    const result = await payments.initializeAddonTransaction({
      email: req.user.email,
      addonType: type,
      reference,
      callbackUrl,
      businessId: req.businessId,
    });
    res.json({ authorizationUrl: result.authorizationUrl, amount: result.amount, reference });
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
    const tiers = pricing.applyPricingOverrides(settings.pricingOverrides);
    if (!tiers[plan] || plan === "starter") return res.status(400).json({ error: "Invalid plan" });
    if (tiers[plan].monthly == null) return res.status(400).json({ error: "This plan requires contacting sales" });
    if (!payments.isConfigured()) {
      return res.status(400).json({ error: "Paystack is not configured on this server" });
    }
    const reference = `sp_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const callbackUrl = `${req.protocol}://${req.get("host")}/upgrade.html?reference=${reference}`;
    const cycle = billingCycle === "yearly" ? "yearly" : "monthly";
    const amountNaira = cycle === "yearly" ? tiers[plan].yearly : tiers[plan].monthly;
    const result = await payments.initializeTransaction({
      email,
      plan,
      billingCycle: cycle,
      amountNaira,
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
    res.json({ status: txData.status, activated, plan: business.plan, addonType: txData.metadata?.addonType || null });
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
  "/api/admin/analytics",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.getAnalyticsSummary()))
);

app.get(
  "/api/admin/audit-log",
  requirePlatformAdmin,
  handle(async (req, res) => res.json(await db.listAllAuditLog()))
);

// Permanently deletes a business and everything under it (products,
// customers, orders, staff, invites, usage counters) - meant for clearing
// out test/throwaway accounts created while building/verifying features,
// not for real customer offboarding. Also removes the owner/staff Supabase
// Auth accounts so nothing orphaned is left able to log in.
app.delete(
  "/api/admin/businesses/:id",
  requirePlatformAdmin,
  handle(async (req, res) => {
    const userIds = await db.deleteBusiness(req.params.id);
    for (const userId of userIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
    res.status(204).end();
  })
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

app.put(
  "/api/admin/pricing",
  requirePlatformAdmin,
  handle(async (req, res) => {
    const overrides = {};
    for (const key of pricing.OVERRIDABLE_TIERS) {
      const value = Number((req.body || {})[key]);
      if (!Number.isFinite(value) || value < 0) return res.status(400).json({ error: `Invalid price for ${key}` });
      overrides[key] = value;
    }
    const settings = await db.updatePricingOverrides(overrides);
    res.json(pricing.applyPricingOverrides(settings.pricingOverrides));
  })
);

app.listen(PORT, HOST, () => {
  console.log(`SellersPoint running at http://${HOST}:${PORT}`);
});
