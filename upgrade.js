const $ = (id) => document.getElementById(id);
let pricing = {};
let cycle = "monthly";
let authToken = null;
let busy = false;
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const unlimited = (v) => v === Infinity || v === null || v === undefined;
const toast = (m) => { const t = $("toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2000); };
async function api(method, url, body) { const res = await fetch(url, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${authToken}` }, body: body ? JSON.stringify(body) : undefined }); if (!res.ok) { const err = await res.json().catch(() => ({ error: "Request failed" })); throw new Error(err.error || "Request failed"); } return res.status === 204 ? null : res.json(); }

function featuresFor(t) {
  const list = [
    unlimited(t.orderLimit) ? "Unlimited orders" : t.orderLimit + " orders/month",
    unlimited(t.staffLimit) ? "Unlimited staff seats" : t.staffLimit > 0 ? t.staffLimit + " staff seat" + (t.staffLimit > 1 ? "s" : "") : "No staff seats",
    unlimited(t.aiLimit) ? "Unlimited AI generations" : t.aiLimit + " AI generations/month",
    unlimited(t.branchLimit) ? "Unlimited branches" : t.branchLimit > 0 ? t.branchLimit + " extra branch" + (t.branchLimit > 1 ? "es" : "") : "Single location",
  ];
  if (t.reports) list.push("Sales & revenue reports");
  return list;
}

function planCardsHtml() {
  return Object.entries(pricing).filter(([key]) => key !== "starter").map(([key, t]) => {
    const isEnterprise = t.monthly == null;
    const priceHtml = isEnterprise
      ? '<p class="premium-price">Custom<span> pricing</span></p>'
      : '<p class="premium-price">' + money(cycle === "yearly" ? t.yearly : t.monthly) + '<span>/' + (cycle === "yearly" ? "year" : "month") + '</span></p>';
    const features = featuresFor(t).map((f) => "<li>" + f + "</li>").join("");
    const cta = isEnterprise
      ? '<a class="button-link" href="mailto:sales@sellerspoint.app?subject=Enterprise%20plan">Contact Sales</a>'
      : '<button data-plan="' + key + '">Choose ' + t.name + '</button>';
    return '<article class="premium-card' + (isEnterprise ? " premium-card-enterprise" : "") + '"><h2>' + t.name + '</h2>' + priceHtml + '<p class="meta">' + t.tagline + '</p><ul class="premium-features">' + features + '</ul>' + cta + '</article>';
  }).join("");
}

function comparisonTableHtml() {
  const keys = Object.keys(pricing);
  const rows = [
    ["Price", (t) => (t.monthly == null ? "Custom" : t.monthly === 0 ? "Free" : money(cycle === "yearly" ? t.yearly : t.monthly) + "/" + (cycle === "yearly" ? "yr" : "mo"))],
    ["Orders", (t) => (unlimited(t.orderLimit) ? "Unlimited" : t.orderLimit + "/month")],
    ["Staff seats", (t) => (unlimited(t.staffLimit) ? "Unlimited" : t.staffLimit)],
    ["AI generations", (t) => (unlimited(t.aiLimit) ? "Unlimited" : t.aiLimit + "/month")],
    ["Branches", (t) => (unlimited(t.branchLimit) ? "Unlimited" : t.branchLimit > 0 ? "+" + t.branchLimit : "Single location")],
    ["Free receipts", (t) => (unlimited(t.receiptLimit) ? "Unlimited" : t.receiptLimit + "/month")],
    ["Reports", (t) => (t.reports ? "✓" : "-")],
  ];
  const head = "<tr><th>Feature</th>" + keys.map((k) => "<th>" + pricing[k].name + "</th>").join("") + "</tr>";
  const body = rows.map(([label, fn]) => "<tr><td>" + label + "</td>" + keys.map((k) => "<td>" + fn(pricing[k]) + "</td>").join("") + "</tr>").join("");
  return "<table>" + head + body + "</table>";
}

function render() {
  $("planCards").innerHTML = planCardsHtml();
  $("planCards").querySelectorAll("button[data-plan]").forEach((b) => (b.onclick = () => chooseAndPay(b.dataset.plan)));
  if ($("comparisonTable")) $("comparisonTable").innerHTML = comparisonTableHtml();
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
