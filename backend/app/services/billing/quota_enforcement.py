"""Server-side subscription quota enforcement."""

from typing import Any

from fastapi import HTTPException, status

from app.services.billing.entitlements import get_current_tier, has_feature_access
from app.services.billing.generated_plan_tiers import FEATURE_TIERS, TIERS


def _tier_limit(tier_id: str) -> int | None:
    for tier in TIERS:
        if tier["id"] == tier_id:
            return tier["max_units"]
    return None


class QuotaEnforcementService:
    """Checks organization usage against active subscription tier limits."""

    def __init__(self, ctx: Any) -> None:
        self.ctx = ctx

    def assert_can_add_property(self, additional_properties: int = 1) -> None:
        return

    def assert_can_add_billable_units(self, additional_units: int) -> None:
        if additional_units <= 0:
            return
        tier = get_current_tier(self.ctx)
        if tier is None or self._has_legacy_enterprise_subscription():
            return

        max_units = _tier_limit(tier)
        if max_units is None:
            return

        current = self._count_billable_units()
        if current + additional_units > max_units:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=(
                    f"unit_limit_exceeded: The {tier} plan supports up to "
                    f"{max_units} billable units. Upgrade to add more."
                ),
            )

    def assert_can_set_billable_unit_count(self, target_count: int) -> None:
        current = self._count_billable_units()
        self.assert_can_add_billable_units(target_count - current)

    def assert_feature_access(self, feature_key: str) -> None:
        if has_feature_access(self.ctx, feature_key):
            return
        required = FEATURE_TIERS.get(feature_key, "a higher")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                f"feature_upgrade_required: {feature_key} requires the "
                f"{required} tier or higher."
            ),
        )

    def _count_properties(self) -> int:
        result = (
            self.ctx.table("properties")
            .select("id", count="exact")
            .eq("organization_id", str(self.ctx.organization_id))
            .execute()
        )
        return int(result.count or len(result.data or []))

    def _count_billable_units(self) -> int:
        result = (
            self.ctx.table("units")
            .select("id,properties!inner(organization_id)", count="exact")
            .eq("properties.organization_id", str(self.ctx.organization_id))
            .execute()
        )
        return int(result.count or len(result.data or []))

    def _has_legacy_enterprise_subscription(self) -> bool:
        result = (
            self.ctx.table("subscriptions")
            .select("tier,plan,status")
            .eq("organization_id", str(self.ctx.organization_id))
            .maybe_single()
            .execute()
        )
        row = result.data if result and result.data else {}
        if row.get("status") not in {"active", "trialing"}:
            return False
        return "enterprise" in {
            str(row.get("tier", "")).lower(),
            str(row.get("plan", "")).lower(),
        }
