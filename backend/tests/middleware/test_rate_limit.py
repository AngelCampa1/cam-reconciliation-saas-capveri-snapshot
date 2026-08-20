"""Tests for rate limiting middleware."""

import base64
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

from app.middleware.rate_limit import RateLimitMiddleware


def make_jwt(sub: str) -> str:
    """Build a minimal unsigned JWT for testing key extraction."""
    payload = base64.b64encode(json.dumps({"sub": sub}).encode()).decode().rstrip("=")
    return f"eyJ0eXAiOiJKV1QifQ.{payload}.sig"


@pytest.fixture
def patched_app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    """Minimal FastAPI app with rate limiting set to 3 req/min for quick testing."""
    fresh_storage = MemoryStorage()
    fresh_limiter = MovingWindowRateLimiter(fresh_storage)
    test_limit = parse("3 per 1 minute")

    monkeypatch.setattr("app.middleware.rate_limit.moving_window", fresh_limiter)
    monkeypatch.setattr("app.middleware.rate_limit.USER_RATE_LIMIT", test_limit)
    monkeypatch.setattr("app.middleware.rate_limit.UNAUTH_RATE_LIMIT", test_limit)

    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.get("/test")
    async def endpoint() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/webhooks/stripe")
    async def stripe_webhook() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/webhooks/resend")
    async def resend_webhook() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/docs")
    async def docs() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/redoc")
    async def redoc() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/openapi.json")
    async def openapi_json() -> dict[str, bool]:
        return {"ok": True}

    return app


@pytest.fixture
def client(patched_app: FastAPI) -> TestClient:
    """Test client for rate-limited app."""
    return TestClient(patched_app, raise_server_exceptions=False)


class TestRateLimitAllows:
    def test_allows_requests_within_limit(self, client: TestClient) -> None:
        """First 3 requests should all succeed."""
        for _ in range(3):
            response = client.get(
                "/test", headers={"Authorization": f"Bearer {make_jwt('u1')}"}
            )
            assert response.status_code == 200

    def test_returns_429_when_limit_exceeded(self, client: TestClient) -> None:
        """4th request should return 429."""
        for _ in range(3):
            client.get("/test", headers={"Authorization": f"Bearer {make_jwt('u2')}"})
        response = client.get(
            "/test", headers={"Authorization": f"Bearer {make_jwt('u2')}"}
        )
        assert response.status_code == 429

    def test_429_includes_retry_after_header(self, client: TestClient) -> None:
        """429 response must include a numeric Retry-After header."""
        for _ in range(3):
            client.get("/test", headers={"Authorization": f"Bearer {make_jwt('u3')}"})
        response = client.get(
            "/test", headers={"Authorization": f"Bearer {make_jwt('u3')}"}
        )
        assert response.status_code == 429
        assert "retry-after" in response.headers
        assert response.headers["retry-after"].isdigit()


class TestExemptPaths:
    def test_exempts_health_path(self, client: TestClient) -> None:
        """Health endpoint should never be rate limited."""
        for _ in range(10):
            response = client.get("/health")
            assert response.status_code == 200

    def test_exempts_webhook_stripe_path(self, client: TestClient) -> None:
        """Stripe webhook must bypass rate limiting."""
        for _ in range(10):
            response = client.post("/webhooks/stripe")
            assert response.status_code == 200

    def test_exempts_webhook_resend_path(self, client: TestClient) -> None:
        """Resend webhook must bypass rate limiting."""
        for _ in range(10):
            response = client.post("/webhooks/resend")
            assert response.status_code == 200

    def test_exempts_redoc_path(self, client: TestClient) -> None:
        """ReDoc docs must bypass rate limiting."""
        for _ in range(10):
            response = client.get("/redoc")
            assert response.status_code == 200

    def test_exempts_openapi_json_path(self, client: TestClient) -> None:
        """OpenAPI schema endpoint must bypass rate limiting."""
        for _ in range(10):
            response = client.get("/openapi.json")
            assert response.status_code == 200


class TestKeyExtraction:
    def test_extracts_user_id_from_valid_jwt(self, client: TestClient) -> None:
        """Requests with a valid Bearer JWT use user: key (higher limit bucket)."""
        jwt = make_jwt("alice")
        # Exhaust the limit for this user
        for _ in range(3):
            client.get("/test", headers={"Authorization": f"Bearer {jwt}"})
        response = client.get("/test", headers={"Authorization": f"Bearer {jwt}"})
        assert response.status_code == 429

    def test_falls_back_to_ip_for_malformed_jwt(self, client: TestClient) -> None:
        """Malformed JWT falls back to IP-based key without raising."""
        # Sending a bad token should still work for the first 3 requests
        for _ in range(3):
            response = client.get(
                "/test", headers={"Authorization": "Bearer not.a.realtoken"}
            )
            assert response.status_code == 200

    def test_falls_back_to_ip_for_missing_auth(self, client: TestClient) -> None:
        """No Authorization header uses IP key and enforces limit."""
        for _ in range(3):
            response = client.get("/test")
            assert response.status_code == 200
        response = client.get("/test")
        assert response.status_code == 429


class TestIndependentLimits:
    def test_different_users_have_independent_limits(self, client: TestClient) -> None:
        """Exhausting user A's limit must not affect user B."""
        jwt_a = make_jwt("user-a")
        jwt_b = make_jwt("user-b")

        # Exhaust user A
        for _ in range(3):
            client.get("/test", headers={"Authorization": f"Bearer {jwt_a}"})
        assert (
            client.get(
                "/test", headers={"Authorization": f"Bearer {jwt_a}"}
            ).status_code
            == 429
        )

        # User B should still be unaffected
        response = client.get("/test", headers={"Authorization": f"Bearer {jwt_b}"})
        assert response.status_code == 200


class TestResponseSchema:
    def test_429_response_uses_error_response_schema(self, client: TestClient) -> None:
        """429 body must match ErrorResponse schema."""
        jwt = make_jwt("schema-test-user")
        for _ in range(3):
            client.get("/test", headers={"Authorization": f"Bearer {jwt}"})
        response = client.get("/test", headers={"Authorization": f"Bearer {jwt}"})
        assert response.status_code == 429
        body = response.json()
        assert body["status_code"] == 429
        assert "message" in body
        assert "detail" in body
        assert "path" in body
