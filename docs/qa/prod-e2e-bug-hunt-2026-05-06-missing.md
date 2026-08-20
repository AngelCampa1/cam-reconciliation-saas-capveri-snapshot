# Production E2E Bug Hunt - Missing Coverage Pass

Date: 2026-05-06
Targets: `https://app.capveri.com`, `https://api.capveri.com`, `https://www.capveri.com`
Evidence directory: `output/playwright/prod-e2e-2026-05-06-missing/`

## Credential Handling

- Reused landlord credentials from ignored `.env.local`.
- Created and verified a QA-only tenant account, then saved it to ignored `.env.local` as `E2E_PROD_TENANT_EMAIL` / `E2E_PROD_TENANT_PASSWORD`.
- No production secrets are stored in this report or tracked files.

## Production Freshness And Health

- API `/health` returned `status=degraded`.
- API `/health.version` returned commit `unknown`.
- Marketing `/build.json` returned commit `4905f1a172947990cd723021aee6f40abdd90701`.
- Cloudflare R2 bucket `capveri-documents` accepted direct remote put/get/delete, so the bucket exists and is writable with local Cloudflare credentials.
- Backend object storage still fails from deployed API with `AccessDenied - Access Denied`, so the remaining storage failure is in deployed backend provider configuration, not the R2 bucket itself.

Evidence: `freshness-health.json`, `r2-healthcheck-remote-download.txt`.

## Bugs Found And Fixed In Repo

### P0 - Tenant invitation validation and signup cannot work in production

Status: Fixed in repo, pending deploy.

Production repro:
1. Landlord created a QA property/unit/lease.
2. `POST /api/v1/tenant/invitations` returned HTTP 500.
3. Directly inserted invitation tokens could not be validated through public signup endpoints.

Root causes:
- Public token validation queried `tenant_invitations` through an unauthenticated client, but production RLS has no anon select policy for invitation tokens.
- Tenant signup created a Supabase Auth user, but the signup trigger created a landlord-style owner profile. The service did not upsert the profile back to `role='tenant'` in the inviting organization.
- Signup attempted to update `used_by_user_id`, which does not exist in the production `tenant_invitations` table.
- Signup attempted to insert an `id` column into `tenant_lease_links`, but production uses a composite primary key of `tenant_user_id` and `lease_id`.

Fix:
- Public validation now reads invitation rows through the backend admin client.
- Signup upserts `public.users` to tenant role and the inviting organization after auth user creation.
- Invitation use marking only updates `used_at`.
- Tenant lease links are inserted with production schema columns only.
- Authenticated invite creation uses the org-scoped request client.

Evidence: `direct-token-validate.json`, `tenant-provision-verified.json`.

### P1 - Landlord dispute detail crashes when a comment author has no full name

Status: Fixed in repo, pending deploy.

Production repro:
1. Tenant created dispute `720d0efa-a805-42a2-a932-d47d1db96a3d`.
2. Landlord added public and internal comments.
3. `GET /api/v1/disputes/{id}` returned HTTP 400 because `author_name` was `null`.

Fix:
- Landlord and tenant dispute detail mappers now fall back to `Unknown` when joined author names are missing/null.
- Landlord attachment mapping now accepts production column names (`storage_path`, `file_size`, `mime_type`) as well as legacy DTO names.

Evidence: `tenant-dispute-api-flow.json`, failed landlord detail response during manual run.

### P1 - Feedback screenshot upload fails in production

Status: Fixed in repo, pending deploy.

Production repro:
- `POST /api/v1/feedback/screenshot` returned HTTP 500:
  `new row violates row-level security policy`.

Root cause:
- The endpoint authenticated the API request, but used the regular Supabase storage client for upload. The storage client did not carry the user JWT, so Storage RLS evaluated it as unauthorized.

Fix:
- The endpoint now uses the backend admin storage client after API auth has scoped the object key to `feedback/{organization_id}/...`.

Evidence: `upload-workflow-probes.json`.

### P2 - Marketing legacy dynamic routes return 404

Status: Fixed in repo, pending deploy.

Production repro:
- `https://www.capveri.com/glossary/gross-up` returned 404.
- `https://www.capveri.com/blog/category/cam-reconciliation` returned 404.

Fix:
- Added static alias params and permanent redirects:
  - `/glossary/gross-up` -> `/glossary/gross-up-clause`
  - `/blog/category/cam-reconciliation` -> `/blog/category/cam-errors`

Evidence: `marketing-sitemap-crawl.json`.

## Production Workflows Tested

### Tenant Lifecycle

Passed with QA tenant provisioning workaround:
- Tenant login through `/tenant/login`.
- Tenant dashboard shows QA lease.
- QA finalized statement appears in tenant dashboard.
- Tenant dispute creation via API.
- Tenant comment creation via API.
- Tenant dispute list and detail in UI.

Blocked/pending deploy:
- Normal landlord invite -> tenant signup flow is fixed in repo but cannot pass in production until backend deploy.

Evidence:
- `tenant-dashboard.yaml`
- `tenant-dashboard-with-statement.yaml`
- `tenant-disputes-list.yaml`
- `tenant-dispute-detail.yaml`
- `tenant-dispute-api-flow.json`

### Authorization Boundaries

Passed:
- Landlord can access landlord properties.
- Landlord is denied tenant dashboard/disputes.
- Tenant can access tenant dashboard/disputes.
- Tenant is denied landlord properties, leases, and tenant invitation creation.

Evidence: `api-boundary-probes.json`.

### Upload And Storage

Passed:
- GL upload: HTTP 200.
- Rent roll preview: HTTP 200.
- Lead magnet download request: HTTP 200.

Failed:
- Lease PDF upload: HTTP 500, R2 `AccessDenied`.
- Tenant dispute attachment upload: HTTP 500, R2 `AccessDenied`.
- Feedback screenshot upload: HTTP 500 before repo fix.

Evidence:
- `upload-workflow-probes.json`
- `tenant-dispute-attachment-upload.json`

### Degraded State And Mobile

Observed:
- Offline tenant dashboard navigation surfaced a global offline toast, then recovered after reconnect/reload.
- Offline tenant route temporarily redirected to landlord login (`/auth/login?returnUrl=/tenant/dashboard`) instead of tenant login. This is a UX bug to track separately if it remains after deploy.
- Mobile tenant dashboard/disputes render with hamburger navigation and no obvious horizontal overflow in snapshot.

Evidence:
- `tenant-mobile-disputes.yaml`
- `tenant-mobile-disputes.png`
- `tenant-offline-dashboard.yaml`
- `tenant-reconnect-dashboard.yaml`

### Marketing

Passed:
- First 40 sitemap URLs returned HTTP 200 with canonical tags and JSON-LD.
- Intentional fake URL returned 404.

Failed and fixed:
- Legacy glossary/category aliases listed above.

Evidence: `marketing-sitemap-crawl.json`.

## Remaining Operational Blockers

- Backend production object storage config still returns R2 `AccessDenied` from API paths that use the backend `StorageClient`.
- Railway CLI is not authenticated locally, so deployed backend env/config could not be changed from this session.
- API `/health.version` still reports `unknown`; backend deploy metadata is not production-observable.
- Normal tenant invitation/signup requires backend deployment of this branch before retesting.
- OAuth completion was not completed because no QA-owned Google account/inbox flow was available in-session.
- Password reset completion was not completed because the inbox was not available in-session.
- Billing cancellation was not executed because no QA/test subscription record was found or safely identified.

## Validation Run So Far

Passed:
- `python -m pytest backend\tests\services\test_tenant_invitation.py --tb=short --no-cov`
- `python -m pytest backend\tests\api\test_tenant_invitations_create.py backend\tests\api\v1\tenant\test_invitations.py backend\tests\api\v1\tenant\test_signup.py --tb=short --no-cov`
- `python -m pytest backend\tests\api\v1\test_disputes.py::TestGetDispute::test_get_dispute_with_comments_and_attachments backend\tests\api\v1\tenant\test_disputes.py::TestGetDispute::test_get_dispute_success --tb=short --no-cov`
- `python -m pytest backend\tests\api\v1\test_feedback.py::TestUploadScreenshot::test_upload_screenshot_success --tb=short --no-cov`
- `python -m pytest backend\tests\services\test_tenant_invitation.py backend\tests\api\test_tenant_invitations_create.py backend\tests\api\v1\tenant\test_invitations.py backend\tests\api\v1\tenant\test_signup.py backend\tests\api\v1\test_disputes.py::TestGetDispute backend\tests\api\v1\tenant\test_disputes.py::TestGetDispute backend\tests\api\v1\test_feedback.py::TestUploadScreenshot --tb=short --no-cov` - 43 passed.
- `python backend\scripts\sync_requirements.py --check`
- `cd backend && python -m black app tests`
- `cd backend && python -m isort app tests --profile black`
- `cd backend && python -m ruff check app tests --fix`
- `cd marketing && npm test -- --run src/app/glossary/[term]/page.test.ts src/app/blog/category/[category]/page.test.ts` - 2 passed.
- `cd marketing && npm run typecheck`
- `cd marketing && npm run format`
- `cd marketing && npm run lint:fix`

Blocked:
- `cd backend && pytest --tb=short` could not run because `pytest` is not on PATH in this shell; `python -m pytest --tb=short` was attempted instead and timed out after 10 minutes without a completed summary.
- Full backend coverage `python -m pytest --cov=app --cov-fail-under=95` was not rerun after the full non-coverage suite timed out.
