# CapVeri PostHog Dashboard Inventory

PostHog project: `REDACTED_PH_PROJECT` (`Capveri.com`)

Last rebuilt: 2026-05-07.

The dashboard set is organized as a startup operating dashboard rather than isolated charts. Current live data is sparse: the project has no events in the last 30 days, and only `$autocapture`, `$pageview`, `$pageleave`, and `$identify` within the last 180 days. The new dashboards therefore include explicit tracking-health tables for missing expected events instead of hiding gaps behind empty charts.

## Dashboards

| ID        | Name                                                 | Purpose                                                                                                                              |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `REDACTED_PH_DASH_00` | `00 - Founder Scoreboard - CapVeri`                  | 30/90-day operating snapshot: visitors, leads, signups, activation, revenue/churn server-truth events, and top tracking bottlenecks. |
| `REDACTED_PH_DASH_01` | `01 - Acquisition & Lead Quality - CapVeri`          | Traffic quality, CTA intent, demo requests, lead submissions, lead domains, and high-intent pages.                                   |
| `REDACTED_PH_DASH_02` | `02 - Activation & Time to Value - CapVeri`          | Visitor-to-lead-to-signup-to-activation flow, onboarding step coverage, and first meaningful action inputs.                          |
| `REDACTED_PH_DASH_03` | `03 - Product Usage & Retention - CapVeri`           | Active people/orgs, workflow event mix, feature adoption, and retention proxy inputs.                                                |
| `REDACTED_PH_DASH_04` | `04 - Revenue, Churn & Expansion - CapVeri`          | Backend Stripe lifecycle events: subscriptions, paid invoices, failed payments, cancellations, reactivations, plan/building mix.     |
| `REDACTED_PH_DASH_05` | `05 - Content, Tools & Message-Market Fit - CapVeri` | Content/tool page quality, tool journey events, lead conversion coverage, and high-intent non-converters.                            |
| `REDACTED_PH_DASH_99` | `99 - Tracking Health - CapVeri`                     | Event freshness, expected custom event last-seen status, source_app coverage, identity/org coverage, and ingestion gap age.          |

## Insight Inventory

| Short ID   | Name                                                                                   | Dashboard(s)                          | Source events                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REDACTED_PH_INSIGHT` | `00.01 Visitors, leads, signups, activation, paid events - 90d`                        | `REDACTED_PH_DASH_00`                             | `$pageview`, `lead_form_submit`, `sign_up`, `activation_completed`, `subscription_started`                                                                                    |
| `REDACTED_PH_INSIGHT` | `00.02 Revenue and churn server-truth snapshot - 90d`                                  | `REDACTED_PH_DASH_00`                             | `invoice_paid`, `invoice_payment_failed`, `subscription_cancel_scheduled`, `subscription_cancelled`, `subscription_reactivated`                                               |
| `REDACTED_PH_INSIGHT` | `00.03 Current top bottleneck - expected events missing`                               | `REDACTED_PH_DASH_00`                             | Expected custom events table                                                                                                                                                  |
| `REDACTED_PH_INSIGHT` | `01.01 Pageview traffic by available URL fields - 180d`                                | `REDACTED_PH_DASH_01`                             | `$pageview`                                                                                                                                                                   |
| `REDACTED_PH_INSIGHT` | `01.02 Marketing lead event coverage - 30d`                                            | `REDACTED_PH_DASH_01`                             | Marketing/lead expected custom events                                                                                                                                         |
| `REDACTED_PH_INSIGHT` | `01.03 High-intent non-converter pages - 180d`                                         | `REDACTED_PH_DASH_01`, `REDACTED_PH_DASH_05`                  | `$pageview`, `lead_form_submit`                                                                                                                                               |
| `REDACTED_PH_INSIGHT` | `02.01 Activation funnel event freshness - 90d`                                        | `REDACTED_PH_DASH_02`                             | `$pageview`, activation expected events                                                                                                                                       |
| `REDACTED_PH_INSIGHT` | `02.02 Onboarding step drop-off coverage - 90d`                                        | `REDACTED_PH_DASH_02`                             | `onboard_step_viewed`, `onboard_step_completed`; replacement builder tile uses `onboard_step_transitioned` filtered by PLG step                                               |
| `REDACTED_PH_INSIGHT` | `02.03 Time to first meaningful action inputs - 90d`                                   | `REDACTED_PH_DASH_02`                             | `sign_up`, `property_created`, `gl_upload_completed`, `reconciliation_calculation_completed`                                                                                  |
| `REDACTED_PH_DASH`  | `Activation funnel: signup -> GL import -> first result -> finalized -> trial -> paid` | Product Decisions dashboard `REDACTED_PH_DASH` | Organization-group funnel over `signup_completed`, `gl_import_completed`, `reconciliation_calculation_completed`, `reconciliation_finalized`, `trial_started`, `invoice_paid` |
| `REDACTED_PH_INSIGHT` | `03.01 Active people and organizations - 30d`                                          | `REDACTED_PH_DASH_03`                             | `$pageview`, app/product events                                                                                                                                               |
| `REDACTED_PH_INSIGHT` | `03.02 Product workflow mix - 90d`                                                     | `REDACTED_PH_DASH_03`                             | Dashboard/reconciliation/calculation/export expected events                                                                                                                   |
| `REDACTED_PH_INSIGHT` | `03.03 Weekly retention proxy after activation - 12w`                                  | `REDACTED_PH_DASH_03`                             | `activation_completed`, product workflow events                                                                                                                               |
| `REDACTED_PH_INSIGHT` | `04.01 Revenue lifecycle event freshness - 90d`                                        | `REDACTED_PH_DASH_04`                             | Backend Stripe lifecycle expected events                                                                                                                                      |
| `REDACTED_PH_INSIGHT` | `04.02 Invoice paid trend and MRR proxy cents - 90d`                                   | `REDACTED_PH_DASH_04`                             | `invoice_paid`                                                                                                                                                                |
| `REDACTED_PH_INSIGHT` | `04.03 Plan, unit, and building mix - subscriptions - 180d`                            | `REDACTED_PH_DASH_04`                             | `subscription_started`                                                                                                                                                        |
| `REDACTED_PH_INSIGHT` | `04.04 Failed payment and cancel risk - 90d`                                           | `REDACTED_PH_DASH_04`                             | `invoice_payment_failed`, cancellation/reactivation events                                                                                                                    |
| `REDACTED_PH_INSIGHT` | `05.01 Content and tool page quality - 180d`                                           | `REDACTED_PH_DASH_05`                             | `$pageview`                                                                                                                                                                   |
| `REDACTED_PH_INSIGHT` | `05.02 Tool usage to lead conversion coverage - 90d`                                   | `REDACTED_PH_DASH_05`                             | Tool and lead expected events                                                                                                                                                 |
| `REDACTED_PH_INSIGHT` | `99.01 Event freshness and coverage - 180d`                                            | `REDACTED_PH_DASH_99`                             | All observed events                                                                                                                                                           |
| `REDACTED_PH_INSIGHT` | `99.02 Expected custom event last-seen table - 30d`                                    | `REDACTED_PH_DASH_99`                             | Canonical CapVeri expected events                                                                                                                                             |
| `REDACTED_PH_INSIGHT` | `99.03 source_app and identity coverage - 30d`                                         | `REDACTED_PH_DASH_99`                             | All events                                                                                                                                                                    |
| `REDACTED_PH_INSIGHT` | `99.04 Ingestion gap age - most recent event`                                          | `REDACTED_PH_DASH_99`                             | All events                                                                                                                                                                    |

## Soft-Deleted Legacy Dashboards

These dashboards were soft-deleted after the replacement dashboards were created and verified:

`REDACTED_PH_DASH`, `REDACTED_PH_DASH`, `REDACTED_PH_DASH`, `REDACTED_PH_DASH`, `REDACTED_PH_DASH`, `REDACTED_PH_DASH`, `REDACTED_PH_DASH`.

## Event Privacy Boundary

The marketing site and authenticated app both use PostHog autocapture, rageclicks, and session recording so product journeys can be reviewed beyond custom events. Recordings mask all inputs and text matching `[data-ph-mask]`, `[data-sensitive]`, `.ph-mask`, `input`, `textarea`, or `[contenteditable="true"]`, and block elements marked `[data-ph-block]` or `.ph-no-capture`.

Lead capture uses email domain and a deterministic salted lead identifier for PostHog identity. Raw lead email addresses must not be sent to PostHog from lead capture. Backend billing events use `organization_id`, Stripe object IDs, plan/tier/building/unit counts, and revenue cents only for first-party Stripe events.

The backend PostHog capture helper strips common email property names before sending. Keep billing revenue truth on backend Stripe webhooks; client checkout success events are conversion signals only.

GL import analytics reduce files and import results to file type, file size buckets, source system, confidence/count/status buckets, batch IDs, and controlled failure stages. Do not send filenames, detected column names, column mappings, row descriptions, backend error detail, or raw file contents to PostHog.

Lease extraction analytics use document IDs, property IDs, controlled status/action values, confidence/count/file-size buckets, edit-count buckets, and coarse field groups only. Do not send filenames, tenant names, property names, addresses, document URLs, storage keys, source text, extracted lease values, old/new edit values, rejection notes, or raw backend error detail to PostHog.

Tenant and landlord dispute analytics use dispute IDs, statement IDs, organization IDs, controlled category/status values, internal-comment flags, aggregate counts, count buckets, attachment MIME type, and attachment file-size buckets only. Do not send dispute descriptions, comment content, resolution summaries, filenames, tenant names, property names, file URLs, storage paths, or other raw dispute text to PostHog. Backend lifecycle names are canonical server-truth counts. Frontend mutation names are separate route and UX context signals with the same privacy boundary.

Property analytics use property IDs, state, selected tabs, entry methods, feature-gate state, BOMA version, count buckets, and coarse occupancy buckets only. Do not send property names, addresses, search terms, rent roll filenames, uploaded document paths, or square-foot values to PostHog.

Frontend authenticated users identify to PostHog as `user:{user_id}` to match backend `capture_backend_event` distinct IDs. The raw UUID is retained only as a `user_id` property for joins.

Both frontend and backend PostHog helpers strip common contact, document, storage, filename, address, tenant/property name, source text, note, old/new value, and URL/file values before capture.

## Backend Revenue Events

Backend routes and Stripe webhooks now emit these server-truth events when `POSTHOG_PROJECT_API_KEY` is configured:

| Event                                  | Trigger                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| `signup_completed`                     | Authenticated `/auth/welcome` signup side effects run for the organization                   |
| `subscription_started`                 | `customer.subscription.created` after subscription upsert succeeds                           |
| `trial_started`                        | `customer.subscription.created` with `trialing` status after the trial email claim completes |
| `invoice_paid`                         | `invoice.paid` after invoice status is marked paid                                           |
| `invoice_payment_failed`               | `invoice.payment_failed` after invoice/subscription status update                            |
| `subscription_cancel_scheduled`        | `customer.subscription.updated` when `cancel_at_period_end` changes `false -> true`          |
| `subscription_reactivated`             | `customer.subscription.updated` when `cancel_at_period_end` changes `true -> false`          |
| `subscription_cancelled`               | `customer.subscription.deleted`                                                              |
| `gl_import_completed`                  | GL import persists from a direct source upload or generic mapping apply succeeds             |
| `reconciliation_calculation_completed` | Queued reconciliation job persists snapshots and marks the job complete                      |
| `reconciliation_finalized`             | Single-snapshot or batch reconciliation finalization succeeds                                |

## Activation Funnel Ground-Truth Check

Use this verifier after you rebuild the activation funnel. Use it again after
you change revenue or import events:

```powershell
Set-Location "<repo-root>\cloudflare-backend"
node "scripts/verify-activation-funnel-ground-truth.mjs" --dry-run
$env:DATABASE_URL="postgres://..."
$env:POSTHOG_PERSONAL_API_KEY="phx_..."
$env:POSTHOG_API_HOST="https://us.posthog.com"
node "scripts/verify-activation-funnel-ground-truth.mjs"
```

The script compares distinct organization IDs in PostHog with database records
for owner signup legal acceptance, completed GL import, first reconciliation
result, finalization, sent trial-start email, and paid invoice. It also fetches
live insight `REDACTED_PH_DASH` and fails if the tile no longer uses the same
organization-level event sequence. The verifier uses `POSTHOG_API_HOST` for
PostHog API calls; keep `POSTHOG_HOST` as the ingest host for event capture.

Required production environment variables:

```env
POSTHOG_PROJECT_API_KEY=phc_...
POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_HOST=https://us.posthog.com
```

## Friction and Tool Events Added

The next instrumentation batch adds these client-side events so optimization work can connect route context, UX friction, and high-intent free-tool behavior:

| Event                                         | Source                 | Trigger                                                                                                                                                                  |
| --------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app_route_viewed`                            | App frontend           | Any SPA route change, with `app_surface`, `feature_area`, `feature_name`, and stable `route_template` for journey analysis                                               |
| `feedback_screenshot_captured`                | App frontend           | User attaches a screenshot to feedback                                                                                                                                   |
| `feedback_screenshot_failed`                  | App frontend           | Screenshot capture fails in the feedback widget                                                                                                                          |
| `feedback_submitted`                          | App frontend           | Feedback API submission succeeds                                                                                                                                         |
| `account_deletion_requested`                  | App frontend           | User submits the guarded account deletion flow                                                                                                                           |
| `account_deletion_blocked`                    | App frontend           | Backend rejects account deletion to preserve org/audit history                                                                                                           |
| `account_deletion_completed`                  | App frontend           | Account deletion endpoint succeeds                                                                                                                                       |
| `lease_document_upload_started`               | App frontend           | User starts uploading one or more lease PDFs for extraction                                                                                                              |
| `lease_document_upload_completed`             | App frontend           | Lease PDF upload batch completes                                                                                                                                         |
| `lease_document_upload_failed`                | App frontend           | Lease PDF upload fails before extraction processing starts                                                                                                               |
| `lease_extraction_process_started`            | App frontend           | User starts or retries extraction processing from the queue                                                                                                              |
| `lease_extraction_process_completed`          | App frontend           | Extraction processing job reports completed                                                                                                                              |
| `lease_extraction_process_failed`             | App frontend           | Extraction processing start request or job status fails                                                                                                                  |
| `lease_extraction_review_opened`              | App frontend           | User opens a lease extraction review from the queue or verification page                                                                                                 |
| `lease_extraction_field_edited`               | App frontend           | User edits a verified extraction field, tracked by coarse field group                                                                                                    |
| `lease_extraction_low_confidence_filter_used` | App frontend           | User filters verification fields to low-confidence items                                                                                                                 |
| `lease_extraction_source_highlight_clicked`   | App frontend           | User clicks a PDF source highlight during review                                                                                                                         |
| `lease_extraction_draft_save_retried`         | App frontend           | User retries a failed verification draft save                                                                                                                            |
| `lease_extraction_approval_opened`            | App frontend           | User opens the approval confirmation for extracted lease terms                                                                                                           |
| `lease_extraction_approved`                   | App frontend           | Verification approval succeeds and terms are committed                                                                                                                   |
| `lease_extraction_approval_failed`            | App frontend           | Verification approval request fails                                                                                                                                      |
| `lease_extraction_rejection_opened`           | App frontend           | User opens the rejection dialog                                                                                                                                          |
| `lease_extraction_rejected`                   | App frontend           | Verification rejection succeeds                                                                                                                                          |
| `lease_extraction_rejection_failed`           | App frontend           | Verification rejection request fails                                                                                                                                     |
| `app_error_boundary_shown`                    | App frontend           | React error boundary renders a fallback                                                                                                                                  |
| `app_error_boundary_retry_clicked`            | App frontend           | User clicks retry from an error boundary fallback                                                                                                                        |
| `app_background_query_failed`                 | App frontend           | React Query background refetch fails while stale data exists                                                                                                             |
| `app_mutation_failed`                         | App frontend           | React Query mutation fails                                                                                                                                               |
| `gl_import_started`                           | App frontend           | User starts a GL import after selecting a property and file                                                                                                              |
| `gl_import_source_detected`                   | App frontend           | Upload succeeds and source detection returns a parser result                                                                                                             |
| `gl_import_mapping_required`                  | App frontend           | Generic GL upload needs column mapping before import completion                                                                                                          |
| `gl_import_mapping_submitted`                 | App frontend           | User submits the generic GL column mapping                                                                                                                               |
| `gl_import_completed`                         | App frontend + backend | GL import reaches success or partial-error completion; backend event is the server-truth completion signal                                                               |
| `gl_import_failed`                            | App frontend           | GL import fails at property selection, upload, mapping validation, or mapping apply                                                                                      |
| `gl_import_preview_failed`                    | App frontend           | GL import completes but preview rows cannot be loaded                                                                                                                    |
| `gl_import_history_loaded`                    | App frontend           | Import History tab loads successfully                                                                                                                                    |
| `gl_import_history_failed`                    | App frontend           | Import History tab fails to load                                                                                                                                         |
| `gl_import_retry_clicked`                     | App frontend           | User retries a failed import from Import History                                                                                                                         |
| `form_started`                                | Marketing site         | Visitor first focuses a marketing contact, gated-download, or calculator-unlock form                                                                                     |
| `form_submit_attempted`                       | Marketing site         | Visitor submits a marketing contact, gated-download, or calculator-unlock form                                                                                           |
| `form_submit_failed`                          | Marketing site         | Marketing form validation, Turnstile, API, rate-limit, or network failure is shown                                                                                       |
| `turnstile_required_missing`                  | Marketing site         | Turnstile is configured but the user submits without a verification token                                                                                                |
| `tool_result_viewed`                          | Marketing site         | CAM leakage estimator first produces a result                                                                                                                            |
| `tool_result_viewed`                          | Marketing site         | CAM overcharge calculator first produces a result; includes `slug`, `tool_type`, `has_cap`, `annual_cam_bucket`, and `leased_sf_bucket` only                             |
| `cta_clicked`                                 | Marketing site         | CAM leakage estimator audit CTA is clicked                                                                                                                               |
| `lead_form_submit`                            | Backend                | Content lead download is inserted successfully                                                                                                                           |
| `calculator_unlock_completed`                 | Backend                | Calculator unlock lead is inserted successfully                                                                                                                          |
| `plg_signup_lead_captured`                    | Backend                | PLG free-audit signup lead is inserted successfully                                                                                                                      |
| `tenant_dashboard_viewed`                     | App frontend           | Tenant dashboard data renders with lease, statement, notification, and statement-status counts                                                                           |
| `tenant_disputes_viewed`                      | App frontend           | Tenant dispute list renders with status counts and count buckets                                                                                                         |
| `tenant_dispute_detail_viewed`                | App frontend           | Tenant dispute detail renders with dispute ID, statement ID, category, status, comment count, and attachment count                                                       |
| `tenant_dispute_create_succeeded`             | App frontend           | Tenant dispute creation mutation succeeds; route/UX context only                                                                                                         |
| `tenant_dispute_comment_submit_succeeded`     | App frontend           | Tenant comment mutation succeeds; route/UX context only                                                                                                                  |
| `tenant_dispute_created`                      | Backend                | Canonical tenant dispute creation lifecycle count                                                                                                                        |
| `tenant_dispute_comment_added`                | Backend                | Canonical tenant dispute comment lifecycle count                                                                                                                         |
| `tenant_dispute_attachment_added`             | Backend                | Tenant dispute attachment database record is inserted after storage upload succeeds                                                                                      |
| `landlord_disputes_viewed`                    | App frontend           | Landlord dispute list renders with active status filter, page size, status counts, and count buckets                                                                     |
| `landlord_dispute_detail_viewed`              | App frontend           | Landlord dispute detail renders with dispute ID, statement ID, category, status, comment count, and attachment count                                                     |
| `landlord_dispute_status_update_succeeded`    | App frontend           | Landlord status update mutation succeeds; route/UX context only                                                                                                          |
| `landlord_dispute_comment_submit_succeeded`   | App frontend           | Landlord comment mutation succeeds; route/UX context only                                                                                                                |
| `landlord_dispute_status_changed`             | Backend                | Canonical landlord status lifecycle count                                                                                                                                |
| `landlord_dispute_comment_added`              | Backend                | Canonical landlord comment lifecycle count, tracked with `is_internal` only                                                                                              |
| `properties_viewed`                           | App frontend           | Properties list renders with total property count and count bucket                                                                                                       |
| `property_search_used`                        | App frontend           | Properties list search returns filtered results; search term is not captured                                                                                             |
| `property_add_clicked`                        | App frontend           | User clicks Add Property with free-audit gate state                                                                                                                      |
| `property_add_blocked`                        | App frontend           | Add Property is blocked by the free-audit property limit                                                                                                                 |
| `property_detail_opened`                      | App frontend           | User opens a property detail page from list/card navigation                                                                                                              |
| `property_create_succeeded`                   | App frontend           | Manual property creation succeeds with property ID and setup flags only                                                                                                  |
| `property_update_succeeded`                   | App frontend           | Property update succeeds with property ID and setup flags only                                                                                                           |
| `property_rent_roll_import_succeeded`         | App frontend           | Rent roll import creates a property                                                                                                                                      |
| `property_detail_viewed`                      | App frontend           | Property detail renders with unit/lease count buckets, state, initial tab, and compliance-tab availability                                                               |
| `property_detail_tab_changed`                 | App frontend           | User changes a property detail tab, including whether it came from setup next action                                                                                     |
| `property_delete_succeeded`                   | App frontend           | Property delete mutation succeeds                                                                                                                                        |
| `backend_api_request_completed`               | Backend                | API or webhook request finishes, with `route_template`, `api_area`, `endpoint_name`, `status_bucket`, `latency_bucket`, and safe user/org identifiers when authenticated |

Free-tool result analytics use coarse input buckets only. `annual_cam_bucket` values are `under_10k`, `10k_49k`, `50k_99k`, `100k_249k`, `250k_999k`, `1m_plus`, or `unknown`. `leased_sf_bucket` values are `under_5k`, `5k_9k`, `10k_24k`, `25k_49k`, `50k_99k`, `100k_plus`, or `unknown`. Do not send raw dollar inputs, square-foot inputs, lease text, names, addresses, or emails.

## Remaining Tracking Gaps

- No events have arrived in the last 30 days as of 2026-05-07.
- Historical `$pageview` events have `0%` `source_app` and `organization_id` coverage.
- Custom marketing, activation, product workflow, and revenue events are absent until the current tracking deploy reaches production and is exercised.
- Manual verification still needs one marketing lead event, one app/product event, and one Stripe webhook event in production Live Events.
