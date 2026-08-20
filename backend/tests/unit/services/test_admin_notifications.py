"""Tests for AdminNotificationService."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.admin_notifications import AdminNotificationService


@pytest.fixture
def mock_email_service():
    """Mock email service with send_admin_notification as AsyncMock."""
    svc = MagicMock()
    svc.send_admin_notification = AsyncMock(
        return_value={"status": "sent", "id": "msg-1"}
    )
    return svc


@pytest.fixture
def admin_svc(mock_email_service):
    """AdminNotificationService wired with mock email service."""
    return AdminNotificationService(
        email_service=mock_email_service,
        admin_email="angel.campa@capveri.com",
    )


class TestIsTestAccount:
    def test_capveri_domain_is_test_account(self, admin_svc):
        """@capveri.com addresses are always treated as test accounts."""
        assert admin_svc.is_test_account("user@capveri.com") is True

    def test_plus_test_local_part_is_test_account(self, admin_svc):
        """Addresses with +test in the local part are test accounts."""
        assert admin_svc.is_test_account("owner+test@gmail.com") is True

    def test_real_user_is_not_test_account(self, admin_svc):
        """A regular commercial email is not a test account."""
        assert admin_svc.is_test_account("landlord@acme.com") is False

    def test_plus_testing_tag_is_not_a_test_account(self, admin_svc):
        """A real user with a +testing tag is NOT silently filtered out."""
        assert admin_svc.is_test_account("billing+testing@acme.com") is False


class TestNotifyOnboardingComplete:
    @pytest.mark.asyncio
    async def test_sends_email_to_admin_for_real_user(
        self, admin_svc, mock_email_service
    ):
        """notify_onboarding_complete sends admin notification for real user."""
        await admin_svc.notify_onboarding_complete(
            user_email="tenant@acme.com",
            user_name="Jane Smith",
            org_name="Acme Properties",
        )

        mock_email_service.send_admin_notification.assert_awaited_once()
        call_kwargs = mock_email_service.send_admin_notification.call_args
        to_email, subject, body_html = call_kwargs.args
        assert to_email == "angel.campa@capveri.com"
        assert "Acme Properties" in subject
        assert "tenant@acme.com" in subject
        assert "tenant@acme.com" in body_html

    @pytest.mark.asyncio
    async def test_skips_notification_for_capveri_domain(
        self, admin_svc, mock_email_service
    ):
        """notify_onboarding_complete silently skips @capveri.com addresses."""
        await admin_svc.notify_onboarding_complete(
            user_email="internal@capveri.com",
            user_name="Angel",
            org_name="CapVeri Internal",
        )

        mock_email_service.send_admin_notification.assert_not_awaited()


class TestNotifySubscriptionStarted:
    @pytest.mark.asyncio
    async def test_sends_email_to_admin_for_real_user(
        self, admin_svc, mock_email_service
    ):
        """notify_subscription_started sends admin notification for real user."""
        await admin_svc.notify_subscription_started(
            user_email="manager@realty.com",
            org_name="Realty Corp",
            plan="professional",
            building_count=5,
        )

        mock_email_service.send_admin_notification.assert_awaited_once()
        call_kwargs = mock_email_service.send_admin_notification.call_args
        to_email, subject, body_html = call_kwargs.args
        assert to_email == "angel.campa@capveri.com"
        assert "Realty Corp" in subject
        assert "professional" in subject
        assert "5" in subject
        assert "manager@realty.com" in body_html

    @pytest.mark.asyncio
    async def test_skips_notification_for_plus_test_address(
        self, admin_svc, mock_email_service
    ):
        """notify_subscription_started silently skips +test addresses."""
        await admin_svc.notify_subscription_started(
            user_email="owner+test@gmail.com",
            org_name="Test Org",
            plan="essentials",
            building_count=1,
        )

        mock_email_service.send_admin_notification.assert_not_awaited()
