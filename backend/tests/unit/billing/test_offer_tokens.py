"""Tests for offer_tokens helpers — including extract_offer_tier_from_token."""

from datetime import UTC, datetime, timedelta

import pytest

from app.services.billing.offer_tokens import (
    create_offer_token,
    extract_offer_tier_from_token,
)

SECRET = "test-secret"
ORG_ID = "org-abc-123"


def _make_token(offer_tier: str, expires_delta: timedelta = timedelta(days=14)) -> str:
    return create_offer_token(
        organization_id=ORG_ID,
        offer_tier=offer_tier,
        expires_at=datetime.now(UTC) + expires_delta,
        secret=SECRET,
    )


def test_extract_offer_tier_returns_offer_50_for_valid_token():
    token = _make_token("offer_50")
    result = extract_offer_tier_from_token(
        offer_token=token,
        organization_id=ORG_ID,
        secret=SECRET,
    )
    assert result == "offer_50"


def test_extract_offer_tier_returns_offer_free_for_valid_token():
    token = _make_token("offer_free")
    result = extract_offer_tier_from_token(
        offer_token=token,
        organization_id=ORG_ID,
        secret=SECRET,
    )
    assert result == "offer_free"


def test_extract_offer_tier_raises_for_wrong_org():
    token = _make_token("offer_50")
    with pytest.raises(ValueError, match="organization mismatch"):
        extract_offer_tier_from_token(
            offer_token=token,
            organization_id="wrong-org",
            secret=SECRET,
        )


def test_extract_offer_tier_raises_for_expired_token():
    token = _make_token("offer_50", expires_delta=timedelta(days=-1))
    with pytest.raises(ValueError, match="token expired"):
        extract_offer_tier_from_token(
            offer_token=token,
            organization_id=ORG_ID,
            secret=SECRET,
        )


def test_extract_offer_tier_raises_for_bad_signature():
    token = _make_token("offer_50")
    tampered = token[:-4] + "xxxx"
    with pytest.raises(ValueError, match="invalid signature"):
        extract_offer_tier_from_token(
            offer_token=tampered,
            organization_id=ORG_ID,
            secret=SECRET,
        )
