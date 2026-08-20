# Data Ingestion

> Last updated: 2026-06-25 - In first-run onboarding, a successful tenant-list/rent-roll import now marks tenants as present and skips the redundant tenant step because the import already created property, unit, and lease records.
> Last updated: 2026-06-25 - Actual billed upload matching now strips common trailing legal suffixes such as LLC, Inc., Corp., LP, and LLP when matching billed tenant names to active leases, while duplicate and conflicting matches still stay unresolved for review.
> Last updated: 2026-06-25 - Actual billed skipped-row warnings now include an onboarding fallback to start from the uploaded total and type the right billed total before running reconciliation.
> Last updated: 2026-06-25 - Actual billed import now returns row-number warnings for skipped billed rows with blank, non-numeric, zero, or negative amounts; onboarding shows those warnings after upload so users know some rows need review.
> Last updated: 2026-06-25 - Actual billed upload now accepts `.xlsx` spreadsheets as well as CSV: the Worker reads the first populated worksheet with ExcelJS, converts it to the same row shape as CSV, and reuses the deterministic billing parser.
> Last updated: 2026-06-25 - Actual billed CSV import now accepts common billed-amount headings such as `Annual CAM`, `Amount Charged`, `CAM Billed`, and tenant charge labels; the onboarding upload summary also labels `csv_import` as "your spreadsheet" instead of showing the raw enum.
> Last updated: 2026-06-15 - Error-state copy clarity (pristine-ux C15): the GL import page (`IngestionPage`) no longer forwards the API response `detail` string to retry/delete toasts (it could expose backend exception text); both now show static plain copy ("Could not retry/delete this import. Please try again.") with the detail logged to console only. The extraction start error (`ExtractionsPage`) drops the raw `error.message` for "We couldn't start the extraction. Try again, or reload the page." Also: the import preview "Continue" button shows a Loader2 spinner while loading (pristine-ux C14).
> Last updated: 2026-06-08 - (F-278) The GL import page's Upload/History tabs are now URL-driven via a `?tab=` query param: the active tab reads from the param (`?tab=history` -> History, anything else -> Upload), and switching tabs pushes a new history entry so the History tab is deep-linkable/shareable and the browser back/forward buttons walk between Upload and History. A direct deep link or page refresh on `?tab=history` loads the import history on mount (the Tabs `onValueChange` handler only fires on user clicks), guarded by the existing `historyLoaded` flag so it stays idempotent.
> Last updated: 2026-06-07 - (F-240) The format-detection (confirmed-step) banner no longer presents a low-confidence guess as a confident match. When `0 < confidence < 0.5`, the banner switches from the green success style (CheckCircle icon, "X detected") to a cautious amber/warning style (AlertCircle icon) and reframes the headline as "Our best guess: X" (source name still capitalized), keeping the existing "A low score means we weren't sure..." note and the percentage. High-confidence detections (>= 0.5) are unchanged: green "X detected" with no note.
> Last updated: 2026-06-07 - Two P3 GL-import polish fixes. (F-237) The format-detection (confirmed-step) banner now adds a short plain-language note when detection confidence is low (`0 < confidence < 0.5`): "A low score means we weren't sure. Open your file and check it matches before you go on." High-confidence detections show only the percentage. (F-238) Import History filenames are now openable: clicking a filename (or the row's view-details control) calls `onViewDetails`, which fetches `GET /api/v1/ingestion/batches/{id}`, maps `preview_entries`, and opens a dialog rendering the `GLEntryPreview` for that import, with loading spinner, an error message ("We could not open this import. Please try again."), and an empty state.
> Last updated: 2026-06-01 - Actual billed amounts now carry an OPTIONAL `pool_id` (nullable FK to `expense_pools`, ON DELETE SET NULL; NULL = tenant-level total not attributed to one pool). Manual entry accepts and returns `pool_id`, verifying the pool belongs to the target property before the service-role insert; the column has no uniqueness constraint so duplicate (property, period, pool) rows still sum on read. Storage groundwork only — the comparison engine does not yet consume per-pool billed amounts (B1.5b Slice 1).
> Last updated: 2026-06-01 - GL import now emits privacy-safe PostHog funnel and failure events for upload start, source detection, generic mapping required/submitted, completion, upload/mapping failures, preview-load failures, history load/failure, and failed-import retry clicks. Payloads use batch IDs, parser/source enums, controlled failure stages, and file/count/confidence/status buckets instead of filenames, column names, row contents, mappings, or raw backend error text.
> Last updated: 2026-05-29 - Import History tab now shows a loading spinner while fetching and a destructive error alert with a Retry button when `GET /api/v1/ingestion/batches` fails (previously failures were swallowed silently, leaving an empty list). The property selector is also locked for every wizard step except idle/error, so a target property can no longer be swapped mid-flow (during mapping/confirmed) and silently imported against the wrong property (F-046/F-049).
> Last updated: 2026-05-29 - Generic GL uploads now defer persistence: the file is parsed for column detection but left as a `pending` batch with nothing written, and the frontend mapping wizard re-submits the file + chosen column mapping to `POST /api/v1/ingestion/batches/{batch_id}/apply-mapping`, which verifies the file hash matches the original upload, re-parses with the mapping applied, persists the GL entries, and marks the batch completed. Previously the mapping was validated client-side but never sent, so generic files were persisted with mis-detected columns.
> Last updated: 2026-05-22 - GL upload now verifies the submitted property belongs to the current organization before duplicate checks, parser dispatch, batch creation, or service-role persistence.
> Last updated: 2026-05-13 - Frontend import history now accepts generated API response names (`imports`, `filename`, `parser_type`, `rows_processed`) with legacy fallbacks for older batch-shaped responses.
> Last updated: 2026-04-22 - Batch details now return bounded `preview_entries`, and the ingestion success flow loads real GL preview rows after import instead of rendering an empty preview on successful uploads
> Last updated: 2026-02-26 - Property recent imports now use property-scoped imports with normalized filename/rows/source metadata, and Documents includes a dedicated rent roll upload entrypoint (`/rent-roll/upload`)

## Overview

CSV/Excel import pipeline for GL data, rent rolls, and actual billed amounts from any ERP system.
Implements the Anti-Integration architecture — file exports only, no API connections to Yardi, MRI,
or RealPage. Uses the Strategy Pattern for parser selection with confidence-scored auto-detection.

## Features

### GL Import

- Upload CSV or Excel files (max 50MB) containing general ledger entries
- Auto-detects source system (Yardi, MRI, or Generic) by analyzing column headers
- Returns a batch ID immediately; processing status available via polling
- Raw row data preserved as JSONB on each `gl_entries` record for audit trail
- Verifies the target property belongs to the current organization before any batch or GL-entry writes are attempted
- **Endpoint**: `POST /api/v1/ingestion/upload`
- **Service**: `backend/app/services/ingestion/`

### Generic GL Column Mapping (deferred persistence)

- When auto-detection resolves to the **Generic** parser, the upload runs Phase 1 only: columns are detected and returned, the batch is created as `pending`, and **no GL entries are persisted**
- The frontend mapping wizard lets the user map detected columns to standard fields (`account_code`, `account_description`, `transaction_date`, `amount`) and re-submits the original file together with the mapping
- The apply-mapping endpoint verifies the resubmitted file's SHA-256 matches the original upload (`file_hash`), confirms the batch is generic + still `pending`, re-parses Phase 2 with the mapping applied, persists the GL entries, and marks the batch `completed`
- `column_mapping` is only ever passed to the Generic parser; Yardi/MRI parsers are unaffected
- Reuses the existing `pending` batch status (no schema migration)
- **Endpoint**: `POST /api/v1/ingestion/batches/{batch_id}/apply-mapping` (org-scoped, editor-gated)

### Parser Strategy Pattern

- Abstract `IngestionStrategy` base class defines the interface: `source_system`, `can_handle()`, `parse()`
- `can_handle()` returns a confidence score (0.0-1.0) based on column header analysis
- `IngestionDispatcher` maintains a parser registry; routes each file to the highest-confidence parser
- Adding a new ERP format requires only a new subclass — no existing code changes (Open/Closed Principle)
- **Parsers**: `parsers/yardi.py`, `parsers/mri.py`, `parsers/generic.py`
- **Dispatcher**: `backend/app/services/ingestion/dispatcher.py`
- **Base class**: `backend/app/services/ingestion/base.py`

### Rent Roll Import

- Specialized parsers for Yardi, MRI, and Generic rent roll formats
- Preview mode: parse and display without committing to database
- Auto-creates Property, Unit, and Lease records from rent roll data
- In first-run onboarding, a successful tenant-list import advances straight to GL cost upload because the tenant records already exist
- **Parsers**: `parsers/yardi_rent_roll.py`, `parsers/mri_rent_roll.py`, `parsers/generic_rent_roll.py`
- **Endpoint**: related to `/api/v1/rent-roll/`

### Actual Billed Import

- Upload what tenants were actually billed for over/under-bill comparison against calculated amounts
- Supports CSV upload, XLSX upload, and manual entry modes
- CSV upload accepts common tenant/name columns and billed-amount headings such as `Billed Amount`, `Amount Charged`, `Annual CAM`, and `CAM Billed`
- XLSX upload reads the first populated worksheet and applies the same parser rules as CSV
- Import results include row-number warnings for skipped billed rows with blank, non-numeric, zero, or negative amounts; onboarding lets users start from the uploaded total and type the right total when those skipped rows change what was charged
- Uploaded billed rows match active leases by normalized tenant name, suite/unit, or both; common trailing legal suffixes are ignored for tenant-name matching, and ambiguous matches remain unresolved for review
- Onboarding source labels hide raw import enums, so `csv_import` appears as "your spreadsheet"
- Manual entry optionally tags a billed amount with an expense `pool_id` (verified against the property); omitting it stores a tenant-level total (`pool_id` NULL). Per-pool billed amounts are stored but not yet read by the comparison engine
- **Parser**: `parsers/billing.py`
- **Endpoints**: `POST /api/v1/actual-billed/upload`, `POST /api/v1/actual-billed/manual`

### File Fingerprinting

- SHA256 hash computed on upload to prevent duplicate imports
- UNIQUE constraint on `(org_id, file_hash)` in the `import_batches` table
- Duplicate upload returns an error with reference to the existing batch
- **Service**: `backend/app/services/ingestion/fingerprint.py`

### Batch Management

- Status workflow: `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`
- Tracks row count, error count, and error log (JSONB array of per-row issues)
- Batches are scoped to a single property and organization
- Batch details now expose a bounded `preview_entries` payload sourced from `gl_entries`, filtered by `import_batch_id` and ordered by `transaction_date`, `account_code`, then `id` for a stable first-page preview
- **Service**: `backend/app/services/ingestion/batch.py`

### Data Validation

- Pre-import checks: date range validity, required column presence, amount parsing
- Post-import quality checks: duplicate entry detection, outlier amounts
- Validation errors recorded in batch error log without aborting the entire import
- **Services**: `backend/app/services/ingestion/validation.py`, `quality_checks.py`

### Data Cleaning

- Whitespace trimming on all string fields
- Account code standardization (consistent formatting)
- Date parsing across multiple formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
- **Service**: `backend/app/services/ingestion/cleaners.py`

### Column Mapping (Generic Parser)

- UI wizard for mapping arbitrary CSV columns to GL fields (account, description, date, amount)
- Saved per-organization for reuse on subsequent imports from the same source
- Stored in the `column_mappings` table with org scope
- **Frontend**: Column mapping wizard in the ingestion page

## Frontend

- **Ingestion page** (`/ingestion`): Property selector → file upload dropzone → source system detection result → column mapping wizard (generic parser) → success/error report
- After a confirmed GL import, the frontend fetches batch details and renders real preview rows from `preview_entries`; if that follow-up request fails, the success state shows a dedicated preview-load error instead of the misleading empty-table "no entries" state
- **Rent roll upload page** (`/rent-roll/upload`): Dedicated file-upload page in Documents navigation for creating property, units, and leases from a rent roll file
- **Import history tab**: Filter by property, view batch details, download original file, delete batches
- **Property detail imports** (/properties/{id}): Uses GET /api/v1/properties/{property_id}/imports so recent import rows show file name, source system, and row counts consistently.

## Database Tables

- **import_batches** — `org_id`, `property_id`, `file_hash` (SHA256, UNIQUE per org), `source_system` enum (yardi/mri/generic), `status` enum (pending/processing/completed/failed), `row_count`, `error_count`, `error_log` JSONB
- **gl_entries** — Immutable: INSERT and CASCADE DELETE only, no UPDATE. `raw_row_data` JSONB preserves original parsed row. Linked to `import_batch_id` and `property_id`
- **column_mappings** — `org_id`, mapping configuration JSONB, source identifier for reuse

## Key Files

- `backend/app/services/ingestion/base.py` — `IngestionStrategy` abstract base class
- `backend/app/services/ingestion/dispatcher.py` — `IngestionDispatcher` (Strategy Pattern context)
- `backend/app/services/ingestion/fingerprint.py` — SHA256 file hashing
- `backend/app/services/ingestion/batch.py` — Batch lifecycle management
- `backend/app/services/ingestion/validation.py` — Pre-import validation
- `backend/app/services/ingestion/quality_checks.py` — Post-import quality checks
- `backend/app/services/ingestion/cleaners.py` — Data cleaning transforms
- `backend/app/services/ingestion/schemas.py` — `ParseResult` and related DTOs
- `backend/app/services/ingestion/persistence.py` — Database persistence layer
- `backend/app/services/ingestion/parsers/yardi.py` — Yardi Voyager GL parser
- `backend/app/services/ingestion/parsers/mri.py` — MRI Commercial GL parser
- `backend/app/services/ingestion/parsers/generic.py` — Generic GL parser (column inference)
- `backend/app/services/ingestion/parsers/yardi_rent_roll.py` — Yardi rent roll parser
- `backend/app/services/ingestion/parsers/mri_rent_roll.py` — MRI rent roll parser
- `backend/app/services/ingestion/parsers/generic_rent_roll.py` — Generic rent roll parser
- `backend/app/services/ingestion/parsers/billing.py` — Actual billed parser
- `backend/app/api/v1/ingestion.py` — Ingestion REST endpoints
- `backend/app/api/v1/rent_roll.py` — Rent roll endpoints
- `backend/app/api/v1/actual_billed.py` — Actual billed endpoints
