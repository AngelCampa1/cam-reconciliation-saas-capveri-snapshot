"""
Tests for the active limited offer detection service.
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

import app.services.billing.launch_phase as lp_module
from app.services.billing.launch_phase import (
    MAX_REDEMPTIONS,
    ActiveLaunchPhase,
    _fetch_active_phase,
    get_active_launch_phase,
)


def _make_coupon(
    times_redeemed: int, max_redemptions: int = MAX_REDEMPTIONS
) -> MagicMock:
    """Helper — build a Stripe Coupon-like object exposing API fields as
    attributes (real stripe-python Coupon objects do NOT support dict .get())."""
    coupon = MagicMock(spec=["times_redeemed", "max_redemptions"])
    coupon.times_redeemed = times_redeemed
    coupon.max_redemptions = max_redemptions
    return coupon


@pytest.fixture(autouse=True)
def clear_cache():
    """Reset the module-level cache and lock before every test."""
    original_cache = lp_module._cache
    lp_module._cache = (0, None)
    lp_module._cache_lock = asyncio.Lock()
    yield
    lp_module._cache = original_cache
    lp_module._cache_lock = asyncio.Lock()


class TestFetchActivePhase:
    """Unit tests for _fetch_active_phase (no caching)."""

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_offer_active_when_80off_has_capacity(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """The limited offer is returned when 80OFF has 42 of 300 redemptions."""
        mock_retrieve.return_value = _make_coupon(42)

        result = _fetch_active_phase()

        assert result.phase_index == 1
        assert result.code == "80OFF"
        assert result.discount_percent == 80
        assert result.times_redeemed == 42
        assert result.max_redemptions == 300
        assert result.all_exhausted is False

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_all_exhausted_when_80off_is_full(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """all_exhausted=True and code=None when 80OFF is fully redeemed."""
        mock_retrieve.return_value = _make_coupon(300)

        result = _fetch_active_phase()

        assert result.all_exhausted is True
        assert result.code is None
        assert result.label is None
        assert result.discount_percent is None
        assert result.phase_index == 1

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_all_exhausted_with_mapping_coupon_payload(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """Mapping-shaped coupon payloads use Stripe redemption fields."""
        mock_retrieve.return_value = {
            "times_redeemed": 300,
            "max_redemptions": 300,
        }

        result = _fetch_active_phase()

        assert result.all_exhausted is True
        assert result.code is None
        assert result.times_redeemed == 300
        assert result.max_redemptions == 300

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_exhausted_mapping_coupon_payload_uses_configured_max_redemptions(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """Exhausted mapping payloads preserve Stripe's configured max."""
        mock_retrieve.return_value = {
            "times_redeemed": 50,
            "max_redemptions": 50,
        }

        result = _fetch_active_phase()

        assert result.all_exhausted is True
        assert result.code is None
        assert result.times_redeemed == 50
        assert result.max_redemptions == 50

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_active_mapping_coupon_payload_uses_configured_max_redemptions(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """Mapping-shaped coupon payloads use Stripe's configured max."""
        mock_retrieve.return_value = {
            "times_redeemed": 49,
            "max_redemptions": 50,
        }

        result = _fetch_active_phase()

        assert result.all_exhausted is False
        assert result.code == "80OFF"
        assert result.times_redeemed == 49
        assert result.max_redemptions == 50

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    def test_stripe_error_returns_exhausted_fallback(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """A Stripe error marks the limited offer unavailable without raising."""
        mock_retrieve.side_effect = Exception("Stripe network error")

        result = _fetch_active_phase()

        assert result.phase_index == 1
        assert result.code is None
        assert result.all_exhausted is True


class TestGetActiveLaunchPhase:
    """Unit tests for get_active_launch_phase (with caching logic)."""

    @patch("app.services.billing.launch_phase._fetch_active_phase")
    async def test_returns_phase1_fallback_when_fetch_raises(
        self, mock_fetch: MagicMock
    ) -> None:
        """When _fetch_active_phase itself raises unexpectedly, returns an 80OFF fallback."""
        mock_fetch.side_effect = RuntimeError("unexpected internal error")

        result = await get_active_launch_phase()

        assert result.phase_index == 1
        assert result.code == "80OFF"
        assert result.times_redeemed == 0
        assert result.all_exhausted is False

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    async def test_returns_all_exhausted_when_all_stripe_calls_fail(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """When every per-phase Stripe call raises, returns all_exhausted=True (graceful skip)."""
        mock_retrieve.side_effect = Exception("total Stripe outage")

        result = await get_active_launch_phase()

        assert result.all_exhausted is True
        assert result.code is None
        assert result.phase_index == 1

    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    async def test_result_is_cached_within_same_minute(
        self, mock_retrieve: MagicMock, mock_client: MagicMock
    ) -> None:
        """A second call within the same 60-second bucket does not call Stripe again."""
        mock_retrieve.return_value = _make_coupon(10)

        first = await get_active_launch_phase()
        # Simulate subsequent call within the same bucket
        second = await get_active_launch_phase()

        assert first is second
        # Stripe.Coupon.retrieve called exactly 1 time (for 1 phase lookup), not twice
        assert mock_retrieve.call_count == 1

    @patch("app.services.billing.launch_phase.time")
    @patch("app.services.billing.launch_phase.get_stripe_client")
    @patch("stripe.Coupon.retrieve")
    async def test_cache_refreshes_on_new_minute_bucket(
        self, mock_retrieve: MagicMock, mock_client: MagicMock, mock_time: MagicMock
    ) -> None:
        """Cache is refreshed when the 60-second bucket changes."""
        mock_retrieve.return_value = _make_coupon(5)

        # First call in bucket 100
        mock_time.time.return_value = 100 * 60 + 1
        await get_active_launch_phase()
        call_count_after_first = mock_retrieve.call_count

        # Second call in a new bucket (101)
        mock_time.time.return_value = 101 * 60 + 1
        await get_active_launch_phase()

        assert mock_retrieve.call_count > call_count_after_first

    def test_active_launch_phase_model_serializes(self) -> None:
        """ActiveLaunchPhase serializes correctly via model_dump."""
        phase = ActiveLaunchPhase(
            code="80OFF",
            label="80% off the first year",
            discount_percent=80,
            times_redeemed=10,
            max_redemptions=300,
            phase_index=1,
            all_exhausted=False,
        )
        data = phase.model_dump()
        assert data["code"] == "80OFF"
        assert data["all_exhausted"] is False
        assert data["discount_percent"] == 80
