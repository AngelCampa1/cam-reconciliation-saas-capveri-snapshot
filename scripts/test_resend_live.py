"""Live test script for Resend email integration.

This script sends real test emails to verify Resend setup.
Run with: python test_resend_live.py your-email@example.com
"""

import asyncio
import sys
from datetime import datetime, timedelta

from app.config import settings
from app.services.email.resend_service import EmailService


async def test_statement_notification(test_email: str):
    """Test sending a statement notification email."""
    print("=" * 60)
    print("Testing Statement Notification Email")
    print("=" * 60)

    email_service = EmailService(
        api_key=settings.resend_api_key, from_address=settings.resend_from_address
    )

    try:
        result = await email_service.send_new_statement_notification(
            to_email=test_email,
            tenant_name="Test Tenant Corp",
            property_name="123 Main Street Plaza",
            period="2024",
            amount="$12,500.00",
            portal_url=f"{settings.app_base_url}/tenant/statements/test-123",
        )
        print("[OK] Statement notification sent successfully!")
        print(f"   Message ID: {result['id']}")
        print(f"   Status: {result['status']}")
    except Exception as e:
        print(f"[FAIL] Failed to send statement notification: {e}")
        raise


async def test_tenant_invitation(test_email: str):
    """Test sending a tenant invitation email."""
    print("\n" + "=" * 60)
    print("Testing Tenant Invitation Email")
    print("=" * 60)

    email_service = EmailService(
        api_key=settings.resend_api_key, from_address=settings.resend_from_address
    )

    try:
        expires_at = datetime.now() + timedelta(days=7)
        result = await email_service.send_tenant_invitation(
            to_email=test_email,
            invitation_token="test-token-abc123",
            expires_at=expires_at,
        )
        print("[OK] Tenant invitation sent successfully!")
        print(f"   Message ID: {result['id']}")
        print(f"   Status: {result['status']}")
    except Exception as e:
        print(f"[FAIL] Failed to send tenant invitation: {e}")
        raise


async def test_dispute_update(test_email: str):
    """Test sending a dispute update email."""
    print("\n" + "=" * 60)
    print("Testing Dispute Update Email")
    print("=" * 60)

    email_service = EmailService(
        api_key=settings.resend_api_key, from_address=settings.resend_from_address
    )

    try:
        result = await email_service.send_dispute_update(
            to_email=test_email,
            tenant_name="Test Tenant Corp",
            property_name="123 Main Street Plaza",
            dispute_status="Under Review",
            portal_url=f"{settings.app_base_url}/tenant/disputes/test-456",
        )
        print("[OK] Dispute update sent successfully!")
        print(f"   Message ID: {result['id']}")
        print(f"   Status: {result['status']}")
    except Exception as e:
        print(f"[FAIL] Failed to send dispute update: {e}")
        raise


async def main():
    """Run all email tests."""
    # Get email from command line argument
    if len(sys.argv) < 2:
        print("Usage: python test_resend_live.py your-email@example.com")
        sys.exit(1)

    test_email = sys.argv[1]

    print("\nCapVeri Resend Email Integration Test")
    print("=" * 60)
    print(f"Test Email: {test_email}")
    print(f"Resend API Key: {settings.resend_api_key[:10]}...")
    print(f"From Address: {settings.resend_from_address}")
    print("=" * 60)

    # Test all three email types
    await test_statement_notification(test_email)
    await test_tenant_invitation(test_email)
    await test_dispute_update(test_email)

    print("\n" + "=" * 60)
    print("All email tests completed!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Check your inbox for the test emails")
    print("2. Verify emails look correct and links work")
    print("3. Check Resend dashboard: https://resend.com/emails")
    print("4. Monitor delivery status and any bounces")


if __name__ == "__main__":
    asyncio.run(main())
