# Platform Infrastructure

> Last updated: 2026-06-30 - Cross-surface failure reporting now preserves graceful UX while routing unexpected backend, Worker, frontend, and marketing failures to Sentry. Expected 4xx, validation, signature/replay, duplicate-upload, and user-abort cases stay quiet; 5xx, network/internal errors, queue/webhook failures, and best-effort side-effect failures report with route/operation/status context only. Sentry helpers scrub or avoid raw payloads, backend details, webhook bodies, files, emails, tokens, signatures, and row data.

> Last updated: 2026-06-30 - Team invitation links now work for existing users as well as new signups. `/team/signup?token=...` accepts the invite before redirecting an already-signed-in user, and the sign-in link preserves the invite token in `returnUrl` so email/password login can return to the invite flow.

> Last updated: 2026-06-29 - Offline-on-pause resilience sweep across reconciliation, lease, analysis, and onboarding sub-components (pristine-coherent Cycle 10). When the backend is unreachable, React Query's default `online` networkMode pauses the fetch (`isPaused` true, `error` null, `isLoading` false), so components gating only on error/isLoading fell through to misleading blank/empty/"add data first" states. `CapBankLedger` (cap history), `TermVersionTimeline` (lease versions), `ExportPanel` history tab, `GLAnalysisPanel` (latest GL analysis), the onboarding Add-Leases step, and the reconciliation kickoff modal now treat `isPaused && !data` as offline and render the shared `ErrorState` with a "Can't reach the server"-class title and a Try-again action that refetches, instead of a blank/empty/disabled state. Regression-tested per component via a paused-query mock.

> Last updated: 2026-06-25 - Non-SSO PLG completion now sends users to billing plan selection instead of the dashboard, and the billing page supports that route even when the upgraded account has no local subscription row yet.
> Last updated: 2026-06-25 - PLG onboarding skips the tenant step after a successful tenant-list import, records that tenant step as completed with `method=rent_roll_import`, and sends the user straight to GL cost upload.
> Last updated: 2026-06-25 - PLG onboarding now emits centralized `onboard_step_transitioned` analytics when the numbered real-data flow starts or moves between steps. Payloads include flow mode, sample-preview flag, current/previous step labels, total steps, direction, and elapsed milliseconds on the prior step so activation drop-off can be read by step.
> Last updated: 2026-06-25 - Dashboard billing summaries now separate over-bill exposure, under-bill exposure, and total billing exposure. The dashboard hero uses total billing exposure after billing data is uploaded and shows the split beneath the headline; draft-only states still use tenant total language.

> Last updated: 2026-06-25 - Onboarding claimed-result screens now use the same neutral file-check treatment and primary amount color for over-bills and under-bills. The onboarding paywall unlocks a Statement Check Report instead of a recovery/reconciliation-framed report.

> Last updated: 2026-06-24 - Grand-slam offer activation slice. The PLG sample is now explicitly a modeled sample, leads with both over-bill and under-bill issues to fix before statements are sent, and logged-in zero-property accounts are redirected to `/onboard?demo=1&source=first-login` until that account has seen the sample. First-run activation surfaces no longer offer a setup-call CTA as the competing first step. The dashboard hero and checklist avoid recovery-only framing: draft totals use tenant billable language, uploaded-billing variance uses under-bill/billing-difference language, and result surfaces call these billing mistakes to check before sending.
> Last updated: 2026-06-22 - PostHog deepening (Track 1 coverage). Instrumented previously-untracked high-value actions so product + marketing funnels are complete. Auth funnel: `login_completed` (method) on email/password sign-in, `user_logout` on sign-out, `password_reset_requested` + `password_reset_completed` on the reset flow. Settings engagement: `profile_update_completed`, `password_change_completed` (ProfilePage), `organization_update_completed` (OrganizationPage). Team collaboration (expansion/retention signals): `team_invite_sent` {role}, `team_invite_revoked` {role}, `team_member_removed` {removed_role}, `team_member_role_changed` {previous_role,new_role} — all fire on the mutation success path. Payloads carry roles/enums only, never emails or names.
> Last updated: 2026-06-22 - PostHog deepening (F1/F2). Marketing leads now link to their authenticated product user: the app computes the same deterministic lead distinct id as marketing+backend (`lead:{domain}:{sha256("capveri-lead:"+email)[:16]}`, previously a divergent FNV-1a hash that never matched) and calls `posthog.alias('user:{id}', leadId)` at sign-in so pre-signup lead activity merges into the user person for first-touch revenue attribution. Paywall upgrade funnel is now instrumented: `upgrade_modal_shown` + `upgrade_modal_cta_clicked` fire from both surfaces (`FreeAuditUpgradeModal` surface=`free_audit_modal`, `OnboardingResultsPaywall` surface=`onboarding_results`) with a `recovery_amount`. Four dead type-only events that were never fired (`lead_created`, `free_report_viewed`, `tool_download_clicked`, `lease_uploaded`) were removed from the frontend event taxonomy.
> Last updated: 2026-06-20 - PLG onboarding redesigned into a sample-first "aha" experience (goal-onboarding-aha). The `/onboard` flow now leads with a read-only sample reconciliation that already found money instead of the numbered setup forms. New `frontend/src/features/plg/steps/WelcomeSampleStep.tsx` is the default front door for new non-SSO users: a big "$14,820 found" headline for a sample building, then progressive disclosure of three plain-English findings, with a single primary CTA "Check my own building" that sets `flowStarted` to advance into the real-data step machine. Sample numbers live in one place (`frontend/src/features/plg/steps/sampleResult.ts`: $8,400 + $4,200 + $2,220). A `?demo=1` sample-preview path lets a logged-in user view the same read-only sample without being bounced to checkout (OnboardPage skips the redirect guard, OnboardFlowWizard reads the param, useAnonSession becomes ready without redirect/init scoped to the real user id, OnboardFlowContent forces WelcomeSampleStep via a one-shot ref). All dashboard sample entry points (GettingStartedChecklist, WelcomeCard tour, EmptyState presets, LeasesTab) deep-link `/onboard?demo=1`. Step components, results, dashboard hero, empty states, upload descriptions, and the export guide got a plain-English (~3rd-grade) copy pass with jargon explained inline (copy passed humanizer + third-grade-copy); auto-advance timers removed (the user clicks to proceed); controls meet the 44px touch floor and respect prefers-reduced-motion. The old unreachable `demoMode`/`isDemoMode` walk-through (its trigger button was gone) and its dead branches/tests were removed. Frontend gate green: tsc + eslint --max-warnings 0 clean, 6467 tests passing. Ledger: docs/goal-onboarding-aha/DESIGN-SPEC.md.
> Last updated: 2026-06-15 - Keyboard-focus ring parity on two shared primitives (pristine-UX marathon Cycle 15). The `Badge` (frontend/src/components/ui/badge.tsx) and the `Select` trigger's inline clear (X) button (frontend/src/components/ui/select.tsx) used a plain `focus:` ring, which fires on mouse click too, instead of the dominant primitive pattern `focus-visible:` (keyboard-only). Both now use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`; the clear button also gained the missing `ring-offset-2` and went circular (`rounded-full`) per the icon-button design canon. Radix roving-focus menu items (Select/Dropdown items) that highlight via `focus:bg-accent` with no ring were left as-is — that background-highlight affordance is the standard menu convention, not a defect. SelectTrigger's `focus:ring-2` was also left unchanged (a ring on click of a field trigger is acceptable, and a test asserts that class). 31/31 badge+select tests green; tsc + eslint clean.
> Last updated: 2026-06-15 - Shared DataTable loading skeleton now matches the loaded layout on mobile (pristine-UX marathon Cycle 14). The shared `DataTable` (frontend/src/components/ui/data-table/DataTable.tsx) returned the table-shaped `DataTableSkeleton` while loading even on routes that render stacked mobile cards once data arrives — so on a phone the skeleton was a wide table that then flipped to a vertical card stack, a jarring layout shift. The loading branch now checks `showMobileCards` first: when a `mobileCardRenderer` is set and the viewport is below the breakpoint it renders a stack of five `SkeletonCard` placeholders (matching the card layout) instead of the table skeleton; desktop and all loaded states are unchanged. 85/85 data-table tests green; tsc + eslint clean.
> Last updated: 2026-06-15 - Shared table loading skeleton no longer overflows the viewport on mobile (pristine-UX marathon Cycle 13). `DataTableSkeleton` (frontend/src/components/ui/data-table/DataTableSkeleton.tsx) rendered a desktop pagination row (~630px of fixed-width skeleton cells, incl. a 4-box page cluster) as a sibling outside the table's `overflow-auto` wrapper. During the ~1.3s loading phase every list route that uses it (Reconciliations, Properties, Team Members, Tax Protest, Extractions, Portfolio Pipeline, Export History, and the shared DataTable loading branch) let that row bleed ~90–130px past a 390px viewport, producing transient horizontal page scroll. Fixed by adding `overflow-x-hidden` to the skeleton container and collapsing the pagination right-cluster to `hidden sm:flex` (desktop still shows the numbered boxes). 85/85 data-table tests green; live-verified scrollWidth==clientWidth during loading at 390px and the right-cluster visible at 1440px.
> Last updated: 2026-06-15 - Modal/sheet close (X) buttons now meet touch-target size (pristine-UX marathon Cycle 11). The shared Sheet close button (`frontend/src/components/ui/sheet.tsx`) rendered as a bare 16×16px icon with no padding — far below a usable tap target on phones — while the Dialog close (`dialog.tsx`) was a 24px `p-1` box. Both are now centered circular 40×40px hit areas (`flex h-10 w-10 items-center justify-center rounded-full`, icon unchanged), satisfying the touch-target floor and the circular-icon-button design canon. App-wide root fix: every Sheet (Export, Help Drawer, Demand Letter, Calculation Trace, tours, FeedbackWidget) and every Dialog gains the larger target in one change. dialog+sheet primitive tests 46/46 green; live-verified 40×40 at 390px with no overflow regression.
> Last updated: 2026-06-15 - Team Members tables are now responsive (pristine-UX marathon Cycle 10). The Settings → Team Members page (frontend/src/pages/settings/TeamMembersPage.tsx) rendered both the Current Members and Pending Invitations lists as wide tables that overflowed on phones. Below the md breakpoint each list now renders as stacked cards (member: name + "You" badge, email, role Select/Badge, joined date, remove action; invitation: email, role badge, expiry, revoke action) via the established useViewport `isMobile` pattern; desktop tables, all dialogs (invite/revoke/remove), and admin gating are unchanged. Frontend-only layout change.
> Last updated: 2026-06-14 - Expense-pool copy "Replace" mode now requires explicit confirmation. PoolCopyDialog's Replace option permanently deletes every existing pool at the target property, but it previously ran on a single "Copy Pools" click with only a passive amber warning label. A second AlertDialog ("Replace all pools?" with a destructive-styled "Replace pools" action) now gates the replace-mode mutation; merge mode is unchanged. Companion fix: the ImportHistoryList delete and LinkedAccounts unlink confirm buttons, plus the ExportHistory delete button hover, now carry the standard `bg-destructive text-destructive-foreground hover:bg-destructive/90` styling so dangerous confirms read as dangerous. Added a test asserting replace mode does not mutate until the confirm dialog is accepted (pristine-UX marathon Cycle 16).
> Last updated: 2026-06-14 - Expense Pools page "Copy Pools"/"Copy Between Properties" actions now explain why they are disabled: with fewer than two properties the action is impossible, and a bare disabled button left the user guessing. The disabled button is wrapped in a tooltip ("Add a second property to copy expense pools between properties.") hosted on a focusable `<span tabIndex={0}>` (disabled buttons emit no pointer/focus events, so the tooltip trigger must sit on a sibling). Enabled state is unchanged. Reuses the global App-level TooltipProvider; PoolsPage test wrapper gains a local TooltipProvider so the 12 page tests render the disabled-state tooltip (F-445, pristine-UX marathon Cycle 2).
> Last updated: 2026-06-12 - Added signed authenticated `/api/v1/ai-cs/app-context` for Ventora AI-CS app help context. The endpoint requires the normal organization-scoped bearer auth, verifies the Ventora HMAC request, rejects user mismatches and replayed nonces, and returns contract-shaped public app help/navigation/workflow context with signed response headers.
> Last updated: 2026-06-11 - Swept the non-form `text-destructive` body text the form-primitive root fix (F-386) does not cover: 31 static error/status/negative-value text nodes across 24 components that render their own `<p>`/`<span>`/`<dd>`/`<h3>`/table-cell error text (not delegated to FormMessage) were swapped from the WCAG-failing `text-destructive` (~3.9:1 on white) to `text-destructive-strong`. Covers the auth pages (login/register/forgot/reset custom field errors), tenant-portal dispute/dashboard errors, ingestion import-error + upload-progress text, lead-capture field errors, property-tab load errors, GL-analysis/anomaly/cap-bank/denominator-change status text, and the rent-roll/PDF-preview/lease-detail inline errors. Large-text (text-lg/xl/2xl/4xl) and interactive `<Button>`/menu-item destructive labels left untouched (pass 3:1 / separate judgment). LoginPage test asserts the email-validation error carries the strong class; 60 affected-surface tests green; typecheck clean (F-387).
> Last updated: 2026-06-11 - The shared `FormMessage`/`FormLabel` primitives (`components/ui/form.tsx`) now render in the AA-contrast `text-destructive-strong` instead of the bright `text-destructive` (~3.9:1 on white — fails WCAG AA at body size). This is the app-wide root fix: every react-hook-form validation message, error-state field label, and required-field asterisk across ALL forms (auth, lease, unit, expense-pool, profile, settings, etc.) now meets WCAG AA in one change, matching the F-287/F-381/F-382/F-383/F-384/F-385 standard. Full frontend suite (6390 tests) green; the form-primitive test asserts the strong class on the required asterisk (F-386).
> Last updated: 2026-06-09 - PostHog product-analytics coverage for property management. The properties list, property form (create/edit), and property detail pages emit privacy-safe events: `properties_viewed`, `property_search_used`, `property_add_clicked`, `property_add_blocked`, `property_detail_opened`, `property_create_succeeded`, `property_update_succeeded`, `property_rent_roll_import_succeeded`, `property_detail_viewed`, `property_detail_tab_changed`, and `property_delete_succeeded`. Payloads carry IDs/enums/counts/buckets only — never property names, addresses, or tenant data. Part of the wider PostHog coverage pass (see tenant-portal.md for disputes and lease-management.md for async extraction lifecycle).
> Last updated: 2026-06-07 - Keyboard activation for clickable non-interactive elements (F-276): five `onClick`-only surfaces that were the SOLE trigger for their action but had no keyboard path (no role/tabIndex/onKeyDown) are now keyboard-operable, matching the existing PropertyCard pattern (`role="button"` + `tabIndex={0}` + Enter/Space `onKeyDown`). Sites: FormatCard export-format card, TemplateSelector pool-template card, NotFound 404 quick-link cards, Billing plan-picker `CardHeader` toggle (also gains `aria-expanded`), and the ReconciliationGrid row (tabIndex + onKeyDown only, NO role, to preserve grid-row semantics). Frontend-only; +regression tests firing keyDown Enter/Space and asserting the same effect.
> Last updated: 2026-06-07 - Accessible names for previously-unlabeled form controls (F-275): filter `Select` triggers (Export History format/status, Invoices status, Portfolio Pipeline year), the reconciliation mobile search input, the inline Field Mapping cell editors (target field / transform / default value / max length, each labeled per-row by its source field), the warranty revoke-reason textarea, and the save-template name input each rendered with only a placeholder, so screen readers announced them as unlabeled. Added `aria-label` to each. Frontend-only, no logic change; +9 regression tests asserting each control resolves by its accessible name.
> Last updated: 2026-06-07 - Flexbox truncation hardening across 4 row layouts (F-274, sibling to F-262): the dashboard ReconciliationStatusCard, PortfolioPipelinePage campaign rows, ReconciliationCard per-tenant share rows, and the LeaseDetailPage copy-to-clipboard chip each had a `truncate` text node in a flex row without `min-w-0`, so long property/tenant names and values pushed or clipped their sibling (status Badge / amount / Copy icon) instead of ellipsizing. Added `min-w-0` to the shrinking text item (and its inner flex wrapper where needed) plus `shrink-0` on the must-stay sibling.
> Last updated: 2026-06-07 - Shared `SelectTrigger` truncates long values instead of clipping (F-262): the trigger is a flex row holding the value span + chevron; the span had `line-clamp-1` but no `min-w-0`, so as a flex child it kept its content width (`min-width:auto`) and clipped or pushed the chevron off-screen at narrow widths (e.g. the TrendAnalysisPage 5-column filter grid). Added `[&>span]:min-w-0` so line-clamp can truncate with an ellipsis, plus `shrink-0` on the chevron so it stays visible. App-wide fix for every Select; regression test in `select.test.tsx`.
> Last updated: 2026-06-07 - Bare nav-group parent routes redirect to their first child (F-266): `/documents` → `/ingestion` (Upload GL) and `/analysis` → `/analysis/year-over-year`, matching the existing `/admin` → `/admin/feedback` and `/settings` → `/settings/profile` redirects. Both bare paths previously rendered the 404 page because neither has an index route. React Router v6 exact-matches the bare `path`, so child routes (e.g. `/analysis/trends`) are unaffected. Tests in `App.test.tsx`.
> Last updated: 2026-06-07 - API error envelope detail now survives the client interceptor (F-263, true root cause of F-02 that F-258 missed): the @hey-api `client.interceptors.error` handler now detects the parsed backend envelope (shared `isErrorEnvelope` guard) and builds the `ApiError` via `ApiError.fromUnknown(error)` BEFORE falling back to `ApiError.fromResponse(response)`. The interceptor previously always took the `fromResponse` path, which re-read an already-consumed response body and collapsed every 4xx/5xx to the generic `"Request failed with status N"` — so even though F-258 taught `fromUnknown` to parse the envelope, the panel never reached it. Live-verified: the Denominator Changes panel again shows its friendly "No 2025 snapshot to compare yet" empty state instead of a generic error. Regression tests added in `client.test.ts` (string + 422 array envelopes) and `errors.test.ts` (`isErrorEnvelope`).
> Last updated: 2026-06-07 - Error handling + layout robustness (F-258/F-260): `ApiError.fromUnknown` now parses the backend JSON error envelope (`{status_code, detail, message, errors}`) that the @hey-api client returns in `result.error` without passing through the error interceptor. Previously such errors collapsed to `statusCode 0` and `"[object Object]"`, silently breaking every hook that branched on status code or detail text (confirmed live on the Denominator Changes panel, which could no longer tell "no finalized snapshots" apart from a real failure). The shared `PageHeader` title/actions row now wraps (`sm:flex-wrap`) and the title column has a `sm:min-w-[16rem]` floor, so a wide action toolbar wraps to its own line instead of crushing the h1 into a tall stack at desktop widths.
> Last updated: 2026-06-07 - UI consistency + a11y pass (F-255..F-257): bare `/admin` now redirects to `/admin/feedback` instead of 404 (mirrors the `/settings` redirect pattern); shared `TabsTrigger` uses the pill `rounded-button` token so tab/segmented controls match the pill canon (Add-Property + all property-detail tabs); the dashboard hero "Recovery Opportunity" count-up animation honors `prefers-reduced-motion` (final figure shown immediately, no misleading mid-animation partials). Live-audit triage also confirmed 5 non-defects (documented exemptions/by-design): pagination connected segmented control, SelectTrigger `rounded-lg`, mobile bottom-nav, login Remember-me Radix a11y quirk, gated `/certificates` read-only state.
> Last updated: 2026-06-05 - Onboarding/dashboard a11y + consistency pass (F-227..F-229): the GL upload step now shows a friendly source label ("Yardi Voyager"/"MRI Commercial"/"Generic Format") instead of the raw enum after a file is detected; dashboard Quick Actions tiles and the onboarding "What's next?" navigation tiles get visible keyboard focus rings (focus-visible) so keyboard users can see what is focused.
> Last updated: 2026-06-05 - Settings UI polish: a bare `/settings` route now redirects to `/profile` instead of rendering a 404 (no Settings index page existed); the property overview Metadata card uses a two-column grid gap so "Created"/"Last Updated" values no longer collide; the team members list only renders the secondary email line when a display name exists, so members with no full name no longer show their email twice; shared DataTable pagination buttons are grouped into a pill (rounded-full) segmented control per the design canon (F-186/F-187/F-188/F-192).
> Last updated: 2026-06-04 - Property list client-side search no longer crashes: the filter now null-guards the optional address fields (`address_line1`/`city`/`state`/`postal_code` are `string | null` in the generated Property type) before lowercasing, so typing a search term with any property that has a missing address component returns results instead of throwing (F-124).
> Last updated: 2026-06-01 - Global app frustration analytics now emit privacy-safe PostHog events when an error boundary is shown or retried and when React Query background queries or mutations fail, using route/context, query or mutation group, error name, and coarse error category instead of raw messages.
> Last updated: 2026-06-01 - Product analytics now use privacy-safe PostHog identity and event properties: authenticated identify calls send `email_domain` instead of raw email, feedback capture records submission/screenshot success/failure events without message content, account deletion records requested/blocked/completed outcomes with enum block reasons, backend analytics recursively strips sensitive nested keys, and app-side CAM Leakage Estimator uses the shared `tool_result_viewed` event with bucketed/derived values only.
> Last updated: 2026-05-30 - Expense pools page no longer hard-caps the property launcher to the first 6 properties: it shows a "Showing X of N properties" notice and a "Show all (N)" / "Show fewer" toggle so every property is reachable; the pool-copy mutation now surfaces the backend's structured error detail (via ApiError) instead of a generic "Failed to copy pools" message (F-033/F-037).
> Last updated: 2026-05-29 - Settings/role gating hardened: the Team Members page now shows an "Admins only" notice for non-admins and only fires the admin-only members/invitations queries when the viewer is an admin, so members/viewers no longer trigger 403s that surfaced as a "Failed to load team data" page error; Organization Settings consumes the context-computed `isOwner` from auth directly (single source of truth) rather than re-deriving the owner check locally; the Profile page hides the password-change form for social-only accounts (no email/password identity) and shows a notice instead, since current-password verification would always fail for them (F-078/F-079/F-081).
> Last updated: 2026-05-29 - Property pages hardened: the property form reads back fractional target occupancy without rounding to a whole number (0.955 -> "95.5"); the property list requests up to 100 properties and shows a truncation notice when more exist than were loaded; the property detail page relabels the unit-occupancy stat "Unit Occupancy" (distinct from CAM recovery occupancy) and no longer blocks the whole page on unit/lease queries, so stat cards and the setup card show their own loading state instead of flashing a misleading "Add your first unit" prompt (F-015/F-016/F-019/F-021).
> Last updated: 2026-05-29 - The Profile page Role field now reads the org-scoped RBAC role (`useUserRole`) instead of the Supabase JWT `authenticated` claim, so it shows OWNER/ADMIN/MEMBER/VIEWER; the admin Feedback page resets pagination to page 1 when the type or status filter changes, preventing an out-of-range page after a filter narrows the result set (F-076/F-077).
> Last updated: 2026-05-29 - Organization-name editing in Organization Settings is now gated on the OWNER role (matching the owner-only `organizations` UPDATE RLS policy and the RBAC matrix) instead of admin||owner, so admins no longer see an editable form whose save silently fails; the admin Feedback page now checks `res.ok` on its list/stats/update fetches and renders an error state instead of feeding an error body into the table renderer (F-071/F-072).
> Last updated: 2026-05-29 - Property `tax_protest_county` and `tax_protest_deadline_override` are now declared on the shared property base schema, so they are accepted on property create (previously silently dropped, only accepted on update) and returned on property reads; the property form no longer casts the read model to fetch them.
> Last updated: 2026-05-28 - PLG onboarding bootstrap now recovers idempotently from concurrent anonymous user creation races and upgrade verifies the submitted email matches the authenticated Supabase account before binding it to the local user.
> Last updated: 2026-05-22 - Tenant-role users no longer inherit landlord-wide RLS helper access, authenticated browser clients can only update profile name fields on `users`, tenant snapshot access is lease-scoped, and the app deployment sets CSP/anti-framing security headers while removing GTM/GA scripts from the authenticated shell.
> Last updated: 2026-05-22 - Service-role-backed property workflows now use a shared organization ownership guard, and documents/feedback screenshot storage buckets are private with signed URL access for feedback screenshots.
> Last updated: 2026-05-20 - The expense-pool copy dialog resets its mutation state and form selections each time it reopens, so stale success/error alerts and prior choices no longer reappear.
> Last updated: 2026-05-20 - Property form smoke coverage now exercises the real create route tabs/manual form and the edit route with populated existing-property values.
> Last updated: 2026-05-19 - Pool split allocations are now managed through property-scoped API/UI flows and applied during reconciliation aggregation.
> Last updated: 2026-05-13 - Added signed `/api/v1/ai-sdr/product-context` for Ventora AI SDR product context handoff.
> Last updated: 2026-05-13 - Authenticated SSO users can complete `/onboard?source=sso` through the SSO-mode onboarding wizard instead of being redirected to checkout.
> Last updated: 2026-05-06 - Property detail setup CTAs now drive the same hash-backed tab state as direct `/properties/:id#units`, `/properties/:id#leases`, and `/properties/:id#imports` links so guided setup lands on the intended tab.

> Last updated: 2026-05-02 - Server-side RBAC now rejects tenant users from landlord org APIs, keeps viewers read-only on mutation paths, requires owner/admin for reconciliation finalization, and requires owner for billing mutations.

> Last updated: 2026-04-30 - Auth hardening: protected routes now wait for profile/role resolution before rendering, profile fetch failures fail closed, API 401s redirect to login with an expired-session return URL, and `/auth/reset-password` handles Supabase recovery links.

> Last updated: 2026-04-28 - Friendly contextual help expansion: reusable `HelpTip`, `HelpTerm`, `FieldHelpLabel`, `GuidedEmptyState`, and `FriendlyError` components now support plain-language explanations across ingestion, lease upload, property setup, and reconciliation; the help drawer/page include glossary search, route-aware suggestions, and expanded task guides for upload fixes, lease verification, pool mapping, findings review, finalization, billing, and team invitations

> Last updated: 2026-04-26 - Lighter signup, dashboard-first activation: `/auth/register` slimmed to email + password (org name now derived from email domain via `orgNameFromEmail`, with free-mail fallback to "My Workspace"); `GettingStartedChecklist` on `DashboardPage` persists through all 5 setup steps or until dismissed (replaces the narrower `ContinueSetupCard`, which was deleted); new PostHog events `activation_completed` (fired once per browser via `capveri_activation_fired` localStorage key) and `sign_up` with `method: <provider>` from `AuthCallback` for fresh SSO signups; SSO buttons promoted above email form on RegisterPage

> Previous: 2026-04-25 - ContinueSetupCard wired into DashboardPage (replaced 2026-04-26 by persistent `GettingStartedChecklist`)

> Previous: 2026-04-25 - Guided empty state on ReconciliationsListPage: when a brand-new user has no properties and no snapshots, shows "No reconciliations yet" card with "Upload expense report" and "View properties" CTAs instead of the generic "No properties found" message

> Previous: 2026-04-25 - PostHog PLG analytics: all 7 onboarding wizard steps now fire `onboard_step_viewed` on mount and `onboard_step_completed` on successful action; wizard fires `demo_mode_started` when demo is entered and `demo_mode_completed` (with `converted_to_real` flag) from the Results step

> Previous: 2026-04-25 - Demo-mode timer tests: added `demo mode` describe blocks to AddLeasesStep, UploadFileStep, and ActualBilledUploadStep test files, confirming the 800ms auto-advance fires once and not before

> Previous: 2026-04-25 - PLG onboarding demo mode: steps 1–4 (AddProperty, AddLeases, UploadFile, ActualBilledUpload) now auto-advance after 800ms with shimmer UI when `demoMode` is set in wizard state; `demoMode` added to `OnboardingData` base type
> Previous: 2026-04-23 - Beginner guided help: authenticated `/help`, persistent header help drawer, Help sidebar entry, task-based guide data, and clearer dashboard/onboarding/upload guidance for nontechnical users

> Previous: 2026-04-10 - ProfilePage: currentPassword is now actually verified via supabase.auth.signInWithPassword before allowing change (was collected but ignored); PropertyFormPage: state field replaced with US state dropdown, target_occupancy accepts percentage (0-100) with automatic decimal conversion for API

> Previous: 2026-03-24 - Browser notification support for extraction completion: useNotificationPermission hook, sendBrowserNotification utility, NotificationPrompt banner on ExtractionsPage

## Overview

Multi-tenant SaaS platform with 5-role RBAC, row-level security on every table, expense pool management with GL account pattern routing, team collaboration via invitation, and a guided onboarding wizard. All data is organization-scoped with defense-in-depth isolation at the database, API, and frontend layers.

## Features

### AI SDR Product Context

- Public endpoint: `GET /api/v1/ai-sdr/product-context?productId=capveri`.
- Validates `X-Ventora-Timestamp`, `X-Ventora-Nonce`, and `X-Ventora-Signature` with `AI_SDR_PRODUCT_CONTEXT_SECRET` before returning context; `AI_SDR_CONTEXT_SECRET` is accepted as a compatibility alias.
- Accepts `product_id=capveri` as a compatibility alias while keeping the signed body contract on `productId`.
- Rejects unknown products, missing signatures, stale signatures, invalid signatures, replayed nonces, and missing server secret.
- Response includes signed `X-Ventora-*` headers and static CapVeri context only; no tenant, landlord, lease, property, or customer data is exposed.
- Route implementation: `backend/app/api/v1/ai_sdr.py`; tests: `backend/tests/api/v1/test_ai_sdr.py`.

### AI CS App Context

- Authenticated endpoint: `GET /api/v1/ai-cs/app-context?appId=capveri&userId=<uuid>&currentPath=<path>`.
- Requires normal organization-scoped bearer authentication and rejects requests where `userId` does not match the authenticated user.
- Validates `X-Ventora-Timestamp`, `X-Ventora-Nonce`, and `X-Ventora-Signature` with `AI_CS_CONTEXT_SECRET`.
- Rejects unknown apps, missing signatures, stale signatures, invalid signatures, replayed nonces, missing server secret, and cross-user context requests.
- Response includes signed `X-Ventora-*` headers, public CapVeri help sources, contract-shaped navigation targets, and current/next workflow steps. It does not include tenant, landlord, lease, property, or customer records.
- Route implementation: `backend/app/api/v1/ai_cs.py`; tests: `backend/tests/api/v1/test_ai_cs.py`.

### RBAC (5 Roles)

- **OWNER**: Organization settings, billing management, user deletion.
- **ADMIN**: Resource deletion, snapshot finalization, dispute management.
- **MEMBER**: CRUD on resources, run calculations.
- **VIEWER**: Read-only access, exports permitted.
- **TENANT**: Lease-scoped portal access (separate portal architecture).
- Auth dependencies in `backend/app/auth/dependencies.py`:
  - `CurrentUser = Annotated[User, Depends(get_current_user)]`
  - `CurrentAdminUser = Annotated[User, Depends(get_current_admin_user)]`
  - `CurrentLandlordUser = Annotated[User, Depends(get_current_landlord_user)]`
  - `CurrentEditorUser = Annotated[User, Depends(get_current_editor_user)]`
  - `CurrentOwnerUser = Annotated[User, Depends(get_current_owner_user)]`
  - `OrgContext = Annotated[OrganizationContext, Depends(get_org_scoped_context)]`
- Landlord organization context rejects tenant-role users from non-tenant APIs.
- Editor-level route dependencies allow owner/admin/member writes and reject viewer/tenant writes.
- Admin-level route dependencies protect reconciliation and ingestion finalization paths.
- Owner-level route dependencies protect subscription, checkout, customer, portal, payment method, trial, and save-offer billing mutations.
- Documented in `docs/architecture/rbac-permissions.md`.

### Row-Level Security

- Every table has RLS enabled with `organization_id`-based policies.
- Helper functions (SECURITY DEFINER): `get_user_organization_id()`, `user_can_access_unit()`, `user_can_access_lease()`, `user_can_access_lease_term_version()`.
- `get_user_organization_id()` only returns an organization for landlord roles (`owner`, `admin`, `member`, `viewer`); tenant-role users resolve through tenant-specific policies instead of landlord-wide org policies.
- Defense-in-depth: DB RLS + API dependency injection (OrgContext) + frontend hooks.
- Authenticated browser clients have column-limited profile updates on `users.full_name`; role, organization, and platform-admin fields are not client-mutable.
- Service-role-backed API paths that accept `property_id` must verify property ownership through `backend/app/api/v1/property_access.py` before privileged reads or writes.
- Service role bypasses RLS for webhook-driven mutations (billing, invoices).
- Multiple migration fixes for RLS circular dependencies and performance (migrations 25, 30-35, 50-53, 58-60).

### Multi-Tenancy

- Organization-scoped data isolation. One subscription per org (UNIQUE constraint).
- Authenticated app deployment adds CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, nosniff, referrer policy, and permissions policy headers in `frontend/vercel.json`.
- The authenticated SPA shell does not load Google Tag Manager or Google Analytics scripts; product analytics run through bundled app instrumentation under the CSP allowlist.
- Storage bucket paths include `org_id` for file isolation. Sensitive buckets such as `documents` and `feedback-screenshots` are private; feedback screenshot responses use short-lived signed URLs and persist only organization-scoped object paths.
- `set_org_context()` function (migration 51) sets runtime org context for RLS evaluation.

### Expense Pool Management

- Pool types: `OPERATING`, `TAX`, `INSURANCE`, `CAPITAL`, `OTHER`.
- `is_gross_up_applicable` boolean flag per pool.
- `gross_up_target` NUMERIC(5,4) — per-pool target occupancy override (0-1).
- Pool name unique per property via `UNIQUE (property_id, name)` constraint.
- 2-level hierarchy via `pool_hierarchy` table (migration 27).
- Pool allocations in `pool_allocations` table (migration 28).
- Endpoint: `/api/v1/properties/{id}/expense-pools/` (CRUD via `backend/app/api/v1/expense_pools.py`).
- Pool split allocation endpoint: `/api/v1/properties/{property_id}/pool-allocations` (CRUD via `backend/app/api/v1/pool_allocations.py`).
- Pool split allocation API is property-scoped: source and target pools must belong to the route property, self-allocation is rejected, duplicate source/target allocations conflict, and active percentage allocations cannot exceed 100% per source pool.
- Reconciliation aggregation applies active percentage pool-to-pool splits after GL-to-pool mapping percentages, preserving deterministic Decimal math and assigning any remainder to the original source pool.
- Property UI shows split counts on each expense pool and exposes `PoolAllocationsDialog` for creating and deleting percentage-based splits between pools.
- Fixed-amount pool allocations, allocation history, and copy/reuse flows are not included in the current split allocation UI slice.

### Pool Mappings

- GL account pattern -> expense pool routing.
- `gl_account_pattern` VARCHAR(50) supports wildcards (`*`, `%`, `?`) and dots. `%` is accepted as an ERP-style alias for `*`.
- `allocation_percentage` NUMERIC(5,4) for split allocations (0-1, default 1.0).
- `priority` INTEGER for conflict resolution (higher = matched first).
- Endpoint: `/api/v1/properties/{id}/pool-mappings/` (via `backend/app/api/v1/pool_mappings.py`).

### Pool Templates

- Pre-built pool configurations for common property types.
- Clone and customize templates.
- Copy pools between properties.
- Service: `backend/app/services/pools/template_service.py`, `copy_service.py`.
- Endpoint: via `backend/app/api/v1/pool_templates.py`.
- Template data stored in `pool_templates` table (migration 29).

### Auto Pool Setup

- Auto-create pools from GL entries via pattern recognition.
- Suggests pool mappings based on GL account codes.
- Service: `backend/app/services/pools/auto_setup.py`.

### Team Management

- Invitation-based team onboarding.
- Email token invitations with expiry.
- Role assignment on invite.
- Endpoints: `/api/v1/team-invitations/` (via `backend/app/api/v1/team/`).
- Service: `backend/app/services/team_invitation.py`.
- Frontend: `/settings/team` with `TeamMembersPage.tsx` — active members table, pending invitations, invite modal.
- Migration: `20240101000056_create_team_member_invitations.sql`.

### Organization Settings

- `GET /api/v1/organization/usage` — Property count, user count.
- Organization settings: name, address, tax ID, primary contact, billing email, logo upload.
- Settings stored as JSONB in `organizations.settings` column.
- Frontend: `/settings/organization` via `OrganizationPage.tsx`.

### User Profile

- First name, last name, password change, avatar.
- Frontend: `/settings/profile` via `ProfilePage.tsx`.
- Account deletion flow emits PostHog lifecycle events for requested, blocked, and completed outcomes. Blocked analytics uses controlled reason values such as `last_org_user`, `last_org_admin`, `audit_history`, `linked_records`, or `unknown` rather than backend error text.

### Product Analytics

- Authenticated app PostHog identify calls include org/role metadata and `email_domain`, not raw email.
- Feedback widget analytics captures submitted, screenshot captured, and screenshot failed states without sending the user's free-text feedback or screenshot contents.
- Tool analytics uses shared event names across app and marketing surfaces, including `tool_result_viewed` for CAM leakage estimates with bucketed inputs and derived result ranges.
- Backend PostHog helpers recursively drop sensitive nested property keys and values before emitting server-confirmed events.
- Global frustration analytics capture `app_error_boundary_shown`, `app_error_boundary_retry_clicked`, `app_background_query_failed`, and `app_mutation_failed` with safe context, route, key group, error name, and coarse category fields so app errors can be tied to session replay without leaking raw exception messages.
- Paywall upgrade funnel emits `upgrade_modal_shown` and `upgrade_modal_cta_clicked` from both upgrade surfaces, each tagged with a `surface` field (`free_audit_modal` for the post-free-audit modal, `onboarding_results` for the onboarding results paywall) plus a `recovery_amount`, so conversion can be measured per surface.
- Marketing leads link to their authenticated product user: the app derives the same deterministic lead distinct id as marketing and backend (`lead:{domain}:{sha256("capveri-lead:" + email)[:16]}`) and calls `posthog.alias('user:{id}', leadId)` at sign-in, merging pre-signup lead activity into the user person for first-touch revenue attribution.

### Guided Help System

- Authenticated route `/help` gives landlord users a task-based product help center.
- Persistent header help button opens a searchable `HelpDrawer` with contextual suggestions for dashboard, onboarding, ingestion, lease upload, reconciliation, dispute, export, billing, team, and tenant-help paths.
- Sidebar navigation includes `Help`; help CTAs send users to concrete next screens such as `/properties/new`, `/ingestion`, `/leases/upload`, `/reconciliations`, and `/tenant/help`.
- Copy defines unfamiliar terms near first use through inline help terms and tooltips, including general ledger export, RSF, BOMA area, gross-up, base year, caps, pro-rata share, pool mapping, variance, and finalization.
- Reusable help components: `HelpTip` for hover/focus explanations, `HelpTerm` for glossary terms in sentence copy, `FieldHelpLabel` for form labels with help affordances, `GuidedEmptyState` for "what to do next" empty states, and `FriendlyError` for nontechnical error recovery.
- Help data is structured by audience, route, difficulty, related topics, glossary terms, and primary actions so the app can recommend the next useful guide without hard-coding page-specific copy in the drawer.
- Ingestion, lease upload, property setup, and reconciliation pages now include plain-language guidance at high-risk points: picking a property, uploading GL/Excel files, mapping generic columns, understanding BOMA measurements, confirming lease terms, reviewing variances, calculating, finalizing, and exporting statements.

### PLG Onboarding Flow (Product-Led Growth)

- Zero-friction entry: marketing CTAs send users to `/onboard` with no upfront signup.
- Anonymous Supabase session created on `/onboard` load via `signInAnonymously()`.
- `POST /api/v1/onboard/init`: bootstraps org + user rows for anonymous user (idempotent, service role client, placeholder email `anon+{id8}@placeholder.capveri.com`).
- Concurrent `/onboard/init` calls recover by returning the existing user and cleaning up the losing bootstrap organization instead of leaving orphan org rows.
- A modeled sample result can be shown before setup through `/onboard?demo=1`; it is labeled as sample data, not a customer result. First-login zero-property accounts are sent to the sample once per account before the normal dashboard renders.
- 7-step wizard: Property → Leases → GL Data → Billing → Results → Email Capture → Set Password.
- Step-level analytics include `onboard_step_transitioned` with flow mode, sample-preview flag, current/previous step labels, direction, and elapsed milliseconds on the prior step.
- `POST /api/v1/leads/plg-signup`: captures email at step 6, stores to `content_leads` (slug `plg_free_audit`), syncs to Apollo.
- `PATCH /api/v1/onboard/upgrade`: promotes anon account after `supabase.auth.updateUser()` sets real email+password; updates `users.email` + `organizations.name`; sends welcome email.
- Upgrade verifies the real email against the authenticated Supabase Auth user before writing it to `users.email`.
- DB migration `20260228000001`: signup trigger early-returns when `NEW.email IS NULL` to avoid breaking anonymous users.
- Signup trigger (`handle_new_user_signup`) still handles standard email-first signups unchanged.
- Frontend: `useAnonSession` hook bootstraps anonymous session; `OnboardFlowContext` (PLG-scoped localStorage key `capveri_plg_{userId}` plus account-scoped sample-seen state for authenticated first-login previews); `OnboardFlowWizard` (7-step, no skip).
- Step components in `frontend/src/features/plg/steps/`: `EmailCaptureStep`, `SetPasswordStep`, `ResultsStep` (uses `GET /api/v1/leakage/:id?include_drafts=true` with glDataYear-derived period; shows a billing-mistake result or a clean check without a `$0` event).
- `AuthContext`: skips `fetchUserProfile` DB lookup for anonymous users (`session.user.is_anonymous === true`) — avoids 406 since no `users` row exists before `/onboard/init` bootstrap.
- Public route `/onboard` via `OnboardPage` (redirects real users to dashboard); legacy `/onboarding` redirects to `/onboard`.
- Marketing CTAs (`marketing/src/lib/auditLink.ts`) now point to `/onboard` instead of `/auth/register`.

### Onboarding Wizard

- Beginner guidance now appears directly in the product: dashboard checklist copy explains what each setup step means, upload screens answer what file is needed and where to find it, and lease upload includes a plain-language PDF guide.
- Reusable app help primitives live in `frontend/src/features/help/`: `HelpGuide`, `HelpTopic`, `HelpStep`, `HelpDrawer`, `HelpTopicCard`, `GuideCallout`, and `BeginnerFileGuide`.
- Multi-step new user flow: Welcome -> Add Property -> Add Unit -> Upload GL -> Actual Billed (optional) -> Leakage Results -> Completion.
- Context-managed progression tracking.
- Welcome step includes a security positioning card (encryption + RLS isolation) before data entry.
- Upload GL and Actual Billed steps render a shared trust panel with verified controls: TLS 1.3, AES-256, RLS isolation, and GL-not-to-AI guardrail.
- Getting Started checklist on dashboard (dismissible, persisted to localStorage). First-run checklist and sample surfaces keep the primary action on checking the user's own building rather than booking a setup call.
- Dashboard: `DashboardPage.tsx` with usage stats, reconciliation attention, tier-aware hero/action personalization, and source-specific money labels. Draft totals are shown as tenant totals to check; uploaded-billing totals are shown as bill amounts to check with over-bill and under-bill splits; cumulative finalized tenant billable still comes from `total_recovery_finalized`.
- Tier logic uses subscription state with free-tier fallback:
  - `free` (no subscription): Free Audit starter guidance
  - `essentials`: core ingest/reconcile/export workflow guidance
  - `professional`: portfolio-level FinOps workflow guidance

### Browser Notifications (Extraction Completion)

- `useNotificationPermission` hook: exposes `{ permission, requestPermission, isSupported }` based on the browser `Notification` API.
- `sendBrowserNotification(title, options)` utility: fires a native browser notification only when permission is `'granted'` AND `document.hidden` is `true` (user has navigated away). Sets `onclick` to `window.focus() + notification.close()`.
- `NotificationPrompt` component (`frontend/src/pages/extractions/NotificationPrompt.tsx`): renders a subtle banner on the Extractions page when permission is `'default'`. Calls `requestPermission()` and shows a `sonner` toast confirming grant or explaining how to enable if blocked.
- `ExtractionsPage` polling: on COMPLETED fires `toast.success` + `sendBrowserNotification`; on FAILED fires `toast.error` + `sendBrowserNotification`.
- Hook exported from `frontend/src/hooks/index.ts` barrel.

### Transactional Email Routing

- Resend-backed system emails now preserve per-scenario subjects/templates (no fallback to the welcome subject).
- Feedback form submissions notify `angel.campa@capveri.com` directly.
- Feedback creation remains successful even if email send fails; failures are logged server-side.

## Database Tables

### organizations

- `id` UUID PK, `name` TEXT, `subscription_status` enum, `settings` JSONB
- `billing_email`, `created_at`, `updated_at`
- RLS: org-scoped.

### users

- `id` UUID PK, `organization_id` FK, `role` enum (owner/admin/member/viewer/tenant)
- `email`, `first_name`, `last_name`, `is_platform_admin` BOOLEAN (migration 57)
- RLS: org-scoped.

### expense_pools

- `id` UUID PK, `property_id` FK, `name` VARCHAR(100), `pool_type` VARCHAR(20) CHECK (operating/tax/insurance/capital/other)
- `is_gross_up_applicable` BOOLEAN, `gross_up_target` NUMERIC(5,4), `description` VARCHAR(500)
- UNIQUE constraint: `(property_id, name)`
- RLS: org-scoped via properties join.

### pool_mappings

- `id` UUID PK, `expense_pool_id` FK, `gl_account_pattern` VARCHAR(50)
- `allocation_percentage` NUMERIC(5,4) CHECK (0-1), `priority` INTEGER CHECK (>= 0)
- RLS: org-scoped via expense_pools -> properties join.

### pool_templates

- Pre-built pool configurations. Created in migration 29.

### pool_allocations

- Pool-level allocation tracking. Created in migration 28.

### pool_hierarchy

- Parent/child pool relationships. Created in migration 27.

### team_member_invitations

- Email token invitations with role and expiry. Created in migration 56.

## Key Files

- `backend/app/auth/dependencies.py` — Auth type aliases and dependency injection
- `backend/app/api/v1/expense_pools.py` — Expense pool CRUD endpoints
- `backend/app/api/v1/pool_mappings.py` — GL pattern -> pool mapping endpoints
- `backend/app/api/v1/pool_templates.py` — Pool template endpoints
- `backend/app/api/v1/organization.py` — Org usage and settings endpoints
- `backend/app/api/v1/team/` — Team invitation endpoints
- `backend/app/services/pools/` — `auto_setup.py`, `template_service.py`, `copy_service.py`
- `backend/app/services/team_invitation.py` — Invitation service
- `frontend/src/pages/settings/` — Billing, OrganizationPage, ProfilePage, TeamMembersPage
- `frontend/src/pages/DashboardPage.tsx` — Dashboard with onboarding checklist
- `docs/architecture/rbac-permissions.md` — Full RBAC documentation
- `docs/architecture/tenant-portal-architecture.md` — Tenant role portal design
- `supabase/migrations/` — 20240101000001 (orgs), 000002 (users), 000008 (pools), 000009 (mappings), 000027 (hierarchy), 000028 (allocations), 000029 (templates), 000056 (team invitations)
