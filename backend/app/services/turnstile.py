"""Cloudflare Turnstile verification for public form endpoints.

Verifies the client Turnstile token against Cloudflare's siteverify endpoint.
Fails closed: any network error, parse error, non-OK response, or unsuccessful
verification is treated as failure. Verification is bypassed only OUTSIDE
production when the secret is unset (local dev / tests). If the secret is unset
in production it fails closed and logs a one-time error, so a misconfiguration
cannot silently degrade back to the unprotected posture.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import Request

from app.config import Settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

_warned_unset_in_production = False


def get_client_ip(request: Request) -> str | None:
    """Best-effort real client IP. api.capveri.com sits behind Cloudflare."""
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


async def verify_turnstile(
    token: str | None,
    settings: Settings,
    *,
    remote_ip: str | None = None,
    expected_action: str | None = None,
) -> bool:
    """Return True only if the token is verified by Cloudflare. Fails closed."""
    secret = settings.turnstile_secret_key.strip()
    if not secret:
        if settings.environment == "production":
            global _warned_unset_in_production
            if not _warned_unset_in_production:
                logger.error(
                    "TURNSTILE_SECRET_KEY is unset in production; rejecting all "
                    "public form submissions (fail-closed). Set the secret to "
                    "restore form functionality."
                )
                _warned_unset_in_production = True
            return False
        # Non-production: allow bypass so local dev and tests work without a secret.
        return True

    if not token:
        return False

    payload = {"secret": secret, "response": token}
    if remote_ip:
        payload["remoteip"] = remote_ip

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(SITEVERIFY_URL, data=payload)
        response.raise_for_status()
        result = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Turnstile verification request failed: %s", exc)
        return False

    if not result.get("success", False):
        return False

    if expected_action and result.get("action") != expected_action:
        logger.warning(
            "Turnstile action mismatch: expected %s, received %s",
            expected_action,
            result.get("action"),
        )
        return False

    allowed_hostnames = {
        hostname.strip().lower()
        for hostname in settings.turnstile_allowed_hostnames.split(",")
        if hostname.strip()
    }
    if allowed_hostnames:
        hostname = str(result.get("hostname", "")).lower()
        if hostname not in allowed_hostnames:
            logger.warning("Turnstile hostname rejected: %s", hostname)
            return False

    return True
