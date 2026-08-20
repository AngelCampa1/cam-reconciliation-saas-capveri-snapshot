# Exports and Reporting
> Last updated: 2026-06-30 - Historical PDF report generation now fails before uploading when the download-token signing secret is missing, and deletes the just-written R2 object if token minting fails after upload. Token-only historical reports stay untracked when no signed URL is returned.
> Last updated: 2026-06-25 - The year-over-year variance PDF/XLSX export is now presented as a neutral Statement Check Report. The saved filename uses `statement-check-report-*`, the artifact states which year totals were checked and what changed, and one-sided exports say when no prior-year total exists instead of claiming a false `0.00%` change. The reconciliation drawer and menu use statement-check copy while demand letters remain balance-gated.
> Last updated: 2026-06-11 - The Export drawer's Variance tab no longer shows a red "Failed to load" alert when there is simply no prior year to compare (a single-year property, or a year not yet finalized). The variance query now throws a typed `VarianceComparisonError` that flags the benign "nothing to compare" backend 400, and `VarianceReport` renders a calm info empty-state ("No prior year to compare against {year} yet") matching the sibling Denominator Changes panel. Genuine failures still show the destructive alert with retry (F-377).
> Last updated: 2026-06-07 - The reconciliation export drawer (`ExportPanel`) no longer stacks every tab's content on top of each other. Its five query-deferred tabs (PDF, Batch, ERP, History, Board) use Radix `forceMount` to stay mounted for query deferral, but `forceMount` keeps the content permanently `present`, so Radix's built-in `hidden` never engaged and inactive panels stayed visible. Inactive panels now carry `data-[state=inactive]:hidden`, so only the active tab's content shows while the others stay mounted (F-259).
> Last updated: 2026-06-20 - The Variance report now labels a pool or total whose prior year had no amount (a $0 base) as "New" instead of a misleading "+0.00%"/"$0.00 total"; the dollar amount is correct and the percent is treated as undefined. Aligned the local Python year-over-year total to the existing Cloudflare amount behavior (C26).
> Last updated: 2026-06-05 - The Tax Protest deadlines page, the Export History table, and the Variance report table are now responsive: full table on tablet/desktop, stacked cards below the md breakpoint (via useViewport). On phones each row's action (Configure, Download, Delete) renders as a full-width 44px button and every column's data stays on a card instead of scrolling off-screen (F-202).
> Last updated: 2026-05-29 - The Tax Protest deadlines page now renders an error alert with a Retry action when the deadlines query fails, instead of silently showing the empty state on a failed fetch (F-075).
> Last updated: 2026-05-29 - Past exports are now re-downloadable: every property-level export is persisted to the private reports bucket and `GET /api/v1/export/download/{id}` mints a short-lived signed URL.
> Last updated: 2026-05-28 - Detail-advisor pool details now page expense pool, mapping, and GL reads, and CapEx/tax-protest GL scans no longer apply a nonexistent organization_id filter to gl_entries.
> Last updated: 2026-05-28 - SB 1103 GL ledgers, tax protest GL/prior-year reads, and dashboard finalized recovery totals now use explicit paginated Supabase reads so large portfolios are not truncated at the default page cap.
> Last updated: 2026-05-28 - Historical PDF reports now pass the request-scoped organization client into anomaly detection so report data respects the same RLS context as the export request.
> Last updated: 2026-05-13 - Export endpoints now verify snapshot/property ownership through the current organization before service-role reads, batch ERP exports use period-overlap matching, and dynamic ReportLab paragraph text is escaped before PDF rendering.
> Last updated: 2026-04-21 - Export drawer defers detail-advisor/history fetches until the corresponding tab is active; export-adjacent sheets now ship accessible descriptions
> Last updated: 2026-02-28 — Added plan-tier annotations

> Plan tiers:
> - Board presentations → **Control** (`portfolioBoardReports`)
> - Statement detail advisor → **Control** (`statementDetailAdvisor`)
> - Tax protest data package → **Control** (`taxProtestPackage`)
> - ERP write-back → **Control** (`erpWriteBack`)
> - Multi-format exports (PDF/Excel/CSV) → **All plans**

## Overview

Multi-format export suite for tenant reconciliation statements, ERP write-back files, variance analysis, board presentations, SB 1103 compliance ledgers, and audit trail records. Two API routers handle snapshot-level exports (`/api/v1/exports/`) and property-level exports (`/api/v1/export/`).

## Features

### Tenant Reconciliation Packets (PDF)

- Per-snapshot PDF statements generated with ReportLab.
- `TenantPacketGenerator` class builds header, property info, tenant info, expense summary table, calculation breakdown, and footer with disclaimers.
- Single export: `GET /api/v1/exports/reconciliation/snapshots/{id}/export/pdf` with `allow_draft` query param.
- Batch export: `GET /api/v1/exports/reconciliation/snapshots/{id}/export/batch-pdf` with `mode=zip|combined`, `include_cover_page`, `include_calculation_details`.
- ZIP mode: individual PDFs in a ZIP archive. Combined mode: merged PDF (uses pypdf/PyPDF2, falls back to summary PDF).
- Response headers include `X-Total-Tenants` and `X-Completed-Tenants`.

### Property-Level PDF Export

- `POST /api/v1/export/pdf/preview` — PDF bytes returned inline for browser preview.
- `POST /api/v1/export/pdf/download` — PDF returned as attachment.
- `POST /api/v1/export/pdf/batch` — ZIP of per-tenant PDFs for a property/year.
- Operates over all finalized snapshots for a given `property_id` + `year`.

### ERP Write-Back

- Snapshot-level: `GET /api/v1/exports/reconciliation/snapshots/{id}/export/erp?format=yardi|mri|csv`.
- Batch: `GET /api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=&period_start=&period_end=&format=`.
- Property-level: `POST /api/v1/export/erp` with `ERPExportRequest` (includes `field_mappings` dict).
- Three formatter classes via Strategy pattern:
  - `YardiFormatter` — CSV with balanced AR/Revenue journal entries (accounts 1200/4100).
  - `MRIFormatter` — Fixed-width text format (accounts 11200/41100).
  - `GenericCSVFormatter` — Standard CSV with all reconciliation fields.

### Statement Check Report

- `POST /api/v1/export/variance/pdf` with `VarianceReportRequest` (current_year, prior_year, threshold_percent).
- `POST /api/v1/export/variance/excel` with the same `VarianceReportRequest` returns an `.xlsx` attachment (openpyxl) with current/prior totals and the variance percentage; variance is stored as a fraction so the `"0.00%"` cell format renders correctly.
- Downloaded files use `statement-check-report-{current_year}-vs-{prior_year}` names.
- The artifact title is `Statement Check Report`; narrative text says which final billing totals were checked and what change was found.
- When the prior year has no finalized total, the narrative says there was no prior-year billing total to compare instead of treating the percentage change as `0.00%`.
- Year-over-year comparison with threshold filtering (green/amber/red).
- Accessible via the statement-check report entry in the reconciliation detail export drawer (`useExportVariancePdf` / `useExportVarianceExcel`).
- Generates PDF with variance table showing categories, amounts per year, and percentage change.
- A pool (or the total) whose prior comparison year had no amount is labeled **"New"** instead of a percentage: the percent change is undefined (division by a $0 base), so the in-app table/summary shows the full current-year dollar amount with a neutral "New" badge and no red/green coloring, rather than a misleading "+0.00%". Surfaced via `isNew`/`isTotalNew` on the variance response.

### Board Presentation PDF

- `POST /api/v1/export/board/preview` - Inline PDF.
- `POST /api/v1/export/board/download` - Attachment PDF.
- `BoardExportRequest` accepts `cap_rate` (Decimal, 1%-25%) for NOI impact + asset value lift calculation.
- Designed for investor/board meetings showing recovery impact on property valuation.
- Access control: board endpoints return `402 Payment Required` when org is not active/trialing on an active or trialing Reconcile subscription.

### SB 1103 Ledger Export

- California SB 1103 compliance: 18-month itemized CAM expense ledger.
- GL entries are read with explicit pagination so exports include rows past the default Supabase page cap.
- Service: `sb1103_service.py` provides date helpers (`compute_window_start`), GL entry queries, export data assembly.
- PDF and Excel export generators using ReportLab and openpyxl.
- Deadline alert query for compliance tracking (30-day response window).
- Endpoint: via `/api/v1/compliance/`.

### Excel Export

- Multi-sheet workbooks with formatting (openpyxl).
- Year-over-Year Comparison sheet with expense categories, per-year amounts, variance %.
- Anomalies sheet listing detected anomalies.
- Historical PDF report generation uses the organization-scoped request client for anomaly detection, matching Excel export scoping and avoiding anonymous-client RLS misses.
- Header styling with branded colors, auto-column-width, currency formatting.
- Service: `excel_export.py` with `export_to_excel()` function.

### Audit Trail Export

- `GET /api/v1/exports/audit-log` — CSV export of audit log entries (admin only).
- Filters: `start_date`, `end_date`, `table_name`, `operation` (INSERT/UPDATE/DELETE), `row_id`, `changed_by`.
- Captures changes to GL entries, reconciliation snapshots, lease recovery profiles.
- Returns CSV with columns: id, table_name, operation, row_id, old_data, new_data, changed_by, changed_at.

### Statement Detail Level Advisor

- `POST /api/v1/export/detail-advisor` with `DetailLevelRequest` (property_id, year).
- Pre-export analysis that flags overly granular line items and suggests strategic grouping to reduce tenant dispute risk.
- Frontend export sheet only requests detail-advisor data when the PDF tab is active, avoiding background fetches when users open the drawer for batch, ERP, board, or history workflows.
- Heuristic rules: pool line count thresholds (>1x=SUGGESTION, >2x=WARNING, >3x=CRITICAL), immaterial item detection (<0.5% of total).
- Returns severity, summary, grouping suggestions, immaterial items, and suggested post-grouping line count.
- Service: `StatementDetailAdvisor` class in `backend/app/services/analysis/statement_detail_advisor.py`.
- Frontend: `DetailAdvisorBanner` component rendered at top of PDF tab in ExportPanel.
- Plan availability: Reconcile.

### Export History

- `GET /api/v1/export/history` — JSON list of past exports for the organization.
- Property-level PDF download, batch PDF, ERP, variance PDF, and board PDF endpoints insert completed `export_history` rows with organization, property, format, filename, file size, and user display name. The generated bytes are also uploaded to the private reports bucket and the object key stored in `storage_path` (F-024).
- `GET /api/v1/export/download/{export_id}` — re-downloads a past export. Looks up the org-scoped history row (404 if missing), returns 410 Gone for legacy rows with a NULL `storage_path`, otherwise mints a fresh 1-hour signed URL and returns `{ download_url, file_name, expires_at }`.
- Frontend export sheet only requests history when the History tab is active, which removes unnecessary network work on initial drawer open.
- Re-download in the History tab uses `useExportRedownload` (`frontend/src/api/hooks.ts`): the app is Bearer-token authenticated, so it fetches the signed URL with the token attached and then opens that URL in a new tab (a bare `window.open` of the API route would 401).

## Database Tables

### audit_log
- `id` UUID PK, `organization_id` UUID, `table_name` TEXT, `operation` TEXT (INSERT/UPDATE/DELETE)
- `row_id` UUID, `old_data` JSONB, `new_data` JSONB, `changed_by` UUID, `changed_at` TIMESTAMPTZ
- RLS: org-scoped.

### sb1103_requests
- Tracks SB 1103 compliance requests with deadlines.
- Created via migration `20260224000001_create_sb1103_requests.sql`.

### export_history
- Tracks generated property-level export files by organization and property.
- Fields include `format`, `file_name`, `file_size`, `status`, `created_by_name`, `created_at`, and `storage_path` (object key in the reports bucket; NULL for legacy rows recorded before persisted-file support).
- Created via migration `20260311000002_create_export_history.sql`; `storage_path` added in `20260529000000_add_export_history_storage_path.sql`.

### reports storage bucket
- Private Supabase Storage bucket for re-downloadable export files (all formats).
- Object paths follow `reports/{organization_id}/{property_id}/{uuid}-{file_name}`.
- Authenticated reads are scoped to the user's organization; uploads and deletes require editor-level organization access; service role can manage all report objects.
- Created via migration `20260528000000_create_reports_storage_bucket.sql`; allowed MIME types broadened (PDF, XLSX, CSV, plain text, ZIP) and size limit raised to 100 MB in `20260529000000_add_export_history_storage_path.sql`.

### Tax Protest Data Package

- Endpoint: `GET /api/v1/tax-protest/deadlines?year={year}` — returns per-property deadline items with days_remaining + is_configured flags.
- Endpoint: `POST /api/v1/tax-protest/generate` — streams a 4-file ZIP for a finalized snapshot (Reconcile subscription required → 402 otherwise).
- ZIP contents: `01_Expense_Summary.pdf`, `02_GL_by_Category.csv`, `03_Year_Over_Year_Comparison.pdf`, `04_County_Cover_Sheet.pdf`.
- GL-by-category and prior-year snapshot reads are explicitly paginated for large tax-year packages.
- County defaults from `backend/app/data/tax_protest_deadlines.json` (~60 entries; major CRE markets in TX, CA, IL, FL, NY, GA, WA, CO, AZ, NV, OH, TN, NC, PA, MN, MO, MD, VA, WI).
- Per-property overrides via `tax_protest_county` + `tax_protest_deadline_override` columns (migration `20260303000001_add_tax_protest_to_properties.sql`).
- Cover sheet PDF: green/amber/red urgency banner based on days remaining.
- `GLCategoryCSVExporter` in `backend/app/services/export/gl_category_csv.py`.
- `generate_variance_pdf()` extracted to `backend/app/services/export/variance_pdf.py`.
- Frontend: `TaxProtestButton` + `TaxProtestPanel` (Sheet form, follows AuditDefenseButton pattern) in `frontend/src/features/tax-protest/`.
- Frontend: `TaxProtestDeadlineCard` dashboard widget (Jan–Jun only, sorted by urgency, links to `/tax-protest`).
- Frontend: `/tax-protest` page with deadline table and configure links → `PropertyFormPage`.
- Frontend: `useTaxProtestDeadlines()` + `useTaxProtestExport()` hooks in `frontend/src/api/hooks.ts`.
- Property form has Tax Protest section: county combobox + deadline override date input.

## Key Files

- `backend/app/api/v1/exports.py` — Snapshot-level exports: PDF (single + batch), ERP (single + batch), audit log CSV
- `backend/app/api/v1/export.py` — Property-level exports: PDF preview/download/batch, ERP, variance PDF, board PDF, detail advisor, export history
- `backend/app/services/analysis/statement_detail_advisor.py` — Statement detail level advisor service (heuristics, grouping suggestions, immaterial flagging)
- `backend/app/services/reports/excel_export.py` — Multi-sheet Excel workbook generator
- `backend/app/services/reports/historical_report.py` — Historical analysis report data assembly
- `backend/app/services/compliance/sb1103_service.py` — SB 1103 date helpers, GL queries, PDF/Excel generators
- `backend/app/api/v1/compliance.py` — SB 1103 compliance endpoints
- `backend/app/models/sb1103.py` — SB1103Request, SB1103ExportData, SB1103GLEntry, SB1103DeadlineAlert
- `supabase/migrations/20240101000011_create_audit_log_table.sql`
- `supabase/migrations/20260311000002_create_export_history.sql`
- `supabase/migrations/20260528000000_create_reports_storage_bucket.sql`
- `supabase/migrations/20260529000000_add_export_history_storage_path.sql`
- `supabase/migrations/20260224000001_create_sb1103_requests.sql`
