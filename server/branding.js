// Single source of truth for the platform's own name/logo/support contact,
// read by both server-side code (email templates, the dynamic manifest.json
// route) and every static HTML page (via GET /api/brand + branding.js).
// A buyer of this codebase rebrands by setting these env vars - nothing
// else needs editing for the platform name/logo/tagline to change
// everywhere. Defaults to SellersPoint's own branding so the app still
// works out of the box with zero configuration.
const BRAND = {
  name: process.env.BRAND_NAME || "SellersPoint",
  tagline: process.env.BRAND_TAGLINE || "AI business manager for African sellers - products, orders, customers, and a storefront in one place.",
  logoUrl: process.env.BRAND_LOGO_URL || "/assets/branding/logo/logo_1_main-real.png",
  iconUrl: process.env.BRAND_ICON_URL || "/assets/branding/logo/icon%202.png",
  supportEmail: process.env.BRAND_SUPPORT_EMAIL || "support@sellerspoint.ng",
  domain: process.env.BRAND_DOMAIN || "sellerspoint.app",
  themeColor: process.env.BRAND_THEME_COLOR || "#13241e",
  backgroundColor: process.env.BRAND_BACKGROUND_COLOR || "#f5f7f4",
};

module.exports = { BRAND };
