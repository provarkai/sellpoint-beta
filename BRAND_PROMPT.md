# SellPoint Brand Development Prompt

A creative brief you can hand to a designer, brand agency, or an AI design tool
(Midjourney, DALL·E, Claude, etc.) to develop SellPoint's brand identity from
scratch or refresh what exists today. Grounded in the actual product, not
generic SaaS boilerplate.

---

## 1. Product Context (don't skip this — it drives everything below)

SellPoint is a **multi-tenant SaaS "AI business manager"** for small and
informal sellers, built NGN-first for the Nigerian market. A shop owner signs
up, and gets:

- A **Dashboard** (revenue, orders, customers, low-stock alerts)
- **Products & Services** management, including digital products with delivery links
- **Customers** and **Orders** tracking
- **Invoices/receipts** they can copy or send straight to a customer over **WhatsApp**
- **AI Tools**: product captions, customer reply drafts, payment reminders, sales summaries
- **Paystack**-powered upgrades across four tiers: Starter (free, 20 orders/mo),
  Basic, Standard, Premium (₦5,000–₦15,000/mo)

Two audiences use it, and the brand has to work for both:

1. **The seller** (primary) — a market trader, WhatsApp shop owner, or small
   service provider in Nigeria who is not a "tech person." They need this to
   feel fast, trustworthy with their money, and *not intimidating*.
2. **Their customer** — sees SellPoint only through touchpoints the seller
   forwards: an invoice, a receipt, a WhatsApp message. For this audience,
   SellPoint is invisible infrastructure that must still look credible enough
   to make the *seller* look professional.

**Current, functioning visual system** (styles.css) — treat as the starting
point to evolve, not a blank slate:
- Primary: deep green `#147d64` (money, growth, trust — also reads as
  "verified/paid" in Nigerian fintech UI conventions)
- Accent: warm orange/terracotta `#d36b2c` (marketplace energy, urgency, CTAs)
- Dark ink sidebar `#13241e` / `#17211c`, soft off-white background `#f5f7f4`
- System sans-serif (Arial/Helvetica) — utilitarian, no custom type yet
- Wordmark today is just a monogram tile: "SP" on a green square
- Existing tagline in-product: **"AI business manager"**

---

## 2. Brand Strategy Brief

### Mission
Give any small seller in Nigeria — even one running the whole business from a
phone and a WhatsApp number — the tools a much bigger company would use to
track sales, look professional to customers, and grow.

### Positioning statement
*For informal and small-business sellers in Nigeria who currently run their
shop out of a notebook or WhatsApp chat threads, SellPoint is the AI business
manager that turns scattered orders and receipts into a real, trackable
business — unlike spreadsheets or generic invoicing apps, SellPoint is built
around WhatsApp-native workflows, Naira pricing, and AI that writes the
customer messages for you.*

### Brand pillars (use these to pressure-test every asset)
1. **Legit, not corporate** — should make a one-person shop *look* established
   without feeling like enterprise software they don't belong in.
2. **WhatsApp-fluent** — the brand should feel at home inside a chat bubble,
   not just a dashboard. Assume most brand touchpoints get forwarded, not visited.
3. **Money-literate** — revenue, receipts, and payment status are the emotional
   core of the product. The brand must read as trustworthy around money at a
   glance (this is why green already dominates — don't lose that equity).
4. **Effortless, not clever** — the AI tools exist to remove work, not to
   perform intelligence. Brand voice should sound like a competent assistant,
   not a chatbot showing off.

### Target personas
- **Ada, 27, WhatsApp fashion reseller** — sells from her phone, juggles
  customer DMs, wants receipts that look like a "real shop," price-sensitive.
- **Tunde, 41, electronics/repair shop owner** — has a physical shop plus
  WhatsApp orders, cares about stock tracking and staff access as he grows.
- **Ngozi, 33, digital product/coaching seller** — sells courses/templates,
  cares most about the digital-delivery and AI-caption features.

### Brand personality (archetype: The Capable Helper, not The Sage or The Ruler)
Think: the sharp friend who's good with numbers and helps you write your
messages — not a bank, not a Silicon Valley startup, not a chatbot mascot.

**Voice**: plain, warm, direct. Short sentences. Naira amounts, WhatsApp,
"customer" not "client." Avoid SaaS jargon ("leverage," "synergy," "seamless").
Avoid over-familiar slang too — professional-friendly, like a good bank teller.

**Say**: "Your invoice is ready to send." "3 items low on stock."
**Don't say**: "Unlock frictionless commerce workflows."

---

## 3. Visual Identity Brief

### Direction to explore
Evolve — don't discard — the green/orange system already earning recognition
in the product. The opportunity is to give it a real identity system (type,
logomark, consistent iconography) rather than a monogram tile and system fonts.

**Color**
- Keep deep green (`#147d64` or a refined near-neighbor) as the primary —
  it already carries "paid/verified" meaning in-product; changing it resets
  that association for no gain.
- Keep a warm orange/terracotta accent for CTAs and alerts — gives the palette
  Nigerian market energy instead of generic fintech teal-on-white.
- Define a real neutral scale (the current `--ink`/`--muted`/`--line` tokens
  are a good base) and semantic colors for paid/pending/low-stock states,
  since the dashboard leans on status color-coding.
- Deliverable: a documented palette with light-mode and (new) dark-mode values,
  plus WCAG AA contrast pairs for text-on-green and text-on-white.

**Typography**
- Move off system Arial to a real typeface pairing: one humanist/grotesque
  sans for UI (something with excellent Naira/₦ and numeral support — sellers
  live in numbers: prices, stock counts, order totals), optionally one
  slightly warmer display face for marketing/landing use only.
- Numerals must be tabular where they're compared in a column (dashboard metrics,
  invoice line items).

**Logomark**
- Design a real mark to replace the "SP" tile — should work as a small
  favicon-sized WhatsApp-profile-photo-scale icon (sellers will likely use it
  as their own shop's avatar/branding), and should reproduce in one color at
  16px.
- Consider a motif around a receipt, checkmark, or storefront rather than a
  literal "point" pin/location metaphor (SellPoint's job is business
  management, not maps).

**Imagery / iconography**
- Icon style: simple, rounded, functional — matches "capable helper" not
  "enterprise dashboard." No stock photos of people in suits; if photography
  is used at all, it should look like real Nigerian small-business commerce.
- Illustration (if any) should depict the actual workflow: a phone, a WhatsApp
  thread, a receipt — not abstract SaaS blob art.

**Where the brand actually gets seen (prioritize these over a marketing site)**
1. The invoice/receipt the seller sends a customer — this is SellPoint's most
   frequent brand impression and currently the highest-leverage design surface.
2. The seller's own dashboard (daily-use, needs restraint not decoration).
3. The paywall/upgrade dialog — this is where brand has to build enough trust
   to justify a Naira payment.
4. `backend.html`, the platform-admin panel — internal-only, low priority.
5. Any future marketing/landing page.

---

## 4. Messaging Deliverables to Produce

- **Tagline options** (evolve "AI business manager"): e.g. "Run your shop like
  a real business," "Every sale, tracked. Every customer, remembered."
  (Draft 5–8, test for translation/readability in pidgin-adjacent contexts.)
- **One-line elevator pitch** for the signup page.
- **Plan-tier naming/copy** — Starter/Basic/Standard/Premium already exist;
  confirm the brand voice carries into each tier's tagline in `server/pricing.js`.
- **Paywall copy** — the in-app upsell dialog is a real conversion moment;
  brand voice should sell confidently without sounding like a nag.
- **WhatsApp message templates** (invoice send, receipt send, payment
  reminder) — these ARE the brand for the end customer; they should feel
  personal (from the seller) while quietly signaling "sent via SellPoint."

---

## 5. Ready-to-use prompt block

Paste this directly into an AI design/branding tool to kick off concepts:

> Design a brand identity for **SellPoint**, an AI-powered business
> management app for small and informal sellers in Nigeria (WhatsApp
> resellers, market traders, small shop owners, digital product sellers).
> The product helps them track products, customers, and orders, generate
> AI-written customer messages, and send professional invoices/receipts over
> WhatsApp.
>
> Brand personality: a sharp, capable, friendly helper — not a corporate
> enterprise SaaS brand, not a flashy fintech startup, not a playful chatbot
> mascot. Should feel trustworthy around money and comfortable inside a
> WhatsApp chat bubble.
>
> Evolve this existing palette rather than replace it: deep trustworthy green
> `#147d64` as primary (already reads as "paid/verified" to users), warm
> terracotta-orange `#d36b2c` as an energetic accent, dark ink `#13241e`,
> soft off-white background `#f5f7f4`. Add a proper neutral scale and
> semantic paid/pending/low-stock colors.
>
> Design a logomark that works at 16px (favicon, WhatsApp avatar scale),
> reproduces in a single color, and evokes reliable small-business commerce
> (receipt, checkmark, or storefront motifs) — avoid map-pin/location
> imagery, which misreads as a maps product. Pair it with a wordmark set in a
> humanist/grotesque sans-serif with strong numeral and ₦ (Naira) support.
>
> Primary deliverable to mock up first: a **customer-facing invoice/receipt**
> — this is where the brand is seen most often, forwarded seller-to-customer
> over WhatsApp, and must make a one-person shop look established. Secondary:
> the app dashboard sidebar/header, and the upgrade/paywall dialog.
>
> Tone of voice: plain, warm, direct, money-literate. No SaaS jargon.

---

## 6. Deliverables checklist

- [ ] Logomark + wordmark (SVG, works at 16px and 512px)
- [ ] Color tokens (light + dark mode, WCAG AA verified) — update `styles.css` `:root`
- [ ] Type system (2 weights minimum for UI face; optional display face)
- [ ] Invoice/receipt template redesign (`app.js` invoice/receipt rendering, `.invoice` styles)
- [ ] Paywall/upgrade dialog visual pass
- [ ] Tagline + elevator pitch finalized
- [ ] WhatsApp message templates (invoice, receipt, reminder) reviewed for voice
- [ ] Favicon / WhatsApp-avatar-ready icon export
