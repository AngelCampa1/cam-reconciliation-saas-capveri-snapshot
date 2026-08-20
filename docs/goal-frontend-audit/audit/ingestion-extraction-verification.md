# Audit: Ingestion + Extraction + Verification + Rent-Roll

**Domain**: file import → extract → human verify → commit flow
**Auditor**: claude-sonnet-4-6
**Date**: 2026-05-28
**Files examined**: IngestionPage.tsx, ExtractionsPage.tsx, VerificationPage.tsx, NotificationPrompt.tsx, features/verification/*, RentRollUploadPage.tsx, RentRollUpload.tsx, RentRollPreview.tsx, useAutoSave.ts, api/hooks.ts (rent-roll + ingestion sections), backend/app/api/v1/ingestion.py, extraction.py, documents.py, rent_roll.py, backend/app/services/extraction/job_queue.py

---

## Finding 1 — Column mapping for generic GL files is collected but never sent to the backend

**Severity**: P0

**What's wrong**: When the backend detects `source_system === 'generic'` during upload, the frontend shows a column-mapping wizard (step `mapping`) where the user assigns their spreadsheet columns to CapVeri fields (account, description, date, debit). The user's mapping is validated locally (`missing.filter`) but when `handleContinue` fires it is **silently discarded** — the function immediately fetches the preview for the already-persisted batch and transitions to the success screen. The mapping is never POSTed anywhere.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:269-326` — `handleContinue` for `step.type === 'mapping'` validates `columnMappings` at line 272-277 then jumps straight to `authedFetch('/api/v1/ingestion/batches/${batchId}')` preview fetch at line 288. `columnMappings` state is never serialized into a request body.
- `frontend/src/pages/ingestion/IngestionPage.tsx:178-180` — `columnMappings` state is declared, mutated by the UI selects, but read only for validation.
- `backend/app/api/v1/ingestion.py:591-657` — The only way to save a mapping is `POST /api/v1/ingestion/mappings` (requires `account_code`, `amount`, `transaction_date` in `mapping_config`). This endpoint is never called from the frontend's mapping step.
- The upload endpoint (`POST /api/v1/ingestion/upload`) accepts `source_override` but no mapping config, so re-parsing with user corrections is also impossible without a separate save-then-reparse flow.

**Expected behavior**: After the user fills in the column mapping, the frontend should POST the mapping (either to `/api/v1/ingestion/mappings` or pass it back with a re-parse request) so that the generic file is actually re-parsed with the correct column assignments. Currently generic-format files may import with wrong column assignments and the user's mapping effort is wasted.

**Suggested fix**: After the mapping step, POST to `/api/v1/ingestion/mappings` with a `mapping_config` that at minimum contains `{ account_code: columnMappings.account, amount: columnMappings.debit, transaction_date: columnMappings.date, description: columnMappings.description }` and the resolved `source_system: 'generic'`. Ideally, trigger a re-parse/re-import of the already-uploaded batch with the saved mapping applied.

---

## Finding 2 — `parseMoney` and `balance` convert Decimal strings to JS `number` (float precision loss)

**Severity**: P1

**What's wrong**: The backend sends monetary values as Decimal strings (e.g., `"12345.67"`) in the GL preview response. The frontend converts them to native JS `number` via `Number(value)` / `Number(entry.balance)`. JS `number` is IEEE-754 double-precision float; amounts above ~$9 quadrillion lose precision, but more practically any rounding mode difference can silently corrupt the displayed value for large or long-decimal amounts. The audit rule explicitly flags this.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:142-146` — `parseMoney` calls `Number(value)` on the Decimal string.
- `frontend/src/pages/ingestion/IngestionPage.tsx:155-157` — `balance: Number(entry.balance)` does the same.
- `backend/app/api/v1/ingestion.py:74-88` — `_serialize_preview_entry` sets `"debit"`, `"credit"`, `"balance"` as `str(Decimal(...))` — correct backend contract.
- `frontend/src/components/ingestion/GLEntryPreview.tsx` (consumed by the preview) would receive float values; display rounding may differ from the backend's Decimal arithmetic.

**Expected behavior**: Monetary strings from the backend should remain as strings through the render path; convert to `Decimal` (e.g., via the `decimal.js` library) or display directly as strings without JS float conversion.

**Suggested fix**: Either render `entry.debit`, `entry.credit`, `entry.balance` as strings directly (no conversion), or introduce a `Decimal`-safe formatting helper that formats a string amount for display without first passing through `Number()`.

---

## Finding 3 — History tab silently swallows all errors; user sees stale/empty list with no feedback

**Severity**: P2

**What's wrong**: `handleHistoryTabActivated` (IngestionPage History tab) catches all errors and does nothing — the `catch` block is `/* ignore */`. If the fetch fails (network, 401 token expiry, server error) the history list simply stays empty with no message to the user.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:328-378` — line 375: `} catch { /* ignore */ }`.
- The `historyLoaded` flag is only set on success (line 374), so a failed fetch will be retried each time the tab is re-activated, but the user has no indication anything went wrong.
- There is no error state variable for the history tab; the only UI component rendered is `<ImportHistoryList imports={historyRecords} />` with whatever (potentially empty) `historyRecords` are available.

**Expected behavior**: A failed history fetch should display an error message or retry indicator inside the History card.

**Suggested fix**: Add an `historyError` state variable; set it on catch; render a `<FriendlyError>` or `<Alert variant="destructive">` inside the History `TabsContent` when set.

---

## Finding 4 — `useImportBatches` hook tries `imports` key first, but backend always returns `batches`

**Severity**: P2

**What's wrong**: `useImportBatches` in `hooks.ts` reads `data?.imports ?? data?.batches ?? []`. The backend `GET /api/v1/ingestion/batches` always returns `BatchListResponse(batches=...)` — a `{ batches: [...] }` shape. The `imports` key never exists in this response. The fallback works, but the primary key check adds unnecessary ambiguity and the TypeScript type assertion `as { imports?: ImportBatchSummary[] }` implies a contract that doesn't exist.

**Evidence**:
- `frontend/src/api/hooks.ts:1033-1038` — checks `.imports` first.
- `backend/app/api/v1/ingestion.py:337-361` — `list_import_batches` returns `BatchListResponse(batches=result.data)`.
- `backend/app/api/v1/ingestion.py:64-69` — `BatchListResponse` has only a `batches` field.

**Expected behavior**: The hook should read only `data?.batches`.

**Suggested fix**: Remove the `imports` fallback path; update the `ImportBatchSummary` field mapping to match the actual backend field names (`file_name`, not `filename`; `source_system`, not `parser_type`; `row_count`, not `rows_processed`). Note the IngestionPage's `handleHistoryTabActivated` already handles both aliases correctly via `b.filename ?? b.file_name`.

---

## Finding 5 — `ProcessButton` polling uses `DocumentStatus.COMPLETED` to detect job completion, but the backend job model uses `ExtractionJobStatus`; the `completed` string value happens to match so polling resolves correctly, but the logic conflates two separate enum types

**Severity**: P2

**What's wrong**: `ExtractionsPage.tsx` compares `data?.status === DocumentStatus.COMPLETED` (line 211) where `data` is an `ExtractionJob` whose `status` field is typed as `ExtractionJobStatus`. Both enums have `COMPLETED = 'completed'` so the comparison works at runtime, but the frontend uses the wrong enum, creating a hidden coupling that will break if either enum changes independently.

**Evidence**:
- `frontend/src/pages/extractions/ExtractionsPage.tsx:211` — `data?.status === DocumentStatus.COMPLETED`.
- `frontend/src/pages/extractions/ExtractionsPage.tsx:219` — `data?.status === DocumentStatus.FAILED`.
- `frontend/src/types/enums.ts:121-131` — `DocumentStatus` is the document/OCR pipeline status (pending/processing/ready_for_review/verified/rejected/failed/completed).
- `frontend/src/types/enums.ts:160-168` — `ExtractionJobStatus` is the job queue status (pending/processing/completed/failed/retrying).
- `backend/app/services/extraction/job_queue.py:26-53` — `ExtractionJob.status: ExtractionJobStatus`.

**Expected behavior**: The polling comparison should use `ExtractionJobStatus.COMPLETED` / `ExtractionJobStatus.FAILED`.

**Suggested fix**: Import `ExtractionJobStatus` in `ExtractionsPage.tsx` and replace the `DocumentStatus` references in the polling query function with `ExtractionJobStatus`.

---

## Finding 6 — `edit_history` entries stringify `null` values as the string `"null"` instead of `null`

**Severity**: P1

**What's wrong**: In `VerificationPage.tsx`, `handleFieldChange` builds an `EditAction` for the audit log. For the `old_value`, it calls `String(history.present[field] ?? null)`. When the field has no prior value, `history.present[field]` is `undefined`, `undefined ?? null` is `null`, and `String(null)` is `"null"` (a 4-character string). The backend's `EditAction` schema declares `old_value: str | None` — it expects Python `None` (serialized as JSON `null`) for missing values, but it gets the string `"null"`.

**Evidence**:
- `frontend/src/pages/extractions/VerificationPage.tsx:252-257`:
  ```ts
  const change = {
    field,
    old_value: String(history.present[field as keyof LeaseRecoveryProfile] ?? null),
    new_value: String(value ?? null),
    timestamp: new Date().toISOString(),
  }
  ```
- `backend/app/api/v1/schemas/extraction_schemas.py:24` — `old_value: str | None`.
- The approved extraction stores `edit_history` in the DB. Downstream audit queries checking `old_value IS NULL` will never match when the value is `"null"`.

**Expected behavior**: `old_value` and `new_value` should be `null` (JSON null) when the field has no value, not `"null"`.

**Suggested fix**:
```ts
old_value: history.present[field as keyof LeaseRecoveryProfile] != null
  ? String(history.present[field as keyof LeaseRecoveryProfile])
  : null,
new_value: value != null ? String(value) : null,
```

---

## Finding 7 — BoundingBoxOverlay uses hardcoded A4 page dimensions (595×842 at 72 DPI) regardless of actual PDF page size

**Severity**: P2

**What's wrong**: The `BoundingBoxOverlay` in `VerificationPage.tsx` is always instantiated with `pageWidth={595}` and `pageHeight={842}` (A4 at 72 DPI). US Letter leases (612×792) and legal-size documents (612×1008) will have all bounding boxes offset and scaled incorrectly, causing the highlights to point to the wrong regions of the displayed PDF.

**Evidence**:
- `frontend/src/pages/extractions/VerificationPage.tsx:547-548`:
  ```tsx
  pageWidth={595} // A4 width at 72 DPI
  pageHeight={842} // A4 height at 72 DPI
  ```
- The backend `ExtractionDetail` response does not expose page dimensions, so the frontend has no data to correct this even if it wanted to.

**Expected behavior**: Bounding boxes should use the actual page dimensions from the PDF metadata (either from the backend or from the PDF.js page object after the PDF is loaded in `PDFViewer`).

**Suggested fix**: Expose page width/height from the `PDFViewer` `onPageChange` callback (or a new `onPageDimensionsChange` callback) and pass those values to `BoundingBoxOverlay` instead of hardcoded A4 constants.

---

## Finding 8 — IngestionPage does not disable the FileUploader after a successful upload until the user clicks "Upload Another File" — duplicate uploads possible

**Severity**: P2

**What's wrong**: The `FileUploader` is only rendered when `step.type === 'idle' || step.type === 'error'` (line 449). However, the property selector is disabled during `uploading`, `success`, and `partial_errors` (line 432-434), but the `confirmed` step still shows the file uploader... wait, let me re-check.

Re-reading: `FileUploader` is inside `{(step.type === 'idle' || step.type === 'error') && ...}` at line 449, so it is correctly hidden during `confirmed`, `mapping`, `success`, and `partial_errors`. The property selector is only disabled during uploading/success/partial_errors — in the `confirmed` and `mapping` steps the property selector is still enabled. A user could change the property between upload and Continue, which would cause the batch to be attributed to the original property while the user sees confirmation for a different property's context. This is a minor state inconsistency.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:431-434` — `disabled={step.type === 'uploading' || step.type === 'success' || step.type === 'partial_errors'}` — does not disable during `confirmed` or `mapping`.
- `frontend/src/pages/ingestion/IngestionPage.tsx:244-265` — upload already happened before `confirmed`/`mapping`; the batch's `property_id` is locked at upload time.

**Expected behavior**: The property selector should also be disabled during the `confirmed` and `mapping` steps (the batch already exists for a specific property).

**Suggested fix**: Update the `disabled` condition to include `step.type === 'confirmed' || step.type === 'mapping'`.

---

## Finding 9 — History tab never refreshes after successful upload unless the user resets the page

**Severity**: P2

**What's wrong**: `historyLoaded` is set to `true` on first successful history fetch and never cleared until `handleReset` is called. After a successful upload, if the user switches to the History tab without resetting, they see the old list (which does not include the just-imported batch). `handleReset` does clear `historyLoaded`, but the user must explicitly click "Upload Another File" to trigger that path.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:329` — `if (historyLoaded) return`.
- `frontend/src/pages/ingestion/IngestionPage.tsx:383` — `setHistoryLoaded(false)` only in `handleReset`.
- After a successful upload the step transitions to `success` but `historyLoaded` is not reset; the user can click the History tab and see stale data.

**Expected behavior**: After a successful import (`step.type === 'success'` or `'partial_errors'`), `historyLoaded` should be reset so the next History tab activation fetches fresh data including the new batch.

**Suggested fix**: Call `setHistoryLoaded(false)` inside `handleContinue` after a successful import, or unconditionally inside the `onValueChange` handler of the Tabs component when the value is `'history'`.

---

## Finding 10 — `useAutoSave` does not handle network errors visibly; silent failures leave the user thinking draft is saved

**Severity**: P2

**What's wrong**: `useAutoSave` catches all save errors at the call site (`.catch(() => {})`) and logs them, but the hook returns only `{ isSaving, lastSaved }`. There is no `saveError` or `lastSaveError` state exposed. The `VerificationPage` header shows only `"Saving..."` or `"Draft saved at HH:MM:SS"` — if a save fails, `isSaving` goes back to `false`, `lastSaved` remains the previous value, and the user sees the old "saved at" timestamp. There is no indicator that the most recent save failed.

**Evidence**:
- `frontend/src/features/verification/hooks/useAutoSave.ts:154-156` — `.catch(() => { /* Error already logged in saveProfile */ })`.
- `frontend/src/features/verification/hooks/useAutoSave.ts:169-173` — returns `{ isSaving, lastSaved, manualSave }` — no error state.
- `frontend/src/pages/extractions/VerificationPage.tsx:462-470` — header renders `isSaving ? "Saving..." : lastSaved ? "Draft saved at..."` — no error branch.

**Expected behavior**: A save failure should surface to the user (e.g., a warning badge, toast, or "Last save failed" indicator).

**Suggested fix**: Add `saveError: Error | null` to `useAutoSave` return; set it on catch; show a warning in `VerificationPage` header when `saveError` is set.

---

## Finding 11 — Rent-roll import requires admin role but the frontend shows the import button to all authenticated users

**Severity**: P1

**What's wrong**: `POST /api/v1/rent-roll/import` requires `CurrentAdminUser` (line 162, `rent_roll.py`). The frontend `RentRollUpload.tsx` does not check the user's role before enabling the "Import Property" button. Non-admin users can upload, preview, and click Import; they will receive a 403 response which is rendered as a generic error state.

**Evidence**:
- `backend/app/api/v1/rent_roll.py:155-163` — `admin: CurrentAdminUser` dependency on the import endpoint.
- `frontend/src/components/rent-roll/RentRollUpload.tsx:56-70` — `useRentRollImport` with `onError` setting `step('error')` — no role check before mutation.
- `frontend/src/components/rent-roll/RentRollUpload.tsx:128-137` — Preview step renders `<RentRollPreview>` with `onConfirm={handleConfirmImport}` — the Confirm/Import button is not gated on admin role.

**Expected behavior**: The "Import Property" button should be disabled (with a tooltip) if the current user is not an admin, or the page should show an "Admin required" state before the upload step.

**Suggested fix**: Read the current user's role from auth context; if `role !== 'admin'`, disable the `<Button>` in `RentRollPreview` that calls `onConfirm`, and show a message explaining admin access is required.

---

## Finding 12 — `useRentRollPreview` does not pass auth token on the fetch (race condition possible)

**Severity**: P1

**What's wrong**: `useRentRollPreview` in `hooks.ts` awaits `getSession()` and inlines the token: `Authorization: Bearer ${(await getSession())?.access_token}`. If the session is expired and `getSession()` returns `null` or a null token, the fetch is sent without an `Authorization` header, producing a 401. The error is surfaced generically. More critically, the await inside `fetch` options is inside a template literal which evaluates before the fetch is made — so this is not actually a race, it correctly awaits. However, if the token is nullish, the Authorization header becomes `"Bearer undefined"` which the backend will reject with 401.

Actually re-reading: `${(await getSession())?.access_token}` — `(await getSession())` can be `null` when no session, then `null?.access_token` is `undefined`, and `\`Bearer ${undefined}\`` = `"Bearer undefined"`. This is sent to the backend which correctly rejects it, and the error is caught and rethrown as `ApiError`. Not a crash, but produces confusing "Failed to preview rent roll" errors on session expiry.

**Evidence**:
- `frontend/src/api/hooks.ts:2473-2479`:
  ```ts
  headers: {
    Authorization: `Bearer ${(await getSession())?.access_token}`,
  },
  ```
- Same pattern at `frontend/src/api/hooks.ts:2520-2523` for `useRentRollImport`.

**Expected behavior**: If `getSession()` returns null, the mutation should short-circuit with a "Session expired, please log in again" error rather than sending a malformed Authorization header.

**Suggested fix**: Assert session before fetch:
```ts
const session = await getSession()
if (!session?.access_token) throw new ApiError('Session expired', 401)
```

---

## Finding 13 — `mapPreviewEntry` uses local date construction `new Date(date + 'T00:00:00')` which is timezone-sensitive

**Severity**: P3

**What's wrong**: `IngestionPage.tsx` builds a JS `Date` object from a `YYYY-MM-DD` string by appending `T00:00:00` (no timezone offset). In browsers set to negative UTC offsets (US West Coast, UTC-8), `new Date('2024-01-15T00:00:00')` is parsed as local midnight which is 2024-01-15 08:00:00 UTC. Depending on how `GLEntryPreview` renders the date, it may display January 14 for transactions dated January 15 in non-US-East time zones.

**Evidence**:
- `frontend/src/pages/ingestion/IngestionPage.tsx:151`:
  ```ts
  date: new Date(`${entry.transaction_date}T00:00:00`)
  ```

**Expected behavior**: Use `new Date(entry.transaction_date + 'T00:00:00Z')` (UTC) or parse as a date-only value and format with a date-only formatter that does not apply timezone conversion.

---

## Summary Table

| # | Severity | File:Line | Summary |
|---|----------|-----------|---------|
| 1 | **P0** | `IngestionPage.tsx:269-326` | Column mappings for generic GL files are validated locally but never sent to the backend — mapping is always discarded |
| 2 | **P1** | `IngestionPage.tsx:142-157` | `parseMoney`/`balance` convert Decimal strings to JS float (`Number()`), risking float precision loss on financial values |
| 3 | **P1** | `VerificationPage.tsx:252-257` | `String(null)` produces `"null"` string in `edit_history`; backend expects JSON `null` for missing `old_value`/`new_value` |
| 4 | **P1** | `RentRollUpload.tsx:56-70`, `rent_roll.py:162` | Import endpoint requires admin role but frontend shows the Import button to all authenticated users; non-admins get a 403 with generic error |
| 5 | **P1** | `hooks.ts:2473-2479`, `hooks.ts:2520-2523` | `getSession()` can return null — both `useRentRollPreview` and `useRentRollImport` send `"Bearer undefined"` instead of short-circuiting |
| 6 | **P2** | `ExtractionsPage.tsx:211,219` | Polling uses `DocumentStatus.COMPLETED/FAILED` instead of `ExtractionJobStatus` — different enums with same values today but a latent coupling bug |
| 7 | **P2** | `IngestionPage.tsx:375` | History tab catch block silently ignores fetch errors — no error feedback to user |
| 8 | **P2** | `hooks.ts:1033-1038` | `useImportBatches` checks `imports` key first but backend always returns `batches` — dead code path |
| 9 | **P2** | `VerificationPage.tsx:547-548` | `BoundingBoxOverlay` hardcodes A4 page dimensions (595×842) — bounding boxes will be offset for US letter / legal PDFs |
| 10 | **P2** | `useAutoSave.ts:154-156`, `VerificationPage.tsx:462-470` | Draft save failures are silently swallowed — user sees stale "saved at" timestamp instead of an error |
| 11 | **P2** | `IngestionPage.tsx:431-434` | Property selector not disabled during `confirmed`/`mapping` steps — user can change property after upload, creating misleading UI state |
| 12 | **P2** | `IngestionPage.tsx:329`, `IngestionPage.tsx:383` | History tab does not refresh after a successful upload unless user clicks "Upload Another File" |
| 13 | **P3** | `IngestionPage.tsx:151` | `new Date(date + 'T00:00:00')` is timezone-sensitive — may display one day behind in UTC-negative time zones |
