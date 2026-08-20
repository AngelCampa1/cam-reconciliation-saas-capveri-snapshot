# Story 25.1: Fix Story 24.10 Critical Test Failures

**Epic**: 25 - Production Readiness & Polish
**Estimated Hours**: 9-12 hours
**Dependencies**: Story 24.10 (completed)
**Status**: `completed`
**Priority**: P0

---

## User Story

As a **platform developer**, I want **all billing and tenant portal integration tests to pass** so that **we can confidently deploy the billing system to production**.

---

## Acceptance Criteria

- [x] All 5 failing billing checkout tests pass
  - [x] `test_checkout_creates_session` returns 200 with valid session
  - [x] `test_checkout_annual_billing_period` creates annual subscription session
  - [x] `test_list_invoices_pagination_first_page` returns 10 invoices on page 1
  - [x] `test_list_invoices_pagination_last_page` returns 5 invoices on page 3
  - [x] `test_invoice_pdf_redirect` returns 307 redirect to Stripe PDF
- [x] All 21 billing integration tests pass (100% pass rate)
- [x] All 30 tenant portal tests continue passing
- [x] All 47 security tests from Story 24.12 continue passing
- [x] Test fixtures properly seed mock database using `_test_data` pattern
- [x] No debug output or temporary test code remains

---

## Technical Specifications

### Root Cause Analysis

The 5 failing tests had a common root cause:
- **Issue**: Mock Supabase client's `_test_data` was not being seeded with required data
- **Impact**: API endpoints queried empty database, returning 404/empty results
- **Solution**: Update test fixtures to properly seed organization and invoice data

### Files Modified

1. **`backend/tests/integration/test_billing_checkout.py`**
   - Enhanced `client` fixture to seed organization data
   - Added Stripe service dependency override
   - Ensured proper cleanup of dependency overrides

2. **`backend/tests/conftest.py`** (lines 883-941)
   - Fixed `seed_many_invoices` to use `_test_data` pattern
   - Fixed `seed_invoice_with_pdf` to use `_test_data` pattern
   - Removed obsolete `MockQueryBuilder` return value assignment

### Implementation Details

**Checkout Test Fixture** (`test_billing_checkout.py` lines 17-42):
```python
@pytest.fixture
def client(self, org_a_member_client, mock_stripe_service):
    """Test client with mocked Stripe service."""
    from app.api.deps import get_stripe_service
    from datetime import datetime, UTC

    # Seed organization data in mock
    org_data = {
        "id": str(ORG_A_ID),
        "name": "Test Organization A",
        "billing_email": "billing@test.com",
        "created_at": datetime.now(UTC).isoformat(),
    }

    if hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data["organizations"] = [org_data]
        org_a_member_client.mock_supabase._test_data["subscriptions"] = []

    # Override the Stripe service dependency
    org_a_member_client.app.dependency_overrides[get_stripe_service] = lambda: mock_stripe_service

    yield org_a_member_client

    # Clean up
    if get_stripe_service in org_a_member_client.app.dependency_overrides:
        del org_a_member_client.app.dependency_overrides[get_stripe_service]
```

**Invoice Fixtures** (`conftest.py` lines 883-941):
```python
@pytest.fixture
def seed_many_invoices(org_a_member_client):
    """Seed 25 test invoices for pagination testing."""
    # ... create 25 invoices ...

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["invoices"] = invoices
    return invoices

@pytest.fixture
def seed_invoice_with_pdf(org_a_member_client):
    """Seed a single test invoice with PDF URL."""
    # ... create invoice ...

    # Initialize shared state
    if not hasattr(org_a_member_client.mock_supabase, "_test_data"):
        org_a_member_client.mock_supabase._test_data = {}

    org_a_member_client.mock_supabase._test_data["invoices"] = [invoice]
    return invoice
```

---

## Test Cases

### Test Execution Results

**Before Fix:**
```
FAILED test_checkout_creates_session - 404 "Organization not found"
FAILED test_checkout_annual_billing_period - 404 "Organization not found"
FAILED test_list_invoices_pagination_first_page - assert 0 == 10
FAILED test_list_invoices_pagination_last_page - assert 0 == 5
FAILED test_invoice_pdf_redirect - assert 404 == 307
```

**After Fix:**
```
tests/integration/test_billing_checkout.py::TestCheckoutFlow::test_checkout_creates_session PASSED
tests/integration/test_billing_checkout.py::TestCheckoutFlow::test_checkout_annual_billing_period PASSED
tests/integration/test_billing_invoices.py::TestInvoiceEndpoints::test_list_invoices_pagination_first_page PASSED
tests/integration/test_billing_invoices.py::TestInvoiceEndpoints::test_list_invoices_pagination_last_page PASSED
tests/integration/test_billing_invoices.py::TestInvoiceEndpoints::test_invoice_pdf_redirect PASSED

====================== 21 passed, 21 warnings in 13.40s =======================
```

### Regression Tests

- [x] All 47 security tests (Story 24.12) still pass
- [x] All 30 tenant portal tests still pass
- [x] Overall backend test suite: 3,740 passed (98.0% pass rate)

---

## Definition of Done

- [x] All 5 failing tests now pass
- [x] Test fixtures use proper `_test_data` seeding pattern
- [x] No temporary debug code remains
- [x] Dependency overrides properly cleaned up in fixtures
- [x] All related test suites still pass (no regressions)
- [x] Story marked as `completed` in STORY_TRACKER.md

---

## Completion Notes

**Completed**: 2026-01-07
**Actual Time**: 2 hours

**Summary**:
- Fixed all 5 billing integration test failures
- Root cause was improper mock database seeding in fixtures
- Solution: Updated fixtures to use `_test_data` pattern consistently
- All 21 billing integration tests now pass (100%)
- No regressions in security or tenant portal tests

**Impact**:
- Billing system now has 100% test pass rate
- Ready for production deployment
- Improved test fixture patterns for future development
