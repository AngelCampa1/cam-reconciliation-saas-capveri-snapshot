"""Plan-based feature entitlement helpers.

Supports two billing models:
- **Current**: Reconcile subscription with feature gating via ``has_feature()``
  from generated plan tiers.
- **Deprecated fallback**: Credit pack model checks ``has_ever_purchased``.
"""

import logging
from datetime import UTC, datetime
from typing import Any, cast

from app.services.billing.credits import has_ever_purchased
from app.services.billing.generated_plan_tiers import has_feature

logger = logging.getLogger(__name__)


_SUBSCRIPTION_COLUMNS = (
    "plan,status,billing_model,tier,stripe_subscription_id,current_period_end"
)


def _get_subscription_row(ctx: Any) -> dict[str, Any] | None:
    """Return the subscription row for this org, or None if absent."""
    result = (
        ctx.table("subscriptions")
        .select(_SUBSCRIPTION_COLUMNS)
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    if isinstance(result.data, list):
        return cast(dict[str, Any], result.data[0]) if result.data else None
    return cast(dict[str, Any], result.data)


def _parse_period_end(value: Any) -> datetime | None:
    """Parse an ISO-8601 ``current_period_end`` into a timezone-aware datetime."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _is_card_less_trial_expired(row: dict[str, Any], now: datetime) -> bool:
    """Return True for a card-less trial whose 30-day window has lapsed.

    A card-less local trial is a ``subscriptions`` row with ``status='trialing'``
    and no ``stripe_subscription_id``. Because no Stripe subscription exists, no
    webhook ever fires to expire it — so expiry must be evaluated lazily here:
    True when the stored ``current_period_end`` parses and is in the past.
    """
    if str(row.get("status", "")) != "trialing":
        return False
    if row.get("stripe_subscription_id"):
        return False
    period_end = _parse_period_end(row.get("current_period_end"))
    if period_end is None:
        return False
    return period_end < now


def _persist_trial_expiry(ctx: Any, now: datetime) -> None:
    """Best-effort flip an expired card-less trial to ``paused``.

    Converging the DB lets the existing ``.in_("status", [...])`` queries and
    the already-built paused-subscription paywall light up without a new enum
    value. Never raises — entitlement reads must not fail on a write error.
    """
    try:
        (
            ctx.table("subscriptions")
            .update({"status": "paused", "updated_at": now.isoformat()})
            .eq("organization_id", str(ctx.organization_id))
            .eq("status", "trialing")
            .is_("stripe_subscription_id", "null")
            .execute()
        )
    except Exception as exc:  # noqa: BLE001 - best-effort convergence, never fatal
        logger.warning(
            "Could not persist expired card-less trial to paused for org %s: %s",
            ctx.organization_id,
            exc,
        )


def _effective_status_for_row(ctx: Any, row: dict[str, Any]) -> str:
    """Return the effective subscription status, treating an expired card-less
    trial as ``paused`` and opportunistically persisting that flip."""
    now = datetime.now(UTC)
    if _is_card_less_trial_expired(row, now):
        _persist_trial_expiry(ctx, now)
        return "paused"
    return str(row.get("status", ""))


def effective_subscription_status(ctx: Any) -> str:
    """Return the org's effective subscription status.

    Identical to the stored ``status`` except that an expired card-less trial
    (``trialing`` with no Stripe subscription and a past ``current_period_end``)
    resolves to ``paused``. Returns ``""`` when no subscription row exists.
    """
    row = _get_subscription_row(ctx)
    if row is None:
        return ""
    return _effective_status_for_row(ctx, row)


def has_full_access(ctx: Any) -> bool:
    """Return True when org has full feature access.

    Full access is granted when:
    - subscription status in (active, trialing), OR
    - billing_model = 'credit_pack' AND org has ever purchased credits (backward compat)
    """
    row = _get_subscription_row(ctx)

    if row is None:
        # No subscription row — check if credit pack purchaser (backward compat)
        return has_ever_purchased(ctx)

    billing_model = str(row.get("billing_model", "subscription"))

    if billing_model == "credit_pack":
        return has_ever_purchased(ctx)

    # Subscription model — only active/trialing grants full access. An expired
    # card-less trial resolves to "paused" here (and is persisted), so it loses
    # access the moment the user next hits a gated path.
    return _effective_status_for_row(ctx, row) in {"active", "trialing"}


def get_current_tier(ctx: Any) -> str | None:
    """Return the current subscription tier for the org.

    Canonical tiers after the pricing refresh: "reconcile" and "enterprise".
    Legacy flat-tier values (starter/pro/business), legacy per-building plan
    names (essentials/professional/portfolio/growth_v2), and the old growth
    alias all collapse to Reconcile for backward compat with
    existing DB rows.

    Returns None if no active subscription.
    """
    row = _get_subscription_row(ctx)
    if row is None:
        return None

    status = _effective_status_for_row(ctx, row)
    if status not in {"active", "trialing"}:
        return None

    # Current model: tier column stores the canonical tier ID.
    tier = row.get("tier")
    if tier == "reconcile":
        return str(tier)

    # Retired self-serve tiers now map to Reconcile for backward compatibility.
    if tier in {
        "growth",
        "growth_v2",
        "portfolio",
        "starter",
        "pro",
        "business",
        "control",
        "defend",
        "enterprise",
    }:
        return "reconcile"

    # Fallback: map legacy plan column names to current tier IDs.
    plan = str(row.get("plan", "")).lower()
    if plan == "reconcile":
        return plan
    legacy_self_serve_plans = {
        "essentials",
        "professional",
        "growth",
        "growth_v2",
        "portfolio",
        "starter",
        "pro",
        "business",
        "control",
        "defend",
        "enterprise",
    }
    if plan in legacy_self_serve_plans:
        return "reconcile"
    return None


def has_feature_access(ctx: Any, feature_key: str) -> bool:
    """Check if the org's current subscription tier includes a specific feature.

    Returns False if no active subscription or if the feature is not in the tier.
    Falls back to credit pack model (all features) for backward compat.
    """
    row = _get_subscription_row(ctx)

    if row is None:
        # Credit pack purchasers get all features (backward compat)
        return has_ever_purchased(ctx)

    billing_model = str(row.get("billing_model", "subscription"))
    if billing_model == "credit_pack":
        # Credit pack model grants all features
        return has_ever_purchased(ctx)

    status = _effective_status_for_row(ctx, row)
    if status not in {"active", "trialing"}:
        return False

    tier = get_current_tier(ctx)
    if tier is None:
        return False

    return has_feature(tier, feature_key)


def has_noi_board_access(ctx: Any) -> bool:
    """Return True when org can access NOI impact + board report features."""
    return has_feature_access(ctx, "noi_impact_calculator")


def has_tax_protest_access(ctx: Any) -> bool:
    """Return True when org can access the tax protest data package feature."""
    return has_feature_access(ctx, "tax_protest")
