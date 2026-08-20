"""
Request correlation ID middleware for request tracing.

Generates or extracts a correlation ID for each request, making it available
throughout the request lifecycle for logging and debugging.
"""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import correlation_id_var

# Standard header names for correlation IDs
CORRELATION_ID_HEADER = "X-Correlation-ID"
REQUEST_ID_HEADER = "X-Request-ID"


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Middleware that manages request correlation IDs.

    For each request:
    1. Checks for incoming X-Correlation-ID or X-Request-ID header
    2. If not present, generates a new UUID
    3. Stores the ID in a context variable accessible throughout the request
    4. Adds the ID to the response headers for client-side correlation

    Usage in logging:
        logger.info("Processing request", extra={"user_id": user.id})
        # Output: {"correlation_id": "abc-123", "message": "Processing request", ...}
    """

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Process the request and manage correlation ID."""
        # Check for existing correlation ID in headers
        correlation_id = (
            request.headers.get(CORRELATION_ID_HEADER)
            or request.headers.get(REQUEST_ID_HEADER)
            or str(uuid.uuid4())
        )

        # Set the correlation ID in context for this request
        token = correlation_id_var.set(correlation_id)

        try:
            response = await call_next(request)

            # Add correlation ID to response headers
            response.headers[CORRELATION_ID_HEADER] = correlation_id

            return response
        finally:
            # Reset the context variable
            correlation_id_var.reset(token)
