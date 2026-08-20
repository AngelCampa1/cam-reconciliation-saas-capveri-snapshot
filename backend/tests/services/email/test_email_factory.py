"""Tests for shared email service factory helpers."""

from types import SimpleNamespace

from app.services.email.factory import (
    DEFAULT_FROM_ADDRESS,
    build_email_service,
    normalize_from_address,
)


class TestNormalizeFromAddress:
    """Tests for sender-address normalization."""

    def test_defaults_when_sender_is_missing(self):
        """Missing sender config falls back to the canonical CapVeri sender."""
        assert normalize_from_address("") == DEFAULT_FROM_ADDRESS

    def test_replaces_legacy_camaudit_sender_with_capveri_sender(self):
        """Legacy CAMAudit sender values are rewritten to CapVeri branding."""
        assert (
            normalize_from_address("CAMAudit <noreply@camaudit.io>")
            == DEFAULT_FROM_ADDRESS
        )

    def test_upgrades_bare_capveri_sender_to_branded_sender(self):
        """Bare capveri sender addresses gain the canonical display name."""
        assert normalize_from_address("noreply@capveri.com") == DEFAULT_FROM_ADDRESS

    def test_keeps_non_capveri_sender_when_explicitly_custom(self):
        """Non-CapVeri sender values are preserved as-is."""
        assert (
            normalize_from_address("Support Team <support@example.com>")
            == "Support Team <support@example.com>"
        )

    def test_keeps_explicit_capveri_sender_when_already_branded(self):
        """Explicit CapVeri senders other than noreply are preserved."""
        assert (
            normalize_from_address("Support Team <support@capveri.com>")
            == "Support Team <support@capveri.com>"
        )


class TestBuildEmailService:
    """Tests for email-service construction."""

    def test_build_email_service_uses_normalized_sender(self):
        """Factory returns EmailService with normalized CapVeri sender."""
        settings = SimpleNamespace(
            resend_api_key="re_test_123",
            resend_from_address="CAMAudit <noreply@camaudit.io>",
            unsubscribe_hmac_secret="test-secret",
        )

        service = build_email_service(settings)

        assert service.from_address == DEFAULT_FROM_ADDRESS
