# SellersPoint Docs — Product & Automation Brief (v13)

## 1. Product Overview

**SellersPoint Docs** is Nigeria's business-formation, tax, compliance, and everyday-documents layer for SellersPoint sellers. Government-facing registrations and tax filings run through two specialized licensed partners; everyday business documents, financial estimates, payroll/tax tooling, and any other renewal or deadline a seller wants tracked are handled entirely in-house — self-serve, automated, and (for documents) AI-assisted within a hard boundary that keeps AI selecting from pre-approved legal language, never inventing new legal language. All of it lands in one unified Document Vault, and every deadline across the product surfaces in one Compliance Calendar.

**Important UI principle carried through this version:** partners are real and do real fulfillment work, but a seller never sees their names. Every seller-facing surface reads as SellersPoint doing the work directly — see Section 8.

## 2. Full Service Catalog

| Category | Services | Fulfillment |
|---|---|---|
| **Corporate & Legal** | **Business Registration** — CAC Business Name, full LLC incorporation, or Partnership registration (exactly one per business), **SCUML registration** (recommended right after TIN — most banks won't open a business account without it), **CAC Annual Returns filing** (recurring) | Partner A |
| **Tax & Regulatory** | TIN generation/verification, state-specific permits (LASAA, local govt), **Tax Filing** (VAT, CIT, PIT returns), **Tax Clearance Certificate (TCC)** | Partner B |
| **Verification & Lookup** | TIN verification, **BVN verification**, NIN verification, CAC Business Name availability check, CAC business status lookup — all automated via a KYC/verification API vendor, no partner involved for the routine checks; document authenticity verification (checking a specific certificate is genuine) gets an automated first pass with a manual cross-check available for high-stakes cases | Automated (vendor API), with Partner A as an internal fallback only for document authenticity on high-stakes documents |
| **Tax Suite** *(expanded in v8)* | PAYE Calculator, VAT Estimator (free); Mini Payroll, Payslip Generator, Annual Tax Certificate, NRS/FIRS E-Invoicing (paid tier) — see Section 12 | SellersPoint, no partner |
| **Self-Serve Documents & Tools** *(demoted from primary nav in v9 — see note below)* | Contract/Agreement Templates (basic document immediately, AI-assisted improvement from a pre-vetted clause library for peculiar situations), Proposal/Quote Generator | SellersPoint, no partner |
| **Trackers** | Seller-defined lifecycle reminders — rent, insurance, payroll, supplier payments, any other renewal — plus a **"Licences & Documents" category** for recurring compliance items the built-in Compliance Calendar doesn't already cover (e.g. a state-specific permit), filed directly from the tracker when due | SellersPoint, seller-managed (Licences & Documents items route to fulfillment when actioned) |
| **Compliance Calendar** *(upgraded in v9)* | Real statutory deadline dates (not estimates) for VAT, PAYE, WHT, CAC Annual Return, CIT, and PIT/Tax Clearance, merged with open Trackers into one sorted view — see Section 13 | SellersPoint, connective (not a fulfillment category) |

**Trademark registration — removed in v11.** It's no longer part of the catalog, the data model, or the dashboard. **SCUML moves up to be the priority registration right after TIN** — in practice it's the item that unblocks a business bank account, so the product now nudges sellers to start it early rather than treating it as a same-tier "also available" option alongside a dropped service.

**Business Registration — renamed and extended to three types in v13.** What was "Registrations" is now labeled **Business Registration** throughout the dashboard, and the underlying choice is no longer binary: `regType` is one of `"Business Name"`, `"Limited Liability Company"`, or `"Partnership"` — exactly one, never more than one at a time. The single-card rendering rule from Section 13a is unchanged; it just now covers three possible labels instead of two.

**Templates positioning decision (v9):** kept, not removed — free doesn't mean unfocused, and it was one of the three founding pillars of this product (business creation, regulatory compliance, *and documentation*). The "looks unfocused" concern was real but about prominence, not existence: Templates no longer has its own sidebar tab. It's reachable from an Overview quick action ("New document") and from a "Create a document" prompt inside the Document Vault, so it stays available as a trust-building, retention-driving free tool without visually competing with the paid, higher-stakes services in primary navigation.

## 3. Delivery Model — two partners, several self-serve product lines

Government filings require a licensed party of record, so two specialist partners cover them. This is internal architecture — see Section 8 for why none of it names partners on the seller-facing dashboard.

| Partner slot | Owns | Likely partner type |
|---|---|---|
| **Partner A — Corporate & Legal** | Everything about company formation — Business Name, LLC incorporation, or Partnership registration, SCUML registration — plus CAC Annual Returns filing | Law firm or CAC-accredited agent |
| **Partner B — Tax & Regulatory** | Everything about tax — TIN, Tax Filing, and Tax Clearance Certificate — plus state-specific permits | Chartered accountant (ICAN) or licensed tax/regulatory-filing agent |

**CAC Annual Returns filing does not renew the underlying Business Name, LLC, or Partnership registration.** It's a separate, recurring compliance obligation that keeps a business in good standing with CAC — the registration certificate itself doesn't expire or get reissued through it. Product copy treats these as two distinct things: the registration certificate (issued once, shown in Business Registration/Vault) and the Annual Returns filing (recurring, shown in the Compliance Calendar and, if overdue, the "Licences & Documents" Tracker category). **SCUML is a one-time requirement, not a recurring one** — it's issued once by the EFCC after registration and never needs renewal; product copy must never attach a renewal or expiry date to it (corrected in v12, after an earlier draft incorrectly implied a renewal cycle).

**Verification & Lookup is almost entirely automated, not partner-routed.** Verification API vendors exist that cover TIN, BVN, NIN, and CAC lookups under one integration — QoreID's public docs confirm all four — so this whole tier can run on SellersPoint's own infrastructure with near-instant turnaround, instead of the ~12 hours a manual agent needs. Only document authenticity verification on a high-stakes document might still warrant a manual cross-check as a fallback.

**Trackers has zero partner or filing involvement for self-tracked items** (rent, insurance, payroll, supplier payments) — pure reminder utility. **The new "Licences & Documents" category is the one place Trackers and fulfillment touch**: CAC Annual Returns and Tax Clearance Certificate live here as recurring reminders, and when due, a "File now" action kicks off the same Partner A/B fulfillment pipeline as Registrations — the seller never sees that distinction, they just see a reminder that can be actioned.

**Product-discovery bonus:** aggregate (anonymized) Tracker data is a live signal for what to formalize into the partner-fulfilled catalog next.

## 4. The AI Boundary — clause selection, never clause creation

Templates now lead with a **basic, ready-to-use document** the moment a type is picked — the seller can fill it in and download immediately, no AI required (this satisfies "documents they can fill, print, and use" as a first-class path, not a fallback). AI only enters the picture as a second, optional step: **"Anything specific about your situation?"** — the seller describes what's peculiar, and AI improves the standard document from the same vetted clause library. The boundary itself is unchanged and still enforced structurally:

- The template library is a **finite, versioned, ID-tagged set of clauses**, each pre-vetted once by qualified legal counsel before publishing.
- AI's only job is **classification**: map the seller's plain-language description of what's peculiar to a subset of *existing* clause IDs to add or adjust. It does not generate new clause text.
- **Server-side validation enforces this**: an improved document may only include clause IDs that exist in the vetted library. Any AI output that doesn't resolve to a real library ID is discarded automatically, never silently inserted.
- **Expanding the library is a deliberate, human-led process** — never something the AI does at runtime in response to a seller's request.
- **Periodic audit**: sample generated documents on a schedule to confirm every clause traces back to a valid library ID.

## 5. The Document Vault — connective infrastructure

Every document from every fulfillment line lands here, organized by type and renewal status. Also the optional home for Tracker proof-of-completion.

- Organized by type and by status (active / expiring soon / expired), tied directly into the renewal-reminder engine.
- One download/share action regardless of which category originally produced the document.
- A lightweight "Documents" widget can surface in the core SellersPoint app itself.

## 6. Target Users

- **Pre-registration sellers** (primary/volume) — start at Business Name + TIN.
- **Existing SellersPoint core users** — cross-sell target for the Tax Suite (pulls their existing revenue data) and Proposal/Quote Generator.
- **Graduating sellers** — Business Name → LLC upgrade, SCUML (the door to a business bank account), and recurring compliance as the anchor once registered.
- **Any seller, registered or not** — Trackers isn't gated behind registration; rent/insurance/payroll renewals apply regardless.
- **Consultants/accountants/agencies managing multiple SMEs** — served via Partner Sub-Accounts on the admin backend, not the seller-facing dashboard (see Section 13a and Section 15). A seller who personally runs more than one business today registers each business separately, one seller login per business, matching the "the dashboard is for one business" principle in Section 13a.

## 7. Automation Tiers

| Tier | What it means | Applies to |
|---|---|---|
| **Automate fully** | No human touches it per use | Intake, eligibility mapping, reminders (Registrations, Tax, Trackers, Compliance Calendar), Tax Suite (Calculator/VAT/Payroll/Payslip/Certificate/E-Invoicing), Proposal Generator, Document Vault, TIN/BVN/NIN/CAC verification lookups |
| **AI-assisted, constrained to a vetted clause library** | AI recommends which pre-approved clauses to add/adjust and assembles the improved document — cannot draft new clauses, enforced server-side | Template improvement step (basic document itself needs no AI) |
| **AI-assisted, SellersPoint-checked** | Machine drafts, SellersPoint checks completeness before partner handoff | Registration/tax filing drafts |
| **Partner-required by law** | Cannot be automated, ever — invisible to the seller | Final review and filing — Partner A or Partner B |
| **One-time governance, not per-use** | Standing process, not a per-transaction step | Master clause library drafted/vetted by legal counsel before publishing, reviewed periodically |
| **Seller-managed, reminder-only** | No document, no filing — just a due-date and a nudge | Trackers (non-Licences & Documents categories) |

## 8. Trust, Liability & Compliance Guardrails

- **No partner names surface anywhere in the seller-facing UI.** Sellers deal with SellersPoint, full stop. Registration category labels, card copy, button text, and system messages never say "Partner A/B" or route language like "sent to our partner" — internally the work is real and partner-fulfilled (Sections 2–3), but the product never exposes that abstraction to the seller. This is the seller-facing expression of the pre-existing "single point of contact" rule below.
- **NDPR compliance across every handoff and inside the Vault itself** — the single largest concentration of sensitive seller data in the product.
- **Filing disclaimers** on every registration/tax document naming the filing status (not the partner).
- **Calculator disclaimer** — the Tax Suite gives estimates and drafts, not filed positions, until explicitly submitted.
- **Template disclaimer + complexity threshold** — the basic document is generic and usable as-is for common situations; high-stakes agreements get a "Request expert review" prompt, not a named partner handoff.
- **No fabricated turnaround promises** for anything fulfilled behind the scenes.
- **Single point of contact** — support always goes through SellersPoint; the seller never needs to know or contact a partner directly.
- **The AI Boundary (Section 4) is a permanent architectural constraint, not a launch-time policy.**
- **Trackers carry no legal weight** for self-tracked categories — they're reminders the seller sets themselves. Licences & Documents trackers are the exception: those tie to real fulfillment when actioned.

## 9. Success Metrics

Registration/filing completion rate per category, submission rejection/rework rate, renewal → re-filing completion rate, Tax Suite usage → filing conversion rate, templates generated per type (basic vs. AI-improved split), Document Vault engagement, revenue per category, Trackers created per seller, reminder-to-action rate, Licences & Documents "File now" conversion rate, and clause-library validation rejection rate.

**Also tracked:** Verification & Lookup volume and Lookup-to-full-registration conversion rate, escrow milestone completion rate, WhatsApp-initiated order share vs. dashboard-initiated, bundle attach rate, **and Compliance Calendar engagement** (opens per week, action-click-through rate) — this is the single best proxy for "why did a seller open the app with nothing urgent pending," i.e. genuine retention rather than task-driven visits.

## 10. Ready-to-paste prompt block

> Design the product and automation architecture for **SellersPoint Docs**: (1) company formation — CAC Business Name, LLC incorporation, SCUML (positioned right after TIN as the registration a business bank account depends on), and recurring CAC Annual Returns filing (a separate obligation that keeps the business compliant, not a renewal of the registration itself) — fulfilled behind the scenes by a licensed corporate partner; (2) tax — TIN, periodic Tax Filing, Tax Clearance Certificates, and state-specific permits — fulfilled behind the scenes by a licensed tax partner; (3) **Verification & Lookup** — TIN/BVN/NIN/CAC checks fully automated via a KYC vendor API with near-instant turnaround, functioning as a low-friction entry point; (4) a **Tax Suite** — a free PAYE Calculator and VAT Estimator, plus a paid tier (Mini Payroll, Payslip Generator, Annual Tax Certificate, NRS/FIRS E-Invoicing) built on Nigeria's current tax law; (5) self-serve Templates that show a **basic, ready-to-use document immediately**, with AI-assisted improvement as an optional second step, constrained to a pre-vetted clause library — AI must never draft novel legal clauses; (6) seller-managed **Trackers**, including a **Licences & Documents** category for recurring compliance items that can be actioned into real fulfillment; (7) a **Compliance Calendar** unifying every deadline from Trackers, the Tax Suite, and Registrations into one sorted view. **No partner name may ever appear in seller-facing copy** — all fulfillment partners are invisible backend infrastructure; the seller only ever deals with SellersPoint. Payment for backend-fulfilled work is held in escrow-style and released on delivery milestones, not upfront. Every document produced or uploaded lands in one unified, NDPR-compliant Document Vault.

## 11. Additional Product Features

**Escrow-style payment** — payment held until a real milestone (certificate delivered), not released upfront. The standard failure mode with informal WhatsApp-based agents is paying upfront and getting ghosted; this is a structural trust differentiator.

**Bundle packages** — e.g. a "New Business Bundle" combining Business Name/LLC registration, TIN, one free contract template, and Tax Calculator access, priced below buying each piece separately.

**WhatsApp-native ordering, not just status updates** — letting a seller start a Registration, order a Verification & Lookup service, or generate a Template directly from a WhatsApp conversation, not only from the dashboard.

**A small congratulatory moment on approval** — an automated milestone notification/badge the moment a registration comes back approved, tying into the Founding Member "Founder Badge" concept already established in the brand.

**Verification infrastructure — candidate vendors (needs a proper evaluation, not a commitment yet):**
- **QoreID** — confirmed via public API docs to cover NIN, BVN, TIN, and CAC verification/lookup under one integration. Self-serve signup with ~24-hour account approval; no public pricing, quote on request.
- **Dojah, VerifyMe, Mono, Ashlabtech** — confirmed to offer identity/KYC verification generally, but specific checks and pricing weren't disclosed publicly — worth a direct sales conversation.
- **CAC's own VAS platform** (vas.cac.gov.ng) — the official electronic filing channel; likely how the corporate partner already files today. Doesn't remove the accredited-professional requirement — that's legal, not technical — but could speed up the partner's own fulfillment via API instead of manual portal entry.

**Phasing decision:** the corporate partner handles CAC company registration fully manually for now — no VAS integration assumed in v1. Direct CAC VAS integration is a deliberate fast-follow, not a launch blocker.

## 12. Tax Suite (expanded in v8)

Built on the **Nigeria Tax Act 2025** (effective 1 January 2026), which replaced the old Consolidated Relief Allowance with itemized deductions and new Fourth Schedule PAYE bands. This is the single largest net-new capability added to Docs since the v7 brief.

**Core reusable logic:** one PAYE calculation function — gross income, 20%-of-rent relief (capped at ₦500,000/year), optional pension/NHF/NHIS/mortgage/life-insurance deductions, National Minimum Wage exemption (fully exempt at or below minimum wage, currently ₦70,000/month but set by a separate Act and editable), and the Fourth Schedule graduated bands (0% / 15% / 18% / 21% / 23% / 25%). Every tool below calls this same function rather than reimplementing tax logic per-feature.

| Tool | What it does | Tier | Build priority |
|---|---|---|---|
| **PAYE Calculator** | Gross + rent + optional deductions → net pay breakdown by band | Free | 1st — ships as soon as built, no app-store review needed as a web tool, validates demand |
| **VAT Estimator** | Existing VAT estimate pulled from sales data (unchanged from v7) | Free | Already shipped |
| **Mini Payroll** | Add staff once, net pay recalculates automatically under current PAYE bands; export a payroll summary PDF, send payslips via WhatsApp | Paid | 2nd — first paid tier, replaces manual Excel/accountant work |
| **Payslip Generator** | Branded payslip PDF per employee, pulled from Payroll data | Paid | Bundled with Payroll |
| **Annual Tax Certificate** | Auto-aggregates a year of Payroll data into a summary — useful for loan, mortgage, or visa applications | Paid | 3rd — lower-frequency, high-stakes-moment feature; candidate for one-time unlock rather than subscription |
| **NRS/FIRS E-Invoicing** | Issues an Invoice Reference Number (IRN), Cryptographic Stamp (CSID), and QR code per Nigeria's e-invoicing mandate (Merchant-Buyer Solution/Electronic Fiscal System, rolled out for large taxpayers Nov 2025, phased to medium/small businesses through 2026–2027). B2B/B2G pre-clearance, B2C over ₦50,000 reported within 24 hours | Paid | 4th — highest build effort, needs UBL/Peppol BIS 3.0 formatting and a live NRS/Access Point Provider integration, not just local calculation; build last once the Calculator has real users to convert |

**Product note:** this expansion turns Tax Tools from a single VAT estimate into a genuine payroll/compliance suite — worth its own pricing and go-to-market pass rather than treating it as "one more feature" of the existing free tier.

## 13. Compliance Calendar (upgraded in v9, layout redesigned in v12)

**Why it exists:** Trackers, the Tax Suite, and Registrations each know about their own deadlines, but nothing pulled them into one place — meaning a seller had no reason to open the app on a day nothing was urgently overdue. The Compliance Calendar is the retention answer: one view of everything due, regardless of which subsystem owns it.

**v9 change: real dates, not estimated day-counts.** The first version of this feature used rough hardcoded day-offsets ("due in 18 days"). v9 replaces that with actual recurrence math against Nigeria's real statutory filing calendar:

| Obligation | Cadence | Rule |
|---|---|---|
| VAT Return | Monthly | 21st of the month following the sales period |
| PAYE Remittance | Monthly | 10th of the month following the payroll period |
| Withholding Tax Remittance | Monthly | 21st of the month following the deduction |
| CAC Annual Return | Annual | Fixed date (30 June shown as the reference point) |
| Companies Income Tax Return | Annual | ~6 months after financial year end (December FYE shown) |
| Personal Income Tax Return | Annual | 31 March, individual return + Tax Clearance renewal |

Each of these now computes its *actual next occurrence* from today's date (rolling to next month/year automatically once the current occurrence passes), rather than living as a static Tracker row. This is also why the two CAC Annual Returns/Tax Clearance rows were removed from the Trackers pre-seeded list (Section 2 note) — they're first-class Calendar entries now, not generic reminders, so showing both would duplicate the same obligation.

**Three visible pieces:**
1. **Next deadline hero stat** — the single soonest statutory obligation, shown prominently ("12 days · 21 Jul") with a direct action.
2. **Two-month grid view, always stacked (v12)** — this month, then next month directly below it, separated by a visible divider and each carrying its own full month-name header (e.g. "July 2026" / "August 2026"). Originally this sat in a two-column layout that only stacked at narrow widths as a responsive side-effect; v12 makes the stacked order permanent and deliberate so the relationship between the two months always reads clearly, regardless of screen width. This exists specifically because a single-month view hides real near-term deadlines that fall just past the month boundary — e.g. on 18 July, the next PAYE remittance (10th of the month) has already passed for July and doesn't land until 10 August, invisible on a one-month grid but clearly visible on two.
3. **Hover detail on deadline days (v12)** — a day cell with a deadline dot highlights on hover and shows a tooltip listing every obligation due that day (name + note), since more than one statutory deadline can land on the same date (e.g. VAT Return and Withholding Tax Remittance both fall on the 21st).
4. **Merged upcoming list, fixed two-column layout (v12)** — statutory deadlines plus open Trackers, sorted soonest-first, each tagged by source (🏛️ statutory / 📌 tracker) with a contextual action ("File now" for filing-type obligations, "Estimate now" for VAT, "View tracker" for self-tracked items). Each row is a two-column grid — description on the left (wraps freely), due-date badge and action on the right (fixed width, pinned to the row's right edge) — so a long obligation name or note can never push the date out of alignment or wrap it onto its own line, which the original flex layout allowed.

**What it pulls together:** the full statutory list above (computed, not stored) + every non-completed Tracker (self-tracked and Licences & Documents categories) + the current VAT deadline from the Tax Suite. No new data model beyond the statutory rule table itself — it's a read-through/computed view, so it stays in sync automatically as Trackers change and time passes.

**Ties three systems together, which is exactly the point:** it's the first surface where marking a tracker done, a VAT deadline, and a CAC Annual Return date all show up together, making the product feel like one system instead of several tools glued together.

## 13a. One Business Per Dashboard, Multi-Business via Partner Sub-Accounts (revised in v13)

**v10 originally built a multi-business switcher directly into the seller-facing dashboard** — one login, a sidebar dropdown, multiple independent business records. **v13 reverses that:** the seller-facing dashboard (`sellerspoint-docs-dashboard.html`) is scoped to **one business per login**, full stop. Multi-business management still exists, but it moved to the admin backend as a distinct capability — **Partner Sub-Accounts** — rather than living inside the product a typical seller uses.

**Why the reversal:** the overwhelming majority of sellers run exactly one business, and a switcher in their primary nav added a UI affordance (and a whole data-model layer) that served a minority case — the accountant/consultant managing several clients. That case is real, but it isn't a *seller* need, it's a *service-provider* need, and service providers are a different audience who should be provisioned and managed by SellersPoint staff, not self-served through the same dashboard as an ordinary seller. Putting it in the admin backend also means SellersPoint controls who gets multi-business access, rather than every seller carrying the data-model overhead of a feature only a few will ever use.

**Hard constraint, unchanged in spirit:** a business's registration is **one field, not several** — `regType` is one of `"Business Name"`, `"Limited Liability Company"`, or `"Partnership"` (extended from two options to three in v13 — see Section 2), never more than one at a time, and never rendered as more than one registration card. Business Registration always renders exactly one card, labeled from that business's actual `regType`.

**Current architecture (v13):**
- `sellerspoint-docs-dashboard.html` holds a single `BUSINESS` object — no array, no switcher, no `currentBusinessId`. Every view's render function still calls a `biz()` helper for consistency with the rest of the codebase, but `biz()` now just returns that one object.
- The sidebar shows a static, non-interactive business name/type readout in place of the old switcher — useful context, no affordance to imply more businesses live behind it.
- **Multi-business management now lives in `sellerspoint-docs-admin.html`**, under a new **Partner Sub-Accounts** section: agencies/consultants (e.g. "Adaeze & Co. Chartered Accountants") get an account that's linked to a set of client businesses via a `managedBy` field on each business record. Staff (or, in a fuller build, the partner via a scoped login) can filter the cross-tenant Businesses table down to just that partner's managed businesses and act on them from there.
- **Naming collision, deliberately avoided:** "partner" already means something specific in this product — Partner A (Corporate & Legal) and Partner B (Tax & Regulatory), the licensed fulfillment partners from Section 3, invisible to sellers. Partner Sub-Accounts are a completely different kind of partner — a service-provider/reseller relationship, visible only to staff, never confused with fulfillment routing. Every UI label and this document call this out explicitly wherever the term appears, to keep the two meanings from bleeding into each other.

**What this means for the personas in Section 6:** the consultant/accountant-managing-multiple-SMEs case is still served — just through the admin backend's Partner Sub-Accounts, not through the seller-facing dashboard. A seller who happens to run two businesses (e.g. an LLC for one line of business and a separate Business Name for a side venture) now registers and manages each one under its own login, same as any two unrelated sellers would.

## 13b. TIN Auto-fill, Business Health Score & Guided CAC Filing (built in v12)

The three remaining items from the original Feedback & Roadmap list (Section 14) are now built, alongside the Compliance Calendar layout work in Section 13.

**TIN auto-fill across tools.** Verifying a TIN in the Verification tab now stores it on that business's record (`biz().tin`), not just in the lookup history. Everywhere else the seller would otherwise re-type the same TIN, it's pre-filled automatically:
- The Verification tab itself pre-fills the input and shows "Auto-filled from your last verified TIN" the next time a TIN check is opened.
- The NRS/FIRS E-Invoicing form's "Your TIN" field pre-fills from the business's stored TIN, with a small "Auto-filled from Verification" note when it does.
- Templates that legitimately carry the issuing business's TIN (Sales/Supplier Agreement, Proposal/Quote) show the live verified value inline once known, or a prompt to verify first if not.
- The dashboard is single-business (Section 13a), so this is simply the one business's TIN, remembered once and reused everywhere on that login rather than re-typed per tool.

**Business Health Score on Overview.** A composite score (0–100) computed from five live signals: registration approved, SCUML certificate approved, TIN verified, no overdue Trackers, and VAT filings up to date. Shown as a score, a progress bar, and a checklist where every failing item carries a "Fix" button that routes straight to the view that resolves it (Business Registration, Verification, Trackers, or Tax Tools) — turning the score from a passive number into a worklist. Color-coded (green ≥80, amber 50–79, red <50). On the admin side, the same signals are what a Partner Sub-Account holder or staff member would triage across the Businesses table when deciding which client needs attention first.

**Guided CAC Annual Return filing.** The Compliance Calendar's "File now" action on CAC Annual Return now opens a 3-step guided wizard instead of a bare toast: (1) confirm business details, with TIN pulled from auto-fill and a nudge to verify it first if missing; (2) confirm nothing has changed since the last filing (directors, shareholders, business address); (3) review the fee and escrow terms and submit. This is the fuller guided-filing flow the original roadmap note called for, replacing the single-click stub — and it reuses the same auto-filled TIN and escrow-payment language used everywhere else in the product, rather than introducing a one-off pattern.

## 14. Feedback & Roadmap

All four items originally logged here are now built:
- **Multi-business/multi-entity support** — built in v10 as a customer-dashboard switcher, revised in v13 into admin-side Partner Sub-Accounts, see Section 13a.
- **TIN auto-fill across tools** — built in v12, see Section 13b.
- **Business Health Score on Overview** — built in v12, see Section 13b.
- **CAC Annual Return guided filing** — built in v12, see Section 13b.

No open items at time of writing — future suggestions land here as they come in.

## 15. Customer Dashboard vs. Platform Admin Backend (built in v11)

**Why this split exists from day one:** the core SellersPoint app already draws this line — `index.html` is the seller-facing app, `backend.html` is a separate, staff-only "Platform Admin" page giving a cross-tenant view across every business on the platform. Docs follows the same precedent instead of bolting on an admin surface later.

- **`sellerspoint-docs-dashboard.html`** — the seller/customer-facing product covered by everything above. One seller login, one business (Section 13a), and never a partner name anywhere in it (Section 8).
- **`sellerspoint-docs-admin.html`** — a new, separate, internal-only file. Not linked from the customer dashboard, the same way `backend.html` isn't linked from `index.html` — staff navigate to it directly. It's the one surface in the whole product where Partner A / Partner B legitimately appear by name, because the audience is SellersPoint staff, not sellers.

**What the admin backend shows that the customer dashboard structurally cannot:**
- **Fulfillment queue** — every item currently routed to Partner A or Partner B (the seller-invisible side of Workflow A, stages 6–7), tagged by partner, stage, days in queue, and escrow payment status, so staff can chase a stalled filing before a seller has to ask.
- **Partner Sub-Accounts (v13)** — agency/consultant accounts (e.g. "Adaeze & Co. Chartered Accountants") each linked to a set of client businesses via a `managedBy` field, with a "View businesses" action that filters the cross-tenant Businesses table down to just that partner's clients. This is where the multi-business capability originally built into the customer dashboard in v10 now lives — see Section 13a for the full rationale. Deliberately named and presented separately from Partner A/Partner B fulfillment routing directly above it, since both are called "partner" but mean entirely different things.
- **Cross-tenant business list** — every business across every seller login, filterable by managing partner, with a "Managed by" column (self-managed or a named Partner Sub-Account) — status, registration type, SCUML status, package, and last activity, with action-needed rows flagged for follow-up.
- **Package & Pricing management** — every priced service (Business Name Registration, LLC Incorporation, Partnership Registration, SCUML Registration, CAC Annual Returns Filing, Tax Filing, Tax Clearance Certificate, TIN/BVN/NIN/CAC Verification, Document Authenticity Check, the New Business Bundle, and the Tax Suite paid tier) as an editable table: seller-facing price, internal partner/vendor cost, and computed margin. This is where "See bundle pricing" and "Bundle pricing would open here" on the customer dashboard actually get their numbers from — pricing is set once, here, never exposed as an editable surface to sellers. Figures shown in the mockup are current working examples for planning, not published rates.

---

# End-to-End Workflow

### A. Registration & Filing (Corporate & Legal / Tax & Regulatory)

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Entry** | Seller lands via core app upsell, sellerspoint.ng/docs, WhatsApp share, or starts an order directly from a WhatsApp chat | SellersPoint (automated) | — | Session started |
| **1. Guided intake** | Business activity, category, location, registration status, filing history | SellersPoint (automated) | Seller answers | Structured business profile |
| **2. Eligibility & requirement mapping** | Maps profile → required one-time registrations *and* recurring obligations (VAT cadence, CIT annual, PIT if sole proprietor, CAC Annual Returns) | SellersPoint (automated) | Business profile | Personalized checklist, one-time + recurring |
| **3. Document collection** | ID, proof of address, business activity details, revenue data (auto-pulled from core app where possible) | SellersPoint (automated) | Seller uploads + core app data | Complete document/data set |
| **4. Draft generation** | AI pre-fills applications and tax returns in each partner's expected format | SellersPoint (AI-assisted) | Business profile + documents | Draft package(s), tagged by destination partner internally |
| **5. Pre-partner check** | SellersPoint completeness/sanity check before handoff | SellersPoint (human) | Draft package | Cleared-for-handoff package, or sent back |
| **6. Partner routing** | Routed to the corporate or tax partner, tracked independently — invisible to the seller | SellersPoint (automated) | Cleared package | Delivered to partner |
| **7. Partner review & filing** | Final legal/professional review and filing. Payment held escrow-style up to this point, not released upfront. | **Partner (required, internal only)** | Routed package | Filing reference |
| **8. Status tracking** | Per-service WhatsApp/email updates — SellersPoint-branded, no partner mention | SellersPoint (automated) | Filing references | Status updates |
| **9. Delivery & storage** | Certificates/filed returns delivered digitally into the Document Vault; payment releases to the partner internally; approval triggers a congratulatory notification/badge moment | SellersPoint (automated) | Government-issued documents | Stored, retrievable per service |
| **10. Ongoing compliance** | Tax Filing and CAC Annual Returns recur and surface as Compliance Calendar entries (neither the Business Name/LLC registration certificate nor the one-time, EFCC-issued SCUML certificate recur); Licences & Documents trackers can be actioned straight back into this pipeline | SellersPoint (automated) → repeats stages 3–9 | Stored data + Calculator output | Renewal/filing reminders |

### B. Self-Serve Documents & Tools

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Entry** | Seller picks a template type | SellersPoint (automated) | Selection | Session started |
| **1. Basic document** | Standard fields shown immediately — ready to fill in and download as-is | SellersPoint (automated) | Selection | Usable basic document |
| **2. Optional: describe what's peculiar** | Seller describes anything specific about their situation | SellersPoint (automated) | Free text | Intent captured |
| **3. AI clause mapping (constrained)** | AI maps the description to a subset of existing, pre-vetted clause IDs to add/adjust — never generates new clause text | SellersPoint (AI, boundary-enforced) | Seller description | Suggested additions, seller can toggle on/off |
| **4. Library validation** | Server checks every suggestion resolves to a real library ID; anything that doesn't is silently dropped | SellersPoint (automated, enforced) | AI suggestions | Validated clause set |
| **5. Generate improved document** | Final improved document generated with disclaimer | SellersPoint (automated) | Validated clauses | Ready-to-use output |
| **6. Store** | Both the basic and any improved version save to the Document Vault with a "Created" date only — no status pill | SellersPoint (automated) | Output | Stored document(s) |

*(Standing, not per-use: master clause library drafted and vetted once by qualified legal counsel before publishing, reviewed periodically after.)*

### C. Trackers

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Add a tracker** | Seller names the item, sets category (including Licences & Documents), due date, and recurrence | Seller (manual entry) | Name, category, date, recurrence | New tracker |
| **1. Reminder scheduling** | System schedules reminders leading up to the due date, and the item joins the Compliance Calendar | SellersPoint (automated) | Tracker data | Scheduled notifications + calendar entry |
| **2. Notify** | WhatsApp/email reminder sent on cadence | SellersPoint (automated) | Schedule | Reminder delivered |
| **3a. Mark done** (self-tracked categories) | Seller marks Renewed/Paid, optionally attaching a receipt | Seller (manual) | Proof (optional) | Tracker resets to next cycle (if recurring), proof stored in Vault |
| **3b. File now** (Licences & Documents) | Seller actions the reminder directly into the real fulfillment pipeline (Workflow A) | Seller-initiated → SellersPoint (automated handoff) | Tracker data | Enters Registration & Filing workflow |

### D. Verification & Lookup

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Select a check** | Seller picks TIN, BVN, NIN, Business Name/status, or document authenticity | SellersPoint (automated) | Selection | Check started |
| **1. Submit identifier** | Seller enters the ID/number (or uploads the document for authenticity checks) | SellersPoint (automated) | ID number or document | Query sent to vendor API |
| **2. Vendor API lookup** | Result returned from the KYC/verification vendor, typically in seconds | Automated (vendor API) | Query | Match/no-match result |
| **3. High-stakes fallback (authenticity only)** | If flagged high-value, routes internally for a manual cross-check instead of relying solely on the automated result — invisible to the seller | **Partner (conditional, internal only)** | Document | Confirmed result |
| **4. Store** | Result saved to the Document Vault, tagged "Verification," with a "Checked" date | SellersPoint (automated) | Result | Stored record |

### E. Compliance Calendar

| Stage | What happens | Owner | Key inputs | Key outputs |
|---|---|---|---|---|
| **0. Compute statutory dates** | Recurrence rules (Section 13 table) compute each obligation's real next occurrence from today's date | SellersPoint (automated) | System date | Statutory deadline list |
| **1. Aggregate** | Merge computed statutory deadlines with open Trackers | SellersPoint (automated) | Statutory list + Tracker data | Combined item list |
| **2. Render** | Next-deadline hero stat, this-month + next-month grid, sorted upcoming list | SellersPoint (automated) | Combined list | Rendered calendar |
| **3. Action** | Seller clicks a contextual action per item — routes into the relevant workflow (A or C) | Seller-initiated | Selected item | Enters the owning workflow |

No new data model beyond the statutory recurrence rules themselves — this is a computed/read-through view, so it stays in sync automatically as Trackers change and time passes.

---

# Dashboard Reference

As of v8, the dashboard is no longer sketched in ASCII here — the product has grown enough (Tax Suite sub-tabs, PAYE calculator fields, payroll tables, payslip previews, e-invoicing forms, the Compliance Calendar) that a static text mockup would drift from the real thing almost immediately. `sellerspoint-docs-dashboard.html` in this repo is the live, clickable, single-source-of-truth reference — open it directly rather than reading a transcription. It implements every workflow above (A–E) end-to-end with mock data, and every seller-facing string in it has been checked against the "no partner names" guardrail in Section 8.

**v9 note:** Templates no longer has a sidebar entry in the live file (see the positioning decision in Section 2) — find it via Overview's "New document" quick action or the Document Vault's "Create a document" prompt. The Compliance Calendar tab now uses real statutory recurrence math and a two-month grid instead of estimated day-counts.

**v10 note (superseded by v13 — see below):** the sidebar opened with a business switcher above the nav, and every view rendered against whichever business was currently active.

**v11 note:** Trademark is gone from Registrations, the data model, and every business's setup checklist — SCUML is now the featured "Also available" item, with copy explaining it's what unblocks a business bank account, positioned to be started right after TIN. Registration certificates in the Document Vault no longer claim a "Renews via Annual Returns" date for Business Name/LLC — see Section 3 for why that framing was wrong. There's also a second, separate file now: `sellerspoint-docs-admin.html` — a staff-only "Platform Admin" backend (cross-tenant business list, internal fulfillment queue, and Package & Pricing management), not linked from the customer dashboard, mirroring the core app's `backend.html` pattern. See Section 15.

**v12 note:** the SCUML certificate no longer carries a renewal date anywhere in the file — it's a one-time, EFCC-issued certificate (see Section 3). The Compliance Calendar's two months are now always stacked with a divider and full month-name headers, deadline days highlight and show a detail tooltip on hover, and the Upcoming list is a fixed two-column grid so due-date badges never lose their right-alignment (see Section 13). Overview now shows a live Business Health Score with per-item "Fix" links, TIN verified in the Verification tab auto-fills into E-Invoicing and TIN-bearing Templates, and the Compliance Calendar's "File now" on CAC Annual Return opens a 3-step guided filing wizard instead of a single toast (see Section 13b).

**v13 note:** the customer dashboard's business switcher is gone — the sidebar now shows a static, non-interactive business name/type readout, and the file holds one `BUSINESS` object instead of a `BUSINESSES` array (see Section 13a). "Registrations" is renamed **"Business Registration"** throughout, and `regType` now supports a third value, `"Partnership"`, alongside Business Name and Limited Liability Company. `sellerspoint-docs-admin.html` gained a **Partner Sub-Accounts** section — agency/consultant accounts each linked to a set of client businesses, with a "View businesses" action that filters the cross-tenant Businesses table (now showing a "Managed by" column) down to that partner's clients. This is where multi-business management now lives — see Section 13a and Section 15.
