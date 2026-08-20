# Reconciliation Workflow
> Last updated: 2026-06-26 - Reconciliation grid cell edits now tolerate mixed snapshot cache shapes and send through the configured API client. The optimistic update in `useCellMutation` updates row-array caches and paginated snapshot list caches, while leaving snapshot-detail caches untouched, so a cached detail response can no longer throw before the cell PATCH request is sent. Cell ids are encoded as URL-safe path segments and the generated SDK call passes `apiClient`, so production PATCH requests go to the API host instead of the app origin. Regression coverage includes the production all-pages cache shape, a mixed list/detail cache, and the API client/cell-id contract.
> Last updated: 2026-06-25 - Finalization results emails now include under-bill, over-bill, and total billing exposure amounts only when the finalized property/period has actual billed rows to compare against. The lookup uses finalized snapshots plus actual billed data for the same period and omits exposure if that comparison data or lookup is unavailable, so finalization and the base results email still succeed.
> Last updated: 2026-06-25 - Starter lease term estimates are now visible in the calculation trace drawer. When a reconciliation snapshot includes `lease_terms_snapshot.estimated_terms_note`, `ReconciliationPage` passes it into `CalculationTraceDrawer`, which shows a "Starter lease terms" callout before the calculation steps. This makes reduced precision visible when the engine used `tenant SF / property SF` instead of exact lease terms. Frontend-only display/wiring with drawer and page-path regression coverage.
> Last updated: 2026-06-24 - Cold-start kickoff now makes lease PDFs explicitly post-result enrichment. The first-reconciliation modal says PDFs can be added later, names the required setup as tenant terms plus GL data, and sends the setup action to the existing property leases tab as "Add terms" instead of implying a lease PDF upload is required before the first run. Frontend-only copy/CTA change; calculation still requires active lease terms and GL data.
> Last updated: 2026-06-15 - Modal dismissal affordances (pristine-ux C17): form overlays that hold typed input no longer silently discard it on an accidental backdrop click or Escape. The Demand Letter sheet (`DemandLetterPanel`, tenant selection + 6 landlord contact fields), the dispute Generate-Demand-Letter dialog (`LandlordDisputeDetailPage`), and the extraction Reject dialog (`RejectDialog`, reason + notes) now guard `onInteractOutside`/`onEscapeKeyDown` while the form is dirty and not submitting; an untouched form stays freely dismissible and the X/Cancel button always closes. Separately, the reconciliation `PDFPreviewModal` rendered two close buttons (a custom toolbar X next to Download plus the shadcn built-in floating X) — it now passes `showCloseButton={false}` so only the toolbar X remains. RejectDialog gains tests for closes-on-Escape-when-clean and blocks-Escape-when-dirty.
> Last updated: 2026-06-15 - Error-state copy clarity (pristine-ux C15): the reconciliation page's full-screen load error (`ReconciliationPage`) no longer renders the raw `error?.message` from the API; it shows the plain, reassuring "We couldn't load this reconciliation. Your data is safe. Go back and open it again." and keeps the Back-to-properties recovery button (raw error now console.error only). The reconciliations list error (`ReconciliationsListPage`) drops the bare "Error" alert title for "Couldn't load reconciliations" plus "We had trouble loading your reconciliations. Your data is safe. Use Retry to try again.", keeping the existing Retry button. Tests updated to the new copy.
> Last updated: 2026-06-12 - Expense-pool group header subtotal money precision (F-442): the collapsible expense-pool section header in the reconciliation grid (`GroupHeader`, the subtotal a property manager scans when reviewing pooled CAM expenses) formatted its `subtotal` via a local `formatCurrency` doing `parseFloat(subtotal)` → `Intl.NumberFormat` — the same F-430 float round-trip on the backend's exact decimal subtotal string. `subtotal` now routes through the canonical `formatMoney` (exact ECMA-402 decimal parse, no float coercion); the redundant local `formatCurrency` was removed (`formatMoney` handles negatives and the USD 2-decimal cap). A regression test asserts a `9007199254740993.45` subtotal keeps every digit instead of collapsing to the float-rounded `…992.00`.
> Last updated: 2026-06-12 - Calculation trace drawer "Final Amount" money precision (F-441): the calculation trace drawer (`CalculationTraceDrawer`, the slide-out audit-trail viewer that embeds the per-step `CalculationStepCard` fixed in F-440) formatted its headline "Final Amount" by `parseFloat(finalValue)` then handing the JS float to a local `formatCurrency` — the same F-430 float round-trip on the figure landlords cite when escalating a disputed CAM number. `finalValue` (the backend's exact decimal string) now routes through the canonical `formatMoney` (exact ECMA-402 decimal parse, no float coercion); the redundant local `formatCurrency` was removed (`formatMoney` handles the negative sign and numeric input it covered). A regression test asserts a magnitude beyond `Number.MAX_SAFE_INTEGER` keeps every digit; the existing negative (`-$5,000.00`) and numeric-input cases still pass.
> Last updated: 2026-06-12 - Calculation audit-trail money precision (F-440): the per-step calculation card (`CalculationStepCard`) rendered every currency input/output by `parseFloat(value)` then handing the JS float to a local `formatCurrency` — the F-430 float round-trip on the exact surface enterprise buyers scrutinize to verify the math. On a CAM figure beyond ~15 significant digits this silently drops the cents. The currency/default case in `formatByUnit` now routes string and number values through the canonical `formatMoney` (exact ECMA-402 decimal parse, no float coercion); the non-currency unit tags (ratio/area/count/date/text) are unchanged, and a non-numeric string still renders verbatim. The redundant local `formatCurrency` was removed. A regression test asserts a magnitude beyond `Number.MAX_SAFE_INTEGER` keeps every digit.
> Last updated: 2026-06-12 - Shared grid cell money precision (F-438): the reconciliation grid's shared cell renderers (`CurrencyCell`, `DifferenceCell` in `cells/CellRenderers.tsx`) formatted money by `parseFloat(value)` then handing the JS float to `Intl.NumberFormat.format()` — the same F-430 float round-trip as the Cap Bank Ledger (F-436). On CAM totals beyond ~15 significant digits this silently prints the wrong dollars. Both cells now route the displayed magnitude through the canonical `formatMoney` (exact ECMA-402 decimal parse, no float coercion); `DifferenceCell` still parses to a number ONLY for the sign/zero comparison that drives color and the +/- prefix. Tests assert both cells keep every digit beyond `Number.MAX_SAFE_INTEGER`.
> Last updated: 2026-06-12 - Cap Bank Ledger money precision (F-436): the cumulative cap bank ledger table (`CapBankLedgerTable`) formatted its cap thresholds, actual/applied expense, landlord-absorbed excess, and opening/change/closing bank balances via `formatCurrency(parseFloat(value))`, coercing the backend's exact decimal money string to a JS float before display. On the large magnitudes landlords verify against, that round-trip drifts. `fmtUsd` now routes through the canonical `formatMoney`, which parses the decimal string exactly (the F-430 precision-bypass class); a new test asserts a magnitude beyond `Number.MAX_SAFE_INTEGER` keeps every digit.
> Last updated: 2026-06-11 - SharedGlUpload contrast fix (F-385): the shared GL-upload control's inline upload-error message (`SharedGlUpload`, mounted inside the "Start first reconciliation" ReconciliationKickoffModal on the reconciliations list page and the property-detail Reconciliations tab) rendered in the bright `text-destructive` (~3.9:1 on white — fails WCAG AA at body size). Now uses `text-destructive-strong`, matching the F-287/F-381/F-382/F-383/F-384 standard; a regression test asserts the upload-error carries the strong class.
> Last updated: 2026-06-11 - Variance Report contrast fix (F-382): the export-flow Variance Report (mounted in the reconciliation Export panel) colored over-budget figures with the bright mid-red `text-destructive` (`hsl(0 84% 60%)`, ~3.9:1 on white — fails WCAG AA for normal-size text) on the Variance (%) / Variance ($) table cells, the mobile variance cards, and the "Total Variance" summary number. Those now use the AA-passing dark `text-destructive-strong`, matching the disputes surface (F-287/F-381); the green decrease color (`text-success`) is unchanged. Frontend-only token swap; the color-coding unit tests assert the new class. (Note: the unmounted `ExportHistory`/`ERPExportConfig` components in `features/export/` were reviewed in the same sweep and left untouched as dead code.)
> Last updated: 2026-06-11 - The reconciliation workspace toolbar no longer shows its four inline hover-help `?` tips (Campaign status, Calculate, Finalize, Export) on mobile (F-380). Those tips are Radix hover tooltips — they do not open on touch — and on a phone they wrapped between the action buttons in the flex-wrap toolbar, cluttering the row with dead icons. They are now `hidden sm:inline-flex`, so desktop keeps the inline contextual help while mobile relies on the always-visible `?` HelpButton, which opens the touch-friendly Reconciliation Workflow tour sheet that already covers Run/Review/Finalize/Export. Frontend-only responsive class; elements stay in the DOM (display-only), so no behavior/test change.
> Last updated: 2026-06-11 - The "Review before tenant packets" guide callout on the reconciliation workspace is now tense-correct for finalized runs (F-379). The callout rendered unconditionally and always told the reviewer to check variance/denominator changes/tenant totals/traces "before finalizing" — stale wording on a run that is already finalized (the sibling GL panel and the missing-mappings banner were already gated on finalize state, this callout was not). The body now reads "before finalizing" while the run is still a draft and "before you send tenant packets" once it is finalized, matching the callout's own title. Frontend-only copy branch on `isFinalized`.
> Last updated: 2026-06-11 - The calculation audit-trail viewer now infers per-input units for a legacy/untagged trace step (F-378). The unit metadata from F-217 only annotated the live engine's trace; a persisted or hand-authored snapshot that uses the canonical `input_values` shape but omits the `input_units` map rendered every number as currency, so the period year showed as "$2,023.00" and ratios like pro_rata_share 0.05 / gross_up_factor 1.0526 / admin_fee_rate 0.15 showed as "$0.05" / "$1.05" / "$0.15". CalculationStepCard now infers each input's unit from its key when (and only when) the step carries no `input_units` map at all — the current engine always emits the key (even as `{}`), so engine snapshots keep their explicit currency-default behavior and this fallback fires only for untagged legacy traces. `inferUnit` also learned that a bare `year`/`base_year` is a label (renders "2023", not "$2,023.00") and that `*_target` (e.g. gross_up_target) is the target-occupancy ratio. Frontend-only; verified live against a real untagged snapshot.
> Last updated: 2026-06-08 - The Denominator Changes panel's "no finalized snapshot to compare yet" state is now a normal HTTP 200 response, not a caught 4xx (F-293). The analysis service raises a typed `NoComparableSnapshotsError(ValueError)` carrying which period ('current'|'prior') lacks a finalized snapshot; the `POST /api/v1/analysis/denominator-change` route catches it and returns an otherwise-empty `DenominatorChangeReport` with `comparison_available=false` and `missing_period`. Genuinely-invalid params still return 400. The panel renders its guidance empty-state from `report.comparison_available === false` / `missing_period` instead of inspecting a caught error envelope — superseding the error-status branch added in F-258 for this case. No more 4xx-as-control-flow in the network tab.
> Last updated: 2026-06-08 - Colored status text on light backgrounds now meets WCAG AA contrast (F-287): three dark "on-light" color shades (success/info/destructive strong) were added so the workflow stepper's completed-step labels and the success/info/destructive Alert variants (text + icons on the tinted /5 wash) clear 4.5:1 instead of the bright mid-tone colors that failed (~3.3:1 for success). The decorative completed-step icon keeps the brand green (non-text 3:1). Frontend-only token addition (index.css + tailwind config), no brand-token regen.
> Last updated: 2026-06-08 - The tenant-summary filter rows are now exposed to screen readers as a labeled list of buttons (role=list "Tenants" + role=listitem per row), not a table of cells: each row is a single clickable filter control, so a table would trap unreachable cells inside the button. Each row button carries an explicit aria-label spelling out the tenant name, pro-rata share, billable amount, and prior-year variance (the visible columns are otherwise unlabeled), plus aria-pressed to announce which tenant filter is active — previously a visual-only state (F-289). ARIA-only, no visual change.
> Last updated: 2026-06-25 - TenantSummary prior-year movement is informational instead of green-good/red-bad. NOIImpactPanel labels finalized amounts as tenant total and says final tenant total adds to NOI, preserving the existing valuation math.

> Last updated: 2026-06-08 - Workspace accessibility fixes (F-288/F-290/F-291/F-292): heading hierarchy repaired across THREE sources so the workspace ladder is h1→h2 with no skips — MissingMappingsWarning alert title changed from h5 to a non-heading div, TenantSummary panel title promoted from h3 to h2, and the shared GuideCallout tip-callout title changed from h3 to a non-heading p (it sat directly under the page h1 on this and other pages); the mobile All/Pools/Tenants filter is a labeled toggle-button group (role=group + aria-label, chips keep aria-pressed) — NOT a tablist, since the chips filter the grid in place rather than swapping panels; admin-fee em-dash placeholder gets aria-hidden + sr-only "Not applicable" text; breadcrumb non-first links gain a title attribute so hover reveals the full property name when CSS truncation clips it.
> Last updated: 2026-06-07 - The reconciliation workspace's "Variance Report" and "Denominator Changes" toggle buttons are now accessible disclosures: each carries aria-expanded reflecting its open state and aria-controls pointing at its panel (which has a matching id), so screen-reader users know the button expands a region and whether it is currently open (F-273).
> Last updated: 2026-06-07 - The reconciliation table's Columns dropdown now renders each column-visibility toggle as an accessible checkbox menu item (role=menuitemcheckbox with aria-checked) instead of a plain menu item wrapping a non-interactive checkbox glyph, so screen-reader users hear whether each column is shown or hidden. The menu still stays open across toggles and still enforces the minimum visible-column count (F-272).
> Last updated: 2026-06-07 - On a finalized (locked) reconciliation the Missing GL Account Mappings banner now reads as a past-tense, informational note ("Some expense pools had no GL mappings. We did not bill their costs to tenants.") and drops the Configure Mappings / Show me how setup actions, since configuring mappings can no longer change a finalized run. It still lists the unmapped pools so the reviewer understands the finalized totals. Draft behavior is unchanged; this matches the sibling GLAnalysisPanel which was already gated on !isFinalized (F-270).
> Last updated: 2026-06-07 - The Denominator Changes report panel again shows its friendly "no finalized snapshots yet" guidance instead of a generic "Failed to load report" error. The panel branches on `error.statusCode === 400` plus the detail text, which only works now that `ApiError.fromUnknown` preserves the backend error envelope (see platform-infrastructure F-258); before the fix the status code collapsed to 0 and the empty-state branch never ran.
> Last updated: 2026-06-05 - The Portfolio Pipeline page is now responsive: full campaign table on tablet/desktop, stacked campaign cards below the md breakpoint (via useViewport). On phones each campaign's next-action control (Finalize, Submit for Review, Approve/Reject, Mark Sent, View) renders as a full-width 44px button so the action never scrolls off-screen (F-202).
> Last updated: 2026-06-05 - The reconciliations list page is now responsive: full table on tablet/desktop, stacked property cards below the md breakpoint (via useViewport) so the View/Review action stays a full-width 44px touch target instead of scrolling off-screen on phones (F-221).
> Last updated: 2026-06-05 - The calculation audit trail now carries unit metadata per step (currency/ratio/area/count/date/text), so occupancy ratios, gross-up factors, square footage, and day/pool counts render in their real units instead of as dollar amounts. Currency stays the default, so only non-dollar values are annotated, and add_step rejects an unknown unit tag so a typo cannot silently fall back to currency (F-217).
> Last updated: 2026-06-05 - The Year-over-Year page now renders its data-trust disclaimer only alongside actual comparison results; the empty pre-run form no longer shows a disclaimer about numbers that aren't on screen yet (F-195).
> Last updated: 2026-05-30 - Year-over-Year comparison now coerces backend Decimal-string money fields (pool amounts, base/variance amounts and percents, year totals) to numbers at the data-hook boundary so the comparison grid renders honest typed values, and the variance formatters accept string-or-number inputs defensively; display output is unchanged (F-031).
> Last updated: 2026-05-30 - Trend Analysis page now calls the /analysis/anomaly-detection endpoint (auto-fetched for the latest target year vs prior comparison years) and renders real detected anomalies on the trend chart/summary/legend, filtered to the selected pool; numeric anomaly fields are coerced from Decimal strings (F-032). Extraction job-status polling now compares against ExtractionJobStatus instead of DocumentStatus, removing latent enum coupling (F-045).
> Last updated: 2026-05-29 - Batch export progress now shows an honest indeterminate state ("Exporting N tenants…") instead of a frozen fake percentage; latest-GL-analysis query keys by real property/period params (no shared "disabled" cache entry); denominator-change panel renders a guidance empty state when no prior-year finalized snapshot exists (HTTP 400) instead of a generic error (F-034/F-036/F-039).
> Last updated: 2026-05-29 - Reconciliation page now fetches all snapshot pages (no >100-lease truncation in grid/totals/finalized status/exports), reads the live GL date-range endpoint to default the period year, and the missing-mappings "Fix mappings" action navigates to the property pools tab via URL hash.
> Last updated: 2026-05-28 - Campaign summaries and denominator-shift anomaly checks now read schema-valid snapshot fields and derive years/RSF from frozen period data.
> Last updated: 2026-05-28 - Portfolio summary, GL narrative analysis, and CapEx classification/list/count/summary reads now use explicit Supabase pagination; CapEx summary GL lookups are chunked for large flag sets.

> Last updated: 2026-05-20 - Journey 02 now covers calculation trace drawer opening and live PDF preview initiation; E2E seeds use typed calculation trace rows with legacy rendering fallback.

> Last updated: 2026-05-20 - Reconciliation page coverage now verifies finalized NOI Impact panel wiring, cap-rate asset value recalculation, and unskipped Journey 08 checks.

> Last updated: 2026-04-28 - Competitor gap response: PLG onboarding now names the first useful output as leakage and variance preview after billed amounts upload; CalculationTraceDrawer now includes support context for disputed CAM number escalation.

> Last updated: 2026-03-11 — Cross-document reasoning engine: Claude now reasons across all verified leases + GL pool summaries together before reconciliation, catching issues per-document extraction misses. New cross_doc_analyses table, HITL accept/dismiss flow, accepted overrides create lease_term_versions, accepted advisories appear in CalculationTrace.

> Previous: 2026-02-28 — Added plan-tier annotations

> Plan tiers:
> - Core reconciliation workflow → **All plans** (`camReconciliation`)
> - Cumulative cap bank tracking → **Reconcile** (`capBankTracking`)
> - NOI impact calculator → **Reconcile** (`noiImpactCalculator`)
> - Anomaly alerts → **Reconcile** (`anomalyAlerts`)

> Previous: 2026-02-27 - ROI dashboard: Portfolio page NOI Impact section with cap rate slider (total_recovery_all_years), asset value lift calculation

> Previous: 2026-02-27 - Contextual in-app help: HelpButton + ReconciliationWorkflowTourSheet (6-step drawer) on ReconciliationPage; MissingMappingsWarning gains "Show me how" button wired to the tour; GlPatternHelp inline dialog in PoolMappingsDialog GL Pattern column header; PoolMappingTourSheet (5-step drawer) on ExpensePoolsTab

> Previous: 2026-03-02 - Cumulative cap bank ledger: year-by-year timeline of cap bank balance, drawdowns, and carry-forward per lease (backend service + API endpoint + frontend Cap Bank tab + marketing tier updates)

> Previous: 2026-03-02 - GL-entry-level CapEx classifier: 5 deterministic rules screen individual GL entries for capital expenditures before pool aggregation; non-blocking warning in reconciliation jobs; 5 API endpoints for classify/list/review/bulk-review

> Previous: 2026-02-27 - GLAnalysisTeaserCard added to PLG results paywall (static blurred preview of GL analysis findings; CTA routes to upgrade); marketing site and pricing page now surface GL analysis as a differentiator

> Previous: 2026-02-26 - Canonicalized reconciliation routes to `/reconciliations`, added legacy redirects, and package-gated NOI/board reporting in the reconciliation UI

## Overview

End-to-end reconciliation from calculation to tenant delivery, with campaign lifecycle management. Calculation jobs run asynchronously against all active leases for a property/period, producing per-lease snapshots that progress through a draft-to-finalized pipeline. A campaign layer tracks the portfolio-wide delivery workflow (Draft through Sent) with full audit trail.

## Features


- Precondition: endpoint now returns 422 no_active_leases_for_period when the property has zero active leases for the requested period.
- Status machine: `PENDING` -> `RUNNING` -> `COMPLETED` | `FAILED`.
- Progress tracking via `total_leases`, `processed_leases`; percentage derived on the client.
- Poll status via `GET /api/v1/reconciliation/jobs/{jobId}`.
- `force_recalculate` option deletes existing draft snapshots before re-running.
- Error details returned in `error_message` and `error_details` (JSONB).
- Background task runs `run_property_reconciliation()` from `app.services.calculation`.

### Reconciliation Snapshots

- One snapshot per lease per reconciliation period.
- Status: `draft` (editable) -> `finalized` (immutable, enforced by RLS UPDATE policy).
- Financial columns: `total_operating_expenses`, `grossed_up_expenses`, `base_year_amount`, `tenant_share_before_cap`, `tenant_share_after_cap`, `admin_fee`, `total_recovery` (all NUMERIC(14,2)).
- `calculation_trace` (JSONB) stores step-by-step breakdown for audit.
- `lease_terms_snapshot` (JSONB) freezes the lease terms used at calculation time. Starter estimates can include `estimated_terms_note`, which the trace drawer surfaces before the calculation steps.
- `term_version_id` links to the `lease_term_versions` row that was effective.
- Finalize single: `PATCH /api/v1/reconciliation/snapshots/{id}/finalize`.
- Batch finalize: `POST /api/v1/reconciliation/snapshots/batch-finalize`.
- Finalization sends the Sequencer statement-results email. It adds exposure
  amounts only when finalized snapshots can be directly compared to actual
  billed rows for the same property and period.
- Editable cells in draft state via `PATCH /api/v1/reconciliation/snapshots/{id}/cells/{cellId}`.
- Constraint: `finalized_requires_timestamp` ensures `finalized_at` is set when status is finalized.

### Campaign Lifecycle

- One campaign per property per fiscal year (UNIQUE constraint on `property_id, period_year`).
- Status machine: `DRAFT` -> `FINALIZED` -> `IN_REVIEW` -> `APPROVED` -> `SENT`.
- Rejection path: `IN_REVIEW` -> `FINALIZED` (re-opens for edits, clears submission fields).
- Transition validation in `app/services/campaigns/transition.py` using `VALID_TRANSITIONS` dict.
- Invalid transitions return 409 Conflict via `ConflictError`.
- Each transition records timestamp + user_id: `finalized_at/by`, `submitted_for_review_at/by`, `approved_at/by`, `sent_at/by`.
- Auto-created when a calculation job starts (`_upsert_campaign` in reconciliation endpoint).
- Auto-advanced to `FINALIZED` when batch-finalize completes (conditional on `only_from_status`).
- Endpoints: `GET /api/v1/campaigns/`, `POST .../submit-for-review`, `POST .../approve`, `POST .../reject`, `POST .../mark-sent`.

### Portfolio Pipeline Page

- Portfolio-wide view at `/portfolio` showing all properties' campaign status.
- `PortfolioPipelinePage.tsx` renders campaign summaries with property names, tenant counts, total recovery.
- Status summary chips and contextual action buttons for advancing campaigns.
- Year filter supported via query parameter.

### Portfolio Summary Page (ROI)

- `/portfolio` summary view shows aggregate CAM metrics: total recoverable, total leakage, recovery rate, properties with leakage.
- NOI Impact section: displays Total Recovery (all years), NOI Lift, and Asset Value Lift with adjustable cap rate slider (2%–12%, default 7%).
- Backend `total_recovery_all_years` field sums `total_recovery` across all finalized snapshots regardless of year.
- Per-property breakdown table sorted by leakage (descending).

### Reconciliation Grid UI

- Virtualized data grid using TanStack Table.
- Columns: tenant, unit, SF, occupancy%, base year, billed, calculated CAM, gross-up, cap, adjusted, variance ($, %).
- Header freeze, column visibility toggle (persisted to localStorage).
- Sortable columns. Editable cells in draft state.
- Calculation Trace Drawer shows step-by-step breakdown and support context for disputed-number escalation, including tenant/pool context and calculation step count.
- Trace rendering accepts current typed `CalculationStep` rows and legacy persisted trace rows so historical snapshots do not crash the reconciliation page.
- Mobile card view via `ReconciliationMobileView.tsx`.
- `ReconciliationHeader.tsx` shows workflow stepper (Draft -> Finalized -> In Review -> Approved -> Sent).
- For finalized reconciliations, NOIImpactPanel is visible but locked without an active or trialing Reconcile subscription with an upgrade CTA.
- The finalized reconciliation page opens the unlocked NOI Impact panel for active or trialing subscriptions, shows CAM Recovery, NOI Lift, and Asset Value Lift stat cards, and recalculates asset value when the cap-rate assumption changes.
- Export panel Board tab is locked without an active or trialing Reconcile subscription with an upgrade CTA; backend still enforces entitlement with 402.
- Journey 02 E2E covers opening the export panel from finalized reconciliation and initiating the real `/api/v1/export/pdf/preview` request.

### Reconciliation List Page

- Global view of all reconciliations across properties.
- Canonical app route is /reconciliations; legacy /reconciliation, /reconciliation/current, and /reconciliation/history paths redirect to avoid 404s.
- Year filter with smart auto-detection: defaults to the most recent year with snapshot data instead of current year.
- Status filter (draft/finalized) and property filter.
- Summary stats: property count, tenant count, draft count, total recovery.
- Navigation to per-property reconciliation detail with year param.
- Responsive layout: full table on tablet/desktop; below the `md` breakpoint each property renders as a stacked card (name, status badge, tenant count, tenant-billable amount, full-width 44px View/Review button) via `useViewport`, so the primary action never scrolls off-screen on phones (F-221).

### Dashboard Integration

- Dashboard `_get_recent_properties` queries `reconciliation_snapshots` for each property's most recent snapshot status ("Draft"/"Finalized" with date).
- Properties with draft reconciliations show "Draft" status badge; properties with no snapshots show "Needs Calculation".
- CTA navigates with `?year=` param (defaults to prior year for CAM reconciliation).
- Leakage summary includes `draft_recovery`, `draft_property_count`, separate over-bill and under-bill exposure fields, and total billing exposure. The dashboard hero uses total billing exposure when billing data exists; it uses draft tenant-billable totals only when billing data is not uploaded.
- Campaigns query (`useCampaigns`) uses `throwOnError: false` to gracefully handle 404 when campaigns feature isn't deployed.

### First Reconciliation Kickoff Modal

- For net-new users with zero reconciliations.
- Opens guided modal instead of hard-routing to reconciliation page.
- Adapts to user's readiness state (GL uploaded? Lease setup? Pool setup?).


### Onboarding Reconciliation Gating

- Onboarding flow now includes a dedicated lease gate step before GL upload.
- Auto-calculation is triggered after billing upload, not after GL upload.
- This prevents silent zero-tenant calculations caused by running without leases.

## Database Tables

### calculation_jobs
- `id` UUID PK, `organization_id` FK, `property_id` FK, `period_start` DATE, `period_end` DATE
- `status` TEXT CHECK (pending/running/completed/failed), `force_recalculate` BOOLEAN
- `total_leases` INTEGER, `processed_leases` INTEGER (>= 0, <= total_leases)
- `snapshot_ids` JSONB (array of UUID strings), `error_message` TEXT, `error_details` JSONB
- `started_at`, `completed_at` TIMESTAMPTZ
- RLS: org-scoped via users table join. Delete restricted to pending/failed.

### reconciliation_snapshots
- `id` UUID PK, `property_id` FK, `lease_id` FK, `period_start_date` DATE, `period_end_date` DATE
- `status` VARCHAR(20) CHECK (draft/finalized)
- Financial: `total_operating_expenses`, `grossed_up_expenses`, `base_year_amount`, `tenant_share_before_cap`, `tenant_share_after_cap`, `admin_fee`, `total_recovery` (NUMERIC 14,2)
- `calculation_trace` JSONB, `lease_terms_snapshot` JSONB, `term_version_id` UUID FK
- `finalized_at` TIMESTAMPTZ, `finalized_by_user_id` UUID FK
- Constraint: `finalized_requires_timestamp`, `valid_period`
- RLS: org-scoped via properties join. UPDATE/DELETE restricted to draft status only. DELETE restricted to owner/admin.

### reconciliation_campaigns
- `id` UUID PK, `organization_id` UUID, `property_id` FK, `period_year` INTEGER
- `status` VARCHAR(20) CHECK (draft/finalized/in_review/approved/sent)
- Audit: `finalized_at/by_user_id`, `submitted_for_review_at/by_user_id`, `approved_at/by_user_id`, `sent_at/by_user_id`
- UNIQUE constraint: `(property_id, period_year)`
- RLS: org-scoped via profiles table join.

## Key Files

- `backend/app/api/v1/reconciliation.py` — Calculation job + snapshot CRUD endpoints
- `backend/app/api/v1/campaigns.py` — Campaign lifecycle transition endpoints
- `backend/app/services/campaigns/transition.py` — `VALID_TRANSITIONS` dict + `validate_transition()`
- `backend/app/services/calculation/` — `run_property_reconciliation`, `fetch_active_leases`, `ReconciliationInput`
- `backend/app/models/reconciliation_snapshot.py` — Snapshot Pydantic models + cell encoding
- `backend/app/models/enums.py` — `CampaignStatus` enum
- `frontend/src/pages/reconciliation/ReconciliationPage.tsx` — Detail page with grid + toolbar
- `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx` — Property-grouped list
- `frontend/src/pages/reconciliation/components/ReconciliationHeader.tsx` — Workflow stepper
- `frontend/src/pages/reconciliation/components/ReconciliationMobileView.tsx` — Mobile card view
- `frontend/src/pages/portfolio/PortfolioPipelinePage.tsx` — Campaign status pipeline
- `supabase/migrations/20240101000010_create_reconciliation_snapshots.sql`
- `supabase/migrations/20240101000024_create_calculation_jobs_table.sql`
- `supabase/migrations/20260224200001_create_reconciliation_campaigns.sql`
- `supabase/migrations/20260226000003_add_terms_snapshot.sql`

### Cumulative Cap Bank Ledger

Derived view (no new DB table) that reconstructs the year-by-year cap bank history from finalized reconciliation snapshots. Available for leases with cumulative or cumulative-compounding cap types.

- `simulate_cap_bank()` helper computes opening/closing bank balance, threshold, excess absorbed per year
- `GET /api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger` returns the full timeline
- Frontend: "Cap Bank" tab on LeaseDetailPage (visible only for cumulative cap leases)
- TanStack Table with columns: Period, Cap Threshold, Actual Expense, Amount Applied, Landlord Absorbed, Bank Opening, Bank Change, Bank Closing
- Summary header shows cap type badge, cap rate, current bank balance, total landlord absorbed (both balances rendered via canonical `formatMoney` on the exact decimal string — no parseFloat round-trip; F-439)
- Empty state when no cumulative cap or no finalized snapshots
- Reconcile subscription (`capBankTracking` feature flag in plan-tiers.json)

**Key files:**
- `backend/app/services/calculation/cap_bank_ledger.py` — `simulate_cap_bank()` + `get_cap_bank_ledger()`
- `backend/app/services/calculation/models.py` — `CapBankLedgerEntry`, `CapBankLedger`
- `frontend/src/features/reconciliation/components/CapBankLedger.tsx` — summary + table wrapper
- `frontend/src/features/reconciliation/components/CapBankLedgerTable.tsx` — TanStack Table timeline

### GL Narrative Analysis Panel

Advisory panel shown between pool mapping and finalization, powered by Claude AI under the same Zero Data Retention agreement as lease extraction.

- Aggregates GL entries by account code (total amount, vendor list, sample descriptions) and sends to Claude for analysis
- Returns structured markdown: CapEx/OpEx classification issues (GAAP ASC 840/842, IRS Rev. Proc. 2015-82), CAM audit risks (LOW/MEDIUM/HIGH severity), non-recoverable expense flags (BOMA 2024), and numbered recommendations
- Analysis is advisory only — no auto-apply, no change to calculations
- Results persisted to `gl_analysis_results` with full audit trail (ran_at, ran_by, token usage)
- Controller can dismiss the panel; dismissed results are preserved for audit purposes
- Panel hidden once reconciliation is finalized

**API endpoints** (under `/api/v1/analysis`):
- `POST /gl-narrative` — run analysis (returns `GLAnalysisRunResponse`)
- `GET /gl-narrative/{property_id}/{period_year}` — latest non-dismissed result
- `POST /gl-narrative/{analysis_id}/dismiss` — mark dismissed

**Key files:**
- `backend/app/models/gl_analysis.py` — `GLAnalysisResult`, `GLAnalysisResultCreate`, `GLAnalysisRunResponse`
- `backend/app/services/extraction/gl_analysis_prompt.py` — system prompt + user message builder
- `backend/app/services/analysis/gl_analysis_service.py` — `GLAnalysisService`
- `backend/app/api/v1/analysis.py` — GL narrative endpoints
- `frontend/src/features/analysis/hooks/useGLAnalysis.ts` — `useRunGLAnalysis`, `useLatestGLAnalysis`, `useDismissGLAnalysis`
- `frontend/src/features/analysis/components/GLAnalysisPanel.tsx` — panel UI with ReactMarkdown render
- `supabase/migrations/20260227000001_create_gl_analysis_results.sql`

### CapEx Classifier (Pre-Reconciliation Screening)

Rules-based screening that evaluates individual GL entries for potential capital expenditures before pool aggregation. No AI, no LLM — five deterministic rules:

1. **Amount threshold**: entries >= $25K (0.60) or >= $100K (0.85)
2. **Account keyword**: high-conf ("capital improvement", "capex", "tenant improvement") at 0.90; medium ("replacement", "installation", "renovation") at 0.65
3. **Account code prefix**: codes starting with 15*, 17*, 18* at 0.75
4. **Vendor pattern**: "construction", "roofing", "paving" etc. at 0.55
5. **Amount + keyword combo**: > $10K with any CapEx keyword at 0.80

Flags are advisory — reconciliation proceeds with a non-blocking warning when unreviewed flags exist. Each flag includes confidence score, matched pattern, and audit trail for reviews (confirmed_capex or dismissed).

**API endpoints** (under `/api/v1/analysis`):
- `POST /capex-classify` — run classifier for property/year
- `GET /capex-flags/{property_id}/{period_year}` — list flags (filterable by disposition)
- `GET /capex-summary/{property_id}/{period_year}` — summary counts
- `POST /capex-flags/{flag_id}/review` — confirm or dismiss single flag
- `POST /capex-flags/bulk-review` — bulk confirm/dismiss

**Key files:**
- `backend/app/models/capex_flag.py` — `CapExFlag`, `CapExFlagWithEntry`, `CapExReviewRequest`, `CapExRunResponse`, `CapExSummary`
- `backend/app/services/analysis/capex_classifier.py` — rules engine + `CapExClassifierService`
- `backend/app/api/v1/analysis.py` — CapEx endpoints
- `backend/app/api/v1/reconciliation.py` — non-blocking warning integration
- `supabase/migrations/20260302000001_create_capex_flags.sql` — table with idempotent upsert index + RLS
