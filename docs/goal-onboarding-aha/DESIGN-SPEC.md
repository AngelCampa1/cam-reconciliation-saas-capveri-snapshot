# Onboarding Aha — Design Spec & Ledger

Goal: Curate an Apple/Jobs-grade onboarding so a complete novice (an 80-year-old who
has never used a computer) reaches the "aha!" moment fast. Aha = *"This found me real
money and I did nothing."*

## Strategy (from research + current-state map)

Today the money-found moment lives at **step 5 of 7**, behind property/lease/GL/billing
forms, with the sample path hidden behind a tiny link and rushed 800ms auto-advancing
shimmers. **Flip it.** Lead with a pre-run sample reconciliation that already found money,
in plain English, with big forgiving controls and no rush. Defer all setup until *after*
the user believes.

## North-star first 60 seconds

1. User hits `/onboard` (or the dashboard tour) → lands on a **Welcome screen that is the
   sample result itself**, already computed. No form. No upload. Big confident number.
2. Reveal **3 plain-English findings** (progressive disclosure) — what we caught and why,
   each with a dollar amount, one sentence each, no jargon.
3. One clear next action: **"Check my own building"**. Optional: keep exploring the sample.

## Design canon (must hold on every onboarding surface)

- **One decision per screen.** Exactly one primary action; everything else deferred.
- **Plain English, ~3rd-grade reading level.** No "GL", "pro-rata", "leakage",
  "reconciliation engine", "ingest", "denominator", "BOMA" in first-run copy. Explain in
  the user's words. All persuasive copy passes `humanizer` → `third-grade-copy` before done.
- **Big forgiving controls.** Large pill buttons (canon: `rounded-full`), generous spacing,
  obvious affordances, clear Back, no penalty for mistakes.
- **No rush.** Remove auto-advancing timers. The user clicks when ready.
- **No dead ends.** Every empty state explains the area and offers one action (sample first).
- **Celebrate the finding, not the upload.** A brief confident moment, not confetti spam.
- **Human help is visible.** "Not sure? Talk to a person / book a setup call."

## Sample data (single source of truth)

Property: **Westview Retail Center**. Total found for tenants: **$14,820** (money tenants
were not charged — the landlord can still collect it).

Three findings (plain English, no jargon):
1. **Empty space wasn't counted — $8,400.** Half the building was empty. Each tenant's
   share should have been bigger.
2. **A big repair was charged all at once — $4,200.** Large fixes are spread over years,
   not billed in one year.
3. **A late tax bill was missed — $2,220.** The county sent a new tax bill after the
   books were closed.
(8,400 + 4,200 + 2,220 = 14,820.)

## Workstreams (disjoint file scopes)

### A — Sample-first front door (the aha)
Owns: `frontend/src/features/plg/OnboardFlowWizard.tsx`,
`frontend/src/features/plg/OnboardFlowContext.tsx`,
`frontend/src/features/plg/steps/ResultsStep.tsx`, new
`frontend/src/features/plg/steps/WelcomeSampleStep.tsx`.
- New Welcome screen = the pre-run sample result, shown FIRST by default (not a buried link).
- Hero: big number + one plain sentence; then progressive-disclosure of the 3 findings.
- Primary CTA "Check my own building" → starts the real-data path. Secondary: keep exploring.
- Enrich the demo ResultsStep to show the 3 findings (no longer a thin teaser).
- Remove the rushed auto-advance behavior reachable from this path.

### B — Form-steps copy + UX pass (no rush, plain words, big targets)
Owns: `frontend/src/features/onboarding/steps/AddPropertyStep.tsx`,
`AddLeasesStep.tsx`, `UploadFileStep.tsx`, `ActualBilledUploadStep.tsx`,
`frontend/src/features/onboarding/OnboardingProgress.tsx`.
- Plain-English headings/subtitles, inline "what is this" help where a term is unavoidable.
- Remove 800ms auto-advance shimmers; let the user proceed by clicking.
- Big targets, generous spacing, respect `prefers-reduced-motion`.

### C — Dashboard first-run + empty states
Owns: `frontend/src/components/dashboard/WelcomeCard.tsx`,
`GettingStartedChecklist.tsx`, `WelcomeTourOverlay.tsx`,
`frontend/src/components/EmptyState.tsx`, `frontend/src/pages/DashboardPage.tsx` (copy only).
- Outcome-anchored checklist (start with a win), plain words, human-help affordance.
- Empty states offer "See a sample" + one action; never a dead end.

## Gate before done
- Tests for impacted frontend pass (real output shown).
- `humanizer` → `third-grade-copy` on all new/changed user-facing copy.
- Review/fix cycles until nothing left to fix.

## Progress log
- (init) Spec written. Discovery complete (current-state map + research). Next: implement A/B/C.
- Workstream A implemented: sample-first Welcome front door (new WelcomeSampleStep + shared sampleResult constant), `flowStarted` gate in OnboardFlowContext, wizard renders Welcome instead of the step machine for new non-SSO users, demo ResultsStep enriched with the big number + 3 findings. Copy passed humanizer + third-grade-copy. Welcome/SSO tests green (one pre-existing AddLeasesStep test fails due to Workstream B's heading rename, out of scope).
- Workstream B implemented: plain-English copy pass on all 4 step components + OnboardingProgress (jargon explained inline with aria-describedby helpers; headings like "Tell us about your building", "Add your tenants", "Add your expense report", "What you charged your tenants"). Removed every demo 800ms auto-advance timer and both post-upload 1500ms auto-advances; users now click a pill button to proceed. Big forgiving pill controls (min-h 44px), prefers-reduced-motion respected (motion-reduce:transition-none). Copy passed humanizer + third-grade-copy. NOTE: OnboardFlowWizard.test.tsx:162 still asserts the old "Add Lease Data" heading (now "Add your tenants") — that test is in Workstream A scope and needs the matcher updated.
- Test-sync pass: updated 7 onboarding/dashboard test files to assert the new sample-first copy/behavior (no source changes) — OnboardingProgress labels (Building/Tenants/Costs/Charges), AddPropertyStep ("Save my building"/"How big is the building?"/sample-building Next), AddLeasesStep ("Add your tenants"/"Next"/"Add another tenant"/spaces-error/sample-tenants Next), UploadFileStep ("Pick a different file"), ActualBilledUploadStep ("Type the total"/"How much did you charge last year?"/"See my results"/tenants-error/sample-charges Next), and both OnboardFlowWizard suites (sample-first Welcome front door + flowStarted-gated step machine + "Add your tenants" heading). Converted every auto-advance assertion to an explicit click. Full impacted run green: 33 files / 317 tests; tsc --noEmit clean.
- Workstream C implemented: first-run dashboard now leads with one outcome and one next step. GettingStartedChecklist re-anchored to 4 outcome items (See money you can get back / Add your first building / Get your tenant letters / Add your other buildings), starting with a pre-checked quick win; progress bar, contiguous-prefix completion, localStorage dismissal, and the activation_completed analytics event all preserved. WelcomeCard + DashboardPage hero rewritten to "Find money your tenants still owe". WelcomeTourOverlay reduced to 3 plain-language steps with a "See a sample first" path. EmptyState presets (no buildings/leases/files/checks) rewritten to plain English with a "See a sample" secondary action where natural; preset props stay backward compatible. Human-help affordance ("Talk to a person", book-setup link) added to the checklist. Copy passed humanizer + third-grade-copy. Tests green (186 across dashboard/EmptyState/LeasesTab/DashboardPage); tsc --noEmit clean. LeasesTab.test.tsx empty-state assertions updated to match the new "Add a lease" preset label.
- Blocker fix (logged-in "see a sample" → checkout dead end): added a `?demo=1` sample-preview path so a logged-in user can view the read-only sample front door without being bounced to checkout. The param flows OnboardPage (skip redirect guard) → OnboardFlowWizard (read `searchParams`) → useAnonSession (becomes ready without redirect/init, storage scoped to the real user id) → OnboardFlowContent (force WelcomeSampleStep via a one-shot `samplePreviewInitRef` that resets stale `flowStarted` exactly once on mount, so the later "Check my own building" click still advances). All dashboard sample entry points (checklist, WelcomeCard tour, empty states, LeasesTab) deep-link `/onboard?demo=1`. Covered by new tests in useAnonSession.test.ts and both OnboardFlowWizard suites.
- Review cycle 1 + 2 (sub-agent reviewers on the diff): no blockers/majors; minors fixed — vendor-jargon line in EmptyState NoImports, friendly SOURCE_LABELS map in ActualBilledUploadStep (was showing raw "generic"/"yardi"), DashboardPage draft banner plain-worded, eslint-disable given an inline reason.
- Copy gates (mandatory): humanizer audit clean (no em dashes, no AI vocabulary, no copula avoidance) and third-grade-copy evaluate_copy.py PASS on every new copy block (FK grades ~ -1.8 to 4.3). The one evaluator "FAIL" on the CTA "Check my own building" is a false positive of its verb allowlist; "Check" is a concrete action verb a third grader knows and it mirrors the hero "We checked a sample building for you" — kept deliberately.
- Pre-merge gate green: tsc --noEmit clean, eslint --max-warnings 0 clean on all changed source files, full frontend suite 430 files / 6477 tests passing.
- Pre-merge code review (senior reviewer subagent, fresh context on the full diff): verdict "Ready to merge: Yes", no Critical/Important blockers. One Important hygiene finding — the old `demoMode`/`isDemoMode` walk-through is now entryless dead code (its trigger button was removed). Numbers can't drift (the dead ResultsStep demo branch and the live WelcomeSampleStep both import the shared sampleResult.ts constant), but the dead branches are removed for cleanliness rather than deferred.
- Dead-code removal: deleted `demoMode`/`startDemoMode`/`exitDemoMode`/`isDemoMode` branches and the `demo_mode_started` analytics event across OnboardFlowContext, OnboardFlowWizard, ResultsStep, the 4 onboarding step components, analytics.ts, and their tests. The new `samplePreview`/`?demo=1`/`flowStarted`/WelcomeSampleStep path is unaffected. Gate re-run green.
