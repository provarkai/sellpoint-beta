// Applies the platform's own brand (name/logo/support email - see
// server/branding.js) to whatever's on the current page. Include this
// script near the top of <head>, before other page scripts, on every page.
// Rebranding this codebase is then just setting BRAND_* env vars - no
// per-page HTML edits needed for anything this script covers.
//
// Scope: <title>, every <meta ...content="..."> mentioning the brand name,
// every visible text node in <body> (skipping <script>/<style>/<noscript>,
// since mutating those wouldn't affect already-run JS or CSS), img[alt]/
// aria-label attributes, and JSON-LD <script type="application/ld+json">
// blocks. What it can NOT reach: brand-name strings baked into a page's
// own inline <script> logic (e.g. a JS template literal building shareable
// text at runtime) - those still need a source edit; grep the repo for
// "SellersPoint" before a real rebrand/launch to catch any of those.
(function () {
  const DEFAULT_NAME = "SellersPoint";

  function replaceInText(root, name) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const tag = node.parentElement?.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
        return node.nodeValue.includes(DEFAULT_NAME) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach((node) => { node.nodeValue = node.nodeValue.split(DEFAULT_NAME).join(name); });
  }

  function replaceInJsonLd(name) {
    document.querySelectorAll('script[type="application/ld+json"]').forEach((el) => {
      if (!el.textContent.includes(DEFAULT_NAME)) return;
      el.textContent = el.textContent.split(DEFAULT_NAME).join(name);
    });
  }

  fetch("/api/brand")
    .then((r) => (r.ok ? r.json() : null))
    .then((brand) => {
      if (!brand) return;
      document.title = document.title.split(DEFAULT_NAME).join(brand.name);
      document.querySelectorAll("meta[content]").forEach((meta) => {
        if (meta.content.includes(DEFAULT_NAME)) meta.content = meta.content.split(DEFAULT_NAME).join(brand.name);
      });
      document.querySelectorAll(`img[alt="${DEFAULT_NAME}"]`).forEach((img) => { img.alt = brand.name; });
      document.querySelectorAll(`[aria-label*="${DEFAULT_NAME}"]`).forEach((el) => {
        el.setAttribute("aria-label", el.getAttribute("aria-label").split(DEFAULT_NAME).join(brand.name));
      });
      replaceInJsonLd(brand.name);
      const applyBody = () => replaceInText(document.body, brand.name);
      if (document.body) applyBody();
      else document.addEventListener("DOMContentLoaded", applyBody);
      document.querySelectorAll("[data-brand-logo]").forEach((el) => { el.src = brand.logoUrl; });
      document.querySelectorAll("[data-brand-support-email]").forEach((el) => {
        el.textContent = brand.supportEmail;
        if (el.tagName === "A") el.href = "mailto:" + brand.supportEmail;
      });
    })
    .catch(() => {}); // branding is cosmetic - a failed fetch just leaves the default copy in place
})();
