# Calculation Engine
> Last updated: 2026-06-24 - Compare-systems match resolution: `/compare` now lets users choose the right lease for rows marked `needs_review`, reruns the comparison as a lease-scoped explicit charged set, and saves that corrected input as the audit run. Explicit `lease_id` values are accepted only when they belong to the selected property's loaded leases; stale or foreign IDs degrade to `needs_review` instead of `matched`. The lease picker pages through all leases, property changes clear hidden resolved charges, and tenant-name edits clear hidden lease bindings. No money math changed; values still come from backend Decimal strings.
> Last updated: 2026-06-24 - Compare-systems match review surface: the Cloudflare comparison result now includes `match_status` and `match_note` on each tenant variance. Real lease rows are `matched`; synthetic blank-name, unmatched-name, and duplicate-name billed rows are `needs_review` with a plain reason. Stored comparison findings derive the same status on read, and `/compare` shows a warning plus per-row "Needs match" badge before the user relies on the result. No money math changed; values still come from backend Decimal strings.
> Last updated: 2026-06-20 - Reconciliation grid money columns now sum (pristine-2026 C23). The reconciliation workspace grid (frontend/src/features/reconciliation/) showed three money columns that didn't visibly add up because col1 ("Tenant Billable") carried the all-in total_recovery. The columns are now Tenant Share (tenant_share_after_cap, the pre-fee share) + Admin Fee (admin_fee) = Final Amount (total_recovery, all-in), so each row reads as an honest sum. This required exposing the pre-fee tenant_share_after_cap on the snapshot summary read model end-to-end (backend/app/models/reconciliation_snapshot.py + list endpoint; cloudflare-backend select + repository type; frontend generated type, row schema, useReconciliationData transform, desktop columns, mobile ReconciliationCard). The "Tenant Billable" stat card and Grand Total keep summing total_recovery (all-in) and are unchanged. Display-only; no money math changed (money still rendered from backend Decimal strings).
> Last updated: 2026-06-16 - Analysis a11y/UX (pristine-UX marathon C76). The Trends LineChart (frontend/src/features/analysis/components/TrendChart.tsx) rendered as an opaque `svg role="application"` with no accessible name or data alternative, so its year/value data was invisible to screen readers; it is now wrapped in a `<figure>` with the SVG marked `aria-hidden` and the numbers exposed through a visually-hidden `<table>` (caption + per-year rows, $/% mode-aware). The Year-over-Year "Export Excel" button (frontend/src/pages/analysis/YearOverYearPage.tsx) actually emits a text/csv `.csv`, so it is relabeled "Export CSV"; the disabled-Compare tooltip wrapper span gains the focus-visible ring it was missing (matching ComparePage); and a mobile-only "Scroll sideways to see each year." hint sits above the wide results table. Frontend-only; no money math touched.
> Last updated: 2026-06-15 - GL Analysis panel header buttons now meet touch-target size (pristine-UX marathon Cycle 12). The amber "Advisory only" GL analysis banner on the reconciliation workflow (frontend/src/features/analysis/components/GLAnalysisPanel.tsx) had three header controls forced to `h-7` (28px tall): Re-run, Dismiss (X, icon-only), and Collapse/Expand (chevron, icon-only). Below the 40px touch floor on phones. Re-run is now `h-10`; the two icon-only buttons are 40×40 circular (`h-10 w-10 rounded-full`, matching the circular-icon-button canon). Live-verified 40×40 at 390px, toggle/dismiss still functional. Frontend-only.
> Last updated: 2026-06-25 - Portfolio mounted UI now labels statement issues as bill differences, bill check rate, and properties to check. The per-property amount is no longer styled as destructive leakage, and the NOI section labels finalized amounts as final tenant total.

> Last updated: 2026-06-15 - Portfolio "Property Breakdown" table is now responsive (pristine-UX marathon Cycle 10). On phones the per-property recoverable/billed/difference table (frontend/src/pages/portfolio/PortfolioPage.tsx, PropertyLeakageTable) overflowed the viewport and forced horizontal scrolling. Below the md breakpoint it now renders one stacked card per property (a 2-col definition list of Recoverable CAM, Billed, Bill difference, and the conditional Bill check rate) via the established useViewport `isMobile` pattern; the desktop table is unchanged. Money still comes from backend Decimal strings (no frontend money math). Frontend-only layout change.
> Last updated: 2026-06-14 - Disabled Compare/Run-comparison buttons explain themselves (F-446): the Year-over-Year "Compare" button (frontend/src/pages/analysis/YearOverYearPage.tsx) and the Compare-systems "Run comparison" button (frontend/src/pages/comparison/ComparePage.tsx) previously sat disabled with no hover affordance, leaving the user to guess what input was missing. Each disabled state now renders inside a focusable span + Radix Tooltip (pointer-events-none on the Button) that names the gap — "Select a property first, then pick 2-4 years to compare." / "Select a property first." / "Choose a start and end date (start before end) to run the comparison." — matching the disabled-button-explanation canon already on Trends and Expense Pools. Frontend-only; tests gain a TooltipProvider wrapper.
> Last updated: 2026-06-07 - YoY one-year-only pools render neutral, not green (F-269): on the Year-over-Year page, a pool present in only one of the compared years has no prior-year basis, so the backend returns variance_percent=null with variance_level "normal". The table previously tinted those rows the green "Normal (<5%)" color, making a brand-new or vanished expense pool look like a stable line. Frontend-only fix: when variance_percent is null/undefined, drop the green row background and render the variance cell in muted text (the N/A value already shows); added a fourth legend swatch "N/A (in one year only)". No backend/variance-level change. frontend/src/pages/analysis/YearOverYearPage.tsx.
> Last updated: 2026-06-02 - Compare UI review fixes (Module B "Compare"): signed money/percent helpers now mark sub-dollar/sub-1% positives with a leading "+", and ComparePage clears the shown result whenever any run input (period, source, include-drafts, manual charges) changes so a saved audit run always matches the inputs on screen.
> Last updated: 2026-06-02 - Compare UI (Module B "Compare"): new frontend /compare page (frontend/src/pages/comparison/ComparePage.tsx) and feature module (frontend/src/features/comparison/ + hand-authored frontend/src/api/comparison.ts) that runs a live bidirectional comparison, shows summary cards and an expandable per-tenant/per-pool variance table, saves results as audit runs, and lists prior runs. Money displayed from backend Decimal strings only (no frontend money math).
> Last updated: 2026-06-02 - Per-pool recovery split (Module A "Produce", B1.5b Slice 2c): backend/app/services/calculation/pool_allocation.py redistributes aggregate tenant-share scalars onto expense pools (cap attributed to controllable pools only, admin fee to fee-eligible pools, per-pool amounts reconcile exactly to total_recovery). Persisted on reconciliation_snapshots.pool_breakdowns (nullable JSONB) and surfaced on the snapshot read model + TenantReconciliation.
> Last updated: 2026-06-01 - Stored comparison runs (B1.6): comparison_runs + comparison_findings tables and persistence layer (backend/app/services/comparison/persistence.py) persist a comparison as an immutable point-in-time audit record; new POST/GET /api/v1/comparison/{propertyId}/runs and GET /api/v1/comparison/runs/{runId} endpoints alongside the existing derive-on-read comparison.
> Last updated: 2026-06-01 - New bidirectional Comparison module (backend/app/services/comparison/) and /api/v1/comparison endpoints: signed variance (OVERCHARGE/UNDERCHARGE/MATCH) of other-system charged vs CapVeri-correct, with default actual_billed and explicit charged-set sources. Separate from leakage; correctness-framed (B1.3/B1.4).
> Last updated: 2026-05-28 - Per-property leakage, tenant cap history, active lease, denominator-change, and pool auto-setup reads now page through Supabase result windows so high-volume reconciliation jobs do not drop rows after the first page.
> Last updated: 2026-05-28 - Leakage summaries, billed-amount retrieval, historical YoY pool extraction, and anomaly detection now use explicit paginated Supabase reads so large portfolios and high-volume GL years are not capped at the default page size.
> Last updated: 2026-05-13 - Leakage and billed-amount comparisons now require organization/property scope before service-role reads, use period-overlap matching for actual billed records, and clamp tenant-share admin-fee bases at zero when excluded credits exceed eligible pools.
> Last updated: 2026-02-27 — Add denominator change audit trail

## Overview

BOMA 2024 aligned financial calculation engine for CAM reconciliation. All math is deterministic
Python using `Decimal` — no AI/LLMs touch financial numbers. The orchestrator coordinates gross-up,
caps, tenant share, occupancy, pool aggregation, and leakage into a single `PropertyReconciliation`
result with a full `CalculationTrace` audit trail.

## Features

### Gross-Up Calculator
- Adjusts variable operating expenses to a target occupancy level (default 95%)
- Formula: `factor = target_occupancy / actual_occupancy`
- Factor is always >= 1.0 (never gross down), quantized to 4 decimal places (`ROUND_HALF_UP`)
- Optional safety valve via `max_factor` on `GrossUpConfig` to cap extreme values
- Zero occupancy returns `min_factor` (1.0) — never divides by zero
- Supports BOMA 2024 aligned gross-up review; orchestrated through `GrossUpInput` → `calculate_full_gross_up()`
- **Service**: `backend/app/services/calculation/gross_up.py`, `gross_up_orchestrator.py`

### Three Cap Types
- `NON_CUMULATIVE` — resets yearly; year 1 has no cap (no prior year baseline). Supports percentage rate or fixed dollar cap
- `CUMULATIVE` — unused capacity carries forward to future years
- `CUMULATIVE_COMPOUNDING` — base amount grows each year by the cap rate
- Returns `CapResult`: `original_amount`, `capped_amount`, `cap_applied`, `savings_from_cap`, `cap_headroom`
- **Service**: `backend/app/services/calculation/caps.py`

### Tenant Share Calculation
- Multi-step pipeline: exclude non-recoverable pools → apply base year / expense stop → apply pro-rata share → apply cap → add admin fee
- Admin fee supports: percentage (0-20%), dollar cap, pool exclusions (tax & insurance toggle, configurable pool list)
- `LeaseTerms` model validates `pro_rata_share` in range 0-1
- **Service**: `backend/app/services/calculation/tenant_share.py`

### Per-Pool Recovery Split (Module A "Produce")
- Redistributes the aggregate tenant-share scalars back onto the expense pools so each pool
  carries its own `PoolRecovery` (share before cap, cap adjustment, share after cap, admin fee,
  total). Layer-faithful: a cap reduction is attributed only to cap-eligible (controllable) pools
  — tax/insurance/capital are cap-exempt by default, overridable per lease via `cap_excluded_pools`;
  admin fee only to fee-eligible pools. Per-pool amounts reconcile **exactly** to `total_recovery`
  via largest-remainder rounding (deterministic Python, no LLM).
- Safe-withholding gate: when a cap reduced the share but pool classification is unavailable, the
  breakdown is deliberately withheld (empty) rather than guessing where the cap lands.
- Persisted on `reconciliation_snapshots.pool_breakdowns` (nullable JSONB; null = aggregate-only
  snapshot) and surfaced on the snapshot read model and `TenantReconciliation`.
- **Service**: `backend/app/services/calculation/pool_allocation.py`

### Occupancy Calculation
- Day-weighted per lease: `weighted_sqft = lease_sqft * (days_occupied / total_days)`
- Occupancy = `sum(weighted_sqft) / total_rentable_sqft`
- Handles partial-year tenants via date overlap with reconciliation period
- Input: `OccupancyInput` with period dates and rentable sqft; per-lease `LeaseOccupancy` structs
- **Service**: `backend/app/services/calculation/occupancy.py`

### Base Year / Expense Stop
- Expense stop: per-sqft threshold landlord absorbs. `threshold = tenant_sqft * stop_per_sqft`; tenant pays only amount above threshold
- Base year: freezes a reference year's expenses; tenant pays only the increase over base year amount
- Both return whether the stop/base year was applied and the amount above threshold
- **Services**: `backend/app/services/calculation/expense_stop.py`, `base_year.py`

### Pool Aggregation
- Groups GL entries into expense pools via account code pattern matching (wildcard `*` and `?`)
- Supports allocation percentages for split accounts (e.g., 60/40 split between two pools)
- Priority-based matching — higher priority patterns matched first
- Returns `PoolTotal` per pool: total amount, entry count, matched account codes
- **Service**: `backend/app/services/calculation/pool_aggregator.py`

### Leakage Detection
- Compares CapVeri-calculated statement amounts vs actual billed amounts.
- Positive variance = under-bill exposure; negative variance = over-bill exposure. Summary endpoints return both sides plus total absolute billing exposure.
- Returns `LeakageResult` with per-tenant `LeakageBreakdown` (calculated, billed, difference, percentage)
- Surfaced in onboarding flow, dashboard widgets, and upgrade modal
- **Endpoints**: `GET /api/v1/leakage/{propertyId}`, `GET /api/v1/leakage/summary`
- **Service**: `backend/app/services/calculation/leakage.py`

### Bidirectional Comparison (Produce vs Compare)
- Separate module from leakage: compares the "other system" charged amount against the
  CapVeri-correct amount and returns a signed, direction-aware result — `variance = actual_charged
  − capveri_correct` (`+` OVERCHARGE, `−` UNDERCHARGE, `|variance| ≤ tolerance` MATCH). Correctness
  (charge the right amount), not recovery, is the frame.
- Two charged-input sources: the default reads the same `actual_billed_amounts` snapshots as
  leakage; an explicit caller-supplied set (manual entry or parsed legacy reconciliation) never
  reads `actual_billed_amounts`. Both run through one combine/no-drop helper so duplicate tenant
  names collapse into a single combined finding (Σ siblings' correct vs the shared charge) and
  blank-name charges stay isolated — `total_capveri_correct` always equals Σ all leases' correct.
- Returns `ComparisonResult` with per-tenant `TenantVariance` (Decimal-as-string; `variance_pct`
  null when correct = 0). Org-scoped; `period_start >= period_end` → 400.
- Each tenant variance also carries `match_status` and `match_note`: direct lease rows are
  `matched`; blank-name, unmatched-name, duplicate-name, and explicit foreign-lease rows are
  `needs_review` so the UI can warn before the result is used.
- **Endpoints**: `GET /api/v1/comparison/{propertyId}` (default source),
  `POST /api/v1/comparison/{propertyId}` (explicit charged set)
- **Service**: `backend/app/services/comparison/engine.py`, `backend/app/services/comparison/models.py`

#### Stored Comparison Runs (immutable audit trail)
- A comparison can be persisted as a point-in-time audit record so CapVeri can defend "the
  right amount was charged on date X" even as underlying data later changes (the GET/POST
  endpoints above still recompute on read). Runs and findings are **immutable**: a correction
  is a new run, never an in-place edit (no UPDATE grant, no `updated_at`).
- Stores a `comparison_runs` header (period, tolerance, source, signed aggregate totals,
  counts, `created_by`) plus one `comparison_findings` row per tenant variance. Synthetic
  non-lease keys (`ambiguous-name::`/`unmatched-name::`/`unmatched-lease::`/`id::`/`explicit::`) persist verbatim to keep the no-drop invariant;
  per-pool `pool_breakdowns` stored as nullable JSONB (null until B1.5b feeds real per-pool data).
- Org-scoped via explicit `organization_id` filters plus RLS; findings returned sorted by
  absolute variance, largest first.
- **Endpoints**: `POST /api/v1/comparison/{propertyId}/runs` (persist a run),
  `GET /api/v1/comparison/{propertyId}/runs` (list, newest first),
  `GET /api/v1/comparison/runs/{runId}` (one run + findings)
- **Service**: `backend/app/services/comparison/persistence.py`
- **Tables**: `comparison_runs`, `comparison_findings`

#### Compare UI (frontend `/compare`)
- User-facing surface for Module B. A property + period selector runs a live comparison and
  shows summary cards (net difference, over/under totals and counts, match count) plus a
  per-tenant table with signed difference, direction badge, percent, and expandable per-pool
  breakdown rows. A "Save this comparison" action persists the current result as an audit run,
  and a saved-runs table lists prior runs for the property.
- Rows with `match_status="needs_review"` show a per-row "Needs match" badge and the page
  warns how many rows need matching before the user relies on the result. The warning panel
  lets the user pick a lease for each review row, reruns the comparison with lease-scoped
  explicit charges, and switches the saved input to that corrected explicit charged set.
- Two charged-input sources match the backend: "saved records" (default `actual_billed`) and
  "typed in" (an explicit manual charge set via the charges editor).
- Money is rendered from the backend's exact Decimal strings only; the frontend performs no
  money math (`formatMoney`/`signedMoney` display helpers). The signed-display helpers mark a
  value positive when it has any non-zero digit and is not negative, so sub-dollar overcharges
  (e.g. `+$0.50`, `+0.5%`) still read with a leading `+`.
- Editing any run input (property, period start/end, source, include-drafts, manual charges)
  clears the shown result, so a saved audit run always matches the inputs on screen. Property
  changes also clear resolved explicit charges, and tenant-name edits clear hidden lease
  bindings before the next run or save.
- **Page/route**: `frontend/src/pages/comparison/ComparePage.tsx`, route `/compare` (App.tsx),
  nav entry under Analysis.
- **Client/hooks/components**: hand-authored `frontend/src/api/comparison.ts` (legacy hey-api
  call convention), `frontend/src/features/comparison/` (hooks `useComparison.ts`, display
  helpers `utils/variance.ts`, components `ComparisonSummary`, `TenantVarianceTable`,
  `ExplicitChargesEditor`).

### NOI Impact
- Translates CAM recovery into asset valuation lift: `asset_value_lift = recovery_amount / cap_rate`
- Example: $25K recovery at 7% cap = $357K asset value increase
- All Decimal math, no floats
- **Service**: `backend/app/services/calculation/noi_impact.py`

### HCAD Tax Normalization
- Texas property tax tool for Harris County ARB retroactive assessment corrections
- Adjusts base year after Section 25.25 protest wins: `adjusted_base = original_base - retroactive_adjustment`
- Calculates recovery delta (always >= 0) with optional non-cumulative percentage cap
- **Service**: `backend/app/services/calculation/hcad_tax_normalizer.py`

### Anomaly Detection
- Variance-based detection (10-20% = WARNING, >20% = CRITICAL)
- MAD cross-pool statistical outlier detection
- AR(1) ARIMA trend analysis via statsmodels
- Anomaly types: SPIKE, DROP, NEW_CATEGORY, MISSING_CATEGORY, PATTERN_BREAK, OUTLIER
- Severity levels: INFO, WARNING, CRITICAL
- **Service**: `backend/app/services/analysis/anomaly_detection.py`

### Denominator Change Audit Trail
- Compares finalized reconciliation snapshots between periods to detect denominator shifts
- Detects: RSF re-measurement, tenant added/removed, self-maintenance start/stop, exclusion changes, BOMA standard changes, share recalculations
- Per-tenant impact analysis: prior share, current share, delta in percentage points, dollar impact on estimated recovery
- Deterministic template summary (no LLM)
- PDF report via ReportLab with executive summary, changes table, and per-tenant impact table
- DENOMINATOR_SHIFT anomaly type integrated into existing anomaly detection service
- Frontend: collapsible DenominatorChangePanel on reconciliation page with summary stats, changes list, tenant impact table, PDF export
- **Models**: `backend/app/models/denominator_change.py`
- **Service**: `backend/app/services/analysis/denominator_change.py`
- **PDF**: `backend/app/services/reports/denominator_change_report.py`
- **Endpoints**: `POST /api/v1/analysis/denominator-change`, `POST /api/v1/reports/denominator-change/pdf`
- **Frontend**: `frontend/src/features/reconciliation/components/DenominatorChangePanel.tsx`

### Historical Analysis
- Year-over-year pool comparison (2-4 year lookback)
- Variance levels: NORMAL (<5%), WARNING (5-15%), CRITICAL (>15%)
- Fuzzy pool name matching for renamed pools via `PoolMatcher`
- **Service**: `backend/app/services/analysis/historical_analysis.py`, `pool_matching.py`

### Calculation Orchestrator
- Coordinates all calculations for a property/period into `PropertyReconciliation`
- Input: `ReconciliationInput` (property_id, period dates, total_rentable_sqft, target_occupancy, BOMA version)
- Output: per-tenant `TenantReconciliation` results + `CalculationTrace` with every step recorded
- Fetches cap histories, applies expense stops, gross-up, and tenant share in sequence
- Records engine version (git SHA) in trace for reproducibility
- **Service**: `backend/app/services/calculation/orchestrator.py`

## Database Tables

- **reconciliation_snapshots** — `calculation_trace` JSONB (full step-by-step audit), `status` enum (draft/finalized), `lease_terms_snapshot` JSONB, `pool_breakdowns` nullable JSONB (per-pool recovery split; null = aggregate-only), `term_version_id`, engine version
- **calculation_jobs** — `status` enum (pending/running/completed/failed), progress tracking, property_id, period

## Key Files

- `backend/app/services/calculation/gross_up.py` — Gross-up factor calculation
- `backend/app/services/calculation/gross_up_orchestrator.py` — Full gross-up pipeline
- `backend/app/services/calculation/caps.py` — Three cap type implementations
- `backend/app/services/calculation/tenant_share.py` — Multi-step tenant share pipeline
- `backend/app/services/calculation/occupancy.py` — Day-weighted occupancy
- `backend/app/services/calculation/expense_stop.py` — Per-sqft expense stop
- `backend/app/services/calculation/base_year.py` — Base year freeze logic
- `backend/app/services/calculation/pool_aggregator.py` — GL-to-pool pattern matching
- `backend/app/services/calculation/pool_allocation.py` — Layer-faithful per-pool recovery split (Module A "Produce")
- `backend/app/services/calculation/leakage.py` — Calculated vs billed comparison
- `backend/app/services/calculation/noi_impact.py` — Asset valuation lift
- `backend/app/services/calculation/hcad_tax_normalizer.py` — Texas tax normalization
- `backend/app/services/calculation/orchestrator.py` — Reconciliation coordinator
- `backend/app/services/calculation/models.py` — CalculationTrace, CalculationStep models
- `backend/app/models/denominator_change.py` — Denominator change domain models
- `backend/app/services/analysis/denominator_change.py` — Denominator change detection service
- `backend/app/services/reports/denominator_change_report.py` — Denominator change PDF generator
- `backend/app/services/analysis/anomaly_detection.py` — Multi-algorithm anomaly detection
- `backend/app/services/analysis/historical_analysis.py` — YoY comparison
- `backend/app/services/analysis/pool_matching.py` — Fuzzy pool name matcher
- `backend/app/api/v1/leakage.py` — Leakage REST endpoints
- `backend/app/api/v1/reconciliation.py` — Reconciliation endpoints
- `backend/app/api/v1/analysis.py` — Analysis endpoints
