# SellPoint — Development Run-Through

_Last updated: 2026-07-07_

A single document to get oriented fast: what SellPoint is, what's actually
built, how the pieces fit together, what's missing, and what to do next.
For deep implementation notes on *why* things are built the way they are,
see `CLAUDE_HANDOFF.md` — this file is the map; that one is the terrain.

---

## 1. What SellPoint is

SellPoint is a multi-tenant SaaS app for small Nigerian businesses to run
sales: track products, customers, and orders, generate invoices/receipts,
handle digital-product delivery, and pay for a subscription plan via
Paystack. Any number of independent businesses can sign up; each only ever
sees its own data.

## 2. Project history (2 commits so far)

1. **`ee0b463` — Initial import**: a frontend-only prototype. Static HTML/JS,
   `localStorage` for persistence, one shared business, no real auth.
2. **`278a6de` — Multi-tenant SaaS rewrite**: added a real Node/Express +
   Postgres (Supabase) backend, Supabase Auth (email+password) replacing
   shared HTTP Basic Auth, `business_id` scoping on every table, and real
   Paystack checkout (initialize / webhook / verify-by-reference). This is
   the current state of the app — **it is no longer a static site**.

## 3. Tech stack

| Layer | Choice |
|---|---|
| Frontend | Plain HTML/CSS/JS (no framework, no build step) |
| Backend | Node.js (>=22.5.0) + Express |
| Database | Postgres, hosted on Supabase |
| Auth | Supabase Auth (email + password) |
| Payments | Paystack (checkout + webhook + verify-by-reference) |
| Hosting target | Railway or Render (needs a persistent Node process — static hosts won't work) |

No test framework, no CI pipeline, no build tooling — this is intentionally
minimal today. See gaps below.

## 4. Repo map

```
index.html / app.js         seller-facing app (products, customers, orders, invoices, AI tab)
login.html / login.js       Supabase sign-in
signup.html / signup.js     Supabase sign-up (captures business name only)
auth-shared.js              window.Auth.{requireSession, ensureBusiness, logout} — shared by every authed page
supabase-init.js            the one type="module" script per page; exposes window.supabaseReady
backend.html / backend.js   SellPoint's OWN cross-tenant platform-admin panel (not per-business)
upgrade.html / upgrade.js   plan picker + Paystack checkout
styles.css                  shared styling

server/index.js             Express app, all /api/* routes
server/db.js                Postgres queries via `pg`, every function takes businessId
server/auth.js              requireAuthOnly / requireAuth / requirePlatformAdmin middleware
server/pricing.js           plan tiers (starter/basic/standard/premium) + order-limit lookup
server/payments.js          Paystack init / webhook signature verify / verify-by-reference
server/schema.sql           idempotent Postgres schema (apply via `npm run migrate`)
server/migrate.js           runs schema.sql against DATABASE_URL

CLAUDE_HANDOFF.md           deep architectural notes (auth model, multi-tenancy, payments flow)
HOSTING.md                  deployment guide (Railway/Render/VPS)
.env.example                required environment variables
```

## 5. Data model (Postgres, `server/schema.sql`)

- `businesses` — one row per tenant.
- `business_members` — links a Supabase Auth user to exactly one business
  (`role`: `owner` today, `staff` modeled but no invite UI).
- `products`, `customers`, `orders`, `events`, `payments` — all carry
  `business_id`; every query and delete in `server/db.js` is scoped by it.
- `owner_payment` — a genuine singleton row: SellPoint's *own* payout
  details shown on `upgrade.html`, edited from `backend.html`.

Business creation happens on **first login**, not at signup, because
Supabase can require email confirmation before a session exists
(`window.Auth.ensureBusiness()` runs right after sign-in).

## 6. Auth model

- Frontend never talks to Postgres directly — Supabase client only handles
  `signUp` / `signInWithPassword` / `getSession` / `signOut`.
- Every authed page attaches `Authorization: Bearer <access_token>` on its
  own `/api/*` calls.
- `server/auth.js` verifies the token via `supabaseAdmin.auth.getUser()`
  (service-role key) — no hand-rolled JWT verification.
- Three middleware tiers: `requireAuthOnly` (session only), `requireAuth`
  (session + resolved `businessId`/`role`), `requirePlatformAdmin` (session
  + email in `PLATFORM_ADMIN_EMAILS`).
- Client-side redirect-to-login is UX only — **real enforcement is
  server-side** since static HTML is served unauthenticated.

## 7. Payments (Paystack) — current flow

1. `POST /api/payments/initialize` (authed) starts a transaction; stamps
   `businessId`/`plan`/`billingCycle` into Paystack `metadata`.
2. `POST /api/payments/webhook` (public, HMAC-signature verified) activates
   the plan on `charge.success`.
3. `GET /api/payments/verify/:reference` (authed) — polls Paystack directly;
   this is what actually activates plans **in local dev**, since Paystack
   can't reach a webhook on `127.0.0.1`.
4. Both paths funnel through `finalizeIfSuccessful()`, deduped by
   `payments.reference` unique constraint, so a plan is never double-activated.

Without `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` set, checkout is
disabled and `upgrade.html` falls back to manual bank-transfer-proof.

Plan tiers (`server/pricing.js`): Starter (free, 20 orders/mo), Basic
(₦5,000/mo), Standard (₦9,000/mo), Premium (₦15,000/mo); yearly = 10x
monthly (2 months free).

## 8. What's actually working today

- Multi-tenant signup/login/business creation.
- Product, customer, and order CRUD, scoped per business.
- Invoice tab, AI tab, dashboard, settings tab in `index.html`.
- Demo data seeding and reset (`/api/demo`, `/api/reset`).
- Real Paystack checkout with webhook + verify-by-reference fallback.
- Platform-admin panel (`backend.html`) listing all businesses/payments and
  editing SellPoint's own payout details.
- **Server-side input validation** on product price/stock and order qty
  (`server/validate.js`) — negative stock, non-numeric price, etc. now
  reject with a 400 instead of silently coercing to 0.
- **Automated tests + CI** — `server/__tests__/` (Node's built-in
  `node:test`) covers validation, pricing tiers, and Paystack webhook
  signature verification; `.github/workflows/ci.yml` runs `npm test` on
  every push/PR to `master`.

## 9. Known gaps / not yet done

1. **No Postgres Row Level Security** — not a hard requirement today (the
   DB connection string never reaches the browser) but recommended
   defense-in-depth.
2. **Staff invites** — `business_members.role = 'staff'` exists in the
   schema but there's no invite UI or endpoint.
3. **File uploads (logo, digital-product downloads) are base64 in
   Postgres**, not object storage — fine at small scale, will bloat the DB
   over time.
4. **Single payment provider** — Paystack only; Flutterwave listed as a
   good next add for redundancy/coverage.
5. **No downloadable receipt PDF**, no customer-facing checkout page per
   order.
6. **No expiry-based downgrade notifications** before `plan_expires_at` lapses.
7. **NGN-only, no i18n/multi-currency.**
8. **Not deployed anywhere yet** — `HOSTING.md` documents Railway/Render as
   the recommended path, but there's no evidence of an actual deployment
   (no CI/CD-triggered deploy, no recorded production URL). CI now runs
   tests on push, but nothing deploys yet.
9. **Test coverage is unit-level only** — `server/__tests__/` covers pure
   logic (validation, pricing, webhook signatures); `server/db.js` and the
   `/api/*` routes have no integration tests yet since that requires a
   real (or containerized) Postgres instance.

## 10. How to run it locally right now

```bash
# 1. Create a free Supabase project.
# 2. cp .env.example .env and fill in:
#    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#    DATABASE_URL (Project Settings -> Database -> Connection string),
#    PLATFORM_ADMIN_EMAILS (your own email, comma-separated if more than one)

npm install
npm run migrate   # applies server/schema.sql — safe to re-run
npm start
```

Then open:
- `http://127.0.0.1:5174/signup.html` — create your first business
- `http://127.0.0.1:5174` — the seller app
- `http://127.0.0.1:5174/backend.html` — platform admin (only if your email
  is in `PLATFORM_ADMIN_EMAILS`)
- `http://127.0.0.1:5174/upgrade.html`

Paystack checkout stays disabled (manual bank-transfer fallback only) until
`PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` are set.

## 11. Recommended next steps, in order

**Done:**
- ~~Add basic server-side validation on price/stock/qty~~ — done
  (`server/validate.js`).
- ~~Add automated tests + CI~~ — done (`server/__tests__/`,
  `.github/workflows/ci.yml`).

**Before adding features:**
1. Deploy once (Railway or Render, per `HOSTING.md`) so there's a real URL
   to test against and register the Paystack webhook — right now all
   payment activation in "production" would silently rely on the
   verify-by-reference fallback, which only fires if the seller's browser
   returns to `upgrade.html`. This is the last unfinished Slice One
   priority-1/2/3 item, and it needs a Supabase project + Railway/Render
   account (external credentials, not something done from the repo alone).

**Then, in priority order (from `CLAUDE.md`'s Slice One, still accurate):**
2. Monitoring, analytics, error tracking (needs the deploy above first).
3. Row Level Security as defense-in-depth.
4. Role permissions + audit logs (prerequisite for staff invites).
5. API versioning.
6. MFA + device management.
7. Offline-first architecture, background sync, local caching.
8. Faster onboarding: guided setup, business templates, demo mode,
   interactive walkthroughs.

**Slice Two, once Slice One is solid:**
9. Staff invites (schema-ready, no UI).
10. Quotes, refunds, credit sales; expenses/cashbook/P&L.
11. Move logo/digital-download uploads to Supabase Storage instead of base64.
12. Downloadable receipt PDF + customer-facing checkout page per order.
13. Expiry-based downgrade notifications before `plan_expires_at` lapses.
14. Second payment provider (Flutterwave) for redundancy.
15. Multi-currency/i18n if expanding beyond Nigeria.

## 12. Where to look for more detail

- **Architecture rationale / "why" for auth, multi-tenancy, payments** →
  `CLAUDE_HANDOFF.md`
- **Deployment steps and hosting trade-offs** → `HOSTING.md`
- **Required env vars** → `.env.example`
