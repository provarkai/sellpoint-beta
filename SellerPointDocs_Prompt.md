# SellersPoint Docs — Product & Automation Brief (v8)

## 1. Product Overview

**SellersPoint Docs** is Nigeria's business-formation, tax, compliance, and everyday-documents layer for SellersPoint sellers. Government-facing registrations and tax filings run through two specialized licensed partners; everyday business documents, financial estimates, payroll/tax tooling, and any other renewal or deadline a seller wants tracked are handled entirely in-house — self-serve, automated, and (for documents) AI-assisted within a hard boundary that keeps AI selecting from pre-approved legal language, never inventing new legal language. All of it lands in one unified Document Vault, and every deadline across the product surfaces in one Compliance Calendar.

**Important UI principle carried through this version:** partners are real and do real fulfillment work, but a seller never sees their names. Every seller-facing surface reads as SellersPoint doing the work directly — see Section 8.

## 2. Full Service Catalog

| Category | Services | Fulfillment |
|---|---|---|
| **Corporate & Legal** | CAC Business Name registration, full LLC incorporation, Trademark registration, **CAC Annual Returns filing** (recurring), **SCUML registration** | Partner A |
| **Tax & Regulatory** | TIN generation/verification, state-specific permits (LASAA, local govt), **Tax Filing** (VAT, CIT, PIT returns), **Tax Clearance Certificate (TCC)** | Partner B |
| **Verification & Lookup** | TIN verification, **BVN verification**, NIN verification, CAC Business Name availability check, CAC business status lookup — all automated via a KYC/verification API vendor, no partner involved for the routine checks; document authenticity verification (checking a specific certificate is genuine) gets an automated first pass with a manual cross-check available for high-stakes cases | Automated (vendor API), with Partner A as an internal fallback only for document authenticity on high-stakes documents |
| **Tax Suite** *(expanded in v8)* | PAYE Calculator, VAT Estimator (free); Mini Payroll, Payslip Generator, Annual Tax Certificate, NRS/FIRS E-Invoicing (paid tier) — see Section 12 | SellersPoint, no partner |
| **Self-Serve Documents & Tools** | Contract/Agreement Templates (basic document immediately, AI-assisted improvement from a pre-vetted clause library for peculiar situations), Proposal/Quote Generator | SellersPoint, no partner |
| **Trackers** | Seller-defined lifecycle reminders — rent, insurance, payroll, supplier payments, any other renewal — **plus a "Licences & Documents" category covering CAC Annual Returns and Tax Clearance Certificate**, which can be filed directly from the tracker when due | SellersPoint, seller-managed (Licences & Documents items route to fulfillment when actioned) |
| **Compliance Calendar** *(new in v8)* | Unifies every deadline from Trackers, the Tax Suite, and Registrations into one sorted view — see Section 13 | SellersPoint, connective (not a fulfillment category) |

## 3. Delivery Model — two partners, several self-serve product lines

Government filings require a licensed party of record, so two specialist partners cover them. This is internal architecture — see Section 8 for why none of it names partners on the seller-facing dashboard.

| Partner slot | Owns | Likely partner type |
|---|---|---|
| **Partner A — Corporate & Legal** | Everything about company formation — Business Name, LLC incorporation, Trademark, SCUML registration — plus CAC Annual Returns filing | Law firm or CAC-accredited agent |
| **Partner B — Tax & Regulatory** | Everything about tax — TIN, Tax Filing, and Tax Clearance Certificate — plus state-specific permits | Chartered accountant (ICAN) or licensed tax/regulatory-filing agent |

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
- **Graduating sellers** — Business Name → LLC upgrade, Trademark, SCUML, and recurring compliance as the anchor once registered.
- **Any seller, registered or not** — Trackers isn't gated behind registration; rent/insurance/payroll renewals apply regardless.
- **Consultants/accountants managing multiple SMEs** — not yet served (see Section 14, multi-business support).

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

> Design the product and automation architecture for **SellersPoint Docs**: (1) company formation — CAC Business Name, LLC incorporation, Trademark, SCUML, and recurring CAC Annual Returns filing — fulfilled behind the scenes by a licensed corporate partner; (2) tax — TIN, periodic Tax Filing, Tax Clearance Certificates, and state-specific permits — fulfilled behind the scenes by a licensed tax partner; (3) **Verification & Lookup** — TIN/BVN/NIN/CAC checks fully automated via a KYC vendor API with near-instant turnaround, functioning as a low-friction entry point; (4) a **Tax Suite** — a free PAYE Calculator and VAT Estimator, plus a paid tier (Mini Payroll, Payslip Generator, Annual Tax Certificate, NRS/FIRS E-Invoicing) built on Nigeria's current tax law; (5) self-serve Templates that show a **basic, ready-to-use document immediately**, with AI-assisted improvement as an optional second step, constrained to a pre-vetted clause library — AI must never draft novel legal clauses; (6) seller-managed **Trackers**, including a **Licences & Documents** category for recurring compliance items that can be actioned into real fulfillment; (7) a **Compliance Calendar** unifying every deadline from Trackers, the Tax Suite, and Registrations into one sorted view. **No partner name may ever appear in seller-facing copy** — all fulfillment partners are invisible backend infrastructure; the seller only ever deals with SellersPoint. Payment for backend-fulfilled work is held in escrow-style and released on delivery milestones, not upfront. Every document produced or uploaded lands in one unified, NDPR-compliant Document Vault.

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

## 13. Compliance Calendar

**Why it exists:** Trackers, the Tax Suite, and Registrations each know about their own deadlines, but nothing pulled them into one place — meaning a seller had no reason to open the app on a day nothing was urgently overdue. The Compliance Calendar is the retention answer: one sorted view of everything due, regardless of which subsystem owns it.

**What it pulls together:**
- **From Trackers** — every non-completed tracker, both self-tracked (rent, insurance, payroll, supplier payments) and Licences & Documents items (CAC Annual Returns, Tax Clearance).
- **From the Tax Suite** — the current VAT filing deadline.
- **From Registrations** — long-horizon renewal dates (Business Name, SCUML certificate renewals).

**Behavior:** sorted soonest-first, grouped into "Due soon" (≤30 days) and "Later this year." Each row carries a source tag (Tracker / Licence / Tax / Registration) and a contextual action — "File now" for Licences & Documents items, "Estimate now" for tax deadlines, "View" for registrations, "View tracker" for self-tracked items. No new data model — it's a read-through view over Trackers/Tax/Registrations, so it stays in sync automatically as the underlying items change.

**Ties three systems together, which is exactly the point:** it's the first surface where marking a tracker done, filing a VAT return, or a registration renewal date all show up in one place, making the product feel like one system instead of five tools glued together.

## 14. Feedback & Roadmap (not yet built — logged for future prioritization)

Four further suggestions surfaced in review, not built in this pass:

- **TIN auto-fill across tools** — once a TIN is verified in the Verification tab, pre-fill it into the Tax Suite and Templates instead of asking the seller to re-enter it. Small implementation, but it's the difference between feeling like one dashboard vs. five separate tools.
- **Business Health Score on Overview** — a composite signal ("Registrations 100%, Tax filings up to date, 2 documents expiring soon") giving a reason to check in even with nothing urgent pending, and a natural upsell trigger ("unlock auto-renewal reminders"). Overlaps conceptually with the Compliance Calendar — worth designing together rather than as two competing "why open the app" surfaces.
- **CAC Annual Return reminder + guided filing** — already partially addressed by the Licences & Documents tracker category and the Compliance Calendar's "File now" action; a fuller guided-filing wizard specifically for this flow is still open, and worth prioritizing since missed CAC annual returns is one of the most common ways small Nigerian businesses accidentally lapse into non-compliance.
- **Multi-business/multi-entity support** — letting one login switch between multiple client businesses. Not needed for the primary seller persona, but significant for consultants/accountants managing several SMEs — a distinct user type worth a dedicated design pass rather than bolting onto the single-business dashboard.

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
| **10. Ongoing compliance** | Registration renewals, Tax Filing, and CAC Annual Returns all surface as Compliance Calendar entries; Licences & Documents trackers can be actioned straight back into this pipeline | SellersPoint (automated) → repeats stages 3–9 | Stored data + Calculator output | Renewal/filing reminders |

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
| **0. Aggregate** | Pull current state from Trackers, Tax Suite, and Registrations | SellersPoint (automated) | Underlying data from A/B/C | Combined item list |
| **1. Sort & group** | Sort by days-until-due, group into Due Soon / Later | SellersPoint (automated) | Combined list | Rendered calendar |
| **2. Action** | Seller clicks a contextual action per item — routes into the relevant workflow (A, B, or C) | Seller-initiated | Selected item | Enters the owning workflow |

No new data model — this is a read-through view, so it stays in sync automatically as Trackers/Tax/Registrations change.

---

# Dashboard Reference

As of v8, the dashboard is no longer sketched in ASCII here — the product has grown enough (Tax Suite sub-tabs, PAYE calculator fields, payroll tables, payslip previews, e-invoicing forms, the Compliance Calendar) that a static text mockup would drift from the real thing almost immediately. `sellerspoint-docs-dashboard.html` in this repo is the live, clickable, single-source-of-truth reference — open it directly rather than reading a transcription. It implements every workflow above (A–E) end-to-end with mock data, and every seller-facing string in it has been checked against the "no partner names" guardrail in Section 8.
