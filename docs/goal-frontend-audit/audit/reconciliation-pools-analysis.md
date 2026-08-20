# Frontend Audit — Reconciliation, Pools, Analysis

Scope: `frontend/src/pages/reconciliation/*`, `frontend/src/features/reconciliation/*`, `frontend/src/pages/pools/PoolsPage.tsx`, `frontend/src/features/pools/*`, `frontend/src/pages/analysis/*`, `frontend/src/features/analysis/*`.

Backend cross-checked against `backend/app/api/v1/reconciliation.py`, `backend/app/api/v1/analysis.py`, `backend/app/api/v1/export.py`.

---

## Finding 1 — Export History re-download calls a non-existent backend route (P1)

**File:** `frontend/src/features/reconciliation/components/ExportPanel.tsx:581`

```ts
window.open(`/api/v1/export/download/${item.id}`, '_blank')
```

**Backend reality:** No `GET /api/v1/export/download/{id}` route exists in `backend/app/api/v1/export.py`. The only download routes are `POST /api/v1/export/pdf/download`, `POST /api/v1/export/pdf/batch`, and `POST /api/v1/export/board/download`. Clicking "Re-download" on any export history item opens a browser tab that immediately 404s.

**Suggested fix:** Either add a `GET /api/v1/export/download/{id}` route that looks up the export record and streams the stored file, or store a signed download URL in the `export_history` row and use that URL directly.

---

## Finding 2 — Export Variance Excel calls a non-existent backend route (P1)

**File:** `frontend/src/api/hooks.ts:2776–2788` (`useExportVarianceExcel`)

The hook calls `fetchExportBlob('/export/variance/excel', request)` which resolves to `POST /api/v1/export/variance/excel`.

**Backend reality:** `backend/app/api/v1/export.py` defines only `POST /variance/pdf` (line 536). There is no `/variance/excel` route. Clicking "Export Excel" in the Variance tab of `ExportPanel` will always fail with a 404/405.

**Suggested fix:** Add a `POST /api/v1/export/variance/excel` endpoint to the backend export router, or remove the Excel button from the Variance tab UI until the backend route exists.

---

## Finding 3 — "Fix Mappings" navigation uses wrong URL format, tab does not activate (P1)

**File:** `frontend/src/pages/reconciliation/ReconciliationPage.tsx:290`

```ts
navigate(`/properties/${propertyId}?tab=pools`)
```

**Backend reality (frontend router):** `frontend/src/pages/properties/PropertyDetailPage.tsx:66–78` determines the active tab from `location.hash`, not a query param. The `tabFromHash` function parses `location.hash.replace(/^#/, '')` and checks it against a set of valid tab names (`'pools'`, etc.). Navigating to `?tab=pools` leaves the hash empty, so `tabFromHash` returns `'overview'`, and the Pools tab is not selected.

The `PoolsPage.tsx:77` itself correctly uses `href="/properties/${property.id}#pools"`.

**Suggested fix:** Change the `navigate` call to `navigate('/properties/${propertyId}#pools')` to match how `PropertyDetailPage` reads tab state.

---

## Finding 4 — `useLatestGLPeriod` is a permanent stub that always returns null (P2)

**File:** `frontend/src/pages/reconciliation/hooks/useLatestGLPeriod.ts:21–31`

The hook unconditionally returns `null` and uses `staleTime: Infinity` / `gcTime: Infinity`. The documented intent (infer year from GL data) is unimplemented. The `ReconciliationPage` then falls back to `new Date().getFullYear()`, so if a user navigates to the reconciliation page without a `?year=` query param, the year always defaults to the current calendar year regardless of actual data.

If a property only has reconciliation data for a prior year (e.g. 2023), the page shows an empty state claiming "no reconciliation snapshots" even though data exists — only becoming visible after the user manually adds `?year=2023`.

**Suggested fix:** Implement the hook to fetch the most recent finalized or draft snapshot for the property via `GET /api/v1/reconciliation/snapshots?property_id=...&size=1&sort_by=period_start_date&sort_order=desc` and extract the year from `period_start_date`.

---

## Finding 5 — Reconciliation grid silently truncates at 100 tenants — no pagination (P1)

**File:** `frontend/src/pages/reconciliation/hooks/useReconciliationData.ts:242–244`

```ts
size: 100, // Get all snapshots for the period
```

**Backend contract:** `backend/app/api/v1/reconciliation.py:839` — `size` has `le=100` (max 100 per page). For properties with more than 100 active leases, `useReconciliationData` silently stops after the first 100 snapshots. No pagination UI or warning exists. The `totalRecovery` aggregate and `tenantCount` will then be wrong (understated), and any tenant beyond the 100th will not appear in the grid, export list, or demand-letter panel.

**Suggested fix:** Add multi-page fetching (loop until `has_more` is false or total count is reached) in `useReconciliationData`, or add visible pagination controls and a "showing X of Y tenants" indicator.

---

## Finding 6 — `totalRecovery` summary and tenant pro-rata shares computed with JS float arithmetic (P2)

**File:** `frontend/src/pages/reconciliation/hooks/useReconciliationData.ts:257–258`

```ts
const total = tenantRows.reduce((sum, row) => {
  return sum + parseFloat(row.total_recovery || '0')
}, 0)
```

**File:** `frontend/src/pages/reconciliation/ReconciliationPage.tsx:424–432`

```ts
const grandTotal = tenantRows.reduce(
  (sum, r) => sum + Number(r.total_recovery),
  0
)
proRataShare: grandTotal > 0 ? Number(r.total_recovery) / grandTotal : 0,
```

**File:** `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx:269, 313–315`

```ts
const recovery = parseFloat(snapshot.total_recovery || '0')
// ...
const totalRecovery = snapshots.reduce(
  (sum, s) => sum + parseFloat(s.total_recovery || '0'),
  0
)
```

The backend stores and returns `total_recovery` as a Decimal-serialized string. All three locations convert it to a JS IEEE-754 float before summing. For large amounts (>$100k) with many tenants, float accumulation errors can produce visually incorrect totals in the header and the reconciliations list page. The displayed "YYYY Recovery" card total may differ from the authoritative backend sum.

**Suggested fix:** These values are display-only (the backend is authoritative for calculations), but to avoid user-visible rounding errors, convert strings to `BigInt` scaled integers or use a Decimal library for accumulation, or request a pre-aggregated total from the backend.

---

## Finding 7 — YearOverYear page converts backend Decimal strings to JS floats for display (P2)

**File:** `frontend/src/pages/analysis/YearOverYearPage.tsx:373–376, 403–404, 422–424`

```ts
formatAmount(pool.amounts[year] ? Number(pool.amounts[year]) : null)
formatVarianceAmount(pool.variance_amount ? Number(pool.variance_amount) : null)
formatAmount(comparisonData.total_amounts[year] ? Number(comparisonData.total_amounts[year]) : null)
```

**Backend contract:** `backend/app/models/historical_analysis.py:22, 28, 54` — `amounts`, `variance_amount`, and `total_amounts` are `Decimal`-typed and serialized as strings by Pydantic. The frontend `PoolComparison` type (`frontend/src/features/analysis/types/index.ts:9`) declares `amounts: Record<number, number | null>` which is incorrect — the actual JSON values are strings. `Number(someDecimalString)` introduces float imprecision for values with many decimal places.

The CSV export in `handleExportExcel` (line 135) uses `amount.toString()` — since `amount` is already coerced to a float at that point, the CSV may contain floats like `52000.0000000001` instead of clean `"52000.00"` strings.

**Suggested fix:** Fix the `PoolComparison.amounts` type to `Record<number, string | null>`, and format amounts directly from the string without converting through `Number`.

---

## Finding 8 — TrendAnalysisPage: anomaly detection API exists but is never called — hardcoded empty array (P2)

**File:** `frontend/src/pages/analysis/TrendAnalysisPage.tsx:142`

```ts
// For now, anomalies will be empty - can integrate anomaly detection API later
const anomalies: DetectedAnomaly[] = []
```

**Backend contract:** `backend/app/api/v1/analysis.py:120` defines `POST /api/v1/analysis/anomaly-detection` and `backend/app/services/analysis/anomaly_detection.py` has a full `AnomalyDetectionService`. The "Detected Anomalies" section, the chart anomaly markers, and the "Chart Legend" card are all rendered only if `anomalies.length > 0` — they will never appear. The Trend Analysis page is effectively half-finished.

**Suggested fix:** Call `POST /api/v1/analysis/anomaly-detection` with `property_id`, `target_year`, and `comparison_years` derived from the currently loaded `comparisonData`, populate `anomalies` from the response, and surface the results in the existing UI.

---

## Finding 9 — PoolsPage property card links use anchor hash but only show 6 properties (P2)

**File:** `frontend/src/pages/pools/PoolsPage.tsx:76–77`

```ts
{properties.slice(0, 6).map((property) => (
  <a href={`/properties/${property.id}#pools`} ...>
```

The list is silently truncated to the first 6 properties returned by the API. If an organization has more than 6 properties, the remaining ones are invisible on the Pools page with no "show more" control or indication that properties are hidden.

**Suggested fix:** Add a "View all" link or implement pagination/search for the property list. At minimum, add a count indicator showing "Showing 6 of N properties."

---

## Finding 10 — ExportPanel BatchTab progress bar is fake — always stays at 10% until success (P2)

**File:** `frontend/src/features/reconciliation/components/ExportPanel.tsx:256–268`

```ts
function startBatchExport() {
  setProgress(10)
  setIsComplete(false)
  batchMutation.mutate(...)
}
// onSuccess:
setProgress(100)
setIsComplete(true)
```

Progress immediately jumps from 0 to 10% on click, then stays at 10% until the entire batch is done, then jumps to 100%. There is no intermediate progress. For large batches (many tenants), users see a misleading static 10% bar for the full duration. The `Progress` component has a `data-testid="progress-bar"` implying it was meant to be real.

**Suggested fix:** Either remove the progress bar (replacing with just a spinner), or implement server-sent events / polling to get real batch progress from the backend.

---

## Finding 11 — ReconciliationGrid `onTrace` only fires for `tenant_summary` rows — pool rows silently do nothing (P2)

**File:** `frontend/src/pages/reconciliation/ReconciliationPage.tsx:358–375`

```ts
const handleTrace = useCallback((row: ReconciliationRow) => {
  if (row.type !== 'tenant_summary') return
  ...
}, [...])
```

Pool rows in the grid (`type === 'expense_pool'`) call `onTrace` but the handler immediately returns without action or feedback. A user clicking a trace icon on a pool row gets no response and no explanation. The pool-level trace data is embedded in the calculation_trace steps but there is no UI to surface it.

**Suggested fix:** Either disable the trace affordance on pool rows in the column definition, or implement pool-level trace aggregation and display.

---

## Finding 12 — `useLatestGLAnalysis` query key is wrong when disabled (P3)

**File:** `frontend/src/features/analysis/hooks/useGLAnalysis.ts:58`

```ts
queryKey: propertyId && periodYear
  ? GL_ANALYSIS_KEYS.latest(propertyId, periodYear)
  : ['gl-analysis', 'disabled'],
```

When `propertyId` or `periodYear` is undefined, the query still runs (returns `null` from `queryFn` guard), and uses the static key `['gl-analysis', 'disabled']`. Multiple components with different missing parameters will share this single stale cache entry. The `enabled: !!propertyId && !!periodYear` guard prevents actual fetching, but the inconsistent key is fragile.

**Suggested fix:** Use `enabled: false` to skip the query entirely when parameters are missing, and always use `GL_ANALYSIS_KEYS.latest(propertyId!, periodYear!)` (guarded by `enabled`).

---

## Finding 13 — ReconciliationsListPage accumulates financial totals with JS float arithmetic (P2)

(See also Finding 6.) Specifically in the summary stats card "YYYY Recovery":

**File:** `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx:313–315`

```ts
const totalRecovery = snapshots.reduce(
  (sum, s) => sum + parseFloat(s.total_recovery || '0'),
  0
)
```

This value is then formatted with `formatCurrency(stats.totalRecovery)` which uses `Intl.NumberFormat`. For large portfolios, float accumulation can produce values like `$1,234,567.9999999997` rounded to display as `$1,234,568.00`, which differs from the authoritative Decimal sum the backend would compute.

---

## Finding 14 — Pool copy endpoint URL has correct path but error handling swallows the actual error message (P3)

**File:** `frontend/src/features/pools/hooks/usePoolCopy.ts:22–27`

```ts
if (error) {
  throw new Error('Failed to copy pools')
}
```

The actual backend error detail (e.g., "Source property not found" or "access denied") is discarded. The dialog shows the generic message from `copyMutation.error?.message` which will always be "Failed to copy pools."

**Suggested fix:** Throw `ApiError.fromUnknown(error)` (as done in other hooks) so the specific backend message can propagate to the UI.

---

## Finding 15 — `useCalculationJobStatus` `refetchInterval` may continue polling after component unmounts (P3)

**File:** `frontend/src/api/hooks.ts:1209–1213`

```ts
refetchInterval: (query) => {
  const data = query.state.data
  if (!data) return false
  return status === 'pending' || status === 'running' ? 1000 : false
},
```

The `refetchInterval` captures `data.status` correctly. However, in `CalculateButton.tsx:80–88`, once a job is received, the local state `isCalculating` and the `jobId` state track the job. If the component unmounts while a job is running (e.g., user navigates away), the `useCalculationJobStatus` query continues to poll, and the `useEffect` at line 118 fires on re-mount with potentially stale data. The timeout cleanup at line 184–188 correctly handles the timeout but not the polling. This is low-risk but can cause console errors and wasted requests.

---

## Finding 16 — DenominatorChangePanel does not show empty state when no changes detected (P3)

**File:** `frontend/src/features/reconciliation/components/DenominatorChangePanel.tsx:115`

When `report.changes.length === 0`, the component correctly shows "No denominator changes detected between periods." However, when `reportMutation.data` is populated but the backend returns a 400 because there are no finalized snapshots for the prior period, the error UI (line 108–113) shows a generic "Failed to load report" with no guidance that the user needs a prior-year reconciliation.

---

## Summary

| # | Severity | File:Line | Summary |
|---|----------|-----------|---------|
| 1 | P1 | `ExportPanel.tsx:581` | Re-download link calls non-existent `GET /api/v1/export/download/{id}` — always 404s |
| 2 | P1 | `hooks.ts:2776` | `useExportVarianceExcel` calls non-existent `POST /api/v1/export/variance/excel` |
| 3 | P1 | `ReconciliationPage.tsx:290` | "Fix Mappings" navigates to `?tab=pools` but property page reads `#pools` hash — tab not activated |
| 4 | P2 | `useLatestGLPeriod.ts:21` | Hook is a permanent stub (always returns null); year defaults to current year regardless of actual data |
| 5 | P1 | `useReconciliationData.ts:244` | Hard-coded `size: 100` silently truncates grid for properties with >100 tenants; no pagination |
| 6 | P2 | `useReconciliationData.ts:257` / `ReconciliationPage.tsx:424` | `totalRecovery` and pro-rata shares computed with JS float arithmetic on Decimal strings |
| 7 | P2 | `YearOverYearPage.tsx:373` | Backend returns Decimal strings; frontend coerces to JS Number, producing float imprecision in display and CSV export |
| 8 | P2 | `TrendAnalysisPage.tsx:142` | Anomaly detection hardcoded to empty array; full backend anomaly service never called |
| 9 | P2 | `PoolsPage.tsx:76` | Property list silently truncated to 6 with no indicator or "show more" affordance |
| 10 | P2 | `ExportPanel.tsx:256` | Batch export progress bar stuck at 10% for entire duration — misleading fake progress |
| 11 | P2 | `ReconciliationPage.tsx:358` | `onTrace` on pool rows silently no-ops — no feedback or disabled state for user |
| 12 | P3 | `useGLAnalysis.ts:58` | Disabled query uses static `['gl-analysis', 'disabled']` key — multiple callers share stale entry |
| 13 | P2 | `ReconciliationsListPage.tsx:313` | Portfolio "Recovery" total accumulated with JS float arithmetic |
| 14 | P3 | `usePoolCopy.ts:26` | Pool copy error swallows backend detail message, shows only generic string |
| 15 | P3 | `hooks.ts:1209` | Job polling continues after navigation away; potential stale-closure issues on remount |
| 16 | P3 | `DenominatorChangePanel.tsx:108` | Generic error message when prior-year snapshots don't exist — no actionable guidance |
