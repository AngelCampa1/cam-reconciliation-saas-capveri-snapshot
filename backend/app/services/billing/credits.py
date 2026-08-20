"""
Credit pack billing service.

.. deprecated::
    The credit pack billing model is deprecated in favor of annual
    subscription tiers. This module is retained for backward
    compatibility with organizations that purchased credit packs before
    the subscription pivot. Do not add new functionality here.

Manages prepaid audit credit packs for the credit_pack billing model.
All credit consumption uses optimistic concurrency to prevent race conditions.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

AUDIT_CREDIT_PAGE_SIZE = 1000


class InsufficientCreditsError(Exception):
    """Raised when an org has no remaining audit credits."""


class CreditConsumedConcurrentlyError(Exception):
    """Raised when the target credit pack was modified by a concurrent request."""


class DuplicateCreditPackError(Exception):
    """Raised when a credit pack insert violates the unique session constraint."""


def list_audit_credit_rows(
    ctx: Any,
    columns: str,
    *,
    order_by: str | None = None,
    desc: bool = False,
) -> list[dict[str, Any]]:
    """Return all audit credit rows for an org, paging through PostgREST limits."""
    rows: list[dict[str, Any]] = []
    start = 0

    while True:
        query = (
            ctx.table("audit_credits")
            .select(columns)
            .eq("organization_id", str(ctx.organization_id))
        )
        if order_by is not None:
            query = query.order(order_by, desc=desc)

        result = query.range(start, start + AUDIT_CREDIT_PAGE_SIZE - 1).execute()
        page = result.data or []
        rows.extend(page)

        if len(page) < AUDIT_CREDIT_PAGE_SIZE:
            break
        start += AUDIT_CREDIT_PAGE_SIZE

    return rows


def get_credit_balance(ctx: Any) -> dict[str, int]:
    """
    Return aggregated credit balance for the organization.

    Returns:
        dict with total_purchased, total_used, total_remaining
    """
    rows = list_audit_credit_rows(
        ctx, "credits_purchased,credits_used,credits_remaining"
    )
    total_purchased = sum(r.get("credits_purchased", 0) for r in rows)
    total_used = sum(r.get("credits_used", 0) for r in rows)
    total_remaining = sum(r.get("credits_remaining", 0) for r in rows)
    return {
        "total_purchased": total_purchased,
        "total_used": total_used,
        "total_remaining": total_remaining,
    }


def has_ever_purchased(ctx: Any) -> bool:
    """Return True if the org has ever purchased any credit pack."""
    result = (
        ctx.table("audit_credits")
        .select("id")
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    rows = result.data or []
    return len(rows) > 0


def add_credits(
    ctx: Any,
    quantity: int,
    unit_price_cents: int,
    stripe_checkout_session_id: str | None = None,
    stripe_payment_intent_id: str | None = None,
) -> str:
    """
    Insert a new credit pack purchase row.

    Returns the new pack's ID.
    Idempotency is enforced by the UNIQUE constraint on stripe_checkout_session_id
    in the database (raises IntegrityError on duplicate).
    """
    row: dict[str, Any] = {
        "organization_id": str(ctx.organization_id),
        "credits_purchased": quantity,
        "credits_used": 0,
        "unit_price_cents": unit_price_cents,
    }
    if stripe_checkout_session_id:
        row["stripe_checkout_session_id"] = stripe_checkout_session_id
    if stripe_payment_intent_id:
        row["stripe_payment_intent_id"] = stripe_payment_intent_id

    try:
        result = ctx.table("audit_credits").insert(row).execute()
    except Exception as exc:
        exc_str = str(exc).lower()
        if "unique" in exc_str or "duplicate" in exc_str or "23505" in exc_str:
            raise DuplicateCreditPackError(
                f"Duplicate credit pack for session {stripe_checkout_session_id}"
            ) from exc
        raise
    return str(result.data[0]["id"])


def consume_credit(
    ctx: Any,
    reconciliation_snapshot_id: UUID | None = None,
    *,
    max_retries: int = 3,
) -> str:
    """
    Atomically consume one credit from the oldest available pack.

    Uses optimistic concurrency: reads the current credits_used value, then
    performs an UPDATE with a WHERE predicate checking that value hasn't changed.
    If the update affects 0 rows (concurrent modification), retries up to
    max_retries times before raising CreditConsumedConcurrentlyError.

    Args:
        ctx: Organization-scoped DB context.
        reconciliation_snapshot_id: Optional snapshot this credit is for.
        max_retries: Maximum retry attempts on concurrent modification.

    Returns:
        The credit pack ID from which the credit was consumed.

    Raises:
        InsufficientCreditsError: If no credit packs have remaining credits.
        CreditConsumedConcurrentlyError: If concurrent modification persists
            after retries.
    """
    org_id = str(ctx.organization_id)

    for attempt in range(max_retries):
        # Find oldest pack with credits remaining
        pack_result = (
            ctx.table("audit_credits")
            .select("id,credits_purchased,credits_used,credits_remaining")
            .eq("organization_id", org_id)
            .gt("credits_remaining", 0)
            .order("purchased_at")
            .limit(1)
            .execute()
        )

        if not pack_result.data:
            raise InsufficientCreditsError(
                f"Organization {org_id} has no remaining audit credits."
            )

        pack = pack_result.data[0]
        pack_id = pack["id"]
        old_credits_used = pack["credits_used"]
        new_credits_used = old_credits_used + 1

        # Optimistic lock: UPDATE only if credits_used hasn't changed since we read it.
        # This prevents double-spending in concurrent requests.
        update_result = (
            ctx.table("audit_credits")
            .update({"credits_used": new_credits_used})
            .eq("id", pack_id)
            .eq("credits_used", old_credits_used)  # Optimistic lock predicate
            .execute()
        )

        affected = update_result.data or []
        if not affected:
            # Concurrent modification — retry with fresh read
            if attempt == max_retries - 1:
                raise CreditConsumedConcurrentlyError(
                    f"Pack {pack_id} was modified concurrently after {max_retries} retries."  # noqa: E501
                )
            continue

        # Consumption recorded — now write the audit log entry.
        # Note: if this insert fails, the credit is consumed but unlogged.
        # Application monitoring should alert on consumption/log count mismatches.
        log_row: dict[str, Any] = {
            "organization_id": org_id,
            "credit_pack_id": pack_id,
        }
        if reconciliation_snapshot_id is not None:
            log_row["reconciliation_snapshot_id"] = str(reconciliation_snapshot_id)

        ctx.table("credit_consumption_log").insert(log_row).execute()
        return str(pack_id)

    raise CreditConsumedConcurrentlyError(  # unreachable but satisfies type checker
        f"Credit consumption failed after {max_retries} retries."
    )
