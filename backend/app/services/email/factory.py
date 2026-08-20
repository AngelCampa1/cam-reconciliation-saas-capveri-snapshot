"""Shared helpers for constructing the Resend email service."""

from email.utils import parseaddr

from app.config import Settings, get_settings
from app.services.email.resend_service import EmailService

DEFAULT_FROM_ADDRESS = "Angel Campa <angel.campa@capveri.com>"
_LEGACY_FROM_DOMAINS = {"camaudit.io"}


def normalize_from_address(from_address: str | None) -> str:
    """Return the canonical CapVeri sender for missing or legacy values."""
    candidate = (from_address or "").strip()
    if not candidate:
        return DEFAULT_FROM_ADDRESS

    _, parsed_email = parseaddr(candidate)
    normalized_email = parsed_email.lower()

    if normalized_email == "noreply@capveri.com":
        return DEFAULT_FROM_ADDRESS

    if any(normalized_email.endswith(f"@{domain}") for domain in _LEGACY_FROM_DOMAINS):
        return DEFAULT_FROM_ADDRESS

    return candidate


def build_email_service(settings: Settings | None = None) -> EmailService:
    """Build an EmailService instance from application settings."""
    resolved_settings = settings or get_settings()
    app_base_url = getattr(
        resolved_settings,
        "app_base_url",
        getattr(resolved_settings, "frontend_url", ""),
    )
    return EmailService(
        api_key=resolved_settings.resend_api_key,
        from_address=normalize_from_address(resolved_settings.resend_from_address),
        unsubscribe_hmac_secret=resolved_settings.unsubscribe_hmac_secret,
        app_base_url=app_base_url,
        marketing_base_url=getattr(resolved_settings, "marketing_base_url", ""),
    )


def get_email_service() -> EmailService:
    """FastAPI dependency returning the shared EmailService instance."""
    return build_email_service()
