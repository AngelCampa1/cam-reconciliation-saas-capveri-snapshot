"""Tests for expense stop calculator."""

from decimal import Decimal
from uuid import uuid4

from app.services.calculation.expense_stop import (
    ExpenseStopInput,
    apply_expense_stops,
    calculate_expense_stop,
)
from app.services.calculation.models import CalculationTrace


class TestCalculateExpenseStop:
    """Tests for calculate_expense_stop function."""

    def test_calculates_threshold_correctly(self):
        """AC1: Calculates stop threshold as stop_per_sqft * tenant_sqft."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("100000"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        result = calculate_expense_stop(input_data)

        # Threshold = $5.00/sqft * 10,000 sqft = $50,000
        assert result.threshold == Decimal("50000.00")

    def test_tenant_pays_amount_above_stop(self):
        """AC2: Tenant pays max(0, pool_share - threshold)."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("100000"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        result = calculate_expense_stop(input_data)

        # Tenant share = $100,000 * 0.10 = $10,000
        # Threshold = $50,000
        # Above stop = max(0, $10,000 - $50,000) = $0
        assert result.tenant_share_before_stop == Decimal("10000.00")
        assert result.above_stop == Decimal("0.00")
        assert result.stop_applied is False

    def test_tenant_pays_when_expenses_exceed_stop(self):
        """AC2: Tenant pays when expenses exceed stop."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("1000000"),  # Large pool
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        result = calculate_expense_stop(input_data)

        # Tenant share = $1,000,000 * 0.10 = $100,000
        # Threshold = $50,000
        # Above stop = max(0, $100,000 - $50,000) = $50,000
        assert result.tenant_share_before_stop == Decimal("100000.00")
        assert result.above_stop == Decimal("50000.00")
        assert result.stop_applied is True

    def test_zero_when_exactly_at_stop(self):
        """Edge case: Tenant share exactly equals stop threshold."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("500000"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        result = calculate_expense_stop(input_data)

        # Tenant share = $500,000 * 0.10 = $50,000
        # Threshold = $50,000
        # Above stop = max(0, $50,000 - $50,000) = $0
        assert result.tenant_share_before_stop == Decimal("50000.00")
        assert result.above_stop == Decimal("0.00")
        assert result.stop_applied is False

    def test_high_stop_prevents_all_charges(self):
        """High stop threshold can eliminate all tenant charges."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("100000"),
            stop_per_sqft=Decimal("20.00"),  # High stop
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        result = calculate_expense_stop(input_data)

        # Tenant share = $100,000 * 0.10 = $10,000
        # Threshold = $20.00 * 10,000 = $200,000
        # Above stop = max(0, $10,000 - $200,000) = $0
        assert result.threshold == Decimal("200000.00")
        assert result.above_stop == Decimal("0.00")
        assert result.stop_applied is False

    def test_small_tenant_with_stop(self):
        """Small tenant (low pro-rata share) with expense stop."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("500000"),
            stop_per_sqft=Decimal("8.00"),
            tenant_sqft=Decimal("2500"),  # Small tenant
            pro_rata_share=Decimal("0.025"),  # 2.5%
        )

        result = calculate_expense_stop(input_data)

        # Tenant share = $500,000 * 0.025 = $12,500
        # Threshold = $8.00 * 2,500 = $20,000
        # Above stop = max(0, $12,500 - $20,000) = $0
        assert result.tenant_share_before_stop == Decimal("12500.00")
        assert result.threshold == Decimal("20000.00")
        assert result.above_stop == Decimal("0.00")

    def test_trace_captures_calculation_steps(self):
        """AC5: Trace shows stop calculation."""
        from datetime import date

        trace = CalculationTrace(
            calculation_type="expense_stop_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        input_data = ExpenseStopInput(
            pool_amount=Decimal("100000"),
            stop_per_sqft=Decimal("5.00"),
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.10"),
        )

        _result = calculate_expense_stop(input_data, trace)

        # Verify trace has all steps
        assert len(trace.steps) == 3
        assert trace.steps[0].step_name == "Calculate expense stop threshold"
        assert trace.steps[1].step_name == "Calculate tenant pool share"
        assert trace.steps[2].step_name == "Apply expense stop"

        # Verify threshold step
        assert trace.steps[0].input_values["stop_per_sqft"] == "5.00"
        assert trace.steps[0].input_values["tenant_sqft"] == "10000"
        assert trace.steps[0].output_value == "50000.00"

        # Verify share step
        assert trace.steps[1].input_values["pool_amount"] == "100000"
        assert trace.steps[1].input_values["pro_rata_share"] == "0.10"
        assert trace.steps[1].output_value == "10000.00"

        # Verify stop application step
        assert trace.steps[2].input_values["tenant_share"] == "10000.00"
        assert trace.steps[2].input_values["threshold"] == "50000.00"
        assert trace.steps[2].output_value == "0.00"

    def test_rounding_to_cents(self):
        """Ensure all monetary values round to cents."""
        input_data = ExpenseStopInput(
            pool_amount=Decimal("99999.999"),  # Will round
            stop_per_sqft=Decimal("5.555"),  # Will round threshold
            tenant_sqft=Decimal("10000"),
            pro_rata_share=Decimal("0.333"),  # Will create rounding
        )

        result = calculate_expense_stop(input_data)

        # All results should be rounded to 2 decimal places
        assert result.threshold.as_tuple().exponent == -2
        assert result.tenant_share_before_stop.as_tuple().exponent == -2
        assert result.above_stop.as_tuple().exponent == -2


class TestApplyExpenseStops:
    """Tests for apply_expense_stops function."""

    def test_applies_stop_to_single_pool(self):
        """AC3: Handles per-pool stops - single pool."""
        pool_breakdown = {"Operating": Decimal("100000")}
        expense_stops = {"Operating": Decimal("5.00")}
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Original pool: $100,000
        # Tenant share: $10,000
        # Threshold: $50,000
        # Above stop: $0
        # Adjusted pool = $0 / 0.10 = $0
        assert result["Operating"] == Decimal("0.00")

    def test_applies_different_stops_to_multiple_pools(self):
        """AC3: Handles per-pool stops - different stops for different pools."""
        pool_breakdown = {
            "Operating": Decimal("200000"),
            "Taxes": Decimal("150000"),
            "Insurance": Decimal("50000"),
        }
        expense_stops = {
            "Operating": Decimal("5.00"),  # $50,000 threshold
            "Taxes": Decimal("3.00"),  # $30,000 threshold
            # No stop on Insurance
        }
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Operating: share=$20,000, threshold=$50,000, above=$0, adjusted=$0
        # Taxes: share=$15,000, threshold=$30,000, above=$0, adjusted=$0
        # Insurance: no stop, remains $50,000
        assert result["Operating"] == Decimal("0.00")
        assert result["Taxes"] == Decimal("0.00")
        assert result["Insurance"] == Decimal("50000")  # Unchanged

    def test_applies_stop_only_to_specified_pools(self):
        """Pools without stops remain unchanged."""
        pool_breakdown = {
            "CAM": Decimal("100000"),
            "Utilities": Decimal("50000"),
            "Taxes": Decimal("75000"),
        }
        expense_stops = {
            "CAM": Decimal("8.00"),  # Only CAM has a stop
        }
        tenant_sqft = Decimal("5000")
        pro_rata_share = Decimal("0.15")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # CAM: share=$15,000, threshold=$40,000, above=$0, adjusted=$0
        # Utilities and Taxes unchanged
        assert result["CAM"] == Decimal("0.00")
        assert result["Utilities"] == Decimal("50000")
        assert result["Taxes"] == Decimal("75000")

    def test_large_pool_exceeds_stop(self):
        """Pool amount exceeds stop threshold."""
        pool_breakdown = {"Operating": Decimal("1000000")}
        expense_stops = {"Operating": Decimal("5.00")}
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Tenant share: $100,000
        # Threshold: $50,000
        # Above stop: $50,000
        # Adjusted pool = $50,000 / 0.10 = $500,000
        assert result["Operating"] == Decimal("500000.00")

    def test_trace_captures_multi_pool_stops(self):
        """Trace shows stop calculations for multiple pools."""
        from datetime import date

        trace = CalculationTrace(
            calculation_type="multi_pool_stop_test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        pool_breakdown = {
            "Operating": Decimal("200000"),
            "Taxes": Decimal("100000"),
        }
        expense_stops = {
            "Operating": Decimal("10.00"),
            "Taxes": Decimal("5.00"),
        }
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        _result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share, trace
        )

        # Should have 6 steps total (3 per pool: threshold, share, apply)
        assert len(trace.steps) == 6

    def test_empty_expense_stops_returns_unchanged(self):
        """No expense stops means pools remain unchanged."""
        pool_breakdown = {
            "Operating": Decimal("100000"),
            "Taxes": Decimal("50000"),
        }
        expense_stops = {}  # No stops
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Everything unchanged
        assert result == pool_breakdown

    def test_stop_on_nonexistent_pool_ignored(self):
        """Stop for pool not in breakdown is ignored."""
        pool_breakdown = {"Operating": Decimal("100000")}
        expense_stops = {
            "Operating": Decimal("5.00"),
            "Utilities": Decimal("3.00"),  # Not in pool_breakdown
        }
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.10")

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Operating adjusted, Utilities ignored (doesn't exist)
        assert "Utilities" not in result
        assert len(result) == 1

    def test_zero_pro_rata_share_handled(self):
        """Handle edge case of zero pro-rata share."""
        pool_breakdown = {"Operating": Decimal("100000")}
        expense_stops = {"Operating": Decimal("5.00")}
        tenant_sqft = Decimal("10000")
        pro_rata_share = Decimal("0.00")  # Edge case

        result = apply_expense_stops(
            pool_breakdown, expense_stops, tenant_sqft, pro_rata_share
        )

        # Division by zero protection
        assert result["Operating"] == Decimal("0.00")
