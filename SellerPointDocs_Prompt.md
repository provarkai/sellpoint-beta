# SellersPoint Docs — Product & Automation Brief (v7)

## 1. Product Overview

**SellersPoint Docs** is Nigeria's business-formation, tax, compliance, and everyday-documents layer for SellersPoint sellers. Government-facing registrations and tax filings run through two specialized licensed partners; everyday business documents, financial estimates, and now **any other renewal or deadline a seller wants tracked** are handled entirely in-house — self-serve, automated, and (for documents) AI-assisted within a hard boundary that keeps AI selecting from pre-approved legal language, never inventing new legal language. All of it lands in one unified Document Vault.

## 2. Full Service Catalog

| Category | Services | Fulfillment |
|---|---|---|
| **Corporate & Legal** | CAC Business Name registration, full LLC incorporation, Trademark registration, **CAC Annual Returns filing** (recurring), **SCUML registration** | Partner A |
| **Tax & Regulatory** | TIN generation/verification, state-specific permits (LASAA, local govt), **Tax Filing** (VAT, CIT, PIT returns), **Tax Clearance Certificate (TCC)** | Partner B |
| **Verification & Lookup** | TIN verification, **BVN verification**, NIN verification, CAC Business Name availability check, CAC business status lookup — all automated via a KYC/verification API vendor, no partner involved for the routine checks; document authenticity verification (checking a specific certificate is genuine) gets an automated first pass with a Partner A cross-check available for high-stakes cases | Automated (vendor API), with Partner A as a fallback only for document authenticity on high-stakes documents |
| **Self-Serve Documents & Tools** | Contract/Agreement Templates (AI-assisted field selection from a pre-vetted clause library), Proposal/Quote Generator, Tax Calculator | SellersPoint, no partner |
| **Trackers** | Seller-defined lifecycle reminders for anything outside the built-in catalog — rent, insurance, payroll, supplier payments, any other renewal — with monthly/custom-cadence reminders | SellersPoint, seller-managed |

## 3. Delivery Model — two partners, two self-serve product lines

Government filings require a licensed party of record, so two specialist partners cover them:

| Partner slot | Owns | Likely partner type |
|---|---|---|
| **Partner A — Corporate & Legal** | Everything about company formation — Business Name, LLC incorporation, Trademark, **SCUML registration** — plus **CAC Annual Returns filing** | Law firm or CAC-accredited agent |
| **Partner B — Tax & Regulatory** | Everything about tax — TIN, Tax Filing, and **Tax Clearance Certificate** — plus state-specific permits | Chartered accountant (ICAN) or licensed tax/regulatory-filing agent |

**Verification & Lookup is almost entirely automated, not partner-routed.** Verification API vendors exist that cover TIN, BVN, NIN, and CAC lookups under one integration — QoreID's public docs confirm all four — so this whole tier can run on SellersPoint's own infrastructure with no partner and near-instant turnaround, instead of the ~12 hours a manual agent needs (the ₦1,500/12-hour Personal TIN Verification Slip referenced earlier reflects a *manual* process; direct API integration is the actual competitive advantage here, both on speed and cost). Only document authenticity verification on a high-stakes document might still warrant a Partner A cross-check as a fallback, since verifying a specific certificate is genuine is a different claim than confirming an ID number is valid. This tier still functions as the low-friction entry point into the product — cheap enough to be a first purchase that builds trust in SellersPoint Docs before a seller commits to a full registration — it's just cheaper and faster to deliver than initially assumed.

**Trackers has zero partner or filing involvement** — it's a pure reminder utility, not a document-generation or fulfillment feature. It exists because a seller's real compliance/renewal calendar extends well past what SellersPoint's catalog covers on day one (a shop lease, an insurance policy, a supplier payment term), and forcing them into a separate app for that defeats the point of a unified Docs product.

**Product-discovery bonus:** aggregate (anonymized) Tracker data is a live signal for what to formalize into the partner-fulfilled catalog next — if a large share of sellers are manually tracking "trademark renewal" or "signage permit," that's evidence for onboarding a third category or expanding Partner A/B's scope, rather than guessing at roadmap priority.

## 4. The AI Boundary — clause selection, never clause creation

This is the standing rule that keeps AI-assisted Templates from drifting into free-form legal drafting, and it needs to be enforced structurally, not just written down as a value:

- The template library is a **finite, versioned, ID-tagged set of clauses**, each pre-vetted once by qualified legal counsel before publishing.
- When a seller describes their situation in plain language, the AI's only job is **classification**: map the description to a subset of *existing* clause IDs and collect the field values needed to fill them in. It does not generate new clause text.
- **Server-side validation enforces this**: a generated document may only include clause IDs that exist in the vetted library. Any AI output that doesn't resolve to a real library ID is discarded automatically, never silently inserted.
- **Expanding the library is a deliberate, human-led process** — legal counsel drafts and vets a genuinely new clause type, it gets added with a version bump — never something the AI does at runtime in response to a seller's request.
- **Periodic audit**: sample generated documents on a schedule to confirm every clause in every output traces back to a valid library ID. This is the check that catches silent drift before it becomes a pattern.

## 5. The Document Vault — connective infrastructure

Every document from all three fulfillment lines lands here, organized by type and renewal status. Also the optional home for Tracker proof-of-completion: marking a tracker "Renewed" or "Paid" can attach a receipt/document, stored and linked back to that tracker.

- Organized by type and by status (active / expiring soon / expired), tied directly into the renewal-reminder engine.
- One download/share action regardless of which category or partner originally produced the document.
- A lightweight "Documents" widget can surface in the core SellersPoint app itself.

## 6. Target Users

- **Pre-registration sellers** (primary/volume) — start at Business Name + TIN.
- **Existing SellersPoint core users** — cross-sell target for the Tax Calculator (pulls their existing revenue data) and Proposal/Quote Generator (pairs with the core app's existing invoice/receipt flow — proposal *before* the sale, invoice *at* the sale).
- **Graduating sellers** — LLC, Trademark, permits, and recurring Tax Filing as the compliance anchor once registered.
- **Any seller, registered or not** — Trackers isn't gated behind having gone through SellersPoint's own registration flow first; rent/insurance/payroll renewals apply regardless.

## 7. Automation Tiers

| Tier | What it means | Applies to |
|---|---|---|
| **Automate fully** | No human touches it per use | Intake, eligibility mapping, reminders (Registrations, Tax, *and* Trackers), partner routing, Tax Calculator, Proposal/Quote Generator, Document Vault, **TIN/BVN/NIN/CAC verification lookups (direct vendor API integration)** |
| **AI-assisted, constrained to a vetted clause library** | AI recommends which pre-approved clauses apply and assembles the document from them — cannot draft new clauses, enforced server-side | Contract/Agreement Template field selection |
| **AI-assisted, SellersPoint-checked** | Machine drafts, SellersPoint checks completeness before partner handoff | Registration/tax filing drafts |
| **Partner-required by law** | Cannot be automated, ever | Final review and filing — Partner A or Partner B |
| **One-time governance, not per-use** | Standing process, not a per-transaction step | Master clause library drafted/vetted by legal counsel before publishing, reviewed periodically, expanded only through deliberate human process |
| **Seller-managed, reminder-only** | No document, no filing — just a due-date and a nudge | Trackers |

## 8. Trust, Liability & Compliance Guardrails

- **NDPR compliance across every handoff and inside the Vault itself** — the single largest concentration of sensitive seller data in the product.
- **Filing disclaimers** on every registration/tax document naming the reviewing partner and filing status.
- **Calculator disclaimer** — the Tax Calculator gives an estimate, not a filed position; route anyone who wants it filed into Partner B.
- **Template disclaimer + complexity threshold** — generic templates for common situations, automatic upsell to Partner A for high-stakes agreements (large loans, multi-year commercial leases, unusual terms).
- **No fabricated turnaround promises** for partner-fulfilled work.
- **Single point of contact** — support always goes through SellersPoint, never direct-to-partner.
- **The AI Boundary (Section 4) is a permanent architectural constraint, not a launch-time policy** — any future feature request to let AI "just draft something custom" for an edge case needs to go through the same one-time legal-vetting process as everything else in the library, not bypass it.
- **Trackers carry no legal weight** — they're reminders the seller sets themselves; SellersPoint isn't verifying or attesting to anything about a Tracker's underlying obligation (unlike Registrations/Tax, where a partner has actually reviewed something).

## 9. Success Metrics

Registration/filing completion rate per category, partner SLA adherence, submission rejection/rework rate, renewal → re-filing completion rate, Tax Calculator usage → Tax Filing conversion rate, Contract/Proposal templates generated per type, template-to-Partner-A upsell conversion rate, Document Vault engagement, revenue per category/partner, **Trackers created per seller, reminder-to-action rate (marked Renewed/Paid vs. ignored), Tracker-category frequency as a roadmap signal for catalog expansion**, and **clause-library validation rejection rate** (AI suggestions that failed the ID-whitelist check — should trend near zero; a rising number signals the classification model is drifting toward requests the library doesn't yet cover, which is a prompt to expand the library deliberately, not to loosen the boundary).

**Verification & Lookup volume and Lookup-to-full-registration conversion rate** (validates the entry-point-product thesis), **escrow milestone completion rate** (payments released vs. disputed/refunded), **WhatsApp-initiated order share vs. dashboard-initiated**, and **bundle attach rate** (sellers buying a package vs. individual services).

## 10. Ready-to-paste prompt block

> Design the product and automation architecture for **SellersPoint Docs**: (1) everything about company formation — CAC Business Name, LLC incorporation, Trademark registration, SCUML registration, and recurring CAC Annual Returns filing — via a Corporate & Legal partner; (2) everything about tax — TIN, periodic Tax Filing, and Tax Clearance Certificates — plus state-specific permits via a Tax & Regulatory partner; (3) **Verification & Lookup** services — TIN, BVN, NIN, and CAC Business Name/status lookups run fully automated via a KYC verification API vendor (e.g. QoreID, which covers all four under one integration) with no partner involved and near-instant turnaround, with document authenticity checks on high-stakes documents falling back to the Corporate & Legal partner as a cross-check — functioning as a fast, cheap, low-friction entry point into the product; (4) self-serve Contract/Agreement Templates, a Proposal/Quote Generator, and a Tax Calculator that funnels into the Tax & Regulatory partner's filing; (5) seller-managed **Trackers** — custom lifecycle reminders (rent, insurance, payroll, supplier payments, or anything else) with monthly/custom-cadence notifications, requiring no document generation or partner involvement. For Templates, AI's role is strictly to classify a seller's plain-language description against a finite, versioned, pre-vetted clause library and assemble the matching clauses with the seller's field values — **AI must never draft novel legal clauses**; enforce this server-side by rejecting any AI output that doesn't resolve to an existing library clause ID, and expand the library only through a deliberate human legal-review process, never at runtime. Every document produced or uploaded across categories 1–4 lands in one unified, NDPR-compliant Document Vault; Trackers optionally attach proof-of-completion to the same Vault. Payment for partner-fulfilled work is held in escrow-style and released on delivery milestones, not upfront. SellersPoint is never the licensed party of record for any filing, and never the author of novel legal language.

## 11. Additional Product Features

**Verification & Lookup** — covered in the catalog above (Section 2) and the delivery-model split (Section 3). Worth restating why it matters: a ₦1,500, 12-hour Personal TIN Verification Slip is a real, current market reference point for what informal agents charge and how long they take manually — direct API integration for TIN/BVN/NIN should beat both numbers, which is a genuine product edge, not just a cost saving. Either way, its low price and fast turnaround make it a natural first purchase before a seller trusts SellersPoint with a ₦70,000+ registration. **Document authenticity verification** — checking whether *any* certificate is genuine, not just ones SellersPoint issued — lives in this tier too, and doubles as a trust-building feature independent of whether the seller ever files anything through SellersPoint (a landlord checking a tenant's registration, a buyer checking a supplier's).

**Escrow-style payment** — the standard failure mode with informal WhatsApp-based agents (the exact channel most of this market already transacts through) is paying upfront and getting ghosted. Holding payment until a real milestone — certificate delivered, not just "submitted to partner" — is a structural trust differentiator, not just a UI nicety. This should extend the existing guardrail set in Section 8: no fabricated turnaround promises pairs naturally with no payment released before actual delivery.

**Bundle packages** — partners already sell this way (a single flat price covering Business Certificate, Status Report, Congratulatory Letter, TIN Certificate, and MEMART as one company-registration bundle). SellersPoint should mirror that instinct with its own packages spanning categories — e.g. a "New Business Bundle" combining Business Name/LLC registration, TIN, one free contract template, and Tax Calculator access — priced below buying each piece separately.

**WhatsApp-native ordering, not just status updates** — status tracking already delivers updates over WhatsApp; the gap is *initiating* a service request from a WhatsApp chat in the first place, not only opening the dashboard. Given SellersPoint's core brand pillar is WhatsApp-fluency and the reference partner pricing itself arrived as a WhatsApp broadcast, letting a seller start a Registration, order a Verification & Lookup service, or generate a Template directly from a WhatsApp conversation closes the gap between how this market already transacts and how the product works.

**A small congratulatory moment on approval** — worth borrowing directly from the reference partner's bundle, which includes a literal Congratulatory Letter. Cheap to build as an automated milestone notification/badge the moment a registration comes back approved, and it ties naturally into the Founding Member "Founder Badge" concept already established in the brand.

**Verification infrastructure — candidate vendors (needs a proper evaluation, not a commitment yet):**
- **QoreID** — confirmed via public API docs to cover NIN, BVN, TIN, *and* CAC verification/lookup under one integration. Self-serve signup with ~24-hour account approval; no public pricing, quote on request. The strongest single-vendor candidate found so far since it's the only one confirmed to cover all four data points without stitching multiple providers together.
- **Dojah, VerifyMe, Mono, Ashlabtech** — all confirmed to offer identity/KYC verification generally, but which specific checks (NIN/BVN/TIN/CAC) and what they cost weren't disclosed on their public marketing pages — worth a direct sales conversation with each before ruling them in or out as backup/comparison options on price and reliability.
- **CAC's own VAS platform** (vas.cac.gov.ng) — the official electronic filing channel Nigerian law already routes CAC submissions through via an accredited user (lawyer, chartered accountant, or chartered secretary). This is likely the actual mechanism Partner A already files through today. **Important distinction: this doesn't remove Partner A's compliance role** — the accredited-professional gate stays regardless of API access, since that's a legal requirement, not a technology limitation — but if SellersPoint can integrate with VAS through Partner A's accredited credentials, Partner A's part of the process could move from manual portal data-entry to an API-driven submission Partner A just reviews and authorizes. That's a real turnaround-time and cost improvement worth pursuing with Partner A directly, not a way to bypass them.

**Phasing decision:** Partner A handles CAC company registration exactly as scoped in Sections 2–3 for now — full manual/portal-based filing on SellersPoint's behalf, no VAS integration assumed. Direct CAC VAS integration is a deliberate fast-follow, not a v1 dependency: once the Partner A relationship is running, explore integrating through their accredited access to speed up their existing fulfillment role. Don't block launch on this — it's an optimization to the *how*, not a change to the *who*, and the accredited-professional requirement stays either way.

---

# End-to-End Workflow

### A. Registration & Filing (Corporate & Legal / Tax & Regulatory)

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Entry** | Seller lands via core app upsell, sellerspoint.ng/docs, WhatsApp share, or starts an order directly from a WhatsApp chat | SellersPoint (automated) | — | Session started |
| **1. Guided intake** | Business activity, category, location, registration status, filing history | SellersPoint (automated) | Seller answers | Structured business profile |
| **2. Eligibility & requirement mapping** | Maps profile → required one-time registrations *and* recurring obligations (VAT cadence, CIT annual, PIT if sole proprietor, **CAC Annual Returns**) | SellersPoint (automated) | Business profile | Personalized checklist, one-time + recurring |
| **3. Document collection** | ID, proof of address, business activity details, revenue data (auto-pulled from core app where possible) | SellersPoint (automated) | Seller uploads + core app data | Complete document/data set |
| **4. Draft generation** | AI pre-fills applications and tax returns in each partner's expected format | SellersPoint (AI-assisted) | Business profile + documents | Draft package(s), tagged by destination partner |
| **5. Pre-partner check** | SellersPoint completeness/sanity check before handoff | SellersPoint (human) | Draft package | Cleared-for-handoff package, or sent back |
| **6. Partner routing** | Routed to Partner A and/or B, tracked independently | SellersPoint (automated) | Cleared package | Delivered to partner |
| **7. Partner review & filing** | Final legal/professional review and filing with CAC/SCUML (Partner A) or FIRS/LASAA (Partner B). Payment held escrow-style up to this point, not released upfront. | **Partner (required)** | Routed package | Filing reference |
| **8. Status tracking** | Per-service WhatsApp/email updates | SellersPoint (automated) | Filing references | Status updates |
| **9. Delivery & storage** | Certificates/filed returns delivered digitally into the **Document Vault**; payment releases to the partner; approval triggers a small congratulatory notification/badge moment | SellersPoint (automated) | Government-issued documents | Stored, retrievable per service |
| **10. Ongoing compliance** | One-time registrations get renewal reminders; **Tax Filing and CAC Annual Returns loop here on their own recurring cadence**, Tax Filing often kicked off by a fresh Tax Calculator estimate | SellersPoint (automated) → repeats stages 3–9 | Stored data + Calculator output | Renewal/filing reminders |

### B. Self-Serve Documents & Tools

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Entry** | Seller picks Contract Templates, Proposal/Quote, or Tax Calculator | SellersPoint (automated) | — | Session started |
| **1. Describe or select** | Seller either picks a template type directly or describes their situation in plain language | SellersPoint (automated) | Selection or free text | Intent captured |
| **2. AI clause mapping (constrained)** | AI maps the description to a subset of existing, pre-vetted clause IDs — never generates new clause text | SellersPoint (AI, boundary-enforced) | Seller description | Suggested clause list, seller can toggle on/off |
| **3. Library validation** | Server checks every suggested clause resolves to a real library ID; anything that doesn't is silently dropped, never inserted | SellersPoint (automated, enforced) | AI suggestions | Validated clause set |
| **4. Guided fill-in** | Seller fills in the specific values for only the clauses they kept | SellersPoint (automated) | Seller inputs | Filled draft |
| **5. Complexity/threshold check** | High-stakes agreements get an upsell prompt to Partner A; Tax Calculator output gets an upsell prompt to Partner B | SellersPoint (automated) | Filled draft or estimate | Pass-through, or upsell prompt |
| **6. Generate & disclose** | Final document/estimate generated with disclaimer | SellersPoint (automated) | Filled draft | Ready-to-use output |
| **7. Store** | Saved to the Document Vault with a "Created" date only — no status pill | SellersPoint (automated) | Output | Stored document |

*(Standing, not per-use: master clause library drafted and vetted once by qualified legal counsel before publishing, reviewed periodically after, expanded only through a deliberate human process.)*

### C. Trackers

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Add a tracker** | Seller names the item, sets category, due date, and recurrence | Seller (manual entry) | Name, category, date, recurrence | New tracker |
| **1. Reminder scheduling** | System schedules monthly (or custom-cadence) reminders leading up to the due date, merged into the same Overview alert feed as auto-populated Registration renewals | SellersPoint (automated) | Tracker data | Scheduled notifications |
| **2. Notify** | WhatsApp/email reminder sent on cadence | SellersPoint (automated) | Schedule | Reminder delivered |
| **3. Mark done** | Seller marks Renewed/Paid, optionally attaching a receipt | Seller (manual) | Proof (optional) | Tracker resets to next cycle (if recurring), proof stored in Vault |

No partner, no AI, no document generation — the deliberately simple end of the product.

### D. Verification & Lookup

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Select a check** | Seller picks TIN, BVN, NIN, CAC Business Name/status, or document authenticity | SellersPoint (automated) | Selection | Check started |
| **1. Submit identifier** | Seller enters the ID/number (or uploads the document for authenticity checks) | SellersPoint (automated) | ID number or document | Query sent to vendor API |
| **2. Vendor API lookup** | Result returned from the KYC/verification vendor, typically in seconds | Automated (vendor API) | Query | Match/no-match result |
| **3. High-stakes fallback (authenticity only)** | If flagged high-value, routes to Partner A for a manual cross-check instead of relying solely on the automated result | **Partner A (conditional)** | Document | Confirmed result |
| **4. Store** | Result saved to the Document Vault, tagged "Verification," with a "Checked" date | SellersPoint (automated) | Result | Stored record |

---

# Dashboard Sketch

## Navigation — Verification is now its own tab, WhatsApp ordering is a persistent affordance

```
┌─────────────────────┐
│  SellersPoint  Docs  │
├─────────────────────┤
│  ● Overview          │
│  ● Registrations     │  ← partner-fulfilled, status-pill, escrow indicator
│  ● Verification       │  ← TIN/BVN/NIN/CAC lookups, near-instant
│  ● Tax Tools         │
│  ● Trackers          │
│  ● Templates         │
│  ● Document Vault     │
├─────────────────────┤
│  💬 Order via WhatsApp │
│  ← Back to main app   │
└─────────────────────┘
```

## Overview

```
┌────────────────────────────────────────────────────────┐
│  Your Business Setup                                    │
│  ●───●───●───○───○   3 of 5 registrations complete      │
│  Business Name ✓  TIN ✓  SCUML ✓  LLC (in review)  TM — │
├────────────────────────────────────────────────────────┤
│  🎉 Congratulations! Your SCUML registration was          │
│     approved. You've earned the Verified Business badge.  │
├────────────────────────────────────────────────────────┤
│  ⏰ VAT filing due in 12 days.        [Estimate now →]    │
│  👥 Staff salary run due in 2 days.   [View tracker →]    │
├────────────────────────────────────────────────────────┤
│  Quick actions                                             │
│  [ Verify a TIN/BVN/NIN ]  [ Estimate my tax ]              │
│  [ New proposal ]  [ New contract ]  [ 💬 Order on WhatsApp]│
├────────────────────────────────────────────────────────┤
│  💡 Save with the New Business Bundle                       │
│     Business Name + TIN + 1 contract template + Tax         │
│     Calculator — bundled below individual pricing.           │
│                                          [View bundle →]     │
├────────────────────────────────────────────────────────┤
│  Recently in your Vault                                    │
│  📄 SCUML Certificate            Registration · Jul 16     │
│  🔍 BVN Verification Result      Verification · Jul 16     │
│  🧾 Tenancy Agreement            Template · Jul 2          │
└────────────────────────────────────────────────────────┘
```

Deadline alerts still pull from two sources, unified: auto-populated renewals SellersPoint already knows about (filed registrations, recurring Tax Filing) and whatever the seller manually added in Trackers. New here: a congratulatory banner (fires once per approval, dismissible), a bundle promo card, a Verification quick action, and a WhatsApp ordering shortcut.

## Registrations (status-pill view, escrow + bundle entry point added)

```
┌────────────────────────────────────────────────────────┐
│  💡 Buying more than one? [ See bundle pricing → ]          │
├────────────────────────────────────────────────────────┤
│  Corporate & Legal · Partner A                              │
│  ┌────────────────────────────────────────────────────┐│
│  │ Business Name Registration      [● Approved]         ││
│  │ Certificate ready · Payment released     [View →]    ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ LLC Incorporation               [◐ Under Review]      ││
│  │ Submitted 3 days ago                                    ││
│  │ 💳 Payment held — releases when certificate arrives     ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ SCUML Registration              [● Approved] 🎉         ││
│  │ Certificate ready · Payment released     [View →]    ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ CAC Annual Returns (2026)       [○ Not Started]         ││
│  │                                    [Start →]            ││
│  └────────────────────────────────────────────────────┘│
│                                                              │
│  Tax & Regulatory · Partner B                                │
│  ┌────────────────────────────────────────────────────┐│
│  │ Tax Clearance Certificate       [○ Not Started]         ││
│  │                                    [Start →]            ││
│  └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

Status pills: `Not Started → Draft → Submitted → Under Review → Action Needed → Approved`. Partner name shown small on every card. Every in-progress card now shows the escrow line, making "payment isn't released until you actually get your certificate" visible, not just a backend policy. Approved cards briefly show the 🎉 congratulatory marker.

## Verification (new)

```
┌────────────────────────────────────────────────────────┐
│  Quick checks — most results in under a minute              │
├────────────────────────────────────────────────────────┤
│  🔍 TIN Verification              ₦1,000    [Verify →]     │
│  🔍 BVN Verification              ₦800      [Verify →]     │
│  🔍 NIN Verification              ₦800      [Verify →]     │
│  🔍 CAC Business Name Availability ₦500     [Verify →]     │
│  🔍 CAC Business Status Check     ₦500      [Verify →]     │
│  🔍 Document Authenticity Check   ₦1,500    [Verify →]     │
│      ⓘ High-value documents may route to Partner A          │
│         for a manual cross-check                             │
├────────────────────────────────────────────────────────┤
│  Recent lookups                                               │
│  BVN Verification — ✓ Match found        Jul 16, instant     │
│  CAC Business Name — ✓ Available          Jul 10, instant    │
└────────────────────────────────────────────────────────┘
```

Clicking "Verify" opens a one-field form (the ID/number to check), returns a result inline, and saves it to the Vault automatically — no status pill, no partner, no waiting, except the flagged Document Authenticity fallback case. Prices shown are illustrative — see the pricing discussion elsewhere for how these should actually be set relative to vendor cost.

## Tax Tools

```
┌────────────────────────────────────────────────────────┐
│  Tax Calculator                                             │
│  Pulling from your SellersPoint sales data (auto)           │
│  Estimated VAT this month:  ₦42,300                         │
│  [ Recalculate ]        [ File this with our partner → ]    │
├────────────────────────────────────────────────────────┤
│  Filing history                                               │
│  VAT — June 2026        [● Filed]         via Partner B      │
│  VAT — May 2026         [● Filed]         via Partner B      │
│  Tax Clearance — 2025   [○ Not Started]  [Start in Registrations →]│
└────────────────────────────────────────────────────────┘
```

## Trackers

```
┌────────────────────────────────────────────────────────┐
│  Track anything with a due or renewal date                  │
│  [ + Add a tracker ]                                          │
├────────────────────────────────────────────────────────┤
│  🏠 Shop Rent Renewal            [🟡 Due in 18 days]          │
│      Recurs annually · monthly reminder while due             │
│                                    [Mark Renewed] [Edit]       │
│  🛡 Shop Insurance                [🟢 Upcoming]                │
│      Recurs annually · next due Mar 2027                      │
│  👥 Staff Salary Run              [🔴 Due in 2 days]           │
│      Recurs monthly                [Mark Paid] [Edit]         │
│  📦 Supplier Payment — ABC Ltd    [🟢 Upcoming]                │
│      Recurs monthly                                           │
└────────────────────────────────────────────────────────┘
```

Add tracker fields: Name, Category (Rent/Lease, Insurance, Payroll, Supplier/Vendor, Loan Repayment, License not covered by SellersPoint, Other), Due date, Recurrence (One-time / Monthly / Quarterly / Annually / Custom), Reminder cadence.

Status model is deliberately simpler than Registrations — no partner, so: `Upcoming → Due Soon → Overdue → Marked Done`, resetting automatically on the next cycle for recurring items.

## Templates (AI-assisted field selection, no status tracking)

```
┌────────────────────────────────────────────────────────┐
│  New: Loan Agreement                                          │
│  Describe the situation — AI will suggest what to include     │
│  [ "₦500,000 to a supplier, repaid over 6 months,             │
│     no collateral, monthly installments" ]     [Suggest]      │
├────────────────────────────────────────────────────────┤
│  Suggested fields for your agreement:                         │
│  ☑ Loan amount & currency                                     │
│  ☑ Repayment schedule (monthly installments)                    │
│  ☑ Interest rate (optional — leave blank if none)              │
│  ☐ Collateral / security clause                                 │
│  ☑ Late payment penalty clause                                   │
│  ☐ Guarantor / co-signer details                                 │
│  ☑ Governing state / jurisdiction                                 │
│                              [ Continue → fill in details ]      │
└────────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────┐
│  Your documents                                                │
│  🧾 Tenancy Agreement — 14 Herbert Macaulay   Jul 2           │
│                                    [Download] [Edit & regenerate]│
│  📋 Proposal — Wireless Earbuds Bulk Order    Jun 28           │
│                                    [Download] [Edit & regenerate]│
│  🧾 Loan Agreement — ₦500,000                 Jun 20           │
│      ⓘ High-value — consider a lawyer-reviewed version         │
│                                    [Download] [Talk to Partner A]│
└────────────────────────────────────────────────────────┘
```

No status pill anywhere in this view — a template is either **not yet created** (a picker button) or **created** (a flat list with a date and a download link). "Edit & regenerate" reopens the wizard with prior answers pre-filled and produces a new file; it doesn't version-track or track signatures.

## Document Vault (everything, unified — now including Verification results)

```
┌────────────────────────────────────────────────────────┐
│  🔍 Search documents...        [All ▾] [Registration]        │
│                        [Tax] [Verification] [Template]        │
├────────────────────────────────────────────────────────┤
│  📄 Business Name Certificate     Registration                │
│     Issued Jun 12 · Renews Jun 2027         [Download]        │
│  🔍 BVN Verification Result       Verification                 │
│     Checked Jul 16                          [Download]        │
│  💰 VAT Filing — June 2026        Tax                          │
│     Filed Jul 15                            [Download]        │
│  🧾 Tenancy Agreement             Template                      │
│     Created Jul 2                           [Download]        │
└────────────────────────────────────────────────────────┘
```

The visual tell: **Registration** and **Tax** rows carry lifecycle metadata (issued/renews, filed dates tied to the reminder engine); **Verification** rows carry a "Checked" date; **Template** rows carry a "Created" date. Nothing in the Vault gets a status pill except the two partner-fulfilled types.
