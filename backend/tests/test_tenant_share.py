"""
Tests for tenant share calculator.

Story 6.13: Create Tenant Share Calculator

Calculates tenant's final recoverable amount by applying:
1. Excluded pools
2. Base year stop
3. Pro-rata share
4. Expense cap
5. Admin fee (with optional cap and exclusions)
"""

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.caps import CapType
from app.services.calculation.models import CalculationTrace
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    _reduce_pools_to_cap,
    calculate_tenant_share,
)


class TestBasicTenantShare:
    """Test basic tenant share calculation."""

    def test_simple_pro_rata_no_adjustments(self):
        """AC1: Basic pro-rata share with no other terms."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),  # 10%
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # $100k * 10% = $10k
        assert result.tenant_share_before_cap == Decimal("10000.00")
        assert result.tenant_share_after_cap == Decimal("10000.00")
        assert result.admin_fee == Decimal("0.00")
        assert result.total_recovery == Decimal("10000.00")
        assert result.cap_applied is False

    def test_proration_factor_reduces_recovery_by_active_days(self):
        """Day-based proration reduces tenant recovery for partial-period terms."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Mid-Year Amendment LLC",
            pro_rata_share=Decimal("0.10"),
            proration_factor=Decimal("0.5"),
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={"CAM": Decimal("100000.00")},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        assert result.tenant_share_before_cap == Decimal("5000.00")
        assert result.tenant_share_after_cap == Decimal("5000.00")
        assert result.total_recovery == Decimal("5000.00")
        assert any(
            step.step_name == "Apply day-based proration" for step in result.trace.steps
        )

    def test_pro_rata_with_admin_fee(self):
        """AC2: Admin fee percentage applied."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),  # 10%
            admin_fee_percentage=Decimal("0.15"),  # 15% admin fee
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Share: $100k * 10% = $10k
        # Admin fee: $10k * 15% = $1,500
        assert result.tenant_share_after_cap == Decimal("10000.00")
        assert result.admin_fee == Decimal("1500.00")
        assert result.total_recovery == Decimal("11500.00")

    def test_excluded_pools_removed(self):
        """AC3: Excluded pools not included in recoverable amount."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            excluded_pools=["Taxes", "Insurance"],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("40000.00"),
                "Janitorial": Decimal("30000.00"),
                "Taxes": Decimal("20000.00"),  # Excluded
                "Insurance": Decimal("10000.00"),  # Excluded
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Excluded: $30k (Taxes + Insurance)
        # Net: $70k (Utilities + Janitorial)
        # Share: $70k * 10% = $7k
        assert result.gross_recoverable == Decimal("100000.00")
        assert result.excluded_amount == Decimal("30000.00")
        assert result.net_recoverable == Decimal("70000.00")
        assert result.tenant_share_before_cap == Decimal("7000.00")
        assert result.total_recovery == Decimal("7000.00")


class TestBaseYearCalculations:
    """Test base year stop calculations."""

    def test_base_year_stop_applied(self):
        """Base year amount subtracted before pro-rata."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            base_year=2023,
            base_year_amount=Decimal("80000.00"),
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Increase: $100k - $80k = $20k
        # Share: $20k * 10% = $2k
        assert result.base_year_amount == Decimal("80000.00")
        assert result.increase_over_base == Decimal("20000.00")
        assert result.tenant_share_before_cap == Decimal("2000.00")
        assert result.total_recovery == Decimal("2000.00")

    def test_no_base_year_uses_full_amount(self):
        """No base year = full amount recoverable."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            base_year=None,
            base_year_amount=None,
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # No base year, full $100k recoverable
        assert result.base_year_amount is None
        assert result.increase_over_base == Decimal("0")
        assert result.tenant_share_before_cap == Decimal("10000.00")


class TestCapApplications:
    """Test expense cap applications."""

    def test_non_cumulative_cap_applied(self):
        """AC4 & AC8: Non-cumulative cap limits increase."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.05"),  # 5% cap
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            prior_year_amount=Decimal("10000.00"),  # Last year: $10k
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Before cap: $100k * 10% = $10k
        # Max allowed: $10k * 1.05 = $10,500
        # After cap: $10k (under cap, no change)
        assert result.tenant_share_before_cap == Decimal("10000.00")
        assert result.cap_applied is False
        assert result.tenant_share_after_cap == Decimal("10000.00")

    def test_cumulative_cap_uses_base_year_amount(self):
        """AC8: Cumulative caps use cap_base_year_amount."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),  # 5% annual cap
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),
            pool_breakdown={},
            prior_year_amount=Decimal("11000.00"),
            cap_base_year_amount=Decimal("10000.00"),  # Original base
            all_prior_amounts=[Decimal("10000.00"), Decimal("10500.00")],
            current_year=2026,  # Year 3
        )

        result = calculate_tenant_share(input_data)

        # Before cap: $120k * 10% = $12k
        # Cumulative max (year 3): $10k * (1 + 0.05 * 3) = $11.5k
        # After cap: $11.5k (capped)
        assert result.tenant_share_before_cap == Decimal("12000.00")
        assert result.cap_applied is True
        assert result.tenant_share_after_cap == Decimal("11500.00")

    def test_cumulative_cap_first_year_no_base(self):
        """Edge case: Cumulative cap in first year without historical base skips cap with warning."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="New Tenant",
            pro_rata_share=Decimal("0.10"),
            cap_type=CapType.CUMULATIVE,
            cap_rate=Decimal("0.05"),  # 5% annual cap
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            prior_year_amount=None,  # No historical data
            cap_base_year_amount=None,  # No base year data
            all_prior_amounts=None,
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Cap should not be applied in first year (no base to compare to)
        # Amount: $100k * 10% = $10k
        assert result.tenant_share_before_cap == Decimal("10000.00")
        assert result.cap_applied is False
        assert result.tenant_share_after_cap == Decimal("10000.00")

        # Trace should include warning about missing base
        trace_steps = [step.step_name for step in result.trace.steps]
        assert "Cumulative cap check" in trace_steps

        # Find the cumulative cap check step
        cap_check_step = next(
            step
            for step in result.trace.steps
            if step.step_name == "Cumulative cap check"
        )
        assert "WARNING" in cap_check_step.note
        assert (
            "first year" in cap_check_step.note
            or "historical base" in cap_check_step.note
        )


class TestAdminFeeFeatures:
    """Test advanced admin fee features."""

    def test_admin_fee_cap_applied(self):
        """AC6: Admin fee respects max dollar cap."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),  # 15%
            admin_fee_cap=Decimal("1000.00"),  # Max $1k admin fee
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Uncapped fee: $10k * 15% = $1,500
        # Capped: $1,000
        assert result.admin_fee == Decimal("1000.00")
        assert result.total_recovery == Decimal("11000.00")  # $10k + $1k

    def test_admin_fee_excludes_tax_insurance_flag(self):
        """AC7: admin_fee_excludes_tax_insurance excludes T&I from admin fee base."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
            admin_fee_excludes_tax_insurance=True,
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("40000.00"),
                "Janitorial": Decimal("30000.00"),
                "Taxes": Decimal("20000.00"),  # Excluded from admin fee
                "Insurance": Decimal("10000.00"),  # Excluded from admin fee
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Tenant share: $100k * 10% = $10k
        # Admin fee base: ($40k + $30k) * 10% = $7k
        # Admin fee: $7k * 15% = $1,050
        assert result.tenant_share_after_cap == Decimal("10000.00")
        assert result.admin_fee == Decimal("1050.00")
        assert result.total_recovery == Decimal("11050.00")

    def test_admin_fee_excluded_pools_configurable(self):
        """AC7: admin_fee_excluded_pools supports custom exclusion list."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
            admin_fee_excluded_pools=["Taxes", "CapEx"],  # Custom exclusions
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("30000.00"),
                "Janitorial": Decimal("30000.00"),
                "Taxes": Decimal("20000.00"),  # Excluded
                "CapEx": Decimal("20000.00"),  # Excluded
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Tenant share: $100k * 10% = $10k
        # Admin fee base: ($30k + $30k) * 10% = $6k
        # Admin fee: $6k * 15% = $900
        assert result.tenant_share_after_cap == Decimal("10000.00")
        assert result.admin_fee == Decimal("900.00")
        assert result.total_recovery == Decimal("10900.00")


class TestCompleteScenarios:
    """Test complete end-to-end scenarios."""

    def test_full_calculation_with_all_features(self):
        """AC4 & AC5: Complete calculation with all terms applied."""
        trace = CalculationTrace(
            calculation_type="tenant_share_complete",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.15"),  # 15%
            admin_fee_percentage=Decimal("0.10"),  # 10% admin
            base_year=2023,
            base_year_amount=Decimal("80000.00"),
            cap_type=CapType.NON_CUMULATIVE,
            cap_rate=Decimal("0.05"),  # 5% cap
            excluded_pools=["CapEx"],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),
            pool_breakdown={
                "Utilities": Decimal("40000.00"),
                "Janitorial": Decimal("30000.00"),
                "Taxes": Decimal("30000.00"),
                "CapEx": Decimal("20000.00"),  # Excluded
            },
            prior_year_amount=Decimal("14000.00"),
            current_year=2024,
        )

        result = calculate_tenant_share(input_data, trace)

        # 1. Exclude CapEx: $120k - $20k = $100k
        # 2. Base year: $100k - $80k = $20k increase
        # 3. Pro-rata: $20k * 15% = $3k
        # 4. Cap check: max = $14k * 1.05 = $14,700 (no cap needed)
        # 5. Admin fee: $3k * 10% = $300
        # Total: $3,300
        assert result.excluded_amount == Decimal("20000.00")
        assert result.net_recoverable == Decimal("100000.00")
        assert result.increase_over_base == Decimal("20000.00")
        assert result.tenant_share_before_cap == Decimal("3000.00")
        assert result.admin_fee == Decimal("300.00")
        assert result.total_recovery == Decimal("3300.00")
        assert len(trace.steps) > 5  # Multiple calculation steps

    def test_trace_shows_complete_breakdown(self):
        """AC5: Trace provides complete audit trail."""
        trace = CalculationTrace(
            calculation_type="tenant_share_audit",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        calculate_tenant_share(input_data, trace)

        # Should have steps for each major calculation
        step_names = [s.step_name.lower() for s in trace.steps]
        assert any("exclude" in name for name in step_names)
        assert any("pro-rata" in name or "pro_rata" in name for name in step_names)
        assert any("admin" in name for name in step_names)
        assert any("total" in name for name in step_names)


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_zero_recoverable_amount(self):
        """Handle zero recoverable expenses."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("0.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        assert result.total_recovery == Decimal("0.00")
        assert result.admin_fee == Decimal("0.00")

    def test_negative_increase_from_base_year(self):
        """Base year higher than current = no recovery."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            base_year=2023,
            base_year_amount=Decimal("120000.00"),  # Higher than current
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Increase: max(0, $100k - $120k) = $0
        assert result.tenant_share_before_cap == Decimal("0.00")
        assert result.admin_fee == Decimal("0.00")
        assert result.total_recovery == Decimal("0.00")

    def test_all_pools_excluded(self):
        """All pools excluded = zero recovery."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            excluded_pools=["Utilities", "Janitorial"],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("60000.00"),
                "Janitorial": Decimal("40000.00"),
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        assert result.excluded_amount == Decimal("100000.00")
        assert result.net_recoverable == Decimal("0.00")
        assert result.total_recovery == Decimal("0.00")

    def test_case_insensitive_pool_matching(self):
        """Pool name matching is case-insensitive."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
            admin_fee_excluded_pools=["TAXES", "insurance"],  # Mixed case
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("40000.00"),
                "taxes": Decimal("30000.00"),  # lowercase
                "Insurance": Decimal("30000.00"),  # Title case
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Admin fee base: $40k (excludes taxes & insurance)
        # Admin fee: $40k * 10% * 15% = $600
        assert result.admin_fee == Decimal("600.00")

    def test_precision_rounding(self):
        """Amounts rounded to 2 decimal places."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.333333"),  # 1/3
            admin_fee_percentage=Decimal("0.15"),
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100.00"),
            pool_breakdown={},
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Share: $100 * 0.333333 = $33.33 (rounded)
        # Admin: $33.33 * 0.15 = $5.00 (rounded)
        assert result.tenant_share_after_cap == Decimal("33.33")
        assert result.admin_fee == Decimal("5.00")
        assert result.total_recovery == Decimal("38.33")

    def test_excluded_pool_not_in_breakdown(self):
        """Handle excluded pool that doesn't exist in pool_breakdown."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            excluded_pools=["Utilities", "NonExistentPool"],  # One doesn't exist
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={
                "Utilities": Decimal("60000.00"),
                "Janitorial": Decimal("40000.00"),
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # Only Utilities excluded (NonExistentPool ignored)
        assert result.excluded_amount == Decimal("60000.00")
        assert result.net_recoverable == Decimal("40000.00")
        # Share: $40k * 10% = $4k
        assert result.tenant_share_after_cap == Decimal("4000.00")

    def test_admin_fee_with_empty_pool_breakdown(self):
        """Handle admin fee calculation when pool_breakdown is empty."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
            admin_fee_excluded_pools=["Taxes"],  # Excluded pools configured
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("0.00"),
            pool_breakdown={},  # Empty breakdown
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        # With empty pool_breakdown, admin_base should be 0
        assert result.tenant_share_after_cap == Decimal("0.00")
        assert result.admin_fee == Decimal("0.00")
        assert result.total_recovery == Decimal("0.00")

    def test_admin_fee_base_never_negative_when_excluded_pools_exceed_net_total(self):
        """Credits cannot make the admin fee base or fee negative."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.15"),
            admin_fee_excluded_pools=["Taxes"],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("50.00"),
            pool_breakdown={
                "CAM Credit": Decimal("-50.00"),
                "Taxes": Decimal("100.00"),
            },
            current_year=2024,
        )

        result = calculate_tenant_share(input_data)

        assert result.tenant_share_after_cap == Decimal("5.00")
        assert result.admin_fee == Decimal("0.00")
        assert result.total_recovery == Decimal("5.00")


class TestBaseYearAdjustmentsInTenantShare:
    """Test that base_year_adjustments flow through LeaseTerms → calculate_tenant_share."""

    def test_adjustments_push_effective_base_above_current(self):
        """Adjustments that push effective base above current → tenant pays 0."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.05"),
            base_year=2021,
            base_year_amount=Decimal("100000.00"),
            base_year_adjustments=[
                BaseYearAdjustmentItem(
                    service_name="24/7 Security",
                    imputed_amount=Decimal("25000.00"),
                    justification="Added 2023",
                )
            ],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),  # < 125k effective base
            pool_breakdown={},
            current_year=2024,
        )
        result = calculate_tenant_share(input_data)
        # effective base = 100k + 25k = 125k; current = 120k → under base → $0
        assert result.tenant_share_after_cap == Decimal("0.00")
        assert result.tenant_share_before_cap == Decimal("0.00")

    def test_adjustments_reduce_but_do_not_eliminate_share(self):
        """Adjustments reduce but don't eliminate the tenant share."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.05"),
            base_year=2021,
            base_year_amount=Decimal("100000.00"),
            base_year_adjustments=[
                BaseYearAdjustmentItem(
                    service_name="Security",
                    imputed_amount=Decimal("10000.00"),
                    justification="Added 2022",
                )
            ],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),
            pool_breakdown={},
            current_year=2024,
        )
        result = calculate_tenant_share(input_data)
        # effective base = 100k + 10k = 110k; increase = 10k; share = 10k * 5% = 500
        assert result.tenant_share_after_cap == Decimal("500.00")

    def test_no_adjustments_does_not_change_behaviour(self):
        """Empty adjustments list: same result as before."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.05"),
            base_year=2021,
            base_year_amount=Decimal("100000.00"),
            base_year_adjustments=[],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),
            pool_breakdown={},
            current_year=2024,
        )
        result = calculate_tenant_share(input_data)
        # increase = 20k; share = 20k * 5% = 1000
        assert result.tenant_share_after_cap == Decimal("1000.00")

    def test_adjustments_appear_in_trace(self):
        """Adjustment service names must appear in the trace steps."""
        adj = BaseYearAdjustmentItem(
            service_name="HVAC Monitoring",
            imputed_amount=Decimal("5000.00"),
            justification="Added 2022",
        )
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.05"),
            base_year=2021,
            base_year_amount=Decimal("100000.00"),
            base_year_adjustments=[adj],
        )
        input_data = TenantShareInput(
            lease_terms=lease_terms,
            total_recoverable_expenses=Decimal("120000.00"),
            pool_breakdown={},
            current_year=2024,
        )
        result = calculate_tenant_share(input_data)
        step_names = [s.step_name for s in result.trace.steps]
        assert any("HVAC Monitoring" in n for n in step_names)


class TestManagementFeeNotInCalculation:
    """management_fee_percentage is carried on LeaseTerms but never altered the math.

    The detection-rule engine (out of scope here) owns management-fee logic.
    Adding it to total_recovery would double-count recovery, so the calculation
    must ignore the field entirely.
    """

    def test_management_fee_field_accepted_on_lease_terms(self):
        """LeaseTerms accepts a management_fee_percentage distinct from admin fee."""
        lease_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.05"),
            management_fee_percentage=Decimal("0.04"),
        )
        assert lease_terms.management_fee_percentage == Decimal("0.04")
        assert lease_terms.admin_fee_percentage == Decimal("0.05")

    def test_management_fee_does_not_change_total_recovery(self):
        """A management fee must NOT be added to total_recovery (no double-count)."""
        base_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
        )
        with_fee_terms = LeaseTerms(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            pro_rata_share=Decimal("0.10"),
            management_fee_percentage=Decimal("0.04"),
        )

        def _run(terms: LeaseTerms):
            return calculate_tenant_share(
                TenantShareInput(
                    lease_terms=terms,
                    total_recoverable_expenses=Decimal("100000.00"),
                    pool_breakdown={},
                    current_year=2024,
                )
            )

        baseline = _run(base_terms)
        with_fee = _run(with_fee_terms)

        assert with_fee.total_recovery == baseline.total_recovery == Decimal("10000.00")
        assert with_fee.admin_fee == baseline.admin_fee == Decimal("0.00")


class TestPerPoolBreakdown:
    """Per-pool recovery allocation (Module A "Produce").

    The aggregate amounts must never change; the per-pool breakdown must sum
    exactly to them, and the cap reduction must land only on controllable pools.
    """

    def _pool_total(self, result, field: str) -> Decimal:
        return sum((getattr(p, field) for p in result.pool_breakdowns), Decimal("0"))

    def test_no_pool_breakdown_yields_empty_breakdown(self):
        """No per-pool input -> aggregate-only (byte-identical legacy behavior)."""
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("0.10"),
                ),
                total_recoverable_expenses=Decimal("100000.00"),
                pool_breakdown={},
                current_year=2024,
            )
        )
        assert result.pool_breakdowns == []

    def test_no_cap_populates_breakdown_without_classification(self):
        """With no cap, the per-pool split is unambiguous and reconciles."""
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("1"),
                ),
                total_recoverable_expenses=Decimal("1000.00"),
                pool_breakdown={"cam": Decimal("700"), "taxes": Decimal("300")},
                current_year=2024,
            )
        )
        assert {p.pool_name for p in result.pool_breakdowns} == {"cam", "taxes"}
        assert self._pool_total(result, "total_recovery") == result.total_recovery
        assert self._pool_total(result, "share_after_cap") == (
            result.tenant_share_after_cap
        )

    def test_cap_without_pool_types_withholds_breakdown(self):
        """A cap reduction with no classification withholds the breakdown."""
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("1"),
                    cap_type=CapType.NON_CUMULATIVE,
                    cap_rate=Decimal("0.05"),
                ),
                total_recoverable_expenses=Decimal("1000.00"),
                pool_breakdown={"cam": Decimal("700"), "taxes": Decimal("300")},
                prior_year_amount=Decimal("500.00"),
                current_year=2024,
            )
        )
        # Cap actually bit (reduced the share) but no pool types were supplied.
        assert result.cap_applied is True
        assert result.tenant_share_after_cap < result.tenant_share_before_cap
        assert result.pool_breakdowns == []

    def test_cap_with_pool_types_hits_controllable_only(self):
        """Pool types let the cap reduction land on controllable pools only."""
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("1"),
                    cap_type=CapType.NON_CUMULATIVE,
                    cap_rate=Decimal("0.05"),
                ),
                total_recoverable_expenses=Decimal("1000.00"),
                pool_breakdown={"cam": Decimal("700"), "taxes": Decimal("300")},
                pool_types={"cam": "operating", "taxes": "tax"},
                prior_year_amount=Decimal("500.00"),
                current_year=2024,
            )
        )
        by_name = {p.pool_name: p for p in result.pool_breakdowns}
        # Tax pool is cap-exempt: its after-cap share equals its before-cap share.
        assert by_name["taxes"].is_cap_eligible is False
        assert by_name["taxes"].cap_adjustment == Decimal("0.00")
        assert by_name["cam"].is_cap_eligible is True
        assert by_name["cam"].cap_adjustment < Decimal("0.00")
        # Reconciliation to the aggregate, to the cent.
        assert self._pool_total(result, "share_after_cap") == (
            result.tenant_share_after_cap
        )
        assert self._pool_total(result, "total_recovery") == result.total_recovery

    def test_cap_spills_to_exempt_pools_through_engine(self):
        """End-to-end: a cap deeper than controllable capacity spills to exempt.

        The scariest allocation branch, driven by the real engine: cam is the only
        controllable pool and is a small slice of the recovery, while the cap cuts
        far more than cam's pre-cap share. cam is zeroed first, the remainder spills
        onto the exempt taxes pool, no pool goes negative, and the per-pool split
        still reconciles exactly to the aggregate after-cap share.
        """
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("1"),
                    cap_type=CapType.NON_CUMULATIVE,
                    cap_rate=Decimal("0.05"),
                    cap_excluded_pools=["taxes"],
                ),
                total_recoverable_expenses=Decimal("1000.00"),
                pool_breakdown={"cam": Decimal("100"), "taxes": Decimal("900")},
                pool_types={"cam": "operating", "taxes": "tax"},
                prior_year_amount=Decimal("500.00"),
                current_year=2024,
            )
        )
        # Cap cut before(1000) -> after(525): a 475 reduction exceeds cam's 100 share.
        assert result.tenant_share_before_cap == Decimal("1000.00")
        assert result.tenant_share_after_cap == Decimal("525.00")
        by_name = {p.pool_name: p for p in result.pool_breakdowns}
        # Controllable cam is fully zeroed first.
        assert by_name["cam"].cap_adjustment == Decimal("-100.00")
        assert by_name["cam"].share_after_cap == Decimal("0.00")
        # The remaining 375 spills onto the exempt taxes pool.
        assert by_name["taxes"].cap_adjustment == Decimal("-375.00")
        assert by_name["taxes"].share_after_cap == Decimal("525.00")
        # No pool ever goes negative, and the split reconciles to the cent.
        assert all(p.share_after_cap >= Decimal("0") for p in result.pool_breakdowns)
        assert self._pool_total(result, "share_after_cap") == (
            result.tenant_share_after_cap
        )
        assert self._pool_total(result, "total_recovery") == result.total_recovery

    def test_lease_cap_excluded_pools_override_enables_breakdown(self):
        """An explicit lease cap-exclusion list is enough to classify pools."""
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Acme Corp",
                    pro_rata_share=Decimal("1"),
                    cap_type=CapType.NON_CUMULATIVE,
                    cap_rate=Decimal("0.05"),
                    cap_excluded_pools=["taxes"],
                ),
                total_recoverable_expenses=Decimal("1000.00"),
                pool_breakdown={"cam": Decimal("700"), "taxes": Decimal("300")},
                prior_year_amount=Decimal("500.00"),
                current_year=2024,
            )
        )
        by_name = {p.pool_name: p for p in result.pool_breakdowns}
        assert by_name["taxes"].cap_adjustment == Decimal("0.00")
        assert by_name["cam"].cap_adjustment < Decimal("0.00")
        assert self._pool_total(result, "total_recovery") == result.total_recovery


class TestManagementFeeCap:
    """BUG-14: management_fee_percentage caps the recoverable Management Fee pool.

    The lease's ``management_fee_percentage`` is a CAP (not an add-on): it limits
    the recoverable management fee to a percentage of operating expenses
    EXCLUDING the fee itself. Any GL-booked management fee above the cap is
    non-recoverable and dropped before tenant-level math.
    """

    @staticmethod
    def _pools():
        # operating non-fee 160k, management fee 40k, tax 80k = 280k total.
        return (
            {
                "Operating Expenses": Decimal("160000.00"),
                "Management Fee": Decimal("40000.00"),
                "Real Estate Taxes": Decimal("80000.00"),
            },
            {
                "Operating Expenses": "operating",
                "Management Fee": "operating",
                "Real Estate Taxes": "tax",
            },
        )

    def test_overbooked_management_fee_capped_to_operating_base(self):
        """Booked fee above cap is reduced to rate * operating-excluding-fee."""
        pool_breakdown, pool_types = self._pools()
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),  # 4% cap
                ),
                total_recoverable_expenses=Decimal("280000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # Base EXCLUDES the fee: 0.04 * 160000 = 6400 cap (NOT 0.04 * 200000).
        # Excess = 40000 - 6400 = 33600 dropped. Recoverable = 280000 - 33600.
        assert result.gross_recoverable == Decimal("246400.00")
        assert result.tenant_share_after_cap == Decimal("246400.00")
        assert result.total_recovery == Decimal("246400.00")
        assert any(
            step.step_name == "Apply management fee cap" for step in result.trace.steps
        )

    def test_fee_within_cap_is_fully_recoverable(self):
        """A booked fee at or below the cap is left untouched."""
        pool_breakdown = {
            "Operating Expenses": Decimal("160000.00"),
            "Management Fee": Decimal("6000.00"),  # below 6400 cap
            "Real Estate Taxes": Decimal("80000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Management Fee": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("246000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        assert result.total_recovery == Decimal("246000.00")
        assert any(
            step.step_name == "Management fee cap check" for step in result.trace.steps
        )

    def test_no_management_fee_percentage_is_a_noop(self):
        """Absent management_fee_percentage leaves recovery unchanged."""
        pool_breakdown, pool_types = self._pools()
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="No Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=None,
                ),
                total_recoverable_expenses=Decimal("280000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        assert result.total_recovery == Decimal("280000.00")

    def test_cap_skipped_when_pool_types_unavailable(self):
        """Without pool types the fee pool cannot be identified; cap is skipped."""
        pool_breakdown, _ = self._pools()
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("280000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=None,
                current_year=2024,
            )
        )
        assert result.total_recovery == Decimal("280000.00")
        assert any(
            step.step_name == "Management fee cap skipped"
            for step in result.trace.steps
        )

    def test_cap_skipped_when_no_management_fee_pool_present(self):
        """A 4% cap with no Management Fee pool leaves recovery unchanged."""
        pool_breakdown = {
            "Operating Expenses": Decimal("160000.00"),
            "Real Estate Taxes": Decimal("80000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("240000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        assert result.total_recovery == Decimal("240000.00")

    def test_cap_interacts_with_pro_rata_share(self):
        """The capped fee flows through pro-rata like any other expense."""
        pool_breakdown, pool_types = self._pools()
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Half-Share Tenant",
                    pro_rata_share=Decimal("0.5"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("280000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # Capped recoverable 246400 * 0.5 share = 123200.
        assert result.total_recovery == Decimal("123200.00")

    def test_cap_uses_real_dollars_not_synthetic_expense_stop_values(self):
        """With expense stops, the cap is driven by original (real) pool dollars.

        When a lease has expense stops, ``pool_breakdown`` carries synthetic
        per-pool values (above_stop / pro_rata_share) while
        ``original_pool_breakdown`` carries the real grossed-up amounts. The cap
        base and the booked fee must come from the real values, otherwise an
        over-booked fee on an expense-stop lease escapes the cap.
        """
        # Real (pre-stop) dollars: operating 160k, fee 40k, tax 80k.
        original_pool_breakdown = {
            "Operating Expenses": Decimal("160000.00"),
            "Management Fee": Decimal("40000.00"),
            "Real Estate Taxes": Decimal("80000.00"),
        }
        # Synthetic post-stop dollars: the Operating pool was stopped down to 1k;
        # the (un-stopped) Management Fee pool keeps its real 40k.
        pool_breakdown = {
            "Operating Expenses": Decimal("1000.00"),
            "Management Fee": Decimal("40000.00"),
            "Real Estate Taxes": Decimal("80000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Management Fee": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Stop + Mgmt Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                # total == sum of the synthetic pool_breakdown (orchestrator
                # contract): 1000 + 40000 + 80000 = 121000.
                total_recoverable_expenses=Decimal("121000.00"),
                pool_breakdown=pool_breakdown,
                original_pool_breakdown=original_pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # Cap base = REAL operating excl fee = 160000 -> cap 6400; booked = REAL
        # 40000 -> excess 33600. total = 121000 - 33600 = 87400. (Had the cap used
        # synthetic Operating=1000, the base would be 40 and excess 39960 -> 81040.)
        assert result.total_recovery == Decimal("87400.00")
        assert any(
            step.step_name == "Apply management fee cap" for step in result.trace.steps
        )

    def test_negative_operating_base_floors_cap_at_zero(self):
        """A net-negative operating base must not yield a negative cap."""
        pool_breakdown = {
            "Operating Expenses": Decimal("-1000.00"),  # GL reversals/credits
            "Management Fee": Decimal("500.00"),
            "Real Estate Taxes": Decimal("80000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Management Fee": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Credit Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("79500.00"),  # -1000+500+80000
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # cap = max(0, 0.04 * -1000) = 0 -> entire 500 fee is excess.
        # total = 79500 - 500 = 79000.
        assert result.total_recovery == Decimal("79000.00")

    def test_zero_operating_base_caps_entire_fee(self):
        """When operating base is 0 the cap is 0 and the whole fee is dropped."""
        pool_breakdown = {
            "Operating Expenses": Decimal("0.00"),
            "Management Fee": Decimal("5000.00"),
            "Real Estate Taxes": Decimal("80000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Management Fee": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="No-Opex Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("85000.00"),  # 0+5000+80000
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # cap = 0.04 * 0 = 0 -> excess 5000 dropped. total = 85000 - 5000 = 80000.
        assert result.total_recovery == Decimal("80000.00")

    def test_multiple_management_fee_pools_split_pro_rata_to_cap(self):
        """Two fee pools are reduced pro-rata so their sum equals the cap."""
        pool_breakdown = {
            "Operating Expenses": Decimal("100000.00"),
            "Management Fee A": Decimal("20000.00"),
            "Management Fee B": Decimal("10000.00"),
            "Real Estate Taxes": Decimal("50000.00"),
        }
        pool_types = {
            "Operating Expenses": "operating",
            "Management Fee A": "operating",
            "Management Fee B": "operating",
            "Real Estate Taxes": "tax",
        }
        result = calculate_tenant_share(
            TenantShareInput(
                lease_terms=LeaseTerms(
                    lease_id=uuid4(),
                    tenant_name="Two-Fee Tenant",
                    pro_rata_share=Decimal("1"),
                    management_fee_percentage=Decimal("0.04"),
                ),
                total_recoverable_expenses=Decimal("180000.00"),
                pool_breakdown=pool_breakdown,
                pool_types=pool_types,
                current_year=2024,
            )
        )
        # Base = 100000 operating (excl. both fee pools) -> cap 4000.
        # Booked = 20000 + 10000 = 30000 -> excess 26000. total = 180000 - 26000.
        assert result.total_recovery == Decimal("154000.00")
        # The two fee pools are split pro-rata by booked amount and sum to the cap:
        # A = 20000/30000 * 4000 = 2666.67; B = 4000 - 2666.67 = 1333.33.
        by_name = {pr.pool_name: pr.recoverable_amount for pr in result.pool_breakdowns}
        assert by_name["Management Fee A"] == Decimal("2666.67")
        assert by_name["Management Fee B"] == Decimal("1333.33")
        assert by_name["Management Fee A"] + by_name["Management Fee B"] == Decimal(
            "4000.00"
        )


class TestReducePoolsToCapNoOp:
    """The cap distributor is a no-op when no pools match or the matched pools
    are already at or below the cap (or sum to zero)."""

    def test_no_matching_pools_leaves_breakdown_untouched(self):
        breakdown = {"Pool A": Decimal("100.00")}
        _reduce_pools_to_cap(breakdown, {"Pool Z"}, Decimal("50.00"))
        assert breakdown == {"Pool A": Decimal("100.00")}

    def test_matched_pools_at_or_below_cap_are_left_alone(self):
        breakdown = {"Fee A": Decimal("30.00"), "Fee B": Decimal("10.00")}
        _reduce_pools_to_cap(breakdown, {"Fee A", "Fee B"}, Decimal("50.00"))
        assert breakdown == {"Fee A": Decimal("30.00"), "Fee B": Decimal("10.00")}

    def test_matched_pools_summing_to_zero_are_left_alone(self):
        breakdown = {"Fee A": Decimal("0.00")}
        _reduce_pools_to_cap(breakdown, {"Fee A"}, Decimal("0.00"))
        assert breakdown == {"Fee A": Decimal("0.00")}
