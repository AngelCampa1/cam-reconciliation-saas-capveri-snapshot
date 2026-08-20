"""Tests for circuit breakers and ServiceUnavailableError."""

import contextlib

import pybreaker
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.circuit_breakers import (
    call_async_with_breaker,
    get_openrouter_breaker,
    get_resend_breaker,
    get_s3_breaker,
    get_stripe_breaker,
    openrouter_breaker,
    resend_breaker,
    s3_breaker,
    stripe_breaker,
)
from app.exceptions import ServiceUnavailableError
from app.exceptions.handlers import register_custom_exception_handlers


def _force_open(breaker: pybreaker.CircuitBreaker) -> None:
    """Drive a fresh breaker to OPEN state by injecting fail_max failures."""
    for _ in range(breaker.fail_max):
        with contextlib.suppress(Exception):
            breaker.call(lambda: (_ for _ in ()).throw(Exception("forced failure")))


class TestCircuitBreakerBehaviour:
    def test_closed_breaker_passes_successful_call(self) -> None:
        """A closed breaker should call the wrapped function and return its value."""
        fresh = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)
        result = fresh.call(lambda: 42)
        assert result == 42

    def test_breaker_opens_after_fail_max_exceeded(self) -> None:
        """After fail_max consecutive failures, the breaker must be OPEN."""
        fresh = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=60)
        _force_open(fresh)
        assert fresh.current_state == "open"

    def test_open_breaker_raises_circuit_breaker_error_without_calling_fn(
        self,
    ) -> None:
        """An OPEN breaker must raise CircuitBreakerError without calling the fn."""
        fresh = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=60)
        _force_open(fresh)
        called = []
        with pytest.raises(pybreaker.CircuitBreakerError):
            fresh.call(lambda: called.append(True))
        assert called == [], "Function should not be called when breaker is open"


class TestBreakerGetters:
    def test_all_breaker_getters_return_correct_instances(self) -> None:
        """Each getter must return the matching module-level singleton."""
        assert get_stripe_breaker() is stripe_breaker
        assert get_openrouter_breaker() is openrouter_breaker
        assert get_s3_breaker() is s3_breaker
        assert get_resend_breaker() is resend_breaker


class TestServiceUnavailableError:
    def test_service_unavailable_error_stores_service_name(self) -> None:
        """ServiceUnavailableError must store the service name."""
        exc = ServiceUnavailableError("Stripe")
        assert exc.service_name == "Stripe"
        assert "Stripe" in str(exc)

    def test_service_unavailable_error_stores_retry_after(self) -> None:
        """Default retry_after must be 60 seconds."""
        exc = ServiceUnavailableError("Document reader")
        assert exc.retry_after == 60

    def test_service_unavailable_error_stores_original_error(self) -> None:
        """original_error attribute must be preserved."""
        original = Exception("boom")
        exc = ServiceUnavailableError("Anthropic", original_error=original)
        assert exc.original_error is original


class TestCallAsyncWithBreaker:
    @pytest.mark.asyncio
    async def test_closed_breaker_passes_successful_async_call(self) -> None:
        """A closed breaker should pass through a successful async call."""
        fresh = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=60)

        async def succeed() -> int:
            return 99

        result = await call_async_with_breaker(fresh, succeed)
        assert result == 99

    @pytest.mark.asyncio
    async def test_open_breaker_raises_without_calling_fn(self) -> None:
        """An open breaker must raise CircuitBreakerError immediately."""
        fresh = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=60)
        _force_open(fresh)

        called = []

        async def should_not_run() -> None:
            called.append(True)

        with pytest.raises(pybreaker.CircuitBreakerError):
            await call_async_with_breaker(fresh, should_not_run)
        assert called == []

    @pytest.mark.asyncio
    async def test_failure_increments_counter_and_opens_circuit(self) -> None:
        """Repeated async failures must open the circuit after fail_max."""
        fresh = pybreaker.CircuitBreaker(fail_max=2, reset_timeout=60)

        async def always_fail() -> None:
            raise RuntimeError("downstream error")

        for _ in range(2):
            with contextlib.suppress(RuntimeError):
                await call_async_with_breaker(fresh, always_fail)

        assert fresh.current_state == "open"

    @pytest.mark.asyncio
    async def test_re_raises_original_exception(self) -> None:
        """The original exception must propagate even as the counter increments."""
        fresh = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)

        async def fail_with_value_error() -> None:
            raise ValueError("bad value")

        with pytest.raises(ValueError, match="bad value"):
            await call_async_with_breaker(fresh, fail_with_value_error)


class TestServiceUnavailableHandler:
    @pytest.fixture
    def app_with_handler(self) -> FastAPI:
        """Minimal FastAPI app with the 503 exception handler registered."""
        app = FastAPI()
        register_custom_exception_handlers(app)

        @app.get("/trigger-503")
        async def trigger() -> None:
            raise ServiceUnavailableError("TestService")

        @app.get("/trigger-503-with-original")
        async def trigger_with_original() -> None:
            original = Exception("upstream failure")
            raise ServiceUnavailableError("Stripe", original_error=original)

        return app

    @pytest.fixture
    def client(self, app_with_handler: FastAPI) -> TestClient:
        return TestClient(app_with_handler, raise_server_exceptions=False)

    def test_503_handler_returns_correct_status(self, client: TestClient) -> None:
        """ServiceUnavailableError must produce a 503 HTTP response."""
        response = client.get("/trigger-503")
        assert response.status_code == 503
        body = response.json()
        assert body["status_code"] == 503
        assert "unavailable" in body["message"].lower()

    def test_503_handler_includes_retry_after_header(self, client: TestClient) -> None:
        """503 response must include Retry-After: 60 header."""
        response = client.get("/trigger-503")
        assert response.status_code == 503
        assert "retry-after" in response.headers
        assert response.headers["retry-after"] == "60"

    def test_503_handler_with_original_error(self, client: TestClient) -> None:
        """Handler must process ServiceUnavailableError with original_error attached."""
        response = client.get("/trigger-503-with-original")
        assert response.status_code == 503
        assert response.headers["retry-after"] == "60"
