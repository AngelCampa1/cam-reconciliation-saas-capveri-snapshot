# Production E2E Recheck - 2026-05-07

## Scope

Production recheck and expanded bug hunt after the tenant notification SDK fix.

- App: `https://app.capveri.com`
- Marketing: `https://www.capveri.com`
- API: `https://api.capveri.com`
- Evidence: `output/playwright/prod-e2e-recheck-2026-05-07/`
- Accounts: QA-owned landlord and tenant accounts from ignored `.env.local`

## Recheck Results

### PE2E-2026-05-07-001 - Tenant Notifications and Preferences API Origin

- Severity: High
- Route/workflow: tenant portal notifications and preferences
- Production status: Fixed in deployed production
- Recheck:
  - `/tenant/notifications` rendered without the route error boundary.
  - `/tenant/preferences` rendered without the route error boundary.
  - Tenant API calls used `https://api.capveri.com`, not the app origin.
- Evidence:
  - `tenant-notifications-recheck.yaml`
  - `tenant-notifications-recheck-network.txt`
  - `tenant-preferences-recheck.yaml`
  - `tenant-preferences-recheck-network.txt`
  - `tenant-fix-recheck-summary.json`

## New Findings

### PE2E-2026-05-07-002 - Tenant Forgot Password Link Opens App 404

- Severity: High
- Route/workflow: tenant login password recovery
- Repro steps:
  1. Visit `https://app.capveri.com/tenant/login`.
  2. Click `Forgot password?`.
- Expected: tenant password reset form renders and returns users to `/tenant/login`.
- Actual: `/tenant/forgot-password` rendered the SPA 404 page.
- Evidence:
  - `tenant-login-public.yaml`
  - `tenant-forgot-password.yaml`
  - `tenant-forgot-password.png`
- Suspected root cause: `TenantLoginPage` linked to `/tenant/forgot-password`, but `App.tsx` did not register that route.
- Fix status: Fixed and deployed.
- Verification:
  - Added app route regression coverage for `/tenant/forgot-password`.
  - Added return-path coverage for `ForgotPasswordPage loginPath="/tenant/login"`.
  - Focused tests passed: `npm test -- src/App.test.tsx src/pages/auth/ForgotPasswordPage.test.tsx --run`.
- Deployment recheck: Passed on `2026-05-07` after deploying Vercel production deployment `dpl_874rd5FFbsQpzm4zhtcexaJQNo6C`.
- Deployment evidence:
  - `deployed-recheck-tenant-forgot-password.yaml`
  - `deployed-route-recheck.json`

### PE2E-2026-05-07-003 - Public App Sample Report and Tool Routes Render 404

- Severity: Medium
- Route/workflow: public app content pages
- Repro steps:
  1. Visit `https://app.capveri.com/sample-report`.
  2. Visit `https://app.capveri.com/tools`.
  3. Visit `https://app.capveri.com/tools/cam-gross-up-calculator`.
- Expected: existing public frontend sample report and tool pages render.
- Actual: each route rendered the SPA 404 page in production.
- Evidence:
  - `app-public-route-probe.json`
  - `app-public-sample-report.yaml`
  - `app-public-tools.yaml`
  - `app-public-tools-cam-gross-up-calculator.yaml`
- Suspected root cause: the frontend contained the page components and links, but `App.tsx` did not register the public `/sample-report` and `/tools/*` routes.
- Fix status: Fixed and deployed.
- Verification:
  - Added `App.tsx` routes for `/sample-report`, `/tools`, representative calculators, gated download thank-you pages, and the tools hub.
  - Added route regression coverage for `/sample-report` and `/tools/cam-gross-up-calculator`.
  - Focused tests passed: `npm test -- src/App.test.tsx src/pages/auth/ForgotPasswordPage.test.tsx --run`.
- Deployment recheck: Passed on `2026-05-07` after deploying Vercel production deployment `dpl_874rd5FFbsQpzm4zhtcexaJQNo6C`.
- Deployment evidence:
  - `deployed-recheck-sample-report.yaml`
  - `deployed-recheck-tools-cam-gross-up-calculator.yaml`
  - `deployed-route-recheck.json`

## Additional Hunt Coverage

### Marketing Link Crawl

- Representative marketing pages crawled from the production site.
- Result: no 4xx/5xx statuses among the first 220 discovered same-origin links.
- Evidence: `marketing-link-crawl.json`

### Expanded Direct Route Status Probe

- API `/health` returned OK.
- Representative app and marketing routes rendered successfully, including app auth/register/onboard/pricing/checkout success and valid marketing tools/templates/content hubs.
- Synthetic invalid dynamic slugs returned 404 as expected and were not treated as bugs.
- Evidence:
  - `expanded-route-status.json`
  - `expanded-route-status.txt`

### Landlord App Smoke Coverage

- Landlord dashboard rendered after login.
- Billing settings rendered without entering payment credentials.
- Property creation page rendered validation/upload state.
- Feedback widget rendered.
- Landlord user visiting tenant dashboard redirected to `/403` with role mismatch copy.
- Evidence:
  - `landlord-dashboard-after-login.yaml`
  - `billing-interaction.yaml`
  - `property-create-validation.yaml`
  - `feedback-widget.yaml`
  - `tenant-role-mismatch-from-landlord.yaml`

## Unresolved Items

- None from this recheck pass.
- No provider-side or third-party configuration issue was found during this pass.

## Deployment Notes

- Initial post-push route probes still rendered 404 because `app.capveri.com` was serving old bundle `/assets/index-DHAFrwSH.js`.
- GitHub CI is configured for `workflow_dispatch` only, so pushing `master` did not automatically deploy the frontend.
- The local Vercel link in `frontend/` initially pointed at an inaccessible project and then relinked to a new wrong project named `frontend` with a Next.js preset.
- The actual production domain `app.capveri.com` is bound to Vercel project `camaudit_frontend`.
- Production was fixed by linking the repository root to `camaudit_frontend`, running `npx vercel pull --yes --environment production`, `npx vercel build --prod`, and `npx vercel deploy --prebuilt --prod`.

## Local Validation

- `cd frontend && npm run format` - passed
- `cd frontend && npm run lint:fix` - passed
- `cd frontend && npm test -- --run` - passed
- `cd frontend && npm run typecheck` - passed
