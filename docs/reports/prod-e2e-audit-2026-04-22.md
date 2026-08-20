# Production E2E Audit Report

- Date: 2026-04-22
- Environment: Production
- App URL: `https://app.capveri.com`
- API health checked at: `2026-04-22T07:54:55.4712598-06:00`
- Supabase project: `Capveri` (`REDACTED_SUPABASE_PROJECT_REF`)

## Baseline Health

```json
{"status":"healthy","version":"0.1.0","environment":"production","timestamp":"2026-04-22T13:54:56.521915+00:00","checks":{"database":{"status":"healthy","latency_ms":1055},"storage":{"status":"healthy"},"document_reader":{"status":"healthy"},"payments":{"status":"healthy"},"email":{"status":"healthy"}}}
```

## Coverage Summary

- Auth: Pass
- Onboarding: Partial pass
- Property management: Pass
- Uploads / storage: Fail
- PDF extraction / review: Fail
- Reconciliation: Not run
- Billing / paywall: Partial pass
- Tenant-facing flows: Not run

## Created Data Ledger

- Audit email: `prod-audit-20260422-0756@capveri.com`
- Public user id: `2054cad0-7578-481e-947a-d62cba395916`
- Public organization id: `486c7cad-d807-4c15-b155-1c030cd5888f`
- Cleanup completed:
  - Property `00158d91-296d-47e7-afcd-6f6b02bc5c7f` deleted
  - Import batch `d40ab871-41dd-4e92-a7a0-7e59c09f6ef7` deleted
  - Trial subscription `0508569c-1cb8-4d5a-b0cb-a0552b311756` deleted
  - Related `gl_entries` deleted
- Not cleaned up:
  - Supabase Auth / public user + organization shell for the audit account remain because the current MCP toolset does not expose safe auth-user deletion.

## Findings

### [P1] GL ingestion preview shows zero entries after successful import

- Area: `Documents -> Upload GL Data`
- URL: `https://app.capveri.com/ingestion`
- Repro:
  1. Sign in as a fresh paid/trial-enabled org.
  2. Create a property.
  3. Open `Upload GL Data`.
  4. Select the property.
  5. Upload `frontend/e2e/fixtures/mri_gl_hou01_2024.csv`.
  6. Accept the detected parser (`MRI Commercial`) and continue.
- Actual:
  - UI shows `30 rows imported successfully`
  - Preview panel shows `GL Entry Preview` and `0 entries`
  - Table body says `No entries found. Try adjusting your filters.`
- Expected:
  - Preview should render the newly imported GL rows, or the success message should not claim rows were imported if preview data is empty.
- Database verification:
  - `import_batches.row_count = 30`, `status = completed`
  - `gl_entries` persisted count for the imported property/batch = `30`
  - This isolates the defect to the post-import preview/UI layer, not ingestion persistence.
- Evidence:
  - Screenshot: `.playwright-cli/page-2026-04-22T14-00-31-881Z.png`

### [P1] Lease PDF upload fails with backend 500 on production

- Area: `Documents -> Upload Lease PDFs`
- URL: `https://app.capveri.com/leases/upload`
- Repro:
  1. Sign in as the audit org.
  2. Open `Upload Lease PDFs`.
  3. Select the property.
  4. Upload `frontend/e2e/fixtures/sample-lease.pdf`.
  5. Click `Upload 1 PDF`.
- Actual:
  - UI shows `Upload failed`
  - Browser console captures a failed network request:
    - `POST https://api.capveri.com/api/v1/documents/upload?property_id=00158d91-296d-47e7-afcd-6f6b02bc5c7f&document_type=lease`
    - Response status `500`
  - No `documents` row is created for the property.
- Expected:
  - Upload should succeed and create a `documents` record for downstream OCR / AI extraction processing.
- Infra relevance:
  - This is directly on the storage/document ingestion path affected by the move off AWS and onto the new reader/storage stack.
- Evidence:
  - Console log: `.playwright-cli/console-2026-04-22T13-58-48-785Z.log`
  - Screenshot: `.playwright-cli/page-2026-04-22T14-01-49-435Z.png`

## Passed Checks

- Registration works and routes a new account to the trial/paywall step.
- Manual property creation works end-to-end.
- Direct DB-granted `trialing` entitlement is recognized by the app.
- Billing page renders correctly for a `trialing` subscription.
- Billing invoices empty-state renders correctly.
- Logout returns the user to the sign-in page.

## Notes

- `playwright-cli open` starts a fresh unauthenticated page in this environment, so stable session coverage required staying inside one logged-in navigation flow after sign-in.
- Reconciliation was not executed because the lease document path failed before extraction/review and the billed-data/reconciliation flow was not separately seeded after cleanup.
