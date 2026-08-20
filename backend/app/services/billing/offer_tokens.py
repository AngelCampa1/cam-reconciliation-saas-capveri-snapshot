"""Helpers for signed checkout offer tokens.

.. deprecated::
    Offer tokens were used with the free-audit win-back campaign, which is
    deprecated in favor of trial-based subscription tiers. This module is
    retained for backward compatibility. Do not add new functionality here.
"""

import base64
import hashlib
import hmac
from datetime import UTC, datetime


def create_offer_token(
    *,
    organization_id: str,
    offer_tier: str,
    expires_at: datetime,
    secret: str,
) -> str:
    """Create an HMAC-signed offer token."""
    expires_unix = int(expires_at.astimezone(UTC).timestamp())
    payload = f"{organization_id}:{offer_tier}:{expires_unix}"
    encoded_payload = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("utf-8")
    signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def _parse_and_validate(
    *,
    offer_token: str,
    organization_id: str,
    secret: str,
    now: datetime | None = None,
) -> tuple[str, str]:
    """Validate signature, org, and expiry. Returns (org_id, offer_tier)."""
    current_time = now or datetime.now(UTC)
    encoded_payload, signature = offer_token.split(".", 1)
    payload = base64.urlsafe_b64decode(encoded_payload.encode("utf-8")).decode("utf-8")
    expected_signature = hmac.new(
        secret.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, signature):
        raise ValueError("invalid signature")

    org_id, offer_tier, expires_at = payload.split(":", 2)
    if org_id != organization_id:
        raise ValueError("organization mismatch")

    if current_time.timestamp() > int(expires_at):
        raise ValueError("token expired")

    return org_id, offer_tier


def extract_offer_tier_from_token(
    *,
    offer_token: str,
    organization_id: str,
    secret: str,
    now: datetime | None = None,
) -> str:
    """Validate a token and return the offer tier string."""
    _, offer_tier = _parse_and_validate(
        offer_token=offer_token,
        organization_id=organization_id,
        secret=secret,
        now=now,
    )
    return offer_tier


def resolve_coupon_id_from_offer_token(
    *,
    offer_token: str,
    organization_id: str,
    secret: str,
    coupon_offer_50: str,
    coupon_offer_free: str,
    now: datetime | None = None,
) -> str:
    """Validate a token and return the mapped Stripe coupon id."""
    _, offer_tier = _parse_and_validate(
        offer_token=offer_token,
        organization_id=organization_id,
        secret=secret,
        now=now,
    )

    if offer_tier == "offer_50":
        return coupon_offer_50
    if offer_tier == "offer_free":
        return coupon_offer_free
    raise ValueError("invalid offer tier")
