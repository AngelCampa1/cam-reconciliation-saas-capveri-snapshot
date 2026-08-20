"""
Occupancy calculation for gross-up.

Calculates weighted average occupancy based on lease data and period.
Occupancy is used to determine gross-up factors for variable expenses.

Formula:
  For each lease:
    days_occupied = min(lease_end, period_end) - max(lease_start, period_start)
    weighted_sqft = lease_sqft * (days_occupied / total_days)

  Occupancy = sum(weighted_sqft) / total_rentable_sqft
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.services.calculation.models import (
    UNIT_AREA,
    UNIT_COUNT,
    UNIT_DATE,
    UNIT_RATIO,
    CalculationTrace,
    OccupancyInput,
    OccupancyResult,
)

# Re-export for backwards compatibility
__all__ = [
    "LeaseOccupancy",
    "OccupancyInput",
    "OccupancyResult",
    "calculate_occupancy",
]


@dataclass
class LeaseOccupancy:
    """Lease data for occupancy calculation.

    Contains the minimum lease information needed to calculate
    weighted occupancy for a period.
    """

    lease_id: str
    tenant_name: str
    sqft: Decimal
    start_date: date
    end_date: date


def calculate_occupancy(
    input_data: OccupancyInput,
    leases: list[LeaseOccupancy],
) -> OccupancyResult:
    """
    Calculate weighted average occupancy for a property/period.

    AC1: Calculates weighted average occupancy for a period
    AC2: Handles partial-year tenants (prorate by days)
    AC3: Handles vacant units correctly
    AC4: Returns occupancy as Decimal (0.0 - 1.0)
    AC5: Logs calculation steps for audit trail

    Args:
        input_data: Property and period information
        leases: Active leases for the property

    Returns:
        OccupancyResult with rate and trace
    """
    trace = CalculationTrace(
        calculation_type="occupancy",
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
    )

    # Calculate total period days (inclusive)
    total_days = (input_data.period_end - input_data.period_start).days + 1
    trace.add_step(
        name="Calculate period days",
        inputs={
            "period_start": input_data.period_start,
            "period_end": input_data.period_end,
        },
        operation="end - start + 1",
        output=total_days,
        input_units={"period_start": UNIT_DATE, "period_end": UNIT_DATE},
        output_unit=UNIT_COUNT,
    )

    # Calculate weighted occupancy for each lease
    total_weighted_sqft = Decimal("0")

    for lease in leases:
        # FIX FC-5: Validate lease dates before processing
        # Malformed leases with start_date > end_date would produce negative days
        if lease.start_date > lease.end_date:
            trace.add_step(
                name=f"Skipped: {lease.tenant_name}",
                inputs={
                    "start_date": lease.start_date,
                    "end_date": lease.end_date,
                },
                operation="Validation failed",
                output=Decimal("0"),
                note="WARNING: Malformed lease dates (start > end) - skipped",
                input_units={"start_date": UNIT_DATE, "end_date": UNIT_DATE},
                output_unit=UNIT_COUNT,
            )
            continue

        # Determine overlap with period
        overlap_start = max(lease.start_date, input_data.period_start)
        overlap_end = min(lease.end_date, input_data.period_end)

        # No overlap if start is after end (lease outside period)
        if overlap_start > overlap_end:
            continue

        # Calculate days in overlap (inclusive)
        overlap_days = (overlap_end - overlap_start).days + 1

        # Calculate weight and weighted sqft
        weight = Decimal(overlap_days) / Decimal(total_days)
        weighted_sqft = lease.sqft * weight

        trace.add_step(
            name=f"Lease: {lease.tenant_name}",
            inputs={
                "sqft": lease.sqft,
                "overlap_days": overlap_days,
                "total_days": total_days,
            },
            operation=f"{lease.sqft} * ({overlap_days} / {total_days})",
            output=weighted_sqft,
            note=f"{overlap_start} to {overlap_end}",
            input_units={
                "sqft": UNIT_AREA,
                "overlap_days": UNIT_COUNT,
                "total_days": UNIT_COUNT,
            },
            output_unit=UNIT_AREA,
        )

        total_weighted_sqft += weighted_sqft

    # Calculate occupancy rate
    if input_data.total_rentable_sqft <= 0:
        occupancy_rate = Decimal("0")
    else:
        occupancy_rate = (
            total_weighted_sqft / input_data.total_rentable_sqft
        ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    # FIX NEW-FC-3: Warn when occupancy > 100% (indicates data integrity issue)
    # This could mean double-booked space or incorrect sqft data
    occupancy_exceeded = occupancy_rate > Decimal("1")
    if occupancy_exceeded:
        trace.add_step(
            name="Occupancy exceeds 100%",
            inputs={
                "calculated_rate": occupancy_rate,
                "total_weighted_sqft": total_weighted_sqft,
                "total_rentable_sqft": input_data.total_rentable_sqft,
            },
            operation="WARNING: occupancy > 100%",
            output=occupancy_rate,
            note="DATA INTEGRITY WARNING: Occupancy exceeds 100%. "
            "This may indicate double-booked space, overlapping leases, "
            "or incorrect square footage data. Please verify lease data.",
            input_units={
                "calculated_rate": UNIT_RATIO,
                "total_weighted_sqft": UNIT_AREA,
                "total_rentable_sqft": UNIT_AREA,
            },
            output_unit=UNIT_RATIO,
        )

    # Cap at 1.0 (can happen with overlapping leases in edge cases)
    occupancy_rate = min(occupancy_rate, Decimal("1"))

    trace.add_step(
        name="Calculate occupancy rate",
        inputs={
            "total_weighted_sqft": total_weighted_sqft,
            "total_rentable_sqft": input_data.total_rentable_sqft,
        },
        operation="weighted_sqft / total_sqft",
        output=occupancy_rate,
        note="Capped at 100%" if occupancy_exceeded else None,
        input_units={
            "total_weighted_sqft": UNIT_AREA,
            "total_rentable_sqft": UNIT_AREA,
        },
        output_unit=UNIT_RATIO,
    )

    # Ensure vacancy is not negative (can happen with overlapping leases)
    vacancy_sqft = max(
        Decimal("0"), input_data.total_rentable_sqft - total_weighted_sqft
    )

    return OccupancyResult(
        occupancy_rate=occupancy_rate,
        occupied_sqft=total_weighted_sqft,
        total_sqft=input_data.total_rentable_sqft,
        vacancy_sqft=vacancy_sqft,
        trace=trace,
    )
