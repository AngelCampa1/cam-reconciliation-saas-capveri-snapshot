# Production E2E Bug Hunt - 2026-05-06

## Scope

- Marketing: `https://www.capveri.com`
- App: `https://app.capveri.com`
- API: `https://api.capveri.com`
- Browser artifacts: `output/playwright/prod-e2e-2026-05-06-full/`
- Tooling: `playwright-cli` 0.1.8, Chromium

## Summary

Production landlord login succeeds and the authenticated dashboard loads. Sampled marketing routes render without app console errors. The API health endpoint returns HTTP 200 but reports degraded service because object storage access is denied.

Tenant QA credentials were not present in `.env.local`, so full tenant invitation signup/login coverage could not be completed in this pass. The tenant auth entry points were still checked from a landlord-authenticated session.

## Findings

### P1 - API Health Is Degraded Due To Object Storage Access Denied

- Severity: P1
- Route/workflow: `GET https://api.capveri.com/health`
- Status: External/provider configuration, not fixed in repo
- Evidence: `Invoke-WebRequest` returned HTTP 200 with `status: degraded`; `checks.storage.status: unhealthy`; message: `Access denied to object storage bucket`.
- Repro:
  1. Request `https://api.capveri.com/health`.
  2. Inspect the JSON response.
- Expected: Health is `healthy` with storage access healthy in production.
- Actual: Health is `degraded`; object storage check is unhealthy.
- Root cause: Production object storage credentials, bucket policy, or service role configuration is denying bucket access. This is inferred from the health response; no provider console access was available in this run.
- Fix status: Not repo-owned unless the production storage env/config is sourced from tracked deployment config.
- Deployment/recheck status: Pending provider config fix, then recheck `/health` and upload flows.

### P2 - Landlord Shell Appears Around Public Tenant Auth Pages

- Severity: P2
- Route/workflow: `https://app.capveri.com/tenant/login`, `https://app.capveri.com/tenant/signup`
- Status: Fixed in repo, pending deployment
- Evidence:
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-while-landlord-auth.yaml`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-while-landlord-auth.png`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-signup-no-token.yaml`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-signup-no-token.png`
- Repro:
  1. Log in to `https://app.capveri.com` as the production QA landlord.
  2. Navigate directly to `/tenant/login`.
  3. Navigate directly to `/tenant/signup`.
- Expected: Tenant auth pages render as public tenant auth screens without the landlord sidebar, header, admin/settings navigation, or landlord user menu.
- Actual: The tenant auth content renders inside the authenticated landlord app shell.
- Root cause: `frontend/src/App.tsx` excluded public app routes such as `/pricing` and `/contact` from the landlord shell, but did not include `/tenant/login` or `/tenant/signup`.
- Fix status: Added tenant auth routes to the shellless route set and added regression coverage in `frontend/src/App.test.tsx`.
- Deployment/recheck status: `master` was pushed at commit `714f1d3a`. Production rechecks at `2026-05-06T03:15Z` and `2026-05-06T03:18Z` still showed the landlord shell, so the app deployment had not propagated the fix, the production app is not deploying from `master`, or a cached/stale app bundle was still being served.
- Recheck evidence:
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-recheck-after-push.yaml`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-recheck-after-push.png`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-recheck-after-push-2.yaml`
  - `output/playwright/prod-e2e-2026-05-06-full/tenant-login-recheck-after-push-2.png`

## Passed Checks

- Marketing home page rendered with no console errors.
- Sampled marketing pages returned 200: `/`, `/product-tour`, `/solutions`, `/integrations`, `/pricing`, `/vs`, `/resources`, `/resources/cam-guides`, `/resources/tools-calculators`, `/resources/what-is-a-cam-audit-landlord`, `/blog`, `/tools/cam-gross-up-calculator`, `/tools/noi-impact-calculator`, `/alternatives/yardi`, `/integrations/yardi`, `/glossary/cam-reconciliation`.
- Expected 404 pages returned 404: `/blog/nonexistent-prod-qa`, `/does-not-exist-prod-qa`.
- Landlord login succeeded and routed to `/dashboard`.
- Authenticated app route sweep returned content for core routes: `/dashboard`, `/portfolio`, `/properties`, `/properties/new`, `/ingestion`, `/reconciliations`, `/disputes`, `/tax-protest`, `/certificates`, `/help`, `/settings/team`.
- Landlord access to `/tenant/dashboard` redirected to `/403` with `Permission Denied`.
- Forgot password page rendered.
- Tenant signup without token showed an invalid invitation message.

## Not Completed

- Tenant invitation creation and full tenant signup/login were blocked because `E2E_PROD_TENANT_EMAIL` and `E2E_PROD_TENANT_PASSWORD` were not present locally and a landlord-created tenant invitation path was not completed in this pass.
- Destructive production workflows were not executed beyond QA-owned/read-only checks.
- Production post-deploy recheck was not completed in this pass.

## Validation

- `cd frontend && npm test -- App.test.tsx`
  - Result: 17 tests passed.
  - Note: Vitest emitted the existing Node environment warning: `Please use the legacy build in Node.js environments.`
- `cd frontend && npm run format`
  - Result: Passed; no changed files after formatting.
- `cd frontend && npm run lint:fix`
  - Result: Passed.
- `cd frontend && npm test`
  - Result: Passed.
  - Note: Existing test-suite stderr includes MSW unhandled-request warnings and intentional error-path logs.
- `cd frontend && npm run typecheck`
  - Result: Passed.
