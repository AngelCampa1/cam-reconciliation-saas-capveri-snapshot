# Production E2E Manual QA - 2026-05-06

## Scope

Targets:

- Marketing: `https://www.capveri.com`
- App: `https://app.capveri.com`
- API: `https://api.capveri.com`

Artifacts were captured locally under `output/playwright/prod-e2e-2026-05-06/`.
Production test credentials were stored only in ignored `.env.local` as `E2E_PROD_*` variables.

## Coverage

- Public marketing routes: home, pricing, product tour, contact, resources hubs, tool page, legacy blog redirect, and 404.
- App unauthenticated routes: login, register, forgot password, legacy auth redirects, protected dashboard redirect, tenant login/signup, app 404.
- New user activation: email/password registration, welcome call, plan selection, no-card trial activation, dashboard arrival.
- Authenticated landlord app routes: dashboard, portfolio, properties, property creation/detail, GL ingestion, rent roll upload, lease upload, reconciliations, pools, analysis, disputes, certificates, tax protest, profile, billing, invoices, organization settings, team, admin feedback, help, legacy warranty redirect.
- Tenant protected route behavior: landlord owner account is sent to `/403` for `/tenant/dashboard`.
- Mobile smoke: marketing home and app dashboard at 390 x 844.
- API smoke: `/health`.

## Findings

### P1 - API health is degraded because production object storage denies access

Route: `GET https://api.capveri.com/health`

Evidence:

```json
{
  "status": "degraded",
  "checks": {
    "database": { "status": "healthy" },
    "storage": {
      "status": "unhealthy",
      "message": "Access denied to object storage bucket"
    },
    "document_reader": { "status": "healthy" },
    "payments": { "status": "healthy" },
    "email": { "status": "healthy" }
  }
}
```

Expected: production health should be `healthy` unless a dependency is intentionally disabled.

Actual: production is operational but degraded due to object storage access.

Fix status: not fixed in repo. Root cause appears to be production storage credentials, bucket policy, or bucket IAM, not frontend/backend application code. This blocks confidence in document/upload-heavy workflows until production storage is corrected and `/health` returns healthy.

### P2 - Property setup CTA changes the URL hash but does not open the target tab

Route: `https://app.capveri.com/properties/:propertyId`

Repro:

1. Register a new production test account.
2. Start the no-card trial.
3. Create a property manually.
4. On the property detail page, click `Add your first unit`.

Expected: the Units tab becomes active so the user can continue property setup.

Actual: the URL changes to `#units`, but the Overview tab stays active.

Evidence: `property-detail.yaml` and `add-unit-modal.yaml`.

Root cause: `PropertyDetailPage` used uncontrolled tabs with `defaultValue="overview"` while the CTA only updated `window.location.hash`.

Fix status: fixed in repo. The page now controls tab state from the URL hash and updates tab state when setup CTAs are clicked. Regression coverage added in `PropertyDetailPage.test.tsx`.

## Non-Issues / Notes

- Marketing 404 returned HTTP 404 and rendered the expected 404 view.
- App unknown route rendered the SPA 404 page with HTTP 200, expected for a client-routed Vite app.
- Third-party analytics/Sentry failures seen during one route matrix were caused by local request blocking in the browser session and were not counted as product defects.
- Billing checkout was tested only through safe no-card trial activation. No real payment credentials were entered.
