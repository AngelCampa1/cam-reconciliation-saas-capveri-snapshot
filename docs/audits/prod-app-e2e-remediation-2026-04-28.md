# Production App E2E Audit Remediation Plan - 2026-04-28

## Summary

Production target audited: `https://app.capveri.com`.

Test account created through live signup:

- Email: `prodtest+audit-20260428-8c6c8372@example.com`
- Password: `TestPass123!`
- Signup result: successful, redirected to `/checkout?source=signup`

The documented seeded production test users were not available in production during this audit. Login attempts for `prodtest+owner@acme.example.com` and `prodtest+lisa.tenant@salon.com` both returned Supabase password-token `400` responses, so deep seeded-data workflows could not be exercised. A live signup account was created instead, but it exposed a higher-priority production blocker: every protected landlord route redirects back to checkout, and the checkout CTA fails with CORS when it calls `https://api.capveri.com/api/v1/billing/checkout`.

Evidence was collected with `playwright-cli` using desktop `1440x950` and mobile `390x844` sweeps, route snapshots, console output, network output, and screenshots under `.playwright-cli/`.

## P0 / P1 Findings

### P0 - New users cannot start the advertised no-card trial

**Impact:** A newly registered production user cannot access the app. Routes such as `/dashboard`, `/properties`, `/reconciliations`, `/leases/upload`, `/settings/billing`, `/profile`, and `/help` redirect to `/checkout`. Clicking `Start 30-Day Trial` does not clear the gate.

**Repro:**

1. Open `https://app.capveri.com/auth/register`.
2. Register a new `prodtest+...@example.com` account with `TestPass123!`.
3. Land on `/checkout?source=signup`.
4. Click `Start 30-Day Trial`.
5. Observe the user remains gated; navigating to `/dashboard` returns to `/checkout`.

**Evidence:**

- Console error: `Access to fetch at 'https://api.capveri.com/api/v1/billing/checkout' from origin 'https://app.capveri.com' has been blocked by CORS policy`.
- Failed network request: `POST https://api.capveri.com/api/v1/billing/checkout => net::ERR_FAILED`.
- Sweep result: all protected landlord routes resolved to `https://app.capveri.com/checkout`.

**Likely root cause:** Production API CORS is not returning `Access-Control-Allow-Origin` for the checkout POST, or the endpoint is erroring before CORS middleware adds headers. The frontend route guard in `frontend/src/components/auth/ProtectedRoute.tsx` then keeps redirecting because `checkout_required` remains true.

**Remediation:**

- Fix production API CORS for `POST /api/v1/billing/checkout`, including error responses and preflight.
- Add a production smoke test that registers a disposable user, clicks the no-card trial CTA, and asserts access to `/dashboard`.
- Decide product behavior: if the CTA truly requires Stripe checkout, remove “No credit card required” copy; if it is no-card, do not call the Stripe checkout endpoint to activate access.
- Add backend/API monitoring for failed checkout requests by origin and status.

### P1 - Production seeded test credentials are absent or stale

**Impact:** The planned sandbox-like production audit cannot cover seeded properties, leases, reconciliations, tenant disputes, billing history, or role-permission scenarios.

**Repro:**

1. Open `https://app.capveri.com/auth/login`.
2. Try `prodtest+owner@acme.example.com / TestPass123!`.
3. Supabase password-token request returns `400`.
4. Repeat with tenant login `prodtest+lisa.tenant@salon.com / TestPass123!`; same `400`.

**Remediation:**

- Run `supabase/seeds/cleanup_production_test.sql`, then `supabase/seeds/seed_production_test.sql` against production.
- Add a lightweight production-test-data verification job that checks `prodtest+%` auth users and `[PROD-TEST]%` org records exist before any manual E2E session.
- Keep seeded passwords documented but rotate/reset them before each audit window.

### P1 - Tenant login failure leaves the form in a stuck loading state

**Impact:** Invalid or stale tenant credentials do not recover cleanly. After the Supabase `400`, the tenant login screen still shows `Signing in...` with the button disabled, and no useful inline error appeared in the captured state.

**Repro:**

1. Open `https://app.capveri.com/tenant/login`.
2. Enter `prodtest+lisa.tenant@salon.com / TestPass123!`.
3. Click sign in.
4. Observe `POST .../auth/v1/token?grant_type=password => 400`.
5. Form remains on `Signing in...`.

**Remediation:**

- Ensure tenant auth catches Supabase errors, resets submitting/loading state in `finally`, and displays an accessible error.
- Add a tenant-login E2E test for invalid credentials and stale seeded credentials.

## P2 Findings

### P2 - Sidebar navigation points to routes that do not exist

**Impact:** Some nav items will route users to the 404 page once the checkout gate is resolved.

**Evidence from source:**

- `frontend/src/config/navigation.ts` has `Data Imports` pointing to `/imports`, but `frontend/src/App.tsx` defines `/ingestion`.
- `frontend/src/config/navigation.ts` has `Team` pointing to `/team`, but `frontend/src/App.tsx` defines `/settings/team` and `/team/signup`.

**Remediation:**

- Change `Data Imports` href to `/ingestion`.
- Change `Team` href to `/settings/team`.
- Add a navigation config test that each internal href maps to a defined route or explicit redirect.

### P2 - Checkout controls are noisy and easy to spam

**Impact:** The sweep observed repeated `PUT /api/v1/billing/plan-selection` calls while toggling packages, cadence, and sizing. Some were aborted during route changes. This is not the main blocker, but it makes checkout diagnostics noisy and may cause stale saved selections.

**Remediation:**

- Debounce or commit plan-selection changes on deliberate CTA actions.
- Treat aborted plan-selection writes as non-error telemetry, separate from checkout activation failures.

## Coverage Gaps

The following planned areas could not be completed because seeded production users were unavailable and the live signup account could not pass checkout activation:

- Existing properties, leases, units, pools, imports, reconciliations, certificates, disputes, tenant portal data, and invoices.
- Role coverage for owner/admin/member/viewer.
- File upload workflows for GL CSV, rent roll CSV, and lease PDF.
- Billing cancel/resume and invoice detail workflows.
- RLS and cross-organization access checks.

## Recommended Execution Order

1. Fix the checkout CORS/activation blocker and confirm a new user can reach `/dashboard`.
2. Refresh production `[PROD-TEST]` seed data and verify all documented test users can log in.
3. Fix the tenant-login loading-state error path.
4. Fix static navigation href mismatches.
5. Re-run the full `playwright-cli` app audit against seeded owner/admin/member/viewer/tenant users across desktop and mobile.
6. After the follow-up audit, run `supabase/seeds/cleanup_production_test.sql` or explicitly retain `[PROD-TEST]` data for recurring audits.

## Acceptance Tests To Add

- New signup with no-card trial can reach `/dashboard` after clicking the checkout CTA.
- `POST /api/v1/billing/checkout` returns CORS headers for success and error paths from `https://app.capveri.com`.
- Invalid tenant login shows an error and re-enables the submit button.
- Every sidebar and bottom-nav route resolves to a real route or documented redirect.
- Production seed verification confirms all `prodtest+%` accounts before manual E2E begins.
