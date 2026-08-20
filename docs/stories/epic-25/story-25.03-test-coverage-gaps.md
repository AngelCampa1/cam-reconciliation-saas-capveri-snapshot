# Story 25.3: Address Test Coverage Gaps to 95%

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 3 hours
**Dependencies**: None
**Status**: `pending`
**Priority**: P2

---

## User Story

As a **platform developer**, I want **test coverage to reach 95% on both backend and frontend** so that **we minimize bugs and maintain code quality**.

---

## Acceptance Criteria

- [ ] Backend coverage reaches 95.00% (currently 94.33%, gap -0.67%)
- [ ] Frontend coverage reaches 95.00% (currently 91.59%, gap -3.41%)
- [ ] All new tests use real logic, not excessive mocking
- [ ] Tests follow minimalist pattern (1-2x source file size, not 4-5x)
- [ ] Coverage report shows no critical uncovered code paths
- [ ] CI/CD pipeline passes with new coverage threshold

---

## Technical Specifications

### Current Coverage Status

**Backend**: 94.33% (Target: 95.00%, Gap: -0.67%)
```bash
cd backend
pytest --cov=app --cov-report=term-missing
```

**Frontend**: 91.59% (Target: 95.00%, Gap: -3.41%)
```bash
cd frontend
npm run test:coverage
```

### Backend Gap Analysis

**Estimated uncovered lines**: ~60-70 lines (0.67% of ~9,000 lines)

**Likely uncovered areas** (from Story 24.12 audit):
1. Error handling branches in extraction services
2. Edge cases in calculation engine
3. Webhook validation logic
4. File upload error paths
5. Admin-only endpoints

**Strategy**:
- Run coverage with `--cov-report=html` to identify specific gaps
- Focus on critical business logic (calculation, extraction)
- Skip trivial getters/setters if they exist
- Add tests for error paths and edge cases

### Frontend Gap Analysis

**Estimated uncovered lines**: ~340-350 lines (3.41% of ~10,000 lines)

**Likely uncovered areas**:
1. Error boundary fallback UI
2. Theme persistence edge cases
3. API retry logic
4. PDF viewer error states
5. Responsive UI breakpoint handling
6. Form validation error messages

**Strategy**:
- Run `npm run test:coverage` to generate HTML report
- Open `coverage/index.html` to identify specific gaps
- Add tests for user interaction paths
- Add tests for error states and loading states

---

## Implementation Plan

### Phase 1: Identify Coverage Gaps (30 min)

**Backend**:
```bash
cd backend
pytest --cov=app --cov-report=html --cov-report=term-missing
# Open htmlcov/index.html to see uncovered lines
```

**Frontend**:
```bash
cd frontend
npm run test:coverage
# Open coverage/index.html to see uncovered lines
```

**Create gap report**:
```markdown
## Coverage Gap Report

### Backend Uncovered Code
1. `app/api/v1/extraction.py:145-150` - document reader error handling
2. `app/services/calculation/caps.py:78-82` - Zero cap rate edge case
3. `app/api/v1/webhooks.py:55-60` - Invalid signature validation
...

### Frontend Uncovered Code
1. `src/components/ErrorBoundary.tsx:25-30` - Error fallback render
2. `src/features/reconciliation/hooks/useReconciliation.ts:88-95` - Network retry
3. `src/components/ui/dialog.tsx:42-48` - Portal mount edge case
...
```

### Phase 2: Add Backend Tests (60 min)

**Target**: Add 60-70 lines of test coverage

**Example - Webhook signature validation**:
```python
# tests/api/v1/test_webhooks.py
def test_stripe_webhook_invalid_signature(client):
    """Verify webhook rejects invalid Stripe signature."""
    payload = json.dumps({"type": "invoice.paid"})
    headers = {"Stripe-Signature": "invalid_signature"}

    response = client.post("/webhooks/stripe", data=payload, headers=headers)

    assert response.status_code == 400
    assert "Invalid signature" in response.json()["detail"]
```

**Example - Calculation edge case**:
```python
# tests/services/calculation/test_caps_edge_cases.py
def test_cumulative_cap_with_zero_rate():
    """Verify 0% cap rate means no increase allowed."""
    cap = CumulativeCap(base=Decimal("10000"), rate=Decimal("0.00"))
    actual = Decimal("12000")

    result = cap.calculate(actual_expenses=actual, prior_year=Decimal("10000"))

    assert result.billable == Decimal("10000")  # Capped at base
    assert result.excess == Decimal("2000")
```

### Phase 3: Add Frontend Tests (90 min)

**Target**: Add 340-350 lines of test coverage

**Example - Error boundary**:
```typescript
// src/components/ErrorBoundary.test.tsx
describe('ErrorBoundary', () => {
  it('renders error fallback when child throws', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('resets error state when retry clicked', () => {
    const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) throw new Error('Test error');
      return <div>Success</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
```

**Example - API retry logic**:
```typescript
// src/api/hooks.test.ts
describe('useReconciliation retry logic', () => {
  it('retries failed request up to 3 times', async () => {
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: mockReconciliation });

    const { result } = renderHook(() => useReconciliation('property-1'));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 retries and shows error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReconciliation('property-1'));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.current.error.message).toBe('Network error');
  });
});
```

### Phase 4: Verify Coverage (15 min)

**Run final coverage reports**:
```bash
# Backend
cd backend
pytest --cov=app --cov-report=term --cov-fail-under=95

# Frontend
cd frontend
npm run test:coverage -- --coverage.threshold.lines=95
```

**Expected output**:
```
Backend: 95.12% coverage ✅
Frontend: 95.34% coverage ✅
```

---

## Test Cases

### Coverage Verification Tests

```bash
# Backend - Must pass with 95% threshold
pytest --cov=app --cov-fail-under=95

# Frontend - Must pass with 95% threshold
npm test -- --coverage --coverageThreshold='{"global":{"lines":95}}'
```

### Regression Tests

- [ ] All existing tests still pass
- [ ] No decrease in coverage for previously covered files
- [ ] CI/CD pipeline passes with new threshold

---

## Definition of Done

- [ ] Backend coverage ≥ 95.00%
- [ ] Frontend coverage ≥ 95.00%
- [ ] Coverage report generated and reviewed
- [ ] All new tests follow minimalist pattern (no over-testing)
- [ ] All new tests use real logic (no excessive mocking)
- [ ] CI/CD updated with 95% threshold
- [ ] All tests pass locally and in CI
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Files to Create/Modify

**Backend** (~3-5 new test files):
- `tests/api/v1/test_webhooks_validation.py`
- `tests/services/calculation/test_caps_edge_cases.py`
- `tests/services/extraction/test_error_handling.py`

**Frontend** (~5-8 new test files):
- `src/components/ErrorBoundary.test.tsx`
- `src/features/reconciliation/hooks/useReconciliation.test.ts`
- `src/api/hooks.test.ts` (enhance existing)
- `src/components/ui/dialog.test.tsx` (enhance existing)

**CI/CD**:
- `.github/workflows/test.yml` - Update coverage threshold to 95%

---

## Notes

**Scope limitation**:
- Only add tests for uncovered code paths
- Do not refactor existing code unless necessary for testing
- Focus on critical business logic over trivial code
- Follow test minimalism guidelines from CLAUDE.md

**Future enhancement** (out of scope):
- Increase threshold to 98% after production launch
- Add mutation testing to verify test quality
- Implement coverage ratcheting (prevent coverage decrease)
