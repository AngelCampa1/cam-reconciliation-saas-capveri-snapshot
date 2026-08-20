# Lease Management
> Last updated: 2026-06-30 - Extraction queue job mutations now carry the organization boundary through claim, completion, retry, and failure writes. The Worker queue still validates the job first, and the repository now also scopes terminal/status updates by `organization_id`, including the linked document write on completion.
> Last updated: 2026-06-15 - Error-state copy clarity (pristine-ux C15): lease and property detail/form error surfaces stop leaking raw `error.message` to users. `LeaseDetailPage`/`PropertyDetailPage` full-page load errors now show plain reassuring copy ("Your data is safe") with a "Try again" button that refetches and a Back link; their delete-mutation toasts and the `LeaseFormPage`/`PropertyFormPage` create/update toasts use vetted plain copy that confirms prior data was not changed. Raw errors now console.error only. Copy passed the humanizer + third-grade gates; tests updated to the new copy.
> Last updated: 2026-06-11 - The onboarding wizard's inline lease form (`InlineLeaseForm`) now renders its five validation-error messages (tenant name, lease start, lease end, pro-rata share, unit) in the AA-contrast `text-destructive-strong` red instead of the bright `text-destructive` that fails WCAG AA on white at this body size (matches the F-287/F-381/F-382 contrast standard). A regression test asserts the empty-tenant-name error carries the `text-destructive-strong` class (F-383).
> Last updated: 2026-06-09 - PostHog coverage for the async AI extraction lifecycle. The Celery `process_extraction_task` (`backend/app/services/extraction/job_queue.py`) previously emitted zero analytics because the sync task can't await the async `capture_backend_event`. Added a synchronous `capture_backend_event_sync` (same sanitizer, never raises, 3s timeout) and the task now emits `lease_extraction_job_started`, `lease_extraction_job_completed`, `lease_extraction_job_retrying`, and `lease_extraction_job_failed` keyed at the organization level. Failure events record the exception class name (`exc.__class__.__name__`), never the message, and payloads carry document_id/priority/tokens/field-count/retry-count only — no document content.
> Last updated: 2026-06-07 - Two P3 verification/extractions polish fixes. (F-235) The extraction verification edit panel now flags empty extracted fields (no value found by the AI) instead of rendering a bare blank input: `EditableField` computes `showNotExtracted` (value is null/empty, not boolean, and the reviewer has not edited or confirmed it) and renders a dashed warning border, a "Not extracted" placeholder (text/percent) or "Not extracted — choose a value" (select), and a short caption ("The AI didn't find a value. Add one if you have it.") so a blank reads as needs-a-look rather than broken. (F-236) The "Enable Notifications" prompt (`NotificationPrompt`) now has a dismiss (X) control that persists the dismissal in `localStorage` (`capveri.notificationPrompt.dismissed`) so it stays hidden across renders; it still renders nothing once permission is granted/denied or unsupported.
> Last updated: 2026-06-07 - The Extractions list now shows each row's status as a shared, accessible chip instead of an ALL-CAPS text span / single-color card Badge (F-233). A new `ExtractionStatusBadge` maps every `DocumentStatus` value to a distinct semantic color, a sentence-case label (Pending, Processing, Ready for review, Completed, Verified, Failed, Rejected), and its own lucide icon (clock, spinner, eye, check, ban, x) so the status is distinguishable without relying on color alone — important for colorblind and low-vision reviewers. Both the desktop table cell and the mobile card render the same component, so the two views are now consistent; previously the card's `getStatusVariant` collapsed processing/ready-for-review/verified to one color and both views shouted in all caps. Unknown statuses fall back to a humanized label and neutral styling.
> Last updated: 2026-06-07 - The extraction verification edit panel now renders each extracted field with a control that matches its type instead of a raw text input (F-232). `EditableField` gained an optional `isBoolean` prop (renders a Yes/No `Switch` that emits a real boolean) and an optional `options` prop (renders a labeled `Select` that emits the raw option value). `EditInterface` wires `gross_up_base_year` as a boolean toggle and `cap_type` as a labeled dropdown, reusing the exact cap-type labels from `RecoveryProfileEditor` (No Cap / Non-Cumulative / Cumulative / Cumulative Compounding) so reviewers see the same wording everywhere; previously gross-up showed "true"/"false" and cap type showed the lowercase enum value. The editable value type is widened to `string | number | boolean | null` end to end (`EditableField` → `EditInterface` → `VerificationPage.handleFieldChange`) so the boolean round-trips cleanly, and original-value display plus change tracking render the human label for both new field types.
> Last updated: 2026-06-07 - The extraction verification screen now hard-blocks approval when the reviewer cannot see the source document, enforcing the "all AI extractions require human verification" constraint (F-231). The `PDFViewer` surfaces its document load state through an optional `onLoadStateChange` callback (`loading` | `loaded` | `error`); `VerificationPage` tracks that state and disables "Approve & Commit" while the source PDF is in the error state, with a tooltip ("Load the source PDF before you approve."). The same gate now also covers the Ctrl/Cmd+Enter approve shortcut, which previously bypassed even the lease-selection check. Loading and transient failures recover normally (the viewer's "Try again" reloads). Related: the viewer no longer renders react-pdf's raw load-error string, which for a storage 404 embedded the full signed S3 URL (AWS credential + signature query params) in the DOM; it now shows a fixed friendly message and logs the raw error to the console only (F-230), with `role="alert"`/`aria-live` on the error block.
> Last updated: 2026-06-05 - The extraction verification screen now lets a reviewer mark an accurate, unedited field as correct so verification progress can reach 100% without forcing edits (F-176). Each unedited `EditableField` shows a pill "Looks right?" toggle (hidden once the field is edited, since an edit already counts as verified); clicking it flips the field to a confirmed state (`bg-success` pill, "Looks right", `aria-pressed`) and tints the field container `bg-success/10`. `VerificationPage` tracks confirmed field keys in local `confirmedFields` state (frontend-only; not persisted — approval is still gated on lease selection, this only drives the informational progress count), OR's `confirmedFields.includes(field)` into each source reference's `verified` flag so the `VerificationSummary` count advances, and emits a privacy-safe `lease_extraction_field_confirmed` PostHog event (with `field_group`) the first time a field is confirmed. `EditInterface` passes `confirmedFields`/`onConfirmField` through to each field.
> Last updated: 2026-06-04 - The Extractions queue now advances a row on its own when a processing job finishes. The per-row Process/Retry button polls the extraction job, and on a terminal status it invalidates the extractions list with `refetchType: 'all'` so the row refreshes (PENDING → READY_FOR_REVIEW) without a manual reload; previously the row stayed PENDING until the user refreshed (F-178). Job polling stops via a `refetchInterval` that returns `false` on COMPLETED/FAILED, and terminal-state side effects (analytics, toast, browser notification, list invalidation) run in a `useEffect` guarded by a handled-job ref so they fire once. While a document is processing the button shows a muted caption ("Reading your document. This can take up to 30 seconds.") instead of only a disabled spinner, and the completion toast now reads "Extraction complete. Ready for review." (F-180).
> Last updated: 2026-06-04 - The extraction verification edit panel now shows percent recovery-profile fields (pro-rata share, cap rate, admin fee) as percent numbers instead of raw 0..1 decimal fractions, so a reviewer sees "5" with a trailing `%` adornment rather than "0.05" (F-177). `EditableField` gained an optional `isPercentage` prop: it renders the stored decimal as a percent via `decimalToPercentDisplay` (rounded to remove binary-float noise like 0.07*100=7.000000000000001) and converts the reviewer's typed percent back to a decimal fraction via `percentInputToDecimal` (rounded to 12 dp) on change. A local `displayText` buffer plus an "adjust state during render" resync (keyed on the incoming `value`) lets reviewers type freely (including a trailing decimal point) without the controlled input snapping back, and resyncs on undo/redo/reset. Only edited fields emit `onChange`; unedited fields pass their stored decimal through untouched, so no committed value is silently changed. `EditInterface` passes `isPercentage` from its field definitions and drops the now-redundant "(%)" label suffix.
> Last updated: 2026-06-04 - The extraction verification screen no longer dead-ends when a document's property has no lease yet. Previously the "Link to Lease" dropdown only offered a disabled "No leases found for this property" item, so `selectedLeaseId` could never be set and "Approve & Commit" stayed permanently disabled (F-174). Now, when the property has zero leases, the toolbar shows a "New lease" button that opens a quick-create dialog (tenant name + start/end dates); when leases exist, the same button sits beside the selector. Submitting calls `POST /api/v1/leases` (createLeaseApiV1LeasesPost) with the extraction's `property_id` and the edited recovery profile pre-filled as `recovery_profile`, then sets `selectedLeaseId` to the new lease so approval unblocks. The create button is gated on tenant name plus a valid start/end date range, and the keyboard shortcut handler is suppressed while the dialog is open so profile undo/redo and approve-on-Ctrl+Enter don't fire over the form inputs.
> Last updated: 2026-06-03 - Editing a lease now persists recovery-profile changes. The basic-lease `PUT /api/v1/leases/{id}` deliberately excludes `recovery_profile`, so edit-mode now also calls the dedicated `PUT /leases/{id}/recovery-profile` merge endpoint — the lease form runs both mutations under `Promise.all` and only toasts/navigates after both succeed (each surfaces its own field-level error toast on partial failure; PUTs are idempotent). Previously every recovery-profile field (cap type/rate, admin fee, pro-rata share, base year, RSF standard, accounting basis) was silently dropped on save while a success toast still fired (F-139). The cap-type and other late-hydrating Radix selects in edit mode now remount via `key={field.value}` so they adopt the value that arrives via form.reset (F-140).
> Last updated: 2026-06-01 - Lease document upload and extraction review now emit privacy-safe PostHog events for upload start/completion/failure, extraction process start/completion/failure, review opens, field edits, low-confidence filtering, source-highlight clicks, draft-save retries, approval, and rejection. Payloads use document/property IDs, controlled statuses, booleans, field groups, and confidence/count/file-size buckets instead of filenames, tenant/property names, addresses, document URLs, storage keys, source text, extracted lease values, edit old/new values, rejection notes, or raw backend error text.
> Last updated: 2026-05-30 - The extraction verification screen now anchors AI source-highlight bounding boxes to the PDF's actual rendered dimensions (via a PDFViewer overlay render-prop) instead of a hard-coded A4 page size, so highlights line up on every document; the verification draft autosave now surfaces a "Couldn't save draft. Retry" error instead of silently leaving a stale "Draft saved" indicator after a failed background save.
> Last updated: 2026-05-29 - Lease document viewing now uses a signed-URL state machine with a retry control (ready/loading/error states), and the lease upload page surfaces a retryable error instead of the empty state when existing leases fail to load while keeping upload non-blocking.
> Last updated: 2026-05-28 - Tenant invitation lease checks and nested lease-term version routes now use schema-valid scoped lookups so cross-lease IDs cannot satisfy nested paths.
> Last updated: 2026-05-28 - Cross-document analysis now builds GL pool context from schema-valid GL fields and pool mappings instead of nonexistent GL pool/date columns.
> Last updated: 2026-05-20 - Documents navigation now exposes the Extractions review queue so seeded AI lease extraction journeys can reach `/extractions` directly.
> Last updated: 2026-05-20 - Journey 04 now exercises lease recovery profile edit persistence without a stale skip.
> Last updated: 2026-05-20 - Lease edit forms now pre-populate and preserve unit, status, BOMA measurement standard, and accounting basis recovery-profile fields on update.
> Last updated: 2026-04-22 - Lease uploads now log storage-vs-database failures explicitly, and production health checks only report storage healthy when the documents bucket passes a real write/delete probe
> Last updated: 2026-04-21 - Verification draft autosave now deduplicates unchanged profiles and resets correctly when the document changes
> Last updated: 2026-02-26 — Initial inventory

## Overview

Full lease lifecycle management with temporal term versioning and AI-assisted PDF extraction.
Leases carry a recovery profile (the "financial DNA") that drives all calculation engine inputs.
Every amendment creates a new term version with an effective date — previous terms are preserved,
never overwritten.

## Features

### Lease CRUD
- Standard REST create/read/update/delete for leases
- Status workflow: `DRAFT` → `ACTIVE` → `EXPIRED` → `TERMINATED`
- Each lease linked to a property and unit, with tenant name and document URL
- Edit forms pre-populate current unit/status and preserve the selected unit when submitting updates
- Frontend E2E Journey 04 verifies recovery profile cap/admin-fee edits persist after navigating away and reopening the lease.
- **Endpoints**: `/api/v1/leases/`
- **Enums**: `LeaseStatus` in `backend/app/models/enums.py`

### Recovery Profile
- Embedded JSONB on each lease containing the financial terms that drive calculations
- Fields: `base_year`, `base_year_amount`, `gross_up_base_year` flag, `pro_rata_share`, `cap_type` (NONE / NON_CUMULATIVE / CUMULATIVE / CUMULATIVE_COMPOUNDING), `cap_rate`, `admin_fee_percentage` (0-20%), `excluded_pools`, BOMA standard version
- Lease edit forms pre-populate and resubmit optional BOMA measurement standard and accounting-basis fields
- This is the single source of truth for how a tenant's CAM share is computed

### Verification Draft Autosave
- Human verification edits auto-save draft recovery profiles to `/api/v1/extractions/{documentId}/draft`
- Draft autosave is debounced, skips unchanged dirty payloads, and resets its last-saved snapshot when the active document changes
- Manual save still forces an immediate save and cancels any pending background timer

### Lease Term Versioning
- Every amendment creates a new version row with an `effective_date` — append-only, never overwrite
- Flat columns (not nested JSONB) for efficient SQL queries and indexing
- UNIQUE constraint on `(lease_id, effective_date)` prevents duplicate versions
- Index on `(lease_id, effective_date DESC)` for efficient "latest as of" lookback
- Supabase RPC function `get_effective_term_versions(lease_ids[], as_of_date)` for batch lookup
- Tracks `version_number`, `amendment_reason`, and `created_by`
- **Endpoint**: `/api/v1/lease-term-versions/`
- **Service**: `backend/app/services/lease_terms.py`

### Effective-Date Semantics
- Calculation engine uses the term version effective during the reconciliation period
- A 2024 reconciliation uses 2024 terms even if the lease was amended in 2025
- Finalized reconciliations freeze exact lease terms into `lease_terms_snapshot` JSONB and record the `term_version_id` for reproducibility
- Constraint: once a reconciliation snapshot is finalized, its frozen terms cannot change

### AI Lease Extraction
- Upload PDF → document reader OCR → Claude 3.5 Sonnet extraction (ZDR mode) → human verification
- Document status workflow: `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED` → `READY_FOR_REVIEW` → `VERIFIED` / `REJECTED`
- Every extracted value requires explicit human approval before creating lease records
- OCR results stored page-by-page: text blocks, tables, key-value pairs, full text (GIN indexed)
- Claude operates in Zero Data Retention mode — no tenant data persisted by the LLM
- Upload failures now log whether the failure happened during the object-storage write or during the `documents` table insert/cleanup path, preserving the existing `201` success contract when the upload completes normally
- **Endpoints**: `POST /api/v1/documents/upload`, `/api/v1/extractions/`
- **Services**: `backend/app/services/extraction/` (document_reader_client, anthropic_client, orchestrator, result_parser, table_handler, confidence scoring)

### Storage Health Verification
- The production `/health` storage check now probes the documents bucket with a short-lived object under a reserved health-check prefix
- "Healthy" storage now means the bucket is reachable and writable, not merely that R2 credentials are configured
- Failed probes surface as unhealthy storage checks so lease uploads cannot silently break behind a green health endpoint

### Extraction Job Queue
- Async job processing with retry logic (up to 3 retries, exponential backoff: 60s / 120s / 240s)
- Priority levels: LOW (0), NORMAL (5), HIGH (10), URGENT (15)
- Job status: PENDING → PROCESSING → COMPLETED / FAILED / RETRYING
- Database-backed queue; full Celery integration deferred to Story 15.6
- **Services**: `backend/app/services/extraction/job_queue.py`, `job_poller.py`

### Verification UI
- Split-screen layout: PDF viewer (left) with bounding box highlights over OCR regions + editable extraction fields (right) showing per-field confidence scores
- Undo/redo history for field edits
- Approve action creates a Lease record from verified extraction data
- Reject action re-queues the document for re-extraction
- **Frontend page**: `/extractions/{documentId}`
- **Components**: PDFViewer, EditInterface, VerificationSummary, ApprovalDialog, RejectDialog

### Fiscal Year Support
- Properties define a fiscal year start month (1-12)
- Reconciliation periods align to the property's fiscal calendar, not necessarily Jan-Dec
- Calculation engine respects fiscal year boundaries for period-based lookups

## Database Tables

- **leases** — `property_id`, `unit_id`, `tenant_name`, `status` enum (draft/active/expired/terminated), `recovery_profile` JSONB, `document_url`
- **lease_term_versions** — `lease_id`, `version_number`, `effective_date`, flat columns for all financial terms, `amendment_reason`, `created_by`. UNIQUE on `(lease_id, effective_date)`
- **documents** — `s3_key`, `document_type` enum (lease/amendment/rent_roll/gl_export/other), `status` enum (7-state workflow), `reader_job_id`, `extraction_result` JSONB
- **ocr_results** — Page-level storage: `text_blocks`, `tables`, `key_value_pairs`, `full_text` with GIN index for full-text search
- **extraction_jobs** — `priority` enum, `retry_count`, `next_retry_at`, `status` enum

## Key Files

- `backend/app/api/v1/leases.py` — Lease CRUD endpoints
- `backend/app/api/v1/lease_term_versions.py` — Term version endpoints
- `backend/app/api/v1/documents.py` — Document upload endpoints
- `backend/app/api/v1/extraction.py` — Extraction pipeline endpoints
- `backend/app/services/lease_terms.py` — Term versioning business logic
- `backend/app/services/extraction/orchestrator.py` — OCR → Claude → result pipeline
- `backend/app/services/extraction/document_reader_client.py` — document reader integration
- `backend/app/services/extraction/anthropic_client.py` — Claude ZDR extraction
- `backend/app/services/extraction/result_parser.py` — JSON response parsing
- `backend/app/services/extraction/table_handler.py` — Table extraction logic
- `backend/app/services/extraction/confidence.py` — Per-field confidence scoring
- `backend/app/services/extraction/job_queue.py` — Async job queue models
- `backend/app/services/extraction/job_poller.py` — Job polling and retry
- `backend/app/services/extraction/extraction_models.py` — LeaseExtractionResult schema
- `backend/app/services/extraction/prompts.py` — Claude extraction prompts
- `backend/app/models/enums.py` — DocumentStatus, ExtractionJobStatus, ExtractionJobPriority enums
