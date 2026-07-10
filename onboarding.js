const $ = (id) => document.getElementById(id);
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500); };
function readFileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }

const STEPS = ["stepProfile", "stepProduct", "stepCustomer", "stepOrder", "stepDone"];
const TITLES = {
  stepProfile: ["Step 1 of 4", "Let's set up your business", "Two minutes now saves confusion later - every step can be changed in Settings."],
  stepProduct: ["Step 2 of 4", "Add your first product or service", "This is what you'll sell - you can add more any time from the Products tab."],
  stepCustomer: ["Step 3 of 4", "Add your first customer", "Keep track of who buys from you - you can add more any time."],
  stepOrder: ["Step 4 of 4", "Create your first order", "See how a sale flows from order to invoice."],
  stepDone: ["Done", "", ""],
};
let stepIndex = 0;
let token = null;
let createdProductId = null;
let createdCustomerId = null;

function showStep(id) {
  STEPS.forEach((s) => { const el = $(s); if (el) el.style.display = s === id ? (s === "stepDone" ? "block" : "grid") : "none"; });
  const [label, title, sub] = TITLES[id];
  if ($("wizardStepLabel")) $("wizardStepLabel").textContent = label;
  if ($("wizardTitle")) $("wizardTitle").textContent = title;
  if ($("wizardSub")) $("wizardSub").textContent = sub;
  stepIndex = STEPS.indexOf(id);
  if ($("wizardProgressBar")) $("wizardProgressBar").style.width = Math.round((stepIndex / (STEPS.length - 1)) * 100) + "%";
  if (id === "stepDone") burstConfetti();
}
function nextStep() { showStep(STEPS[stepIndex + 1] || "stepDone"); }
function prevStep() { if (stepIndex > 0) showStep(STEPS[stepIndex - 1]); }

function burstConfetti() {
  const host = $("confettiBurst");
  if (!host) return;
  const colors = ["#147d64", "#7fe0b8", "#d36b2c", "#ffd166"];
  host.innerHTML = Array.from({ length: 40 }).map(() => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.4;
    const color = colors[Math.floor(Math.random() * colors.length)];
    return `<span style="left:${left}%;background:${color};animation-delay:${delay}s"></span>`;
  }).join("");
}

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: "Bearer " + token }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Something went wrong"); }
  return res.status === 204 ? null : res.json();
}

document.querySelectorAll(".wizard-skip").forEach((btn) => (btn.onclick = () => nextStep()));
document.querySelectorAll(".wizard-back").forEach((btn) => (btn.onclick = () => prevStep()));

$("stepProfile").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const file = $("oLogo").files?.[0];
    const businessLogo = file ? await readFileAsDataUrl(file) : undefined;
    const body = { businessAddress: $("oAddress").value.trim(), paymentDetails: $("oPayment").value.trim() };
    const businessName = $("oBusinessName").value.trim();
    const businessPhone = $("oBusinessPhone").value.trim();
    if (businessName) body.businessName = businessName;
    if (businessPhone) body.businessPhone = businessPhone.replace(/\D/g, "");
    if (businessLogo) body.businessLogo = businessLogo;
    await api("PUT", "/api/business", body);
    nextStep();
  } catch (err) {
    toast(err.message);
  }
};

$("stepProduct").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("wProductName").value.trim();
  if (!name) return nextStep();
  try {
    const created = await api("POST", "/api/products", { name, price: +$("wProductPrice").value || 0, stock: +$("wProductStock").value || 1, type: "Product" });
    createdProductId = created.id;
    nextStep();
  } catch (err) {
    toast(err.message);
  }
};

$("stepCustomer").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("wCustomerName").value.trim();
  if (!name) return nextStep();
  try {
    const created = await api("POST", "/api/customers", { name, phone: $("wCustomerPhone").value.replace(/\D/g, "") });
    createdCustomerId = created.id;
    nextStep();
  } catch (err) {
    toast(err.message);
  }
};

$("stepOrder").onsubmit = async (e) => {
  e.preventDefault();
  if (!createdProductId || !createdCustomerId) {
    toast(createdProductId ? "Add a customer first to create an order" : "Add a product first to create an order");
    return;
  }
  try {
    await api("POST", "/api/orders", { productId: createdProductId, customerId: createdCustomerId, qty: 1, status: "Pending payment" });
    nextStep();
  } catch (err) {
    toast(err.message);
  }
};
if ($("orderStepNote") && (!createdProductId || !createdCustomerId)) {
  // Note updates once we know whether earlier steps were skipped - see boot().
}

async function boot() {
  const ctx = await window.Auth.requireSession();
  if (!ctx) return;
  token = ctx.session.access_token;
  try {
    const me = await api("GET", "/api/me");
    if (me.business?.businessName && me.business.businessName !== "Your Business") $("oBusinessName").value = me.business.businessName;
    if (me.business?.businessPhone) $("oBusinessPhone").value = me.business.businessPhone;
  } catch (err) {
    // Non-fatal - prefill is a convenience, not a requirement to proceed.
  }
  if (!createdProductId || !createdCustomerId) {
    $("orderStepNote").textContent = "You skipped a product or customer earlier, so there's nothing to build a first order from yet - that's fine, just continue.";
  }
  showStep("stepProfile");
}
boot().catch((err) => toast(err.message || "Something went wrong loading this page."));
