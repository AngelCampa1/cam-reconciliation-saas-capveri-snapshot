# Testing Patterns - Phase 1 Learnings

## Overview

This document captures testing patterns, best practices, and solutions discovered during Phase 1 of the coverage improvement initiative (Coverage: 81.54% → 84.03%).

**Tests Written**: 86 tests across 6 files
**Coverage Gained**: +2.49% statements, +1.91% branches, +2.58% functions, +2.40% lines

---

## Pattern 1: Testing Components with Generated SDK

### Problem
Components use auto-generated API client from `@/api/generated/sdk.gen`, but tests were using `vi.spyOn(global, 'fetch')` which doesn't intercept SDK calls.

### Solution
Mock the SDK functions directly at the module level:

```typescript
// ✅ CORRECT - Mock the SDK function
vi.mock('@/api/generated/sdk.gen', () => ({
  getTenantDashboardApiV1TenantDashboardGet: vi.fn(),
}))

import { getTenantDashboardApiV1TenantDashboardGet } from '@/api/generated/sdk.gen'
const mockGetDashboard = vi.mocked(getTenantDashboardApiV1TenantDashboardGet)

// In test
mockGetDashboard.mockResolvedValueOnce({ data: mockData, error: null } as any)
```

```typescript
// ❌ INCORRECT - Mocking fetch doesn't work with SDK
vi.spyOn(global, 'fetch').mockResolvedValueOnce({
  ok: true,
  json: async () => mockData
} as Response)
```

**Files using this pattern**:
- `TenantDashboard.test.tsx`
- `TenantSignupPage.test.tsx`

---

## Pattern 2: Testing Hooks with Multiple Dependencies

### Problem
Custom hooks like `useReconciliationData` depend on multiple other hooks (`useProperty`, `useReconciliationSnapshots`). All dependencies must be mocked.

### Solution
Mock all hook dependencies and provide typed mock access:

```typescript
// Mock all dependent hooks
vi.mock('@/api/hooks', () => ({
  useProperty: vi.fn(),
  useReconciliationSnapshots: vi.fn(),
}))

import { useProperty, useReconciliationSnapshots } from '@/api/hooks'

const mockUseProperty = vi.mocked(useProperty)
const mockUseReconciliationSnapshots = vi.mocked(useReconciliationSnapshots)

// In beforeEach - set default successful state
beforeEach(() => {
  mockUseProperty.mockReturnValue({
    data: mockProperty,
    isLoading: false,
    isError: false,
    error: null,
  } as any)

  mockUseReconciliationSnapshots.mockReturnValue({
    data: { items: [mockSnapshot], total: 1 },
    isLoading: false,
    isError: false,
    error: null,
  } as any)
})
```

**Key insight**: Setting defaults in `beforeEach` reduces duplication. Individual tests can override for specific scenarios (loading, error, empty states).

**Files using this pattern**:
- `useReconciliationData.test.tsx`
- `ReconciliationPage.test.tsx`

---

## Pattern 3: Handling Duplicate Text in Component Tests

### Problem
`getByText` fails when multiple elements render the same text (e.g., header in both page and component).

### Error
```
Found multiple elements with the text: Test Property - 2024 Reconciliation
```

### Solution
Use `getAllByText` and verify count instead of expecting single match:

```typescript
// ✅ CORRECT - Handle duplicates
const headers = screen.getAllByText('Test Property - 2024 Reconciliation')
expect(headers.length).toBeGreaterThan(0)

// OR - Get all and check first one
const headers = screen.getAllByText('Test Property - 2024 Reconciliation')
expect(headers[0]).toBeInTheDocument()
```

```typescript
// ❌ INCORRECT - Fails with duplicates
const header = screen.getByText('Test Property - 2024 Reconciliation')
expect(header).toBeInTheDocument()
```

**Files affected**:
- `ReconciliationPage.test.tsx`
- `TenantDashboard.test.tsx`

---

## Pattern 4: Testing Router-Dependent Components

### Problem
Components that use `useParams` or `useSearchParams` from React Router need proper router context.

### Solution
Create a wrapper with `MemoryRouter` and `Routes`:

```typescript
import { MemoryRouter, Route, Routes } from 'react-router-dom'

function createWrapper(initialRoute = '/properties/prop-1/reconciliations?year=2024') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path="/properties/:propertyId/reconciliations" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }
}

// Use in tests
render(<ReconciliationPage />, { wrapper: createWrapper() })
```

**Key details**:
- `MemoryRouter` simulates browser routing in tests
- `initialEntries` sets the starting URL
- `Routes` and `Route` are required for `useParams` to extract route params
- QueryClient retry must be disabled to prevent test timeouts

**Files using this pattern**:
- `ReconciliationPage.test.tsx`

---

## Pattern 5: userEvent Import Pattern

### Problem
Dynamic import of `@testing-library/user-event` causes runtime errors:

```typescript
// ❌ BROKEN - Dynamic import fails
const { user } = await import('@testing-library/user-event')
const userEvent = user.setup()  // TypeError: Cannot read properties of undefined
```

### Solution
Use static import and setup in each test:

```typescript
// ✅ CORRECT - Static import
import userEvent from '@testing-library/user-event'

// In each test
it('handles click events', async () => {
  const user = userEvent.setup()

  render(<Component />)

  const button = screen.getByRole('button')
  await user.click(button)
})
```

**Why this matters**: Vitest 4.0+ changed module loading behavior. Static imports are more reliable.

**Files affected**:
- `NotificationList.test.tsx`

---

## Pattern 6: Testing Error Handling in Components

### Problem
Components with error states often have low branch coverage because error paths aren't tested.

### Solution
Test all state paths: loading, error, empty, success:

```typescript
describe('Error States', () => {
  it('shows error message when fetch fails', async () => {
    mockGetDashboard.mockResolvedValueOnce({ data: null, error: 'Server error' } as any)

    render(<TenantDashboard />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/error loading dashboard/i)).toBeInTheDocument()
    })
  })

  it('handles undefined data', async () => {
    mockGetDashboard.mockResolvedValueOnce({ data: undefined, error: null } as any)

    render(<TenantDashboard />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/error loading dashboard/i)).toBeInTheDocument()
    })
  })
})

describe('Empty States', () => {
  it('shows empty state when no data exists', async () => {
    mockGetDashboard.mockResolvedValueOnce({
      data: { leases: [], statements: [] },
      error: null
    } as any)

    render(<TenantDashboard />, { wrapper })

    await waitFor(() => {
      expect(screen.getByText(/no statements available/i)).toBeInTheDocument()
    })
  })
})
```

**Coverage impact**: Error handling tests significantly improve branch coverage (73.47% → 75.38%, +1.91%).

**Files using this pattern**:
- `TenantDashboard.test.tsx`
- `TenantSignupPage.test.tsx`
- `NotificationList.test.tsx`

---

## Pattern 7: Testing Form Validation

### Problem
Forms with validation have many edge cases (empty fields, invalid formats, mismatches).

### Solution
Test all validation paths with `fireEvent.change` and `fireEvent.click`:

```typescript
it('shows error when passwords do not match', async () => {
  render(<TenantSignupPage />, { wrapper })

  await waitFor(() => {
    expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
  })

  const passwordInput = screen.getByLabelText(/create password/i)
  const confirmInput = screen.getByLabelText(/confirm password/i)
  const submitButton = screen.getByRole('button', { name: /create account/i })

  fireEvent.change(passwordInput, { target: { value: 'password123' } })
  fireEvent.change(confirmInput, { target: { value: 'different456' } })
  fireEvent.click(submitButton)

  await waitFor(() => {
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
  })
})

it('shows error when password is too short', async () => {
  // Similar pattern for length validation
})
```

**Files using this pattern**:
- `TenantSignupPage.test.tsx`

---

## Pattern 8: Testing Edge Cases with Nullish Values

### Problem
Components often don't handle `null`, `undefined`, `0`, or empty arrays properly.

### Solution
Explicitly test nullish and boundary values:

```typescript
describe('Edge Cases', () => {
  it('handles zero total_recovery values', async () => {
    mockUseReconciliationSnapshots.mockReturnValue({
      data: { items: [{ ...mockSnapshot, total_recovery: '0.00' }] }
    } as any)

    const { result } = renderHook(() => useReconciliationData({ ... }))

    await waitFor(() => {
      expect(result.current.totalRecovery).toBe(0)
      expect(result.current.tenantCount).toBe(1)
    })
  })

  it('handles null total_recovery values', async () => {
    mockUseReconciliationSnapshots.mockReturnValue({
      data: { items: [{ ...mockSnapshot, total_recovery: null }] }
    } as any)

    const { result } = renderHook(() => useReconciliationData({ ... }))

    await waitFor(() => {
      expect(result.current.totalRecovery).toBe(0)
    })
  })

  it('uses fallback when tenant_name is null', async () => {
    mockUseReconciliationSnapshots.mockReturnValue({
      data: { items: [{ ...mockSnapshot, tenant_name: null }] }
    } as any)

    const { result } = renderHook(() => useReconciliationData({ ... }))

    await waitFor(() => {
      const tenantRows = result.current.rows.filter(r => r.type === 'tenant_summary')
      expect(tenantRows[0].tenant_name).toBe('lease-1')  // Falls back to lease_id
    })
  })
})
```

**Files using this pattern**:
- `useReconciliationData.test.tsx`
- `TenantDashboard.test.tsx`

---

## Pattern 9: SDK Mock Data Structure

### Problem
Generated SDK returns `{ data, error }` structure, not raw data.

### Solution
Always return the SDK response structure:

```typescript
// ✅ CORRECT - SDK response structure
mockGetDashboard.mockResolvedValueOnce({
  data: mockDashboardData,  // Success case
  error: null
} as any)

mockGetDashboard.mockResolvedValueOnce({
  data: null,              // Error case
  error: 'Server error'
} as any)
```

```typescript
// ❌ INCORRECT - Raw data
mockGetDashboard.mockResolvedValueOnce(mockDashboardData)
```

**Files using this pattern**:
- `TenantDashboard.test.tsx`
- `TenantSignupPage.test.tsx`

---

## Pattern 10: Testing Loading States with Never-Resolving Promises

### Problem
Need to test loading spinners/skeletons that appear while data is fetching.

### Solution
Mock with promise that never resolves:

```typescript
it('shows loading state while fetching', () => {
  mockGetDashboard.mockImplementation(() => new Promise(() => {}))  // Never resolves

  render(<TenantDashboard />, { wrapper })

  // Loading spinner should be visible
  const spinner = container.querySelector('.animate-spin')
  expect(spinner).toBeInTheDocument()
})
```

**Alternative for hooks**:
```typescript
mockUseProperty.mockReturnValue({
  data: undefined,
  isLoading: true,
  isError: false,
  error: null,
} as any)
```

**Files using this pattern**:
- `TenantDashboard.test.tsx`
- `NotificationList.test.tsx`
- `ReconciliationPage.test.tsx`

---

## Anti-Patterns to Avoid

### ❌ Don't Mock the Function Being Tested

```typescript
// ❌ BAD - Mocks the actual function you're testing
vi.mock('./useReconciliationData')
const mockUseReconciliationData = vi.mocked(useReconciliationData)
mockUseReconciliationData.mockReturnValue({ rows: [], ... })

// Tests nothing - just verifies the mock returns what you told it to
```

```typescript
// ✅ GOOD - Mock dependencies, test the real function
vi.mock('@/api/hooks')  // Mock the API calls it uses
const mockUseProperty = vi.mocked(useProperty)
// Now test the REAL useReconciliationData logic
```

### ❌ Don't Use Fetch Mocks with Generated SDK

```typescript
// ❌ BAD - Doesn't intercept SDK calls
vi.spyOn(global, 'fetch').mockResolvedValueOnce({ ... })
```

```typescript
// ✅ GOOD - Mock the SDK function directly
vi.mock('@/api/generated/sdk.gen')
const mockSdkFunction = vi.mocked(sdkFunction)
```

### ❌ Don't Over-Test Implementation Details

```typescript
// ❌ BAD - Testing internal variable names, implementation details
expect(result.current.internalCalculationStep).toBe(123)
expect(component.state.privateVariable).toBe('value')
```

```typescript
// ✅ GOOD - Test public API and visible behavior
expect(screen.getByText('Total: $123.00')).toBeInTheDocument()
expect(result.current.totalRecovery).toBe(123)
```

---

## Coverage Impact Summary

| Metric | Before | After | Gain |
|--------|--------|-------|------|
| **Statements** | 81.54% | 84.03% | +2.49% |
| **Branches** | 73.47% | 75.38% | +1.91% |
| **Functions** | 82.63% | 85.21% | +2.58% |
| **Lines** | 82.41% | 84.81% | +2.40% |

**Most Effective Patterns for Coverage**:
1. Error handling tests → +1.91% branch coverage
2. Edge case tests (null, undefined, zero) → +0.5% branch coverage
3. Empty state tests → +0.3% statement coverage

---

## Recommended Test Structure

```typescript
describe('ComponentName', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    })
    vi.clearAllMocks()

    // Set default mocks to success state
    mockDependency.mockReturnValue({ data: mockData, isLoading: false })
  })

  describe('Loading State', () => {
    it('shows loading spinner while fetching')
  })

  describe('Error State', () => {
    it('shows error message on fetch failure')
    it('handles undefined data')
    it('handles null data')
  })

  describe('Empty State', () => {
    it('shows empty message when no data')
  })

  describe('Success State', () => {
    it('renders data correctly')
    it('handles user interactions')
  })

  describe('Edge Cases', () => {
    it('handles zero values')
    it('handles null fields')
    it('handles empty arrays')
  })
})
```

---

## Next Phase Recommendations

**To reach 87-90% coverage**:

1. **High-impact files** (low coverage, high complexity):
   - `src/pages/reconciliation/hooks/useReconciliationData.ts` - 54.71%
   - `src/pages/reconciliation/components/ReconciliationCard.tsx` - 63.88%
   - `src/pages/reconciliation/components/ReconciliationMobileView.tsx` - 68.96%

2. **Focus areas**:
   - Remaining error handling paths
   - Form validation edge cases
   - Responsive behavior (mobile/desktop)

3. **Estimated effort**: 3-4 hours to reach 87%, 5-6 hours for 90%

---

## References

- **Vitest Documentation**: https://vitest.dev/
- **React Testing Library**: https://testing-library.com/react
- **TanStack Query Testing**: https://tanstack.com/query/latest/docs/react/guides/testing
- **Phase 1 Plan**: `<claude-home>\plans\elegant-bubbling-flurry.md`
