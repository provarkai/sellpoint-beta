const $ = (id) => document.getElementById(id);
let owner = { name: "SellersPoint", provider: "Paystack", link: "" };
let businesses = [];
let payments = [];
let pricing = {};
let settings = { socialLinks: {} };
let authToken = null;
let confirmDeleteId = null;
let expandedId = null;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const date = (d) => new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }
function downloadCsv(columns, rows, filename) { const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const csv = [columns, ...rows].map((r) => r.map(esc).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = filename; a.click(); }

async function loadAll() {
  const [ownerRes, businessesRes, paymentsRes, pricingRes, settingsRes] = await Promise.all([
    api("GET", "/api/owner"),
    api("GET", "/api/admin/businesses"),
    api("GET", "/api/admin/payments"),
    api("GET", "/api/pricing"),
    api("GET", "/api/admin/settings"),
  ]);
  owner = ownerRes;
  businesses = businessesRes;
  payments = paymentsRes;
  pricing = pricingRes;
  settings = settingsRes;
}

function businessDetailHtml(b) {
  return `<div class="item-details">
    <div class="row"><span>Phone</span><b>${clean(b.businessPhone || "-")}</b></div>
    <div class="row"><span>Address</span><b>${clean(b.businessAddress || "-")}</b></div>
    <div class="row"><span>Plan</span><b>${clean(b.plan)} (${clean(b.billingCycle || "monthly")})</b></div>
    <div class="row"><span>Plan expires</span><b>${b.planExpiresAt ? date(b.planExpiresAt) : "-"}</b></div>
    <div class="row"><span>Storefront</span><b>${b.storefrontEnabled ? "Enabled" : "Disabled"}${b.slug ? " - /store/" + clean(b.slug) : ""}</b></div>
    <div class="row"><span>AI credits</span><b>${b.aiUsed}/${b.aiLimit === null ? "unlimited" : b.aiLimit} used this month</b></div>
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
    return '<div class="item"><div class="item-top"><strong>' + clean(b.businessName) + '</strong><span>' + clean(b.plan) + '</span></div><div class="meta">' + b.orderCount + ' orders, ' + b.customerCount + ' customers - joined ' + date(b.createdAt) + ' - AI ' + b.aiUsed + '/' + (b.aiLimit === null ? '∞' : b.aiLimit) + '</div>' +
      (expanded ? businessDetailHtml(b) : '') +
      (confirming
        ? '<div class="item-actions"><input id="confirmDeleteInput" placeholder="Type \'' + clean(b.businessName) + '\' to confirm"><button class="danger" onclick="confirmDeleteBusiness(\'' + b.id + '\',' + JSON.stringify(b.businessName) + ')">Permanently Delete</button><button onclick="cancelDeleteBusiness()">Cancel</button></div>'
        : '<div class="item-actions"><button onclick="toggleBusinessDetail(\'' + b.id + '\')">' + (expanded ? 'Hide Details' : 'View Details') + '</button><button class="danger" onclick="startDeleteBusiness(\'' + b.id + '\')">Delete</button></div>') +
      '</div>';
  }).join("");
  $("paymentLog").innerHTML = payments.slice(0, 20).map((p) => '<div class="item"><div class="item-top"><strong>' + clean(p.businessName) + '</strong><span>' + money(p.amount) + '</span></div><div class="meta">' + clean(p.plan) + ' (' + clean(p.billingCycle) + ') - ' + clean(p.status) + ' - ' + clean(p.reference) + ' - ' + date(p.createdAt) + '</div></div>').join("");
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
}

$("ownerPaymentForm").onsubmit = async (e) => {
  e.preventDefault();
  owner = await api("PUT", "/api/owner", { name: $("ownerName").value.trim(), provider: "Paystack", link: $("ownerLink").value.trim() });
  toast("SellersPoint payment details saved");
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

function toggleBusinessDetail(id) { expandedId = expandedId === id ? null : id; render(); }
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
