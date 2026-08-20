"""GL entry date filtering by accounting basis.

Cash basis: filter by transaction_date (payment date).
Accrual basis: filter by COALESCE(accrual_date, transaction_date).
"""

from datetime import date
from typing import Any

_VALID_BASES = {"cash", "accrual"}


def filter_gl_entries_by_basis(
    entries: list[dict[str, Any]],
    basis: str,
    period_start: date,
    period_end: date,
) -> list[dict[str, Any]]:
    """Filter raw GL entry dicts by accounting basis date range.

    Args:
        entries: Raw GL entry dicts from Supabase query.
        basis: "cash" or "accrual".
        period_start: Inclusive start of the reconciliation period.
        period_end: Inclusive end of the reconciliation period.

    Returns:
        Filtered list of entries whose effective date falls within
        the period.

    Raises:
        ValueError: If basis is not "cash" or "accrual".
    """
    if basis not in _VALID_BASES:
        raise ValueError(
            f"Invalid accounting basis '{basis}'. "
            f"Must be one of: {sorted(_VALID_BASES)}"
        )

    filtered: list[dict[str, Any]] = []
    for entry in entries:
        if basis == "accrual":
            effective = entry.get("accrual_date") or entry.get("transaction_date")
        else:
            effective = entry.get("transaction_date")
        if effective is None:
            continue
        if isinstance(effective, str):
            # A blank/whitespace date cell (common when CSV ingestion stores an
            # empty date as "" rather than NULL) is "no date", not a parse error:
            # treat it like a missing date instead of crashing on
            # ``date.fromisoformat("")``.
            effective = effective.strip()
            if not effective:
                continue
            effective = date.fromisoformat(effective)
        if period_start <= effective <= period_end:
            filtered.append(entry)
    return filtered
