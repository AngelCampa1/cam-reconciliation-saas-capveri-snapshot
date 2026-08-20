"""
Cap bank ledger service.

Reconstructs the year-by-year cap bank timeline from finalized snapshots.
Surfaces the banked/drawn-down capacity that already exists in the cap
calculation engine but was previously invisible to users.
"""

import logging
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from app.services.calculation.caps import CapType
from app.services.calculation.models import (
    CapBankLedger,
    CapBankLedgerEntry,
)

logger = logging.getLogger(__name__)


def simulate_cap_bank(
    base_amount: Decimal,
    cap_rate: Decimal | None = None,
    cap_fixed_amount: Decimal | None = None,
    actual_amounts: list[Decimal] | None = None,
    cap_type: str = CapType.CUMULATIVE,
) -> list[CapBankLedgerEntry]:
    """Simulate year-by-year cap bank balances.

    Uses the same simulation logic as caps.py:295-314 but returns
    per-year entries with opening/closing bank balances.

    Args:
        base_amount: Base year amount (year 0).
        cap_rate: Annual cap rate (e.g., 0.05 for 5%).
        cap_fixed_amount: Fixed dollar max increase per year.
        actual_amounts: Ordered list of actual expenses per year.
        cap_type: Type of cap (cumulative or cumulative_compounding).

    Returns:
        List of CapBankLedgerEntry, one per year.
    """
    if actual_amounts is None or len(actual_amounts) == 0:
        return []

    if cap_type not in (CapType.CUMULATIVE, CapType.CUMULATIVE_COMPOUNDING):
        return []

    if cap_rate is None and cap_fixed_amount is None:
        return []

    q = Decimal("0.01")

    # Calculate annual increase limit
    if cap_type == CapType.CUMULATIVE:
        if cap_fixed_amount is not None:
            annual_increase_limit = cap_fixed_amount
        else:
            assert cap_rate is not None
            annual_increase_limit = (base_amount * cap_rate).quantize(q, ROUND_HALF_UP)
    else:
        # For compounding, annual_increase varies per year — computed in loop
        annual_increase_limit = None

    entries: list[CapBankLedgerEntry] = []
    running_reference = base_amount
    running_bank = Decimal("0")

    for year_idx, actual in enumerate(actual_amounts):
        bank_opening = running_bank.quantize(q, ROUND_HALF_UP)

        if cap_type == CapType.CUMULATIVE_COMPOUNDING:
            # Compounding: max = base * (1 + rate)^year
            years_since_base = year_idx + 1
            if cap_fixed_amount is not None:
                cap_threshold = (
                    base_amount + cap_fixed_amount * years_since_base
                ).quantize(q, ROUND_HALF_UP)
            else:
                assert cap_rate is not None
                cap_threshold = (
                    base_amount * ((Decimal("1") + cap_rate) ** years_since_base)
                ).quantize(q, ROUND_HALF_UP)

            # Effective max includes banked capacity
            effective_max = (cap_threshold + running_bank).quantize(q, ROUND_HALF_UP)
        else:
            # Cumulative (linear): reference + annual_increase + bank
            assert annual_increase_limit is not None
            cap_threshold = (running_reference + annual_increase_limit).quantize(
                q, ROUND_HALF_UP
            )
            effective_max = (cap_threshold + running_bank).quantize(q, ROUND_HALF_UP)

        # Apply cap
        if actual <= effective_max:
            amount_applied = actual
            excess = Decimal("0")
            new_bank = (effective_max - actual).quantize(q, ROUND_HALF_UP)
        else:
            amount_applied = effective_max
            excess = (actual - effective_max).quantize(q, ROUND_HALF_UP)
            new_bank = Decimal("0")

        bank_change = (new_bank - bank_opening).quantize(q, ROUND_HALF_UP)

        entries.append(
            CapBankLedgerEntry(
                period_start=date(2000 + year_idx, 1, 1),  # Placeholder dates
                period_end=date(2000 + year_idx, 12, 31),
                snapshot_id=None,
                cap_type=cap_type,
                cap_rate=cap_rate or Decimal("0"),
                base_year_amount=base_amount,
                cap_threshold=cap_threshold,
                actual_expense=actual,
                amount_applied=amount_applied,
                excess_absorbed_by_landlord=excess,
                bank_opening=bank_opening,
                bank_change=bank_change,
                bank_closing=new_bank,
                finalized_at=None,
            )
        )

        # Move reference forward for next year (cumulative linear only)
        if cap_type == CapType.CUMULATIVE:
            running_reference = actual
        running_bank = new_bank

    return entries


def get_cap_bank_ledger(
    lease_id: UUID,
    supabase_client: Any,
) -> CapBankLedger:
    """Build cap bank ledger from finalized reconciliation snapshots.

    Args:
        lease_id: The lease to build the ledger for.
        supabase_client: Supabase client for DB queries.

    Returns:
        CapBankLedger with all entries, or empty entries if no cumulative cap.

    Raises:
        ValueError: If lease not found.
    """
    # Fetch lease
    lease_response = (
        supabase_client.table("leases").select("*").eq("id", str(lease_id)).execute()
    )
    leases = lease_response.data if hasattr(lease_response, "data") else []
    if not leases:
        raise ValueError(f"Lease {lease_id} not found")

    lease = leases[0]
    recovery_profile = lease.get("recovery_profile", {})
    cap_type = recovery_profile.get("cap_type", "none")
    cap_rate_str = recovery_profile.get("cap_rate")
    cap_fixed_amount_str = recovery_profile.get("cap_fixed_amount")
    base_year_amount_str = recovery_profile.get("base_year_amount")
    tenant_name = lease.get("tenant_name", "")

    # If no cumulative cap, return empty ledger
    if cap_type not in (CapType.CUMULATIVE, CapType.CUMULATIVE_COMPOUNDING):
        return CapBankLedger(
            lease_id=lease_id,
            tenant_name=tenant_name,
            cap_type=cap_type,
            cap_rate=Decimal("0"),
            entries=[],
            current_bank_balance=Decimal("0"),
            total_landlord_absorbed=Decimal("0"),
        )

    cap_rate = Decimal(cap_rate_str) if cap_rate_str else None
    cap_fixed_amount = Decimal(cap_fixed_amount_str) if cap_fixed_amount_str else None
    base_year_amount = (
        Decimal(base_year_amount_str) if base_year_amount_str else Decimal("0")
    )

    # Fetch all finalized snapshots for this lease, ordered by period
    snapshots_response = (
        supabase_client.table("reconciliation_snapshots")
        .select("*")
        .eq("lease_id", str(lease_id))
        .eq("status", "finalized")
        .order("period_start_date", desc=False)
        .execute()
    )
    snapshots = snapshots_response.data if hasattr(snapshots_response, "data") else []

    if not snapshots:
        return CapBankLedger(
            lease_id=lease_id,
            tenant_name=tenant_name,
            cap_type=cap_type,
            cap_rate=cap_rate or Decimal("0"),
            entries=[],
            current_bank_balance=Decimal("0"),
            total_landlord_absorbed=Decimal("0"),
        )

    # Extract actual amounts from snapshots
    actual_amounts = [
        Decimal(str(s.get("tenant_share_before_cap", "0"))) for s in snapshots
    ]

    # Run bank simulation
    raw_entries = simulate_cap_bank(
        base_amount=base_year_amount,
        cap_rate=cap_rate,
        cap_fixed_amount=cap_fixed_amount,
        actual_amounts=actual_amounts,
        cap_type=cap_type,
    )

    # Enrich entries with actual snapshot metadata
    entries: list[CapBankLedgerEntry] = []
    for i, entry in enumerate(raw_entries):
        snapshot = snapshots[i]
        entries.append(
            entry.model_copy(
                update={
                    "period_start": _parse_date(snapshot.get("period_start_date", "")),
                    "period_end": _parse_date(snapshot.get("period_end_date", "")),
                    "snapshot_id": UUID(snapshot["id"]),
                    "finalized_at": _parse_datetime(snapshot.get("finalized_at")),
                }
            )
        )

    current_bank = entries[-1].bank_closing if entries else Decimal("0")
    total_absorbed = sum((e.excess_absorbed_by_landlord for e in entries), Decimal("0"))

    return CapBankLedger(
        lease_id=lease_id,
        tenant_name=tenant_name,
        cap_type=cap_type,
        cap_rate=cap_rate or Decimal("0"),
        entries=entries,
        current_bank_balance=current_bank,
        total_landlord_absorbed=total_absorbed,
    )


def _parse_date(date_str: str) -> date:
    """Parse date string to date object."""
    if not date_str:
        return date(2000, 1, 1)
    return date.fromisoformat(date_str[:10])


def _parse_datetime(dt_str: str | None) -> datetime | None:
    """Parse datetime string to datetime object."""
    if not dt_str:
        return None
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
