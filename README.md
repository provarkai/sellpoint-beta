# SellersPoint - White-Label Edition

A multi-tenant e-commerce/business-management platform: a seller dashboard
(products, customers, orders, invoices, POS, reports, AI tools), a public
storefront per business, and a platform-admin console - built as a plain
Node/Express + PostgreSQL app with no build step (static HTML/JS, no
frontend framework).

This branch (`codecanyon-edition`) is a rebrand-able edition prepared for
resale/self-hosting: the platform's own branding is centralized into a
handful of env vars instead of being hardcoded, the payment gateway is
swappable (Paystack, Flutterwave, or Stripe), and the Nigeria-specific "My
Docs" module (CAC business registration, Compliance Calendar, Tax Tools)
has been removed since it wouldn't function outside that one market.

## 1. Requirements

- Node.js 22.5+
- A PostgreSQL database (this project is built against [Supabase](https://supabase.com),
  for its Postgres + Auth combo, but any Postgres 14+ works if you swap in
  your own auth layer)
- A payment gateway account: [Paystack](https://paystack.com), [Flutterwave](https://flutterwave.com),
  or [Stripe](https://stripe.com)
- Optional: [Resend](https://resend.com) for transactional email, [WasenderAPI](https://wasenderapi.com)
  for automated WhatsApp sends (both degrade gracefully without them - see
  `.env.example`)

## 2. Setup

```bash
npm install
cp .env.example .env   # fill in the values below
npm run migrate         # applies server/schema.sql - safe to re-run anytime
npm start                # http://localhost:5174
```

### Required env vars

- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL`
  - Use Supabase's **session pooler** host (`aws-*.pooler.supabase.com:6543`),
    not the direct `db.<ref>.supabase.co` host - the direct host is
    IPv6-only and fails to resolve on most hosting providers.
- One payment gateway's keys (`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY`,
  `FLUTTERWAVE_*`, or `STRIPE_*`) and `PAYMENT_PROVIDER` set to match -
  see section 4.
- `PLATFORM_ADMIN_EMAILS` - comma-separated emails allowed into the
  platform-admin console (`backend.html`, reachable via `admin-login.html`).

Everything else in `.env.example` is optional and documented inline.

### Creating your first platform admin

```bash
node --env-file-if-exists=.env server/create-admin.js you@yourdomain.com
```

Prints a one-time password - save it, then sign in at `/admin-login.html`.
(The email must also be in `PLATFORM_ADMIN_EMAILS`, or add it afterward
from the Platform Admins tab in `backend.html` once you have one admin in.)

## 3. Rebranding

The platform's own name/logo/support email/domain are read from env vars
(`server/branding.js`) instead of being hardcoded, so you don't need to
hunt through every file to rebrand:

```bash
BRAND_NAME=YourBrand
BRAND_LOGO_URL=/assets/branding/logo/your-logo.png   # or a full https:// URL
BRAND_SUPPORT_EMAIL=support@yourbrand.com
BRAND_DOMAIN=yourbrand.com
BRAND_THEME_COLOR=#13241e
BRAND_BACKGROUND_COLOR=#f5f7f4
```

This drives `document.title`, meta tags, the PWA `manifest.json` (now
served dynamically from `GET /manifest.json`, not a static file), every
transactional email template, and the visible brand-name text across the
app - `branding.js` (included on every page) fetches `GET /api/brand` and
rewrites the page on load.

**What this does NOT reach:** a handful of brand-name strings baked into
`founding-members.html`'s own inline `<script>` (a growth/marketing
landing page that builds shareable text at runtime - a JS template
literal, not static markup). Grep the repo for `SellersPoint` before a
real launch to catch anything like that; everything the grep turns up
outside `founding-members.html`'s `<script>` block should already be
templated.

Also replace `/assets/branding/logo/*` with your own logo files (same
filenames, or update `BRAND_LOGO_URL`/`BRAND_ICON_URL`), and the favicon
references in each page's `<head>`.

## 4. Payment gateway

Three providers are supported behind one interface (`server/payments/`):

| Provider | Plan/add-on billing | Storefront direct-to-seller payouts (split payments) |
|---|---|---|
| Paystack | Yes | Yes |
| Flutterwave | Yes | Yes |
| Stripe | Yes | **No** - needs Stripe Connect (a separate OAuth seller-onboarding flow), not built here |

Set the startup default via env vars (`PAYMENT_PROVIDER` +
that provider's keys in `.env`). The platform admin can also switch
providers and edit keys live from **Platform Settings > Payment Gateway**
in `backend.html`, without redeploying - whatever's saved there wins once
the server has loaded it once.

Each provider needs its webhook pointed at
`https://<your-domain>/api/payments/webhook`:
- Paystack: dashboard's Webhooks tab, signs with your secret key (HMAC).
- Flutterwave: dashboard's webhook config, needs a "secret hash" you set
  in both places (`FLUTTERWAVE_SECRET_HASH`) - it's a plain shared secret,
  not a computed signature.
- Stripe: dashboard's Webhooks tab, listening for
  `checkout.session.completed`; copy the signing secret into
  `STRIPE_WEBHOOK_SECRET`.

**Flutterwave and Stripe are built directly against each provider's
documented REST API but have not been exercised against real accounts in
this environment.** Test a full checkout with real (sandbox/test-mode)
keys before taking either live. Paystack is the original, most-exercised
integration.

## 5. What's different from the original SellersPoint product

- **My Docs removed** - CAC business registration, Compliance Calendar,
  Tax Tools, Trackers, and the Document Vault are gone (they only made
  sense for Nigerian company registration). The underlying database
  tables (`docs_*`, `business_registration_*`) are left in place, empty,
  rather than dropped - a code-only removal, easy to resurrect if you
  build market-specific compliance tooling of your own later.
- **Multi-payment-gateway** instead of Paystack-only (see section 4).
- **Centralized branding** instead of hardcoded "SellersPoint" (see
  section 3).

Everything else - products/customers/orders, invoicing, POS, the public
storefront, staff with custom per-member permissions, WhatsApp
notifications, AI tools (OpenRouter), reports, loyalty, coupons, ShipBubble
delivery integration - is unchanged from the main product.

## 6. Known limitations to review before a real launch

- **WhatsApp** (`WASENDER_API_KEY`) is a single shared-number integration
  tied to one WasenderAPI account, same as the original product - bring
  your own account, or rely on the automatic `wa.me` deep-link fallback
  (works with zero configuration, just isn't automated).
- **ShipBubble** delivery integration is Nigeria-focused; outside that
  market, sellers will just use "self-pickup / arrange my own delivery."
- Deployment is written with [Railway](https://railway.app) in mind (see
  comments in `.env.example`/`server/index.js`) but is plain Node/Express -
  any Node host with a reachable Postgres works.

## 7. Project layout

```
server/            Express API, one file per concern (db.js is the only
                    thing that talks to Postgres; payments/, email.js,
                    whatsapp.js, ai.js are thin external-API clients)
server/payments/    Multi-provider payment gateway (index.js picks the
                    active one; paystack.js/flutterwave.js/stripe.js)
server/schema.sql   Full schema, additive migrations (safe to re-run)
app.html / app.js       Seller dashboard
store.html / store.js   Public per-business storefront
backend.html / backend.js  Platform-admin console
upgrade.html / upgrade.js  Plan/add-on checkout
*.html                  Marketing/auth/legal pages (signup, login, terms, etc.)
```
