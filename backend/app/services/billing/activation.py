"""Helpers for pre-subscription billing activation state.

Stores the authenticated org's in-progress self-serve checkout selection in
``organizations.settings.billing_activation`` so signup can require plan
selection before Stripe creates the real subscription row.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

BILLING_ACTIVATION_KEY = "billing_activation"
SELF_SERVE_BUILDING_LIMIT = 100000
SELF_SERVE_UNIT_LIMIT = 100000


def get_org_settings(db: Any, organization_id: str) -> dict[str, Any]:
    """Return the settings JSON blob for an organization."""
    result = (
        db.table("organizations")
        .select("settings")
        .eq("id", organization_id)
        .single()
        .execute()
    )
    data = result.data if result and isinstance(result.data, dict) else {}
    settings = data.get("settings")
    return settings if isinstance(settings, dict) else {}


def get_billing_activation(settings: dict[str, Any] | None) -> dict[str, Any]:
    """Return the stored billing activation selection."""
    if not isinstance(settings, dict):
        return {}

    activation = settings.get(BILLING_ACTIVATION_KEY)
    return activation if isinstance(activation, dict) else {}


def merge_billing_activation(
    settings: dict[str, Any] | None,
    activation: dict[str, Any],
) -> dict[str, Any]:
    """Return updated org settings with the billing activation payload merged in."""
    merged = dict(settings or {})
    merged[BILLING_ACTIVATION_KEY] = activation
    return merged


def persist_billing_activation(
    db: Any,
    organization_id: str,
    *,
    plan_id: str,
    billing_period: str,
    unit_count: int,
    building_count: int,
    checkout_required: bool = True,
) -> dict[str, Any]:
    """Save the current plan-selection state for an organization."""
    current_settings = get_org_settings(db, organization_id)
    current_activation = get_billing_activation(current_settings)
    activation = {
        "plan_id": plan_id,
        "billing_period": billing_period,
        "unit_count": unit_count,
        "building_count": building_count,
        "checkout_required": checkout_required,
        "selected_at": current_activation.get("selected_at")
        or datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }

    db.table("organizations").update(
        {"settings": merge_billing_activation(current_settings, activation)}
    ).eq("id", organization_id).execute()

    return activation


def mark_checkout_complete(db: Any, organization_id: str) -> None:
    """Mark the billing activation gate as satisfied after Stripe activation."""
    current_settings = get_org_settings(db, organization_id)
    activation = get_billing_activation(current_settings)
    if not activation:
        return

    activation["checkout_required"] = False
    activation["activated_at"] = datetime.now(UTC).isoformat()
    activation["updated_at"] = datetime.now(UTC).isoformat()

    db.table("organizations").update(
        {"settings": merge_billing_activation(current_settings, activation)}
    ).eq("id", organization_id).execute()
