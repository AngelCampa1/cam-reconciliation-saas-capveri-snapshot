"""
Manual test script for Resend inbound webhook.

Tests signature verification and email forwarding locally.
"""

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime

import httpx
import pytest

from app.config import settings

if __name__ != "__main__":
    pytest.skip(
        "Manual webhook verification script; automated coverage lives in backend/tests/test_webhooks.py",  # noqa: E501
        allow_module_level=True,
    )

# Configuration
WEBHOOK_URL = "http://localhost:8000/webhooks/resend"
WEBHOOK_SECRET = "whsec_TEST_PLACEHOLDER_NOT_A_REAL_SECRET"


def create_signature(payload: str, timestamp: str, secret: str) -> str:
    """Create Svix-format signature for payload."""
    signed_payload = f"{timestamp}.{payload}"
    signature = hmac.new(
        secret.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"t={timestamp} v1={signature}"


async def test_missing_signature():
    """Test: Missing signature should return 400."""
    print("\n[Test 1] Missing Signature")
    print("=" * 60)

    payload = {"type": "email.received", "data": {"from": "test@example.com"}}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            WEBHOOK_URL, json=payload, headers={"Content-Type": "application/json"}
        )

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 400 and "svix-signature" in response.text.lower():
        print("[PASS] Correctly rejected missing signature")
    else:
        print("[FAIL] Should reject missing signature with 400")


async def test_invalid_signature():
    """Test: Invalid signature should return 400."""
    print("\n[Test 2] Invalid Signature")
    print("=" * 60)

    payload = {"type": "email.received", "data": {"from": "test@example.com"}}
    payload_str = json.dumps(payload)

    async with httpx.AsyncClient() as client:
        response = await client.post(
            WEBHOOK_URL,
            content=payload_str,
            headers={
                "Content-Type": "application/json",
                "svix-signature": "t=123 v1=invalid_signature_here",
            },
        )

    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")

    if response.status_code == 400 and "signature" in response.text.lower():
        print("[PASS] Correctly rejected invalid signature")
    else:
        print("[FAIL] Should reject invalid signature with 400")


async def test_valid_signature():
    """Test: Valid signature should forward email."""
    print("\n[Test 3] Valid Signature (Email Forwarding)")
    print("=" * 60)

    # Create realistic payload
    timestamp = str(int(datetime.now(UTC).timestamp()))
    payload = {
        "type": "email.received",
        "data": {
            "from": "customer@example.com",
            "to": "support@capveri.com",
            "subject": "Test Inbound Email",
            "html": "<p>This is a test email from the verification script.</p>",
            "text": "This is a test email from the verification script.",
        },
    }
    payload_str = json.dumps(payload)

    # Create valid signature
    signature = create_signature(payload_str, timestamp, WEBHOOK_SECRET)

    print(f"Timestamp: {timestamp}")
    print(f"Signature: {signature[:50]}...")
    print(f"Payload: {payload_str[:100]}...")

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                WEBHOOK_URL,
                content=payload_str,
                headers={
                    "Content-Type": "application/json",
                    "svix-signature": signature,
                },
                timeout=10.0,
            )

            print(f"\nStatus: {response.status_code}")
            print(f"Response: {response.json()}")

            if response.status_code == 200 and response.json().get("received"):
                print("PASS: Webhook accepted and processed")
                print(
                    f"\n[EMAIL] Check {settings.admin_notification_email} for forwarded email!"
                )
            else:
                print("FAIL: Expected 200 with {'received': True}")

        except httpx.ConnectError:
            print("FAIL: Could not connect to server")
            print("Make sure backend is running: cd backend && uvicorn app.main:app")
        except Exception as e:
            print(f"FAIL: Error occurred: {e}")


async def test_unknown_event_type():
    """Test: Unknown event type should be ignored gracefully."""
    print("\n[Test 4] Unknown Event Type")
    print("=" * 60)

    timestamp = str(int(datetime.now(UTC).timestamp()))
    payload = {"type": "email.bounced", "data": {"email": "test@example.com"}}
    payload_str = json.dumps(payload)

    signature = create_signature(payload_str, timestamp, WEBHOOK_SECRET)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                WEBHOOK_URL,
                content=payload_str,
                headers={
                    "Content-Type": "application/json",
                    "svix-signature": signature,
                },
                timeout=10.0,
            )

            print(f"Status: {response.status_code}")
            print(f"Response: {response.json()}")

            if response.status_code == 200 and response.json().get("received"):
                print("PASS: Unknown event type handled gracefully")
            else:
                print("FAIL: Expected 200 with {'received': True}")

        except httpx.ConnectError:
            print("FAIL: Could not connect to server")


async def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("   RESEND INBOUND WEBHOOK - MANUAL VERIFICATION")
    print("=" * 60)
    print(f"\nWebhook URL: {WEBHOOK_URL}")
    print(f"Secret: {WEBHOOK_SECRET[:20]}...")
    print("\nNOTE: Start backend server before running:")
    print("  cd backend && uvicorn app.main:app --reload")

    await test_missing_signature()
    await test_invalid_signature()
    await test_valid_signature()
    await test_unknown_event_type()

    print("\n" + "=" * 60)
    print("   MANUAL VERIFICATION COMPLETE")
    print("=" * 60)
    print("\n[TIP] Check backend logs for detailed processing information")
    print("[TIP] Check email inbox for forwarded test message\n")


if __name__ == "__main__":
    asyncio.run(main())
