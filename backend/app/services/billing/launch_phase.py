"""Active limited discount offer detection via Stripe coupon redemption counts."""

import asyncio
import logging
import time
from collections.abc import Mapping
from typing import Any, TypedDict

import pybreaker
import stripe
from pydantic import BaseModel

from app.core.circuit_breakers import get_stripe_breaker
from app.services.billing.config import get_stripe_settings
from app.services.billing.generated_plan_tiers import LAUNCH_OFFER
from app.services.billing.stripe_client import get_stripe_client

logger = logging.getLogger(__name__)

# 60-second cache bucket: (bucket, phase_data)
_cache: tuple[int, "ActiveLaunchPhase | None"] = (0, None)
_cache_lock = asyncio.Lock()


class LaunchPhaseSpec(TypedDict):
    phase_index: int
    code: str
    label: str
    discount_percent: int


PHASES: list[LaunchPhaseSpec] = [
    {
        "phase_index": phase["phase_index"],
        "code": phase["code"],
        "label": phase["label"],
        "discount_percent": phase["discount_percent"],
    }
    for phase in LAUNCH_OFFER["phases"]
]
MAX_REDEMPTIONS = LAUNCH_OFFER["max_redemptions"]


class ActiveLaunchPhase(BaseModel):
    code: str | None
    label: str | None
    discount_percent: int | None
    times_redeemed: int
    max_redemptions: int
    phase_index: int
    all_exhausted: bool


def _coupon_id_for_phase(phase_index: int) -> str:
    settings = get_stripe_settings()
    mapping = {
        1: settings.stripe_80off_coupon_id,
    }
    coupon_id = mapping.get(phase_index)
    if coupon_id is None:
        raise ValueError(f"Unknown launch phase index: {phase_index}")
    return coupon_id


def _coupon_field(coupon: Any, field_name: str, default: Any = None) -> Any:
    if isinstance(coupon, Mapping):
        return coupon.get(field_name, default)
    return getattr(coupon, field_name, default)


def _fetch_active_phase() -> ActiveLaunchPhase:
    get_stripe_client()  # ensure configured
    exhausted_phase: ActiveLaunchPhase | None = None
    for phase in PHASES:
        coupon_id = _coupon_id_for_phase(phase["phase_index"])
        try:
            coupon: Any = get_stripe_breaker().call(
                lambda cid=coupon_id: stripe.Coupon.retrieve(cid)
            )
            times_redeemed = int(_coupon_field(coupon, "times_redeemed", 0) or 0)
            configured_max = _coupon_field(coupon, "max_redemptions")
            max_r: int = int(configured_max) if configured_max else MAX_REDEMPTIONS
            if times_redeemed < max_r:
                return ActiveLaunchPhase(
                    code=phase["code"],
                    label=phase["label"],
                    discount_percent=phase["discount_percent"],
                    times_redeemed=times_redeemed,
                    max_redemptions=max_r,
                    phase_index=phase["phase_index"],
                    all_exhausted=False,
                )
            exhausted_phase = ActiveLaunchPhase(
                code=None,
                label=None,
                discount_percent=None,
                times_redeemed=times_redeemed,
                max_redemptions=max_r,
                phase_index=phase["phase_index"],
                all_exhausted=True,
            )
        except pybreaker.CircuitBreakerError:
            logger.warning(
                "Stripe circuit breaker is open; skipping coupon %s phase lookup",
                coupon_id,
            )
        except stripe.error.StripeError:
            logger.warning(
                "Stripe API error retrieving coupon %s; skipping phase",
                coupon_id,
            )
        except Exception:
            logger.exception(
                "Unexpected error retrieving coupon %s from Stripe; skipping phase",
                coupon_id,
            )

    if exhausted_phase is not None:
        return exhausted_phase

    return ActiveLaunchPhase(
        code=None,
        label=None,
        discount_percent=None,
        times_redeemed=MAX_REDEMPTIONS,
        max_redemptions=MAX_REDEMPTIONS,
        phase_index=1,
        all_exhausted=True,
    )


async def get_active_launch_phase() -> ActiveLaunchPhase:
    """Return active phase, cached for 60 seconds.

    Offloads blocking Stripe I/O to a thread pool. Uses an asyncio.Lock to
    avoid thundering-herd cache misses: only one coroutine fetches from Stripe
    per 60-second bucket; others wait and then return the cached result.
    Falls back gracefully on Stripe errors.
    """
    global _cache
    bucket = int(time.time()) // 60
    cached_bucket, cached_data = _cache
    if cached_bucket == bucket and cached_data is not None:
        return cached_data

    async with _cache_lock:
        # Double-checked locking: another coroutine may have populated the cache
        # while we were waiting for the lock.
        cached_bucket, cached_data = _cache
        if cached_bucket == bucket and cached_data is not None:
            return cached_data

        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(None, _fetch_active_phase)
        except Exception:
            logger.exception(
                "Failed to determine active launch phase; returning phase 1 fallback"
            )
            result = ActiveLaunchPhase(
                code=PHASES[0]["code"],
                label=PHASES[0]["label"],
                discount_percent=PHASES[0]["discount_percent"],
                times_redeemed=0,
                max_redemptions=MAX_REDEMPTIONS,
                phase_index=1,
                all_exhausted=False,
            )

        _cache = (bucket, result)
        return result
