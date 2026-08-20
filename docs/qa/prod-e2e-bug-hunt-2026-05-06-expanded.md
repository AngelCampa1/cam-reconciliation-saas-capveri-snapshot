# Production E2E Bug Hunt - Expanded - 2026-05-06

## Scope

- Marketing: `https://www.capveri.com`
- App: `https://app.capveri.com`
- API: `https://api.capveri.com`
- Browser artifacts: `output/playwright/prod-e2e-2026-05-06-expanded/`
- Tooling: `playwright-cli`, Chromium, PowerShell API probes

## Summary

Production landlord login succeeds and the authenticated dashboard loads. Previously reported tenant-auth shell and portfolio pipeline failures are fixed in production. The marketing sitemap crawl passed for sampled dynamic route families, including the routes that were previously reported as 404.

This pass found one repo-owned degraded-state bug and one missing deployment-freshness surface. The repo-owned dashboard failure was fixed with regression coverage. Build metadata was added for backend, frontend, and marketing so future production checks can compare deployed artifacts against the expected commit. Production storage remains degraded because object storage access is denied; upload workflows are blocked until provider storage configuration is corrected.

## Findings

### P1 - API Health Is Degraded Due To Object Storage Access Denied

- Severity: P1
- Route/workflow: `GET https://api.capveri.com/health`
- Status: Provider configuration blocker, not fixed in repo
- Evidence: `output/playwright/prod-e2e-2026-05-06-expanded/api.capveri.com_health.txt`
- Repro:
  1. Request `https://api.capveri.com/health`.
  2. Inspect the JSON response.
- Expected: Health is `healthy` with storage access healthy in production.
- Actual: Health returns HTTP 200 but reports `status: degraded`; storage is unhealthy with `Access denied to object storage bucket`.
- Suspected root cause: Production object storage credentials, bucket policy, or service role configuration is denying bucket access.
- Fix owner: Provider/deployment configuration.
- Recheck: Pending provider fix, then rerun `/health` plus GL upload, lease PDF upload, rent roll upload, exports/downloads, dispute attachments, and feedback screenshot uploads.

### P2 - Missing Public Build Metadata For Deployment Freshness Checks

- Severity: P2
- Route/workflow: deployment verification for API, app, and marketing
- Status: Fixed in repo, pending deploy
- Evidence:
  - `https://api.capveri.com/health.version` returned 404 before the fix.
  - `https://www.capveri.com/build.json` returned 404 before the fix.
  - The app HTML did not expose `#capveri-build-metadata` before the fix.
- Expected: Production exposes non-secret version, environment, and commit metadata for each deployable surface.
- Actual: The commit/hash was not observable across deployed surfaces.
- Root cause: No public build metadata endpoint/tag existed for production freshness checks.
- Fix:
  - Backend `/health` now includes public build metadata and `/health.version` exposes the same metadata.
  - Frontend writes a machine-readable `script#capveri-build-metadata` tag at bootstrap.
  - Marketing exposes `/build.json`.
- Recheck: Pending deploy.

### P2 - Dashboard Falls Into Global Error Boundary When Secondary Summary API Fails

- Severity: P2
- Route/workflow: authenticated landlord dashboard under degraded API conditions
- Status: Fixed in repo, pending deploy
- Evidence: `output/playwright/prod-e2e-2026-05-06-expanded/app-api-503-dashboard.yaml`
- Repro:
  1. Log in to `https://app.capveri.com` as the QA landlord.
  2. Route `*/api/v1/leakage/summary` to return HTTP 503.
  3. Open `/dashboard`.
- Expected: The dashboard remains usable and gracefully omits or defaults secondary leakage summary data.
- Actual: The page entered the global `Something went wrong` error boundary.
- Root cause: The leakage summary query was secondary dashboard data, but under the app-level React Query error policy it threw when no data was present.
- Fix: Set the leakage summary query to `throwOnError: false` and added a dashboard regression test using a 503 response.
- Recheck: Pending deploy.

## Production Rechecks

- Tenant login while landlord-authenticated no longer renders the landlord shell.
  - Evidence: `tenant-login-recheck.yaml`, `tenant-login-recheck.png`
- Portfolio pipeline no longer enters the global error boundary.
  - Evidence: `portfolio-pipeline-recheck.yaml`, `portfolio-pipeline-recheck.png`
- Marketing mobile home navigation rendered at mobile width.
  - Evidence: `marketing-mobile-home.yaml`, `marketing-mobile-home.png`
- Marketing sitemap crawl returned 200 for sampled dynamic route families and one expected 404 for a nonexistent route.
  - Evidence: `marketing-sitemap-dynamic-status.json`
  - Sampled dynamic families included BOMA, expenses, lease clauses, markets, property types, roles, states, and workflows.

## Not Completed

- Full tenant lifecycle was not completed because local ignored env did not contain tenant QA credentials and a tenant invitation/account was not completed during this pass.
- Storage/upload E2E was not completed because production health reports object storage access denied.
- Provider-owned storage configuration was not changed because provider console access was not available in this environment.
- Backend full suite and coverage checks did not complete locally; both timed out after extended foreground runs. The focused backend regression test passed.

## Validation

Backend:

- `python backend/scripts/sync_requirements.py --check`
  - Result: passed.
  - Output: `requirements.txt is in sync with pyproject.toml.`
- `cd backend && python -m black app tests`
  - Result: passed.
- `cd backend && python -m isort app tests --profile black`
  - Result: passed.
- `cd backend && python -m ruff check app tests --fix`
  - Result: passed.
- `cd backend && python -m pytest tests/test_main.py::TestHealthEndpoint --tb=short --no-cov`
  - Result: passed, 6 tests.
- `cd backend && python -m pytest --tb=short`
  - Result: did not complete; timed out after 20 minutes.
- `cd backend && python -m pytest --cov=app --cov-fail-under=95 --tb=short`
  - Result: did not complete; timed out after 20 minutes.

Frontend:

- `cd frontend && npm test -- src/lib/buildMetadata.test.ts --run`
  - Result: passed, 2 tests.
- `cd frontend && npm test -- src/pages/DashboardPage.test.tsx --run`
  - Result: passed, 22 tests.
- `cd frontend && npm run format`
  - Result: passed.
- `cd frontend && npm run lint:fix`
  - Result: passed.
- `cd frontend && npm run typecheck`
  - Result: passed.
- `cd frontend && npm test -- --run`
  - Result: passed.

Marketing:

- `cd marketing && npm test -- src/__tests__/build-metadata-route.test.ts --run`
  - Result: passed.
- `cd marketing && npm run format`
  - Result: passed.
- `cd marketing && npm run lint:fix`
  - Result: passed.
- `cd marketing && npm run typecheck`
  - Result: passed.
- `cd marketing && npm test -- --run`
  - Result: passed, 80 test files and 479 tests.
