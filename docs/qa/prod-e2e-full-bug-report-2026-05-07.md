# Full Production E2E Bug Report - 2026-05-07

## Scope

- App: `https://app.capveri.com`
- Marketing: `https://www.capveri.com`
- API: `https://api.capveri.com`
- Evidence: `output/playwright/prod-e2e-full-2026-05-07/`
- Accounts: QA-owned landlord and tenant credentials from ignored root `.env.local`
- Secrets: verified present locally, not copied into tracked files

## Coverage Summary

- `playwright-cli` baseline snapshots for marketing home and app login.
- API origin probes for `/health`, `/api/v1/health`, unauthenticated fabricated property and ingestion IDs.
- Auth flows: protected landlord and tenant route redirects, invalid landlord login, landlord login, tenant login, role mismatch redirects, authenticated storage shape without token values.
- App public routes: auth, tenant auth, forgot password, pricing, onboarding/paywall, checkout success, sample report, tools, resources, comparisons, and expected app 404.
- Landlord routes: dashboard, portfolio, pipeline, properties, property create, ingestion, rent-roll upload, lease upload, pools, reconciliations, analysis, disputes, tax protest, certificates, profile, org, team, billing, invoices, help, admin feedback.
- QA mutation: created QA-owned property `87197448-24dd-4cd8-9f8c-dfbf7e452c4a`, then checked detail, edit, lease create, and reconciliation routes.
- Tenant portal: dashboard, disputes, create dispute, notifications, preferences, help, landlord-route denial.
- Marketing: seeded same-origin route crawl and mobile checks for home, pricing, tools, resources, contact.

## Confirmed Bugs

### PE2E-2026-05-07-004 - Direct Checkout Success Return Renders Error Copy

- Severity: P2
- Route/workflow: app checkout return state, `/checkout/success`
- Repro steps:
  1. Visit `https://app.capveri.com/checkout/success` without a `session_id` query param.
- Expected: a non-error recovery state tells the user to choose a plan or return to billing.
- Actual: the page renders `Something went wrong` with `Invalid session`, which reads like an application failure even though a missing session ID is an expected direct-visit/abandoned-return state.
- Account role: public/unauthenticated route, reproduced during desktop `1440x1000` sweep.
- Evidence:
  - `app-public-checkout-success.txt`
  - `app-public-checkout-success.png`
  - `app-public-checkout-success-network.txt`
  - `app-public-checkout-success-console.txt`
  - `prod-e2e-summary.json`
- Console/network clues: no application console error and no backend failure. Only aborted Google Analytics requests were captured.
- Root cause: `CheckoutSuccessPage` treated a missing `session_id` as the same error state as a failed Stripe/session verification.
- Fix:
  - `frontend/src/pages/CheckoutSuccess.tsx` now renders `Checkout session not found` with `View Pricing` and `Go to Billing` actions for missing `session_id`.
  - Real verification/authentication failures still render the destructive `Something went wrong` state.
  - `frontend/src/pages/CheckoutSuccess.test.tsx` now covers the non-error missing-session return state.
- Verification:
  - Red: `npm test -- src/pages/CheckoutSuccess.test.tsx --run` failed before the fix because the page still rendered `Something went wrong / Invalid session`.
  - Green: `npm test -- src/pages/CheckoutSuccess.test.tsx --run` passed after the fix with 10 tests passing.
- Deployment recheck: passed after production deployment `dpl_9jN2oCTdwUXppMdnrDisKdRtnMAP`.
- Deployment evidence:
  - `deployed-recheck-checkout-success.yaml`
  - `deployed-recheck-checkout-success.png`

## Non-Bugs / Notes

- `https://api.capveri.com/health` returned 200. `https://api.capveri.com/api/v1/health` returned 404 and remains an operational note, not a bug.
- Fabricated unauthenticated app API IDs returned 401, which is the expected boundary before ID validation.
- Landlord access to tenant routes and tenant access to landlord routes redirected to `/403` with role-specific copy.
- The previous tenant notifications/preferences origin bug stayed fixed in production.
- The previous tenant forgot-password and public sample-report/tool route bugs stayed fixed in production.
- No real payment card entry or live checkout payment was attempted.

## Coverage Gaps

- Upload pages and reconciliation lifecycle screens were rendered, but the pass did not complete GL/rent-roll/lease-PDF/actual-billed uploads or finalization/export lifecycle actions.
- Team invite acceptance, email reset delivery, notification delivery, and payment-provider return states were not completed because they cross email/provider boundaries.
- Marketing crawl was seeded and representative rather than exhaustive.

## Local Validation

- `cd frontend && npm run format` - passed.
- `cd frontend && npm run lint:fix` - passed.
- `cd frontend && npm test -- src/pages/CheckoutSuccess.test.tsx --run` - passed with 10 tests.
- `cd frontend && npm test -- --run` - passed.
- `cd frontend && npm run typecheck` - passed.
- Production build/deploy:
  - `cmd /c npx vercel build --prod` from repo root - passed.
  - `cmd /c npx vercel deploy --prebuilt --prod` from repo root - deployed `dpl_9jN2oCTdwUXppMdnrDisKdRtnMAP` and aliased `app.capveri.com`.
- Production recheck:
  - `playwright-cli open https://app.capveri.com/checkout/success`
  - `playwright-cli snapshot --filename=output/playwright/prod-e2e-full-2026-05-07/deployed-recheck-checkout-success.yaml`
  - `playwright-cli screenshot --filename=output/playwright/prod-e2e-full-2026-05-07/deployed-recheck-checkout-success.png`
  - Result: `/checkout/success` rendered `Checkout session not found` with `View Pricing` and `Go to Billing`, not `Something went wrong`.
