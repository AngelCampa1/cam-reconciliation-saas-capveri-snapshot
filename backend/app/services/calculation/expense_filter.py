"""
Filter expenses by gross-up applicability.

Categorizes expense pools into variable (gross-up applicable) and fixed
(not grossed up) based on pool configuration. This ensures only appropriate
expenses are adjusted for occupancy.

Fixed expenses (NOT grossed up):
    - Real estate taxes
    - Insurance premiums
    - Capital improvements
    - Any pool with is_gross_up_applicable = False

Variable expenses (grossed up):
    - Operating expenses
    - Utilities
    - Maintenance and janitorial
    - Management fees
    - Any pool with is_gross_up_applicable = True
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class ExpensePoolSummary(BaseModel):
    """Summary of expenses in a single pool.

    Contains the total amount and gross-up applicability flag for a pool.
    Used to categorize expenses for gross-up calculation.
    """

    pool_id: UUID = Field(description="Unique pool identifier")
    pool_name: str = Field(description="Display name of the expense pool")
    pool_type: str = Field(description="Type of pool (operating, tax, etc.)")
    total_amount: Decimal = Field(
        description="Total expenses in pool (negative when GL credits exceed charges)"
    )
    is_gross_up_applicable: bool = Field(
        description="Whether this pool should be grossed up"
    )
    gross_up_target: Decimal | None = Field(
        default=None,
        ge=0,
        le=1,
        description="Target occupancy for gross-up (optional)",
    )


class FilteredExpenses(BaseModel):
    """Expenses split by gross-up applicability.

    Separates total expenses into variable (gross-up applicable) and
    fixed (not grossed up), with detailed breakdown by pool.
    """

    gross_up_expenses: Decimal = Field(
        description="Total variable expenses to gross up (negative with net GL credits)"
    )
    fixed_expenses: Decimal = Field(
        description="Total fixed expenses, not grossed up (negative with net GL credits)"  # noqa: E501
    )
    pool_breakdown: list[ExpensePoolSummary] = Field(
        description="Detailed breakdown of all expense pools"
    )


def filter_expenses_for_gross_up(
    pool_totals: dict[UUID, ExpensePoolSummary],
) -> FilteredExpenses:
    """
    Split expenses into gross-up eligible and fixed categories.

    AC1: Identifies variable vs fixed expenses
    AC2: Taxes are NOT grossed up
    AC3: Insurance is NOT grossed up
    AC4: Uses pool configuration for categorization
    AC5: Returns breakdown showing which pools were grossed up

    Args:
        pool_totals: Dictionary mapping pool ID to expense summary

    Returns:
        FilteredExpenses with gross-up vs fixed totals and breakdown
    """
    gross_up_total = Decimal("0")
    fixed_total = Decimal("0")
    breakdown = []

    # Categorize each pool based on is_gross_up_applicable flag
    for pool_id, summary in pool_totals.items():
        breakdown.append(summary)

        if summary.is_gross_up_applicable:
            gross_up_total += summary.total_amount
        else:
            fixed_total += summary.total_amount

    return FilteredExpenses(
        gross_up_expenses=gross_up_total,
        fixed_expenses=fixed_total,
        pool_breakdown=breakdown,
    )


# Standard pool types and their default gross-up applicability
# Based on BOMA CAM reconciliation standards
DEFAULT_POOL_SETTINGS = {
    "operating": True,  # Operating expenses - grossed up
    "utility": True,  # Utilities - grossed up
    "maintenance": True,  # Maintenance - grossed up
    "management": True,  # Management fees - grossed up
    "tax": False,  # Real estate taxes - NOT grossed up
    "insurance": False,  # Insurance premiums - NOT grossed up
    "capital": False,  # Capital improvements - usually excluded
}


def get_default_gross_up_setting(pool_type: str) -> bool:
    """Get default gross-up setting for a pool type.

    Provides standard categorization based on BOMA guidelines.
    Unknown pool types default to True (gross-up applicable) to
    be conservative and avoid under-billing.

    Args:
        pool_type: Type of expense pool

    Returns:
        True if pool should be grossed up by default, False otherwise
    """
    return DEFAULT_POOL_SETTINGS.get(pool_type.lower(), True)
