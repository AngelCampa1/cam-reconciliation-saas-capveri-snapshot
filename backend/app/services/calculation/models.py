"""
Models for calculation inputs and outputs.

Provides typed structures for calculation inputs, outputs, and
audit trail tracking. All financial values use Decimal for precision.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

# Unit tags for calculation-trace values. These tell the frontend how to format
# each input/output so a ratio is never shown as "$0.90" and a square-foot count
# is never shown as "$10,000.00". The default for any unannotated value is money,
# because the large majority of trace values are dollar amounts.
UNIT_CURRENCY = "currency"  # USD dollar amount, e.g. 1234.56 -> "$1,234.56"
UNIT_RATIO = "ratio"  # fraction/factor/percentage-as-decimal, e.g. 0.95, 1.0556
UNIT_AREA = "area"  # square feet, e.g. 10000 -> "10,000 sq ft"
UNIT_COUNT = "count"  # whole-number tally (days, years, entries, pools)
UNIT_DATE = "date"  # ISO date string, shown as-is
UNIT_TEXT = "text"  # label / code / flag, shown as-is

VALID_UNITS = frozenset(
    {UNIT_CURRENCY, UNIT_RATIO, UNIT_AREA, UNIT_COUNT, UNIT_DATE, UNIT_TEXT}
)


class CalculationStep(BaseModel):
    """Single step in a calculation trace.

    Captures the inputs, operation, and output of each step
    for audit trail purposes.
    """

    step_order: int = Field(ge=1, description="Order of this step in the calculation")
    step_name: str = Field(description="Human-readable name of the step")
    input_values: dict[str, str] = Field(
        default_factory=dict, description="Input values as strings"
    )
    input_units: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Unit tag per input key (currency/ratio/area/count/date/text). "
            "Keys absent here default to currency on display."
        ),
    )
    operation: str = Field(description="Description of the operation performed")
    output_value: str = Field(description="Output value as string")
    output_unit: str = Field(
        default=UNIT_CURRENCY,
        description="Unit tag for output_value (defaults to currency).",
    )
    note: str | None = Field(default=None, description="Optional note or context")


class CalculationTrace(BaseModel):
    """Complete trace of a calculation for audit trail.

    Tracks all steps in a calculation with their inputs and outputs.
    Used for regulatory compliance and debugging.
    """

    calculation_type: str = Field(description="Type of calculation (e.g., 'occupancy')")
    property_id: UUID = Field(description="Property this calculation is for")
    period_start: date = Field(description="Start of the calculation period")
    period_end: date = Field(description="End of the calculation period")
    steps: list[CalculationStep] = Field(
        default_factory=list, description="Ordered list of calculation steps"
    )
    engine_version: str = Field(
        default="",
        description="Git SHA at calculation time — populated by calling code",
    )

    def add_step(
        self,
        name: str,
        inputs: dict[str, str | int | float | Decimal | date],
        operation: str,
        output: Decimal | float | int,
        note: str | None = None,
        input_units: dict[str, str] | None = None,
        output_unit: str = UNIT_CURRENCY,
    ) -> None:
        """Add a step to the trace.

        Args:
            name: Human-readable step name
            inputs: Dictionary of input values
            operation: Description of the operation
            output: Result of this step
            note: Optional note or context
            input_units: Optional unit tag per input key. Keys not listed
                default to currency on display. Only list inputs that are NOT
                dollar amounts (ratios, square feet, counts, dates, labels).
            output_unit: Unit tag for the output value. Defaults to currency;
                set explicitly for non-currency outputs (ratios, counts, area).

        Raises:
            ValueError: If any unit tag is not one of VALID_UNITS. This guards
                against a typo'd tag (e.g. "raito") silently falling back to
                currency formatting and mislabeling a value in the audit trail.
        """
        if output_unit not in VALID_UNITS:
            raise ValueError(
                f"Invalid output_unit {output_unit!r}; expected one of "
                f"{sorted(VALID_UNITS)}"
            )
        if input_units:
            invalid = {u for u in input_units.values() if u not in VALID_UNITS}
            if invalid:
                raise ValueError(
                    f"Invalid input unit tag(s) {sorted(invalid)}; expected one "
                    f"of {sorted(VALID_UNITS)}"
                )
        self.steps.append(
            CalculationStep(
                step_order=len(self.steps) + 1,
                step_name=name,
                input_values={k: str(v) for k, v in inputs.items()},
                input_units=dict(input_units) if input_units else {},
                operation=operation,
                output_value=str(output),
                output_unit=output_unit,
                note=note,
            )
        )


class OccupancyInput(BaseModel):
    """Input for occupancy calculation.

    Defines the property and period for which to calculate
    weighted average occupancy.
    """

    property_id: UUID = Field(description="Property to calculate occupancy for")
    period_start: date = Field(description="Start of the calculation period")
    period_end: date = Field(description="End of the calculation period")
    total_rentable_sqft: Decimal = Field(
        ge=0, description="Total rentable square footage of the property"
    )


class OccupancyResult(BaseModel):
    """Result of occupancy calculation.

    Contains the calculated occupancy rate, breakdown by sqft,
    and complete calculation trace for audit.
    """

    occupancy_rate: Decimal = Field(
        ge=0, le=1, description="Weighted average occupancy (0.0 - 1.0)"
    )
    occupied_sqft: Decimal = Field(ge=0, description="Weighted occupied square footage")
    total_sqft: Decimal = Field(ge=0, description="Total rentable square footage")
    vacancy_sqft: Decimal = Field(ge=0, description="Vacant square footage")
    trace: CalculationTrace = Field(description="Audit trail of calculation steps")


class CapBankLedgerEntry(BaseModel):
    """Single year in the cap bank ledger timeline."""

    period_start: date
    period_end: date
    snapshot_id: UUID | None = None
    cap_type: str
    cap_rate: Decimal
    base_year_amount: Decimal
    cap_threshold: Decimal = Field(description="Max allowed this year (before bank)")
    actual_expense: Decimal = Field(description="tenant_share_before_cap")
    amount_applied: Decimal = Field(
        description="tenant_share_after_cap (what tenant pays)"
    )
    excess_absorbed_by_landlord: Decimal = Field(
        description="savings_from_cap (landlord absorbs this)"
    )
    bank_opening: Decimal = Field(description="Bank balance at start of year")
    bank_change: Decimal = Field(description="+/- change this year")
    bank_closing: Decimal = Field(description="Bank balance at end of year")
    finalized_at: datetime | None = None


class CapBankLedger(BaseModel):
    """Full cap bank ledger for a lease across all finalized periods."""

    lease_id: UUID
    tenant_name: str
    pool_name: str | None = None
    cap_type: str
    cap_rate: Decimal
    entries: list[CapBankLedgerEntry]
    current_bank_balance: Decimal = Field(description="Latest closing balance")
    total_landlord_absorbed: Decimal = Field(description="Sum of all excess")
