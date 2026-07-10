const $ = (id) => document.getElementById(id);
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");

// Live pricing (not hardcoded) so this stays correct if Growth/Pro/Business
// prices are ever changed from the admin's Pricing Tiers form - matches
// what upgrade.html shows a signed-in user.
async function loadPricing() {
  const el = $("pricingCards");
  if (!el) return;
  try {
    const pricing = await fetch("/api/pricing").then((r) => r.json());
    const order = ["starter", "growth", "pro", "business"];
    el.innerHTML = order.filter((key) => pricing[key]).map((key) => {
      const t = pricing[key];
      const isFree = !t.monthly;
      const price = isFree ? '<p class="premium-price">Free</p>' : `<p class="premium-price">${money(t.monthly)}<span>/month</span></p>`;
      const featured = key === "growth";
      return `<article class="premium-card${featured ? " premium-card-featured" : ""}">${featured ? '<span class="landing-pricing-badge">Most Popular</span>' : ""}<h2>${t.name}</h2>${price}<p class="meta">${t.tagline}</p><a class="button-link" href="signup.html">${isFree ? "Start Free" : "Get Started"}</a></article>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="meta" style="text-align:center">Pricing is temporarily unavailable - <a href="signup.html">sign up</a> to see current plans.</p>';
  }
}
loadPricing();
