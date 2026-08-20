"""Tests for subscription tier helpers exposed by ``plans.py``."""

import pytest

from app.services.billing.generated_plan_tiers import (
    RECONCILE_FEATURES,
    TRIAL_DAYS,
)
from app.services.billing.plans import (
    get_annual_total_cents_for_tier,
    get_band_for_building_count,
    get_features_for_plan,
    get_stripe_price_id_for_tier,
    get_tier_details,
)


class TestCurrentSubscriptionTiers:
    """Verify the Reconcile unit-based subscription contract."""

    def test_trial_days(self) -> None:
        assert TRIAL_DAYS == 30

    def test_reconcile_tier_details(self) -> None:
        tier = get_tier_details("reconcile")
        assert tier["name"] == "Reconcile"
        assert tier["base_annual"] == 4990
        assert tier["included_units"] == 25
        assert tier["min_units"] == 1
        assert tier["max_units"] is None
        assert tier["unit_pricing_bands"] == [
            {"min_units": 26, "max_units": 150, "price_per_unit_annual": 179},
            {"min_units": 151, "max_units": 500, "price_per_unit_annual": 169},
            {"min_units": 501, "max_units": 2500, "price_per_unit_annual": 159},
            {"min_units": 2501, "max_units": None, "price_per_unit_annual": 149},
        ]

    @pytest.mark.parametrize(
        "legacy_tier", ["control", "defend", "enterprise", "growth"]
    )
    def test_legacy_tiers_no_longer_exist(self, legacy_tier: str) -> None:
        with pytest.raises(KeyError, match="Unknown subscription tier"):
            get_tier_details(legacy_tier)

    @pytest.mark.parametrize(
        ("unit_count", "expected_cents"),
        [
            (25, 499000),
            (26, 516900),
            (150, 2736500),
            (151, 2753400),
            (500, 8651500),
            (501, 8667400),
            (2501, 40466400),
        ],
    )
    def test_annual_total_uses_progressive_unit_bands(
        self, unit_count: int, expected_cents: int
    ) -> None:
        assert (
            get_annual_total_cents_for_tier("reconcile", unit_count) == expected_cents
        )

    def test_unknown_tier_total_helpers_return_none(self) -> None:
        assert get_annual_total_cents_for_tier("unknown", 12) is None

    @pytest.mark.parametrize("unit_count", [1, 50, 501, 100_000])
    def test_band_lookup_keeps_every_count_on_reconcile(self, unit_count: int) -> None:
        assert get_band_for_building_count(unit_count) == "reconcile"

    def test_reconcile_exposes_all_features(self) -> None:
        assert get_features_for_plan("reconcile") == RECONCILE_FEATURES
        assert get_features_for_plan("control") == set()
        assert "tenant_portal" in RECONCILE_FEATURES
        assert "tax_protest" in RECONCILE_FEATURES

    def test_stripe_price_id_lookup(self) -> None:
        assert get_stripe_price_id_for_tier("reconcile") == "price_reconcile_annual"
        with pytest.raises(KeyError, match="No annual Stripe price ID"):
            get_stripe_price_id_for_tier("control")
        with pytest.raises(KeyError, match="No annual Stripe price ID"):
            get_stripe_price_id_for_tier("defend")

    def test_monthly_price_id_lookup_rejected(self) -> None:
        with pytest.raises(KeyError, match="Monthly pricing is no longer available"):
            get_stripe_price_id_for_tier("reconcile", annual=False)
