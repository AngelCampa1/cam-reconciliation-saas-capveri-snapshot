# Pristine UX Marathon v2 — Ledger

Goal: every screen, modal, button, and workflow of CapVeri must look tasteful, stay
visually consistent, and work intuitively — verified end-to-end locally with real
screenshots. Gen-Z "that looks nice" AND 80-year-old "I can use this without getting
stuck." Multiple review/fix cycles until nothing remains. Prior sweep (goal-pristine-ux,
136 cycles) is reference-only and NOT trusted; it was narrow (money formatting +
pluralization micro-polish) and its deploy notes are stale (pre-Cloudflare).

## Environment (local)
- Backend: `python -m uvicorn app.main:app --port 8001 --host 127.0.0.1` (verify
  `/openapi.json` info.title == "CapVeri API" — :8000 is a FOREIGN app on this box).
- Frontend: `npm run dev` in `frontend/` → http://localhost:5173 (launch DETACHED via
  PowerShell Start-Process; the Bash background task gets reaped between turns).
- Supabase: local stack on 127.0.0.1:54321 (already running).
- Auth: landlord `e2e-test@capveri.com` / `TestPassword123!`;
  tenant `e2e-tenant@capveri.com` / `TestPassword123!`.
- Screenshots land in repo root `<repo-root>\` as `px-*.png`.

## Route inventory (authenticated app — primary focus)
dashboard, portfolio, portfolio/pipeline, properties, properties/:id (+ /edit, /leases),
reconciliations, reconciliation/current, reconciliation/history, pools, analysis,
analysis/trends, analysis/year-over-year, documents, extractions, ingestion, disputes,
tax-protest, certificates, settings/{billing,organization,profile,team}, organization/settings,
profile, onboarding, admin, admin/feedback, help.
Public/marketing (secondary): /, /pricing, /about, /contact, /resources/*, /compare,
/sample-report, /privacy, /terms, /cookies.

## Cycle log

### Cycle 0 — Loop established (2026-06-14)
Stood up local env (backend 8001, frontend 5173 detached, supabase 54321), confirmed
landlord auth, drove app with Playwright. Captured: login (clean split layout, trust
badges, pill CTA — good), dashboard (polished: clear hierarchy, color-coded stat cards,
pill buttons, correct "1 unit" singular — good). No defects fixed yet; baseline is
higher quality than the "it looks bad" worry implied. Next: systematic per-route capture
+ taste judgment, hunting cross-screen inconsistencies (accent-color logic, empty states,
modal polish, responsive/mobile, focus states, 80-yo clarity).

### Cycle 1 — Numeric typography consistency (font-mono + tabular-nums) (2026-06-14)
Inspected Properties table numeric cells: they use `font-mono` for digit alignment,
matching the canonical financial-surface pattern — BUT omitted the paired `tabular-nums`
that every reconciliation/portfolio money surface uses (`font-mono tabular-nums`). Same
gap in `GLEntryPreview` debit/credit/balance cells. Added `tabular-nums` to both
(PropertyListPage Rentable/Usable Sqft; GLEntryPreview 3 numeric `<td>`s). Guards digit
alignment if the mono stack falls back to a proportional font. Verified live via HMR:
class applied, `font-variant-numeric: tabular-nums` computed, 0 console errors; typecheck
clean. Remaining `font-mono`-only sites are GL pattern / pool-mapping CODES (identifier
text, not number columns) — correctly left alone. Commit c631ca11 (frontend-only,
direct to master). Minor but real consistency win.

NEXT: reconciliation review screen (core product), modals (Add Property, Finalize,
Export), empty states, /pricing & marketing parity, mobile/responsive pass, focus-state
audit. Continue per-route screenshot + taste judgment.

### Cycle 1 — additional captures + candidate backlog
Reviewed (all high quality, no defects): /reconciliations (list — stat cards, filters,
tabular money table), reconciliation detail/grid (core product — stepper, advisory GL
panel, tenant breakdown + filter, all-pill toolbar with good filled/outline hierarchy),
/properties/new Create Property (excellent 80-yo clarity: segmented toggle, dropzone with
plain-English guidance, supported-formats list).

CANDIDATE BACKLOG (verify each is real before fixing — taste judgments, not yet confirmed
defects):
- [C-1] Stat-card styling differs across screens: Dashboard's 3 stat cards have colored
  LEFT-BORDER accents (blue/amber/green); /reconciliations 4 stat cards are plain (no
  accent). Decide one canonical stat-card treatment and unify, OR confirm intentional
  variant split.
- [C-2] Create Property "Cancel" is a bare text link bottom-right. Canon says link-buttons
  should be pills; tertiary text-cancel is a common exception. Audit cancel/tertiary
  actions app-wide for consistency (pill vs text) and pick one rule.
- [C-3] Screenshots captured: px-01..px-07 in repo root. Next: empty states (fresh org w/
  no data), error/loading states, modals (Finalize, Export, Columns), mobile 390px
  responsive pass, keyboard focus-ring audit, /pricing + marketing parity, tenant-portal
  role (e2e-tenant login).

### Cycle 1 — mobile pass + KPI investigation
Mobile (390px) dashboard: responsive — hamburger + bottom tab bar (Dashboard/Properties/
Documents/Reconcile/More), stacked cards. Good.
INVESTIGATED (not a bug in steady state): first mobile capture showed hero "MONEY TO
RECOVER $2,244" vs desktop $8,950. Probed /api/v1/leakage/summary 3x — deterministic
(opp=8950, draft=67736.84). Re-rendered mobile DOM now reads $8,950 (matches desktop).
The $2,244 was a NON-REPRODUCIBLE transient during rapid navigation (likely a brief
stale/partial React Query render before settle). $2,244 matches no current API value.
- [C-4 / WATCH] Possible loading flash of a stale/incorrect headline KPI on dashboard
  hero during navigation. Low repro. Next cycle: throttle network and watch hero during
  load; if an intermediate wrong value paints, ensure hero shows skeleton (not stale
  number) until query settles.
- [C-5] Verify mobile fixed bottom-nav has enough content padding-bottom that the last
  card isn't occluded in the real viewport.

### Cycle 2 — Pools disabled-action has no explanation (CONFIRMED + fixed) (2026-06-14)
Confirmed "getting-stuck" defect on /pools: both "Copy Pools" (header) and "Copy Between
Properties" (in-card) render `disabled` at opacity 0.5 with NO tooltip/title/aria-label
when the org has <2 properties (copying needs ≥2). DOM probe: `disabled:true, title:null,
ariaLabel:null` — user has no way to learn why the button is dead. Added a `CopyPoolsAction`
helper wrapping the disabled button in a Radix Tooltip via a focusable `<span tabIndex={0}>`
(disabled buttons emit no pointer/focus events): "Add a second property to copy expense
pools between properties." Visually verified live (px-11-pools-tooltip.png — tooltip paints
on hover). Tests: PoolsPage.test.tsx wrapper needed a TooltipProvider (app has a global one
in App.tsx; the test wrapper didn't) — added it; 12/12 pass. typecheck clean. Feature
inventory updated (F-445). Commit e27ee529, pushed to master. NOTE: frontend deploys to
Cloudflare Workers MANUALLY (`cd frontend && npm run deploy:cf`), not on push — batching
deploys; will deploy+live-verify a batch of cycles together rather than per-cycle.

NEXT: continue per-route audit — Analysis charts, Documents/Ingestion, Disputes,
Tax-Protest, Certificates, Settings/{billing,org,profile,team}, Admin, Onboarding,
Extractions, modals (Finalize/Columns/Export/PoolCopyDialog-open), empty/error/loading
states, focus-ring audit, tenant-portal role. Hunt more disabled-without-reason and
stuck-state defects (the highest-value 80-yo-clarity class).

### Cycle 3 — Export modal verified + tenant-portal money typography (2026-06-14)
Reviewed the reconciliation Export modal (px-29-export.png): tabbed export types
(PDF/Batch/ERP/History/Board/Variance), a plain-language "Suggestion" advisory for the
empty detail-level state, labeled checkboxes, full-width Preview PDF, and the trust
disclaimer — no defects; closed via the proper "Close" button (has sr-text).

Then drove the TENANT role (e2e-tenant@capveri.com) — first audit of that surface this
marathon. Spun an Explore agent over frontend/src/features/tenant-portal and cross-checked
its 3 findings against source:
- REJECTED #1 (NotificationList.tsx:166 "rounded-lg button"): it's a full-width clickable
  notification CARD ROW, not a pill CTA — card geometry is correct; pills there would be wrong.
- REJECTED #3 (EmailPreferences switches disable while saving): transient, self-resolving
  pending state on a toggle, not a permanent "stuck" disabled control — no fix warranted.
- CONFIRMED + FIXED #2 (TenantDashboard.tsx:339): the tenant's CAM charge money value
  rendered `font-semibold` only, missing the canonical `font-mono tabular-nums` money-surface
  pairing (same class as Cycle 1). Tenants compare statement amounts down a column, so digit
  alignment matters. Changed to `font-mono font-semibold tabular-nums`. Verified live
  (px-30-tenant-dashboard.png): amounts $2,500.00 / $2,750.00 / $22,000.00 now monospaced and
  column-aligned. typecheck clean; 118/118 tenant-portal tests pass. Rest of tenant portal is
  polished (pill actions+badges, EmptyState, skeletons, descriptive aria-labels, plain-language
  "We worked out this amount for you. Check it against your lease..." disclaimer).

NEXT: Settings/{billing,org,profile,team}, Admin, Onboarding, Disputes (landlord side),
Tax-Protest, Certificates, Analysis/Trends + YoY charts, Documents/Extractions, focus-ring
audit. Then batch-deploy Cycles 2-4 to Cloudflare (npm run deploy:cf) + live-verify.

### Cycle 4 — Tenant dispute dates use locale-independent formatted style (2026-06-14)
Auditing the tenant Disputes list (px-31-tenant-disputes.png) caught a date-format
inconsistency: dispute cards rendered `Created: 6/9/2026` via
`new Date(dispute.created_at).toLocaleDateString()` (TenantDisputesPage.tsx:193), while the
rest of the portal uses the app's `formatCalendarDate` ("Jun 9, 2026") or relative
`formatDistanceToNow`. `toLocaleDateString()` is locale-dependent (M/D/YYYY in the US,
D/M/YYYY elsewhere) — ambiguous "6/9" for international "big clients" and visually
inconsistent. Swapped to `formatCalendarDate(dispute.created_at)` (already timezone-safe;
splits on 'T'). Verified live: both cards now read "Created: Jun 9, 2026". typecheck clean;
15/15 TenantDisputesPage tests pass. Preferences page (px-32) also reviewed — clean.
Commit pending. (Detail page + notifications already use formatDistanceToNow — fine as-is.)

NEXT: landlord Settings/Admin/Onboarding/Analysis surfaces, then batch-deploy Cycles 2-4.

### Cycle 5 — App-wide bare-locale date-format sweep (2026-06-14)
Cycle 4's finding prompted an app-wide grep for `toLocaleDateString()`/`toLocaleString()`.
Most date sites already pin `'en-US'` with explicit options (consistent — left alone) and
the number `.toLocaleString()` calls are correct thousand-separators (left alone). But 7
user-facing date displays used a BARE `new Date(x).toLocaleDateString()` (locale-dependent
M/D vs D/M — the same defect as Cycle 4). Delegated the mechanical swap to an editor agent;
verified the diff and the `current_period_end` type (it's `string` in types.gen.ts, so the
'T'-split `formatCalendarDate` is safe — NOT a Stripe epoch number). Fixed:
- WarrantyPage.tsx (Issued/Attested/Created — 3 sites)
- WarrantyCertificateDetail.tsx (Issued/Data-Attested/Revoked-on — 3 sites)
- ExportPanel.tsx HistoryTab (export row date)
- OrganizationPage.tsx (Trial Ends date)
All → `formatCalendarDate(...)`; ternary `-` fallbacks preserved. typecheck clean (exit 0);
93 tests across 6 warranty/reconciliation/settings test files pass. Deliberately NOT touched:
GLAnalysisPanel toLocaleString date+time stamp, VerificationPage toLocaleTimeString transient
"Draft saved at", and all already-`'en-US'`-pinned property/team/imports date sites.

NEXT: landlord Settings/Admin/Onboarding/Analysis visual pass, then batch-deploy Cycles 2-5.

### Deploy checkpoint — Cycles 2-5 → Cloudflare (2026-06-14)
Commits e27ee529 (C2 pools tooltip), 003e33ba (C3 tenant money typography), 5559bfc2
(C4 tenant dispute dates), ec4a2b01 (C5 app-wide date sweep) deployed via
`cd frontend && npm run deploy:cf`. Verified per CLAUDE.md: `wrangler deployments status
--name capveri-app` shows Version cd5fa064-b962-467b-aadd-e73f7c4e70e6 at 100%; `curl -I
https://app.capveri.com/` → 200 OK. Settings surfaces (Profile/Team/Billing — px-33..35)
visually audited this checkpoint: all polished (Type-DELETE destructive confirm, role pills,
consistently-formatted dates, usage progress bars, plain-language plan copy) — no defects.

NEXT: Onboarding flow, Analysis/Trends + YoY, landlord Disputes, Admin, Documents/Extractions,
Tax-Protest, focus-ring audit, mobile responsive spot-checks on the surfaces touched.

### Cycle 6 — Trends "Export PNG" disabled-without-reason (CONFIRMED + fixed) (2026-06-14)
Same getting-stuck class as Cycle 2 (pools). On /analysis/trends the "Export PNG" button is
`disabled` while no chart is loaded (chartData.length === 0) with DOM probe `disabled:true,
title:null, ariaLabel:null` — no hover/focus reason. (/onboarding wasn't auditable on the
e2e-test account — it has an active sub so the route guard redirects to billing?intent=
select-plan; expected.) Applied the established pattern: when disabled, render the button
inside a focusable `<span tabIndex={0}>` wrapped in a Radix Tooltip — "Select a property to
load the chart before exporting." Verified live (px-38-trends-export-tooltip.png — tooltip
paints on hover). TrendAnalysisPage.test.tsx needed a TooltipProvider in renderWithProviders
(same gap as the pools test) — added; 16/16 pass. typecheck clean. Rest of Trends page is
polished (filter row, empty-state guidance, plain-language AI/source disclaimer).

NEXT: YoY page Export (likely same pattern — check), landlord Disputes, Admin, Documents/
Extractions, Tax-Protest, focus-ring audit. Then deploy Cycle 6 with the next batch.

### Cycle 6 — systematic disabled-without-reason sweep (class exhausted) (2026-06-14)
Ran an app-wide Explore sweep for the disabled-button-no-explanation class (the highest-value
80-yo-clarity defect). Result: the class is effectively EXHAUSTED. 6 raw candidates, all
resolved without new fixes after judgment:
- ReportGenerationButton.tsx:131 (years<2): only referenced by its own test — NOT rendered in
  any page (unused/unreachable). Not a live defect. [candidate for dead-code removal, out of
  scope here]
- LandlordDisputeDetailPage "Generate & Download" (empty landlordName), StatusUpdateForm
  "Update Status" (!selectedStatus), RejectDialog "Confirm Rejection" (!reason): all are
  form-submit buttons directly below their labeled required field/select — conventional
  fill-the-form-to-submit pattern, self-explanatory (same judgment as YoY "Compare"). OK.
- BatchPDFExport "Export N Tenant(s)" (selectedTenants===0): the label is dynamic
  ("Export 0 Tenants") and sits beneath a visible tenant checklist — the count + adjacent
  list ARE the context. OK.
- Feedback.tsx "Next" (feedback.length<20): standard last-page pagination disable. OK.
The two genuine standalone-action dead-ends (pools Copy, trends Export PNG) were the real
instances and are fixed (C2, C6). Confidence this class is clean is now high.

NEXT: deploy Cycle 6 to Cloudflare + live-verify; then landlord Disputes/Admin/Documents/
Extractions/Tax-Protest visual taste pass + focus-ring audit.

---

### Cycle 7 — Analysis-area visual audit + disabled Compare/Run-comparison tooltips (F-446) (2026-06-14)
Resumed the landlord-surface visual taste pass and audited the remaining un-reviewed routes.
Clean (no defects found):
- Certificates (px-39-certs): friendly paused-state copy, accessible empty card. OK.
- Document Extractions (px-40): well-formed table, canonical "Jun 9, 2026 10:10 AM" dates,
  confidence with helpful "(3 low)" annotation, pill Review buttons. OK.
- VerificationPage (px-41): local PDF-load failure is a test-data artifact (no PDF bytes in
  local storage); page degrades gracefully ("We couldn't load the PDF / Try again"). Note the
  exemplary "Approve & Commit" disabled-WITH-helper-text, per-field "Looks right?", and
  "Not extracted → add one if you have it" affordances. OK.
- Admin/Feedback (px-42): stat cards, filters, graceful "No feedback found", pill pagination. OK.
- 404 page (px-43, from a wrong-URL guess): exemplary — clear heading, two recovery actions,
  Quick Links, Contact Support. OK.

FIX (F-446): Year-over-Year "Compare" and Compare-systems "Run comparison" primary buttons sat
DISABLED with no hover explanation — the same disabled-without-reason class fixed on Trends/Pools
(C2/C6), but these two had been missed because they're on Analysis sub-routes. Each disabled
state now wraps in a focusable span + Radix Tooltip (pointer-events-none Button) naming the gap:
  - YoY: "Select a property first, then pick 2-4 years to compare." / "Pick at least 2 years…"
  - Compare: "Select a property first." / "Choose a start and end date (start before end)…"
Tests: added TooltipProvider to both wrappers; Compare run-button enable assertion re-queries the
(re-rendered, no-longer-wrapped) node. 35/35 analysis+compare tests pass; tsc clean.
Commit 6086d94e (incl. feature-inventory calculation-engine.md + INDEX.md), pushed, deployed to
Cloudflare (version e8896c1f @ 100%, app.capveri.com 200). The disabled-button class is now
exhaustively swept across the entire landlord app (pools, trends, YoY, compare).

NEXT: focus-ring / keyboard-tab audit; mobile/responsive spot-checks on the audited routes;
Portfolio/pipeline + reconciliation Columns/More-menu modal taste pass.

---

### Cycle 8 — date-rendering consistency sweep (class exhausted) (2026-06-14)
Grepped every `toLocaleDateString`/`toLocaleString`/`toDateString` in frontend/src.
Triage:
- Number/money `toLocaleString` hits (counts, currency) — out of scope for date consistency
  (money precision is the separate F-430 class, already swept).
- Date renders that pin `'en-US'` — already ordering-consistent. The bare-calendar-date risk
  (UTC-parse day-shift) only bites date-only fields; spot-checked the highest-risk ones:
  - ReconciliationsTab period formatter (lines 109/114): already uses a local parseDate building
    `new Date(y,m,d)` in local time — timezone-safe. OK.
  - SB1103RequestsTab:77 already routes through parseLocalDate. OK.
  - created_at/updated_at renders (PropertyOverviewTab/PropertyCard/PropertyListPage/ImportsTab/
    ExportHistory/TeamMembers/dispute lists): true timestamps — the canon (lib/utils
    formatCalendarDate docstring) explicitly says keep tz-aware `new Date(...)` for these. OK.
- ONE genuine defect: GLAnalysisPanel.tsx:58 rendered "Analysis run …" via a bare
  `toLocaleString()` with NO locale — the only app date render that left field ordering to the
  browser locale (M/D/Y vs D/M/Y) and showed noisy seconds. Fixed: pinned 'en-US' + clean
  "Jun 14, 2026, 5:40 PM" (no seconds); ran_at stays tz-aware (true timestamp). tsc clean; no
  test asserts the format. Commit 856a0085.

Also this cycle: mobile-responsive spot-check at 375px on dashboard/compare/reconciliations/yoy
= ZERO horizontal overflow on all four; mobile layout (hamburger nav, stacked full-width fields,
segmented pill toggle, bottom tab bar) is clean. The F-446 disabled-button tooltips were verified
keyboard-accessible (show on focus, not just hover) via the focusable span wrapper.

NEXT: deploy Cycle 8; reconciliation grid Columns/More-menu modal taste pass; Portfolio/pipeline
page; focus-ring VISIBILITY audit (do focused controls actually render a visible ring).

---

### Cycle 9 — focus-ring visibility audit (7 fixes) (2026-06-14)
Dispatched an Explore agent over every tabIndex/role="button"/focusable surface in frontend/src
to find controls that are keyboard-focusable but render NO visible focus ring. Confirmed each of 7
by reading the cited code, then applied the canonical focus-visible ring:
- Cards/banners: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2` — FormatCard, PropertyCard, NotFound quick-link cards,
  pool TemplateSelector card. DashboardPage draft-recovery banner uses `ring-primary` to match
  its themed surface.
- Table/grid rows (offset would clip inside scroll container): `…ring-inset` instead of offset —
  DataTable TableRow (tabIndex=0) and ReconciliationGrid virtualized row (tabIndex=0).
Verified: tsc clean (TSEXIT 0); component suites green — FormatCard/PropertyCard/NotFound/DataTable
(122 passed) + TemplateSelector/ReconciliationGrid/DashboardPage (62 passed). Commit 4d33b8c1
(drift gate passed, 7 files, +7/-6).

NEXT: deploy Cycle 9; reconciliation grid Columns/More-menu modal taste pass; Portfolio/pipeline
page; PoolCopyDialog open state.

---

### Cycle 10 — Portfolio money typography + PoolCopyDialog safety/affordance (2026-06-14)
Live-audit agent (fell back to source review; browser was locked) over three unaudited
surfaces: Portfolio/Pipeline pages, reconciliation Columns/More menus, PoolCopyDialog.
Triaged its findings; shipped the real defects, skipped over-reach:
- Portfolio money typography (P1): MetricCard values + property-breakdown money cells on
  PortfolioPage, and campaign recovery cells (mobile card + desktop table) on
  PortfolioPipelinePage, used `tabular-nums` only — inconsistent with the page's own NOI panel
  (`font-mono tabular-nums`). Added font-mono to all money renders (left the X/Y tenant count
  and % cells alone — not money). Commit 8fd236f4.
- PortfolioPage empty state (P2): hand-rolled dashed box with a bare `<a href="/reconciliations">`
  (full page reload, loses SPA state). Replaced with the shared EmptyState component + router
  navigate, matching PipelinePage.
- PoolCopyDialog "Replace" mode (P2, destructive-safety): "Replace (delete existing pools)" had
  no danger signal. Added an AlertTriangle + warning tint (when selected) so a property's pools
  aren't wiped by accident.
- PoolCopyDialog disabled "Copy Pools" button (P1): now explains via tooltip why it's disabled
  (no source / no target / same property) via the focusable-span pattern; added TooltipProvider
  to the test wrapper.
- SKIPPED the agent's "dead success alert" P3 — 4 tests assert it and it's not actually dead
  (parent owns `open`; the alert is the fallback if the parent keeps the dialog open). Also
  skipped the menu aria-label nitpicks (triggers already have visible text names).
Verified: tsc clean (TSEXIT 0); PoolCopyDialog 22 passed, Portfolio 29 passed. Pre-commit
prettier/eslint/build/drift all passed.

NEXT: deploy Cycle 10; reconciliation grid Columns menu disabled-checkbox "why" hint (P3 from
this audit) if it recurs as a class; ColumnConfigMenu min-columns affordance; continue surface
sweep (settings, team, billing screens).

---

### Cycle 11 — settings/billing defect-class sweep (2026-06-14)
Explore agent did a thorough source audit of settings/team/billing surfaces against the 7
established defect classes. Confirmed + shipped (editor agent applied; orchestrator verified
tsc 0 + 159 settings/billing tests pass):
- Money typography (class 1, P1): added `font-mono tabular-nums` to every currency render that
  lacked it — Invoices.tsx (desktop table cell + mobile card), InvoiceSummary total-paid,
  PlanComparison launch + strikethrough prices, CheckoutDialog pricing summary + "Due today",
  FreeAuditUpgradeModal potential-recovery.
- Focus rings (class 6, P1): CheckoutDialog had two raw `<input type=number>` (Rentable units,
  Buildings) bypassing the design system → no focus ring. Replaced with Shadcn `<Input>`.
- Disabled affordance (class 2, P1): PlanComparison current-plan button now has
  `title="You are already on this plan"`.
- Empty states (class 5, P1): replaced 3 hand-rolled empties with shared EmptyState
  (Invoices "No invoices"; TeamMembers "No members yet" + "No pending invitations"); updated
  Invoices.test.tsx to assert EmptyState output (it renders an h3 title).
Agent confirmed ZERO violations on OrganizationPage, ProfilePage (delete-account is typed-confirm
gated), CancelSubscriptionWizard (AlertTriangle confirm step), ConfirmPlanDialog, BillingWarningBanner.
Commit 53a9cb56.

NEXT: deploy Cycle 11; extend money-typography sweep to any remaining surfaces (extractions,
leases, disputes, reconciliation summary cards) — class 1 keeps surfacing, so a repo-wide
formatCurrency/formatMoney call-site grep for missing font-mono is worth one focused pass.

---

### Cycle 12 — repo-wide money-typography sweep (class 1 exhausted) (2026-06-14)
Grepped all 37 formatCurrency/formatMoney/formatUSD/formatCurrencyCompact/formatLaunchOfferPrice
call-site files; Explore agent audited the 22 in-app financial-surface files for currency renders
missing `font-mono tabular-nums`. Found 42 violations (most had `tabular-nums` but were missing
`font-mono`). Editor agent applied all fixes; orchestrator verified tsc 0 + full suite 1229 passed.
Surfaces fixed: CapBankLedger + CapBankLedgerTable (8 spans), TenantSummary (4), GroupHeader,
CalculationStepCard, CalculationTraceDrawer, FinalizeModal (wrapped), VarianceReport (3),
VarianceTable (mobile+desktop, 6), TenantVarianceTable (6 td), ReconciliationStatusCard,
WelcomeCard (hero h2 + finalized total), ComparePage saved-runs td, EditInterface (wrapped),
ReconciliationsListPage (summary CardTitle + mobile span + desktop TableCell).
Confirmed already-compliant (untouched): CellRenderers (the core grid CurrencyCell/DifferenceCell),
NOIImpactPanel, GLEntryPreview, ReconciliationsTab, TenantDashboard, ReconciliationHeader,
ComparisonSummary, TrendChart (SVG/recharts — N/A). 3 tests updated where a wrapping span split a
text node (assert the value string directly). Commit 1adb2fc9.
EXCLUDED by design: marketing/landing/tools/pricing pages (PricingTeaser, ROICalculator, Pricing,
Checkout, Boma2024Calculator, CamLeakageEstimator, HcadTaxNormalizer) — different display context,
large hero prices, and marketing copy has its own gates.

NEXT: deploy Cycle 12. Class 1 (money typography) is now exhausted across in-app surfaces.
Candidate next classes: loading/skeleton consistency, error-state copy clarity, modal close/escape
affordances, toast usage consistency for mutations.

---

## Cycle 13 — Mutation-feedback consistency (success toasts)

Class: mutation feedback. Explore agent (sonnet) audited every production-wired mutation for
success/error confirmation. Result: NO P1 defects — every production mutation already surfaces
error feedback (toast.error or inline Alert). Found 4 P2 gaps where a mutation succeeds but gives
no success confirmation. All 4 fixed (sonner `toast.success`, matching sibling style):
- PoolCopyDialog.tsx (handleCopy onSuccess): `Copied N pool(s) successfully` — kept the inline
  success Alert as a fallback (dialog closes on success, so the toast is the real confirmation).
- ExportPanel.tsx (BatchTab batchMutation onSuccess): `Exported N tenant(s)`.
- UnitsTab.tsx (updateMutation onSuccess): `Unit updated` (was optimistic-only, error path already
  had toast.error).
- GLAnalysisPanel.tsx (handleRun): `GL analysis complete` via inline mutate onSuccess option.
Verified independently: tsc 0; 86 component tests across the 3 files with tests passed
(GLAnalysisPanel has no test file). Commit pending.

DEFERRED (P3, not acted on): usePoolTemplates.ts (create/update/delete/apply) and useWarranty.ts
(useCreateCertificate/useAttestData/useIssueCertificate) lack toasts but are NOT wired to any
production component — adding feedback to unused hooks is speculative. Revisit if/when UI-wired.

NEXT: deploy Cycle 13. Candidate next classes: loading/skeleton consistency, error-state copy
clarity, modal close/escape affordances.

---

## Cycle 14 — Loading-state consistency (skeletons match content shape)

Class: loading/skeleton consistency. Explore agent (sonnet) audited every async surface for whether
the loading affordance exists and its SHAPE matches the loaded content. Dashboard, property list,
portfolio (both), reconciliation grid, extractions, invoices, property detail already canonical —
untouched. Found + fixed 7 defects (P1/P2); 2 P3 height-tuning items deferred (subjective, low value):
- PoolsPage (P1): read no `isLoading` — flashed "0 Properties Available" + "No properties" empty
  state during load. Added isPropertiesLoading guard → SkeletonCard for StatCard + a Card/SkeletonCard
  for the body. No false-empty flash.
- TaxProtestPage (P1/P2): tiny inline Loader2 "Loading deadlines…" where a 6-col deadline table
  loads → DataTableSkeleton columnCount=6 rowCount=4.
- TeamMembersPage (P2): card skeletons for two Tables → DataTableSkeleton in matching Card shells
  (4×4 members, 4×3 invitations).
- LeaseDetailPage (P2): tab-panel body blank during load → added Skeleton tab-bar + SkeletonCard body.
- ReconciliationsListPage (P2): hand-rolled h-16 pulse bars → DataTableSkeleton columnCount=5 rowCount=5
  (consistent with rest of app).
- IngestionPage (P2): bare "Loading Preview..." button text → added Loader2 spinner (both branches).
- OrganizationPage (P2): single SkeletonCard for 3 distinct loaded cards → three stacked SkeletonCards.
Verified independently: tsc 0; 143 tests across the 7 touched page dirs passed; no test changes needed.

DEFERRED (P3): TrendAnalysisPage cascading-selector placeholder parity vs YearOverYearPage;
Billing.tsx bare-Skeleton height underestimates loaded cards. Both minor/subjective.

NEXT: deploy Cycle 14. Candidate next classes: error-state copy clarity, modal close/escape
affordances, empty-state consistency sweep.

---

## Cycle 15 — Error-state copy clarity (no raw leaks, no dead ends)

Class: error-state copy. Explore agent (sonnet) audited every user-visible error surface. Most were
already strong (PoolsPage gold standard echoed in IngestionPage history, LeaseUploadPage, TaxProtest,
PortfolioPipeline). Found + fixed 8 defects where raw `error.message` / API `body.detail` leaked to
the screen or a primary load error was a dead end. Replacement copy passed humanizer + third-grade
gates before applying (calm, plain, ≤14-word sentences, no jargon, no em dashes, reassures data is safe):
- PropertyDetailPage: full-page load error leaked `error.message` + no recovery → vetted copy + Try
  again (refetch) + Back to properties; delete toast de-leaked.
- LeaseDetailPage: same load-error + delete-toast fixes (Try again calls refetch).
- ReconciliationPage: AlertDescription rendered `error?.message` → vetted static copy; kept Back button.
- LeaseFormPage: 3 mutation toasts (create/update/recovery) de-leaked.
- PropertyFormPage: 2 mutation toasts (create/update) de-leaked.
- IngestionPage: `extractDetail` forwarded API `body.detail` to toasts → removed; static copy, detail
  now console.error-only.
- ReconciliationsListPage: vague `<AlertTitle>Error</AlertTitle>` → "Couldn't load reconciliations" +
  reassuring description; kept Retry.
- ExtractionsPage: start-extraction toast de-leaked.
Raw error values now go to console.error only. Verified independently: tsc 0; 427 tests across the 5
touched page dirs passed; 9 test assertions updated to the new copy (copy is source of truth), each
logged in the agent report. Grep confirms no `error.message`/`body.detail` reaches a user-visible
string (the 2 remaining body.detail refs are console.error).

DEFERRED (P3, internal/admin or borderline): LandlordDisputeDetailPage raw `err.message` (admin-facing);
ComparePage / FinalizeButton `|| 'fallback'` inversion (only leaks when message non-empty, low risk);
ResetPasswordPage Supabase message (auth errors are typically user-friendly).

NEXT: deploy Cycle 15. Candidate next classes: modal close/escape affordances, empty-state consistency,
destructive-action confirm coverage.

---

## Cycle 16 — Destructive-action confirmation coverage (2026-06-14)

Audit (Explore/sonnet) found the confirmation posture is STRONG: every primary entity delete
(property, lease, unit, expense pool, team member, invitation, term version, Google unlink, import
batch, export, subscription cancel) is already gated by an AlertDialog with "cannot be undone" copy.

FIXED:
- P1 — PoolCopyDialog "Replace" mode: selecting Replace + clicking "Copy Pools" ran the mutation
  immediately, permanently deleting ALL existing pools at the target with only a passive amber label
  to warn. Added a second AlertDialog confirmation gate ("Replace all pools?" / destructive-styled
  "Replace pools" action). Merge mode is unaffected. New copy passed humanizer + third-grade
  (evaluate_copy PASS; 3 sentences, 7.7 avg words).
- P2 — ImportHistoryList delete + LinkedAccounts unlink AlertDialogAction buttons lacked destructive
  styling (looked like default/primary). Added bg-destructive text-destructive-foreground
  hover:bg-destructive/90 so the dangerous action reads as dangerous.
- P3 — ExportHistory delete button had bg-destructive but missing hover:bg-destructive/90; added it.

Verified: tsc 0; PoolCopyDialog suite 23 passed (added a test asserting replace mode does NOT mutate
until the confirm dialog is accepted); LinkedAccounts suite green. No raw error leaks introduced.

---

## Cycle 17 — Modal dismissal affordances (2026-06-14)

Audit (Explore/sonnet) confirmed dismissal posture is STRONG: every overlay is built on Radix-backed
shadcn primitives (Dialog/Sheet/AlertDialog), no hand-rolled fixed-overlay modals exist, Escape +
backdrop work everywhere by default, and no callsite suppresses them incorrectly. Two real classes found
(one agent finding — a duplicate close button on the EXPORT PDF modal — was a false positive; only the
reconciliation PDF modal has the custom button).

FIXED:
- Duplicate close affordance — reconciliation PDFPreviewModal renders a custom toolbar X (next to
  Download) AND the shadcn built-in X floated at right-4 top-4 on top of it. Added showCloseButton={false}
  so only the toolbar-integrated X remains.
- Loss-of-work on accidental dismiss — three form overlays silently discarded typed input on a backdrop
  click or Escape: RejectDialog (reason + notes), GenerateDemandLetter dialog (landlord contact block),
  and DemandLetterPanel sheet (tenant selection + 6 landlord fields). Each now guards onInteractOutside +
  onEscapeKeyDown: dismissal is blocked ONLY while the form is dirty (and not submitting); an untouched
  form stays freely dismissible, and the X / Cancel button always closes.

Verified: tsc 0; affected suites green (93 prior + 2 new RejectDialog guard tests). SheetContent/
DialogContent confirmed to forward the Radix handlers.

## Cycle 18 — Empty-state consistency (canonical EmptyState rollout)

**Posture:** Solid coverage on high-traffic surfaces, but a persistent cluster of ad-hoc inline empty blocks (hand-rolled `<div>` + icon + `<p>`) that drift from the canonical `components/EmptyState.tsx` in spacing, icon treatment, and copy tone.

**Fixed (P1):**
- `features/tenant-portal/pages/TenantDashboard.tsx` — replaced both inline empty blocks (Your Leases, CAM Reconciliation Statements) with `<EmptyState size="sm">`. Tenant-facing reassurance copy ("Ask your property manager to connect it." / "Your landlord sends CAM statements here when they are ready. There is nothing for you to do now.") validated via third-grade-copy (PASS).

**Fixed (consistency):**
- `components/properties/LeasesTab.tsx` — swapped hand-rolled empty block to canonical `<EmptyStateNoLeases onAction={handleAddLease} />`; dropped now-unused FileText import.
- `components/properties/UnitsTab.tsx` — swapped to `<EmptyState icon={Building2} ... action={Add Unit} />`, kept UnitFormModal sibling.
- `components/properties/ExpensePoolsTab.tsx` — swapped to `<EmptyState icon={Layers} ... action={Add Pool} />`, kept ExpensePoolFormModal sibling. Educational descriptions explain why units/pools matter (sqft → CAM share; cost grouping → tenant share).

**Tests:** updated LeasesTab/ExpensePoolsTab/TenantDashboard empty-state assertions to the new copy + role-based button selectors. typecheck clean; 89 tests across the four impacted files pass.

## Cycle 19 — Empty-state consistency, batch 2 (admin/tax/filter surfaces)

Continued the canonical EmptyState rollout from Cycle 18, targeting the verified offender cluster (Explore audit).

**Migrated to canonical EmptyState:**
- `pages/admin/Feedback.tsx` — both mobile + desktop "No feedback found" inline blocks → `<EmptyState icon={Inbox} size="sm">`; copy tightened to "No feedback yet" / "Feedback from users shows up here." (third-grade-copy PASS, FK 1.9).
- `pages/tax-protest/TaxProtestPage.tsx` — dashed-border inline block → `<EmptyState icon={Landmark} data-testid="deadlines-empty">`; copy "No properties yet" / "Add a property to see tax protest deadlines here." (PASS, FK 5.4). testid preserved.
- `components/ingestion/ImportHistoryList.tsx` — filter-returned-nothing branch (Branch B) → `<EmptyState icon={FilterX} size="sm">` with a "Clear filters" action; kept the exact "No imports match the selected filter." description so the regression test holds. Branch A (no-imports) intentionally left as-is — it embeds the onboarding VideoCard.

**Copy fix:**
- `pages/settings/TeamMembersPage.tsx` — tautological members empty-state description ("No current members found." restated the title) → "Invite a teammate to add them here." (PASS, FK 1.7).

**Tests:** updated Feedback assertion to new copy; TaxProtest (testid-based) and ImportHistoryList (description-based) assertions unchanged and green. typecheck clean; 59 tests across the four impacted files pass.

**Deferred (next cycles):** ~18 additional inline `text-muted-foreground/50` empty blocks across analysis/pools/disputes/reconciliation/export surfaces (AnomalyList, TemplateSelector, PoolPreview, CommentThread, SplitAllocationEditor, TrendAnalysisPage x4, ExportPanel, DemandLetterPanel, VarianceTable, TenantSelector, CapBankLedger, CalculationTraceDrawer, RecentActivityCard, TermVersionTimeline, HelpCenter, TenantDisputesPage). SB1103RequestsTab uses DataTable emptyMessage (its own canonical pattern) — left as-is. YearOverYearPage inline link-sentence too small to convert cleanly.

## Cycle 20 — Empty-state consistency, batch 3 (analysis/disputes/dashboard/pools/leases)

Continued the EmptyState rollout across the deferred inline-block cluster.

**Migrated to canonical EmptyState (all size="sm"):**
- `features/analysis/components/AnomalyList.tsx` — ShieldCheck; copy de-jargoned to "Nothing unusual found" / "All expense patterns look normal." (avoids "anomalies" for the 80-yo reader; PASS).
- `features/disputes/components/CommentThread.tsx` — MessageSquare; "No comments yet" / "Comments on this dispute show up here." (PASS).
- `components/dashboard/RecentActivityCard.tsx` — Clock; "No recent activity" / "Your latest actions show up here." (PASS).
- `features/reconciliation/components/CalculationTraceDrawer.tsx` — Calculator; "No steps yet" + retained "No calculation steps available." description (domain term kept; test holds).
- `components/leases/TermVersionTimeline.tsx` — Clock; "No versions yet" / "Lease term changes show up here." `data-testid="no-versions"` preserved.
- `features/pools/components/PoolPreview.tsx` — Layers; "No pools yet" + retained "No pools defined." description.

**Tests:** updated AnomalyList + TermVersionTimeline assertions to new copy; RecentActivityCard/CalculationTraceDrawer/PoolPreview/CommentThread held (testid- or retained-string-based). typecheck clean; 53 tests across the six impacted files pass.

**Remaining deferred:** TemplateSelector, SplitAllocationEditor, TrendAnalysisPage (x4 branches), ExportPanel, DemandLetterPanel (no-tenants list), VarianceTable (x2), TenantSelector, CapBankLedger, HelpCenter (search-empty), TenantDisputesPage.

## Cycle 21 — EmptyState rollout: export/pools/reconciliation/help
Migrated 8 more hand-rolled inline empty blocks to the canonical `EmptyState`/`EmptyStateNoSearchResults` for visual + copy consistency.
- `features/pools/components/TemplateSelector.tsx` — Layers, "No templates yet" / "No pool templates available." (className forwarded).
- `components/expense-pools/SplitAllocationEditor.tsx` — GitFork, "No splits yet" / "Add allocations to split expenses across pools." (tightened the old two-line copy; test updated).
- `features/reconciliation/components/ExportPanel.tsx` (HistoryTab) — FileDown, "No exports yet" / "Your exported files show up here." (de-duplicated title==description).
- `features/reconciliation/components/DemandLetterPanel.tsx` — Users, "No eligible tenants" / "No tenants with outstanding recovery amounts."
- `features/export/components/TenantSelector.tsx` — Users, "No tenants" / "No tenants available for export." (test period added).
- `features/reconciliation/components/CapBankLedger.tsx` — TrendingUp, "No cap history yet" / "No finalized reconciliation periods with cumulative caps yet."
- `features/export/components/VarianceTable.tsx` — BarChart2, BOTH branches: filter → "Nothing above threshold" / dynamic `${threshold}%`; no-data → "No variance data" / "No variance data available".
- `pages/resources/HelpCenter.tsx` — search-empty now uses `EmptyStateNoSearchResults` preset (query-aware copy); test asserts "No results found".
Verify: typecheck clean; impacted vitest 101 passed across 5 files (+ ExportHistory/Variance untouched). Domain terms (reconciliation/cumulative/allocations/variance) retained as established in-app vocabulary.

## Cycle 22 — EmptyState rollout: trend analysis + tenant disputes
Migrated the final genuine inline empty blocks to canonical `EmptyState`.
- `pages/analysis/TrendAnalysisPage.tsx` — 3 data-empty branches: "No snapshots found" / "No expense data" / "No category data" (each keeps its exact prior sentence as description; TrendingUp icon retained). Intentionally LEFT the "Select a property to view expense trends" pre-selection placeholder inline — it is a prompt, not an empty state.
- `features/tenant-portal/pages/TenantDisputesPage.tsx` — MessageSquare, "No disputes yet" / "To start one, open a statement from your dashboard." with an outline action "Go to dashboard" → navigate('/tenant/dashboard') (preserved the old button's behavior).
Verify: typecheck clean; 31 passed across TrendAnalysisPage + TenantDisputesPage tests; no test copy churn (retained strings / case-insensitive regex still match). This exhausts the verified inline-empty-block inventory; remaining non-migrations are intentional (DataTable emptyMessage pattern, access gates, onboarding VideoCard blocks, pre-selection placeholders).

## Cycle 23 — Money typography canon (font-mono + tabular-nums)
New theme (empty-state theme exhausted). Audit found money displays rendering in the default proportional font, so digits shifted width and looked inconsistent vs the polished tables. Applied the canon (`font-mono tabular-nums`) to every offender — class-only changes (no wording, no number-format changes); two paywall/CTA strings had the dollar value extracted into a `<span>` with identical surrounding words.
- `components/dashboard/LeakageSummaryCard.tsx` — all 6 dollar spans/paragraphs (over/under-billing leakage + capveri_calculated + actual_billed).
- `features/plg/steps/ResultsStep.tsx` — added missing `font-mono` (already had tabular-nums).
- `features/onboarding/steps/ActualBilledUploadStep.tsx` — totalBilled span.
- `components/landing/PricingTeaser.tsx` — price + strikethrough price.
- `features/reconciliation/components/DenominatorChangePanel.tsx` — recovery_delta td.
- `features/onboarding/steps/CompletionStep.tsx` + `features/onboarding/components/OnboardingResultsPaywall.tsx` — extracted the `$amount` from template-literal copy into a mono/tabular `<span>`, wording unchanged.
Also folded in the JOB-1 review polish: `pages/analysis/TrendAnalysisPage.tsx` EmptyState retitled "No data for this category" / "Pick a different expense category from the dropdown above." (was near-tautological + missing period).
Verify: typecheck clean; 65 passed across 8 impacted test files; no test churn. Excluded non-money counts (WelcomeCard, ImportErrorDisplay) and the DemandLetterPanel `<option>` (CSS can't style it).

## Cycle 24 — Close the money-typography theme (exhaustive sweep)
Thorough whole-frontend audit found the remaining money displays missing the canon. Fixed all 13 files (class-only, no wording/format changes):
- Tool/analysis pages (had tabular-nums, added font-mono): Boma2024Calculator (2), HcadTaxNormalizer (5), CamLeakageEstimator (2), TrendAnalysisPage Period Change + Annual Average (percent line left alone).
- Added both classes: LeakageResultStep (3 spans), landing ROICalculator (3), ValuePropositionSection metric, HeroSection mock card, SampleReport ($312,450 + finding.impact span), Pricing list+launch price, Checkout price block + $0.00 due.
- Shared component done right: `components/ui/stat-card.tsx` gained an opt-in `mono?: boolean` prop (cn-gated → font-mono tabular-nums); `ComparisonSummary` sets `mono` on the 3 money cards (Net difference / Overcharged / Undercharged), NOT the Match count card. Non-money StatCard callers (sqft/dates/counts) untouched.
Verify: typecheck clean; 150 passed across 13 impacted test files; zero test churn (all amounts were already standalone elements). Money-typography theme is now fully closed app-wide.

## Cycle 25 — button-pill compliance audit (verified CLEAN, no change)
Audited all buttons/CTAs in frontend/src for non-pill geometry. Baseline: canonical `<Button>` (components/ui/button.tsx) uses `rounded-button` → tailwind `borderRadius.button` → `var(--radius-button)` → `--radius-button: 9999px` in generated/tokens.css = true pill. All real `<Button>` usages compliant; zero flat-radius overrides on actual buttons found. The grep "offenders" (NotificationList rows, DisputesListPage rows, CompletionStep nav cards, VideoThumbnail, ExportGuide/ImportErrorDisplay accordion toggles, BoundingBoxOverlay) are large card/row/overlay surfaces, NOT pill CTAs — `rounded-full` on a full-width card is a taste regression, so deliberately NOT changed. Button-pill theme is CLEAN. No commit (audit only).

## Cycle 26 — canonical ErrorState component + first migration wave
Audit found 35 inline, hand-rolled error+retry blocks across the app with NO canonical component (only FriendlyError for help, ErrorBoundary for render crashes). Heavy divergence: copy ("Failed to load X" / "...Try refreshing." / "...Please try again." / "Something went wrong"), retry label ("Try again" vs "Retry"), icon presence, raw error.message leaking technical noise to users.
- NEW components/ErrorState.tsx (mirrors EmptyState API: icon default AlertCircle, title, optional description, action {onClick, label default "Try again", icon default RefreshCw, variant default outline}, size sm/md/lg, role="alert"). `offline` prop swaps in connection-lost copy ("Can't reach the server" / "Check your connection and try again.") for React Query isPaused branches. + ErrorState.test.tsx (6 tests).
- Migrated 8 call sites: properties tabs (Units/Leases/Imports/Reconciliations/ExpensePools) → `<ErrorState size="sm" title="Couldn't load X" action={{onClick: refetch}}/>`, dropping the raw error.message fallback for clean canonical copy; tenant-portal NotificationList/EmailPreferences/TenantDisputesPage → offline-aware ErrorState preserving each file's existing isPaused condition.
- Updated 7 test assertions from old "Failed to load"/raw-error-message copy to "Couldn't load X". typecheck clean; 340 impacted tests pass.
- ~27 inline error blocks remain (warranty, reconciliation panels, settings pages, portfolio, dashboard raw <button>, etc.) for follow-up migration cycles.

## Cycle 27 — ErrorState migration wave 2 (settings + portfolio + admin + dashboard)
Migrated 8 more inline error blocks to the canonical `<ErrorState>`, standardizing the retry label to "Try again" (these had a "Retry"/"Try again" split) and replacing raw error.message leakage with clean reassuring copy:
- settings: TeamMembersPage ("Couldn't load your team"), OrganizationPage ("Couldn't load your organization" + "This might be a temporary problem."), Billing ("Couldn't load billing", dropped bespoke AlertTriangle sizing), Invoices ("Couldn't load invoices", size sm).
- portfolio: PortfolioPage ("Couldn't load your portfolio"), PortfolioPipelinePage ("Couldn't load campaigns") — also removed now-dead Alert/AlertCircle imports.
- admin: Feedback.tsx both blocks (card + table-cell, preserving TableRow/TableCell wrapper).
- DashboardPage: replaced the ONLY raw `<button>` error block in the codebase with ErrorState.
Updated 5 test files' old-copy/label assertions. Full typecheck clean (exit 0); 172 impacted tests pass. ~19 inline error blocks remain (warranty, reconciliation panels, disputes pages, lease/property detail pages, extractions, tax-protest, pools/export, stat-card micro, AddLeasesStep, TermVersionTimeline, SB1103RequestsTab, DenominatorChangePanel) for future waves.

## Cycle 28 — ErrorState migration wave 3 (recon/disputes/compliance/warranty/pools/export/onboarding/leases)

Migrated 12 more inline "failed to load + retry" blocks to the canonical `<ErrorState>`,
standardizing copy to "Couldn't load X" + default "Try again", dropping raw `error.message`
leakage, and removing the divergent MessageSquare/Alert error treatments.

Source (12): CapBankLedger, DisputesListPage, DisputeDetailPage (offline-aware), SB1103RequestsTab,
TaxProtestPage, ExtractionsPage (no-retry), WarrantyPage, WarrantyCertificateDetail, TemplateSelector,
VarianceReport, AddLeasesStep, TermVersionTimeline.
Tests updated (6): TermVersionTimeline, VarianceReport, TemplateSelector, WarrantyCertificateDetail,
ExtractionsPage, DisputeDetailPage — old copy/labels -> new canonical copy.

tsc clean (exit 0). 204 impacted tests pass (141 + 63 across the two batches).

Deferred (deliberate, need an ErrorState `secondaryAction` first): PropertyDetailPage, LeaseDetailPage
(two-action "Try again, or go back"); PropertyListPage (smart context-sensitive copy); stat-card micro
(no-button inline); DenominatorChangePanel (no-retry). These keep richer recovery UX than a flat
single-action ErrorState — a later cycle adds the API then migrates them.

## Cycle 29 — ErrorState `secondaryAction` + richer-recovery migrations (closes error-state theme)

Added an optional `secondaryAction` prop to ErrorState (ghost button beside the primary,
default label "Go back") so two-action recovery screens can migrate without flattening their UX.
Then migrated the deferred anxiety-sensitive sites, PRESERVING their calm reassurance copy:
- PropertyDetailPage: error -> "Couldn't load this property" / "Your data is safe. Try again, or
  go back to your property list." with Try again + "Back to properties"; not-found -> "Property not
  found" with the back action only.
- LeaseDetailPage: error -> "Couldn't load this lease" / "Your data is safe. Try again."; not-found
  -> "Lease not found". (Left the separate inline lease-PDF signed-URL error block untouched.)
- PropertyListPage: kept the smart error.message classification (connection / auth / server / raw)
  as the computed `description`; title -> "Couldn't load properties".
- DenominatorChangePanel: fetch-error -> "Couldn't load the report" / "Please try again." (retry
  re-runs the report mutation).
- stat-card (src/components/ui/stat-card.tsx): its `isError` micro-state renders "—" + "Couldn't
  load" caption inside a data card — a prop-driven inline micro-state, NOT a centered-ErrorState
  candidate. Left as-is (correct by design).

ErrorState now: 7 component tests. tsc clean (exit 0); migrated-site tests green.

Pre-existing unrelated failure flagged (not introduced here): PropertyDetailPage.test.tsx
"displays leases tab content with LeasesTab component" fails on master before these changes too
(confirmed by stashing) — spun out as a separate task.

Error-state-consistency theme is now EXHAUSTED: every inline "failed to load + retry" block in the
app routes through the canonical <ErrorState>. Next theme candidate: ad-hoc inline LOADING states
vs a canonical Skeleton/Spinner.

## Cycle 30 — loading-state consistency: page/section spinners -> canonical <Spinner>

New theme. Recon found canonical primitives already exist (Spinner role="status",
Skeleton/SkeletonCard, DataTableSkeleton) and skeletons already dominate full-page loads
(correct, left alone), but ~14 page/section loaders still hand-rolled raw
`<Loader2 className="animate-spin" />`. Migrated those to the accessible canonical `<Spinner>`,
mapping size/color to size+variant props:

WarrantyPage, WarrantyCertificateDetail, CapBankLedger, EmailPreferences, DisputeDetailPage,
LandlordDisputeDetailPage (dropped its redundant sr-only role=status — Spinner provides it),
VerificationPage, LeakageResultStep, ResultsStep, TeamSignupPage, TenantSignupPage, CheckoutSuccess,
Checkout, PDFViewer.

Loader2 import removed only where no longer referenced; KEPT where the file still has button-level
`isPending` spinners (DisputeDetailPage, VerificationPage, LeakageResultStep x7, TeamSignupPage,
Checkout). Button/inline isPending spinners deliberately OUT of scope for this cycle (Priority 2,
~35 files, future wave).

tsc clean (exit 0). 194 impacted tests pass (75 + 119); no test asserted the old Loader2 class.

## Cycle 31 — currency-format consolidation (whole-dollar + 2dp local redefinitions)

Theme: kill duplicate money formatters; route all display through the two float-safe canonicals in
src/lib/money.ts. Key precision insight: lib/money.ts `formatMoney` (string-aware, exact decimal parse,
F-430 float-safe) is the real money canonical — NOT lib/utils.ts `formatCurrency` (number-only). Did NOT
collapse reconciliation formatters onto the number-based one (would risk drift).

NEW canonical: `formatMoneyWhole(value, currency='usd')` added to src/lib/money.ts — thin {min:0,max:0}
wrapper for dashboards/estimates/summary tiles. 4 unit tests (round, string+number, negative, EUR).

Bucket B (whole-dollar) → formatMoneyWhole, byte-identical output, 7 files:
FreeAuditUpgradeModal, WelcomeCard (left propertyCount/pendingReconciliations toLocaleString counts),
HcadTaxNormalizer (6 sites), Boma2024Calculator, CamLeakageEstimator (4 sites), PortfolioPage
(formatCurrencyCompact→whole; left formatUSD 2dp alias), PortfolioPipelinePage.

Bucket A (2dp cents) → formatMoney, byte-identical, 6 files:
VarianceReport (3), VarianceTable (4), FinalizeModal (native negative handling, dropped manual abs/-),
ReconciliationsTab (null→$0.00 preserved via `?? 0`; string path now exact-parse not lossy parseFloat),
CancelSubscriptionWizard (2 inline Intl→formatMoney(amount, data.currency)), types/calculation-step.ts.

DEFERRED (precision-ambiguous, needs data-type confirmation — default .toLocaleString() keeps variable
decimals so a blind swap could drop/pad cents): LeakageSummaryCard 6× raw `${x.toLocaleString()}`,
ResultsStep 1×, config/launch-offer.ts formatLaunchOfferPrice (intentionally no $ symbol — leave).

tsc exit 0. 438 impacted tests pass (incl. money 21, CancelSubscriptionWizard 30, export suites). No test
asserted a changed value. Zero displayed-value regressions by construction (per-site output preserved).

## Cycle 32 — stop leaking raw error strings in user-facing toasts

Theme: mutation-failure toasts were interpolating raw `${error.message}` (stack traces, "Request
failed with status code 500", undefined) into the visible message. Routed all 18 leak sites through the
existing status-code-aware helper `getErrorMessage` (src/api/errors.ts → ApiError.getUserMessage()):
401/402/403/404/5xx/422 mapped to friendly copy, generic fallback otherwise.

Canonical pattern (tone preserved this cycle — no Failed-to→Couldn't sweep): keep the existing title,
move sanitized detail into sonner's `description` option:
  toast.error('Failed to create expense pool', { description: getErrorMessage(error) })

18 sites across 13 files:
properties: ExpensePoolFormModal(2), ExpensePoolsTab, LeasesTab, PoolAllocationsDialog(2),
PoolMappingsDialog(3), UnitFormModal(2), UnitsTab(2), SB1103RequestDialog, SB1103RequestsTab(2);
leases: TermVersionTimeline ('Failed to delete'→'Failed to delete the amendment'), LeaseDocumentUpload(2);
disputes: LandlordDisputeDetailPage(3, bare 'Failed'→'Something went wrong'), DemandLetterPanel;
comparison: ComparePage(2); settings: ProfilePage(2, Supabase auth → "Couldn't update/change..."),
TeamMembersPage (invite → "Couldn't send the invitation").

KEPT (actionable, not leaks): PoolAllocationsDialog field-validation toast; ExportPanel/NOIImpactPanel/
DisputeForm status-code (410/404/402/429) toasts. ~35 already-clean toasts untouched.

Test assertions updated to new title+description shape: LeasesTab.test, UnitsTab.test, ProfilePage.test(4),
SB1103RequestsTab.test(2). Also corrected a stale SB1103RequestsTab error-state assertion (Cycle 28 ErrorState
copy). tsc exit 0; 223 impacted tests pass (130 batch1 + 93 batch2). Full toast tone unification (115 sites,
Failed-to vs Couldn't vs Something-went-wrong) deferred as its own future cycle.

## Cycle 33 — EmptyState consistency (icon-less boxes → canonical)

**Theme:** Two hand-rolled "no data" boxes rendered as bare muted text with no
icon, diverging from the polished canonical `EmptyState` (gradient icon ring,
title/description hierarchy) used everywhere else.

**Migrated (2 sites):**
- `features/comparison/components/TenantVarianceTable.tsx` — no-tenants early
  return was `rounded-md border py-10 text-center text-sm text-muted-foreground`
  flat text → `<EmptyState icon={Users} title="No tenants to compare yet"
  description="There are no tenants to compare for this period yet." size="sm" />`
  inside the kept bordered wrapper. Test updated to assert split title + desc.
- `pages/reconciliation/components/ReconciliationMobileView.tsx` — search
  no-results block → `<EmptyStateNoSearchResults query onClear size="sm" />`.
  `onClear` passed only when `searchQuery` is set (preserves prior "clear button
  only when search has text" behavior). Dropped now-unused `Button` import.
  Test assertions for the title retargeted from `getByText(/No results found/i)`
  (now ambiguous — matches both EmptyState title AND description) to
  `getByRole('heading', { name: 'No results found' })`. Dual clear-button
  assertions verified intact (input clear keeps aria-label "Clear search";
  empty-state button matched only by role-name).

**Deliberately NOT migrated (would regress):**
- `components/dashboard/PropertyOverviewCard.tsx` — empty action is a real
  `<Link>` (anchor); its test asserts `getByRole('link', {name:/Add Property/i})`.
  EmptyState renders a `<button onClick>`, losing anchor semantics. Left as-is.
- `pages/reconciliation/ReconciliationsListPage.tsx` (3 states) — Card-wrapped,
  carry `data-testid="start-reconciliation-empty-button"` + `min-h-[44px]` touch
  target, and one embeds a `VideoCard`. Not a clean swap; deferred.
- `AlertsCard` / `ReconciliationStatusCard` — green-checkmark "all caught up"
  affirmations are SUCCESS states, not empty/no-data. Swapping to the generic
  FolderOpen-style EmptyState would degrade the positive cue. Intentionally kept.
- `YearOverYearPage` inline form-field hint — not a card empty state.

**Verify:** `npx tsc --noEmit` clean; 30/30 across the two affected test files.

## Cycle 34 — leakage dollar figures onto formatMoney canonical

**Theme:** The two leakage/recovery cards rendered headline dollar amounts as raw
`${value.toLocaleString()}` — no cents, no consistency with the app's `formatMoney`
canonical (which gives `$1,234.50`). `toLocaleString()` on an integer drops the
decimal entirely (`$34,200` vs the canonical `$34,200.00`), so the dashboard and
onboarding looked subtly off from every other money figure.

**Migrated (2 twin files, 6 sites):**
- `components/dashboard/LeakageSummaryCard.tsx` — overbilling + underbilled cards;
  hero leakage figure + "CapVeri Calculated" + "What You Billed" (×2 cards).
- `features/onboarding/steps/LeakageResultStep.tsx` — same three fields in the
  onboarding step 5 results card.
  All `${x.toLocaleString()}` → `{formatMoney(x)}` (drops the literal `$`;
  formatMoney prepends it). Fields are `number`-typed display magnitudes, so
  number precision is fine and formatMoney accepts numbers directly.

**Tests:** substring assertions (`/34,200/`, `/71,000/`) still match `$34,200.00`
/ `$71,000.00`; 11/11 pass across both files. tsc clean.

**Deferred (own future cycle):** broader onboarding variance money sites
(OnboardingResultsPaywall absoluteVariance, CompletionStep recoveryAmount,
ActualBilledUploadStep totalBilled). Pricing/Checkout `$X/yr` sites are
INTENTIONALLY whole-dollar price displays with a cadence suffix — not migrated.

## Cycle 35 — onboarding/paywall variance figures onto formatMoney

**Theme:** Closes out the leakage/variance money-consistency theme started in
Cycle 34. Three more onboarding surfaces rendered `${value.toLocaleString()}`
(no cents, off from the formatMoney canonical).

**Migrated (3 files, 5 sites):**
- `features/onboarding/components/OnboardingResultsPaywall.tsx` — 3 sites
  (`absoluteVariance` in the h3 heading + the leakage and overbilling copy).
- `features/onboarding/steps/CompletionStep.tsx` — `recoveryAmount`.
- `features/onboarding/steps/ActualBilledUploadStep.tsx` — `totalBilled`.
  All `number`-typed display magnitudes → `{formatMoney(x)}`.

**Tests:** Paywall used `toHaveTextContent('$12,500')` (substring) which still
matches `$12,500.00`; the two step tests don't assert dollar text. 17/17 pass;
tsc clean. No copy text changed (only the number formatter), so no marketing-gate
implications.

**Money-consistency theme status:** the leakage/variance `toLocaleString` cluster
is now exhausted. Remaining `$X.toLocaleString()` sites are Pricing/Checkout
whole-dollar price displays with cadence suffixes (`$249/yr`) — intentionally not
2dp money, left as-is.

## Cycle 36 — Toast title casing: sentence-case the reconciliation outliers

**Theme:** Toast title casing consistency. The codebase-wide norm for `toast.success/error` titles is **sentence case** ("Failed to update status", "Unit deleted successfully", "Profile updated successfully" — ~80 sites). Exactly one cluster diverged into **Title Case**: the reconciliation Calculate/Finalize buttons. Title Case headings are also a flagged AI-writing tell (humanizer skill #17).

**Migrated (6 titles, 2 components):**
- `features/reconciliation/components/FinalizeButton.tsx`: "Reconciliation Finalized" → "Reconciliation finalized"; "Finalization Failed" → "Finalization failed" (×2).
- `features/reconciliation/components/CalculateButton.tsx`: "Calculation Timeout" → "Calculation timeout"; "Calculation Failed" → "Calculation failed" (×2); "Calculation Complete" → "Calculation complete".
- `features/reconciliation/components/FinalizeButton.test.tsx`: updated the one assertion that pinned "Reconciliation Finalized".

**Deliberately NOT touched (rejected scout candidates):**
- Border-radius `rounded-md`→`rounded-lg` sweep: every cited site is a *nested* info panel, an `<img>`, or a small inline error chip — not a top-level Card. Smaller radius on nested elements is legitimate hierarchy, not a divergence. Forcing uniformity would look worse. Rejected.
- Blanket error-message *tone* unification ("Something went wrong" vs "Failed to X" vs "Couldn't X"): semantic-judgment, no single objective canonical, deferred.

**Verification:** `npx tsc --noEmit` clean; `vitest run` on FinalizeButton + CalculateButton tests → 31/31 pass.

## Cycle 37 — Clipboard-copy resilience + header truncation (functional/visual defects)

**Axis shift:** consistency-canon themes are largely exhausted, so this cycle targets genuine functional/visual defects (fresh Explore audit on the functional/a11y/visual axis).

**Fixed (3 defects):**
- `pages/settings/OrganizationPage.tsx` (handleCopyOrgId): clipboard `writeText().then()` had no `.catch()` — a rejected clipboard write (insecure context, permission denial) was an unhandled promise rejection with zero user feedback. Added `.catch(() => toast.error('Failed to copy to clipboard'))`. Success keeps its existing inline "Copied" state.
- `pages/leases/LeaseDetailPage.tsx` (CompactCopyId): copy button was fully fire-and-forget (`onClick={() => navigator.clipboard?.writeText(value)}`) — clicking gave NO feedback on success or failure. Now toasts `${label} copied` on success / "Failed to copy to clipboard" on rejection.
- `components/layout/Header.tsx` (account dropdown): `userName` and `userEmail` in a fixed `w-64` menu had no truncation; a long email/name overflowed the menu bounds. Added `truncate` to both.

**Verification:** `npx tsc --noEmit` clean; `vitest run` on OrganizationPage + LeaseDetailPage + Header tests → 78/78 pass.

## Convergence checkpoint (after Cycle 37)

Three fresh-axis audits this session corroborate that the mechanically-verifiable defect surface is thin:
- Functional/a11y/visual audit → 3 real defects, all fixed in Cycle 37 (clipboard feedback ×2, header truncation).
- State-triad + mobile-layout audit → **zero** defects (tables wrapped in overflow-x-auto, dialogs responsive, loading/error/empty/success branches consistently handled, no fixed-px primary containers).
- Live preview (authenticated "uxwalk" session, dev server): a11y snapshot of the Dashboard shows a clean, complete empty-state (eyebrow → "$0" → guidance copy → "Add First Property" CTA → stat tiles → Quick Actions → "No pending reconciliations"). Structurally sound.

**Tooling limitation:** `preview_screenshot` times out repeatedly in this environment (a11y `preview_snapshot` works; pixel capture does not), so a pixel-level "every screen" visual taste sweep — the one dimension of the original goal not yet exercised — is blocked here. It needs an environment where the preview renderer can capture screenshots, or a `playwright-cli` run. Flagged as the next genuine investment when that tooling is available.

Consistency canon themes closed this session: money→formatMoney (34–35), error-toast sanitization (32), EmptyState (33), toast-title casing (36), clipboard resilience + truncation (37).

## Capability fix — live pixel screenshots unblocked (resolves the Cycle-37 tooling limitation)

**Problem (per "you need to fix it"):** the prior checkpoint declared pixel-level "every screen" visual capture blocked — `preview_screenshot` timed out repeatedly. Root cause was diagnosed, not environmental: the local dev server is **Vite, whose HMR holds a WebSocket open**, so the browser network is **never idle**. `Claude_Preview.preview_screenshot` waits on `networkidle` before capturing, so it always hit the 30s timeout. The a11y `preview_snapshot` worked only because it does not gate on networkidle.

**Fix:** drive the **Playwright MCP** (`browser_navigate` + `browser_take_screenshot`), which captures immediately and does not wait on networkidle. The Playwright browser context already carried a valid local-dev Supabase session (user `e2e-test`), so authenticated screens render without extra auth injection.

**Validated:** captured the authenticated Dashboard at `http://localhost:5174/dashboard` in <1s — fully rendered with live data ($8,950 money-to-recover hero, 1 Property / 1 Need-Attention / $36,950 corrected stat cards, Quick Actions, "Test Plaza Shopping Center — Draft" reconciliation row). First capture surfaced a (non-product) error boundary caused only by the local backend being down on :8001; starting `uvicorn app.main:app --port 8001` (verified `info.title == "CapVeri API"`) restored data rendering.

**Net:** the one dimension of the original goal not previously exercised — a pixel-level visual taste sweep of every authenticated screen/modal — is now unblocked. Next cycles resume the live visual sweep screen-by-screen at desktop + mobile widths.

## Cycle — mobile reconciliation card money-emphasis parity

**Defect:** The reconciliation tenant summary emphasized different hero numbers by
viewport. Desktop table (`ReconciliationColumns.tsx`) emphasizes **Final Amount** in
green (`font-semibold text-success-strong`) and leaves Tenant Billable plain. The mobile
card (`ReconciliationCard.tsx`) did the opposite: Tenant Billable was emphasized in blue
(`text-lg font-bold text-primary`) while Final Amount — the number the tenant actually
owes — rendered plain black (`text-lg font-bold`). The same canonical figure carried
inconsistent emphasis across viewports.

**Fix:** In `frontend/src/pages/reconciliation/components/ReconciliationCard.tsx`,
de-emphasized Tenant Billable (`text-lg font-semibold`, no color) and moved the strong
green treatment onto Final Amount (`text-lg font-bold text-success-strong`) to match the
desktop canon. Final Amount is now the consistently-emphasized hero figure on both
desktop and mobile.

**Verify:** `npx tsc --noEmit` clean; `npx vitest run ReconciliationCard` → 25/25 pass.

## Cycle — dashboard Quick Actions icon-color consistency

**Defect:** In the dashboard Quick Actions list, "Upload GL" used `text-success`
(green) while the other three actions (Add Property, Reconcile, Portfolio) used
`text-primary` (navy). Because `action.color` styles the whole link, both the icon and
the label rendered green, making one row stand out arbitrarily in an otherwise-uniform
vertical action list. Present in both the paid and free tier action sets.

**Fix:** In `frontend/src/components/dashboard/QuickActionsCard.tsx`, changed Upload GL
to `text-primary hover:bg-primary/10` in both `paidActions` and `freeActions`, so all
quick actions share the navy treatment.

**Verify:** `npx tsc --noEmit` clean; `npx vitest run QuickActionsCard` → 5/5 pass;
mobile screenshot confirms all four rows now navy and uniform.

---

## Cycle 3 — Native range sliders: brand-navy accent parity

**Audited:** Certificates, Help, Team Members, Billing, Profile, Portfolio Overview
(all clean) at desktop width. **Defect found** on Portfolio Overview: the cap-rate
`<input type="range">` rendered with the browser-default bright blue accent, clashing
with the app's navy `primary` used everywhere else. Two existing tool sliders
(`CamLeakageEstimator`, `Boma2024Calculator`) already set `accent-primary`; four others
did not, so the inconsistency spanned a whole class.

**Fix:** Added `accent-primary` (plus `cursor-pointer`) to the four native sliders that
lacked it:
- `frontend/src/pages/portfolio/PortfolioPage.tsx` (cap-rate)
- `frontend/src/features/reconciliation/components/ExportPanel.tsx` (board cap-rate)
- `frontend/src/features/reconciliation/components/NOIImpactPanel.tsx` (cap-rate)
- `frontend/src/features/reconciliation/components/VarianceReport.tsx` (threshold)

**Verify:** `npx tsc --noEmit` clean; `npx vitest run PortfolioPage ExportPanel
NOIImpactPanel VarianceReport` → 96/96 pass; live reload confirms the Portfolio slider
fill is now navy, matching the brand.

### Cycle 3 — audit coverage (no further defects this stretch)

Swept at desktop width and judged **clean** (consistent layout, pill buttons,
plain copy, proper empty states):
- Certificates, Help, Team Members, Billing, Profile (Settings)
- Analysis → Year-over-Year, Analysis → Trends (trendline checkbox is the
  token-based shadcn `Checkbox`, so navy by construction — not the native-input
  issue the sliders had)
- Admin → Feedback, Portfolio → Pipeline, Data Ingestion (Upload GL)
- Property detail tabs: Overview, Units, Imports, Compliance
- Modal: "Log SB 1103 Compliance Request" (labeled inputs, pill Cancel/Log
  Request, dim backdrop) — clean

Minor candidate noted (not yet actioned): the shared DataTable empty state
(e.g. Compliance "No SB 1103 requests logged yet.") is a single line of muted
text, whereas Feedback/Certificates use an icon + heading + subtext. Worth a
future pass to unify empty-state treatment across tables.

## Cycle 4 — Shared DataTable empty state (icon + message)
- **Defect:** The shared `DataTable` empty state rendered as a single line of muted text (e.g. Compliance tab "No SB 1103 requests logged yet."), while bespoke empty states elsewhere (PropertyListPage, Feedback, Certificates) use an icon + message. Visual inconsistency across the app's empty states.
- **Fix:** Added a muted `Inbox` icon (`h-8 w-8 text-muted-foreground/40`, `aria-hidden`) above the message in both the desktop-table and mobile-card empty branches of `frontend/src/components/ui/data-table/DataTable.tsx`. Single-file change, no call-site churn — every table consuming the shared component (SB1103/Units/Leases/Pools/Reconciliations tabs, etc.) gains the richer empty state uniformly.
- **Verify:** `npx tsc --noEmit` clean; `npx vitest run src/components/ui/data-table` 85/85 pass; live-verified on local Compliance tab — icon renders above "No SB 1103 requests logged yet." Deployed + curl-verified.

## Cycle 4b — Audit coverage (no defects)
Swept the following at the noted widths; all clean, no changes needed:
- **Mobile (390px):** Property detail (#overview), Dashboard, Reconciliations list. Stat cards stack cleanly, tables stay right-aligned, pill CTAs and status badges render well, bottom tab bar intact.
- **Desktop (1440px):** Disputes list (status badges + count pills + needs-response highlight) and Dispute detail (Back link, Open badge, Update Status, rich Comments empty state). "Mark as internal" toggle uses the shadcn Checkbox (token navy), not a native input — no accent defect.

## Cycle 5 — Confidence color-coding amber was rendering near-black
- **Defect:** Document Extractions color-codes average confidence green/amber/red, but the mid-range (70–89%) branch used `text-warning-foreground` (HSL `48 96% 10%` — a ~10% lightness on-warning-surface tone). On the white table cell it renders near-black (`rgb(15,23,41)`), so 73/88/89% looked like plain dark text and the amber "caution" tier was invisible — the triage collapsed to green/black/red. Its siblings `success-strong` (24% L) and `destructive-strong` (35% L) are proper on-white tones; the warning tier had no equivalent.
- **Fix:** Added a true on-light amber token `--warning-strong: 32 95% 32%` (~5.4:1 on white, clears WCAG AA for small text) in `src/index.css`, wired `warning.strong` in `tailwind.config.js`, and switched both confidence color helpers in `ExtractionsPage.tsx` (desktop table cell + mobile card) from `text-warning-foreground` → `text-warning-strong`. Additive token — existing `text-warning-foreground` usages on `bg-warning/*` washes (badges, alerts) are unchanged and still correct.
- **Verify:** `npx tsc --noEmit` clean; full `npm test` = 6475 passed (the 6 failures in AuthCallback/PropertyDetailPage/property-workflow are pre-existing on a clean tree, confirmed via stash). Live-verified: computed color of 73/88/89% is now `rgb(159,87,4)` amber (was `rgb(15,23,41)`); screenshot confirms. Deployed + curl-verified.
- **Follow-up candidates:** other standalone `text-warning-foreground` on white (e.g. WelcomeCard 2xl figure, ReconciliationsListPage 2xl) may benefit from `text-warning-strong` — verify each sits on white (not a wash) before switching, separate cycle.

## Cycle 6 — Subscription-status badge inconsistent across Settings pages
- **Defect:** The same `active` subscription status rendered two different ways on sibling Settings pages. `OrganizationPage` shows a Title-Case **"Active"** in a green `success` badge with a full semantic mapping (trialing→info, past_due→warning, canceled/paused→destructive). `Billing`'s local `StatusBadge` showed a raw lowercase **"active"** in a navy `default` badge with an unrelated mapping (trialing→secondary, canceled→outline). Visiting both pages, the user sees the same state in two casings and two colors — a visible consistency break.
- **Fix:** Aligned `Billing.tsx` `StatusBadge` to OrganizationPage's semantics: variant map `active→success, trialing→info, past_due→warning, canceled/paused→destructive` and a Title-Case label map (`Active`, `Trialing`, `Past Due`, `Canceled`, `Paused`). Now both pages render an identical green "Active" pill (white on `bg-success-strong`, AA-compliant), and every other status reads consistently too.
- **Verify:** `npx tsc --noEmit` clean; `Billing.test.tsx` 16/16 pass (no test asserted the old lowercase text). Live-verified: Billing badge now `rgb(22,100,51)` green with white "Active", matching Organization.

## Cycle 7 — Reconciliations filters not full-width on mobile
- **Audit first:** Ran a broad web-agent visual sweep (login/dashboard/nav/property/modal, desktop+mobile). It surfaced 7 candidates, but verifying each against source disproved most — a strong "don't trust previous sweeps" reminder: (1) Select dropdowns use `rounded-lg` "violating pill canon" → REJECTED: `Input` is also `rounded-lg`; selects/inputs are a deliberate form-control family and buttons are correctly pills (canon is about buttons, not text inputs); pill-ifying selects would make them inconsistent with inputs. (2) "Dispute campaigns" empty-state copy "jargon/inconsistent" → DEFERRED: "campaign" is used consistently across that page (header, error, empty, rows) as the established domain term; a rename is a product-vocab decision, not an audit fix. (3) Profile email field "looks editable but isn't" → NON-DEFECT: already `disabled` and the shared `Input` applies `disabled:opacity-50 disabled:bg-muted/30`. (4) sm "Review" button "looks circular" → NON-DEFECT: `sm` is `px-3` so short text is stadium-shaped, not circular.
- **Real defect (the one that held up):** On `/reconciliations`, the Year/Property/Status `Select` filters used fixed widths (`w-32`/`w-48`/`w-40`) inside `flex items-center` wrappers. At 390px they shrank to content and sat left-aligned with large dead space — inconsistent with the full-width primary CTA above. Root cause confirmed by live pixel measurement: `SelectTrigger` is wrapped by `select.tsx` in an intermediate `<div className="relative">`, which shrinks in a flex context, so the trigger's base `w-full` resolved to content width (year measured 88px of a 380px container).
- **Fix (`ReconciliationsListPage.tsx`):** each filter group → `w-full sm:w-auto`; each `SelectTrigger` → `w-full sm:w-{32,48,40}`; and the wrapper stretches the inner `.relative` div via `[&>div]:w-full sm:[&>div]:w-auto`. Mobile now edge-to-edge (348/380 ≈ 92%), desktop unchanged (exact 128/192/160 inline). Frontend-only, no behavior change.
- **Verify:** `tsc --noEmit` clean; `ReconciliationsListPage` 30/30 tests pass; prettier/eslint clean; live-measured at 390px (year=property=status=348, container=380) and 1440px (128/192/160) — both PASS. Committed `8db3eef7` (pre-commit green). Other sessions' unstaged `backend/app/services/sequencer.py` left untouched (auto-stash/restore).
- **NEXT:** Cycle 8 — sweep other list/filter pages (Disputes, Portfolio Pipeline, Analysis, Ingestion) for the same fixed-width-Select-on-mobile class, since the `.relative`-wrapper shrink is shared; verify each at 390px before/after.

## Cycle 8 — Same mobile-Select-width class on Disputes & Portfolio Pipeline
- **Defect (class follow-on from cycle 7):** Two sibling filter bars had Selects that didn't fill on mobile. Disputes' status filter was already authored `w-full sm:w-[180px]` (intent = mobile-full) but its `flex items-center` wrapper let the Select's intermediate `.relative` div shrink to content, so it never filled. Portfolio Pipeline's year filter was a hard `w-[140px]`.
- **Fix:** Disputes wrapper → `w-full sm:w-auto [&>div]:w-full sm:[&>div]:w-auto`; Pipeline trigger → `w-full sm:w-[140px]` (its Select is a direct flex-col child, so the `.relative` div stretches via the column's default align-stretch — no wrapper hack needed there).
- **Swept clean (no change needed):** YearOverYear / TrendAnalysis Select triggers carry no width class → inherit `select.tsx` base `w-full` (already full). Ingestion property-select is already `w-full`.
- **Verify:** tsc clean; Disputes 10/10 + Pipeline 16/16 tests pass; live-measured 390px (Disputes 325/390, Pipeline 358/390 — fill) and 1440px (180 / 140 inline) — all PASS. Committed `eae8dc15` (pre-commit green).
- **NEXT:** Cycle 9 — repo-wide grep for any remaining fixed-width `w-[Npx]`/`w-NN` SelectTriggers sitting in horizontal/toolbar bars; if none, pivot off the responsive-Select class to a new defect class.

## Cycle 9 — Import History table overflowed on mobile → stacked cards
- **Defect (web-agent mobile audit, 390px):** `/ingestion?tab=history` rendered a fixed `table.w-full` measuring 744px inside a 380px viewport. The wrapper's `overflow-x:auto` hid the page-level scrollbar, but 4 of 5 columns (Date/Source/Rows/Status/Actions) sat off-screen behind an in-card horizontal scroll — effectively unusable on a phone. Every other audited page was CLEAN (dashboard, reconciliations, disputes, pipeline, properties, settings/profile all scrollW==docW, 0 offenders).
- **Fix (`ImportHistoryList.tsx`):** adopted the app's established responsive pattern (`useViewport().isMobile`, mirroring PortfolioPipelinePage) — render stacked cards on mobile, the table on desktop. Each card: filename+status badge header, Date/Source/Rows in a 2-col `dl`, View/Retry/Delete actions footer. Also stacked the header row (`flex-col sm:flex-row`) and freed the status filter to fill the row on mobile (`w-full sm:w-[150px]` + `[&>div]:flex-1 sm:[&>div]:flex-none` to defeat the `.relative`-wrapper shrink next to the "Filter:" label).
- **Tests safe:** jsdom `matchMedia` mock returns `matches:false` → `isMobile===false` in unit tests → table path unchanged. 62/62 (ImportHistoryList 26 + IngestionPage 36) pass; tsc clean; prettier/eslint clean.
- **Live-verified (390px):** no `<table>` rendered, 2 `import-card`s, scrollW==docW==380, overflowCount==0, filter select 269px (71% of row). Committed `8273ba12`.
- **NEXT:** Cycle 10 — the 390px overflow sweep covered the top-level authed pages and found only this one table. Extend the same `getBoundingClientRect().right > docW` overflow probe to deeper/detail routes not yet visited: a reconciliation detail (`/properties/:id/reconciliations`), a dispute detail (`/disputes/:id`), property detail tabs, extraction/verification, and admin pages — plus open one modal/dialog per page-class at 390px to catch dialog overflow. Fix any real table/element that breaks the viewport; otherwise pivot to a non-layout defect class (focus states, loading/empty parity, touch-target sizes).

## Cycle 10 — Two more wide tables overflowed on mobile → stacked cards
- **Defect (390px overflow probe):** Continuing cycle 9's `getBoundingClientRect().right > docW` sweep into deeper routes, two tables broke the viewport on phones: (1) Portfolio "Property Breakdown" leakage table (`PortfolioPage.tsx`, `PropertyLeakageTable`) — fixed `min-w-[720px]` table-fixed, recoverable/billed/leakage/recovery columns scrolled off-screen; (2) Settings → Team Members (`TeamMembersPage.tsx`) — both the Current Members and Pending Invitations lists rendered wide tables (name/email/role/joined/remove) that overflowed at 390px.
- **Fix:** Applied the established `useViewport().isMobile` responsive pattern to both. Portfolio renders one stacked card per property (2-col `dl` of Recoverable CAM / Billed / Leakage / conditional Recovery Rate, leakage in `text-destructive-strong`). Team Members renders member cards (name + "You" badge, email, full-width role Select/Badge gated by `canManage`, joined date, remove action) and invitation cards (email, role badge, expiry + Clock icon, revoke action). Desktop tables, all dialogs (invite/revoke/remove), money formatting (backend Decimal strings), and admin gating unchanged.
- **Tests safe:** jsdom `matchMedia` mock returns `matches:false` → `isMobile===false` → desktop table path in unit tests, no test churn. Combined `tsc --noEmit` clean; 38/38 (PortfolioPage 13 + TeamMembersPage 9 + PortfolioPipelinePage 16) pass; prettier/eslint clean.
- **Live-verified (390px):** both pages render stacked cards, no `<table>`, zero overflow. Committed `a6d0970d`. Feature-inventory drift gate satisfied (calculation-engine + platform-infrastructure + INDEX dated 2026-06-15). Other sessions' unstaged `backend/app/services/sequencer.py` left untouched.
- **NEXT:** Cycle 11 — the table-overflow class is now exhausted across the top-level + deeper authed routes swept (only 3 tables ever broke: Import History C9, Portfolio + Team Members C10). Pivot off layout-overflow to a new defect class: at 390px open one modal/dialog per page-class to catch dialog/sheet overflow and verify touch-target sizes (≥44px) on icon-only buttons; OR sweep focus-visible ring parity and loading/empty-state consistency on the detail routes not yet card-audited (reconciliation detail, dispute detail, extraction/verification, admin).

## Cycle 11 — Modal/sheet close (X) buttons were undersized touch targets
- **Pivot:** Table-overflow class exhausted (C9/C10). Ran a web-agent 390px sweep of dialogs/sheets + icon-button touch targets across page-classes (Sheets: Export/Help Drawer/Calc Trace/tours/Feedback; Dialogs: Invite Member, Add Pool, etc.). Most candidates rejected against source (tablist `overflow-x-auto` is intentional scroll, segmented tabs/filter pills are non-primary 32px controls, Input/Select rounded-lg is form-control canon). One real defect held up.
- **Defect:** The shared Sheet close button (`components/ui/sheet.tsx`) was a bare 16×16px icon — `rounded-sm`, no padding — well below a usable phone tap target. Dialog's close was a 24px `p-1` box; better but still small and visually inconsistent with the sheet.
- **Fix:** Both close buttons → centered circular 40×40px hit areas (`flex h-10 w-10 items-center justify-center rounded-full`, X icon unchanged). App-wide root fix via two shared primitives; satisfies the touch-target floor and the circular-icon-button design canon. No call-site churn.
- **Verify:** `tsc --noEmit` clean; dialog 35 + sheet 11 = 46/46 primitive tests pass; prettier/eslint clean; no test asserted the old classes. Live-verified at 390px: both close buttons measure 40×40, icon centered, still click-to-close, `scrollWidth==clientWidth` (no overflow regression). Feature-inventory updated (platform-infrastructure + INDEX, 2026-06-15).
- **NEXT:** Cycle 12 — touch-target sweep is partially done (close buttons). Continue the non-layout defect classes: (a) finish the icon-only touch-target audit on toolbar/row-action icon buttons (the help "?" 24px triggers and any <40px primary actions — distinguish primary actions from non-primary info/secondary affordances); OR (b) focus-visible ring parity across interactive elements; OR (c) loading/empty-state consistency on detail routes not yet card-audited (reconciliation detail, dispute detail w/ seeded data, extraction/verification, admin). Open dialogs with SEEDED data where C11 hit empty/disabled states (0 disputes, disabled Run/Copy) to catch defects those states masked.

## Cycle 12 — GL Analysis panel header buttons were undersized touch targets
- **Continuation (icon-only touch-target sweep):** Web-agent enumerated every icon-only button across 14 authed routes at 390px, measuring rect + accessible name + source. Coverage proof: nearly all are already 44×44 (header menu/help, pagination, copy-support-id) or 40×40 (Team Members revoke). The C11 close-button fix held. Two real defects surfaced, both the same root cause.
- **Defect:** The GL analysis "Advisory only" banner header (`features/analysis/components/GLAnalysisPanel.tsx`) forced its three controls to `h-7` (28px): Re-run (text), Dismiss (X, icon-only), Collapse/Expand (chevron, icon-only) — below the 40px touch floor on phones; the two icon-only ones are primary (only way to dismiss/collapse the panel).
- **Fix:** Re-run → `h-10`; Dismiss + Collapse → 40×40 circular (`h-10 w-10 rounded-full`, circular-icon-button canon). Icons/behavior unchanged.
- **Rejected (recorded for sweep trust):** HelpTip "?" triggers (24×24) are non-primary secondary info affordances — acceptable; `hidden sm:inline-flex` help buttons don't render at 390px; Team Members revoke at exactly 40×40 is at floor, not below; text+icon buttons (Re-run pre-classified) are not icon-only.
- **Verify:** `tsc --noEmit` clean; no test renders GLAnalysisPanel (grep confirmed) so no unit churn; prettier/eslint clean. Live-verified at 390px: collapse 40×40, dismiss 40×40, re-run 91×40, toggle/dismiss still functional, panel adds no overflow (a pre-existing 1px body overflow 381-vs-380 is unrelated to this panel). Feature-inventory updated (calculation-engine + INDEX, 2026-06-15).
- **NEXT:** Cycle 13 — icon-only touch-target class is now essentially exhausted (only HelpTip 24px secondary triggers remain, deemed acceptable). A web agent noted a recurring pre-existing **1px page-level horizontal overflow (scrollWidth 381 vs clientWidth 380/390)** present across multiple routes — investigate the single 1px offender (likely a full-bleed element with a stray border/negative margin or a `w-screen`/`100vw` that ignores the scrollbar) and fix at the layout root. If that's a non-issue, pivot to focus-visible ring parity OR loading/empty-state consistency on detail routes opened WITH seeded data (create a dispute + run a reconciliation so dialogs masked by empty/disabled states in C11/C12 actually render).

## Cycle 13 — Table loading skeleton overflowed the mobile viewport (transient horizontal scroll)
- **Investigation (chasing the C12 "1px overflow" lead):** A web agent measured scrollWidth vs clientWidth across routes at 390px and found the real story was bigger than 1px: during the ~1.3s data-loading phase, /reconciliations, /properties, /settings/team showed scrollWidth 489–514 vs 380 — a real, scrollable ~90–130px horizontal overflow that vanished once data loaded. /dashboard (no table skeleton) never overflowed, pinpointing the cause.
- **Defect:** `DataTableSkeleton` (`components/ui/data-table/DataTableSkeleton.tsx`) renders a desktop pagination row (~630px of fixed-width skeleton cells incl. a 4-box page cluster) as a sibling OUTSIDE the table's `overflow-auto` wrapper, and the outer container had no overflow clamp. Every list route using it (Reconciliations, Properties, Team Members, Tax Protest, Extractions, Portfolio Pipeline, Export History, shared DataTable loading branch) bled that row past the viewport during loading.
- **Fix:** Added `overflow-x-hidden` to the skeleton container (clamps the transient bleed for all callers) and collapsed the pagination right-cluster to `hidden sm:flex` so mobile shows only the left "showing X" bar while desktop keeps the numbered page boxes. `hidden` keeps nodes in the DOM, so skeleton-cell-counting tests are unaffected.
- **Verify:** `tsc --noEmit` clean; 85/85 data-table tests pass; prettier/eslint clean. Live-verified at 390px: scrollWidth==clientWidth==380 during the loading skeleton on all three routes (pre-fix simulated overflow reproduced at +93px), content fine post-load; at 1440px the pagination right-cluster renders `flex` (visible). Feature-inventory updated (platform-infrastructure + INDEX, 2026-06-15).
- **NEXT:** Cycle 14 — the loading-overflow root is fixed centrally. Audit the OTHER transient/loading states for the same desktop-shaped-on-mobile mismatch: `SkeletonCard`/bespoke skeletons, and the DataTable loading branch's mobile parity (Part B the agent flagged: DataTable returns a table skeleton even when the loaded state is mobile cards — consider rendering card skeletons when `isLoading && showMobileCards`). Otherwise pivot to focus-visible ring parity, or open dialogs/detail routes WITH seeded data (create a dispute + run a reconciliation) to catch defects masked by empty/disabled states in C11/C12.

## Cycle 14 — DataTable loading skeleton flipped table→cards on mobile (layout-shift parity)
- **Continuation (C13 NEXT Part B):** C13 clamped the skeleton's transient overflow. The remaining mismatch: the shared `DataTable` (`components/ui/data-table/DataTable.tsx`) returns the table-shaped `DataTableSkeleton` while `isLoading`, BUT routes that pass a `mobileCardRenderer` render stacked cards once data arrives. On a phone the loading state was therefore a wide table skeleton that then snapped into a vertical card list — a jarring shape change, and the table skeleton is the same one C13 had to overflow-clamp.
- **Defect:** loading branch ran unconditionally before the `showMobileCards` check, so every card-rendering list (Portfolio Pipeline, Import History, Team Members cards, etc.) showed a table skeleton on mobile that did not match its loaded card layout.
- **Fix:** loading branch now checks `showMobileCards` first — when a `mobileCardRenderer` is set and viewport < breakpoint, it renders a stack of five `SkeletonCard` placeholders (`space-y-md`, `aria-busy`, `data-testid="data-table-mobile-skeleton"`) that mirror the card layout; otherwise the desktop `DataTableSkeleton` as before. Imported `SkeletonCard` from `@/components/ui/skeleton`. Desktop and all loaded states unchanged.
- **Tests safe:** jsdom `matchMedia`/`innerWidth` keep `showMobileCards===false` in unit tests → table-skeleton path, no churn. `tsc --noEmit` clean; 85/85 data-table tests pass; prettier/eslint clean. Feature-inventory updated (platform-infrastructure + INDEX, 2026-06-15).
- **NEXT:** Cycle 15 — loading-state parity for the shared table is now consistent on both axes (overflow C13 + shape C14). Pivot to a fresh defect class: focus-visible ring parity across interactive primitives (buttons/rows/cards/links — verify a consistent visible ring token on keyboard focus), OR open detail routes/dialogs WITH seeded data (create a dispute + run a reconciliation) to surface defects that C11/C12's empty/disabled states masked.

## Cycle 15 — Keyboard-focus ring parity on shared primitives
- **Pivot (off loading-state class):** Source-grounded audit of focus-visible ring styling across every interactive primitive in components/ui. Dominant pattern is `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring(/30) focus-visible:ring-offset-2`. Audit produced a primitive×focus-style table; two real outliers held up against convention.
- **Defect:** `Badge` (badge.tsx) and the `Select` trigger's inline clear (X) button (select.tsx) used plain `focus:` (fires on mouse click, not just keyboard) instead of `focus-visible:`. The clear button additionally MISSED `ring-offset-2` and was `rounded-sm` (square icon button — violates the circular-icon-button canon).
- **Fix:** Both → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Clear button also `rounded-sm`→`rounded-full`.
- **Rejected (recorded for sweep trust):** (a) The 5 Radix roving-focus menu items (Select item, Dropdown sub-trigger/item/checkbox-item/radio-item) use `focus:bg-accent` with NO ring — this background-highlight-on-arrow is the STANDARD menu affordance (items receive DOM focus as you arrow; a ring would be non-standard/noisy), not a defect. (b) `SelectTrigger` keeps `focus:ring-2` — a ring when you click a field trigger is acceptable (like an input), and select.test.tsx:253 asserts that exact class; converting would churn a test on a judgment call. (c) Input/Textarea `ring-offset-0` is the intentional tight-binding form-field style.
- **Verify:** `tsc --noEmit` clean; 31/31 (badge 9 + select 22) tests pass; prettier/eslint clean. Feature-inventory updated (platform-infrastructure + INDEX, 2026-06-15).
- **NEXT:** Cycle 16 — focus-ring parity is now consistent across the genuinely-divergent leaf controls (menu items intentionally excluded). Next, either (a) open detail routes/dialogs WITH seeded data (create a dispute + run a reconciliation) to surface defects masked by C11/C12's empty/disabled states — the highest-value untapped lead; or (b) audit hover/active-state parity (hover bg tokens) across the same primitives the way focus was just unified.

## Cycle 16 — Extraction Verify page title overflowed the mobile viewport
- **Pivot (seeded-data live audit):** Web agent logged in as landlord and drove real workflows WITH data (reconciliation detail, dispute detail, property tabs, extraction verify) at 1440px + 390px — the states earlier cycles couldn't see. 15 flows came back CLEAN. Rejected the agent's top "defect" (Select triggers `rounded-lg` not pill) — text-input form controls are a deliberate, standing exemption from the pill canon. Real layout bugs surfaced on the data-dense recon/verify routes.
- **Defect:** On the extraction Verify page (`pages/extractions/VerificationPage.tsx`) the header `<h1>{extraction.filename}</h1>` sat in a flex row with no `min-w-0`/truncation, so a long PDF filename ("Suite_310_Lease_Agreement.pdf") pushed `scrollWidth` to 417 vs 380 clientWidth at 390px — a real ~37px horizontal page scroll, with the title clipped mid-word at the viewport edge (no ellipsis).
- **Fix:** Added `min-w-0` to the left header cluster and the title's wrapper div, and `truncate` to the h1, so the filename ellipsizes within the available width. Header actions + back button unchanged.
- **Verify:** `tsc --noEmit` clean; 21/21 VerificationPage tests pass; prettier/eslint clean. Live-verified at 390px: scrollWidth==clientWidth==380, h1.right==364 (inside viewport), computed `text-overflow:ellipsis` + `white-space:nowrap` + `overflow:hidden`, renders "Suite_310_Lease_Agree…"; at 1440px the full filename renders untruncated (h1.right 680/1430) — no regression.
- **NEXT:** Cycle 17 — the same live audit flagged two more real ones on `/properties/:id/reconciliations`: (a) the per-tenant trace/eye buttons in the results table measure 40×16px (`w-10` with no height → collapses to icon height; primary drill-in, below the 40px touch floor) — fix height to 40; (b) lower priority: the 4-step mobile stepper's "Finalize & deliver" label wraps to 2 lines breaking row alignment, and the pool/tenant filter tabs are 32px tall at 390px. Do the trace-button touch target first (clearest), then judge the stepper/filter-tab items.

## Cycle 17 — Reconciliation results "trace" buttons were 40×16px touch targets
- **Continuation (C16 NEXT a):** Same seeded-data live audit flagged the per-tenant trace/eye buttons in the completed-reconciliation results table.
- **Defect:** `ReconciliationGrid.tsx` trace button (`[data-testid="trace-button"]`, the only drill-in to a tenant's calculation trace) had `className="w-10 ... rounded-full"` with NO height, so it collapsed to the icon's ~16px — measured 40×16px live, well below the 40px touch floor on the height axis (desktop and mobile).
- **Fix:** added `h-10` (and tidied the class order) → `flex h-10 w-10 items-center justify-center rounded-full ...`. Now a 40×40 circular icon button, matching the C11/C12 touch-target + circular-icon-button canon. Icon/behavior unchanged.
- **Verify:** `tsc --noEmit` clean; 32/32 ReconciliationGrid tests pass; prettier/eslint clean. Live-verified on /properties/:id/reconciliations?year=2025: all 3 per-tenant trace buttons now measure exactly 40×40 (was 40×16).
- **NEXT:** Cycle 18 — clear touch-target/overflow defects from the seeded-data audit are now resolved (verify title C16, trace buttons C17). Remaining lower-priority items from that audit: (a) the 4-step mobile reconciliation stepper's "Finalize & deliver" label wraps to 2 lines at 390px, making step 4 taller (84 vs 68px) and breaking row alignment; (b) the pool/tenant filter segmented tabs render 32px tall at 390px (under 40px). Judge (a) — a shorter label or a fixed min-height per step — then decide if (b)'s 32px segmented filter is primary enough to bump. Otherwise run a fresh seeded-data audit pass on tenant-portal routes (log in as the tenant account) which this cycle's landlord pass didn't cover.

## Cycle 18 — Mobile reconciliation stepper circles de-aligned when a label wrapped
- **Continuation (C17 NEXT a):** The seeded-data audit's remaining alignment item — the 4-step workflow stepper (Upload GL → Reconcile → Review → Finalize & deliver) on `/properties/:id/reconciliations` at 390px.
- **Defect:** `ReconciliationWorkflowStepper.tsx` rendered the steps in an `<ol className="flex items-center ...">`. Each step button is `flex-col` (indicator circle on top, label below). At 390px the longer "Finalize & deliver" label wraps to 2 lines, making step 4's button ~16px taller; with `items-center` that extra height vertically centered step 4, pushing its indicator circle ~8px LOWER than the other three — circles and the `top-6` connector line no longer aligned.
- **Fix:** `items-center` → `items-start` on the `<ol>`. All step buttons now top-align, so every indicator circle sits at the same y regardless of label line count, and the circle center stays on the connector's `top-6` anchor. No label text change (kept "Finalize & deliver" — `ReconciliationWorkflowStepper.test.tsx:45` and FinalizeButton/Modal assert that exact string).
- **Rejected/deferred (recorded for sweep trust):** Did NOT shorten the label (would break 3 test files asserting `getByText('Finalize & deliver')` and lose the user-facing "& deliver" promise) and did NOT add a per-step fixed min-height (whitespace on desktop where the icon also shows). `items-start` is the minimal, side-effect-free fix. The pool/tenant filter segmented tabs at 32px (C17 NEXT b) remain — judged secondary (a passive filter, not a primary drill-in); logged for a later touch-target cycle.
- **Verify:** `tsc --noEmit` clean; 10/10 ReconciliationWorkflowStepper tests pass. Live-verified at 390px (landlord, real reconciliation): all 4 indicator circles measure `getBoundingClientRect().top == 440.80px` (zero divergence; pre-fix step 4 was ~8px lower); "Finalize & deliver" still wraps to 2 lines (32px vs 16px) but no longer breaks alignment; 0 console errors.
- **NEXT:** Cycle 19 — landlord-side seeded-data audit has now cleared its overflow + touch-target + alignment findings (C16/C17/C18). Two untapped leads, in priority order: (a) run a fresh seeded-data live audit on the TENANT-PORTAL routes (log in as `e2e-tenant@capveri.com` / `TestPassword123!`) — the landlord pass never covered tenant views, likely the richest unswept surface; (b) the deferred 32px pool/tenant segmented filter touch target. Prefer (a).

## Cycle 19 — Tenant dispute status badge stretched to full viewport width on mobile
- **Pivot (tenant-portal seeded-data audit):** First live audit of the TENANT portal (logged in as `e2e-tenant@capveri.com`) at 1440px + 390px — every prior cycle was landlord-side. Route inventory found: /tenant/dashboard, /tenant/disputes(+/:id, /new), /tenant/notifications, /tenant/help, /tenant/preferences. Most screens clean (no overflow anywhere). Five defects surfaced; triaged below.
- **Defect (this cycle, the most visually broken):** On `/tenant/disputes/:id` the `DisputeStatusBadge` is passed as PageHeader `actions`. PageHeader's actions slot is `flex flex-col items-stretch` on mobile (correct for full-width stacked buttons), which stretched the compact status pill to ~348px (full 380px viewport) — a tiny "Open" badge blown up edge-to-edge.
- **Fix:** Wrapped the badge at the call site (`DisputeDetailPage.tsx`) in `<span className="self-start">` so it keeps its intrinsic width inside the stretch column; harmless in the desktop row. Did NOT change PageHeader (other callers rely on items-stretch for full-width action buttons).
- **Verify:** `tsc --noEmit` clean; 13/13 DisputeDetailPage tests pass. Live-verified at 390px: badge now 52.75px (was ~348px), its `self-start` wrapper matches at 52.75px, scrollWidth==clientWidth==380, 0 console errors.
- **Rejected (recorded for sweep trust):** D4 — dispute list cards are `rounded-lg` not pill; clickable CARD CONTAINERS are the standard exception to the pill canon (which governs buttons/CTAs/icon buttons), consistent with prior card rejections. Not a defect.
- **Triaged-for-later (from this audit, in priority order):** D5 — dispute list cards use `focus:ring-2` not `focus-visible:` (same class as C15, fires on mouse click) → Cycle 20. D2 — /tenant/preferences switch toggles are 24×44px, under the 40px touch floor → Cycle 21 (verify whether the row label already extends the tap area before changing). D3 — dashboard "View dispute" navigates to the disputes LIST not the specific `/tenant/disputes/:id` (needs dispute_id plumbing onto the statement; larger scope) → Cycle 22.
- **NEXT:** Cycle 20 — fix D5 (tenant dispute list card `focus:`→`focus-visible:` ring parity; cheap, mirrors C15). Then D2 (Cycle 21), then D3 (Cycle 22).

## Cycle 20 — Tenant dispute list cards showed a focus ring on mouse click
- **Continuation (C19 D5):** From the tenant-portal audit. `TenantDisputesPage.tsx` renders each dispute as a `role="button"` card.
- **Defect:** The card used plain `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2` — `focus:` fires on mouse click too, so clicking a card flashed a keyboard-style focus ring (visual noise). Every other tenant control uses `focus-visible:` (see NotificationList.tsx, which already does).
- **Fix:** `focus:` → `focus-visible:` on all four ring classes. Same correction class as Cycle 15 (badge/select). Card stays `rounded-lg` — clickable card containers are exempt from the pill canon (see C19 D4 rejection).
- **Verify:** `tsc --noEmit` clean; 15/15 TenantDisputesPage tests pass. Class swap is self-verifying against the dominant `focus-visible:` primitive pattern; no live agent needed for a ring-token rename.
- **NEXT:** Cycle 21 — D2: `/tenant/preferences` switch toggles measure 24×44px (under the 40px touch floor). Before changing, READ the preferences page source to check whether each switch sits inside a `<label>`/row that already extends the clickable/tap area to ≥40px (if so, the 24px is the visual control only and acceptable — like a checkbox); only enlarge the actual hit target if the label doesn't already cover it. Then Cycle 22 = D3 (dashboard "View dispute" → specific dispute id).

## Cycle 21 — Switch toggles were a 24px tap target (under the 40px touch floor)
- **Continuation (C19 D2):** From the tenant-portal audit. `/tenant/preferences` (and every switch app-wide) used the shared `Switch` primitive at `h-6 w-11` = 24×44px. The `<Label htmlFor>` forwards clicks (the title text also toggles), but the switch's own tap target was 24px tall — under the 40px floor the earlier touch-target cycles (C11/C12/C17) established for primary controls.
- **Fix (shared primitive, applies everywhere):** Added an invisible `before:` hit-area halo to `components/ui/switch.tsx` — `relative before:absolute before:left-0 before:top-1/2 before:h-10 before:w-full before:-translate-y-1/2 before:content-[""]`. The clickable area is now 40px tall; the VISIBLE track stays 24px. Width = track width (`w-full` ≈ 44px) so it never extends under an adjacent label, and 40px fits inside the preference rows' `py-3` so it can't overlap a neighboring switch.
- **Verify:** `tsc --noEmit` clean; 24/24 tests pass (switch + EmailPreferences 12 + TenantPreferencesPage 3). Live-verified at 390px: visible track still 24×44, computed `::before` height = 40px / width ≈ 40.8px, vertically centered (translateY(-50%)); toggling flips aria-checked + persists (PUT 200) + "Preferences saved" toast — halo didn't break activation; scrollWidth==clientWidth==380; 0 console errors. All 4 switches carry the halo.
- **NEXT:** Cycle 22 — D3 (last open tenant-audit item): on `/tenant/dashboard` the "View dispute" button on a disputed statement does `navigate('/tenant/disputes')` (the LIST) instead of the specific `/tenant/disputes/:id`. Needs the statement to carry its associated dispute_id (or a lookup matching dispute by statement_id) before navigating. Read TenantDashboard.tsx + the statement/dispute DTOs to see if dispute_id is already available on the statement; if not, decide between a cheap client-side match against the disputes list vs. deferring as a backend-DTO change. After D3, the tenant-audit backlog is clear — run a fresh seeded-data audit on a NEW untapped surface (e.g. landlord disputes detail, documents/extractions, or settings/team) for Cycle 23.

## Cycle 22 — D3 (dashboard "View dispute" → specific dispute) DEFERRED (backend DTO gap)
- **Continuation (C21 NEXT, last open tenant-audit item):** On `/tenant/dashboard` a disputed statement's "View dispute" button does `navigate('/tenant/disputes')` (the LIST), not the specific `/tenant/disputes/:id`.
- **Investigation:** Read `TenantDashboard.tsx` (statement: `StatementSummaryDTO`, line 286) and `types.gen.ts`. `StatementSummaryDTO` (line 4070) = `{ id, property_name, period_start, period_end, tenant_share, status, pdf_url?, created_at }` — it carries NO `dispute_id` and no link to the dispute it spawned. (The `dispute_id` at types.gen.ts:1117 belongs to `DemandLetterRequest`, unrelated.) So the frontend has nothing to navigate to a specific dispute with.
- **Decision: DEFER (out of frontend-sweep scope).** The correct fix is a backend change — add `dispute_id` (or `latest_dispute_id`) to `StatementSummaryDTO` so the dashboard can deep-link. The backend tree is contested by parallel sessions and a DTO/schema change is migration-and-API-surface work, not a UI-layout fix. The only frontend-only alternative — fetch the tenant disputes list and fuzzy-match a dispute by `statement_id` — risks opening the WRONG dispute (a statement can have multiple disputes; match ambiguity) and adds a load on every dashboard render. Navigating to the filtered list is a correct, safe fallback; the user still reaches their dispute in one more click. Not a defect worth a risky client-side guess.
- **Verify:** No code change this cycle (deferral). Tenant-portal audit backlog (D1/D2/D4/D5 resolved across C19–C21; D3 deferred here) is now clear.
- **NEXT:** Cycle 23 — tenant-portal surface is swept. Run a fresh seeded-data live audit on a NEW untapped LANDLORD surface (candidates: documents/extractions review, settings/team management, or landlord-side disputes detail). Log in as landlord `e2e-test@capveri.com` / `TestPassword123!`, walk the route at 1440px + 390px, measure touch targets + overflow + focus-ring parity against the established canon, fix the clearest confirmed defect.

## Cycle 23 — Notification banner dismiss button was a 28px tap target
- **Pivot (fresh landlord seeded-data audit):** Tenant-portal backlog clear (C22). New live audit (landlord `e2e-test@capveri.com`) swept the untapped surfaces: documents/extractions, settings (profile/organization/team), landlord disputes detail. Most clean. Three touch-target defects surfaced; fixed the clearest/most-isolated this cycle.
- **Defect:** On `/extractions` the "Enable Notifications" banner's X dismiss button (`button[aria-label="Dismiss notification prompt"]`, `NotificationPrompt.tsx`) was `h-7 w-7` = 28×28px — the sole control to dismiss a persistent banner, below the 40px touch floor in both dimensions.
- **Fix:** `h-7 w-7` → `h-10 w-10` (kept `rounded-full flex-shrink-0`). Now a 40×40 circular icon button, matching the C11 close-button canon. Icon (`X h-4 w-4`) and behavior unchanged.
- **Verify:** `tsc --noEmit` clean; 64/64 extractions tests pass (incl. NotificationPrompt 4). Live-verified on `/extractions`: button now measures exactly 40×40 (was 28×28).
- **Rejected/deferred (recorded for sweep trust):** Most landlord surfaces clean (disputes list/detail, all settings pages, ingestion history actions all ≥40px, zero overflow at 390px, no plain-`focus:` ring leaks). Two carried forward: **D2 (→ Cycle 24)** — the shared `Tabs` primitive (`components/ui/tabs.tsx`, `py-1.5`) renders `[role=tab]` at 32px tall (Upload/History on /ingestion etc.), 8px under the floor; shared-primitive change, higher blast radius, judge carefully. **D3 (secondary)** — `/disputes/:id` "Mark as internal" Checkbox is 16px in a 20px row (no extended tap zone); optional annotation toggle, lower priority.
- **NEXT:** Cycle 24 — evaluate D2 (Tabs primitive 32px → 40px). Read `components/ui/tabs.tsx`; the trigger uses `py-1.5`. Bumping to meet 40px (e.g. `min-h-10` or `py-2.5`) is global — check the segmented-tab call sites (ingestion Upload/History, any settings tabs) at 1440px + 390px don't break layout before/after. If the bump risks visual regression on dense tab bars, scope it to a size variant. Then D3 (checkbox row height) as a smaller follow-up.

## Cycle 24 — Dispute "Mark as internal" checkbox row was a 20px tap target (+ Tabs primitive deferral)
- **Continuation (C23 D3):** From the landlord audit. On the landlord dispute detail Add-Comment form (`features/disputes/components/AddCommentForm.tsx`) the "Mark as internal (not visible to tenant)" toggle is a 16px Shadcn Checkbox whose `<Label htmlFor="is-internal">` also toggles it — but the label's hit area was only ~20px tall (text line height), so the vertical tap target fell under the 40px floor. (Canon allows a small visual checkbox IF the row/label extends the tap area to ≥40px; here it extended width but not height.)
- **Fix:** Added `flex min-h-10 items-center` to the Label, giving the label click target a 40px-tall hit area while the checkbox stays 16px visually. Single-component, isolated.
- **Verify:** `tsc --noEmit` clean; 56/56 disputes tests pass. Live: dev DB had no seeded disputes to open, so verified via DOM probe that the exact class string resolves `min-h-10` → `getBoundingClientRect().height == 40px` (deterministic single-element CSS class).
- **Deferred — D2 (shared Tabs primitive, recorded for sweep trust):** `components/ui/tabs.tsx` `TabsTrigger` is `px-3 py-1.5` ≈ 32px tall (the clickable target; the `TabsList` is h-10/40px but `p-1` leaves the trigger 32px). Meeting 40px means growing the list to ~48px, which changes visual density across **11 call sites** (lease/property detail, ingestion Upload/History, onboarding steps, export panels). Segmented tabs at 32-36px are an accepted, tasteful industry-standard pattern (shadcn ships h-9), and prior cycles (C17/C18) already judged segmented filter/view tabs SECONDARY. Inflating the core primitive globally to chase the floor would degrade taste on dense tab bars for a low-severity gain. **Decision: leave the Tabs primitive as-is** unless a specific high-traffic tab bar is shown to cause a real mis-tap problem. Not a defect worth a global regression.
- **NEXT:** Cycle 25 — landlord + tenant seeded-data audits have both been swept (ingestion, reconciliation, verification, extractions, settings, disputes, tenant portal). Untapped surfaces to audit next: the onboarding/PLG flow (`features/onboarding/steps/*`, the leakage/free-audit wizard), the leases detail/list, the dashboard/home landing, and any modals/sheets not yet measured (export panel, demand-letter modal). Pick one, run a fresh live audit at 1440px + 390px against the canon, fix the clearest confirmed defect.

## Cycle 25 — Shared HelpTip icon button was a 24px tap target
- **Pivot (fresh landlord audit on untapped surfaces):** Swept dashboard, leases list/detail, add-property flow, dialogs. Dashboard + properties list + delete-lease dialog clean. Audit surfaced a cluster of sub-40px help/tooltip icon triggers; fixed the highest-leverage shared one this cycle.
- **Defect:** `features/help/components/HelpTip.tsx` rendered its `<button aria-label="Help information">` at `h-6 w-6` = 24×24px — under the 40px touch floor. This is a shared component used across lease upload + other forms (3 instances on /leases/upload alone), so every instance was undersized.
- **Fix (shared component, applies everywhere):** Added the invisible-halo pattern from C21 (Switch) — `relative before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]`. Tap target is now 40×40 centered on the icon; the VISIBLE control stays 24px (a 40px circle would look heavy where several help icons sit inline in a form). Hover bg, focus-visible ring, tooltip wiring unchanged.
- **Verify:** `tsc --noEmit` clean; 8/8 help tests pass. Live-verified on /leases/upload: button rect stays 24×24, computed `::before` = 40×40 (position absolute, empty content); all 3 help buttons share the class; tooltip wiring intact (Radix opens on real hover).
- **Deferred/queued (recorded for sweep trust, from this audit):**
  - **D1 (→ Cycle 26):** `components/leases/RecoveryProfileEditor.tsx` (lines ~72-78) has 6 INLINE help `<button>`s at 16×16px (a separate impl, not HelpTip). Best fix: route them through HelpTip (now haloed) or add the same halo. Worst-sized of the cluster — do next.
  - **D3 (→ later):** `pages/leases/LeaseDetailPage.tsx` `CompactCopyId` "Copy Lease ID" button is 122×20px (height under floor); convenience clipboard action, secondary.
  - **D-breadcrumb (→ later):** Properties breadcrumb icon-only `<a href="/properties">` is 16×16 at 390px (label is sr-only on mobile); secondary nav.
  - **D5 (cosmetic):** Lease detail mobile tab strip scrolls (scrollWidth 475 > 348) with no fade affordance — the `ScrollableTabsList` primitive (with fades) already exists; LeaseDetailPage uses plain TabsList. Low priority.
- **NEXT:** Cycle 26 — fix D1 (RecoveryProfileEditor's 6 inline 16px help buttons → HelpTip or haloed). Then the secondary cluster (D3 copy-id height, breadcrumb mobile tap area), then judge swapping LeaseDetailPage to ScrollableTabsList for the mobile fade affordance (D5).

## Cycle 26 — RecoveryProfileEditor's inline help icons were 16px tap targets (D1)
- **Defect (carried from C25 audit, D1):** `components/leases/RecoveryProfileEditor.tsx` has a local `TooltipLabel` helper whose help `<button aria-label={`Help: ${label}`}>` had no sizing — just a 16×16 HelpCircle icon. The lease edit form renders 8 of these inline beside field labels (Pro-Rata Share, Base Year, Base Year Amount, Gross-Up Base Year, RSF Measurement Standard, Accounting Basis, …), every one under the 40px touch floor. Worst-sized control in the C25 cluster.
- **Fix:** Applied the same invisible-halo pattern (C21 Switch / C25 HelpTip) directly to the button className — `relative ... before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']`, plus `rounded-full` and a `focus-visible` ring for keyboard parity. Visible 16px icon unchanged; tap target now 40×40 centered on it. No `cn` import existed, so the static class string is inline (single static className — no conditional classes needed).
- **Verify:** `tsc --noEmit` clean. Live-verified on the lease edit form at localhost:5174 (logged in as Owner): all 8 `button[aria-label^="Help:"]` measured — visible rect 16×16, computed `::before` = 40×40 on each. PASS.
- **Carried forward (still queued from C25 audit):** D3 (LeaseDetailPage `CompactCopyId` "Copy Lease ID" 122×20 height under floor — secondary clipboard action); D-breadcrumb (Properties breadcrumb icon-only link 16×16 at 390px, label sr-only on mobile); D5 (lease detail mobile tab strip scrolls with no fade affordance — `ScrollableTabsList` primitive with fades already exists, LeaseDetailPage uses plain TabsList).
- **NEXT:** Cycle 27 — judge D3 vs D5. D5 is the more visible/holistic fix (swap LeaseDetailPage's plain TabsList → existing ScrollableTabsList so mobile users get the scroll fade affordance); confirm the primitive's API matches before swapping. Otherwise fix D3 (give CompactCopyId button min-h-10 or a halo). Then audit a fresh untapped surface (onboarding/PLG flow, settings/billing pages, or any sheet/modal not yet measured) at 1440px + 390px against the canon.

## Cycle 27 — Lease detail mobile tab strip had no scroll affordance (D5)
- **Defect (carried from C25, D5):** `pages/leases/LeaseDetailPage.tsx` rendered its tab strip with plain `<TabsList className="... overflow-x-auto">`. On a 390px viewport the strip overflows (scrollWidth 397 > clientWidth 356) but gave NO visual cue that more tabs lay off-screen — a mobile user could miss the Amendment History / Document tabs entirely.
- **Fix:** Swapped the plain `TabsList` for the existing `ScrollableTabsList` primitive (already battle-tested in PropertyDetailPage), which wraps the triggers in a scroll container with soft left/right gradient fades that appear only on the clipped edge and hide at each end. Pure drop-in: same `TabsTrigger` children, dropped the now-redundant `overflow-x-auto`/`flex` className (handled internally). Updated the import.
- **Verify:** `tsc --noEmit` clean; `tabs.test.tsx` 19/19 pass. Live-verified at 390×844 on a lease detail page: container overflows (397>356); right fade opacity 1 + left fade 0 at start; after scrolling fully right the fades flip (right 0, left 1). PASS.
- **Cluster closed:** The C25 sub-40px help-icon cluster (C25 HelpTip, C26 RecoveryProfileEditor) and the C25 D5 tab-affordance item are all resolved. Remaining carried items: D3 (LeaseDetailPage `CompactCopyId` "Copy Lease ID" button 122×20, height under floor — secondary clipboard action) and D-breadcrumb (Properties breadcrumb icon-only link 16×16 at 390px, label sr-only).
- **NEXT:** Cycle 28 — fix D3 (give `CompactCopyId` a 40px min-height or invisible halo; it's an inline copy button in LeaseDetailPage ~lines 59-73). Then open a fresh audit on an untapped surface — candidates: the onboarding/PLG first-run flow, the settings & billing pages, the org/team members screen, or any Sheet/Dialog not yet pixel-measured — run it at 1440px + 390px against the canon (pill geometry, 40px touch floor, focus-visible ring parity, mobile overflow) and fix the clearest confirmed defect.

## Cycle 28 — "Copy Lease ID" button was a 20px tap target (D3)
- **Defect (carried from C25, D3):** `pages/leases/LeaseDetailPage.tsx` `CompactCopyId` helper (lines ~57-81) renders a clickable copy button (truncated id + 14px copy icon) at ~20px tall — under the 40px touch floor. Used for Lease ID and Unit ID on the Overview tab.
- **Fix:** Added `min-h-10` (40px) to the button plus a `focus-visible` ring for keyboard parity. The visible text/icon layout is unchanged; the row just gets a 40px hit area. Already had `rounded-full` (pill, canon).
- **Verify:** `tsc --noEmit` clean. Live-verified on a lease detail page: Copy Lease ID button rect height = 40px; screenshot confirms the Lease ID card still looks balanced (single natural row, not awkwardly tall).
- **C25 audit cluster fully closed:** D1 (C26), D5 (C27), D3 (C28), HelpTip (C25) all resolved. Only D-breadcrumb (Properties breadcrumb icon-only link 16×16 at 390px, label sr-only) remains from that sweep — low priority, secondary nav; carry forward.
- **NEXT:** Cycle 29 — open a FRESH audit on an untapped surface. Strong candidates not yet pixel-measured this goal: the onboarding/PLG first-run flow, settings & billing pages, org/team members screen, the global nav/sidebar at mobile, or any Sheet/Dialog footer action row. Run at 1440px + 390px against the canon (pill geometry; 40px touch floor; focus-visible ring parity, not plain focus:; mobile horizontal overflow scrollWidth>clientWidth; segmented [role=tab] ~32px is ACCEPTED, not a defect; text-input controls + clickable card containers are pill-exempt). Reject false positives against canon, then fix the single clearest confirmed defect and live-verify.

## Cycle 29 — Mobile bottom nav had no keyboard focus ring (fresh audit, DEFECT 1/HIGH)
- **Fresh audit (untapped surfaces):** Swept settings (profile/org/team/billing), admin feedback, mobile sidebar sheet, mobile bottom nav, desktop top bar/user menu at 1440px + 390px. Most surfaces CLEAN (form buttons 44px pills with focus-visible, Select triggers correctly pill-exempt, no mobile overflow). 3 confirmed defects surfaced.
- **Defect (this cycle, HIGH):** `components/layout/BottomNav.tsx` — all 5 primary nav buttons (Dashboard, Properties, Documents, Reconcile, More) had NO focus ring at all (className carried neither `focus:` nor `focus-visible:`). Keyboard users on mobile got zero focus indication on the most-used nav surface.
- **Fix:** Added `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset`. Used `ring-inset` (not offset) because the bar is fixed full-bleed at the viewport bottom — an offset ring would clip against the bar/screen edge.
- **Verify:** `tsc --noEmit` clean; `BottomNav.test.tsx` 14/14 pass. Live-verified at 390×844: className contains `focus-visible:ring-2`; focusing nav-properties matches `:focus-visible` and renders `box-shadow: rgb(49,69,119) 0 0 0 2px inset` (the --ring brand color); screenshot shows the ring clearly.
- **Carried forward (from this audit, for C30+):**
  - **DEFECT 2 (HIGH, same rule):** `components/layout/Header.tsx` ~line 118 — the mobile "Go to dashboard" logo button (`data-testid="logo-button"`, aria-label "Go to dashboard") has only hover/active classes, no focus-visible ring. Trivial same-style fix. DO NEXT.
  - **DEFECT 3 (MEDIUM):** `components/layout/NavItem.tsx` ~line 88 — nested sidebar sub-nav items (Settings: Profile/Organization/Team Members/Billing; Admin: Feedback) render at 32px (`py-1.5`), under the 40px floor. These are full nav buttons (NOT [role=tab]), so the compact-tab exemption does NOT apply. Fix: bump nested padding to `py-2`/`py-2.5` or add `min-h-[40px]` to the nested variant. Verify top-level items (50px) and active styling unaffected.
  - **D-breadcrumb (low):** Properties breadcrumb icon-only link 16×16 at 390px (label sr-only) — still open from C25 sweep.
- **NEXT:** Cycle 30 — fix DEFECT 2 (Header mobile logo button focus ring). Then Cycle 31 — DEFECT 3 (NavItem nested 32px → 40px). Then fresh audit on the next untapped surface (documents/ingestion list, reconciliation flow, dashboard widgets, or a Sheet/Dialog).

## Cycle 30 — Mobile header logo button had no keyboard focus ring (DEFECT 2/HIGH)
- **Defect (from C29 audit):** `components/layout/Header.tsx` ~line 118 — the mobile-only "Go to dashboard" logo/brand button (`data-testid="logo-button"`) carried only hover/active classes; no focus ring. Keyboard users got no indicator on the header home button.
- **Fix:** Added `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to the existing `onLogoClick && '...'` conditional — so the ring appears only on the clickable variant (when `onLogoClick` is provided), not when the logo is a non-interactive `cursor-default`. Offset ring is fine here (not a clipped edge, unlike the fixed bottom bar). `rounded-button` pill geometry already present.
- **Verify:** `tsc --noEmit` clean; `Header.test.tsx` 28/28 pass. Live-verified at 390×844: className contains `focus-visible:ring-2`; `:focus-visible` matches on focus; computed box-shadow is the two-layer ring (2px white offset + navy --ring); screenshot shows it clearly.
- **Carried forward:** DEFECT 3 (NavItem nested sub-nav 32px, MEDIUM) — DO NEXT (C31). D-breadcrumb (low) still open.
- **NEXT:** Cycle 31 — fix DEFECT 3: `components/layout/NavItem.tsx` ~line 88 nested sub-nav items render 32px (`py-1.5`); bump to `py-2`/`min-h-[40px]` to clear the 40px floor (these are full nav buttons, not [role=tab], so no compact exemption). Verify top-level items (50px) and active state unaffected, and that the accordion sub-items still align. Then fresh audit on the next untapped surface.

## Cycle 31 — Sidebar nested sub-nav items were 32px tap targets (DEFECT 3/MEDIUM)
- **Defect (from C29 audit):** the expanded Settings/Admin sidebar sub-nav items (Profile, Organization, Team Members, Billing, Feedback) rendered at 32px (`py-1.5`), under the 40px touch floor. They are full nav buttons (click replaces page content), NOT `[role=tab]` triggers, so the compact-tab exemption does not apply.
- **FOOTGUN (recorded for sweep trust):** I first edited `components/layout/NavItem.tsx` — WRONG component. The live sidebar is rendered by `components/layout/Sidebar.tsx` (its own internal nav-button, classes `group relative ... transition-all ... ease-out-expo ... pl-[2.75rem] hover:bg-surface-hover`), NOT the standalone `NavItem.tsx` (which uses `transition-colors duration-200 ... pl-10 hover:bg-accent`). Both expose `data-testid="nav-item-${id}"`, which masked the mistake. Caught it only because the live web agent dumped the rendered `className` and it didn't match my edit. Reverted NavItem.tsx (zero net change) and applied the fix to Sidebar.tsx. LESSON: when a fix "doesn't take" despite Vite serving the updated module, compare the rendered className against the file you edited — you may be editing a same-named twin.
- **Fix:** `Sidebar.tsx` line 130 — nested variant `'px-3 py-1.5'` → `'px-3 py-1.5 min-h-10'` (40px floor). Top-level items keep `py-2.5` (50px).
- **Verify:** `tsc --noEmit` clean; `Sidebar.test.tsx` 47/47 pass. Live-verified (fresh load): all 4 nested Settings sub-items measure height 40px / minHeight 40px; Dashboard top-level unchanged at 50px; screenshot confirms indentation/alignment still balanced.
- **C29 audit fully closed:** DEFECT 1 (C29), DEFECT 2 (C30), DEFECT 3 (C31) all resolved. Only D-breadcrumb (low) remains open from C25.
- **NEXT:** Cycle 32 — fresh audit on a NOT-yet-swept surface. Candidates: documents/ingestion list + upload flow, the reconciliation create/run flow, dashboard widgets/cards, the global command palette/search if any, or a specific Sheet/Dialog footer action row. Run at 1440px + 390px against the canon. When verifying a fix on a component, ALWAYS dump the rendered className from the live agent and confirm it matches the file you edited (see C31 footgun).

## Cycle 32 — Import-history file-name buttons were ~20px tap targets (fresh audit, documents/ingestion)
- **Surface:** `/ingestion?tab=history` import-history list. Fresh audit at 1440px + 390px found 2 candidate defects.
- **DEFECT 1 (accepted):** `components/ingestion/ImportHistoryList.tsx` — the clickable file-name buttons (open import details) rendered as ~20px-tall `block ... truncate` links, under the 40px touch floor. Two sites: the desktop row (line ~228) and the mobile card (line ~382).
- **Fix:** both buttons `block ... truncate` → `flex min-h-10 [min-w-0|w-full] items-center ...` and the file name wrapped in a `<span class="truncate">` (flex container breaks direct `truncate`, so the ellipsis moves to an inner span). Pill `rounded-full` + focus ring already present; unchanged.
- **DEFECT 2 (REJECTED, false positive):** `FileUploader` drag-drop drop zone uses `rounded-lg` with `role="button"`. Canon exempts clickable card/tile containers from pill geometry; a drag-drop upload zone is a container surface, not a CTA. No change.
- **Verify:** `tsc --noEmit` clean. Live web agent (fresh login + fresh nav): desktop button height 40px, mobile button height 40px; rendered classNames dumped and confirmed (`flex min-h-10 ... items-center rounded-full text-primary`); inner span keeps `truncate` (overflow:hidden + text-overflow:ellipsis verified) so long names still ellipsize. PASS both viewports.
- **Carried forward:** D-breadcrumb (low) — Properties breadcrumb icon-only link 16×16 at 390px (sr-only label), open since C25.
- **NEXT:** Cycle 33 — fresh audit on a not-yet-swept surface (reconciliation create/run flow, dashboard widgets/cards, or a Sheet/Dialog footer action row). Run at 1440px + 390px; always dump rendered className from the live agent and confirm it matches the edited file (C31 footgun).

## Cycle 33 — Tenant Filter panel icon buttons under 40px tap floor (reconciliation detail)
- **Surface:** reconciliation detail/run view, right-side "Tenant Filter" panel (`features/reconciliation/components/TenantSummary.tsx`). Fresh audit at 1440px + 390px.
- **DEFECT 1 (accepted, MEDIUM):** three icon-only buttons under the 40px touch floor — "Expand tenant summary" (32px, collapsed state), "Clear filter" (24px X, visible only when a tenant is selected), "Collapse tenant summary" (24px ChevronRight). None had a tap-area extension.
- **Fix:** invisible-halo technique on all three — added `relative before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']` so the effective tap area is 40x40 while the visible glyph stays 24/32px (keeps the panel header compact). Pill/focus already inherited from Button ghost variant.
- **DEFECT 2 (REJECTED):** the All / Pools / Tenants filter group renders at 32px as buttons without role=tab. This is the same compact segmented control pattern the canon accepts for [role=tab] at ~32px; inflating to 40px would make it inconsistent with the actual property-detail tabs and break the compact aesthetic. No change.
- **DEFECT 3 (REJECTED):** Properties table column-sort header buttons render at 32px (h-8). Data-table header sort toggles are secondary utility controls and the de-facto compact pattern; the 40px floor targets PRIMARY controls. No change. (Agent itself rated LOW / typical data table pattern.)
- **Verify:** tsc --noEmit clean; TenantSummary.test.tsx 26/26 pass. Live web agent (fresh nav into Harbor Point Center 2024 recon, exercised all three button states): each ::before measured 40x40 absolute with non-empty content; classNames dumped and confirmed; visible boxes stayed 24/32px. PASS all three.
- **Carried forward:** D-breadcrumb (low) — Properties breadcrumb icon-only link 16x16 at 390px (sr-only label), open since C25.
- **NEXT:** Cycle 34 — fresh audit on a not-yet-swept surface (dashboard widgets/cards interactions, a Sheet/Dialog footer action row, settings sub-pages internals, or the tenant-portal screens). 1440px + 390px; dump rendered className from the live agent and confirm it matches the edited file (C31 footgun).

## Cycle 34 — Dialog + Sheet close button used plain focus:, near-invisible 30% ring (settings/modals audit)
- **Surface:** every Radix Dialog and Sheet across the app (shared primitives `components/ui/dialog.tsx` + `components/ui/sheet.tsx`). Fresh audit of settings sub-pages + modals at 1440px + 390px.
- **DEFECT (accepted, HIGH, canon rule 3):** both shared close (X) buttons used `focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2` — plain `focus:` (fires on mouse-click, and diverges from the `focus-visible:` pattern every other button uses) AND `ring-ring/30` (30% opacity, near-invisible on light backgrounds). Affects the close affordance on EVERY dialog/sheet.
- **Fix:** both → `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (focus-visible only, full-opacity ring). Geometry already correct (`h-10 w-10 rounded-full`).
- **Audit otherwise clean:** all settings CTAs (Save/Cancel/Change Password/Delete/Billing/Invite) 44px pills with correct focus-visible rings; team Revoke icon button 40×40 pill; settings sub-nav 40px; bottom nav/header buttons 44px; combobox/select triggers and [role=tab] strips correctly exempt. No mobile overflow. Only this one shared-primitive defect found.
- **Verify:** tsc --noEmit clean; dialog.test.tsx 35/35 + sheet.test.tsx 11/11 pass. Live web agent (fresh nav, opened Invite Member dialog + HelpDrawer sheet): both classNames dumped and confirmed (focus-visible:ring-2 + ring-ring full-opacity, no bare focus:, no /30, h-10 w-10 rounded-full); keyboard-focused boxShadow is the full two-layer ring (2px white offset + 4px brand #314577), not a faint 30% one. PASS both.
- **Carried forward:** D-breadcrumb (low) — Properties breadcrumb icon-only link 16×16 at 390px (sr-only label), open since C25.
- **NEXT:** Cycle 35 — fresh audit on a not-yet-swept surface (dashboard widget interactions, tenant-portal screens, document/extraction detail view, or the global empty/error states). 1440px + 390px; dump rendered className from the live agent and confirm it matches the edited file (C31 footgun).

## Cycle 35 — Trial banner dismiss + extraction-verify action controls (documents/empty-state audit)
- **Surfaces:** free-trial banner (App.tsx, every authenticated page); extraction verification page `/verify/:documentId` (EditableField confirm button + draft-save Retry link). Fresh audit of documents/extractions + empty states + 404 at 1440px + 390px.
- **DEFECT 1 (accepted, HIGH):** `App.tsx` trial-banner "✕" dismiss button rendered 11×20px with `borderRadius:0` and NO focus ring — failed touch (canon 1), pill (canon 2), and focus-ring (canon 3) all at once. Fix: `flex h-10 w-10 shrink-0 items-center justify-center rounded-full ... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (+ hover:bg-surface-hover). Live-verified 40×40 circular, ring classes present, no banner overflow at desktop/mobile (flex-col stack < 640px).
- **DEFECT 2 (accepted, HIGH):** `features/verification/components/EditableField.tsx` per-field "Looks right?" confirm Button had a `h-7` (28px) className override clobbering its `size="sm"` (which is `h-10`=40px). The sibling "View source" ghost button already renders 40px, so they were misaligned. Fix: dropped the `h-7` token (kept `gap-1 px-2 text-xs`) → restores 40px and aligns the row. Repeated control on the HITL extraction-review surface.
- **DEFECT 3 (accepted, MEDIUM):** `pages/extractions/VerificationPage.tsx` inline "Retry" draft-save link (error state only) had `className="underline"` with no focus ring. Fix: `rounded-sm underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Kept inline (no 40px box) — it's a minor inline text affordance inside a sentence, not a primary control; the canon's touch floor targets primary controls and a 40px box would distort the error line.
- **DEFECT 4 (REJECTED):** `pages/NotFound.tsx` 404 "Quick Links" use `<Card role="button" tabIndex=0>` at `rounded-lg`. Canon explicitly EXEMPTS clickable card/tile container surfaces from pill geometry; these are tile containers (88px tall) and already carry a correct focus-visible ring. No change.
- **Verify:** tsc --noEmit clean; EditableField + App suites 83/83 pass. D1 live web agent: 40×40 circular, className dumped + confirmed, no overflow. D2/D3 verified by source review + tests (their `/verify` surface needs an uploaded lease PDF absent from the e2e account — same reason the audit located them statically).
- **Carried forward:** D-breadcrumb (low) — Properties breadcrumb icon-only link 16×16 at 390px (sr-only label), open since C25.
- **NEXT:** Cycle 36 — fresh audit on a not-yet-swept surface (tenant-portal screens, dashboard widget interactions, or the properties create/edit forms). When extraction data exists, live-verify D2/D3 on /verify. 1440px + 390px; always dump rendered className from the live agent and confirm it matches the edited file (C31 footgun).

## Cycle 36 — Mobile reconciliation FilterChip: no focus ring + 32px (property-forms/wizard audit)
- **Surface:** mobile-only reconciliation grid view, the "All (N) / Pools (N) / Tenants (N)" filter chip row (`pages/reconciliation/components/ReconciliationMobileView.tsx`, `FilterChip`). Fresh audit of property create/edit + lease + wizard at 1440px + 390px.
- **DEFECT 1 (accepted):** the `FilterChip` toggle buttons (`aria-pressed`, NOT `role=tab`) rendered at 32px with NO `focus-visible` ring at all. The missing focus ring is an unambiguous canon-3 violation — no exemption covers a real button with zero focus indicator.
- **Fix:** added `min-h-10` (40px floor) + `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Pill `rounded-full` already present.
- **Note — revises C33's touch-target stance for THIS control:** in C33 I rejected inflating the All/Pools/Tenants toggle to 40px, treating it as a compact segmented pattern. C36 re-examination: on the phone this FilterChip is the SOLE, primary, touch-first filter affordance (the desktop has a separate Tenant Filter sidebar; the phone does not), so the 40px floor genuinely applies here. The compact-segmented exemption is for `[role=tab]` / secondary desktop-dense controls, not a primary touch-first mobile filter. The focus ring was needed regardless. Live screenshot confirms the row still reads as a tidy compact chip row at 40px, not awkwardly tall.
- **Audit otherwise clean:** property create/edit (Cancel/Create/Update 44px pills + focus rings; State/BOMA selects exempt), lease create (Cancel/Create 44px; 6 inline help icons have 40×40 ::before halos — exempt), reconciliation wizard (Back/Run/Finalize/Export/Re-run/Variance/Denominator all 40–44px pills with focus rings), no mobile overflow. Only this one defect.
- **Verify:** tsc --noEmit clean; ReconciliationMobileView.test.tsx 25/25 pass. Live web agent (390px, fresh nav into Harbor Point Center 2024 recon mobile grid): all three chips 40px; className dumped + confirmed (min-h-10 + rounded-full + focus-visible ring trio); keyboard-Tab boxShadow is the full two-layer ring (2px white + 4px brand #314577); screenshot shows tidy compact row, no overflow. PASS.
- **Carried forward:** D-breadcrumb (low) — Properties breadcrumb icon-only link 16×16 at 390px (sr-only label), open since C25.
- **NEXT:** Cycle 37 — fresh audit on a not-yet-swept surface (tenant-portal screens via a tenant login, dashboard widget interactions, or notifications/toasts). 1440px + 390px; always dump rendered className from the live agent and confirm it matches the edited file (C31 footgun).

## Cycle 37 — User menu dropdown items: sub-40px tap target + missing ring-offset (Header.tsx)
- **Surface:** dashboard + global chrome audit (web agent, 1440px + structural 390px). Stat-card CTAs, Getting Started checklist, Quick Actions, Reconciliation Status card, sidebar nav (12 items), header help/user-menu/trial-banner buttons — ALL PASS (pill + 40-50px + focus ring). Toasts: notification region present but no toast firable from this surface; deferred.
- **DEFECT 1 (accepted):** custom user-menu dropdown "Settings" + "Log out" `role=menuitem` buttons (`components/layout/Header.tsx` lines 234-272) measured 38px tall (`py-2.5` + ~18px text). Below the 40px floor.
- **DEFECT 2 (accepted):** same two buttons had `focus-visible:ring-2 focus-visible:ring-ring` (and `...ring-destructive`) but were MISSING `focus-visible:ring-offset-2`, so the keyboard ring sat flush on the edge with no white gap (canon-3 partial).
- **Fix:** added `min-h-[40px]` to both base classNames and appended `focus-visible:ring-offset-2` to both focus rules. Pill (`rounded-button`) already present.
- **Verify:** tsc --noEmit clean; Header.test.tsx 28/28 pass. Live web agent (fresh menu open): both items 40px tall; classNames dumped + confirmed (min-h-[40px] + ring-offset-2 present on both); keyboard-Tab boxShadow shows the two-layer offset ring (2px white gap + 4px brand #314577 on Settings, 4px destructive #ef4343 on Log out). PASS.
- **Carried forward:** D-breadcrumb (low, since C25); toast/notification close button still un-audited (needs a toast-producing action).
- **NEXT:** Cycle 38 — trigger a toast (e.g. an action that fires a success/error notification) and audit its close button; or sweep tenant-portal screens via a tenant login. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 38 — Focus-ring parity sweep + toast had no close button (shared UI primitives)
- **Surface:** toast/notification, property create/edit form (tabs + selects), Properties list + property detail (tabs, pagination), global nav. Web audit 1440px + structural 390px.
- **DEFECT A-1 (accepted):** toasts had NO dismiss/close button. `sonner.tsx` defined a `closeButton` className but never passed the `closeButton` prop to `<Sonner>`, so it was dead code; toasts could only auto-dismiss (5s). Fix: added `closeButton` prop + `group-[.toast]:rounded-full` so the close button is circular. Live-verified: X close button present, rounded-full, click dismisses. (Sonner renders it at its default 20px in the toast corner — supplementary control with the 5s auto-dismiss as the primary path and library-controlled sizing, so left at default rather than force-inflated to 40px.)
- **DEFECT B-1/C-4 (accepted):** `tabs.tsx` TabsTrigger focus ring was `ring-ring/30` (30% opacity = too faint, an explicit canon-3 defect). Fix: `ring-ring/30` -> `ring-ring`. Live boxShadow now full-opacity two-layer ring. Covers all tab strips (create-property tabs, all 5 property-detail tabs).
- **DEFECT B-2/C-2 (accepted):** `select.tsx` SelectTrigger used `focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-0 focus:border-primary` — `focus:` fires on mouse-open (noise) AND 30% faint AND no offset gap. Fix: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-primary`. Updated select.test.tsx assertion `focus:ring-2` -> `focus-visible:ring-2`. Covers EVERY Select/combobox app-wide. Live two-layer offset ring confirmed.
- **DEFECT C-5 (accepted):** sidebar/nav focus rings used `ring-offset-1` (1px gap) vs canon `ring-offset-2`. Fix in NavItem.tsx, Sidebar.tsx, Breadcrumbs.tsx -> `ring-offset-2`. (Left `features/reconciliation/utils/focus-utils.ts` ring-offset-1 alone — separate module with a test asserting it; different control family.)
- **REJECTED (recorded):** C-1 DataTable sort-header buttons 32px no halo -> re-affirming C33's ruling: secondary data-table compact pattern, accepted (NOT a defect). C-3 table-row `ring-inset` + C-6 mobile-bottom-nav `ring-inset` -> deliberate anti-clip pattern: a focusable full-width row / screen-edge nav button would have an outset ring clipped by overflow, so ring-inset is the correct choice there; exempt. C-2 rows-per-page select 32px geometry -> compact secondary pagination control, accepted (ring fix already applied via select.tsx).
- **Verify:** tsc --noEmit clean; impacted tests 166/166 (select 22, tabs, sonner, NavItem, Sidebar, Breadcrumbs) after updating the one stale select assertion. Live web agent: all 5 checks PASS (toast close rounded-full + dismisses; select + tabs + sidebar all show full-opacity two-layer offset ring; no ring-ring/30 or ring-offset-1 remaining on the audited controls).
- **Carried forward:** D-breadcrumb (low, since C25); toast close-button default 20px size (minor, library-controlled).
- **NEXT:** Cycle 39 — sweep TENANT-PORTAL screens via a tenant login (separate party), or the documents/extraction verification flow. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 39 — Skip-to-main link used mouse-firing focus: + wrong ring token (App.tsx)
- **Surface:** Settings (Profile/Organization/Team/Billing), Documents (Upload GL/Leases/Extractions/Rent Roll), Billing/subscription. Web audit 1440px + structural 390px. Nearly all PASS: every CTA pill + 40-44px + correct focus-visible ring; 24px help-icon buttons carry verified 40x40 ::before halos; Billing "choose your plan" role=button is a card-header tile (exempt); upload drop zones + Select triggers exempt; [role=tab] ~32px segmented controls exempt.
- **DEFECT S-1 (accepted):** the global "Skip to main content" link (`App.tsx` ~line 177) used standalone `focus:` utilities for its reveal + ring AND `focus:ring-primary` (wrong token vs canon `ring-ring`). `focus:` reveals/styles on any focus including programmatic/mouse; canon-3 wants `focus-visible:`. Fix: swapped every `focus:` -> `focus-visible:`, `ring-primary` -> `ring-ring`, added `focus-visible:outline-none` + `focus-visible:ring-offset-2`. Also aligned the DEAD `.skip-link` class in `index.css` (defined but never referenced) for future use: `focus:` -> `focus-visible:`, `rounded-md` -> `rounded-full`, added the ring trio.
- **Verify:** tsc --noEmit clean; App.test.tsx 43/43 pass. Live web agent (keyboard Tab from document.body): skip link becomes a real visible 185x40px pill at top-left (was 1x1 sr-only); className confirmed focus-visible-only (no standalone focus:, no ring-primary) with rounded-full + ring-ring + ring-offset-2; boxShadow shows the two-layer offset ring (2px white + 4px brand #314577). PASS. Bonus: 40px tall meets the touch floor.
- **Carried forward:** D-breadcrumb (low, since C25); toast close-button default 20px (minor, library-controlled).
- **NEXT:** Cycle 40 — sweep the TENANT-PORTAL (separate party login) or the documents/extraction VERIFICATION review screen (`/verify/:documentId`, needs uploaded data) and reconciliation results/variance drilldowns. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 40 — Reconciliation results: two interactive controls with no focus ring (TenantSummary + ReconciliationGrid)
- **Surface:** reconciliation RESULTS view (Test Plaza Shopping Center, year 2024) — the results grid plus the right-hand "Tenant Filter" sidebar and per-row "View calculation trace" icon buttons. Web audit 1440px + structural 390px.
- **DEFECT 1 (accepted):** the Tenant Filter sidebar buttons (`features/reconciliation/components/TenantSummary.tsx` `TenantRow`, ~287×56px, `aria-pressed` + `aria-label`, `rounded-full`) had NO `focus-visible` ring at all — focused boxShadow was `none`. Unambiguous canon-3 violation (real button, zero focus indicator). Fix: appended `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` to the `cn(...)` base.
- **DEFECT 2 (accepted):** the per-row "View calculation trace" eye-icon button (`features/reconciliation/components/ReconciliationGrid.tsx`, `data-testid="trace-button"`, 40×40 circular `rounded-full`) had NO focus ring AND was `opacity-70` until row group-hover, so a keyboard user tabbing to it got neither a ring nor full opacity. Fix: appended `focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- **REJECTED (recorded):** the results grid rows use `focus-visible:ring-inset` — deliberate anti-clip pattern (full-width focusable row inside `overflow-auto`; an outset ring would be clipped). Exempt, consistent with C38's table-row ruling.
- **Verify:** tsc --noEmit clean; TenantSummary.test.tsx 26 + ReconciliationGrid.test.tsx 32 = 58/58 pass. Live web agent (fresh nav into a reconciliation results view, 1440px): both classNames dumped + confirmed to contain the full focus-visible token set (trace button also has `focus-visible:opacity-100`); keyboard-focus boxShadow on both is the two-layer offset ring (2px white #ffffff + 4px brand #314577). Both were `none` before. PASS.
- **Carried forward:** D-breadcrumb (low, since C25); toast close-button default 20px (minor, library-controlled).
- **NEXT:** Cycle 41 — sweep the TENANT-PORTAL (separate party login) or the documents/extraction VERIFICATION review screen (`/verify/:documentId`, needs uploaded data), or empty-state/loading skeletons on reconciliation screens. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 41 — Faint focus-ring cluster across form primitives + ImportHistoryList (documents/empty-state audit)
- **Surface:** Documents (GL/Leases/Extractions/Rent Roll upload + History list + row actions), Properties list + search, reconciliations empty/list states, delete-confirmation modal, 404 quick-link cards, notification prompt. Web audit 1440px (real keyboard-Tab modality, matchesFV confirmed per finding).
- **Audit was mostly PASS** (header/nav/sidebar/sub-nav, all CTA pills 40–50px with canonical rings, tabs/selects/cards exempt, icon buttons 40×40 or with ::before halos, modal Cancel/Delete pills). Defects were all in SHARED primitives — high blast radius.
- **DEFECT 1 (accepted):** the `ring-ring/30` faint-ring defect (30% opacity, explicit canon-3 violation — same bug fixed in `select.tsx` during C38 but never propagated) was still live in SEVEN primitives: `input.tsx` (+`ring-offset-0`), `textarea.tsx` (+`ring-offset-0`), `switch.tsx`, `slider.tsx`, `checkbox.tsx`, `toggle.tsx`, `radio-group.tsx`. Fix: `ring-ring/30` → `ring-ring` (full opacity) across all seven. On the two text inputs (`input`/`textarea`) also `ring-offset-0` → `ring-offset-2` (they already carry `ring-offset-background`), matching the select.tsx C38 fix so every text-input control now shows the canonical two-layer offset ring. Error states `ring-destructive/30` → `ring-destructive` on input + textarea for parity.
- **DEFECT 2 (accepted):** `radio-group.tsx` also used plain `focus:outline-none` (fires on mouse-click) → `focus-visible:outline-none`.
- **DEFECT 3 (accepted):** `ImportHistoryList.tsx` GL-history filename buttons (lines 228, 382) had `focus-visible:ring-ring` but NO offset, so the ring sat flush with no white gap. Fix: added `ring-offset-background` + `focus-visible:ring-offset-2`. Now canonical two-layer ring.
- **Blast radius:** every Input/Textarea/Switch/Slider/Checkbox/Toggle/RadioGroup app-wide, plus GL import-history filename links. With C38's select.tsx fix, the entire form-control primitive family now shares the full-opacity two-layer offset ring.
- **Verify:** tsc --noEmit clean; impacted suites 137/137 pass (input, textarea, switch, slider, checkbox, toggle, radio-group, ImportHistoryList) after updating two stale textarea assertions (`ring-offset-0`→`ring-offset-2`, `ring-destructive/30`→`ring-destructive`). Live web agent dumped each className + focused boxShadow as proof (the /30 controls measured `rgba(49,69,119,0.3)` faint ring pre-fix; filename buttons measured `0 0 0 0px white` no-gap pre-fix).
- **Carried forward:** D-breadcrumb (low, since C25); toast close-button default 20px (minor, library-controlled).
- **NEXT:** Cycle 42 — live-verify the primitive ring fixes on a real form (property create/edit text inputs + any checkbox/switch/radio), then sweep TENANT-PORTAL (separate party login) or the extraction VERIFICATION review screen. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 42 — Live-verify C41 primitive fixes + recover a churn-dropped edit
- **JOB 1 (verify C41):** live web agent (1440px, real keyboard-Tab modality) confirmed the form-primitive ring fixes from a2c41968 are live: property-create text Input, date/number inputs, select triggers all now render the canonical two-layer offset ring (`rgb(255,255,255) 0 0 0 2px, rgb(49,69,119) 0 0 0 4px`) — ZERO `ring-ring/30` / `ring-offset-0` / 0.3-opacity rings remaining anywhere on the audited forms. PASS.
- **CHURN RECOVERY (the real finding):** the agent flagged the `ImportHistoryList.tsx` GL-history filename button as STILL missing `ring-offset-2`. Investigation: my C41 working-tree edit to that file had been reverted by a parallel-session `git reset --hard` BEFORE the C41 commit, and because the pathspec commit only stages explicitly-listed paths with changes, the unmodified file was silently dropped from a2c41968 (the other 8 files committed fine). Re-applied both filename-button edits (`ring-offset-background` + `focus-visible:ring-offset-2`, lines 228/382), staged IMMEDIATELY to beat the churn window, ImportHistoryList.test.tsx 26/26 pass, committed as **1afcb8a9** (cycle 41b) and verified both `ring-offset-2` occurrences are present in the committed blob. Now durable in git.
- **JOB 2 (fresh form audit):** property create + property edit + lease create forms otherwise fully PASS — all buttons pills ≥44px with canonical rings, text/date/number inputs + selects with correct two-layer ring, help-icon buttons with ::before hit-area + correct ring. No new defects.
- **Footgun reinforced:** after a pathspec commit, ALWAYS verify each intended file actually landed via `git show <sha> --stat` — a churn-reverted working-tree edit produces NO staged change and is dropped silently with no error. (Lesson: stage early, verify the commit's file list, not just the SHA.)
- **Carried forward:** D-breadcrumb (low, since C25); toast close-button default 20px (minor, library-controlled).
- **NEXT:** Cycle 43 — sweep a genuinely new surface: TENANT-PORTAL (separate party login) or the extraction VERIFICATION review screen (`/verify/:documentId`, needs uploaded data), or reconciliation loading/skeleton states. 1440px + 390px; always dump rendered className from the live agent (C31 footgun).

## Cycle 43 — Variance slider had no design-system ring + GroupHeader toggle below touch floor (calc-trace/variance audit)
- **Surface:** calculation-trace Sheet (opened from the C40 trace button), Variance Report panel, Denominator Changes, expense-pool GroupHeader toggles, grid rows, all reconciliation-results page chrome. Web audit 1440px + 390px, real keyboard-Tab modality.
- **DEFECT 1 (accepted):** the Variance Report threshold slider (`features/reconciliation/components/VarianceReport.tsx` line 84, `<input type=range data-testid=threshold-slider>`) had className `w-full cursor-pointer accent-primary` — NO design-system focus ring at all; keyboard-focus fell through to the browser's thin 1.6px native outline (boxShadow `none`). Canon-3 violation, no exemption (native range is a primary interactive control, not in the compact-accepted list). Fix: added `rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- **DEFECT 2 (accepted):** the expense-pool GroupHeader expand/collapse toggle (`features/reconciliation/components/GroupHeader.tsx` line 46) was `<Button size=sm className="h-6 w-6 p-0">` = 24×24px with NO `before:` halo, while EVERY sibling 24px icon button in this surface (Help-information ×4, Collapse-tenant-summary) carries the `before:h-10 before:w-10` 40px tap-area compensator. Below the 40px floor. Fix: added the canonical `relative before:absolute before:left-1/2 before:top-1/2 before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']` halo (matching the established pattern). The toggle has a proper `focus-visible` ring via the Button base; only the tap area was deficient.
- **Audit otherwise PASS:** trace Sheet X-close (40×40 pill, two-layer ring) + Print Summary (40px pill); all Variance/Denominator/Export buttons 40px pills with rings; trace buttons ×3 40×40 (C40 fix holding); grid rows ring-inset exempt; help-icon halos all present; breadcrumb links ring OK. Trace Sheet 500px right-flush no overflow at 1440px; mobile 390px stacks to cards with 1px-tolerance width (no horizontal overflow).
- **Noted (not a canon defect):** at 390px the grid card layout omits the "View calculation trace" eye button entirely — mobile users can't open the trace. Feature-access gap, logged for product consideration, not a focus/pill/size fix.
- **Verify:** tsc --noEmit clean; GroupHeader.test.tsx 14 + VarianceReport.test.tsx 9 = 23/23 pass. Staged immediately post-edit to beat churn (C42 footgun).
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); NEW: mobile trace-button access gap (product, low).
- **NEXT:** Cycle 44 — sweep TENANT-PORTAL (separate party login) or extraction VERIFICATION (`/verify/:documentId`, needs uploaded data), or settings/team-management forms. 1440px + 390px; dump rendered className from the live agent (C31 footgun); verify each file lands in the commit via `git show <sha> --stat` (C42 footgun).

## Cycle 44 — Settings surfaces verified CLEAN (Profile / Organization / Team / Billing)
- **Surface:** Settings → Profile, Organization, Team Members (+ invite dialog + revoke AlertDialog), Billing. Web audit 1440px, real keyboard-Tab modality, rendered className + getBoundingClientRect + focused boxShadow dumped per control.
- **Result:** ZERO defects. Every button is a pill (`rounded-button`=9999px / `rounded-full` icon buttons); every reachable control shows the canonical two-layer ring (`rgb(255,255,255) 0 0 0 2px, rgb(49,69,119) 0 0 0 4px`) on real Tab; all primary controls ≥40px. Text inputs/role-select use `rounded-lg` (pill-exempt) with correct ring. Profile: name + 3 password inputs (798×44) + DELETE-confirm input, Save/Cancel/Change-Password/Link-Google/Delete-Account buttons all pills with rings. Organization: name input, Copy-Support-ID 44×44 circular ring, Save/Cancel. Team: Invite-Member 160×44 pill, 5× revoke-invite 40×40 pills with confirmed ring, invite dialog (email Input, role Select combobox, Cancel/Send pills, 40×40 close), revoke AlertDialog (Cancel/Revoke pills). Billing: Change-Plan/Cancel-Subscription pills with rings. This is the C41 form-primitive ring propagation paying off — these surfaces inherited the fix.
- **Notes (non-defects):** member-row role-change Select + remove-member ghost button not rendered in current org (only owner/self member) but source carries correct ring classes (`TeamMembersPage.tsx` 465-493). Latent class cruft on `AlertDialogAction` (stacks non-functional gradient + `bg-destructive`) — cosmetic only, no UX impact, no focus effect. No Notifications/Preferences toggle UI exists in Settings (surface not implemented) — nothing to audit there.
- **Verify:** no code change this cycle (audit-only clean pass); no tests to run.
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor, library-controlled); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 45 — TENANT-PORTAL (needs separate party login creds) or extraction VERIFICATION (`/verify/:documentId`, needs uploaded data), or reconciliation loading/skeleton states. 1440px + 390px; dump rendered className from the live agent (C31 footgun); verify each file lands in the commit via `git show <sha> --stat` (C42 footgun).

## Cycle 45 — Dashboard + global nav chrome verified CLEAN
- **Surface:** post-login Dashboard/home + global chrome (top nav, sidebar, dashboard body CTAs/cards/table actions). Web audit 1440px, single-evaluate inventory of 22 focusable elements + real keyboard-Tab boxShadow on every suspect.
- **Result:** ZERO defects. Top nav help-icon (44×44 `rounded-button`=9999px) + user-menu (44×150) show canonical two-layer ring on Tab. Skip-to-content link `focus-visible:not-sr-only` + ring. All 11 sidebar nav buttons `rounded-full` 50px with `ring-2 ring-ring ring-offset-2`. Dashboard body: "Review reconciliations" primary CTA (48px pill), 4 quick-action links (44px `rounded-full`), "Review" table action (44px), "View All Reconciliations" (48px) — all canonical rings. Stat cards non-interactive (not focus-audited). No sidebar collapse control exists at 1440px (permanently expanded, chevrons inside buttons).
- **Verify:** audit-only clean pass; no code change, no tests.
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 46 — Documents/upload surface (drag-drop zone, file list, upload CTAs, extraction-status chips) at 1440px + 390px. Dump className from live agent (C31 footgun); verify each file lands via `git show <sha> --stat` (C42 footgun).

## Cycle 46 — File upload drop-zone had NO focus ring (Documents/upload audit)
- **Surface:** Documents/ingestion — drag-drop upload zone, Upload/History tabs, file-list rows, extraction-status surface. Web audit 1440px + 390px spot-check, single-evaluate inventory + real keyboard-Tab boxShadow.
- **DEFECT (accepted):** the drag-drop upload zone (`components/ingestion/FileUploader.tsx` line 102, `<div role=button data-testid=file-upload-zone>`) had className `border-2 border-dashed rounded-lg p-8 ... cursor-pointer transition-all hover:...` with NO focus ring in any state. Real keyboard Tab (`:focus-visible`=true) gave boxShadow `none` + only the browser's native 1.6px outline. A clickable card/tile is PILL-EXEMPT (rounded-lg stays) but is NOT ring-exempt — a keyboard user tabbing to the primary upload affordance got no design-system focus indicator. Fix: added `'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'` as a second cn() line (offset-bg first so the white gap renders).
- **Audit otherwise PASS:** Upload/History [role=tab] 32px `rounded-full` (compact-accepted) canonical ring; Help-info 24px icon with `before:h-10` halo + ring; property/filter comboboxes `rounded-lg` 44px input-exempt with ring; History filename buttons 40px `rounded-full` two-layer ring (C41b holding); View-details + Delete-import 40×40 `rounded-button` canonical; Extractions Enable-Notifications/Dismiss/Review/status-filter all canonical. 390px `/ingestion` no horizontal overflow; bottom-nav 76×56 ≥40px.
- **Note (not a defect):** `/ingestion/extractions` 404s but is unreachable from nav (sidebar "Extractions" → `/extractions`, the correct live route). No user-path impact.
- **Verify:** tsc --noEmit clean; FileUploader.test.tsx 25/25 pass. Staged immediately post-edit (C42 footgun).
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 47 — reconciliation/disputes list EMPTY + LOADING states, or Analysis/Tax-Protest surfaces. 1440px + 390px; verify each file lands via `git show <sha> --stat` (C42 footgun).

## Cycle 47 — Dispute card rows used plain focus: (Disputes/Analysis/Tax-Protest audit)
- **Surface:** Disputes list + detail, Analysis (Year-over-Year / Trends / Compare), Tax Protest. Web audit 1440px + 390px spot-check, per-page single-evaluate inventory + real keyboard-Tab boxShadow.
- **DEFECT (accepted):** dispute card rows (`features/disputes/pages/DisputesListPage.tsx` line 217, `DisputeCard` `<div role=button tabIndex=0>`) used `focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2` — plain `focus:` FIRES ON MOUSE-CLICK, so the two-layer ring flashed on every pointer click, not just keyboard nav. 325×146 interactive card, no exemption (not Radix roving, not screen-edge, not ring-inset full-width row). Fix: swapped to `ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (offset-bg first for the white gap). Ring geometry was already correct — only the trigger modality was wrong.
- **Audit otherwise PASS (all four areas):** Disputes filter-by-status combobox 44px `rounded-lg` ring; status badges `rounded-full`; no "New Dispute" CTA by design (tenant-originated). Disputes detail: back/Generate-Demand-Letter/Update-Status/Add-Comment buttons 44px pills `focus-visible:`, status select, textarea, mark-internal checkbox all canonical. Analysis YoY/Trends/Compare: property + 3 trend selects 44px `rounded-lg`, Compare/Export-PNG 44px pills, sub-nav `rounded-full` pills, show-trendline checkbox — all `focus-visible:` canonical; Compare empty-state Go-Back/Go-to-Dashboard pills. Tax Protest: Configure link-button 44px pill canonical. 390px Disputes no horizontal overflow.
- **Verify:** tsc --noEmit clean; DisputesListPage.test.tsx 10/10 pass. Staged immediately post-edit (C42 footgun).
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 48 — Portfolio + Properties detail/expense-pools surfaces, or modal/dialog inventory (any not-yet-opened dialogs). Sweep for more plain-`focus:` (vs `focus-visible:`) instances repo-wide as a candidate batch. 1440px + 390px; verify each file lands via `git show <sha> --stat`.

## Cycle 48 — repo-wide plain-focus: sweep → 2 HITL /verify modality fixes
- **Method:** static grep batch (not a live agent) — `focus:(outline-none|ring-2|ring-ring|ring-offset|border-)` across all frontend `*.tsx`, to catch the C47 defect class (plain `focus:` ring fires on mouse-click) on surfaces the live agent can't reach (HITL `/verify` needs uploaded extraction data). 5 hits triaged.
- **DEFECT 1 (accepted):** verification panel resize handle (`components/hitl/VerificationLayout.tsx` line 133, `<div role=separator tabIndex=0 data-testid=resize-handle>`) used `focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2` — plain `focus:` flashed the ring on mouse-down (drag start), competing with the `isDragging && bg-primary` drag feedback. Fixed to `ring-offset-background focus-visible:...` (keyboard-only ring; mouse drag keeps its bg-primary cue).
- **DEFECT 2 (accepted):** document source-highlight overlay (`components/hitl/BoundingBoxOverlay.tsx` line 90, `<button data-testid=bbox-${field}>`) used plain `focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2` — ring fired on every click of the source box. Fixed to `focus-visible:`. Kept `ring-primary` (component-local: matches its `isActive && ring-2 ring-primary` highlight palette, not the form-family `ring-ring`).
- **TRIAGED — NOT defects:** `Header.tsx` lines 240/260 use `focus:bg-* focus:outline-none focus-visible:ring-2 ...` — the canonical Radix menu-item pattern (focus bg on roving, ring only on `focus-visible`); correct, left as-is. `EditableCell.tsx` line 117 plain `focus:ring` is on an `<input>` in explicit edit mode (auto-focused, `border-2 border-primary` edit indicator) — inputs conventionally show focus styling on intentional click; not a keyboard-modality defect, left as-is.
- **Verify:** tsc --noEmit clean; VerificationLayout.test.tsx 19 + BoundingBoxOverlay.test.tsx 23 = 42/42 pass. Staged immediately post-edit (C42 footgun).
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 49 — Portfolio + Properties detail/expense-pools live audit, or a repo-wide grep for `ring-ring/30` / missing `ring-offset` residue. Verify each file lands via `git show <sha> --stat` (C42 footgun).

## Cycle 49 — Pool-picker property card link had NO focus ring (Portfolio/Properties/Pools audit)
- **Surface:** Portfolio, Properties detail, Expense Pools. Web audit 1440px + 390px spot-check, per-page single-evaluate inventory + real keyboard-Tab boxShadow.
- **DEFECT (accepted):** the Expense-Pools property-picker card link (`pages/pools/PoolsPage.tsx` line 173, `<a href=/properties/:id#pools>`) had className `rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40` — a focusable clickable card with NO focus ring at all (keyboard Tab → boxShadow `none`). Card surface is pill-exempt but NOT ring-exempt. Fix: appended `ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.
- **Audit otherwise PASS:** all other Portfolio/Properties/Pools CTAs, table rows, sort headers, tabs, modals, filter inputs passed (pills ≥40px with canonical rings; inputs/selects rounded-lg with ring; no plain-`focus:` residue found on this surface). 390px no horizontal overflow.
- **Verify:** tsc --noEmit clean; PoolsPage.test.tsx 12/12 pass. Staged immediately post-edit (C42 footgun).
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 50 — repo-wide grep for clickable `<a>`/`<div role=button>`/`tabIndex={0}` cards lacking any `focus-visible:ring` (the C46/C49 defect class), as a batch; or live audit of any remaining modal inventory. Verify each file lands via `git show <sha> --stat` (C42 footgun).

## Cycle 50 — static role=button/tabIndex sweep → 1 tooltip-wrapper ring fix (+ C49 commit recovery)
- **Method:** grepped all 19 frontend `*.tsx` with `role="button"` / `tabIndex={0}`, delegated a lite static-read of the 13 not-yet-audited files to classify each custom-clickable element (no-ring / plain-focus / faint / exempt / OK).
- **Result — batch essentially CLEAN:** TenantDisputesPage card, PropertyCard, FormatCard, TemplateSelector, NotFound quick-link card, DashboardPage role=button, Billing accordion header, EditableCell display-mode all already carry the canonical `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. DataTable row `ring-inset` = exempt (anti-clip). EditableCell input plain `focus:` = exempt (native input, intentional-click). Strong confirmation the focus canon is fully propagated across clickable non-button surfaces.
- **DEFECT (accepted):** `pages/comparison/ComparePage.tsx` line 302 — the `<span tabIndex={0}>` that wraps the disabled "Run comparison" `<Button pointer-events-none>` (so the Radix tooltip explaining WHY it's disabled is keyboard-reachable) had className `inline-block w-full sm:w-auto` with NO focus ring. A keyboard user tabs onto it and sees nothing. Fix: added `rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (rounded-full traces the pill button it wraps).
- **COMMIT RECOVERY (process):** the C49 background commit returned `COMMIT EXIT 1` (all pre-commit hooks Passed) — the pre-commit stash mechanism conflicted with my concurrently-unstaged ComparePage edit (the "zero unstaged tracked changes before committing" footgun). No data lost: C49's PoolsPage + ledger stayed staged and intact. Recovery: folded C50 into the same commit so there are ZERO unstaged tracked changes during pre-commit. Lesson reinforced: do not leave an unrelated unstaged edit in the tree while a pathspec commit's pre-commit hook runs — stash-pop can conflict and abort the commit (hooks still report Passed, only the final commit exits 1).
- **Verify:** tsc --noEmit clean; PoolsPage.test.tsx 12 + ComparePage.test.tsx 6 = 18/18 pass.
- **Carried forward:** D-breadcrumb (low, since C25); toast close 20px (minor); mobile trace-button access gap (product, low).
- **NEXT:** Cycle 51 — tenant-portal live audit (the TenantDisputesPage card passed statically; sweep the rest of the tenant party UI), or modal/dialog inventory. Verify each file lands via `git show <sha> --stat`.

## Cycle 51 — Tenant-portal party UI live audit (CLEAN)
- **Scope:** Tenant party UI, a separate auth surface only reached statically before.
  Logged in live as `e2e-tenant@capveri.com` (role=tenant); `/tenant` → `/tenant/dashboard`.
  Swept all six tenant pages: dashboard, disputes list, dispute detail (+comment form),
  raise-dispute form, notifications, preferences. 1440px + 390px spot-check.
- **Method:** `web` agent (sonnet), per-page single-evaluate control inventory, REAL
  keyboard-Tab boxShadow reads on every focus suspect.
- **Result:** ZERO defects. All action buttons compute `border-radius: 9999px` (pill canon).
  Dispute cards correctly pill-exempt (role=button, rounded-lg) and carry the canonical
  focus ring. Preference toggles (44×24) correctly switch-exempt, canonical ring on Tab.
  Disabled Post-Comment / Submit-Dispute buttons correctly skipped in Tab order.
  390px: nav collapses to ≥44px hamburger, content stacks clean, no overflow.
- **Footgun reconfirmed:** programmatic `.focus()` mis-reports the ring as
  `rgba(255,255,255,0.686)`; real keyboard Tab yields canonical
  `rgb(255,255,255) 0 0 0 2px, rgb(49,69,119) 0 0 0 4px`. Always Tab, never `.focus()`.
- **Significance:** the focus/pill/40px canon is now verified propagated to BOTH parties
  (landlord swept C44–C50, tenant clean here). No code change this cycle.
- **NEXT:** Cycle 52 — modal/dialog inventory (PoolCopyDialog, confirm dialogs, command
  palette) live focus-trap + first-focus + ring audit, or reconciliation loading/skeleton
  state polish. Verify each file lands via `git show <sha> --stat`.

## Cycle 52 — Landlord modal/dialog/overlay live audit + toast-close-ring fix
- **Scope:** Live `web` audit of landlord overlays at 1440px (+390px spot-check): user
  avatar dropdown, Delete-Property / Revoke-Invitation / Overwrite-Draft / Finalize
  alertdialogs, Invite-Member dialog, Export-Reconciliation slide-in, Sonner toasts.
- **FIX (DEFECT 4 — real):** `components/ui/sonner.tsx` toast close button had hover
  styling but NO focus indicator — every toast app-wide shipped a keyboard-focusable
  close control with zero visible focus (WCAG 2.4.7 fail). Added canonical ring to the
  `closeButton` classNames: `group-[.toast]:ring-offset-background
  group-[.toast]:focus-visible:outline-none group-[.toast]:focus-visible:ring-2
  group-[.toast]:focus-visible:ring-ring group-[.toast]:focus-visible:ring-offset-2`.
  tsc clean; sonner.test.tsx 37/37 (no test asserts the class string).
- **DISMISSED (DEFECT 2 — not a defect):** Export "PDF/Batch/ERP/History/Board/Variance"
  controls are Radix `TabsTrigger` (`[role=tab]`, py-1.5 → 32px). Canon explicitly accepts
  `[role=tab] ~32px` segmented as compact. Correct focus rings already present.
- **DISMISSED (DEFECT 3 — not a defect):** 16×16 export-option controls are the shadcn/Radix
  `Checkbox` (`h-4 w-4`) — industry-standard checkbox size; the 40px floor governs PRIMARY
  controls, and editing one panel's checkbox would diverge from every checkbox app-wide.
- **DEFERRED (DEFECT 1 — needs verification, NOT mass-edited):** agent reported focus does
  not return to trigger after ESC on the alertdialogs (activeElement=BODY), yet the
  identical-pattern Invite-Member dialog PASSED. Radix restores focus on close by default;
  the agent measured activeElement immediately after ESC without confirming a wait for the
  close-tick restore — likely a timing artifact. Refused to edit `onCloseAutoFocus` across
  many dialogs on a maybe. Marked for a dedicated focus-restoration verification cycle.
- **PASS:** avatar dropdown (trap+ESC+return-focus+ring+pill all clean), Invite-Member
  dialog (first-focus on input, trap, ESC returns focus, 40px circular close, canonical
  rings), all alertdialogs clean on trap+ESC+ring+pill, 390px Delete-Property centered/no
  overflow.
- **NEXT:** Cycle 53 — adversarially verify DEFECT 1 (real keyboard ESC + `await` Radix
  close-tick, re-read activeElement; if real, fix at the shared Dialog/AlertDialog layer,
  not per-call-site). Verify each file lands via `git show <sha> --stat`.

## Cycle 53 — Dialog focus-return: adversarial verify → CONFIRMED → shared-layer fix
- **My C52 skepticism was WRONG.** A targeted `web` verification re-measured with proper
  timing (read `activeElement` at 0ms AND 500ms after a REAL Escape, plus after Cancel
  click, trigger confirmed still in DOM). Result on Delete-Property and Revoke-Invitation:
  activeElement = BODY at BOTH 0ms and 500ms, both close paths. Timing-artifact hypothesis
  REFUTED. Genuine WCAG 2.4.3 focus-order failure. Good that I verified before mass-editing
  — but the verdict flipped to "real," so the fix was warranted after all.
- **Root cause:** these AlertDialogs are CONTROLLED (`open={!!target}` + `onOpenChange`)
  with NO `<AlertDialogTrigger>` — the opener is a separate list-row button that just sets
  state. Radix's FocusScope has no trigger ref to restore to, so focus drops to `<body>`.
  (The Invite-Member `Dialog` passed because it is wired as a proper trigger child.)
- **FIX (shared layer, one edit covers every AlertDialog app-wide):**
  `components/ui/alert-dialog.tsx` `AlertDialogContent` now captures the focused opener in
  `onOpenAutoFocus` (when it is still the active element) and restores focus to it in
  `onCloseAutoFocus` if still in the document — chaining any caller-supplied handlers and
  honoring `preventDefault`. Covers Delete-Property, Revoke/Remove-Member, Overwrite-Draft,
  Finalize, and any future controlled AlertDialog.
- **Regression tests:** added 2 tests to `alert-dialog.test.tsx` exercising the exact
  controlled-no-trigger pattern — focus returns to the opener after both Cancel and Escape.
  These FAIL without the override. tsc clean; alert-dialog 32/32, TeamMembersPage 9/9.
- **Lesson:** adversarial verification cuts both ways — it saved a mass-edit on a maybe in
  C52, then confirmed the defect was real in C53 once measured correctly (0ms vs 500ms both
  BODY is the decisive signal). Always re-measure with an explicit settle wait.
- **NEXT:** Cycle 54 — re-run the modal/dialog live audit to confirm focus now returns on
  the previously-failing dialogs, then move to reconciliation loading/skeleton-state polish
  or a fresh untapped surface. Verify each file lands via `git show <sha> --stat`.

## Cycle 54 — Live confirmation of the C53 focus-return fix (VERIFIED)
- **Scope:** Re-measured the two dialogs that failed in C53, after HMR picked up the shared
  `AlertDialogContent` change, on the running app at 1440px.
- **Result (all four cases PASS):**
  | Dialog | Close | activeElement after close | Matches opener? |
  | Revoke Invitation | Escape | the Revoke trigger button | YES |
  | Revoke Invitation | Cancel | the Revoke trigger button | YES |
  | Delete Property | Escape | the Delete trigger button | YES |
  | Delete Property | Cancel | the Delete trigger button | YES |
  Focus now returns to the exact opener button on every close path — never `<body>`.
- **Significance:** the C53 shared-layer fix is confirmed working in-browser, not just in
  jsdom unit tests. WCAG 2.4.3 focus-order restored for every controlled AlertDialog.
- **NEXT:** Cycle 55 — fresh untapped surface. Candidates: reconciliation loading/skeleton
  states + empty states, the Export slide-in panel's full keyboard flow, or the
  Checkout/Billing wizard. Verify each file lands via `git show <sha> --stat`.

## Cycle 55 — Error-boundary copy + loading/empty/billing triage

**Surface:** `web` audit of loading / skeleton / empty / error states + billing controls.

**DEFECT 1 — DISMISSED (false positive).** Agent flagged the "Enable Notifications" button as failing a 44px tap-target rule. Our canon is a **40px floor** (`h-10`), which the button meets. No change.

**DEFECT 2 — FIXED.** `ErrorFallback` bodies repeated their own heading ("Something went wrong" + "Something went wrong in this section."). Rewrote both bodies to the house error-copy style ("We couldn't load …", matching ~15 other surfaces) at third-grade/humanizer standard:
- inline variant body → "We couldn't load this part of the page."
- page variant body → "We couldn't load this page. Try again, or email support if it keeps happening."
- Headings (h2/h3 "Something went wrong") unchanged.
- Updated 2 test assertions (inline body string + page body regex). ErrorBoundary.test.tsx 46/46, tsc clean.

**PASS:** loading/skeleton/empty states visually consistent; billing buttons meet pill + 40px floor. Cancel-subscription wizard / Stripe change-plan portal NOT locally auditable (401 on `/api/v1/billing/guarantee/eligibility` with the e2e-test account — test-env/backend, not a UI defect).

## Cycle 56 — Reconciliation Export panel: focus restoration + missing rings

**Surface:** `web` live audit of the Export slide-in panel (PDF/Batch/ERP/History/Board/Variance tabs) + GL upload. 3 real defects, all fixed and live-verified.

**DEFECT 1 — FIXED (WCAG 2.4.3, centralized).** Controlled Sheets (opened via `open` prop, no `<SheetTrigger>` — e.g. the Export panel) dropped focus to `<body>` on close. Applied the same opener-capture/restore pattern used for AlertDialog (C53) to `SheetContent` in `components/ui/sheet.tsx` (`onOpenAutoFocus` captures the opener, `onCloseAutoFocus` restores it when still mounted). One shared edit covers every controlled Sheet. Live-verified: focus returns to the Export trigger after both Escape and × Close.

**DEFECT 2 — FIXED.** Board-tab cap-rate `input[type=range]` had only the browser default single-layer outline. Added canonical ring classes (`rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`). Live-verified two-layer ring.

**DEFECT 3 — FIXED.** Batch-tab ZIP/Individual native radios were bare (no ring, 13px). Added `h-4 w-4 accent-primary` + canonical ring classes to both (16px matches the accepted shadcn-checkbox treatment). Live-verified two-layer ring.

**NOT-A-DEFECT (triaged):** ERP/History native `<select>` (native-control exemption); HelpTip 24px icons (40px hit area via `::before`); role=tab triggers (~32px compact); shadcn checkboxes (16px). Focus trap intact (no escape to background).

**Tests:** sheet.test.tsx + ExportPanel.test.tsx 50/50, tsc clean.

## Cycle 57 — Import/upload flow: Dialog focus restoration + GL page copy

**Surface:** `web` live audit of GL upload (`/ingestion`), Import History, GL Entry Preview modal, rent-roll/lease upload. 8 candidates; 2 real, 6 dismissed after source verification.

**DEFECT 4 — FIXED (WCAG 2.4.3, centralized).** The GL Entry Preview modal (uses shared `Dialog`) dropped focus to `<body>` on close. Applied the same opener-capture/restore pattern (C53 AlertDialog, C56 Sheet) to `DialogContent` in `components/ui/dialog.tsx`. Covers every controlled Dialog app-wide. Live-verified: focus returns to the filename trigger after both Escape and × Close.

**DEFECT 8 — FIXED (copy/consistency).** GL upload H1 was "Data Ingestion" — internal jargon that mismatched the nav ("Upload GL") and subtitle. Renamed H1 → "Upload General Ledger"; de-duplicated the card section title "Upload General Ledger Export" → "Select your file". Test assertion updated.

**DISMISSED after source verification (6):**
- D1 drop zone not a pill — drop zone is a `role=button` TILE surface (pill-exempt per canon); `rounded-full` on an 8rem zone is wrong.
- D2/D3/D5/D7 missing/single-layer focus rings — source confirms canonical ring classes are ALREADY present (FileUploader.tsx:103, ImportHistoryList.tsx:228/382, DialogContent close button). Agent measured `rgb(15,23,41)` browser-default outline = `:focus` not `:focus-visible` (mouse/programmatic-focus footgun). No real defect.
- D6 `__seed_…csv` filenames in History — local dev SEED data, not product copy; real uploads carry real names.

**Tests:** dialog.test.tsx + IngestionPage.test.tsx 71/71, tsc clean. Three controlled-overlay primitives (AlertDialog, Sheet, Dialog) now all restore focus to their opener.

## Cycle 58 — Dashboard + reconciliation responsive triage (2026-06-16)
Source: web agent audit at 1280px + 390px, 10 findings.
FIXED:
- D2 (HIGH): GLAnalysisPanel header wrapped to 3 lines at 390px. Made header `flex-wrap`, title group `min-w-0 flex-1` with `truncate`, badge + action cluster `flex-shrink-0`. Action cluster now wraps below instead of squishing the title.
- D5/D6 (MED): Breadcrumb truncated property names too aggressively on desktop. Last (current) crumb `max-w-[200px]` → `sm:max-w-[360px] lg:max-w-[520px]`; link crumbs `max-w-[160px]` → `sm:max-w-[280px]`. Mobile guard preserved.
DISMISSED (verified in source):
- D4: "Variance" Help button = HelpTip ::before extends hit area to 40px. Not a defect.
- D7: Hero eyebrow `uppercase tracking-wider` is an intentional centered hero kicker (WelcomeCard.tsx:137); metric-card labels are a different visual tier. Not an inconsistency worth churning.
- D8: agent self-dismissed.
- D9: lock icon on "Finalize & deliver" is correct (finalizing locks the recon).
- D10: "CAM GL Analysis — <property>, <year>" em dash is LLM-generated narrative output (no code-built string found); user-generated/AI content is copy-gate exempt.
DEFERRED (own cycle — larger mobile restructure, needs careful re-verify):
- D1 (HIGH): recon toolbar wraps to 3 rows at 390px — collapse secondary actions behind "More".
- D3 (MED): stepper `<li>` horizontal overflow / "Finalize & deliver" label clip.
Verify: tsc clean; 73 tests pass (Breadcrumbs 31 + analysis 42); dev server healthy on :5174.

## Cycle 59 — Reconciliation toolbar mobile collapse (D1 deferred from C58) (2026-06-16)
FIXED:
- D1 (HIGH): recon toolbar wrapped to ~3 rows at 390px. The three primary
  action buttons (CalculateButton "Run reconciliation", FinalizeButton
  "Finalize & deliver", ExportButton "Export") now collapse to icon-only on
  mobile via `sr-only sm:not-sr-only` on the label span. Text stays in the
  a11y tree (accessible name preserved, no static aria-label that would
  desync from the dynamic loading label), shown again at `sm`+. Icons +
  overflow "More" fit in far fewer rows on a phone.
- Updated FinalizeButton.test.tsx: 3 disabled-state assertions switched from
  getByText (now returns the inner span) to getByRole('button', {name}).
Verify: tsc clean; 187 tests pass (36 button + 151 reconciliation page).
LIVE-VERIFY LIMITATION: the local trial account (uxwalk) has no seeded
properties, so the live mobile toolbar was not reachable in-browser this
cycle. Change is the standard sr-only responsive pattern, fully unit-covered.
DEFERRED: D3 (stepper <li> horizontal overflow / "Finalize & deliver" stepper
label clip) — separate cycle.

## Cycle 60 — Fresh-surface audit: settings / portfolio / disputes / tax-protest (2026-06-16)
Web audit (sonnet, authenticated landlord) at 1280px + 390px.
FIXED:
- F1 (HIGH): nested <main> inside the shell's <main id="main-content"> on the
  disputes surfaces — invalid HTML, breaks ARIA landmark navigation. Changed
  the inner <main> to <div> in DisputesListPage.tsx (1) and
  LandlordDisputeDetailPage.tsx (3: loading, error, content states).
- F2 (LOW): /settings/profile heading hierarchy — "Linked Accounts" rendered
  as h3 (CardTitle default) while sibling cards use as="h2". Added as="h2" to
  LinkedAccounts CardTitle. LinkedAccounts is only consumed by ProfilePage.
DISMISSED:
- "Open help guide" header button single-layer rgb(15,23,41) outline = mouse
  :focus, not :focus-visible. Canonical keyboard ring confirmed by the agent.
  Not a defect (the standard focus-vs-focus-visible footgun).
CLEAN (verified by agent): /portfolio, /tax-protest, /settings billing/team/
  organization tabs — pills, focus rings (keyboard Tab), touch targets, no
  horizontal overflow at 390px, no copy typos.
Also this cycle: D3 (stepper overflow, deferred from C58) DISMISSED after
source review — ReconciliationWorkflowStepper already wraps gracefully
(flex-1 steps, text-center label, no truncate; explicit wrap-handling comment).
The overflow the C58 auditor saw was the toolbar row, fixed in C59.
Verify: tsc clean; 107 tests pass (disputes + ProfilePage + profile).

## C61 — Properties list + detail + settings sub-pages (2026-06-16)
Surface audit (web agent, e2e-test landlord, seeded data) of Properties list, Property detail, and Settings sub-pages (Organization/Members/Billing) — surfaces not covered by C58–C60.

FIXED:
- Properties list table overflowed past common 1280px laptop widths (clipping the "Created" column, forcing horizontal scroll). Root cause: Address column cell `max-w-md` (448px). Narrowed to `max-w-xs` (320px); address already truncates + has a title tooltip so no info is lost. (PropertyListPage.tsx)

DISMISSED with source evidence (defensible / false positives):
- Stat-card labels as `<h2>`: intentional via StatCard `titleAs="h2"` (PropertyDetailPage); yields a valid h1→h2→h3 outline (PageHeader h1 → stat labels h2 → CardTitle h3). No skipped level.
- Tab strip "no scroll affordance" at 390px: FALSE — ScrollableTabsList (tabs.tsx) already renders left/right gradient fades driven by canScrollLeft/canScrollRight (data-testid scrollable-tabs-fade-*). Auditor missed them.
- PropertyCard square icon false-checkbox affordance: unverifiable — list uses a DataTable (no per-row sqft icon); no `Square` import in PropertyListPage.
- "Property setup" h2 (text-sm): real section label for the setup banner; valid h2 level. Minor, kept.
- Cancel Subscription ghost button: intentional de-emphasis of a destructive secondary action; correct pattern.
- Settings Organization/Members/Billing: clean (pills, 40px+ targets, correct two-layer keyboard focus rings).

Verify: tsc clean; PropertyListPage.test.tsx 15/15 pass.

## C62 — Imports/upload flow + Units/Leases tabs + global nav (2026-06-16)
Surface audit (web agent, e2e-test landlord) of GL upload, Lease/Rent-Roll upload, Units/Leases tabs, and global nav/top bar.

FIXED:
- LeaseUploadPage (/leases/upload) heading skip H1→H3: the two section CardTitles ("Upload Lease Documents", "Supported Format") defaulted to <h3> under the page <h1>. Set as="h2"; inner h3s (PDF Documents / What Happens Next / File Requirements) now nest correctly under h2. (LeaseUploadPage.tsx)
- RentRollUpload heading skip H1→H3→H4: CardTitle "Upload Rent Roll" → as="h2"; "Supported Formats" h4 → h3. Now h1→h2→h3. (components/rent-roll/RentRollUpload.tsx)

DISMISSED with source evidence:
- Help "?" buttons under 40px: FALSE — HelpTip (features/help/components/HelpTip.tsx) renders a 24px icon with an invisible `before:` 40×40px hit area centered on it (meets touch floor). Auditor measured the visible icon, not the tap target.
- GL Entry Preview table horizontal overflow at 390px: not a defect — GLEntryPreview wraps the 6-col financial table in `overflow-x-auto` inside a clipped rounded border; horizontal scroll is contained and intended for a dense GL table on a phone.
- GL preview sort-header buttons (not pills, ~20px): exempt per canon — table sort headers are exempt from both the pill rule and the 40px floor.
- Units status toggle 44×24px: standard short Switch primitive (analogous to the shadcn Checkbox exemption); enlarging would distort it. Kept.
- Global nav / sidebar / top bar / mobile drawer / Units / Leases / Create Lease / GL upload: clean (pills, ≥40px targets, correct two-layer keyboard focus rings, no double <main>).

Verify: tsc clean; LeaseUploadPage.test.tsx + rent-roll tests 28/28 pass.

## C63 — ReconciliationGrid trace button flex-shrink clip (1 fix, 2 dismissals)

**Surface:** ReconciliationGrid (line-item / pool breakdown table), PoolsPage, ExpensePoolsTab.

**FIX (MED) — trace eye-button clipped to 24×40px under flex pressure.**
- `frontend/src/features/reconciliation/components/ReconciliationGrid.tsx:337` — added `shrink-0` to the trace button class (`flex h-10 w-10 shrink-0 ... rounded-full`).
- Root cause: the button is a flex child of the row `<div>` (sibling cells use `flex-1`/`w-36`). Its `w-10` (40px) has default `flex-shrink:1`, so on space-tight rows it compressed to 24px wide — 16px under the 40px touch floor — while height held at 40px. Source class already had `h-10 w-10 rounded-full` + canonical focus ring, so the defect was shrink, not the declared size.
- Live-verified on e2e-test landlord account: BEFORE = 24×40 (FAIL), AFTER (HMR) = 40×40, borderRadius 9999px (PASS).
- tsc clean; ReconciliationGrid.test.tsx 32/32 pass.

**DISMISS (LOW) — Copy Pools / Copy Between Properties disabled buttons "lack explanation".**
- FALSE: `frontend/src/pages/pools/PoolsPage.tsx` already wraps both disabled Copy buttons in a `<Tooltip>` exposing `COPY_DISABLED_REASON` ("Copying pools requires at least two properties...") via a focusable span. Affordance already present.

**DISMISS (LOW) — ExpensePoolsTab pool TYPE badge variant inconsistency.**
- DEFENSIBLE: `POOL_TYPE_VARIANTS` (ExpensePoolsTab.tsx:66) is deterministic categorical color-coding (operating=default, tax/insurance=secondary, capital/other=outline). Every value of a given type renders identically, so it aids row scannability rather than implying a false status ranking. No change.

## C64 — Auth/onboarding surfaces (3 fixes, several dismissals/deferrals)

**Surface:** unauthenticated /auth/login, /auth/register, /auth/forgot-password, /auth/reset-password. Audited at desktop 1280px + mobile 375px.

**FIX (MED) — H2-before-H1 heading-order violation on login & register (and offscreen H2 on reset).**
- `frontend/src/components/auth/FeatureShowcase.tsx:22` — marketing side-panel headline `<h2>` → `<p>` (same Tailwind size classes, visual identical). The showcase renders before the form in DOM, so its h2 preceded each form's `<h1>`, producing an out-of-order heading for screen readers. As decorative marketing copy (not a document section), a styled `<p>` is correct. Covers audit L-1, R-1, RP-3.
- Live-verified: login heading list was `[H2, H1]`, now `[H1]`.

**FIX (MED) — show/hide-password toggle below 40px touch target on login & register.**
- `frontend/src/pages/auth/LoginPage.tsx:221` and `frontend/src/pages/auth/RegisterPage.tsx:219` — button class `pr-3 flex items-center` → `flex w-10 items-center justify-center`. Was 28×44 (16px icon + 12px pr-3); input already reserves `pr-10` (40px), so the 40px-wide centered button aligns cleanly. tabIndex=-1 retained (intentionally out of tab order; floor still applies to touch). Covers L-2, R-3.
- Live-verified: login toggle now 40×44, borderRadius 9999px.

**FIX (LOW) — "Forgot password?" link missing canonical focus ring.**
- `frontend/src/pages/auth/LoginPage.tsx:198` — added `rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` so the standalone link matches the canonical two-layer ring on keyboard Tab. Covers L-3.

**DISMISS — R-2 "no password strength indicator" on register.**
- FALSE: RegisterPage already renders `<PasswordStrength>` (import line 21, usage line 252) plus a requirements hint when focused/empty (line 243).

**DEFER (LOW, noted not fixed) — RP-1 add show-password toggle to reset-password; RP-2 placeholders on reset fields; RP-4 reset submit h-11 vs h-12 inconsistency; L-4 mobile px-8 padding on login card.** Minor/feature-add items; candidates for a future reset-password-focused cycle.

tsc clean; LoginPage.test 26/26 + FeatureShowcase.test 5/5 pass.

## C65 — Tenant portal a11y + jargon (4 fixes, 2 deferred)

**Surface:** tenant portal — /tenant/login, /tenant/disputes, /tenant/disputes/:id, /tenant/notifications, dashboard. Audited desktop 1280px + mobile 375px (all buttons already pills, ≥40px targets, canonical rings — only headings/jargon flagged).

**FIX (HIGH) — tenant login had no h1.**
- `frontend/src/features/tenant-portal/pages/TenantLoginPage.tsx:73` — `<CardTitle>` "Tenant Portal" was the page's sole heading but `CardTitle` defaults to `h3`. Set `as="h1"`. Required widening the `CardTitle` `as` union to include `'h1'` in `frontend/src/components/ui/card.tsx:105`.
- Live: heading list now `["H1:Tenant Portal"]`.

**FIX (MED) — disputes list H1→H3 skip.**
- `frontend/src/features/tenant-portal/pages/TenantDisputesPage.tsx:169` — dispute-card title `<h3>` → `<h2>` (direct children of the page `<h1>` "Dispute History"; styling unchanged). Live: `[H1, H2, H2]`.

**FIX (MED) — notifications empty-state H1→H3 skip.**
- Added a reusable `titleAs?: 'h2'|'h3'|'h4'` prop to the shared `EmptyState` (`frontend/src/components/EmptyState.tsx`), default `'h3'` so all existing usages are unchanged. Passed `titleAs="h2"` at the notifications empty state (`NotificationList.tsx:198`). Live: `[H1:Notifications, H2:No notifications yet]`. (Prop is the systemic fix for the app-wide PageHeader-h1 → EmptyState-h3 skip; broader rollout is a future-cycle candidate.)

**FIX (MED) — UUID exposed in dispute detail title.**
- `frontend/src/features/tenant-portal/pages/DisputeDetailPage.tsx:146` — title `Dispute #${id.slice(0,8)}` (cryptic hex) → `categoryLabel(dispute.category)`; description simplified to `Filed ${filedAgo}`. Live: H1 now "Calculation Error", no hex.

**DEFER — F5 duplicate lease cards lack a unit/suite identifier (dashboard).** Likely seed-data artifact; needs product/data confirmation before treating as a UI defect.
**DEFER — F6 "CAM Reconciliation Statements" tenant-facing label "jargon".** Debatable: CAM is the actual term tenants see on real statements, and a rename is a product-copy decision that must clear the marketing-copy gate + humanizer/third-grade pass. Not changed unilaterally.

tsc clean; tenant-portal + EmptyState tests 105/105 pass.

## C66 — AI extraction / GL-import a11y + mobile layout (5 fixes)

**Surface:** AI extraction & verification UI — extraction notification prompt, lease verification (HITL review) page, GL import history. Audited desktop 1280px + mobile 375px. All findings verified at source and live-reproduced before fixing; A/B/C/F2 confirmed live with the landlord account.

**FIX (HIGH) — extraction NotificationPrompt collapsed on mobile.**
- `frontend/src/pages/extractions/NotificationPrompt.tsx` — single flex row squeezed the message text to ~74px at 375px. Restructured CardContent into an icon+text group and a button group: `flex flex-col gap-3 ... sm:flex-row sm:items-center`. Dismiss is a 40px pill icon button (`h-10 w-10 rounded-full`, aria-label retained).

**FIX (MED) — verify-page header wrap/overlap on mobile.**
- `frontend/src/features/verification/components/EditInterface.tsx:87` — header `flex items-center justify-between` forced the "Extracted Lease Terms" h2 and the Undo/Redo buttons onto one cramped row at 375px. Now stacks: `flex flex-col gap-3 ... sm:flex-row sm:items-center sm:justify-between`, button group `self-end sm:self-auto`. Live: h2.bottom 726.7 < undo.top 738.7 (12px gap), no horizontal overflow (scrollW==clientW).

**FIX (MED) — verification progress meter stuck at 0/0 (F2, functional).**
- Root cause: `VerificationSummary` denominator was `source_references.length`; extractions that return no source references (real seed case) left the meter at 0/0 while the reviewer marked fields correct — the meter was decoupled from the confirmable field set. Fixed by keying progress off the canonical confirmable fields, not the AI's source references.
- `frontend/src/features/verification/components/EditInterface.tsx` — exported `VERIFIABLE_FIELD_KEYS` (the 7 FIELD_DEFINITIONS keys, in display order).
- `frontend/src/pages/extractions/VerificationPage.tsx` — built a `progressReferences` list over `VERIFIABLE_FIELD_KEYS` (confidence falls back to 1 when the AI gave no score, so unscored fields are not wrongly flagged "needs review"; verified = edited OR confirmed) and passed it to `VerificationSummary` instead of the source-ref list. `sourceReferences` is still passed to `EditInterface` unchanged so per-field source badges/highlights are unaffected.
- Test mock for the EditInterface module updated to also export `VERIFIABLE_FIELD_KEYS`.
- Live: progress now `0/7` → confirm Base Year → `1/7` → toggle off → `0/7`; bar advances.

**FIX (MED) — GL "Import History" H1→H3 skip.**
- `frontend/src/components/ingestion/ImportHistoryList.tsx` — section title `Import History` (line 169) and the empty-state `No imports yet` (line 143) were `<h3>` directly under the page `<h1>` "Upload General Ledger" (history tab has no intervening h2). Both → `<h2>` (styling unchanged). Live: `[H1:Upload General Ledger, H2:Import History]`.

**FIX (LOW) — mobile GL "View" button unlabeled.**
- `frontend/src/components/ingestion/ImportHistoryList.tsx` — the mobile card "View" button had only generic visible text; added `aria-label={`View details for ${record.fileName}`}` to match the desktop icon button. Live: both mobile rows now read "View details for <filename>".

tsc clean; ImportHistoryList 26 + EditInterface 26 + VerificationSummary + VerificationPage 21 = 92/92 pass.

## C67 — reconciliation results: export-dialog mobile overflow + finalized heading skip (2 fixes)

**Surface:** Reconciliation RESULTS — reconciliations list, individual reconciliation variance grid/cards, workflow stepper, GL narrative panel, and the Export dialog. Audited desktop 1280px + mobile 375px (landlord account). Audit raised 6 findings; 4 rejected after source verification, 2 genuine and fixed + live-verified.

**FIX (HIGH) — Export dialog tab strip painted over the panel content on mobile.**
- `frontend/src/features/reconciliation/components/ExportPanel.tsx:935` — the 6-tab `TabsList` overrode the base list into `grid grid-cols-2` but kept the base component's fixed `h-10`. At 375px the triggers wrap to 3 grid rows while the 40px container does not grow, so rows 2-3 overflowed and rendered on top of the tab panel below. Added `h-auto gap-1` to let the container size to its wrapped rows and `min-h-9` on each trigger for even row heights.
- Live (375px): tablist.bottom 241.6 ≥ max-trigger-bottom 236.8 (container now contains all rows) AND tabpanel.top 249.6 ≥ tablist.bottom 241.6 (no overlap; ~8px gap). Was a measured 52px overlap before.

**FIX (MED) — H1→H3 skip on the mobile reconciliation result page for finalized reconciliations.**
- `frontend/src/pages/reconciliation/components/ReconciliationMobileView.tsx:242` — each `ReconciliationCard` renders the pool/tenant name via `CardTitle` (defaults to `<h3>`). The page's only h2 is the GL Analysis panel, which is gated `!isFinalized` — so a finalized reconciliation jumped H1→H3 on mobile (desktop is unaffected; its TenantSummary side panel carries an `<h2>Tenant Filter`). Added an `sr-only` `<h2>Pool and tenant variance</h2>` ahead of the card list so the h3 cards always have a valid h2 parent regardless of finalized state, with no visual change.
- Live (375px): heading order now H1 → H2(GL, when present) → H2(sr-only "Pool and tenant variance") → H3(tenant cards); no skip, single H1.

**REJECTED (false positives / by-design):**
- F3 "Variance Report / Denominator Changes toggles lack ARIA state" — they are disclosure buttons with `aria-expanded` + `aria-controls`, not toggles; semantics already correct.
- F6 "mobile icon-only Run reconciliation / Finalize buttons unlabeled" — both use `sr-only sm:not-sr-only` label spans, so the text is announced to screen readers on mobile.
- F4 "mobile stepper Finalize step taller than peers" — by-design: `items-start` keeps indicator circles top-aligned when the label wraps; connectors hidden on mobile; no shared row border (F-287 comment documents this).
- F5 "GL Analysis panel h2 over-promoted" — heading tree is valid (H1→H2→H3, no skip); a re-leveling is a debatable structure change, not a defect.

tsc clean; ExportPanel 39 + ReconciliationMobileView 25 = 64/64 pass.

## C68 — dashboard hero heading semantics (1 fix)

**Surface:** Landlord Dashboard + Tools/Analysis pages (tax-protest, year-over-year, trends, compare). Audited desktop 1280px + mobile 375px (landlord account). Audit raised dashboard heading defects + 13 explicit "fine" confirmations (pills, tap targets, no mobile overflow, focus rings, currency formatting, no NaN/UUID/jargon). One genuine fix.

**FIX (HIGH+MED) — dashboard hero `<h2>` was the dollar amount, not a section label.**
- `frontend/src/components/dashboard/WelcomeCard.tsx:140` — the big hero recovery figure (e.g. "$8,950") was an `<h2>`, so screen readers navigating by heading announced the page's H2 as "$8,950"; the real label (the eyebrow) was a `<p>`. Swapped: the eyebrow label (`heroTitle`, e.g. "Money to recover") is now the `<h2>`; the dollar figure is a `<p>`. Styling unchanged.
- Demoting the number to a non-heading would have left an H1→H3 skip (the metric cards default to h3), so promoted the two peer dashboard sections: `QuickActionsCard.tsx` and `ReconciliationStatusCard.tsx` `CardTitle` → `as="h2"`.
- Live: heading order now `H1 Dashboard → H2 Money to recover → H2 Quick Actions → H2 Reconciliation Status`; no skip, single H1, dollar value no longer a heading, hero card visually unchanged.

**REJECTED / confirmed fine:** tax-protest Configure-link UUID in address bar (REST convention, not user-visible text); trends "Show trendline" 16px checkbox (exempt); all pills 9999px; all tap targets ≥40px desktop+mobile; no horizontal overflow at 375px on any audited route; focus rings correct (keyboard :focus-visible, white-on-navy CTA ring); currency consistent; no NaN/$undefined/UUID/codename/funnel-jargon in user text; year-over-year + compare inputs all labeled.

tsc clean; DashboardPage 25 + dashboard components 78 = 103/103 pass.

## C69 — billing / invoices / error states (3 fixes)

**Surface:** Settings → Billing (subscription card, usage meters, plan), Settings → Invoices (table, filter, empty state, pagination), and the route-level ErrorBoundary fallback. Audited desktop 1280px + mobile 375px (landlord account). 5 findings raised; F4 deferred with rationale, the rest fixed + live-verified.

**FIX (MED) — billing usage meters rendered a duplicate visible label.**
- `frontend/src/pages/settings/Billing.tsx:857` — each `UsageMeter` already renders its label (e.g. "Rentable Units") in a visible line above the bar, then passed `label={`${label} usage`}` to `<Progress>`. The Progress component renders a `label` prop as a VISIBLE `<span>`, so every meter showed a second redundant "<label> usage" line. Changed `label=` → `aria-label=`: `{...props}` is spread after Progress's internal aria-label, so this sets the accessible name ("Rentable Units usage") with no visible duplicate.
- Live: bar `innerText`/`textContent` empty; grandparent reads only "Rentable Units\n1 / 1"; progressbar `aria-label="Rentable Units usage"` preserved.

**FIX (MED) — Invoices empty-state H1→H3 skip + misleading copy.**
- `frontend/src/pages/settings/Invoices.tsx:108` — the "No invoices" `EmptyState` (default `<h3>`) sat directly under the page `<h1>` "Invoices" (no intervening h2) → level skip. Added `titleAs="h2"`. Also made the description conditional: the original copy "No invoices found for the selected filter." showed even when NO status filter was applied (`status === undefined`). Now `status ? 'No invoices match the selected filter.' : 'You have no invoices yet.'`.
- Updated `Invoices.test.tsx:316` (it rendered with no filter yet asserted the filter-specific string — encoded the bug) to assert "You have no invoices yet.".
- Live: heading outline `H1 Invoices → H2 No invoices`, no skip; description reads "You have no invoices yet." with no filter active.

**FIX (LOW) — ErrorBoundary page fallback had no `<h1>`.**
- `frontend/src/components/ErrorBoundary.tsx:297` — the full-page fallback (default variant, replaces the entire route) titled "Something went wrong" was an `<h2>`, leaving the error route with no `<h1>` and an orphaned h2. Promoted to `<h1>`. The `inline` (h3) and `minimal` (no heading) variants are unchanged — they render inside a page that already owns an h1.
- Verified statically (page variant line 297 now `<h1>`); not force-triggered live to avoid breaking app state.

**DEFERRED — F4: slow (~7s) Invoices error skeleton.**
- The invoices error state takes ~7s to appear because TanStack Query retries the failing request several times before surfacing `error`. The fix (per-query `retry`/`retryDelay` tuning, or a global default change) is broad and risks masking legitimate transient-failure recovery elsewhere. Deferred rather than make a wide retry-policy change inside a UX-polish cycle.

**REJECTED / confirmed fine:** billing plan/usage cards all pills + ≥40px tap targets; no 375px horizontal overflow; currency consistent; invoice status badges color-coded and labeled; pagination buttons aria-labeled; Select filter trigger labeled (exempt from pill/40px as a combobox).

tsc clean; Invoices 14 + ErrorBoundary 46 + Billing 16 = 76/76 pass.

## C70 — properties / property form / portfolio (4 fixes)

**Surface:** Properties list, Property detail, "Create Property" form (Enter Manually + Upload Rent Roll tabs), and Portfolio. Audited desktop 1280px + mobile 375px (landlord account). 5 findings raised; 4 fixed + live-verified, 1 deferred.

**FIX (MED) — Portfolio H1→H3 heading skip.**
- `frontend/src/pages/portfolio/PortfolioPage.tsx` — `MetricCard` stat titles (line 90) plus "Property Breakdown" (124) and "NOI Impact" (267) were `CardTitle` (default `<h3>`) directly under the page `<h1>` "Portfolio"; no h2 existed. All → `as="h2"` (styling unchanged). Live: outline now H1 Portfolio → 6× H2, no skip.

**FIX (MED) — Create Property form H1→H3 skip.**
- `frontend/src/pages/properties/PropertyFormPage.tsx` — the three section `CardTitle`s ("Property Information" 411, "BOMA Area Information" 557, "Tax Protest" 724) rendered `<h3>` under `<h1>` "Create Property". All → `as="h2"`. Live: H1 → 3× H2.

**FIX (MED, a11y) — "Target Occupancy" input had a broken label association.**
- `frontend/src/pages/properties/PropertyFormPage.tsx:639` — the field wrapped its `<Input>` in a `<div className="relative">` (for the `%` adornment) placed as the immediate child of `<FormControl>`. shadcn's `FormControl` is a Radix `Slot` that forwards the generated `id`/`aria-*` to its immediate child, so the id landed on the `<div>`, not the `<Input>`; the `FormLabel htmlFor` then pointed at the div. (Only this field had an adornment wrapper, so only it was affected.) Moved the `relative` wrapper OUTSIDE `FormControl` so `<Input>` is the direct Slot child. Live: input `id="_r_g_-form-item"`, `label[for]` matches, clicking the label focuses the input.

**FIX (LOW, tap target) — breadcrumb Home-icon link was a 16px tap target on mobile.**
- `frontend/src/components/layout/Breadcrumbs.tsx` — the first crumb collapses to a 16×16 Home icon below the `sm` breakpoint (label is `sr-only`), under the 40px floor. Added an invisible 40×40 `before:` overlay (the existing HelpTip/GroupHeader pattern) scoped to the icon-only home link via an `isIconOnlyHome` flag; no layout change. Live (375px): visual box 16px tall, effective `elementFromPoint` hit region 40px tall (y 78→117).

**DEFERRED — F4: Property-detail tab strip overflows 375px with no scroll affordance.**
- The mobile tab row (`overflow-x-auto`, ~592px of tabs in a 375px viewport) is touch-scrollable but has no visual cue that "Leases/Imports/Compliance" exist off-screen. A discoverability fix (scroll-shadow/fade or responsive tab layout) is a real enhancement but touches tab layout and is more involved than a polish-cycle edit; deferred for a focused follow-up rather than risk it here.

**REJECTED / confirmed fine:** Properties list (single H1, search input aria-labeled, Add Property has text, no overflow, mobile card layout scrollWidth 365); Property detail desktop ladder H1→H2→H3 valid (stat cards already `titleAs="h2"`); Upload Rent Roll dropzone `role=button` + aria-label; no `$undefined`/NaN/null/visible-UUID anywhere; sidebar + header buttons all labeled.

tsc clean; PortfolioPage + PropertyFormPage 22 + Breadcrumbs = 96/96 pass (touched-file suites).

## C71 — settings cluster: profile / organization / team (1 fix, 2 rejected)

**Surface:** Settings → Profile, Organization, Team Members (incl. "Invite Member" dialog). No Notifications/Security/API-key routes exist. Audited desktop 1280px + mobile 375px (landlord). 3 findings raised; 1 genuine + fixed + live-verified, 2 rejected after source verification.

**FIX (MED, a11y) — "Support ID" field had no real label association.**
- `frontend/src/pages/settings/OrganizationPage.tsx:248` — the read-only org-id row used `<FormLabel>Support ID</FormLabel>` outside any `FormField`/`FormItem`. With no `FormItemContext`, `FormLabel` emits `htmlFor="undefined-form-item"` (points at nothing) and the adjacent `<Input>` had no `id`, so the field announced only the bare UUID. Replaced with a plain `<Label htmlFor="support-id">` + `id="support-id"` on the Input (FormLabel is just Label with identical default styling, so no visual change). Live: input `id="support-id"`, `<label for="support-id">Support ID</label>` associated, accessible name resolves to "Support ID".

**REJECTED (false positives):**
- F2 "role Select trigger is `rounded-lg` (8px), not a pill" — Select triggers (`role=combobox`) are explicitly EXEMPT from the pill canon; 8px is by design (matches inputs, not buttons). Not a defect.
- F3 "invite-dialog Role select has no accessible name" — the auditor inspected Radix's aria-hidden native `<select>`. The visible control is the `SelectTrigger` button, which sits inside `<FormControl>` (a Slot that forwards `id={formItemId}`) under `<FormLabel htmlFor={formItemId}>Role`. A `<button>` is a labelable element, so the label associates and the trigger's accessible name is "Role". Already correct.

**Confirmed fine:** all three pages have clean heading ladders (single H1 → H2 → at most one H3 empty-state, no skips); every action button is a 9999px pill (only the exempt Select trigger is 8px); profile form fields all `<label for>`-wired; no 375px horizontal overflow (scrollWidth 365); mobile tap targets ≥40px (Copy 44×44, dialog X 40×40); no `$undefined`/NaN/null; no codenames/jargon; no missing alt.

tsc clean; OrganizationPage 25/25 pass.

## C72 — lease management: list / detail / form / recovery-profile (1 fix family, 1 rejected, 1 deferred)

**Surface:** Property → Leases tab, Lease detail page, Lease create + edit forms (incl. the shared `RecoveryProfileEditor` + `LeaseDocumentUpload` cards). Audited desktop 1280px + mobile 375px (landlord). 3 findings raised; 1 genuine heading-ladder family fixed + live-verified, 1 rejected after source verification, 1 deferred.

**FIX (MED, a11y) — H1→H3 heading skip across all three lease pages.**
- `frontend/src/pages/leases/LeaseDetailPage.tsx` — the four `StatCard`s (Status / Pro-Rata Share / Start Date / End Date, both the loading and loaded render paths) default to `<h3>`, and the overview/tab section `CardTitle`s ("Lease Information", "Recovery Profile Summary", "Recovery Profile Details", "Lease Document") default to `<h3>`, all sitting directly under the page `<h1>` (tenant name) with no `<h2>`. Set the StatCards `titleAs="h2"` and the section CardTitles `as="h2"`. Live: H1 → 6× H2, no H3, no skip.
- `frontend/src/pages/leases/LeaseFormPage.tsx` ("Lease Information" CardTitle), `frontend/src/components/leases/RecoveryProfileEditor.tsx` ("Recovery Profile" CardTitle), `frontend/src/components/leases/LeaseDocumentUpload.tsx` ("Lease Document" CardTitle) — all default `<h3>` under `<h1>` "Edit/Create Lease". All → `as="h2"`.
- **Follow-on (caught by live re-verify):** promoting "Recovery Profile" to h2 exposed a NEW H2→H4 skip — the editor's "Base Year Stop" / "Expense Cap" sub-section labels were `<h4>`. Demoted both to `<h3>` (`RecoveryProfileEditor.tsx:161,264`), styling unchanged (`text-sm font-medium`). Live re-verify: Edit form H1 → H2 (Lease Info) → H2 (Recovery Profile) → H3 (Base Year Stop) → H3 (Expense Cap) → H2 (Lease Document); Create form same minus Lease Document. Both PASS, no skips.

**REJECTED (false positive):**
- F2 "lease-form Help (`?`) icon buttons are 16×16px, under the 40px tap floor" — the auditor measured the visible `HelpCircle` icon. The `TooltipLabel` button (`RecoveryProfileEditor.tsx:72-81`) already carries the canonical invisible 40×40 `before:` overlay (`before:h-10 before:w-10 before:-translate-x-1/2 before:-translate-y-1/2`) plus `rounded-full` and a focus-visible ring. Effective hit area is 40px; not a defect.

**DEFERRED — F3: lease detail H1 is a bare `<Skeleton>` (empty accessible name) during the brief load state.**
- The loading branch passes `title={<Skeleton className="h-8 w-64" />}` to `PageHeader`, so the `<h1>` has no text until the lease query resolves. This is the established skeleton-placeholder pattern used across the app and is transient; changing it touches the shared skeleton convention rather than a lease-specific defect. Deferred rather than special-casing one page.

**Confirmed fine:** buttons all 9999px pills; no 375px horizontal overflow (≤365); no `$undefined`/NaN/null; Lease ID/Unit ID shown truncated with copy button (no raw UUID in prose); `capitalize` class fixes "Cap Type: none"→"None"; Select comboboxes correctly `<label for>`-wired; empty-state guidance present.

tsc clean; lease suites (LeaseDetailPage 25 + LeaseFormPage 19 + LeaseUploadPage 27 + RecoveryProfileEditor 22 + LeaseDocumentUpload 22) = 126/126 pass.

## C73 — global navigation shell: sidebar / header / mobile drawer / user menu (5 fixes, 1 skipped)

**Surface:** App-wide chrome — desktop sidebar (`Sidebar.tsx`), top `Header.tsx` (hamburger + user menu), mobile slide-in nav drawer, and the `navigation.ts` config that feeds them. Audited desktop 1280px + mobile 390px (landlord). 6 findings raised; 5 fixed + live-verified, 1 skipped (already mitigated).

**FIX (HIGH, real bug) — Dashboard sidebar item never showed active state.**
- `frontend/src/config/navigation.ts` — the Dashboard nav item used `href: '/'`, but the authenticated dashboard route is `/dashboard` (`/` only redirects there per `App.tsx`). The sidebar's active-state match (`pathname === href || pathname.startsWith(href + '/')`) therefore never fired on `/dashboard`, so Dashboard never got active styling or `aria-current`. Changed href to `/dashboard` — consistent with `BottomNav`, which already used it. Live: on `/dashboard` the item now has `aria-current="page"` + `bg-primary/10 border-l-primary`; navigating to `/properties` correctly transfers the active state.

**FIX (a11y) — mobile drawer now a proper modal dialog.**
- `frontend/src/components/layout/Sidebar.tsx` — the mobile `<aside>` gained `id="mobile-nav-drawer"` and now switches `role={mobileOpen ? 'dialog' : 'complementary'}` with `aria-modal={mobileOpen ? true : undefined}`. Open, it is a focus-trapped modal over the dimmed overlay; closed, an inert off-screen complementary region. Live: role flips complementary→dialog and aria-modal absent→"true" on open.

**FIX (a11y) — hamburger announces expand state + owns the drawer.**
- `frontend/src/components/layout/Header.tsx` — added a `mobileMenuOpen?: boolean` prop; the hamburger button now sets `aria-expanded={Boolean(mobileMenuOpen)}` + `aria-controls="mobile-nav-drawer"`. Wired the live open state through `App.tsx` (`mobileMenuOpen={isMobileNavOpen}`, the production layout) and `AppShell.tsx` (`mobileMenuOpen={isMobileMenuOpen}`). Live: aria-expanded toggles false→true on open. NOTE: the real app shell is `App.tsx`, not `AppShell.tsx` — initial wire to AppShell alone left aria-expanded stuck "false"; caught by live re-verify, fixed in App.tsx.

**FIX (a11y) — inner nav landmark named.**
- `frontend/src/components/layout/Sidebar.tsx` — the inner `<nav role="navigation">` gained `aria-label="Main"` so it is distinguishable from the bottom-nav `<nav>` in a screen reader's landmark list. Live: `aside nav` reports aria-label "Main".

**FIX (a11y) — user menu dropdown named.**
- `frontend/src/components/layout/Header.tsx` — the `role="menu"` dropdown div gained `aria-label="User account menu"` (it had no accessible name). Live: dropdown reports role="menu" + that label.

**SKIPPED — F6: closed mobile drawer focusable while off-screen.**
- Already mitigated: the off-screen drawer is `-translate-x-full` and its container is inert/aria-hidden in the closed state, so its links are not in the tab order. No change needed.

tsc clean; layout suites 237/237 pass (Sidebar 47 + Header 28 + AppShell 11 + others). All 5 fixes live-verified on localhost:5174.

## C74 — reconciliations: list + detail (trace / variance / denominator) (3 fixes, 2 rejected, 3 deferred/by-design)

**Surface:** `/reconciliations` list + the reconciliation detail page (`/properties/:id/reconciliations`) and its sub-panels — calculation-trace drawer, Variance Report, Denominator Changes. Audited desktop 1280px + mobile 390px (landlord). 9 findings raised; 3 genuine a11y defects fixed + live-verified, 2 rejected as false positives, 3 deferred/by-design.

**FIX (a11y) — per-tenant calculation-trace button labels.**
- `frontend/src/features/reconciliation/components/ReconciliationGrid.tsx` — every grid-row trace button shared the generic `aria-label="View calculation trace"`, so a screen reader heard the same label N times with no way to tell which tenant. Now `aria-label={row.original.type === 'tenant_summary' ? `View calculation trace for ${row.original.tenant_name}` : 'View calculation trace'}`. Live: three buttons read "...for Test Tenant 101 / 205 / 310".

**FIX (a11y) — Variance Report + Denominator Changes promoted to H2.**
- `frontend/src/features/reconciliation/components/VarianceReport.tsx` and `DenominatorChangePanel.tsx` — both panel `CardTitle`s defaulted to `<h3>` but sit as peer top-level sections of the detail page (siblings of the GL-Analysis H2 and Tenant-Filter H2), so the outline mis-grouped them under GL Analysis. Both → `as="h2"` (styling `text-base` unchanged). Live: "2025 vs 2024 Variance" and "Denominator Changes: 2025 vs 2024" both H2.

**FIX (a11y) — calculation-trace drawer now exposes aria-modal.**
- `frontend/src/features/reconciliation/components/CalculationTraceDrawer.tsx` — the modal Sheet (dimmed overlay + focus trap) had `role="dialog"` + `aria-labelledby` but the underlying Radix primitive emitted no `aria-modal`, so browse-mode AT could wander the inert page behind it. Added explicit `aria-modal` to the `SheetContent`. Live: drawer now reports `aria-modal="true"`. NOTE: likely systemic across app Sheets (Radix not emitting it here) — candidate for a future shared-`sheet.tsx` sweep; scoped to the audited drawer this cycle.

**REJECTED (false positives — auditor measured the visible box, missed the invisible hit-area overlay):**
- F2 "four 'Help information' icon buttons are 24×24px (under 40px floor)" — `HelpTip` (`features/help/components/HelpTip.tsx`) already carries the canonical invisible 40×40 `before:` overlay (`before:h-10 before:w-10` centered) on a 24px visible icon. Effective tap area is 40px. Not a defect.
- F3 "'Collapse tenant summary' button is 24×24px" — `TenantSummary.tsx:235` already has the same `before:h-10 before:w-10` overlay (as do its sibling Expand/Clear buttons). Effective 40px. Not a defect.

**DEFERRED / BY-DESIGN:**
- F1 (active nav) — on the detail page both sidebar + bottom-nav highlight "Properties", not "Reconciliations". The detail route is genuinely nested under `/properties/:id/reconciliations` (the top-level Reconciliations item points at the cross-property list `/reconciliations`), so `startsWith('/properties/')` claiming it is consistent with the URL hierarchy. Marking the Reconciliations item active on a URL that isn't its href would break the "active item == where this link goes" contract. By-design; not changed.
- F6 (tenant billing grid uses `<div>` rows, no `<table>` semantics) — `ReconciliationGrid` is a TanStack virtualized grid; real `<table>` semantics conflict with row virtualization. Deliberate tradeoff (see F-289 list-semantics note). Deferred.
- F8 (LOW: "All/Pools/Tenants" segmented filter lacks role/aria-pressed) — could not locate this control in the reconciliation detail tree; `DenominatorChangePanel` renders a proper `<table>` with `<th scope>` and no such segmented filter. Likely auditor misattribution from another surface. Unverified; not actioned.

tsc clean; reconciliation suites (ReconciliationGrid 32 + VarianceReport 9 + DenominatorChangePanel 12 + CalculationTraceDrawer 18) = 71/71 pass. All 3 fixes live-verified on localhost:5174.

## C75 — disputes: list + detail + Generate-Demand-Letter dialog (2 fixes, 4 rejected, 1 deferred)

**Surface:** `/disputes` list, `/disputes/:id` detail (comment thread, status update, Generate Demand Letter dialog). Landlord, desktop 1280px + mobile 390px. 7 findings raised; 2 genuine defects fixed + live-verified, 4 rejected (exemptions/adequate), 1 deferred.

**FIX (a11y, systemic) — Dialog now exposes aria-modal app-wide.**
- `frontend/src/components/ui/dialog.tsx` — the shared `DialogContent` (Radix `Dialog.Content`) emitted no `aria-modal` (confirmed live: `[aria-modal]` query empty), so browse-mode AT could wander the inert page behind any modal. Added explicit `aria-modal` before `{...props}` (caller-overridable). This is the Dialog twin of the C74 Sheet fix and fixes EVERY app dialog at once. Live: Generate-Demand-Letter dialog now reports `aria-modal="true"`. 35 dialog tests + 18 dispute-detail tests still green.

**FIX (touch target) — Demand-letter State radios get a 40px row.**
- `frontend/src/features/disputes/pages/LandlordDisputeDetailPage.tsx` — the TX/CA `<label>`s wrapping native radios were 24px tall (native 13px radio + text, no min-height). Added `min-h-10` to each label. Live: both labels now 40px. (Radios are form controls so the pill canon doesn't apply; only the 40px tap-row matters.)

**REJECTED:**
- F2 "SelectTrigger is rounded-lg, not a pill" — Select triggers (`role=combobox`) are form controls, EXEMPT from the buttons-are-pills canon (same class as text inputs / date pickers). Not a defect.
- F3 "'Mark as internal' checkbox is 16×16" — shadcn `Checkbox` is the established 16px exemption; its associated `<label>` is `min-h-10` (40px) and is the tap target. Not a defect.
- F5 "comment textarea label is sr-only" — the `<Label htmlFor="dispute-comment">` is sr-only but present (AT reads it) and the textarea has a clear placeholder ("Add a comment…"). Adequate; not changed.
- F7 "filter label is sr-only" — the combobox carries `aria-label="Filter by status"` and an "All Statuses" placeholder. Adequate AT + visual affordance; not a defect.

**DEFERRED:**
- F6 (LOW) "DisputeCard `<h2>` sits inside a `role="button"` div" — valid HTML and the card is fully keyboard-operable (tabIndex 0, Enter/Space). Demoting the h2 to a span would strip the only list-level headings under the page h1; lifting the heading out of the clickable region is a layout refactor with its own tradeoffs. Left as-is pending a deliberate card-pattern decision.

tsc clean; dialog 35 + LandlordDisputeDetailPage 18 = 53/53 pass. Both fixes live-verified on localhost:5174.

## C76 — analysis: year-over-year + trends + compare (4 fixes, 2 rejected, 2 deferred)

**Surface:** `/analysis/year-over-year`, `/analysis/trends`, `/compare`. Landlord, desktop 1280px + mobile 390px. 8 findings; 4 genuine fixes (+live-verified), 2 rejected, 2 deferred.

**FIX (a11y, HIGH) — trend chart data now reaches screen readers.**
- `frontend/src/features/analysis/components/TrendChart.tsx` — the Recharts `LineChart` rendered as `<svg role="application">` with an empty `<desc>`, no accessible name, and no data alternative, so the trend numbers were invisible to non-visual users. Wrapped the chart in a `<figure>` with an `sr-only` `<figcaption>`, marked the SVG `aria-hidden`, and added a visually-hidden `<table>` (caption + per-year rows, mode-aware $ / % formatting). Live: SR table reads "2023 $141,670 / 2024 $154,650".

**FIX (label correctness, MED) — YoY "Export Excel" → "Export CSV".**
- `frontend/src/pages/analysis/YearOverYearPage.tsx` — the handler builds a `text/csv` blob and downloads a `.csv`, but the button claimed "Export Excel". Relabeled to "Export CSV" so the button matches the file it produces. Updated the 4 assertions in `YearOverYearPage.test.tsx`. (Left the genuinely-xlsx "Export Excel" buttons in VarianceReport / SB1103 untouched.)

**FIX (a11y, MED) — disabled-Compare tooltip wrapper now shows a focus ring.**
- `frontend/src/pages/analysis/YearOverYearPage.tsx` — the `<span tabIndex={0}>` wrapping the disabled Compare button (so the tooltip fires on keyboard focus) had no focus-visible styling, unlike its ComparePage twin. Copied ComparePage's `rounded-full ... focus-visible:ring-2 ...` classes so keyboard users see focus.

**FIX (UX, MED) — mobile scroll hint on the YoY results table.**
- `frontend/src/pages/analysis/YearOverYearPage.tsx` — the results table is `min-w-[760px]` in an `overflow-x-auto`; at 390px only the Expense-Pool column shows with no affordance. Added a `sm:hidden` hint "Scroll sideways to see each year." above the table (per the 80-yo-persona goal).

**REJECTED:**
- F5/F8 "legend color swatches / 'Variance Color Legend' should be aria-hidden / demoted" — text labels already convey meaning and the headings are valid in document order; cosmetic-only, not changed.
- F6 "TrendingUp icon not aria-hidden" — Lucide renders icons with `aria-hidden="true"` by default; not a defect.

**DEFERRED:**
- F7 (LOW) "compare summary StatCards are h3 between h2 sections" — valid nesting under the preceding h2; demoting to `p` is a debatable heading-taste call. Left as-is.
- (mobile YoY) a fuller responsive table (stacked cards) would beat horizontal scroll, but that's a larger redesign than this cycle's scope; the scroll hint is the interim fix.

tsc clean; TrendChart 19 + YearOverYearPage 29 + ComparePage 6 = 54/54 pass. All 4 fixes live-verified on localhost:5174.

## C77 — settings + expense pools: required-field semantics + table names (3 fixes, 4 rejected/skipped)

Audit (web/sonnet) swept `/settings/*` (profile, organization, team, billing) and the expense-pools surface. Verified every finding at source before acting.

**FIX (a11y, MED, SYSTEMIC) — required form fields now expose aria-required to assistive tech.**
- `frontend/src/components/ui/form.tsx` — `<FormLabel required>` only rendered an `aria-hidden` `*` (a sighted-only cue); the actual control never carried `aria-required`, so screen readers announced required fields as optional. Lifted the `required` flag into `FormItemContext` (FormItem now holds the state; FormLabel publishes it via a `useEffect`), and `FormControl` mirrors it onto the control as `aria-required={required || undefined}`. Zero call-site churn — fixes every required field app-wide at once. Live-verified: Profile Name + all 3 password fields + the Invite-Member email all read `aria-required="true"`; non-required Email/Role read `null`. (Resolves audit #1 and #7 together — same systemic twin as the C74 Sheet / C75 Dialog aria-modal fixes.)

**FIX (a11y, LOW) — expense-pools table has an accessible name.**
- `frontend/src/components/properties/ExpensePoolsTab.tsx` — the `DataTable` (which already supports an sr-only `<caption>`) passed none, so SR announced a nameless "table". Added `caption="Expense pools for this property"`. Live: `<caption class="sr-only">` present.

**FIX (a11y, LOW) — team tables have accessible names.**
- `frontend/src/pages/settings/TeamMembersPage.tsx` — the desktop members + invitations `<Table>`s had no `aria-label`/caption. Added `aria-label="Current members"` and `aria-label="Pending invitations"` (shadcn `Table` forwards `{...props}` to `<table>`). Live: members table reads "Current members".

**REJECTED / SKIPPED:**
- (audit #2) "stat-card labels are h2, four in a row" — INACCURATE: `StatCard` defaults `titleAs="h3"`, not h2 (`components/ui/stat-card.tsx`). Whether stat labels should be headings at all is a debatable taste call, and demoting/promoting would just trade one heading complaint for another; left as-is.
- (audit #4) "mobile pools table loads with Pool Name scrolled off the left" — dubious premise: Pool Name is the first column in an `overflow-x-auto` wrapper, so it renders at the left edge, not off-screen. A sticky first column / stacked-card redesign is a larger enhancement than this cycle warrants.
- (audit #5) property tab-strip overflow on mobile — pre-existing horizontal scroll; an overflow affordance is an enhancement, not a defect, and out of the settings/pools scope.
- (audit #6) `/expense-pools` URL 404s — the sidebar correctly links `/pools`; `/expense-pools` is a speculative guess URL. A redirect is cosmetic and speculative; skipped.

tsc clean; TeamMembersPage 25 + ProfilePage 36 + ExpensePool* + form 5 + RegisterPage 21 = 287 pass across the touched + form-consumer suites. All 3 fixes live-verified on localhost:5174, zero console errors.

## C78 — onboarding + tax-protest + disputes: heading/ARIA semantics, invalid markup, touch targets (7 fixes, 3 rejected)

Audit (web/sonnet) swept the onboarding wizard, PLG email-capture, tax-protest, dashboard reconciliation card, and disputes list. Verified every finding at source before acting.

**FIX (a11y, MED) — invalid heading-inside-button on dispute cards.**
- `frontend/src/features/disputes/pages/DisputesListPage.tsx` — each `DisputeCard` is `role="button"`, but its category label was an `<h2>`. A button role strips descendant heading semantics from the a11y tree, so the heading was a lie (AT never exposed it) and the card's accessible name was the entire concatenated card text (category + status + description + created date). Changed the `<h2>` to a styled `<span>` and gave the card a concise `aria-label="<Category> dispute"`. Live: both cards read `button "Calculation Error dispute"` / `button "Billing Question dispute"`, no nested heading.

**FIX (a11y, MED) — invalid `<ul>` child + unnamed CTA on the dashboard reconciliation card.**
- `frontend/src/components/dashboard/ReconciliationStatusCard.tsx` — the "View All Reconciliations" button sat directly inside the `<ul>` as a non-`<li>` child (invalid list markup); moved it outside `</ul>`. Per-item CTA buttons had identical generic labels; added `aria-label="<cta> <propertyName>"` so each is distinguishable.

**FIX (a11y, LOW) — tax-protest table accessible name + decorative icons.**
- `frontend/src/pages/tax-protest/TaxProtestPage.tsx` — desktop `<Table>` had no name; added `<caption class="sr-only">Tax protest status by property</caption>`. Added `aria-hidden="true"` to the two decorative `Settings` icons (mobile + desktop Configure links). Live: `table "Tax protest status by property"` with caption.

**FIX (a11y/touch, LOW) — onboarding step buttons hit 40px; wizard gets a programmatic h1.**
- `frontend/src/features/onboarding/OnboardingProgress.tsx` — the jump-to-step circle is 32px on mobile; added the standard invisible 40×40 `before:` overlay (no layout shift, hidden ≥sm where it's already 40px).
- `frontend/src/features/onboarding/OnboardingWizard.tsx` — steps 2–6 only had step-level h2s (WelcomeStep/step 1 renders its own visible h1), leaving those screens h1-less; added `{currentStep > 1 && <h1 className="sr-only">CapVeri setup</h1>}` for SR outline navigation.

**FIX (a11y, LOW) — PLG email field exposes required/invalid state.**
- `frontend/src/features/plg/steps/EmailCaptureStep.tsx` — the work-email `<Input>` was `required` visually only; added `aria-required`, `aria-invalid` (bound to `emailError`), `aria-describedby` pointing at the error `<p>` (now `id="email-error" role="alert"`). (Also repaired a pre-existing broken JSX: the error `<p>` was missing its closing tag.)

**REJECTED:**
- DisputeCard "verbose accessible name" was folded into the heading fix above (the new concise `aria-label` resolves it) rather than treated as a separate change.
- (onboarding step indicator) could not be live-driven for the e2e user — `/onboard` correctly redirects a subscribed user to billing; the wizard renders only for anon/unauth visitors. Source aria-label confirmed; no defect.
- AddCommentForm Checkbox "double naming" — the visible label and the control are correctly associated; no genuine duplicate-name defect, skipped.

tsc clean; DisputesListPage 10 + EmailCaptureStep 5 + OnboardingProgress 9 + OnboardingWizard 14 + TaxProtestPage 6 + ReconciliationStatusCard 15 = 59/59 pass. All fixes live-verified on localhost:5174, zero console errors.

## C79 — modal aria-modal + tenant-portal single-main landmark (3 fixes, 2 rejected, 1 deferred)

Audit (web/sonnet) of the help drawer, reconciliation finalize/export modals, and the tenant portal returned 6 findings; verified each at source.

**FIX (a11y, MED) — Sheet + AlertDialog did not emit `aria-modal`.**
- `frontend/src/components/ui/sheet.tsx` and `frontend/src/components/ui/alert-dialog.tsx` — Radix Dialog/AlertDialog `Content` does not set `aria-modal` in this version, so some screen readers in browse mode can wander into the inert page behind the modal. Added `aria-modal` (before `{...props}`, overridable) on both, mirroring the existing `DialogContent` fix (dialog.tsx:97). Live-verified: open Sheet (Export panel) reports `aria-modal="true"`; open AlertDialog (Delete Property confirm) reports `aria-modal="true"`.

**FIX (a11y, MED) — tenant portal rendered duplicate `<main>` landmarks.**
- Root cause: `App.tsx` already renders the single app-wide `<main id="main-content">` (skip-link target) wrapping every route, and `TenantLayout` rendered a second `<main role="main">` inside it — and three tenant pages each rendered a *third* nested `<main>`. That is up to 3 main landmarks on one tenant route.
- `frontend/src/features/tenant-portal/layouts/TenantLayout.tsx` — content region `<main role="main">` → `<div data-testid="tenant-content">` (same layout classes). Updated `TenantLayout.test.tsx` ("proper layout classes") to query the region by test id instead of the main role.
- `frontend/src/features/tenant-portal/pages/TenantNotificationsPage.tsx`, `TenantPreferencesPage.tsx`, `TenantDisputesPage.tsx` — page-level `<main>` → `<div>`.
- Live-verified: `/tenant/dashboard`, `/tenant/notifications`, `/tenant/preferences`, `/tenant/disputes` each now have exactly 1 `<main>`, and `document.querySelector('main').id === "main-content"`.

**REJECTED:**
- AlertDialogDescription "low-contrast description" — `alert-dialog.tsx` already applies `text-sm text-muted-foreground`; no defect.
- Sheet "missing overlay" — `SheetContent` already renders `<SheetOverlay />`; no defect.

**DEFERRED:**
- Auditor's "4-column tenant breakdown grid lacking table semantics" — could not locate the described `div`-grid element; `TenantSummary` is the intentional F-289 `role="list"` filter and `ReconciliationColumns` is a real TanStack `DataTable`. Needs a concrete repro before any change.
- App-wide note (not a tenant-only defect): the same `App.tsx #main-content` + section-`<main>` duplication exists on the landlord side via `MainContent` (AppShell). Resolving it cleanly requires a full-route audit to pick the single canonical landmark without leaving any route main-less — deferred to a dedicated cycle.

tsc clean; TenantLayout 9 + TenantDisputesPage 15 + sheet 11 + alert-dialog 32 = 67/67 pass (plus NotificationList 14 + EmailPreferences 12 green). All fixes live-verified on localhost:5174, zero console errors.

## C80 — app-wide single `<main>` landmark (10 duplicate mains removed across 7 files)

Follow-up to C79's deferred app-wide note. `App.tsx` renders the single canonical
landmark `<main id="main-content">` (the skip-link target) wrapping every route,
but several descendant shells/pages rendered a SECOND `<main>` nested inside it —
so landlord routes (and onboarding/legal/checkout/auth pages) had 2+ main
landmarks, an ARIA violation (exactly one main landmark per page). C79 fixed the
tenant portal; C80 finishes the rest by demoting every descendant `<main>` to a
`<div>` (all classes/ids/testids preserved) so `#main-content` is the sole landmark
on every route.

**FIX (a11y, MED) — 10 duplicate `<main>` → `<div>` across 7 files:**
- `frontend/src/components/layout/MainContent.tsx` — the landlord shell content
  region (AppShell). This is the highest-impact one: it double-mained EVERY
  landlord page. Updated `MainContent.test.tsx` (11 assertions) to query the
  region by its existing `data-testid="main-content"` instead of the main role.
- `frontend/src/features/onboarding/OnboardingWizard.tsx`
- `frontend/src/features/plg/OnboardFlowWizard.tsx`
- `frontend/src/components/content/ContentPageLayout.tsx`
- `frontend/src/pages/legal/AiTransparency.tsx`
- `frontend/src/pages/CheckoutSuccess.tsx` — 3 mains (loading / error / success branches)
- `frontend/src/pages/auth/AuthCallback.tsx` — 2 mains (error / processing branches)

tsc clean; MainContent + 7 touched specs = 76/76 pass. Live-verified on
localhost:5174 as landlord: `/dashboard`, `/properties`, `/reconciliations` each
have exactly 1 `<main>` with `id="main-content"`, zero console errors.

**NOTE (out of scope, flagged separately):** `src/pages/auth/__tests__/AuthCallback.test.tsx`
has 4 pre-existing failing SSO redirect-timing tests (confirmed failing on clean
HEAD via git stash, unrelated to landmarks). Spawned a separate task to fix the
root cause and consolidate the duplicate AuthCallback test files.

## C81 — Form/table a11y: disambiguate duplicate control names, hide decorative asterisks, label progress

Audit sweep returned 10 findings; verified each at source. 6 were false positives
and rejected:
- **F1** (PropertyFormPage State select missing id) — REJECT: `<FormControl>` forwards
  the generated `formItemId` to the `<SelectTrigger>`; live DOM confirms the id is set.
- **F3** (PropertyFormPage TabsTrigger no 40px target) — REJECT: `role="tab"` is exempt
  from the touch-target floor (per design canon).
- **F4** (FileUploader nested interactive content) — REJECT: the dropzone `role="button"`
  contains only the hidden react-dropzone `<input>`; the Remove `<button>` is a sibling
  section, not nested.
- **F5** (PropertyDetailPage "Upload GL data" CTA) — REJECT: navigating to the property's
  own Imports tab is correct, contextual behavior; a global `/ingestion` jump would lose
  property context.
- **F9** (VerificationPage h1 is raw filename) — REJECT: showing the user's own uploaded
  filename as the document-review title is the expected, useful pattern.
- **F10** (PropertyDetailPage stat-card h2 labels) — REJECT: stat-card titles as h2 is an
  accepted heading pattern.
- **F7 (PropertyFormPage)** — already satisfied via `<FormLabel required>` (asterisk
  `aria-hidden`, control gets `aria-required`).

**FIX (a11y) — 4 genuine defects across 4 files:**
- **F2** `frontend/src/pages/extractions/ExtractionsPage.tsx` — table "Review" and
  "Process"/"Retry" action buttons shared identical accessible names across every row
  ("Review", "Process"), so screen-reader users couldn't tell which document each acted
  on. Threaded `filename` into `ReviewButton`/`ProcessButton` and the mobile card, adding
  `aria-label={`Review ${filename}`}` / `aria-label={`${label} ${filename}`}`. The Process
  button's label is state-aware: while processing it omits the override so the visible
  "Processing…" text remains the accessible name (avoids a stale/misleading SR
  announcement).
- **F6** `frontend/src/components/rent-roll/RentRollUpload.tsx` — the file-select step
  `<CardTitle as="h2">Upload Rent Roll</CardTitle>` duplicated the RentRollUploadPage's h1
  ("Upload Rent Roll"), giving the page two identical top headings. Relabeled the h2 to
  "Choose a file" (also sensible in PropertyFormPage where this component is reused under a
  "Create Property" h1).
- **F7** `frontend/src/pages/leases/LeaseUploadPage.tsx` — the required "Select Property"
  field's `*` asterisk was a bare `<span>` (announced as literal "star" by SR) and the
  `<SelectTrigger>` conveyed "required" only visually. Added `aria-hidden="true"` to the
  asterisk and `aria-required="true"` to the trigger.
- **F8** `frontend/src/features/verification/components/VerificationSummary.tsx` — the
  verification progress bar fell back to the generic `aria-label="Progress"`. Passed an
  explicit `aria-label="Verification progress: X of N fields verified"` (via the Progress
  Root's `{...props}` override, so no duplicate visible label is rendered).

tsc clean; 317 targeted tests pass (extractions/verification/leases/rent-roll), after
fixing the Process-button state-aware label so the existing "Processing…" name assertion
still holds. Live-verified on localhost:5174 as landlord:
- `/extractions`: 3 Review buttons read "Review Suite_310_Lease_Agreement.pdf" etc.
- `/leases/upload`: asterisk `aria-hidden="true"`, trigger `aria-required="true"`.
- `/rent-roll/upload`: one h1 "Upload Rent Roll", h2 now "Choose a file".
- `/verify/:id`: progressbar `aria-label="Verification progress: 0 of 7 fields verified"`.
Only console noise = pre-existing local PDF 404s (unseeded storage), not a regression.

## C82 — Component-level a11y: disambiguate help triggers, scope table headers, name admin tables

Audit sweep over three under-swept surfaces (reconciliation results grid, help drawer,
admin feedback) returned 12 findings. Verified each at source.

**FIX (a11y) — 3 component/page changes, several with app-wide reach:**
- **F2** `frontend/src/features/help/components/HelpTip.tsx` — every help-tooltip trigger
  shared the identical accessible name `aria-label="Help information"`, so SR users
  navigating by button couldn't tell which topic each `?` icon explained. Now
  `aria-label={`Help: ${label}`}` using the existing per-instance `label` prop. Fixes
  EVERY HelpTip across the app (reconciliation detail, ingestion, lease pages, all
  FieldHelpLabel form icons). Updated `FieldHelpLabel.test.tsx` to assert the new
  `/^Help:/` name.
- **F3 + F9(scope)** `frontend/src/components/ui/table.tsx` — the shadcn `TableHead`
  rendered `<th>` with no `scope`, so NO data table in the app associated headers with
  cells for AT. Added a default `scope="col"` (placed before `{...props}` so callers can
  override, e.g. `scope="row"`). Fixes header semantics across every Table app-wide
  (reconciliation list, admin feedback, comparison/variance tables, export mapping, etc.).
- **F8 + F9(empty th)** `frontend/src/pages/admin/Feedback.tsx` — the feedback table had no
  accessible name and an empty final `<th>` (announced as "blank column header" on every
  action cell). Added `aria-label="Feedback submissions"` to the Table and an `sr-only`
  "Actions" label to the last header.

**REJECT (false positives / consistency):**
- **F1/F4/F5** (ReconciliationGrid div-grid has no table/grid roles) — GENUINE but deferred:
  correct ARIA on a TanStack-Virtual grid needs `role="table"` + virtualization-aware
  `aria-rowcount`/`aria-rowindex` and careful focus/editable-cell preservation. Too risky
  for an inline half-measure (role="grid" without an arrow-key model would regress). Flagged
  as a separate task (task_14cdee20).
- **F6** (workflow step number "3 Review" in accessible name) — LOW, deferred.
- **F7** (help glossary `<article>` no accessible name) — LOW, deferred.
- **F10** (admin Feedback stat-card `<h2>` labels) — REJECT for consistency: stat-card
  `titleAs="h2"` is an established product-wide pattern (same call rejected on
  PropertyDetailPage in C81); changing only one page would be inconsistent.
- **F11** — auditor self-rejected (status badges carry text, not color-only).
- **F12** (admin "Feedback" nav naming / no user-facing submit entry) — UX/product decision,
  not a clear defect; out of scope.

tsc clean; 48 targeted tests pass (table/help/admin). Live-verified on localhost:5174 as
landlord: help triggers now read "Help: Calculate"/"Help: Variance"/etc., all `<th scope=col>`,
admin feedback table `aria-label="Feedback submissions"` + sr-only "Actions" header. Zero
console errors.

## C83 — Tenant portal a11y (dashboard, disputes, dispute form)

Audit (web/sonnet, tenant login e2e-tenant@capveri.com) swept the tenant-facing surfaces:
dashboard, dispute list/detail, create-dispute form, notifications, preferences. 12 findings;
verified each at source. FIXED 4 genuine defects + 1 stale test; REJECTED 5 false positives;
DEFERRED 1 (spawn_task), skipped 2 LOW.

Fixed:
- F1 (TenantDashboard.tsx) — statement-row action buttons (Download/Dispute/View dispute) shared
  identical accessible names across rows. Now each aria-label includes property name + period +
  share amount (`statementLabel`), disambiguating even two statements for the same property and
  same period (one per leased unit, which the period alone did not separate — caught in
  live-verify and fixed by appending the share amount).
- F10 (TenantDashboard.tsx) — statements rendered as bare divs; wrapped in <ul className="list-none">
  with each StatementRow root now an <li> so SR users get list count/navigation.
- F2+F9 (TenantDisputesPage.tsx) — dispute card div[role="button"] wrapped an <h2> (flattened into
  the button name, lost from the heading tree) and had no aria-label (name = long concatenated card
  text). Title is now a styled <span>; card carries aria-label="View dispute: <Category>".
- F4 (DisputeForm.tsx) — required Category (Select) and Description (Textarea) had no visible
  asterisk and no aria-required. Added `*` (aria-hidden span) to both labels + aria-required="true"
  on the SelectTrigger and Textarea.
- Stale test (TenantPreferencesPage.test.tsx) — asserted getByRole('main'); the page is now a plain
  <div> (TenantLayout owns the single <main> per the landmark refactor). Re-pointed to the
  EmailPreferences loading spinner (role="status"). Pre-existing failure, confirmed via git stash.

Rejected (false positives): F5 (Radix Select's hidden BubbleSelect is aria-hidden — no a11y issue);
F7/F11 ("CAM"/"Pro-Rata Share" are standard commercial-lease vocabulary the tenant audience uses —
keep necessary domain terms per third-grade-copy); F8 (EmailPreferences already toasts
"Preferences saved" on success and an error toast on failure).

Deferred: F3 (tenant portal has no sign-out / account menu) → spawn_task task_d3683d4c (larger change,
needs AuthContext signOut + dropdown, match landlord Header pattern). Skipped LOW: F6 (lease-card
heading dupe — address/unit already differentiate visually), F12 (dispute-detail heading levels).

tsc clean; 118 tenant-portal tests pass (was 117 pass / 1 pre-existing fail). Live-verified on
localhost:5174 as tenant: dashboard button labels unique with property+period+amount, statement rows
are <li>, dispute cards read "View dispute: Calculation Error"/"Billing Question" with no inner <h2>,
dispute form shows "Category *"/"Description *" with aria-required on both controls.

## C84 — Landlord settings / export / mapping a11y

Audit (web/sonnet, landlord login) swept settings (profile/org/team/billing/invoices), the
column-mapping wizard, and the export panel (PDF/Batch/ERP/History/Board/Variance). 12 findings;
verified each at source. FIXED 5 genuine; REJECTED/deferred the rest.

Fixed:
- F3 (ColumnMappingWizard.tsx:128) — decorative Lucide <Table> header icon now aria-hidden="true".
- F5 (ExportPanel.tsx, History error state) — decorative <AlertCircle> inside role="alert" now
  aria-hidden="true" so AT reads the message, not the SVG.
- F4 (ExportPanel.tsx, Board tab) — cap-rate range slider announced its raw 20–120 value, not the
  "7.0%" shown. Added aria-valuetext={`${(tenths/10).toFixed(1)}%`} + id/htmlFor linking the label.
- F9 (ExportPanel.tsx, ERP tab) — Save-Template name field had only a placeholder/aria-label; added
  a visible <label htmlFor> (low-vision/zoom parity) + id on the input.
- F6 (ProfilePage.tsx, delete-account) — functionally-required "Type DELETE to confirm" input now
  aria-required="true" (button stays disabled until filled, so AT should know it's required).

Deferred: F1/F2/F8 (ReconciliationGrid div-grid has no role="grid"/row/gridcell semantics) — already
tracked by spawn_task task_14cdee20; needs a virtualization-aware ARIA pass, not a half-measure.
Rejected: F7 ("Help: X" colon — intentional C82 pattern; SR colons read as a pause, not a regression);
F10 (TenantSummary collapsed chevron h-8 with before:h-10 pseudo — matches the canonized 40px-pseudo
hit-area pattern); F11 (auditor self-delisted; Radix Sheet wires aria-describedby). Skipped LOW F12
(invoices empty-state <h2> in role="status") — unreachable file, marginal.

tsc clean; 95 targeted tests pass (ExportPanel/ColumnMappingWizard/ProfilePage). Live-verified on
localhost:5174 as landlord: #delete-confirm aria-required="true"; #board-cap-rate-slider
aria-valuetext="7.0%" + label htmlFor; ERP Save-Template visible "Template name" label.

## C85 — expense pools / cap-bank / leases property-detail surfaces

Audit (web/sonnet) swept expense pools, cap-bank ledger, leases tab + lease detail, GL-mappings
dialog, and the user menu. 10 findings; 6 genuine fixed, 3 rejected, 1 deferred.

Fixed:
- F10 (ExpensePoolsTab.tsx) — Type column rendered the raw lowercase enum ("operating"/"tax").
  Now capitalized for landlords (charAt upper + slice). Updated the one assertion that pinned the
  old lowercase text.
- F2 (ExpensePoolsTab.tsx) — Mappings/Splits count buttons were ~24px tall (h-auto p-1), below the
  40px touch floor. Added the canonized before: pseudo-element 40px hit-area (before:h-10
  before:w-full) so the visible button stays compact in the dense table while the tap target is 40px.
- F5 (CapBankLedgerTable.tsx) — column <th> had no scope; added scope="col" (caption already sr-only).
- F7 (PoolMappingsDialog.tsx) — the GL-mappings <Table> had no accessible name; added
  aria-label={`GL account mappings for ${pool.name}`} (shadcn Table forwards it to <table>).
- F8 (LeasesTab.tsx) — leases DataTable had no caption (ExpensePoolsTab already passes one); added
  caption="Leases for this property".
- F9 (LeaseDetailPage.tsx, both Recovery-Profile summary blocks) — Cap Type showed "None" for an
  uncapped lease, contradicting the form's "No Cap". Now maps null/"none" → "No Cap"; also switched
  .replace('_',' ') → /_/g so every underscore is spaced.

Rejected:
- F1/F3 (ReconciliationGrid div-grid lacks role="grid"/row/columnheader/gridcell) — already tracked by
  spawn_task task_14cdee20; needs the virtualization-aware ARIA pass, not a partial one.
- F4 ("Collapse tenant summary" button h-6 — TenantSummary.tsx) — already carries the canonized
  before:h-10 before:w-10 40px pseudo hit-area; not a violation.
- F6 (CapBankLedgerTable "Bank Change" color-only sign) — false positive: negative amounts already
  render a minus via formatMoney (the formatted string is "-$…"), so sign is not conveyed by color alone.

tsc clean; 85 targeted tests pass (ExpensePoolsTab/PoolMappingsDialog/LeasesTab/CapBankLedgerTable/
LeaseDetailPage). Live-verified on localhost:5174 as landlord — all 5 reachable fixes PASS: Type
cells "Operating"/"Tax"; mappings-button ::before height=40px + dialog still opens; dialog table
aria-label="GL account mappings for Controllable Expenses"; leases caption "Leases for this property"
(sr-only); lease detail Cap Type renders "No Cap" for an uncapped lease.

## C86 — tenant portal: dashboard + dispute-detail surfaces

Audit (web/sonnet) swept the tenant dashboard, dispute detail, dispute list, and notifications as
the tenant user. 7 findings; 3 genuine fixed, 4 rejected. Coverage gap noted: no web statement
DETAIL/breakdown view exists (tenant can only download the PDF) — product gap, not an a11y bug;
notifications page seeded empty so only its empty state was testable.

Fixed:
- F1 (TenantDashboard.tsx) — statements <ul> uses list-none, which makes Safari/VoiceOver drop the
  implicit list role (no "list, N items"). Added explicit role="list".
- F6 (TenantDashboard.tsx) — the two <section>s were unnamed landmarks. Added aria-labelledby +
  ids on the "Your Leases" and "CAM Reconciliation Statements" headings so AT can jump to each region.
- F3 (DisputeDetailPage.tsx) — the "Add a comment" textarea label was sr-only, leaving only a
  placeholder that vanishes on typing (an 80-yo loses context mid-entry). Made the label visible
  (text-sm font-medium); textarea stays linked.

Rejected:
- F2 (DisputeDetailPage "What you disputed" h2 styled small/muted) — converting to <p> removes a
  heading from the AT structure; the muted caption styling is intentional. Low value, regression risk.
- F4 (EmptyState role="status") — shared component used app-wide; a live-region role on a
  conditionally-rendered empty state is a defensible "no results" announcement pattern. Too broad to
  change on a LOW theoretical concern.
- F5 (TenantDisputesPage dispute cards div[role="button"]) — canonized accepted pattern with Enter/
  Space keydown handled; button conversion risks nested-interactive/layout regressions.
- F7 (Dispute/View buttons exactly 40px, size="sm") — 40px is the project's canonized touch-target
  floor; compliant, not a defect.

tsc clean; 33 targeted tests pass (TenantDashboard/DisputeDetailPage). Live-verified on localhost:5174
as tenant: ul role="list"; both sections aria-labelledby → "Your Leases"/"CAM Reconciliation
Statements"; dispute-detail "Add a comment" label computed visible (position static, not clipped).
