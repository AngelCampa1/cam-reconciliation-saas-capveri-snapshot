"""Tests for Cloudflare Turnstile verification service."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

import app.services.turnstile as turnstile_module
from app.services.turnstile import get_client_ip, verify_turnstile

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_settings(
    *,
    environment: str = "development",
    secret: str = "",
    allowed_hostnames: str = "capveri.com,www.capveri.com",
) -> SimpleNamespace:
    return SimpleNamespace(
        environment=environment,
        turnstile_secret_key=secret,
        turnstile_allowed_hostnames=allowed_hostnames,
    )


class _FakeRequest:
    """Minimal stand-in for fastapi.Request."""

    def __init__(
        self,
        *,
        cf_ip: str | None = None,
        x_forwarded_for: str | None = None,
        host: str | None = None,
    ) -> None:
        self.headers: dict[str, str] = {}
        if cf_ip is not None:
            self.headers["cf-connecting-ip"] = cf_ip
        if x_forwarded_for is not None:
            self.headers["x-forwarded-for"] = x_forwarded_for
        if host is not None:
            self.client = SimpleNamespace(host=host)
        else:
            self.client = None


# ---------------------------------------------------------------------------
# get_client_ip tests
# ---------------------------------------------------------------------------


def test_get_client_ip_prefers_cf_connecting_ip():
    req = _FakeRequest(cf_ip="1.2.3.4", x_forwarded_for="9.9.9.9", host="5.5.5.5")
    assert get_client_ip(req) == "1.2.3.4"  # type: ignore[arg-type]


def test_get_client_ip_falls_back_to_x_forwarded_for():
    req = _FakeRequest(x_forwarded_for="10.0.0.1, 10.0.0.2", host="5.5.5.5")
    assert get_client_ip(req) == "10.0.0.1"  # type: ignore[arg-type]


def test_get_client_ip_falls_back_to_client_host():
    req = _FakeRequest(host="192.168.1.1")
    assert get_client_ip(req) == "192.168.1.1"  # type: ignore[arg-type]


def test_get_client_ip_returns_none_when_nothing_available():
    req = _FakeRequest()  # no headers, no client
    assert get_client_ip(req) is None  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# verify_turnstile: secret unset + non-production
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bypass_when_no_secret_in_dev():
    """Without a secret in dev, verification is bypassed (returns True)."""
    settings = make_settings(environment="development", secret="")
    result = await verify_turnstile(None, settings)
    assert result is True


@pytest.mark.asyncio
async def test_bypass_when_no_secret_in_staging():
    """Without a secret outside production, bypass still applies."""
    settings = make_settings(environment="staging", secret="")
    result = await verify_turnstile(None, settings)
    assert result is True


# ---------------------------------------------------------------------------
# verify_turnstile: secret unset + production (fail closed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fail_closed_in_production_no_secret(caplog):
    """Secret unset in production: returns False and logs error once."""
    # Reset the module-level global so warning fires fresh.
    turnstile_module._warned_unset_in_production = False

    settings = make_settings(environment="production", secret="")
    import logging

    with caplog.at_level(logging.ERROR, logger="app.services.turnstile"):
        result1 = await verify_turnstile(None, settings)
        result2 = await verify_turnstile(None, settings)

    assert result1 is False
    assert result2 is False
    # Error log should have been emitted exactly once.
    error_records = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(error_records) == 1
    assert "TURNSTILE_SECRET_KEY" in error_records[0].message


# ---------------------------------------------------------------------------
# verify_turnstile: secret set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_returns_false_when_token_is_none():
    settings = make_settings(secret="real-secret")
    result = await verify_turnstile(None, settings)
    assert result is False


@pytest.mark.asyncio
async def test_returns_true_on_success_response():
    """Siteverify success returns True."""
    settings = make_settings(secret="real-secret")

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "success": True,
            "action": "content_download",
            "hostname": "www.capveri.com",
        }
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=fake_response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        result = await verify_turnstile(
            "valid-token", settings, expected_action="content_download"
        )

    assert result is True


@pytest.mark.asyncio
async def test_returns_false_on_action_mismatch():
    settings = make_settings(secret="real-secret")

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "success": True,
            "action": "calculator_unlock",
            "hostname": "www.capveri.com",
        }
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=fake_response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        result = await verify_turnstile(
            "valid-token", settings, expected_action="content_download"
        )

    assert result is False


@pytest.mark.asyncio
async def test_returns_false_on_disallowed_hostname():
    settings = make_settings(secret="real-secret", allowed_hostnames="www.capveri.com")

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "success": True,
            "action": "content_download",
            "hostname": "evil.example",
        }
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=fake_response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        result = await verify_turnstile(
            "valid-token", settings, expected_action="content_download"
        )

    assert result is False


@pytest.mark.asyncio
async def test_returns_false_on_failure_response():
    """Siteverify failure returns False."""
    settings = make_settings(secret="real-secret")

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(return_value={"success": False})

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=fake_response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        result = await verify_turnstile("bad-token", settings)

    assert result is False


@pytest.mark.asyncio
async def test_fails_closed_on_http_error():
    """Network or HTTP error returns False."""
    settings = make_settings(secret="real-secret")

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(side_effect=httpx.HTTPError("connection failed"))
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        result = await verify_turnstile("token", settings)

    assert result is False


@pytest.mark.asyncio
async def test_remote_ip_included_in_post_data():
    """When remote_ip is provided it is sent in the POST data."""
    settings = make_settings(secret="real-secret")

    fake_response = MagicMock()
    fake_response.raise_for_status = MagicMock()
    fake_response.json = MagicMock(
        return_value={
            "success": True,
            "action": "content_download",
            "hostname": "www.capveri.com",
        }
    )

    fake_client = AsyncMock()
    fake_client.post = AsyncMock(return_value=fake_response)
    fake_client.__aenter__ = AsyncMock(return_value=fake_client)
    fake_client.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.turnstile.httpx.AsyncClient", return_value=fake_client):
        await verify_turnstile("tok", settings, remote_ip="1.2.3.4")

    call_kwargs = fake_client.post.call_args.kwargs
    assert call_kwargs["data"]["remoteip"] == "1.2.3.4"
