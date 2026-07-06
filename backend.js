const KEY = "sellpilot_v1";
const OWNER_KEY = "sellpoint_owner_payment";
const $ = (id) => document.getElementById(id);
const state = JSON.parse(localStorage.getItem(KEY) || '{"businessName":"Your Business","products":[],"customers":[],"orders":[],"events":[]}');
state.events ??= [];
state.products ??= [];
state.customers ??= [];
state.orders ??= [];
const owner = JSON.parse(localStorage.getItem(OWNER_KEY) || '{"name":"SellPoint","provider":"Manual bank transfer","link":"","details":""}');
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const product = (id) => state.products.find((x) => x.id === id);
const total = (o) => (product(o.productId)?.price || o.price || 0) * o.qty;
const date = (d) => new Intl.DateTimeFormat("en-NG", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
function setupScore() { const checks = [state.businessName && state.businessName !== "Your Business", state.businessPhone, state.paymentDetails || state.paymentLink, state.products.length, state.customers.length, state.orders.length, state.businessLogo]; return Math.round(checks.filter(Boolean).length / checks.length * 100); }
function bestProduct() { const t = {}; state.orders.forEach((o) => { const n = product(o.productId)?.name || o.productName; if (n) t[n] = (t[n] || 0) + o.qty; }); return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0]; }
function report() { return "SellPoint Backend Report\nOrders: " + state.orders.length + "\nCustomers: " + state.customers.length + "\nItems: " + state.products.length + "\nSetup: " + setupScore() + "%\nTop item: " + (bestProduct() || "No sales yet"); }
function render() {
  const digitalRevenue = state.orders.filter((o) => (product(o.productId)?.type || o.productType) === "Digital product" && ["Paid", "Delivered"].includes(o.status)).reduce((s, o) => s + total(o), 0);
  $("devEvents").textContent = state.events.length;
  $("devDigitalRevenue").textContent = money(digitalRevenue);
  $("devSetup").textContent = setupScore() + "%";
  $("devStorage").textContent = (Math.round(JSON.stringify(state).length / 102.4) / 10) + " KB";
  const checks = [["Business profile", state.businessName && state.businessName !== "Your Business"], ["Logo uploaded", state.businessLogo], ["Payment configured", state.paymentDetails || state.paymentLink], ["First item added", state.products.length], ["First customer added", state.customers.length], ["First order created", state.orders.length], ["Digital delivery ready", state.products.some((p) => p.type === "Digital product" && p.deliveryLink)]];
  $("checklist").innerHTML = checks.map((x) => '<div class="check ' + (x[1] ? 'done' : '') + '"><b>' + (x[1] ? '✓' : '!') + '</b><span>' + x[0] + '</span></div>').join("");
  $("devSummary").innerHTML = '<div class="item"><strong>Top item</strong><span class="meta">' + clean(bestProduct() || "No sales yet") + '</span></div><div class="item"><strong>Orders</strong><span class="meta">' + state.orders.length + ' total, ' + state.orders.filter((o) => o.status === "Pending payment").length + ' pending payment</span></div><div class="item"><strong>Catalog</strong><span class="meta">' + state.products.filter((p) => p.type === "Product").length + ' products, ' + state.products.filter((p) => p.type === "Service").length + ' services, ' + state.products.filter((p) => p.type === "Digital product").length + ' digital products</span></div>';
  $("eventLog").innerHTML = state.events.slice(0, 12).map((e) => '<div class="item"><strong><span class="badge">' + clean(e.type) + '</span> ' + clean(e.detail || '') + '</strong><span class="meta">' + date(e.at) + '</span></div>').join("");
  $("ownerName").value = owner.name;
  $("ownerProvider").value = owner.provider;
  $("ownerLink").value = owner.link;
  $("ownerDetails").value = owner.details;
}
$("ownerPaymentForm").onsubmit = (e) => { e.preventDefault(); owner.name = $("ownerName").value.trim(); owner.provider = $("ownerProvider").value; owner.link = $("ownerLink").value.trim(); owner.details = $("ownerDetails").value.trim(); localStorage.setItem(OWNER_KEY, JSON.stringify(owner)); toast("SellPoint payment details saved"); };
$("copyReport").onclick = () => navigator.clipboard.writeText(report()).then(() => toast("Report copied"));
$("exportAnalytics").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), ownerPayment: owner, state }, null, 2)], { type: "application/json" })); a.download = "sellpoint-backend-analytics.json"; a.click(); };
render();

function makeId(prefix){return prefix + '_' + Date.now() + '_' + Math.random().toString(16).slice(2)}
function completeBetaSetup(){
  state.businessName = state.businessName && state.businessName !== 'Your Business' ? state.businessName : 'SellPoint Demo Store';
  state.businessPhone = state.businessPhone || '2348012345678';
  state.paymentProvider = state.paymentProvider || 'Paystack';
  state.paymentLink = state.paymentLink || 'https://paystack.com/pay/sellpoint-demo';
  state.paymentDetails = state.paymentDetails || 'Bank: SellPoint Bank\nAccount: 1234567890\nName: SellPoint Demo Store';
  state.businessLogo = state.businessLogo || 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="18" fill="#147d64"/><text x="60" y="72" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="white">SP</text></svg>');
  if (!state.products.some(p => p.type === 'Digital product' && p.deliveryLink)) {
    state.products.unshift({id:makeId('p'),name:'Instagram Sales Caption Pack',price:5000,stock:100,category:'Digital templates',type:'Digital product',deliveryLink:'https://example.com/download/sellpoint-caption-pack',deliveryNote:'After payment, open the link and download the caption pack. Contact support if the link expires.'});
  }
  if (!state.products.some(p => p.type === 'Service')) {
    state.products.unshift({id:makeId('p'),name:'Business Setup Consultation',price:15000,stock:10,category:'Consulting',type:'Service',deliveryLink:'',deliveryNote:'Book a date after payment.'});
  }
  if (!state.customers.length) {
    state.customers.unshift({id:makeId('c'),name:'Beta Test Customer',phone:'2348098765432',location:'Lagos'});
  }
  const digital = state.products.find(p => p.type === 'Digital product' && p.deliveryLink);
  const customer = state.customers[0];
  if (!state.orders.length && digital && customer) {
    state.orders.unshift({id:makeId('o'),productId:digital.id,productName:digital.name,productType:'Digital product',customerId:customer.id,qty:1,price:digital.price,status:'Paid',createdAt:new Date().toISOString(),delivered:true});
  }
  state.events = state.events || [];
  state.events.unshift({id:makeId('e'),type:'beta_setup_completed',detail:'Checklist completed from backend',at:new Date().toISOString()});
  localStorage.setItem(KEY, JSON.stringify(state));
  owner.name = owner.name || 'SellPoint';
  owner.provider = owner.provider || 'Paystack';
  owner.link = owner.link || 'https://paystack.com/pay/sellpoint';
  owner.details = owner.details || 'Bank: SellPoint Bank\nAccount: 9876543210\nName: SellPoint';
  localStorage.setItem(OWNER_KEY, JSON.stringify(owner));
  toast('Beta setup checklist completed');
  render();
}
if ($('completeSetup')) $('completeSetup').onclick = completeBetaSetup;
