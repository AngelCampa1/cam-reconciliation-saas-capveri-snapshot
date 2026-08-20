"""
Rate limiting core — storage, limiter, and request key extraction.

Uses the `limits` library with MemoryStorage for in-process rate limiting.
Keys are derived from JWT sub claim (no signature verification needed for
rate limiting; we only need identity, not authorization).
"""

import base64
import json
import os

from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

storage = MemoryStorage()
moving_window = MovingWindowRateLimiter(storage)

# In test/development environments, use a much higher limit so E2E test suites
# (which make many sequential API calls for the same user) don't get throttled.
_is_test_env = os.getenv("ENVIRONMENT", "development") in ("development", "test")
USER_RATE_LIMIT = parse("1000 per 1 minute" if _is_test_env else "100 per 1 minute")
UNAUTH_RATE_LIMIT = parse("100 per 1 minute" if _is_test_env else "20 per 1 minute")
PUBLIC_INVITATION_RATE_LIMIT = parse(
    "100 per 1 minute" if _is_test_env else "10 per 1 minute"
)


def extract_request_key(authorization: str | None, client_host: str) -> str:
    """Extract user_id from JWT sub claim for rate limiting.

    Decodes the JWT payload (middle segment) without signature verification
    since we only need a stable identity key, not authorization. Falls back
    to IP address if no valid Bearer token is present.

    Args:
        authorization: Authorization header value (e.g., "Bearer eyJ...")
        client_host: Client IP address as fallback key

    Returns:
        A string key starting with "user:" (JWT sub) or "ip:" (IP address)
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        try:
            segment = token.split(".")[1]
            # Add padding to make valid base64
            padded = segment + "=" * (4 - len(segment) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded))
            sub = payload.get("sub")
            if sub:
                return f"user:{sub}"
        except Exception:
            pass
    return f"ip:{client_host}"


def build_ip_rate_limit_key(namespace: str, client_host: str) -> str:
    """Create a namespaced IP key for endpoint-specific unauthenticated limits."""
    return f"{namespace}:ip:{client_host}"
