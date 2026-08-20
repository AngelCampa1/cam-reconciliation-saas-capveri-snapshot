"""Client helpers for Ventora Sequencer product API."""

from __future__ import annotations

from typing import Any, Literal

import httpx

from app.config import Settings

PRODUCT_ID = "capveri"

SequenceSlug = Literal["capveri-fulfillment-intro", "capveri-nurture-value-1"]


def _sequencer_config(settings: Settings) -> tuple[str, str, str] | None:
    base_url = settings.sequencer_base_url.strip().rstrip("/")
    client_id = settings.sequencer_cf_access_client_id.strip()
    client_secret = settings.sequencer_cf_access_client_secret.strip()
    if not base_url or not client_id or not client_secret:
        return None
    return base_url, client_id, client_secret


async def _post_sequencer(
    settings: Settings,
    path: str,
    payload: dict[str, Any],
    *,
    idempotency_key: str | None = None,
) -> bool:
    config = _sequencer_config(settings)
    if config is None:
        return False

    base_url, client_id, client_secret = config
    async with httpx.AsyncClient(timeout=10.0) as client:
        headers = {
            "Content-Type": "application/json",
            "CF-Access-Client-Id": client_id,
            "CF-Access-Client-Secret": client_secret,
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        response = await client.post(
            f"{base_url}{path}",
            headers=headers,
            json=payload,
        )
    response.raise_for_status()
    return True


async def upsert_sequencer_contact(
    settings: Settings,
    *,
    email: str,
    metadata: dict[str, Any] | None = None,
) -> bool:
    return await _post_sequencer(
        settings,
        "/api/v1/contacts",
        {
            "email": email,
            "product": PRODUCT_ID,
            "properties": metadata or {},
        },
    )


async def enroll_sequencer_sequence(
    settings: Settings,
    *,
    email: str,
    sequence_slug: SequenceSlug,
    external_id: str,
    metadata: dict[str, Any] | None = None,
) -> bool:
    await upsert_sequencer_contact(settings, email=email, metadata=metadata)
    return await _post_sequencer(
        settings,
        "/api/v1/enrollments",
        {
            "email": email,
            "product": PRODUCT_ID,
            "sequence_slug": sequence_slug,
            "source": external_id,
            "properties": metadata or {},
        },
    )


async def record_sequencer_event(
    settings: Settings,
    *,
    email: str,
    event: str,
    metadata: dict[str, Any] | None = None,
) -> bool:
    event_metadata = metadata or {}
    idempotency_key = None
    if event == "signup_completed":
        lead_id = event_metadata.get("lead_id")
        if lead_id:
            idempotency_key = f"signup_completed:{PRODUCT_ID}:lead:{lead_id}"
        else:
            idempotency_key = (
                f"signup_completed:{PRODUCT_ID}:email:{email.strip().lower()}"
            )

    return await _post_sequencer(
        settings,
        "/api/v1/events",
        {
            "email": email,
            "product": PRODUCT_ID,
            "event": event,
            "properties": event_metadata,
        },
        idempotency_key=idempotency_key,
    )


async def unsubscribe_sequencer_contact(
    settings: Settings,
    *,
    email: str,
    metadata: dict[str, Any] | None = None,
) -> bool:
    return await _post_sequencer(
        settings,
        "/api/v1/unsubscribe",
        {
            "email": email,
            "product": PRODUCT_ID,
            "reason": (metadata or {}).get("source"),
        },
    )
