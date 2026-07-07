const $ = (id) => document.getElementById(id);
let owner = { name: "SellersPoint", provider: "Manual bank transfer", link: "", details: "" };
let businesses = [];
let payments = [];
let settings = { extendedPricingEnabled: false };
let authToken = null;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const date = (d) => new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

async function loadAll() {
  const [ownerRes, businessesRes, paymentsRes, settingsRes] = await Promise.all([
    api("GET", "/api/owner"),
    api("GET", "/api/admin/businesses"),
    api("GET", "/api/admin/payments"),
    api("GET", "/api/admin/settings"),
  ]);
  owner = ownerRes;
  businesses = businessesRes;
  payments = paymentsRes;
  settings = settingsRes;
}

function render() {
  $("totalBusinesses").textContent = businesses.length;
  $("totalPayments").textContent = payments.length;
  $("totalRevenue").textContent = money(payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount, 0));
  $("businessList").innerHTML = businesses.map((b) => '<div class="item"><div class="item-top"><strong>' + clean(b.businessName) + '</strong><span>' + clean(b.plan) + '</span></div><div class="meta">' + b.orderCount + ' orders, ' + b.customerCount + ' customers - joined ' + date(b.createdAt) + '</div></div>').join("");
  $("paymentLog").innerHTML = payments.slice(0, 20).map((p) => '<div class="item"><div class="item-top"><strong>' + clean(p.businessName) + '</strong><span>' + money(p.amount) + '</span></div><div class="meta">' + clean(p.plan) + ' (' + clean(p.billingCycle) + ') - ' + clean(p.status) + ' - ' + clean(p.reference) + ' - ' + date(p.createdAt) + '</div></div>').join("");
  $("ownerName").value = owner.name;
  $("ownerProvider").value = owner.provider;
  $("ownerLink").value = owner.link;
  $("ownerDetails").value = owner.details;
  $("extendedPricingToggle").checked = settings.extendedPricingEnabled;
}

$("ownerPaymentForm").onsubmit = async (e) => {
  e.preventDefault();
  owner = await api("PUT", "/api/owner", { name: $("ownerName").value.trim(), provider: $("ownerProvider").value, link: $("ownerLink").value.trim(), details: $("ownerDetails").value.trim() });
  toast("SellersPoint payment details saved");
  render();
};
$("savePricingSettings").onclick = async () => {
  settings = await api("PUT", "/api/admin/settings", { extendedPricingEnabled: $("extendedPricingToggle").checked });
  toast(settings.extendedPricingEnabled ? "All 5 tiers are now visible to customers" : "Simplified to Starter + Growth only");
  render();
};
$("logout").onclick = () => window.Auth.logout();

(async () => {
  const ctx = await window.Auth.requireSession();
  if (!ctx) return;
  authToken = ctx.session.access_token;
  try {
    await loadAll();
    $("adminContent").style.display = "block";
    render();
  } catch (err) {
    $("notAuthorized").style.display = "block";
  }
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
