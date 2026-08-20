"""
Edge case tests for reconciliation orchestrator.

Tests focus on achieving 80% → 95% coverage by testing:
- Empty/missing data scenarios
- Boundary conditions
- Error handling
- Performance with large datasets
"""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.enums import CapType
from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import (
    PropertyReconciliation,
    ReconciliationInput,
    run_property_reconciliation,
)
from app.services.calculation.tenant_share import LeaseTerms
from app.services.extraction.cross_doc_models import TermOverrideSuggestion


@pytest.fixture
def property_id():
    """Test property ID."""
    return uuid4()


@pytest.fixture
def basic_reconciliation_input(property_id):
    """Minimal reconciliation input for testing."""
    return ReconciliationInput(
        property_id=property_id,
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        total_rentable_sqft=Decimal("100000.00"),
        target_occupancy=Decimal("0.95"),
    )


@pytest.fixture
def sample_pool_summaries():
    """Sample expense pool summaries for testing."""
    return {
        uuid4(): ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Utilities",
            pool_type="operating",
            total_amount=Decimal("50000.00"),
            is_gross_up_applicable=True,
        ),
        uuid4(): ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Property Taxes",
            pool_type="tax",
            total_amount=Decimal("30000.00"),
            is_gross_up_applicable=False,
        ),
    }


@pytest.fixture
def mock_supabase():
    """Mock Supabase client for historical data fetching."""
    mock = MagicMock()
    # Default: no historical data
    empty_result = type("Result", (), {"data": []})()
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
        empty_result
    )
    return mock


class TestOrchestratorEmptyDataScenarios:
    """Test orchestrator behavior with empty or missing data."""

    @pytest.mark.asyncio
    async def test_property_with_no_active_leases(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Property with no active leases should return empty tenant reconciliations."""
        # Execute reconciliation with no leases
        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Verify structure
        assert isinstance(result, PropertyReconciliation)
        assert result.property_id == basic_reconciliation_input.property_id
        assert result.period_start == basic_reconciliation_input.period_start
        assert result.period_end == basic_reconciliation_input.period_end

        # Verify empty tenant results
        assert result.tenant_reconciliations == []
        assert result.total_recovery == Decimal("0")

        # Verify property-level totals still calculated
        assert result.total_operating_expenses > Decimal("0")
        assert result.total_grossed_up_expenses >= result.total_operating_expenses

        # Verify trace exists
        assert result.property_trace is not None
        assert len(result.property_trace.steps) > 0

    @pytest.mark.asyncio
    async def test_property_with_no_expense_pools(
        self, basic_reconciliation_input, mock_supabase
    ):
        """Property with no expense pools should handle gracefully."""
        # Create lease without pools
        lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Test Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.NONE,
        )

        # Execute reconciliation with empty pool summaries
        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease],
            pool_summaries={},  # No expense pools
            supabase_client=mock_supabase,
        )

        # Should complete without error
        assert isinstance(result, PropertyReconciliation)
        assert result.total_operating_expenses == Decimal("0")
        assert result.total_grossed_up_expenses == Decimal("0")

        # Tenant should have zero recovery
        assert len(result.tenant_reconciliations) == 1
        assert result.tenant_reconciliations[0].total_recovery == Decimal("0")


class TestOrchestratorBoundaryConditions:
    """Test orchestrator with boundary conditions and edge cases."""

    @pytest.mark.asyncio
    async def test_leases_without_sqft_are_filtered_out(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Leases without sqft should be excluded from gross-up but still get calculated."""
        lease_with_sqft = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Tenant With SQFT",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.NONE,
        )

        lease_without_sqft = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Tenant Without SQFT",
            tenant_sqft=None,  # No sqft
            pro_rata_share=Decimal("0.05"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease_with_sqft, lease_without_sqft],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Both tenants should get reconciliation results
        assert len(result.tenant_reconciliations) == 2

        # Verify occupancy calculation only includes lease with sqft
        # With 10k sqft occupied out of 100k total = 10% occupancy
        assert result.actual_occupancy == Decimal("0.10")

    @pytest.mark.asyncio
    async def test_lease_dates_outside_reconciliation_period(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Leases outside the reconciliation period should contribute zero occupancy."""
        # Lease that ended before reconciliation period
        past_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Past Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2022, 1, 1),
            end_date=date(2023, 12, 31),  # Ended before 2024
            cap_type=CapType.NONE,
        )

        # Lease that starts after reconciliation period
        future_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Future Tenant",
            tenant_sqft=Decimal("15000.00"),
            pro_rata_share=Decimal("0.15"),
            start_date=date(2025, 1, 1),  # Starts after 2024
            end_date=date(2025, 12, 31),
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[past_lease, future_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Both leases still get reconciliation results (they're "active" from API perspective)
        assert len(result.tenant_reconciliations) == 2

        # But occupancy should be 0% (clamping makes effective dates invalid)
        # Actually, the code clamps dates, so past_lease would have start=end=2024-01-01
        # and future_lease would have start=end=2024-12-31
        # This results in 0 days, which contributes 0 occupancy
        # Let's verify total occupancy
        assert result.actual_occupancy == Decimal("0")

    @pytest.mark.asyncio
    async def test_partial_year_lease_occupancy_contribution(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Lease active for partial year should contribute proportional occupancy."""
        # Lease active for 6 months (Jan-Jun 2024)
        partial_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Partial Year Tenant",
            tenant_sqft=Decimal("10000.00"),  # 10% of 100k total
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 6, 30),  # 6 months
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[partial_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Tenant gets full reconciliation
        assert len(result.tenant_reconciliations) == 1

        # Occupancy should be ~5% (10k sqft * 181 days / 366 days / 100k sqft)
        # 2024 is a leap year (366 days)
        # Jan 1 to Jun 30 = 182 days (Jan 31 + Feb 29 + Mar 31 + Apr 30 + May 31 + Jun 30)
        expected_occupancy = (Decimal("10000") * Decimal("182")) / (
            Decimal("366") * Decimal("100000")
        )
        # Should be approximately 0.0497 (4.97%)
        assert abs(result.actual_occupancy - expected_occupancy) < Decimal("0.001")

    @pytest.mark.asyncio
    async def test_lease_with_zero_pro_rata_share(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Lease with 0% pro-rata share should have zero recovery."""
        zero_share_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Zero Share Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0"),  # 0% share
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[zero_share_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Tenant gets reconciliation but with zero recovery
        assert len(result.tenant_reconciliations) == 1
        tenant_result = result.tenant_reconciliations[0]

        assert tenant_result.pro_rata_share == Decimal("0")
        assert tenant_result.tenant_share_before_cap == Decimal("0")
        assert tenant_result.tenant_share_after_cap == Decimal("0")
        assert tenant_result.total_recovery == Decimal("0")


class TestOrchestratorMalformedData:
    """Test orchestrator handling of malformed or invalid lease data."""

    @pytest.mark.asyncio
    async def test_lease_with_inverted_dates_clamped_correctly(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Lease with start > end should be handled by date clamping logic."""
        # Note: The orchestrator clamps dates to reconciliation period
        # If a lease has start_date=2025-01-01 and end_date=2024-01-01 (inverted),
        # after clamping both become 2024-12-31, resulting in 0-day period
        inverted_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Inverted Dates Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2025, 1, 1),  # After period end
            end_date=date(2023, 12, 31),  # Before period start
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[inverted_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Should complete without error
        assert isinstance(result, PropertyReconciliation)
        assert len(result.tenant_reconciliations) == 1

        # Occupancy should be 0 (clamped dates result in invalid period)
        assert result.actual_occupancy == Decimal("0")

    @pytest.mark.asyncio
    async def test_lease_with_missing_optional_fields(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Lease with None values for optional fields should use defaults."""
        minimal_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Minimal Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            # All optional fields = None/defaults
            start_date=None,  # Will default to period_start
            end_date=None,  # Will default to period_end
            base_year=None,
            base_year_amount=None,
            cap_type=CapType.NONE,
            cap_rate=None,
            # admin_fee_percentage has Decimal("0") default, don't set to None
            excluded_pools=[],
            expense_stops=None,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[minimal_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Should complete successfully with defaults
        assert len(result.tenant_reconciliations) == 1
        tenant_result = result.tenant_reconciliations[0]

        # Verify defaults applied
        assert tenant_result.admin_fee == Decimal("0")  # No admin fee
        assert tenant_result.base_year_amount is None
        assert (
            tenant_result.tenant_share_before_cap
            == tenant_result.tenant_share_after_cap
        )  # No cap


class TestOrchestratorPerformance:
    """Test orchestrator performance with large datasets."""

    @pytest.mark.asyncio
    @pytest.mark.slow  # Mark as slow test (optional, can be skipped in quick runs)
    async def test_large_property_1000_tenants_under_30_seconds(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """1000 tenants should complete reconciliation within 30 seconds."""
        import time

        # Generate 1000 tenants
        leases = []
        for i in range(1000):
            lease = LeaseTerms(
                lease_id=uuid4(),
                tenant_name=f"Tenant {i:04d}",
                tenant_sqft=Decimal("100.00"),  # Each tenant has 100 sqft
                pro_rata_share=Decimal("0.001"),  # 0.1% each
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                cap_type=CapType.NONE if i % 3 == 0 else CapType.NON_CUMULATIVE,
                cap_rate=Decimal("0.05") if i % 3 != 0 else None,
                base_year=2023 if i % 5 == 0 else None,
                base_year_amount=Decimal("1000.00") if i % 5 == 0 else None,
            )
            leases.append(lease)

        # Measure execution time
        start_time = time.time()

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=leases,
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        elapsed_time = time.time() - start_time

        # Verify result
        assert len(result.tenant_reconciliations) == 1000
        assert result.total_recovery > Decimal("0")

        # Performance assertion: should complete in under 30 seconds
        assert (
            elapsed_time < 30.0
        ), f"Reconciliation took {elapsed_time:.2f}s (expected < 30s)"

    @pytest.mark.asyncio
    async def test_moderate_property_100_tenants_completes_quickly(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """100 tenants should complete very quickly (sanity check)."""
        import time

        # Generate 100 tenants
        leases = []
        for i in range(100):
            lease = LeaseTerms(
                lease_id=uuid4(),
                tenant_name=f"Tenant {i:03d}",
                tenant_sqft=Decimal("1000.00"),
                pro_rata_share=Decimal("0.01"),  # 1% each
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                cap_type=CapType.NONE,
            )
            leases.append(lease)

        start_time = time.time()

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=leases,
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        elapsed_time = time.time() - start_time

        # Should complete quickly (< 3 seconds for 100 tenants)
        assert len(result.tenant_reconciliations) == 100
        assert (
            elapsed_time < 3.0
        ), f"100 tenants took {elapsed_time:.2f}s (expected < 3s)"


class TestOrchestratorTraceGeneration:
    """Test that orchestrator generates complete audit traces."""

    @pytest.mark.asyncio
    async def test_property_trace_includes_gross_up_steps(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Property trace should include gross-up calculation steps."""
        lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Test Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Verify property trace exists and has steps
        assert result.property_trace is not None
        assert len(result.property_trace.steps) > 0

        # Trace should include gross-up and final summary
        step_names = [step.step_name for step in result.property_trace.steps]
        assert any("occupancy" in name.lower() for name in step_names)
        assert "Total property recovery" in step_names

    @pytest.mark.asyncio
    async def test_tenant_traces_generated_for_all_tenants(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Each tenant should have its own calculation trace."""
        leases = [
            LeaseTerms(
                lease_id=uuid4(),
                tenant_name=f"Tenant {i}",
                tenant_sqft=Decimal("5000.00"),
                pro_rata_share=Decimal("0.05"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
                cap_type=CapType.NONE,
            )
            for i in range(3)
        ]

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=leases,
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Verify each tenant has a trace
        assert len(result.tenant_reconciliations) == 3
        for tenant_recon in result.tenant_reconciliations:
            assert tenant_recon.trace is not None
            assert len(tenant_recon.trace.steps) > 0
            # Trace should be specific to this tenant
            assert tenant_recon.tenant_name in tenant_recon.trace.calculation_type


class TestOrchestratorHistoricalDataIntegration:
    """Test orchestrator integration with historical cap data."""

    @pytest.mark.asyncio
    async def test_orchestrator_fetches_cap_history_for_capped_leases(
        self, basic_reconciliation_input, sample_pool_summaries
    ):
        """Orchestrator should fetch cap history for leases with caps."""
        # Mock Supabase client with historical data
        mock_supabase = MagicMock()
        snapshot_data = [
            {
                "period_start_date": "2023-01-01",
                "period_end_date": "2023-12-31",
                "tenant_share_after_cap": "5000.00",
            }
        ]
        snapshots_result = type("Result", (), {"data": snapshot_data})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            snapshots_result
        )

        lease_with_cap = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Capped Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            base_year=2023,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease_with_cap],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Verify Supabase was called to fetch historical data
        assert mock_supabase.table.called
        assert mock_supabase.table.call_count > 0

        # Verify reconciliation completed
        assert len(result.tenant_reconciliations) == 1

    @pytest.mark.asyncio
    async def test_orchestrator_handles_missing_historical_data_gracefully(
        self, basic_reconciliation_input, sample_pool_summaries
    ):
        """First-year lease with cap should work without historical data."""
        mock_supabase = MagicMock()
        # No historical snapshots
        empty_result = type("Result", (), {"data": []})()
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.lt.return_value.order.return_value.execute.return_value = (
            empty_result
        )

        first_year_lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="First Year Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            start_date=date(2024, 1, 1),
            end_date=date(2024, 12, 31),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),
            base_year=2024,  # Base year is current year
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[first_year_lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Should complete without error
        assert len(result.tenant_reconciliations) == 1
        # For first year with cap, there should be no cap applied (no prior data to compare against)
        tenant_result = result.tenant_reconciliations[0]
        # In first year, before_cap and after_cap might be the same (no historical data to cap against)
        assert tenant_result.total_recovery >= Decimal("0")


class TestSnapshotFreezesLeaseTerms:
    """Test that reconciliation snapshots include frozen lease terms."""

    @pytest.mark.asyncio
    async def test_snapshot_freezes_lease_terms(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """TenantReconciliation includes a frozen copy of the lease terms used."""
        version_id = uuid4()
        lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Frozen Terms Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.NONE,
            admin_fee_percentage=Decimal("0.15"),
            term_version_id=version_id,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        tenant_recon = result.tenant_reconciliations[0]
        assert tenant_recon.term_version_id == version_id
        assert tenant_recon.lease_terms_snapshot is not None
        assert tenant_recon.lease_terms_snapshot["pro_rata_share"] == "0.10"
        assert tenant_recon.lease_terms_snapshot["tenant_name"] == "Frozen Terms Tenant"

    @pytest.mark.asyncio
    async def test_snapshot_none_when_no_version(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """term_version_id is None for leases without versioned terms."""
        lease = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Legacy Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.NONE,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        tenant_recon = result.tenant_reconciliations[0]
        assert tenant_recon.term_version_id is None
        assert (
            tenant_recon.lease_terms_snapshot is not None
        )  # Still frozen, just no version ID

    @pytest.mark.asyncio
    async def test_accepted_cross_doc_override_changes_frozen_terms(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """Accepted cross-doc term overrides are applied before calculation."""
        lease_id = uuid4()
        lease = LeaseTerms(
            lease_id=lease_id,
            tenant_name="Override Tenant",
            tenant_sqft=Decimal("10000.00"),
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.NONE,
        )
        override = TermOverrideSuggestion(
            field_name="pro_rata_share",
            lease_id=str(lease_id),
            current_value="0.10",
            suggested_value="0.12",
            reasoning="CAM statement denominator confirms 12%.",
            confidence=95,
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[lease],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
            cross_doc_overrides=[override],
        )

        tenant_recon = result.tenant_reconciliations[0]
        assert tenant_recon.pro_rata_share == Decimal("0.12")
        assert tenant_recon.lease_terms_snapshot is not None
        assert tenant_recon.lease_terms_snapshot["pro_rata_share"] == "0.12"
        assert any(
            step.step_name == "Cross-Doc Term Overrides Applied - Override Tenant"
            for step in result.property_trace.steps
        )


class TestOrchestratorMetrics:
    """Sentry metrics emitted on reconciliation completion."""

    @pytest.mark.asyncio
    async def test_reconciliation_emits_run_counter(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ):
        """run_property_reconciliation increments cam.reconciliation.run."""
        from unittest.mock import patch

        with (
            patch("sentry_sdk.metrics.count") as mock_count,
            patch("sentry_sdk.metrics.distribution") as mock_dist,
        ):
            await run_property_reconciliation(
                input_data=basic_reconciliation_input,
                leases=[],
                pool_summaries=sample_pool_summaries,
                supabase_client=mock_supabase,
            )

            mock_count.assert_called_once_with("cam.reconciliation.run", 1.0)
            mock_dist.assert_called_once_with(
                "cam.reconciliation.tenant_count", 0.0, unit="none"
            )


# ---------------------------------------------------------------------------
# Cross-doc advisory trace injection
# ---------------------------------------------------------------------------


class TestCrossDocAdvisoryInjection:
    """Tests for cross_doc_advisories param in run_property_reconciliation."""

    @pytest.mark.asyncio
    async def test_advisories_appear_in_property_trace(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ) -> None:
        """Accepted advisories are injected as trace steps before tenant loop."""
        from decimal import Decimal

        from app.services.extraction.cross_doc_models import (
            CrossDocFinding,
            FindingCategory,
            FindingSeverity,
        )

        advisory = CrossDocFinding(
            category=FindingCategory.billing_anomaly,
            severity=FindingSeverity.warning,
            title="High management fee",
            detail="Management fee is 7% of operating expenses, exceeds 5% threshold.",
            affected_pools=["CAM"],
            financial_impact_estimate=Decimal("15000.00"),
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
            cross_doc_advisories=[advisory],
        )

        step_names = [s.step_name for s in result.property_trace.steps]
        assert any("Cross-Doc: High management fee" in n for n in step_names)

    @pytest.mark.asyncio
    async def test_none_advisories_is_no_op(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ) -> None:
        """Passing cross_doc_advisories=None does not add extra trace steps."""
        result_without = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
            cross_doc_advisories=None,
        )
        result_with_none = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
        )

        # Same number of steps in both cases
        assert len(result_without.property_trace.steps) == len(
            result_with_none.property_trace.steps
        )

    @pytest.mark.asyncio
    async def test_advisory_financial_impact_in_trace(
        self, basic_reconciliation_input, sample_pool_summaries, mock_supabase
    ) -> None:
        """Advisory with financial_impact_estimate is reflected in trace output."""
        from decimal import Decimal

        from app.services.extraction.cross_doc_models import (
            CrossDocFinding,
            FindingCategory,
            FindingSeverity,
        )

        advisory = CrossDocFinding(
            category=FindingCategory.cross_doc_mismatch,
            severity=FindingSeverity.critical,
            title="Pro-rata mismatch",
            detail="Lease says 12%, GL implies 15%",
            financial_impact_estimate=Decimal("25000.00"),
        )

        result = await run_property_reconciliation(
            input_data=basic_reconciliation_input,
            leases=[],
            pool_summaries=sample_pool_summaries,
            supabase_client=mock_supabase,
            cross_doc_advisories=[advisory],
        )

        matching_steps = [
            s
            for s in result.property_trace.steps
            if "Cross-Doc: Pro-rata mismatch" in s.step_name
        ]
        assert len(matching_steps) == 1
        assert Decimal(str(matching_steps[0].output_value)) == Decimal("25000.00")
