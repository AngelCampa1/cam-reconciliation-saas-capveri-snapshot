# Landlord UX Improvements — Design Spec

**Date:** 2026-04-25
**Scope:** PLG onboarding wizard (first-run experience) + core reconciliation workflow (post-onboarding)
**Motivation:** PostHog data shows 60% of users who sign up never complete step 2 of the onboarding wizard, with an average 6.3-day gap between signup and first upload. The authenticated app has zero behavioral tracking, leaving post-onboarding UX unmeasured.

---

## Context

The landlord journey has two critical phases:

1. **First-run (PLG wizard):** 7 steps — Property → Leases → GL Data → Billing → Results → Email → Password. Users stall because each step requires files or data they don't have on hand: BOMA version lookups, lease terms, GL exports from external systems. The aha moment (step 5: leakage result) is 6+ days away for most users.

2. **Core workflow (post-onboarding):** After the wizard, users land on the dashboard with no clear signal about what to do next. The Getting Started Checklist disappears once a property exists. The reconciliation flow requires 3+ clicks to reach. Nothing in the authenticated app fires PostHog events.

---

## Area 1: First-Run Experience (PLG Wizard)

### 1A — Demo Mode

**Goal:** Reduce time-to-aha-moment from 6+ days to under 2 minutes.

A **"Try with sample data →"** button is added at the top of step 1, visually above the property form. Clicking it activates demo mode:

- Sets `demoMode: true` in `OnboardFlowContext` state
- Steps 1–4 auto-advance with 1-second delays, showing a shimmer/progress state instead of the real forms
- A persistent top banner reads: **"Demo mode — you're viewing sample data"**
- Step 5 (Results) detects `demoMode` and renders a hardcoded teaser instead of hitting the API:
  - Amount: `$14,820`
  - Label: `Estimated annual leakage (8.3% of billed CAM)`
  - Sample property: `Westview Retail Center`
- Two CTAs at the bottom of step 5:
  - **"Start with my real data"** — clears `demoMode`, resets wizard to step 1
  - **"Continue to create my account"** — proceeds to email capture (step 6), demo context is discarded

No backend changes needed. The teaser result is frontend-only.

**Files to change:**
- `frontend/src/features/plg/OnboardFlowContext.tsx` — add `demoMode` flag to state
- `frontend/src/features/plg/OnboardFlowWizard.tsx` — render demo banner, wire demo button on step 1
- `frontend/src/features/plg/steps/ResultsStep.tsx` — branch on `demoMode` to render teaser
- `frontend/src/features/onboarding/steps/AddPropertyStep.tsx` — add demo mode button above tabs
- Steps 2–4: read `demoMode` from context and auto-advance when true

### 1B — Copy & Label Polish

No logic changes. Text-only updates:

| File | Location | Current | New |
|------|----------|---------|-----|
| `OnboardFlowWizard.tsx` | `STEP_LABELS[0]` | `"Property"` | `"Your Property"` |
| `OnboardFlowWizard.tsx` | `STEP_LABELS[2]` | `"GL Data"` | `"Expense Report"` |
| `OnboardFlowWizard.tsx` | `STEP_LABELS[3]` | `"Billing"` | `"Billed Amounts"` |
| `UploadFileStep.tsx` | Step header | `"Upload GL Data"` | `"Upload Your Expense Report"` |
| `UploadFileStep.tsx` | Step subtitle | `"Upload a General Ledger export…"` | `"Upload the expense report for the year you're reconciling — the file your accountant calls a GL export."` |
| `UploadFileStep.tsx` | GuideCallout body | Dense paragraph | `"Export your expense report from Yardi, MRI, or your accounting system. It should have dates, account names, and dollar amounts — usually a CSV or Excel file."` |
| `AddPropertyStep.tsx` | BOMA label | `"BOMA Standard Version"` | `"BOMA Standard Version (not sure? leave at 2024)"` |

### 1C — "Remind Me" Email Capture

**Goal:** Recapture the 60% of users who stall between steps 2 and 3.

After step 2 completes and before step 3 renders, if the user is anonymous (no email on session), show a dismissible inline card:

> **Don't have your files handy?**
> Enter your email and we'll send you a link to resume right here.
> [email input] [Send link button] [Dismiss ×]

Behavior:
- On submit: call a new backend endpoint `POST /api/v1/onboard/resume-link` with `{ email, step: 3, context: { propertyId, ... } }`. Backend sends a magic link email and stores the context server-side.
- On dismiss: hide card for the session, fire `resume_link_dismissed` to PostHog
- On submit success: fire `resume_link_sent` to PostHog, show confirmation text, auto-hide after 3s

**Files to change:**
- `frontend/src/features/plg/OnboardFlowWizard.tsx` — render `RemindMeBanner` between steps 2 and 3
- `frontend/src/features/plg/components/RemindMeBanner.tsx` — new component
- `backend/app/api/v1/onboard.py` — new `POST /resume-link` endpoint
- `backend/app/services/email/` — new resume link email template

### 1D — PostHog Step Instrumentation

Add to each wizard step (steps 1–7):

```ts
posthog.capture('onboard_step_viewed', { step: 1, step_label: 'Your Property' })
posthog.capture('onboard_step_completed', { step: 1, step_label: 'Your Property' })
```

Add to demo mode:
```ts
posthog.capture('demo_mode_started')
posthog.capture('demo_mode_completed', { converted_to_real: boolean })
```

**Files to change:**
- Each step file in `frontend/src/features/onboarding/steps/` and `frontend/src/features/plg/steps/`
- `frontend/src/features/plg/OnboardFlowWizard.tsx` — demo events

---

## Area 2: Core Reconciliation Workflow

### 2A — Dashboard "Continue Setup" Card

**Goal:** Give users a clear next action after the wizard, based on their property's actual state.

Add a persistent **"Continue Setup"** card that appears alongside (not replacing) the existing `GettingStartedChecklist`. The checklist already handles the zero-property state; the new card handles the in-progress state — when a user has at least one property but has not yet finalized a reconciliation. It disappears once `total_recovery_finalized > 0`. The card reads the existing `dashboard` API response — no new backend calls needed.

Priority logic (first matching state wins):

| Condition | Message | CTA href |
|-----------|---------|----------|
| Property exists, 0 GL imports | "Upload your expense report for [propertyName]" | `/ingestion` |
| GL imported, 0 reconciliations | "Run your first reconciliation for [propertyName]" | `/properties/[id]/reconciliations` |
| Reconciliation in draft | "Review and finalize your draft reconciliation" | `/properties/[id]/reconciliations` |
| Reconciliation finalized | Card hidden | — |
| No properties | Show existing checklist | — |

Uses `dashboard.recent_properties[0]` for the property name and ID. Reads `last_reconciliation` field for status.

**Files to change:**
- `frontend/src/pages/DashboardPage.tsx` — replace `GettingStartedChecklist` conditional with `ContinueSetupCard` for users who have properties but haven't finalized
- `frontend/src/components/dashboard/ContinueSetupCard.tsx` — new component

### 2B — Reconciliation List Empty State

When `/reconciliations` is visited with no reconciliations, replace the empty table with a guided state:

> **No reconciliations yet**
> To run your first reconciliation, you need a property with leases and an uploaded expense report.
> [Upload expense report →]  [View properties →]

**Files to change:**
- `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx` — add empty state branch

### 2C — PostHog Instrumentation (Authenticated App)

| Event | Where to fire | Properties |
|-------|--------------|------------|
| `dashboard_viewed` | `DashboardPage` mount | `{ property_count, pending_reconciliations }` |
| `gl_upload_completed` | `UploadFileStep.tsx` after success (alongside existing logger) | `{ source_system, row_count }` |
| `reconciliation_page_viewed` | `ReconciliationPage` mount | `{ property_id }` |
| `reconciliation_finalized` | Reconciliation status change to finalized | `{ property_id }` |
| `export_generated` | PDF export success | `{ tenant_count, format }` |

**Files to change:**
- `frontend/src/pages/DashboardPage.tsx`
- `frontend/src/features/onboarding/steps/UploadFileStep.tsx`
- `frontend/src/pages/reconciliation/ReconciliationPage.tsx`
- `frontend/src/features/export/hooks/useGeneratePDF.ts`

---

## Verification

1. **Demo mode:** Visit `/onboard`, click "Try with sample data", confirm auto-advance through steps 1–4, confirm teaser result at step 5, confirm "Start with my real data" resets wizard, confirm "Continue" proceeds to email step
2. **Copy changes:** Visually verify all label and copy changes in the wizard
3. **Remind Me banner:** Complete step 2, confirm banner appears on step 3 for anon users, submit email, confirm PostHog event fires
4. **Dashboard Continue Setup card:** Create a property without a reconciliation, confirm card appears with correct message and link
5. **Reconciliation empty state:** Visit `/reconciliations` with no data, confirm guided empty state renders
6. **PostHog events:** Use PostHog Live Events view to confirm all new events fire correctly during a test run through the full flow
7. **Tests:** `cd frontend && npm test` — all existing tests pass, new component tests added for `RemindMeBanner` and `ContinueSetupCard`
