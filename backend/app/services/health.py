"""Health check service for monitoring system dependencies.

Provides async check functions for each external dependency and a
run_health_checks() aggregator used by the /health endpoint.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from app.config import settings
from app.database.client import SupabaseClientManager
from app.services.extraction import get_storage_client

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class DependencyCheck:
    status: HealthStatus
    latency_ms: int | None = None
    message: str | None = None


def _is_placeholder(key: str | None) -> bool:
    """Return True if a credential key is absent or a known placeholder value."""
    if not key:
        return True
    lower = key.lower()
    return key.endswith("...") or "your" in lower or key.startswith("test-")


async def check_database() -> DependencyCheck:
    """Check Supabase connectivity with latency measurement."""
    try:
        start = time.monotonic()
        ok = await SupabaseClientManager.verify_connection()
        latency_ms = int((time.monotonic() - start) * 1000)
        if ok:
            return DependencyCheck(status=HealthStatus.HEALTHY, latency_ms=latency_ms)
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="connection failed"
        )
    except (
        Exception
    ):  # pragma: no cover — verify_connection() never raises; defensive guard
        logger.exception("Unexpected error in database health check")
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="connection error"
        )


async def check_storage() -> DependencyCheck:
    """Check Cloudflare R2 bucket reachability and write capability."""
    try:
        if _is_placeholder(settings.documents_r2_access_key_id):
            # In production, missing/placeholder storage credentials mean
            # document storage is genuinely non-functional — surface it as
            # UNHEALTHY so it cannot be mistaken for a healthy deployment.
            # Outside production (dev/test/staging) keep it DEGRADED.
            if settings.environment == "production":
                return DependencyCheck(
                    status=HealthStatus.UNHEALTHY,
                    message="storage credentials not configured",
                )
            return DependencyCheck(
                status=HealthStatus.DEGRADED, message="using test credentials"
            )

        start = time.monotonic()
        storage_health = await asyncio.to_thread(get_storage_client().check_health)
        latency_ms = int((time.monotonic() - start) * 1000)

        if storage_health["healthy"]:
            return DependencyCheck(
                status=HealthStatus.HEALTHY,
                latency_ms=latency_ms,
            )

        return DependencyCheck(
            status=HealthStatus.UNHEALTHY,
            latency_ms=latency_ms,
            message=storage_health.get("message", "storage check failed"),
        )
    except Exception:
        logger.exception("Unexpected error in storage health check")
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="storage probe error"
        )


async def check_document_reader() -> DependencyCheck:
    """Check document-reader credential configuration."""
    try:
        if _is_placeholder(settings.openrouter_api_key):
            return DependencyCheck(
                status=HealthStatus.DEGRADED, message="using test credentials"
            )
        return DependencyCheck(status=HealthStatus.HEALTHY)
    except Exception:
        logger.exception("Unexpected error in document_reader health check")
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="configuration error"
        )


async def check_payments() -> DependencyCheck:
    """Check Stripe API credential configuration."""
    try:
        if _is_placeholder(settings.stripe_secret_key):
            return DependencyCheck(
                status=HealthStatus.DEGRADED, message="using test credentials"
            )
        return DependencyCheck(status=HealthStatus.HEALTHY)
    except Exception:
        logger.exception("Unexpected error in payments health check")
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="configuration error"
        )


async def check_email() -> DependencyCheck:
    """Check Resend API credential configuration."""
    try:
        if _is_placeholder(settings.resend_api_key):
            return DependencyCheck(
                status=HealthStatus.DEGRADED, message="using test credentials"
            )
        return DependencyCheck(status=HealthStatus.HEALTHY)
    except Exception:
        logger.exception("Unexpected error in email health check")
        return DependencyCheck(
            status=HealthStatus.UNHEALTHY, message="configuration error"
        )


async def run_health_checks() -> tuple[dict[str, Any], int]:
    """Run all dependency checks concurrently and return (response_body, http_status).

    HTTP status codes:
      503 — database is unhealthy (platform cannot serve requests)
      200 — healthy or degraded (platform is operational)

    Overall status rules:
      unhealthy — database is down (503)
      degraded  — DB up but any service is UNHEALTHY or DEGRADED (200)
      healthy   — all checks pass (200)
    """
    db, storage, document_reader, payments, email = await asyncio.gather(
        check_database(),
        check_storage(),
        check_document_reader(),
        check_payments(),
        check_email(),
    )

    named: dict[str, DependencyCheck] = {
        "database": db,
        "storage": storage,
        "document_reader": document_reader,
        "payments": payments,
        "email": email,
    }

    statuses = {c.status for c in named.values()}
    if db.status == HealthStatus.UNHEALTHY:
        overall = HealthStatus.UNHEALTHY
    elif HealthStatus.UNHEALTHY in statuses or HealthStatus.DEGRADED in statuses:
        overall = HealthStatus.DEGRADED
    else:
        overall = HealthStatus.HEALTHY

    http_status = 503 if overall == HealthStatus.UNHEALTHY else 200

    def _serialise(check: DependencyCheck) -> dict[str, Any]:
        out: dict[str, Any] = {"status": check.status}
        if check.latency_ms is not None:
            out["latency_ms"] = check.latency_ms
        if check.message is not None:
            out["message"] = check.message
        return out

    body: dict[str, Any] = {
        "status": overall,
        "version": settings.app_version,
        "environment": settings.environment,
        "timestamp": datetime.now(UTC).isoformat(),
        "checks": {name: _serialise(c) for name, c in named.items()},
    }

    return body, http_status
