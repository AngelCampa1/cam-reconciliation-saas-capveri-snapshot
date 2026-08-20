"""Tests for reconciliation orchestrator."""

from datetime import date
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.services.calculation.expense_filter import ExpensePoolSummary
from app.services.calculation.orchestrator import (
    PropertyReconciliation,
    ReconciliationInput,
    TenantReconciliation,
    run_property_reconciliation,
)
from app.services.calculation.tenant_share import LeaseTerms


@pytest.fixture(autouse=True)
def mock_cap_history_fetch():
    """Mock cap history fetching for all orchestrator tests to avoid database calls."""
    # Return empty cap history for all leases (simulates first-year tenants)
    with patch(
        "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories",
        return_value={},
    ):
        yield


class TestReconciliationOrchestrator:
    """Tests for property reconciliation orchestrator."""

    @pytest.mark.asyncio
    async def test_single_tenant_reconciliation(self):
        """AC1: Coordinates all calculation components."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        # Setup input data
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
            target_occupancy=Decimal("0.95"),
        )

        # One tenant with 100% occupancy
        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Acme Corp",
                pro_rata_share=Decimal("1.0"),  # 100%
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            )
        ]

        # Pool summaries (already aggregated with metadata)
        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("100000"),
                is_gross_up_applicable=True,
            )
        }

        # Run orchestrator
        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Verify property-level results
        assert isinstance(result, PropertyReconciliation)
        assert result.property_id == property_id
        assert result.total_operating_expenses == Decimal("100000")
        assert result.total_recovery > Decimal("0")

        # Verify property trace
        assert len(result.property_trace.steps) > 0
        assert result.property_trace.calculation_type == "property_reconciliation"

    @pytest.mark.asyncio
    async def test_pool_breakdowns_thread_onto_tenant_reconciliation(self):
        """Module A 'Produce': the per-pool split is carried on each
        TenantReconciliation and reconciles exactly to total_recovery."""
        property_id = uuid4()
        lease_id = uuid4()
        cam_id = uuid4()
        tax_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )
        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Acme Corp",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            )
        ]
        # Two pools so the split is non-trivial; no cap → breakdown is produced.
        pool_summaries = {
            cam_id: ExpensePoolSummary(
                pool_id=cam_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("60000"),
                is_gross_up_applicable=True,
            ),
            tax_id: ExpensePoolSummary(
                pool_id=tax_id,
                pool_name="Taxes",
                pool_type="tax",
                total_amount=Decimal("40000"),
                is_gross_up_applicable=False,
            ),
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        tenant = result.tenant_reconciliations[0]
        assert tenant.pool_breakdowns, "expected a per-pool split with no cap"
        # Per-pool totals reconcile EXACTLY to the tenant's total recovery.
        pool_total = sum(
            (pool.total_recovery for pool in tenant.pool_breakdowns),
            Decimal("0"),
        )
        assert pool_total == tenant.total_recovery
        assert {pool.pool_name for pool in tenant.pool_breakdowns} == {"CAM", "Taxes"}

    @pytest.mark.asyncio
    async def test_multiple_tenants_reconciliation(self):
        """AC2: Calculates for all tenants in property."""
        property_id = uuid4()
        lease1_id = uuid4()
        lease2_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        # Two tenants sharing the space
        leases = [
            LeaseTerms(
                lease_id=lease1_id,
                tenant_name="Tenant A",
                pro_rata_share=Decimal("0.6"),  # 60%
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("6000"),
            ),
            LeaseTerms(
                lease_id=lease2_id,
                tenant_name="Tenant B",
                pro_rata_share=Decimal("0.4"),  # 40%
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("4000"),
            ),
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="Operating",
                pool_type="operating",
                total_amount=Decimal("100000"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Should have 2 tenant reconciliations
        assert len(result.tenant_reconciliations) == 2

        # Verify both tenants are present
        tenant_names = {t.tenant_name for t in result.tenant_reconciliations}
        assert tenant_names == {"Tenant A", "Tenant B"}

        # Verify each tenant has their share
        for tenant_recon in result.tenant_reconciliations:
            assert tenant_recon.total_recovery > Decimal("0")
            assert tenant_recon.pro_rata_share > Decimal("0")

    @pytest.mark.asyncio
    async def test_complete_reconciliation_snapshot(self):
        """AC3: Creates complete reconciliation snapshot."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Test Tenant",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            )
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="Expenses",
                pool_type="operating",
                total_amount=Decimal("50000"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Verify all snapshot fields are populated
        assert result.property_id == property_id
        assert result.period_start == date(2024, 1, 1)
        assert result.period_end == date(2024, 12, 31)
        assert result.total_rentable_sqft == Decimal("10000")
        assert result.actual_occupancy > Decimal("0")
        assert result.target_occupancy == Decimal("0.95")
        assert result.gross_up_factor >= Decimal("1.0")
        assert result.total_operating_expenses == Decimal("50000")
        assert result.total_grossed_up_expenses >= Decimal("50000")
        assert result.total_recovery > Decimal("0")
        assert len(result.tenant_reconciliations) == 1
        assert result.property_trace is not None

    @pytest.mark.asyncio
    async def test_full_trace_for_every_tenant(self):
        """AC4: Full trace for every tenant."""
        property_id = uuid4()
        lease1_id = uuid4()
        lease2_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        leases = [
            LeaseTerms(
                lease_id=lease1_id,
                tenant_name="Tenant A",
                pro_rata_share=Decimal("0.5"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("5000"),
            ),
            LeaseTerms(
                lease_id=lease2_id,
                tenant_name="Tenant B",
                pro_rata_share=Decimal("0.5"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("5000"),
            ),
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("100000"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Every tenant should have a complete trace
        for tenant_recon in result.tenant_reconciliations:
            assert isinstance(tenant_recon, TenantReconciliation)
            assert tenant_recon.trace is not None
            assert len(tenant_recon.trace.steps) > 0
            # Trace should include tenant name in calculation_type
            assert "Tenant" in tenant_recon.trace.calculation_type

    @pytest.mark.asyncio
    async def test_end_to_end_with_fixtures(self):
        """AC5: End-to-end test with fixture data."""
        property_id = uuid4()
        lease1_id = uuid4()
        lease2_id = uuid4()
        pool1_id = uuid4()
        pool2_id = uuid4()
        pool3_id = uuid4()
        pool4_id = uuid4()

        # Realistic scenario: 2 tenants, multiple expense pools, base year
        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("100000"),
            target_occupancy=Decimal("0.95"),
        )

        leases = [
            LeaseTerms(
                lease_id=lease1_id,
                tenant_name="Major Tenant Inc",
                pro_rata_share=Decimal("0.60"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("60000"),
                base_year=2023,
                base_year_amount=Decimal("50000"),
            ),
            LeaseTerms(
                lease_id=lease2_id,
                tenant_name="Small Business LLC",
                pro_rata_share=Decimal("0.35"),
                admin_fee_percentage=Decimal("0.10"),
                tenant_sqft=Decimal("35000"),
            ),
        ]

        # Multiple expense pools with different types
        pool_summaries = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Janitorial",
                pool_type="operating",
                total_amount=Decimal("80000"),
                is_gross_up_applicable=True,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Utilities",
                pool_type="utility",
                total_amount=Decimal("50000"),
                is_gross_up_applicable=True,
            ),
            pool3_id: ExpensePoolSummary(
                pool_id=pool3_id,
                pool_name="Property Tax",
                pool_type="tax",
                total_amount=Decimal("120000"),
                is_gross_up_applicable=False,
            ),
            pool4_id: ExpensePoolSummary(
                pool_id=pool4_id,
                pool_name="Insurance",
                pool_type="insurance",
                total_amount=Decimal("30000"),
                is_gross_up_applicable=False,
            ),
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Verify complete result
        assert result.total_operating_expenses == Decimal("280000")
        assert result.total_recovery > Decimal("0")
        assert len(result.tenant_reconciliations) == 2

        # Verify tenant 1 (with base year)
        tenant1 = next(
            t
            for t in result.tenant_reconciliations
            if t.tenant_name == "Major Tenant Inc"
        )
        assert tenant1.base_year_amount == Decimal("50000")
        assert tenant1.total_recovery > Decimal("0")
        assert len(tenant1.trace.steps) > 0

        # Verify tenant 2 (no base year)
        tenant2 = next(
            t
            for t in result.tenant_reconciliations
            if t.tenant_name == "Small Business LLC"
        )
        assert tenant2.base_year_amount is None
        assert tenant2.total_recovery > Decimal("0")
        assert len(tenant2.trace.steps) > 0

    @pytest.mark.asyncio
    async def test_expense_stops_applied(self):
        """AC6: Applies expense stops before tenant share calculation."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        # Tenant with expense stops on CAM pool
        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Tenant with Stop",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
                expense_stops={"CAM": Decimal("5.00")},  # $5/sqft stop
            )
        ]

        # CAM expenses that exceed the stop
        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("100000"),  # $10/sqft without stop
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Verify expense stop was applied
        tenant_recon = result.tenant_reconciliations[0]
        assert tenant_recon.trace is not None

        # Check trace for expense stop step
        trace_steps = [step.step_name for step in tenant_recon.trace.steps]
        assert any("expense stop" in step.lower() for step in trace_steps)

        # Verify dollar amounts reflect the stop
        # Stop threshold: $5/sqft × 10,000 sqft = $50,000
        # Tenant share of pool: $100,000 × 1.0 = $100,000
        # Above stop: $100,000 - $50,000 = $50,000
        # tenant_share_before_cap = $50,000 × 1.0 pro_rata = $50,000
        # admin_fee = $50,000 × 0.15 = $7,500
        # total_recovery = $57,500
        assert tenant_recon.total_recovery == Decimal("57500.00")
        assert tenant_recon.admin_fee == Decimal("7500.00")

    @pytest.mark.asyncio
    async def test_expense_stops_reduce_total_recovery(self):
        """Expense stops must reduce total_recovery vs no stops."""
        property_id = uuid4()
        pool_id = uuid4()

        base_input = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("100000"),
                is_gross_up_applicable=True,
            )
        }

        # Without stops
        lease_no_stop = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="No Stop",
            pro_rata_share=Decimal("1.0"),
            admin_fee_percentage=Decimal("0.15"),
            tenant_sqft=Decimal("10000"),
        )
        result_no_stop = await run_property_reconciliation(
            base_input, [lease_no_stop], pool_summaries
        )

        # With stops
        lease_with_stop = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="With Stop",
            pro_rata_share=Decimal("1.0"),
            admin_fee_percentage=Decimal("0.15"),
            tenant_sqft=Decimal("10000"),
            expense_stops={"CAM": Decimal("5.00")},
        )
        result_with_stop = await run_property_reconciliation(
            base_input, [lease_with_stop], pool_summaries
        )

        no_stop_recovery = result_no_stop.tenant_reconciliations[0].total_recovery
        with_stop_recovery = result_with_stop.tenant_reconciliations[0].total_recovery

        assert with_stop_recovery < no_stop_recovery
        # Without stop: $100k × 1.0 × 1.15 = $115,000
        # With stop: $50k × 1.0 × 1.15 = $57,500
        assert no_stop_recovery == Decimal("115000.00")
        assert with_stop_recovery == Decimal("57500.00")

    @pytest.mark.asyncio
    async def test_gross_up_factor_applied(self):
        """Verify gross-up is applied when occupancy < target."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
            target_occupancy=Decimal("0.95"),  # 95% target
        )

        # Only 50% occupied (5000 sqft out of 10000)
        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Solo Tenant",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("5000"),  # 50% occupancy
            )
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("50000"),
                is_gross_up_applicable=True,  # Variable = eligible for gross-up
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Actual occupancy should be 50%
        assert result.actual_occupancy == Decimal("0.5")

        # Gross-up factor should be 0.95 / 0.5 = 1.9
        assert result.gross_up_factor == Decimal("1.9")

        # Grossed-up expenses should be higher than operating expenses
        assert result.total_grossed_up_expenses > result.total_operating_expenses

    @pytest.mark.asyncio
    async def test_no_tenants_returns_empty_result(self):
        """Handle edge case of no tenants."""
        property_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        leases = []  # No tenants
        pool_summaries = {}  # No pools

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Should return valid result with zero tenants
        assert len(result.tenant_reconciliations) == 0
        assert result.total_recovery == Decimal("0")

    @pytest.mark.asyncio
    async def test_orchestrator_uses_batch_cap_history_fetch(self):
        """Verify orchestrator uses batch function instead of N individual queries.

        RED: This test will FAIL because orchestrator still uses fetch_tenant_cap_history
        in a loop instead of fetch_all_tenant_cap_histories.
        """
        from unittest.mock import patch

        from app.services.calculation.data_fetcher import TenantCapHistory

        property_id = uuid4()
        lease1_id = uuid4()
        lease2_id = uuid4()
        lease3_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("30000"),
        )

        # Three tenants
        leases = [
            LeaseTerms(
                lease_id=lease1_id,
                tenant_name="Tenant 1",
                pro_rata_share=Decimal("0.33"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            ),
            LeaseTerms(
                lease_id=lease2_id,
                tenant_name="Tenant 2",
                pro_rata_share=Decimal("0.33"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            ),
            LeaseTerms(
                lease_id=lease3_id,
                tenant_name="Tenant 3",
                pro_rata_share=Decimal("0.34"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            ),
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("90000"),
                is_gross_up_applicable=False,
            )
        }

        # Mock return value for batch function
        batch_return_value = {
            lease1_id: TenantCapHistory(
                prior_year_amount=None, all_prior_amounts=[], cap_base_year_amount=None
            ),
            lease2_id: TenantCapHistory(
                prior_year_amount=None, all_prior_amounts=[], cap_base_year_amount=None
            ),
            lease3_id: TenantCapHistory(
                prior_year_amount=None, all_prior_amounts=[], cap_base_year_amount=None
            ),
        }

        # Patch batch function at the orchestrator module level
        with patch(
            "app.services.calculation.orchestrator.fetch_all_tenant_cap_histories",
            return_value=batch_return_value,
        ) as mock_batch:
            # Run orchestrator
            result = await run_property_reconciliation(
                input_data, leases, pool_summaries
            )

            # Verify batch function was called ONCE
            mock_batch.assert_called_once()

            # Verify reconciliation still works correctly
            assert len(result.tenant_reconciliations) == 3
            assert result.total_recovery > Decimal("0")

    @pytest.mark.asyncio
    async def test_accounting_basis_warning_when_not_specified(self):
        """Warns in trace when accounting_basis is None."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Unspecified Basis Co",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
                accounting_basis=None,
            )
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("50000"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # Find the warning step in tenant trace
        tenant_recon = result.tenant_reconciliations[0]
        warning_steps = [
            s
            for s in tenant_recon.trace.steps
            if s.step_name == "Accounting Basis Warning"
        ]
        assert len(warning_steps) == 1
        assert "Defaulting to cash basis" in warning_steps[0].note

    @pytest.mark.asyncio
    async def test_no_accounting_basis_warning_when_specified(self):
        """No warning when accounting_basis is explicitly set."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )

        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Cash Basis Co",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
                accounting_basis="cash",
            )
        ]

        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("50000"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        tenant_recon = result.tenant_reconciliations[0]
        warning_steps = [
            s
            for s in tenant_recon.trace.steps
            if s.step_name == "Accounting Basis Warning"
        ]
        assert len(warning_steps) == 0

    @pytest.mark.asyncio
    async def test_net_negative_pool_does_not_crash(self):
        """Regression: a pool whose GL credits exceed charges (net-negative
        total_amount) must NOT crash the reconciliation. ExpensePoolSummary and
        FilteredExpenses explicitly support net-negative pools; GrossUpResult
        previously carried `ge=0` validators that raised ValidationError and
        took down the entire run. The recovery is clamped to >= 0 downstream."""
        property_id = uuid4()
        lease_id = uuid4()
        pool_id = uuid4()

        input_data = ReconciliationInput(
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        )
        leases = [
            LeaseTerms(
                lease_id=lease_id,
                tenant_name="Credit Co",
                pro_rata_share=Decimal("1.0"),
                admin_fee_percentage=Decimal("0.15"),
                tenant_sqft=Decimal("10000"),
            )
        ]
        # Net-negative operating pool (credits exceeded charges this period).
        pool_summaries = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="CAM",
                pool_type="operating",
                total_amount=Decimal("-2500.00"),
                is_gross_up_applicable=True,
            )
        }

        result = await run_property_reconciliation(input_data, leases, pool_summaries)

        # The run completes and the credit flows through to a non-positive
        # operating total, while tenant recovery is clamped to >= 0.
        assert result.total_operating_expenses == Decimal("-2500.00")
        tenant_recon = result.tenant_reconciliations[0]
        assert tenant_recon.total_recovery >= Decimal("0")
        for pb in tenant_recon.pool_breakdowns:
            assert pb.recoverable_amount >= Decimal("0")
