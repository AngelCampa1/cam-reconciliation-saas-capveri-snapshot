"""Unsubscribe token generation and verification."""

import base64
import hashlib
import hmac as hmac_lib


def build_unsubscribe_token(email: str, hmac_secret: str) -> tuple[str, str]:
    """Return (email_b64, token) for building the unsubscribe URL."""
    email_b64 = base64.urlsafe_b64encode(email.encode()).decode().rstrip("=")
    token = hmac_lib.new(
        hmac_secret.encode(), email.encode(), hashlib.sha256
    ).hexdigest()
    return email_b64, token


def verify_unsubscribe_token(
    email_b64: str, token: str, hmac_secret: str
) -> str | None:
    """Verify token and return the decoded email, or None if invalid."""
    try:
        padding = "=" * (-len(email_b64) % 4)
        email = base64.urlsafe_b64decode(email_b64 + padding).decode()
    except Exception:
        return None

    expected = hmac_lib.new(
        hmac_secret.encode(), email.encode(), hashlib.sha256
    ).hexdigest()
    # Compare as bytes, not str: hmac.compare_digest raises TypeError on str
    # inputs that contain non-ASCII characters, and ``token`` is attacker-
    # supplied (the public unsubscribe link's ``t`` query param). A non-hex /
    # non-ASCII token can never match the hex digest, so it must simply fail
    # verification (return None) rather than crash the endpoint with a 500.
    if not hmac_lib.compare_digest(expected.encode(), token.encode()):
        return None
    return email
