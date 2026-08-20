# Landlord UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce time-to-aha-moment in the PLG wizard via demo mode, fix jargon-heavy copy, add a post-wizard "Continue Setup" dashboard card, and instrument the app with PostHog events so we can measure behavior.

**Architecture:** Demo mode is a `demoMode` flag stored in `PlgFlowData` (existing wizard state bag). Each step reads this flag and auto-advances after 800ms instead of waiting for user input. The Results step renders a hardcoded teaser when in demo mode. All other changes are additive: new components, new copy, new PostHog calls.

**Tech Stack:** React 19, TypeScript, Shadcn/UI, TanStack Query, posthog-js, Vitest

**Spec:** `docs/superpowers/specs/2026-04-25-landlord-ux-improvements-design.md`

**Note — Remind Me email feature (spec 1C) is a separate plan.** It requires a backend endpoint and email template and can ship independently. This plan covers: 1A (demo mode), 1B (copy polish), 1D (PostHog wizard), 2A (dashboard card), 2B (reconciliation empty state), 2C (PostHog authenticated app).

---

## File Map

**Create:**
- `frontend/src/components/dashboard/ContinueSetupCard.tsx` — new dashboard card for in-progress users
- `frontend/src/components/dashboard/ContinueSetupCard.test.tsx`

**Modify:**
- `frontend/src/features/plg/OnboardFlowContext.tsx` — add `demoMode` flag + `startDemoMode`/`exitDemoMode` actions
- `frontend/src/features/plg/OnboardFlowWizard.tsx` — demo button, demo banner, step labels, PostHog wizard events
- `frontend/src/features/plg/steps/ResultsStep.tsx` — demo teaser branch
- `frontend/src/features/onboarding/steps/AddPropertyStep.tsx` — demo auto-advance + PostHog
- `frontend/src/features/onboarding/steps/AddLeasesStep.tsx` — demo auto-advance + PostHog
- `frontend/src/features/onboarding/steps/UploadFileStep.tsx` — demo auto-advance + copy changes + PostHog
- `frontend/src/features/onboarding/steps/ActualBilledUploadStep.tsx` — demo auto-advance + PostHog
- `frontend/src/features/plg/steps/EmailCaptureStep.tsx` — PostHog
- `frontend/src/features/plg/steps/SetPasswordStep.tsx` — PostHog
- `frontend/src/pages/DashboardPage.tsx` — add ContinueSetupCard + PostHog dashboard_viewed
- `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx` — guided empty state
- `frontend/src/pages/reconciliation/ReconciliationPage.tsx` — PostHog reconciliation_page_viewed

---

## Task 1: Add `demoMode` to context

**Files:**
- Modify: `frontend/src/features/plg/OnboardFlowContext.tsx`

### Step 1.1 — Write the failing test

Add to `frontend/src/features/plg/OnboardFlowContext.test.tsx` (file already exists):

```tsx
it('startDemoMode sets demoMode to true in data', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <OnboardFlowProvider userId="test-user">{children}</OnboardFlowProvider>
  )
  const { result } = renderHook(() => useOnboarding(), { wrapper })

  act(() => result.current.startDemoMode())

  expect(result.current.state.data.demoMode).toBe(true)
})

it('exitDemoMode clears demoMode and resets to step 1', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <OnboardFlowProvider userId="test-user">{children}</OnboardFlowProvider>
  )
  const { result } = renderHook(() => useOnboarding(), { wrapper })

  act(() => result.current.startDemoMode())
  act(() => result.current.nextStep()) // advance to step 2
  act(() => result.current.exitDemoMode())

  expect(result.current.state.data.demoMode).toBe(false)
  expect(result.current.state.currentStep).toBe(1)
})
```

- [ ] **Step 1.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run src/features/plg/OnboardFlowContext.test.tsx
```
Expected: FAIL — `startDemoMode is not a function`

- [ ] **Step 1.3 — Add `demoMode` to `PlgFlowData` and context actions**

In `frontend/src/features/plg/OnboardFlowContext.tsx`:

```tsx
// In PlgFlowData interface — add:
export interface PlgFlowData extends OnboardingData {
  email?: string
  firstName?: string
  organizationName?: string
  emailCaptured?: boolean
  accountUpgraded?: boolean
  anonUserId?: string
  organizationId?: string
  leakage?: number
  demoMode?: boolean   // NEW
}

// In PlgFlowContextValue interface — add:
interface PlgFlowContextValue {
  // ...existing fields...
  startDemoMode: () => void   // NEW
  exitDemoMode: () => void    // NEW
}

// Inside OnboardFlowProvider, add these callbacks after setStepData:
const startDemoMode = useCallback(() => {
  setState((prev) => ({
    ...prev,
    currentStep: 1,
    maxReachedStep: 1,
    data: { ...prev.data, demoMode: true },
  }))
}, [])

const exitDemoMode = useCallback(() => {
  setState((prev) => ({
    ...prev,
    currentStep: 1,
    maxReachedStep: 1,
    data: { ...prev.data, demoMode: false },
  }))
}, [])

// Add to the value object:
const value: PlgFlowContextValue = {
  // ...existing fields...
  startDemoMode,
  exitDemoMode,
}
```

- [ ] **Step 1.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run src/features/plg/OnboardFlowContext.test.tsx
```
Expected: PASS

- [ ] **Step 1.5 — Commit**

```bash
git add frontend/src/features/plg/OnboardFlowContext.tsx frontend/src/features/plg/OnboardFlowContext.test.tsx
git commit -m "feat(plg): add demoMode flag and startDemoMode/exitDemoMode actions to OnboardFlowContext"
```

---

## Task 2: Demo button and banner in wizard

**Files:**
- Modify: `frontend/src/features/plg/OnboardFlowWizard.tsx`
- Test: `frontend/src/features/plg/__tests__/OnboardFlowWizard.test.tsx`

- [ ] **Step 2.1 — Write failing test**

In `frontend/src/features/plg/__tests__/OnboardFlowWizard.test.tsx`, add:

```tsx
it('shows Try with sample data button on step 1', async () => {
  // Render the wizard in a test with a mocked useAnonSession
  // The button should appear when currentStep === 1 and demoMode is falsy
  render(<OnboardFlowWizard />)
  expect(await screen.findByText(/try with sample data/i)).toBeInTheDocument()
})

it('shows demo mode banner when demoMode is active', async () => {
  render(<OnboardFlowWizard />)
  const demoBtn = await screen.findByText(/try with sample data/i)
  await userEvent.click(demoBtn)
  expect(screen.getByText(/demo mode/i)).toBeInTheDocument()
})
```

- [ ] **Step 2.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/features/plg/__tests__/OnboardFlowWizard.test.tsx"
```
Expected: FAIL

- [ ] **Step 2.3 — Add demo button and banner to `OnboardFlowWizard.tsx`**

In `OnboardFlowContent`, add the demo button above the step content on step 1, and a banner at the top when `demoMode` is active:

```tsx
function OnboardFlowContent({ ssoMode = false }: { ssoMode?: boolean }) {
  const navigate = useNavigate()
  const { state, prevStep, completeOnboarding, startDemoMode, exitDemoMode } = useOnboarding()
  const { currentStep, completed } = state
  const isDemoMode = Boolean(state.data.demoMode)

  const effectiveLabels = ssoMode ? STEP_LABELS.slice(0, 5) : STEP_LABELS

  useEffect(() => {
    if (ssoMode && currentStep > 5 && !completed) {
      completeOnboarding()
    }
  }, [ssoMode, currentStep, completed, completeOnboarding])

  useEffect(() => {
    if (completed) {
      navigate('/dashboard')
    }
  }, [completed, navigate])

  const renderStep = () => { /* unchanged */ }

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background">
      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
          Demo mode — you&apos;re viewing sample data.{' '}
          <button
            onClick={exitDemoMode}
            className="underline font-medium hover:no-underline"
          >
            Exit demo
          </button>
        </div>
      )}

      {/* Header */}
      <header className="border-b bg-background shadow-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <Logo size="sm" />
        </div>
      </header>

      {/* Step label */}
      <div className="container mx-auto px-4 pt-6 text-center text-sm text-muted-foreground">
        Step {currentStep} of {effectiveLabels.length}:{' '}
        {effectiveLabels[currentStep - 1]}
      </div>

      {/* Demo button — only on step 1, not in demo mode, not in sso mode */}
      {currentStep === 1 && !isDemoMode && !ssoMode && (
        <div className="container mx-auto px-4 pt-4 text-center">
          <button
            onClick={startDemoMode}
            className="text-sm text-primary underline hover:no-underline"
          >
            Try with sample data →
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <OnboardingProgress labels={effectiveLabels} />
        <div className="py-8">{renderStep()}</div>

        {!HIDE_BACK_STEPS.has(currentStep) && (
          <div className="mt-8 text-center">
            <Button variant="ghost" onClick={prevStep}>
              Back
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 2.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/features/plg/__tests__/OnboardFlowWizard.test.tsx"
```
Expected: PASS

- [ ] **Step 2.5 — Commit**

```bash
git add frontend/src/features/plg/OnboardFlowWizard.tsx frontend/src/features/plg/__tests__/OnboardFlowWizard.test.tsx
git commit -m "feat(plg): add demo mode button and banner to onboarding wizard"
```

---

## Task 3: Step labels and copy polish

**Files:**
- Modify: `frontend/src/features/plg/OnboardFlowWizard.tsx`
- Modify: `frontend/src/features/onboarding/steps/UploadFileStep.tsx`
- Modify: `frontend/src/features/onboarding/steps/AddPropertyStep.tsx`

These are text-only changes — no new tests needed (existing snapshot tests will update).

- [ ] **Step 3.1 — Update step labels in `OnboardFlowWizard.tsx`**

```tsx
// Replace:
const STEP_LABELS = [
  'Property',
  'Leases',
  'GL Data',
  'Billing',
  'Results',
  'Your Email',
  'Set Password',
]

// With:
const STEP_LABELS = [
  'Your Property',
  'Tenant Leases',
  'Expense Report',
  'Billed Amounts',
  'Results',
  'Your Email',
  'Set Password',
]
```

- [ ] **Step 3.2 — Update copy in `UploadFileStep.tsx`**

```tsx
// Replace header:
<h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
  Upload GL Data
</h2>
// With:
<h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
  Upload Your Expense Report
</h2>

// Replace subtitle:
<p className="text-muted-foreground">
  Upload a General Ledger export from Yardi, MRI, or any system. We
  accept CSV and Excel files.
</p>
// With:
<p className="text-muted-foreground">
  Upload the expense report for the year you&apos;re reconciling — the file
  your accountant calls a GL export. We accept CSV and Excel files.
</p>

// Replace GuideCallout body:
<GuideCallout title="What file do I need?">
  <p>
    Upload the expense report for the year you want to reconcile. This
    is usually called a general ledger or GL export. It should show
    account names, dates, descriptions, and dollar amounts.
  </p>
  <p>
    After you choose the file, CapVeri will read it and show what it
    detected before moving on.
  </p>
</GuideCallout>
// With:
<GuideCallout title="What file do I need?">
  <p>
    Export your expense report from Yardi, MRI, or your accounting
    system. It should have dates, account names, and dollar amounts —
    usually a CSV or Excel file. After you choose it, CapVeri will
    read it and confirm what it detected.
  </p>
</GuideCallout>
```

- [ ] **Step 3.3 — Update BOMA label in `AddPropertyStep.tsx`**

```tsx
// Replace:
<Label htmlFor="bomaStandardVersion">BOMA Standard Version</Label>
// With:
<Label htmlFor="bomaStandardVersion">
  BOMA Standard Version{' '}
  <span className="font-normal text-muted-foreground">(not sure? leave at 2024)</span>
</Label>
```

- [ ] **Step 3.4 — Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: no errors

- [ ] **Step 3.5 — Commit**

```bash
git add frontend/src/features/plg/OnboardFlowWizard.tsx \
        frontend/src/features/onboarding/steps/UploadFileStep.tsx \
        frontend/src/features/onboarding/steps/AddPropertyStep.tsx
git commit -m "copy: replace GL jargon with plain language in onboarding wizard"
```

---

## Task 4: Auto-advance steps 1–4 in demo mode

**Files:**
- Modify: `frontend/src/features/onboarding/steps/AddPropertyStep.tsx`
- Modify: `frontend/src/features/onboarding/steps/AddLeasesStep.tsx`
- Modify: `frontend/src/features/onboarding/steps/UploadFileStep.tsx`
- Modify: `frontend/src/features/onboarding/steps/ActualBilledUploadStep.tsx`

Each step gets the same pattern: if `demoMode` is true, show a shimmer overlay and auto-advance after 800ms.

- [ ] **Step 4.1 — Write failing test for AddPropertyStep demo mode**

In `frontend/src/features/onboarding/steps/AddPropertyStep.test.tsx` (create if needed), add:

```tsx
import { vi } from 'vitest'

it('auto-advances after 800ms when demoMode is true', async () => {
  vi.useFakeTimers()
  const nextStep = vi.fn()

  // Mock useOnboarding to return demoMode = true
  vi.mock('../OnboardingContext', () => ({
    useOnboarding: () => ({
      nextStep,
      setStepData: vi.fn(),
      state: { data: { demoMode: true } },
    }),
  }))

  render(<AddPropertyStep />)
  expect(nextStep).not.toHaveBeenCalled()
  vi.advanceTimersByTime(900)
  expect(nextStep).toHaveBeenCalledTimes(1)

  vi.useRealTimers()
})
```

- [ ] **Step 4.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/features/onboarding/steps/AddPropertyStep.test"
```
Expected: FAIL

- [ ] **Step 4.3 — Add demo auto-advance to `AddPropertyStep.tsx`**

Add this block right after the existing `useState` declarations, before the `handleSubmit` function:

```tsx
// Demo mode: auto-advance after 800ms
const isDemoMode = Boolean(state.data.demoMode)
useEffect(() => {
  if (!isDemoMode) return
  const timer = setTimeout(() => nextStep(), 800)
  return () => clearTimeout(timer)
}, [isDemoMode, nextStep])

if (isDemoMode) {
  return (
    <div className="mx-auto max-w-lg" data-testid="property-step">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Add Your First Property
        </h2>
        <p className="text-muted-foreground">Loading sample property…</p>
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-10 rounded-md bg-muted" />
        <div className="h-10 rounded-md bg-muted" />
        <div className="h-10 w-1/2 rounded-md bg-muted" />
      </div>
    </div>
  )
}
```

Also add `useEffect` to the imports at the top of `AddPropertyStep.tsx`.

- [ ] **Step 4.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/features/onboarding/steps/AddPropertyStep.test"
```
Expected: PASS

- [ ] **Step 4.5 — Add demo auto-advance to `AddLeasesStep.tsx`**

Add right after the `propertyId` const, before the `useLeases` call:

```tsx
const isDemoMode = Boolean(state.data.demoMode)
useEffect(() => {
  if (!isDemoMode) return
  const timer = setTimeout(() => nextStep(), 800)
  return () => clearTimeout(timer)
}, [isDemoMode, nextStep])

if (isDemoMode) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Tenant Leases
        </h2>
        <p className="text-muted-foreground">Loading sample leases…</p>
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-12 rounded-md bg-muted" />
        <div className="h-12 rounded-md bg-muted" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4.6 — Add demo auto-advance to `UploadFileStep.tsx`**

Add right after the existing `useState` declarations, before the drag handlers:

```tsx
const isDemoMode = Boolean(state.data.demoMode)
useEffect(() => {
  if (!isDemoMode) return
  const timer = setTimeout(() => nextStep(), 800)
  return () => clearTimeout(timer)
}, [isDemoMode, nextStep])

if (isDemoMode) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Upload Your Expense Report
        </h2>
        <p className="text-muted-foreground">Loading sample expense data…</p>
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-32 rounded-md bg-muted" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4.7 — Add demo auto-advance to `ActualBilledUploadStep.tsx`**

Add right after the `glDataYear` state declaration block, before `handleDragOver`:

```tsx
const isDemoMode = Boolean(state.data.demoMode)
useEffect(() => {
  if (!isDemoMode) return
  const timer = setTimeout(() => nextStep(), 800)
  return () => clearTimeout(timer)
}, [isDemoMode, nextStep])

if (isDemoMode) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Receipt className="h-8 w-8 text-primary" />
        </div>
        <h2 className="mb-2 text-lg md:text-xl lg:text-2xl font-bold">
          Billed Amounts
        </h2>
        <p className="text-muted-foreground">Loading sample billing data…</p>
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-32 rounded-md bg-muted" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4.8 — Run all frontend tests**

```bash
cd frontend && npm test -- --run
```
Expected: all pass

- [ ] **Step 4.9 — Commit**

```bash
git add frontend/src/features/onboarding/steps/AddPropertyStep.tsx \
        frontend/src/features/onboarding/steps/AddLeasesStep.tsx \
        frontend/src/features/onboarding/steps/UploadFileStep.tsx \
        frontend/src/features/onboarding/steps/ActualBilledUploadStep.tsx
git commit -m "feat(plg): auto-advance onboarding steps 1-4 in demo mode"
```

---

## Task 5: Demo teaser in ResultsStep

**Files:**
- Modify: `frontend/src/features/plg/steps/ResultsStep.tsx`
- Test: `frontend/src/features/plg/steps/ResultsStep.test.tsx`

- [ ] **Step 5.1 — Write failing test**

In `frontend/src/features/plg/steps/ResultsStep.test.tsx`, add:

```tsx
it('shows hardcoded demo teaser when demoMode is true', () => {
  vi.mock('../OnboardFlowContext', () => ({
    useOnboarding: () => ({
      nextStep: vi.fn(),
      setStepData: vi.fn(),
      exitDemoMode: vi.fn(),
      state: { data: { demoMode: true, propertyId: undefined } },
    }),
  }))

  render(<ResultsStep />)

  expect(screen.getByText('$14,820')).toBeInTheDocument()
  expect(screen.getByText(/westview retail center/i)).toBeInTheDocument()
  expect(screen.getByText(/start with my real data/i)).toBeInTheDocument()
  expect(screen.getByText(/continue/i)).toBeInTheDocument()
})
```

- [ ] **Step 5.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/features/plg/steps/ResultsStep.test"
```
Expected: FAIL

- [ ] **Step 5.3 — Add demo teaser branch to `ResultsStep.tsx`**

Add this block at the top of the `ResultsStep` component, right after the `useOnboarding()` destructure:

```tsx
export function ResultsStep() {
  const { nextStep, setStepData, state, exitDemoMode } = useOnboarding()
  const propertyId = state.data.propertyId as string | undefined
  const glDataYear = state.data.glDataYear as number | undefined
  const isDemoMode = Boolean(state.data.demoMode)
  // ... rest of existing state ...

  // Demo mode: show hardcoded teaser, skip API call
  if (isDemoMode) {
    return (
      <div className="mx-auto max-w-lg text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mb-2 text-xl font-bold">Your CAM Leakage Result</h2>
          <p className="text-muted-foreground text-sm">
            Sample property: Westview Retail Center
          </p>
        </div>

        <div className="mb-6 rounded-2xl border bg-card p-8 shadow-sm">
          <p className="text-4xl font-extrabold tabular-nums text-destructive">
            $14,820
          </p>
          <p className="mt-1 text-muted-foreground">
            Estimated annual leakage (8.3% of billed CAM)
          </p>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          This is sample data. Use your own files to see your actual numbers.
        </p>

        <div className="flex flex-col gap-3">
          <Button size="lg" className="w-full" onClick={nextStep}>
            Continue to create my account →
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full"
            onClick={exitDemoMode}
          >
            Start with my real data
          </Button>
        </div>
      </div>
    )
  }

  // ... rest of existing component unchanged ...
```

- [ ] **Step 5.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/features/plg/steps/ResultsStep.test"
```
Expected: PASS

- [ ] **Step 5.5 — Commit**

```bash
git add frontend/src/features/plg/steps/ResultsStep.tsx \
        frontend/src/features/plg/steps/ResultsStep.test.tsx
git commit -m "feat(plg): show hardcoded leakage teaser in results step during demo mode"
```

---

## Task 6: PostHog step instrumentation

**Files:**
- Modify: all 7 step files + `OnboardFlowWizard.tsx`

PostHog is imported directly: `import posthog from 'posthog-js'`. Each step fires `onboard_step_viewed` on mount and `onboard_step_completed` before calling `nextStep`. Demo mode fires its own events.

No unit tests for analytics calls — verified by checking Live Events in PostHog after deploy.

- [ ] **Step 6.1 — Add step instrumentation to `AddPropertyStep.tsx`**

Add at the top of `AddPropertyStep`, right after the `useState` blocks and before the demo guard:

```tsx
// Track step view
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 1, step_label: 'Your Property' })
}, [])
```

Wrap the `nextStep()` call in `handleSubmit` and `handleRentRollSuccess` and `handleSkip`:

```tsx
// In handleSubmit, replace nextStep() with:
posthog.capture('onboard_step_completed', { step: 1, step_label: 'Your Property', method: 'manual' })
nextStep()

// In handleRentRollSuccess, replace nextStep() with:
posthog.capture('onboard_step_completed', { step: 1, step_label: 'Your Property', method: 'rent_roll' })
nextStep()

// In handleSkip, replace nextStep() with:
posthog.capture('onboard_step_completed', { step: 1, step_label: 'Your Property', method: 'skipped' })
nextStep()
```

Add `import posthog from 'posthog-js'` at the top of the file.

- [ ] **Step 6.2 — Add step instrumentation to `AddLeasesStep.tsx`**

```tsx
import posthog from 'posthog-js'

// After existing useOnboarding destructure, add:
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 2, step_label: 'Tenant Leases' })
}, [])

// In handleContinue:
const handleContinue = () => {
  posthog.capture('onboard_step_completed', { step: 2, step_label: 'Tenant Leases', lease_count: leaseCount })
  setStepData('hasLeases', true)
  nextStep()
}
```

- [ ] **Step 6.3 — Add step instrumentation to `UploadFileStep.tsx`**

```tsx
import posthog from 'posthog-js'

// After existing state blocks, add:
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 3, step_label: 'Expense Report' })
}, [])

// In handleUpload, after setIsUploaded(true):
posthog.capture('onboard_step_completed', {
  step: 3,
  step_label: 'Expense Report',
  source_system: response.data.source_system,
  row_count: response.data.row_count,
})

// In handleSkip:
posthog.capture('onboard_step_completed', { step: 3, step_label: 'Expense Report', method: 'skipped' })
```

- [ ] **Step 6.4 — Add step instrumentation to `ActualBilledUploadStep.tsx`**

```tsx
import posthog from 'posthog-js'

// After existing state blocks:
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 4, step_label: 'Billed Amounts' })
}, [])

// In handleUpload after setIsUploaded(true):
posthog.capture('onboard_step_completed', { step: 4, step_label: 'Billed Amounts', method: 'file' })

// In handleManualSubmit after setIsUploaded(true):
posthog.capture('onboard_step_completed', { step: 4, step_label: 'Billed Amounts', method: 'manual' })

// In handleSkip:
posthog.capture('onboard_step_completed', { step: 4, step_label: 'Billed Amounts', method: 'skipped' })
```

- [ ] **Step 6.5 — Add step instrumentation to `ResultsStep.tsx`**

```tsx
import posthog from 'posthog-js'

// At top of component, after isDemoMode is set:
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 5, step_label: 'Results', demo_mode: isDemoMode })
}, [isDemoMode])

// In the demo branch CTAs:
// "Continue" button onClick:
onClick={() => {
  posthog.capture('demo_mode_completed', { converted_to_real: false })
  nextStep()
}}

// "Start with my real data" button onClick:
onClick={() => {
  posthog.capture('demo_mode_completed', { converted_to_real: true })
  exitDemoMode()
}}

// In the real data branch, wrap the "Continue →" onClick:
onClick={() => {
  posthog.capture('onboard_step_completed', { step: 5, step_label: 'Results', leakage: leakage })
  nextStep()
}}
```

- [ ] **Step 6.6 — Add demo_mode_started event in `OnboardFlowWizard.tsx`**

In the `startDemoMode` handler (the button onClick):

```tsx
onClick={() => {
  posthog.capture('demo_mode_started')
  startDemoMode()
}}
```

Add `import posthog from 'posthog-js'` at top of `OnboardFlowWizard.tsx`.

- [ ] **Step 6.7 — Add step instrumentation to `EmailCaptureStep.tsx` and `SetPasswordStep.tsx`**

In `EmailCaptureStep.tsx`, after component opens:
```tsx
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 6, step_label: 'Your Email' })
}, [])
```

In `SetPasswordStep.tsx`:
```tsx
useEffect(() => {
  posthog.capture('onboard_step_viewed', { step: 7, step_label: 'Set Password' })
}, [])
```

Add `import posthog from 'posthog-js'` in both files.

- [ ] **Step 6.8 — Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: no errors

- [ ] **Step 6.9 — Commit**

```bash
git add frontend/src/features/onboarding/steps/ \
        frontend/src/features/plg/steps/ \
        frontend/src/features/plg/OnboardFlowWizard.tsx
git commit -m "feat(analytics): add PostHog step instrumentation to PLG wizard"
```

---

## Task 7: ContinueSetupCard component

**Files:**
- Create: `frontend/src/components/dashboard/ContinueSetupCard.tsx`
- Create: `frontend/src/components/dashboard/ContinueSetupCard.test.tsx`

- [ ] **Step 7.1 — Write failing test**

Create `frontend/src/components/dashboard/ContinueSetupCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ContinueSetupCard } from './ContinueSetupCard'

function renderCard(props: Parameters<typeof ContinueSetupCard>[0]) {
  return render(
    <MemoryRouter>
      <ContinueSetupCard {...props} />
    </MemoryRouter>
  )
}

describe('ContinueSetupCard', () => {
  it('shows GL upload prompt when no pending reconciliations and no finalized', () => {
    renderCard({
      propertyName: 'Westview Center',
      propertyId: 'prop-1',
      pendingReconciliations: 0,
      lastReconciliation: null,
      totalRecoveryFinalized: 0,
    })
    expect(screen.getByText(/upload your expense report/i)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/ingestion')
  })

  it('shows reconciliation prompt when pending reconciliations exist', () => {
    renderCard({
      propertyName: 'Westview Center',
      propertyId: 'prop-1',
      pendingReconciliations: 1,
      lastReconciliation: null,
      totalRecoveryFinalized: 0,
    })
    expect(screen.getByText(/run your first reconciliation/i)).toBeInTheDocument()
  })

  it('shows draft prompt when last reconciliation is draft', () => {
    renderCard({
      propertyName: 'Westview Center',
      propertyId: 'prop-1',
      pendingReconciliations: 0,
      lastReconciliation: 'Draft - 2025',
      totalRecoveryFinalized: 0,
    })
    expect(screen.getByText(/review and finalize/i)).toBeInTheDocument()
  })

  it('returns null when already finalized', () => {
    const { container } = renderCard({
      propertyName: 'Westview Center',
      propertyId: 'prop-1',
      pendingReconciliations: 0,
      lastReconciliation: 'Finalized',
      totalRecoveryFinalized: 50000,
    })
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 7.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/components/dashboard/ContinueSetupCard.test"
```
Expected: FAIL — module not found

- [ ] **Step 7.3 — Create `ContinueSetupCard.tsx`**

Create `frontend/src/components/dashboard/ContinueSetupCard.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { ArrowRight, Upload, Calculator } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ContinueSetupCardProps {
  propertyName: string
  propertyId: string
  pendingReconciliations: number
  lastReconciliation: string | null
  totalRecoveryFinalized: number
}

export function ContinueSetupCard({
  propertyName,
  propertyId,
  pendingReconciliations,
  lastReconciliation,
  totalRecoveryFinalized,
}: ContinueSetupCardProps) {
  if (totalRecoveryFinalized > 0) return null

  const isDraft = lastReconciliation?.startsWith('Draft')

  let message: string
  let href: string
  let Icon: typeof Upload

  if (isDraft) {
    message = `Review and finalize your draft reconciliation for ${propertyName}`
    href = `/properties/${propertyId}/reconciliations`
    Icon = Calculator
  } else if (pendingReconciliations > 0) {
    message = `Run your first reconciliation for ${propertyName}`
    href = `/properties/${propertyId}/reconciliations`
    Icon = Calculator
  } else {
    message = `Upload your expense report for ${propertyName}`
    href = '/ingestion'
    Icon = Upload
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm font-medium">{message}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to={href}>
            Continue <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/components/dashboard/ContinueSetupCard.test"
```
Expected: PASS (4 tests)

- [ ] **Step 7.5 — Commit**

```bash
git add frontend/src/components/dashboard/ContinueSetupCard.tsx \
        frontend/src/components/dashboard/ContinueSetupCard.test.tsx
git commit -m "feat(dashboard): add ContinueSetupCard component for in-progress users"
```

---

## Task 8: Wire ContinueSetupCard into DashboardPage

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 8.1 — Write failing test**

In `frontend/src/pages/DashboardPage.test.tsx` (create if needed, or add to existing), add:

```tsx
it('shows ContinueSetupCard when user has a property but no finalized reconciliation', async () => {
  // Mock useDashboard to return a property with no reconciliation
  // Mock useSubscription and leakage summary
  // Verify "Upload your expense report" text appears
  server.use(
    http.get('*/api/v1/dashboard', () =>
      HttpResponse.json({
        property_count: 1,
        unit_count: 3,
        lease_count: 2,
        pending_reconciliations: 0,
        pending_verifications: 0,
        total_recovery_finalized: '0.00',
        recent_properties: [
          { id: 'prop-1', name: 'Westview Center', unit_count: 3, last_reconciliation: null },
        ],
      })
    )
  )

  render(<DashboardPage />, { wrapper: TestProviders })
  expect(await screen.findByText(/upload your expense report/i)).toBeInTheDocument()
})
```

- [ ] **Step 8.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/pages/DashboardPage.test"
```
Expected: FAIL

- [ ] **Step 8.3 — Modify `DashboardPage.tsx`**

Add import:
```tsx
import { ContinueSetupCard } from '@/components/dashboard/ContinueSetupCard'
import posthog from 'posthog-js'
```

Add a ref + `useEffect` for PostHog (inside `DashboardPage`) — the ref prevents duplicate fires on refetch:
```tsx
import { useRef } from 'react' // add to existing import if not present

// Inside DashboardPage, after the existing useState declarations:
const dashboardCaptured = useRef(false)
useEffect(() => {
  if (!isLoading && dashboard && !dashboardCaptured.current) {
    dashboardCaptured.current = true
    posthog.capture('dashboard_viewed', {
      property_count: dashboard.property_count,
      pending_reconciliations: dashboard.pending_reconciliations,
    })
  }
}, [isLoading, dashboard])
```

Add `ContinueSetupCard` after the existing `GettingStartedChecklist` block:
```tsx
{/* Continue Setup card — shown when user has a property but no finalized reconciliation */}
{!isNewUser &&
  parseFloat(dashboard?.total_recovery_finalized ?? '0') === 0 &&
  (dashboard?.recent_properties ?? []).length > 0 && (
    <ContinueSetupCard
      propertyName={dashboard!.recent_properties[0].name}
      propertyId={dashboard!.recent_properties[0].id}
      pendingReconciliations={dashboard?.pending_reconciliations ?? 0}
      lastReconciliation={dashboard!.recent_properties[0].last_reconciliation}
      totalRecoveryFinalized={parseFloat(dashboard?.total_recovery_finalized ?? '0')}
    />
  )}
```

- [ ] **Step 8.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/pages/DashboardPage.test"
```
Expected: PASS

- [ ] **Step 8.5 — Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): wire ContinueSetupCard and PostHog dashboard_viewed event"
```

---

## Task 9: Reconciliation list empty state

**Files:**
- Modify: `frontend/src/pages/reconciliation/ReconciliationsListPage.tsx`
- Test: `frontend/src/pages/reconciliation/ReconciliationsListPage.test.tsx`

- [ ] **Step 9.1 — Write failing test**

In `frontend/src/pages/reconciliation/ReconciliationsListPage.test.tsx`, add:

```tsx
it('shows guided empty state when no reconciliations and no properties', async () => {
  server.use(
    http.get('*/api/v1/reconciliation/snapshots', () =>
      HttpResponse.json({ data: [], count: 0 })
    ),
    http.get('*/api/v1/properties', () =>
      HttpResponse.json({ data: [], count: 0 })
    )
  )

  render(<ReconciliationsListPage />, { wrapper: TestProviders })
  expect(await screen.findByText(/no reconciliations yet/i)).toBeInTheDocument()
  expect(screen.getByText(/upload expense report/i)).toBeInTheDocument()
})
```

- [ ] **Step 9.2 — Run test to verify it fails**

```bash
cd frontend && npm test -- --run "src/pages/reconciliation/ReconciliationsListPage.test"
```
Expected: FAIL

- [ ] **Step 9.3 — Add empty state to `ReconciliationsListPage.tsx`**

Find the place in the component where the table renders (after loading and error states). Add an empty state branch before the table:

```tsx
// Add import at top:
import { Link } from 'react-router-dom'

// In the JSX, before the table, add:
{reconciliationGroups.length === 0 && !isLoading && (
  <Card>
    <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Calculator className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No reconciliations yet</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          To run your first reconciliation, you need a property with leases and
          an uploaded expense report.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="default">
          <Link to="/ingestion">Upload expense report →</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/properties">View properties →</Link>
        </Button>
      </div>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 9.4 — Run test to verify it passes**

```bash
cd frontend && npm test -- --run "src/pages/reconciliation/ReconciliationsListPage.test"
```
Expected: PASS

- [ ] **Step 9.5 — Commit**

```bash
git add frontend/src/pages/reconciliation/ReconciliationsListPage.tsx \
        frontend/src/pages/reconciliation/ReconciliationsListPage.test.tsx
git commit -m "feat(reconciliation): add guided empty state when no reconciliations exist"
```

---

## Task 10: PostHog instrumentation for authenticated app

**Files:**
- Modify: `frontend/src/pages/reconciliation/ReconciliationPage.tsx`
- Modify: `frontend/src/features/export/hooks/useGeneratePDF.ts`

No new tests — verified via PostHog Live Events.

- [ ] **Step 10.1 — Add `reconciliation_page_viewed` to `ReconciliationPage.tsx`**

```tsx
import posthog from 'posthog-js'
import { useEffect } from 'react' // if not already imported
import { useParams } from 'react-router-dom' // if not already imported

// Inside ReconciliationPage component:
const { propertyId } = useParams<{ propertyId: string }>()

useEffect(() => {
  posthog.capture('reconciliation_page_viewed', { property_id: propertyId })
}, [propertyId])
```

- [ ] **Step 10.2 — Add `export_generated` to `useGeneratePDF.ts`**

```tsx
import posthog from 'posthog-js'

// After a successful PDF generation (find the success branch), add:
posthog.capture('export_generated', { format: 'pdf' })
```

- [ ] **Step 10.3 — Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: no errors

- [ ] **Step 10.4 — Commit**

```bash
git add frontend/src/pages/reconciliation/ReconciliationPage.tsx \
        frontend/src/features/export/hooks/useGeneratePDF.ts
git commit -m "feat(analytics): add PostHog events for reconciliation page view and PDF export"
```

---

## Task 11: Final validation

- [ ] **Step 11.1 — Run full test suite**

```bash
cd frontend && npm test -- --run
```
Expected: all pass, coverage not below existing baseline

- [ ] **Step 11.2 — Run typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: no errors

- [ ] **Step 11.3 — Run format and lint**

```bash
cd frontend && npm run format && npm run lint:fix
```

- [ ] **Step 11.4 — Manual smoke test: demo mode flow**
1. Navigate to `/onboard`
2. Click "Try with sample data →"
3. Confirm demo banner appears
4. Confirm steps 1–4 auto-advance with shimmer states (~800ms each)
5. Confirm step 5 shows `$14,820` leakage and "Westview Retail Center"
6. Click "Start with my real data" — confirm wizard resets to step 1 with real forms
7. Open PostHog Live Events — confirm `demo_mode_started` and `demo_mode_completed` fired

- [ ] **Step 11.5 — Manual smoke test: dashboard card**
1. Log in as a user with at least one property but no finalized reconciliation
2. Confirm "Continue Setup" card appears with correct message and link
3. Finalize a reconciliation, refresh — confirm card disappears

- [ ] **Step 11.6 — Manual smoke test: reconciliation empty state**
1. Navigate to `/reconciliations` with no reconciliations
2. Confirm guided empty state renders with both buttons

- [ ] **Step 11.7 — Final commit**

```bash
git add -A
git commit -m "chore: final formatting pass for landlord UX improvements"
```
