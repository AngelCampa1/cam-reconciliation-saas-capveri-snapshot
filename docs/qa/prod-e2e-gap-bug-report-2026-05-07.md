# Production E2E Gap Bug Report - 2026-05-07

## Scope

- App: `https://app.capveri.com`
- Marketing: `https://www.capveri.com`
- API: `https://api.capveri.com`
- Evidence directory: `output/playwright/prod-e2e-gaps-2026-05-07/`
- Accounts: ignored `.env.local` production QA landlord and tenant credentials only.
- Data policy: all mutations used QA-created or QA-owned records.

This pass focused on the areas not fully covered in the previous production E2E audit: upload edge cases, import history, reconciliation lifecycle, finalized-state guards, tenant notifications/disputes, team/billing/admin probes, direct API isolation checks, desktop protected pages, mobile marketing pages, and PWA service worker registration.

## Coverage

- Landlord and tenant login succeeded against production.
- Created and refreshed QA property, unit, lease, recovery profile, expense pool, pool mapping, GL import, actual-billed upload, and reconciliation snapshot.
- Exercised valid GL upload, duplicate GL upload, invalid GL upload, malformed GL upload, rent-roll preview, actual-billed upload/detail, reconciliation calculate/job poll/snapshot trace, grid edit, finalize, finalized edit denial, variance/export boundary calls, team invitations, billing subscription/portal boundary calls, tenant dashboard/disputes/comments/status/preferences/notifications, tenant-vs-landlord API denial, fabricated UUID denial, desktop app routes, mobile marketing routes, and service worker registration.

QA records created during the confirming run:

- Property: `7f1b22a4-89a6-4b9a-8f6c-cf60f23ab882`
- Unit: `9244704c-313b-4793-abf9-ce743e8ed62d`
- Lease: `5dd80f7e-1a54-4a02-95ac-4dc801e34197`
- Expense pool: `627db7a0-ed95-41a9-a844-9cc26ffe7ab2`
- Pool mapping: `2ec58de8-54a8-473d-b5f9-3cad2ecb0a53`
- GL batch: `33b229b5-4443-452e-a7de-6cdecc37a5de`
- Snapshot: `56d4ffc8-1c82-4a72-b498-a1ee1600dd39`

## Confirmed Bug

### P2 - Invalid GL CSV Accepted as Successful Import

- Route/workflow: `POST /api/v1/ingestion/upload`
- Role: production QA landlord
- Viewport: API probe from production-authenticated browser session
- Evidence: `prod-gap-summary.json`, check `gl-upload-invalid`
- Repro:
  1. Sign in as the production QA landlord.
  2. Create or use a QA-owned property.
  3. Upload a CSV containing only non-GL columns: `not,a,valid,gl,file`.
  4. Observe the upload response.
- Expected: request fails with `400` or `422`; no completed import batch is created.
- Actual: production returned `200` and created a completed batch:
  `{"batch_id":"ca4d7e1e-f220-49a1-bf1d-fca8d9c861de","source_system":"generic","source_confidence":1,"row_count":1,"error_count":0,"warnings":["No column mapping provided - raw data returned"],"detected_columns":["not","a","valid","gl","file"]}`.
- Suspected root cause: the upload endpoint parsed the file and called GL persistence, but ignored the persistence validation result. When validation rejected every row, the endpoint still marked the batch completed and returned the parsed row count.

### Fix

- Updated `backend/app/api/v1/ingestion.py` to consume the `(rows_imported, GLValidationResult)` returned by `persist_gl_entries`.
- If no valid GL rows remain after validation, the import batch is marked `failed` with row-level errors and the endpoint returns `422`.
- Partial validation failures now report imported row count and row-level warnings instead of reporting all parsed rows as imported.
- Added regression coverage in `backend/tests/api/v1/test_ingestion.py`.

### P1 - Malformed GL CSV Returned 500

- Route/workflow: `POST /api/v1/ingestion/upload`
- Role: production QA landlord
- Viewport: API probe from production-authenticated browser session
- Evidence: `prod-gap-summary.json`, check `gl-upload-malformed`
- Repro:
  1. Sign in as the production QA landlord.
  2. Create or use a QA-owned property.
  3. Upload a malformed CSV with an unterminated quoted row.
  4. Observe the upload response.
- Expected: request fails with `400` or `422`; malformed user input should not surface as a system error.
- Actual: production returned `500` with `error_source: system_infrastructure`.
- Root cause: parse-time user-data exceptions could escape the parser call and fall through to the endpoint's generic unexpected-exception handler.

### Fix

- Updated `backend/app/api/v1/ingestion.py` to catch parse-boundary user-data exceptions and return `422` after marking the batch `failed`.
- Updated duplicate detection at upload entry to include failed/pending batches before insert, matching the production `unique_file_per_org` database constraint and preventing same-hash failed reuploads from surfacing as `500`.
- Added regression coverage in `backend/tests/test_file_upload_endpoint.py`.

## Non-Bug Notes

- Billing portal launch initially returned `422` during exploratory probing because the probe omitted the required `return_url` query parameter. The runner was corrected to include it.
- Tenant notification preferences initially returned `500` for an exploratory payload that did not match the production schema. The runner was corrected to use `new_statement_emails`, `dispute_update_emails`, and `reminder_emails`.
- After deployment rechecks, duplicate malformed/invalid probes could hit prior QA failed batches because the file body was identical. The recheck probe was updated to make those hashes unique per run.
- Tenant portal UI screenshots taken while a landlord session was active correctly redirected tenant pages to `/403`; tenant API probes used the tenant token and passed.
- Export preview/download probes accepted `400/422` as boundary responses because the exploratory payload did not fully model the production export contract; no product bug was confirmed there.

## Validation

- Focused regression before fix: failed with `200 != 422`.
- `python backend/scripts/sync_requirements.py --check`: passed.
- `cd backend && python -m black app tests`: passed.
- `cd backend && python -m isort app tests --profile black`: passed.
- `cd backend && python -m ruff check app tests --fix`: passed.
- `cd backend && python -m pytest tests/api/v1/test_ingestion.py --no-cov`: 22 passed.
- `cd backend && python -m pytest tests/test_file_upload_endpoint.py -q --no-cov`: 13 passed after the malformed-CSV fix.
- `cd backend && python -m pytest --tb=short`: 6362 passed, 50 skipped, 22 deselected, coverage 95.07%.
- `cd backend && python -m pytest --cov=app --cov-fail-under=95`: 6362 passed, 50 skipped, 22 deselected, coverage 95.07%.
- Second full validation after malformed-CSV fix:
  - `cd backend && python -m pytest --tb=short`: 6363 passed, 50 skipped, 22 deselected, coverage 95.07%.
  - `cd backend && python -m pytest --cov=app --cov-fail-under=95`: 6363 passed, 50 skipped, 22 deselected, coverage 95.07%.
- Final validation after aligning duplicate detection with the production unique constraint:
  - `cd backend && python -m pytest tests/test_pool_aggregator.py::TestAggregateByPools::test_performance_large_dataset -q --no-cov`: 1 passed, confirming the prior full-suite performance failure was transient.
  - `cd backend && python -m pytest --tb=short`: 6363 passed, 50 skipped, 22 deselected, coverage 95.07%.
  - `cd backend && python -m pytest --cov=app --cov-fail-under=95`: 6363 passed, 50 skipped, 22 deselected, coverage 95.07%.

## Deployment Recheck

- Production health confirmed Railway was serving commit `18d7ad345619dbf70fa5cdd7e0eb940af3b0f3f5`.
- Re-ran `node output\playwright\prod-e2e-gaps-2026-05-07\prod-gap-runner.mjs` against production QA accounts.
- Result: 61 checks, 0 findings.
- `gl-upload-invalid`: `422`, ok.
- `gl-upload-malformed`: `422`, ok.
