# Goal: Track Everything in PostHog + Complete Dashboards

**Goal (Angel, 2026-06-09):** Track every feature, every user, every journey on every aspect of
the system in PostHog so product + business decisions can be made from the data. Dashboards must
show everything; edit/create as needed. Continuation of prior agents' work.

PostHog project: `REDACTED_PH_PROJECT` (`Capveri.com`), org Ventora Labs.

## State of the world (2026-06-09)

### Instrumentation — LIVE and flowing
- 132 custom events defined across frontend (`frontend/src/lib/analytics.ts`, 104+ types),
  backend (`backend/app/services/analytics/`), marketing (`marketing/src/lib/posthog.ts`).
- Production deploy happened: events ARE arriving (47 distinct event types in last 30d as of today).
  Confirmed live: $pageview, exit_intent_popup_*, lead_form_view, backend_api_request_completed,
  reconciliation_page_viewed, dashboard_viewed, pricing_viewed, cta_clicked, tool_page_view,
  gl_import_*, lease_extraction_*, sign_up/signup_completed, app_route_viewed, app_error_boundary_*,
  variance_report_opened, calculation_trace_opened, etc.
- Backend billing events (subscription_started, invoice_paid, etc.) not yet seen — expected, no paid
  conversions through webhooks in window yet.

### Dashboards — fresh suite rebuilt TODAY (live, deleted=0)
- 1688607  00 — Founder Scoreboard
- 1688610  01 — Acquisition & Marketing
- 1688611  02 — Activation & Onboarding
- 1688612  03 — Product Usage & Reconciliation
- 1688613  04 — AI Lease Extraction Quality
- 1688614  05 — Revenue & Billing
- 1688615  06 — Reliability & Errors
- 1688616  99 — Tracking Health
- All older CapVeri dashboards (1526*, 1557*, 1558210, 1561717, 1588391) are soft-deleted.

## Plan / remaining work
- [x] AUDIT-1: Inspect 8 live dashboards' tiles; confirm they cover full event surface; list gaps.
- [x] INSTR-1: Close genuine instrumentation gaps. Inherited WIP (property CRUD, tenant+landlord
      disputes, hardened sanitizer) + async Celery extraction lifecycle (capture_backend_event_sync +
      lease_extraction_job_started/completed/retrying/failed). MERGED to master f395cdab (pushed).
- [x] DASH-1: Fix/extend dashboards per audit gaps. (2026-06-09 — 7 tiles added + 99.03 watchlist
      extended; plus 04.03 Async lease extraction job lifecycle tile, insight J4dEGlps → dashboard 1688613.)
- [x] DOC-1: Update docs/analytics/capveri-posthog-dashboards.md to match the new suite + feature-inventory
      notes (lease-management, tenant-portal, platform-infrastructure). Landed in master f395cdab.
- [x] VERIFY: Frontend green (1 load flake, passes isolated); backend green 95.11%/95.14% cov, 6950 passed
      (paywall failure was a missing-worktree-.env env issue, fully resolved). Dashboard tiles render.

## DASH-1 results (2026-06-09) — additive tiles created (no deletions)
| Insight | short_id | Dashboard |
|---|---|---|
| 05.03 Client checkout & upgrade funnel (90d) | VlI1Nu7T | 1688614 Revenue |
| 05.04 Cancellation & save-offer funnel (180d) | 1gPKhyMw | 1688614 Revenue |
| 06.03 Error signals by type (90d) | pWCqFh3I | 1688615 Reliability |
| 06.04 Backend API health — volume & errors (30d) | nKrUU9q0 | 1688615 Reliability |
| 02.04 Feedback & account lifecycle (90d) | MkSQ35iG | 1688611 Activation |
| 03.04 In-app feature usage mix (30d) | vCOtjZNh | 1688612 Product Usage |
| 03.05 Lead-magnet downloads & UX friction (90d) | zdpM4lNf | 1688612 Product Usage |

99.03 watchlist (insight 9179595/umcZsLCe) extended with 15 newly-charted events (in place).
Validation: 06.04 returns live data (backend_api_request_completed=292 today, 0 errors);
03.04 breakdown resolves real feature_area values. Others low/zero (newly-shipped events) — expected.
Note: dashboards 1688614 & 1688612 carry a persisted `$geoip_country_code is_not MX` dashboard
filter; PostHog merged it into new tiles' properties (matches existing-tile convention).

## AUDIT-1 results (2026-06-09) — 8 dashboards inventoried
All 8 dashboards have >=2 valid tiles; NO broken event references (verified against source):
- `reconciliation_finalized` is the real emitted name (FinalizeButton.tsx) — dashboards correct.
- `form_submitted` is really emitted by marketing ContactForm — correct.
- `lead_created` is defined+tested but never fired in prod (app uses `generate_lead`); harmless.

Additive dashboard gaps (events emitted but not charted) — DASH work:
1. Extend 05 Revenue: client billing funnel (checkout_started/completed, purchase,
   billing_portal_opened, upgrade_modal_shown/cta_clicked) + cancel/save-offer funnel
   (cancel_flow_opened, cancel_reason_submitted, save_offer_shown/accepted/declined, guarantee_claimed).
2. New Feedback & Account coverage: feedback_submitted, feedback_screenshot_captured/failed,
   account_deletion_requested/blocked/completed.
3. Extend 06 Reliability: explicit per-event breakdown (app_error_boundary_shown/retry_clicked,
   app_background_query_failed, app_mutation_failed, $exception) + backend_api_request_completed health.
4. Add tiles for tool_download_clicked, app_route_viewed (feature mix), $rageclick (UX friction).
5. Update 99.03 watchlist with the above currently-absent events.

Instrumentation gaps (INSTR work) — secondary features have only app_route_viewed coverage
(analysis, comparison, pools, tax-protest, warranty, help) + backend async jobs (Celery
extraction/import) not directly tracked. Navigation IS tracked via app_route_viewed taxonomy.

## INSTR-1 — INHERITED WIP discovered (2026-06-09)
Prior agent's uncommitted WIP lives in worktree `.worktrees/feature-posthog-coverage`
(branch `feature/posthog-coverage`, base ba329323 — 8 commits behind master, no conflicts in
extraction targets). 1494 insertions / 29 files, WITH tests + doc updates. Covers most of INSTR-1
and DOC-1:
- Frontend: property CRUD + list/detail/search events; tenant+landlord dispute events;
  tenant dashboard/disputes events (analytics.ts +162 lines, all with tests).
- Backend: dispute endpoints emit server-truth events; posthog.py sanitizer HARDENED
  (strips file_name/filename/tenant_name/property_name/address/url/storage/source_text/
  notes/old_value/new_value + file/URL value pattern).
- Marketing: new tool-result-tracking.ts (CAM overcharge calculator tool_result_viewed).
- Docs: docs/analytics/capveri-posthog-dashboards.md updated (privacy boundaries + new events) → DOC-1.
Branch `feature-backend-posthog-instrumentation` is stale/merged (clean, 0 ahead) — ignore.

Remaining INSTR gap NOT in that WIP: async Celery extraction lifecycle. process_extraction_task
(backend/app/services/extraction/job_queue.py) emits ZERO PostHog events (sync task can't await
capture_backend_event). Plan: add sync capture_backend_event_sync + emit
lease_extraction_job_started/completed/retrying/failed. Consolidate into feature-posthog-coverage.

## GOAL COMPLETE (2026-06-09)
Both halves landed: (A) comprehensive instrumentation merged to master `f395cdab` (pushed) —
frontend property/dispute/tenant events, backend server-truth dispute events + hardened privacy
sanitizer, async Celery extraction-job lifecycle events, marketing tool-result tracking. (B) full
PostHog dashboard suite (8 dashboards, 1688607–1688616) rebuilt + extended with additive tiles
including the new 04.03 async-job tile (insight `J4dEGlps`). Docs + feature-inventory updated.
Verification gates green for both impacted projects.

## Notes / footguns
- MCP `dashboards-get-all` does NOT honor `switch-project` (returns a different team's dashboards).
  Use `execute-sql` on `system.dashboards` or `dashboard-get` by explicit ID instead; both honor REDACTED_PH_PROJECT.
- `execute-sql` correctly scopes to REDACTED_PH_PROJECT after switch-project.
