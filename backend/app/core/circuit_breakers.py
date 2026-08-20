"""
Circuit breakers for external service dependencies.

Each breaker is a module-level singleton. Getter functions allow injection
in tests via monkeypatch without reimporting the module.

Tuning rationale:
- Stripe: 5 failures / 60s — brief network blips; 99.99% SLA means short resets
- OpenRouter: 3 failures / 180s — provider failover still depends on one upstream
- S3: 5 failures / 30s — extremely reliable; short reset sufficient
- Resend: 5 failures / 120s — fire-and-forget; moderate threshold
"""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any, TypeVar

import pybreaker

_T = TypeVar("_T")


async def call_async_with_breaker(
    breaker: pybreaker.CircuitBreaker,
    coro_factory: Callable[[], Awaitable[_T]],
) -> _T:
    """Native Python async circuit breaker wrapper (no Tornado required).

    Provides the same semantics as pybreaker.call_async() — fast-fail when
    the circuit is open, report failures to the state machine to trigger
    transitions, and close the circuit after a successful half-open probe.

    The open→half-open transition requires an explicit timeout check because
    pybreaker only triggers it inside its synchronous call() method. Checking
    current_state alone permanently locks open circuits — the state property
    never fires the transition itself.

    Args:
        breaker: The CircuitBreaker instance to use.
        coro_factory: Zero-argument callable that returns an awaitable.

    Returns:
        Whatever the awaitable resolves to.

    Raises:
        pybreaker.CircuitBreakerError: When the circuit is open.
        Exception: Re-raises any exception from the awaitable after recording
            the failure with the breaker's state machine.
    """
    with breaker._lock:
        if breaker.current_state == "open":
            opened_at = breaker._state_storage.opened_at
            timeout = timedelta(seconds=breaker.reset_timeout)
            if opened_at and datetime.now(UTC) < opened_at + timeout:
                raise pybreaker.CircuitBreakerError(breaker)
            breaker.half_open()

    try:
        result: _T = await coro_factory()
        if breaker.current_state == "half-open":
            breaker.close()
        return result
    except pybreaker.CircuitBreakerError:
        raise
    except Exception as exc:
        # Report the failure to pybreaker's state machine by running a
        # synchronous no-op through the breaker that re-throws our exception.
        # This lets pybreaker increment counters and open the circuit if needed.
        captured: BaseException = exc

        def _raise_captured() -> Any:
            raise captured

        try:
            breaker.call(_raise_captured)
        except pybreaker.CircuitBreakerError:
            pass  # Circuit opened; original exc still propagates
        except Exception:
            pass  # Breaker re-raised captured; state updated correctly
        raise


stripe_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60, name="stripe")
s3_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=30, name="s3")
resend_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=120, name="resend")
apollo_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=120, name="apollo")
openrouter_breaker = pybreaker.CircuitBreaker(
    fail_max=3, reset_timeout=180, name="openrouter"
)


def get_stripe_breaker() -> pybreaker.CircuitBreaker:
    return stripe_breaker


def get_s3_breaker() -> pybreaker.CircuitBreaker:
    return s3_breaker


def get_resend_breaker() -> pybreaker.CircuitBreaker:
    return resend_breaker


def get_apollo_breaker() -> pybreaker.CircuitBreaker:
    return apollo_breaker


def get_openrouter_breaker() -> pybreaker.CircuitBreaker:
    return openrouter_breaker
