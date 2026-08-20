"""
Tests for full gross-up calculation orchestrator.

Story: 6.5 - Create Full Gross-Up Calculation
Tests verify end-to-end integration of occupancy, filtering, gross-up, and safety valve.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.gross_up_orchestrator import (
    GrossUpInput,
    calculate_full_gross_up,
)
from app.services.calculation.occupancy import LeaseOccupancy


class TestGrossUpInput:
    """Test GrossUpInput model."""

    def test_default_target_occupancy(self):
        """Should default to 95% target occupancy."""
        input_data = GrossUpInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )
        assert input_data.target_occupancy == Decimal("0.95")

    def test_custom_target_occupancy(self):
        """Should allow custom target occupancy."""
        input_data = GrossUpInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("0.90"),
        )
        assert input_data.target_occupancy == Decimal("0.90")


class TestCalculateFullGrossUp:
    """Test complete gross-up calculation."""

    def test_basic_full_calculation(self):
        """AC1: Combines occupancy, factor, filter, and safety valve."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("0.95"),
        )

        # 75% occupied (75,000 sqft)
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant B",
                sqft=Decimal("25000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        # $100k variable, $50k fixed
        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Taxes",
                pool_type="tax",
                total_amount=Decimal("50000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # AC2: Returns complete breakdown
        assert result.period_start == date(2024, 1, 1)
        assert result.period_end == date(2024, 12, 31)
        assert result.total_rentable_sqft == Decimal("100000")
        assert result.actual_occupancy == Decimal("0.75")
        assert result.target_occupancy == Decimal("0.95")
        assert result.occupied_sqft == Decimal("75000")
        assert result.vacant_sqft == Decimal("25000")
        assert result.variable_expenses == Decimal("100000.00")
        assert result.fixed_expenses == Decimal("50000.00")
        assert result.total_operating_expenses == Decimal("150000.00")

        # Gross-up factor: 0.95 / 0.75 = 1.2667
        # Grossed variable: 100000 * 1.2667 = 126670
        # Total: 126670 + 50000 = 176670
        assert result.gross_up_factor == Decimal("1.2667")
        assert result.grossed_up_variable == Decimal("126670.00")
        assert result.total_after_gross_up == Decimal("176670.00")
        assert result.safety_valve_applied is False

        # AC3: Full trace for audit
        assert len(result.trace.steps) > 0
        step_names = [step.step_name for step in result.trace.steps]
        assert "Calculate occupancy rate" in step_names
        assert "Filter expenses by type" in step_names
        assert "Calculate gross-up factor" in step_names

    def test_safety_valve_triggers(self):
        """AC4: Handles safety valve edge case."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("1.00"),  # Aggressive 100% target
        )

        # 50% occupied
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        # $80k variable expenses
        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("80000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # Factor: 1.00 / 0.50 = 2.0
        # Grossed: 80000 * 2.0 = 160000
        # But 100% equivalent: 80000 / 0.50 = 160000
        # Right at the limit
        assert result.actual_occupancy == Decimal("0.50")
        assert result.gross_up_factor == Decimal("2.0")
        assert result.grossed_up_variable == Decimal("160000.00")

    def test_zero_occupancy_edge_case(self):
        """AC4: Handles zero occupancy edge case."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # No leases (0% occupancy)
        leases = []

        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # Zero occupancy: no gross-up applied (factor = 1.0)
        assert result.actual_occupancy == Decimal("0")
        assert result.gross_up_factor == Decimal("1.0")
        assert result.grossed_up_variable == Decimal("100000.00")
        assert result.safety_valve_applied is False

    def test_full_occupancy_no_gross_up(self):
        """AC4: No gross-up when at or above target."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("0.95"),
        )

        # 100% occupied
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # 100% occupancy: factor = 1.0 (no gross-up)
        assert result.actual_occupancy == Decimal("1.0")
        assert result.gross_up_factor == Decimal("1.0")
        assert result.grossed_up_variable == Decimal("100000.00")
        assert result.safety_valve_applied is False

    def test_partial_year_lease(self):
        """AC4: Handles partial year leases in occupancy calculation."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Tenant A: Full year (50,000 sqft for 366 days)
        # Tenant B: Half year (25,000 sqft for 182 days, Jan 1 to June 30)
        # Weighted occupancy: (50000 * 366 + 25000 * 182) / (100000 * 366)
        #                   = (18,300,000 + 4,550,000) / 36,600,000
        #                   = 22,850,000 / 36,600,000 = 0.6243
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant B",
                sqft=Decimal("25000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 6, 30),  # Half year
            ),
        ]

        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # Weighted occupancy should be calculated
        assert result.actual_occupancy == Decimal("0.6243")
        # Factor: 0.95 / 0.6243 = 1.5217
        assert result.gross_up_factor == Decimal("1.5217")

    def test_mixed_expense_pools(self):
        """AC5: End-to-end test with realistic mixed expenses."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("250000"),
        )

        # 80% occupied
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tech Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Law Firm",
                sqft=Decimal("75000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Consulting",
                sqft=Decimal("25000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        # Realistic expense mix
        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Janitorial",
                pool_type="operating",
                total_amount=Decimal("45000.00"),
                is_gross_up_applicable=True,
            ),
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Utilities",
                pool_type="utility",
                total_amount=Decimal("85000.00"),
                is_gross_up_applicable=True,
            ),
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Maintenance",
                pool_type="maintenance",
                total_amount=Decimal("60000.00"),
                is_gross_up_applicable=True,
            ),
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Real Estate Taxes",
                pool_type="tax",
                total_amount=Decimal("120000.00"),
                is_gross_up_applicable=False,
            ),
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Insurance",
                pool_type="insurance",
                total_amount=Decimal("35000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # Verify occupancy
        assert result.actual_occupancy == Decimal("0.80")
        assert result.occupied_sqft == Decimal("200000")
        assert result.vacant_sqft == Decimal("50000")

        # Verify expense breakdown
        # Variable: 45k + 85k + 60k = 190k
        # Fixed: 120k + 35k = 155k
        assert result.variable_expenses == Decimal("190000.00")
        assert result.fixed_expenses == Decimal("155000.00")
        assert result.total_operating_expenses == Decimal("345000.00")

        # Verify gross-up
        # Factor: 0.95 / 0.80 = 1.1875
        # Grossed variable: 190000 * 1.1875 = 225625
        # Total: 225625 + 155000 = 380625
        assert result.gross_up_factor == Decimal("1.1875")
        assert result.grossed_up_variable == Decimal("225625.00")
        assert result.total_after_gross_up == Decimal("380625.00")

        # AC3: Verify complete trace
        assert result.trace.calculation_type == "gross_up_full"
        assert result.trace.property_id == property_id
        assert len(result.trace.steps) >= 5  # Multiple calculation steps

    def test_gross_up_factor_rounds_half_up(self):
        """Regression: factor quantization must use ROUND_HALF_UP, not the
        Decimal default ROUND_HALF_EVEN (banker's rounding).

        With actual occupancy 0.8 and target 0.80004, the raw factor is
        exactly 1.00005. The 4th decimal (0) is even, so ROUND_HALF_EVEN
        would keep 1.0000 while ROUND_HALF_UP yields 1.0001. This pins the
        rounding mode so it stays consistent with calculate_gross_up_factor
        and the rest of the financial engine.
        """
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("0.80004"),
        )

        # Single full-year lease at exactly 80% occupancy.
        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("80000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # 0.80004 / 0.8 == 1.00005 exactly -> ROUND_HALF_UP -> 1.0001
        assert result.actual_occupancy == Decimal("0.80")
        assert result.gross_up_factor == Decimal("1.0001")

    def test_trace_completeness(self):
        """AC3: Verify trace captures all calculation steps."""
        property_id = uuid4()
        input_data = GrossUpInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id=str(uuid4()),
                tenant_name="Tenant A",
                sqft=Decimal("70000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        pool_totals = {
            uuid4(): ExpensePoolSummary(
                pool_id=uuid4(),
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = calculate_full_gross_up(input_data, leases, pool_totals)

        # Verify trace has all expected steps
        step_names = [step.step_name for step in result.trace.steps]

        # From occupancy calculation
        assert "Calculate occupancy rate" in step_names

        # From expense filtering
        assert "Filter expenses by type" in step_names

        # From gross-up calculation
        assert "Calculate gross-up factor" in step_names

        # Safety valve check
        assert "Safety valve check" in step_names

        # Final total
        assert "Calculate total after gross-up" in step_names

        # Verify trace metadata
        assert result.trace.calculation_type == "gross_up_full"
        assert result.trace.property_id == property_id
        assert result.trace.period_start == date(2024, 1, 1)
        assert result.trace.period_end == date(2024, 12, 31)
