"""Free-audit entitlement checks used by billing gates.

.. deprecated::
    The free-audit / credit pack billing model is deprecated in favor of
    annual self-serve subscription tiers with the configured free trial.
    This module is retained for backward compatibility. Do not add new
    functionality here.
"""

from typing import Any

from app.services.billing.credits import get_credit_balance, has_ever_purchased

SELF_SERVE_PROPERTY_LIMIT = 50


def _first_row(data: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads that may be dicts or singleton lists."""
    if isinstance(data, dict):
        return data

    if isinstance(data, list) and data:
        first = data[0]
        return first if isinstance(first, dict) else None

    return None


def _normalized_count(result: Any) -> int:
    """Return an integer count from Supabase-style results or mocked objects."""
    count = getattr(result, "count", 0)
    return count if isinstance(count, int) else 0


def has_active_subscription(ctx: Any) -> bool:
    """Return True when org has an active/trialing subscription."""
    result = (
        ctx.table("subscriptions")
        .select("status")
        .eq("organization_id", str(ctx.organization_id))
        .in_("status", ["active", "trialing"])
        .maybe_single()
        .execute()
    )
    return bool(result and result.data)


def has_paused_subscription(ctx: Any) -> bool:
    """Return True when org has a paused subscription that needs billing to resume."""
    result = (
        ctx.table("subscriptions")
        .select("status")
        .eq("organization_id", str(ctx.organization_id))
        .eq("status", "paused")
        .maybe_single()
        .execute()
    )
    return bool(result and result.data)


def has_started_free_audit(ctx: Any, include_snapshots: bool = True) -> bool:
    """Return True once the org has started a reconciliation flow.

    Started means:
    - Any calculation job exists in pending/running/completed, OR
    - Any draft/finalized reconciliation snapshot exists.
    """
    jobs_result = (
        ctx.table("calculation_jobs")
        .select("id", count="exact")
        .eq("organization_id", str(ctx.organization_id))
        .in_("status", ["pending", "running", "completed"])
        .execute()
    )
    if _normalized_count(jobs_result) > 0:
        return True

    if not include_snapshots:
        return False

    snapshots_result = (
        ctx.table("reconciliation_snapshots")
        .select("id", count="exact")
        .eq("organization_id", str(ctx.organization_id))
        .in_("status", ["draft", "finalized"])
        .execute()
    )
    return _normalized_count(snapshots_result) > 0


def has_property_capacity(ctx: Any) -> bool:
    """Return True when the org is still within the self-serve property limit."""
    subscription_result = (
        ctx.table("subscriptions")
        .select("plan,status")
        .eq("organization_id", str(ctx.organization_id))
        .in_("status", ["active", "trialing"])
        .maybe_single()
        .execute()
    )

    subscription_row = _first_row(
        subscription_result.data if subscription_result else None
    )

    if not subscription_row:
        return True

    if str(subscription_row.get("plan", "")).lower() == "enterprise":
        return True

    properties_result = (
        ctx.table("properties")
        .select("id", count="exact")
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    return _normalized_count(properties_result) < SELF_SERVE_PROPERTY_LIMIT


def get_free_audit_status(
    ctx: Any, include_snapshots_in_consumption: bool = True
) -> dict[str, Any]:
    """Get free-audit status flags for UI and API gating.

    Includes credit balance and has_ever_purchased for the credit pack model.
    """
    subscribed = has_active_subscription(ctx)
    paused = has_paused_subscription(ctx)
    started = has_started_free_audit(
        ctx, include_snapshots=include_snapshots_in_consumption
    )
    purchased = has_ever_purchased(ctx)
    balance = get_credit_balance(ctx)
    has_paid_access = subscribed or purchased
    property_capacity = has_property_capacity(ctx)

    return {
        "has_subscription": subscribed,
        "has_paused_subscription": paused,
        "has_ever_purchased": purchased,
        "credit_balance": balance,
        "free_audit_consumed": started and not has_paid_access,
        "can_add_property": (has_paid_access or not started) and property_capacity,
        "can_run_reconciliation": has_paid_access or not started,
        "can_view_draft_report": has_paid_access,
        "can_download_reports": has_paid_access,
    }
