"""Unit tests for active leads service modules."""

from unittest.mock import patch

from app.services.leads.asset_registry import (
    ASSETS,
    CALCULATOR_UNLOCK_SLUGS,
    DOWNLOAD_SLUGS,
    get_asset,
)
from app.services.leads.unsubscribe import (
    build_unsubscribe_token,
    verify_unsubscribe_token,
)


def test_build_unsubscribe_token_returns_tuple():
    email_b64, token = build_unsubscribe_token("user@example.com", "secret")
    assert isinstance(email_b64, str)
    assert isinstance(token, str)
    assert len(token) == 64


def test_verify_unsubscribe_token_round_trip():
    secret = "test-secret-123"
    email = "landlord@realty.com"
    email_b64, token = build_unsubscribe_token(email, secret)
    result = verify_unsubscribe_token(email_b64, token, secret)
    assert result == email


def test_verify_unsubscribe_token_wrong_secret():
    email_b64, token = build_unsubscribe_token("user@example.com", "secret-a")
    result = verify_unsubscribe_token(email_b64, token, "secret-b")
    assert result is None


def test_verify_unsubscribe_token_tampered_email():
    _, token = build_unsubscribe_token("user@example.com", "secret")
    import base64

    tampered_b64 = base64.urlsafe_b64encode(b"hacker@evil.com").decode().rstrip("=")
    result = verify_unsubscribe_token(tampered_b64, token, "secret")
    assert result is None


def test_verify_unsubscribe_token_invalid_base64():
    result = verify_unsubscribe_token("!!!invalid!!!", "anytoken", "secret")
    assert result is None


def test_build_unsubscribe_token_different_emails_produce_different_tokens():
    _, token1 = build_unsubscribe_token("a@example.com", "secret")
    _, token2 = build_unsubscribe_token("b@example.com", "secret")
    assert token1 != token2


def test_get_asset_known_slug():
    asset = get_asset("cam-gross-up-calculator")
    assert asset is not None
    assert asset.slug == "cam-gross-up-calculator"
    assert asset.format == "xlsx"
    assert asset.enabled is True


def test_get_asset_unknown_slug():
    assert get_asset("nonexistent-slug") is None


def test_download_slugs_nonempty():
    assert len(DOWNLOAD_SLUGS) >= 2


def test_calculator_unlock_slugs_nonempty():
    assert len(CALCULATOR_UNLOCK_SLUGS) >= 1


def test_all_enabled_download_assets_have_storage_path():
    for slug in DOWNLOAD_SLUGS:
        asset = ASSETS[slug]
        assert asset.storage_path, f"{slug} missing storage_path"


def test_calculator_unlock_assets_have_companion_storage_path():
    for slug in CALCULATOR_UNLOCK_SLUGS:
        asset = ASSETS[slug]
        assert asset.storage_path.endswith(
            ".pdf"
        ), f"{slug} should have a downloadable companion PDF"


def test_all_assets_have_valid_category():
    valid_categories = {"calculator", "checklist", "framework", "template"}
    for slug, asset in ASSETS.items():
        assert asset.category in valid_categories, f"{slug} has invalid category"


def test_get_asset_formerly_disabled_asset_is_available():
    asset = get_asset("admin-fee-calculator")
    assert asset is not None
    assert asset.enabled is True


def test_get_lead_magnet_url_calls_r2_with_7day_ttl():
    from app.services.leads.asset_storage import (
        get_lead_magnet_url,
        reset_asset_storage_client,
    )

    reset_asset_storage_client()
    fake_url = "https://example-account.r2.cloudflarestorage.com/cam-tool-v1.xlsx?X-Amz-Signature=abc"

    with patch(
        "app.services.leads.asset_storage.StorageClient.get_document_url",
        return_value=fake_url,
    ) as mock_url:
        url = get_lead_magnet_url("cam-tool-v1.xlsx")

    mock_url.assert_called_once_with("cam-tool-v1.xlsx", expires_in=604800)
    assert url == fake_url
    reset_asset_storage_client()


def test_get_lead_magnet_url_uses_lead_magnets_bucket(monkeypatch):
    from app.services.leads.asset_storage import _get_client, reset_asset_storage_client

    reset_asset_storage_client()
    monkeypatch.setattr(
        "app.config.settings.lead_magnets_r2_bucket", "capveri-lead-magnets"
    )
    monkeypatch.setattr("app.config.settings.documents_r2_bucket", "capveri-documents")
    monkeypatch.setattr("app.config.settings.documents_r2_endpoint_url", "")

    client = _get_client()
    assert client.bucket == "capveri-lead-magnets"
    reset_asset_storage_client()
