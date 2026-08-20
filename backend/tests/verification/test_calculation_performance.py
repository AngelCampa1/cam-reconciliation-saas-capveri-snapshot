"""Performance verification tests for Financial Calculation Engine (Story 24.4).

These tests verify that calculations meet performance SLA requirements.
Other verification aspects (accuracy, determinism, edge cases) are covered by
the existing 269 calculation tests in the test suite.
"""

from __future__ import annotations

import time
from decimal import Decimal

import pytest

from app.services.calculation.base_year import (
    BaseYearInput,
    calculate_base_year_increase,
)
from app.services.calculation.caps import (
    calculate_cumulative_compounding_cap,
    calculate_non_cumulative_cap,
)
from app.services.calculation.gross_up import GrossUpConfig, calculate_gross_up_factor


class TestCalculationPerformance:
    """Verify calculation performance meets SLA requirements."""

    @pytest.mark.slow
    def test_gross_up_factor_performance(self) -> None:
        """Verify gross-up factor calculation is fast enough for production use."""
        config = GrossUpConfig(target_occupancy=Decimal("0.95"))

        start = time.time()

        # Run 10,000 calculations
        for _ in range(10000):
            factor = calculate_gross_up_factor(
                actual_occupancy=Decimal("0.85"), config=config
            )
            assert factor > Decimal("1.0")

        duration = time.time() - start

        # Should complete 10,000 calculations in <1 second
        assert (
            duration < 1.0
        ), f"Took {duration:.3f}s for 10k calculations, expected <1s"

    @pytest.mark.slow
    def test_base_year_calculation_performance(self) -> None:
        """Verify base year calculation is fast enough for production use."""
        input_data = BaseYearInput(
            current_year_expenses=Decimal("120000.00"),
            base_year_amount=Decimal("100000.00"),
            pro_rata_share=Decimal("0.05"),
        )

        start = time.time()

        # Run 10,000 calculations
        for _ in range(10000):
            result = calculate_base_year_increase(input_data)
            assert result.tenant_share >= Decimal("0")

        duration = time.time() - start

        # Should complete 10,000 calculations in <1 second
        assert (
            duration < 1.0
        ), f"Took {duration:.3f}s for 10k calculations, expected <1s"

    @pytest.mark.slow
    def test_non_cumulative_cap_performance(self) -> None:
        """Verify non-cumulative cap calculation is fast enough."""
        start = time.time()

        # Run 10,000 calculations
        for _ in range(10000):
            result = calculate_non_cumulative_cap(
                current_amount=Decimal("107000.00"),
                prior_amount=Decimal("100000.00"),
                cap_rate=Decimal("0.05"),
            )
            assert result.capped_amount > Decimal("0")

        duration = time.time() - start

        # Should complete 10,000 calculations in <1 second
        assert (
            duration < 1.0
        ), f"Took {duration:.3f}s for 10k calculations, expected <1s"

    @pytest.mark.slow
    def test_cumulative_compounding_cap_performance(self) -> None:
        """Verify cumulative compounding cap calculation is fast enough."""
        start = time.time()

        # Run 10,000 calculations (5 years each)
        for _ in range(2000):
            # Simulate 5-year cap calculation
            prior_amounts = []
            for year in range(1, 6):
                result = calculate_cumulative_compounding_cap(
                    current_amount=Decimal("105000.00") + Decimal(str(year * 1000)),
                    base_amount=Decimal("100000.00"),
                    years_since_base=year,
                    cap_rate=Decimal("0.05"),
                    prior_year_amounts=prior_amounts if prior_amounts else None,
                )
                assert result.capped_amount > Decimal("0")
                prior_amounts.append(result.capped_amount)

        duration = time.time() - start

        # Should complete 10,000 calculations in <2 seconds
        assert (
            duration < 2.0
        ), f"Took {duration:.3f}s for 10k calculations, expected <2s"

    @pytest.mark.slow
    def test_batch_calculation_performance(self) -> None:
        """Verify batch processing performance for 100 tenants."""
        # Simulate calculating tenant shares for 100 tenants
        tenants = [
            BaseYearInput(
                current_year_expenses=Decimal("120000.00"),
                base_year_amount=Decimal("100000.00"),
                pro_rata_share=Decimal(f"0.0{i:02d}"),  # Different pro-rata per tenant
            )
            for i in range(1, 101)
        ]

        start = time.time()

        # Calculate for all 100 tenants, 100 times
        for _ in range(100):
            results = [calculate_base_year_increase(tenant) for tenant in tenants]
            assert len(results) == 100

        duration = time.time() - start

        # Should complete 10,000 tenant calculations in <5 seconds
        assert (
            duration < 5.0
        ), f"Took {duration:.3f}s for 10k tenant calculations, expected <5s"
