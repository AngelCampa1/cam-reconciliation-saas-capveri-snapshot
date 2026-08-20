"""Property-based stress for the public (unauthenticated) calculator endpoints.

``/api/v1/tools/*`` exposes three free-tier calculators with NO authentication:
the BOMA 2024 area calculator, the HCAD tax normalizer, and the Fixed CAM
modeler. Because they are public, any caller can post arbitrary JSON. Pydantic
rejects schema-invalid bodies with 422, but a *schema-valid* body with extreme
magnitudes drives the underlying ``Decimal`` math past the 28-digit context
precision, so ``.quantize()`` raises ``decimal.InvalidOperation`` — an
``ArithmeticError``, NOT a ``ValueError`` — which escaped the endpoints'
``except ValueError`` and surfaced as an unhandled HTTP 500 (FINDING-S16).

A public endpoint must never 500 on input: it should answer 200 with a result
or 422 when the input cannot be processed. This harness fuzzes all three
endpoints, including deliberately enormous (but schema-valid) values, and
asserts the response is always 200 or 422 — never a 5xx.

Run standalone:
    pytest tests/stress/test_public_tools_api_stress.py -q
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

import app.middleware.rate_limit as _rl_mw
from app.main import app

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

client = TestClient(app, raise_server_exceptions=False)

# Decimal magnitudes spanning the realistic-to-absurd range. The large end
# (1e30+) is what pushes quantize past Decimal's default 28-digit precision.
money_str = st.one_of(
    st.decimals(
        min_value=0, max_value=10**12, places=2, allow_nan=False, allow_infinity=False
    ).map(lambda d: format(d, "f")),
    st.sampled_from(
        ["1E+30", "1E+40", "9.99E+50", "1E+60", "123456789012345678901234567890"]
    ),
)
positive_money_str = st.one_of(
    st.decimals(
        min_value="0.01",
        max_value=10**12,
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ).map(lambda d: format(d, "f")),
    st.sampled_from(["1E+30", "1E+40", "9.99E+50", "1E+60"]),
)


def _reset_rate_limit():
    """Public endpoints are rate-limited (UNAUTH_RATE_LIMIT). Property tests fire
    hundreds of examples from one client IP, which would legitimately trip the
    limiter (429) and mask what we are actually testing — that the *computation*
    never 500s. Clear the in-memory limiter window before each example so every
    request is evaluated on its merits.

    The middleware reads ``app.middleware.rate_limit.moving_window`` by name, and
    the autouse ``reset_rate_limiter`` conftest fixture rebinds that to a fresh
    limiter per test (NOT the ``app.core.rate_limiting`` singleton). So clear the
    storage of whatever limiter the middleware is currently bound to."""
    storage = _rl_mw.moving_window.storage
    storage.reset()
    storage.events.clear()


def _ok(resp):
    """A public endpoint must answer 200 or 422 — never crash with a 5xx."""
    assert resp.status_code in (
        200,
        422,
    ), f"{resp.request.url} returned {resp.status_code}: {resp.text[:200]}"


@STRESS
@given(base=money_str, retro_frac=st.floats(0, 1), current=positive_money_str)
def test_hcad_endpoint_never_500(base, retro_frac, current):
    # retroactive_adjustment must be <= base; scale by a fraction to stay valid.
    # Do NOT quantize here — base can be 1E+30, and quantizing that to cents
    # overflows the Decimal context in the *test*, masking what we're probing
    # (the endpoint's behavior). The raw scaled product is a valid Decimal string.
    from decimal import Decimal

    retro = format(Decimal(base) * Decimal(str(retro_frac)), "f")
    _reset_rate_limit()
    resp = client.post(
        "/api/v1/tools/hcad-tax-normalizer/calculate",
        json={
            "original_base_year_assessment": base,
            "retroactive_adjustment": retro,
            "current_year_tax": current,
            "pro_rata_pct": "0.5",
        },
    )
    _ok(resp)


@STRESS
@given(
    opex=money_str,
    rate=positive_money_str,
    tenant_sqft=positive_money_str,
    escalation=st.sampled_from(["0", "3.0", "15"]),
)
def test_fixed_cam_endpoint_never_500(opex, rate, tenant_sqft, escalation):
    _reset_rate_limit()
    resp = client.post(
        "/api/v1/tools/fixed-cam-modeler",
        json={
            "years": [
                {"year": 2024, "total_operating_expenses": opex, "rentable_sf": "100"},
                {"year": 2025, "total_operating_expenses": opex, "rentable_sf": "100"},
                {"year": 2026, "total_operating_expenses": opex, "rentable_sf": "100"},
            ],
            "fixed_cam_rate_per_sf": rate,
            "annual_escalation_pct": escalation,
            "tenant_sqft": tenant_sqft,
            "pro_rata_share": "5.0",
        },
    )
    _ok(resp)


@STRESS
@given(usable=positive_money_str, rent=positive_money_str)
def test_boma_endpoint_never_500(usable, rent):
    _reset_rate_limit()
    resp = client.post(
        "/api/v1/tools/boma-2024-calculator",
        json={
            "usable_sf": usable,
            # rentable >= usable keeps the load factor valid; reuse usable.
            "rentable_sf": usable,
            "balcony_sf": "100",
            "annual_rent_per_sf": rent,
            "cap_rate": "0.065",
        },
    )
    _ok(resp)


def test_hcad_known_overflow_is_422_not_500():
    """Regression pin for FINDING-S16: the documented overflow payload."""
    _reset_rate_limit()
    resp = client.post(
        "/api/v1/tools/hcad-tax-normalizer/calculate",
        json={
            "original_base_year_assessment": "1E+40",
            "retroactive_adjustment": "1E+39",
            "current_year_tax": "1E+40",
            "pro_rata_pct": "1",
        },
    )
    assert resp.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
