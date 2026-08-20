"""Test script for Resend email functionality.

This script sends real test emails to verify Resend API integration.
Run from backend directory: python scripts/test_email.py
"""

import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.services.email.resend_service import EmailService

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def test_all_emails():
    """Test all email notification types."""
    # Get credentials from environment
    api_key = os.getenv("RESEND_API_KEY")
    from_address = os.getenv(
        "RESEND_FROM_ADDRESS", "Angel Campa <angel.campa@capveri.com>"
    )

    if not api_key:
        logger.error("RESEND_API_KEY not found in environment")
        logger.error("Please set it in your .env file or export it")
        return

    logger.info(f"Using API Key: {api_key[:10]}...")
    logger.info(f"From Address: {from_address}")

    # Initialize email service
    email_service = EmailService(api_key=api_key, from_address=from_address)

    # Test recipient
    test_email = settings.admin_notification_email

    logger.info("=" * 60)
    logger.info("RESEND EMAIL FUNCTIONALITY TEST")
    logger.info("=" * 60)

    # Test 1: New Statement Notification
    logger.info("Test 1: New Statement Notification")
    logger.info("-" * 60)
    try:
        result = await email_service.send_new_statement_notification(
            to_email=test_email,
            tenant_name="Acme Corp",
            property_name="Gateway Plaza",
            period="2024",
            amount="$12,500.00",
            portal_url=f"{settings.app_base_url}/tenant/statements/123",
        )
        logger.info(f"[SUCCESS] Email sent (ID: {result['id']})")
    except Exception as e:
        logger.error(f"[FAILED] {e}")

    # Test 2: Tenant Invitation
    logger.info("Test 2: Tenant Invitation")
    logger.info("-" * 60)
    try:
        expires_at = datetime.now() + timedelta(days=7)
        result = await email_service.send_tenant_invitation(
            to_email=test_email,
            invitation_token="test-token-12345",
            expires_at=expires_at,
        )
        logger.info(f"[SUCCESS] Email sent (ID: {result['id']})")
    except Exception as e:
        logger.error(f"[FAILED] {e}")

    # Test 3: Dispute Update
    logger.info("Test 3: Dispute Update")
    logger.info("-" * 60)
    try:
        result = await email_service.send_dispute_update(
            to_email=test_email,
            tenant_name="Acme Corp",
            property_name="Gateway Plaza",
            dispute_status="Under Review",
            portal_url=f"{settings.app_base_url}/tenant/disputes/456",
        )
        logger.info(f"[SUCCESS] Email sent (ID: {result['id']})")
    except Exception as e:
        logger.error(f"[FAILED] {e}")

    # Test 4: New Dispute Notification (NEW METHOD)
    logger.info("Test 4: New Dispute Notification (Admin)")
    logger.info("-" * 60)
    try:
        result = await email_service.send_new_dispute_notification(
            to_email=test_email,
            admin_name="John Admin",
            tenant_name="Acme Corp",
            category="Expense Calculation Error",
            portal_url=f"{settings.app_base_url}/disputes/789",
        )
        logger.info(f"[SUCCESS] Email sent (ID: {result['id']})")
    except Exception as e:
        logger.error(f"[FAILED] {e}")

    logger.info("=" * 60)
    logger.info(f"All tests completed! Check {test_email} for emails.")
    logger.info("=" * 60)


if __name__ == "__main__":
    # Load .env file
    from dotenv import load_dotenv

    load_dotenv()

    asyncio.run(test_all_emails())
