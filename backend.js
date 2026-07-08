const $ = (id) => document.getElementById(id);
let owner = { name: "SellersPoint", provider: "Paystack", link: "", details: "" };
let businesses = [];
let payments = [];
let pricing = {};
let authToken = null;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const date = (d) => new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

async function loadAll() {
  const [ownerRes, businessesRes, paymentsRes, pricingRes] = await Promise.all([
    api("GET", "/api/owner"),
    api("GET", "/api/admin/businesses"),
    api("GET", "/api/admin/payments"),
    api("GET", "/api/pricing"),
  ]);
  owner = ownerRes;
  businesses = businessesRes;
  payments = paymentsRes;
  pricing = pricingRes;
}

function render() {
  $("totalBusinesses").textContent = businesses.length;
  $("totalPayments").textContent = payments.length;
  $("totalRevenue").textContent = money(payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount, 0));
  $("businessList").innerHTML = businesses.map((b) => '<div class="item"><div class="item-top"><strong>' + clean(b.businessName) + '</strong><span>' + clean(b.plan) + '</span></div><div class="meta">' + b.orderCount + ' orders, ' + b.customerCount + ' customers - joined ' + date(b.createdAt) + '</div></div>').join("");
  $("paymentLog").innerHTML = payments.slice(0, 20).map((p) => '<div class="item"><div class="item-top"><strong>' + clean(p.businessName) + '</strong><span>' + money(p.amount) + '</span></div><div class="meta">' + clean(p.plan) + ' (' + clean(p.billingCycle) + ') - ' + clean(p.status) + ' - ' + clean(p.reference) + ' - ' + date(p.createdAt) + '</div></div>').join("");
  $("ownerName").value = owner.name;
  $("ownerLink").value = owner.link;
  $("ownerDetails").value = owner.details;
  if (pricing.growth) $("priceGrowth").value = pricing.growth.monthly;
  if (pricing.pro) $("pricePro").value = pricing.pro.monthly;
  if (pricing.business) $("priceBusiness").value = pricing.business.monthly;
}

$("ownerPaymentForm").onsubmit = async (e) => {
  e.preventDefault();
  owner = await api("PUT", "/api/owner", { name: $("ownerName").value.trim(), provider: "Paystack", link: $("ownerLink").value.trim(), details: $("ownerDetails").value.trim() });
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
