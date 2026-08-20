"""Tests verifying generated plan tiers match the canonical JSON source."""

import json
from pathlib import Path

from app.services.billing.generated_plan_tiers import (
    FEATURE_LABELS,
    FEATURE_TIERS,
    LAUNCH_OFFER,
    RECONCILE_FEATURES,
    RECONCILE_ONLY_FEATURES,
    TIERS,
    TRIAL_DAYS,
    get_annual_price,
    get_annual_total_cents,
    get_band_for_count,
    get_features_for_tier,
    get_launch_offer_annual_cents,
    has_feature,
)


def _source_json() -> dict:
    repo_root = Path(__file__).resolve().parents[2]
    return json.loads((repo_root / "plan-tiers.json").read_text(encoding="utf-8"))


def _snake_case(value: str) -> str:
    return "".join(
        [f"_{char.lower()}" if char.isupper() else char for char in value]
    ).lstrip("_")


def test_generated_tiers_match_canonical_json() -> None:
    json_tiers = _source_json()["tiers"]
    assert len(TIERS) == len(json_tiers)

    for gen_tier, json_tier in zip(TIERS, json_tiers, strict=True):
        assert gen_tier["id"] == json_tier["id"]
        assert gen_tier["name"] == json_tier["name"]
        assert gen_tier["base_annual"] == json_tier["baseAnnual"]
        assert gen_tier["included_units"] == json_tier["includedUnits"]
        assert gen_tier["price_per_unit_annual"] == json_tier["pricePerUnitAnnual"]
        assert gen_tier["unit_pricing_bands"] == [
            {
                "min_units": band["minUnits"],
                "max_units": band["maxUnits"],
                "price_per_unit_annual": band["pricePerUnitAnnual"],
            }
            for band in json_tier["unitPricingBands"]
        ]
        assert gen_tier["min_units"] == json_tier["minUnits"]
        assert gen_tier["max_units"] == json_tier["maxUnits"]


def test_canonical_tiers_are_single_reconcile_subscription() -> None:
    assert {tier["id"] for tier in TIERS} == {"reconcile"}
    assert _source_json()["model"] == "reconcile_unit_bands"


def test_trial_days_matches_json() -> None:
    assert TRIAL_DAYS == _source_json()["trialDays"]


def test_launch_offer_matches_json() -> None:
    # plan-tiers.json replaced the single "launchOffer" key with a promos[]
    # registry. scripts/generate-plan-tiers.mjs projects the first *enabled*
    # promo into the back-compat LAUNCH_OFFER shape consumers still read, so
    # this test resolves the active promo the same way the generator does.
    promos = _source_json()["promos"]
    source_offer = next(
        (promo for promo in promos if promo.get("enabled") is not False), promos[0]
    )
    assert LAUNCH_OFFER["checkout_param"] == source_offer["checkoutParam"]
    assert LAUNCH_OFFER["code"] == source_offer["code"]
    assert LAUNCH_OFFER["label"] == source_offer["label"]
    assert LAUNCH_OFFER["discount_percent"] == source_offer["discountPercent"]
    assert LAUNCH_OFFER["max_redemptions"] == source_offer["maxRedemptions"]
    assert LAUNCH_OFFER["phases"][0]["code"] == source_offer["code"]


def test_feature_labels_and_tiers_match_json() -> None:
    for feature in _source_json()["features"]:
        key = _snake_case(feature["key"])
        assert FEATURE_LABELS.get(key) == feature["label"]
        assert FEATURE_TIERS.get(key) == "reconcile"


def test_get_annual_price_returns_base_subscription() -> None:
    assert get_annual_price("reconcile") == 4990
    assert get_annual_price("control") is None
    assert get_annual_price("defend") is None
    assert get_annual_price("enterprise") is None


def test_get_annual_total_cents_applies_progressive_unit_bands() -> None:
    expected_totals = {
        1: 499000,
        25: 499000,
        26: 516900,
        150: 2736500,
        151: 2753400,
        500: 8651500,
        501: 8667400,
        2500: 40451500,
        2501: 40466400,
    }
    for unit_count, expected_cents in expected_totals.items():
        assert get_annual_total_cents("reconcile", unit_count) == expected_cents
    assert get_annual_total_cents("control", 75) is None


def test_get_launch_offer_annual_cents_is_derived_from_total() -> None:
    assert get_launch_offer_annual_cents("reconcile", 25) == 99800
    assert get_launch_offer_annual_cents("reconcile", 151) == 550700
    assert get_launch_offer_annual_cents("control", 25) is None


def test_get_band_for_count_keeps_every_unit_count_on_reconcile() -> None:
    assert get_band_for_count(1) == "reconcile"
    assert get_band_for_count(501) == "reconcile"
    assert get_band_for_count(100_000) == "reconcile"


def test_reconcile_includes_all_workflow_features() -> None:
    assert get_features_for_tier("reconcile") == RECONCILE_FEATURES
    assert get_features_for_tier("control") == set()
    assert RECONCILE_FEATURES == RECONCILE_ONLY_FEATURES
    assert has_feature("reconcile", "cam_reconciliation") is True
    assert has_feature("reconcile", "tenant_portal") is True
    assert has_feature("reconcile", "tax_protest") is True
