"""Historical Analysis Models for Year-over-Year Comparison."""

from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class VarianceLevel(str, Enum):
    """Variance significance level for color-coding."""

    NORMAL = "normal"  # <5% variance (green)
    WARNING = "warning"  # 5-15% variance (amber)
    CRITICAL = "critical"  # >15% variance (red)


class PoolComparison(BaseModel):
    """Comparison data for a single expense pool across years."""

    pool_name: str = Field(..., description="Name of the expense pool")
    amounts: dict[int, Decimal | None] = Field(
        ..., description="Amount for each year (None if pool didn't exist)"
    )
    base_year_amount: Decimal | None = Field(
        None, description="Amount in the base (first) year"
    )
    variance_amount: Decimal | None = Field(
        None, description="Absolute variance from base year ($ change)"
    )
    variance_percent: Decimal | None = Field(
        None, description="Percentage variance from base year (% change)"
    )
    variance_level: VarianceLevel = Field(
        VarianceLevel.NORMAL, description="Significance level of variance"
    )
    matched_from: str | None = Field(
        None, description="Original pool name if fuzzy matched"
    )


class YearOverYearComparison(BaseModel):
    """Complete year-over-year comparison for a property."""

    property_id: UUID = Field(..., description="Property being analyzed")
    property_name: str = Field(..., description="Name of the property")
    years: list[int] = Field(
        ..., description="Years included in comparison (sorted ascending)"
    )
    base_year: int = Field(..., description="Base year for variance calculations")
    pool_comparisons: list[PoolComparison] = Field(
        ..., description="Comparison data for each expense pool"
    )
    total_amounts: dict[int, Decimal] = Field(
        ..., description="Total expenses for each year"
    )
    total_variance_amount: Decimal | None = Field(
        None, description="Total variance from base year ($)"
    )
    total_variance_percent: Decimal | None = Field(
        None, description="Total variance from base year (%)"
    )


class YearOverYearRequest(BaseModel):
    """Request parameters for year-over-year comparison."""

    property_id: UUID = Field(..., description="Property to analyze")
    years: list[int] = Field(
        ..., min_length=2, max_length=4, description="Years to compare (2-4 years)"
    )
    use_fuzzy_matching: bool = Field(
        True, description="Use fuzzy matching for renamed pools"
    )
