"""Sentry integration for CapVeri.

Privacy-safe (send_default_pii=False). PII is scrubbed before any event
reaches the Sentry network.  When SENTRY_DSN is empty the module is a no-op
— safe in development and CI.
"""

import logging
import re
from typing import Any

import sentry_sdk
from sentry_sdk.types import Event, Hint

from app.config import settings
from app.core.logging import get_correlation_id

logger = logging.getLogger(__name__)

try:
    from sentry_sdk.integrations.celery import CeleryIntegration as _CeleryIntegration

    _CELERY_INTEGRATIONS: list = [_CeleryIntegration()]
except ImportError:
    _CELERY_INTEGRATIONS = []

# ── PII detection patterns ─────────────────────────────────────────────────────
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_JWT_RE = re.compile(r"eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+")
_IP_RE = re.compile(
    r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}" r"(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b"
)

_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {"password", "token", "secret", "api_key", "authorization", "cookie"}
)

_EXPECTED_CLIENT_STATUS_CODES: frozenset[int] = frozenset(
    {400, 401, 403, 404, 409, 410, 422, 429}
)


def _scrub_string(value: str) -> str:
    """Replace PII tokens in a string with safe placeholders."""
    value = _JWT_RE.sub("[token]", value)
    value = _EMAIL_RE.sub("[email]", value)
    value = _IP_RE.sub("[ip]", value)
    return value


def _scrub_list(items: list[Any]) -> list[Any]:
    """Scrub PII from string elements inside a list."""
    return [_scrub_string(item) if isinstance(item, str) else item for item in items]


def _scrub_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Recursively redact sensitive keys and scrub PII from string values."""
    result: dict[str, Any] = {}
    for key, value in data.items():
        if key.lower() in _SENSITIVE_KEYS:
            result[key] = "[redacted]"
        elif isinstance(value, dict):
            result[key] = _scrub_dict(value)
        elif isinstance(value, list):
            result[key] = _scrub_list(value)
        elif isinstance(value, str):
            result[key] = _scrub_string(value)
        else:
            result[key] = value
    return result


def _scrub_exception_values(event: dict[str, Any]) -> None:
    """Scrub PII from raw exception message strings in the event payload."""
    exception = event.get("exception")
    if not isinstance(exception, dict):
        return
    for exc_value in exception.get("values") or []:
        if not isinstance(exc_value, dict):
            continue
        msg = exc_value.get("value")
        if isinstance(msg, str):
            exc_value["value"] = _scrub_string(msg)


def _before_send(event: Event, hint: Hint) -> Event | None:
    """Sentry before_send hook: attach correlation ID and scrub PII."""
    # Attach correlation ID tag
    correlation_id = get_correlation_id()
    if correlation_id:
        tags = event.setdefault("tags", {})
        tags["correlation_id"] = correlation_id

    # Scrub request headers and body
    request = event.get("request")
    if isinstance(request, dict):
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = _scrub_dict(headers)
        data = request.get("data")
        if isinstance(data, dict):
            request["data"] = _scrub_dict(data)

    # Scrub raw exception message strings (e.g. ValueError("user@example.com"))
    _scrub_exception_values(event)  # type: ignore[arg-type]

    # Scrub extra context
    extra = event.get("extra")
    if isinstance(extra, dict):
        event["extra"] = _scrub_dict(extra)

    return event


def init_sentry() -> None:
    """Initialise Sentry SDK.  No-op when SENTRY_DSN is empty."""
    if not settings.sentry_dsn:
        return

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=settings.app_version,
        send_default_pii=False,
        traces_sample_rate=0.10,
        before_send=_before_send,
        integrations=[*_CELERY_INTEGRATIONS],
    )
    logger.info("Sentry initialised", extra={"environment": settings.environment})


def should_report_status_code(status_code: int) -> bool:
    """Return True when an HTTP status represents an unexpected app failure."""
    if status_code in _EXPECTED_CLIENT_STATUS_CODES:
        return False
    return status_code >= 500


def capture_unexpected_exception(
    exc: BaseException,
    *,
    operation: str,
    tags: dict[str, str] | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Capture an unexpected exception with consistent, privacy-safe context."""
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("surface", "backend")
        scope.set_tag("operation", operation)

        correlation_id = get_correlation_id()
        if correlation_id:
            scope.set_tag("correlation_id", correlation_id)

        for key, value in (tags or {}).items():
            scope.set_tag(key, value)

        scrubbed_extra = _scrub_dict(extra) if extra else {}
        for key, value in scrubbed_extra.items():
            scope.set_extra(key, value)

        sentry_sdk.capture_exception(exc)
