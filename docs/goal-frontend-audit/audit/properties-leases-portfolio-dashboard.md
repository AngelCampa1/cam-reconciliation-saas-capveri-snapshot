# Frontend Audit: Properties / Leases / Portfolio / Dashboard

Auditor scope: `frontend/src/pages/properties/*`, `frontend/src/pages/leases/*`, `frontend/src/pages/portfolio/*`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/rent-roll/RentRollUploadPage.tsx`, related hooks and backend routes.

---

## Finding 1 — `PropertyCreate` rejects `tax_protest_county` / `tax_protest_deadline_override`

**Severity: P0**

**File/line:** `frontend/src/pages/properties/PropertyFormPage.tsx:253–261`

**What's wrong:** When creating a property (POST `/api/v1/properties`), the `onSubmit` handler spreads all form fields including `tax_protest_county` and `tax_protest_deadline_override` into the create payload. The backend `PropertyCreate` schema extends `PropertyBase`, and neither `PropertyBase` nor `PropertyCreate` defines those two fields — they only exist on `PropertyUpdate`. FastAPI/Pydantic v2 with `model_config` extra defaults to `'ignore'` for unknown fields, so the fields are silently dropped on create, but the schema coercion also means the form falsely suggests these fields were saved. Furthermore, Pydantic may raise a validation error if the model is configured with `extra='forbid'` (not verified here, but the architectural contract is violated).

**Evidence:**
- `backend/app/models/property.py:113` — `class PropertyCreate(PropertyBase): pass` — no tax protest fields
- `backend/app/models/property.py:198–206` — `tax_protest_county` and `tax_protest_deadline_override` exist only on `PropertyUpdate`
- `frontend/src/pages/properties/PropertyFormPage.tsx:253` — `const payload = { ...data, ... }` passes those fields on create

**Expected behavior:** Tax protest fields should be stripped from the create payload (they are update-only), OR `PropertyCreate` should be extended to include them.

**Suggested fix:** Strip those fields from the payload in create mode:
```ts
const { tax_protest_county, tax_protest_deadline_override, ...basePayload } = data
if (!isEditMode) {
  createMutation.mutate({ ...basePayload, target_occupancy: ..., ... })
}
```

---

## Finding 2 — `LeaseFormPage` default values reference `lease` before it loads (stale form initialization)

**Severity: P1**

**File/line:** `frontend/src/pages/leases/LeaseFormPage.tsx:110–147`

**What's wrong:** `useForm` is called with `defaultValues` that reference `lease` via optional chaining. In edit mode, `lease` is `undefined` at first render (async fetch pending). React Hook Form captures `defaultValues` once at initialization — after that, changes to the reference don't update the defaults. The `useEffect` at line 151 resets the form when `lease` arrives, which corrects most fields, BUT the initial render presents a form with all empty/null values. If the user types anything before the lease loads (unlikely but possible during slow connections), the `reset()` call will wipe their input without warning.

Additionally, the `zodResolver as any` cast at line 112 (suppressing the type error) masks that the schema may not be structurally compatible with the resolver.

**Evidence:**
- `frontend/src/pages/leases/LeaseFormPage.tsx:110–147` — `defaultValues` references `lease?.recovery_profile.pro_rata_share` etc. which is undefined on first render
- `frontend/src/pages/leases/LeaseFormPage.tsx:112` — `resolver: zodResolver(leaseFormSchema) as any`

**Expected behavior:** Initialize form with empty/null defaults for create mode and trigger a single load-then-reset for edit mode, which is the current pattern. However, the stale `defaultValues` reference means form initialization is not predictable on slow connections. The `as any` resolver cast should be fixed.

**Suggested fix:** Use a constant empty `defaultValues` object and rely solely on `useEffect` reset for edit mode population. Remove the `as any` cast and fix the schema type.

---

## Finding 3 — `pro_rata_share`, `cap_rate`, `admin_fee_percentage` submitted as JS `number` (float precision loss)

**Severity: P1**

**File/line:** `frontend/src/pages/leases/LeaseFormPage.tsx:198–226`

**What's wrong:** The form converts user-entered percentage strings to decimal floats using `parseFloat(data.recovery_profile.pro_rata_share) / 100`. This produces a JavaScript `number` (IEEE 754 float). The backend `LeaseRecoveryProfile` model defines these fields as `Decimal`. Pydantic v2 accepts a float and converts it, but this introduces floating-point precision errors. For example, "33.33%" → `parseFloat("33.33") / 100` = `0.33329999999999997...` rather than `Decimal("0.3333")`. This propagates into all downstream CAM calculations which must use precise decimal arithmetic.

**Evidence:**
- `frontend/src/pages/leases/LeaseFormPage.tsx:198` — `const proRataShare = parseFloat(data.recovery_profile.pro_rata_share) / 100`
- `frontend/src/pages/leases/LeaseFormPage.tsx:201` — `const adminFeePercentage = parseFloat(data.recovery_profile.admin_fee_percentage) / 100`
- `frontend/src/pages/leases/LeaseFormPage.tsx:222` — `cap_rate: parseFloat(data.recovery_profile.cap_rate) / 100`
- `backend/app/models/lease_recovery_profile.py:66,151` — `pro_rata_share: Decimal`

**Expected behavior:** Send decimal values as strings to preserve precision. E.g., `pro_rata_share: (parseFloat(pct) / 100).toFixed(10)` or use a string-safe decimal library.

**Suggested fix:** Convert to fixed-precision string: `String((parseFloat(data.recovery_profile.pro_rata_share) / 100).toFixed(10))` and send as string. Pydantic will parse a decimal string to `Decimal` without precision loss.

---

## Finding 4 — MSW mock handler uses non-existent `/gl-entries/upload` endpoint

**Severity: P1**

**File/line:** `frontend/src/mocks/handlers/gl-ingestion.ts:74–76`

**What's wrong:** The MSW test mock intercepts `POST */api/v1/properties/:propertyId/gl-entries/upload` and `GET */api/v1/properties/:propertyId/import-batches`. Neither of these endpoints exists in the backend. The real ingestion upload is at `POST /api/v1/ingestion/upload`, and import batches are at `GET /api/v1/ingestion/batches` (org-wide) or `GET /api/v1/properties/{property_id}/imports` (per-property). This means integration tests are testing against phantom URLs, so test passes provide false assurance that the GL upload workflow is wired correctly.

**Evidence:**
- `frontend/src/mocks/handlers/gl-ingestion.ts:74–76` — mock intercepts `/gl-entries/upload`
- `frontend/src/__tests__/integration/gl-ingestion-workflow.integration.test.tsx:52,75,95,108` — tests use the same phantom URL
- `backend/app/api/v1/ingestion.py:91` — actual upload route is `POST /api/v1/ingestion/upload`
- `backend/app/api/v1/properties.py:257` — per-property imports at `GET /api/v1/properties/{property_id}/imports`

**Expected behavior:** Mock handlers must match actual backend routes. Tests should use `POST */api/v1/ingestion/upload` and `GET */api/v1/properties/:propertyId/imports`.

---

## Finding 5 — `useImportBatches` response shape mismatch: backend returns `batches`, hook normalizes defensively

**Severity: P1**

**File/line:** `frontend/src/api/hooks.ts:1028–1038`

**What's wrong:** `listImportBatchesApiV1IngestionBatchesGet` calls `GET /api/v1/ingestion/batches`. The backend `BatchListResponse` at `backend/app/api/v1/ingestion.py:338` returns `{ "batches": [...] }`. The generated SDK type should reflect this, but the hook contains defensive normalization:

```ts
const imports = (data as { imports?: ImportBatchSummary[] } | undefined)?.imports
const batches = (data as { batches?: ImportBatchSummary[] } | undefined)?.batches
return { batches: (imports ?? batches ?? []) as ImportBatchSummary[] }
```

This suggests there was (or is) confusion about whether the field is `imports` or `batches`. The dual-key fallback masks any future shape change silently. If the SDK type generation is correct the explicit `as` casts are unnecessary; if the SDK type is wrong they mask a real mismatch. In either case the defensive normalization hides the actual contract.

**Evidence:**
- `frontend/src/api/hooks.ts:1028–1038` — dual `imports ?? batches` fallback
- `backend/app/api/v1/ingestion.py:66–68,361` — `BatchListResponse` has field `batches: list[dict]`

**Expected behavior:** The hook should simply use the generated typed accessor `data.batches` without dual-key fallback. The ambiguity should be resolved by ensuring the SDK type generation is re-run against the current backend OpenAPI spec.

---

## Finding 6 — Dashboard "Upload GL export" checklist item uses wrong completion condition

**Severity: P1**

**File/line:** `frontend/src/pages/DashboardPage.tsx:226–231`

**What's wrong:** The onboarding checklist item for "Upload GL export" is marked `completed` when `lease_count > 0 || pending_reconciliations > 0`. Having leases does not mean a GL export was uploaded — these are orthogonal actions. A user can create leases manually without ever uploading a GL file. The checklist will prematurely mark step 3 complete, hiding the prompt that drives the user toward the core workflow.

**Evidence:**
- `frontend/src/pages/DashboardPage.tsx:226–230` — completion depends on `dashboard?.lease_count` not on any GL import metric

**Expected behavior:** "Upload GL export" step should be `completed` when at least one import batch exists (from `/api/v1/ingestion/batches`). The dashboard summary could expose an `import_count` field, or a separate query could check.

---

## Finding 7 — `PropertyFormPage` `target_occupancy` edit round-trip loses precision via `Math.round`

**Severity: P2**

**File/line:** `frontend/src/pages/properties/PropertyFormPage.tsx:234–236`

**What's wrong:** When loading an existing property for edit, the stored `target_occupancy` (a Decimal like `"0.9500"`) is converted for display with `String(Math.round(parseFloat(property.target_occupancy) * 100))`. `Math.round` rounds to integer, so `0.9512` stored as the occupancy becomes `"95"` displayed and then re-submitted as `95 / 100 = 0.95` — silently changing the stored value. Additionally `Math.round(parseFloat("0.95") * 100)` is subject to float precision: `0.95 * 100 = 94.99999999999999` which rounds to `95`, fine here, but edge cases like `0.9549...` would round to `95` instead of `95.49`.

**Evidence:**
- `frontend/src/pages/properties/PropertyFormPage.tsx:235` — `String(Math.round(parseFloat(property.target_occupancy) * 100))`
- `backend/app/models/property.py:73` — `target_occupancy: Decimal` (0.0–1.0)

**Expected behavior:** Display with one or two decimal places to preserve the stored value. `(parseFloat(property.target_occupancy) * 100).toFixed(2)` then submit back as `String(parseFloat(displayValue) / 100)`.

---

## Finding 8 — `PropertyOverviewTab` uses JS float division for Load Factor (financial display)

**Severity: P2**

**File/line:** `frontend/src/pages/properties/PropertyOverviewTab.tsx:38–43`

**What's wrong:** `calculateLoadFactor` divides two `parseFloat` values and calls `.toFixed(4)`. While load factor is an informational ratio (not a payment amount), the pattern of using IEEE 754 float division on Decimal-sourced strings is inconsistent with the codebase's stated "use Decimal for money" rule. More critically, this function returns a string that is displayed directly but could mislead users comparing against certified BOMA area reports.

**Evidence:**
- `frontend/src/pages/properties/PropertyOverviewTab.tsx:38–43`

**Expected behavior:** This is lower severity since it's display-only, but should use fixed-precision string division or at least document the known imprecision.

---

## Finding 9 — `PortfolioPage` uses `parseFloat` on Decimal strings for asset value calculation

**Severity: P2**

**File/line:** `frontend/src/pages/portfolio/PortfolioPage.tsx:39–40, 397`

**What's wrong:** `formatUSD` converts `total_recoverable`, `total_billed`, `leakage` (all returned as strings from the backend Decimal fields) with `parseFloat`. These values are passed to `new Intl.NumberFormat(...).format(num)` — a float intermediate. For large dollar amounts (millions), IEEE 754 double precision (53 bits) is sufficient for display, but for amounts above ~$9 trillion precision is lost. More immediately, `parseFloat(data.total_recovery_all_years)` at line 397 is used to decide whether to show the NOI impact section — this is a boolean threshold check and fine, but `parseFloat` at line 397 is passed directly to `formatCurrencyCompact` which uses the float for display.

The NOI calculation at line 213: `const assetValueLift = capRate > 0 ? totalRecovery / capRate : 0` uses float division on a float-parsed Decimal value. For CRE assets this represents millions of dollars of "asset value lift" displayed to users making financial decisions.

**Evidence:**
- `frontend/src/pages/portfolio/PortfolioPage.tsx:39,395–397` — `parseFloat` on Decimal strings
- `frontend/src/pages/portfolio/PortfolioPage.tsx:213` — float division for asset value lift

**Expected behavior:** Flag per audit rules. Financial math on Decimal-sourced values should use string-based arithmetic or be done server-side. For NOI/asset value lift, consider moving the calculation to a backend endpoint.

---

## Finding 10 — `PortfolioPipelinePage` formats `campaign.total_recovery` as `Number()` (float)

**Severity: P2**

**File/line:** `frontend/src/pages/portfolio/PortfolioPipelinePage.tsx:275`

**What's wrong:** `formatCurrency(Number(campaign.total_recovery))` converts the backend `total_recovery: string` (Decimal) to a JS number. For large recovery totals this risks display rounding. The `formatCurrency` function itself uses `Intl.NumberFormat` with `minimumFractionDigits: 0` so cents are already dropped, but the `Number()` conversion introduces float imprecision before formatting.

**Evidence:**
- `frontend/src/pages/portfolio/PortfolioPipelinePage.tsx:275`
- `frontend/src/api/generated/types.gen.ts:3610` — `total_recovery: string`

**Expected behavior:** Parse via `parseFloat` (equivalent to `Number`) but make explicit it is display-only. More importantly, `formatCurrency` should document it accepts string Decimal inputs if it's used throughout the app.

---

## Finding 11 — `PropertyDetailPage` occupancy rate is calculated with integer division (unitCount-based)

**Severity: P2**

**File/line:** `frontend/src/pages/properties/PropertyDetailPage.tsx:220–221`

**What's wrong:** `const occupancyRate = unitCount > 0 ? Math.round((activeLeaseCount / unitCount) * 100) : 0`. This counts active leases vs total units — a proxy at best. One unit can have multiple historical leases; one lease can cover multiple units (multi-unit tenants). Also, `useLeases` is called with `limit: 1` to get the count, but the response's `count` field (from backend) reflects total matching records, not just the returned page. Fetching only 1 record with `limit: 1` to read `.count` is correct if the backend includes `count` regardless of pagination — the backend `LeaseListResponse` at `backend/app/schemas/lease.py:36` does include `count: int`, so this is fine. However `Math.round` on a ratio introduces rounding that may differ from the backend's authoritative occupancy calculation.

**Evidence:**
- `frontend/src/pages/properties/PropertyDetailPage.tsx:219–221`
- `backend/app/schemas/lease.py:36` — `count: int` included in list response

**Expected behavior:** Display occupancy rate only if the backend provides it (e.g., from the property record's `target_occupancy`), or clearly label the stat as "active leases / total units" to avoid confusion with the BOMA occupancy rate used in CAM calculations.

---

## Finding 12 — `LeaseDetailPage` document link is clickable but `href` is `undefined` while signed URL loads

**Severity: P2**

**File/line:** `frontend/src/pages/leases/LeaseDetailPage.tsx:500–510`

**What's wrong:** The `<a>` tag for viewing the lease document uses `href={signedDocumentUrl ?? undefined}`. When `signedDocumentUrl` is `null` (initial state while the async `createLeaseDocumentSignedUrl` call is in-flight), the link renders with `href={undefined}`, making it a no-op anchor. The `aria-disabled={!signedDocumentUrl}` attribute is set, but there is no visual disabled state — the link appears active and clickable before the URL is ready. If the user clicks immediately, nothing happens (no error, no feedback), which is confusing.

**Evidence:**
- `frontend/src/pages/leases/LeaseDetailPage.tsx:500–510`

**Expected behavior:** Show a loading spinner or disable/hide the link until `signedDocumentUrl` is set. At minimum, apply `pointer-events-none` CSS when `aria-disabled` is true.

---

## Finding 13 — `PropertyListPage` search is client-side only; pagination happens after filtering

**Severity: P2**

**File/line:** `frontend/src/pages/properties/PropertyListPage.tsx:67–83`

**What's wrong:** `useProperties({})` fetches with no `limit` override, so the API default of 20 records is returned. Search filtering at line 70–83 is applied client-side to the fetched page. If an org has more than 20 properties, search will only search within the first 20 returned, silently missing matches on subsequent pages. The comment at line 69 says "client-side for now" but this is never enforced to users.

**Evidence:**
- `frontend/src/pages/properties/PropertyListPage.tsx:67` — `useProperties({})` no limit override
- `backend/app/api/v1/properties.py:49–53` — default `limit=20` with `le=100`

**Expected behavior:** Either pass `limit: 100` (the max) to get all properties for a typical small org, or switch to server-side search by passing the `search` param to the backend. The current behavior silently truncates search results for orgs with >20 properties.

---

## Finding 14 — `DashboardPage` `WelcomeTourOverlay` shown to new users, but `isNewUser` evaluates to `false` before data loads

**Severity: P2**

**File/line:** `frontend/src/pages/DashboardPage.tsx:191, 424–430`

**What's wrong:** `const isNewUser = dashboard?.property_count === 0`. When `dashboard` is undefined (loading), `dashboard?.property_count === 0` evaluates to `false`, so `isNewUser` is `false` during loading. This means `WelcomeTourOverlay` is not rendered during loading. Once data loads and `property_count === 0`, `isNewUser` becomes `true`, and the overlay appears — which is fine. But if `showTour` was already set to `false` by localStorage before load completes, the overlay never shows even for a genuinely new user who somehow had their localStorage cleared. This is an edge case but means the tour gate depends on the storage state being set in a prior session, not the actual user state.

**Evidence:**
- `frontend/src/pages/DashboardPage.tsx:191` — `const isNewUser = dashboard?.property_count === 0`
- `frontend/src/pages/DashboardPage.tsx:424–430` — conditional on `isNewUser && showTour`

**Expected behavior:** The tour overlay logic is acceptable for the typical flow. The minor issue is that `isNewUser` could be initialized to the loading-safe `null` so that tour never fires while data is uncertain.

---

## Finding 15 — `LeaseUploadPage` silently swallows lease-fetch errors

**Severity: P2**

**File/line:** `frontend/src/pages/leases/LeaseUploadPage.tsx:140–157`

**What's wrong:** The `fetchLeases` function in the effect block has an empty `catch` block: `catch { setLeases([]) }`. If the leases fetch fails due to a network or auth error, the UI shows "No leases found for this property" instead of an error state. The user might incorrectly conclude there are no leases and upload without associating a lease, when in fact the fetch failed.

**Evidence:**
- `frontend/src/pages/leases/LeaseUploadPage.tsx:140–157`

**Expected behavior:** The comment says "Silently fail — lease selection is optional" but this conflates "the field is optional" with "errors are safe to ignore." A failed fetch should show a warning that lease association is unavailable, not that no leases exist.

---

## Finding 16 — `PropertyDetailPage` loading state waits on `unitsLoading` and `leasesLoading` even when those counts are supplementary

**Severity: P3**

**File/line:** `frontend/src/pages/properties/PropertyDetailPage.tsx:156`

**What's wrong:** `if (isLoading || unitsLoading || leasesLoading)` returns the full skeleton until all three queries complete. The main property data (`isLoading`) is the critical gate; unit and lease counts are supplementary for the stat cards. This means even if the property loads instantly, users see a full loading skeleton until the unit/lease count queries also resolve. For properties with many leases, this adds a visible delay.

**Evidence:**
- `frontend/src/pages/properties/PropertyDetailPage.tsx:156`

**Expected behavior:** Render the property header and tabs as soon as `property` is loaded. Show skeleton/`0` in stat cards while `unitsLoading` and `leasesLoading` are pending.

---

## Summary

| Severity | Count | Findings |
|---|---|---|
| P0 | 1 | tax_protest fields silently dropped on PropertyCreate |
| P1 | 4 | LeaseForm stale defaultValues; float precision on pro_rata_share; MSW mock phantom URLs; Dashboard GL checklist wrong completion logic |
| P2 | 9 | PropertyFormPage target_occupancy precision; LoadFactor float; Portfolio float math; Pipeline Number() cast; Occupancy rate calculation; Lease doc link UX; PropertyList client-side search pagination; Tour overlay loading edge case; LeaseUpload silent error |
| P3 | 1 | PropertyDetailPage triple-loading gate |
