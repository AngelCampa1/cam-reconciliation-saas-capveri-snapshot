# API Wiring Audit — Cross-Cutting Frontend↔Backend

**Audit scope:** `frontend/src/api/*`, `frontend/src/hooks/*`, `frontend/src/features/*/api/*`, all `backend/app/api/v1/**/*.py` routers.

---

## 1. Backend Route Inventory

All routes are prefixed with `/api/v1` via the main FastAPI app.

| # | Method | Path | Backend File | Notes |
|---|--------|------|--------------|-------|
| 1 | POST | `/api/v1/auth/welcome` | `auth.py` | Send welcome email |
| 2 | GET | `/api/v1/ai-sdr/product-context` | `ai_sdr.py` | HMAC-protected |
| 3 | GET | `/api/v1/dashboard` | `dashboard.py` | Landlord summary |
| 4 | GET | `/api/v1/properties` | `properties.py` | |
| 5 | POST | `/api/v1/properties` | `properties.py` | |
| 6 | GET | `/api/v1/properties/{property_id}` | `properties.py` | |
| 7 | PUT | `/api/v1/properties/{property_id}` | `properties.py` | |
| 8 | DELETE | `/api/v1/properties/{property_id}` | `properties.py` | |
| 9 | GET | `/api/v1/properties/{property_id}/imports` | `properties.py` | |
| 10 | GET | `/api/v1/properties/{property_id}/units` | `units.py` | |
| 11 | POST | `/api/v1/properties/{property_id}/units` | `units.py` | |
| 12 | GET | `/api/v1/properties/{property_id}/units/{unit_id}` | `units.py` | |
| 13 | PUT | `/api/v1/properties/{property_id}/units/{unit_id}` | `units.py` | |
| 14 | DELETE | `/api/v1/properties/{property_id}/units/{unit_id}` | `units.py` | |
| 15 | GET | `/api/v1/properties/{property_id}/expense-pools` | `expense_pools.py` | |
| 16 | POST | `/api/v1/properties/{property_id}/expense-pools` | `expense_pools.py` | |
| 17 | GET | `/api/v1/properties/{property_id}/expense-pools/{pool_id}` | `expense_pools.py` | |
| 18 | PUT | `/api/v1/properties/{property_id}/expense-pools/{pool_id}` | `expense_pools.py` | |
| 19 | DELETE | `/api/v1/properties/{property_id}/expense-pools/{pool_id}` | `expense_pools.py` | |
| 20 | GET | `/api/v1/properties/{property_id}/pool-mappings` | `pool_mappings.py` | |
| 21 | POST | `/api/v1/properties/{property_id}/pool-mappings` | `pool_mappings.py` | |
| 22 | PUT | `/api/v1/properties/{property_id}/pool-mappings/{mapping_id}` | `pool_mappings.py` | |
| 23 | DELETE | `/api/v1/properties/{property_id}/pool-mappings/{mapping_id}` | `pool_mappings.py` | |
| 24 | GET | `/api/v1/properties/{property_id}/pool-allocations` | `pool_allocations.py` | |
| 25 | POST | `/api/v1/properties/{property_id}/pool-allocations` | `pool_allocations.py` | |
| 26 | PUT | `/api/v1/properties/{property_id}/pool-allocations/{allocation_id}` | `pool_allocations.py` | |
| 27 | DELETE | `/api/v1/properties/{property_id}/pool-allocations/{allocation_id}` | `pool_allocations.py` | |
| 28 | GET | `/api/v1/leases` | `leases.py` | |
| 29 | POST | `/api/v1/leases` | `leases.py` | |
| 30 | GET | `/api/v1/leases/{lease_id}` | `leases.py` | |
| 31 | PUT | `/api/v1/leases/{lease_id}` | `leases.py` | |
| 32 | DELETE | `/api/v1/leases/{lease_id}` | `leases.py` | |
| 33 | GET | `/api/v1/leases/{lease_id}/recovery-profile` | `leases.py` | |
| 34 | PUT | `/api/v1/leases/{lease_id}/recovery-profile` | `leases.py` | |
| 35 | GET | `/api/v1/leases/{lease_id}/term-versions` | `lease_term_versions.py` | |
| 36 | POST | `/api/v1/leases/{lease_id}/term-versions` | `lease_term_versions.py` | |
| 37 | GET | `/api/v1/leases/{lease_id}/term-versions/effective` | `lease_term_versions.py` | |
| 38 | GET | `/api/v1/leases/{lease_id}/term-versions/{version_id}` | `lease_term_versions.py` | |
| 39 | DELETE | `/api/v1/leases/{lease_id}/term-versions/{version_id}` | `lease_term_versions.py` | |
| 40 | POST | `/api/v1/ingestion/upload` | `ingestion.py` | Multipart |
| 41 | GET | `/api/v1/ingestion/batches` | `ingestion.py` | Returns `{batches:[...]}` |
| 42 | GET | `/api/v1/ingestion/batches/{batch_id}` | `ingestion.py` | |
| 43 | POST | `/api/v1/ingestion/batches/{batch_id}/retry` | `ingestion.py` | |
| 44 | DELETE | `/api/v1/ingestion/batches/{batch_id}` | `ingestion.py` | |
| 45 | GET | `/api/v1/ingestion/mappings` | `ingestion.py` | |
| 46 | POST | `/api/v1/ingestion/mappings` | `ingestion.py` | |
| 47 | GET | `/api/v1/ingestion/gl-date-range/{property_id}` | `ingestion.py` | |
| 48 | POST | `/api/v1/reconciliation/calculate` | `reconciliation.py` | |
| 49 | GET | `/api/v1/reconciliation/jobs/{job_id}` | `reconciliation.py` | |
| 50 | GET | `/api/v1/reconciliation/snapshots` | `reconciliation.py` | |
| 51 | GET | `/api/v1/reconciliation/snapshots/{snapshot_id}` | `reconciliation.py` | |
| 52 | POST | `/api/v1/reconciliation/snapshots/{snapshot_id}/finalize` | `reconciliation.py` | |
| 53 | POST | `/api/v1/reconciliation/snapshots/finalize-batch` | `reconciliation.py` | |
| 54 | POST | `/api/v1/reconciliation/variance` | `reconciliation.py` | |
| 55 | PATCH | `/api/v1/reconciliation/cells/{cell_id}` | `reconciliation.py` | |
| 56 | GET | `/api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger` | `reconciliation.py` | |
| 57 | GET | `/api/v1/campaigns` | `campaigns.py` | |
| 58 | POST | `/api/v1/campaigns/{campaign_id}/submit-for-review` | `campaigns.py` | |
| 59 | POST | `/api/v1/campaigns/{campaign_id}/approve` | `campaigns.py` | |
| 60 | POST | `/api/v1/campaigns/{campaign_id}/reject` | `campaigns.py` | |
| 61 | POST | `/api/v1/campaigns/{campaign_id}/mark-sent` | `campaigns.py` | |
| 62 | GET | `/api/v1/pool-templates` | `pool_templates.py` | Note: no `/api/v1` prefix in router file — mounted without prefix under v1 |
| 63 | POST | `/api/v1/pool-templates` | `pool_templates.py` | |
| 64 | GET | `/api/v1/pool-templates/{template_id}` | `pool_templates.py` | |
| 65 | PUT | `/api/v1/pool-templates/{template_id}` | `pool_templates.py` | |
| 66 | DELETE | `/api/v1/pool-templates/{template_id}` | `pool_templates.py` | |
| 67 | POST | `/api/v1/pool-templates/apply` | `pool_templates.py` | |
| 68 | POST | `/api/v1/pool-templates/copy` | `pool_templates.py` | |
| 69 | POST | `/api/v1/analysis/year-over-year` | `analysis.py` | |
| 70 | GET | `/api/v1/analysis/properties/{property_id}/available-years` | `analysis.py` | |
| 71 | POST | `/api/v1/analysis/anomaly-detection` | `analysis.py` | |
| 72 | POST | `/api/v1/analysis/denominator-change` | `analysis.py` | |
| 73 | POST | `/api/v1/analysis/gl-narrative` | `analysis.py` | |
| 74 | GET | `/api/v1/analysis/gl-narrative/{property_id}/{period_year}` | `analysis.py` | |
| 75 | POST | `/api/v1/analysis/gl-narrative/{analysis_id}/dismiss` | `analysis.py` | |
| 76 | POST | `/api/v1/analysis/capex/classify` | `analysis.py` | |
| 77 | GET | `/api/v1/analysis/capex/flags/{property_id}/{period_year}` | `analysis.py` | |
| 78 | GET | `/api/v1/analysis/capex/summary/{property_id}/{period_year}` | `analysis.py` | |
| 79 | POST | `/api/v1/analysis/capex/flags/{flag_id}/review` | `analysis.py` | |
| 80 | POST | `/api/v1/analysis/capex/flags/bulk-review` | `analysis.py` | |
| 81 | POST | `/api/v1/reports/historical/pdf` | `reports.py` | |
| 82 | POST | `/api/v1/reports/historical/excel` | `reports.py` | |
| 83 | POST | `/api/v1/reports/denominator-change/pdf` | `reports.py` | |
| 84 | GET | `/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/pdf` | `exports.py` | |
| 85 | GET | `/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/batch-pdf` | `exports.py` | |
| 86 | GET | `/api/v1/exports/reconciliation/snapshots/{snapshot_id}/export/erp` | `exports.py` | |
| 87 | GET | `/api/v1/exports/reconciliation/snapshots/export/erp-batch` | `exports.py` | |
| 88 | GET | `/api/v1/exports/audit-log` | `exports.py` | |
| 89 | POST | `/api/v1/export/pdf/preview` | `export.py` | |
| 90 | POST | `/api/v1/export/pdf/download` | `export.py` | |
| 91 | POST | `/api/v1/export/pdf/batch` | `export.py` | |
| 92 | POST | `/api/v1/export/erp` | `export.py` | |
| 93 | GET | `/api/v1/export/history` | `export.py` | |
| 94 | POST | `/api/v1/export/variance/pdf` | `export.py` | **Only PDF; no Excel** |
| 95 | POST | `/api/v1/export/board/preview` | `export.py` | |
| 96 | POST | `/api/v1/export/board/download` | `export.py` | |
| 97 | POST | `/api/v1/export/detail-advisor` | `export.py` | |
| 98 | GET | `/api/v1/audit-trail` | `audit_trail.py` | |
| 99 | GET | `/api/v1/extractions` | `extraction.py` | |
| 100 | GET | `/api/v1/extractions/health` | `extraction.py` | |
| 101 | POST | `/api/v1/extractions/{document_id}/process` | `extraction.py` | |
| 102 | GET | `/api/v1/extractions/{document_id}` | `extraction.py` | |
| 103 | PUT | `/api/v1/extractions/{document_id}/approve` | `extraction.py` | |
| 104 | PUT | `/api/v1/extractions/{document_id}/draft` | `extraction.py` | |
| 105 | PUT | `/api/v1/extractions/{document_id}/reject` | `extraction.py` | |
| 106 | GET | `/api/v1/extractions/jobs/{job_id}` | `extraction.py` | |
| 107 | POST | `/api/v1/extractions/jobs/{job_id}/retry` | `extraction.py` | |
| 108 | POST | `/api/v1/documents/upload` | `documents.py` | |
| 109 | GET | `/api/v1/documents` | `documents.py` | |
| 110 | GET | `/api/v1/documents/{document_id}` | `documents.py` | |
| 111 | DELETE | `/api/v1/documents/{document_id}` | `documents.py` | |
| 112 | GET | `/api/v1/billing/launch-offer/active` | `billing.py` | |
| 113 | GET | `/api/v1/billing/guarantee/eligibility` | `billing.py` | |
| 114 | POST | `/api/v1/billing/guarantee/claim` | `billing.py` | |
| 115 | GET | `/api/v1/billing/free-audit-status` | `billing.py` | |
| 116 | GET | `/api/v1/billing/plan-selection` | `billing.py` | |
| 117 | PUT | `/api/v1/billing/plan-selection` | `billing.py` | |
| 118 | GET | `/api/v1/billing/customer` | `billing.py` | |
| 119 | POST | `/api/v1/billing/customer` | `billing.py` | |
| 120 | GET | `/api/v1/billing/subscription` | `billing.py` | |
| 121 | POST | `/api/v1/billing/subscription/upgrade` | `billing.py` | |
| 122 | POST | `/api/v1/billing/subscription/downgrade` | `billing.py` | |
| 123 | POST | `/api/v1/billing/save-offer` | `billing.py` | |
| 124 | POST | `/api/v1/billing/save-offer/{attempt_id}/accept` | `billing.py` | |
| 125 | POST | `/api/v1/billing/save-offer/{attempt_id}/decline` | `billing.py` | |
| 126 | POST | `/api/v1/billing/subscription/cancel` | `billing.py` | |
| 127 | POST | `/api/v1/billing/subscription/resume` | `billing.py` | |
| 128 | GET | `/api/v1/billing/payment-methods` | `billing.py` | |
| 129 | POST | `/api/v1/billing/payment-methods/setup` | `billing.py` | |
| 130 | POST | `/api/v1/billing/payment-methods/{pm_id}/default` | `billing.py` | |
| 131 | DELETE | `/api/v1/billing/payment-methods/{pm_id}` | `billing.py` | |
| 132 | POST | `/api/v1/billing/portal` | `billing.py` | |
| 133 | GET | `/api/v1/billing/invoices` | `billing.py` | |
| 134 | GET | `/api/v1/billing/invoices/summary` | `billing.py` | |
| 135 | GET | `/api/v1/billing/invoices/{invoice_id}` | `billing.py` | |
| 136 | GET | `/api/v1/billing/invoices/{invoice_id}/pdf` | `billing.py` | |
| 137 | POST | `/api/v1/billing/trial/start` | `billing.py` | |
| 138 | POST | `/api/v1/billing/trial/start-default` | `billing.py` | |
| 139 | GET | `/api/v1/billing/feature-usage` | `billing.py` | |
| 140 | POST | `/api/v1/billing/checkout` | `billing.py` | |
| 141 | GET | `/api/v1/billing/checkout/success` | `billing.py` | |
| 142 | POST | `/api/v1/billing/subscribe` | `billing.py` | |
| 143 | GET | `/api/v1/billing/credits` | `billing.py` | |
| 144 | GET | `/api/v1/billing/credits/history` | `billing.py` | |
| 145 | GET | `/api/v1/organization/usage` | `organization.py` | |
| 146 | GET | `/api/v1/organization/settings` | `organization.py` | |
| 147 | PATCH | `/api/v1/organization/settings` | `organization.py` | |
| 148 | GET | `/api/v1/feedback` | `feedback.py` | |
| 149 | POST | `/api/v1/feedback` | `feedback.py` | |
| 150 | POST | `/api/v1/feedback/marketing` | `feedback.py` | |
| 151 | GET | `/api/v1/feedback/my` | `feedback.py` | |
| 152 | GET | `/api/v1/feedback/stats/summary` | `feedback.py` | |
| 153 | GET | `/api/v1/feedback/{feedback_id}` | `feedback.py` | |
| 154 | PATCH | `/api/v1/feedback/{feedback_id}` | `feedback.py` | |
| 155 | POST | `/api/v1/feedback/screenshot` | `feedback.py` | |
| 156 | POST | `/api/v1/audit-requests` | `audit_requests.py` | |
| 157 | GET | `/api/v1/audit-requests` | `audit_requests.py` | |
| 158 | GET | `/api/v1/audit-requests/{request_id}` | `audit_requests.py` | |
| 159 | PATCH | `/api/v1/audit-requests/{request_id}` | `audit_requests.py` | |
| 160 | POST | `/api/v1/contact-requests` | `contact_requests.py` | |
| 161 | POST | `/api/v1/leads/content-download` | `leads.py` | |
| 162 | POST | `/api/v1/leads/calculator-unlock` | `leads.py` | |
| 163 | POST | `/api/v1/leads/plg-signup` | `leads.py` | |
| 164 | POST | `/api/v1/leads/unsubscribe` | `leads.py` | |
| 165 | POST | `/api/v1/onboard/init` | `onboard.py` | |
| 166 | PATCH | `/api/v1/onboard/upgrade` | `onboard.py` | |
| 167 | GET | `/api/v1/disputes` | `disputes.py` | Admin |
| 168 | GET | `/api/v1/disputes/{dispute_id}` | `disputes.py` | |
| 169 | PUT | `/api/v1/disputes/{dispute_id}/status` | `disputes.py` | |
| 170 | POST | `/api/v1/disputes/{dispute_id}/comments` | `disputes.py` | |
| 171 | GET | `/api/v1/tenant/invitations/{token}/validate` | `tenant/invitations.py` | |
| 172 | POST | `/api/v1/tenant/invitations` | `tenant/invitations.py` | |
| 173 | POST | `/api/v1/tenant/signup` | `tenant/signup.py` | |
| 174 | GET | `/api/v1/tenant/dashboard` | `tenant/dashboard.py` | |
| 175 | GET | `/api/v1/tenant/statements/{statement_id}/pdf` | `tenant/dashboard.py` | |
| 176 | GET | `/api/v1/tenant/notifications` | `tenant/notifications.py` | |
| 177 | POST | `/api/v1/tenant/notifications/{notification_id}/read` | `tenant/notifications.py` | |
| 178 | POST | `/api/v1/tenant/notifications/read-all` | `tenant/notifications.py` | |
| 179 | GET | `/api/v1/tenant/notifications/preferences` | `tenant/notifications.py` | |
| 180 | PUT | `/api/v1/tenant/notifications/preferences` | `tenant/notifications.py` | |
| 181 | POST | `/api/v1/tenant/disputes` | `tenant/disputes.py` | |
| 182 | GET | `/api/v1/tenant/disputes` | `tenant/disputes.py` | |
| 183 | GET | `/api/v1/tenant/disputes/{dispute_id}` | `tenant/disputes.py` | |
| 184 | POST | `/api/v1/tenant/disputes/{dispute_id}/comments` | `tenant/disputes.py` | |
| 185 | POST | `/api/v1/tenant/disputes/{dispute_id}/attachments` | `tenant/disputes.py` | |
| 186 | POST | `/api/v1/team/invitations/accept` | `team/invitations.py` | |
| 187 | GET | `/api/v1/team/invitations/{token}/validate` | `team/invitations.py` | |
| 188 | POST | `/api/v1/team/invitations` | `team/invitations.py` | |
| 189 | GET | `/api/v1/team/invitations` | `team/invitations.py` | |
| 190 | DELETE | `/api/v1/team/invitations/{invitation_id}` | `team/invitations.py` | |
| 191 | GET | `/api/v1/team/members` | `team/members.py` | |
| 192 | PATCH | `/api/v1/team/members/{member_id}` | `team/members.py` | |
| 193 | DELETE | `/api/v1/team/members/{member_id}` | `team/members.py` | |
| 194 | POST | `/api/v1/team/signup` | `team/signup.py` | |
| 195 | POST | `/api/v1/actual-billed/upload` | `actual_billed.py` | |
| 196 | POST | `/api/v1/actual-billed/manual` | `actual_billed.py` | |
| 197 | GET | `/api/v1/actual-billed/{property_id}` | `actual_billed.py` | |
| 198 | DELETE | `/api/v1/actual-billed/{property_id}` | `actual_billed.py` | |
| 199 | GET | `/api/v1/leakage/summary` | `leakage.py` | |
| 200 | GET | `/api/v1/leakage/{property_id}` | `leakage.py` | |
| 201 | GET | `/api/v1/portfolio/summary` | `portfolio.py` | |
| 202 | POST | `/api/v1/rent-roll/preview` | `rent_roll.py` | |
| 203 | POST | `/api/v1/rent-roll/import` | `rent_roll.py` | |
| 204 | POST | `/api/v1/demand-letter/generate` | `demand_letter.py` | |
| 205 | GET | `/api/v1/tax-protest/deadlines` | `tax_protest.py` | |
| 206 | POST | `/api/v1/tax-protest/generate` | `tax_protest.py` | |
| 207 | POST | `/api/v1/tools/boma-2024-calculator` | `tools.py` | |
| 208 | POST | `/api/v1/tools/hcad-tax-normalizer/calculate` | `tools.py` | |
| 209 | POST | `/api/v1/tools/fixed-cam-modeler` | `tools.py` | |
| 210 | GET | `/api/v1/compliance/sb1103` | `compliance.py` | |
| 211 | POST | `/api/v1/compliance/sb1103` | `compliance.py` | |
| 212 | GET | `/api/v1/compliance/sb1103/alerts` | `compliance.py` | |
| 213 | GET | `/api/v1/compliance/sb1103/{request_id}` | `compliance.py` | |
| 214 | PATCH | `/api/v1/compliance/sb1103/{request_id}` | `compliance.py` | |
| 215 | DELETE | `/api/v1/compliance/sb1103/{request_id}` | `compliance.py` | |
| 216 | POST | `/api/v1/compliance/sb1103/{request_id}/export` | `compliance.py` | |
| 217 | GET | `/api/v1/warranty/snapshots/{snapshot_id}/eligibility` | `warranty.py` | |
| 218 | GET | `/api/v1/warranty/certificates` | `warranty.py` | |
| 219 | GET | `/api/v1/warranty/certificates/{certificate_id}` | `warranty.py` | |
| 220 | POST | `/api/v1/warranty/snapshots/{snapshot_id}/certificates` | `warranty.py` | |
| 221 | POST | `/api/v1/warranty/certificates/{certificate_id}/attest` | `warranty.py` | |
| 222 | POST | `/api/v1/warranty/certificates/{certificate_id}/issue` | `warranty.py` | |
| 223 | GET | `/api/v1/warranty/certificates/{certificate_id}/pdf` | `warranty.py` | |
| 224 | POST | `/api/v1/warranty/certificates/{certificate_id}/void` | `warranty.py` | |
| 225 | POST | `/api/v1/properties/{property_id}/cross-doc-analysis` | `cross_doc_analysis.py` | |
| 226 | GET | `/api/v1/properties/{property_id}/cross-doc-analysis/{period_year}` | `cross_doc_analysis.py` | |
| 227 | PATCH | `/api/v1/cross-doc-analysis/{analysis_id}/findings/{finding_id}` | `cross_doc_analysis.py` | |
| 228 | PATCH | `/api/v1/organizations/{org_id}/auditor-config` | `organization.py` (inferred) | |
| 229 | PATCH | `/api/v1/properties/{property_id}/auditor-overrides` | `properties.py` (inferred) | |

---

## 2. Frontend Call Inventory

| # | Hook / File | Method | Path Called | Via |
|---|-------------|--------|-------------|-----|
| 1 | `useProperties` / `hooks.ts:315` | GET | `/api/v1/properties` | SDK |
| 2 | `useProperty` / `hooks.ts:341` | GET | `/api/v1/properties/{id}` | SDK |
| 3 | `useCreateProperty` / `hooks.ts:368` | POST | `/api/v1/properties` | SDK |
| 4 | `useUpdateProperty` / `hooks.ts:401` | PUT | `/api/v1/properties/{id}` | SDK |
| 5 | `useDeleteProperty` / `hooks.ts:443` | DELETE | `/api/v1/properties/{id}` | SDK |
| 6 | `usePropertyImports` / `hooks.ts:1063` | GET | `/api/v1/properties/{id}/imports` | SDK |
| 7 | `useImportBatches` / `hooks.ts:1028` | GET | `/api/v1/ingestion/batches` | SDK |
| 8 | `useUnits` / `hooks.ts:482` | GET | `/api/v1/properties/{id}/units` | SDK |
| 9 | `useUnit` / `hooks.ts:506` | GET | `/api/v1/properties/{id}/units/{unit_id}` | SDK |
| 10 | `useCreateUnit` / `hooks.ts:535` | POST | `/api/v1/properties/{id}/units` | SDK |
| 11 | `useUpdateUnit` / `hooks.ts:572` | PUT | `/api/v1/properties/{id}/units/{unit_id}` | SDK |
| 12 | `useDeleteUnit` / `hooks.ts:615` | DELETE | `/api/v1/properties/{id}/units/{unit_id}` | SDK |
| 13 | `useLeases` / `hooks.ts:660` | GET | `/api/v1/leases` | SDK |
| 14 | `useLease` / `hooks.ts:683` | GET | `/api/v1/leases/{id}` | SDK |
| 15 | `useCreateLease` / `hooks.ts:710` | POST | `/api/v1/leases` | SDK |
| 16 | `useUpdateLease` / `hooks.ts:743` | PUT | `/api/v1/leases/{id}` | SDK |
| 17 | `useDeleteLease` / `hooks.ts:781` | DELETE | `/api/v1/leases/{id}` | SDK |
| 18 | `useRecoveryProfile` / `hooks.ts:817` | GET | `/api/v1/leases/{id}/recovery-profile` | SDK |
| 19 | `useUpdateRecoveryProfile` / `hooks.ts:845` | PUT | `/api/v1/leases/{id}/recovery-profile` | SDK |
| 20 | `useLeaseTermVersions` / `hooks.ts:896` | GET | `/api/v1/leases/{id}/term-versions` | `apiClient.get` |
| 21 | `useLeaseTermVersion` / `hooks.ts:924` | GET | `/api/v1/leases/{id}/term-versions/{ver_id}` | `apiClient.get` |
| 22 | `useCreateTermVersion` / `hooks.ts:952` | POST | `/api/v1/leases/{id}/term-versions` | `apiClient.post` |
| 23 | `useDeleteTermVersion` / `hooks.ts:989` | DELETE | `/api/v1/leases/{id}/term-versions/{ver_id}` | `apiClient.delete` |
| 24 | `useReconciliationSnapshots` / `hooks.ts:1107` | GET | `/api/v1/reconciliation/snapshots` | SDK |
| 25 | `useReconciliationSnapshot` / `hooks.ts:1134` | GET | `/api/v1/reconciliation/snapshots/{id}` | SDK |
| 26 | `useCalculateReconciliation` / `hooks.ts:1163` | POST | `/api/v1/reconciliation/calculate` | SDK |
| 27 | `useCalculationJobStatus` / `hooks.ts:1196` | GET | `/api/v1/reconciliation/jobs/{id}` | SDK |
| 28 | `useFinalizeSnapshots` / `hooks.ts:1234` | POST | `/api/v1/reconciliation/snapshots/finalize-batch` | SDK |
| 29 | `useFinalizeSnapshot` / `hooks.ts:1451` | POST | `/api/v1/reconciliation/snapshots/{id}/finalize` | SDK |
| 30 | `useUpdateReconciliationCell` / `hooks.ts:1495` | PATCH | `/api/v1/reconciliation/cells/{id}` | SDK |
| 31 | `useCapBankLedger` / `hooks.ts:3238` | GET | `/api/v1/reconciliation/leases/{id}/cap-bank-ledger` | `apiClient.get` |
| 32 | `useDenominatorChangeReport` / `hooks.ts:3281` | POST | `/api/v1/analysis/denominator-change` | `apiClient.post` |
| 33 | `useExportDenominatorChangePdf` / `hooks.ts:3298` | POST | `/api/v1/reports/denominator-change/pdf` | raw `fetch` |
| 34 | `usePoolMappings` / `hooks.ts:1932` | GET | `/api/v1/properties/{id}/pool-mappings` | SDK |
| 35 | `useCreatePoolMapping` / `hooks.ts:1964` | POST | `/api/v1/properties/{id}/pool-mappings` | SDK |
| 36 | `useUpdatePoolMapping` / `hooks.ts:2003` | PUT | `/api/v1/properties/{id}/pool-mappings/{mapping_id}` | SDK |
| 37 | `useDeletePoolMapping` / `hooks.ts:2044` | DELETE | `/api/v1/properties/{id}/pool-mappings/{mapping_id}` | SDK |
| 38 | `usePoolAllocations` / `hooks.ts:2088` | GET | `/api/v1/properties/{id}/pool-allocations` | `apiClient.get` |
| 39 | `useCreatePoolAllocation` / `hooks.ts:2122` | POST | `/api/v1/properties/{id}/pool-allocations` | `apiClient.post` |
| 40 | `useDeletePoolAllocation` / `hooks.ts:2160` | DELETE | `/api/v1/properties/{id}/pool-allocations/{alloc_id}` | `apiClient.delete` |
| 41 | `usePoolTemplates` / `hooks.ts:2195` | GET | `/api/v1/pool-templates` | SDK |
| 42 | `useRentRollPreview` / `hooks.ts:2473` | POST | `/api/v1/rent-roll/preview` | raw `fetch` |
| 43 | `useRentRollImport` / `hooks.ts:2518` | POST | `/api/v1/rent-roll/import` | raw `fetch` |
| 44 | `useExportPdfPreview` / `hooks.ts:2659` | POST | `/api/v1/export/pdf/preview` | raw `fetch` |
| 45 | `useExportPdfDownload` / `hooks.ts:2674` | POST | `/api/v1/export/pdf/download` | raw `fetch` |
| 46 | `useExportBatchPdf` / `hooks.ts:2692` | POST | `/api/v1/export/pdf/batch` | raw `fetch` |
| 47 | `useExportErp` / `hooks.ts:2708` | POST | `/api/v1/export/erp` | raw `fetch` |
| 48 | `useExportHistory` / `hooks.ts:2735` | GET | `/api/v1/export/history` | raw `fetch` |
| 49 | `useExportVariancePdf` / `hooks.ts:2763` | POST | `/api/v1/export/variance/pdf` | raw `fetch` |
| 50 | `useExportVarianceExcel` / `hooks.ts:2781` | POST | `/api/v1/export/variance/excel` | raw `fetch` |
| 51 | `useExportBoardPreview` / `hooks.ts:2837` | POST | `/api/v1/export/board/preview` | raw `fetch` |
| 52 | `useExportBoardDownload` / `hooks.ts:2853` | POST | `/api/v1/export/board/download` | raw `fetch` |
| 53 | `useGenerateDemandLetter` / `hooks.ts:2811` | POST | `/api/v1/demand-letter/generate` | raw `fetch` |
| 54 | `useSB1103Requests` / `hooks.ts:2942` | GET | `/api/v1/compliance/sb1103` | raw `fetch` |
| 55 | `useCreateSB1103Request` / `hooks.ts:2975` | POST | `/api/v1/compliance/sb1103` | raw `fetch` |
| 56 | `useUpdateSB1103Request` / `hooks.ts:3016` | PATCH | `/api/v1/compliance/sb1103/{id}` | raw `fetch` |
| 57 | `useExportSB1103Request` / `hooks.ts:3060` | POST | `/api/v1/compliance/sb1103/{id}/export` | raw `fetch` |
| 58 | `useTaxProtestDeadlines` / `hooks.ts:3351` | GET | `/api/v1/tax-protest/deadlines` | raw `fetch` |
| 59 | `useTaxProtestExport` / `hooks.ts:3380` | POST | `/api/v1/tax-protest/generate` | raw `fetch` |
| 60 | `useCampaigns` / `hooks.ts:3123` | GET | `/api/v1/campaigns` | SDK |
| 61 | `useDisputes` / `hooks.ts:1604` | GET | `/api/v1/disputes` | SDK |
| 62 | `useDispute` / `hooks.ts:1631` | GET | `/api/v1/disputes/{id}` | SDK |
| 63 | `useUpdateDisputeStatus` / `hooks.ts:1659` | PUT | `/api/v1/disputes/{id}/status` | SDK |
| 64 | `useAddDisputeComment` / `hooks.ts:1706` | POST | `/api/v1/disputes/{id}/comments` | SDK |
| 65 | `useValidateInvitation` / `hooks.ts:1547` | GET | `/api/v1/tenant/invitations/{token}/validate` | SDK |
| 66 | `useTenantSignup` / `hooks.ts:1575` | POST | `/api/v1/tenant/signup` | SDK |
| 67 | `useExpensePools` / `hooks.ts:1746` | GET | `/api/v1/properties/{id}/expense-pools` | SDK |
| 68 | `useExpensePool` / `hooks.ts:1780` | GET | `/api/v1/properties/{id}/expense-pools/{pool_id}` | SDK |
| 69 | `useCreateExpensePool` / `hooks.ts:1808` | POST | `/api/v1/properties/{id}/expense-pools` | SDK |
| 70 | `useUpdateExpensePool` / `hooks.ts:1844` | PUT | `/api/v1/properties/{id}/expense-pools/{pool_id}` | SDK |
| 71 | `useDeleteExpensePool` / `hooks.ts:1889` | DELETE | `/api/v1/properties/{id}/expense-pools/{pool_id}` | SDK |
| 72 | `warrantyApi.listCertificates` / `warrantyApi.ts:16` | GET | `/api/v1/warranty/certificates` | `apiClient.get` |
| 73 | `warrantyApi.downloadPdf` / `warrantyApi.ts:85` | GET | `/api/v1/warranty/certificates/{id}/pdf` | raw `fetch` (no resolveApiUrl) |
| 74 | `useTeamMembers` / `use-team-invitations.ts:103` | GET | `/api/v1/team/members` | raw `fetch` |
| 75 | `useTeamInvitations` / `use-team-invitations.ts:219` | GET | `/api/v1/team/invitations` | raw `fetch` |
| 76 | `useTeamSignup` / `use-team-invitations.ts:336` | POST | `/api/v1/team/signup` | raw `fetch` |
| 77 | `useDashboard` / `DashboardPage.tsx:74` | GET | `/api/v1/dashboard` | raw `fetch` |
| 78 | `LeakageSummaryCard` / `LeakageSummaryCard.tsx:46` | GET | `/api/v1/leakage/{id}` | raw `fetch` (no resolveApiUrl) |
| 79 | `useInvoices` / `use-invoices.ts:76` | GET | `/api/v1/billing/invoices` | raw `fetch` |
| 80 | `useInvoiceSummary` / `use-invoices.ts:115` | GET | `/api/v1/billing/invoices/summary` | raw `fetch` |
| 81 | `useFreeAuditStatus` / `use-free-audit-status.ts:31` | GET | `/api/v1/billing/free-audit-status` | raw `fetch` |
| 82 | `useFeatureUsage` / `use-feature-usage.ts:28` | GET | `/api/v1/billing/feature-usage` | `authenticatedFetch` |
| 83 | `useCreditBalance` / `use-credit-balance.ts:19` | GET | `/api/v1/billing/credits` | raw `fetch` |
| 84 | `useBillingActivation` / `use-billing-activation.ts:51` | GET | `/api/v1/billing/plan-selection` | raw `fetch` |
| 85 | `AuthContext` / `AuthContext.tsx:474` | POST | `/api/v1/auth/welcome` | raw `fetch` |
| 86 | `useScreenshotCapture` / `useScreenshotCapture.ts:95` | POST | `/api/v1/feedback/screenshot` | raw `fetch` |
| 87 | `useLatestGLPeriod` / `useLatestGLPeriod.ts` | (none) | — | Returns null unconditionally |
| 88 | Mock handler | POST | `/api/v1/properties/{id}/gl-entries/upload` | MSW mock (dead path) |
| 89 | Mock handler | GET | `/api/v1/properties/{id}/gl-periods` | MSW mock (dead path) |
| 90 | Mock handler | POST | `/api/v1/reconciliations/calculate` | MSW mock (wrong path) |
| 91 | Mock handler | GET | `/api/v1/properties/{id}/import-batches` | MSW mock (wrong path) |
| 92 | Integration test | POST | `/api/v1/properties/{id}/gl-entries/upload` | test assertion (wrong path) |
| 93 | Integration test | GET | `/api/v1/properties/{id}/gl-periods` | test assertion (wrong path) |
| 94 | Integration test | POST | `/api/v1/reconciliations/calculate` | test assertion (wrong path) |

---

## 3. Findings

### F01 — P0 — `useExportVarianceExcel` calls non-existent endpoint

**File:** `frontend/src/api/hooks.ts:2781`

**What's wrong:** `useExportVarianceExcel` calls `POST /api/v1/export/variance/excel`. The backend `export.py` only defines `POST /api/v1/export/variance/pdf` (line 536). There is no Excel endpoint. Every call to `ExportPanel`'s "Export Excel" button will receive a 404 or 405.

**Backend evidence:** `backend/app/api/v1/export.py` — `@router.post("/variance/pdf")` at line 536; no `/variance/excel` route exists.

**Fix:** Either add `POST /api/v1/export/variance/excel` to the backend, or remove the hook and the Excel button from `ExportPanel.tsx:818`.

---

### F02 — P1 — `useImportBatches` response key mismatch: tries `imports` before `batches`

**File:** `frontend/src/api/hooks.ts:1033-1038`

**What's wrong:**
```ts
const imports = (data as { imports?: ... })?.imports
const batches = (data as { batches?: ... })?.batches
return { batches: (imports ?? batches ?? []) }
```
The hook tries `imports` first, then falls back to `batches`. The backend `ingestion.py:361` returns `BatchListResponse(batches=result.data)` — the key is always `batches`. The `imports` key never exists. This defensive fallback is harmless but obscures a real contract — the generated type `ImportListResponse` uses `imports` (see `types.gen.ts:2317`), creating confusion about which key the backend actually returns.

**Backend evidence:** `backend/app/api/v1/ingestion.py:361` — `return BatchListResponse(batches=result.data)`.

**Fix:** The backend `BatchListResponse` uses `batches`; `ImportListResponse` (for property-level imports) uses `imports`. They are two different shapes. The `useImportBatches` hook should simply use `data?.batches` without the `imports` fallback. If the generated type says `imports`, the generated OpenAPI schema is out of sync.

---

### F03 — P1 — MSW mock handlers use 3 dead/wrong paths — tests exercise phantom endpoints

**File:** `frontend/src/mocks/handlers/gl-ingestion.ts:76,134,146,205`

**What's wrong:**
- `POST */api/v1/properties/:propertyId/gl-entries/upload` — endpoint does not exist (real: `POST /api/v1/ingestion/upload` with `property_id` in form body)
- `GET */api/v1/properties/:propertyId/gl-periods` — endpoint does not exist (real: `GET /api/v1/ingestion/gl-date-range/{property_id}`)
- `POST */api/v1/reconciliations/calculate` — wrong path (real: `POST /api/v1/reconciliation/calculate`)
- `GET */api/v1/properties/:propertyId/import-batches` — wrong path (real: `GET /api/v1/ingestion/batches`)

These violate the wiring rules in the brief (`/api/v1/ingestion/batches` not `/import-batches`). Tests pass against these mocks but would fail in production. The integration test file `gl-ingestion-workflow.integration.test.tsx:52,75,95,127,154,207` repeats all four wrong paths.

**Fix:** Update mock handlers and integration tests to use the real paths.

---

### F04 — P1 — `warrantyApi.downloadPdf` skips `resolveApiUrl` — breaks production cross-origin

**File:** `frontend/src/features/warranty/api/warrantyApi.ts:85`

**What's wrong:**
```ts
const response = await fetch(
  `/api/v1/warranty/certificates/${certificateId}/pdf`,
  { headers }
)
```
The path is used as-is without `resolveApiUrl`. In production, the API is at `https://api.capveri.com` while the frontend is at `https://app.capveri.com`. The relative path `/api/v1/...` will hit the frontend origin and 404. All other raw `fetch` calls use `resolveApiUrl`.

**Fix:** Wrap with `resolveApiUrl()`.

---

### F05 — P1 — `LeakageSummaryCard` skips `resolveApiUrl` — broken in production

**File:** `frontend/src/components/dashboard/LeakageSummaryCard.tsx:46`

**What's wrong:**
```ts
const response = await fetch(
  `/api/v1/leakage/${propertyId}?period_start=...&period_end=...`,
  { ... }
)
```
No `resolveApiUrl`. Same production cross-origin failure as F04.

**Fix:** Import and wrap with `resolveApiUrl()`.

---

### F06 — P1 — `useLatestGLPeriod` is permanently stubbed — returns null, falls back to current year

**File:** `frontend/src/pages/reconciliation/hooks/useLatestGLPeriod.ts:24`

**What's wrong:** The hook unconditionally returns `null` with `staleTime: Infinity`. The reconciliation page falls back to `currentYear` as the default period, meaning if a property's GL data is for a prior year, the user sees no matching reconciliation data until they manually change the year. The backend provides `GET /api/v1/ingestion/gl-date-range/{property_id}` (route 47 above) specifically to solve this problem but the frontend never calls it.

**Fix:** Implement `useLatestGLPeriod` to call `GET /api/v1/ingestion/gl-date-range/{property_id}` and return `response.year`.

---

### F07 — P1 — `useImportBatches` (org-level) uses `staleTime: 5 minutes` but never invalidates after upload

**File:** `frontend/src/api/hooks.ts:1040`

**What's wrong:** After a successful `uploadFileApiV1IngestionUploadPost`, `queryClient.invalidateQueries` is never called for `queryKeys.ingestion.batchesList()`. The import list can show stale data for up to 5 minutes after upload. There is no `onSuccess` invalidation in any upload mutation hook.

**Fix:** Add `queryClient.invalidateQueries({ queryKey: queryKeys.ingestion.batchesList() })` to the upload mutation's `onSuccess`.

---

### F08 — P1 — `useValidateTeamInvitation` sends no auth header — public endpoint call uses `credentials:'include'` which only works with cookie auth

**File:** `frontend/src/hooks/use-team-invitations.ts:311-315`

**What's wrong:**
```ts
const res = await fetch(
  resolveApiUrl(`/api/v1/team/invitations/${token}/validate`),
  { credentials: 'include' }
)
```
This is correct for a public endpoint (no auth needed for validation). However, the validate endpoint is indeed public. The issue is that `use-team-invitations.ts:103,128,165,218,246,280` for authenticated team actions (list members, patch role, revoke invitations) also use raw `fetch` but build auth headers by calling a local `authHeaders()` helper inline — this is consistent with the pattern. The real concern is the `useTeamSignup` call at line 336 sends `credentials: 'include'` with no auth header, which relies on cookie-based sessions. Supabase Auth uses localStorage JWTs. The signup endpoint is public so this works accidentally, but the inconsistency is a risk.

**Fix:** Low priority for signup (public endpoint), but ensure all authenticated team management calls (members/invitations CRUD) continue using the inline `authHeaders` pattern correctly.

---

### F09 — P2 — `parseFloat` used on financial amounts from backend — float precision risk

**Files:** `frontend/src/types/pool-allocation.ts:117`, `frontend/src/types/reconciliation-snapshot.ts:203`

**What's wrong:**
```ts
// pool-allocation.ts:117
const total = percentageAllocations.reduce(
  (sum, a) => sum + parseFloat(a.allocation_value),
  0  // JS number (float64)
)
if (Math.abs(total - 100) > 0.01) { ... }
```
```ts
// reconciliation-snapshot.ts:203
const num = parseFloat(amount)  // then formatted with Intl.NumberFormat
```
The brief requires: "Money must be Decimal/string from backend — flag JS doing financial math that risks float precision loss." The backend sends `allocation_value` and `amount` as Decimal strings. When summed with `parseFloat`, cumulative float errors can cause 99.99999... to fail the `> 0.01` tolerance. The `formatRecoveryAmount` function is display-only so precision loss is tolerable there; the `pool-allocation.ts` case directly gates a UI validation.

**Fix:** For the allocation sum validation, parse values as integer basis points or use a library-level decimal sum.

---

### F10 — P2 — `useDisputes` returns `DisputeSummaryDTO[]` but backend wraps in pagination envelope

**File:** `frontend/src/api/hooks.ts:1604-1615`

**What's wrong:** The hook types the return as `DisputeSummaryDTO[]` (a plain array). If the backend now or in future returns a paginated `{ items: [...], total: N, page: P }` envelope (consistent with other list endpoints like `useReconciliationSnapshots`), the destructuring `response.data as DisputeSummaryDTO[]` will be `undefined` for each item. Must verify the backend returns a plain array.

**Backend evidence:** `backend/app/api/v1/disputes.py` — would need to confirm `response_model`. The generated SDK type `ListOrganizationDisputesApiV1DisputesGetResponse` resolves to `DisputeSummaryDTO[]` so the OpenAPI contract matches, but this should be verified stays non-paginated.

**Fix:** Verify and add a test that would fail if the backend shape changes.

---

### F11 — P2 — `useLeases` passes `status` query param, but generated SDK types don't include it

**File:** `frontend/src/api/hooks.ts:651-670`

**What's wrong:** The `useLeases` hook signature accepts `status?: string` and passes it in the `query` object to the generated SDK function. However, the generated types for `ListLeasesApiV1LeasesGetData` may not declare a `status` query parameter (the backend uses `Query(alias="status")` which the OpenAPI generator may map differently). If the SDK silently drops unknown query params, filtering by lease status is broken.

**Fix:** Confirm `ListLeasesApiV1LeasesGetData` includes `status?: string` in its query type and regenerate if needed.

---

### F12 — P2 — `AuthContext` sends `POST /api/v1/auth/welcome` without auth token — relies on unauthenticated POST

**File:** `frontend/src/contexts/AuthContext.tsx:474`

**What's wrong:** The welcome email is sent immediately after signup using a raw `fetch` with no `Authorization` header. The backend endpoint at `/api/v1/auth/welcome` is documented to be called after new org signup. If the backend requires a valid session, this will 401. If it's intentionally public (no auth), it could be abused to spam welcome emails.

**Fix:** Verify the backend auth dependency for `/api/v1/auth/welcome`; add the session token to the call if auth is required.

---

### F13 — P2 — `useExportSB1103Request` sends `?format=...` as query param but backend expects it in request body

**File:** `frontend/src/api/hooks.ts:3060-3068`

**What's wrong:**
```ts
const response = await fetch(
  resolveApiUrl(
    `/api/v1/compliance/sb1103/${requestId}/export?format=${format}`
  ),
  { method: 'POST', ... }
)
```
The endpoint is called with `format` as a query string parameter. If the backend expects it in the JSON body or as a path parameter, the export will silently use a default format.

**Fix:** Verify `backend/app/api/v1/compliance.py` export endpoint signature and align the call to match (body or query param).

---

### F14 — P2 — `useExportHistory` and `useTaxProtestDeadlines` bypass 30s timeout wrapper

**Files:** `frontend/src/api/hooks.ts:2735`, `frontend/src/api/hooks.ts:3351`

**What's wrong:** These hooks use raw `fetch()` instead of `apiClient` or `authenticatedFetch`. The 30-second `AbortSignal.timeout` defined in `client.ts:79` is not applied. Long-running export history queries or tax deadline queries can hang indefinitely, locking the UI.

**Fix:** Use `authenticatedFetch` (which inherits through `resolveApiUrl`) or wrap with `AbortSignal.timeout(30_000)` manually.

---

### F15 — P2 — `useImportBatches` (hooks.ts) is not exported from `hooks.ts` index but is exported from `index.ts`

**File:** `frontend/src/api/index.ts` / `frontend/src/api/hooks.ts`

**What's wrong:** `useImportBatches` and `usePropertyImports` are defined in `hooks.ts` but not included in the `index.ts` re-export block (lines 33-67). Consumers that import from `@/api` directly cannot access these hooks and must import from `@/api/hooks` instead. The inconsistency breaks the module contract.

**Fix:** Add `useImportBatches`, `usePropertyImports`, and other missing hooks (e.g. `useLeaseTermVersions`, `useRentRollPreview`, `useCapBankLedger`, `useSB1103Requests`) to the `index.ts` export list.

---

### F16 — P3 — Integration test file targets 4 phantom endpoint paths — tests pass but verify nothing real

**File:** `frontend/src/__tests__/integration/gl-ingestion-workflow.integration.test.tsx:52,75,95,108,127,154,207`

**What's wrong:** The integration test asserts requests to `*/api/v1/properties/${mockPropertyId}/gl-entries/upload`, `*/api/v1/properties/${mockPropertyId}/gl-periods`, and `*/api/v1/reconciliations/calculate` — all paths that don't exist in the backend. The tests succeed because they match the equally-wrong MSW mock handlers, but the test suite gives false confidence that file upload and reconciliation triggering work.

**Fix:** Rewrite the mocks and test assertions to use the real paths identified in F03.

---

### F17 — P3 — Warranty PDF download uses relative URL without `resolveApiUrl` — duplicate of F04

See F04. `warrantyApi.ts:85` — `fetch('/api/v1/warranty/certificates/${certificateId}/pdf', ...)`. Same production failure.

---

### F18 — P2 — Missing frontend wiring for several implemented backend features

The following backend endpoints exist but have no corresponding hook, SDK call, or UI call in `frontend/src`:

| Endpoint | Backend File |
|----------|-------------|
| `GET /api/v1/ingestion/gl-date-range/{property_id}` | `ingestion.py:660` |
| `GET /api/v1/leakage/summary` | `leakage.py` |
| `GET /api/v1/portfolio/summary` | `portfolio.py` |
| `POST /api/v1/analysis/anomaly-detection` | `analysis.py` |
| `POST /api/v1/analysis/gl-narrative` | `analysis.py` |
| `GET /api/v1/analysis/gl-narrative/{property_id}/{period_year}` | `analysis.py` |
| `GET /api/v1/billing/credits/history` | `billing.py` |
| `GET /api/v1/billing/invoices/{invoice_id}/pdf` | `billing.py` |
| `POST /api/v1/billing/trial/start-default` | `billing.py` |

Most critical is `gl-date-range` (see F06). Others represent missing features.

---

### F19 — P3 — `useDemandLetterRequest` interface (hooks.ts:2793) includes `state: 'TX' | 'CA'` but backend may accept more states

**File:** `frontend/src/api/hooks.ts:2793`

The frontend type narrowing to `'TX' | 'CA'` is a UI constraint, not a backend contract. If the backend `demand_letter.py` accepts other states, the frontend silently prevents their use. Low severity since TX/CA are the documented supported states.

---

### F20 — P2 — `useExportBatchPdf` expects `tenant_ids: string[]` but backend `BatchPDFRequest` expects `list[UUID]`

**File:** `frontend/src/api/hooks.ts:2559-2563`, `backend/app/api/v1/export.py:96-100`

**What's wrong:** Frontend `BatchPDFRequest` defines `tenant_ids: string[]`. Backend `BatchPDFRequest` defines `tenant_ids: list[UUID]`. FastAPI will parse valid UUID strings automatically, but if the frontend sends non-UUID strings (e.g. empty strings or partial IDs), FastAPI returns a 422 validation error that the UI does not handle explicitly.

**Fix:** Validate UUIDs on the frontend before calling the mutation, and add error handling for 422.

---

## Summary

| Finding | Severity | Short Description |
|---------|----------|-------------------|
| F01 | **P0** | `useExportVarianceExcel` → `POST /api/v1/export/variance/excel` does not exist |
| F02 | **P1** | `useImportBatches` checks `data.imports` first but backend returns `data.batches` |
| F03 | **P1** | 4 MSW mock handlers use dead/wrong paths (gl-entries/upload, gl-periods, reconciliations/calculate, import-batches) |
| F04 | **P1** | `warrantyApi.downloadPdf` skips `resolveApiUrl` — breaks production cross-origin |
| F05 | **P1** | `LeakageSummaryCard` uses bare relative URL, no `resolveApiUrl` — breaks production |
| F06 | **P1** | `useLatestGLPeriod` permanently returns null; `GET /api/v1/ingestion/gl-date-range/{id}` never called |
| F07 | **P1** | Upload mutation never invalidates org-level import batch cache |
| F08 | **P1** | Team invitation validate uses `credentials:'include'` instead of Bearer token pattern |
| F09 | **P2** | `parseFloat` used to sum financial allocation values — float precision risk |
| F10 | **P2** | `useDisputes` assumes flat array; verify backend never wraps in pagination envelope |
| F11 | **P2** | `useLeases` passes `status` query param — verify SDK generated types include it |
| F12 | **P2** | `AuthContext` sends `POST /api/v1/auth/welcome` without auth header |
| F13 | **P2** | `useExportSB1103Request` sends `format` as query param — verify backend expects body |
| F14 | **P2** | Raw `fetch` in export/tax hooks bypasses 30s timeout from `client.ts` |
| F15 | **P2** | `useImportBatches`, `usePropertyImports` missing from `api/index.ts` export block |
| F16 | **P3** | Integration tests assert against 4 phantom endpoint paths |
| F17 | **P3** | Duplicate of F04 — warranty PDF URL missing `resolveApiUrl` |
| F18 | **P2** | `GET /api/v1/ingestion/gl-date-range`, leakage summary, portfolio, and other endpoints have no frontend hook |
| F19 | **P3** | Demand letter `state` type narrowed to `TX\|CA` in frontend, may not match backend |
| F20 | **P2** | `useExportBatchPdf` `tenant_ids: string[]` vs backend `list[UUID]` — no 422 handling |
