# Self-Serve Funnel Redesign Implementation Plan

> **Status (2026-02-21):** ✅ System is now live. The self-serve funnel is fully implemented — users can sign up, upload a GL export, and see reconciliation results in under 60 seconds with no manual intervention. GTM docs updated to reflect instant/self-serve framing.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken self-serve funnel so boutique/small PMCs can go from marketing site → register → onboarding → see real leakage → convert, with zero manual intervention.

**Architecture:** Four independent fixes applied in order: (1) fix the Vercel SPA 404, (2) fix routing + CTA links, (3) clean up the contact page, (4) patch the onboarding leakage step to poll instead of blank. The reconciliation endpoint (`POST /api/v1/reconciliation/calculate`) already exists and is fully implemented — we just need to call it from the onboarding wizard.

**Tech Stack:** React 19 + React Router v6 + Vite + TypeScript (frontend), FastAPI + Python 3.11 (backend). No new dependencies needed.

---

## Context

The site is a Vite SPA deployed to Vercel. Vercel serves SPAs by routing all requests through `index.html`, but **only if you tell it to**. Without a `vercel.json` rewrite rule, any direct URL navigation to `/auth/register` (or any non-root path) returns a Vercel 404 — the browser requests the path, Vercel looks for a file, finds nothing, and errors.

The reconciliation endpoint that the leakage step needs already exists:
- `POST /api/v1/reconciliation/calculate` — accepts `{ property_id, period_start, period_end, force_recalculate }`, returns `{ job_id, status }` (HTTP 202)
- `GET /api/v1/leakage/{property_id}` — returns `{ has_reconciliation_data, leakage, ... }`

So the onboarding fix is: call the calculate endpoint after GL upload, then poll the leakage endpoint in the leakage step until `has_reconciliation_data` is true.

---

## Task 1: Fix the Vercel SPA 404

**Problem:** Direct navigation to any URL like `/auth/register`, `/onboarding`, `/pricing` returns a Vercel 404 because there's no `vercel.json` telling Vercel to serve `index.html` for all routes.

**Files:**
- Create: `frontend/vercel.json`

---

**Step 1: Create vercel.json**

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Step 2: Verify locally (manual)**

Run `cd frontend && npm run build && npx serve dist` then navigate directly to `http://localhost:3000/auth/register`. Should show the register page, not a 404.

**Step 3: Commit**

```bash
git add frontend/vercel.json
git commit -m "fix: add vercel.json SPA rewrite rule to fix /auth/* 404s"
```

---

## Task 2: Fix Email Signup Routing

**Problem:** After email signup, `RegisterPage.tsx` redirects to `/dashboard`, skipping onboarding. Social login correctly goes to `/onboarding`. We need to unify them.

**Files:**
- Modify: `frontend/src/pages/auth/RegisterPage.tsx:83-87`
- Test: `frontend/src/pages/auth/RegisterPage.test.tsx`

---

**Step 1: Write the failing test**

Open `frontend/src/pages/auth/RegisterPage.test.tsx`. Find the existing test for post-registration redirect. Add or update:

```typescript
it('redirects to /onboarding after successful email registration', async () => {
  // Arrange: mock auth to return a user on register
  mockRegisterUser.mockResolvedValueOnce(undefined)
  mockUseAuth.mockReturnValue({ user: mockUser, registerUser: mockRegisterUser })

  render(<RegisterPage />)

  // Act: fill form and submit
  await userEvent.type(screen.getByLabelText(/organization name/i), 'Test PMC')
  await userEvent.type(screen.getByLabelText(/work email/i), 'test@example.com')
  await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123')
  await userEvent.type(screen.getByLabelText(/confirm password/i), 'Password123')
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: /create account/i }))

  // Assert
  await waitFor(() => {
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding')
  })
})
```

**Step 2: Run test to confirm it fails**

```bash
cd frontend && npm test -- --testPathPattern=RegisterPage --no-coverage
```

Expected: FAIL — `mockNavigate` called with `/dashboard`, not `/onboarding`

**Step 3: Fix the redirect**

In `frontend/src/pages/auth/RegisterPage.tsx`, find lines 83-87:

```typescript
useEffect(() => {
  if (user) {
    navigate('/dashboard')    // ← change this
  }
}, [user, navigate])
```

Change to:

```typescript
useEffect(() => {
  if (user) {
    navigate('/onboarding')
  }
}, [user, navigate])
```

**Step 4: Run test to confirm it passes**

```bash
cd frontend && npm test -- --testPathPattern=RegisterPage --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/pages/auth/RegisterPage.tsx frontend/src/pages/auth/RegisterPage.test.tsx
git commit -m "fix: redirect to /onboarding after email registration"
```

---

## Task 3: Fix Marketing Site CTAs

**Problem:** All "Request Free Audit" and "Get Started" CTAs point to `/contact` (contact form) or `/register` (without `/auth/` prefix, which 404s). They all need to point to `/auth/register`.

**Files:**
- Modify: `frontend/src/components/landing/HeroSection.tsx:66`
- Modify: `frontend/src/components/landing/CTASection.tsx:54`
- Modify: `frontend/src/components/landing/LandingNav.tsx:151-152,232`
- Modify: `frontend/src/pages/Pricing.tsx:124,265`

There are no behaviorally complex changes here — just URL string replacements. No TDD needed; verify visually after.

---

**Step 1: Fix HeroSection**

In `frontend/src/components/landing/HeroSection.tsx` line 66, change:
```
/contact?source=hero&type=audit
```
to:
```
/auth/register?intent=audit
```

**Step 2: Fix CTASection**

In `frontend/src/components/landing/CTASection.tsx` line 54, change:
```
/contact?source=cta&type=audit
```
to:
```
/auth/register?intent=audit
```

**Step 3: Fix LandingNav (both desktop and mobile)**

In `frontend/src/components/landing/LandingNav.tsx` lines 151-152 and 232, change all occurrences of:
```
/contact?source=nav
```
to:
```
/auth/register?intent=audit
```

**Step 4: Fix Pricing page**

In `frontend/src/pages/Pricing.tsx`:

Line 124 — change:
```
/contact?source=pricing-bounty
```
to:
```
/auth/register?intent=audit
```

Line 265 — the `getStartedUrl` variable (around line 36) likely builds `/register?plan=growth&buildings=${buildingCount}`. Change to `/auth/register?plan=growth&buildings=${buildingCount}`.

Find the variable definition (search for `getStartedUrl` or `register?plan`) and update the base path from `/register` to `/auth/register`.

**Step 5: Verify (manual)**

```bash
cd frontend && npm run dev
```

Open http://localhost:5173 and click every CTA button. Confirm they all navigate to `/auth/register` (with appropriate query params). Check homepage hero, homepage ROI calculator, nav button, pricing page.

**Step 6: Run typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors

**Step 7: Commit**

```bash
git add frontend/src/components/landing/HeroSection.tsx \
        frontend/src/components/landing/CTASection.tsx \
        frontend/src/components/landing/LandingNav.tsx \
        frontend/src/pages/Pricing.tsx
git commit -m "fix: point all audit CTAs to /auth/register instead of /contact"
```

---

## Task 4: Remove Audit Card from Contact Page

**Problem:** The contact page has a "Free Revenue Audit" card in its sidebar implying manual audit submissions. With the self-serve model, this card is misleading and should be removed.

**Files:**
- Modify: `frontend/src/pages/company/Contact.tsx:403-411`

---

**Step 1: Remove the Free Revenue Audit card**

In `frontend/src/pages/company/Contact.tsx`, delete lines 403-411 (the entire `<Card>` block for "Free Revenue Audit"). The surrounding cards (Email Us, etc.) remain.

**Step 2: Verify visually**

```bash
cd frontend && npm run dev
```

Navigate to http://localhost:5173/contact. Confirm the "Free Revenue Audit" card is gone. The general contact form and other sidebar info should still be present.

**Step 3: Run typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors

**Step 4: Commit**

```bash
git add frontend/src/pages/company/Contact.tsx
git commit -m "fix: remove manual audit card from contact page"
```

---

## Task 5: Auto-Trigger Reconciliation After GL Upload

**Problem:** After uploading the GL file in onboarding step 4, the wizard advances to step 5 (leakage). But the leakage endpoint requires a finalized reconciliation snapshot. Without one, the leakage step shows nothing. Fix: kick off the reconciliation calculation in the background before advancing.

**Files:**
- Modify: `frontend/src/features/onboarding/steps/UploadFileStep.tsx:113-116`
- Modify: `frontend/src/features/onboarding/OnboardingContext.tsx` (add `reconciliationJobId` to state)
- Test: `frontend/src/features/onboarding/steps/UploadFileStep.test.tsx`

**Background:** The existing endpoint `POST /api/v1/reconciliation/calculate` accepts:
```json
{
  "property_id": "<uuid>",
  "period_start": "2025-01-01",
  "period_end": "2025-12-31",
  "force_recalculate": false
}
```
Returns `{ "job_id": "<uuid>", "status": "pending" }` (HTTP 202).

For onboarding, we use the previous full calendar year as the default period (most CAM reconciliations are done annually for the prior year). This is computed as: `period_start = Jan 1 of (current year - 1)`, `period_end = Dec 31 of (current year - 1)`.

---

**Step 1: Add `reconciliationJobId` to onboarding context**

In `frontend/src/features/onboarding/OnboardingContext.tsx`, find the `OnboardingData` interface and add:

```typescript
reconciliationJobId?: string
```

No other changes needed — the existing `updateData()` method handles storing it.

**Step 2: Write the failing test**

In `frontend/src/features/onboarding/steps/UploadFileStep.test.tsx`, add:

```typescript
it('triggers reconciliation after successful GL upload', async () => {
  // Arrange
  const mockUpload = vi.fn().mockResolvedValue({ import_batch_id: 'batch-123', source_system: 'generic', row_count: 50 })
  const mockReconcile = vi.fn().mockResolvedValue({ job_id: 'job-456', status: 'pending' })

  // mock both API calls
  vi.mocked(uploadFileApiV1IngestionUploadPost).mockImplementation(mockUpload)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ job_id: 'job-456', status: 'pending' })
  }) as any

  const { nextStep, updateData } = renderWithOnboardingContext(<UploadFileStep />, {
    propertyId: 'prop-123'
  })

  // Act: upload a file
  const file = new File(['col1,col2\n1,2'], 'gl.csv', { type: 'text/csv' })
  await userEvent.upload(screen.getByTestId('file-input'), file)
  await userEvent.click(screen.getByRole('button', { name: /upload/i }))

  // Assert: reconciliation was triggered
  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reconciliation/calculate'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

**Step 3: Run test to confirm it fails**

```bash
cd frontend && npm test -- --testPathPattern=UploadFileStep --no-coverage
```

Expected: FAIL — reconciliation endpoint not called

**Step 4: Add the reconciliation trigger to UploadFileStep**

In `frontend/src/features/onboarding/steps/UploadFileStep.tsx`, find the success block (around lines 100-116) where `nextStep()` is called after upload. Add the reconciliation trigger before the `setTimeout`:

```typescript
// After successful upload, trigger background reconciliation
if (data.propertyId) {
  const prevYear = new Date().getFullYear() - 1
  const periodStart = `${prevYear}-01-01`
  const periodEnd = `${prevYear}-12-31`

  try {
    const response = await fetch('/api/v1/reconciliation/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        property_id: data.propertyId,
        period_start: periodStart,
        period_end: periodEnd,
        force_recalculate: false,
      }),
    })
    if (response.ok) {
      const { job_id } = await response.json()
      updateData({ reconciliationJobId: job_id })
    }
  } catch {
    // Non-blocking — leakage step handles missing data gracefully
  }
}

// Auto-advance after a moment
setTimeout(() => {
  nextStep()
}, 1500)
```

The `try/catch` is intentional — if reconciliation fails to trigger, the leakage step already handles `has_reconciliation_data: false` with a graceful message. This is fire-and-forget.

**Step 5: Run test to confirm it passes**

```bash
cd frontend && npm test -- --testPathPattern=UploadFileStep --no-coverage
```

Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/features/onboarding/OnboardingContext.tsx \
        frontend/src/features/onboarding/steps/UploadFileStep.tsx \
        frontend/src/features/onboarding/steps/UploadFileStep.test.tsx
git commit -m "feat: auto-trigger reconciliation after GL upload in onboarding"
```

---

## Task 6: Add Polling State to Leakage Step

**Problem:** The leakage step fetches once on mount. If reconciliation is still running (just triggered in step 4), the fetch returns `has_reconciliation_data: false` and the user sees a blank/empty state. Fix: show a "processing" state with a spinner, poll every 5 seconds, timeout after 90 seconds.

**Files:**
- Modify: `frontend/src/features/onboarding/steps/LeakageResultStep.tsx:69-123`
- Test: `frontend/src/features/onboarding/steps/LeakageResultStep.test.tsx` (look for existing polling/loading tests or add new)

---

**Step 1: Write the failing test**

In `frontend/src/features/onboarding/steps/LeakageResultStep.test.tsx`, add:

```typescript
it('shows processing state and polls until reconciliation data is ready', async () => {
  vi.useFakeTimers()

  // First two calls: no reconciliation data yet
  // Third call: data ready
  global.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ has_reconciliation_data: false, has_gl_data: true, leakage: 0 }) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ has_reconciliation_data: false, has_gl_data: true, leakage: 0 }) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ has_reconciliation_data: true, has_gl_data: true, has_billing_data: true, leakage: 34200, leakage_pct: 12.5, capveri_calculated: 274200, actual_billed: 240000 }) }) as any

  renderWithOnboardingContext(<LeakageResultStep />, { propertyId: 'prop-123' })

  // Initially shows processing state
  expect(screen.getByText(/analyzing your cam data/i)).toBeInTheDocument()

  // After 5s poll
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(screen.getByText(/analyzing your cam data/i)).toBeInTheDocument()

  // After another 5s poll — data ready
  await act(async () => { vi.advanceTimersByTime(5000) })
  expect(screen.getByText(/\$34,200/)).toBeInTheDocument()
  expect(screen.queryByText(/analyzing your cam data/i)).not.toBeInTheDocument()

  vi.useRealTimers()
})

it('shows timeout fallback after 90 seconds without reconciliation data', async () => {
  vi.useFakeTimers()

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ has_reconciliation_data: false, has_gl_data: true, leakage: 0 })
  }) as any

  renderWithOnboardingContext(<LeakageResultStep />, { propertyId: 'prop-123' })

  await act(async () => { vi.advanceTimersByTime(90000) })

  expect(screen.getByText(/we'll email you results/i)).toBeInTheDocument()

  vi.useRealTimers()
})
```

**Step 2: Run tests to confirm they fail**

```bash
cd frontend && npm test -- --testPathPattern=LeakageResultStep --no-coverage
```

Expected: FAIL — no polling or timeout behaviour

**Step 3: Add polling state to LeakageResultStep**

In `frontend/src/features/onboarding/steps/LeakageResultStep.tsx`, replace the current fetch logic (lines 69-123) with this pattern:

```typescript
const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30000

// Replace single-fetch useEffect with polling useEffect
useEffect(() => {
  if (!propertyId) return

  let elapsed = 0
  let timeoutId: ReturnType<typeof setTimeout>

  const poll = async () => {
    try {
      const result = await fetchLeakage()  // keep existing fetchLeakage() function

      if (result?.has_reconciliation_data) {
        // Data ready — stop polling (fetchLeakage already sets state)
        return
      }
    } catch {
      // ignore, keep polling
    }

    elapsed += POLL_INTERVAL_MS
    if (elapsed >= POLL_TIMEOUT_MS) {
      setTimedOut(true)
      return
    }

    timeoutId = setTimeout(poll, POLL_INTERVAL_MS)
  }

  poll()

  return () => clearTimeout(timeoutId)
}, [propertyId])   // remove fetchLeakage from deps to avoid infinite loop
```

Add two new state variables at the top of the component (near existing `useState` calls):

```typescript
const [timedOut, setTimedOut] = useState(false)
```

Add a processing/loading section to the JSX. When `!leakageData?.has_reconciliation_data && !timedOut`, show:

```tsx
<div className="text-center py-8">
  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
  <p className="text-lg font-medium">Analyzing your CAM data...</p>
  <p className="text-sm text-muted-foreground mt-2">Usually takes a few seconds</p>
</div>
```

When `timedOut`, show:

```tsx
<div className="text-center py-8">
  <p className="text-lg font-medium">Still processing...</p>
  <p className="text-sm text-muted-foreground mt-2">
    We'll email you your results within 10 minutes.
  </p>
  <Button onClick={() => nextStep()} className="mt-4">Continue to Dashboard</Button>
</div>
```

`Loader2` is from `lucide-react` — already a project dependency.

**Step 4: Run tests to confirm they pass**

```bash
cd frontend && npm test -- --testPathPattern=LeakageResultStep --no-coverage
```

Expected: PASS

**Step 5: Run full frontend test suite**

```bash
cd frontend && npm test -- --no-coverage
```

Expected: all passing

**Step 6: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors

**Step 7: Commit**

```bash
git add frontend/src/features/onboarding/steps/LeakageResultStep.tsx \
        frontend/src/features/onboarding/steps/LeakageResultStep.test.tsx
git commit -m "feat: add polling state to leakage step — shows progress while reconciliation runs"
```

---

## Task 7: Remove "48 Hours" Copy — Replace With Instant Framing

**Problem:** The marketing site and onboarding copy says "Results in 48 hours" throughout. This was written for a human-assisted audit model. The automated reconciliation runs in 2-8 seconds. This copy makes the product look like a consulting service and will kill self-serve conversion — prospects may not sign up thinking they have to wait 2 days.

**Files:**
- Modify: `frontend/src/components/landing/HeroSection.tsx` — find "48 hours" stat
- Modify: `frontend/src/components/landing/HowItWorksSection.tsx` (or similar) — step 2 copy
- Modify: `frontend/src/pages/Pricing.tsx` — "Deliver findings within 48 hours"
- Modify: `frontend/src/pages/LandingPage.tsx` or its sub-components — any remaining "48 hours"

Search for all instances first, then replace.

No TDD needed — pure copy changes. Verify visually.

---

**Step 1: Find all "48 hours" occurrences**

```bash
cd frontend && grep -r "48 hours" src/ --include="*.tsx" -l
```

Note every file returned.

**Step 2: Replace all instances**

For each file found, replace the text:

| Old | New |
|-----|-----|
| `"Results in 48 hours"` | `"Results in minutes"` |
| `"Deliver findings within 48 hours"` | `"See results instantly"` |
| `"Results in 48 hours, no obligation"` | `"Results in minutes, no obligation"` |
| `"results within 48 hours"` (any variation) | `"results in minutes"` |

Also update the leakage step timeout fallback message (added in Task 6):

```tsx
// Change from:
<p>We'll email you your results within 10 minutes.</p>

// Change to:
<p>Something took longer than expected. Refresh the page or contact support.</p>
```

(With instant reconciliation, "we'll email you" no longer makes sense as a fallback. A refresh prompt is more appropriate.)

**Step 3: Verify visually**

```bash
cd frontend && npm run dev
```

Check homepage, pricing page, and onboarding flow. Confirm no "48 hours" text remains anywhere visible.

**Step 4: Grep to confirm no stragglers**

```bash
cd frontend && grep -r "48 hours" src/ --include="*.tsx"
```

Expected: no output.

**Step 5: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: no errors.

**Step 6: Commit**

```bash
git add -p  # stage only the copy files
git commit -m "fix: replace '48 hours' copy with instant framing across marketing site"
```

---

## Final Verification

```bash
cd frontend && npm run build
```

Expected: build succeeds with no errors.

Manual smoke test (deploy to staging or run locally):
1. Navigate directly to `https://capveri.com/auth/register` — should load register page (not 404)
2. Click "Request Free Audit" on homepage — should go to `/auth/register`
3. Register with email — should redirect to `/onboarding` (not `/dashboard`)
4. Complete onboarding steps 1-4, upload a GL file — reconciliation should auto-trigger
5. Reach step 5 — should see "Analyzing your CAM data..." spinner, then leakage result

---

## Summary of Changes

| File | Change |
|------|--------|
| `frontend/vercel.json` | New — SPA rewrite rule |
| `frontend/src/pages/auth/RegisterPage.tsx` | Line 85: `/dashboard` → `/onboarding` |
| `frontend/src/components/landing/HeroSection.tsx` | CTA URL fix |
| `frontend/src/components/landing/CTASection.tsx` | CTA URL fix |
| `frontend/src/components/landing/LandingNav.tsx` | CTA URL fix (×2) |
| `frontend/src/pages/Pricing.tsx` | CTA URL fix (×2) |
| `frontend/src/pages/company/Contact.tsx` | Remove Free Revenue Audit card |
| `frontend/src/features/onboarding/OnboardingContext.tsx` | Add `reconciliationJobId` field |
| `frontend/src/features/onboarding/steps/UploadFileStep.tsx` | Auto-trigger reconciliation after GL upload |
| `frontend/src/features/onboarding/steps/LeakageResultStep.tsx` | Polling state (2s interval, 30s timeout) + timeout fallback |
| `frontend/src/components/landing/` (multiple files) | Replace "48 hours" with instant framing |
| `frontend/src/pages/Pricing.tsx` | Replace "48 hours" with instant framing |
