# SellersPoint Docs — Product & Automation Brief (v6)

## 1. Product Overview

**SellersPoint Docs** is Nigeria's business-formation, tax, compliance, and everyday-documents layer for SellersPoint sellers. Government-facing registrations and tax filings run through two specialized licensed partners; everyday business documents, financial estimates, and now **any other renewal or deadline a seller wants tracked** are handled entirely in-house — self-serve, automated, and (for documents) AI-assisted within a hard boundary that keeps AI selecting from pre-approved legal language, never inventing new legal language. All of it lands in one unified Document Vault.

## 2. Full Service Catalog

| Category | Services | Fulfillment |
|---|---|---|
| **Corporate & Legal** | CAC Business Name registration, full LLC incorporation, Trademark registration, **CAC Annual Returns filing** (recurring) | Partner A |
| **Tax & Regulatory** | TIN generation/verification, NAFDAC, SCUML, state-specific permits (LASAA, local govt), **Tax Filing** (VAT, CIT, PIT returns), **Tax Clearance Certificate (TCC)** | Partner B |
| **Verification & Lookup** *(new)* | Personal TIN Verification Slip, CAC Business Name availability check, CAC business status/verification lookup, Document authenticity verification (check any certificate against the register), NIN verification | Partner A/B by document type, or automated where a public verification API exists |
| **Self-Serve Documents & Tools** | Contract/Agreement Templates (AI-assisted field selection from a pre-vetted clause library), Proposal/Quote Generator, Tax Calculator | SellersPoint, no partner |
| **Trackers** | Seller-defined lifecycle reminders for anything outside the built-in catalog — rent, insurance, payroll, supplier payments, any other renewal — with monthly/custom-cadence reminders | SellersPoint, seller-managed |

## 3. Delivery Model — two partners, two self-serve product lines

Government filings require a licensed party of record, so two specialist partners cover them:

| Partner slot | Owns | Likely partner type |
|---|---|---|
| **Partner A — Corporate & Legal** | Everything about company formation — Business Name, LLC incorporation, Trademark — plus **CAC Annual Returns filing** | Law firm or CAC-accredited agent |
| **Partner B — Tax & Regulatory** | Everything about tax — TIN, Tax Filing, and **Tax Clearance Certificate** — plus the adjacent regulatory filings (NAFDAC, SCUML, state permits) | Chartered accountant (ICAN) or licensed tax/regulatory-filing agent |

**Verification & Lookup splits by document type**: CAC-related lookups (Business Name availability, business status, and checking whether *any* certificate is genuine) route to Partner A; TIN-related lookups (Personal TIN Verification Slip) route to Partner B. NIN verification is automated directly against a public verification API where available, rather than routed to either partner — it's identity data, not a CAC/tax filing. This tier is priced and turned around completely differently from the rest of the catalog (hours, not days — the ₦1,500 / 12-hour Personal TIN Verification Slip is the reference point), and doubles as a low-friction entry point: cheap enough to be a first purchase that builds trust in SellersPoint Docs before a seller commits to a full registration.

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
| **Automate fully** | No human touches it per use | Intake, eligibility mapping, reminders (Registrations, Tax, *and* Trackers), partner routing, Tax Calculator, Proposal/Quote Generator, Document Vault |
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

**New for v6:** Verification & Lookup volume and Lookup-to-full-registration conversion rate (validates the entry-point-product thesis), escrow milestone completion rate (payments released vs. disputed/refunded), WhatsApp-initiated order share vs. dashboard-initiated, and bundle attach rate (sellers buying a package vs. individual services).

## 10. Ready-to-paste prompt block

> Design the product and automation architecture for **SellersPoint Docs**: (1) everything about company formation — CAC Business Name, LLC incorporation, Trademark registration, and recurring CAC Annual Returns filing — via a Corporate & Legal partner; (2) everything about tax — TIN, periodic Tax Filing, and Tax Clearance Certificates — plus adjacent regulatory filings (NAFDAC, SCUML, state permits) via a Tax & Regulatory partner; (3) fast, cheap **Verification & Lookup** services (Personal TIN Verification Slip, CAC Business Name availability/status checks, document authenticity checks, NIN verification) that route to whichever partner owns that document type, or run fully automated where a public verification API exists — priced and turned around in hours, not days, as a low-friction entry point into the product; (4) self-serve Contract/Agreement Templates, a Proposal/Quote Generator, and a Tax Calculator that funnels into Partner B's filing; (5) seller-managed **Trackers** — custom lifecycle reminders (rent, insurance, payroll, supplier payments, or anything else) with monthly/custom-cadence notifications, requiring no document generation or partner involvement. For Templates, AI's role is strictly to classify a seller's plain-language description against a finite, versioned, pre-vetted clause library and assemble the matching clauses with the seller's field values — **AI must never draft novel legal clauses**; enforce this server-side by rejecting any AI output that doesn't resolve to an existing library clause ID, and expand the library only through a deliberate human legal-review process, never at runtime. Every document produced or uploaded across categories 1–4 lands in one unified, NDPR-compliant Document Vault; Trackers optionally attach proof-of-completion to the same Vault. Payment for partner-fulfilled work is held in escrow-style and released on delivery milestones, not upfront. SellersPoint is never the licensed party of record for any filing, and never the author of novel legal language.

## 11. Additional Product Features (v6)

**Verification & Lookup** — covered in the catalog above (Section 2) and the delivery-model split (Section 3). Worth restating why it matters: this is the tier most likely to be copied directly from how partners already sell (a ₦1,500, 12-hour Personal TIN Verification Slip is a real, current market reference point), and its low price/fast turnaround make it a natural first purchase before a seller trusts SellersPoint with a ₦70,000+ registration. **Document authenticity verification** — checking whether *any* certificate is genuine, not just ones SellersPoint issued — lives in this tier too, and doubles as a trust-building feature independent of whether the seller ever files anything through SellersPoint (a landlord checking a tenant's registration, a buyer checking a supplier's).

**Escrow-style payment** — the standard failure mode with informal WhatsApp-based agents (the exact channel most of this market already transacts through) is paying upfront and getting ghosted. Holding payment until a real milestone — certificate delivered, not just "submitted to partner" — is a structural trust differentiator, not just a UI nicety. This should extend the existing guardrail set in Section 8: no fabricated turnaround promises pairs naturally with no payment released before actual delivery.

**Bundle packages** — partners already sell this way (a single flat price covering Business Certificate, Status Report, Congratulatory Letter, TIN Certificate, and MEMART as one company-registration bundle). SellersPoint should mirror that instinct with its own packages spanning categories — e.g. a "New Business Bundle" combining Business Name/LLC registration, TIN, one free contract template, and Tax Calculator access — priced below buying each piece separately.

**WhatsApp-native ordering, not just status updates** — Section on Status tracking already delivers updates over WhatsApp; the gap is *initiating* a service request from a WhatsApp chat in the first place, not only opening the dashboard. Given SellersPoint's core brand pillar is WhatsApp-fluency and the reference partner pricing itself arrived as a WhatsApp broadcast, letting a seller start a Registration, order a Verification & Lookup service, or generate a Template directly from a WhatsApp conversation closes the gap between how this market already transacts and how the product works.

**A small congratulatory moment on approval** — worth borrowing directly from the reference partner's bundle, which includes a literal Congratulatory Letter. Cheap to build as an automated milestone notification/badge the moment a registration comes back approved, and it ties naturally into the Founding Member "Founder Badge" concept already established in the brand.

---

# End-to-End Workflow

### A. Registration & Filing (Corporate & Legal / Tax & Regulatory)

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Entry** | Seller lands via core app upsell, sellerspoint.ng/docs, WhatsApp share, or starts an order directly from a WhatsApp chat | SellersPoint (automated) | — | Session started |
| **1. Guided intake** | Business activity, category, location, registration status, filing history | SellersPoint (automated) | Seller answers | Structured business profile |
| **2. Eligibility & requirement mapping** | Maps profile → required one-time registrations *and* recurring obligations (VAT cadence, CIT annual, PIT if sole proprietor, **CAC Annual Returns**) | SellersPoint (automated) | Business profile | Personalized checklist, one-time + recurring |
| **3. Document collection** | ID, proof of address, product/label info, revenue data (auto-pulled from core app where possible) | SellersPoint (automated) | Seller uploads + core app data | Complete document/data set |
| **4. Draft generation** | AI pre-fills applications and tax returns in each partner's expected format | SellersPoint (AI-assisted) | Business profile + documents | Draft package(s), tagged by destination partner |
| **5. Pre-partner check** | SellersPoint completeness/sanity check before handoff | SellersPoint (human) | Draft package | Cleared-for-handoff package, or sent back |
| **6. Partner routing** | Routed to Partner A and/or B, tracked independently | SellersPoint (automated) | Cleared package | Delivered to partner |
| **7. Partner review & filing** | Final legal/professional review and filing with CAC/FIRS/NAFDAC/SCUML/LASAA. Payment held escrow-style up to this point, not released upfront. | **Partner (required)** | Routed package | Filing reference |
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

---

# Dashboard Sketch

## Navigation

```
┌─────────────────────┐
│  SellersPoint  Docs  │
├─────────────────────┤
│  ● Overview          │
│  ● Registrations     │  ← partner-fulfilled, status-pill
│  ● Tax Tools         │
│  ● Trackers          │  ← seller-added, lifecycle + reminders
│  ● Templates         │  ← AI-assisted field selection, no status
│  ● Document Vault     │
├─────────────────────┤
│  ← Back to main app  │
└─────────────────────┘
```

## Overview

```
┌────────────────────────────────────────────────────────┐
│  Your Business Setup                                    │
│  ●───●───○───○   2 of 4 registrations complete          │
│  Business Name ✓   TIN ✓   NAFDAC (in review)   LLC —   │
├────────────────────────────────────────────────────────┤
│  ⚠ Action needed: NAFDAC partner requested a clearer    │
│     product label photo.              [Upload now →]    │
│  ⏰ VAT filing due in 12 days.        [Estimate now →]   │
├────────────────────────────────────────────────────────┤
│  Quick actions                                           │
│  [ Estimate my tax ]  [ New proposal ]  [ New contract ] │
├────────────────────────────────────────────────────────┤
│  Recently in your Vault                                  │
│  📄 Business Name Certificate     Registration · Jun 12  │
│  🧾 Tenancy Agreement — Draft     Template · Jul 2       │
│  💰 VAT Estimate — June           Tax Tool · Jul 15      │
└────────────────────────────────────────────────────────┘
```

Deadline alerts pull from two sources, unified: auto-populated renewals SellersPoint already knows about (filed registrations, recurring Tax Filing) and whatever the seller manually added in Trackers.

## Registrations (status-pill view)

```
┌────────────────────────────────────────────────────────┐
│  Corporate & Legal                                       │
│  ┌────────────────────────────────────────────────────┐│
│  │ Business Name Registration      [● Approved]        ││
│  │ Filed via Partner A · Certificate ready  [View →]    ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ LLC Incorporation               [◐ Under Review]     ││
│  │ Filed via Partner A · Submitted 3 days ago            ││
│  └────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────┐│
│  │ Trademark Registration          [○ Not Started]      ││
│  │                                    [Start →]          ││
│  └────────────────────────────────────────────────────┘│
│                                                            │
│  Tax & Regulatory                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │ NAFDAC Registration          [⚠ Action Needed]        ││
│  │ Filed via Partner B · Clearer label photo requested   ││
│  │                                   [Upload →]           ││
│  └────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────┘
```

Status pills: `Not Started → Draft → Submitted → Under Review → Action Needed → Approved`. Partner name shown small on every card.

## Tax Tools

```
┌────────────────────────────────────────────────────────┐
│  Tax Calculator                                          │
│  Pulling from your SellersPoint sales data (auto)        │
│  Estimated VAT this month:  ₦42,300                      │
│  [ Recalculate ]        [ File this with our partner → ] │
├────────────────────────────────────────────────────────┤
│  Filing history                                           │
│  VAT — June 2026        [● Filed]        via Partner B   │
│  VAT — May 2026         [● Filed]        via Partner B   │
│  CIT — 2025 Annual      [◐ Under Review]  via Partner B   │
└────────────────────────────────────────────────────────┘
```

## Trackers

```
┌────────────────────────────────────────────────────────┐
│  Track anything with a due or renewal date                │
│  [ + Add a tracker ]                                       │
├────────────────────────────────────────────────────────┤
│  🏠 Shop Rent Renewal            [🟡 Due in 18 days]        │
│      Recurs annually · monthly reminder while due          │
│                                    [Mark Renewed] [Edit]    │
│  🛡 Shop Insurance                [🟢 Upcoming]              │
│      Recurs annually · next due Mar 2027                   │
│  👥 Staff Salary Run              [🔴 Due in 2 days]         │
│      Recurs monthly                [Mark Paid] [Edit]      │
│  📦 Supplier Payment — ABC Ltd    [🟢 Upcoming]              │
│      Recurs monthly                                        │
└────────────────────────────────────────────────────────┘
```

Add tracker fields: Name, Category (Rent/Lease, Insurance, Payroll, Supplier/Vendor, Loan Repayment, License not covered by SellersPoint, Other), Due date, Recurrence (One-time / Monthly / Quarterly / Annually / Custom), Reminder cadence.

Status model is deliberately simpler than Registrations — no partner, so: `Upcoming → Due Soon → Overdue → Marked Done`, resetting automatically on the next cycle for recurring items.

## Templates (AI-assisted field selection, no status tracking)

```
┌────────────────────────────────────────────────────────┐
│  New: Loan Agreement                                      │
│  Describe the situation — AI will suggest what to include │
│  [ "₦500,000 to a supplier, repaid over 6 months,         │
│     no collateral, monthly installments" ]     [Suggest]  │
├────────────────────────────────────────────────────────┤
│  Suggested fields for your agreement:                     │
│  ☑ Loan amount & currency                                 │
│  ☑ Repayment schedule (monthly installments)                │
│  ☑ Interest rate (optional — leave blank if none)          │
│  ☐ Collateral / security clause                             │
│  ☑ Late payment penalty clause                               │
│  ☐ Guarantor / co-signer details                             │
│  ☑ Governing state / jurisdiction                             │
│                              [ Continue → fill in details ] │
└────────────────────────────────────────────────────────┘
```

```
┌────────────────────────────────────────────────────────┐
│  Your documents                                            │
│  🧾 Tenancy Agreement — 14 Herbert Macaulay   Jul 2       │
│                                    [Download] [Edit & regenerate]│
│  📋 Proposal — Wireless Earbuds Bulk Order    Jun 28      │
│                                    [Download] [Edit & regenerate]│
│  🧾 Loan Agreement — ₦500,000                 Jun 20      │
│      ⓘ High-value — consider a lawyer-reviewed version    │
│                                    [Download] [Talk to Partner A]│
└────────────────────────────────────────────────────────┘
```

No status pill anywhere in this view — a template is either **not yet created** (a picker button) or **created** (a flat list with a date and a download link). "Edit & regenerate" reopens the wizard with prior answers pre-filled and produces a new file; it doesn't version-track or track signatures.

## Document Vault (everything, unified)

```
┌────────────────────────────────────────────────────────┐
│  🔍 Search documents...        [All ▾] [Registration]    │
│                                 [Tax] [Template]           │
├────────────────────────────────────────────────────────┤
│  📄 Business Name Certificate     Registration            │
│     Issued Jun 12 · Renews Jun 2027         [Download]    │
│  💰 VAT Filing — June 2026        Tax                     │
│     Filed Jul 15                            [Download]    │
│  🧾 Tenancy Agreement             Template                 │
│     Created Jul 2                           [Download]    │
│  📋 Proposal — Wireless Earbuds   Template                 │
│     Created Jun 28                          [Download]    │
└────────────────────────────────────────────────────────┘
```

The visual tell: **Registration** and **Tax** rows carry lifecycle metadata (issued/renews, filed dates tied to the reminder engine); **Template** rows only ever carry a "Created" date. Nothing in the Vault gets a status pill except the two partner-fulfilled types.
