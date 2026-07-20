const $ = (id) => document.getElementById(id);
let owner = { name: "SellersPoint", provider: "Paystack", link: "" };
let brand = { name: "SellersPoint" };
let businesses = [];
let payments = [];
let pricing = {};
let settings = { socialLinks: {} };
let analytics = { totals: [] };
let waitlistStats = { total: 0, countries: 0, categories: 0 };
let auditLog = [];
let logisticsSettings = { enabled: false, flatFee: 0, percentFee: 0, apiBase: "", apiKeySet: false, apiKeyMasked: "" };
let paymentConfig = { activeProvider: "paystack", providers: {}, providerNames: ["paystack", "flutterwave", "stripe"] };
const PAYMENT_GATEWAY_FIELDS = {
  paystack: [["secretKey", "Secret Key"], ["publicKey", "Public Key"]],
  flutterwave: [["secretKey", "Secret Key"], ["publicKey", "Public Key"], ["secretHash", "Webhook Secret Hash"]],
  stripe: [["secretKey", "Secret Key"], ["publicKey", "Publishable Key"], ["webhookSecret", "Webhook Signing Secret"]],
};
let platformAdmins = [];
let authToken = null;
let myEmail = null;
let confirmDeleteId = null;
let expandedId = null;
let businessDetails = {};
let loadingDetailId = null;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const date = (d) => { const x = new Date(d); return `${String(x.getDate()).padStart(2, "0")}-${String(x.getMonth() + 1).padStart(2, "0")}-${x.getFullYear()}`; };
const dateTime = (d) => { const x = new Date(d); return `${date(d)} ${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }
function downloadCsv(columns, rows, filename) { const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const csv = [columns, ...rows].map((r) => r.map(esc).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = filename; a.click(); }

async function loadAll() {
  const [ownerRes, businessesRes, paymentsRes, pricingRes, settingsRes, analyticsRes, waitlistRes, auditRes, logisticsRes, paymentConfigRes, platformAdminsRes, brandRes] = await Promise.all([
    api("GET", "/api/owner"),
    api("GET", "/api/admin/businesses"),
    api("GET", "/api/admin/payments"),
    api("GET", "/api/pricing"),
    api("GET", "/api/admin/settings"),
    api("GET", "/api/admin/analytics"),
    api("GET", "/api/waitlist/stats"),
    api("GET", "/api/admin/audit-log"),
    api("GET", "/api/admin/logistics-settings"),
    api("GET", "/api/admin/payment-config"),
    api("GET", "/api/admin/platform-admins"),
    fetch("/api/brand").then((r) => (r.ok ? r.json() : brand)).catch(() => brand),
  ]);
  owner = ownerRes;
  brand = brandRes;
  businesses = businessesRes;
  payments = paymentsRes;
  pricing = pricingRes;
  settings = settingsRes;
  analytics = analyticsRes;
  waitlistStats = waitlistRes;
  auditLog = auditRes;
  logisticsSettings = logisticsRes;
  paymentConfig = paymentConfigRes;
  platformAdmins = platformAdminsRes;
}

function renderPaymentGatewayFields() {
  const provider = $("pgActiveProvider").value;
  const stored = paymentConfig.providers?.[provider] || {};
  $("pgProviderFields").innerHTML = PAYMENT_GATEWAY_FIELDS[provider].map(([key, label]) => {
    const status = stored[key + "Set"] ? `(set - ${stored[key + "Masked"]})` : "(not set)";
    return `<label>${label} <span class="meta">${status}</span><input data-pgfield="${key}" type="password" placeholder="Leave blank to keep the current value"></label>`;
  }).join("");
}
if ($("pgActiveProvider")) $("pgActiveProvider").onchange = renderPaymentGatewayFields;
if ($("paymentGatewayForm")) $("paymentGatewayForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const provider = $("pgActiveProvider").value;
    const fields = {};
    document.querySelectorAll("#pgProviderFields [data-pgfield]").forEach((input) => {
      if (input.value.trim()) fields[input.dataset.pgfield] = input.value.trim();
    });
    paymentConfig = await api("PUT", "/api/admin/payment-config", { activeProvider: provider, providers: { [provider]: fields } });
    renderPaymentGatewayFields();
    toast("Payment gateway settings saved");
  } catch (err) {
    toast(err.message);
  }
};

// Comprehensive per-business panel shown under "View Details" - business
// info, staff/team, payment history, and recent activity, all fetched from
// GET /api/admin/businesses/:id (see db.js#getBusinessDetailForAdmin)
// rather than the summary fields listAllBusinesses already has.
function businessDetailHtml(id) {
  if (loadingDetailId === id) return '<div class="item-details"><p class="meta">Loading...</p></div>';
  const d = businessDetails[id];
  if (!d) return '<div class="item-details"><p class="meta">Couldn\'t load details.</p></div>';
  const b = d.business;
  const staffRows = [d.staff.owner, ...d.staff.staff].filter(Boolean);
  return `<div class="item-details">
    <div class="row"><span>Created</span><b>${dateTime(b.createdAt)}</b></div>
    <div class="row"><span>Phone</span><b>${clean(b.businessPhone || "-")}</b></div>
    <div class="row"><span>Address</span><b>${clean(b.businessAddress || "-")}</b></div>
    <div class="row"><span>Plan</span><b>${clean(b.plan)} (${clean(b.billingCycle || "monthly")})</b></div>
    <div class="row"><span>Plan expires</span><b>${b.planExpiresAt ? date(b.planExpiresAt) : "-"}</b></div>
    <div class="row"><span>Storefront</span><b>${b.storefrontEnabled ? "Enabled" : "Disabled"}${b.slug ? " - /store/" + clean(b.slug) : ""}</b></div>
    <div class="row"><span>Products / Orders / Customers</span><b>${b.productCount} / ${b.orderCount} / ${b.customerCount}</b></div>
    <div class="row"><span>AI credits</span><b>${b.aiUsed}/${b.aiLimit === null ? "unlimited" : b.aiLimit} used this month</b></div>
    <h3>Team (${staffRows.length})</h3>
    ${staffRows.map((m) => `<div class="row"><span>${clean(m.email)} - ${clean(m.role)}</span><b>${dateTime(m.createdAt)}</b></div>`).join("") || '<p class="meta">No staff yet</p>'}
    <h3>Payment history (${d.payments.length})</h3>
    ${d.payments.map((p) => `<div class="row"><span>${clean(p.plan)} (${clean(p.billingCycle)}) - ${clean(p.status)}</span><b>${money(p.amount)} - ${dateTime(p.createdAt)}</b></div>`).join("") || '<p class="meta">No payments yet</p>'}
    <h3>Recent activity (${d.activity.length})</h3>
    ${d.activity.map((a) => `<div class="row"><span>${clean(a.method)} ${clean(a.path)}</span><b>${a.statusCode} - ${dateTime(a.createdAt)}</b></div>`).join("") || '<p class="meta">No activity yet</p>'}
  </div>`;
}

function render() {
  $("totalBusinesses").textContent = businesses.length;
  $("businessCount").textContent = `(${businesses.length})`;
  $("totalPayments").textContent = payments.length;
  $("totalRevenue").textContent = money(payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount, 0));
  $("businessList").innerHTML = businesses.map((b) => {
    const confirming = confirmDeleteId === b.id;
    const expanded = expandedId === b.id;
    return '<div class="item"><div class="item-top"><strong>' + clean(b.businessName) + '</strong><span>' + clean(b.plan) + '</span></div><div class="meta">' + b.orderCount + ' orders, ' + b.customerCount + ' customers - joined ' + dateTime(b.createdAt) + ' - AI ' + b.aiUsed + '/' + (b.aiLimit === null ? '∞' : b.aiLimit) + '</div>' +
      (expanded ? businessDetailHtml(b.id) : '') +
      (confirming
        ? '<div class="item-actions"><input id="confirmDeleteInput" placeholder="Type \'' + clean(b.businessName) + '\' to confirm"><button class="danger" onclick="confirmDeleteBusiness(\'' + b.id + '\',' + JSON.stringify(b.businessName) + ')">Permanently Delete</button><button onclick="cancelDeleteBusiness()">Cancel</button></div>'
        : '<div class="item-actions"><button onclick="toggleBusinessDetail(\'' + b.id + '\')">' + (expanded ? 'Hide Details' : 'View Details') + '</button><button class="danger" onclick="startDeleteBusiness(\'' + b.id + '\')">Delete</button></div>') +
      '</div>';
  }).join("");
  $("paymentLog").innerHTML = payments.slice(0, 20).map((p) => '<div class="item"><div class="item-top"><strong>' + clean(p.businessName) + '</strong><span>' + money(p.amount) + '</span></div><div class="meta">' + clean(p.plan) + ' (' + clean(p.billingCycle) + ') - ' + clean(p.status) + ' - ' + clean(p.reference) + ' - ' + dateTime(p.createdAt) + '</div></div>').join("");
  const EVENT_LABELS = { landing_view: "Landing page views", signup_completed: "Signups completed", storefront_view: "Storefront views", demo_started: "Demo starts", assessment_completed: "Assessments completed" };
  $("analyticsSummary").innerHTML = Object.keys(EVENT_LABELS).map((type) => {
    const found = (analytics.totals || []).find((t) => t.eventType === type);
    return '<div class="item"><div class="item-top"><strong>' + EVENT_LABELS[type] + '</strong><span>' + (found ? found.count : 0) + '</span></div></div>';
  }).join("");
  $("waitlistSummary").innerHTML = '<div class="item"><div class="item-top"><strong>Total registered</strong><span>' + waitlistStats.total + '</span></div></div><div class="item"><div class="item-top"><strong>Countries</strong><span>' + waitlistStats.countries + '</span></div></div><div class="item"><div class="item-top"><strong>Categories</strong><span>' + waitlistStats.categories + '</span></div></div>';
  $("auditLogList").innerHTML = auditLog.map((a) => '<div class="item"><div class="item-top"><strong>' + clean(a.method) + ' ' + clean(a.path) + '</strong><span>' + a.statusCode + '</span></div><div class="meta">' + clean(a.businessName || "Unknown business") + ' - ' + dateTime(a.createdAt) + '</div></div>').join("") || '<div class="item"><span class="meta">No activity yet</span></div>';
  $("ownerName").value = owner.name;
  $("ownerLink").value = owner.link;
  if (pricing.growth) $("priceGrowth").value = pricing.growth.monthly;
  if (pricing.pro) $("pricePro").value = pricing.pro.monthly;
  if (pricing.business) $("priceBusiness").value = pricing.business.monthly;
  const sl = settings.socialLinks || {};
  $("socialInstagram").value = sl.instagram || "";
  $("socialFacebook").value = sl.facebook || "";
  $("socialTiktok").value = sl.tiktok || "";
  $("socialX").value = sl.x || "";
  $("socialWhatsapp").value = sl.whatsapp || "";
  $("socialLinkedin").value = sl.linkedin || "";
  $("logEnabled").checked = !!logisticsSettings.enabled;
  $("logFlatFee").value = logisticsSettings.flatFee ?? 0;
  $("logPercentFee").value = logisticsSettings.percentFee ?? 0;
  $("logApiBase").value = logisticsSettings.apiBase || "";
  $("logApiKeyStatus").textContent = logisticsSettings.apiKeySet ? `(set - ${logisticsSettings.apiKeyMasked})` : "(not set)";
  if ($("pgActiveProvider")) { $("pgActiveProvider").value = paymentConfig.activeProvider || "paystack"; renderPaymentGatewayFields(); }
  $("platformAdminCount").textContent = `(${platformAdmins.length})`;
  $("platformAdminList").innerHTML = platformAdmins.map((a) => {
    const isMe = myEmail && a.email === myEmail;
    return '<div class="item"><div class="item-top"><strong>' + clean(a.email) + '</strong>' + (isMe ? '<span class="meta">You</span>' : '') + '</div><div class="meta">Added ' + dateTime(a.createdAt) + (a.addedBy ? ' by ' + clean(a.addedBy) : '') + '</div>' +
      (isMe ? '' : '<div class="item-actions"><button class="danger" onclick="removePlatformAdmin(' + JSON.stringify(a.email) + ')">Remove</button></div>') +
      '</div>';
  }).join("");
}

function show(tab) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === tab));
  $("title").textContent = { overview: "Overview", businesses: "Businesses & Payments", growth: "Growth", auditlog: "Audit Log", settings: "Platform Settings", admins: "Platform Admins" }[tab];
}
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => show(b.dataset.tab)));

$("ownerPaymentForm").onsubmit = async (e) => {
  e.preventDefault();
  owner = await api("PUT", "/api/owner", { name: $("ownerName").value.trim(), provider: "Paystack", link: $("ownerLink").value.trim() });
  toast(`${brand.name} payment details saved`);
  render();
};
$("pricingForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    pricing = await api("PUT", "/api/admin/pricing", { growth: +$("priceGrowth").value, pro: +$("pricePro").value, business: +$("priceBusiness").value });
    toast("Pricing saved - now live on the upgrade page");
    render();
  } catch (err) {
    toast(err.message);
  }
};
$("socialLinksForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    settings = await api("PUT", "/api/admin/settings", { socialLinks: { instagram: $("socialInstagram").value.trim(), facebook: $("socialFacebook").value.trim(), tiktok: $("socialTiktok").value.trim(), x: $("socialX").value.trim(), whatsapp: $("socialWhatsapp").value.trim(), linkedin: $("socialLinkedin").value.trim() } });
    toast("Social links saved - now live in the landing page footer");
    render();
  } catch (err) {
    toast(err.message);
  }
};
$("logisticsForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    logisticsSettings = await api("PUT", "/api/admin/logistics-settings", {
      enabled: $("logEnabled").checked,
      flatFee: +$("logFlatFee").value,
      percentFee: +$("logPercentFee").value,
      apiBase: $("logApiBase").value.trim(),
      apiKey: $("logApiKey").value.trim(),
    });
    $("logApiKey").value = "";
    toast("Logistics settings saved");
    render();
  } catch (err) {
    toast(err.message);
  }
};
$("platformAdminForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("POST", "/api/admin/platform-admins", { email: $("platformAdminEmail").value.trim() });
    $("platformAdminForm").reset();
    platformAdmins = await api("GET", "/api/admin/platform-admins");
    render();
    toast("Platform admin added");
  } catch (err) {
    toast(err.message);
  }
};
async function removePlatformAdmin(email) {
  try {
    await api("DELETE", "/api/admin/platform-admins/" + encodeURIComponent(email));
    platformAdmins = platformAdmins.filter((a) => a.email !== email);
    render();
    toast("Platform admin removed");
  } catch (err) {
    toast(err.message);
  }
}

$("businessExportCsv").onclick = () => downloadCsv(
  ["Business", "Plan", "Billing Cycle", "Phone", "Address", "Orders", "Customers", "AI Used", "AI Limit", "Storefront", "Joined"],
  businesses.map((b) => [b.businessName, b.plan, b.billingCycle || "", b.businessPhone || "", b.businessAddress || "", b.orderCount, b.customerCount, b.aiUsed, b.aiLimit === null ? "unlimited" : b.aiLimit, b.storefrontEnabled ? "Enabled" : "Disabled", b.createdAt]),
  "businesses.csv"
);
$("paymentExportCsv").onclick = () => downloadCsv(
  ["Business", "Amount", "Plan", "Billing Cycle", "Status", "Reference", "Date"],
  payments.map((p) => [p.businessName, p.amount, p.plan, p.billingCycle, p.status, p.reference, p.createdAt]),
  "payments.csv"
);

async function toggleBusinessDetail(id) {
  if (expandedId === id) { expandedId = null; return render(); }
  expandedId = id;
  if (!businessDetails[id]) {
    loadingDetailId = id;
    render();
    try {
      businessDetails[id] = await api("GET", "/api/admin/businesses/" + id);
    } catch (err) {
      toast(err.message);
    }
    loadingDetailId = null;
  }
  render();
}
// Deletion is permanent and cascades through every product/customer/order/
// staff account under the business (plus their login) - typing the exact
// name is deliberate friction so this can't happen from a stray click,
// after an earlier one-click version was flagged as too easy to misfire.
function startDeleteBusiness(id) { confirmDeleteId = id; render(); }
function cancelDeleteBusiness() { confirmDeleteId = null; render(); }
async function confirmDeleteBusiness(id, businessName) {
  const typed = $("confirmDeleteInput").value;
  if (typed !== businessName) return toast("Name doesn't match - nothing was deleted");
  try {
    await api("DELETE", "/api/admin/businesses/" + id);
    businesses = businesses.filter((b) => b.id !== id);
    confirmDeleteId = null;
    render();
    toast("Business deleted");
  } catch (err) {
    toast(err.message);
  }
}

$("logout").onclick = async () => {
  const supabase = await window.supabaseReady;
  await supabase.auth.signOut();
  location.href = "admin-login.html";
};

(async () => {
  const supabase = await window.supabaseReady;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return (location.href = "admin-login.html");
  authToken = session.access_token;
  myEmail = (session.user?.email || "").toLowerCase();
  try {
    await loadAll();
    $("adminContent").style.display = "block";
    render();
  } catch (err) {
    // Signed in but not a platform admin (or session expired) - send back to
    // the dedicated admin login rather than showing a mixed-auth state.
    await supabase.auth.signOut();
    location.href = "admin-login.html";
  }
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
