"""PostHog capture helpers for server-truth events."""

import logging
import re
from collections.abc import Mapping
from typing import Any, Literal

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

BillingEventName = Literal[
    "checkout_started",
    "checkout_completed",
    "trial_started",
    "subscription_started",
    "invoice_paid",
    "invoice_payment_failed",
    "subscription_cancel_scheduled",
    "subscription_cancelled",
    "subscription_reactivated",
]

_BLOCKED_PROPERTY_KEY_PATTERN = re.compile(
    r"(^|_)(email|email_address|customer_email|billing_email|user_email|"
    r"receipt_email|phone|phone_number|name|full_name|token|secret|password|"
    r"file_name|filename|tenant_name|property_name|address|document_url|"
    r"storage_key|storage_bucket|source_text|text|notes|note|old_value|"
    r"new_value|edit_history|message)"
    r"($|_)",
    re.IGNORECASE,
)
_EMAIL_VALUE_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_PHONE_VALUE_PATTERN = re.compile(r"^\+?[\d\s().-]{7,}$")
_FILE_OR_URL_VALUE_PATTERN = re.compile(
    r"(\.pdf(\?|$)|\.csv(\?|$)|\.xlsx?(\?|$)|https?://|s3://|blob:)",
    re.IGNORECASE,
)


def _normalize_property_key(key: str) -> str:
    return re.sub(r"(?<!^)([A-Z])", r"_\1", key).lower()


def _is_blocked_property_key(key: str) -> bool:
    normalized_key = _normalize_property_key(key)
    if normalized_key.endswith("email_domain"):
        return False
    return bool(_BLOCKED_PROPERTY_KEY_PATTERN.search(normalized_key))


def _clean_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Mapping):
        return _clean_properties(value)
    if isinstance(value, list):
        cleaned_list = [_clean_value(item) for item in value]
        return [item for item in cleaned_list if item is not None]
    if isinstance(value, tuple):
        cleaned_tuple = [_clean_value(item) for item in value]
        return [item for item in cleaned_tuple if item is not None]
    if isinstance(value, str):
        trimmed_value = value.strip()
        if _EMAIL_VALUE_PATTERN.match(trimmed_value):
            return None
        if _PHONE_VALUE_PATTERN.match(trimmed_value):
            return None
        if _FILE_OR_URL_VALUE_PATTERN.search(trimmed_value):
            return None
    return value


def _clean_properties(properties: Mapping[str, Any]) -> dict[str, Any]:
    clean_properties: dict[str, Any] = {}
    for key, value in properties.items():
        if _is_blocked_property_key(key):
            continue
        clean_value = _clean_value(value)
        if clean_value is not None:
            clean_properties[key] = clean_value
    return clean_properties


def _build_capture_payload(
    event: str,
    *,
    organization_id: str | None,
    user_id: str | None,
    distinct_id: str | None,
    properties: Mapping[str, Any] | None,
    api_key: str,
) -> dict[str, Any] | None:
    """Build the sanitized PostHog capture payload.

    Returns None when the API key is empty so callers can no-op identically
    across the async and sync capture paths.
    """
    api_key = api_key.strip()
    if not api_key:
        return None

    resolved_distinct_id = (
        distinct_id
        or (f"user:{user_id}" if user_id else None)
        or (f"org:{organization_id}" if organization_id else None)
        or "backend:anonymous"
    )
    event_properties = {
        "source_app": "backend",
        **(
            {
                "organization_id": organization_id,
                "$groups": {"organization": organization_id},
            }
            if organization_id
            else {}
        ),
        **({"user_id": user_id} if user_id else {}),
        **_clean_properties(properties or {}),
    }
    return {
        "api_key": api_key,
        "event": event,
        "distinct_id": resolved_distinct_id,
        "properties": event_properties,
    }


async def capture_backend_event(
    event: str,
    *,
    organization_id: str | None = None,
    user_id: str | None = None,
    distinct_id: str | None = None,
    properties: Mapping[str, Any] | None = None,
) -> None:
    """Capture a sanitized backend event in PostHog."""
    settings = get_settings()
    payload = _build_capture_payload(
        event,
        organization_id=organization_id,
        user_id=user_id,
        distinct_id=distinct_id,
        properties=properties,
        api_key=settings.posthog_project_api_key,
    )
    if payload is None:
        return

    posthog_host = settings.posthog_host.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.post(f"{posthog_host}/capture/", json=payload)
            response.raise_for_status()
    except Exception:
        logger.warning("PostHog capture failed for %s", event, exc_info=True)


def capture_backend_event_sync(
    event: str,
    *,
    organization_id: str | None = None,
    user_id: str | None = None,
    distinct_id: str | None = None,
    properties: Mapping[str, Any] | None = None,
) -> None:
    """Capture a sanitized backend event from synchronous code (Celery workers).

    Mirrors ``capture_backend_event`` but uses a blocking HTTP client so it can
    be called from sync task code. Never raises.
    """
    settings = get_settings()
    payload = _build_capture_payload(
        event,
        organization_id=organization_id,
        user_id=user_id,
        distinct_id=distinct_id,
        properties=properties,
        api_key=settings.posthog_project_api_key,
    )
    if payload is None:
        return

    posthog_host = settings.posthog_host.rstrip("/")
    try:
        with httpx.Client(timeout=3.0) as client:
            response = client.post(f"{posthog_host}/capture/", json=payload)
            response.raise_for_status()
    except Exception:
        logger.warning("PostHog capture failed for %s", event, exc_info=True)


async def capture_billing_event(
    event: BillingEventName,
    *,
    organization_id: str,
    properties: Mapping[str, Any] | None = None,
) -> None:
    """Capture a backend billing event in PostHog.

    Revenue lifecycle analytics come from Stripe webhooks. This helper keeps
    identity at the organization level and strips accidental email fields.
    """
    await capture_backend_event(
        event,
        organization_id=organization_id,
        distinct_id=f"org:{organization_id}",
        properties=properties,
    )
