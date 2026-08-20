"""
Subscription plan helpers.

The canonical source of subscription tier data lives in ``plan-tiers.json``
and is compiled into :mod:`app.services.billing.generated_plan_tiers`. This
module wraps those generated symbols with a small, consistent public API.
"""

from app.services.billing.config import get_stripe_settings
from app.services.billing.generated_plan_tiers import (
    LAUNCH_OFFER,
    TIERS,
    TRIAL_DAYS,
    SubscriptionTier,
    get_annual_price,
    get_annual_total_cents,
    get_band_for_count,
    get_features_for_tier,
    get_launch_offer_annual_cents,
    has_feature,
)

# Re-export generated symbols for convenience
__all__ = [
    "TIERS",
    "TRIAL_DAYS",
    "LAUNCH_OFFER",
    "SubscriptionTier",
    "get_tier_details",
    "get_features_for_plan",
    "get_stripe_price_id_for_tier",
    "get_annual_price",
    "get_annual_total_cents",
    "get_annual_total_cents_for_tier",
    "get_launch_offer_annual_cents",
    "get_band_for_count",
    "get_band_for_building_count",
    "has_feature",
]


# ── Subscription tier helpers (current model) ─────────────────────────────────


def get_tier_details(tier_id: str) -> SubscriptionTier:
    """Return the tier dict for a given tier_id.

    Raises KeyError if tier_id is not found.
    """
    for tier in TIERS:
        if tier["id"] == tier_id:
            return tier
    raise KeyError(f"Unknown subscription tier: {tier_id}")


def get_features_for_plan(tier_id: str) -> set[str]:
    """Return the set of feature keys available for a given tier.

    Wraps the generated function for a consistent public API.
    """
    return get_features_for_tier(tier_id)


def get_stripe_price_id_for_tier(tier_id: str, annual: bool = True) -> str:
    """Return the Stripe annual base subscription price ID for a tier."""
    stripe_settings = get_stripe_settings()
    price_map: dict[str, str] = {
        "reconcile_annual": stripe_settings.stripe_price_id_reconcile_annual,
    }
    if not annual:
        raise KeyError("Monthly pricing is no longer available")
    key = f"{tier_id}_annual"
    price_id = price_map.get(key)
    if not price_id:
        raise KeyError(f"No annual Stripe price ID configured for tier: {tier_id}")
    return price_id


def get_annual_total_cents_for_tier(tier_id: str, unit_count: int) -> int | None:
    """Return the total annual charge in cents for a tier and rentable unit count."""
    return get_annual_total_cents(tier_id, unit_count)


def get_band_for_building_count(count: int) -> str:
    """Backward-compatible alias retained for callers not yet renamed."""
    return get_band_for_count(count)
