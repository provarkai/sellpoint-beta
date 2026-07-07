const $ = (id) => document.getElementById(id);
let pricing = {};
let cycle = "monthly";
let selectedPlan = null;
let authToken = null;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

function planCardsHtml() {
  return Object.entries(pricing).filter(([, t]) => t.monthly > 0).map(([key, t]) => {
    const price = cycle === "yearly" ? t.yearly : t.monthly;
    return '<div class="' + (key === selectedPlan ? "featured" : "") + '"><b>' + t.name + '</b><span>' + money(price) + '/' + (cycle === "yearly" ? "year" : "month") + '</span><small>' + t.tagline + '</small><button data-plan="' + key + '">Choose ' + t.name + '</button></div>';
  }).join("");
}

function render() {
  $("planCards").innerHTML = planCardsHtml();
  $("planCards").querySelectorAll("button[data-plan]").forEach((b) => (b.onclick = () => selectPlan(b.dataset.plan)));
  const tier = selectedPlan ? pricing[selectedPlan] : null;
  const price = tier ? (cycle === "yearly" ? tier.yearly : tier.monthly) : 0;
  const cycleLabel = cycle === "yearly" ? "year" : "month";
  $("selectedPlanMeta").textContent = tier ? tier.name + " - " + money(price) + "/" + cycleLabel : "Select a plan above.";
  $("payNow").disabled = !tier;
  if (tier && tier.monthly > 0) {
    const savings = tier.monthly * 12 - tier.yearly;
    $("cycleHint").textContent = cycle === "yearly"
      ? "Paying annually saves you " + money(savings) + "/year (2 months free) versus paying monthly."
      : "Switch to yearly to save " + money(savings) + "/year (2 months free).";
  } else {
    $("cycleHint").textContent = "";
  }
}

function selectPlan(key) { selectedPlan = key; render(); }
function setCycle(c) { cycle = c; $("cycleMonthly").classList.toggle("active", c === "monthly"); $("cycleYearly").classList.toggle("active", c === "yearly"); render(); }
$("cycleMonthly").onclick = () => setCycle("monthly");
$("cycleYearly").onclick = () => setCycle("yearly");

$("payNow").onclick = async () => {
  const email = $("checkoutEmail").value.trim();
  if (!email) return toast("Enter your email first");
  if (!selectedPlan) return toast("Choose a plan first");
  try {
    const result = await api("POST", "/api/payments/initialize", { plan: selectedPlan, billingCycle: cycle, email });
    location.href = result.authorizationUrl;
  } catch (err) {
    toast(err.message);
  }
};

async function checkReturnFromPaystack() {
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") || params.get("trxref");
  if (!reference) return;
  const box = $("verifyStatus");
  box.style.display = "block";
  box.textContent = "Confirming your payment...";
  try {
    const result = await api("GET", "/api/payments/verify/" + encodeURIComponent(reference));
    box.textContent = result.status === "success"
      ? "Payment confirmed. Your plan is now " + (pricing[result.plan]?.name || result.plan) + "."
      : "Payment status: " + result.status + ". If you were charged, contact support with reference " + reference + ".";
  } catch (err) {
    box.textContent = "Could not confirm payment automatically: " + err.message + ". Reference: " + reference;
  }
}

async function loadAll() {
  pricing = await fetch("/api/pricing").then((r) => (r.ok ? r.json() : {}));
}

(async () => {
  const ctx = await window.Auth.requireSession();
  if (!ctx) return;
  authToken = ctx.session.access_token;
  await loadAll();
  const paramPlan = new URLSearchParams(location.search).get("plan");
  if (paramPlan && pricing[paramPlan] && pricing[paramPlan].monthly > 0) selectedPlan = paramPlan;
  render();
  checkReturnFromPaystack();
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
