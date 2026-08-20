"""Tests for Ventora Sequencer client helpers."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services.sequencer import (
    enroll_sequencer_sequence,
    record_sequencer_event,
    unsubscribe_sequencer_contact,
    upsert_sequencer_contact,
)


def _settings(**overrides):
    values = {
        "sequencer_base_url": "https://sequencer-api.example.com/",
        "sequencer_cf_access_client_id": "client-id",
        "sequencer_cf_access_client_secret": "client-secret",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.asyncio
async def test_upsert_contact_skips_when_service_token_missing():
    result = await upsert_sequencer_contact(
        _settings(sequencer_cf_access_client_secret=""),
        email="lead@example.com",
    )

    assert result is False


@pytest.mark.asyncio
async def test_enroll_sequence_upserts_contact_then_creates_enrollment():
    with patch(
        "app.services.sequencer._post_sequencer", new_callable=AsyncMock
    ) as post:
        post.return_value = True

        result = await enroll_sequencer_sequence(
            _settings(),
            email="lead@example.com",
            sequence_slug="capveri-nurture-value-1",
            external_id="content:lead-1:nurture",
            metadata={"assetSlug": "cam-gross-up-calculator"},
        )

    assert result is True
    assert [call.args[1] for call in post.await_args_list] == [
        "/api/v1/contacts",
        "/api/v1/enrollments",
    ]
    assert post.await_args_list[0].args[2] == {
        "email": "lead@example.com",
        "product": "capveri",
        "properties": {"assetSlug": "cam-gross-up-calculator"},
    }
    assert post.await_args_list[1].args[2] == {
        "email": "lead@example.com",
        "product": "capveri",
        "sequence_slug": "capveri-nurture-value-1",
        "source": "content:lead-1:nurture",
        "properties": {"assetSlug": "cam-gross-up-calculator"},
    }


@pytest.mark.asyncio
async def test_unsubscribe_posts_product_suppression():
    with patch(
        "app.services.sequencer._post_sequencer", new_callable=AsyncMock
    ) as post:
        post.return_value = True

        result = await unsubscribe_sequencer_contact(
            _settings(),
            email="lead@example.com",
            metadata={"source": "capveri-unsubscribe-link"},
        )

    assert result is True
    post.assert_awaited_once_with(
        _settings(),
        "/api/v1/unsubscribe",
        {
            "email": "lead@example.com",
            "product": "capveri",
            "reason": "capveri-unsubscribe-link",
        },
    )


@pytest.mark.asyncio
async def test_signup_completed_event_uses_stable_idempotency_key():
    with patch(
        "app.services.sequencer._post_sequencer", new_callable=AsyncMock
    ) as post:
        post.return_value = True

        result = await record_sequencer_event(
            _settings(),
            email="Lead@Example.com",
            event="signup_completed",
            metadata={"lead_id": "lead-1", "source": "plg_free_audit"},
        )

    assert result is True
    post.assert_awaited_once_with(
        _settings(),
        "/api/v1/events",
        {
            "email": "Lead@Example.com",
            "product": "capveri",
            "event": "signup_completed",
            "properties": {"lead_id": "lead-1", "source": "plg_free_audit"},
        },
        idempotency_key="signup_completed:capveri:lead:lead-1",
    )
