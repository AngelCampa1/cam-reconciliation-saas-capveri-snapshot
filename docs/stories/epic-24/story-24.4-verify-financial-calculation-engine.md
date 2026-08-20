# Story 24.4: Verify Financial Calculation Engine (Epic 6)

**Epic**: 24 - End-to-End Verification & Integration Testing
**Story Points**: 6 hours
**Status**: `pending`
**Dependencies**: Epic 6

---

## User Story

As a **CAM accountant**,
I want to **verify that all financial calculations (gross-up, caps, base year) are deterministic and correct**,
So that **I can trust the reconciliation results for billing tenants**.

---

## Acceptance Criteria

### Calculation Accuracy
- [ ] Gross-up factor calculation is correct (target / actual occupancy, min 1.0)
- [ ] Safety valve prevents grossing up beyond 100% theoretical occupancy
- [ ] Variable expense filtering correctly excludes taxes and insurance
- [ ] Non-cumulative cap resets yearly and loses unused capacity
- [ ] Cumulative cap banks unused capacity year-over-year (linear growth)
- [ ] Cumulative compounding cap grows exponentially
- [ ] Base year calculation: max(0, current - base) * pro_rata_share
- [ ] Base year normalization gross-ups base when occupancy < target

### Determinism
- [ ] Same input produces same output every time
- [ ] Calculation results are reproducible across environments
- [ ] Decimal precision is consistent (no floating-point drift)
- [ ] Calculation trace shows all intermediate steps

### Integration
- [ ] Expense pool aggregator groups expenses correctly
- [ ] Pool mappings with wildcards work correctly
- [ ] Allocation percentages sum to 100%
- [ ] Tenant share calculator integrates all components
- [ ] Reconciliation orchestrator runs full workflow

### Edge Cases
- [ ] Zero expenses: returns zero (no division by zero errors)
- [ ] 100% occupancy: no gross-up (factor = 1.0)
- [ ] Zero occupancy: handled gracefully (no division by zero)
- [ ] Negative cap: rejected with validation error
- [ ] Pro-rata share > 100%: rejected with validation error

---

## Technical Specifications

### Golden Master Testing

Use expected calculation outputs from Epic 8:

```python
# backend/tests/integration/test_calculation_golden_master.py
import pytest
import json
from decimal import Decimal
from app.services.calculation import ReconciliationOrchestrator

@pytest.mark.parametrize("scenario", [
    "gross_up_75_percent_occupancy",
    "non_cumulative_cap_year_2",
    "cumulative_cap_with_bank",
    "cumulative_compounding_cap_year_3",
    "base_year_normalized",
    "full_reconciliation_multi_tenant",
])
def test_calculation_matches_expected_output(scenario):
    """Verify calculations match hand-calculated expected values."""
    # Load expected output from Epic 8 fixtures
    with open(f"tests/fixtures/expected_calculations/{scenario}.json") as f:
        expected = json.load(f)

    # Load input data
    with open(f"tests/fixtures/expected_calculations/{scenario}_input.json") as f:
        input_data = json.load(f)

    # Run calculation
    orchestrator = ReconciliationOrchestrator()
    result = orchestrator.calculate(**input_data)

    # Compare results (use Decimal for financial precision)
    assert Decimal(str(result.total_recoverable)) == Decimal(str(expected["total_recoverable"]))
    assert Decimal(str(result.gross_up_factor)) == Decimal(str(expected["gross_up_factor"]))

    for tenant_id, expected_share in expected["tenant_shares"].items():
        actual_share = result.tenant_shares[tenant_id]
        assert Decimal(str(actual_share.billable_amount)) == Decimal(str(expected_share["billable_amount"]))
```

### Determinism Test

```python
# backend/tests/test_calculation_determinism.py
import pytest
from app.services.calculation import calculate_gross_up

def test_gross_up_is_deterministic():
    """Verify gross-up calculation is deterministic (same input = same output)."""
    input_data = {
        "variable_expenses": [
            {"account": "6000", "amount": Decimal("1000.00")},
            {"account": "6100", "amount": Decimal("500.00")},
        ],
        "occupancy": Decimal("0.75"),
        "target": Decimal("0.95"),
    }

    # Run calculation 100 times
    results = [calculate_gross_up(**input_data) for _ in range(100)]

    # All results should be identical
    first_result = results[0]
    for result in results[1:]:
        assert result.grossed_variable == first_result.grossed_variable
        assert result.gross_up_factor == first_result.gross_up_factor
        assert result.total == first_result.total
```

### Edge Case Tests

```python
# backend/tests/test_calculation_edge_cases.py
import pytest
from decimal import Decimal
from app.services.calculation import calculate_gross_up, apply_cap, calculate_base_year

def test_gross_up_with_zero_expenses():
    """Verify gross-up handles zero expenses without error."""
    result = calculate_gross_up(
        variable_expenses=[],
        occupancy=Decimal("0.75"),
        target=Decimal("0.95")
    )
    assert result.grossed_variable == Decimal("0.00")
    assert result.total == Decimal("0.00")

def test_gross_up_with_100_percent_occupancy():
    """Verify gross-up factor = 1.0 when occupancy = 100%."""
    result = calculate_gross_up(
        variable_expenses=[{"account": "6000", "amount": Decimal("1000.00")}],
        occupancy=Decimal("1.00"),
        target=Decimal("0.95")
    )
    assert result.gross_up_factor == Decimal("1.00")
    assert result.grossed_variable == Decimal("1000.00")

def test_gross_up_with_zero_occupancy():
    """Verify gross-up handles zero occupancy gracefully."""
    with pytest.raises(ValueError, match="occupancy must be > 0"):
        calculate_gross_up(
            variable_expenses=[{"account": "6000", "amount": Decimal("1000.00")}],
            occupancy=Decimal("0.00"),
            target=Decimal("0.95")
        )

def test_cap_with_negative_rate():
    """Verify negative cap rate is rejected."""
    with pytest.raises(ValueError, match="cap_rate must be >= 0"):
        apply_cap(
            actual_expenses=Decimal("1000.00"),
            cap_rate=Decimal("-0.05"),
            base_amount=Decimal("900.00"),
            cap_type="non_cumulative"
        )

def test_pro_rata_share_exceeds_100_percent():
    """Verify pro-rata share > 100% is rejected."""
    with pytest.raises(ValueError, match="pro_rata_share must be <= 1.0"):
        calculate_tenant_share(
            pro_rata_share=Decimal("1.50"),
            pool_amount=Decimal("1000.00")
        )
```

### Calculation Trace Test

```python
# backend/tests/test_calculation_trace.py
import pytest
from app.services.calculation import ReconciliationOrchestrator

@pytest.mark.integration
async def test_calculation_trace_is_complete(db_session):
    """Verify calculation trace includes all intermediate steps."""
    orchestrator = ReconciliationOrchestrator()
    result = await orchestrator.calculate(
        property_id="test_property",
        period_start="2024-01-01",
        period_end="2024-12-31"
    )

    trace = result.trace
    assert "occupancy_calculation" in trace
    assert "gross_up_calculation" in trace
    assert "expense_pool_aggregation" in trace
    assert "cap_application" in trace
    assert "tenant_share_calculation" in trace

    # Verify trace is human-readable
    readable_trace = result.get_readable_trace()
    assert "Occupancy:" in readable_trace
    assert "Gross-Up Factor:" in readable_trace
    assert "Total Recoverable:" in readable_trace
```

### Performance Test

```python
# backend/tests/test_calculation_performance.py
import pytest
import time
from app.services.calculation import ReconciliationOrchestrator

@pytest.mark.integration
async def test_reconciliation_performance(db_session):
    """Verify reconciliation completes within SLA (<5s for 1000 GL entries, 10 tenants)."""
    # Create test data: 1000 GL entries, 10 tenants, 5 expense pools
    # ... setup code ...

    orchestrator = ReconciliationOrchestrator()

    start = time.time()
    result = await orchestrator.calculate(
        property_id="test_property",
        period_start="2024-01-01",
        period_end="2024-12-31"
    )
    duration = time.time() - start

    assert duration < 5.0, f"Reconciliation took {duration}s, expected <5s"
    assert len(result.tenant_shares) == 10
```

---

## Files to Audit

### Calculation Services
- `backend/app/services/calculation/occupancy.py`
- `backend/app/services/calculation/gross_up.py`
- `backend/app/services/calculation/variable_expense_filter.py`
- `backend/app/services/calculation/safety_valve.py`
- `backend/app/services/calculation/caps.py`
- `backend/app/services/calculation/base_year.py`
- `backend/app/services/calculation/expense_pool_aggregator.py`
- `backend/app/services/calculation/tenant_share.py`
- `backend/app/services/calculation/trace_logger.py`
- `backend/app/services/calculation/orchestrator.py`

### Tests
- `backend/tests/test_calculation_*.py`
- `backend/tests/integration/test_reconciliation_e2e.py`

### Expected Outputs (Epic 8)
- `tests/fixtures/expected_calculations/*.json`

---

## Definition of Done

- [ ] All calculation tests pass (unit + integration)
- [ ] All 6+ golden master scenarios match expected outputs exactly
- [ ] Determinism test passes (100 runs produce identical results)
- [ ] All edge cases are handled gracefully (no crashes)
- [ ] Calculation trace includes all intermediate steps
- [ ] Performance test passes (<5s for 1000 entries, 10 tenants)
- [ ] All calculations use Decimal (no float)
- [ ] All validation errors have clear messages
- [ ] Any discrepancies vs. hand-calculated values are investigated and resolved

---

## Notes

- This story is **critical for accuracy** - billing errors could cost the business
- Use **Decimal everywhere** for financial values (never float)
- Verify calculations against **hand-calculated spreadsheets** from Epic 8
- Test with **real-world lease terms** (not just simple cases)
- Document any formula corrections needed

---

*Created: 2025-12-30*
*Status: pending*
