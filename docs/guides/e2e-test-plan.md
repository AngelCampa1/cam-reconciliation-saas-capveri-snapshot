# CapVeri — End-to-End Test Plan

> **Last updated:** 2026-02-23
> **Framework:** Playwright (TypeScript)
> **Test directory:** `frontend/e2e/`
> **Run command:** `cd frontend && npx playwright test`

---

## Overview

This document maps every user journey to concrete E2E test cases. It records which tests already exist, which are missing, and what test data / setup each case requires.

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Test exists and passes |
| ⚠️ | Test exists but is fragile / partially skipped |
| ❌ | Test does not exist — needs to be written |
| 🔒 | Requires real credentials / live backend (cannot be mocked) |

---

## Test Infrastructure

### Fixtures & helpers

| File | Purpose |
|------|---------|
| `e2e/fixtures/index.ts` | Shared Playwright fixtures (authenticatedPage, testData) |
| `e2e/pages/login.page.ts` | LoginPage page-object model |
| `e2e/fixtures/yardi-gl-sample.csv` | Yardi GL fixture for upload tests |
| `e2e/fixtures/gl-2023.csv` / `gl-2024.csv` | Year-over-year comparison fixtures |
| `e2e/fixtures/pdfs/suite-*.pdf` | Lease PDF fixtures for extraction tests |
| `e2e/setup.ts` | Global setup (seed test user + data) |
| `e2e/global-teardown.ts` | Global teardown |
| `e2e/seed-test-data.ts` | Seeds property + lease + GL data for test org |
| `e2e/reset-test-user.ts` | Resets test user state between runs |

### Test accounts

| Account | Email | Role | Used for |
|---------|-------|------|---------|
| E2E Landlord | `e2e-test@capveri.com` | OWNER | All landlord journeys |
| E2E Tenant | `e2e-tenant@capveri.com` | TENANT | Tenant portal journeys |
| E2E Admin | `e2e-admin@capveri.com` | ADMIN | Team / admin journeys |

Test property pre-seeded: **"Test Plaza Shopping Center"** with one unit and one lease.

---

## Journey 1 — Authentication

**File:** `e2e/auth.spec.ts`
**Page objects:** `e2e/pages/login.page.ts`

### 1.1 Login & logout

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.1.1 | Unauthenticated user hitting `/dashboard` is redirected to `/login` | ✅ | |
| 1.1.2 | Login with valid credentials → lands on `/dashboard` or `/extractions` | ✅ | |
| 1.1.3 | Login with wrong password shows inline error, stays on `/login` | ✅ | |
| 1.1.4 | Logout clears session and redirects to `/login` | ✅ | Uses `data-testid="logout-button"` |
| 1.1.5 | Session persists across hard page refresh | ✅ | Checks localStorage supabase key |
| 1.1.6 | Token refresh fires 5 min before expiry (no logout mid-session) | ❌ | Needs fake timers / time manipulation |

### 1.2 Registration

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.2.1 | Register new org → redirects to `/extractions` | ✅ | Uses timestamp-unique email |
| 1.2.2 | Weak password shows `#password-error` | ✅ | |
| 1.2.3 | Mismatched confirm-password blocks submit | ❌ | Not yet written |
| 1.2.4 | Duplicate email shows server-side error | ❌ | |
| 1.2.5 | Welcome email is triggered (fire-and-forget POST `/api/v1/auth/welcome`) | ❌ | Mock email service, assert POST called |

### 1.3 Form validation

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.3.1 | Invalid email format triggers browser `validationMessage` | ✅ | |
| 1.3.2 | Empty password shows "password required" | ✅ | |
| 1.3.3 | Password visibility toggle (show / hide) | ✅ | |

### 1.4 OAuth

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.4.1 | Google button visible and clickable | ✅ | Cannot complete full OAuth in CI |
| 1.4.2 | `/auth/callback` with valid code → `/dashboard` | ✅ | Partial (page loads) |
| 1.4.3 | `/auth/callback?error=access_denied` shows error heading + Return to Login | ✅ | |

### 1.5 Protected routes

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.5.1 | Unauthenticated access to `/extractions` → `/login?returnUrl=/extractions` | ✅ | |
| 1.5.2 | After login, redirect back to original URL | ✅ | |
| 1.5.3 | Tenant user cannot access landlord routes (`/dashboard`) | ❌ | Role enforcement |
| 1.5.4 | Non-admin cannot access `/admin/feedback` | ❌ | |

### 1.6 Password management

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 1.6.1 | Forgot password form sends reset email | ✅ | Checks "check your email" message |
| 1.6.2 | Change password (current + new + confirm) | ✅ | Restores password after test |

---

## Journey 2 — Onboarding Wizard

**File:** `e2e/journey-01-onboarding.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 2.1 | New signup → wizard auto-starts at `/onboarding` | ❌ | Wizard not yet fully wired |
| 2.2 | Step 1 (Welcome) → click Next | ❌ | |
| 2.3 | Step 2 (Add Property) → fill BOMA fields → save | ❌ | |
| 2.4 | Step 3 (Upload GL) → upload CSV → continue | ❌ | |
| 2.5 | Step 4 (Upload Actual Billed) → upload → continue | ❌ | |
| 2.6 | Step 5 (Leakage Results) → shows estimates | ❌ | |
| 2.7 | Step 6 (Complete) → "Go to Dashboard" lands on `/dashboard` | ❌ | |
| 2.8 | Skip button at any step → lands on `/dashboard` | ❌ | |
| 2.9 | Browser back during wizard returns to previous step | ❌ | |
| 2.10 | Full onboarding → property + unit + lease + GL created | ⚠️ | Covered in `journey-01-onboarding.spec.ts` but hits real API; unit modal has known timing bug |

**Known issue:** Unit modal does not always open due to React state timing. Test falls back with `console.log('⚠️ Unit modal did not open')` and skips unit creation.

---

## Journey 3 — Property Management

**File:** `e2e/properties.spec.ts`, `e2e/properties/properties-integration.spec.ts`

### 3.1 CRUD

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 3.1.1 | Create property with all BOMA fields → saved → detail page | ✅ | `journey-01-onboarding` step 2 |
| 3.1.2 | Required field validation (postal_code, total_rentable_sqft) | ❌ | |
| 3.1.3 | Edit property name → saved | ❌ | |
| 3.1.4 | Delete property → removed from list | ❌ | |
| 3.1.5 | Property list paginated (> 10 records) | ❌ | |

### 3.2 Units

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 3.2.1 | Add unit via modal on property detail | ⚠️ | Timing bug in modal open |
| 3.2.2 | Unit appears in table after creation | ✅ | Uses `data-testid="cell-0_unit_number"` |
| 3.2.3 | Edit unit sqft | ❌ | |
| 3.2.4 | Delete unit | ❌ | |

---

## Journey 4 — Lease Management

**File:** `e2e/journey-01-onboarding.spec.ts` (step 4), `e2e/journey-02-ai-lease.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 4.1 | Create lease with tenant name, dates, recovery profile | ✅ | Step 4 in journey-01 |
| 4.2 | Recovery profile: pro-rata share (decimal format) | ✅ | |
| 4.3 | Recovery profile: admin fee | ✅ | |
| 4.4 | Recovery profile: CAP (non-cumulative) | ❌ | |
| 4.5 | Recovery profile: cumulative cap | ❌ | |
| 4.6 | Recovery profile: base year exclusion | ❌ | |
| 4.7 | Recovery profile: stop-loss threshold | ❌ | |
| 4.8 | Upload lease PDF → AI extraction workflow | ⚠️ | `journey-02-ai-lease.spec.ts` |
| 4.9 | Bulk lease upload (Excel) | ❌ | |
| 4.10 | Lease detail page shows correct recovery terms | ❌ | |
| 4.11 | Edit lease dates | ❌ | |

---

## Journey 5 — Data Ingestion

**File:** `e2e/ingestion.spec.ts`

### 5.1 Yardi CSV

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 5.1.1 | Upload Yardi CSV → source auto-detected (95% confidence) | ✅ | Mocked |
| 5.1.2 | Skip column mapping (Yardi is known format) | ✅ | Mocked |
| 5.1.3 | 150 rows imported, preview displays | ✅ | Mocked |
| 5.1.4 | Import appears in history list | ✅ | Mocked |

### 5.2 Generic CSV

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 5.2.1 | Upload generic CSV → column mapping wizard shown | ✅ | Mocked |
| 5.2.2 | Map Account, Description, Date, Debit columns | ✅ | Mocked |
| 5.2.3 | Continue without mapping required fields → validation error | ✅ | Mocked |
| 5.2.4 | 50 rows imported after mapping | ✅ | Mocked |

### 5.3 MRI CSV

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 5.3.1 | Upload MRI CSV → detected as MRI with confidence | ❌ | No fixture exists yet |
| 5.3.2 | MRI auto-mapping succeeds | ❌ | |

### 5.4 Error handling

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 5.4.1 | Invalid file → `Import Errors` panel, row-level errors shown | ✅ | Mocked |
| 5.4.2 | File > 50MB → 413 error message | ✅ | Mocked |
| 5.4.3 | Network failure during upload → graceful error | ✅ | Route abort |
| 5.4.4 | Duplicate file (same hash) → rejected with message | ❌ | |

### 5.5 Accessibility

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 5.5.1 | File input has accessible label | ✅ | |
| 5.5.2 | Drag-and-drop zone has keyboard alternative | ✅ | |

---

## Journey 6 — CAM Reconciliation (Core Flow)

**File:** `e2e/reconciliation.spec.ts`, `e2e/journey-reconciliation-complete-calculation.spec.ts`

### 6.1 Full reconciliation workflow (🔒 live backend)

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 6.1.1 | Login → navigate to test property | ✅ | `journey-reconciliation-complete-calculation` |
| 6.1.2 | Upload Yardi GL data | ✅ | |
| 6.1.3 | Navigate to `/properties/:id/reconciliations` | ✅ | |
| 6.1.4 | Click Calculate → job starts | ✅ | |
| 6.1.5 | Poll until grid visible (max 60s) | ✅ | |
| 6.1.6 | Grid shows tenant rows with dollar amounts | ✅ | |
| 6.1.7 | Double-click cell → edit mode | ✅ | |
| 6.1.8 | Enter new value → optimistic update shows `$1,500` | ✅ | |
| 6.1.9 | Open Calculation Trace drawer | ⚠️ | Skips gracefully if not visible |
| 6.1.10 | Trace drawer shows calculation steps | ⚠️ | |
| 6.1.11 | Finalize → confirmation dialog → confirm | ✅ | |
| 6.1.12 | Post-finalize: cell double-click does NOT open edit mode | ✅ | Immutability check |
| 6.1.13 | Export → PDF download initiates | ⚠️ | |

### 6.2 Reconciliation unit tests (mocked)

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 6.2.1 | "No Reconciliation Data" state shown for new property | ✅ | `journey-01-onboarding` step 6 |
| 6.2.2 | Calculate button triggers POST `/api/v1/reconciliation` | ❌ | Assert request made |
| 6.2.3 | Error during calculation shows toast | ❌ | Mock 500 response |
| 6.2.4 | Grid keyboard navigation (Tab, Arrow keys) | ❌ | `epic-12 story-12.6` |
| 6.2.5 | Expense pool grouping rows collapse/expand | ❌ | `epic-12 story-12.7` |
| 6.2.6 | Tenant summary view toggle | ❌ | `epic-12 story-12.8` |
| 6.2.7 | Finalize button disabled when no snapshot exists | ❌ | |
| 6.2.8 | Finalize with unsaved cell edits → prompt to save first | ❌ | |

---

## Journey 7 — Document Extraction & Verification

**File:** `e2e/verification.spec.ts`, `e2e/journey-02-ai-lease.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 7.1 | Upload PDF on `/extractions` → status shows PENDING | ❌ | |
| 7.2 | Extraction completes → status shows READY_FOR_REVIEW | ❌ | |
| 7.3 | `/verify/:documentId` loads document + extracted data side by side | ⚠️ | `verification.spec.ts` partial |
| 7.4 | User approves extraction → status becomes VERIFIED | ❌ | |
| 7.5 | User corrects a field value → save → persisted | ❌ | |
| 7.6 | User rejects extraction → status becomes REJECTED | ❌ | |
| 7.7 | AI extraction shows zero-data-retention indicator | ❌ | UX requirement |

---

## Journey 8 — Leakage Analysis

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 8.1 | Navigate to `/leakage` → select property and period | ❌ | |
| 8.2 | Submit → leakage analysis results shown by expense pool | ❌ | |
| 8.3 | "Claim Recovery" creates audit request | ❌ | |
| 8.4 | Total leakage summary displayed across all properties | ❌ | |

---

## Journey 9 — Analysis & Reports

**File:** `e2e/year-over-year.spec.ts`, `e2e/export.spec.ts`, `e2e/export-real-files.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 9.1 | Year-over-year page loads with 2023 vs 2024 GL fixtures | ✅ | `year-over-year.spec.ts` |
| 9.2 | Variance columns show correct % change | ❌ | Assert computed values |
| 9.3 | Export options panel opens | ⚠️ | `export.spec.ts` |
| 9.4 | Excel export → `.xlsx` download initiated | ⚠️ | `export-real-files.spec.ts` |
| 9.5 | PDF batch export → `.pdf` download initiated | ⚠️ | |
| 9.6 | Export history list shows previous exports | ❌ | |

---

## Journey 10 — Tenant Portal

**No existing E2E specs — all are missing (❌)**

### 10.1 Tenant signup (invitation flow)

| # | Test case | Notes |
|---|-----------|-------|
| 10.1.1 | Valid token → `/tenant/signup` loads form | Needs test invitation token in seed |
| 10.1.2 | Set password → account created → session established | |
| 10.1.3 | Expired token shows error | |
| 10.1.4 | Already-used token shows error | |

### 10.2 Tenant login

| # | Test case | Notes |
|---|-----------|-------|
| 10.2.1 | Tenant user login → lands on `/tenant/dashboard` | |
| 10.2.2 | Landlord credentials rejected on `/tenant/login` | Role check |

### 10.3 Tenant dashboard

| # | Test case | Notes |
|---|-----------|-------|
| 10.3.1 | Dashboard shows list of reconciliation statements | |
| 10.3.2 | Statement shows tenant share amount and period | |
| 10.3.3 | Click statement → view full breakdown | |

### 10.4 Create dispute

| # | Test case | Notes |
|---|-----------|-------|
| 10.4.1 | `/tenant/disputes/new` → select statement → fill dispute form | |
| 10.4.2 | Upload supporting document | |
| 10.4.3 | Submit → dispute appears in list with OPEN status | |
| 10.4.4 | Landlord receives notification (assert backend webhook/email) | 🔒 |

### 10.5 View & track disputes

| # | Test case | Notes |
|---|-----------|-------|
| 10.5.1 | Dispute list shows status badges | |
| 10.5.2 | `/tenant/disputes/:id` shows landlord comments | |
| 10.5.3 | Status change from OPEN → IN_REVIEW reflects in UI | |

### 10.6 Email preferences

| # | Test case | Notes |
|---|-----------|-------|
| 10.6.1 | Toggle statement notifications off → saved | |
| 10.6.2 | Toggle dispute update emails off → saved | |

### 10.7 Notifications

| # | Test case | Notes |
|---|-----------|-------|
| 10.7.1 | `/tenant/notifications` shows NEW_STATEMENT entry | |
| 10.7.2 | Notification links to correct statement | |

---

## Journey 11 — Dispute Management (Landlord)

**No existing E2E specs — all are missing (❌)**

| # | Test case | Notes |
|---|-----------|-------|
| 11.1 | `/disputes` shows list with status filter | |
| 11.2 | Open dispute → `/disputes/:id` shows tenant's details | |
| 11.3 | Add response comment | |
| 11.4 | Change status to IN_REVIEW | |
| 11.5 | Resolve dispute → status becomes RESOLVED | |
| 11.6 | Tenant receives notification of status change | 🔒 |

---

## Journey 12 — Team Management

**No existing E2E specs — all are missing (❌)**

| # | Test case | Notes |
|---|-----------|-------|
| 12.1 | `/settings/team` lists existing members with roles | |
| 12.2 | Invite new member → email sent | Mock Resend |
| 12.3 | Invitation appears as pending in list | |
| 12.4 | Revoke invitation → removed from pending | |
| 12.5 | Accept invitation → `/team/signup?token=` creates account | 🔒 |
| 12.6 | Expired invitation token shows error on signup | |
| 12.7 | Remove team member (OWNER only) | |
| 12.8 | Change member role (ADMIN → MEMBER) | |

---

## Journey 13 — Billing & Subscription

**File:** `e2e/pricing-page-verification.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 13.1 | `/pricing` page loads all plan tiers | ✅ | `pricing-page-verification.spec.ts` |
| 13.2 | "Get Started" CTA navigates to `/checkout` | ❌ | |
| 13.3 | Stripe embedded form renders on `/checkout` | ❌ | Cannot mock Stripe in unit test easily |
| 13.4 | Post-checkout redirect to `/checkout/success` | ❌ | |
| 13.5 | `/settings/billing` shows plan name, next billing date | ❌ | |
| 13.6 | BillingWarningBanner visible when over building limit | ❌ | |
| 13.7 | `/settings/billing/invoices` lists past invoices | ❌ | |
| 13.8 | Invoice PDF download link works | ❌ | |
| 13.9 | Cancel subscription → confirmation dialog | ❌ | |
| 13.10 | Resume cancelled subscription | ❌ | |

---

## Journey 14 — Settings & Profile

**No existing E2E specs — all are missing (❌)**

| # | Test case | Notes |
|---|-----------|-------|
| 14.1 | Update first/last name on `/profile` → success toast | |
| 14.2 | Email change requires re-authentication | |
| 14.3 | Update org name on `/organization/settings` → saved | |
| 14.4 | `/admin/feedback` accessible only to ADMIN/OWNER | |

---

## Journey 15 — Public Pages & Free Tools

**File:** `e2e/public-pages.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 15.1 | `/` landing page loads without auth | ⚠️ | `public-pages.spec.ts` |
| 15.2 | Authenticated user hitting `/` → redirected to `/dashboard` | ❌ | |
| 15.3 | `/pricing` accessible without auth | ✅ | |
| 15.4 | `/tools` hub loads all 4 tool cards | ❌ | |
| 15.5 | `/tools/cam-leakage-estimator` accessible | ❌ | |
| 15.6 | `/tools/audit-risk-quiz` accessible | ❌ | |
| 15.7 | `/tools/cam-gross-up-calculator` accessible | ❌ | |
| 15.8 | Gated tool → email entry → rate-limit 1/day enforced | ❌ | |
| 15.9 | Lead capture POST `/api/v1/leads/capture` fires | ❌ | |
| 15.10 | `/download/thank-you` page renders after lead capture | ❌ | |
| 15.11 | Resource pages (`/resources/what-is-cam-reconciliation`, etc.) load | ❌ | |
| 15.12 | `/privacy`, `/terms`, `/cookies` render | ❌ | |
| 15.13 | `/contact` form submits | ❌ | |

---

## Journey 16 — Navigation & Layout

**File:** `e2e/navigation.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 16.1 | Sidebar links navigate to correct routes | ⚠️ | `navigation.spec.ts` |
| 16.2 | Mobile hamburger menu opens | ❌ | |
| 16.3 | Bottom navigation bar visible on mobile viewport | ❌ | |
| 16.4 | Header logo click → `/dashboard` | ❌ | |
| 16.5 | 404 page renders for unknown route | ❌ | |

---

## Journey 17 — Cross-cutting Concerns

### 17.1 Accessibility

**File:** `e2e/accessibility.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 17.1.1 | Login page passes axe-core scan | ✅ | `accessibility.spec.ts` |
| 17.1.2 | Dashboard passes axe-core scan | ⚠️ | |
| 17.1.3 | Forms keyboard navigable | ⚠️ | |

### 17.2 Design system

**File:** `e2e/design-tokens.spec.ts`, `e2e/theme-persistence.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 17.2.1 | Design tokens resolve to correct CSS values | ✅ | |
| 17.2.2 | Dark/light theme persists across reload | ✅ | `theme-persistence.spec.ts` |

### 17.3 Error recovery

**File:** `e2e/error-recovery.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 17.3.1 | API 500 → error boundary renders | ⚠️ | `error-recovery.spec.ts` |
| 17.3.2 | Network timeout → retry UI appears | ❌ | |
| 17.3.3 | Session expired mid-session → redirects to login | ❌ | |

### 17.4 Radix/Shadcn portals

**File:** `e2e/radix-select-portals.spec.ts`

| # | Test case | Status | Notes |
|---|-----------|--------|-------|
| 17.4.1 | Radix Select dropdown renders in portal correctly | ✅ | |
| 17.4.2 | Radix Dialog closes on Escape | ❌ | |

---

## Test Data Requirements

### Seed data (pre-test setup via `e2e/seed-test-data.ts`)

```
Organization: "E2E Test Org"
  └── User: e2e-test@capveri.com (OWNER)
  └── Property: "Test Plaza Shopping Center"
        total_rentable_sqft: 50,000
        target_occupancy: 0.95
        └── Unit: Suite 101 (2,500 sqft)
        └── Lease: Acme Corporation
              start: 2024-01-01 / end: 2026-12-31
              pro_rata_share: 0.05
              admin_fee: 0.15
        └── GL Batch: yardi-gl-sample.csv (2024)
  └── Tenant user: e2e-tenant@capveri.com (TENANT)
        linked to: Acme Corporation lease
```

### Fixture files

| File | Format | Rows | Used by |
|------|--------|------|---------|
| `fixtures/yardi-gl-sample.csv` | Yardi Voyager | 150 | Ingestion, reconciliation |
| `fixtures/gl-2023.csv` | Generic | ~100 | Year-over-year analysis |
| `fixtures/gl-2024.csv` | Generic | ~100 | Year-over-year analysis |
| `fixtures/pdfs/suite-101-lease.pdf` | PDF | — | AI extraction journey |
| `test-fixtures/generic-export.csv` | Generic | 50 | Ingestion column mapping |
| `test-fixtures/invalid-data.csv` | Invalid | 100 | Error handling |

---

## Prioritized Implementation Backlog

### P0 — Critical path (block release)

These test gaps directly cover the core paid product loop:

1. ❌ **6.2.3** — Error during reconciliation calculation shows toast
2. ❌ **5.3.1–5.3.2** — MRI CSV upload and detection
3. ❌ **10.1–10.5** — Entire tenant portal (no coverage at all)
4. ❌ **11.1–11.5** — Landlord dispute management
5. ❌ **4.4–4.7** — CAP types and stop-loss in recovery profile

### P1 — Required before GA

6. ❌ **13.2–13.4** — Checkout flow
7. ❌ **12.1–12.6** — Team invitations
8. ❌ **1.5.3–1.5.4** — Role-based route guards
9. ❌ **7.3–7.6** — Extraction approve/reject/edit
10. ❌ **2.1–2.9** — Onboarding wizard (currently no wizard coverage)

### P2 — Important but not blocking

11. ❌ **8.1–8.4** — Leakage analysis
12. ❌ **9.2** — Year-over-year variance values
13. ❌ **14.1–14.3** — Profile and org settings
14. ❌ **15.4–15.13** — Public tools and resource pages
15. ❌ **17.3.2–17.3.3** — Network timeout / expired session recovery

---

## Running Tests

```bash
# All E2E tests
cd frontend && npx playwright test

# Specific file
cd frontend && npx playwright test e2e/auth.spec.ts

# Journey tests only
cd frontend && npx playwright test e2e/journey-

# With UI mode
cd frontend && npx playwright test --ui

# Debug mode
cd frontend && npx playwright test --debug

# Single test by title
cd frontend && npx playwright test -g "should login with valid credentials"

# Run with real backend (live mode)
TEST_USER_EMAIL=e2e-test@capveri.com \
TEST_USER_PASSWORD=TestPassword123! \
cd frontend && npx playwright test e2e/journey-reconciliation-complete-calculation.spec.ts
```

### CI environment variables

```
TEST_USER_EMAIL          # E2E landlord account
TEST_USER_PASSWORD       # E2E landlord password
TEST_TENANT_EMAIL        # E2E tenant account
TEST_TENANT_PASSWORD     # E2E tenant password
PLAYWRIGHT_BASE_URL      # Default: http://localhost:5173
```

---

## Writing New Tests — Conventions

### File naming
```
e2e/journey-NN-<slug>.spec.ts      # Full journey tests (live backend)
e2e/<feature>.spec.ts              # Feature-scoped tests (mocked API)
```

### Mock vs live

- **Mock** API routes (via `page.route(...)`) for error cases, edge cases, and CI speed.
- **Live backend** for journey tests — they test the real integration. Mark with `🔒` in this doc.

### Test ID contract

All interactive elements tested by Playwright **must** have `data-testid` attributes. Do not rely on text content for element selection in journey tests — text changes with copy updates.

Required `data-testid` values:
```
user-menu-button          logout-button
property-card             page-header-title
unit-number-input         rentable-sqft-input
usable-sqft-input         unit-select
start-date-input          end-date-input
status-select             pro-rata-share-input
admin-fee-input           reconciliation-grid
grid-row                  editable-cell
calculation-trace-drawer  calculation-step
install-prompt
```

### Selectors priority order

1. `data-testid` attribute
2. ARIA role + name (`getByRole('button', { name: /Submit/i })`)
3. Label text (`getByLabel('Email')`)
4. CSS selector (last resort)

### Handling Radix/Shadcn portals

Radix components render into `document.body` portal — selectors scoped to parent containers will fail. Always use global `page.getByRole('option', { name: ... })` for Select options and `page.getByRole('dialog')` for modals.

### Waiting strategy

```typescript
// Good — wait for API to settle
await page.waitForLoadState('networkidle')

// Good — wait for specific UI state
await expect(page.locator('[data-testid="reconciliation-grid"]')).toBeVisible({ timeout: 10000 })

// Bad — arbitrary sleep
await page.waitForTimeout(3000)  // only use when polling async job status
```
