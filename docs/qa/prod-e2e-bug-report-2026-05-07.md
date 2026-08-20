# Production E2E Bug Report - 2026-05-07

Production targets:

- App: `E2E_PROD_APP_URL`
- Marketing: `E2E_PROD_MARKETING_URL`
- API: `E2E_PROD_API_URL`

Credentials came from ignored `.env.local` in the main checkout. Secrets were not added to tracked files.

Artifacts are under `output/playwright/prod-e2e-2026-05-07/`.

## Coverage Summary

- API and web health: `/health`, marketing root, app root.
- Marketing desktop/mobile: home, pricing, checkout, checkout success, product tour, sample report, contact, help, docs, blog, resources, glossary, integrations, alternatives, switch, vs, solutions, tools, representative JSON-backed dynamic routes, representative 404, desktop `1440x1000`, mobile `390x844`.
- Auth: protected dashboard redirect, bad landlord login, landlord login with existing QA account, tenant protected redirect, tenant login with existing QA tenant account, tenant role mismatch behavior.
- Landlord app: dashboard, portfolio, portfolio pipeline, properties, property create, ingestion, rent-roll upload, lease upload, pools, reconciliations, year-over-year analysis, trend analysis, disputes, tax protest, certificates, profile, organization, team, billing, invoices, help, admin feedback, app 404.
- Tenant portal: tenant dashboard, disputes, dispute create, notifications, preferences, help.
- Safe boundaries: no real payment credentials entered; destructive/finalize/send flows were not completed against production.

## Bugs

### P1 - Tenant Notifications and Preferences Call App Origin API

- Severity: P1
- Route/workflow: Tenant portal, `/tenant/notifications` and `/tenant/preferences`.
- Repro steps:
  1. Log into `E2E_PROD_APP_URL` tenant portal with the existing QA tenant account.
  2. Navigate to `/tenant/notifications`.
  3. Navigate to `/tenant/preferences`.
- Expected: Tenant notifications and email preferences render data or empty/default states from the production API.
- Actual: Both routes render the global "Something went wrong" error boundary.
- Evidence:
  - `output/playwright/prod-e2e-2026-05-07/tenant-notifications.yaml`
  - `output/playwright/prod-e2e-2026-05-07/tenant-notifications.png`
  - `output/playwright/prod-e2e-2026-05-07/tenant-notifications-network.txt`
  - `output/playwright/prod-e2e-2026-05-07/tenant-preferences.yaml`
  - `output/playwright/prod-e2e-2026-05-07/tenant-preferences.png`
  - `output/playwright/prod-e2e-2026-05-07/tenant-preferences-network.txt`
- Root cause: `NotificationList` and `EmailPreferences` called generated SDK functions without the configured `apiClient`, causing production browser requests to fall back to `https://app.capveri.com/api/v1/tenant/...` instead of the API origin.
- Fix status: Fixed in code, pending deployment.
- Fix:
  - `frontend/src/features/tenant-portal/components/NotificationList.tsx` passes `client: apiClient` to list, mark-read, and mark-all-read generated SDK calls.
  - `frontend/src/features/tenant-portal/components/EmailPreferences.tsx` passes `client: apiClient` to fetch and update preference generated SDK calls.
  - Component tests now assert the shared `apiClient` is passed to those generated SDK calls.
- Verification:
  - Red test: `cd frontend && npm test -- src/features/tenant-portal/components/NotificationList.test.tsx src/features/tenant-portal/components/EmailPreferences.test.tsx --run` failed before the fix because the calls omitted `client: apiClient`.
  - Green test: same command passed after the fix with 21 tests passing.
  - Production recheck requires deploying this branch.

## Non-Bugs / Operational Notes

- `https://api.capveri.com/health` returned 200. `https://api.capveri.com/api/v1/health` returned 404 and is not treated as a bug because the live health endpoint is `/health`.
- The representative marketing probe `/solutions/property-managers` returned 404, but it was not found as an advertised CapVeri route in the current route registry/sitemap source during this pass.
- Aborted Google Analytics and Sentry network requests appeared during rapid navigation. No user-visible breakage was observed from those telemetry aborts.
- The May 6 dynamic marketing route bug appears deployed: the representative JSON-backed routes checked on May 7 returned 200.

## Validation Commands

- `cd frontend && npm ci`
- `cd frontend && npm run format`
- `cd frontend && npm run lint:fix`
- `cd frontend && npm test -- src/features/tenant-portal/components/NotificationList.test.tsx src/features/tenant-portal/components/EmailPreferences.test.tsx --run`
- `cd frontend && npm test -- --run`
- `cd frontend && npm run typecheck`
