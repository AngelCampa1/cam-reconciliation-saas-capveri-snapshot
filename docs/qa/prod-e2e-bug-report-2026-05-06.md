# Production E2E Bug Report - 2026-05-06

Production targets:

- App: `E2E_PROD_APP_URL`
- Marketing: `E2E_PROD_MARKETING_URL`
- API: `E2E_PROD_API_URL`

Credentials came from ignored `.env.local`. Secrets were not added to tracked files.

Artifacts are under `output/playwright/prod-e2e-2026-05-06/` and `.playwright-cli/`.

## Coverage Summary

- Auth: protected app redirect to login, login with existing QA account, forgot password page, register page validation surface, tenant protected redirect.
- App shell: desktop sidebar/header, help entry point, feedback widget presence, tenant role guard.
- Authenticated app: dashboard, portfolio, portfolio pipeline, properties list/create/detail, property tabs for overview/units/leases/imports, uploads entry pages, ingestion, pools, analysis, tax protest, disputes, certificates, settings/profile/org/team/billing/invoices/help/admin feedback.
- Marketing: homepage, pricing, checkout/success display pages, product tour, sample report, case studies, about/contact/help/docs, tools index and representative tools, resources hub, glossary, integrations, alternatives, switch, solutions, best, comparison pages, representative dynamic route families.
- Safe boundaries: checkout/cancellation/destructive deletes/finalize/send actions were not completed against production.

## Bugs

### P1 - Portfolio Pipeline Error Boundary

- Severity: P1
- Route/workflow: App, `/portfolio/pipeline`
- Repro steps:
  1. Log into `E2E_PROD_APP_URL` with the existing QA account.
  2. Navigate to `/portfolio/pipeline`.
  3. Wait for data loading to complete.
- Expected: Portfolio Pipeline renders campaign rows or an empty state.
- Actual: The page renders the global "Something went wrong" error boundary.
- Evidence:
  - Screenshot/snapshot: `output/playwright/prod-e2e-2026-05-06/app-portfolio-pipeline-after-wait.yaml`
  - Console: `GET https://app.capveri.com/api/v1/campaigns/?year=2026` returned 404, then `ApiError: The page could not be found`.
- Root cause: campaign hooks called generated SDK functions without the configured `apiClient`, causing production requests to fall back to the app origin instead of the API origin.
- Fix status: Fixed in code, pending deployment.
- Fix:
  - `frontend/src/api/hooks.ts` now passes `client: apiClient` to campaign list and transition SDK calls.
  - `frontend/src/api/hooks.test.ts` covers campaign list and transition calls using `apiClient`.
- Verification:
  - `cd frontend && npm test -- src/api/hooks.test.ts` passed.
  - `cd frontend && npm test` passed.
  - `cd frontend && npm run typecheck` passed.

### P1 - JSON-Backed Marketing Dynamic Routes 404

- Severity: P1
- Route/workflow: Marketing dynamic resources pages.
- Repro steps:
  1. Open `E2E_PROD_MARKETING_URL`.
  2. Navigate to valid JSON-backed dynamic routes such as `/resources/boma/method-a-vs-method-b`, `/resources/expenses/property-taxes`, `/resources/lease-clauses/gross-up-clause`, `/resources/markets/new-york-ny/cam-guide`, `/resources/property-types/class-a-office/cam-guide`, `/resources/roles/property-controller/cam-guide`, `/resources/states/california/cam-compliance`, or `/resources/workflows/year-end-reconciliation`.
- Expected: Valid content records render their article pages.
- Actual: These routes return 404 in production.
- Evidence:
  - Route status report: `output/playwright/prod-e2e-2026-05-06/marketing-dynamic-route-status.txt`
- Root cause: affected pages set `dynamicParams = false` but returned `[]` from `generateStaticParams()`, so production pre-rendered no valid dynamic paths for those families.
- Fix status: Fixed in code, pending deployment.
- Fix:
  - Each affected route now returns slug params from the corresponding JSON-backed data getter:
    - BOMA topics
    - expense categories
    - lease clauses
    - metro guides
    - property type guides
    - role guides
    - state compliance guides
    - workflow guides
  - `marketing/src/__tests__/route-integrity.test.ts` now verifies these families pre-render at least one route.
- Verification:
  - `cd marketing && npm test -- src/__tests__/route-integrity.test.ts` passed.
  - `cd marketing && npm run typecheck` passed.

## Non-Bugs / Operational Notes

- Analytics, Sentry, and Cloudflare RUM requests sometimes show `net::ERR_ABORTED` during rapid test navigation. No user-visible breakage was observed from those aborted telemetry requests.
- Some production dynamic route probes intentionally used invalid sample slugs and returned expected 404s; valid slugs were then checked from local JSON data.
- Production recheck of fixed behavior requires deploying this branch because both root causes are build/runtime code issues.

## Validation Commands

- `cd frontend && npm run format`
- `cd frontend && npm run lint:fix`
- `cd frontend && npm test -- src/api/hooks.test.ts`
- `cd frontend && npm test`
- `cd frontend && npm run typecheck`
- `cd marketing && npm run format`
- `cd marketing && npm run lint:fix`
- `cd marketing && npm test -- src/__tests__/route-integrity.test.ts`
- `cd marketing && npm run typecheck`
