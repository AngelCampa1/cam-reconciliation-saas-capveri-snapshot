"""Manual Resend smoke test.

Run only when intentionally validating Resend delivery:
RUN_RESEND_LIVE_TEST=1 RESEND_TEST_TO_EMAIL=you@example.com pytest -m resend_live tests/manual/test_resend_live.py -q --no-cov
"""

import os
from datetime import UTC, datetime

import pytest

from app.config import get_settings
from app.services.email import build_email_service

pytestmark = pytest.mark.resend_live


@pytest.mark.asyncio
async def test_resend_live_sends_single_smoke_email():
    """Send exactly one live Resend email when explicitly requested."""
    to_email = os.getenv("RESEND_TEST_TO_EMAIL")
    if not to_email:
        pytest.skip("Set RESEND_TEST_TO_EMAIL to receive the smoke email")

    settings = get_settings()
    if not settings.resend_api_key:
        pytest.skip("Set RESEND_API_KEY to run the live Resend smoke test")

    email_service = build_email_service(settings)
    sent_at = datetime.now(UTC).isoformat()

    result = await email_service.send_admin_notification(
        to_email=to_email,
        subject=f"CapVeri Resend smoke test - {sent_at}",
        body_html=(
            "<p>This is a manually triggered Resend smoke test for CapVeri.</p>"
            f"<p>Sent at: {sent_at}</p>"
        ),
    )

    assert result["status"] == "sent"
    assert result["id"]
