"""
Rate limiting middleware.

Enforces per-user (100/min) and per-IP (20/min) limits using a moving window
algorithm. Authenticated users get higher limits and are identified by their
JWT sub claim. Unauthenticated requests fall back to IP-based limiting.

Exempt paths (health checks, webhooks, docs) bypass rate limiting to avoid
interfering with infrastructure traffic.
"""

import time

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.rate_limiting import (
    UNAUTH_RATE_LIMIT,
    USER_RATE_LIMIT,
    extract_request_key,
    moving_window,
)
from app.schemas.errors import ErrorResponse

# Paths that are never rate-limited
EXEMPT_PATHS = frozenset(
    [
        "/health",
        "/webhooks/stripe",
        "/webhooks/resend",
        "/docs",
        "/redoc",
        "/openapi.json",
    ]
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware that enforces per-user and per-IP request rate limits.

    Applies a moving window rate limit to all non-exempt paths. Authenticated
    requests (valid Bearer JWT) are limited at 100/min per user; unauthenticated
    requests are limited at 20/min per IP.

    Returns 429 Too Many Requests with a Retry-After header when the limit is
    exceeded.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process request and enforce rate limits."""
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)

        key = extract_request_key(
            request.headers.get("Authorization"),
            request.client.host if request.client else "unknown",
        )
        limit = USER_RATE_LIMIT if key.startswith("user:") else UNAUTH_RATE_LIMIT

        if not moving_window.hit(limit, key):
            stats = moving_window.get_window_stats(limit, key)
            retry_after = max(1, int(stats.reset_time - time.time()))
            response = ErrorResponse(
                status_code=429,
                message="Too many requests",
                detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
                path=str(request.url.path),
            )
            return JSONResponse(
                status_code=429,
                content=response.model_dump(mode="json"),
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
