# Goal: Organize & Deepen PostHog Integration

**Set by Angel 2026-06-22.** Objective: dashboards that are (1) useful and (2) use all our
data; every event recorded + correctly attributed; useful user journeys — all so Angel can
make **product** and **marketing** decisions.

PostHog project `REDACTED_PH_PROJECT` (capveri.com, US cloud). Prior goal (2026-06-09) shipped an
8-dashboard suite + broad instrumentation; this goal re-audits because the dashboards are
not delivering decision value.

## Architecture (verified 2026-06-22)

- **3 capture surfaces**, all default to key `phc_REPLACE_WITH_POSTHOG_PROJECT_KEY`,
  host `us.i.posthog.com`:
  - Frontend app (`frontend/`, posthog-js + React) — `frontend/src/lib/analytics.ts` is the
    central wrapper (`trackEvent`, `identify*`, page taxonomy, first/latest-touch UTM). 140+ events.
  - Marketing (`marketing/`, posthog-js + Next) — `marketing/src/lib/posthog.ts`
    (`trackMarketingEvent`). ~18 events.
  - Backend (`backend/`, raw HTTP, no SDK) — `backend/app/services/analytics/posthog.py`
    (`capture_backend_event[_sync]`, `capture_billing_event`). Billing/extraction/api/lead events.
- Identity namespaces: `lead:{domain}:{hash}` (pre-signup), `user:{id}`, `org:{id}` (groups via
  `posthog.group('organization', ...)`).
- No PostHog **feature flags / experiments** anywhere. No `.alias()` anywhere.

## CRITICAL FINDINGS (2026-06-22 code audit)

### F1 — Marketing leads NEVER link to their product user (attribution broken). [FIXING]
Two compounding bugs:
- **Hash mismatch.** Lead distinct_id is `lead:{domain}:{sha256(\`capveri-lead:{email}\`)[:16]}`
  in **marketing** (`marketing/src/lib/posthog.ts:203`) and **backend**
  (`backend/app/api/v1/leads.py:161-165`) — identical. But the **frontend app** uses **FNV-1a
  base36** (`frontend/src/lib/analytics.ts:569-582`) → same email → different id → the
  deterministic cross-device bridge silently never matches. Frontend is the lone outlier.
- **No alias() at signup.** `identifyUserForAnalytics` (`analytics.ts:1141`) only calls
  `identify('user:{id}')`. PostHog `identify` does NOT merge two already-identified persons,
  so the `lead:` person and `user:` person stay split. Need `posthog.alias('user:{id}', leadId)`.
- Impact: cannot answer "which campaign/channel produced a paying customer" — the #1 marketing
  question. **Fix:** unify frontend hash to SHA-256[:16] (match marketing+backend) + add
  alias(lead→user) at signup, deterministically computed from the signup email.

### F2 — 6 dead (type-only) events. [TODO]
Defined in the `ConversionEvent` union but never fired in product code (only in tests):
`free_report_viewed`, `tool_download_clicked`, `lead_created`, `lease_uploaded`,
`upgrade_modal_shown`, `upgrade_modal_cta_clicked`. The `upgrade_modal_*` pair is a real
paywall funnel worth wiring; the rest are likely renamed/superseded → wire or remove.

## PLAN

- **Track 1 — Event/attribution correctness (no PostHog auth needed):**
  - [DONE ca68960a] F1: unify lead hash to SHA-256[:16] + add `alias(user→lead)` at signup. 59 tests.
  - [DONE 41e3795b] F2: wire `upgrade_modal_shown`/`upgrade_modal_cta_clicked` from both paywalls
    (surface-tagged); removed 4 dead type-only events (`lead_created`, `free_report_viewed`,
    `tool_download_clicked`, `lease_uploaded`).
  - [DONE 365b560f] Untracked-action sweep → wired P1 set: auth funnel
    (`login_completed`/`user_logout`/`password_reset_requested`/`password_reset_completed`),
    settings (`profile_update_completed`/`password_change_completed`/`organization_update_completed`),
    team collaboration (`team_invite_sent`/`team_invite_revoked`/`team_member_removed`/
    `team_member_role_changed`). +11 events, 180 touched-component tests green.
  - [deferred] P2/P3 from the audit (help-drawer open/search, admin feedback view,
    reconciliations_list_filtered, lease_detail/form) — lower decision value; revisit if a
    dashboard needs them.
- **Track 2 — Dashboards & journeys (needs PostHog MCP auth):**
  - [ ] Audit existing 8 dashboards (`1688607`–`1688616`): broken insight refs? stale events?
  - [ ] Rebuild into decision dashboards:
    - Marketing: channel/UTM → lead → signup → activation → paid funnel; tool-level lead conv;
      landing-page perf; first-touch attribution of revenue.
    - Product: activation funnel (signup→property→reconciliation→finalized→demand letter);
      feature adoption; retention; extraction quality; error/health.
  - [ ] Define journeys as PostHog funnels + paths for the key flows.
  - [ ] (Optional) feature-flag/experiment scaffolding for product A/B decisions.
- **Track 3 — Verify:** deploy all 3 surfaces; confirm live events flow + identities merge.

## Footguns (this repo)
- Shared main tree is contested by parallel sessions (dirty: RegisterPage/PricingContent/
  HeroSection/SocialProofStrip; local master behind origin/master). Work in worktree
  `goal-posthog-deepening` off origin/master; verify findings vs `git show origin/master:<path>`.
- MCP `dashboards-get-all` ignores project switch; use `dashboard-get` by id or execute-sql.

## Track 2 — Dashboard & journey spec (READY TO EXECUTE once PostHog MCP auth lands)

Auth is the only blocker. The fresh OAuth URL was shared with Angel; when the MCP tools
load, execute this spec. Build with `dashboard-create` + `insight-create` (or execute-sql
via the query endpoint); the existing 8 dashboards (`1688607`–`1688616`) should be audited
first and either repaired or superseded.

**Marketing decision dashboard** (now answerable thanks to F1 lead→user alias):
1. Channel/UTM → lead → signup → paid funnel. Funnel insight: `lead_form_submit` (or
   marketing `generate_lead`) → `signup_completed` → `trial_started` → `checkout_completed`,
   broken down by `first_touch_utm_source`/`utm_campaign` person props.
2. First-touch revenue attribution: paid conversions grouped by `first_touch_*` (the alias
   merge is what makes a paid `user:` carry its pre-signup `lead:` first-touch props).
3. Tool-level lead conversion: `tool_page_view`/`tool_lead_gate_opened` → `lead_form_submit`
   by `tool_slug`. Which free tools actually produce leads.
4. Landing-page performance: page-taxonomy `page_type`/`funnel_stage` → lead rate.

**Product decision dashboard:**
1. Activation funnel: `signup_completed` → `property_created` → `gl_import_completed` →
   `reconciliation_calculation_completed` → `reconciliation_finalized` → `demand_letter_generated`.
2. Paywall conversion: `upgrade_modal_shown` → `upgrade_modal_cta_clicked` → `checkout_completed`,
   broken down by the new `surface` prop (free_audit_modal vs onboarding_results).
3. Team expansion: `team_invite_sent`/`team_member_role_changed` over time, by org group —
   collaboration as an expansion/retention signal.
4. Feature adoption + health: extraction quality (`lease_extraction_*`), GL import success
   vs `gl_import_failed`, frustration (`app_error_boundary_shown`/`app_mutation_failed`).
5. Retention: returning-user stickiness keyed off `dashboard_viewed`/`reconciliation_*`.

**Journeys (paths/funnels):** lead→activation→paid; onboarding sample→real-data→finalize;
auth funnel (`login_completed`/reset flow). Define as PostHog funnel + path insights.

## Cycle log
- C0 (2026-06-22): audit complete. Mapped all instrumentation; found F1 (critical) + F2.
  Designed F1 fix (hash unification + signup alias, verified PostHog alias direction).
  Worktree created. Implementing F1.
- C1 (2026-06-22): Track 1 shipped (worktree commits ca68960a, 41e3795b, 365b560f). F1 +
  F2 + the P1 untracked-action sweep all done with tests + tsc + eslint green and feature
  inventory updated. Track 2 dashboard/journey spec written above (blocked only on PostHog
  MCP OAuth — fresh URL shared). Next: full-suite regression check, code review, then
  deploy + live verify (Track 3) and the Track 2 dashboard build when auth lands.
- C2 (2026-06-22): Track 1 REVIEWED + MERGED + DEPLOYED.
  - Code review (Senior Reviewer subagent): cross-surface lead hash verified BYTE-IDENTICAL
    (reviewer recomputed both test fixtures with crypto, both match); events fire on success
    paths only. One Important gap: OAuth (Google) login was uninstrumented → fixed (891807db,
    +2 tests) firing `login_completed{method:'google'}` on handleOAuthCallback success. Two
    non-blocking items left: alias() arg order (merge succeeds either way; which distinct_id
    survives as canonical needs a LIVE PostHog check — folded into the blocked verification);
    OnboardingResultsPaywall useEffect dep is lint-clean and won't misfire in practice.
  - Full frontend suite green on merged tree: 431 files / 6502 tests, exit 0 (+2 OAuth).
  - Merge: conflict-free `--no-ff` into master (a312e685); the branch's 23 files had ZERO
    overlap with the 20 files origin/master had advanced since the merge-base. Pushed.
  - Deploy: capveri-app from a CLEAN worktree off origin/master (main tree was dirtied by a
    parallel session's CrmFeedbackWidget/worker.ts edits — did NOT deploy from it). Version
    eb3ebb6a serves 100%; app.capveri.com 200. Live bundle proven to contain the fix markers
    (`capveri-lead:` sha256 salt, `login_completed` x2, `upgrade_modal_shown`).
  - BLOCKED (Angel only): in-PostHog live verification (events flow + lead→user identity
    merge + the alias-arg-order resolution) AND all of Track 2 (dashboards/journeys) need the
    PostHog MCP OAuth completed. Spec is ready above; execute the moment the MCP tools load.
- C3 (2026-06-22): Track 2 turned from prose into an EXECUTABLE, idempotent builder while
  blocked on credentials. `scripts/posthog-build-dashboards.mjs` creates 3 dashboards / 15
  insights via the PostHog public API, every event+property name verified against the live
  code taxonomy (Explore inventory: all funnel events ARE fired; first_touch_* person props
  exist; zero taxonomy gaps). Validated: `node --check` OK + `--dry-run` (offline, no key)
  builds all query nodes cleanly. Dashboards:
  - **Marketing Decisions** (5): acquisition funnel lead→signup→trial→paid by
    first_touch_utm_source (paid = subscription_started, the Stripe-webhook truth); paying
    customers by first_touch_utm_campaign (unique persons — enabled by the Track-1 lead→user
    alias); tool→lead funnel by tool_slug; lead volume by first_touch_utm_medium; landing→lead
    rate by first_touch_landing_page.
  - **Product Decisions** (7): activation funnel (signup→property_created→gl_import_completed→
    reconciliation_calculation_completed→reconciliation_finalized→demand_letter_generated);
    paywall conversion by `surface`; team expansion (invite_sent/role_changed); feature health
    (extraction + GL success vs failure); frustration (error_boundary_shown/mutation_failed);
    weekly retention on dashboard_viewed; login method mix.
  - **User Journeys** (3): onboarding path from signup_completed; password-reset funnel;
    paths into subscription_started.
  Idempotent (find-by-name + PATCH-in-place, tagged `goal-posthog-deepening`); supports
  `--dry-run`/`--host`/`--project`.
  TWO UNBLOCK PATHS for Angel (either works, no code change):
  1. **Personal API key (lowest friction):** create one at
     https://us.posthog.com/settings/user-api-keys scoped to insight:write + dashboard:write +
     query:read on project REDACTED_PH_PROJECT, then `POSTHOG_PERSONAL_API_KEY=phx_... node
     scripts/posthog-build-dashboards.mjs` — I can run this for him the moment the key exists.
  2. **MCP OAuth:** complete the shared OAuth URL; then build via insight-create/dashboard-create
     (also unblocks the existing-8-dashboard audit + the live event-flow/identity verification).
  Still genuinely blocked on a credential only Angel can provide; everything buildable without
  one is now built.
- C4 (2026-06-22): **Track 2 EXECUTED LIVE — UNBLOCKED.** Angel provided a personal API key
  (saved out-of-repo at `<claude-home>\secrets\posthog.env`, never git-tracked).
  Scopes confirmed: insights + dashboards read/write both 200 (project:read absent but the
  builder hard-codes project REDACTED_PH_PROJECT, so irrelevant). Ran the builder live:
  - **Created 3 dashboards / 15 insights**: Marketing Decisions (id REDACTED_PH_DASH, 5 tiles),
    Product Decisions (id REDACTED_PH_DASH, 7 tiles), User Journeys (id REDACTED_PH_DASH, 3 tiles). Re-run is
    idempotent (second run = "updated", zero duplicates). All 15 tiles attached.
  - **All sampled insights COMPUTE** (no runtime errors): acquisition funnel, activation
    funnel (signup_completed=5 → property_created=0 → …), paywall conversion, onboarding
    path (6 rows), password-reset funnel — funnels/paths/trends all execute.
  - **Existing 8 dashboards audited:** 1688607/10/11/12/13/14/15/16 intact + thematically
    organized (00 Founder Scoreboard → 99 Tracking Health); ids 1688608/1688609 do not exist
    (never part of the live 8). The 3 new *decision* dashboards complement them, no collision.
  - **Event flow verified (deliverable #2):** top 30d events healthy (backend_api 11.9k,
    $pageview 5.9k, lead_form_view 1267, reconciliation_page_viewed 477, dashboard_viewed 361,
    tool_page_view 131). Funnel-event counts (90d): generate_lead 15, lead_form_submit 10,
    signup_completed 5; trial_started/subscription_started/checkout_completed/
    reconciliation_finalized = 0 — these are CORRECTLY NAMED + wired (client + Stripe-webhook
    backend), simply zero because the product is early-stage with no paid conversions yet
    (truthful funnel data, not a bug). login_completed/upgrade_modal_shown = 0 because they
    were deployed TODAY (Track 1) — they populate going forward.
  - **Taxonomy reconciliation finding (NOT a bug):** property creation fires under TWO names
    by surface — `property_created` (onboarding AddPropertyStep, the activation event) vs
    `property_create_succeeded` (main-app PropertyFormPage, ongoing mgmt). The activation
    funnel correctly uses `property_created`. Both are legitimate; no change needed.
  - **Attribution (deliverable #2 "attributed properly"):** 3 persons carry
    first_touch_utm_source (reasonable — most of ~15 leads are organic/direct, no UTM).
  - **Lead→user MERGE — deployed, not yet live-provable.** 0 user-persons currently hold a
    lead: distinct_id. This is the EXPECTED pre-fix state: the alias() fix deployed today, all
    10 existing user: persons signed up before it (most recent lead: event 2026-06-18 < deploy),
    so they were never aliased and CANNOT be retroactively merged. The merge only folds in NEW
    post-deploy signups → verify on the next organic signup (will NOT fabricate one by creating
    a prod account). Honest limitation, not a failure.
  Net: all three goal deliverables satisfied as far as data allows — dashboards built+useful+
  computing, events recorded+reconciled+attributed, journeys built. Only the live merge proof
  is gated on future organic traffic.
