"""
Unit tests for plan-based feature entitlement helpers.

Tests cover:
- has_full_access: subscription status check with credit_pack backward compat
- get_current_tier: resolves tier from subscription row
- has_feature_access: tier-based feature gating
- has_noi_board_access: delegates to has_feature_access("noi_impact_calculator")
- has_tax_protest_access: delegates to has_feature_access("tax_protest")
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

import pytest

# These tests call the real ``has_full_access`` (imported inside each test), so
# they must opt out of the autouse full-access patch in conftest.
pytestmark = pytest.mark.real_entitlements


def _make_ctx(
    plan: str,
    status: str = "active",
    billing_model: str = "subscription",
    tier: str | None = None,
) -> MagicMock:
    ctx = MagicMock()
    ctx.organization_id = "org-1"
    result = MagicMock()
    result.data = {
        "plan": plan,
        "status": status,
        "billing_model": billing_model,
        "tier": tier,
    }
    ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        result
    )
    # has_ever_purchased chain (no credits)
    no_credits = MagicMock()
    no_credits.data = []
    ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        no_credits
    )
    return ctx


def _make_ctx_no_sub() -> MagicMock:
    ctx = MagicMock()
    ctx.organization_id = "org-1"
    result = MagicMock()
    result.data = None
    ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        result
    )
    no_credits = MagicMock()
    no_credits.data = []
    ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        no_credits
    )
    return ctx


def _make_ctx_credit_pack(has_purchased: bool = True) -> MagicMock:
    ctx = MagicMock()
    ctx.organization_id = "org-1"
    result = MagicMock()
    result.data = {
        "plan": "",
        "status": "",
        "billing_model": "credit_pack",
        "tier": None,
    }
    ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        result
    )
    credits_result = MagicMock()
    credits_result.data = [{"id": "pack-1"}] if has_purchased else []
    ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        credits_result
    )
    return ctx


# ── get_current_tier ──────────────────────────────────────────────────────────


class TestGetCurrentTier:
    def test_legacy_growth_tier_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("growth_v2", tier="growth")) == "reconcile"

    def test_legacy_portfolio_tier_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("portfolio", tier="portfolio")) == "reconcile"

    def test_enterprise_tier_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        assert (
            get_current_tier(_make_ctx("enterprise", tier="enterprise")) == "reconcile"
        )

    def test_legacy_pro_tier_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("professional", tier="pro")) == "reconcile"

    def test_legacy_starter_tier_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("essentials", tier="starter")) == "reconcile"

    def test_falls_back_to_legacy_plan_professional(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("professional")) == "reconcile"

    def test_falls_back_to_legacy_plan_essentials(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("essentials")) == "reconcile"

    def test_falls_back_to_legacy_plan_growth(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("growth")) == "reconcile"

    def test_returns_none_for_no_subscription(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx_no_sub()) is None

    def test_returns_none_for_canceled_subscription(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_ctx("professional", status="canceled")) is None

    def test_enterprise_plan_column_maps_to_reconcile(self):
        from app.services.billing.entitlements import get_current_tier

        # tier column is unknown, plan column is "enterprise" and maps to Reconcile.
        assert (
            get_current_tier(_make_ctx("enterprise", tier="unknown_tier"))
            == "reconcile"
        )

    def test_returns_none_for_unknown_plan_and_tier(self):
        from app.services.billing.entitlements import get_current_tier

        # Neither tier column nor plan column match any known value
        assert get_current_tier(_make_ctx("unknown_plan", tier="unknown_tier")) is None


# ── has_feature_access ────────────────────────────────────────────────────────


class TestHasFeatureAccess:
    def test_growth_tier_has_noi_calculator(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx("growth_v2", tier="growth"), "noi_impact_calculator"
            )
            is True
        )

    def test_growth_tier_has_cam_reconciliation(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx("growth_v2", tier="growth"), "cam_reconciliation"
            )
            is True
        )

    def test_growth_tier_has_tax_protest(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(_make_ctx("growth_v2", tier="growth"), "tax_protest")
            is True
        )

    def test_portfolio_tier_has_noi_calculator(self):
        from app.services.billing.entitlements import has_feature_access

        # All core features available on portfolio too
        assert (
            has_feature_access(
                _make_ctx("portfolio", tier="portfolio"), "noi_impact_calculator"
            )
            is True
        )

    def test_legacy_pro_tier_has_noi_calculator(self):
        from app.services.billing.entitlements import has_feature_access

        # Legacy tier="pro" maps to growth — all features included
        assert (
            has_feature_access(
                _make_ctx("professional", tier="pro"), "noi_impact_calculator"
            )
            is True
        )

    def test_canceled_subscription_denied(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx("growth_v2", status="canceled", tier="growth"),
                "noi_impact_calculator",
            )
            is False
        )

    def test_no_subscription_denied(self):
        from app.services.billing.entitlements import has_feature_access

        assert has_feature_access(_make_ctx_no_sub(), "cam_reconciliation") is False

    def test_credit_pack_with_purchase_grants_all(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx_credit_pack(has_purchased=True), "noi_impact_calculator"
            )
            is True
        )

    def test_credit_pack_without_purchase_denied(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx_credit_pack(has_purchased=False), "noi_impact_calculator"
            )
            is False
        )

    def test_trialing_growth_has_features(self):
        from app.services.billing.entitlements import has_feature_access

        assert (
            has_feature_access(
                _make_ctx("growth_v2", status="trialing", tier="growth"),
                "dispute_system",
            )
            is True
        )

    def test_unknown_plan_and_tier_denied(self):
        from app.services.billing.entitlements import has_feature_access

        # get_current_tier returns None for unknown plan/tier — feature access denied
        assert (
            has_feature_access(
                _make_ctx("unknown_plan", tier="unknown_tier"),
                "cam_reconciliation",
            )
            is False
        )


# ── has_tax_protest_access ────────────────────────────────────────────────────


class TestHasTaxProtestAccess:
    def test_growth_tier_grants_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx("growth_v2", tier="growth")) is True

    def test_portfolio_tier_grants_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx("portfolio", tier="portfolio")) is True

    def test_legacy_professional_plan_grants_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx("professional")) is True

    def test_legacy_growth_plan_grants_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx("growth")) is True

    def test_legacy_pro_tier_column_grants_access(self):
        # tier="pro" maps to growth, which has taxProtest
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx("professional", tier="pro")) is True

    def test_no_subscription_denies_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert has_tax_protest_access(_make_ctx_no_sub()) is False

    def test_canceled_subscription_denies_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert (
            has_tax_protest_access(_make_ctx("growth_v2", status="canceled")) is False
        )

    def test_trialing_growth_grants_access(self):
        from app.services.billing.entitlements import has_tax_protest_access

        assert (
            has_tax_protest_access(
                _make_ctx("growth_v2", status="trialing", tier="growth")
            )
            is True
        )


# ── has_noi_board_access ──────────────────────────────────────────────────────


class TestHasNoiBoardAccess:
    def test_growth_tier_grants_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("growth_v2", tier="growth")) is True

    def test_portfolio_tier_grants_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("portfolio", tier="portfolio")) is True

    def test_legacy_professional_plan_grants_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("professional")) is True

    def test_legacy_growth_plan_grants_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("growth")) is True

    def test_legacy_pro_tier_column_grants_access(self):
        # tier="pro" maps to growth, which has noi_impact_calculator
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("professional", tier="pro")) is True

    def test_no_subscription_denies_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx_no_sub()) is False

    def test_canceled_subscription_denies_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("growth_v2", status="canceled")) is False

    def test_trialing_portfolio_grants_access(self):
        from app.services.billing.entitlements import has_noi_board_access

        assert has_noi_board_access(_make_ctx("portfolio", status="trialing")) is True


# ── has_full_access ───────────────────────────────────────────────────────────


class TestHasFullAccess:
    def test_active_subscription_grants_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx("professional")) is True

    def test_trialing_subscription_grants_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx("professional", status="trialing")) is True

    def test_canceled_subscription_denies_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx("professional", status="canceled")) is False

    def test_no_subscription_no_credits_denies_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx_no_sub()) is False

    def test_credit_pack_with_purchase_grants_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx_credit_pack(has_purchased=True)) is True

    def test_credit_pack_without_purchase_denies_access(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_ctx_credit_pack(has_purchased=False)) is False


# ── lazy card-less trial expiry ───────────────────────────────────────────────


def _make_trial_ctx(
    current_period_end,
    *,
    stripe_subscription_id: str | None = None,
    status: str = "trialing",
    tier: str = "reconcile",
    update_raises: bool = False,
) -> MagicMock:
    """Build a ctx whose subscription row is a (maybe-expired) card-less trial."""
    ctx = MagicMock()
    ctx.organization_id = "org-1"
    result = MagicMock()
    result.data = {
        "plan": "reconcile",
        "status": status,
        "billing_model": "subscription",
        "tier": tier,
        "stripe_subscription_id": stripe_subscription_id,
        "current_period_end": current_period_end,
    }
    ctx.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = (
        result
    )
    no_credits = MagicMock()
    no_credits.data = []
    ctx.table.return_value.select.return_value.eq.return_value.execute.return_value = (
        no_credits
    )
    if update_raises:
        ctx.table.return_value.update.return_value.eq.return_value.eq.return_value.is_.return_value.execute.side_effect = RuntimeError(
            "db unavailable"
        )
    return ctx


def _past_iso() -> str:
    return (datetime.now(UTC) - timedelta(days=1)).isoformat()


def _future_iso() -> str:
    return (datetime.now(UTC) + timedelta(days=5)).isoformat()


class TestLazyTrialExpiry:
    def test_expired_card_less_trial_loses_full_access_and_is_persisted(self):
        from app.services.billing.entitlements import has_full_access

        ctx = _make_trial_ctx(_past_iso())
        assert has_full_access(ctx) is False
        # The expiry flip is persisted (best-effort UPDATE to paused).
        assert ctx.table.return_value.update.called is True

    def test_expired_card_less_trial_has_no_tier(self):
        from app.services.billing.entitlements import get_current_tier

        assert get_current_tier(_make_trial_ctx(_past_iso())) is None

    def test_expired_card_less_trial_effective_status_is_paused(self):
        from app.services.billing.entitlements import effective_subscription_status

        assert effective_subscription_status(_make_trial_ctx(_past_iso())) == "paused"

    def test_persist_failure_is_swallowed(self):
        from app.services.billing.entitlements import effective_subscription_status

        # A write error during convergence must not break the entitlement read.
        ctx = _make_trial_ctx(_past_iso(), update_raises=True)
        assert effective_subscription_status(ctx) == "paused"

    def test_not_yet_expired_trial_keeps_full_access(self):
        from app.services.billing.entitlements import (
            effective_subscription_status,
            has_full_access,
        )

        ctx = _make_trial_ctx(_future_iso())
        assert has_full_access(ctx) is True
        assert effective_subscription_status(ctx) == "trialing"
        assert ctx.table.return_value.update.called is False

    def test_stripe_backed_trial_is_never_treated_as_expired(self):
        from app.services.billing.entitlements import has_full_access

        # Past period_end but a real Stripe subscription exists → Stripe's webhook
        # owns expiry, so the lazy card-less check must not fire.
        ctx = _make_trial_ctx(_past_iso(), stripe_subscription_id="sub_123")
        assert has_full_access(ctx) is True
        assert ctx.table.return_value.update.called is False

    def test_trial_without_period_end_is_not_expired(self):
        from app.services.billing.entitlements import has_full_access

        assert has_full_access(_make_trial_ctx(None)) is True

    def test_effective_status_empty_when_no_row(self):
        from app.services.billing.entitlements import effective_subscription_status

        assert effective_subscription_status(_make_ctx_no_sub()) == ""


class TestParsePeriodEnd:
    def test_parses_naive_datetime_as_utc(self):
        from app.services.billing.entitlements import _parse_period_end

        parsed = _parse_period_end(datetime(2026, 1, 1, 12, 0, 0))
        assert parsed is not None
        assert parsed.tzinfo == UTC

    def test_passes_through_aware_datetime(self):
        from app.services.billing.entitlements import _parse_period_end

        aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
        assert _parse_period_end(aware) == aware

    def test_invalid_string_returns_none(self):
        from app.services.billing.entitlements import _parse_period_end

        assert _parse_period_end("not-a-date") is None

    def test_empty_value_returns_none(self):
        from app.services.billing.entitlements import _parse_period_end

        assert _parse_period_end(None) is None


class TestGetCurrentTierPlanFallback:
    def test_plan_control_resolves_when_tier_column_unknown(self):
        # Covers retired package plan fallback to Reconcile.
        from app.services.billing.entitlements import get_current_tier

        assert (
            get_current_tier(_make_ctx("control", tier="legacy_unknown")) == "reconcile"
        )
