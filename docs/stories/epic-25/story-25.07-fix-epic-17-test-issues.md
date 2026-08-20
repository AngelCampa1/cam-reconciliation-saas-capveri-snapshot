# Story 25.7: Fix Epic 17 Minor Test Issues

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 1 hour
**Dependencies**: Epic 17 (completed)
**Status**: `pending`
**Priority**: P2

---

## User Story

As a **platform developer**, I want **all Epic 17 pool management tests to pass** so that **we can confidently deploy pool copy and template features to production**.

---

## Acceptance Criteria

- [ ] All 4 failing Epic 17 tests pass
  - [ ] `test_copy_pool_name_conflict` - Fix error message assertion
  - [ ] `test_copy_pool_invalid_source` - Fix error message assertion
  - [ ] `TemplateSelector` mock setup tests (2 failures) - Fix component mocking
- [ ] All Epic 17 integration tests continue passing
- [ ] No regressions in pool copy or template functionality
- [ ] Error messages match actual API responses

---

## Technical Specifications

### Issue #1: Error Message Assertion Failures

**Problem**: Tests expect old error message format, but API returns new format

**Failing Tests**:
1. `test_copy_pool_name_conflict` (Epic 17 pool copy tests)
2. `test_copy_pool_invalid_source` (Epic 17 pool copy tests)

**Root Cause**:
```python
# Test expects:
assert "Pool with name 'Utilities' already exists" in response.json()["detail"]

# API actually returns:
{"detail": "A pool with the name 'Utilities' already exists in this property"}
```

**Fix**: Update test assertions to match actual error messages

### Issue #2: TemplateSelector Mock Setup Failures

**Problem**: Component mocking not properly configured for `TemplateSelector` tests

**Failing Tests**:
1. `frontend/src/features/pools/components/TemplateSelector.test.tsx` (2 tests)

**Common causes**:
- Mock API hooks not returning expected data structure
- Component expecting props that aren't provided in test
- Radix UI Select component not rendering in JSDOM

**Fix**: Update test setup to properly mock dependencies

---

## Implementation Plan

### Step 1: Fix Pool Copy Error Message Tests (20 min)

**File**: `backend/tests/services/pools/test_copy_service.py`

**Current failing test**:
```python
def test_copy_pool_name_conflict(db_session, sample_property, sample_pool):
    """Verify error when target pool name already exists."""
    result = copy_pool(
        source_pool_id=sample_pool.id,
        target_property_id=sample_property.id,
        new_name="Utilities"  # Already exists
    )

    assert result.status_code == 400
    assert "Pool with name 'Utilities' already exists" in result.detail  # ❌ WRONG
```

**Find actual error message**:
```bash
# Run test with verbose output to see actual error
cd backend
pytest tests/services/pools/test_copy_service.py::test_copy_pool_name_conflict -vvs
```

**Update test with correct message**:
```python
def test_copy_pool_name_conflict(db_session, sample_property, sample_pool):
    """Verify error when target pool name already exists."""
    result = copy_pool(
        source_pool_id=sample_pool.id,
        target_property_id=sample_property.id,
        new_name="Utilities"
    )

    assert result.status_code == 400
    # ✅ FIXED - Match actual API error message
    assert "already exists in this property" in result.detail.lower()
```

**Repeat for `test_copy_pool_invalid_source`**:
```python
def test_copy_pool_invalid_source(db_session):
    """Verify error when source pool doesn't exist."""
    fake_id = uuid4()

    result = copy_pool(
        source_pool_id=fake_id,
        target_property_id=uuid4(),
        new_name="New Pool"
    )

    assert result.status_code == 404
    # ✅ FIXED - Match actual API error message
    assert "not found" in result.detail.lower() or "does not exist" in result.detail.lower()
```

### Step 2: Fix TemplateSelector Mock Setup (30 min)

**File**: `frontend/src/features/pools/components/TemplateSelector.test.tsx`

**Read the failing test first**:
```bash
cd frontend
npm test -- TemplateSelector.test.tsx --verbose
```

**Common issues and fixes**:

**Issue A: usePoolTemplates hook not mocked**
```typescript
// ❌ BEFORE - Hook not mocked
import { TemplateSelector } from './TemplateSelector';

describe('TemplateSelector', () => {
  it('renders templates', () => {
    render(<TemplateSelector onSelect={vi.fn()} />);
    // FAILS: usePoolTemplates is not mocked
  });
});
```

```typescript
// ✅ AFTER - Mock the hook
import { vi } from 'vitest';
import { TemplateSelector } from './TemplateSelector';
import * as hooks from '../hooks/usePoolTemplates';

describe('TemplateSelector', () => {
  beforeEach(() => {
    vi.spyOn(hooks, 'usePoolTemplates').mockReturnValue({
      data: [
        { id: '1', name: 'Retail Template', category: 'retail' },
        { id: '2', name: 'Office Template', category: 'office' },
      ],
      isLoading: false,
      isError: false,
    });
  });

  it('renders templates', () => {
    render(<TemplateSelector onSelect={vi.fn()} />);
    expect(screen.getByText('Retail Template')).toBeInTheDocument();
  });
});
```

**Issue B: Radix Select not rendering in JSDOM**
```typescript
// ❌ BEFORE - Select doesn't open in test
it('selects a template', () => {
  render(<TemplateSelector onSelect={mockOnSelect} />);
  fireEvent.click(screen.getByRole('combobox'));
  // FAILS: Radix Select uses portals, not in DOM
});
```

```typescript
// ✅ AFTER - Use data-testid instead of role
it('selects a template', async () => {
  const mockOnSelect = vi.fn();
  render(<TemplateSelector onSelect={mockOnSelect} />);

  const trigger = screen.getByTestId('template-selector-trigger');
  fireEvent.click(trigger);

  // Wait for portal to render
  await waitFor(() => {
    expect(screen.getByText('Retail Template')).toBeVisible();
  });

  fireEvent.click(screen.getByText('Retail Template'));
  expect(mockOnSelect).toHaveBeenCalledWith('1');
});
```

**Update component if needed**:
```typescript
// frontend/src/features/pools/components/TemplateSelector.tsx
<Select.Trigger data-testid="template-selector-trigger">
  {/* ... */}
</Select.Trigger>
```

### Step 3: Verify All Tests Pass (10 min)

```bash
# Backend - Pool copy tests
cd backend
pytest tests/services/pools/test_copy_service.py -v

# Frontend - TemplateSelector tests
cd frontend
npm test -- TemplateSelector.test.tsx

# Full Epic 17 test suite
cd backend
pytest tests/services/pools/ -v

cd frontend
npm test -- src/features/pools/
```

---

## Test Cases

### Verification Tests

**Backend**:
```bash
cd backend
pytest tests/services/pools/test_copy_service.py::test_copy_pool_name_conflict -xvs
pytest tests/services/pools/test_copy_service.py::test_copy_pool_invalid_source -xvs

# Expected: 2 passed
```

**Frontend**:
```bash
cd frontend
npm test -- TemplateSelector.test.tsx

# Expected: All TemplateSelector tests pass
```

### Regression Tests

- [ ] All other Epic 17 tests still pass
- [ ] Pool copy functionality works in manual testing
- [ ] Template selector UI works in browser

---

## Definition of Done

- [ ] All 4 failing tests now pass
- [ ] Error message assertions match actual API responses
- [ ] TemplateSelector component properly mocked in tests
- [ ] No regressions in Epic 17 functionality
- [ ] All pool management tests pass (backend + frontend)
- [ ] Story marked as `completed` in STORY_TRACKER.md

---

## Files to Modify

**Backend**:
1. `backend/tests/services/pools/test_copy_service.py` - Fix 2 error message assertions

**Frontend**:
2. `frontend/src/features/pools/components/TemplateSelector.test.tsx` - Fix mock setup
3. `frontend/src/features/pools/components/TemplateSelector.tsx` - Add data-testid if needed

---

## Debugging Guide

### If test still fails after error message fix

1. **Check actual API endpoint**:
```bash
# Start backend
cd backend
uvicorn app.main:app --reload

# Make request with curl
curl -X POST http://localhost:8000/api/v1/pools/copy \
  -H "Content-Type: application/json" \
  -d '{
    "source_pool_id": "invalid-uuid",
    "target_property_id": "property-id",
    "new_name": "Test"
  }'

# Copy exact error message to test
```

2. **Use pytest output**:
```bash
pytest tests/services/pools/test_copy_service.py::test_copy_pool_name_conflict -vvs
# Look for AssertionError showing actual vs expected
```

### If TemplateSelector test still fails

1. **Check what's actually rendered**:
```typescript
it('debug test', () => {
  render(<TemplateSelector onSelect={vi.fn()} />);
  screen.debug(); // Prints entire DOM
});
```

2. **Check if hook is called**:
```typescript
const mockUseTemplates = vi.spyOn(hooks, 'usePoolTemplates');
// ... render component ...
expect(mockUseTemplates).toHaveBeenCalled();
```

3. **Check Radix Select portal**:
```typescript
// Add to test setup
import { config } from '@testing-library/react';
config.defaultHidden = true; // Include hidden elements in queries
```

---

## Common Pitfalls

### Pitfall 1: Overly Strict Error Message Assertions

**Bad**:
```python
assert response.detail == "Pool with name 'Utilities' already exists in property 'Building A'"
# Too specific - will break if message changes slightly
```

**Good**:
```python
assert "already exists" in response.detail.lower()
# Flexible - matches variants like "already exists", "name already exists", etc.
```

### Pitfall 2: Not Resetting Mocks Between Tests

```typescript
// Bad - Mock persists across tests
vi.spyOn(hooks, 'usePoolTemplates').mockReturnValue({...});

// Good - Reset after each test
afterEach(() => {
  vi.restoreAllMocks();
});
```

### Pitfall 3: Testing Implementation Details

```typescript
// Bad - Testing that Select component uses specific Radix primitives
expect(screen.getByRole('combobox')).toBeInTheDocument();

// Good - Testing user-facing behavior
expect(screen.getByTestId('template-selector')).toBeInTheDocument();
```

---

## Notes

**Scope**: Only fix the 4 identified failing tests. Do not refactor or add new tests.

**Future enhancements** (out of scope):
- Improve error message consistency across all API endpoints
- Add error message test helpers to avoid string matching
- Consider using error codes instead of message strings for assertions
