"""
Tax protest deadline service.

Provides county deadline lookup, effective deadline computation, and
days-remaining calculation for the tax protest data package feature.
"""

import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID

_DEADLINES_PATH = (
    Path(__file__).parent.parent.parent / "data" / "tax_protest_deadlines.json"
)

_cached_deadlines: list["CountyDeadline"] | None = None


def _today() -> date:
    """Return today's date. Extracted for monkeypatching in tests."""
    return date.today()


@dataclass(frozen=True)
class CountyDeadline:
    state: str
    county: str
    deadline_month: int
    deadline_day: int
    notes: str


def load_county_deadlines() -> list[CountyDeadline]:
    """Load and cache county deadlines from the bundled JSON file."""
    global _cached_deadlines
    if _cached_deadlines is None:
        raw = json.loads(_DEADLINES_PATH.read_text(encoding="utf-8"))
        _cached_deadlines = [
            CountyDeadline(
                state=entry["state"],
                county=entry["county"],
                deadline_month=entry["deadline_month"],
                deadline_day=entry["deadline_day"],
                notes=entry.get("notes", ""),
            )
            for entry in raw
        ]
    return _cached_deadlines


def get_deadline_for_county(state: str, county: str) -> CountyDeadline | None:
    """Return the CountyDeadline for the given state/county, or None if not found.

    Lookup is case-insensitive.
    """
    state_upper = state.upper()
    county_title = county.strip().lower()
    for deadline in load_county_deadlines():
        if (
            deadline.state.upper() == state_upper
            and deadline.county.lower() == county_title
        ):
            return deadline
    return None


def compute_effective_deadline(
    county_deadline: CountyDeadline | None,
    override_date: date | None,
    reference_year: int,
) -> date | None:
    """Compute the effective tax protest deadline.

    Priority:
    1. override_date if set
    2. county_deadline resolved to reference_year
    3. None when nothing is configured
    """
    if override_date is not None:
        return override_date
    if county_deadline is not None:
        return date(
            reference_year, county_deadline.deadline_month, county_deadline.deadline_day
        )
    return None


def compute_days_remaining(deadline: date) -> int:
    """Return days until deadline (negative = past deadline)."""
    return (deadline - _today()).days


def get_property_tax_protest_config(ctx: Any, property_id: UUID) -> dict:
    """Fetch tax protest config columns for a property."""
    result = (
        ctx.table("properties")
        .select("state,tax_protest_county,tax_protest_deadline_override")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    if not result.data:
        return {
            "state": None,
            "tax_protest_county": None,
            "tax_protest_deadline_override": None,
        }
    row = result.data[0]
    return {
        "state": row.get("state"),
        "tax_protest_county": row.get("tax_protest_county"),
        "tax_protest_deadline_override": row.get("tax_protest_deadline_override"),
    }
