"""Tests for correlation ID middleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.logging import get_correlation_id
from app.middleware.correlation import (
    CORRELATION_ID_HEADER,
    REQUEST_ID_HEADER,
    CorrelationIdMiddleware,
)


@pytest.fixture
def app_with_middleware() -> FastAPI:
    """Create a test app with correlation middleware."""
    app = FastAPI()
    app.add_middleware(CorrelationIdMiddleware)

    @app.get("/test")
    async def test_endpoint() -> dict[str, str | None]:
        return {"correlation_id": get_correlation_id()}

    return app


@pytest.fixture
def client(app_with_middleware: FastAPI) -> TestClient:
    """Create test client."""
    return TestClient(app_with_middleware)


class TestCorrelationMiddleware:
    """Tests for correlation ID middleware."""

    def test_generates_correlation_id_when_missing(self, client: TestClient) -> None:
        """Should generate a correlation ID if not provided."""
        response = client.get("/test")

        assert response.status_code == 200
        assert CORRELATION_ID_HEADER in response.headers
        # Should be a valid UUID format (36 chars with hyphens)
        correlation_id = response.headers[CORRELATION_ID_HEADER]
        assert len(correlation_id) == 36

    def test_uses_provided_correlation_id(self, client: TestClient) -> None:
        """Should use correlation ID from request header."""
        response = client.get(
            "/test",
            headers={CORRELATION_ID_HEADER: "my-custom-id-123"},
        )

        assert response.status_code == 200
        assert response.headers[CORRELATION_ID_HEADER] == "my-custom-id-123"
        assert response.json()["correlation_id"] == "my-custom-id-123"

    def test_uses_request_id_header_as_fallback(self, client: TestClient) -> None:
        """Should accept X-Request-ID as alternative header."""
        response = client.get(
            "/test",
            headers={REQUEST_ID_HEADER: "request-id-456"},
        )

        assert response.headers[CORRELATION_ID_HEADER] == "request-id-456"
        assert response.json()["correlation_id"] == "request-id-456"

    def test_prefers_correlation_id_over_request_id(self, client: TestClient) -> None:
        """Should prefer X-Correlation-ID over X-Request-ID."""
        response = client.get(
            "/test",
            headers={
                CORRELATION_ID_HEADER: "correlation-preferred",
                REQUEST_ID_HEADER: "request-fallback",
            },
        )

        assert response.headers[CORRELATION_ID_HEADER] == "correlation-preferred"
