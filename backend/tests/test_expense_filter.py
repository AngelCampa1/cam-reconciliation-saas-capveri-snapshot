"""
Tests for variable expense filter.

Story: 6.3 - Create Variable Expense Filter
Tests verify expense categorization for gross-up vs fixed treatment.
"""

from decimal import Decimal
from uuid import uuid4

from app.services.calculation.expense_filter import (
    ExpensePoolSummary,
    FilteredExpenses,
    filter_expenses_for_gross_up,
    get_default_gross_up_setting,
)


class TestExpensePoolSummary:
    """Test ExpensePoolSummary model."""

    def test_create_gross_up_applicable_pool(self):
        """Should create pool summary for gross-up applicable expense."""
        pool = ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Operating Expenses",
            pool_type="operating",
            total_amount=Decimal("10000.00"),
            is_gross_up_applicable=True,
            gross_up_target=Decimal("0.95"),
        )

        assert pool.is_gross_up_applicable is True
        assert pool.total_amount == Decimal("10000.00")
        assert pool.gross_up_target == Decimal("0.95")

    def test_create_fixed_expense_pool(self):
        """Should create pool summary for fixed expense (not grossed up)."""
        pool = ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Real Estate Taxes",
            pool_type="tax",
            total_amount=Decimal("50000.00"),
            is_gross_up_applicable=False,
        )

        assert pool.is_gross_up_applicable is False
        assert pool.total_amount == Decimal("50000.00")
        assert pool.gross_up_target is None


class TestFilteredExpenses:
    """Test FilteredExpenses model."""

    def test_create_filtered_expenses(self):
        """Should create filtered expenses with totals and breakdown."""
        pool1 = ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Utilities",
            pool_type="utility",
            total_amount=Decimal("5000.00"),
            is_gross_up_applicable=True,
        )
        pool2 = ExpensePoolSummary(
            pool_id=uuid4(),
            pool_name="Taxes",
            pool_type="tax",
            total_amount=Decimal("20000.00"),
            is_gross_up_applicable=False,
        )

        filtered = FilteredExpenses(
            gross_up_expenses=Decimal("5000.00"),
            fixed_expenses=Decimal("20000.00"),
            pool_breakdown=[pool1, pool2],
        )

        assert filtered.gross_up_expenses == Decimal("5000.00")
        assert filtered.fixed_expenses == Decimal("20000.00")
        assert len(filtered.pool_breakdown) == 2


class TestFilterExpensesForGrossUp:
    """Test expense filtering logic."""

    def test_filter_variable_expenses(self):
        """AC1: Identifies variable vs fixed expenses."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        pool3_id = uuid4()

        pools = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Utilities",
                pool_type="utility",
                total_amount=Decimal("5000.00"),
                is_gross_up_applicable=True,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Maintenance",
                pool_type="maintenance",
                total_amount=Decimal("8000.00"),
                is_gross_up_applicable=True,
            ),
            pool3_id: ExpensePoolSummary(
                pool_id=pool3_id,
                pool_name="Taxes",
                pool_type="tax",
                total_amount=Decimal("20000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = filter_expenses_for_gross_up(pools)

        # Variable expenses: 5000 + 8000 = 13000
        assert result.gross_up_expenses == Decimal("13000.00")
        # Fixed expenses: 20000
        assert result.fixed_expenses == Decimal("20000.00")

    def test_taxes_not_grossed_up(self):
        """AC2: Taxes are NOT grossed up."""
        pool_id = uuid4()
        pools = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="Real Estate Taxes",
                pool_type="tax",
                total_amount=Decimal("50000.00"),
                is_gross_up_applicable=False,
            )
        }

        result = filter_expenses_for_gross_up(pools)

        assert result.gross_up_expenses == Decimal("0.00")
        assert result.fixed_expenses == Decimal("50000.00")

    def test_insurance_not_grossed_up(self):
        """AC3: Insurance is NOT grossed up."""
        pool_id = uuid4()
        pools = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="Property Insurance",
                pool_type="insurance",
                total_amount=Decimal("15000.00"),
                is_gross_up_applicable=False,
            )
        }

        result = filter_expenses_for_gross_up(pools)

        assert result.gross_up_expenses == Decimal("0.00")
        assert result.fixed_expenses == Decimal("15000.00")

    def test_uses_pool_configuration(self):
        """AC4: Uses pool configuration for categorization."""
        pool1_id = uuid4()
        pool2_id = uuid4()

        # Pool with is_gross_up_applicable=True
        pools = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Custom Operating Pool",
                pool_type="operating",
                total_amount=Decimal("12000.00"),
                is_gross_up_applicable=True,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Custom Fixed Pool",
                pool_type="capital",
                total_amount=Decimal("30000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = filter_expenses_for_gross_up(pools)

        # Respects the is_gross_up_applicable flag
        assert result.gross_up_expenses == Decimal("12000.00")
        assert result.fixed_expenses == Decimal("30000.00")

    def test_returns_pool_breakdown(self):
        """AC5: Logs which pools were grossed up (returns breakdown)."""
        pool1_id = uuid4()
        pool2_id = uuid4()

        pools = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Utilities",
                pool_type="utility",
                total_amount=Decimal("5000.00"),
                is_gross_up_applicable=True,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Taxes",
                pool_type="tax",
                total_amount=Decimal("20000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = filter_expenses_for_gross_up(pools)

        # Should return breakdown of all pools
        assert len(result.pool_breakdown) == 2
        # Check that we can identify which were grossed up
        grossed_up_pools = [
            p for p in result.pool_breakdown if p.is_gross_up_applicable
        ]
        fixed_pools = [p for p in result.pool_breakdown if not p.is_gross_up_applicable]

        assert len(grossed_up_pools) == 1
        assert grossed_up_pools[0].pool_name == "Utilities"
        assert len(fixed_pools) == 1
        assert fixed_pools[0].pool_name == "Taxes"

    def test_negative_pool_amount_from_gl_credits(self):
        """Pool with net GL credits can have negative total — should not raise."""
        pool_id = uuid4()
        pools = {
            pool_id: ExpensePoolSummary(
                pool_id=pool_id,
                pool_name="Operating Expenses",
                pool_type="operating",
                total_amount=Decimal("-5000.00"),
                is_gross_up_applicable=True,
            )
        }

        result = filter_expenses_for_gross_up(pools)

        assert result.gross_up_expenses == Decimal("-5000.00")
        assert result.fixed_expenses == Decimal("0.00")

    def test_empty_pools(self):
        """Should handle empty pool dictionary."""
        result = filter_expenses_for_gross_up({})

        assert result.gross_up_expenses == Decimal("0.00")
        assert result.fixed_expenses == Decimal("0.00")
        assert len(result.pool_breakdown) == 0

    def test_all_variable_expenses(self):
        """Should handle case where all expenses are variable."""
        pool1_id = uuid4()
        pool2_id = uuid4()

        pools = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Utilities",
                pool_type="utility",
                total_amount=Decimal("5000.00"),
                is_gross_up_applicable=True,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Maintenance",
                pool_type="maintenance",
                total_amount=Decimal("8000.00"),
                is_gross_up_applicable=True,
            ),
        }

        result = filter_expenses_for_gross_up(pools)

        assert result.gross_up_expenses == Decimal("13000.00")
        assert result.fixed_expenses == Decimal("0.00")

    def test_all_fixed_expenses(self):
        """Should handle case where all expenses are fixed."""
        pool1_id = uuid4()
        pool2_id = uuid4()

        pools = {
            pool1_id: ExpensePoolSummary(
                pool_id=pool1_id,
                pool_name="Taxes",
                pool_type="tax",
                total_amount=Decimal("20000.00"),
                is_gross_up_applicable=False,
            ),
            pool2_id: ExpensePoolSummary(
                pool_id=pool2_id,
                pool_name="Insurance",
                pool_type="insurance",
                total_amount=Decimal("15000.00"),
                is_gross_up_applicable=False,
            ),
        }

        result = filter_expenses_for_gross_up(pools)

        assert result.gross_up_expenses == Decimal("0.00")
        assert result.fixed_expenses == Decimal("35000.00")


class TestDefaultPoolSettings:
    """Test default gross-up settings for pool types."""

    def test_operating_expenses_default_true(self):
        """Operating expenses should default to gross-up applicable."""
        assert get_default_gross_up_setting("operating") is True

    def test_utility_expenses_default_true(self):
        """Utility expenses should default to gross-up applicable."""
        assert get_default_gross_up_setting("utility") is True

    def test_maintenance_expenses_default_true(self):
        """Maintenance expenses should default to gross-up applicable."""
        assert get_default_gross_up_setting("maintenance") is True

    def test_management_expenses_default_true(self):
        """Management expenses should default to gross-up applicable."""
        assert get_default_gross_up_setting("management") is True

    def test_tax_expenses_default_false(self):
        """Tax expenses should default to NOT gross-up applicable."""
        assert get_default_gross_up_setting("tax") is False

    def test_insurance_expenses_default_false(self):
        """Insurance expenses should default to NOT gross-up applicable."""
        assert get_default_gross_up_setting("insurance") is False

    def test_capital_expenses_default_false(self):
        """Capital expenses should default to NOT gross-up applicable."""
        assert get_default_gross_up_setting("capital") is False

    def test_unknown_pool_type_defaults_true(self):
        """Unknown pool types should default to gross-up applicable."""
        assert get_default_gross_up_setting("unknown_type") is True

    def test_case_insensitive(self):
        """Should handle case-insensitive pool type lookups."""
        assert get_default_gross_up_setting("OPERATING") is True
        assert get_default_gross_up_setting("TAX") is False
        assert get_default_gross_up_setting("Insurance") is False
