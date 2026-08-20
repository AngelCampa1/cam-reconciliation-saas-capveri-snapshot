# Compliance & Legal
> Last updated: 2026-06-20 - The AI Transparency Statement page's Questions section now shows a single contact address when the security and support contacts resolve to the same email (today both route to one real inbox), instead of printing the same address twice in one sentence ("Contact X for security questions or X for product support"); the two-email form is kept as a fallback for when the addresses diverge. No invented address. Pristine-2026 C27.
> Last updated: 2026-06-11 - Two warranty/certificate surfaces now render red status text in the AA-contrast `text-destructive-strong` instead of the bright `text-destructive` that fails WCAG AA on white at body size: the certificate-list "Failed to load certificates." error (`WarrantyPage`) and the certificate-detail revocation-reason data cell (`WarrantyCertificateDetail`, a legal audit-trail field). Matches the F-287/F-381/F-382/F-383 contrast standard; a regression test asserts the revocation-reason cell carries the strong class (F-384).
> Last updated: 2026-06-08 - The "Generate Demand Letter" dialog on the landlord dispute detail page now collects the full landlord contact block (name, title, company, address, phone, email), matching the canonical reconciliation DemandLetterPanel. Previously it only collected the landlord name and sent the other five fields as empty strings, so demand letters generated from a dispute shipped a blank landlord contact block (F-362).
> Last updated: 2026-06-07 - While certificate issuance is paused for terms updates, every reconciliation-certificate surface (list subtitle, create route, and the pending/eligible/finalized detail sections) now shows one shared plain-language message ("Certificates are paused right now. We're updating our terms.") from `frontend/src/features/warranty/constants.ts` instead of the duplicated jargon line "Reconciliation certificate/report unavailable pending updated terms." / "read-only while updated terms are pending" (F-271).
> Last updated: 2026-06-01 - Added a Terms of Service "Verification of Outputs" section (app and marketing copies) that requires users to independently verify all system outputs (reconciliations, recovery/variance figures, AI-extracted lease terms, anomaly flags, demand letters, exported/emailed reports) and disclaims liability for errors in outputs the user did not verify; the Limitation of Liability section ties back to it. Added matching fine-print verify disclaimers near every user-facing output surface: backend PDF/Excel/report generators (variance, historical, denominator-change, warranty certificate, board presentation), statement/audit email templates, and frontend reconciliation/analysis/export/tool/onboarding result surfaces plus the demand-letter review step. Disclaimers are small muted fine print, never in marketing heroes or headlines.
> Last updated: 2026-05-29 - The warranty eligibility badge on a reconciliation snapshot now reads the backend eligibility result (`is_eligible`/`reasons`) and renders a non-actionable "Not Eligible" badge (with the reasons as a tooltip) instead of advertising a create-certificate link that would 422; the badge and the certificate-detail view share the `warrantyKeys` query cache so certificate attest/finalize/revoke mutations correctly invalidate the badge (F-073/F-074).
> Last updated: 2026-05-29 - Warranty certificate UI now enforces the backend admin-only authorization for write actions: Attest/Finalize/Revoke controls and the create-certificate flow are gated behind the admin role (non-admins see read-only status and notices instead of opaque 403s), and the create flow has a dedicated admin-gated `/certificates/new` route that no longer collides with the certificate-detail route (F-067/F-068/F-069).
> Last updated: 2026-05-29 - App privacy policy now discloses product analytics (PostHog product analytics, session replay with masked inputs, heatmaps, error monitoring), Sentry error tracking, Google Tag Manager / Google Analytics, and the OpenRouter AI model gateway (Google Gemini, Moonshot Kimi, OpenAI GPT, Z.ai GLM downstream models), and adds an EU/UK GDPR data-subject-rights section alongside CCPA/CPRA opt-out-of-sale-or-sharing and limit-use-of-sensitive-information rights.
> Last updated: 2026-05-28 - Warranty certificate PDFs now display the finalized snapshot `total_recovery` amount instead of a hardcoded zero recovery.
> Last updated: 2026-05-28 - SB 1103 request creation and export assembly now reject lease/property mismatches so a tenant pro-rata share cannot be applied to an unrelated property ledger.
> Last updated: 2026-05-20 - Warranty certificate revocation uses a controlled confirmation dialog that resets on close, surfaces an inline error alert plus a toast on failure, and only closes after the void succeeds; PDF download failures also surface a toast.
> Last updated: 2026-05-20 - SB 1103 exports now read current property address schema fields, and Journey 09 covers live request creation plus row-level PDF export.
> Last updated: 2026-05-20 - Demand-letter downloads now use the real lease tenant name in generated filenames, and Journey 05 exercises the current More-menu panel workflow without self-skips.
> Last updated: 2026-05-09 - Added the public AI transparency route for client-facing AI assistance, human review, and deterministic financial-math messaging.

> Last updated: 2026-02-28 — Added plan-tier annotations

> Plan tiers:
> - SB 1103 compliance export → **Professional** (`sb1103ComplianceExport`)
> - Demand letters → **Professional** (`demandLetters`)
> - Warranty / reconciliation certificates → **Professional** (`reconciliationCertificates`)
> - Audit defense package → **Professional** (`auditDefensePackage`)
> - Audit trail → **All plans**

## Overview

California SB 1103 compliance tracking, demand letter generation, warranty certificates for E&O
attestation, and a complete append-only audit trail. Enforces immutability guarantees on financial
data — GL entries are INSERT/SELECT only, finalized snapshots are locked by RLS, and the audit
log is append-only via database triggers.

## Features

### Output Verification & Liability Disclaimers
- Terms of Service includes a "Verification of Outputs" section (app: `frontend/src/pages/legal/TermsOfService.tsx`; marketing: `marketing/src/app/terms/page.tsx`) requiring users to review and independently verify every system output before relying on it or billing a tenant, and disclaiming accuracy/fitness and liability for errors in outputs the user did not verify.
- The Limitation of Liability section references the Verification of Outputs section so unverified-output reliance is excluded from liability.
- Fine-print verify disclaimers render near every user-facing output surface:
  - Backend generators: `export/variance_pdf.py`, `reports/historical_report.py`, `reports/denominator_change_report.py`, `reports/excel_export.py`, `warranty/certificate_generator.py`, and the board presentation PDF in `api/v1/export.py` (small grey 7-8pt footer text).
  - Email templates: `email/templates/statement_notification.html`, `audit_results.html` (muted 11px tenant-facing note).
  - Frontend result surfaces: reconciliation panels (variance, NOI impact, denominator change, cap bank ledger, tenant summary), analysis pages (trend, year-over-year, GL analysis), export/verification/portfolio/sample-report pages, onboarding and PLG result steps, the tenant dashboard, the warranty certificate detail, and the demand-letter review step (`text-xs text-muted-foreground`).
  - Marketing/tool estimators: `content/ToolPageLayout.tsx`, `landing/ROICalculator.tsx`, and the `/roi` page carry rough-estimate disclaimers below results.
- All disclaimers are deliberately fine print (small, muted), never placed in marketing heroes, headlines, or persuasion positions.

### SB 1103 Compliance
- Tracks Qualified Commercial Tenant (QCT) ledger requests per California Civil Code 1938.1
- 30-day response deadline auto-calculated from request date
- 18-month historical CAM expense ledger generation using `dateutil.relativedelta(months=18)` (calendar months, not 540 days)
- Export formats: Excel (openpyxl) and PDF (ReportLab), or both
- 7-day warning alerts for approaching deadlines
- **Endpoints**: CRUD at `/api/v1/compliance/sb1103/`, `POST /export`, `GET /alerts`
- **Service**: `backend/app/services/compliance/sb1103_service.py`
- Frontend guard: SB 1103 tab is shown only when the property state is `CA`.
- Frontend E2E Journey 09 covers the current request dialog and row Actions menu PDF export.
- Request creation and export generation require the selected lease to belong to the selected/request property.

### SB 1103 Request Lifecycle
- Status workflow: `PENDING` → `EXPORTED` → `DELIVERED` → `OVERDUE`
- Tracks: `request_date`, `response_deadline` (request_date + 30 days), `window_start` (18 months back), `export_format` (pdf/excel/both)
- 10-year data retention with legal hold — never auto-purged
- Failure to comply gives tenants the right to rescind their lease

### Demand Letters
- State-specific PDF templates: Texas (`TX_DEMAND_BODY`) and California (`CA_DEMAND_BODY`)
- Customizable fields: landlord info, tenant name, property address, amount owed, payment deadline (1-365 days), lease reference
- Optional dispute reference paragraph when linked to an existing dispute
- Legal disclaimer included on all generated letters
- Streams PDF response via ReportLab
- Download filenames use the lease tenant name from the export context when available.
- Frontend E2E Journey 05 covers the current More-menu entrypoint, tenant selection, landlord details review, and generated PDF download path.
- **Endpoint**: `POST /api/v1/demand-letter/generate`
- **Services**: `backend/app/services/legal/demand_letter_generator.py`, `demand_letter_templates.py`

### Warranty Certificates
- Reconciliation attestation for Errors & Omissions coverage
- Only eligible on finalized reconciliation snapshots with engine version and trace checksum
- Status workflow: `PENDING_ATTESTATION` → `ELIGIBLE` → `ISSUED` → `VOIDED`
- Operations: attest data accuracy, issue certificate (generates certificate number), void with reason (min 10 chars)
- PDF download with checksum verification
- Certificate PDFs include the finalized snapshot recovery amount from `reconciliation_snapshots.total_recovery`.
- **Endpoints**: `/api/v1/warranty/`
- **Models**: `backend/app/models/warranty.py` (WarrantyCertificate, WarrantyStatus, WarrantyEligibility, AttestationRequest, VoidCertificateRequest)

### Audit Trail
- Database triggers on: `gl_entries` (INSERT/DELETE), `reconciliation_snapshots` (all DML), `leases` (UPDATE on recovery_profile changes)
- Each record captures: `table_name`, `operation` (INSERT/UPDATE/DELETE), `row_id`, `old_data` JSONB, `new_data` JSONB, `changed_by`, `changed_at`, `organization_id`, `session_info`
- Append-only — no user INSERT/UPDATE/DELETE allowed on the audit_log table
- Paginated query with filters: date range, table name, operation type, row_id, user
- Admin/owner access only
- **Endpoint**: `GET /api/v1/audit-trail/`

### Calculation Trace
- Step-by-step breakdown stored in `reconciliation_snapshots.calculation_trace` (JSONB)
- Each `CalculationStep`: `step_order`, `step_name`, `input_values` dict, `operation`, `output_value`, optional `note`
- Engine version (git SHA) recorded for reproducibility
- Exportable for dispute defense and regulatory review
- Rendered in `CalculationTraceDrawer` frontend component

### Public AI Transparency
- Public route: `/compliance/ai-transparency`
- Explains that AI assists with lease review, document extraction, and workflow analysis while financial calculations remain deterministic.
- Sets client-facing expectations for human review before outputs are relied on operationally.
- Uses generated public knowledge claims and support/security contacts for the current approved wording.

### Privacy Policy Disclosures (App)
- App privacy policy (`frontend/src/pages/legal/PrivacyPolicy.tsx`) discloses the data categories collected (account info; uploaded property/financial data including lease PDFs and GL entries; usage/analytics data including product-analytics events, session recordings with masked inputs, and error logs).
- Sub-processors disclosed: Supabase, Cloudflare (R2 storage, Turnstile), Railway, Vercel, OpenRouter (AI model gateway routing to Google Gemini, Moonshot Kimi, OpenAI GPT, Z.ai GLM), Stripe, Resend, PostHog (product analytics/session replay, US-hosted, masked inputs), Sentry (when enabled), and Google Tag Manager / Google Analytics (when enabled).
- Data-subject rights:
  - **CCPA / CPRA** (California): know, delete, correct, opt-out of sale or sharing (including cross-context behavioral advertising), limit use of sensitive personal information, and non-discrimination.
  - **GDPR** (EU/UK): access, rectification, erasure, restriction, portability, objection, right to lodge a complaint with a supervisory authority. Cross-border transfers rely on appropriate safeguards such as Standard Contractual Clauses; product analytics and session replay may trigger additional consent rights.
- The accurate technical security descriptions backing these claims live in `docs/compliance/security-overview.md`.

### Data Retention Policies
- Table-driven configuration with categories:
  - `financial_permanent`: 10-year retention (GL entries, reconciliation snapshots)
  - `audit_log`: 7-year retention
  - `sb1103`: never auto-purged (legal hold)
- Scheduled purge function: `schedule_retention_purge()` runs against retention policy table
- SB 1103 records exempt from all automatic purge operations

### Immutability Guarantees
- **GL entries**: INSERT and SELECT only — no UPDATE allowed; CASCADE DELETE via batch removal only
- **Finalized snapshots**: RLS policy blocks UPDATE and DELETE once status is `finalized`
- **Audit log**: append-only via database triggers; no direct user writes
- **Invoices**: service role INSERT only — no user modification
- **Lease term versions**: append-only; new versions created, old versions never modified

## Database Tables

- **sb1103_requests** — `property_id`, `lease_id`, `requested_by_name`, `requested_by_email`, `request_date`, `response_deadline`, `window_start`, `window_end`, `status` enum (pending/exported/delivered/overdue), `export_format`, `exported_at`, `notes`. 10-year retention, never auto-purged
- **warranty_certificates** — `snapshot_id`, `organization_id`, `status` enum (pending_attestation/eligible/issued/voided), `ingestion_batch_ids` UUID[], `data_attested_at`, `data_attested_by`, `certificate_number`, `issued_at`, `issued_by`, `voided_at`, `void_reason`, `certificate_pdf_checksum`
- **audit_log** — `table_name`, `operation` enum (INSERT/UPDATE/DELETE), `row_id`, `old_data` JSONB, `new_data` JSONB, `changed_by`, `changed_at`, `organization_id`. Append-only, no user DML
- **data_retention_policies** — Category name, retention period, auto-purge flag, legal hold flag

## Key Files

- `backend/app/services/compliance/sb1103_service.py` — SB 1103 window calculation, GL query, PDF/Excel export, deadline alerts
- `backend/app/services/legal/demand_letter_generator.py` — PDF generation with ReportLab
- `backend/app/services/legal/demand_letter_templates.py` — TX and CA template text, dispute paragraph, legal disclaimer
- `backend/app/models/warranty.py` — WarrantyCertificate, WarrantyStatus, eligibility and request models
- `backend/app/services/calculation/models.py` — CalculationTrace, CalculationStep for audit trail
- `backend/app/api/v1/compliance.py` — SB 1103 REST endpoints
- `backend/app/api/v1/demand_letter.py` — Demand letter generation endpoint
- `backend/app/api/v1/warranty.py` — Warranty certificate endpoints
- `backend/app/api/v1/audit_trail.py` — Audit trail query endpoint
