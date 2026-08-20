"""
USD currency display formatting.

Single source of truth so every client-facing surface (PDF packets, reports,
emails, demand letters, snapshot serialization) renders money the same way --
and, critically, renders a credit as ``-$5,000.00`` rather than ``$-5,000.00``.
A CAM reconciliation can land as a credit (the tenant overpaid estimates), so
negative amounts are routine; floating the minus between the symbol and the
digits reads as a typo on a document a tenant, auditor, or court may review.
"""

from __future__ import annotations

from decimal import Decimal


def format_usd(amount: Decimal | str) -> str:
    """Format USD with two decimals, e.g. ``$1,234.56`` / ``-$1,234.56``."""
    if isinstance(amount, str):
        amount = Decimal(amount)
    if amount < 0:
        return f"-${-amount:,.2f}"
    return f"${amount:,.2f}"


def format_usd_delta(amount: Decimal | str) -> str:
    """Format a signed money change, e.g. ``+$1,234.56`` / ``-$1,234.56``.

    For change/variance columns where the leading sign carries meaning; the sign
    leads the symbol so a decrease never renders as ``$-1,234.56``.
    """
    if isinstance(amount, str):
        amount = Decimal(amount)
    if amount < 0:
        return f"-${-amount:,.2f}"
    return f"+${amount:,.2f}"


def format_usd_whole(amount: Decimal | str) -> str:
    """Format an amount as whole-dollar USD, e.g. ``$1,235`` / ``-$1,235``.

    Used by trend/summary reports where cents add noise; the underlying stored
    value keeps full precision, only the display rounds.
    """
    if isinstance(amount, str):
        amount = Decimal(amount)
    if amount < 0:
        return f"-${-amount:,.0f}"
    return f"${amount:,.0f}"
