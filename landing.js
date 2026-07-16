const $ = (id) => document.getElementById(id);
const money = (n) => "NGN " + Number(n || 0).toLocaleString("en-NG");
const clean = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

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
      const featured = key === "pro";
      return `<article class="premium-card${featured ? " premium-card-featured" : ""}">${featured ? '<span class="landing-pricing-badge">Most Popular</span>' : ""}<h2>${t.name}</h2>${price}<p class="meta">${t.tagline}</p><a class="button-link" href="signup.html">${isFree ? "Start Free" : "Get Started"}</a></article>`;
    }).join("");
  } catch {
    el.innerHTML = '<p class="meta" style="text-align:center">Pricing is temporarily unavailable - <a href="signup.html">sign up</a> to see current plans.</p>';
  }
}
loadPricing();

// Duplicate the testimonial cards once so the CSS marquee (translateX -50%
// to 0%) has a seamless second copy to hand off to - keeps the source HTML
// to a single set of 9 real cards instead of hand-duplicating markup.
// Named testiTrack (not track) since this is a classic script - a
// top-level const/let here shadows window.track for any bare `track(...)`
// call in later scripts on the same page, which broke landing_view analytics.
const testiTrack = $("testimonialTrack");
if (testiTrack) {
  const clone = testiTrack.innerHTML;
  testiTrack.innerHTML = clone + clone;
}

// Social icons - admin-configurable via backend.html, so only icons with a
// URL actually set are shown. Minimal inline SVGs (no icon font/CDN).
const SOCIAL_ICONS = {
  instagram: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M22 12a10 10 0 10-11.5 9.9v-7H7.9V12h2.6V9.8c0-2.6 1.5-4 3.9-4 1.1 0 2.3.2 2.3.2v2.5h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0022 12z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 2h3a5 5 0 004 4v3a8 8 0 01-4-1.1V15a6 6 0 11-6-6h.5v3.2H11a2.8 2.8 0 102.8 2.8V2z"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.9l-5.4-6.6L4.4 22H1.3l8.1-9.3L1 2h7l4.9 6 6-6zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15L2 22l5.2-1.4A10 10 0 1012 2zm0 18a8 8 0 01-4-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20zm4.4-5.9c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.4-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4.1-.1 0-.3 0-.4-.1-.1-.5-1.3-.7-1.7-.2-.5-.4-.4-.5-.4h-.5c-.1 0-.4 0-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 3.9 3.5.5.2 1 .4 1.3.5.5.2 1 .1 1.4.1.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1z"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 8.98h4v12H3v-12zm7 0h3.8v1.64h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1v6.32h-4v-5.6c0-1.34-.02-3.07-1.87-3.07-1.87 0-2.16 1.46-2.16 2.97v5.7h-4v-12z"/></svg>',
};
async function loadSocialLinks() {
  const el = $("footerSocialLinks");
  if (!el) return;
  try {
    const links = await fetch("/api/social-links").then((r) => r.json());
    el.innerHTML = Object.entries(SOCIAL_ICONS).filter(([key]) => links[key]).map(([key, svg]) => `<a href="${clean(links[key])}" target="_blank" rel="noopener" aria-label="${key}">${svg}</a>`).join("");
  } catch {
    el.innerHTML = "";
  }
}
loadSocialLinks();
