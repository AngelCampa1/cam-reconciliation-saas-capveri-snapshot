"""Tests for billing configuration."""


def test_get_stripe_settings_returns_settings(monkeypatch):
    """Should return StripeSettings instance (line 37)."""
    # Set required Stripe environment variables
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_12345")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_12345")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_12345")

    # Clear lru_cache to ensure fresh load with new env vars
    from app.services.billing.config import get_stripe_settings

    get_stripe_settings.cache_clear()

    settings = get_stripe_settings()

    assert settings is not None
    assert hasattr(settings, "stripe_secret_key")
    assert hasattr(settings, "stripe_publishable_key")
    assert hasattr(settings, "stripe_webhook_secret")
    assert settings.stripe_secret_key == "sk_test_12345"


def test_get_stripe_settings_caches_result(monkeypatch):
    """Should return cached instance on subsequent calls."""
    # Set required Stripe environment variables
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_67890")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_67890")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_test_67890")

    # Clear lru_cache to start fresh
    from app.services.billing.config import get_stripe_settings

    get_stripe_settings.cache_clear()

    settings1 = get_stripe_settings()
    settings2 = get_stripe_settings()

    # Should be same instance due to lru_cache
    assert settings1 is settings2
