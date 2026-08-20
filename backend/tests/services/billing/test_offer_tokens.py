from datetime import UTC, datetime, timedelta

import pytest

from app.services.billing.offer_tokens import (
    create_offer_token,
    resolve_coupon_id_from_offer_token,
)


def test_offer_token_round_trip_offer_50():
    now = datetime(2026, 2, 26, tzinfo=UTC)
    token = create_offer_token(
        organization_id="org-123",
        offer_tier="offer_50",
        expires_at=now + timedelta(days=3),
        secret="secret",
    )
    coupon = resolve_coupon_id_from_offer_token(
        offer_token=token,
        organization_id="org-123",
        secret="secret",
        coupon_offer_50="COUPON50",
        coupon_offer_free="COUPONFREE",
        now=now,
    )
    assert coupon == "COUPON50"


def test_offer_token_rejects_expired():
    now = datetime(2026, 2, 26, tzinfo=UTC)
    token = create_offer_token(
        organization_id="org-123",
        offer_tier="offer_free",
        expires_at=now - timedelta(minutes=1),
        secret="secret",
    )
    with pytest.raises(ValueError, match="token expired"):
        resolve_coupon_id_from_offer_token(
            offer_token=token,
            organization_id="org-123",
            secret="secret",
            coupon_offer_50="COUPON50",
            coupon_offer_free="COUPONFREE",
            now=now,
        )


def test_offer_token_rejects_invalid_signature():
    now = datetime(2026, 2, 26, tzinfo=UTC)
    token = create_offer_token(
        organization_id="org-123",
        offer_tier="offer_50",
        expires_at=now + timedelta(days=1),
        secret="secret",
    )
    broken = f"{token[:-1]}x"
    with pytest.raises(ValueError, match="invalid signature"):
        resolve_coupon_id_from_offer_token(
            offer_token=broken,
            organization_id="org-123",
            secret="secret",
            coupon_offer_50="COUPON50",
            coupon_offer_free="COUPONFREE",
            now=now,
        )


def test_offer_token_rejects_organization_mismatch():
    now = datetime(2026, 2, 26, tzinfo=UTC)
    token = create_offer_token(
        organization_id="org-abc",
        offer_tier="offer_50",
        expires_at=now + timedelta(days=1),
        secret="secret",
    )
    with pytest.raises(ValueError, match="organization mismatch"):
        resolve_coupon_id_from_offer_token(
            offer_token=token,
            organization_id="org-xyz",
            secret="secret",
            coupon_offer_50="COUPON50",
            coupon_offer_free="COUPONFREE",
            now=now,
        )


def test_offer_token_rejects_unknown_offer_tier():
    now = datetime(2026, 2, 26, tzinfo=UTC)
    token = create_offer_token(
        organization_id="org-123",
        offer_tier="offer_25",
        expires_at=now + timedelta(days=1),
        secret="secret",
    )
    with pytest.raises(ValueError, match="invalid offer tier"):
        resolve_coupon_id_from_offer_token(
            offer_token=token,
            organization_id="org-123",
            secret="secret",
            coupon_offer_50="COUPON50",
            coupon_offer_free="COUPONFREE",
            now=now,
        )
