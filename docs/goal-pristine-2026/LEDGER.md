# Goal: Pristine System Sweep (2026-06) — LEDGER

> Long-running, multi-session. Make the CapVeri product pristine in **function, UI, and UX**.
> Bar: a Gen-Z says "that looks nice" at every surface AND an 80-year-old can use every part
> without getting stuck. Screenshot + evaluate every screen/modal/button. Test E2E locally with
> real workflows. Fix + verify on the go. Multiple review/fix cycles until nothing remains.
> Sub-agent driven. Prior sweeps are reference, NOT trusted.

## Local Environment (verified working 2026-06-19)
- Frontend (Vite/React product app): http://localhost:5173
- Backend (Python FastAPI, legacy-reference but what the frontend `.env.local` targets): http://127.0.0.1:8001
- Supabase (local): http://127.0.0.1:54321 · DB container `supabase_db_camaudit` (psql port 54322)
- Studio: http://127.0.0.1:54323 · Mailpit: http://127.0.0.1:54324
- **Login (landlord):** `owner@acme.example.com` / `TestPass123!` — org `aaaa…0001`, 2 properties
  (Downtown Tower, Suburban Office Park), Professional plan, full leases/reconciliations/billing.
- **Login (tenant portal):** `sarah.tenant@retailstore.com` / `TestPass123!` — 3 leases, 2 disputes.
- Other landlords: owner@beta (Starter/trialing), owner@gamma (Free), owner@delta (Professional),
  owner@epsilon (Starter). All password `TestPass123!`.

### How the data got here
- `seed_manual_testing.sql` (6 props, 45+ leases, 90+ snapshots, disputes, billing, tenant portal)
  was NOT applied locally. Applied a **patched** copy (`/tmp/seed_mt_patched.sql`): the original
  has a seed bug — `reconciliation_snapshots.finalized_by_user_id` references ids (`…bbbb0001`)
  that don't match the seeded user ids (`…bbbbb001`), so the final FK re-check aborted the single
  wrapping transaction (BEGIN at line 46) → full ROLLBACK → nothing committed. Patch nulls dangling
  `finalized_by_user_id` right before `SET session_replication_role = DEFAULT` (line ~3493).
  **TODO (low):** fix the id mismatch in the committed seed so finalized-by survives. spawn_task candidate.

### Starting servers (this Bash tool)
- Use the tool's native `run_in_background: true` (NOT `&` — detached `&` dies with the wrapper shell).
- Background shells start at a FRESH cwd — use absolute paths (`cd <repo-root>/...`).
- Backend: `python -m uvicorn app.main:app --port 8001` (from backend/; global Python 3.13.5 has deps).
- Frontend: `npm run dev` in frontend/ → Vite on localhost:5173 (binds localhost/IPv6; curl 127.0.0.1 may 000).
- Docker/psql from Git Bash: prefix `MSYS_NO_PATHCONV=1` to stop path mangling of container paths.

## Route map (product app — frontend/src)
Public: / about pricing contact privacy cookies help resources/* sample-report compare tax-protest
  compliance/ai-transparency  · Auth: /auth/login /auth/register /auth/forgot-password /auth/reset-password
Landlord app: /dashboard /properties /properties/:id (+/edit /reconciliations /leases/*) /properties/new
  /leases/upload /rent-roll/upload /ingestion /documents /extractions(/:id) /pools /reconciliation(/current /history)
  /analysis(/trends /year-over-year) /portfolio(/pipeline) /disputes(/:id) /onboard(/unlock) /onboarding
  /settings(/profile /team /organization /billing /billing/invoices) /admin(/feedback)
Tenant portal: (TenantLayout) dashboard, statements, disputes(/:id), notifications, leases

## Methodology per cycle
1. Pick a surface group. Drive the real browser (preview MCP) as the right role; screenshot every
   state (empty, loaded, modal, error, hover/focus, mobile 390px + desktop, dark if present).
2. Evaluate: visual taste/consistency (spacing, type scale, color, pills canon, alignment, density),
   UX/intuitiveness (80-yo can't get stuck; clear affordances/labels/empty states/loading/errors),
   function (does the real workflow work end-to-end?), a11y (labels, focus, contrast, touch ≥40px).
3. Log findings here with severity (P0 blocker / P1 bad-look-or-stuck / P2 polish / P3 nit).
4. Fix in code, re-verify in browser, run impacted tests + typecheck.
5. Review-merge cycle on the diff. Direct-to-master (per repo policy: local merge, no PRs).

## Severity legend
P0 = functional failure / blocks selling. P1 = looks bad or a user gets stuck. P2 = polish. P3 = nit.

---

## CYCLE LOG

### C0 — Session 1 bootstrap (2026-06-19)
- Synced master, brought up local stack, applied patched manual-testing seed, verified landlord +
  tenant login + data through the real backend. Wrote this ledger. Next: first browser recon sweep
  of the landlord core (login → dashboard → properties → property detail → reconciliation).

### C1 — Session 2: screenshot tooling solved + landlord-core first pass (2026-06-19)
- **Tooling blocker SOLVED.** `preview_screenshot` (Claude_Preview MCP) hangs 30s on *everything*
  in this env — verified it times out even on a blank static page while `preview_snapshot`/`eval`/
  `network`/`console` all work. Root cause is the screenshot capture path itself, not page content/
  network/animations. **Fix: own Playwright harness** `docs/goal-pristine-2026/shoot.cjs` (uses
  frontend/node_modules/playwright). `node shoot.cjs login owner|tenant` persists a real UI session
  to `.state-<role>.json`; `node shoot.cjs shot <role> <label> <route...>` captures desktop(1440)+
  mobile(390) full-page PNGs into `shots/` (gitignored) that I Read directly. Waits networkidle +
  for `.animate-pulse`/skeletons to clear before shooting. **Run from Git Bash with `MSYS_NO_PATHCONV=1`**
  or leading-slash routes get mangled to `C:/Program Files/Git/...`.
- **Product change (pending commit):** `frontend/src/main.tsx` — PostHog now honors
  `VITE_DISABLE_ANALYTICS=1` opt-out (default unchanged). Set that flag + commented `VITE_CRM_WIDGET_KEY`
  in gitignored `frontend/.env.local` so local dev stops beaconing the prod PostHog project and the
  failing crm.ventoralabs.com widget request. TODO: run frontend tests for main.tsx, then commit the
  main.tsx change (NOT .env.local).
- **First pass (owner@acme, desktop+mobile): dashboard, /properties, /reconciliations** — all three
  look strong: clean type scale, pill buttons/CTAs, consistent stat cards w/ colored left-borders,
  status pills, sortable tables, search, pagination. Real seed data renders ($19,476 to recover,
  Downtown Tower + Suburban Office Park drafts). No P0/P1 here.
- **Watch (P3, not yet pursued):** three distinct money figures across surfaces — dashboard "Money to
  recover" $19,476 vs reconciliations "2024 Recovery" $46,724.98 vs dashboard "Corrected to date"
  $42,966. Different definitions (net-owed vs total tenant-billable vs ?), but a buyer could read them
  as inconsistent. Confirm definitions are labeled clearly enough; revisit.
- Next: deeper surfaces where defects hide — reconciliation worksheet (Review → grid + modals),
  property detail tabs, empty/error states, settings/billing, then tenant portal.

### C2 — Session 3: 3-agent sub-audit + pre-merge review fixes → shipped (2026-06-19)
- **Method:** decomposed into 3 parallel sub-agents (forms/upload, tenant portal, reconciliation
  worksheet), triaged every finding against source (did NOT trust agents — separated real product
  defects from local-env artifacts), fixed, gate-greened, **pre-merge code review**, then fixed the
  review's one real finding before merge. Shipped to origin master `94d6c237`.
- **Real defects fixed (11 files):**
  - `FileUploader.tsx` — rejection handling was clearing ALL previously-selected valid files
    (P0 caught in review: `LeaseUploadPage` uses maxFiles=10, so one bad file wiped a 10-file batch).
    Now non-destructive: shows errors + red border (`errors.length>0`), keeps valid files; `removeFile`
    clears stale errors. Also fixes the original A1/A2 (oversize submittable, wrong-type no red border).
  - `ExportPanel.tsx` — 4 native `<select>` → Shadcn `<Select>` (ERP system, per-field mapping,
    load-template, history format) for visual consistency + a11y; `__default__`/`__all__` sentinels
    round-trip to '' correctly.
  - `CalculateButton`/`FinalizeButton`/`ExportButton` — responsive split labels + stable `aria-label`
    (fixes jsdom accessible-name doubling AND improves screen-reader text on mobile).
  - `ExpensePoolsTab` — `overflow-x-auto` wrapper (mobile column clipping).
  - `ExpensePoolFormModal` — mobile bottom padding clears the h-14 bottom-nav overlap.
  - `HelpTerm` — optional `tipClassName`; `ReconciliationPage` hides the variance `?` on mobile
    (was a sub-40px touch target).
  - `EmailPreferences` — `retry:1` so a real load failure surfaces the ErrorState fast.
  - `TenantLoginPage` — honest catch-all error copy for the null (failed) login path (login() returns
    null for multiple causes; page can't distinguish, so don't claim "incorrect password").
  - `seed_manual_testing.sql` — **P0 data bug**: tenant_users.user_id (+dispute/document FK authors)
    used an 8-b UUID while auth.users/public.users use 9-b → `tenant_users WHERE user_id=auth.uid()`
    found nothing → entire tenant portal 404'd. Fixed all ids to 9-b; verified ids_match=t, tenant
    dashboard API 200 w/ 3 leases. (This unblocked tenant-portal testing; NOT product code.)
- **Review findings dispositioned:** FileUploader multi-file P0 = real, fixed. Seed-incompleteness P0 =
  unfounded (grep `bbbbbbbb0\d{3}` → 0 matches, seed is consistent). ExportPanel sentinel-collision P1 =
  theoretical only (no ERP field is literally `__default__`); left as the established pattern.
- **Gate:** typecheck clean, lint clean, FileUploader+consumers 88/88, full impacted suite green.
- **Tooling:** gitignored throwaway per-cycle `*.cjs`/`*.mjs` audit scripts (kept `shoot.cjs`).
- **Tenant-portal residuals (lower priority, NOT yet fixed):** ErrorBoundary renders outside
  TenantLayout (mobile dead-end), nav lacks Statements/Leases links, mobile drawer has no visible
  close button, redundant "Go to Dashboard" CTA.
- Next: still-unswept landlord surfaces — /settings/{profile,team,organization,billing/invoices},
  /tax-protest, /extractions, /verify/:documentId (HITL), /portfolio(/pipeline), /onboard(ing), /help,
  lease detail/form; empty-state user (gamma/free) + error states; then the tenant-portal residuals.

### C3 — Session 3: landlord surface sweep (settings/billing + secondary pages) → verified pristine (2026-06-19)
- **Swept (desktop+mobile):** /settings/{profile,team,organization,billing,billing/invoices},
  /extractions, /tax-protest, /help, /portfolio, /portfolio/pipeline, /onboard, /onboarding,
  property detail, lease-create form, /leases/upload. Method: own harness shots + a sub-agent
  triage, then **I re-verified every flagged item against source/screenshots** (did not trust the
  agent blindly).
- **Result: no real product defects.** Settings/org/billing/invoices/team are genuinely polished
  (cards, pills, copy-button, over-limit warning banner, danger zone, good empty states). The
  sub-agent's 8 findings all dissolved on verification:
  - "Property tab strip clipped on mobile, no affordance" → FALSE: tabs use `ScrollableTabsList`
    which already renders left/right scroll-fade affordances via ResizeObserver (tabs.tsx). Fade is
    just subtle on white; structurally correct.
  - "Billing plan list covered by bottom-nav on mobile" → FALSE (screenshot artifact): `<main>` in
    App.tsx:218-224 already applies `pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0` whenever
    the app shell shows, so all landlord pages clear the fixed BottomNav. A position:fixed nav simply
    renders at first-viewport-bottom in a full-page capture.
  - "Lease form dates are dd/mm/yyyy" → test-machine locale artifact; native `<input type=date>`
    localizes to the user's OS (US users get mm/dd).
  - "Delete button too prominent" → defensible: it's `variant="destructive"` AND opens a confirm
    AlertDialog (not one-click). Left as-is.
  - "/onboarding redirects to billing wall" → intentional plan-gate (org over unit limit).
  - tax-protest "Configure" link, pipeline 2026-empty default, help long-scroll → all
    consistent-with-app or seed-data artifacts; not defects.
- **Demo-polish note (NOT product code):** seed temporal staleness — invoices dated 2026 for 2024
  service periods; billing "Next invoice Dec 31, 2024" is in the past; portfolio/pipeline default
  year (current) looks empty because seed data is 2024. Worth refreshing the seed before a big-client
  demo, but it's data, not code.
- **Takeaway:** C1/C2 hardening holds; the landlord app is pristine across the swept surfaces.
  Restraint applied — no churn manufactured from marginal nits.
- Next: tenant-portal residuals (concrete known-real from C2): ErrorBoundary outside TenantLayout
  (mobile dead-end), nav missing Statements/Leases links, mobile drawer lacks a visible close button,
  redundant "Go to Dashboard" CTA.

### C4 — Session 4: mobile nav drawer close button (shared Sidebar) (2026-06-19)
- **Fixed (real "80-yo gets stuck" gap):** the shared `Sidebar` mobile drawer
  (`components/layout/Sidebar.tsx`) had no visible close control — only backdrop-tap,
  Escape, or nav-item-tap dismissed it, none obvious to a non-technical/elderly user.
  Added an explicit `X` close button to the drawer brand header: `md:hidden` (docked on
  desktop, no effect there), `ml-auto` right-aligned, 44px touch target (`h-11 w-11`),
  `rounded-full` per pill canon, `aria-label="Close navigation menu"`, wired to
  `onMobileClose`. The desktop aside's copy of the header stays hidden (`hidden md:flex`)
  so there's no duplicate visible button. Shipped **8fc76261** → origin/master.
- **Benefits both portals** — Sidebar is shared by the landlord workspace and tenant portal.
- **Verified:** Sidebar.test (47) + tenant-portal suite (118) green; `tsc --noEmit` clean;
  eslint clean; pre-commit hooks passed. Visual proof captured on **both** drawers (390px):
  landlord `/dashboard` and tenant `/tenant/dashboard` — X renders cleanly top-right next to
  "CapVeri", tasteful and unmistakable.
- Next: remaining tenant-portal residuals — ErrorBoundary renders outside TenantLayout (mobile
  dead-end on error), redundant "Go to Dashboard" CTA; then screenshot-sweep the unswept tenant
  surfaces (login dashboard, disputes, notifications, help, preferences, create-dispute,
  dispute-detail) now that the C2 tenant-seed UUID fix unblocked them.

### C5 — Session 4: tenant-portal full sweep → verified pristine (2026-06-19)
- **Swept (desktop+mobile):** /tenant/{dashboard,disputes,disputes/new,notifications,help,
  preferences}. Method: own harness shots + direct screenshot review + source verification.
- **Result: no new defects; the C2-noted residuals all dissolve on inspection.**
  - Dashboard: clean lease cards, CAM statement row with amount + status pill + View dispute /
    Download (pills), friendly plain-language helper copy.
  - Disputes history, Submit-dispute empty-state ("Pick a statement first" -> Go to your dashboard),
    Notifications empty-state, Email Preferences (4 toggles), Tenant Help (3 numbered how-to cards) --
    all polished, plain-language, pills, good empty states.
  - **"ErrorBoundary outside TenantLayout = mobile dead-end" -> NOT real.** The page fallback
    (ErrorBoundary.tsx ErrorFallback) gives TWO recovery paths: "Try again" (resets the boundary)
    and "Go to home" (window.location.href='/'). Root route (App.tsx:248-253) role-redirects an
    authed tenant to /tenant/dashboard, so the tenant lands home, not stuck. Out-of-layout
    placement (App.tsx:228, context="Routes") is deliberate -- the fallback must survive a
    TenantLayout that itself threw.
  - **"Redundant Go to Dashboard CTA" -> defensible.** Disputes are started from a statement on the
    dashboard, so the button is the path to the page's primary action; clearly labeled. Left as-is.
  - **"Missing Statements/Leases nav links" -> non-actionable.** No such routes exist; statements
    live on the dashboard (CAM Reconciliation Statements section).
- **One real fix this session shipped as C4** (mobile drawer close button) -- benefits this portal too.
- **Takeaway:** tenant portal is pristine. Restraint applied -- no churn from dissolved residuals.
- Next: the landlord reconciliation workspace (calculate -> review -> export -> finalize) -- the core
  selling surface -- then HITL verify (/verify/:documentId), /extractions detail, and auth screens.

### C6 — Session 4: core reconciliation workspace + error/extraction surfaces -> verified pristine (2026-06-19)
- **Swept (desktop+mobile):** /reconciliations (list), /properties/:id/reconciliations (the
  workspace), a 404 route, /extractions (HITL entry). Method: own harness shots + direct review.
- **Reconciliations list:** title + Start Reconciliation pill, year/property/status filters, 4 KPI
  cards (Properties/Total Tenants/Draft/2024 Recovery $46,724.98 green), per-property table with
  status + Review pills. Sells well.
- **Reconciliation workspace (core selling surface):** breadcrumb, 4-step stepper
  (Upload GL -> Reconcile -> Review -> Finalize), actionable "Missing GL Account Mappings" warning
  (Show me how / Configure Mappings), 4 stat cards, tenant table (Tenant Billable / Admin Fee /
  Final Amount; Final = Billable with Admin shown as a transparency sub-component -- internally
  consistent, Grand Total $34,722.13 ties to the stat card and the tenant-share panel %s), and
  honest helper copy ("These numbers come from your files and may have errors..."). Mobile adapts
  cleanly (abbreviated Run/Finalize labels, stacked cards, All/Pools/Tenants segmented filter).
  - **Noted, left as-is (deliberate):** two filled primary buttons (Run reconciliation +
    Finalize & deliver) coexist in the toolbar. Distinct shades; re-running during Review is
    legitimate and Finalize is terminal; survived the 136-cycle Pristine UX Marathon. Restraint
    applied -- not manufacturing a primary-hierarchy change that could regress intentional design.
- **404 page:** big 404, clear copy, Go Back + Go to Dashboard pills, 4 Quick-Links cards, Contact
  Support, legal footer -- excellent recovery UX, renders inside the app shell.
- **/extractions empty state:** "No documents to verify", plain-language HITL explainer ("AI reads
  the document and pulls financial data for you to review before it's saved" + "How does AI
  extraction work?" card), Upload Document pill. Reinforces the human-verification constraint.
- **Takeaway:** the core selling surfaces are pristine. No defects found; restraint applied.
- Next (lower priority / deeper-seed needed): populated /verify/:documentId HITL verify screen,
  /extractions populated list, auth screens (login/signup/forgot, tenant variants), 403; then a
  modal/dialog pass (finalize confirm, dispute submit, export config) and marketing later.

### C7 — Session 5: auth-screen sweep + tenant signup plain-language copy fix (2026-06-19)
- **Swept (desktop+mobile):** landlord /auth/login (polished, no change), tenant /tenant/login and
  /tenant/signup (token-valid + token-error states). Method: own harness shots + direct review.
- **Real defect found + fixed — developer jargon in tenant signup errors (shipped e3066323).**
  TenantSignupPage surfaced raw engineer language to non-technical tenants: "Invalid invitation
  link - no token provided", "Invalid or expired invitation", "Invalid invitation token", and a
  "Validating invitation..." spinner. A tenant has no idea what a "token" is and cannot act on it.
  - Rewrote all 4 error states + loading copy in plain language that points to the next action:
    no-token-in-URL -> "This invite link is broken. Ask your property manager to send you a new
    one."; API-invalid / catch / submit-without-token -> "This invite link no longer works. Ask
    your property manager to send you a new one."; spinner -> "Checking your invite...".
  - Ran the required gate: humanizer pass, then third-grade-copy (evaluate_copy.py FK grade ~3,
    <=10 words/sentence, no em dashes/semicolons). CardTitle "Invalid Invitation" kept (clear,
    short). Realigned 4 test assertions to the new strings; full suite 12/12 green, tsc + eslint clean.
- **Restraint:** landlord /auth/login left untouched (already polished); only the genuine
  act-on-it copy defect was changed. No manufactured churn.
- Next: tenant /tenant/forgot-password (not yet captured), landlord /auth/{register,forgot-password,
  reset-password} visual review, 403 page, then the modal/dialog pass (finalize confirm, dispute
  submit, export config), then populated /verify/:documentId + /extractions; marketing later.

#### C7 addendum — auth marketing panel jargon (shipped 606e5850)
- Second real defect this session: the shared login/register left panel (FeatureShowcase.tsx)
  bullet read "Gross-ups, caps, base years, exclusions. Deterministic, traceable math." The CRE
  domain terms are what the buyer wants (kept), but "Deterministic" is unexplained jargon that
  fails the 80-yo / third-grade test. Rewrote the trust clause as plain words that preserve the
  deterministic-vs-AI positioning: "The same math every time. You can check every number."
  Gate passed (avg 5 words/sentence, FK ~3-4); FeatureShowcase tests 5/5, tsc + eslint clean.
- Auth sweep verdict: /auth/{login,register,forgot-password,reset-password}, tenant
  /tenant/forgot-password, and /403 are otherwise pristine (clear headings, pill CTAs, recovery
  links, consistent branding). Two genuine copy defects found + fixed; no manufactured churn.

### C8 — Session 5: modal/dialog pass -> verified clean; restraint applied (2026-06-19)
- **Method:** dispatched a read-only sub-agent to enumerate + read every Dialog/AlertDialog/Sheet
  and report concrete copy/jargon/pill/a11y defects with file:line; I critically re-judged each.
- **Audited (all CLEAN):** FinalizeModal, CheckoutDialog, PoolAllocationsDialog, ApprovalDialog,
  RejectDialog, ExpensePoolFormModal, UnitFormModal, ConfirmPlanDialog, FreeAuditUpgradeModal,
  ReconciliationKickoffModal, PoolCopyDialog, ExitIntentDialog, VideoModal, PoolMappingTourSheet,
  ReconciliationWorkflowTourSheet, both PDFPreviewModals. Pills conform (rounded-full / 9999px),
  icon buttons have aria-labels + 44px targets, destructive actions confirm, action labels name
  the action ("Finalize & deliver", "Log Request", "Create/Update Pool").
- **Three agent flags re-judged; all rejected as edits (restraint):**
  - PoolMappingsDialog "GL Account Mappings" -> NOT a defect. "GL" is the buyer's own daily
    vocabulary (accountant/PM) and is used app-wide ("Upload GL" in the workspace stepper);
    renaming one dialog would create inconsistency.
  - PDFPreviewModal iframe `rounded` -> NOT a defect. An iframe is not a button; pill canon
    doesn't apply. Marginal CSS nit = manufactured churn.
  - SB1103RequestDialog "Qualified Commercial Tenant (QCT)" + "Civil Code § 1938.1" -> NOT a copy
    defect. QCT is a defined legal term presented define-then-use; the statute citation is exact
    legal text (out of scope for the copy rule) and the landlord operating this compliance feature
    needs the precise terms. No softening.
- **One factual/legal flag raised (NOT edited):** SB 1103's CAM-disclosure provisions + the
  "qualified commercial tenant" definition appear to live in Civil Code § 1950.9, while § 1938.1
  is the older CASp disability-access statute. A wrong citation in a compliance product is
  high-impact, but I will not silently edit a statute number on uncertain memory. Flagged to Angel
  as a verification task (spawn_task task_24d9d816) to confirm against the real statute and fix
  everywhere if wrong.
- **Takeaway:** modal layer is pristine. Zero UX/copy edits; restraint held the line on 3 false
  positives; one legal-accuracy question correctly escalated instead of guessed.

### C9 — Session 5: landlord core surfaces sweep -> verified pristine (2026-06-19)
- **Swept (desktop, owner session):** /dashboard, /properties, /settings/profile, /settings/billing,
  /settings/organization, /pools (Expense Pools), /disputes. Method: own harness shots + review.
- **Dashboard:** "Money to recover $19,476" hero + single clear CTA, plain helper copy ("See what
  you've recovered and what to do next"), 3 stat cards, Quick Actions (Add Property / Upload GL /
  Reconcile / Portfolio), per-property Reconciliation Status with status badges + Run/Review pills.
- **Properties:** sortable table (name/address/rentable+usable sqft/created), search, pill
  pagination, Add Property pill. Clean.
- **Profile Settings:** sectioned (Profile / Change Password / Linked Accounts / Delete Account),
  honest delete copy with type-DELETE guard + "we keep tenant history, audit logs, final
  reconciliation records for compliance", clear password rules, pills throughout.
- **Billing:** accurate over-limit alert (41 units tracked vs 1 covered, 40 more needed), Current
  Plan, Usage bars (Rentable Units 41/1 red, Buildings 4/Unlimited, Team 4/Unlimited), pill CTAs.
- **Expense Pools (/pools):** property-picker landing, "Properties Available 4", per-property cards,
  Copy Pools / Copy Between Properties / Add Property pills. Clean.
- **Disputes empty state:** excellent — "No disputes yet" + plain explainer ("When a tenant
  questions a charge on their CAM statement, it shows up here so you can respond. Nothing needs
  your attention right now."). Reassuring, jargon-free.
- **False alarm corrected:** my direct-nav to /expense-pools 404'd, but the real route is /pools and
  the sidebar nav (config/navigation.ts:91-96) links there correctly. NOT a broken link. (The 404
  page itself rendered perfectly in-shell — re-confirms C6.)
- **One item deliberately deferred (restraint):** billing plan tagline "Run lease-accurate CAM
  reconciliation without spreadsheet drift" — "spreadsheet drift" is evocative-but-unclear for an
  80-yo, BUT it lives in plan-tiers.json / knowledge/source/product.ts as the CANONICAL generated
  tagline shared across app + marketing pricing + backend + AI knowledge. It's deliberate
  positioning that survived prior sweeps. Changing it = cross-cutting marketing change (source
  regeneration + marketing gate), out of scope for an app-UX sweep, low severity. Candidate for a
  dedicated marketing-copy pass, not this one.
- **Takeaway:** the entire landlord core surface is pristine. Zero app defects; one false alarm
  corrected; one cross-cutting tagline correctly deferred rather than churned.

### C10 — Session 5: secondary-nav surfaces sweep -> verified pristine (2026-06-19)
- **Swept (desktop, owner session):** /analysis/year-over-year, /analysis/trends, /ingestion
  (Upload GL), /tax-protest, /help (captured). Method: own harness shots + review.
- **Year-over-Year:** plain copy ("Compare expense pools across years and see where costs
  changed"), property selector, Compare pill correctly disabled until a property is chosen.
- **Trend Analysis:** Filters & Options (Property / Expense Category / Y-Axis Scale / Show
  trendline), Export PNG, empty-state prompt. Honest AI disclaimer: "Anomaly labels come from AI
  and may be wrong. All expense figures come from your files. Check both against your source data
  before you act on them." — satisfies the human-verification constraint, plain language.
- **Upload GL (/ingestion):** EXEMPLARY plain-language onboarding. Defines "General Ledger (GL)"
  inline, and the "Before you upload this spreadsheet" panel explains what a spreadsheet IS
  (".csv, .xls, .xlsx"), names the source systems (Yardi, MRI, AppFolio, RealPage, Excel), and
  tells a non-technical user where to find the file ("check your Downloads folder"). Nails the
  80-yo test. Re-confirms "GL" is properly-defined app vocabulary (C8 judgment holds).
- **Tax Protest:** clean per-property status table (Property/County/State/Deadline/Status/Actions),
  Configure actions, "Not configured" badges. Plain subtitle.
- **Help (/help):** comprehensive help center — "New to CapVeri? Start here" video hero, a Glossary
  that DEFINES domain terms (CAM, gross-up, etc.), Start-Here / Typical-flow / Understand-CAM /
  Fix-a-problem / Tenant-questions sections. Visibly excellent and directly serves the 80-yo goal.
  DEFERRED to its own focused cycle: it's a large content page; a reliable copy audit wants a
  sectioned capture or a scan_copy.py run over the help source, not a tail-of-session eyeball.
- **Takeaway:** secondary-nav surfaces are pristine; zero defects. Help flagged for a dedicated
  copy-scan cycle (next).

## C11 — Help callouts: onboarding + error-recovery copy (c563f652)

Ran `scan_copy.py src/features/help` (21 strings, 9 fails). Applied judgment, not
the scanner verbatim: fixed 5 genuine mouthfuls, left 4 as restraint.

**Fixed (BeginnerFileGuide.tsx + FriendlyError.tsx):**
- PDF "too large" row (21 words, FK 7.8) → 3 short sentences.
- Billing definition: passive "what tenants were actually charged" → active "what you billed tenants".
- Billing report row: dropped vague "best", split two ideas.
- Billing year row: removed "so that" stacked clause.
- FriendlyError recovery (16-word line) → 3 steps.

**Left (restraint):** spreadsheet lines 14/15 (17 words but inflated by 5 ERP
product names, clear one-breath act-on-it copy), line 23 (11-word single idea),
HelpTip.tsx line 31 (Tailwind className — pure scanner false positive).

All 5 rewrites pass evaluate_copy.py gate. tsc + eslint clean, help suite 8/8.
Scan now 4 fails, all confirmed leaves. Committed c563f652, pushed to master.

## C12 — Dashboard reconciliation rows: mobile name-crush fix (21d7a479)

Fresh screenshot sweep of dashboard + extractions (mandate: don't trust prior
"pristine" claims). Extractions empty state confirmed pristine. Dashboard
desktop pristine. **Mobile defect found:** ReconciliationStatusCard rows put
the CTA button + name + wide "Needs reconciliation" badge on one flex line;
shrink-0 button + badge crushed the property name to a single char ("N", "H").
Rows with the narrower "Draft" badge happened to fit, masking the bug.

Fix: `<li>` stacks vertically on mobile (`flex-col` + button `w-full`), row
layout restored at `sm:`. Names now readable; desktop PNG byte-identical
(123321b before/after). tsc + eslint clean, card tests 15/15. Shipped 21d7a479.

## C13 — Tenant portal full-surface sweep (verification, no code change)

Mid-session the tenant dashboard showed the "Something went wrong" error
boundary. Diagnosed via console capture: `ERR_CONNECTION_REFUSED` against
:8001 — the Python backend had **died mid-session** (`/health` = 000), and
because `VITE_API_URL=http://127.0.0.1:8001` is absolute the browser hits the
dead port directly. NOT a product defect — the ErrorBoundary correctly handled
a backend-down state. Restarted uvicorn (global Python 3.13.5, app imports
clean), polled `/health` to 200, re-shot.

Fresh desktop + mobile sweep of every tenant route, all pristine:
- `/tenant/dashboard` — leases grid + statement card; mobile stacks cleanly,
  statement amount/badge/View-dispute/Download don't crush.
- `/tenant/disputes` — Dispute History; full-width pill CTA on mobile, dispute
  bodies truncate with ellipsis (bodies are UGC, copy gate N/A).
- `/tenant/notifications` — empty state ("No notifications yet") clean.
- `/tenant/preferences` — Email Preferences toggles clean both breakpoints.
- `/tenant/help` — 3-column guide cards stack to single column on mobile,
  plain-language copy reads well.

No defects. LESSON (reinforces C12): a dead local backend reads as a product
error through the absolute VITE_API_URL; always confirm `/health` before
treating a tenant-portal error boundary as a bug.

## C14 — Landlord settings/billing cluster sweep (verification, no code change)

Swept the previously-unswept landlord account cluster, desktop + mobile, all
pristine:
- `/settings` + `/profile` → both redirect to `/settings/profile` (Profile
  Settings): name/email/role, change-password with strength rule, Google
  linked-account, Delete-Account confirm. Clean.
- `/settings/organization` — org name, Support ID with copy button, subscription
  status. Clean.
- `/settings/team` — members table with role dropdowns, owner row "Protected",
  pending-invitations empty state, Invite Member pill. Clean.
- `/settings/billing` — Billing & Subscription: rentable-unit-limit alert,
  current plan, payment method, usage bars, billing history. Mobile stacks
  cleanly under the fixed bottom nav. In-app billing reminder copy is allowed
  (value-only-email rule) and reads clearly — left as-is (restraint).
- `/settings/billing/invoices` — invoice history table, Paid badges, PDF
  download per row, status filter. Clean.

No defects. Remaining unswept: populated `/extractions` list and
`/verify/:documentId` HITL screen (both need seeded extraction data).

## C15 — AI extraction HITL flow: list + verify, seeded & verified pristine

The two genuinely-unswept surfaces (populated `/extractions` list and
`/verify/:documentId` HITL screen) needed extraction data — the only seed
extraction docs belong to org `...0006` (Epsilon), not owner@acme (`...0001`),
so both rendered empty. Seeded 4 READY_FOR_REVIEW lease docs under owner's org +
Downtown Tower (local DB only, ids `b0b0...0001-0004`; reproduction in
gitignored `_seed_extractions.sql`).

Key finding while seeding: the stale `seed_manual_testing.sql` extraction_result
shape (`{field:{value,confidence,bounding_box}}`) does NOT match what the real
processor writes (`_build_extraction_payload`): `{profile, confidence_scores,
source_references[], _meta}`. Reshaped the seed to the production shape so both
consumers render authentically (the list reads top-level `confidence_scores`;
the verify page reads `profile` + `source_references`).

Verified pristine, desktop + mobile:
- `/extractions` populated — table with per-doc avg confidence color-coded
  (90% green, 82-88% amber) and a "(1 low)" flag when any field <70%. Review
  pills per row.
- `/verify` HITL — per-field cards with three-tier confidence badges (red <70%,
  amber 70-89%, green 90%+), "Looks right?" confirm pills, Verification Progress
  N/7, "1 need review" warning chip when a field is low-confidence, Undo/Redo,
  editable Cap Type dropdown, honest "values were pulled by AI and may be wrong"
  guardrail, and Approve & Commit correctly DISABLED until the source PDF loads.
- Missing-PDF state ("We couldn't load the PDF / Try again") is a seed artifact
  (no real storage object) and is handled gracefully while blocking approval —
  exactly the human-verification guardrail the product promises. NOT a defect.

No product defects. Mobile collapses the two-pane verify layout to stacked.

---

## C16 — Upload / ingestion flows (2026-06-20)

Swept all three document-ingest surfaces, desktop + mobile, owner role:
- `/ingestion` — Upload General Ledger
- `/rent-roll/upload` — Upload Rent Roll
- `/leases/upload` — Upload Lease PDFs

**Verified pristine.** Every page leads with a plain one-line purpose, a labelled
property selector where required, a "Before you upload" plain-language callout
(spreadsheet vs PDF explained for a non-technical reader), a clear drag-and-drop
zone with the accepted extensions + size cap inline, and a Supported-Format(s)
help card. GL upload adds an Upload/History segmented control; lease upload adds
inline term tooltips (base year, caps) and a required-field marker. Mobile stacks
cleanly under the bottom tab bar; no clipping or crushed text.

Two candidate nits investigated and rejected as restraint:
1. "Supported Format" (singular) on the lease page vs "Supported Formats" (plural)
   on rent-roll is NOT an inconsistency — leases accept only PDF (one format),
   rent-roll accepts Yardi/MRI/generic CSV-Excel (many). Each heading is accurate.
2. The bare-looking ghost "Cancel" button on rent-roll is already canon-compliant —
   the shared Button base uses `rounded-button` = `--radius-button: 9999px`, so the
   ghost variant is a full pill (transparent until hover). No pill violation.

No product defects.

---

## C17 — Tax Protest workspace (2026-06-20)

Swept `/tax-protest`, desktop + mobile, owner role. **Verified pristine.**

Desktop renders a clean status table (Property / County / State / Deadline /
Status / Actions). Mobile deliberately swaps to stacked per-property cards with
label:value pairs — a `useIsMobile` split with an in-code comment ("Configure
button never scrolls off-screen"). This is exactly the responsive pattern the
C12 dashboard card was fixed to match; no crushed text at 390px. Status uses an
urgency-coloured badge (Past / Today / Nd) when configured, an outline
"Not configured" pill otherwise. The 44px-min Configure control is a real pill
(ghost Button) and links to `/properties/:id/edit#tax-protest`, whose target
`<Card id="tax-protest" className="scroll-mt-24">` exists and scrolls into view
on arrival (covered by its own test). No dead anchor, no modal to audit.

Held with restraint: the page description "...generate data packages" is an
accurate product term for the CRE audience and an 8-word sentence; not AI-bloat,
left as-is.

Note: `/tools/hcad-tax-normalizer` renders with full marketing chrome (public SEO
calculator), so it belongs to the later marketing sweep, not the product app.

No product defects.

---

## C18 — Analysis cluster: Year-over-Year, Trends, Compare systems (2026-06-20)

Swept all three `/analysis/*` surfaces, desktop + mobile, owner role — and drove
two of them to **populated** states with real seed data (not just empty states).

**Empty/initial states — pristine.** Each page leads with a plain purpose line,
a property selector, and the controls it needs (YoY: year checkboxes 2-4; Trends:
category + Y-axis + trendline toggle + Export PNG; Compare: period dates + source
toggle + draft checkbox). All carry an honest source-data disclaimer
("These numbers come from your files and may have errors..." / "Anomaly labels
come from AI and may be wrong..."). The YoY Compare button is disabled with a
keyboard-reachable tooltip ("Pick at least 2 years to compare.") — good a11y.

**Populated YoY (Downtown Tower, 2023 vs 2024) — pristine.** Renders the
Expense-Pool comparison table with a Variance column, Export CSV + Print pills,
and a Variance Color Legend. The all-N/A 2023 case (a finalized snapshot with no
expense-pool figures) is caught by an amber callout with exact next steps:
"...Pick a later base year, or finalize a 2023 reconciliation first." Mobile makes
the wide table horizontally scrollable with a "Scroll sideways to see each year."
hint and a sticky Expense-Pool column.

**Populated Trends (Downtown Tower / Capital Reserves) — pristine.** Line chart
(Actual + Trend) with metric cards (Period Change +$571,000, Annual Average
$285,500), a "Detected Anomalies" callout ("New Category (2024)..."), and a chart
legend. Fully responsive on mobile.

Investigated and rejected with restraint: the empty states say "snapshots"
("No finalized snapshots available..."). This is NOT jargon leak — "snapshot" is
established, consistent product vocabulary across the core reconciliation
workspace (ReconciliationPage, DenominatorChangePanel, FinalizeButton), the lease
term timeline, and these analysis pages, always paired with "reconciliation" to
teach it. Changing only the analysis strings would create inconsistency; migrating
the whole term is risky churn on a deliberate word. Left as-is.

Screenshot-timing note (not a product bug): a first Trends capture showed a blank
grey panel — that was the `h-[400px]` loading Skeleton, because the chained
property->years->categories->trend queries had not settled. Re-shot after waiting
for `.animate-pulse` to clear; the chart renders correctly.

No product defects.

## C19 — Expense Pools hub + property-detail tabs (2026-06-20)

Swept the `/pools` hub and every property-detail tab (Overview, Reconciliations,
Pools, Units, Leases, Imports) for Downtown Tower, desktop + mobile, owner role.

**Hub + most tabs — pristine.** `/pools`: clean "Manage expense pool structures
across properties" hub, Properties Available stat, per-property cards, Copy Pools /
Copy Between Properties / Add Property pills. Property-detail Overview (stat cards,
BOMA area, metadata), Pools (type pills + unmapped-pool alert icon), Units (pill
toggle switches, 26 units), Imports (Recent Imports w/ Success badge) all clean.
Leases, Units, and Imports each collapse their table to stacked cards on mobile
via a local `useMobileCards()` hook — correct responsive pattern.

**REAL MOBILE DEFECT FIXED — reconciliations tab.** The Reconciliations tab was
the one table tab that did NOT collapse on mobile: `ReconciliationsTab.tsx` rendered
a raw TanStack `DataTable`, so on a 390px viewport the table overflowed and clipped
the Tenant Billable amount and Created date off the right edge. Its three sibling
tabs (Imports, Leases, Units) already had the mobile-card treatment. Fix: added the
same `useMobileCards()` hook + a `md:hidden` stacked-card path (tenant + status
badge, period, Tenant Billable money, created date) and gated the DataTable to
`hidden md:block`; matched the sibling responsive header (full-width button on
mobile). Mobile cards are clickable `<button>`s calling the same `handleRowClick`
as the desktop rows, with focus-visible rings — keyboard-accessible. Desktop table
byte-unchanged. Tests 53/53, tsc + eslint clean, verified both breakpoints.
Mirrors the C12 lesson: copy-scans miss responsive bugs — screenshot mobile + look.

## C20 — Portfolio Overview + Pipeline + Admin Feedback (2026-06-20)

Swept three secondary surfaces not previously covered on both breakpoints,
desktop + mobile, owner role.

**Portfolio Overview (`/portfolio`) — pristine.** "2024 reconciliation year"
sub-head, 4 stat cards (Leakage to Recover highlighted red, Recovery Rate "N/A"
with the honest helper "Add what you billed tenants to see this", Properties with
Leakage, Recoverable CAM), an NOI Impact panel (Total Recovery / NOI Lift / Asset
Value Lift) with a 2-12% cap-rate slider and a plain explainer ("CAM recovery adds
to NOI. Dividing by the cap rate gives an estimated increase in building market
value."), and a Property Breakdown table. Carries the standard source disclaimer.
The wide Property Breakdown table correctly collapses to stacked label-value cards
on mobile (leakage in red) — the responsive pattern done right, in contrast to the
C19 recon-tab bug.

**Portfolio Pipeline (`/portfolio/pipeline`) — pristine (empty state).** Plain
"Track reconciliation campaigns across all properties" sub-head, a year selector,
and an empty state ("No campaigns for 2026 / Dispute campaigns appear here once you
finalize a reconciliation. Run and finalize one to get started.") + "Go to
Reconciliations" pill. Acme has zero reconciliation_campaigns rows, so the
populated pipeline state is not reachable without seeding a finalized dispute
campaign — deferred (no defect indicated; empty-state copy is plain and correct).

**Admin Feedback (`/admin/feedback`) — pristine (empty state).** Stat cards
(Total/New/Bugs/Features), type + status filters, a Type/Message/Status/Page/Date
table with a clean "No feedback yet / Feedback from users shows up here." empty
state, Previous/Next pills. No seed feedback rows, so the populated table's mobile
behavior isn't screenshot-verifiable — but confirmed in source
(`pages/admin/Feedback.tsx:278`) that it renders a `data-testid="mobile-cards-view"`
stacked-card layout on mobile, so it will NOT overflow like the C19 recon tab did.

No product defects.

## C21 — Disputes workflow: populated list + open/resolved detail (2026-06-20)

Swept the full landlord Disputes surface with real data, desktop + mobile, owner
role. Acme org had zero `tenant_users`/`disputes` rows (seed disputes live under
Gamma/E2E orgs), so seeded one tenant_user + three disputes in varied statuses
against a real finalized 2024 snapshot via the gitignored
`docs/goal-pristine-2026/_seed_disputes.sql` (local-only) to drive the populated
flows per the "real workflows" mandate.

**Disputes list (`/disputes`) — pristine, both breakpoints.** Header "View and
manage tenant disputes across all properties", "All Statuses" filter, "3 total" +
"1 needs response" count chips. Three card rows — Billing Question (Open amber pill
+ "Needs response" warning pill), Incorrect Area (Under review grey pill), Missing
Credit (Resolved green pill) — each with humanized category title, clamped
description, "Created <date>", and a chevron. The list is card-based (not a table),
so mobile stacks cleanly with no overflow; the "Needs response" pill wraps to two
lines gracefully on 390px.

**Open dispute detail (`/disputes/:id`) — pristine, both breakpoints.** Header
(category title + "Filed <date>"), a "Generate Demand Letter" pill, then three
cards: Dispute Details (Open pill, Description, Created/Last Updated), Update Status
(New Status select + disabled Update Status pill until a status is chosen), and
Comments (empty state "No comments yet / Comments on this dispute show up here." +
Add-a-comment textarea, "Mark as internal (not visible to tenant)" checkbox, and a
disabled Add Comment pill). Cards stack cleanly on mobile; the internal-toggle label
wraps gracefully.

**Resolved dispute detail — pristine, both breakpoints.** Adds a Resolved green
pill, a Resolved date alongside Created/Last Updated, and a green-tinted Resolution
Summary callout (clear heading + summary text). Renders correctly on mobile (callout
wraps cleanly). The Update Status card stays available on a resolved dispute (with
its disabled button) so the landlord can reopen — acceptable, not a defect.

No product defects. The disputes feature was already well-built; this cycle was
verification + seeding to exercise the populated landlord flow on both breakpoints.
Note: the fullPage screenshot shows the fixed bottom mobile-nav overlapping content
mid-scroll — a `position:fixed` + fullPage capture artifact, NOT a real overlap.

## C22 — Upload GL page + Import History tab (2026-06-20)

Re-confirmed the GL upload page (`/ingestion`, nav "Documents → Upload GL"; the
upload form itself was C16) and swept its previously-unevaluated **History** tab,
desktop + mobile, owner role.

**Upload form — pristine.** Property selector, an 80-yo-friendly "Before you upload
this spreadsheet" helper ("A spreadsheet is a table file, usually ending in .csv,
.xls, or .xlsx" + where-to-find-it guidance), and a drag-and-drop zone with a clear
"First choose a property above. Then you can add your file here." gate.

**Import History tab (`?tab=history`) — pristine, both breakpoints.** Populated with
two real GL imports (yardi_gl_downtown_tower / suburban_office, Yardi Voyager, 285
rows, green Success pills) in a File Name / Date / Source / Rows / Status / Actions
table with a "Filter: All Imports" control and view + delete actions. On mobile the
table correctly collapses to stacked cards (truncated filename, Success pill,
Date/Source/Rows label-value pairs, a "View" pill + delete icon) — no overflow, the
C19 responsive pattern done right.

No product defects.

## C23 — Reconciliation workspace: money columns now sum (share + fee = total) (2026-06-20)

**Improvement (user-chosen).** The reconciliation grid showed three money columns
where the math didn't visibly add up: col1 "Tenant Billable" already carried the
all-in `total_recovery`, so "Tenant Billable", "Admin Fee", and "Final Amount"
read as three unrelated numbers. Reworked so the row reads as an honest sum:
- **Tenant Share** (col1) = `tenant_share_after_cap` — the pre-fee share.
- **Admin Fee** (col2) = `admin_fee`.
- **Final Amount** (col3, green) = `total_recovery` — the all-in total billed.
Now Tenant Share + Admin Fee = Final Amount on every row. The "Tenant Billable"
stat card and the Grand Total continue to sum `total_recovery` (all-in) and are
unchanged. Verified live both breakpoints on property `cccc…c001`/2024: the four
tenant rows sum exactly (e.g. Design Studio $8,064.52 + $1,209.68 = $9,274.20) and
the Grand Total holds at $34,722.13.

**Plumbing.** Exposed `tenant_share_after_cap` on the summary API end-to-end:
Python model + list endpoint (`backend/`), Cloudflare select + repository type
(`cloudflare-backend/`), generated TS type, row schema, the `useReconciliationData`
transform, the desktop columns, and the mobile `ReconciliationCard`. The renamed
column keeps editing wired to the real backend field via `meta.field:
'tenant_share_after_cap'`, resolved in `confirmEdit` (regression-tested).

**Tests/verify.** 99 impacted frontend tests pass (columns/grid/card/hook),
typecheck + ESLint clean on changed files, Cloudflare reconciliation 33/33.

**Pre-existing defect found + flagged (not in scope here).** Live E2E of the edit
path surfaced that inline cell editing is broken for ALL columns and always has
been: `useReconciliationData` ids tenant rows `summary-<uuid>`, `confirmEdit` sends
that prefixed id as `snapshotId`, and the backend's `uuidSchema.parse` rejects it —
no valid PATCH fires, user sees "Save failed. Data reverted." A naive prefix fix
would make edits *succeed* but desync the new share+fee=total invariant, because
`updateCell` does a blind `set` with no recompute. Flagged as a product/financial
decision (read-only vs. real recompute) via spawn_task `task_8216f913` — deliberately
NOT auto-expanded into this cycle. The C23 display change is correct and regression-
free regardless (editing was already broken before and after it).

## C24 — Reconciliation workspace deep states + Documents/Admin nav (2026-06-20)

**Documents + Admin nav groups — already covered, no new work.** Both are
single-route groups: "Documents" expands to Upload GL / Upload Leases / Extractions
/ Upload Rent Roll (all swept C15/C16/C22; bare `/documents` redirects to
`/ingestion`), and "Admin" has exactly one child, Feedback (swept C20; bare `/admin`
→ `/admin/feedback`). The earlier "still unswept: Documents, Admin" note was stale.

**Reconciliation workspace interior — swept, C23 re-validated in context.** Fresh
screenshots of the populated workspace (Downtown Tower 2024) desktop + mobile: the
C23 money columns read as an honest sum on every row (Tenant Share + Admin Fee =
Final Amount), the stepper (Upload GL → Reconcile → Review → Finalize), the amber
"Missing GL Account Mappings" advisory, the stat cards, the right-rail Tenant Filter
(per-tenant final amounts tie to the $34,722.13 Grand Total), and the mobile
tenant-summary cards are all pristine. Header CTAs all pills.

**Calculation Breakdown drawer — UI pristine, but surfaced a seed-data defect.**
Drove the per-row Eye/trace button. The drawer is well-built: a numbered step trace
(Fetch Operating Expenses → Gross-Up → Tenant Share → Base Year Deduction → Apply
Expense Cap → Admin Fee → Total Recovery) with formulas, results, a "Support Context"
footer ("include this trace when escalating a disputed CAM number"), Print Summary +
Close. BUT it renders `snapshot.calculation_trace` verbatim, and the seed's trace is
internally inconsistent for tenants with a base year: Step 4 "Base Year Deduction"
computes an excess-over-base value that NO later step consumes — Step 5 (cap) and
Step 6 (fee) build on the pre-deduction Step 3 value instead. Design Studio: Step 4
= 8064.52−7800 = 264.52, discarded; after-cap stays 8064.52. TechCorp and Insurance
Brokers similarly broken (Insurance Brokers' Step 5 = 9677.42 matches neither prior
number). FinanceGroup + the 0.04-share tenant say "No base year" and ARE consistent.
The stored finals are each self-consistent (total = after_cap × 1.15), so the trace
narration is wrong relative to the stored finals — UNLESS base year is meant to apply,
in which case the stored 8064.52/9274.20 is an ~30× overbill vs ~264.52. That's a
lease-semantics/financial call, so flagged via spawn_task `task_8ef1b8df` rather than
guessing; NOT auto-fixed. Seed/demo data only — the product trace UI is correct.

## C25 — Reconciliation header action modals + menus (2026-06-20)

Swept every reconciliation-workspace header action ("every modal, every button").
All pristine, no product defects:
- **Finalize & deliver modal** — clear destructive-action confirm: "Finalizing locks
  all reconciliation data for 2024… This action cannot be undone," a Summary (4
  tenants, Total billable $34,722.13), pill Cancel + Finalize. Verified desktop AND
  mobile (mobile stacks full-width pills, primary on top — correct responsive form).
- **More menu** — Variance report (active); Demand Letter and Tax Protest disabled
  with inline "Finalize the reconciliation first" subtext (disabled-explains-itself
  canon honored).
- **Columns toggle** — Tenant / Tenant Share / Admin Fee / Final Amount + Reset to
  Defaults. Confirms the C23 column rename propagated coherently (menu reads "Tenant
  Share", not the old "Tenant Billable").
- **Export drawer** — 6 tabs (PDF/Batch/ERP/History/Board/Variance). PDF tab verified:
  a "Detail Level Advisory" (Suggestion) that flags "28 line items… ideal 15–25…
  consider grouping to reduce dispute risk," Include charts / Include notes, Preview
  PDF pill. The brief top skeleton is just async load (resolves cleanly, zero console
  errors), not a stuck state.

**Follow-up (noted, not defects):** the Export drawer's other 5 tabs (Batch/ERP/
History/Board/Variance) are a substantial multi-tab feature deserving their own
dedicated sweep cycle.

## C26 — Export drawer tabs sweep + Variance "$0.00" anomaly fix (2026-06-20)

Swept the Export drawer's remaining 5 tabs (Batch/ERP/History/Board/Variance). Batch,
ERP (Board verified), and History ("No exports yet" empty state) all pristine. The
**Variance tab had a real product defect**: it showed a contradictory headline —
"Total Variance **$0.00**" sitting directly above "Current Year Total $836,300.00",
with the per-pool table listing $836,300 of pool variances. A reconciliation tool that
reports $0 variance over $836K of new spend is exactly the kind of number a big client
loses trust over.

**Root cause.** Property Downtown Tower's 2023 has a finalized snapshot but NO GL
entries, so the year-over-year base total = $0. Two divergent backends handled it two
different wrong ways:
- **Local Python** (`historical_analysis.py`) only computed the total variance when
  `base_total != 0`, else left it `None` → rendered "$0.00".
- **Prod Cloudflare** (`service.ts`) computes the correct amount ($836,300) but returns
  a `null` percent, which the frontend coerced `null → 0` → a misleading "+0.00%".

**Fix (policy-neutral "New" label).** A $0→$X pool/total has an *undefined* percent
(division by zero), not a 0% one. Introduced `isNew` (per-pool) + `isTotalNew` (total):
when prior = $0 and current > $0, the UI shows "**New**" (neutral Sparkles badge, no
red/green, no highlight) instead of a percentage, keeping the correct dollar amount.
This extends the codebase's existing "FIX AS-5 new category" intent and is not a
contestable financial-policy choice. Aligned Python's total path to the already-correct
Cloudflare amount behavior (`total_variance_amount = latest − base` even when base = $0;
percent stays `None`).

Files: `types/index.ts` (VarianceType += 'new', isNew/isTotalNew fields),
`useVarianceComparison.ts` (derive flags; isNew also covers absent prior-year pools),
`VarianceReport.tsx` + `VarianceTable.tsx` (render "New", suppress color/highlight),
`historical_analysis.py` (total base=$0 branch). Tests: +1 hook, +5 table, +1 report,
+1 Python — all green (56 FE + 20 PY in the touched suites). Typecheck + ESLint + ruff
clean.

**Verified live** (real :8001 backend, both breakpoints, 0 console errors): Total
Variance now reads "**$836,300.00 New**"; pools Capital Reserves $571,000 / Real Estate
Taxes $135,000 / Insurance $66,400 / Operating Expenses $63,900 each show "New" (sum
reconciles to $836,300).

**Follow-ups (spawn_tasks, not regressions):** `task_56dcb480` — the sibling
`features/analysis` Year-over-Year page renders the same backend response and still
shows "+0.00%"/"+100.00%" for a $0-base year (same fix needed there). `task_a800fa2a`
— the per-pool $0-base path still emits `variance_percent = 100` ("+100.00%"), which
the client-facing PDF/XLSX exporters could print; align exporter labeling with the
in-app "New" across both backends (touches client documents — flagged for a deliberate
decision).

## C27 — Help / AI-transparency / Compare sweep + duplicate-email fix (2026-06-20)

Swept three unswept landlord surfaces desktop (1440) + mobile (390): **Help** (`/help`),
**AI Transparency Statement** (`/compliance/ai-transparency`), **Compare systems**
(`/compare`, empty state). Help and Compare are pristine — Help is well-built (plain
intro callout, demo video, accessible search with aria-label, glossary + categorized
HelpTopicCards, "Prefer to talk it through?" Book-a-call CTA, single-column on mobile);
Compare's empty form is clean (plain "Check another system's charges… tenant by tenant",
segmented Use-saved/Type-them-in pill toggle, pill Run comparison, honest data-caveat
footer). No defects in either — restraint applied.

**Real defect on the compliance page (fixed).** The Questions section rendered the SAME
email twice in one sentence — "Contact angel.campa@capveri.com for security questions or
angel.campa@capveri.com for product support" — because every contact in the generated
`public-knowledge` source (`contacts.byId.security`/`.support`) currently resolves to the
one real inbox `angel.campa@capveri.com`. On an enterprise-facing AI/compliance statement
that reads like a templating bug. **Fix:** collapse to a single mention when the two
addresses are equal ("Contact <email> with security or product questions."), keeping the
two-email form as a fallback if they ever diverge. Honest — no invented address (a second
address would be a lie per the copy guardrails). File: `pages/legal/AiTransparency.tsx`.
Added `AiTransparency.test.tsx` (3 tests covering BOTH branches via a getter-based
public-knowledge mock + per-test module reset). Prettier + ESLint clean; review agent
returned no blockers (applied its 2 sound test-hygiene nits: resetModules in beforeEach,
tighter assertion). Live-verified: Questions line now reads one clean address.

## C28 — SB 1103 Compliance tab: mobile-card collapse (2026-06-20)

Swept the **California SB 1103 Compliance tab** (`SB1103RequestsTab`, renders only for CA
properties) desktop (1440) + mobile (390). Desktop is clean. **Real mobile defect (fixed,
C12/C19 class):** the tab rendered a raw 5-column `<DataTable>` (Requestor / Request Date /
Response Deadline / Status / Actions) with no mobile fallback. On 390px the table overflowed
and clipped the Status and Actions columns, so a phone user could not see a request's status
or reach its export menu. Every sibling property tab (Reconciliations/Units/Leases/Pools)
already collapses to cards on mobile — this one was the holdout.

**Fix:** added the same `useMobileCards()` matchMedia hook and a `md:hidden` stack of cards
(requestor name + email with `truncate`/`min-w-0`, request date, response deadline + its
`SB1103DeadlineBadge`, status badge, and the Actions menu), wrapping the existing
`<DataTable>` in `hidden md:block` only when there are rows — so the empty-state message and
loading skeleton still render on mobile, and desktop is byte-unchanged. The status badge and
Actions dropdown were extracted into shared `renderStatusBadge`/`renderActions` helpers so the
table cells and the cards stay in sync (behavior-preserving — the existing actions-menu test
still passes). File: `components/properties/SB1103RequestsTab.tsx`.

**Verified** both breakpoints in the browser with two seeded requests (one pending with a
"25d remaining" deadline badge, one delivered) — cards render with no overflow, long requestor
name + email truncate cleanly, status badge stays intact, Actions reachable; desktop table
unchanged. Typecheck + ESLint clean, 218 property tests pass (+2 new mobile-path tests that
stub `matchMedia`). Review agent returned no blockers; its one actionable finding (the new
mobile branch had zero coverage because jsdom leaves `matchMedia` undefined) was closed by the
two added tests. Shipped 64e0d1b3, pushed; frontend-only, no migration.
