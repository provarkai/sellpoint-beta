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

## 3. Positioning Tension: Nigerian Roots, Global Execution

SellPoint should resolve one deliberate tension: **feel unmistakably Nigerian
in warmth, color confidence, and WhatsApp-native daily use — while being
disciplined enough in typography, grid, and restraint to sit credibly next to
Stripe, Shopify, or Block in a global pitch deck.** Same trajectory as
Paystack, Flutterwave, and Moniepoint: Nigerian-first products that never
looked like "African startups" — they looked like world-class companies that
happened to start in Nigeria.

### What "Nigerian feel" means here (specific, not costume)
- **Warmth and directness**, not cold enterprise SaaS — the tone of a trusted
  local business partner, not a Silicon Valley dashboard.
- **Color with confidence** — Nigerian commerce (markets, Owambe events,
  Afrobeats culture, shop signage) uses bold, saturated color without
  apology. SellPoint's green + terracotta-orange should carry that same
  confident energy, not be muted into generic fintech pastel.
- **Built around WhatsApp and mobile-money culture** — receipts, invoices,
  and reminders designed to be *forwarded in a chat thread*, not viewed on a
  desktop marketing site. This is the actual daily reality of the user.
- **Hustle-literate, not hustle-stereotyped** — speaks to ambition and grind
  without poverty-tourism visual tropes.

**Explicitly avoid**: Ankara/kente print textures, tribal mask iconography,
continent-shaped logos, "sunset over savanna" imagery, pidgin-as-gimmick
copywriting — anything that reads as "exotic" rather than *familiar to the
person actually using it*. If a Nigerian seller would find it patronizing, cut it.

### What "global brand" means here (specific, not generic SaaS polish)
- **Type and layout discipline** that would hold up in a pitch deck next to
  Stripe, Shopify, or Block — real grid systems, real hierarchy, no clip-art.
- **A palette and logomark that travel** — should work identically on a phone
  screen in Lagos and a laptop in London with zero re-explanation. No visual
  element that only makes sense with local context.
- **Currency- and language-agnostic architecture from day one** — pricing is
  NGN-only today (`server/pricing.js`), but the identity system (numerals,
  receipt layout, iconography) should be built assuming multi-currency
  expansion, not painted into a corner.
- **Restraint over decoration** — global-caliber brands earn trust through
  consistency and clarity, not ornament. Every flourish should be functional
  (a color that means "paid," not a color for its own sake).

### Reference brands to study (how, not just what)
- **Paystack** — proved a Nigerian product could look like a category leader
  before Stripe ever acquired them; clean geometric mark, disciplined blue,
  zero regional kitsch.
- **Flutterwave** — bold orange used as a confident brand color, not a
  "warning" color; scaled from Lagos to a pan-African, multi-market identity
  without diluting itself.
- **Moniepoint** — utilitarian trust-first design for the same kind of user
  SellPoint serves (informal/small-business sellers), proving "for the
  hustle" and "world-class" aren't in tension.
- **PiggyVest** — playful but disciplined color system that still reads as
  serious about money.

---

## 4. Visual Identity Brief

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

## 5. Messaging Deliverables to Produce

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

## 6. Ready-to-use prompt block

Paste this directly into an AI design/branding tool to kick off concepts:

> Design a brand identity for **SellPoint**, an AI-powered business
> management app for small and informal sellers, built Nigeria-first with a
> trajectory toward global markets — the same arc as Paystack, Flutterwave,
> and Moniepoint. The product tracks products, customers, and orders, writes
> AI customer messages, and sends invoices/receipts over WhatsApp.
>
> The brand must resolve one tension deliberately: **feel unmistakably
> Nigerian in warmth, color confidence, and WhatsApp-native daily use — while
> being disciplined enough in typography, grid, and restraint to sit
> credibly next to Stripe, Shopify, or Block in a global pitch deck.** Local
> authenticity in substance and tone; international rigor in execution. Do
> not use Ankara/kente patterns, tribal iconography, continent shapes, or
> "Africa rising" visual clichés — those read as costume, not culture, to
> the actual target user.
>
> Evolve, don't discard, this working palette: deep trustworthy green
> `#147d64` (already reads as "paid/verified" in-product) and a confident
> terracotta-orange `#d36b2c` accent — used with the saturation and
> confidence of Nigerian market/event branding, not muted into generic
> fintech pastel. Add a documented neutral scale and semantic
> paid/pending/low-stock states, in both light and dark mode.
>
> Logomark: must work at 16px (a seller may set it as their own WhatsApp
> profile photo), reproduce in one color, and read as reliable commerce
> infrastructure — receipt, checkmark, or storefront motifs, not a location
> pin (misreads as maps) and not any local-pattern texture. Wordmark: a
> humanist/grotesque sans with strong tabular numerals and multi-currency
> symbol support (₦ today, built to add $/£/€ without redesign).
>
> Primary deliverable to mock first: the **customer-facing invoice/receipt**
> forwarded seller-to-customer over WhatsApp — SellPoint's most frequent and
> highest-leverage brand impression, and the moment it has to make a
> one-person Lagos shop look like a business that could operate anywhere.
> Secondary: the app dashboard, the upgrade/paywall dialog.
>
> Voice: plain, warm, direct, money-literate — the tone of a sharp local
> partner who also happens to be building something the rest of the world
> will use. No SaaS jargon, no forced pidgin, no poverty-tourism imagery.

---

## 7. Deliverables checklist

- [ ] Logomark + wordmark (SVG, works at 16px and 512px)
- [ ] Color tokens (light + dark mode, WCAG AA verified) — update `styles.css` `:root`
- [ ] Type system (2 weights minimum for UI face; optional display face)
- [ ] Invoice/receipt template redesign (`app.js` invoice/receipt rendering, `.invoice` styles)
- [ ] Paywall/upgrade dialog visual pass
- [ ] Tagline + elevator pitch finalized
- [ ] WhatsApp message templates (invoice, receipt, reminder) reviewed for voice
- [ ] Favicon / WhatsApp-avatar-ready icon export
