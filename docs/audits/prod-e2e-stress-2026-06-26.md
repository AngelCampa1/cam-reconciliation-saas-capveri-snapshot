# Production E2E Stress Evidence - 2026-06-26

This pass added repeatable production harnesses for authenticated smoke, core data mutation, core data updates, core data browser forms, lease term versioning, GL ingestion, GL ingestion browser upload, actual billed upload/leakage, actual billed manual entry/rematching, pool mapping, pool templates, pool allocations, pool configuration browser coverage, explicit comparison, export detail advisor, CapEx classification/review, draft reconciliation/export, persisted PDF export/download, persisted export variants, historical PDF/XLSX reports, GL narrative analysis, cross-document analysis, positive denominator-change JSON/PDF reporting, reconciliation proration, document upload, document extraction guards, lease upload browser flow, extraction inbox browser UI, extraction verification browser draft/reject, SB 1103, tenant preferences mutation/restore, tenant dashboard read-only API/browser coverage, tenant statement PDF read-only coverage, tenant dispute browser read-only coverage, tenant dispute detail read-only coverage, tenant dispute create-form read-only coverage, tenant notifications read-only coverage, tenant dispute negative/no-persistence coverage, landlord/admin dispute browser read-only empty-state coverage, landlord/admin dispute negative/no-persistence coverage, audit-trail read-only filtering/JSONB coverage, audit-log CSV export filtering coverage, account/billing/team read-only, billing lifecycle negative/no-persistence coverage, organization settings mutation/restore, settings UI read-only browser coverage, account deletion UI guard coverage, rent roll import, rent roll browser upload, tax protest deadlines, dashboard/portfolio read-only, analysis no-comparable/CapEx empty-state, analysis anomaly detection, public tool calculators, public tool browser flows, public acquisition negative/no-persistence routes, public contact/feedback honeypot no-persistence routes, and post-run cleanup-audit workflows. The scripts use the production Supabase project from `frontend/.env.production.local` and read the QA account from ignored `.env.local`.

## Credentials

- Production E2E landlord email: `e2e-prod-20260626003931-6aa5f2@example.com`
- Password: stored only in ignored `.env.local` as `E2E_PROD_PASSWORD`.
- Account status: no-card trial started through `POST /api/v1/billing/trial/start-default` on 2026-06-26, returning `subscription_status: "trialing"` and `has_active_access: true`.

Do not commit the password or service-role secrets. The older ignored production E2E credentials in `.env.local` were stale and returned Supabase `invalid_credentials`.

## Scripts

Run from `frontend/`:

```powershell
node "scripts\prod-platform-smoke.mjs"
node "scripts\prod-core-data-scenario.mjs"
node "scripts\prod-core-data-update-scenario.mjs"
node "scripts\prod-core-data-browser-scenario.mjs"
node "scripts\prod-lease-term-version-scenario.mjs"
node "scripts\prod-ingestion-scenario.mjs"
node "scripts\prod-ingestion-browser-scenario.mjs"
node "scripts\prod-actual-billed-scenario.mjs"
node "scripts\prod-actual-billed-manual-rematch-scenario.mjs"
node "scripts\prod-pool-mapping-scenario.mjs"
node "scripts\prod-pool-template-scenario.mjs"
node "scripts\prod-pool-allocation-scenario.mjs"
node "scripts\prod-pool-config-browser-scenario.mjs"
node "scripts\prod-comparison-explicit-scenario.mjs"
node "scripts\prod-export-detail-advisor-scenario.mjs"
node "scripts\prod-capex-classification-scenario.mjs"
node "scripts\prod-reconciliation-draft-export-scenario.mjs"
node "scripts\prod-reconciliation-browser-review-scenario.mjs"
node "scripts\prod-export-persisted-download-scenario.mjs"
node "scripts\prod-export-variants-scenario.mjs"
node "scripts\prod-historical-reports-scenario.mjs"
node "scripts\prod-gl-narrative-scenario.mjs"
node "scripts\prod-cross-doc-analysis-scenario.mjs"
node "scripts\prod-denominator-change-positive-scenario.mjs"
node "scripts\prod-reconciliation-proration-scenario.mjs"
node "scripts\prod-document-sb1103-scenario.mjs"
node "scripts\prod-document-extraction-guards-scenario.mjs"
node "scripts\prod-lease-upload-browser-scenario.mjs"
node "scripts\prod-extractions-inbox-ui-scenario.mjs"
node "scripts\prod-extraction-verification-browser-scenario.mjs"
node "scripts\prod-tenant-preferences-browser-scenario.mjs"
node "scripts\prod-tenant-dashboard-readonly-scenario.mjs"
node "scripts\prod-tenant-statement-pdf-readonly-scenario.mjs"
node "scripts\prod-tenant-disputes-browser-readonly-scenario.mjs"
node "scripts\prod-tenant-dispute-detail-readonly-scenario.mjs"
node "scripts\prod-tenant-dispute-create-form-readonly-scenario.mjs"
node "scripts\prod-tenant-notifications-readonly-scenario.mjs"
node "scripts\prod-tenant-disputes-negative-scenario.mjs"
node "scripts\prod-admin-disputes-browser-readonly-scenario.mjs"
node "scripts\prod-admin-disputes-negative-scenario.mjs"
node "scripts\prod-audit-trail-readonly-scenario.mjs"
node "scripts\prod-audit-log-export-readonly-scenario.mjs"
node "scripts\prod-account-billing-readonly-scenario.mjs"
node "scripts\prod-billing-lifecycle-negative-scenario.mjs"
node "scripts\prod-team-invitations-browser-scenario.mjs"
node "scripts\prod-organization-settings-mutation-scenario.mjs"
node "scripts\prod-settings-ui-readonly-scenario.mjs"
node "scripts\prod-account-deletion-guard-browser-scenario.mjs"
node "scripts\prod-rent-roll-import-scenario.mjs"
node "scripts\prod-rent-roll-browser-scenario.mjs"
node "scripts\prod-tax-protest-deadline-scenario.mjs"
node "scripts\prod-dashboard-portfolio-readonly-scenario.mjs"
node "scripts\prod-analysis-empty-property-scenario.mjs"
node "scripts\prod-analysis-anomaly-scenario.mjs"
node "scripts\prod-public-tools-calculators-scenario.mjs"
node "scripts\prod-public-tools-browser-scenario.mjs"
node "scripts\prod-public-acquisition-negative-scenario.mjs"
node "scripts\prod-public-contact-feedback-negative-scenario.mjs"
node "scripts\prod-cleanup-audit.mjs"
```

When auditing an in-flight worktree that contains failed exploratory reports, scope
`PROD_CLEANUP_AUDIT_REPORT_ROOTS` to the main evidence folder plus the final passing report
directory. The CapEx cleanup audit below used:

```powershell
$env:PROD_CLEANUP_AUDIT_REPORT_ROOTS='<repo-root>\e2e-adhoc;<repo-root>\.worktrees\e2e-prod-cycle9-2026-06-26\e2e-adhoc\prod-capex-2026-06-26T16-11-16-416Z'
node "scripts\prod-cleanup-audit.mjs"
```

The integrated Pool Allocation cleanup audit below ran from merged `master` with the
default `e2e-adhoc/` evidence root:

```powershell
node "scripts\prod-cleanup-audit.mjs"
```

The scripts write JSON reports and screenshots under `e2e-adhoc/`.

## Verified Runs

- Platform smoke: `e2e-adhoc/prod-platform-smoke-2026-06-26T12-07-13-167Z/report.json`
  - Signed in through production Supabase.
  - Checked `https://api.capveri.com/health`.
  - Checked AI-CS signing and authenticated properties list.
  - Redacted the signed AI-CS response body in the report.
  - Loaded marketing `/`, `/pricing`, `/resources`, `/tools`.
  - Reached authenticated app surfaces: `/dashboard` routed the fresh account to authenticated onboarding, and `/properties`, `/reconciliations`, `/leases/upload`, `/settings/billing` loaded without auth redirects.
  - No browser errors or failed relevant responses.
- Core data mutation: `e2e-adhoc/prod-core-data-2026-06-26T00-55-10-129Z/report.json`
  - Created a disposable property, unit, and lease in production.
  - Verified exact persisted money, square-footage, ratio, and recovery-profile values.
  - Deleted lease, unit, and property; all cleanup deletes returned 204.
- Core data updates: `e2e-adhoc/prod-core-data-update-2026-06-26T17-37-38-397Z/report.json`
  - Created a disposable property, unit, and lease in production.
  - Verified `PUT /properties/:id`, `PUT /properties/:id/units/:id`, `PUT /leases/:id`, and `PUT /leases/:id/recovery-profile` persisted exact editable fields.
  - Verified property date fields are returned as ISO timestamps and normalized them to date-only values in the harness checks.
  - Verified lease identity updates did not mutate recovery profile until the recovery-profile route was called.
  - Deleted the generated lease, unit, and property; follow-up reads verified lease, unit, property, and property-scoped lease list absence.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; its console report showed the generated lease, unit, and property were cleaned up before date normalization was corrected.
- Core data browser forms: `e2e-adhoc/prod-core-data-browser-2026-06-26T21-25-09-146Z/report.json`
  - Loaded `https://app.capveri.com/properties/new` in Chromium with the production session, switched to the manual property form, created a generated property, and verified navigation to the property detail route.
  - Opened the generated property's Units tab, created a generated unit through the visible modal, then created a generated lease through `/properties/{propertyId}/leases/new`.
  - Verified the browser made exactly the expected CapVeri mutating requests during the browser phase: `POST /api/v1/properties`, `POST /api/v1/properties/{propertyId}/units`, and `POST /api/v1/leases`.
  - Re-read the property, unit, and lease through the API and verified exact persisted values, including Decimal-string occupancy, square footage, pro-rata share, base year amount, admin fee percentage, RSF measurement standard, and accounting basis.
  - Deleted the generated lease, unit, and property; follow-up reads verified lease, unit, and property returned 404 and the property-scoped lease list returned `item_count: 0`.
  - Earlier harness-only failures in the isolated worktree are not counted as passing evidence; their console reports showed either zero mutating requests or generated property/unit/lease cleanup before the default-tab, list-shape, unit-table, and Decimal-string expectations were corrected.
- Core data browser scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-25-37-448Z/report.json`
  - Re-read the final passing core data browser forms report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `5` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, lease, unit, property-scoped document list, and property-scoped SB 1103 absence.
- Core data browser integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-27-04-285Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final core data browser forms run.
  - Verified `36` successful source reports, `0` source failures, `190` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the core data browser property, lease, unit, property-scoped document/SB1103 absence, and all prior merged production E2E cleanup surfaces.
- Lease term versioning: `e2e-adhoc/prod-lease-term-version-2026-06-26T17-26-44-446Z/report.json`
  - Created a disposable property, unit, and lease in production.
  - Verified term-version validation rejects capped terms without `cap_rate`.
  - Created two term versions, verified version numbers incremented, eight-decimal normalized recovery percentages persisted, and list ordering returned the newest effective date first.
  - Verified effective-date lookup selected the January version for March 31 and the July version for October 1.
  - Deleted the newest term version and verified October effective lookup fell back to the January version.
  - Deleted generated term versions, lease, unit, and property; follow-up reads verified term version, lease, unit, and property absence.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; its console report showed generated term versions, lease, unit, and property were cleaned up before the decimal precision expectation was corrected.
- GL ingestion: `e2e-adhoc/prod-ingestion-2026-06-26T00-55-21-432Z/report.json`
  - Created a disposable property.
  - Uploaded a Yardi-shaped CSV with debit rows and a credit memo row.
  - Verified upload normalization, persisted preview rows, GL date range, and batch list membership.
  - Deleted the import batch and property.
  - Verified post-delete batch and GL date-range reads returned 404.
- GL ingestion browser upload: `e2e-adhoc/prod-ingestion-browser-2026-06-26T20-19-09-774Z/report.json`
  - Loaded `https://app.capveri.com/ingestion` in Chromium with the production session, selected a generated property through the visible property selector, and uploaded a generated Yardi-shaped GL CSV through the visible file input.
  - Verified the production `/api/v1/ingestion/upload` browser request returned `source_system: "yardi"`, `row_count: 4`, `error_count: 0`, and the expected detected columns.
  - Clicked `Continue`, verified the UI rendered the successful GL preview table, and verified the browser made only the expected CapVeri mutating request for GL upload with no browser errors and no relevant failed responses.
  - Re-read the generated batch through the API and verified exact persisted preview rows for Janitorial, Security, Repairs credit memo, and Utilities with Decimal-string debit, credit, and balance values.
  - Verified the generated property GL date range and batch-list membership.
  - Deleted the generated GL batch and property; follow-up reads verified the batch returned 404, the property GL date range returned 404, and the property returned 404.
  - Earlier harness-only failure `e2e-adhoc/prod-ingestion-browser-2026-06-26T20-17-51-281Z/report.json` is not counted as passing evidence; its console report showed the generated batch and property were deleted and verified absent before the preview assertion was corrected.
- Actual billed/leakage: `e2e-adhoc/prod-actual-billed-2026-06-26T12-18-23-179Z/report.json`
  - Created a disposable property, unit, and lease.
  - Uploaded a Yardi-shaped actual-billed CSV with one matched tenant row and one unmatched review row.
  - Verified total billed amount, matched/unmatched counts, list totals, and leakage output with billing data and no reconciliation snapshots.
  - Deleted period-scoped actual billed rows and verified list total returned `0` with zero items.
  - Deleted lease, unit, and property; all cleanup deletes returned 204.
- Actual billed manual entry/rematching: `e2e-adhoc/prod-actual-billed-manual-rematch-2026-06-26T17-02-26-332Z/report.json`
  - Created a disposable property, unit, lease, and expense pool.
  - Uploaded a one-row billing CSV that intentionally produced a `needs_review` row with `source_type: "csv_import"`.
  - Verified duplicate billing rematch payloads return `duplicate_billing_match`.
  - Rematched the review row to the generated lease and verified `updated_count: 1`.
  - Verified manual actual-billed entry rejects negative money with `invalid_money_amount` and unknown pools with `pool_not_found`.
  - Created a valid pool-scoped manual billed row and verified the final list total `411.86`, rematched lease ID, manual source type, and pool ID.
  - Deleted period-scoped actual billed rows and verified list total returned `0` with zero items, then deleted lease, unit, pool, and property; follow-up reads verified pool and property returned 404.
  - Earlier harness-only failures in the isolated worktree are not counted as passing evidence; their console reports showed generated actual billed rows were deleted and generated records were cleaned up before the harness was corrected.
- Pool mapping: `e2e-adhoc/prod-pool-mapping-2026-06-26T12-11-51-651Z/report.json`
  - Created a disposable property and expense pool.
  - Created a GL account pool mapping and verified four-decimal normalized allocation values.
  - Verified invalid GL account pattern validation returns `invalid_gl_account_pattern`.
  - Verified pool-filtered mapping list and update behavior.
  - Deleted mapping, verified pool-filtered list returned zero mappings, deleted pool, verified pool read returned 404, and deleted property.
- Pool templates: `e2e-adhoc/prod-pool-template-2026-06-26T15-01-27-891Z/report.json`
  - Verified duplicate pool names in a template return `validation_error` before persistence.
  - Created a disposable custom pool template, verified list/detail behavior, updated its hierarchy, and verified the version increment.
  - Created two disposable production properties, applied the template to the source property, and copied the generated parent-child hierarchy to the target property in replace mode.
  - Verified same-property copy returns `validation_error`.
  - Deleted the custom template and both properties, then verified template and property reads returned 404.
- Pool allocations: `e2e-adhoc/prod-pool-allocation-2026-06-26T16-31-14-529Z/report.json`
  - Created a disposable property and four expense pools.
  - Verified unsupported fixed amount allocations return `unsupported_allocation_type`.
  - Verified self-allocation returns `self_allocation`.
  - Created two percentage allocations and verified four-decimal normalized values.
  - Verified duplicate source/target pairs return `pool_allocation_conflict`.
  - Verified percentage totals above 100 return `allocation_total_exceeded`.
  - Updated one allocation so the source pool total reached exactly 100 and verified the filtered source-pool list returned both rows.
  - Deleted both allocations, verified the source-pool allocation list returned `count: 0`, deleted all four pools, verified each pool read returned 404, deleted the property, and verified the property read returned 404.
  - Earlier harness-only failures in the isolated worktree are not counted as passing evidence; their console reports showed generated allocations were deleted, the allocation list returned `count: 0`, generated pools were deleted, and the generated property was deleted before the harness was corrected.
- Pool configuration browser flow: `e2e-adhoc/prod-pool-config-browser-2026-06-26T21-50-06-269Z/report.json`
  - Created a disposable property through the API, loaded its Pools tab in Chromium with the production session, and created two expense pools through the visible browser modal.
  - Created and updated a GL account mapping through the browser dialog, verifying the final pattern `92*`, normalized allocation percentage `0.8500`, and priority `100`.
  - Created a split allocation through the browser dialog and verified the exact source pool, target pool, allocation type, and normalized value `25.0000`.
  - Verified the browser made exactly the expected CapVeri mutating requests during the browser phase: two `POST /expense-pools` calls, one `POST /pool-mappings`, one `PUT /pool-mappings/{mappingId}`, and one `POST /pool-allocations`.
  - Verified no unexpected Supabase mutating requests occurred during the browser phase and redacted query strings in recorded browser request URLs.
  - Re-read the generated property, pools, mapping, and allocation through the API and verified exact persisted Decimal-string values.
  - Deleted the generated property; follow-up reads verified the property, both pools, mapping, and allocation returned 404.
  - Earlier harness-only failures in the isolated worktree are not counted as passing evidence; their console reports showed generated properties and pool rows were deleted or were manually cleaned and verified 404 before selector and Decimal-string expectations were corrected.
- Pool configuration browser scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-50-41-650Z/report.json`
  - Re-read the final passing pool configuration browser report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `8` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, both pools, mapping, allocation, source-pool allocation list absence, and property-scoped document/SB1103 absence.
- Pool configuration browser integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-54-24-842Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final pool configuration browser run.
  - Verified `37` successful source reports, `0` source failures, `198` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the pool configuration browser property, both pools, mapping, allocation, source-pool allocation list absence, property-scoped document/SB1103 absence, and all prior merged production E2E cleanup surfaces.
- Tenant preferences browser mutation/restore: `e2e-adhoc/prod-tenant-preferences-browser-2026-06-26T22-15-58-417Z/report.json`
  - The harness signs in as the production tenant E2E user, proves a persisted preference row already exists with two stable pre-mutation `GET /api/v1/tenant/notifications/preferences` `updated_at` values, snapshots the four booleans, loads `/tenant/preferences` in Chromium, toggles all four visible switches through the UI, verifies the toggled state through the API and browser, restores the exact original booleans through `PUT /api/v1/tenant/notifications/preferences`, reloads the browser, and verifies the final API and UI state matches the initial snapshot.
  - The run started with `new_statement_emails: true`, `dispute_update_emails: true`, `reminder_emails: true`, and `marketing_emails: false`; toggled all four values to the opposite state; then restored the same initial values through API and browser readback.
  - The browser phase made exactly four expected CapVeri mutating requests, all `PUT /api/v1/tenant/notifications/preferences`; Cloudflare RUM beacons were ignored as external browser telemetry, and there were no unexpected app mutating requests, browser errors, or failed relevant responses.
  - If the preflight sees a synthetic default response instead of an existing stored row, the harness aborts before any browser toggle or `PUT` because the public tenant API can restore booleans but cannot delete a newly inserted default-equivalent row without service-role database access.
  - The cleanup audit validates the report-level before/after snapshots and cleanup checks.
- Tenant preferences scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T22-16-25-850Z/report.json`
  - Re-read the final passing tenant preferences browser report.
  - Verified `1` successful source report, `0` source failures, `1` restore-proof cleanup check, and `0` cleanup failures.
- Tenant preferences integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T22-16-32-368Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final tenant preferences browser run.
  - Verified `38` successful source reports, `0` source failures, `199` cleanup/proof checks, and `0` cleanup failures.
- Tenant dashboard read-only API/browser: `e2e-adhoc/prod-tenant-dashboard-readonly-2026-06-27T14-37-27-433Z/report.json`
  - Signs in as the production tenant E2E user.
  - Reads `GET /api/v1/tenant/dashboard`, validates lease and statement row schemas, reads all and unread notifications, verifies the dashboard unread count matches the unread list, and snapshots notification counts.
  - Loads `/tenant/dashboard` in Chromium with the production Supabase session, waits for the real dashboard API response, and verifies the tenant dashboard, lease, and statement sections render without auth redirects, browser errors, failed relevant responses, or app mutating requests.
  - Re-reads tenant preferences after the browser run and verifies the read-only scenario did not change the original booleans or create persistent IDs.
- Tenant dashboard integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T14-43-41-471Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant dashboard read-only run.
  - Verified `49` successful source reports, `0` source failures, `333` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the tenant dashboard report-level no-persistent-write proof and unchanged tenant preference snapshot.
- Tenant statement PDF read-only: `e2e-adhoc/prod-tenant-statement-pdf-readonly-2026-06-27T16-51-43-491Z/report.json`
  - Signs in as the production tenant E2E user.
  - Reads `GET /api/v1/tenant/dashboard`, selects the existing statement `36ae051a-a244-4d5e-83ed-02cc4f1b6714`, and verifies its `pdf_url` is exactly `/api/v1/tenant/statements/{statementId}/pdf`.
  - Downloads the real tenant statement PDF and verifies `200`, `application/pdf`, `attachment; filename="Reconciliation_*.pdf"`, matching `Content-Length`, `%PDF` magic bytes, and payload length greater than 1000 bytes.
  - Verifies a random statement PDF route returns `not_found` and re-reads dashboard/preference summaries to prove the read-only probes left tenant state unchanged.
  - Creates no persistent IDs, makes no browser or app mutating requests, and records read-only cleanup proof.
- Tenant statement PDF integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T16-52-05-650Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant statement PDF read-only run.
  - Verified `58` successful source reports, `0` source failures, `342` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the tenant statement PDF report-level no-persistent-write proof.
- Tenant disputes browser read-only: `e2e-adhoc/prod-tenant-disputes-browser-readonly-2026-06-27T17-12-57-393Z/report.json`
  - Signs in as the production tenant E2E user.
  - Snapshots `GET /api/v1/tenant/disputes` and `GET /api/v1/tenant/disputes/720d0efa-a805-42a2-a932-d47d1db96a3d` before browser navigation.
  - Loads `/tenant/disputes` and `/tenant/disputes/720d0efa-a805-42a2-a932-d47d1db96a3d` in Chromium with the production Supabase session, waits for real list/detail API responses, and verifies the dispute history, known billing-question card, detail title, disputed text, discussion section, and visible comment form.
  - Fails the run on any CapVeri-origin mutating request other than ignored Cloudflare RUM telemetry, and re-reads the list/detail afterward to prove the browser scenario left tenant dispute state unchanged.
  - Creates no persistent IDs and records read-only cleanup proof for the aggregate cleanup audit.
- Tenant disputes browser read-only integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T17-13-21-798Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant disputes browser read-only run.
  - Verified `59` successful source reports, `0` source failures, `343` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the tenant-disputes browser report-level no-persistent-write proof.
- Tenant dispute detail read-only: `e2e-adhoc/prod-tenant-dispute-detail-readonly-2026-06-27T18-09-52-019Z/report.json`
  - Signs in as the production tenant E2E user.
  - Snapshots `GET /api/v1/tenant/disputes` and `GET /api/v1/tenant/disputes/:id` before browser navigation, using the tenant's existing production test dispute.
  - Loads `/tenant/disputes/:id` in Chromium with the production Supabase session, blocks PostHog analytics requests, waits for the real dispute-detail API response, and verifies the category heading, disputed description, discussion thread, and empty-comment disabled submit state.
  - Does not type or submit comments and does not download attachments; aborts and fails the run on any CapVeri-origin mutating request other than ignored Cloudflare RUM telemetry.
  - Re-reads the dispute list and detail afterward to prove comments, attachments, status, and summary fields were unchanged and no persistent IDs were created.
- Tenant dispute detail read-only integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T18-10-22-135Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant dispute detail read-only run.
  - Verified `62` successful source reports, `0` source failures, `346` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the dispute-detail report-level no-persistent-write proof.
- Tenant dispute create-form read-only: `e2e-adhoc/prod-tenant-dispute-create-form-readonly-2026-06-27T17-28-48-196Z/report.json`
  - Signs in as the production tenant E2E user.
  - Reads `GET /api/v1/tenant/dashboard`, selects an existing statement, and snapshots `GET /api/v1/tenant/disputes` before browser navigation.
  - Loads `/tenant/disputes/new?statement_id={statementId}` in Chromium with the production Supabase session and verifies the submit-dispute heading, category placeholder, description field, cancel button, and disabled submit button render.
  - Does not fill or submit the form; fails the run on any CapVeri-origin mutating request other than ignored Cloudflare RUM telemetry.
  - Re-reads the dispute list afterward to prove the create-form route left tenant dispute state unchanged and created no persistent IDs.
- Tenant dispute create-form read-only integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T17-29-16-691Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant dispute create-form read-only run.
  - Verified `60` successful source reports, `0` source failures, `344` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the create-form report-level no-persistent-write proof.
- Tenant notifications read-only: `e2e-adhoc/prod-tenant-notifications-readonly-2026-06-27T17-54-49-918Z/report.json`
  - Signs in as the production tenant E2E user.
  - Snapshots `GET /api/v1/tenant/dashboard`, `GET /api/v1/tenant/notifications`, and `GET /api/v1/tenant/notifications?unread_only=true` before browser navigation.
  - Loads `/tenant/notifications` in Chromium with the production Supabase session, blocks PostHog analytics requests, waits for the real notifications API response, and verifies the notifications heading plus either the first notification row or the empty state.
  - Does not click notification rows or the `Mark all read` button; aborts and fails the run on any CapVeri-origin mutating request other than ignored Cloudflare RUM telemetry.
  - Re-reads dashboard and notification lists afterward to prove unread counts, notification rows, and read states were unchanged and no persistent IDs were created.
- Tenant notifications read-only integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T17-58-50-612Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant notifications read-only run.
  - Verified `61` successful source reports, `0` source failures, `345` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the notifications report-level no-persistent-write proof.
- Tenant disputes negative/no-persistence: `e2e-adhoc/prod-tenant-disputes-negative-2026-06-27T16-22-57-460Z/report.json`
  - Signs in as the production tenant E2E user.
  - Snapshots `GET /api/v1/tenant/disputes` before and after the negative probes; the live tenant had `1` existing dispute and the final canonical list matched the initial list exactly.
  - Verifies invalid dispute category rejects with `validation_error`, unknown statement creation rejects with `not_found`, unknown dispute detail rejects with `not_found`, and unknown dispute comment creation rejects with `not_found`.
  - Verifies attachment missing-file, zero-byte file, and invalid-content-type branches reject before R2 storage writes; deliberately avoids non-empty allowed file uploads against a random dispute because that route writes to R2 before DB ownership failure and only rolls back best-effort.
  - Creates no persistent IDs and records the random statement, dispute, and attachment IDs used for the no-persistence probes.
- Tenant disputes negative integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T16-23-26-628Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final tenant disputes negative run.
  - Verified `56` successful source reports, `0` source failures, `340` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the tenant-disputes report-level no-persistent-ID proof.
- Landlord/admin disputes browser read-only: `e2e-adhoc/prod-admin-disputes-browser-readonly-2026-06-27T18-29-46-775Z/report.json`
  - Signs in as the production landlord E2E user.
  - Snapshots `GET /api/v1/disputes` and status-filtered list routes for `open`, `under_review`, and `resolved`; the current landlord production fixture list is empty.
  - Loads `/disputes` in Chromium with the production Supabase session, blocks PostHog analytics requests, waits for the real disputes API response, and verifies the page heading, status filter, `No disputes yet` empty state, `0 total`, and `0 need response` counters.
  - Does not navigate to dispute detail because the current landlord fixture list is empty; aborts and fails the run on any CapVeri-origin mutating request other than ignored Cloudflare RUM telemetry.
  - Re-reads the admin dispute list afterward to prove the list remained empty and no persistent IDs were created.
- Landlord/admin disputes browser read-only integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T18-30-12-435Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final landlord/admin disputes browser read-only run.
  - Verified `63` successful source reports, `0` source failures, `347` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the admin-disputes browser report-level no-persistent-write proof.
- Landlord/admin disputes negative/no-persistence: `e2e-adhoc/prod-admin-disputes-negative-2026-06-27T16-38-06-028Z/report.json`
  - Signs in as the production landlord E2E user.
  - Snapshots `GET /api/v1/disputes` before and after the negative probes; the live landlord dispute list was empty and the final canonical list matched the initial list exactly.
  - Verifies invalid status filter and over-limit pagination reject with `validation_error` before list queries.
  - Verifies random dispute detail, random attachment metadata download, random dispute status update, and random dispute comment creation reject with `not_found` without persistent writes.
  - Verifies invalid dispute UUID, invalid JSON status update, invalid status body, and empty comment body reject with stable validation/JSON error codes.
  - Creates no persistent IDs and deliberately avoids valid status updates or valid comments against existing disputes.
- Landlord/admin disputes negative integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T16-38-27-382Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final landlord/admin disputes negative run.
  - Verified `57` successful source reports, `0` source failures, `341` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the landlord/admin disputes report-level no-persistent-ID proof.
- Audit trail read-only filters/JSONB: `e2e-adhoc/prod-audit-trail-readonly-2026-06-27T14-54-21-079Z/report.json`
  - Signs in as the production landlord E2E user.
  - Reads `GET /api/v1/audit-trail?page=1&page_size=5` and verifies the paginated envelope, row shape, allowed operation values, UUID scoping fields, and parsed JSONB shape.
  - Verifies table, operation, date, and row-id filters against existing immutable audit rows produced by prior cleaned production E2E runs.
  - Verifies invalid `row_id` and over-limit `page_size` return `validation_error`.
  - Creates no persistent IDs, makes no mutating app requests, and records read-only cleanup proof.
- Audit trail integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T15-00-13-856Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final audit trail read-only run.
  - Verified `50` successful source reports, `0` source failures, `334` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the audit-trail report-level no-persistent-write proof.
- Audit-log CSV export read-only filters: `e2e-adhoc/prod-audit-log-export-readonly-2026-06-27T15-22-49-132Z/report.json`
  - Signs in as the production landlord E2E user.
  - Reads `GET /api/v1/exports/audit-log?limit=5` and verifies the CSV content type, dated attachment filename, exact header fields, row shape, allowed operation values, and UUID row ID shape.
  - Verifies table, operation, date, and row-id filters against existing immutable audit rows produced by prior cleaned production E2E runs.
  - Verifies invalid `row_id` and over-limit `limit` return `validation_error`.
  - Creates no persistent IDs, makes no mutating app requests, and records read-only cleanup proof.
- Audit-log CSV export integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T15-23-06-444Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final audit-log CSV export read-only run.
  - Verified `52` successful source reports, `0` source failures, `336` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the audit-log CSV export report-level no-persistent-write proof.
- Billing lifecycle negative/no-persistence: `e2e-adhoc/prod-billing-lifecycle-negative-2026-06-27T15-37-46-481Z/report.json`
  - Signs in as the production landlord E2E user.
  - Snapshots plan selection, subscription, and organization settings before the probes.
  - Verifies `POST /api/v1/billing/checkout` rejects mutually exclusive `offer_token` and `launch_offer_code` before checkout session creation.
  - Verifies `GET /api/v1/billing/checkout/success` without `session_id` and `POST /api/v1/billing/portal` without `return_url` reject before Stripe lookup/session creation.
  - Verifies subscription upgrade and downgrade return the disabled-plan-change contract.
  - Re-reads plan selection, subscription, and organization settings and proves they deep-equal the initial snapshots.
  - Creates no persistent IDs and avoids valid Stripe checkout, checkout-success, or portal calls.
- Billing lifecycle negative integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T15-38-12-770Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final billing lifecycle negative run.
  - Verified `53` successful source reports, `0` source failures, `337` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the billing negative report-level no-persistent-ID proof.
- Explicit comparison: `e2e-adhoc/prod-comparison-explicit-2026-06-26T15-36-19-292Z/report.json`
  - Created a disposable property, unit, lease, expense pool, pool mapping, GL import batch, and draft reconciliation snapshot.
  - Ran `POST /api/v1/comparison/:propertyId` with explicit charges and `include_drafts=true`; did not call the persisted `/runs` route.
  - Verified exact Decimal totals: `total_capveri_correct: "5005"`, `total_actual_charged: "5323.45"`, `total_net_variance: "318.45"`, and `total_overcharge: "318.45"`.
  - Verified matched and unmatched tenant rows, including the unmatched charge review note.
  - Verified matched-lease pool-level variance after the production bug fix: pool `capveri_correct: "5005"`, `actual_charged: "5200"`, `variance: "195"`, and `variance_pct: "3.90"`.
  - Verified omitting `include_drafts` excludes the draft snapshot, reversed periods return `invalid_period`, and the compute route creates no stored comparison runs.
  - Deleted the GL batch, mapping, pool, and property, then verified property, lease, unit, snapshots, and calculation job were absent.
- Export detail advisor: `e2e-adhoc/prod-export-detail-advisor-2026-06-26T15-55-46-921Z/report.json`
  - Created a disposable property, expense pool, GL mapping, and six-row Yardi GL import.
  - Verified the upload returned `source_system: "yardi"`, `row_count: 6`, and `error_count: 0`.
  - Ran `POST /api/v1/export/detail-advisor` and verified deterministic Decimal output: `total_line_items: 6`, `total_categories: 1`, `overall_severity: "suggestion"`, `suggested_total_lines: 1`, and immaterial percentage `"0.2493765586034912718204488778"`.
  - Verified the grouping suggestion collapses the six detail rows to one pool line and the 2027 empty year returns the no-line suggestion.
  - Verified malformed JSON returns `400` with `error.code: "invalid_json"` after the production bug fix.
  - Deleted the GL batch, mapping, pool, and property, then verified batch, pool, and property reads returned 404; the mapping cleanup also verified the pool-filtered mapping list returned `count: 0` and `item_count: 0`.
- CapEx classification and review: `e2e-adhoc/prod-capex-2026-06-26T16-11-16-416Z/report.json`
  - Created a disposable property and uploaded a three-row Yardi GL fixture with two CapEx-positive rows and one normal OpEx row.
  - Verified upload and batch detail persisted exact source rows: account `1500` at `125000.00`, account `6300` at `30000.00`, and account `6200` at `500.00`.
  - Ran `POST /api/v1/analysis/capex-classify` and verified `gl_entries_scanned: 3` and `flags_created: 9`.
  - Verified exact deterministic rule hits, confidence scores, matched patterns, classifier version, and reasons for amount threshold, account keyword, account code prefix, vendor pattern, and amount-keyword combo rules.
  - Verified summary counts unique flagged GL amounts: `total: 9`, `pending: 9`, and `total_flagged_amount: "155000.00"`.
  - Verified bulk review with one valid and one missing flag ID returns `capex_flag_not_found` and leaves all flags pending.
  - Dismissed one flag, bulk-confirmed the remaining eight, and verified final summary `pending: 0`, `confirmed_capex: 8`, `dismissed: 1`, `total_flagged_amount: "155000.00"`.
  - Deleted the GL batch and property, then verified batch and property reads returned 404, CapEx flags returned `[]`, and CapEx summary reset to zero.
- Draft reconciliation/export: `e2e-adhoc/prod-reconciliation-draft-export-2026-06-26T12-31-37-191Z/report.json`
  - Created a disposable property, unit, lease, expense pool, pool mapping, and GL import batch.
  - Ran production reconciliation calculation through the real queue and verified the completed job produced one draft snapshot.
  - Verified deterministic recovery math: `total_operating_expenses: "5000.00"`, `grossed_up_expenses: "23750.00"`, `tenant_share_after_cap: "4550.00"`, `admin_fee: "455.00"`, `total_recovery: "5005.00"`.
  - Updated the draft snapshot `admin_fee` cell and verified a manual override response.
  - Streamed the draft snapshot PDF with `allow_draft=true`, verified PDF bytes, and verified no `export_history` row was created.
  - Deleted the GL batch, mapping, pool, and property; verified the property read returned 404, property-scoped snapshots returned zero rows, and the calculation job returned 404.
- Persisted PDF export/download: `e2e-adhoc/prod-export-persisted-download-2026-06-27T01-50-52-063Z/report.json`
  - Deployed backend cleanup support to Cloudflare Worker `capveri-api` version `d03e6be2-e5af-40c5-927b-a6d80360f54f` and verified `100%` current deployment plus healthy `https://api.capveri.com/health`.
  - Created a disposable property, unit, lease, expense pool, GL mapping, and Yardi GL batch in production; ran reconciliation through the real queue and finalized the generated snapshot before export.
  - Called `POST /api/v1/export/pdf/download`, verified streamed PDF bytes, captured `X-CapVeri-Export-Id` and R2 storage path headers, listed `export_history`, called `/api/v1/export/download/{id}`, fetched the signed public URL, and verified the downloaded PDF byte length matched the direct export.
  - Cleaned up with `DELETE /api/v1/export/history/b3fabbd1-5636-4320-a305-a93fbbd9b73d`, verified re-download returned 404, verified property export history was empty, verified the exact `capveri-reports` R2 object was missing through Wrangler, then deleted and rechecked the generated property, snapshot, job, batch, mapping, pool, lease, and unit.
  - The pre-fix exploratory report was moved out of the default audit root to `e2e-adhoc-failed/prod-export-persisted-download-2026-06-27T01-49-35-984Z/report.json`; it failed only because the harness asserted a non-public `is_finalized` field. Its cleanup block proved no export history or R2 object was created and removed the generated business rows.
- Persisted export variants: `e2e-adhoc/prod-export-variants-2026-06-27T02-18-13-686Z/report.json`
  - Deployed backend export-header support to Cloudflare Worker `capveri-api` version `3b206820-2859-4888-b62c-84badcd9ae5f` and verified `100%` current deployment plus healthy `https://api.capveri.com/health`.
  - Created a disposable property, unit, lease, expense pool, pool mapping, and Yardi GL batch in production; ran reconciliation through the real queue, verified deterministic recovery math, and finalized the generated snapshot before export.
  - Exercised persisted single PDF, batch ZIP, variance PDF, variance XLSX, board preview, and board download. Verified PDF magic bytes, ZIP/XLSX ZIP structure, non-trivial byte sizes, content-disposition filenames, redownload token streaming for the single PDF, and `export_history` formats `pdf`, `pdf_batch`, `variance_pdf`, `variance_excel`, and `board_pdf`.
  - Verified all persisted export routes returned `X-CapVeri-Export-Id` and `X-CapVeri-Export-Storage-Path`, while board preview stayed non-persistent with no cleanup headers.
  - Cleaned up five generated export history rows, verified all five re-download routes returned 404, verified property-scoped export history returned zero rows, verified all five exact `capveri-reports` R2 objects were missing through Wrangler, then deleted and rechecked the generated property, snapshot, job, ingestion batch/imported GL rows, mapping, pool, lease, and unit.
- Reconciliation multilease export: `e2e-adhoc/prod-reconciliation-multilease-export-2026-06-27T12-34-32-012Z/report.json`
  - Created a disposable property with two occupied units, two leases, two expense pools, two pool mappings, and a four-row Yardi GL import in production.
  - Ran production reconciliation through the real queue and verified two draft snapshots plus exact deterministic recovery math: full-year recovery `1540.00`, partial-year 184/365 recovery `410.21`, and job `potential_recovery_total: "1950.21"`.
  - Finalized both snapshots, streamed a persisted single PDF, verified the redownload token returned matching PDF bytes, streamed a persisted batch ZIP, verified exact ZIP entries for both generated lease IDs, and streamed a persisted board PDF.
  - Verified export history contained exactly `board_pdf`, `pdf`, and `pdf_batch`.
  - Cleaned up three generated export history rows, verified all three re-download routes returned 404, verified property-scoped export history returned zero rows, verified all three exact `capveri-reports` R2 objects were missing through Wrangler, deleted and verified pool mappings and pools before property deletion, then deleted and rechecked the generated property, snapshots, job, ingestion batch/imported GL rows, leases, and units.
- Historical PDF/XLSX reports: `e2e-adhoc/prod-historical-reports-2026-06-27T12-54-08-998Z/report.json`
  - Created a disposable property, unit, lease, three expense pools, three pool mappings, and a five-row Yardi GL import spanning 2025 and 2026 in production.
  - Ran production reconciliation through the real queue for each annual period and verified exact deterministic recovery math: 2025 recovery `3000.00`, 2026 recovery `4500.00`, and both annual snapshot IDs.
  - Finalized each annual snapshot separately, verified available historical years `[2025, 2026]`, and verified year-over-year totals `3000`, `4500`, variance amount `1500`, and variance percent `50`.
  - Generated a historical PDF report, decoded the signed token payload, downloaded real PDF bytes, then generated a historical XLSX report and verified workbook ZIP structure and year-range filename.
  - Verified the historical report routes did not create export-history rows.
  - Deleted the generated token-only PDF R2 object, verified the exact `capveri-reports` object was missing through Wrangler, deleted and verified pool mappings and pools before property deletion, then deleted and rechecked the generated property, both annual snapshots, both calculation jobs, ingestion batch/imported GL rows, lease, and unit.
- GL narrative analysis: `e2e-adhoc/prod-gl-narrative-2026-06-27T13-11-17-472Z/report.json`
  - Created a disposable property, three expense pools, three pool mappings, and a five-row Yardi GL import with CapEx-like, admin-fee, and wrong-property narrative triggers in production.
  - Verified the latest GL narrative endpoint returned `null` before generation.
  - Called the real OpenRouter-backed `POST /api/v1/analysis/gl-narrative` route and verified it persisted a markdown analysis with the contractual CAM GL Analysis, CAM Audit Risks, and Recommendations sections, positive token input, `token_output: 0`, and `gl_entry_count: 5`.
  - Verified the latest-read endpoint returned the generated row, dismissed that row, verified the latest-read endpoint excluded dismissed rows, then regenerated a second persisted analysis with a different ID.
  - Deleted the ingestion batch, pool mappings, pools, and property, then verified the generated property, batch/imported GL rows, pools, mappings, and latest GL narrative for the generated property/year were absent.
- Cross-document analysis: `e2e-adhoc/prod-cross-doc-analysis-2026-06-27T13-40-54-886Z/report.json`
  - Created a disposable property, unit, lease, verified lease document, three expense pools, three pool mappings, five GL rows spanning 2025 and 2026, and a pool-scoped manual CAM statement row in production.
  - Uploaded and processed a generated lease PDF through the real extraction queue, waited for `ready_for_review`, approved the extraction, and verified the document reached `verified` with `verified_at` for the cross-document assembler.
  - Verified the latest cross-document endpoint returned 404 before generation, patched property auditor instructions, then called the real OpenRouter-backed `POST /api/v1/properties/{propertyId}/cross-doc-analysis` route.
  - Verified the generated analysis persisted with six findings, a valid risk score, summary, positive token usage, analyzed lease/GL counts, normalized UUID finding IDs, and `status: "pending"`.
  - Accepted the first finding through the decision route, re-read latest analysis, and verified the decision persisted and status advanced to `in_review`.
  - Deleted actual billed rows, ingestion batch, verified document, lease, unit, pool mappings, pools, and property; follow-up reads verified each deleted API object returned 404 or empty rows, the `capveri-documents` R2 object was missing, and the latest cross-document analysis route returned 404 for the generated property/year.
- Reconciliation browser review/manual override: `e2e-adhoc/prod-reconciliation-browser-review-2026-06-27T00-00-55-748Z/report.json`
  - Created a disposable property, unit, lease, expense pool, pool mapping, Yardi GL import batch, and draft reconciliation snapshot in production.
  - Loaded the deployed app route `/properties/{propertyId}/reconciliations?year=2026` in Chromium and verified the generated draft grid, generated tenant row, export button, and editable tenant-summary cells rendered.
  - Filled the visible admin-fee inline editor through the browser and verified the real `PATCH https://api.capveri.com/api/v1/reconciliation/cells/...` returned `200`, recorded `field_name: "admin_fee"`, `value: "456.78"`, and `is_manual_override: true`.
  - Re-read the draft snapshot after the browser edit and verified `admin_fee: "456.78"` persisted for the generated property and lease.
  - Verified the browser phase produced exactly one expected app mutation, no unexpected mutating requests, no browser errors, no failed relevant responses, and closed all launched Chromium processes.
  - Verified the browser review flow created no export history rows.
  - Deleted the GL batch, mapping, pool, and property; verified batch, property, unit, lease, pool, mapping, snapshots, and calculation job absence; revoked the Supabase refresh token and verified refresh-token reuse returned `400`.
  - Expected persistent side effects: append-only `audit_log` rows and the signed-in access JWT until its expiry. The report records both explicitly.
  - Earlier failed browser-review reports are not counted as passing evidence. Their cleanup blocks were checked first; the final failed report from the app-origin PATCH bug was removed from the default cleanup-audit input tree after it proved the generated business rows and refresh token were cleaned up.
- Reconciliation proration: `e2e-adhoc/prod-reconciliation-proration-2026-06-26T17-14-00-732Z/report.json`
  - Created a disposable property, unit, partial-year lease, expense pool, pool mapping, and Yardi GL import batch for the 2024 leap-year period.
  - Ran production reconciliation calculation through the real queue and verified the completed job produced one draft snapshot.
  - Verified inclusive day-count proration math for a lease active July 1 through December 31, 2024: `total_operating_expenses: "100000.00"`, `tenant_share_before_cap: "5027.32"`, `tenant_share_after_cap: "5027.32"`, `admin_fee: "251.37"`, and `total_recovery: "5278.69"`.
  - Deleted the GL batch, mapping, pool, and property; verified batch, pool, property, snapshots, and calculation job cleanup.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; its console report showed the generated batch, pool, property, snapshots, and job were cleaned up before the harness assertion was corrected to use API-exposed fields.
- Reconciliation browser review integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T00-01-51-550Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final reconciliation browser review run.
  - Verified `39` successful source reports, `0` source failures, `210` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked generated properties, leases, units, ingestion batches, expense pools, pool mappings, reconciliation snapshots, calculation jobs, browser-review export-history absence, and all prior merged production E2E cleanup surfaces.
- Team invitations browser invite/revoke: `e2e-adhoc/prod-team-invitations-browser-2026-06-27T00-20-44-810Z/report.json`
  - Loaded `https://app.capveri.com/settings/team` in Chromium with the production landlord session.
  - Created a generated `@example.com` team invitation through the visible invite dialog and verified the real `POST https://api.capveri.com/api/v1/team/invitations` returned `201`.
  - Re-read the team invitation list through the API and verified the generated invitation was active with `role: "member"`, `used_at: null`, and `revoked_at: null`.
  - Revoked the generated invitation through the visible browser confirmation flow and verified the real `DELETE https://api.capveri.com/api/v1/team/invitations/{id}` returned `200`.
  - Verified the generated invitation disappeared from the active invitation list, remained stored with `revoked_at` set, and its public validation token returned `valid: false` with `error_reason: "revoked"`.
  - Verified the browser phase produced exactly the expected app mutations, no unexpected mutating requests, no browser errors, and no failed relevant responses. Cloudflare RUM beacons were ignored as external browser telemetry.
  - Expected persistent side effects: append-only team invitation audit/log rows and the external transactional email delivery attempt record for the generated `@example.com` address.
- Team invitations integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T00-32-54-133Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final team-invitations browser report.
  - Verified `40` successful source reports, `0` source failures, `213` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the generated team invitation's inactive active-list state, stored `revoked_at` value, and revoked-token validation result.
- Backend terminal document delete deploy: Cloudflare Worker `capveri-api` version `8db0161d-89e9-4bfa-9b32-b2c170600aa6`
  - Deployed from `cloudflare-backend/` with `npx wrangler deploy --env production`.
  - Verified `npx wrangler deployments status --name capveri-api` reported `(100%) 8db0161d-89e9-4bfa-9b32-b2c170600aa6`.
  - Verified `https://api.capveri.com/health` returned `status: "healthy"`, `environment: "production"`, and `capabilities.terminal_document_delete: true`.
- Extraction verification browser draft/reject: `e2e-adhoc/prod-extraction-verification-browser-2026-06-27T01-16-27-547Z/report.json`
  - Created a disposable property, unit, lease, and generated PDF lease in production.
  - Uploaded the PDF, queued real extraction processing, and waited until the extraction reached `ready_for_review` with an extracted profile.
  - Loaded `https://app.capveri.com/verify/{documentId}` in Chromium with the production landlord session, verified the edit interface and PDF viewer rendered, edited `base_year_amount` to `43210.00`, and rejected the generated extraction through the visible rejection dialog.
  - Verified the browser phase made exactly two expected app mutations: `PUT /api/v1/extractions/{documentId}/draft` and `PUT /api/v1/extractions/{documentId}/reject`; there were no unexpected app mutations, browser errors, or failed relevant responses.
  - Verified the API persisted `status: "rejected"` and `extraction_result.draft_profile.base_year_amount: "43210.00"`.
  - Deleted the terminal-state generated document through the product route, verified document read returned 404, property-scoped document list returned zero rows, and the production `capveri-documents` R2 object returned missing before deleting and verifying the generated lease, unit, and property.
- Extraction verification failed pre-fix report: `e2e-adhoc-failed/prod-extraction-verification-browser-2026-06-27T01-14-27-154Z/report.json`
  - The first post-deploy run proved upload, processing, browser draft save, and browser rejection, but failed the harness assertion because the public extraction-detail response does not expose rejection metadata.
  - The failed report also exposed a Windows `npx` invocation issue in the R2 proof helper. Manual `npx.cmd wrangler r2 object get` against the generated storage key returned `The specified key does not exist`, and the harness now uses the Windows-safe helper from the existing document scenarios.
  - The report is preserved outside the default passing evidence root; its cleanup rows verified the generated document, lease, unit, and property were deleted.
- Extraction verification integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T01-19-32-279Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final passing extraction verification browser run.
  - Verified `41` successful source reports, `0` source failures, `219` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the generated extraction verification document, R2 object absence, lease, unit, and property cleanup.
- Persisted export/download integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T01-53-02-107Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final persisted PDF export/download report.
  - Verified `42` successful source reports, `0` source failures, `232` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the generated export-history deletion, download 404, property-scoped export-history absence, and direct `capveri-reports` R2 object absence.
- Persisted export variants integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T02-19-25-434Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final persisted export variants report.
  - Verified `43` successful source reports, `0` source failures, `255` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus five generated export-history deletions, five download 404s, property-scoped export-history absence, five direct `capveri-reports` R2 object absences, and the generated export-variant business rows.
- Reconciliation multilease export integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T12-35-44-451Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final reconciliation multilease export report.
  - Verified `44` successful source reports, `0` source failures, `276` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus three generated export-history deletions, three download 404s, property-scoped export-history absence, three direct `capveri-reports` R2 object absences, and the generated multilease reconciliation business rows.
- Historical reports integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T12-55-14-438Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final historical PDF/XLSX reports run.
  - Verified `45` successful source reports, `0` source failures, `293` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the historical token-only PDF R2 object absence, no export-history rows, generated pool mapping/pool cleanup, generated annual snapshots/jobs, ingestion batch/imported GL rows, lease, unit, and property cleanup.
- GL narrative integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T13-13-28-971Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final GL narrative analysis run.
  - Verified `46` successful source reports, `0` source failures, `304` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus generated GL narrative latest-read absence for the generated property/year, ingestion batch/imported GL row cleanup, generated pool mapping/pool cleanup, and generated property cleanup.
- Cross-document analysis integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T13-56-06-706Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final cross-document analysis run.
  - Verified `47` successful source reports, `0` source failures, `320` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus generated cross-document analysis latest-read absence for the generated property/year, actual billed cleanup, ingestion batch/imported GL row cleanup, generated document/R2 absence, lease/unit cleanup, generated pool mapping/pool cleanup, and generated property cleanup.
- Positive denominator-change integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T14-24-24-419Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final positive denominator-change run.
  - Verified `48` successful source reports, `0` source failures, `331` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus generated denominator-change property, lease, unit, pool, mapping, ingestion batch/imported GL rows, finalized snapshots, and calculation job cleanup.
- Document upload and SB 1103: `e2e-adhoc/prod-document-sb1103-2026-06-26T12-55-41-994Z/report.json`
  - Created a disposable California property, unit, and lease.
  - Uploaded a tiny valid PDF lease fixture and verified document detail/list metadata.
  - Loaded extraction detail, verified a signed document access URL was present without storing the signature in tracked code, fetched the uploaded PDF bytes, and captured the non-secret R2 storage key for cleanup proof.
  - Uploaded GL rows in the SB 1103 lookback window, created an SB 1103 request, patched notes, listed it by property/status, streamed a `format=both` ZIP export, and verified the request was marked `exported`.
  - Deleted the SB 1103 request and verified the property-scoped list returned zero rows.
  - Deleted the document through the product route, verified document read returned 404 and property-scoped document list returned zero rows, then verified the production `capveri-documents` R2 object returned missing before deleting GL batch, lease, unit, and property.
- Document extraction guards: `e2e-adhoc/prod-document-extraction-guards-2026-06-26T17-50-32-752Z/report.json`
  - Verified non-PDF uploads return `invalid_file_type` and invalid PDF bytes return `invalid_pdf` before persistence.
  - Uploaded a tiny valid PDF lease fixture and verified pending extraction detail, signed file URL, and storage key.
  - Verified signed document URLs reject invalid signatures and expired links with 403 responses.
  - Verified pending extraction documents reject draft, approve, and reject transitions with `invalid_document_state`, then verified the document remained `pending`.
  - Deleted the generated document, lease, unit, and property; follow-up reads verified document, lease, unit, property, and property-scoped document list absence, and direct R2 lookup verified the uploaded object was gone.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; its console report showed the generated document, R2 object, lease, unit, and property were cleaned up before the invalid-state message expectation was corrected.
- Account, billing, and team read-only: `e2e-adhoc/prod-account-billing-readonly-2026-06-26T13-13-22-114Z/report.json`
  - Read normalized organization settings and usage.
  - Read launch-offer, free-audit, guarantee, plan-selection, feature-usage, credits, credit-history, invoices, invoice-summary, and subscription billing surfaces.
  - Read team members and invitations without creating invitations or sending email.
  - Sent invalid organization-settings and billing-plan probes, verified both were rejected before persistence, and verified final settings and final plan-selection responses deep-equaled the initial snapshots.
  - Historical analysis/export was investigated as a higher-value next target, but production finalized-snapshot setup requires direct production DB/service-role access to avoid the finalize route's transactional email side effect; the available ignored DB URL is local-only.
- Organization settings mutation/restore: `e2e-adhoc/prod-organization-settings-mutation-2026-06-26T18-32-32-162Z/report.json`
  - Mutated production organization settings through the authenticated API and verified both the PATCH response and a fresh GET readback.
  - Verified invalid `fiscal_year_end_month: 13` and an overlong `contact_phone` return `422 validation_error`.
  - Re-read settings after the invalid requests and verified those failed writes did not change the persisted valid mutation.
  - Restored the initial settings in the scenario's `finally` block, then verified the restore response and a fresh GET readback matched `timezone: "America/New_York"`, `default_currency: "USD"`, `fiscal_year_end_month: 12`, and null contact fields.
  - The first live run exposed a production null-clear bug and left generated contact fields behind until the API fix below was deployed; after the deploy, the contact fields were manually restored to null and the scenario passed.
- Settings UI read-only browser sweep: `e2e-adhoc/prod-settings-ui-readonly-2026-06-26T18-59-02-855Z/report.json`
  - Signed in through production Supabase, injected the session into Chromium, and loaded `/settings/profile`, `/settings/team`, and `/settings/billing/invoices`.
  - Verified the pages rendered authenticated settings UI instead of redirecting to `/auth/login`.
  - Opened and closed the Invite Member dialog without submitting it.
  - Changed the invoice status filter to `Paid` and restored it to `All Statuses`.
  - Verified `0` browser errors, `0` failed relevant responses, `0` CapVeri app/API mutating requests, and `0` generated persistent IDs.
- Account deletion UI guard browser sweep: `e2e-adhoc/prod-account-deletion-guard-browser-2026-06-26T20-43-26-397Z/report.json`
  - Signed in through production Supabase, injected the session into Chromium, and loaded `/settings/profile`.
  - Verified the account deletion card, `Type DELETE to confirm` input, and destructive `Delete Account` button rendered on the authenticated profile page.
  - Verified the button stayed disabled for empty, lowercase, partial, trailing-space, leading-space, and cleared confirmation values, then verified exact `DELETE` only enabled the button.
  - Did not click the enabled destructive button.
  - Verified `0` browser errors, `0` failed relevant responses, `0` CapVeri app/API mutating requests after authentication, `0` `DELETE /api/v1/auth/account` requests, and `0` generated persistent IDs.
  - Earlier harness-only failure `e2e-adhoc/prod-account-deletion-guard-browser-2026-06-26T20-37-31-784Z/report.json` is not counted as passing evidence; it found that Playwright/browser filling `DELETE\n` into a single-line input normalizes to the exact enabling value while still making zero mutating requests and zero guarded endpoint calls.
- Rent roll import: `e2e-adhoc/prod-rent-roll-2026-06-26T13-33-28-163Z/report.json`
  - Uploaded a Yardi-style rent roll CSV with property metadata, quoted money/area values, occupied and vacant units, a duplicate unit row, and an invalid sqft row.
  - Verified preview detected `yardi_rent_roll`, parsed three valid units, two occupied tenants, duplicate warning, and invalid sqft warning.
  - Imported the rent roll into a disposable production property and verified deterministic Decimal totals: `total_rentable_sqft: "3650.50"`, `total_usable_sqft: "3310.25"`, `common_area_sqft: "340.25"`.
  - Verified imported unit rows included occupied/vacant status and fallback usable sqft.
  - Verified imported lease rows included normalized CAM shares `0.1850` and `0.1250`, ISO-normalized dates, and no lease for the vacant unit.
  - Verified rent roll import did not create GL import batches, then deleted leases, units, and property and verified property/unit/lease reads were absent.
- Tax protest deadlines: `e2e-adhoc/prod-tax-protest-2026-06-26T13-35-39-065Z/report.json`
  - Created a disposable Travis County, TX property.
  - Verified `GET /api/v1/tax-protest/deadlines?year=2026` included the property with `effective_deadline: "2026-05-15"`, `days_remaining: -42`, `is_past: true`, and `is_configured: true`.
  - Deleted the property, verified property detail returned 404, and verified the deadline list no longer included the generated property.
- Dashboard and portfolio read-only: `e2e-adhoc/prod-dashboard-portfolio-readonly-2026-06-26T13-44-02-702Z/report.json`
  - Read `/api/v1/dashboard`, `/api/v1/dashboard/leakage-summary`, and `/api/v1/portfolio/summary`.
  - Verified counts are nonnegative integers, money fields are decimal strings, booleans are typed, portfolio recovery rates are finite or null, and portfolio rows have valid money fields.
  - Loaded authenticated `/dashboard` and `/portfolio` in Playwright, captured screenshots, and verified no page errors, failed relevant responses, or CapVeri app/API mutating requests. Cloudflare Browser Insights `/cdn-cgi/rum` telemetry is excluded from the product/API mutation guard.
- Analysis no-comparable and CapEx empty-state: `e2e-adhoc/prod-analysis-empty-property-2026-06-26T13-57-03-516Z/report.json`
  - Created a disposable empty property through the production API.
  - Verified `POST /api/v1/analysis/denominator-change` returns a 200 no-comparable report with `comparison_available: false`, `missing_period: "current"`, zero denominator values, empty changes, empty tenant impacts, and a non-empty summary.
  - Verified `POST /api/v1/reports/denominator-change/pdf` maps the same no-comparable condition to 400 with `error.code: "no_comparable_snapshots"`; code inspection confirmed this PDF route is implemented as a stream-only response path, not an export-history route.
  - Ran `POST /api/v1/analysis/capex-classify` against an empty property and verified `gl_entries_scanned: 0` and `flags_created: 0`; this is a write-capable route, but the fixture has no GL rows and the follow-up flag list confirmed no flags were created.
  - Verified CapEx flags list and summary return empty/zero values, then deleted the property and verified property, lease list, and CapEx flags cleanup checks.
- Positive denominator-change JSON/PDF: `e2e-adhoc/prod-denominator-change-positive-2026-06-27T14-15-41-095Z/report.json`
  - Created a disposable property, unit, lease, expense pool, pool mapping, and two annual Yardi GL rows in production.
  - Ran real reconciliation jobs for 2025 and 2026, verified exact deterministic recovery math (`1000.00` then `1800.00`), finalized both annual snapshots, and updated the lease pro-rata share from `0.50` to `0.60` before the current period.
  - Called `POST /api/v1/analysis/denominator-change` with explicit RSF movement from `10000` to `12000` and verified `comparison_available: true`, `rsf_delta: "2000"`, `rsf_delta_percent: "20"`, change types `rsf_remeasurement` and `share_recalculation`, one tenant impact, and recovery delta `800`.
  - Called `POST /api/v1/reports/denominator-change/pdf` and verified it streamed non-persistent PDF bytes with a denominator-change filename, then verified the route created no export-history rows.
  - Deleted the generated pool mapping, pool, and property; follow-up reads verified snapshots, both calculation jobs, imported GL batch, lease, unit, pool, mapping, and property were absent.
- Analysis anomaly detection: `e2e-adhoc/prod-analysis-anomaly-2026-06-26T18-04-15-797Z/report.json`
  - Created a disposable property, four expense pools, four GL account pool mappings, and a six-row two-year Yardi GL import.
  - Verified the upload created six rows with zero errors and the GL date range spanned `2025-01-15` through `2026-03-15`.
  - Verified available finalized analysis years returned `[]` and year-over-year analysis rejected the generated GL-only fixture with `invalid_analysis_request` because no finalized snapshots existed.
  - Ran `POST /api/v1/analysis/anomaly-detection` for target year `2026` against comparison year `2025` and verified three deterministic anomalies: a critical Cleaning spike, an Insurance new category, and a Security missing category.
  - Deleted the generated GL batch, all four mappings, all four pools, and the property; follow-up reads verified the batch, each pool, and property returned 404, and the property-scoped mapping list returned `count: 0` and `item_count: 0`.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; its console report showed the generated batch, all mappings, all pools, and property were cleaned up before the decimal string expectation was corrected.
- Public tool calculators: `e2e-adhoc/prod-public-tools-calculators-2026-06-26T14-21-39-476Z/report.json`
  - Covers unauthenticated pure-compute POSTs for BOMA 2024, HCAD tax normalization, and fixed CAM modeling.
  - Verifies exact deterministic Decimal response strings for fractional BOMA with financial projection, geometry-only BOMA with null financial lift fields, HCAD with cap applied, HCAD without cap and null cap fields, and fixed CAM with unsorted five-year input sorted in the response.
  - Verifies invalid BOMA `rentable_sf < usable_sf` and invalid decimal input return 422 with `error.code: "invalid_tool_input"`.
  - Verifies HCAD retroactive adjustment above base year and fixed-CAM input with too few years return 422 with `error.code: "validation_error"`.
  - Verifies malformed JSON on all three calculator routes returns 400 with `error.code: "invalid_json"`.
  - No cleanup is needed because these public calculator routes are pure compute and create no production rows or persistent IDs. The report keeps `generated` empty so cleanup audit does not receive unverifiable IDs.
- Public tool browser flows: `e2e-adhoc/prod-public-tools-browser-2026-06-26T14-42-42-697Z/report.json`
  - Loaded production marketing pages for BOMA 2024 calculator, HCAD tax normalizer, and Fixed CAM vs Traditional Reconciliation Modeler in Chromium.
  - Filled real UI inputs, captured screenshots, and verified rendered results: `1,344 SF`, `12.00%`, `$47,040`, `$723,692`, HCAD `$7,500` and `$525` capped adjustment, and Fixed CAM `$300,000`, `$225,638`, `+$74,362`.
  - Verified the browser made only the expected calculator POSTs to `/api/v1/tools/boma-2024-calculator`, `/api/v1/tools/hcad-tax-normalizer/calculate`, and `/api/v1/tools/fixed-cam-modeler`.
  - Verified no browser errors, no relevant failed responses, and no unexpected mutating requests. Cloudflare Browser Insights `/cdn-cgi/rum` telemetry is excluded from the mutation guard.
  - No cleanup is needed because the scenario pre-unlocks gated result cards with localStorage and does not submit lead forms; the report generated no persistent IDs.
- Cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T16-18-22-217Z/report.json`
  - Re-read generated IDs from the ignored production report artifacts instead of trusting the original scenario cleanup blocks.
  - Scanned the prior main-checkout reports plus the final passing CapEx worktree report via `PROD_CLEANUP_AUDIT_REPORT_ROOTS`.
  - Verified `20` successful source reports, `0` source failures, `90` live production cleanup checks, and `0` cleanup failures across the merged `master` evidence plus the current CapEx report.
  - Rechecked generated properties, leases, units, ingestion batches, expense pools, pool mappings, pool templates, documents, SB 1103 requests, reconciliation jobs, reconciliation snapshots, actual billed rows, CapEx flags/summaries, and property-scoped document/SB1103 lists.
  - Persisted PDF export/download now has production E2E coverage and an application cleanup route. Other persisted export variants remain future targets until each variant has the same export-history and R2 cleanup proof.
- Pool-allocation cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T16-53-39-211Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing pool-allocation report.
  - Verified `21` successful source reports, `0` source failures, `100` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, all four generated expense pools, both generated pool allocation IDs, source-pool allocation list absence, and property-scoped document/SB1103 lists.
- Actual-billed manual/rematch cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T17-06-21-499Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing actual-billed manual/rematch report.
  - Verified `22` successful source reports, `0` source failures, `108` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, lease, unit, expense pool, period-scoped actual billed rows, reconciliation snapshots, and property-scoped document/SB1103 lists.
- Reconciliation proration cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T17-17-34-515Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing reconciliation proration report.
  - Verified `23` successful source reports, `0` source failures, `119` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, lease, unit, ingestion batch, expense pool, pool mapping, calculation job, reconciliation snapshots, and property-scoped document/SB1103 lists.
- Lease term version integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T17-30-35-135Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing lease term version report.
  - Verified `24` successful source reports, `0` source failures, `127` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, lease, two lease term versions, unit, ingestion batch, expense pool, pool mapping, calculation job, reconciliation snapshots, and property-scoped document/SB1103 lists.
- Core data update integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T17-41-36-680Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing core data update report.
  - Verified `25` successful source reports, `0` source failures, `132` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, lease, unit, ingestion batch, expense pool, pool mapping, calculation job, reconciliation snapshots, and property-scoped document/SB1103 lists.
- Document extraction guard integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T17-54-35-300Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing document extraction guard report.
  - Verified `26` successful source reports, `0` source failures, `138` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated document, property, lease, unit, ingestion batch, expense pool, pool mapping, calculation job, reconciliation snapshots, and property-scoped document/SB1103 lists; the scenario itself also verified the uploaded R2 object was absent.
- Analysis anomaly scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T18-04-47-315Z/report.json`
  - Re-read the generated IDs from the final passing analysis anomaly report in the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `15` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated ingestion batch, all four generated expense pools, all four generated pool mappings, and generated property.
- Analysis anomaly integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T18-08-05-441Z/report.json`
  - Re-read the generated IDs from the merged `master` production evidence folder, including the final passing analysis anomaly report.
  - Verified `27` successful source reports, `0` source failures, `157` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated ingestion batch, all four generated expense pools, all four generated pool mappings, generated property, and prior merged production E2E cleanup surfaces.
- Organization settings scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T18-32-43-554Z/report.json`
  - Re-read the final passing organization settings report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `1` live production cleanup check, and `0` cleanup failures.
  - Rechecked `/api/v1/organization/settings` and verified the restored expected settings rather than trusting the scenario's own cleanup block.
- Organization settings integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T18-35-56-294Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final hardened organization settings run.
  - Verified `28` successful source reports, `0` source failures, `158` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the organization settings restore plus all prior merged production E2E cleanup surfaces.
- Settings UI scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T18-59-31-294Z/report.json`
  - Re-read the final passing settings UI report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `1` read-only cleanup proof check, and `0` cleanup failures.
  - Confirmed the report recorded no persistent IDs, no CapVeri mutating requests, no failed responses, and no browser errors.
- Settings UI integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T19-03-38-022Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final settings UI run.
  - Verified `29` successful source reports, `0` source failures, `159` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the settings UI read-only proof plus all prior merged production E2E cleanup surfaces.
- Account deletion guard scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-43-38-198Z/report.json`
  - Re-read the final passing account deletion UI guard report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `1` browser-read-only proof check, and `0` cleanup failures.
  - Confirmed the report recorded no persistent IDs, no CapVeri browser mutating requests after authentication, no guarded account deletion requests, no failed responses, and no browser errors.
- Account deletion guard integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-46-11-960Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final account deletion UI guard run.
  - Verified `34` successful source reports, `0` source failures, `179` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the account deletion browser-read-only proof plus all prior merged production E2E cleanup surfaces.
- Public acquisition negative/no-persistence routes: `e2e-adhoc/prod-public-acquisition-negative-2026-06-26T19-23-57-364Z/report.json`
  - Exercised unauthenticated production public acquisition endpoints through no-successful-write branches: content download honeypot, calculator unlock honeypot, PLG signup honeypot, audit request honeypot, invalid Turnstile on all write-capable lead/audit routes, missing/invalid unsubscribe token, invalid download token, and malformed JSON on lead/audit routes.
  - Verified `13` production checks, `0` failures, `generated.persistentIdsCreated: []`, and recorded all probe emails in the report for later DB-backed reconciliation if production DB read credentials are available.
  - Earlier harness-only failure in the isolated worktree is not counted as passing evidence; it found that lead routes return `403` with `error.code: "forbidden"` for invalid Turnstile while audit requests return `verification_failed`.
- Public acquisition scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T19-24-04-279Z/report.json`
  - Re-read the final passing public acquisition negative/no-persistence report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `1` no-persistent-ID consistency check, and `0` cleanup failures.
  - Confirmed the report recorded no persistent IDs and every negative production check passed. This cleanup audit does not query `content_leads`, `audit_requests`, CRM lifecycle rows, email suppressions, or sequence enrollments because the local production E2E env does not include a production DB read credential.
- Public acquisition integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T19-25-38-390Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final public acquisition negative/no-persistence run.
  - Verified `30` successful source reports, `0` source failures, `160` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the new public acquisition no-persistent-ID consistency check plus all prior merged production E2E cleanup surfaces.
- Public contact/feedback honeypot negative: `e2e-adhoc/prod-public-contact-feedback-negative-2026-06-27T16-03-37-625Z/report.json`
  - Posts a honeypot contact request to `POST /api/v1/contact-requests` and verifies the exact public success response.
  - Posts honeypot marketing feedback to `POST /api/v1/feedback/marketing` and verifies the exact `{ status: "ok" }` response.
  - Uses only `company_website` honeypot branches, which exit before Turnstile, rate-limit Durable Object writes, Resend email, feedback row persistence, screenshots, or R2 writes.
  - Creates no persistent IDs and records both probe emails for auditability.
- Public contact/feedback integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-27T16-03-57-773Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the main production evidence folder, including the final public contact/feedback honeypot run.
  - Verified `55` successful source reports, `0` source failures, `339` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked all prior production cleanup surfaces plus the public contact/feedback report-level no-persistent-ID proof.
- Extraction inbox browser UI: `e2e-adhoc/prod-extractions-inbox-ui-2026-06-26T19-45-47-046Z/report.json`
  - Created a disposable production property, unit, lease, and valid lease PDF upload that generated a pending extraction.
  - Loaded `https://app.capveri.com/extractions` in Chromium with the production session and verified the generated filename, pending status, confidence placeholder, and `Process` action were visible without clicking any mutating action.
  - Verified the `Pending` filter kept the generated document visible and called `/api/v1/extractions?...status=pending`.
  - Verified the `Ready for Review` filter called `/api/v1/extractions?...status=ready_for_review` and excluded the generated pending document.
  - Verified no browser errors, no relevant failed responses, and no unexpected mutating CapVeri requests during the browser phase.
  - Deleted the generated document, lease, unit, and property; follow-up reads verified document, lease, unit, and property returned 404, the property-scoped document list returned `item_count: 0`, and the uploaded `capveri-documents` R2 object was missing.
  - Earlier harness-only failures in the isolated worktree are not counted as passing evidence; their console reports showed generated document, lease, unit, and property cleanup succeeded before the action-button assertion was corrected and before R2 cleanup proof was added.
- Extraction inbox scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T19-46-16-500Z/report.json`
  - Re-read the final passing extraction inbox browser UI report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `6` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated document, property, lease, unit, and property-scoped document list absence.
- Extraction inbox integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T19-48-10-716Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final extraction inbox browser UI run.
  - Verified `31` successful source reports, `0` source failures, `166` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the extraction inbox document, property, lease, unit, property-scoped document list absence, and all prior merged production E2E cleanup surfaces.
- Lease upload browser flow: `e2e-adhoc/prod-lease-upload-browser-2026-06-26T20-59-44-477Z/report.json`
  - Created a disposable production property, unit, and lease through API setup, then loaded `https://app.capveri.com/leases/upload` in Chromium with the production session.
  - Selected the generated property and lease through the visible comboboxes, uploaded a minimal valid PDF through `[data-testid="file-input"]`, and captured the production `/api/v1/documents/upload` browser response.
  - Verified the browser redirected to `/extractions`, showed the generated filename and pending status, and made exactly one CapVeri mutating request during the browser phase: the expected lease PDF upload.
  - Re-read `/api/v1/extractions/{documentId}` and verified pending status, filename, property ID, lease ID, `DOCUMENTS_BUCKET`, storage key containing the generated property ID, and a signed document URL path.
  - Re-read the property-scoped document list and verified the uploaded lease document was present before cleanup.
  - Deleted the generated document, lease, unit, and property; follow-up reads verified document, lease, unit, and property returned 404, the property-scoped document list returned `item_count: 0`, and direct R2 lookup showed the uploaded `capveri-documents` object was missing.
  - Earlier harness-only failure `e2e-adhoc/prod-lease-upload-browser-2026-06-26T20-58-39-923Z/report.json` is not counted as passing evidence; its console report showed document, R2 object, lease, unit, and property cleanup succeeded before the list-response assertion was corrected.
- Lease upload browser scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-00-33-669Z/report.json`
  - Re-read the final passing lease upload browser flow report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `6` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated document, property, lease, unit, and property-scoped document/SB1103 absence.
- Lease upload browser integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T21-04-43-635Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final lease upload browser flow run.
  - Verified `35` successful source reports, `0` source failures, `185` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the lease upload browser document, property, lease, unit, property-scoped document/SB1103 absence, and all prior merged production E2E cleanup surfaces.
- Rent roll browser upload: `e2e-adhoc/prod-rent-roll-browser-2026-06-26T20-03-33-046Z/report.json`
  - Loaded `https://app.capveri.com/rent-roll/upload` in Chromium with the production session and uploaded a generated Yardi-shaped CSV through the visible file input.
  - Verified the UI preview showed parsed success, Yardi format detection, generated property name, duplicate-unit warning, invalid-square-foot warning, total/occupied unit cards, and generated Alpha/Beta tenant rows.
  - Clicked `Import Property`, captured the production `/api/v1/rent-roll/import` response, and verified the browser landed on the generated property detail route.
  - Verified the browser made only the expected CapVeri mutating requests for rent-roll preview and import, with no browser errors and no relevant failed responses.
  - Re-read the generated property, units, and leases through the API and verified deterministic Decimal totals, vacant/occupied unit state, lease dates, tenant names, and recovery-profile percentages.
  - Deleted the two generated leases, three generated units, and generated property; follow-up reads verified each lease and unit returned 404, the property returned 404, the property-scoped lease list was empty, and the property-scoped unit list was inaccessible because the property was gone.
- Rent roll browser scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-03-58-057Z/report.json`
  - Re-read the final passing rent roll browser upload report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `8` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, two leases, three units, property-scoped lease list, and property-scoped document/SB1103 absence.
- Rent roll browser integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-05-43-812Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final rent roll browser upload run.
  - Verified `32` successful source reports, `0` source failures, `174` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the rent roll browser property, two leases, three units, property-scoped lease list, and all prior merged production E2E cleanup surfaces.
- GL ingestion browser scoped cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-19-55-035Z/report.json`
  - Re-read the final passing GL ingestion browser upload report from the isolated worktree.
  - Verified `1` successful source report, `0` source failures, `4` live production cleanup checks, and `0` cleanup failures.
  - Rechecked the generated property, generated ingestion batch, property-scoped document absence, and property-scoped SB 1103 absence.
- GL ingestion browser integrated cleanup audit: `e2e-adhoc/prod-cleanup-audit-2026-06-26T20-26-42-992Z/report.json`
  - Re-read the generated IDs and cleanup contracts from the merged `master` production evidence folder, including the final GL ingestion browser upload run.
  - Verified `33` successful source reports, `0` source failures, `178` cleanup/proof checks, and `0` cleanup failures.
  - Rechecked the generated GL browser property and ingestion batch, plus all prior merged production E2E cleanup surfaces.

## Production Bugs Found And Fixed

- Marketing AI-SDR widget SRI drift:
  - Failed smoke run: `e2e-adhoc/prod-platform-smoke-2026-06-26T11-58-36-429Z/report.json`.
  - Browser blocked `https://ventora-ai-sdr-worker.<account>.workers.dev/client/v0.3.7/ai-sdr.global.js` because `CLIENT_INTEGRITY` did not match the served bytes.
  - Fixed `marketing/src/components/ai-sdr/AiSdrSalesWidget.tsx` to the verified worker hash `sha384-qHqz7vVH6wFxTARB7MmTreXpz5j531VZD8CE35v8MKtr3TmEuWEXjPyHWuTge0/j`.
  - Deployed `capveri-marketing` and verified `100%` current version `da638f39-717c-4185-8215-0a2688bbc303`.
  - Reran platform smoke successfully with zero browser errors.
- Comparison pool-level variance dropped live reconciliation pool allocations:
  - Found during isolated production runs before failed evidence was pruned from the audit set.
  - The comparison repository expected `pool_breakdowns[].total_recovery`, but the live reconciliation calculator stores `pool_breakdowns[].recovery`; the direct Postgres JSONB path can also return the breakdowns as a JSON string.
  - Fixed `cloudflare-backend/src/adapters/db/comparison.ts` to parse stringified JSONB arrays and accept both `total_recovery` and live `recovery` fields.
  - Added focused regression coverage in `cloudflare-backend/src/test/comparison-repository.test.ts`.
  - Deployed `capveri-api` and verified `100%` current version `5c9a627d-693b-4844-a0b6-035a33fe60bd`.
  - Reran the explicit comparison production scenario successfully with pool-level variance present.
- Detail advisor malformed JSON returned a 500:
  - Failed pre-fix run: `e2e-adhoc/prod-export-detail-advisor-2026-06-26T15-45-51-117Z/report.json` in the isolated worktree.
  - The seeded advisor checks passed and the failure-path cleanup deleted and rechecked the generated batch, mapping, pool, and property, but malformed JSON returned `500 internal_error`.
  - Fixed `cloudflare-backend/src/http/export-detail-advisor-routes.ts` to parse JSON through the route's `invalid_json` guard.
  - Added focused regression coverage in `cloudflare-backend/src/test/export-detail-advisor-routes.test.ts`.
  - Deployed `capveri-api` and verified `100%` current version `fdf5abff-9ad0-4d8f-aa73-cad371118845`.
  - Reran the export detail advisor production scenario successfully, including the malformed JSON check.
- Organization settings PATCH could not clear nullable contact fields:
  - Failed live run showed restore PATCH calls with explicit null contact fields returned `200`, but production GET readback still contained the generated `Prod E2E ...` contact values.
  - Root cause: `removeUndefined` in `cloudflare-backend/src/http/organization-routes.ts` filtered both `undefined` and `null`, so explicit clears were discarded before the update.
  - Fixed the route to preserve explicit null values while still dropping omitted fields.
  - Added focused regression coverage in `cloudflare-backend/src/test/organization-routes.test.ts`.
  - Deployed `capveri-api` and verified `100%` current version `c21c5f41-d43d-413b-84fe-02b1fb68d7f6`.
  - Manually restored production organization settings after the deploy, verified contact fields were null, then reran the organization settings production scenario successfully.

## Focused Gates

Run from `frontend/`:

```powershell
node --check "scripts\prod-platform-smoke.mjs"
node --check "scripts\prod-core-data-scenario.mjs"
node --check "scripts\prod-core-data-update-scenario.mjs"
node --check "scripts\prod-core-data-browser-scenario.mjs"
node --check "scripts\prod-lease-term-version-scenario.mjs"
node --check "scripts\prod-ingestion-scenario.mjs"
node --check "scripts\prod-ingestion-browser-scenario.mjs"
node --check "scripts\prod-actual-billed-scenario.mjs"
node --check "scripts\prod-actual-billed-manual-rematch-scenario.mjs"
node --check "scripts\prod-pool-mapping-scenario.mjs"
node --check "scripts\prod-pool-template-scenario.mjs"
node --check "scripts\prod-pool-allocation-scenario.mjs"
node --check "scripts\prod-pool-config-browser-scenario.mjs"
node --check "scripts\prod-comparison-explicit-scenario.mjs"
node --check "scripts\prod-export-detail-advisor-scenario.mjs"
node --check "scripts\prod-capex-classification-scenario.mjs"
node --check "scripts\prod-reconciliation-draft-export-scenario.mjs"
node --check "scripts\prod-reconciliation-browser-review-scenario.mjs"
node --check "scripts\prod-export-persisted-download-scenario.mjs"
node --check "scripts\prod-export-variants-scenario.mjs"
node --check "scripts\prod-reconciliation-multilease-export-scenario.mjs"
node --check "scripts\prod-historical-reports-scenario.mjs"
node --check "scripts\prod-gl-narrative-scenario.mjs"
node --check "scripts\prod-cross-doc-analysis-scenario.mjs"
node --check "scripts\prod-denominator-change-positive-scenario.mjs"
node --check "scripts\prod-reconciliation-proration-scenario.mjs"
node --check "scripts\prod-document-sb1103-scenario.mjs"
node --check "scripts\prod-document-extraction-guards-scenario.mjs"
node --check "scripts\prod-lease-upload-browser-scenario.mjs"
node --check "scripts\prod-extractions-inbox-ui-scenario.mjs"
node --check "scripts\prod-tenant-preferences-browser-scenario.mjs"
node --check "scripts\prod-tenant-dashboard-readonly-scenario.mjs"
node --check "scripts\prod-tenant-statement-pdf-readonly-scenario.mjs"
node --check "scripts\prod-tenant-disputes-browser-readonly-scenario.mjs"
node --check "scripts\prod-tenant-dispute-detail-readonly-scenario.mjs"
node --check "scripts\prod-tenant-dispute-create-form-readonly-scenario.mjs"
node --check "scripts\prod-tenant-notifications-readonly-scenario.mjs"
node --check "scripts\prod-tenant-disputes-negative-scenario.mjs"
node --check "scripts\prod-admin-disputes-browser-readonly-scenario.mjs"
node --check "scripts\prod-admin-disputes-negative-scenario.mjs"
node --check "scripts\prod-audit-trail-readonly-scenario.mjs"
node --check "scripts\prod-audit-log-export-readonly-scenario.mjs"
node --check "scripts\prod-account-billing-readonly-scenario.mjs"
node --check "scripts\prod-billing-lifecycle-negative-scenario.mjs"
node --check "scripts\prod-organization-settings-mutation-scenario.mjs"
node --check "scripts\prod-settings-ui-readonly-scenario.mjs"
node --check "scripts\prod-account-deletion-guard-browser-scenario.mjs"
node --check "scripts\prod-rent-roll-import-scenario.mjs"
node --check "scripts\prod-rent-roll-browser-scenario.mjs"
node --check "scripts\prod-tax-protest-deadline-scenario.mjs"
node --check "scripts\prod-dashboard-portfolio-readonly-scenario.mjs"
node --check "scripts\prod-analysis-empty-property-scenario.mjs"
node --check "scripts\prod-analysis-anomaly-scenario.mjs"
node --check "scripts\prod-public-tools-calculators-scenario.mjs"
node --check "scripts\prod-public-tools-browser-scenario.mjs"
node --check "scripts\prod-public-acquisition-negative-scenario.mjs"
node --check "scripts\prod-public-contact-feedback-negative-scenario.mjs"
node --check "scripts\prod-cleanup-audit.mjs"
npx prettier --check "scripts\prod-platform-smoke.mjs" "scripts\prod-core-data-scenario.mjs" "scripts\prod-core-data-update-scenario.mjs" "scripts\prod-core-data-browser-scenario.mjs" "scripts\prod-lease-term-version-scenario.mjs" "scripts\prod-ingestion-scenario.mjs" "scripts\prod-ingestion-browser-scenario.mjs" "scripts\prod-actual-billed-scenario.mjs" "scripts\prod-actual-billed-manual-rematch-scenario.mjs" "scripts\prod-pool-mapping-scenario.mjs" "scripts\prod-pool-template-scenario.mjs" "scripts\prod-pool-allocation-scenario.mjs" "scripts\prod-pool-config-browser-scenario.mjs" "scripts\prod-comparison-explicit-scenario.mjs" "scripts\prod-export-detail-advisor-scenario.mjs" "scripts\prod-capex-classification-scenario.mjs" "scripts\prod-reconciliation-draft-export-scenario.mjs" "scripts\prod-reconciliation-browser-review-scenario.mjs" "scripts\prod-export-persisted-download-scenario.mjs" "scripts\prod-export-variants-scenario.mjs" "scripts\prod-reconciliation-multilease-export-scenario.mjs" "scripts\prod-historical-reports-scenario.mjs" "scripts\prod-gl-narrative-scenario.mjs" "scripts\prod-cross-doc-analysis-scenario.mjs" "scripts\prod-denominator-change-positive-scenario.mjs" "scripts\prod-reconciliation-proration-scenario.mjs" "scripts\prod-document-sb1103-scenario.mjs" "scripts\prod-document-extraction-guards-scenario.mjs" "scripts\prod-lease-upload-browser-scenario.mjs" "scripts\prod-extractions-inbox-ui-scenario.mjs" "scripts\prod-tenant-preferences-browser-scenario.mjs" "scripts\prod-tenant-dashboard-readonly-scenario.mjs" "scripts\prod-tenant-notifications-readonly-scenario.mjs" "scripts\prod-tenant-disputes-browser-readonly-scenario.mjs" "scripts\prod-audit-trail-readonly-scenario.mjs" "scripts\prod-audit-log-export-readonly-scenario.mjs" "scripts\prod-account-billing-readonly-scenario.mjs" "scripts\prod-billing-lifecycle-negative-scenario.mjs" "scripts\prod-organization-settings-mutation-scenario.mjs" "scripts\prod-settings-ui-readonly-scenario.mjs" "scripts\prod-account-deletion-guard-browser-scenario.mjs" "scripts\prod-rent-roll-import-scenario.mjs" "scripts\prod-rent-roll-browser-scenario.mjs" "scripts\prod-tax-protest-deadline-scenario.mjs" "scripts\prod-dashboard-portfolio-readonly-scenario.mjs" "scripts\prod-analysis-empty-property-scenario.mjs" "scripts\prod-analysis-anomaly-scenario.mjs" "scripts\prod-public-tools-calculators-scenario.mjs" "scripts\prod-public-tools-browser-scenario.mjs" "scripts\prod-public-acquisition-negative-scenario.mjs" "scripts\prod-public-contact-feedback-negative-scenario.mjs" "scripts\prod-cleanup-audit.mjs"
npx eslint "scripts/prod-platform-smoke.mjs" "scripts/prod-core-data-scenario.mjs" "scripts/prod-core-data-update-scenario.mjs" "scripts/prod-core-data-browser-scenario.mjs" "scripts/prod-lease-term-version-scenario.mjs" "scripts/prod-ingestion-scenario.mjs" "scripts/prod-ingestion-browser-scenario.mjs" "scripts/prod-actual-billed-scenario.mjs" "scripts/prod-actual-billed-manual-rematch-scenario.mjs" "scripts/prod-pool-mapping-scenario.mjs" "scripts/prod-pool-template-scenario.mjs" "scripts/prod-pool-allocation-scenario.mjs" "scripts/prod-comparison-explicit-scenario.mjs" "scripts/prod-export-detail-advisor-scenario.mjs" "scripts/prod-capex-classification-scenario.mjs" "scripts/prod-reconciliation-draft-export-scenario.mjs" "scripts/prod-reconciliation-browser-review-scenario.mjs" "scripts/prod-export-persisted-download-scenario.mjs" "scripts/prod-export-variants-scenario.mjs" "scripts/prod-reconciliation-multilease-export-scenario.mjs" "scripts/prod-historical-reports-scenario.mjs" "scripts/prod-gl-narrative-scenario.mjs" "scripts/prod-cross-doc-analysis-scenario.mjs" "scripts/prod-denominator-change-positive-scenario.mjs" "scripts/prod-reconciliation-proration-scenario.mjs" "scripts/prod-document-sb1103-scenario.mjs" "scripts/prod-document-extraction-guards-scenario.mjs" "scripts/prod-lease-upload-browser-scenario.mjs" "scripts/prod-extractions-inbox-ui-scenario.mjs" "scripts/prod-tenant-preferences-browser-scenario.mjs" "scripts/prod-tenant-dashboard-readonly-scenario.mjs" "scripts/prod-tenant-notifications-readonly-scenario.mjs" "scripts/prod-tenant-disputes-browser-readonly-scenario.mjs" "scripts/prod-audit-trail-readonly-scenario.mjs" "scripts/prod-audit-log-export-readonly-scenario.mjs" "scripts/prod-account-billing-readonly-scenario.mjs" "scripts/prod-billing-lifecycle-negative-scenario.mjs" "scripts/prod-organization-settings-mutation-scenario.mjs" "scripts/prod-settings-ui-readonly-scenario.mjs" "scripts/prod-account-deletion-guard-browser-scenario.mjs" "scripts/prod-rent-roll-import-scenario.mjs" "scripts/prod-rent-roll-browser-scenario.mjs" "scripts/prod-tax-protest-deadline-scenario.mjs" "scripts/prod-dashboard-portfolio-readonly-scenario.mjs" "scripts/prod-analysis-empty-property-scenario.mjs" "scripts/prod-analysis-anomaly-scenario.mjs" "scripts/prod-public-tools-calculators-scenario.mjs" "scripts/prod-public-tools-browser-scenario.mjs" "scripts/prod-public-acquisition-negative-scenario.mjs" "scripts/prod-public-contact-feedback-negative-scenario.mjs" "scripts/prod-cleanup-audit.mjs"
npx prettier --check "scripts\prod-tenant-dispute-detail-readonly-scenario.mjs"
npx eslint "scripts/prod-tenant-dispute-detail-readonly-scenario.mjs"
npx prettier --check "scripts\prod-admin-disputes-browser-readonly-scenario.mjs"
npx eslint "scripts/prod-admin-disputes-browser-readonly-scenario.mjs"
```

Frontend focused commands exited 0 on 2026-06-26; the persisted export/download, export-variant, multilease reconciliation export, historical report, GL narrative, cross-document analysis, positive denominator-change, tenant dashboard read-only, tenant statement PDF read-only, tenant disputes browser read-only, tenant dispute detail read-only, tenant dispute create-form read-only, tenant notifications read-only, tenant disputes negative, landlord/admin disputes browser read-only, landlord/admin disputes negative, audit-trail read-only, audit-log CSV export read-only, billing lifecycle negative, and public contact/feedback honeypot negative additions exited 0 on 2026-06-27. Marketing fix gates also exited 0:

```powershell
npx vitest run src\__tests__\marketing-remediation.test.ts
npm run typecheck
npm run lint
```

Organization settings API fix gates also exited 0 on 2026-06-26:

```powershell
npx vitest run "src/test/organization-routes.test.ts"
npm run typecheck
npm run lint -- --quiet "src/http/organization-routes.ts" "src/test/organization-routes.test.ts"
```

## Production Deploy State

Cloudflare deployment verification before the production runs:

- `capveri-api`: 100% current version `c21c5f41-d43d-413b-84fe-02b1fb68d7f6` after the organization settings null-clear fix deploy
- `capveri-app`: 100% current version `4b386db7-927f-4c1e-9e92-b242b9b4a974` after the reconciliation browser cell-edit fixes deploy
- `capveri-marketing`: 100% current version `da638f39-717c-4185-8215-0a2688bbc303` after the AI-SDR SRI fix deploy

`https://api.capveri.com/health` returned `{"status":"healthy","version":"0.1.0","environment":"production","runtime":"cloudflare-workers"}`.
