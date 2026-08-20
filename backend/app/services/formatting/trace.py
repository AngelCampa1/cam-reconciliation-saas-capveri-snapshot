"""
Unit-aware formatting for calculation-trace values.

A calculation step carries an ``output_unit`` (and per-input ``input_units``)
tag so a ratio is never shown as ``$0.95`` and a square-foot count is never
shown as ``$10,000.00``. The React app formats the in-app audit trail by these
tags (see ``frontend/.../CalculationStepCard.tsx``); this mirrors that logic so
the tenant-facing PDF packet renders the trace identically -- a currency step
the landlord sees as ``$5,000.00`` on screen must not print as bare ``5000.00``
on the document the tenant receives.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from app.services.formatting.currency import format_usd

UNIT_CURRENCY = "currency"
UNIT_RATIO = "ratio"
UNIT_AREA = "area"
UNIT_COUNT = "count"
UNIT_DATE = "date"
UNIT_TEXT = "text"


def _as_decimal(value: object) -> Decimal | None:
    """Return ``value`` as a Decimal, or None when it is not numeric."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):  # avoid treating True/False as 1/0
        return None
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        try:
            return Decimal(value)
        except (InvalidOperation, ValueError):
            return None
    return None


def format_trace_value(value: object, unit: str | None) -> str:
    """Format a single trace value according to its unit tag.

    Defaults to currency when the unit is missing or unrecognized, matching the
    trace-producer contract (the large majority of trace values are dollars).
    Non-numeric values fall back to their string form so labels/codes/dates pass
    through unchanged.
    """
    resolved = unit or UNIT_CURRENCY
    number = _as_decimal(value)

    if resolved == UNIT_RATIO:
        if number is not None:
            sign = "-" if number < 0 else ""
            return f"{sign}{abs(number):.4f}"
        return str(value)

    if resolved == UNIT_AREA:
        if number is not None:
            return f"{number:,.2f} sq ft" if number % 1 else f"{number:,.0f} sq ft"
        return str(value)

    if resolved == UNIT_COUNT:
        if number is not None:
            return f"{number:,.0f}"
        return str(value)

    if resolved in (UNIT_DATE, UNIT_TEXT):
        return str(value)

    # currency and any unknown unit -> currency behavior
    if number is not None:
        return format_usd(number)
    return str(value)
