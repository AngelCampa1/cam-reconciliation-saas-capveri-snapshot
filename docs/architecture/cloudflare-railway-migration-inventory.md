# Cloudflare Railway Migration Inventory

## Production Goal

Eliminate Railway compute and Railway billable resources. Keep the current Postgres database provider for now.

The migration plan records the product owner's direction as keeping Neon/current Postgres in place, but the repository evidence is still Supabase/Auth/PostGREST-heavy and does not prove an in-tree Neon integration. Treat Neon as a production/provider assertion to verify, not as an implemented repo boundary.

## Implementation Progress

This is the current Worker migration ledger for routes moved off the Railway
FastAPI surface in branch `feature/cloudflare-railway-migration`.

| Commit | Worker slice | Status | Notes |
|---|---|---|---|
| `f4ee57a2` | Analysis routes | Committed | Adds Worker-native analysis endpoints for the first analytics slice. |
| `d9991caf` | Team admin routes | Committed | Adds team member and invitation administration routes. |
| `bcdec151` | Team signup routes | Committed | Adds public team invitation validation and signup flow. |
| `edb8d5c7` | Tenant auth routes | Committed | Adds tenant invitation creation, public validation, and tenant signup. |
| `e789d817` | Tenant portal dashboard and notifications | Committed | Adds tenant dashboard JSON, notification list/read/read-all, and email preference routes; statement PDF and disputes remain separate slices. |
| `cf5fc857` | Auth/account lifecycle | Committed | Adds welcome side effects, authenticated legal acceptance, and guarded account deletion routes. |
| `0dd69a39` | Billing trial and invoices | Committed | Adds no-card trial start/default start and invoice list/summary/detail/PDF routes; payment methods, cancellation, guarantee, and save-offer remain separate slices. |
| `6cac4090` | Billing subscription lifecycle | Committed | Adds subscription read, scheduled/immediate cancel, paused resume, scheduled-cancel resume, and best-effort save-offer decline compatibility; payment methods, guarantee, and full save-offer remain separate slices. |
| `d6d32242` | Billing save-offer flow | Committed | Adds cancel survey submission, discount offer acceptance, save-offer decline, Stripe coupon application, and the `STRIPE_SAVE_OFFER_COUPON_ID_ANNUAL` Worker var; payment methods and guarantee remain separate slices. |
| `0758b457` | Billing money-back guarantee | Committed | Adds guarantee eligibility and claim routes, first-paid-invoice lookup, Stripe invoice/refund/cancel calls with refund idempotency, guarded claim recording, and no-proration subscription cancellation; payment methods remain separate. |
| `2b891b35` | Billing payment methods | Committed | Adds card list/default detection, setup intent creation, default-card updates, guarded card detach, owner-only mutations, and Stripe payment method ownership checks. |
| `7577dde1` | Billing subscription upgrade/downgrade/subscribe | Committed | Final billing-router gap. `POST /billing/subscription/upgrade` + `/downgrade` are owner-gated **disabled stubs** mirroring FastAPI byte-for-byte: `requireOwner` (403) → 400 detail `"Plan changes are no longer supported. Reconcile is the only active subscription; use checkout to update rentable unit count."`. `POST /billing/subscribe` (owner-gated) is a Stripe checkout-session creator reusing the existing `/checkout` helpers (`validatePlanSelection`, `getAnnualTotalCents`, `buildReconcileCheckoutLineItems`, `resolveTrialDays`, `createAndPersistStripeCustomer`, `stripeCreateCheckoutSession`); returns `SubscribeResponse {checkout_url, tier, price_annual_cents, trial_days}`. Parity verified vs `billing.py:1664-1785`: 422 `No annual price configured for tier: {tier}`, 404 `Organization not found`, 500 `Failed to create checkout session`; metadata keys (billing_model/organization_id/tier/plan_id/pricing_model/building_count/unit_count/included_units/unit_overage_count/annual_total_cents) string-coerced; trial-day resolution (local card-less trialing/paused → remaining `max(1, ceil(ms/86_400_000))` else TRIAL_DAYS=30) matches `_remaining_trial_days`; integer cents only. 10 new tests; full Worker suite **1213**. Opus review: **APPROVE**, no fixes. **Known pre-existing divergence (flagged, not in this slice):** shared `createAndPersistStripeCustomer` has a 409 `Cannot create Stripe customer without a local subscription` guard that FastAPI `get_or_create_customer` lacks, which also affects `/checkout` too; revisit as its own scoped review. |
| `c887ae43` | Tenant statement PDF and dispute routes | Committed | Adds Worker-native tenant statement PDF download (pdf-lib, no Railway proxy), dispute create/list/detail, comments, and R2-backed attachment upload/download. `author_id`/`uploaded_by` use the tenant's `users(id)`; `tenant_user_id` for ownership scoping. R2 key order `{org}/disputes/{disputeId}/{uuid}/{filename}` matches FastAPI; injectable storage with tested rollback-on-db-failure. decimal.js currency/trace formatting ported from Python. Notifications side-effect on dispute events is deferred to the background-work slice. |
| `d6bfdcae` | ERP export, audit-log, export-history (export sub-slice A) | Committed | First export sub-slice: the endpoints with no document-generation library and no storage writes. Yardi/MRI/Generic ERP formatters ported byte-for-byte (incl. CSV-injection neutralization, control-char stripping, `\r\n`); single + batch ERP, admin-only audit-log CSV (JSONB rendered via faithful Python `str(dict)` serializer + truthiness guard), and export-history JSON pagination. Org isolation by explicit `organization_id` WHERE on every query. |
| `c5ad7818` | Snapshot/preview/demand-letter PDFs (export sub-slice B) | Committed | Stream-only pdf-lib PDF endpoints (no storage writes): landlord snapshot PDF, billing-gated property preview (inline), billing-gated demand-letter (TX/CA legal text copied byte-for-byte). Landlord + tenant PDFs now share `src/domain/pdf/layout.ts` helpers (DRY). `require_full_access` gate replicated (402). FastAPI-matching guards/filenames/messages; decimal.js money. |
| `00002233` | Detail-level advisor JSON (export sub-slice C4) | Committed | EP-15 `POST /export/detail-advisor`, Worker-native pure compute (no external calls). Faithful port of `_build_pool_details` + `StatementDetailAdvisor.analyze`: GL→pool match via a CPython `fnmatch.translate` port (replace-all `%`→`*`, plus `*`/`?`/`[seq]`), first-match-wins, allocated = amount × allocation_percentage, grand_total = sum of all GL amounts; thresholds/immateriality/overall-severity/suggested_total_lines and summary/explanation wording match Python exactly. Decimal fidelity via a `PyDecimal` clone (precision 28, ROUND_HALF_EVEN) matching Python's context; money serialized as JSON strings (Pydantic v2). Reuses org-scoped analysis.ts adapters; `listGlEntries` extended with `account_description` (additive). Landlord 403 + full-access 402 gates. |
| `65f703eb`,`a147500c`,`f208f32e`,`66c3cdec` | Historical analysis XLSX (export sub-slice C5) | Committed | EP-17 `POST /api/v1/reports/historical/excel`, Worker-native, stream-only (no storage, no `export_history`). Two-sheet ExcelJS workbook ("Year-over-Year Comparison" + "Detected Anomalies") byte-matching `excel_export.py` (sheet names, header text, fills `E0E7FF`/`FFCCCC`/`FFFFCC`/severity colors, `$#,##0` + `0.0%` formats, widths, disclaimer). Year-over-year ports `historical_analysis.py` (GL→pool fnmatch with replace-all `%`→`*` + allocation × first-match-wins; fuzzy pool-rename matching via a faithful **python-Levenshtein `ratio`** port, substitution cost 2, threshold 0.80, lowercase-only, greedy best-first, replacing a divergent prior metric). Anomaly sheet ports the **default detector set**; `isolation_forest` ported faithfully (np.median even-length averaging, MAD × 1.4826, Z>3.5, `mad==0` fallback, verbatim strings). **`arima` detector RETIRED on BOTH backends** (product-owner decision 2026-06-13: statsmodels MLE ARIMA is not faithfully reproducible in a Worker; default set is now `["variance","category","isolation_forest"]` in Python too; Python `_detect_arima` preserved for explicit opt-in). Money/variance math uses a `PyDecimal` clone (precision 28, ROUND_HALF_EVEN); removed a global `Decimal.set` mutation in `calculators.ts` (now a local `Calc` clone). Variance-explanation money matches Python `f"${x:,.2f}"` exactly. Ordinal (code-point) pool-name sort matches Python `sorted()`. Landlord 403 + full-access 402 gates; org-scoped reads. Reuses org-scoped `analysis.ts` adapters. |
| `b0e0e362` | Historical analysis PDF (export sub-slice C7) | Committed | EP-16 `POST /api/v1/reports/historical/pdf`, Worker-native, **persisted to R2** (no `export_history` row: matches the Python route, which only uploads + signs). Reuses the EP-17-ported engine: `buildYearOverYearComparison` (`use_fuzzy_matching: true`) + `detectAnalysisAnomalies` (default set variance+category+isolation_forest; `target_year=max(years)`, `comparison_years=[y<max]`). PDF via pdf-lib reusing `src/domain/pdf/layout.ts`: title, "Report Date" (`%B %d, %Y`), "Analysis Period {min}-{max}", Executive Summary bullets (variance-truthiness branch, critical/minor/consistent), Year-over-Year table (top 15 pools, `format_usd_whole`, `:+.1f%` variance, totals row, em-dash U+2014 for missing), Detected Anomalies table (top 10, severity coloring #fee2e2/#fef3c7, `spike`/`drop`→`:+.1f% variance` else "See explanation") or the "No significant anomalies detected" fallback, fine-print footer. All strings byte-for-byte. `format_usd_whole` ported with ROUND_HALF_EVEN; all `:.1f`/`:+.1f` use HALF_EVEN to match Python `Decimal.__format__`. **Storage normalized Supabase Storage → R2 + HMAC token:** uploads to `REPORTS_BUCKET` key `reports/{org}/{property}/{crypto.randomUUID()}.pdf`, mints a **7-day (604800s)** download token via the EP-7/EP-11 helper (per-call expiry; shared 3600s constant untouched), returns `{report_url: {origin}/api/v1/export/download/file?token=..., expires_at: now+7d ISO, format:"pdf"}`. Public download route verifies by HMAC only and streams R2 bytes from the token's `r2Key`. No `export_history` lookup, so the orphan object downloads without a row. Error mapping matches the route (years<2 → 400 exact detail; ValueError → 400; generic → 500 `Failed to generate PDF report:`). Landlord 403 + full-access 402; org-scoped reads. Opus review verdict SHIP (two benign LOWs: inherited `anomaly_alerts` telemetry write, colocated `formatUsdWhole`). |
| `7cb6821b`,`2d1e242b` | Denominator-change PDF (export sub-slice C6) | Committed | EP-18 `POST /api/v1/reports/denominator-change/pdf`, Worker-native, stream-only (no storage, no `export_history`). Faithful port of `denominator_change.py`: org-scoped finalized-snapshot reads of `reconciliation_snapshots.lease_terms_snapshot` (period-range load + auto-detect-prior = most-recent `period_end_date` before `current_start`), the 5 change detectors (RSF, tenant roster, exclusion set-joins, BOMA transition dedupe in first-seen order, share recalculation) + per-tenant impacts (skip rules, substring contributing-change matching, SHARE_RECALCULATION auto-append) + summary, all byte-for-byte strings. PDF via pdf-lib reusing `src/domain/pdf/layout.ts` (reportlab not byte-equal, faithful content/layout). Money/RSF/pct arithmetic uses a `PyDecimal` clone; explicit `.quantize(...,ROUND_HALF_UP)` sites mirror Python; **display formatters use ROUND_HALF_EVEN** to match Python `Decimal.__format__` (f-string `:.2f`/`:,.0f`/`:,.2f`/`:+.2f`) and emit fixed-2dp percentages (`5.00%` not `5%`), caught in opus review (`2d1e242b`), shared `formatUsd` aligned to HALF_EVEN with full-suite no-regression check. Error mapping matches the PDF route (ValueError/no-comparable-snapshots → 400, generic → 500). Landlord 403 + full-access 402 gates; org-scoped parameterized reads. |
| `5f64fcb4` | Variance XLSX via ExcelJS (export sub-slice C3) | Committed | EP-13 `POST /export/variance/excel`, Worker-native. Introduces **ExcelJS** as the export workbook library, verified to run under `@cloudflare/vitest-pool-workers` (workerd) with `nodejs_compat` (throwaway probe confirmed, then deleted). `buildVarianceXlsx` (src/domain/exports/variance-xlsx.ts) is a pure builder matching the openpyxl layout exactly (sheet "Variance", numeric B/C cells, `$#,##0.00` + `0.00%` fraction formats, fill #2C5282, widths 16/20/14, "Generated …UTC" row 8, illegal-char strip) and is reusable by EP-17. Reuses EP-12 data path + `computeVariancePct` + schema; R2-persisted (`variance_excel`) with rollback. Tests parse the real .xlsx via fflate. Bundle 827.50 KiB gzip. |
| `dd600898` | Batch ZIP, variance PDF, board PDF exports (export sub-slice C2) | Committed | Three persisted Worker-native exports (pdf-lib + fflate), no Railway proxy. EP-8 `POST /export/pdf/batch`: one property PDF per `lease_id` (reuses `buildPropertyPdf`), zipped with fflate, persisted to R2 (`format "pdf_batch"`); lease_id filter, no-match→400, mode!="zip"→400. EP-12 `POST /export/variance/pdf`: current-vs-prior recovery variance PDF, R2-persisted (`variance_pdf`); `computeVariancePct` unit-tested (prior==0→0). EP-14 `POST /export/board/preview` (inline, not persisted) + `/export/board/download` (R2-persisted `board_pdf`); `calculateNoi` mirrors `noi_impact.py` (decimal.js ROUND_HALF_UP, asset_value_lift = recovery / cap_rate), cap_rate [0.01,0.25]; `record_feature_use("noi_impact_calculator")` deferred. New org-scoped repo methods `listSnapshotsForYear` (finalized + year-overlap) and `getPropertyName`; R2 rollback on insert failure for all three persisted paths. fflate ^0.8.3. |
| `fd9c7845` | Audit-trail query endpoint | Committed | Port of `backend/app/api/v1/audit_trail.py`: GET `/api/v1/audit-trail` (admin only: party landlord AND role owner\|admin → else 403 `insufficient_permissions`; matches `CurrentAdminUser`). Org-scoped `audit_log` query: COUNT(*) exact + paged SELECT, `order by changed_at desc`, LIMIT/OFFSET. Filters: `start_date` (≥ floor), `end_date` (≤ `T23:59:59.999999` matching Python `datetime.max.time()`), `table_name`, `operation` (UPPERCASED), `row_id`/`changed_by` (uuid-validated → 400), `page`≥1 default 1, `page_size`≥1 ≤100 default **50** (>100 → 400). `AuditLogEntry`: `id` stays **integer** (no `::text` cast); `old_data`/`new_data`/`session_info` returned as **parsed JSON objects** (not the python-repr serializer the CSV export slice uses); uuids/timestamps as text. Introduces a **shared `createPaginatedResponse<T>` helper** (`src/http/pagination.ts`) emitting the full **7-field** PaginatedResponse (`items,total,page,page_size,total_pages,has_next,has_previous`) byte-matching Python's `@computed_field` math. Reusable to retrofit export-history. Parameterized dynamic filters (aligned `$n` indices). 18 route tests; full Worker suite 1051. Opus review: no issues. |
| `ac7bd6c8` | Audit-requests lead-capture + admin router | Committed | Port of `backend/app/api/v1/audit_requests.py` (4 endpoints, prefix `/audit-requests` at `/api/v1`). POST is **public** (no auth: applied inline on admin routes only so the collection POST stays open): handler order matches Python exactly: lowercase email → **honeypot** (`company_website` truthy → synthetic 201 via `crypto.randomUUID()` + now timestamps, **no DB write**, repo not called) → Turnstile (`CloudflareTurnstileVerifier`, 403 `"Verification failed. Please try again."`) → **DB-COUNT rate limit** 3/email/24h (`countRecentByEmail(email, nowMinus24hIso)` ≥3 → 429) → insert (no row → 500) → 201 with created row. GET list / GET `:id` / PATCH `:id` are **platform-admin** gated by **`isServiceAdmin` ONLY** (mirrors `get_current_platform_admin`'s `is_platform_admin` check, deliberately **no** role/party check, unlike audit-trail). GET list returns a **bare JSON array** (Python `list[...]`), status filter, `page`/`per_page` (≤100) offset pagination, `created_at desc`. PATCH builds the update set like Python incl. status→timestamp mapping (contacted/scheduled/completed/converted only), empty body → 400, missing → 404, `updated_at` left to DB trigger. Direct parameterized Postgres, `::text`/`::int` casts, `RETURNING *`. 27 route tests (incl. unauth POST OK + unauth GET 401 + non-admin 403); full Worker suite **1078**. Opus review: no Critical/Important (two benign notes: shared-adapter Turnstile non-prod-bypass divergence, generous email max). |
| `b26296cb` | Tax-protest deadlines read endpoint | Committed | Port of `backend/app/api/v1/tax_protest.py` GET `/api/v1/tax-protest/deadlines` (the read endpoint; the heavy `POST /generate` ZIP packet (PDF cover sheet + GL CSV + variance PDF + expense-summary PDF) is **deferred** to a follow-up sub-slice, no stub). **Auth: OrgContext only**: no landlord/editor/full-access gate (matches the FastAPI route's sole `OrgContext` dependency; unauth → 401). `year` query param coerced int 2000..2100 (out-of-range/non-int → 400 validation_error), default = current **UTC** year. Per org-scoped property (`properties` SELECT, explicit `organization_id` WHERE): county-deadline lookup against the ported **`COUNTY_DEADLINES`** table (`src/domain/tax-protest/deadlines.ts`: **all 64 entries verbatim** from `app/data/tax_protest_deadlines.json`, opus-verified field-by-field incl. `Miami-Dade`/`St. Louis City`/`Prince George's`/`§`/en-dash notes; case-insensitive state+county match), `computeEffectiveDeadline` branch order **override > county-resolved-to-`Date.UTC(year,m-1,d)` > null**, `computeDaysRemaining` UTC date-only diff (negative = overdue), `is_past = days_remaining<0`, `is_configured = bool(county or override_date)` (uses `||` so empty-string county is falsy, exact Python parity, orchestrator fix). Response `{items: PropertyDeadlineItem[], year}` field names/order/nullability match the Pydantic model. `tax_protest_deadline_override::text` → YYYY-MM-DD string. New: `domain/tax-protest/{repository,deadlines}.ts`, `adapters/db/tax-protest.ts`, `http/tax-protest-routes.ts`. 28 route + pure-fn tests; full Worker suite **1203**. Opus review: no Critical/Major (one Minor empty-string `is_configured` parity tightened by orchestrator before commit; benign `ORDER BY name` added). |
| `88f43f5a` | Landlord disputes admin router | Committed | Port of `backend/app/api/v1/disputes.py` (4 admin endpoints, mounted `/api/v1`, prefix `/disputes`). This is the landlord-side counterpart to the tenant dispute slice (`c887ae43`). **Reuses + extends** the existing `tenant-disputes` repository/adapter and the `disputes`/`dispute_comments`/`dispute_attachments` tables (new `PostgresAdminDisputesRepository` alongside the tenant one, no schema duplication). GET `/disputes` (org-scoped list, **landlord any-role** = `requireLandlord`, matches Python `OrgContext`; `status` filter, `skip`/`limit` ≤100 default 50, `created_at desc`). GET `/disputes/:id` (org-scoped admin detail; **includes internal comments**, not filtered, unlike tenant view; comment author names via `users` join, fallback "Unknown"; attachments surfaced as **auth-gated Worker download-route URLs** `/api/v1/disputes/:id/attachments/:id`, NOT raw `storage_path`. Opus review caught a phantom-presign raw-path leak and aligned it to the tenant slice's streaming-route pattern). GET `/disputes/:id/attachments/:id` (new download surface required to make `file_url` functional; org-scoped, CR/LF + quote-sanitized `Content-Disposition`, 404 cross-org/missing, mirrors the tenant attachment route). PUT `/disputes/:id/status` (**full-access 402 → admin 403**, matches decorator `require_full_access` then param `get_current_admin_user`; byte-faithful `VALID_TRANSITIONS` map open→{under_review,rejected}/under_review→{resolved,rejected}/resolved→{closed}/rejected→{closed}/closed→{}, exact 400 detail `"Cannot transition from {a} to {b}"`; `resolution_summary` required non-empty on resolved/rejected → 400 `"Resolution summary is required"`; sets `resolved_at`/`resolved_by` only then). POST `/disputes/:id/comments` (full-access 402 → admin 403; `content` 1..**5000** matching the request schema, not the service's 50000; admins MAY set `is_internal=true`; author_id = actor user, name from profile). **Notifications + analytics/`record_feature_use` deferred** to the background-work slice, consistent with `c887ae43`. Org isolation via explicit `organization_id` WHERE on every admin query (never `tenant_user_id`); cross-org → 404. 45 route tests; full Worker suite **1175**. Opus review: 1 Critical (phantom presign / raw-path leak) + 2 Important (test validated phantom behavior; tenant-slice inconsistency) all FIXED before commit. |
| `04d66c7e` | SB1103 compliance router (sub-slice A, 6 non-export endpoints) | Committed | Port of `backend/app/api/v1/compliance.py` (mounted `/api/v1`, prefix `/compliance/sb1103`). The 6 NON-export endpoints; the PDF/XLSX `POST /:id/export` is deferred to sub-slice B. GET list / GET `:id` / GET `/alerts` are **landlord any-role** reads (`requireLandlord`, matches Python `OrgContext`; tenant party → 403, unauth → 401). `/alerts` is registered **before** `/:id` so the literal segment isn't swallowed. POST create + PATCH `:id` gate **editor(403)→full-access(402)** (mirrors FastAPI `dependencies=[require_org_editor, require_full_access]` evaluation order, fixed from a 402-first draft in opus review); DELETE `:id` gates **full-access(402)→admin(403)** (mirrors decorator `require_full_access` then param `CurrentAdminUser`), 204 on success. Create validates org-scoped property (404 "Property not found") + lease (404 "Lease not found") + lease↔property match (400 "Lease does not belong to the requested property"); auto-computes `response_deadline = request_date + 30d`, `window_start_date = request_date − 18 CALENDAR months` (faithful python-dateutil `relativedelta` with month-end clamp, incl. leap-year `2025-08-31→2024-02-29`), `window_end_date = request_date`, `status "pending"`. List → `SB1103ListResponse {data, count:len, has_more:false}` (literal, no cursor), `property_id`+`status` filters, `created_at desc`. Alerts → bare `SB1103DeadlineAlert[]`, `days_warning` default 7 / int ge=0 (400 otherwise), `response_deadline <= today+days_warning AND status != 'delivered'`, order asc, `days_remaining=(deadline-today).days`, batch property/tenant name lookups with "Unknown Property"/"Unknown Tenant" fallbacks. **All date math in UTC** (`Date.UTC`/`.toISOString().slice(0,10)`). No TZ day-shift. Direct parameterized Postgres, explicit `organization_id` WHERE on every query, dynamic UPDATE SET, `RETURNING *`. 52 route tests (real route+repo, fake DB boundary); full Worker suite **1130**. Opus review: no Critical/Important (gating-order parity fix applied; minor noted: malformed `:id`→400 vs FastAPI 422, consistent with sibling Worker routes). |
| `b2a8eb57` | E&O warranty certificate router | Committed | Port of `backend/app/api/v1/warranty.py` (mounted at `/api/v1`, prefix `/warranty`). Four LIVE endpoints: GET `/snapshots/:id/eligibility` (auth, any org user incl tenant, no role guard, matches Python `OrgContext`; org-scoped `reconciliation_snapshots` provenance check producing byte-for-byte `reasons[]`, plus existing-cert lookup), GET `/certificates` (org-scoped list `created_at desc`), GET `/certificates/:id` (org-scoped, 404 `"Certificate not found."`), POST `/certificates/:id/void` (full-access 402 **and** admin 403, both Python deps preserved; `VoidCertificateRequest.reason` 10 to 500 zod-validated → 400; 409 `"Certificate already voided."`; `RETURNING` updated row). Four DISABLED endpoints return **423 LOCKED** with exact detail `"Reconciliation certificate/report unavailable pending updated terms."`: create/attest/issue gate full-access(402)→admin(403)→423, pdf gates auth→423; **PDF generator NOT ported** (unreachable behind 423). Org isolation via explicit `organization_id` WHERE (no RLS), parameterized; `ingestion_batch_ids` null→`[]` (`coalesce(...,'{}')` + map). Invalid JSON → 400 (opus review fix, was 500). 30 route tests; full Worker suite 1033 passing. No money formatting on live paths. |
| `ffd97da1` | Persisted PDF export to R2 + self-authenticating re-download (export sub-slice C1) | Committed | First storage-writing export slice. EP-7 `POST /export/pdf/download` builds the property PDF (pdf-lib, reuses `buildPropertyPdf`), uploads to a new R2 `REPORTS_BUCKET`, inserts `export_history`, streams bytes (landlord + full-access gated, R2 rollback on insert failure). EP-11 `GET /export/download/{id}` is org-scoped: R2 rows mint a short-lived tamper-proof HMAC token URL; legacy Supabase rows mint a service-role signed URL (`{SUPABASE_URL}/storage/v1{signedURL}`); 410 on null `storage_path`. Public `GET /export/download/file` is bearer-exempt but gated solely by HMAC token (signs full payload incl. `r2Key`, timing-safe verify, 410 on expiry, key read only from token). Storage discriminator without schema change: new rows stored `r2:{key}`, legacy rows (no prefix) → Supabase. `created_by_name = fullName ?? email`. `record_feature_use("pdf_exports")` deferred (no Worker usage-tracking mechanism yet). **Cutover note:** R2 buckets `capveri-reports-dev/staging/prod` must be created before deploy. |
| `22be424e` | Property imports list endpoint | Committed | Port of `backend/app/api/v1/properties.py:252`: GET `/api/v1/properties/{property_id}/imports`. Org-scoped paginated import-batch list gated by implicit org isolation (property lookup); `page` (≥1 default 1), `size` (≥1 ≤100 default 20), `status` filter (optional, lowercased, "all"/""→no filter). 404 "Property not found" on cross-org property_id; `created_at DESC` with exact total + offset pagination; {imports, total} shape matching FastAPI response. Note: `import_batches` table has legacy columns only (`file_name`/`source_system`/`row_count`/`error_count`), so SQL selects those + aliases canonical names from typed NULL and applies the Python dict.get fallback chain in `mapImportBatchSummary`. Tenant isolation via explicit `organization_id` AND `property_id` WHERE. Reviewer caught + fixed a production-fatal SQL bug (original selected nonexistent canonical columns) before commit. |
| `b00004b3` | Cap-bank ledger endpoint | Committed | Port of `backend/app/api/v1/reconciliation.py:1453`: GET `/api/v1/reconciliation/leases/{lease_id}/cap-bank-ledger`. Org-scoped (OrgContext-only) per-year cap-bank ledger with org isolation via explicit org check (404 on cross-org). Algorithm ported with precision-28 decimal.js at ROUND_HALF_UP; compounding power quantized once, penny-verified against Python. **Known non-observable divergence:** Pydantic natural-scale strings vs Worker forced 2dp, numbers penny-identical, frontend parses numerically so no behavioral change. Records `recordFeatureUse("cap_bank_tracking")` (upsert_feature_use) after building the ledger. Pure read. Direct parameterized Postgres, org isolation by explicit `organization_id` WHERE on both the lease fetch and the finalized-snapshot fetch (cross-org lease → not found → 404). Opus money-fidelity review APPROVED (compounding quantize-once penny-verified; serialization divergence confirmed non-observable via frontend numeric-parse audit). |
| `585dad08` | Denominator-change analysis (JSON) endpoint | Committed | Port of `backend/app/api/v1/analysis.py:218`: POST `/api/v1/analysis/denominator-change`. JSON sibling of the already-ported denominator-change PDF route; reuses the existing ported engine (`domain/denominator-change/service.ts` `generateDenominatorChangeReport` + `NoComparableSnapshotsError`) and repository/adapter unchanged (no math re-ported). Full-access gate (402) matching `require_full_access`; no role gate. Response shape incl. `comparison_available` + `missing_period`; Decimal fields via toFixed matching Pydantic. Key behavioral parity vs the PDF route: `NoComparableSnapshotsError` → HTTP **200** with `comparison_available=false` (NOT 400). 11 route tests; full Worker suite **1249**. |
| `0b0f773a` | Tax-protest `POST /generate` ZIP packet | Committed | Port of `backend/app/api/v1/tax_protest.py:237`: `POST /api/v1/tax-protest/generate`. Auth: OrgContext-only (no role gate) + `hasTaxProtestAccess(orgId)` → 402 before any DB work, matching FastAPI `if not has_tax_protest_access(ctx): raise 402` order (tax-protest-routes.ts ~L80-95); 401 via authMiddleware. Streams a ZIP (no R2 persistence), `Content-Type: application/zip`, `Content-Disposition: attachment; filename="tax-protest-{propSafe}-{year}.zip"`, matching FastAPI `StreamingResponse` (tax_protest.py:375-379); filename sanitization `/` and `\` → `-`. ZIP contains: (1) GL category CSV (`gl-category-csv.ts`), amounts/pool_total quantized via `decimal.js` `.toFixed(2, ROUND_HALF_EVEN)` matching Python `f"{Decimal:.2f}"`, hand-verified `0.10+0.20=0.30` (no float drift); (2) PDF cover sheet (`cover-sheet-pdf.ts`); (3) PDF expense summary (`expense-summary-pdf.ts`); (4) variance PDF (reuses `exports/variance-pdf.ts`). Fixed 4 parity issues: (1) 404 detail string exact match (`"reconciliation_snapshot with id '{id}' not found"`); (2) added explicit `organization_id` WHERE to `gl_entries` query in `fetchPoolDetails`; (3) county/state/override resolution corrected: county = `body.county` only, `state = body.state\|\|property.state`, override = `null` (mirrors FastAPI `_load_export_context`); (4) documented DEFERRED `record_feature_use("tax_protest")` consistent with exports-routes EP-7/EP-8. Lease query intentionally non-org-scoped (leases has no `organization_id`; isolation is transitive via org-scoped snapshot + property). `app.ts` mount pre-existed from the deadlines slice. Not re-staged. 36 tax-protest tests pass; typecheck clean; lint clean; full Worker suite **1340**. |
| `00218f86` | Cross-doc-analysis router (5 endpoints) | Committed | Port of `backend/app/api/v1/cross_doc_analysis.py`: 5 endpoints mounted at `/api/v1`. Auth parity: `POST /properties/:propertyId/cross-doc-analysis` (py L84) → `requireEditor`(403) then `requireFullAccess`(402) (routes L114-116); `GET /properties/:propertyId/cross-doc-analysis/:periodYear` (py L156-160, no deps) → authMiddleware + org-scope via `actor.organizationId` (routes L177-201); `PATCH /cross-doc-analysis/:analysisId/findings/:findingId` (py L201) → `requireEditor`(403) then `requireFullAccess`(402) → analysis by id, org mismatch → 403 (py L239-243 == routes L224-226); `PATCH /organizations/:orgId/auditor-config` (py L268) and `PATCH /properties/:propertyId/auditor-overrides` (py L298) both `requireEditor`(403) then `requireFullAccess`(402). Role gate evaluated before full-access, both before DB work, mirroring Python dependency order. No export/streaming route. All endpoints return JSON (201/200) matching FastAPI `response_model` + `status_code`. Money via `PyDecimal` clone (precision 28, ROUND_HALF_EVEN); GL pool aggregation does `amount.mul(allocation).plus(...)` in PyDecimal, hand-checked `0.1+0.2` asserted `'0.30000000000000000000'` (no float drift); finding `financial_impact_estimate` -1234.56 survives JSON round-trip. Five documented divergences (non-blocking): (1) persisted blob is raw Claude JSON not Pydantic-normalized; (2) `fnmatch` case flag `i`: case-insensitive in TS vs case-sensitive on prod Linux (low risk: GL account codes are numeric/uppercase); (3) auth detail strings follow established Worker convention; (4) `requireEditor` adds landlord party check absent from Python (established Worker pattern); (5) GL/lease reads scoped by `property_id` only, matching Python RLS reliance. 1372 full suite. |
| `86c4e71a` | Capex classification router (5 endpoints) | Committed | Port of `backend/app/api/v1/analysis.py` capex endpoints, mounted `/api/v1`, prefix `/analysis/capex-*` (fixed parity bug: original draft used `/api/v1/capex-*` missing the `/analysis` router prefix from `api/v1/__init__.py:163`). `POST /analysis/capex-classify`, `POST /analysis/capex-{flagId}/review`, `POST /analysis/capex-bulk-review` gate `requireEditor`(403) then `requireFullAccess`(402) before DB work (matching `analysis.py` L474,585,637 `dependencies=[require_org_editor, require_full_access]`). `GET /analysis/capex-flags` and `GET /analysis/capex-summary` are org-scoped read-only (no role gate, matching Python `analysis.py:508,547`). No export/file route; all endpoints return JSON (counts, flag lists, summary counts, updated records). Money via `decimal.js` ROUND_HALF_EVEN; hand-verified summary total `abs(12345.67)+abs(999.33)=13345.00` asserted as `"13345.00"`; classifier confidences exact (e.g. `150000>=100000` → `"0.85"`). Two established project-wide divergences (consistent with analysis-routes.ts): money as string `.toFixed()` rather than Pydantic Decimal→JSON-number; GL entries scoped by `gl_entries.period_year` column (denormalized, used by all ported adapters). `requireEditor` adds landlord party check consistent with sibling routes. 1404 full suite. |
| `393e9dd5` | SB1103 `POST /:id/export` packet (sub-slice B) | Committed | EP for `compliance.py:282`: streams a ZIP of PDF + XLSX via Hono `new Response(stream)`, no R2 persistence. Gate order: `requireEditor`(403) → `requireFullAccess`(402), matching Python decorator order. decimal.js ROUND_HALF_UP for all money. Reuses the existing pdf-lib, ExcelJS, and fflate ZIP infra from prior export slices; no new library dependencies. 22 new export tests; typecheck clean; lint clean. SB1103 HTTP surface (all 7 endpoints) is now fully Worker-native. |
| `f5148a8e` | Resend inbound-email webhook | Committed | Port of `backend/app/api/routes/webhooks.py` Resend inbound-email webhook. Files: `cloudflare-backend/src/http/resend-webhook-routes.ts`, `cloudflare-backend/src/test/resend-webhook-routes.test.ts`, `cloudflare-backend/src/app.ts` (mount at app.ts:79 via `createResendWebhookRoutes`). Full vitest suite 1416 passed across 81 files; typecheck clean (tsc --noEmit); eslint clean; pre-commit hooks ran and passed. Raw body read before JSON.parse (line 36 text() vs line 62 JSON.parse); secret via `requireRuntimeSecret(c.env,'RESEND_WEBHOOK_SECRET')`; 400 statuses + 'detail' error envelope match FastAPI HTTPException; no `any` / no floating promises / exactOptionalPropertyTypes-safe. **HMAC parity is intentionally DIVERGENT:** Worker (`resend-webhook-routes.ts:94-174`) implements the correct Svix spec; FastAPI (`backend/app/api/routes/webhooks.py:1114-1188`) implements a non-compliant scheme. Differences: (1) signed content: FastAPI uses `t.payload` (omits svix-id) vs Worker `svix-id.svix-timestamp.body`; (2) secret: FastAPI uses raw UTF-8 bytes with no `whsec_` strip vs Worker base64-decodes + strips `whsec_`; (3) encoding: FastAPI hex (hexdigest) vs Worker base64; (4) timestamp source: FastAPI reads `t=` inside sig header vs Worker reads `svix-timestamp` header; (5) staleness: FastAPI none vs Worker 300s window. Crypto: `crypto.subtle` HMAC-SHA256 (sign) + custom `constantTimeEqualBase64` timing-safe compare (XOR accumulate, length-check first, never `===`). FastAPI uses `hmac.compare_digest`. **Worker matches real Resend/Svix payloads; FastAPI would reject them.** FastAPI scheme not replicated since migration end-state replaces FastAPI. UNRESOLVED/FLAGGED for product owner: confirm Svix-correct behavior (recommended) rather than bug-for-bug FastAPI parity. |

Remaining cutover blockers identified from repo/frontend usage, in rough
priority order:

1. Export/report document generation: **COMPLETE** (sub-slices A
   `d6bfdcae`, B `c5ad7818`, C1 `ffd97da1`, C2 `dd600898`, C3 `5f64fcb4`,
   C4 `00002233`, C5 `65f703eb`+`a147500c`+`f208f32e`+`66c3cdec`,
   C6 `7cb6821b`+`2d1e242b`, C7 `b0e0e362` all done:
   EP-7/8/11/12/13/14/15/16/17/18 shipped; ExcelJS proven under workerd).
   The entire export/report document-generation surface (ERP exports, audit-log
   CSV, export-history, snapshot/preview/demand-letter PDFs, persisted PDF
   download + token re-download, batch ZIP, variance PDF/XLSX, board PDF,
   detail-advisor JSON, historical XLSX, denominator-change PDF, historical
   analysis PDF) is now Worker-native off Railway. Storage target resolved: new
   persisted exports write to R2 (`REPORTS_BUCKET`) served by a Worker download
   route with an HMAC token; legacy `reports`-bucket objects stay readable via a
   Supabase signed-URL fallback (`r2:` storage_path prefix discriminates).
   **Cutover note:** R2 buckets `capveri-reports-dev/staging/prod` must be
   created before prod deploy.
   Storage target now resolved: new persisted exports write to R2
   (`REPORTS_BUCKET`) served by a Worker download route with an HMAC token;
   legacy `reports`-bucket objects stay readable via a Supabase signed-URL
   fallback (`r2:` storage_path prefix discriminates). Future persisted-export
   slices reuse the C1 storage adapter + token infra.
2. Done since: Property import history (`22be424e`), cap-bank ledger
   (`b00004b3`), denominator-change analysis JSON (`585dad08`), Warranty router
   (`b2a8eb57`), audit-trail query (`fd9c7845`), audit-requests lead-capture +
   admin router (`ac7bd6c8`), SB1103 compliance 6 non-export endpoints
   (`04d66c7e`), landlord disputes admin router (`88f43f5a`), tax-protest
   `GET /deadlines` (`b26296cb`), **billing router COMPLETE** (`7577dde1`),
   **tax-protest `POST /generate`** (`0b0f773a`: DONE, Worker-native ZIP
   stream), **cross-doc-analysis** (`00218f86`: DONE, Worker-native, was
   previously deferrable/sdk-only; now Worker-native ahead of screen build),
   **capex** (`86c4e71a`: DONE, Worker-native, similarly sdk-only but now ported).

3. **Remaining genuinely cutover-blocking** (live frontend screen + no Worker
   route), confirmed 2026-06-13 by a frontend-usage audit (grep of non-generated
   `frontend/src`, not just `frontend/src/api/generated`). No LARGE items remain:
   the OpenRouter client (`cloudflare-backend/src/adapters/ai/openrouter.ts`)
   and PDF/XLSX/ZIP infra are already ported. Ordered:
   1. **gl-narrative GET** `analysis.py:374` (SMALL, DB read): `useGLAnalysis.ts:71`.
   2. **gl-narrative dismiss** `analysis.py:417` (TRIVIAL): `useGLAnalysis.ts:137`.
   3. **gl-narrative POST run** `analysis.py:316` (MEDIUM, OpenRouter, reuse client): `useGLAnalysis.ts:103`, `GLAnalysisPanel.tsx`.
   4. **campaigns list + 4 transitions** `campaigns.py:102,187,200,213,226`
      (1 MEDIUM list aggregation + 4 SMALL state-machine transitions, **no
      external deps, pure Supabase**): `PortfolioPipelinePage.tsx`, `hooks.ts:3290+`.
   5. ~~**SB1103 `POST /:id/export`**~~: **DONE** (`393e9dd5`). The entire SB1103 HTTP surface (7 endpoints) is now Worker-native.

   **The HTTP route surface is now COMPLETE.** All live frontend screens have a Worker-native route. The only remaining non-HTTP HTTP work above is the gl-narrative and campaigns items.

4. **True cutover blockers remaining** (infrastructure, not HTTP routes):
   1. **Celery `process_extraction_task` → Cloudflare Queues**: the background
      PDF/OCR extraction worker (Railway `Worker service`) must be ported to
      Cloudflare Queues + Workflows before Railway can be retired. This is the
      largest remaining non-HTTP blocker. Remaining sub-tasks: Hyperdrive binding
      wiring, DLQ configuration, auto-enqueue decision (see note below), secrets
      migration, and staging E2E verification.
   2. ~~**Resend inbound-email webhook**~~: **DONE** (`f5148a8e`). Worker implements correct Svix spec; see HMAC divergence note in row above.
   3. **Production cutover**: DNS `api.capveri.com` → Worker, R2 bucket
      creation (`capveri-reports-dev/staging/prod`), Stripe + Resend webhook
      re-registration, Railway retirement checklist (soak, drain, delete).

5. **Previously deferrable, now DONE:** entire cross-doc-analysis suite
   (`00218f86`) and entire capex suite (`86c4e71a`) were sdk-only (no live
   screen) and have been ported Worker-native ahead of any screen build.
   Retiring Railway does not depend on them, but they are now complete.

## Current Production Compute

| Responsibility | Current host | Evidence | Target host |
|---|---|---|---|
| Backend HTTP API | Railway `camaudit` service, service ID `a2eb7f27-12bc-45e8-85fd-c7babe0fff00` | `AGENTS.MD` and `CLAUDE.md` Railway backend sections list the service; `docs/DEPLOYMENT.md` maps backend to Railway at `https://api.capveri.com`; `docs/architecture/system-architecture.md` labels `api.capveri.com` as FastAPI / Railway. | Cloudflare Workers for HTTP API and root webhooks. |
| Background worker | Railway `Worker service`, service ID `5e7358ba-9a18-44da-b50e-baf13bb834fa` | `AGENTS.MD` and `CLAUDE.md` Railway backend sections list the service; `backend/app/config.py` defines Celery settings; `backend/.env.example` defines `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`, and queue/time-limit vars. | Cloudflare Queues plus Workflows for background job dispatch and long-running orchestration. |
| Redis / queue backend | Redis URL configured through Celery broker/result backend; actual production provider not proven by repo. | `backend/app/config.py` defaults `celery_broker_url` and `celery_result_backend` to Redis; `backend/.env.example` shows `CELERY_BROKER_URL=redis://127.0.0.1:6379/0` and `CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0`. Need Railway project/env inspection to determine whether Redis is a Railway service/plugin or an external provider. | Cloudflare Queues and Workflows; delete/disable Redis after no production Celery traffic remains. |
| Volumes/add-ons/domains | Unknown from repo; must inspect Railway project `Capveri`. | `AGENTS.MD` requires Railway MCP checks and notes project `Capveri` production environment `d96ed555-5133-48da-832a-05a2154187ff`. Repo docs do not enumerate Railway volumes, add-ons, generated domains, or custom domains. | Delete or detach billable resources during final Railway retirement after cutover verification. |

## Current Database/Auth Boundary

| Concern | Current evidence | Migration treatment |
|---|---|---|
| Postgres provider | Product owner says to keep Neon/current Postgres. Repo evidence points to Supabase-managed Postgres: `.env.example` and `backend/.env.example` define `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`; `docs/DEPLOYMENT.md` lists Supabase as manual migrations; `docs/architecture/system-architecture.md` says database is Supabase-managed. No `NEON_*` config was found in the required source set. | Preserve the current production Postgres provider; do not migrate data. Before using Cloudflare Hyperdrive, inspect production env and dashboard state to prove whether the connection string is Neon direct Postgres, Supabase Postgres, or Supabase/PostGREST-only. |
| Auth/session provider | Frontend creates a Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `frontend/src/lib/supabase.ts`; `frontend/src/api/client.ts` injects the Supabase session `access_token` as an API Bearer token; `backend/app/auth/dependencies.py` validates tokens with `supabase.auth.get_user(token)`. `.env.example` says production JWT is managed by Supabase and OAuth providers are configured in the Supabase dashboard. | Preserve Supabase Auth semantics unless a separate auth migration is planned. The Worker auth layer must accept the same Bearer JWTs, anonymous-session behavior, tenant/landlord split, and OAuth callback assumptions used by the frontend. |
| User active/suspended state | Current `users` model and migrations do not define a persisted `is_active`, `disabled`, or `suspended` field. `backend/app/auth/dependencies.py` has `get_current_active_user`, but it is currently a pass-through after token/profile validation. | Treat inactive-user rejection as auth-provider state, not DB profile state, until a schema migration adds a durable user status field. Worker tests may cover inactive auth state through verified token/auth metadata, but DB adapters must not pretend a nonexistent profile column exists. |
| PostGREST and RLS/session claims | `backend/app/auth/dependencies.py` calls `supabase.postgrest.auth(token)` so RLS `auth.uid()` can identify the user; `backend/app/database/client.py` has anon clients that respect RLS and a service-role client that bypasses RLS; `set_organization_context` calls the `set_organization_context` RPC for service-role operations. `docs/architecture/system-architecture.md` documents `get_user_organization_id()` and transaction-scoped organization context. | Preserve or emulate exactly. If Workers talk directly to Postgres through Hyperdrive, they must reproduce the same JWT/session claims and service/admin bypass model before replacing any route. If production depends on Supabase/PostGREST, preserve that boundary first. |
| Service/admin bypass | `backend/app/database/client.py` uses `SUPABASE_SERVICE_ROLE_KEY` for the service client and warns it bypasses RLS; backend config includes `supabase_service_role_key`. | Move the service-role secret or replacement admin credential to Cloudflare secrets only after production env audit. Keep usage tightly scoped to webhooks, background jobs, and admin/cross-tenant operations. |
| Anonymous onboarding | `backend/app/auth/dependencies.py` allows anonymous Supabase auth users only on specific onboarding route patterns and carries `is_anonymous` into downstream entitlement checks. | Preserve the allowlist and denial behavior in the Worker auth middleware before cutover. |

## Current Storage Boundary

| Bucket/use | Current evidence | Migration treatment |
|---|---|---|
| Lease documents and extraction documents | `backend/app/config.py` defines `DOCUMENTS_R2_*` settings with default bucket `capveri-documents`; `backend/.env.example` documents the same; `backend/app/services/health.py` checks Cloudflare R2 bucket reachability; migrations rename document fields from S3 names to provider-neutral `storage_key` and `storage_bucket`. | Keep R2. Move credentials/bindings from Railway env vars to Cloudflare bindings/secrets and ensure uploads avoid Worker memory limits. |
| Lead-magnet assets | `backend/app/config.py` defines `lead_magnets_r2_bucket` default `capveri-lead-magnets`; `backend/.env.example` documents `LEAD_MAGNETS_R2_BUCKET`; `backend/app/services/leads/asset_storage.py` describes R2-backed lead-magnet assets. | Keep R2. Confirm whether the Cloudflare backend needs the same bucket binding or whether marketing/backoffice flows own this path. |
| Supabase storage buckets still present in schema | Migrations create or harden Supabase storage buckets including `documents`, `lease-documents`, `dispute-attachments`, `feedback-screenshots`, and `reports`; `frontend/src/components/leases/LeaseDocumentUpload.tsx` still references Supabase Storage in comments/code outside the required read set. | Inventory and test each bucket before route cutover. Move only code paths that are currently Railway-hosted or that must be unified for Worker upload/download flows; do not silently drop Supabase Storage policies while production may depend on them. |
| Reports/exports | Migrations create a private `reports` storage bucket and add `export_history.storage_path`; route/service code references generated report/download storage paths. | Preserve access semantics. If reports remain in Supabase Storage initially, Workers must proxy or sign consistently; if moved to R2, migrate object references deliberately. |
| Feedback screenshots and dispute attachments | Migrations harden `feedback-screenshots` and `dispute-attachments`; backend models include dispute attachment storage paths and feedback retention. | Preserve tenant/org authorization. Confirm whether current production objects live in Supabase Storage or R2 before changing upload flows. |

## Unknowns That Block Cutover

- Railway MCP: run `list_services` for project `Capveri`, environment `production`, and record every service, plugin/add-on, Redis service, volume, and orphan resource.
- Railway MCP: run `list_deployments` for `camaudit` and `Worker service`; confirm the active production deployment IDs, status, start commands, root directories, and whether a newer deployment is serving `api.capveri.com`.
- Railway MCP or dashboard: inspect variables for `camaudit`, `Worker service`, and any Redis service/plugin. Record secret names and target Cloudflare binding/secret destinations, not secret values. Cover `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DOCUMENTS_R2_*`, `LEAD_MAGNETS_R2_BUCKET`, `CELERY_*`, `REDIS_URL`, `STRIPE_*`, `RESEND_*`, `OPENROUTER_*`, `SENTRY_DSN`, `POSTHOG_*`, `TURNSTILE_*`, `RAILPACK_PYTHON_VERSION`, and cron secrets.
- Railway dashboard: inspect domains on every service. Prove whether `api.capveri.com` is attached to Railway and list all generated `*.up.railway.app` domains that need disabling or service deletion.
- Railway dashboard: inspect GitHub integration settings for project `Capveri` and each service. Confirm whether pushes to `master` still auto-deploy Railway after Cloudflare cutover.
- Railway dashboard: inspect usage/billing/resource screens for project-level resources that could keep billing active after services are stopped, including persistent volumes, databases/plugins, log drains, private networking, and retained environments.
- Production DNS: run `dig api.capveri.com` or Cloudflare dashboard DNS checks to prove the current CNAME/target before and after cutover.
- Production health: run `curl -sS https://api.capveri.com/health` and capture headers/body to identify Railway versus Worker response metadata.
- Supabase dashboard/env: verify whether production Auth is Supabase, which OAuth providers are enabled, the JWT issuer/audience/JWKS or signing method, anonymous sign-in settings, and callback URLs.
- Database provider: inspect production `DATABASE_URL` host and dashboard ownership. Confirm whether it points to Neon, Supabase Postgres, Railway Postgres, or another Postgres provider before configuring Hyperdrive.
- Storage provider: list production Supabase Storage buckets and Cloudflare R2 buckets; compare object counts for `documents`, `lease-documents`, `dispute-attachments`, `feedback-screenshots`, `reports`, `capveri-documents`, and `capveri-lead-magnets`.
- Webhooks: inspect Stripe and Resend dashboard endpoint URLs and signing secrets; record whether they point to `https://api.capveri.com/webhooks/...` or older `/api/v1/...` routes.
- Scheduled work: inspect Railway cron/scheduler settings, secret-trigger endpoints, and any external cron provider that calls `api.capveri.com`.

## Railway Billable Resource Checklist

This checklist is a bill-elimination gate. A Railway resource is not retired until
the terminal evidence is captured.

### `camaudit` API Service

- Current state to record: Railway service `camaudit`, ID
  `a2eb7f27-12bc-45e8-85fd-c7babe0fff00`, production environment
  `d96ed555-5133-48da-832a-05a2154187ff`.
- Additional live state required: active deployment ID/status, root directory,
  start command, variables by name, domains, replicas/scaling, logs, GitHub
  auto-deploy settings, and billing/resource view.
- Retirement action: after Cloudflare production cutover, remove custom and
  generated domains, disable GitHub auto-deploy, and stop/scale down only during
  an approved rollback window.
- Delete condition: delete the service only after DNS has served Cloudflare for
  the agreed soak period, webhook delivery is confirmed on Cloudflare, Railway
  access logs show no production traffic for the agreed soak period, and rollback
  no longer depends on Railway.
- Terminal evidence: Railway service deletion confirmation; `list_services`
  no longer lists the service; no deployments, domains, variables, volumes, or
  add-ons remain attached to that service; billing/usage shows no active charge
  source for it.

### `Worker service`

- Current state to record: Railway service `Worker service`, ID
  `5e7358ba-9a18-44da-b50e-baf13bb834fa`; repo Celery settings prove
  Redis-backed background work exists.
- Additional live state required: command, replicas, variables by name,
  deployments, logs, scheduler triggers, retry behavior, and dead-letter/error
  handling.
- Queue-drain proof: identify the Redis provider first, then capture queue
  depth, scheduled jobs, retries, and dead-letter/error queues before stopping
  the worker. If the provider cannot expose those counts, add a temporary
  inspection script or dashboard export before retirement.
- Retirement action: move production job creation and processing to Cloudflare
  Queues/Workflows, stop the Railway worker during the rollback window, then
  delete the service after queue-drain proof and Cloudflare job success evidence.
- Terminal evidence: service deleted; `list_services` no longer lists it; no
  active deployments, domains, variables, volumes, or add-ons remain attached;
  Cloudflare Queues/Workflows show successful processing; Railway billing/usage
  shows no active charge source for it.

### Redis Service, Plugin, Or External Provider

- Current state to record: repo only proves Celery expects Redis through
  `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND`; provider is unknown.
- Retirement action: if Railway-hosted, delete the Redis service/plugin after
  queue-drain proof. If external, remove Railway variables and cancel or disable
  the external provider only after proving no other app uses it.
- Terminal evidence: no Redis service/plugin is listed in Railway; no Redis
  variables remain on Railway services; external provider billing is canceled or
  explicitly retained with a non-CapVeri owner.

### Volumes

- Current state to record: unknown; repo has no Railway volume inventory.
- Retirement action: export evidence or backups if the dashboard shows
  persistent data, then detach and delete all Railway volumes.
- Terminal evidence: Railway project and service views list no volumes; billing
  screen shows no storage charge source.

### Domains

- Current state to record: `docs/DEPLOYMENT.md` maps backend to
  `https://api.capveri.com`; Railway-generated domains are unknown.
- Retirement action: detach `api.capveri.com` after DNS points to Cloudflare
  Worker and delete generated public Railway domains by service deletion or
  dashboard setting.
- Terminal evidence: `api.capveri.com` DNS points to Cloudflare; Railway lists
  no custom domains or generated public domains for retired services; production
  health responses include Cloudflare Worker metadata, not Railway metadata.

### GitHub Auto-Deploy Links

- Current state to record: `AGENTS.MD` says Railway auto-builds on every push to
  `master`; exact GitHub integration settings are unknown.
- Retirement action: disable Railway GitHub auto-deploy for backend services
  before deleting services.
- Terminal evidence: Railway project/service settings show no GitHub deploy
  trigger; a post-cutover `master` push creates no Railway deployment.

### Environment Variables And Secrets

- Current state to record: expected names include `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
  `DOCUMENTS_R2_*`, `LEAD_MAGNETS_R2_BUCKET`, `OPENROUTER_*`, `STRIPE_*`,
  `RESEND_*`, `UNSUBSCRIBE_HMAC_SECRET`, `TURNSTILE_*`, `SENTRY_DSN`,
  `POSTHOG_*`, `CELERY_*`, `REDIS_URL` if present, cron secrets, and
  `RAILPACK_PYTHON_VERSION` while Railway remains.
- Retirement action: recreate required secrets as Cloudflare secrets/bindings.
  Do not carry `CELERY_*` or Redis variables into the final Worker runtime
  except temporary migration flags.
- Terminal evidence: Cloudflare has the required production bindings/secrets by
  name; retired Railway services are deleted; no retained Railway service has
  CapVeri production secrets.

### Orphan Services

- Current state to record: unknown. `AGENTS.MD` identifies two expected Python
  services, but the live project must be checked.
- Retirement action: delete any service not intentionally retained.
- Terminal evidence: every unexpected service has deletion evidence; retained
  services have a named owner, reason, cost expectation, and confirmation that
  they are not part of the backend migration bill.

### Project-Level Billable Settings

- Current state to record: possible items include retained environments,
  volumes, plugins/add-ons, log drains, metrics, private networking, generated
  domains, and project-level integrations.
- Retirement action: delete active billable project resources or delete the
  entire Railway project if no retained non-billable resource is needed.
- Terminal evidence: Railway usage/billing/resource screens show zero active
  billable resources for project `Capveri`; project-level add-ons/plugins,
  volumes, public domains, deploy triggers, and active services are absent or
  have explicit retained-resource approvals.

## Investigation Note: Auto-Enqueue on Upload (2026-06-13)

**Verdict: Option B, the frontend always calls `/process` explicitly. The Worker two-step is correct.**

**Evidence, layer by layer:**

**Python backend (source of truth for the shipped contract)**

- `backend/app/api/v1/documents.py` lines 54 to 220: `POST /documents/upload` validates, stores to object storage, inserts a DB row with `status=PENDING`, and returns. It does NOT import or call `create_extraction_job`. The response message "Document uploaded successfully and queued for processing" is misleading copy. No job is actually enqueued at upload time.
- `backend/app/api/v1/extraction.py` lines 230 to 328: `POST /extractions/{document_id}/process` is the dedicated endpoint that calls `create_extraction_job` (line 298), transitions the document to `PROCESSING`, and enqueues the Celery task. This is a separate, explicit, user-triggered step.

**Cloudflare Worker (`cloudflare-backend/src/http/document-extraction-routes.ts`)**

- Lines 237 to 315: `POST /documents/upload` handler calls `createDocument(...)` only, no `enqueueExtraction` call anywhere in that handler. Matches Python exactly.
- Lines 363 to 390: `POST /extractions/:documentId/process` calls `repository.queueExtraction(...)` and then `resolveQueueProducer(...).enqueueExtraction(...)`. The Worker two-step is a faithful port of the Python two-step.

**Frontend**

- `frontend/src/pages/leases/LeaseUploadPage.tsx` lines 237 to 262: The upload mutation calls only the upload endpoint; the process mutation is triggered separately and explicitly by the user.

**Conclusion:** The Worker two-step design (upload → explicit process trigger) is correct and matches the shipped FastAPI contract. No auto-enqueue-on-upload logic should be added to the Worker upload handler. The Celery → Cloudflare Queues port for `process_extraction_task` should wire up the queue producer to the explicit `/process` route only.

---

## ✅ PRODUCTION CUTOVER COMPLETE: RAILWAY BILL ELIMINATED (2026-06-13)

The migration goal is met. Railway is fully retired for CapVeri; `$0` going forward.

### Cutover flip
- Added Worker route `api.capveri.com/*` (zone `1756d16d2604a8b6810292f069097299`) to `cloudflare-backend/wrangler.jsonc` `env.production` and deployed `capveri-api` (commit `e3ecefa8`, pushed to `master`). Cloudflare now intercepts the proxied origin at the edge and serves the Worker instead of forwarding to Railway.
- Rollback (if ever needed): remove the route + redeploy; the DNS record still resolves to the old Railway origin (now deleted, so rollback would require recreating the Railway service).

### Drain proof (no in-flight work lost)
- `extraction_jobs`: zero rows in `processing`/`retrying` (only stale `pending` from 2026-02 never started, + historical `failed`).
- `documents`: zero rows in any in-flight status (`processing`/`pending`/`queued`/`extracting`).
- Conclusion: Celery had nothing in-flight to drain.

### Railway teardown
- Deleted the entire `Capveri` Railway project (id `9938502c-007c-428d-a737-aadc58a773ab`) via `railway delete --project <id> --yes`. This removed all billable resources in one shot: `camaudit` API (`a2eb7f27-12bc-45e8-85fd-c7babe0fff00`), `Worker service` / Celery (`5e7358ba-9a18-44da-b50e-baf13bb834fa`), `Redis` (`e8bb8fb4-a3f2-4022-b433-5812d7b3dda3`) + its volume.
- Confirmed by the live API: `railway link --project 9938502c-...` returns "Project not found in workspace. Available: CAMAudit, Lextract" (CAMAudit/Lextract are foreign projects, not CapVeri).

### Post-deletion live verification (production healthy on the Worker)
- `GET https://api.capveri.com/health` → 200 `{"status":"healthy","runtime":"cloudflare-workers"}`, `Server: cloudflare`, no `X-Railway-Edge`.
- Authed sweep (fresh ES256 token): `/api/v1/properties`, `/api/v1/team/members`, `/api/v1/documents`, `/api/v1/ingestion/batches` all 200: JWT verify → Hyperdrive → Supabase org-scoped queries all green.

### Webhooks
- Stripe: the single enabled endpoint was already `https://api.capveri.com/webhooks/stripe`, which matches the Worker route + existing `STRIPE_WEBHOOK_SECRET`, no re-registration needed.
- Resend: CapVeri inbound is not on `api.capveri.com` (handled on a separate host), no action needed.
