# Surface Map — the canonical checklist

> Every screen, page, modal, and flow in the system. One row per surface. The orchestrator
> drives cycles off this list. Populated from inventory sub-agents (C0) — see PLAN.md §4.
>
> **Status values:** TODO · SCOUTED · FIXING · DONE (all rubric dims green + render-proof + logged)
> **Pass column:** which review pass last cleared it (need ≥2 clean passes for overall DONE).

## How to read
Each row: `ID | Surface | Route/Path | Type | Status | Last cycle | Notes`
- Types: page · tab · modal · drawer · flow · component · state(empty/loading/error)

---

## RUNBOOK (local E2E) — filled in C0

**Startup order (5 PowerShell terminals):**
1. **Supabase** (DB, must be first): `cd <repo-root>; supabase start` → API 54321, PG 54322, Studio 54323, Inbucket(email) 54324. Applies migrations + loads `supabase/seed.sql`. Reset: `supabase db reset`.
2. **Cloudflare Worker API** (the LIVE CapVeri backend for E2E), port **8797**:
   ```
   cd <repo-root>\cloudflare-backend
   npx wrangler dev --port 8797 --local --var DB_ACCESS_MODE:direct-postgres --var DATABASE_URL:postgresql://postgres:postgres@127.0.0.1:54322/postgres --var SUPABASE_URL:http://127.0.0.1:54321 --var AUTH_JWKS_URL:http://127.0.0.1:54321/auth/v1/.well-known/jwks.json --var OPENROUTER_API_KEY:e2e-openrouter-disabled
   ```
   Health: `curl.exe http://127.0.0.1:8797/health`. MUST pass `DB_ACCESS_MODE:direct-postgres` or it uses empty local D1.
3. **Frontend app**: `cd <repo-root>\frontend; npm run dev` → **http://localhost:5173**. For hands-on browser testing against the Worker, set `frontend/.env.local` `VITE_API_URL=http://127.0.0.1:8797` (default is :8001 Python).
4. **Marketing**: `cd <repo-root>\marketing; npm run dev -- --hostname 127.0.0.1 --port 3007` → **http://127.0.0.1:3007**. (Port 3000 is FOREIGN.)
5. Tests: `cd <repo-root>\frontend; npx playwright test` (auto-starts servers, reuses running ones).

**Backends:** Live E2E = CF Worker :8797. Python FastAPI :8001 (verify `/openapi.json` title=="CapVeri API"). **:8000 + :3000 are FOREIGN CAMAudit-v2 — never use.**

**Creds (manual testing, pw `TestPass123!`):** landlord `owner@acme.example.com`, admin `admin@acme.example.com`, member `member@acme.example.com`, viewer `viewer@acme.example.com`; tenants `sarah.tenant@retailstore.com` / `mike.tenant@coffeeshop.com` / `lisa.tenant@salon.com` / `david.tenant@gym.com`. **E2E accounts:** `e2e-test@capveri.com` / `TestPassword123!` (landlord), `admin@capveri.com` / `AdminPassword123!`, `e2e-tenant@capveri.com` / `TestPassword123!`.

**Sample upload files:** `frontend/e2e/fixtures/` — `yardi-gl-sample.csv` (150 rows), `gl-2023.csv`/`gl-2024.csv` (YoY), `mri-gl-sample.csv`, `yardi-rentroll-eldridge.csv`, `invalid-data.csv` (error path), `pdfs/suite-*-lease.pdf` (AI extraction). Inbucket email trap: http://localhost:54324.

**Render tooling for this goal:** Claude Preview (preview_start on the running dev URL). Footgun: preview_screenshot has timed out (30s) historically → fall back to preview_snapshot + preview_eval (DOM text) + preview_inspect (CSS).

---

## M — Marketing site (Next.js App Router, ~600+ URLs)

> **Audit strategy:** Hand-built unique pages = audit each. Programmatic template families
> (data/JSON or MDX driven) = audit the TEMPLATE component + 3 representative slugs (best/avg/edge),
> since one template renders all members. Tools = audit each (30, all interactive, highest risk).

### M-static — hand-built unique pages (audit each)
| ID | Surface | Route | Type | Status | Cycle | Notes |
|----|---------|-------|------|--------|-------|-------|
| M01 | Homepage | `/` | page+sections | TODO | | LandingPageClient: Hero, FeaturesGrid, ValueProp, SocialProof, HowItWorks, CTA, PricingTeaser, ProductDemo, FreeAuditClarity, FAQ |
| M02 | Pricing | `/pricing` | page | TODO | | PricingContent + LaunchOfferProgress |
| M03 | Product | `/product` | page | TODO | | |
| M04 | Product features index | `/product/features` | page | TODO | | |
| M05 | Product tour | `/product-tour` | page | TODO | | demo mocks |
| M06 | ROI | `/roi` | page | TODO | | value calc |
| M07 | Sample report | `/sample-report` | page+gate | TODO | | lead-gated |
| M08 | About | `/about` | page | TODO | | |
| M09 | About founder | `/about/angel-campa` | page | TODO | | |
| M10 | Contact | `/contact` | page+form | TODO | | ContactForm + Turnstile + honeypot |
| M11 | Checkout | `/checkout` | flow | TODO | | + `/checkout/success` |
| M12 | Videos | `/videos` | page | TODO | | videos.json |
| M13 | Docs hub | `/docs` | page | TODO | | |
| M14 | Help center | `/help` | page (filterable) | TODO | | HelpCenterClient |
| M15 | Sources | `/sources` | page | TODO | | citations transparency |
| M16 | Case studies | `/case-studies` | page (tabs) | TODO | | CaseStudyTabs |
| M17 | Solutions hub | `/solutions` | page | TODO | | |
| M18 | Alternatives hub | `/alternatives` | page | TODO | | |
| M19 | Vs hub | `/vs` | page | TODO | | |
| M20 | Switch hub | `/switch` | page | TODO | | |
| M21 | For (persona) hub | `/for` | page | TODO | | |
| M22 | Integrations hub | `/integrations` | page | TODO | | |
| M23 | Glossary index | `/glossary` | page | TODO | | 55 terms |
| M24 | Resources hub | `/resources` | page | TODO | | + sub-hub indexes (boma/calculations/calendar/cam-dispute/cam-guides/expenses/lease-clauses/lease-types/markets/property-types/roles/software/states/templates/workflows/solutions/tools-calculators) |
| M25 | Blog index | `/blog` | page | TODO | | + `/blog/category/[category]` |
| M26 | SEO category landings | `/cam-audit`,`/cam-audit-software`,`/cam-charges`,`/cam-reconciliation-guide`,`/cam-reconciliation-software`,`/commercial-lease-audit-software`,`/lease-abstraction`,`/mri-cam-reconciliation`,`/yardi-cam-reconciliation`,`/best/cam-reconciliation-software` | pages (10) | TODO | | hand-built SEO landings |
| M27 | Legal | `/privacy`,`/terms`,`/cookies` | pages (3) | TODO | | |
| M28 | Unsubscribe | `/unsubscribe` | page | TODO | | |
| M29 | 404 | `not-found.tsx` | state | TODO | | |
| M30 | 500 / global error | `global-error.tsx` | state | TODO | | |

### M-tools — 30 interactive calculators (audit EACH; highest functional risk)
| ID | Tools | Status | Cycle | Notes |
|----|-------|--------|-------|-------|
| MT-index | `/tools` index page | TODO | | card grid, 30 cards |
| MT-thankyou | `/tools/[slug]/thank-you` | TODO | | post-lead page |
| MT01-30 | admin-fee-calculator, audit-defense-packet-builder, audit-risk-quiz, audit-risk-scorecard, base-year-escalation, boma-2024-calculator, boma-remeasurement-impact, cam-billing-error-estimator, cam-cap-calculator, cam-estimate-forecaster, cam-gross-up-calculator, cam-overcharge-calculator, cam-pre-send-packet-checklist-download, cam-reconciliation-template, cam-recovery-ratio-worksheet, cumulative-cap-bank-calculator, fixed-cam-vs-traditional, hcad-tax-normalizer, lease-abstract-matrix, lease-clause-extraction-matrix, mri-recovery-billing-qa-checklist, multi-state-cam-disclosure-matrix, noi-impact-calculator, pro-rata-calculator, property-tax-appeal-recovery-calculator, reconciliation-statement-generator, recovery-gap-analyzer, sb-1103-checker, tenant-dispute-response-letter-template, yardi-export-qa-checklist | TODO | | each: inputs+compute+gate+stale-result+a11y; verify math vs honesty |

### M-templates — programmatic families (audit template component + 3 sample slugs each)
| ID | Template | Route | Driver | #members | Status | Cycle | Notes |
|----|----------|-------|--------|----------|--------|-------|-------|
| MP01 | Blog post | `/blog/[slug]` | content/blog MDX | 125 | TODO | | BlogPostLayout |
| MP02 | Resource (generic) | `/resources/[slug]` | content/resources MDX | 151 | TODO | | ContentPageLayout |
| MP03 | Resource static guides | `/resources/<many>` | hand MDX/tsx | ~60 | TODO | | sample several |
| MP04 | Glossary term | `/glossary/[term]` | glossary-terms.json | 55 | TODO | | |
| MP05 | Vs comparison | `/vs/[slug]` | comparisons.json | 32 | TODO | | |
| MP06 | Alternatives | `/alternatives/[slug]` | alternatives.json | 7 | TODO | | |
| MP07 | Switch | `/switch/[slug]` | switch.json | 6 | TODO | | |
| MP08 | For persona | `/for/[persona]` | personas.json | 6 | TODO | | |
| MP09 | Integrations | `/integrations/[slug]` | integrations.json | 4 | TODO | | |
| MP10 | Solutions | `/solutions/[slug]` | solutions.json | 5 | TODO | | |
| MP11 | Product feature | `/product/features/[slug]` | — | ? | TODO | | |
| MP12 | States compliance | `/resources/states/[state]/cam-compliance` | states.json | 50 | TODO | | |
| MP13 | Metro guide | `/resources/markets/[metro]/cam-guide` | metros.json | 43 | TODO | | |
| MP14 | Property type guide | `/resources/property-types/[type]/cam-guide` | property-types.json | 18 | TODO | | |
| MP15 | Software setup | `/resources/software/[product]/cam-setup` | software.json | 22 | TODO | | |
| MP16 | Lease clause | `/resources/lease-clauses/[clause]` | lease-clauses.json | 20 | TODO | | |
| MP17 | Lease type guide | `/resources/lease-types/[type]/cam-guide` | lease-types.json | 8 | TODO | | |
| MP18 | Role guide | `/resources/roles/[role]/cam-guide` | roles.json | 6 | TODO | | |
| MP19 | Expenses | `/resources/expenses/[category]` | expenses.json | 15 | TODO | | |
| MP20 | BOMA topic | `/resources/boma/[topic]` | boma-topics.json | 12 | TODO | | |
| MP21 | Calculations | `/resources/calculations/[scenario]` | cam-calculations.json | 8 | TODO | | |
| MP22 | Calendar | `/resources/calendar/[slug]` | calendar.json | 5 | TODO | | |
| MP23 | CAM dispute | `/resources/cam-dispute/[type]` | cam-dispute.json | 6 | TODO | | |
| MP24 | Templates | `/resources/templates/[slug]` | templates.json | 10 | TODO | | |
| MP25 | Workflows | `/resources/workflows/[workflow]` | workflows.json | 13 | TODO | | |

### M-shared — shared marketing components (audit once, applies everywhere)
| ID | Component | Status | Cycle | Notes |
|----|-----------|--------|-------|-------|
| MS01 | MarketingNav (+ mobile menu, mega-menu) | TODO | | task_9fca0ab7 reserved mega-menu, defer |
| MS02 | MarketingFooter | TODO | | |
| MS03 | LeadCaptureForm | TODO | | |
| MS04 | LeadMagnetExitIntentPopup | TODO | | site-wide |
| MS05 | CalculatorUnlockGate | TODO | | |
| MS06 | AiSdrSalesWidget | TODO | | site-wide chat |
| MS07 | MDX blocks (Alert, CTABox, FAQSection, InfoCardGrid, StatGrid, Steps, Table, TwoColumnCard) | TODO | | |
| MS08 | Content layouts (BlogPostLayout, ContentPageLayout, ToolPageLayout, Pillar/Related/Sources) | TODO | | |
| MS09 | Landing sections (Hero/Features/ValueProp/SocialProof/HowItWorks/CTA/PricingTeaser/ProductDemo/FAQ) | TODO | | M01 sub-parts |
| MS10 | UI primitives (ui/*) | TODO | | shadcn: button,card,input,select,slider,switch,tabs,etc. |

### (legacy table header retained below — populated above)
| ID | Surface | Route/Path | Type | Status | Cycle | Notes |
|----|---------|-----------|------|--------|-------|-------|

## A — App, Landlord/PM side (React 19 + Vite, router in src/App.tsx)

> NOTE: the app ALSO ships its own marketing/resource/tools pages (separate from the Next.js site).
> Those app-side public pages are listed under A-public.

### A-auth — authentication (audit each)
| ID | Surface | Route | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| A01 | Login | `/auth/login` | PARTIAL | C17,C32 | LoginPage. C17: SocialLogin button "Continue with Google"/"Connecting…" + aria-hidden icons (shared component). C32: page-level decorative-icon a11y — session-dismiss X, error AlertCircle, password Eye/EyeOff all aria-hidden. OPEN copy/taste: "Email address" vs Register's "Work Email" mismatch; autofocus-on-retry |
| A02 | Register | `/auth/register` | PARTIAL | C17,C32 | PasswordStrength, SocialLogin. C17: same shared SocialLogin fix. C32: error AlertCircle + password Eye/EyeOff aria-hidden (password-rule Check/Circle already correct). OPEN copy: "Work Email"→"Email address"; password placeholder wording |
| A03 | Forgot password | `/auth/forgot-password` | PARTIAL | C32,C40 | reused for tenant. C32: success CheckCircle2 + "Try a different email" Mail + both "Back to login" ArrowLeft aria-hidden. C40: submit loading copy "Sending…"→"Sending reset instructions…" (matches sibling action-specific loading pattern + echoes button label). OPEN UX: focus email input after handleRetry (focus lost on retry) |
| A04 | Reset password | `/auth/reset-password` | DONE | C17,C32,C40 | C17: P0 showcase rendered in right form column (garbled white text, no left panel) → `showcase=` prop = left gradient panel (LoginPage pattern); success branch correctly omits showcase; canonical form-error a11y on both inputs; "Updating…". Live-verified split-screen via Preview DOM eval. C32: success CheckCircle2 aria-hidden. C40: closed the three open P2s — form space-y-4→space-y-5; added password placeholders ("Create a strong password"/"Confirm your password"); logo now in AuthCard `header=`/AuthCardHeader (was bare body sibling). Live-verified header+placeholders+spacing via Preview DOM eval. REJECTED scout's "Continue to login"→"Sign in" (whitelisted verb + "...to login" noun convention). Surface CLEAN |
| A05 | Auth callback | `/auth/callback` | DONE | C41 | OAuth/magic-link. C41: was the only auth page hand-rolling its layout/card → aligned both states to AuthLayout/AuthCard (mirrors ForgotPassword success sibling), destructive heading preserved; +role="alert" error announce; Spinner `label` carries real status + visual echo aria-hidden (no dup announce); buttons → sentence case "Return to login"/"Try again". 24/24 tests; live-verified `?error=access_denied` via Preview. Surface CLEAN |
| A06 | Team signup (invite) | `/team/signup` | DONE | C42 | invite acceptance. C42: was the one landlord-side signup off-canon (hand-rolled generic Card). Restructured all 4 states to AuthLayout/AuthCard mirroring RegisterPage (valid form: AuthCardHeader+AuthLogo+FeatureShowcase, space-y-5, Button size lg; loading: bare centered spinner; error: destructive h1 + role="alert" + pill "Go to login"). a11y: Building2 aria-hidden; inputs+checkbox disabled while pending; terms checkbox named via aria-labelledby+Label id (Radix button had NO reliable name); terms link → new-tab `<a>`. Copy → sentence case. DEFERRED: per-field aria-invalid (single global formError, already role="alert"). Reviewed (sonnet) — loading-in-card + terms-tab fixed. 14/14 tests; live-verified no-token error state via Preview. Surface CLEAN |

### A-core — landlord app screens (in Sidebar+Header shell; audit each)
| ID | Surface | Route | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| A10 | Dashboard | `/dashboard` | PARTIAL | C5/C27/C35/C44 | WelcomeCard, TourOverlay, GettingStartedChecklist, QuickActions, ReconStatusCard, TaxProtestDeadlineCard, TrialBillingBanner. C5: blank-on-pause fixed (offline notice). C27: a11y-consistency pass — decorative icons across WelcomeCard/QuickActions/ReconStatusCard/TaxProtest/GettingStarted now `aria-hidden` (matches AlertsCard convention); draft-exposure banner div-role=button Space key now `preventDefault`s before navigate (was scrolling the page). C35: first holistic visual/UX pass — GettingStartedChecklist + TaxProtestDeadlineCard CardTitles → `as="h2"` (were `<h3>` under page `<h1>`, matching QuickActions/ReconStatus sibling canon); draft-recovery banner now uses shared `formatMoneyWhole` (was raw Intl cents). C44: coherence — ReconStatusCard local `formatCurrency` → shared `formatMoney`; draft-recovery banner div-role=button → native `<button>` (inner `<p>`→`<span class="block">` for button content-model validity). Card-interior states/charts deep audit still pending. Open: #2 parseFloat money chain, #6 GettingStarted status-icon sr-only labels |
| A11 | Portfolio overview | `/portfolio` | PARTIAL | C5/C36 | KPI cards + per-property table. C5: empty-on-pause fixed. C36: EmptyState titleAs="h2" heading ladder. Open: NOI/cap-rate copy |
| A12 | Portfolio pipeline | `/portfolio/pipeline` | PARTIAL | C5/C36 | campaign progress. C5: empty-on-pause fixed. C36: EmptyState titleAs="h2" + 7 decorative icons aria-hidden. Full audit pending |
| A13 | Property list | `/properties` | PARTIAL | C7/C37 | TanStack table, search. C7: empty-on-pause fixed (offline ErrorState + Try again). C37: ErrorState/EmptyState titleAs="h2" heading ladder + 7 decorative icons aria-hidden (incl. shared DataTable sort/Columns icons). Full audit pending |
| A14 | Property new | `/properties/new` | PARTIAL | C21 | PropertyFormPage create. C21: single-source-of-truth zod schema (was a dead divergent file tests imported but the form ignored), double-submit guard, Cancel→`/properties` (was navigate(-1) dead-end), 3 sqft FormDescriptions + plain-English RSF date helper. Full interior audit (all field states, RentRollUpload preview path) still pending |
| A15 | Property detail | `/properties/:id` | PARTIAL | C6/C9 | 7 tabs (see A15a-g). C6: page-level not-found-on-pause fixed. C9: all data tabs' empty-on-pause fixed. Overview tab + full audit pending |
| A15a | ↳ Overview tab | `#overview` | PARTIAL | C34 | attributes, BOMA config. C34: BOMA/Property Details/Metadata section-card titles `as="h2"` (were `<h3>` under page `<h1>`, skipping h2) to match sibling detail pages. Full interior audit pending |
| A15b | ↳ Reconciliations tab | `#reconciliations` | PARTIAL | C9/C39 | empty-on-pause fixed (offline ErrorState + Try again; firstRunProbe excluded from gate). C39: Finalized/Draft status-badge icons aria-hidden |
| A15c | ↳ Pools tab | `#pools` | PARTIAL | C9/C23/C39 | ExpensePoolsTab empty-on-pause fixed (offline ErrorState; count-enrichment queries excluded from gate). C23: its ExpensePoolFormModal hardened (see AM02). C39: 5 decorative icons aria-hidden (mappings/splits count buttons, row-actions, Add-Pool). Tab interior audit still pending |
| A15d | ↳ Units tab | `#units` | PARTIAL | C9/C23/C39 | empty-on-pause fixed (offline ErrorState + Try again). C23: its UnitFormModal hardened (see AM01). C39: row-actions + Add-Unit icons aria-hidden. Tab interior audit still pending |
| A15e | ↳ Leases tab | `#leases` | PARTIAL | C9/C39 | empty-on-pause fixed (offline ErrorState + Try again). C39: row-actions + Add-Lease icons aria-hidden. Heading-ladder finding REJECTED — persistent "Property setup" h2 above tabs makes the h3 ladder valid + all 6 tabs share the h3 (no single-sibling bump) |
| A15f | ↳ Imports tab | `#imports` | PARTIAL | C9 | empty-on-pause fixed (offline ErrorState + Try again). C39: verified clean (its one icon already aria-hidden) |
| A15g | ↳ Compliance tab (CA only) | `#compliance` | PARTIAL | C9/C39 | SB1103RequestsTab empty-on-pause fixed (early-return offline ErrorState). C39: non-CA Alert + Log-New-Request icons aria-hidden |
| A16 | Property edit | `/properties/:id/edit` | PARTIAL | C21 | PropertyFormPage edit mode (same component as A14). C21: boma Select `key={field.value}` so it shows the saved BOMA version after async reset; Cancel→`/properties/:id` detail (was navigate(-1) dead-end); shared schema/guard fixes. Decimal↔percent target_occupancy round-trip verified. Full interior audit pending |
| A17 | Lease new | `/properties/:id/leases/new` | PARTIAL | C22 | LeaseFormPage create. C22: double-submit guard (onSubmit early-return on the 3 mutations' isPending), Cancel→`/properties/:id` (was navigate(-1) dead-end), start/end date FormDescriptions. Schema NOT split-brain (component + test share LeaseFormSchema.ts ✓); money already string (F-010). Full interior audit (RecoveryProfileEditor, LeaseDocumentUpload) pending |
| A18 | Lease detail | `/properties/:id/leases/:lid` | PARTIAL | C10,C34 | C6: not-found-on-pause fixed. C10: CapBankLedger (cap history) + TermVersionTimeline (lease versions) offline-on-pause fixed (offline ErrorState + Try again→refetch). C34: CompactCopyId decorative `<Copy>` glyph now `aria-hidden` (button self-names via aria-label). Info cards already `as="h2"` (verified clean). Full audit pending |
| A19 | Lease edit | `/properties/:id/leases/:lid/edit` | PARTIAL | C22 | LeaseFormPage edit mode (same component as A17). C22: Cancel→`/properties/:id/leases/:lid` lease detail (was navigate(-1)); double-submit guard + date helpers shared. Verified the 3 recovery-profile/unit Selects do NOT need `key={field.value}` — they render custom `<span>` triggers off `useWatch ?? initialValues`, immune to the Radix on-mount caching bug (only `<SelectValue>`-based Selects like status/cap_type need the key). Full interior audit pending |
| A20 | Reconciliation workbench | `/properties/:id/reconciliations` | PARTIAL | C10,C31,C43 | BIG grid; stepper, grid, calc, finalize, export, demand letter, variance, denom, NOI, tenant summary, trace drawer, GL analysis, kickoff modal, missing-mappings; mobile fallback. C8: "Property not found"-on-pause fixed (isPaused/refetch threaded through useReconciliationData → offline error + Try again). C10: GLAnalysisPanel (latest GL analysis) + ReconciliationKickoffModal (AM06) offline-on-pause fixed. C31: a11y sweep — final_amount bare dash → aria-hidden+sr-only (F-291), StatCard icons + toolbar Send/More glyphs aria-hidden. C43: coherence pass across the panels — TenantSummary money → shared `formatMoney` (drop local Math.abs+manual-sign formatter; negatives render once natively, no double-sign), 24 decorative lucide icons aria-hidden across TenantSummary/NOIImpactPanel/DemandLetterPanel/ExportPanel/VarianceReport/ReconciliationPage; 2 heading "skips" REJECTED (SheetTitle is `<h2>`, so h3-in-Sheet is valid). OPEN: ReconciliationGrid focusable-row role/aria-label (deferred, semantic-risk); workbench INTERIOR (grid/stepper/calc/finalize visual) still TODO |
| A21 | Reconciliations list (global) | `/reconciliations` | PARTIAL | C5,C38 | filters, kickoff modal, VideoCard. C5: 2-query empty-on-pause fixed (offline notice + header action gated). C38: interior a11y — 3 empty-state headings `<h3>`→`<h2>` (under page h1), 9 decorative icons aria-hidden; sibling ReconciliationCard/Header money formatters delegate to shared formatMoney (drop parseFloat precision loss). INTERIOR visual/UX polish still TODO |
| A22 | Expense pools | `/pools` | PARTIAL | C7/C45 | + PoolCopyDialog. C7: empty-on-pause fixed (bespoke offline card + Try again; ErrorState migration = tech debt). C45: 4 decorative icons aria-hidden (2× Copy in Copy-Between-Properties btn, Layers3 card-link, Plus Add-Property); heading ladder already clean (explicit h2 @172). ErrorState migration still tech debt |
| A23 | Year-over-year | `/analysis/year-over-year` | PARTIAL | C8/C45 | variance table, CSV export. C8: "No properties yet."-on-pause fixed (offline notice + Try again in selector & content). C45: 7 decorative icons aria-hidden (BarChart3/Loader2/AlertTriangle/Download/FileText/TrendingUp/TrendingDown) + 2 bare CardTitle → as="h2" (were h3 under page h1). Interior deep audit still pending |
| A24 | Trend analysis | `/analysis/trends` | PARTIAL | C8 | recharts, anomaly cards. C8: "No expense data"-on-pause fixed (2 sources → offline guard; selector + chart area both show offline notice + Try again). Full audit pending |
| A25 | System compare | `/compare` | PARTIAL | C8 | billed vs correct. C8: verified CLEAN on pause (empty dropdown + disabled action, no misleading copy). Full audit pending |
| A26 | GL ingestion | `/ingestion` | PARTIAL | C28 | decorative-icon a11y swept (45 icons aria-hidden across 8 files); OPEN: copy cycle, P1 upload-progress feedback, P2 error-clears-on-good-drop |
| A27 | Lease upload (bulk) | `/leases/upload` | TODO | | dropzone |
| A28 | Rent roll upload | `/rent-roll/upload` | TODO | | OWNER/ADMIN |
| A29 | Extractions list | `/extractions` | PARTIAL | C7 | status badges. C7: empty-on-pause fixed (offline ErrorState + new Try again→refetch). Full audit pending |
| A30 | Verification (HITL) | `/verify/:documentId` | PARTIAL | C6 | PDF + bounding-box + edit + approve/reject. C6: "Extraction Not Found"-on-pause fixed (offline copy + Try again). Full audit pending |
| A31 | Disputes list (landlord) | `/disputes` | PARTIAL | C5 | C5: empty-on-pause fixed (offline notice). Full audit pending |
| A32 | Dispute detail (landlord) | `/disputes/:id` | PARTIAL | C6 | comment thread, status. C6: "Dispute not found"-on-pause fixed (offline copy + Try again; bespoke block — ErrorState migration = tech debt). Full audit pending |
| A33 | Tax protest | `/tax-protest` | FIXING | C4 | HCAD; C4 fixed blank-on-pause + offline ErrorState + desktop icon a11y. Needs 2nd clean pass for DONE |
| A34 | In-app help | `/help` | TODO | | |
| A35 | Settings: profile | `/settings/profile` | DONE | C19 | LinkedAccounts: surfaced swallowed fetch error (+"Try again"), fixed destructive Unlink button (blue→red gradient) + success icon contrast; delete-account flow already clean; form.tsx red-border/aria fixed in C20 (see AS10) |
| A36 | Settings: organization | `/settings/organization` | PARTIAL | C8 | OWNER/ADMIN. C8: verified CLEAN on pause (`!organization` → retryable ErrorState). Full audit pending |
| A37 | Settings: team | `/settings/team` | PARTIAL | C7,C33 | members, invites, roles. C7: empty-on-pause fixed (both queries → offline ErrorState + Try again). C33: a11y — Current Members (UserCheck), Pending Invitations (Mail), "Admins only" empty-state (Users) decorative glyphs now `aria-hidden`. Full interior/copy audit pending |
| A38 | Settings: billing | `/settings/billing` | PARTIAL | C33 | plans, CheckoutDialog, CancelWizard. C33: a11y — Current Plan/Payment Method/Billing History card-heading glyphs + BillingWarningBanner AlertCircle now `aria-hidden`. Logged COPY follow-ups ("No rush"/"Pricing model"/"Trialing"/"Support ID"/units-vs-buildings) + Cancel-button discoverability. Full interior audit pending |
| A39 | Settings: invoices | `/settings/billing/invoices` | PARTIAL | C7 | Stripe invoice list. C7: empty-on-pause fixed (offline ErrorState + Try again). Full audit pending |
| A40 | Admin: feedback | `/admin/feedback` | PARTIAL | C7 | OWNER/ADMIN. C7: empty-on-pause fixed (mobile+desktop branches → offline ErrorState + Try again). Full audit pending |
| A41 | 403 permission denied | `/403` | DONE | C17 | C17: "Go to Dashboard" hardcoded /dashboard, which fails the landlord-only role check for a TENANT → bounced back to /403 (loop). Now `isTenantUser ? '/tenant/dashboard' : '/dashboard'`; tests pin tenant + every non-tenant role |
| A42 | 404 not found | `*` | DONE | C18 | C18: NotFoundPage assumed every signed-in user is a landlord — "Go to Dashboard"/no-history "Go Back" pointed at /dashboard (403s a TENANT → bounce) and quick links were landlord-only (Properties/Upload Rent Roll/Data Ingestion). Now `isTenantUser ? '/tenant/dashboard' : '/dashboard'` + a tenant link set (Dashboard/Disputes/Notifications/Help); vitest 19/19 |

### A-onboard — PLG onboarding (audit each)
| ID | Surface | Route | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| A50 | Onboard wizard | `/onboard` | TODO | | OnboardFlowWizard: WelcomeSample, EmailCapture, SetPassword, Results |
| A51 | Paywall step | `/onboard/unlock` | TODO | | PaywallStep |
| A52 | Authenticated onboarding | dashboard-triggered | PARTIAL | C10 | OnboardingWizard: Welcome, AddProperty, UploadFile, AddLeases, ActualBilled, LeakageResult, Completion. C10: AddLeasesStep offline-on-pause fixed (offline ErrorState + Try again→refetch, ahead of the empty add-tenant form). Other steps pending |

### A-public — app-served public pages (separate from Next.js marketing!)
| ID | Surface | Route | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| A60 | App landing | `/` | TODO | | redirects if authed |
| A61 | App pricing | `/pricing` | TODO | | |
| A62 | Checkout success | `/checkout/success` | TODO | | |
| A63 | Sample report | `/sample-report` | TODO | | |
| A64 | Contact / About | `/contact`, `/about` | TODO | | |
| A65 | Legal | `/privacy`,`/terms`,`/cookies`,`/compliance/ai-transparency` | TODO | | |
| A66 | App vs pages | `/vs/yardi`,`/vs/mri`,`/vs/appfolio` | TODO | | ExitIntentDialog |
| A67 | App resources hub + 12 articles | `/resources/*` | TODO | | own React pages (distinct from Next site) |
| A68 | App tools hub + 6 tools | `/tools/*` | TODO | | AuditRiskQuiz, Boma2024Calculator, CamGrossUpCalculator, CamLeakageEstimator, HcadTaxNormalizer, LeaseAbstractMatrix + thank-you |

### A-modals — dialogs/drawers (audit each)
| ID | Modal | Status | Cycle | Notes |
|----|-------|--------|-------|-------|
| AM01 | UnitFormModal | DONE | C23 | C23: double-submit guard (onSubmit early-return on create/update isPending — keyboard-Enter race the disabled button can't catch); space_type Select `key={field.value}` so the saved type shows after async form.reset in edit mode (trigger uses `<SelectValue>` → hits the Radix on-mount caching bug, unlike C22's custom-span Selects); plain-English Rentable/Usable Sqft FormDescriptions. Shares UnitFormSchema.ts (no split-brain); money already decimal strings. Live E2E: set a seeded unit to space_type=retail via PUT, reopened modal → Select showed "Retail" (stale "Office" would prove the bug). Fail-before regression test added |
| AM02 | ExpensePoolFormModal | DONE | C23 | C23: double-submit guard (onSubmit early-return on create/update isPending); pool_type + parent_pool Selects `key={field.value}` (both render via `<SelectValue>`). Shares ExpensePoolFormSchema.ts; gross-up already drift-free decimal string (F-428). Fail-before regression test added |
| AM03 | PoolMappingsDialog | DONE | C24 | C9: GL→pool empty-on-pause fixed (inline offline row + Try again folded into table-row error branch). C24: double-submit guards added to all 3 mutation handlers (handleAdd→createMutation, handleUpdate→updateMutation, handleDelete→deleteMutation) — early-return on the matching `.isPending` so a keyboard-Enter race the disabled save button can't catch won't fire twice. No Selects (no key= concern); inline schema, no split-brain; allocation already drift-free decimal string (F-428). Fail-before regression test on handleAdd added |
| AM04 | PoolAllocationsDialog | PARTIAL | C9 | empty-on-pause fixed (inline offline row + Try again; new test suite added) |
| AM05 | SB1103RequestDialog | DONE | C24 | C24: double-submit guard added to `onSubmit` (early-return on `createMutation.isPending` — keyboard-Enter race the disabled "Log Request" button can't catch). Radix Select `key={field.value}` deliberately NOT added: create-only dialog (no record prop, no edit-mode form.reset injecting a saved value) + Radix `DialogContent` unmounts on close, so the C23 on-mount caching staleness cannot occur — rejected as a false positive to avoid redundant churn. Inline schema, no split-brain. Fail-before regression test (fills lease Select + name/email, submits while isPending) added |
| AM06 | ReconciliationKickoffModal | PARTIAL | C11 | offline-on-pause fixed in TWO blocks: C10 — prerequisites (isPaused aggregated in useReconciliationKickoffState from leases+leakage; "What we need" checklist + "Run reconciliation" card gated !isOffline). C11 — property dropdown (`kickoff-properties` query now destructures isPaused/refetch → isPropertiesOffline; empty `<Select>` replaced by offline ErrorState so an outage no longer reads as "you have no properties"). Full audit pending |
| AM07 | FinalizeModal | DONE | C25 | C25: forgiveness/confirm copy ("cannot be undone") + AlertDialogAction pill already clean. P0 double-finalize race fixed in the parent FinalizeButton.executeFinalization (the single mutation call site wired to onConfirm): `if (finalizeMutation.isPending) return` placed BEFORE the modal close, so a double-confirm during an in-flight irreversible finalize is a no-op that leaves the modal open. Fail-before regression test added (open modal → mark isPending → click confirm → assert mutate not called) |
| AM08 | CalculationTraceDrawer | PARTIAL | C29,C30 | C29 a11y (Printer glyph aria-hidden); C30 copy pass (support hint clearer: "This calculation" / "Share with support" / short-sentence body). Interior visual audit pending |
| AM09 | ExportPanel (drawer) | PARTIAL | C10,C43 | PDF/Excel/ERP. C10: history tab offline-on-pause fixed (bespoke error div → shared ErrorState, gated isError\|\|isOffline). C43: 9 decorative icons aria-hidden (incl. icon-only "Re-download {file}" button glyph + History/Statement TabsTrigger icons — each beside text or self-named). Export/mapping tab interior visual audit still pending |
| AM10 | PDFPreviewModal (recon + export) | PARTIAL | C29 | a11y both instances + export PDFPreviewControls toolbar (8 decorative glyphs aria-hidden; icon-only zoom/close buttons keep aria-label). Interior visual/UX audit pending |
| AM11 | DemandLetterPanel | PARTIAL | C25,C43 | C25: double-submit guard on `handleGenerate` (early-return on `generateMutation.isPending`, after the `!selectedTenantId` check) so a re-triggered generate can't fire twice. C43: 2 decorative `<Scale>` glyphs aria-hidden (SheetTitle + Generate button, both beside text); "Document Summary" h3 ladder-skip REJECTED (under SheetTitle `<h2>` = valid). DEFERRED (P2): "Correction Window (days)" label reads as jargon — own copy cycle (humanizer → third-grade-copy). Full panel audit (steps, empty states) still pending |
| AM12 | DenominatorChangePanel | PARTIAL | C25 | C25: export button inline onClick guarded (`if (exportMutation.isPending) return` before `.mutate`). Full report/empty-state/a11y audit pending |
| AM13 | NOIImpactPanel | PARTIAL | C25,C43 | C25: export button inline onClick guarded (`if (downloadMutation.isPending) return` before `.mutate`); cap-rate already tenths-of-percent (no float imprecision). C43: money → shared `formatMoneyWhole` (drop local `formatCurrencyCompact`); 7 decorative icons aria-hidden (toggle TrendingUp, Lock, 3 stat-card glyphs, Loader2/FileDown in export button). Full report/empty-state interior visual audit still pending |
| AM14 | PoolCopyDialog | TODO | | |
| AM15 | CheckoutDialog | TODO | | Stripe |
| AM16 | CancelSubscriptionWizard | TODO | | multi-step |
| AM17 | ConfirmPlanDialog | TODO | | |
| AM18 | FreeAuditUpgradeModal | TODO | | paywall |
| AM19 | ApprovalDialog / RejectDialog | TODO | | verification |
| AM20 | HelpDrawer | TODO | | global "?" |
| AM21 | Tour sheets (ReconWorkflow, PoolMapping) | TODO | | |
| AM22 | ExitIntentDialog | TODO | | on vs pages |
| AM23 | BatchPDFExport | TODO | | |
| AM24 | Property delete AlertDialog | TODO | | confirm |
| AM25 | Account delete AlertDialog | TODO | | "Type DELETE" |
| AM26 | CalculateButton dialogs (overwrite-draft + missing-GL-mappings) | PARTIAL | C26 | C26: missing-GL-mappings warning copy now states the real billing consequence — body "We won't bill these expenses to your tenants.", CTA "Run without these pools" (was "Run Anyway"). Title kept Title Case to match siblings. Overwrite-draft dialog + double-submit guard on the calc trigger still pending |

### (legacy header retained)
| ID | Surface | Route/Path | Type | Status | Cycle | Notes |
|----|---------|-----------|------|--------|-------|-------|

## T — App, Tenant portal (in TenantLayout shell)
| ID | Surface | Route | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| T01 | Tenant login | `/tenant/login` | TODO | | public |
| T02 | Tenant signup (invite) | `/tenant/signup` | TODO | C42 | public, invite. NOTE: tenant portal has its OWN canon (generic Card + from-primary/5 header, shared with T01 TenantLogin) — do NOT re-flag the lack of landlord AuthLayout; aligning it there would break tenant-portal coherence + wrongly sell to tenants. C42 fixed one a11y defect only (redundant checkbox aria-label → aria-labelledby+Label id). Full visual/copy/UX audit still pending. |
| T03 | Tenant forgot password | `/tenant/forgot-password` | TODO | | shared component |
| T04 | Tenant dashboard | `/tenant/dashboard` | PARTIAL | C8 | property card + statement rows. C8: verified CLEAN on pause (`if (!data)` → retryable DashboardUnavailable). Full audit pending |
| T05 | Tenant disputes list | `/tenant/disputes` | TODO | | |
| T06 | Tenant create dispute | `/tenant/disputes/new` | TODO | | DisputeForm |
| T07 | Tenant dispute detail | `/tenant/disputes/:id` | TODO | | comment thread |
| T08 | Tenant preferences | `/tenant/preferences` | TODO | | email toggles |
| T09 | Tenant notifications | `/tenant/notifications` | TODO | | history |
| T10 | Tenant help | `/tenant/help` | TODO | | FAQ |

## A-shared — app shared shell/components (audit once, applies everywhere)
| ID | Component | Status | Cycle | Notes |
|----|-----------|--------|-------|-------|
| AS01 | Sidebar (desktop + mobile drawer) | TODO | | landlord nav |
| AS02 | Header (logo, user menu, help btn, hamburger) | TODO | | |
| AS03 | BottomNav (mobile) | TODO | | |
| AS04 | PageHeader / Breadcrumbs / BackButton / PageContainer | TODO | | layout primitives |
| AS05 | TenantLayout | TODO | | tenant shell |
| AS06 | Sonner toaster | TODO | | global toasts |
| AS07 | ErrorBoundary / FriendlyError | TODO | | |
| AS08 | Help system (HelpDrawer, FieldHelpLabel, GuidedEmptyState, HelpTip, etc.) | TODO | | |
| AS09 | Feedback widgets (CrmFeedback, AiCsHelp, FeedbackWidget, OfflineIndicator) | TODO | | env-gated |
| AS10 | UI primitives (ui/*) + data-table | PARTIAL | C20 | C20: form.tsx/input.tsx/textarea.tsx — FormField-wired inputs now fire the red `border-destructive` border on validation (read injected aria-invalid, real class swap) + `aria-describedby` only names mounted nodes (no dangling). vitest 41/41, live-verified /settings/profile. Rest of shadcn set + data-table still TODO |
| AS11 | Auth components (AuthCard, AuthLayout, TrustIndicators, FeatureShowcase) | TODO | | |

### (legacy header retained)
| ID | Surface | Route/Path | Type | Status | Cycle | Notes |
|----|---------|-----------|------|--------|-------|-------|

## X — Cross-cutting (system-wide passes)

| ID | Surface | Scope | Status | Cycle | Notes |
|----|---------|-------|--------|-------|-------|
| X1 | Design tokens consistency | colors/spacing/radii/shadows/type scale | TODO | | |
| X2 | Button = pill canon | all buttons everywhere | TODO | | |
| X3 | Responsive 375/390/768/1280/1440 | every page | TODO | | |
| X4 | Dark mode parity | where supported | TODO | | |
| X5 | Empty / loading / error states | every data surface | TODO | | |
| X6 | Focus / keyboard / a11y | every interactive surface | TODO | | |
| X7 | Copy voice + honesty | marketing↔app one voice, no fabricated claims | TODO | | |
| X8 | Toasts / notifications consistency | global feedback system | TODO | | |
| X9 | Meta & brand artifacts (D6) | favicon, OG image, webmanifest, JSON-LD, social card | TODO | | `marketing/public/site.webmanifest` has double-space name bug; `marketing/src/app/api/og/route.tsx`; sitemap.ts/robots.ts |
| X10 | Marketing→app seam (D7) | CTA→login/register/onboard handoff visual+tonal continuity | TODO | | palette/type/pill geometry must match across the boundary |

## E — Transactional emails (render via Inbucket :54324; copy gate + humanizer + third-grade)

> Source: `cloudflare-backend/src/adapters/email/resend.ts` (templates) + `layout.ts` (shared inline-CSS
> shell) + trial-lifecycle renderers in `http/stripe-webhook-routes.ts`. Audit each: brand layout, pill
> CTAs, escaping, legible, plain-English, honest. Trigger via the real local flow where possible, else
> render the template HTML directly.
>
> **VEIN STATUS (post-C13): CLOSED at the code level.** The complete CapVeri-rendered sender set is the 7
> classes in `resend.ts` (contact, content-download, welcome, feedback, team-invite, team-welcome,
> tenant-invite) + `ResendTrialEmailSender` in `stripe-webhook-routes.ts`. E01/E02/E02b/E04/E04b/E04c/E07/
> E07b all audited (C12/C13). E03/E05/E06 are SPECULATIVE rows that VERIFIED don't exist as senders (see
> each row). Only E08 (Supabase Auth dashboard templates) remains — config-level, not in this repo.

| ID | Email | Trigger | Status | Cycle | Notes |
|----|-------|---------|--------|-------|-------|
| E01 | Email layout shell | all | TODO | | layout.ts inline CSS, logo, footer, unsubscribe. C12: shell verified well-built (escaping thorough, pill genuinely 9999px); logo `<img>` lacks `width` (tech debt) |
| E02 | Welcome (owner) | signup | PARTIAL | C12 | C12: copy REVIEWED + intentionally LEFT — "Start your plan"/"Then add one property" CTA is the deliberate billing/activation funnel (dashboardUrl=checkoutUrl). Do not rewrite without the grand-slam-offer goal |
| E02b | Team welcome (member) | member added | DONE | C12 | C12: dropped raw `${role}` ("your member account is ready") + non-existent "next setup step" → "your account is ready" / "Open CapVeri to get started." +render test |
| E03 | Password reset | forgot-password | N/A | C13 | C13: VERIFIED no CapVeri-rendered sender exists — password reset is handled entirely by Supabase Auth (see E08). Only auth code is the `signInWithPassword` adapter (a sign-in API call, not an email). Not a defect; folds into E08 config-level audit |
| E04 | Team invite | team invite | DONE | C12 | C12: CTA "Accept invitation" → "Join the team" (html+text) +text assertion |
| E04b | Tenant invitation | landlord invites tenant | DONE | C12 | C12 (P1): de-phished framing — heading "You have been invited to CapVeri" → "Your CAM statement is ready to view"; body names the landlord; CTA → "View my statement" +render test |
| E04c | Content download (nurture) | lead magnet | DONE | C12 | C12: removed orphan greeting + dup "is ready"; de-jargoned "deterministic CAM math" → plain "checks every CAM charge, line by line" |
| E05 | Reconciliation / statement notice | finalize→tenant | N/A | C13 | C13: VERIFIED no such email sender exists in the codebase. Tenants are invited via E04b (tenant invitation) and then view the statement in-app/portal; there is no "statement finalized" email. Speculative row — not a defect |
| E06 | Dispute notifications | dispute create/comment | N/A | C13 | C13: VERIFIED disputes are in-app only — `tenant-disputes-routes`/`disputes-admin-routes` send ZERO email (grep: no email sender import/call). "dispute" surfaces only as storage/routes (dispute-attachments.ts). Speculative row — not a defect |
| E07 | Billing / trial reminders | Stripe/trial | DONE | C13 | C13: 3 trial-lifecycle emails (started/ending-soon/paused) in stripe-webhook-routes.ts. Fixed P1 "Custom pricing" grammar break ("Your plan will be Custom pricing once…" → "Your plan: ${amount}."); dropped hardcoded "3 days" → "ends soon" (Stripe window configurable); paused de-jargoned ("workspace"→"account", removed accusatory "no payment method was on file", split 32-word run-on); CTA "See billing" → "Add payment method"; consistent "free trial" framing. Exported renderers + 4 render tests incl. Custom-pricing regression guard. FK 0.2 |
| E07b | Contact / Feedback notifications | contact form / feedback | DONE | C13 | C13: REVIEWED — internal admin-only emails (sent to adminEmail, not users); dataTable escapes all values; no consumer-facing copy defects. screenshotUrl 1h-TTL + raw UUID labels noted as internal-admin tech debt, not pristine blockers |
| E08 | Supabase Auth emails | auth (magic-link/confirm) | TODO | | configured in Supabase templates — note-level brand/voice audit |

## P — PDF output documents (download + inspect; legible, on-brand, Decimal-formatted, paginated)

> Source: `cloudflare-backend/src/domain/.../pdf/*` + `exports/*-pdf.ts` + `legal/demand-letter.ts` +
> shared `pdf/layout.ts`. Highest stakes — these go to tenants and courts. Audit each: brand layout,
> currency/date formatting (C6), no clipped/overlapping elements, totals match source data.

| ID | PDF | Generator | Status | Cycle | Notes |
|----|-----|-----------|--------|-------|-------|
| P01 | PDF layout shell | `pdf/layout.ts` | PARTIAL | C15 | C15: extracted canonical `formatDate` into pure `pdf/format-date.ts` (re-exported from layout.ts; now shared by statement-pdf, property-pdf, demand-letter). Full geometry/header/footer audit of layout.ts still TODO |
| P02 | Tenant statement | `tenant-portal/statement-pdf.ts` | DONE | C14 | C14 (P1): footer separator rule struck through the disclaimer fine print (rule@y90 crossed text@y84-104) → bottom-anchored footer, rule above disclaimer, reading order preserved; raw ISO "Generated: 2026-06-29 14:32:01 UTC" → friendly "Generated on June 29, 2026" via exported `formatGeneratedOn` + 2 render tests. Scout "reversed footer" DISPROVEN (reverse()+upward-draw double-inverts to correct order). DEFERRED: D4 negative `($...)` parens (shared `formatUsd`, out of scope), D5 "Total Amount Due" wording, D6 jargon glosses, D7 empty-address |
| P03 | Property report | `exports/property-pdf.ts` | TODO | | |
| P04 | Board report | `exports/board-pdf.ts` | TODO | | |
| P05 | Variance report | `exports/variance-pdf.ts` | TODO | | |
| P06 | Demand letter | `legal/demand-letter.ts` | DONE | C15 | C15 (P1): human-facing dates rendered raw ISO ("2026-01-15", "...no later than 2026-02-14") in a formal legal letter → wrapped every date (letter_date, period, deadline, dispute_filed_date) + the 3 correction-note date sites in shared `formatDate` → "January 15, 2026". Legal template WORDING untouched (only substituted values reformat). Extracted `formatDate` to pure `pdf/format-date.ts` (re-exported from layout.ts; demand-letter keeps own MARGIN=72, no layout coupling); guard returns non-ISO/empty unchanged. +unit + render-level (no-ISO) tests. NOTE: legal addresses/tone left as-is (verbatim) |
| P07 | Tax protest packet | tax-protest PDFs | TODO | | HCAD evidence |
| P08 | SB-1103 export | `sb1103/export.ts` | TODO | | CA compliance |
| P09 | Denominator-change notice | `denominator-change/pdf.ts` | DONE | C16 | C16 (P1): "Prior/Current Period" fields printed raw ISO bounds ("2023-01-01 to 2023-12-31"), diverging from sibling PDFs' friendly dates → added PDF-local `formatPeriodLabel` (split on " to ", `formatDate` each bound, rejoin) at the 2 draw sites. Kept PDF-LOCAL because `report.prior_period`/`current_period` are ALSO the JSON API contract (serialiseReport) — reformatting at `periodFmt`/source would break the API. +3 unit + 1 render (no-ISO) test. Scout confirmed all other PDF generators already friendly → PDF date vein EXHAUSTED |
