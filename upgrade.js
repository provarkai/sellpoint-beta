const $ = (id) => document.getElementById(id);
let pricing = {};
let cycle = "monthly";
let authToken = null;
let busy = false;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

function planCardsHtml() {
  return Object.entries(pricing).filter(([, t]) => t.monthly > 0).map(([key, t]) => {
    const price = cycle === "yearly" ? t.yearly : t.monthly;
    return '<div><b>' + t.name + '</b><span>' + money(price) + '/' + (cycle === "yearly" ? "year" : "month") + '</span><small>' + t.tagline + '</small><button data-plan="' + key + '">Choose ' + t.name + '</button></div>';
  }).join("");
}

function render() {
  $("planCards").innerHTML = planCardsHtml();
  $("planCards").querySelectorAll("button[data-plan]").forEach((b) => (b.onclick = () => chooseAndPay(b.dataset.plan)));
  const anyTier = Object.values(pricing).find((t) => t.monthly > 0);
  if (anyTier) {
    const savings = anyTier.monthly * 12 - anyTier.yearly;
    $("cycleHint").textContent = cycle === "yearly"
      ? "Paying annually saves " + money(savings) + "/year (2 months free) versus paying monthly."
      : "Switch to yearly to save " + money(savings) + "/year (2 months free).";
  }
}

function setCycle(c) { cycle = c; $("cycleMonthly").classList.toggle("active", c === "monthly"); $("cycleYearly").classList.toggle("active", c === "yearly"); render(); }
$("cycleMonthly").onclick = () => setCycle("monthly");
$("cycleYearly").onclick = () => setCycle("yearly");

// Already signed in, so the account's own email is used automatically -
// no need to re-collect it. Clicking a plan goes straight to Paystack.
async function chooseAndPay(plan) {
  if (busy) return;
  busy = true;
  try {
    const result = await api("POST", "/api/payments/initialize", { plan, billingCycle: cycle });
    location.href = result.authorizationUrl;
  } catch (err) {
    toast(err.message);
    busy = false;
  }
}

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
  render();
  checkReturnFromPaystack();
  // If the seller arrived here already knowing which plan they want (e.g.
  // from a Settings pricing card), skip straight to checkout instead of
  // making them click again.
  if (paramPlan && pricing[paramPlan] && pricing[paramPlan].monthly > 0 && !new URLSearchParams(location.search).get("reference")) {
    chooseAndPay(paramPlan);
  }
})().catch((err) => toast(err.message || "Something went wrong loading this page."));
