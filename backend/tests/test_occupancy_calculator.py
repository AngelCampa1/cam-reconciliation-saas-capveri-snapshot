"""
Tests for the occupancy calculator.

AC1: Calculates weighted average occupancy for a period
AC2: Handles partial-year tenants (prorate by days)
AC3: Handles vacant units correctly
AC4: Returns occupancy as Decimal (0.0 - 1.0)
AC5: Logs calculation steps for audit trail
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.calculation.models import (
    CalculationStep,
    CalculationTrace,
    OccupancyInput,
    OccupancyResult,
)
from app.services.calculation.occupancy import (
    LeaseOccupancy,
    calculate_occupancy,
)


class TestCalculationModels:
    """Tests for calculation models."""

    def test_calculation_step_creation(self) -> None:
        """CalculationStep should store step details."""
        step = CalculationStep(
            step_order=1,
            step_name="Test Step",
            input_values={"a": "1", "b": "2"},
            operation="a + b",
            output_value="3",
            note="Test note",
        )

        assert step.step_order == 1
        assert step.step_name == "Test Step"
        assert step.input_values == {"a": "1", "b": "2"}
        assert step.operation == "a + b"
        assert step.output_value == "3"
        assert step.note == "Test note"

    def test_calculation_trace_add_step(self) -> None:
        """CalculationTrace should track steps in order."""
        property_id = uuid4()
        trace = CalculationTrace(
            calculation_type="test",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        trace.add_step(
            name="Step 1",
            inputs={"x": 10},
            operation="x * 2",
            output=20,
        )
        trace.add_step(
            name="Step 2",
            inputs={"y": 20},
            operation="y + 5",
            output=25,
            note="Added 5",
        )

        assert len(trace.steps) == 2
        assert trace.steps[0].step_order == 1
        assert trace.steps[0].step_name == "Step 1"
        assert trace.steps[1].step_order == 2
        assert trace.steps[1].note == "Added 5"

    def test_occupancy_input_validation(self) -> None:
        """OccupancyInput should validate fields."""
        input_data = OccupancyInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        assert input_data.total_rentable_sqft == Decimal("100000")

    def test_occupancy_result_rate_bounds(self) -> None:
        """OccupancyResult rate should be between 0 and 1."""
        property_id = uuid4()
        trace = CalculationTrace(
            calculation_type="occupancy",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = OccupancyResult(
            occupancy_rate=Decimal("0.85"),
            occupied_sqft=Decimal("85000"),
            total_sqft=Decimal("100000"),
            vacancy_sqft=Decimal("15000"),
            trace=trace,
        )

        assert result.occupancy_rate == Decimal("0.85")

    def test_occupancy_result_rejects_rate_above_1(self) -> None:
        """OccupancyResult should reject rate > 1."""
        property_id = uuid4()
        trace = CalculationTrace(
            calculation_type="occupancy",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        with pytest.raises(ValueError):
            OccupancyResult(
                occupancy_rate=Decimal("1.5"),
                occupied_sqft=Decimal("150000"),
                total_sqft=Decimal("100000"),
                vacancy_sqft=Decimal("0"),
                trace=trace,
            )

    def test_occupancy_result_rejects_rate_below_0(self) -> None:
        """OccupancyResult should reject rate < 0."""
        property_id = uuid4()
        trace = CalculationTrace(
            calculation_type="occupancy",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        with pytest.raises(ValueError):
            OccupancyResult(
                occupancy_rate=Decimal("-0.1"),
                occupied_sqft=Decimal("0"),
                total_sqft=Decimal("100000"),
                vacancy_sqft=Decimal("100000"),
                trace=trace,
            )


class TestLeaseOccupancy:
    """Tests for LeaseOccupancy class."""

    def test_lease_occupancy_creation(self) -> None:
        """LeaseOccupancy should store lease data."""
        lease = LeaseOccupancy(
            lease_id="lease-001",
            tenant_name="Acme Corp",
            sqft=Decimal("5000"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
        )

        assert lease.lease_id == "lease-001"
        assert lease.tenant_name == "Acme Corp"
        assert lease.sqft == Decimal("5000")
        assert lease.start_date == date(2024, 1, 1)
        assert lease.end_date == date(2024, 12, 31)


class TestOccupancyCalculation:
    """Tests for calculate_occupancy function."""

    def test_full_year_full_occupancy(self) -> None:
        """AC1: 100% occupancy for full-year tenant covering entire building."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Big Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        assert result.occupancy_rate == Decimal("1.0000")
        assert result.occupied_sqft == Decimal("100000")
        assert result.vacancy_sqft == Decimal("0")

    def test_half_building_full_year(self) -> None:
        """AC1: 50% occupancy when half building is leased for full year."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Half Corp",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        assert result.occupancy_rate == Decimal("0.5000")
        assert result.occupied_sqft == Decimal("50000")
        assert result.vacancy_sqft == Decimal("50000")

    def test_partial_year_tenant(self) -> None:
        """AC2: Prorate by days for tenant occupying only part of year."""
        property_id = uuid4()
        # Full year is 366 days (2024 is leap year)
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Lease for first half of year (Jan 1 - Jun 30 = 182 days)
        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Half Year Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 6, 30),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        # 182 days out of 366 days = ~0.4973
        expected_rate = Decimal("182") / Decimal("366")
        assert abs(result.occupancy_rate - expected_rate) < Decimal("0.001")

    def test_multiple_partial_tenants(self) -> None:
        """AC2: Multiple tenants with different periods are weighted correctly."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            # Tenant 1: Full year, 50,000 sqft
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Full Year Corp",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            # Tenant 2: Half year (H1), 25,000 sqft
            LeaseOccupancy(
                lease_id="lease-002",
                tenant_name="H1 Corp",
                sqft=Decimal("25000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 6, 30),
            ),
            # Tenant 3: Half year (H2), 25,000 sqft
            LeaseOccupancy(
                lease_id="lease-003",
                tenant_name="H2 Corp",
                sqft=Decimal("25000"),
                start_date=date(2024, 7, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        result = calculate_occupancy(input_data, leases)

        # Tenant 1: 50,000 * (366/366) = 50,000
        # Tenant 2: 25,000 * (182/366) = ~12,431.69
        # Tenant 3: 25,000 * (184/366) = ~12,568.31
        # Total weighted: ~75,000
        # Occupancy: 75,000 / 100,000 = 0.75
        assert abs(result.occupancy_rate - Decimal("0.75")) < Decimal("0.01")

    def test_vacant_building(self) -> None:
        """AC3: Empty building returns 0% occupancy."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases: list[LeaseOccupancy] = []

        result = calculate_occupancy(input_data, leases)

        assert result.occupancy_rate == Decimal("0")
        assert result.occupied_sqft == Decimal("0")
        assert result.vacancy_sqft == Decimal("100000")

    def test_lease_outside_period(self) -> None:
        """AC3: Lease entirely outside period does not count."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Lease in 2023, before the period
        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Old Corp",
                sqft=Decimal("100000"),
                start_date=date(2023, 1, 1),
                end_date=date(2023, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        assert result.occupancy_rate == Decimal("0")
        assert result.vacancy_sqft == Decimal("100000")

    def test_lease_starts_mid_period(self) -> None:
        """AC2: Lease starting mid-period is prorated from start date."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Lease starts July 1
        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Late Start Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 7, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        # 184 days (Jul 1 - Dec 31) out of 366
        expected_rate = Decimal("184") / Decimal("366")
        assert abs(result.occupancy_rate - expected_rate) < Decimal("0.001")

    def test_lease_ends_mid_period(self) -> None:
        """AC2: Lease ending mid-period is prorated to end date."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Lease ends June 30
        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Early End Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 6, 30),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        # 182 days (Jan 1 - Jun 30) out of 366
        expected_rate = Decimal("182") / Decimal("366")
        assert abs(result.occupancy_rate - expected_rate) < Decimal("0.001")

    def test_returns_decimal_type(self) -> None:
        """AC4: Result occupancy_rate is a Decimal."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Test Corp",
                sqft=Decimal("75000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        assert isinstance(result.occupancy_rate, Decimal)
        assert isinstance(result.occupied_sqft, Decimal)
        assert isinstance(result.vacancy_sqft, Decimal)

    def test_calculation_trace_logged(self) -> None:
        """AC5: Calculation trace captures all steps."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Test Corp",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        assert result.trace is not None
        assert result.trace.calculation_type == "occupancy"
        assert result.trace.property_id == property_id
        assert len(result.trace.steps) >= 2  # At least period days + final calc

        # Verify step names
        step_names = [s.step_name for s in result.trace.steps]
        assert "Calculate period days" in step_names
        assert "Calculate occupancy rate" in step_names

    def test_trace_includes_each_lease(self) -> None:
        """AC5: Trace includes a step for each lease."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Corp A",
                sqft=Decimal("30000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id="lease-002",
                tenant_name="Corp B",
                sqft=Decimal("20000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        result = calculate_occupancy(input_data, leases)

        step_names = [s.step_name for s in result.trace.steps]
        assert "Lease: Corp A" in step_names
        assert "Lease: Corp B" in step_names

    def test_zero_total_sqft(self) -> None:
        """Edge case: Zero total sqft returns 0% occupancy."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("0"),
        )

        leases: list[LeaseOccupancy] = []

        result = calculate_occupancy(input_data, leases)

        assert result.occupancy_rate == Decimal("0")

    def test_overlapping_leases_capped_at_100(self) -> None:
        """Edge case: Overlapping leases don't exceed 100% occupancy rate."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        # Two leases for the same space (shouldn't happen in practice)
        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Corp A",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            LeaseOccupancy(
                lease_id="lease-002",
                tenant_name="Corp B",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
        ]

        result = calculate_occupancy(input_data, leases)

        # Should be capped at 1.0 (100%)
        assert result.occupancy_rate == Decimal("1")
        # Vacancy should not be negative
        assert result.vacancy_sqft >= Decimal("0")

    def test_single_day_period(self) -> None:
        """Edge case: Single day period calculates correctly."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 6, 15),
            period_end=date(2024, 6, 15),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Day Corp",
                sqft=Decimal("100000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]

        result = calculate_occupancy(input_data, leases)

        # 1 day out of 1 day = 100%
        assert result.occupancy_rate == Decimal("1.0000")

    def test_malformed_lease_dates_skipped(self) -> None:
        """Edge case: Lease with start_date > end_date is skipped with warning."""
        property_id = uuid4()
        input_data = OccupancyInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
        )

        leases = [
            # Valid lease
            LeaseOccupancy(
                lease_id="lease-001",
                tenant_name="Good Corp",
                sqft=Decimal("50000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            ),
            # Malformed lease (start > end)
            LeaseOccupancy(
                lease_id="lease-002",
                tenant_name="Bad Corp",
                sqft=Decimal("50000"),
                start_date=date(2024, 12, 31),
                end_date=date(2024, 1, 1),
            ),
        ]

        result = calculate_occupancy(input_data, leases)

        # Only valid lease counts (50% occupancy)
        assert result.occupancy_rate == Decimal("0.5000")
        assert result.occupied_sqft == Decimal("50000")

        # Trace should include warning about malformed lease
        # Steps: 1) Calculate period days, 2) Good Corp, 3) Skipped Bad Corp, 4) Occupancy rate
        assert len(result.trace.steps) == 4
        assert "Skipped: Bad Corp" in result.trace.steps[2].step_name
        assert "WARNING" in result.trace.steps[2].note
        assert "Malformed lease dates" in result.trace.steps[2].note


class TestOccupancyStepUnitAnnotations:
    """Verify unit annotations on occupancy trace steps."""

    def test_calculate_occupancy_rate_step_has_ratio_output_unit(self):
        """'Calculate occupancy rate' step must carry output_unit='ratio'."""
        from app.services.calculation.models import UNIT_AREA, UNIT_RATIO

        input_data = OccupancyInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )
        leases = [
            LeaseOccupancy(
                lease_id="lease-1",
                tenant_name="Acme",
                sqft=Decimal("9500"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ]
        result = calculate_occupancy(input_data, leases)

        rate_step = next(
            s for s in result.trace.steps if s.step_name == "Calculate occupancy rate"
        )
        assert rate_step.output_unit == UNIT_RATIO
        assert rate_step.input_units.get("total_weighted_sqft") == UNIT_AREA
        assert rate_step.input_units.get("total_rentable_sqft") == UNIT_AREA
