# SellersPoint - Claude Code Handoff

This file covers architecture rationale - the "why" behind auth,
multi-tenancy, and payments. For the strategic roadmap and business-stage
pricing plan, see `CLAUDE.md`. For a fast orientation to what's built today
and known gaps, see `DEVELOPMENT_RUNTHROUGH.md`.

## Project Location
This lives at:

`C:\Users\USER\Projects\sellpoint-beta`

## Pages
- `index.html` - seller-facing app (multi-tenant: each logged-in business only ever sees its own data)
- `login.html` / `signup.html` - Supabase Auth email+password
- `backend.html` - SellersPoint's own cross-tenant platform-admin panel (not a per-business admin view)
- `upgrade.html` - per-business plan upgrade + Paystack checkout page (requires login)

## Scripts
- `app.js` - seller app logic (fetches/writes via the `/api/*` backend), orders, receipts, digital delivery
- `login.js` / `signup.js` - Supabase Auth sign-in/sign-up
- `auth-shared.js` - classic (non-module) script shared by every authenticated page; exposes `window.Auth.{requireSession, ensureBusiness, logout}`
- `supabase-init.js` - the one `type="module"` script on each page; fetches `/api/config` and exposes `window.supabaseReady` (a Promise) so the classic scripts above can `await` it without needing to be modules themselves (module scripts don't leak declarations to `window`, which the app's inline `onclick="..."` handlers depend on)
- `backend.js` - platform-admin: all businesses, all payments, SellersPoint's own payout details
- `upgrade.js` - plan selection and Paystack checkout
- `styles.css` - shared styling
- `server/index.js` - Express server: serves the static pages and the `/api/*` REST endpoints
- `server/db.js` - Postgres access via `pg`, every business-scoped function takes a `businessId`
- `server/auth.js` - Supabase session verification middleware (`requireAuthOnly`, `requireAuth`, `requirePlatformAdmin`)
- `server/pricing.js` - subscription tier definitions (starter/growth/pro/business/enterprise) and order-limit lookup
- `server/payments.js` - Paystack transaction init, webhook signature verification, verify-by-reference
- `server/schema.sql` - Postgres schema, idempotent (`IF NOT EXISTS` everywhere) - apply with `npm run migrate`

## Multi-Tenancy
SellersPoint is a real multi-tenant SaaS: any number of independent businesses
can sign up and each only ever sees its own products/customers/orders/plan.

- `businesses` - one row per tenant (replaces the old single `business` row).
- `business_members` - links a Supabase Auth user to exactly one business,
  with a `role` (`owner` today; `staff` is modeled but has no invite UI yet).
- `products` / `customers` / `orders` / `events` / `payments` all carry a
  `business_id` and every query in `server/db.js` is scoped by it. Deletes
  also filter by `business_id` (not just the row's own id) so one tenant can
  never affect another tenant's row even by guessing an id.
- `owner_payment` is a genuine singleton (`CHECK (id = 1)`) - it's SellersPoint's
  own payout details shown on `upgrade.html`, not per-tenant.

**Business creation happens on first login, not at signup.** Supabase can
require email confirmation before a session exists, so `signup.js` only
captures the business name into the auth user's `user_metadata` and defers
actually creating the `businesses`/`business_members` rows to
`window.Auth.ensureBusiness()`, called right after a successful
`supabase.auth.signInWithPassword()`. This way it works the same whether
email confirmation is on or off, instead of needing two different code paths.

## Two Different "Admin" Concepts
- **A business's own admin view** is just the Settings tab in `index.html` -
  every logged-in business owner already has this, no separate page needed.
- **`backend.html` is SellersPoint's own cross-tenant operator panel** - it lists
  every business on the platform and every payment across all of them, and
  edits SellersPoint's own payout details. It is *not* a per-business dashboard
  anymore (that's what it was in the single-tenant beta). Gated by
  `requirePlatformAdmin`, which checks the logged-in user's email against the
  `PLATFORM_ADMIN_EMAILS` env var - there's no separate admin table, since
  it's meant for the handful of people who run SellersPoint itself, not tenants.

## Authentication
All auth is Supabase Auth (email + password) - the old shared HTTP Basic Auth
pair per role is gone entirely.

- The frontend never talks to Postgres directly. `supabase-init.js` creates a
  Supabase client (using the public anon key, fetched from `GET /api/config`)
  purely for `signUp`/`signInWithPassword`/`getSession`/`signOut`.
- Every authenticated page attaches `Authorization: Bearer <access_token>` on
  its own API calls (see each page's `api()` helper) and calls
  `window.Auth.requireSession()` on load, which redirects to `login.html` if
  there's no session. This is a client-side UX redirect only - **the real
  enforcement is server-side**, since a page's static HTML is still served
  unauthenticated (a plain navigation has no way to attach a bearer token).
- `server/auth.js` verifies the bearer token by calling
  `supabaseAdmin.auth.getUser(token)` (using the service-role key) rather than
  hand-rolling JWT/JWKS verification - one extra network round trip per
  request, but stays correct across any signing-key rotation Supabase does.
  - `requireAuthOnly` - valid session, no business required yet (used by
    `POST /api/businesses` and `GET /api/me`).
  - `requireAuth` - valid session + resolves `business_members` into
    `req.businessId`/`req.role`. 403s if the account has no business.
  - `requirePlatformAdmin` - valid session + email in `PLATFORM_ADMIN_EMAILS`.

`GET /api/pricing`, `GET /api/owner`, `GET /api/config`, and
`POST /api/payments/webhook` are intentionally public (pricing/owner details
need to render before login; Paystack can't attach a bearer token to its
webhook, so that route is instead secured by verifying the
`x-paystack-signature` HMAC).

## Payments (Paystack)
Set `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` (see `.env.example`) to
enable real checkout. With them unset, `/api/payments/initialize` returns a
400 - there is no manual-payment fallback, checkout is Paystack-only.

- `POST /api/payments/initialize` (`requireAuth`) - starts a Paystack
  transaction for the caller's business, plan, and billing cycle, returns
  `authorizationUrl`. `businessId` is stamped into the transaction `metadata`
  alongside `plan`/`billingCycle` - this is the only way the webhook (a pure
  server-to-server call with no session) can know which tenant to activate.
- `POST /api/payments/webhook` (public, signature-verified) - activates the
  plan on `charge.success` using `metadata.businessId`.
- `GET /api/payments/verify/:reference` (`requireAuth`) - polls Paystack
  directly by reference and activates the plan if not already activated; also
  checks `metadata.businessId` matches the caller's own business before
  trusting it. **This is what actually activates the plan in local dev**,
  since Paystack has no way to reach a webhook on `127.0.0.1` -
  `upgrade.html` calls it automatically when the browser returns from
  Paystack's checkout page.
- `GET /api/admin/payments` (`requirePlatformAdmin`) - cross-tenant payment
  history, shown on `backend.html`.
- `GET`/`PUT /api/admin/settings` (`requirePlatformAdmin`) - reads/writes
  `platform_settings.extended_pricing_enabled`, the toggle behind
  `backend.html`'s "Pricing Tiers" panel. `GET /api/pricing` (public) reads
  this same flag via `pricing.visibleTiers()` to decide whether to return
  just `{starter, growth}` or the full 5-tier ladder - see `CLAUDE.md`'s
  pricing strategy section for why Pro/Business/Enterprise are hidden by
  default.

Both the webhook and the verify-by-reference path funnel through
`finalizeIfSuccessful()` in `server/index.js`, which uses `db.recordPayment()`'s
unique-reference constraint to dedupe, so a plan is never double-activated if
both paths fire for the same transaction.

Once this is deployed somewhere with a public HTTPS URL, register
`https://<your-domain>/api/payments/webhook` in the Paystack dashboard so
activation doesn't depend on the seller's browser staying open through checkout.

## Good Next Tasks for Claude Code
**Done:** server-side input validation (`server/validate.js`), automated
tests + CI (`server/__tests__/`, `.github/workflows/ci.yml`).

1. Tier feature gating (staff seat limits, AI usage metering, a reports view) before turning on Pro/Business/Enterprise for real customers - see `CLAUDE.md`'s pricing strategy section.
2. Staff invites (multiple `business_members` per business beyond `owner`) - schema supports it, no UI yet.
3. Add Flutterwave as a second payment provider alongside Paystack.
4. Add downloadable receipt PDF.
5. Add customer-facing checkout page per order.
6. Move file uploads (logo/digital product downloads) to Supabase Storage instead of base64 in Postgres.
7. Add Postgres Row Level Security as defense-in-depth (not required today since the DB connection string never reaches the browser, but a good hardening step).
8. Add expiry-based downgrade notifications (email/WhatsApp) before `plan_expires_at` lapses.
9. Multi-currency/i18n if expanding beyond Nigeria (everything is NGN-denominated today).
10. Deploy (Railway/Render per `HOSTING.md`) - not done yet, and the last unfinished Slice One priority item.

## How To Run Locally
1. Create a Supabase project (free tier is fine).
2. Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (Project Settings -> Database ->
   Connection string), and `PLATFORM_ADMIN_EMAILS`.
3. From this folder:

```bash
npm install
npm run migrate   # applies server/schema.sql - safe to re-run
npm start
```

Then open:
- `http://127.0.0.1:5174/signup.html` - create your first business
- `http://127.0.0.1:5174` - the seller app
- `http://127.0.0.1:5174/backend.html` - platform admin (only works if your
  account's email is in `PLATFORM_ADMIN_EMAILS`)
- `http://127.0.0.1:5174/upgrade.html`

(Port 5174 is used instead of 5173 because older ad-hoc static server
instances from before this backend existed may still be occupying 5173 on
this machine. Set the `PORT` environment variable to override.)
