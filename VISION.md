# SellersPoint - Vision & Roadmap

This document is split deliberately into two parts: **what's actually built**
(verifiable by reading the code) and **long-term vision** (aspirational,
years out, not started). Keeping these separate is intentional - conflating
them would make this document actively misleading about where the product
really is.

## Mission

Empower every entrepreneur in Africa with an intelligent business operating
system that makes running a business as simple as sending a WhatsApp message.

## Vision

To become Africa's most trusted AI-powered commerce platform for millions of
businesses.

## Tagline

Smart Business. Simple Selling. Limitless Growth.

## Growth Strategy (aspirational sequencing, not a committed timeline)

Lagos → Nigeria → West Africa → Africa → Global

## What's Actually Built Today

See `CLAUDE_HANDOFF.md` for full technical detail. In summary:

- Multi-tenant SaaS: any number of businesses can sign up (Supabase Auth),
  each with fully isolated products/customers/orders/plan data (Postgres,
  `business_id`-scoped).
- Seller-facing app: products/services/digital products, customers, orders,
  invoices/receipts, manual WhatsApp share links, template-based (not AI)
  caption/reply/reminder/summary generation.
- Real Paystack checkout: initialize/webhook/verify-by-reference, with
  per-tenant plan activation.
- Platform-admin panel (`backend.html`) for SellersPoint's own operators:
  cross-tenant business list, payment history, payout details.
- Pricing tiers: Starter (free), Growth, Pro, Business, Enterprise (custom).
  All five are fully defined in `server/pricing.js`, but **only Starter +
  Growth are offered to customers by default** - Pro and Business are priced
  differently from Growth without gating anything different in the product
  yet (no staff seats, AI credits, or reports exist), and Enterprise has no
  self-serve checkout since it needs a sales contact flow. A platform admin
  can turn the full 5-tier ladder on from `backend.html` ("Pricing Tiers" ->
  "Show all 5 tiers to customers") once that's no longer true - see the
  gating task below before flipping that on for real customers.

## Immediate Next Slices (see `CLAUDE_HANDOFF.md` "Good Next Tasks" for the
full list; these are the highest-leverage ones)

1. **Tier feature gating** - before turning on the full 5-tier pricing for
   real customers, Pro and Business need to actually gate something Growth
   doesn't have (staff seat limits enforced server-side, AI usage metering,
   a reports view). Right now they're the same product at a higher price,
   which won't hold up once anyone compares tiers side by side.
2. **Public storefront** - a shareable page per business so customers can
   browse and order directly, instead of every order being manually entered
   by the seller. This is the single biggest gap versus competitors like
   Bumpa, Catlog, and VendCart.
3. **Real WhatsApp automation** - WhatsApp Business API integration for
   automatic order confirmations/receipts/delivery updates, replacing the
   current manual "Send WhatsApp" button.
4. **Real AI** - replace the template-based caption/reply/reminder generator
   with an actual LLM call using the seller's product/customer context.
5. **Profit tracking** - a cost-price field per product so the dashboard can
   show margin, not just revenue.
6. **Enterprise contact-sales flow** - the Enterprise tier exists in pricing
   data but has no way for a prospect to actually reach out yet.

## Long-Term Vision (years out - not started, not scheduled)

These are directional, not commitments, and are listed here specifically so
they're *not* confused with the roadmap above:

- **Deeper commerce**: quotes, expenses, suppliers, purchase orders, stock
  transfers, warehouses, loyalty, customer wallets, QR ordering, delivery
  logistics integration (GIG/Kwik/Fez).
- **AI as an operating layer**: natural-language search, sales/inventory/
  customer forecasting, voice commands, a "morning business briefing,"
  automated pricing recommendations.
- **Africa expansion**: multi-currency, multi-language, per-country tax and
  compliance handling, additional payment rails (Flutterwave, Moniepoint,
  PalmPay, OPay, M-Pesa, Orange Money, MTN Money).
- **Business ecosystem**: embedded finance, working capital, insurance,
  payroll, accounting, a developer API and app marketplace, a partner portal.

None of the above should be treated as in-progress or near-term - they're
here to record intent, not to imply scope for the next release.
