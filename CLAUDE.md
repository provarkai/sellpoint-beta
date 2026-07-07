# SellersPoint — Strategic & Development Guide

This is the single file that ties **strategy** (why we're building this, in
what order, and why it wins) to **execution** (what's actually in the repo
today). Read this first. For deep technical rationale (auth model,
multi-tenancy, payments) see `CLAUDE_HANDOFF.md`; for a snapshot of current
build status and gaps see `DEVELOPMENT_RUNTHROUGH.md`.

---

## Strategic Positioning

**Mission** — Empower every entrepreneur in Africa with an intelligent
business operating system that makes running a business as simple as
sending a WhatsApp message.

**Vision** — To become Africa's most trusted AI-powered commerce platform,
enabling millions of businesses to sell, manage, grow, and scale locally
and globally.

**North Star** — Every African business should be able to start, manage,
and grow from one intelligent platform.

**Category** — AI Business Operating System (AI BOS). Not inventory
software, not POS software, not accounting software, not an invoice
generator — SellersPoint combines all of these into a single intelligent
operating system.

---

## How to read the roadmap below

The roadmap is organized into five **slices**. They are ordered as a
**sequential build path, not five parallel tracks** — each slice is the
prerequisite trust/data/infrastructure layer for the one after it. Do not
start meaningful work on Slice N+1 until Slice N's priority-1/2 items are
done; everything after that within a slice can interleave with early items
of the next slice once the riskiest dependency is cleared.

Every slice answers the same four questions:
1. **What are we building?**
2. **Why does it matter?**
3. **How does it create a competitive advantage?**
4. **How does it move SellersPoint from Lagos → Africa → the world?**

Within each slice, features are numbered in **build priority order** —
lower number = do first. Priority is driven by: (a) what's already
half-built and cheap to finish, (b) what blocks everything after it, (c)
what most directly compounds retention or revenue.

---

## SLICE ONE — Build the Foundation

**Theme:** World-Class Infrastructure

1. **What:** A secure, scalable, enterprise-grade platform — deployment,
   testing, security, performance, and onboarding UX — built *before*
   layering on commerce and AI features.
2. **Why:** SellersPoint already has multi-tenancy, Supabase Auth, business
   isolation, subscriptions, and Paystack checkout (see
   `DEVELOPMENT_RUNTHROUGH.md` §8) — but it has never been deployed, has
   zero automated tests, and has no input validation or Row Level
   Security. Every later slice assumes this foundation holds under real
   traffic and real money; skipping it means building commerce and AI
   features on sand.
3. **Competitive advantage:** Trust is the actual product for a business's
   sales and money data. Getting infrastructure right *before* scaling
   features is what lets SellersPoint credibly sit above informal
   spreadsheet/notebook tools and compete with funded incumbents on
   reliability, not just feature count.
4. **Lagos → Africa → world:** A platform that only works for one business
   on one laptop can't expand. Foundational rigor here is what lets the
   same codebase later serve a Lagos kiosk and a multi-branch retailer
   across ten countries without a rebuild.

### Priority order

1. **Production deployment** (Railway/Render per `HOSTING.md`) — **not yet
   done**; nothing else is real until there's a public URL. Also unblocks
   the Paystack webhook, which today only activates plans via the
   browser-dependent verify-by-reference fallback. Needs external
   accounts/credentials (Supabase project, Railway/Render account), so
   this is the one item in this slice that isn't a pure code change.
2. **Server-side input validation** (price/stock/qty range checks) — ✅
   done: `server/validate.js` + `server/db.js` reject negative stock,
   non-numeric price, non-integer/zero qty, etc. with a 400 instead of
   silently coercing.
3. **Automated testing + CI/CD** — ✅ done: `server/__tests__/` (Node's
   built-in `node:test`) covers validation, pricing tiers, and Paystack
   webhook signature verification; `.github/workflows/ci.yml` runs
   `npm test` on every push/PR. Still unit-level only — `server/db.js` and
   the `/api/*` routes have no integration tests yet (needs a real/
   containerized Postgres instance).
4. **Monitoring, analytics, error tracking** — needed the moment real
   users hit the deployed instance.
5. **Row Level Security** — defense-in-depth now that there's a production
   database with real tenant data in it.
6. **Role permissions + audit logs** — prerequisite for staff invites
   (Slice Two depends on this — `business_members.role = 'staff'` already
   exists in the schema with no UI).
7. **API versioning** — do this before external integrations (Slice
   Four/Five payment and marketplace partners) start depending on
   endpoint shape.
8. **MFA + device management** — enterprise-grade trust signal, valuable
   once Business/Enterprise-tier customers (Slice Five pricing) exist.
9. **Offline-first architecture, background sync, local caching** —
   biggest engineering lift in this slice; sequence after correctness and
   security are solid, since offline sync bugs are expensive to debug on
   top of an unstable base.
10. **Faster onboarding: guided setup, business templates, demo mode,
    interactive walkthroughs** — demo data seeding already exists
    (`POST /api/demo`); extend rather than rebuild.

---

## SLICE TWO — Own Everyday Commerce

**Theme:** Become the Daily Business Workspace

1. **What:** Expand from products/customers/orders into the full daily
   operating loop — sales, CRM, inventory, finance, and commerce
   (storefront, QR ordering, payment links, delivery).
2. **Why:** A tool used once a week is a utility; a tool used every hour is
   infrastructure. Every feature here is chosen to convert SellersPoint from
   "where I make an invoice" into "where my business day happens."
3. **Competitive advantage:** Bundling sales, CRM, inventory, and finance
   in one mobile-first product beats assembling five separate tools
   (POS app + notebook + WhatsApp broadcasts + a banking app) — which is
   the real status quo for most African SMEs today.
4. **Lagos → Africa → world:** The deeper a business's daily workflow is
   embedded in SellersPoint, the higher the switching cost — which is what
   makes the Slice Four localization investment (new currencies, payment
   rails) pay off instead of just adding surface area nobody uses.

### Priority order

1. **Quotes, refunds, credit sales** — direct extensions of the existing
   `orders` table/flow; lowest lift, closes obvious gaps in the current
   order lifecycle.
2. **Expenses, cashbook, Profit & Loss, daily reconciliation** — finance
   basics that make SellersPoint the source of truth for "did I make money
   today," a top daily question for the target user.
3. **CRM depth: customer timelines, smart segmentation** — extends the
   existing `customers` table; directly enables Slice Three's AI insights
   and Slice Five's WhatsApp automation.
4. **Suppliers, purchase orders** — extends the existing `products` table;
   needed before barcode/batch/warehouse features make sense.
5. **Payment links, QR ordering, online storefront** — builds directly on
   the Paystack integration already shipped; turns SellersPoint into a
   revenue channel, not just a record-keeper.
6. **Loyalty, wallet** — retention mechanics; sequence after storefront
   exists since loyalty needs a customer-facing surface to redeem against.
7. **Delivery integration** — depends on storefront/order-to-customer flow
   being solid first.
8. **Barcode scanning, batch tracking, warehouse support, dedicated POS
   mode** — highest lift, serves larger/multi-branch businesses; correctly
   sequenced last since it's the least urgent for the median early
   customer (a solo seller or small shop).

---

## SLICE THREE — AI Business Manager

**Theme:** Intelligence as the Operating Layer

1. **What:** Move SellersPoint from record-keeping to decision-making —
   natural-language queries, proactive insights/briefings, automation
   (reminders, campaigns, smart pricing, forecasting), and eventually
   voice AI.
2. **Why:** Once Slice Two makes SellersPoint the system of record for sales,
   customers, expenses, and inventory, it's sitting on the exact data an
   AI needs to answer "who owes me money," "what should I reorder," and
   "how much profit did I make" — questions the target user currently
   answers by memory or notebook.
3. **Competitive advantage:** Traditional POS/inventory/accounting tools
   are reactive — they show you numbers. An AI that proactively tells a
   shop owner what to do next (reorder this, follow up with that debtor)
   is a materially different product category, not a feature bump.
4. **Lagos → Africa → world:** AI-driven insight and automation scale
   without local headcount — the same assistant that helps a Lagos trader
   works for a trader in Nairobi or Accra with a data/language swap, not a
   new team.

### Priority order

1. **AI Assistant (natural-language queries)** — highest differentiation
   per unit of effort; `index.html` already has an AI tab stub to build on,
   and answering "who owes me money"-style questions only needs read
   access to data Slice Two already produces.
2. **AI Insights (daily briefings, sales trends, profit recommendations,
   risk alerts)** — same underlying data as #1, packaged as push rather
   than pull; natural next step once the assistant works.
3. **AI Automation (customer reminders, marketing campaigns)** — depends
   on Slice Two's CRM segmentation and, for real reach, Slice Five's
   WhatsApp automation being in place first.
4. **Smart pricing, forecasting, inventory optimization** — needs several
   months of transaction history to be useful; sequence after the
   platform has real usage data, not at launch.
5. **Voice AI (record sales, search products, generate reports, issue
   receipts by voice)** — most complex to ship reliably across accents/
   languages; correctly last.

---

## SLICE FOUR — Africa Expansion Platform

**Theme:** Designed for Every African Market

1. **What:** Multi-currency, multi-language, and multi-payment-rail
   support, plus country-specific tax/compliance — engineered as
   configuration on one shared architecture, not a fork per country.
2. **Why:** SellersPoint is NGN-only and Paystack-only today
   (`DEVELOPMENT_RUNTHROUGH.md` §9.6, §9.9). Every country beyond Nigeria
   needs local currency and at least one dominant local payment rail
   before a single business there can use the product for real money.
3. **Competitive advantage:** Building this as configuration (not a fork)
   is what lets SellersPoint enter a new country in weeks instead of months —
   the actual mechanism behind "scale without rebuilding."
4. **Lagos → Africa → world:** This slice *is* the Lagos → Africa step,
   literally — it is the direct unlock for every market beyond Nigeria,
   and the multi-currency/multi-language groundwork is also what makes
   diaspora and cross-border traders (the "world" stage) reachable later.

### Priority order

1. **Multi-currency support** — foundational; every other item in this
   slice is meaningless without it, since it's the schema/pricing-engine
   change everything else hangs off.
2. **Second payment provider: Flutterwave** — already flagged as the next
   payments task in `CLAUDE_HANDOFF.md`; also the fastest way to de-risk
   being single-provider-dependent even before expanding countries.
3. **Mobile money rails: Moniepoint, OPay, PalmPay, M-Pesa, MTN Mobile
   Money, Orange Money** — sequence by market entry order (Nigeria rails
   first since that's the existing base, then Kenya/Ghana/Uganda as those
   markets open).
4. **Languages: French, Swahili, Arabic, Portuguese** (English is
   default) — pick per the same market-entry order as the payment rails
   above; a market's language should ship no later than its payment rail.
5. **Tax systems / country-specific compliance, VAT, receipt formats,
   regional regulations** — highest complexity and legal risk; sequence
   last, market by market, only once a country has real committed users.

---

## SLICE FIVE — Business Ecosystem & Revenue Engine

**Theme:** From Software to Business Infrastructure

1. **What:** Evolve pricing from feature-gating to business-stage pricing,
   and layer additional revenue streams (AI credits, WhatsApp automation,
   online store hosting, payment processing, embedded finance,
   marketplace/developer ecosystem) on top of the product built in Slices
   One–Four.
2. **Why:** Revenue diversity and stage-based pricing are what turn a
   single-SKU subscription product into infrastructure a business can't
   easily leave — and they only make sense once there's enough product
   surface (Slices Two–Three) to price against business maturity instead
   of feature counts.
3. **Competitive advantage:** "Upgrade because your business grew, not
   because we removed features" is a retention and word-of-mouth engine
   competitors using punitive feature-gating don't have — see the
   flywheel below.
4. **Lagos → Africa → world:** Embedded finance and a marketplace/developer
   ecosystem are what let SellersPoint capture value *beyond* software fees
   at continental scale — the same mechanism Stripe/Shopify used to grow
   from tools into infrastructure.

### Priority order

1. **Migrate pricing to business-stage tiers** (see table below) — do this
   before adding paid add-ons, since every subsequent revenue stream needs
   a stable tier structure to attach to.
2. **WhatsApp automation** (bulk messaging, scheduled reminders, marketing
   campaigns) — natural fit for the target market's existing behavior,
   moderate lift, and a direct dependency for Slice Three's AI automation.
3. **AI credits** (premium AI usage) — monetizes Slice Three directly once
   the AI assistant/insights are live.
4. **Online store hosting as a paid feature** — monetizes Slice Two's
   storefront once it exists.
5. **Payment processing revenue** (payment links, QR payments, checkout
   pages) — same dependency; ties directly to Slice Two commerce features.
6. **Embedded finance** (working capital loans, business banking,
   insurance, savings) — needs financial-services partnerships and a
   mature transaction history to underwrite against; correctly a later
   bet.
7. **Marketplace: third-party apps, developer ecosystem, API
   subscriptions** — needs platform maturity and a real developer audience
   to be worth building; last on purpose.

### Pricing strategy — business-stage pricing

**Status: live in `server/pricing.js`, but only half-active.** All five
tiers below are fully defined, but only Starter + Growth are actually
offered to customers today (`platform_settings.extended_pricing_enabled`,
toggled from `backend.html` → "Pricing Tiers") — because Pro and Business
don't yet gate anything Growth doesn't have. Charging more for an
identical product won't hold up once anyone compares tiers side by side,
so **item 0 in this slice's priority order, above everything else, is
building the features that justify Pro/Business's price** (staff seat
limits enforced server-side, AI usage metering, a reports view) before
flipping that toggle on for real customers.

| Plan | Target customer | Monthly price | Core value |
|---|---|---|---|
| Starter | Side hustles & new sellers | Free (30 orders/mo) | Get started quickly |
| Growth | Everyday shop owners | ₦5,000 | Organize and grow sales |
| Pro | Growing SMEs | ₦8,500 | Manage teams and optimize operations |
| Business | Multi-branch companies | ₦20,000 | Control complex businesses |
| Enterprise | Large organizations | Custom | Scale with dedicated support |

Yearly billing = 10x monthly (2 months free) for every tier with a fixed
price; Enterprise has no fixed price and is excluded from self-serve
Paystack checkout until a contact-sales flow exists.

**Revenue philosophy:** users should upgrade because their business has
grown — not because essential features were removed.

---

## Go-to-Market Strategy

**Phase 1 — Lagos:** market activations, business associations, trade
fairs, local onboarding teams.

**Phase 2 — Nigeria:** referral programs, POS resellers, business
consultants, digital agencies.

**Phase 3 — Africa:** local payment partners, country ambassadors,
regional reseller networks, government and SME partnerships. (Depends on
Slice Four localization being live in-market first.)

**Phase 4 — Global:** African diaspora businesses, cross-border traders,
international SMEs trading with Africa.

---

## Strategic Positioning Against Competitors

| Competitor | What they do | SellersPoint advantage |
|---|---|---|
| Shopify | E-commerce | AI-powered business operations beyond online stores |
| Stripe | Payments | Complete business operating system with embedded payments |
| Moniepoint | Banking & POS | End-to-end business management plus AI |
| Odoo | ERP | Simpler, mobile-first, built for African SMEs |
| Zoho | Business suite | Localized for African commerce with WhatsApp-native workflows |
| QuickBooks | Accounting | Commerce-first with AI assistance and operational tools |

---

## The SellersPoint Flywheel

1. Free tools attract sellers.
2. Sellers generate invoices and receipts.
3. Receipts carry the SellersPoint brand to new businesses.
4. Recipients discover and join SellersPoint.
5. Growing businesses upgrade to paid plans.
6. AI and automation increase business value and retention.
7. Financial services, payments, and the marketplace create additional
   revenue streams.
8. The ecosystem strengthens, making SellersPoint the default business
   operating system for African commerce.

---

## Where to look for more detail

- **Current build status, what's shipped vs. missing today** →
  `DEVELOPMENT_RUNTHROUGH.md`
- **Architecture rationale — auth, multi-tenancy, payments** →
  `CLAUDE_HANDOFF.md`
- **Deployment steps and hosting trade-offs** → `HOSTING.md`
- **Required environment variables** → `.env.example`
