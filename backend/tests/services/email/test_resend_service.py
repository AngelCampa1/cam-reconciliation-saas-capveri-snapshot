"""Tests for Resend email service."""

import logging
import re
from datetime import UTC, datetime
from html import unescape
from unittest.mock import MagicMock, patch

import pybreaker
import pytest

from app.exceptions import ServiceUnavailableError
from app.services.email.resend_service import EmailService


def assert_email_in_log(log_text: str) -> None:
    """Accept either scrubbed or raw email logging based on global log config."""
    email_pattern = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    assert "[email]" in log_text or re.search(email_pattern, log_text)


@pytest.fixture
def email_service():
    """Email service fixture."""
    return EmailService(
        api_key="re_test_12345",
        from_address="noreply@capveri.com",
        unsubscribe_hmac_secret="test-unsub-secret",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method_name", "kwargs"),
    [
        (
            "send_new_statement_notification",
            {
                "tenant_name": "Jane Tenant",
                "property_name": "123 Main St",
                "period": "2026",
                "amount": "$1,200.00",
                "portal_url": "https://portal.capveri.com/statements/1",
            },
        ),
        (
            "send_tenant_invitation",
            {
                "invitation_token": "tenant-token",
                "expires_at": datetime(2026, 1, 15, tzinfo=UTC),
            },
        ),
        (
            "send_dispute_update",
            {
                "tenant_name": "Jane Tenant",
                "property_name": "123 Main St",
                "dispute_status": "Under Review",
                "portal_url": "https://portal.capveri.com/disputes/1",
            },
        ),
        (
            "send_new_dispute_notification",
            {
                "admin_name": "Admin User",
                "tenant_name": "Jane Tenant",
                "category": "Expense Review",
                "portal_url": "https://portal.capveri.com/admin/disputes/1",
            },
        ),
        (
            "send_dispute_comment_notification",
            {
                "admin_name": "Admin User",
                "tenant_name": "Jane Tenant",
                "portal_url": "https://portal.capveri.com/admin/disputes/1",
            },
        ),
        (
            "send_team_invitation",
            {
                "invitation_token": "team-token",
                "organization_name": "Acme Properties",
                "role": "admin",
                "inviter_name": "Admin User",
                "expires_at": datetime(2026, 1, 15, tzinfo=UTC),
            },
        ),
        (
            "send_team_welcome",
            {
                "full_name": "Team User",
                "organization_name": "Acme Properties",
                "role": "member",
            },
        ),
        (
            "send_content_download",
            {
                "first_name": "Jane",
                "asset_name": "CAM Checklist",
                "download_url": "https://storage.capveri.com/checklist.pdf",
            },
        ),
        ("send_welcome_email", {"organization_name": "Acme Properties"}),
        (
            "send_signup_confirmation_email",
            {
                "organization_name": "Acme Properties",
                "checkout_url": "https://billing.capveri.com/session/1",
            },
        ),
        (
            "send_trial_started_email",
            {
                "organization_name": "Acme Properties",
                "trial_days": 14,
                "trial_start": datetime(2026, 1, 1, tzinfo=UTC),
                "charge_date": datetime(2026, 1, 15, tzinfo=UTC),
                "charge_amount_formatted": "$249.00",
                "billing_url": "https://app.capveri.com/settings/billing",
            },
        ),
        (
            "send_trial_ending_soon_email",
            {
                "organization_name": "Acme Properties",
                "trial_start": datetime(2026, 1, 1, tzinfo=UTC),
                "charge_date": datetime(2026, 1, 15, tzinfo=UTC),
                "charge_amount_formatted": "$249.00",
                "billing_url": "https://app.capveri.com/settings/billing",
            },
        ),
        (
            "send_trial_paused_email",
            {
                "organization_name": "Acme Properties",
                "charge_date": datetime(2026, 1, 15, tzinfo=UTC),
                "charge_amount_formatted": "$249.00",
                "billing_url": "https://app.capveri.com/settings/billing",
            },
        ),
        (
            "send_free_audit_results",
            {
                "organization_name": "Acme Properties",
                "recovery_amount": 0,
                "property_name": "123 Main St",
            },
        ),
    ],
)
async def test_customer_facing_sends_include_unsubscribe_controls(
    email_service, method_name, kwargs
):
    """Customer-facing legacy emails include footer and provider unsubscribe header."""
    with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
        mock_send.return_value = {"id": "email_with_unsubscribe"}

        await getattr(email_service, method_name)(
            to_email="recipient@example.com", **kwargs
        )

    call_args = mock_send.call_args[0][0]
    headers = call_args["headers"]
    assert "capveri.com/unsubscribe" in headers["List-Unsubscribe"]
    assert "List-Unsubscribe-Post" not in headers
    assert "capveri.com/unsubscribe" in call_args["html"]


class TestEmailServiceInit:
    """Tests for EmailService initialization."""

    def test_init_sets_api_key_and_from_address(self):
        """Service initializes with correct API key and from address."""
        with patch("app.services.email.resend_service.resend") as mock_resend:
            service = EmailService(
                api_key="re_test_api_key", from_address="test@example.com"
            )

            assert mock_resend.api_key == "re_test_api_key"
            assert service.from_address == "test@example.com"


class TestSendEmailThreaded:
    """Tests for the async, thread-offloaded _send_email implementation (F-144)."""

    @pytest.mark.asyncio
    async def test_send_email_runs_send_in_thread_and_returns_result(
        self, email_service
    ):
        """_send_email offloads the synchronous Resend call to a worker thread."""
        import threading

        calling_thread: dict[str, int] = {}

        def fake_send(_params):
            calling_thread["id"] = threading.get_ident()
            return {"id": "email-threaded-1"}

        with patch(
            "app.services.email.resend_service.resend.Emails.send",
            side_effect=fake_send,
        ):
            result = await email_service._send_email({"to": "a@b.com"})

        assert result == {"id": "email-threaded-1"}
        # The blocking SDK call must not run on the event loop thread.
        assert calling_thread["id"] != threading.get_ident()

    @pytest.mark.asyncio
    async def test_send_email_translates_circuit_breaker_error(self, email_service):
        """A CircuitBreakerError from the threaded call becomes ServiceUnavailableError."""
        mock_breaker = MagicMock()
        mock_breaker.call.side_effect = pybreaker.CircuitBreakerError(
            mock_breaker, None
        )

        with patch(
            "app.services.email.resend_service.get_resend_breaker",
            return_value=mock_breaker,
        ):
            with pytest.raises(ServiceUnavailableError):
                await email_service._send_email({"to": "a@b.com"})


class TestSendEmailCircuitBreaker:
    """Tests for circuit-breaker protection in _send_email."""

    @pytest.mark.asyncio
    async def test_circuit_breaker_open_raises_service_unavailable(self, email_service):
        """CircuitBreakerError is converted to ServiceUnavailableError."""
        mock_breaker = MagicMock()
        mock_breaker.call.side_effect = pybreaker.CircuitBreakerError(
            mock_breaker, None
        )

        with patch(
            "app.services.email.resend_service.get_resend_breaker",
            return_value=mock_breaker,
        ):
            with pytest.raises(ServiceUnavailableError):
                await email_service.send_new_statement_notification(
                    to_email="tenant@example.com",
                    tenant_name="Test",
                    property_name="Test",
                    period="2024",
                    amount="$1",
                    portal_url="https://portal.capveri.com/s/1",
                )


class TestSendNewStatementNotification:
    """Tests for send_new_statement_notification method."""

    @pytest.mark.asyncio
    async def test_send_statement_notification_success(self, email_service):
        """Successfully send statement notification email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_123"}

            result = await email_service.send_new_statement_notification(
                to_email="tenant@example.com",
                tenant_name="John Doe",
                property_name="123 Main St",
                period="2024",
                amount="$12,500.00",
                portal_url="https://portal.capveri.com/statement/123",
            )

            assert result == {"status": "sent", "id": "email_123"}

            # Verify email was sent with correct parameters
            mock_send.assert_called_once()
            call_args = mock_send.call_args[0][0]

            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "tenant@example.com"
            assert call_args["subject"] == "New CAM Statement Available - 123 Main St"
            assert "John Doe" in call_args["html"]
            assert "123 Main St" in call_args["html"]
            assert "2024" in call_args["html"]
            assert "$12,500.00" in call_args["html"]
            assert "https://portal.capveri.com/statement/123" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_statement_notification_html_content(self, email_service):
        """HTML content includes all required elements."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_456"}

            await email_service.send_new_statement_notification(
                to_email="tenant@example.com",
                tenant_name="Jane Smith",
                property_name="456 Oak Ave",
                period="Q4 2024",
                amount="$8,750.50",
                portal_url="https://portal.capveri.com/statement/456",
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]

            # Verify HTML structure and content
            assert "New CAM statement for" in html
            assert "456 Oak Ave" in html
            assert "Hello Jane Smith" in html
            assert "Q4 2024" in html
            assert "$8,750.50" in html
            assert "View Statement" in html
            assert 'href="https://portal.capveri.com/statement/456"' in html
            assert "submit a dispute" in html

    @pytest.mark.asyncio
    async def test_send_statement_notification_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("API timeout")

            with pytest.raises(Exception, match="API timeout"):
                await email_service.send_new_statement_notification(
                    to_email="tenant@example.com",
                    tenant_name="Test User",
                    property_name="Test Property",
                    period="2024",
                    amount="$10,000",
                    portal_url="https://portal.capveri.com/test",
                )

            # Verify error was logged
            assert "Failed to send statement notification" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_statement_notification_logs_success(
        self, email_service, caplog
    ):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "email_success_123"}

            await email_service.send_new_statement_notification(
                to_email="log-test@example.com",
                tenant_name="Log Test",
                property_name="Log Property",
                period="2024",
                amount="$5,000",
                portal_url="https://portal.capveri.com/log",
            )

            # Verify success was logged
            assert "Statement notification sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "email_success_123" in caplog.text


class TestSendTenantInvitation:
    """Tests for send_tenant_invitation method."""

    @pytest.mark.asyncio
    async def test_send_tenant_invitation_success(self, email_service):
        """Successfully send tenant invitation email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "invite_123"}

            expires_at = datetime(2025, 1, 15, 23, 59, 59, tzinfo=UTC)

            result = await email_service.send_tenant_invitation(
                to_email="newuser@example.com",
                invitation_token="token_abc123",
                expires_at=expires_at,
            )

            assert result == {"status": "sent", "id": "invite_123"}

            # Verify email was sent with correct parameters
            mock_send.assert_called_once()
            call_args = mock_send.call_args[0][0]

            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "newuser@example.com"
            assert call_args["subject"] == "You're Invited to CapVeri Tenant Portal"
            assert "token_abc123" in call_args["html"]
            assert "January 15, 2025" in call_args["html"]
            assert (
                "breakdown" in call_args["html"].lower()
                or "dispute" in call_args["html"].lower()
            )

    @pytest.mark.asyncio
    async def test_send_tenant_invitation_html_content(self, email_service):
        """HTML content includes invitation link and expiration."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "invite_456"}

            expires_at = datetime(2025, 6, 30, 23, 59, 59, tzinfo=UTC)

            await email_service.send_tenant_invitation(
                to_email="invite@example.com",
                invitation_token="unique_token_xyz",
                expires_at=expires_at,
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]

            # Verify HTML structure and content
            assert "Your CAM statements are ready to view" in html
            assert (
                "https://app.capveri.com/tenant/signup?token=unique_token_xyz" in html
            )
            assert "Create Your Account" in html
            assert "June 30, 2025" in html
            assert "This invitation expires" in html

    @pytest.mark.asyncio
    async def test_send_tenant_invitation_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("SMTP connection failed")

            expires_at = datetime(2025, 1, 31, 23, 59, 59, tzinfo=UTC)

            with pytest.raises(Exception, match="SMTP connection failed"):
                await email_service.send_tenant_invitation(
                    to_email="fail@example.com",
                    invitation_token="fail_token",
                    expires_at=expires_at,
                )

            # Verify error was logged
            assert "Failed to send tenant invitation" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_tenant_invitation_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "invite_log_789"}

            expires_at = datetime(2025, 3, 1, 23, 59, 59, tzinfo=UTC)

            await email_service.send_tenant_invitation(
                to_email="logtest@example.com",
                invitation_token="log_token",
                expires_at=expires_at,
            )

            # Verify success was logged
            assert "Tenant invitation sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "invite_log_789" in caplog.text


class TestSendDisputeUpdate:
    """Tests for send_dispute_update method."""

    @pytest.mark.asyncio
    async def test_send_dispute_update_success(self, email_service):
        """Successfully send dispute update email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "dispute_123"}

            result = await email_service.send_dispute_update(
                to_email="tenant@example.com",
                tenant_name="Alice Johnson",
                property_name="789 Pine St",
                dispute_status="Under Review",
                portal_url="https://portal.capveri.com/disputes/123",
            )

            assert result == {"status": "sent", "id": "dispute_123"}

            # Verify email was sent with correct parameters
            mock_send.assert_called_once()
            call_args = mock_send.call_args[0][0]

            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "tenant@example.com"
            assert call_args["subject"] == "Dispute Update - 789 Pine St"
            assert "Alice Johnson" in call_args["html"]
            assert "789 Pine St" in call_args["html"]
            assert "Under Review" in call_args["html"]
            assert "https://portal.capveri.com/disputes/123" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_dispute_update_html_content(self, email_service):
        """HTML content includes dispute details and link."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "dispute_456"}

            await email_service.send_dispute_update(
                to_email="dispute@example.com",
                tenant_name="Bob Smith",
                property_name="321 Elm Blvd",
                dispute_status="Resolved",
                portal_url="https://portal.capveri.com/disputes/456",
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]

            # Verify HTML structure and content
            assert "Dispute Status Update" in html
            assert "Hello Bob Smith" in html
            assert "<strong>321 Elm Blvd</strong>" in html
            assert "<strong>Status:</strong> Resolved" in html
            assert "View Details" in html
            assert 'href="https://portal.capveri.com/disputes/456"' in html

    @pytest.mark.asyncio
    async def test_send_dispute_update_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Rate limit exceeded")

            with pytest.raises(Exception, match="Rate limit exceeded"):
                await email_service.send_dispute_update(
                    to_email="ratelimit@example.com",
                    tenant_name="Test User",
                    property_name="Test Property",
                    dispute_status="Rejected",
                    portal_url="https://portal.capveri.com/disputes/999",
                )

            # Verify error was logged
            assert "Failed to send dispute update" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_dispute_update_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "dispute_log_321"}

            await email_service.send_dispute_update(
                to_email="success@example.com",
                tenant_name="Success User",
                property_name="Success Property",
                dispute_status="Completed",
                portal_url="https://portal.capveri.com/disputes/success",
            )

            # Verify success was logged
            assert "Dispute update sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "dispute_log_321" in caplog.text


class TestSendNewDisputeNotification:
    """Tests for send_new_dispute_notification method."""

    @pytest.mark.asyncio
    async def test_send_new_dispute_notification_success(self, email_service):
        """Successfully send new dispute notification to admin."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "admin_notify_123"}

            result = await email_service.send_new_dispute_notification(
                to_email="admin@example.com",
                admin_name="John Admin",
                tenant_name="Acme Corp",
                category="Expense Calculation Error",
                portal_url="https://portal.capveri.com/admin/disputes/789",
            )

            assert result == {"status": "sent", "id": "admin_notify_123"}

            # Verify email was sent with correct parameters
            mock_send.assert_called_once()
            call_args = mock_send.call_args[0][0]

            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "admin@example.com"
            assert call_args["subject"] == "New Tenant Dispute - Acme Corp"
            assert "John Admin" in call_args["html"]
            assert "Acme Corp" in call_args["html"]
            assert "Expense Calculation Error" in call_args["html"]
            assert "https://portal.capveri.com/admin/disputes/789" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_new_dispute_notification_html_content(self, email_service):
        """HTML content includes all required notification elements."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "admin_notify_456"}

            await email_service.send_new_dispute_notification(
                to_email="admin2@example.com",
                admin_name="Jane Admin",
                tenant_name="Widget Inc",
                category="Missing Documentation",
                portal_url="https://portal.capveri.com/admin/disputes/999",
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]

            # Verify HTML structure and content
            assert "New Tenant Dispute Submitted" in html
            assert "Hello Jane Admin" in html
            assert "<strong>Widget Inc</strong>" in html
            assert "<strong>Category:</strong> Missing Documentation" in html
            assert "Review Dispute" in html
            assert 'href="https://portal.capveri.com/admin/disputes/999"' in html

    @pytest.mark.asyncio
    async def test_send_new_dispute_notification_api_failure(
        self, email_service, caplog
    ):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Network timeout")

            with pytest.raises(Exception, match="Network timeout"):
                await email_service.send_new_dispute_notification(
                    to_email="fail@example.com",
                    admin_name="Admin User",
                    tenant_name="Test Tenant",
                    category="Test Category",
                    portal_url="https://portal.capveri.com/admin/disputes/test",
                )

            # Verify error was logged
            assert "Failed to send new dispute notification" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_new_dispute_notification_logs_success(
        self, email_service, caplog
    ):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "admin_log_success_555"}

            await email_service.send_new_dispute_notification(
                to_email="logadmin@example.com",
                admin_name="Log Admin",
                tenant_name="Log Tenant",
                category="Log Category",
                portal_url="https://portal.capveri.com/admin/disputes/log",
            )

            # Verify success was logged
            assert "New dispute notification sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "admin_log_success_555" in caplog.text


class TestSendDisputeCommentNotification:
    """Tests for send_dispute_comment_notification method."""

    @pytest.mark.asyncio
    async def test_send_dispute_comment_notification_success(self, email_service):
        """Successfully sends tenant comment notification to an admin."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "comment_notify_123"}

            result = await email_service.send_dispute_comment_notification(
                to_email="admin@example.com",
                admin_name="John Admin",
                tenant_name="Acme Corp",
                portal_url="https://portal.capveri.com/admin/disputes/789",
            )

            assert result == {"status": "sent", "id": "comment_notify_123"}

            mock_send.assert_called_once()
            call_args = mock_send.call_args[0][0]

            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "admin@example.com"
            assert call_args["subject"] == "New Dispute Comment - Acme Corp"
            assert "John Admin" in call_args["html"]
            assert "Acme Corp" in call_args["html"]
            assert "added a comment" in call_args["html"]
            assert "https://portal.capveri.com/admin/disputes/789" in call_args["html"]


class TestSendWelcomeEmail:
    """Tests for send_welcome_email method."""

    @pytest.mark.asyncio
    async def test_send_welcome_email_success(self, email_service):
        """Successfully send welcome email after signup."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "welcome_123"}

            result = await email_service.send_welcome_email(
                to_email="newuser@example.com",
                organization_name="Acme Properties LLC",
            )

            assert result == {"status": "sent", "id": "welcome_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "newuser@example.com"
            assert (
                "first cam reconciliation" in call_args["subject"].lower()
                or "review your draft" in call_args["subject"].lower()
            )
            assert "Review Draft Reconciliation" in call_args["html"]
            assert "/reconciliations" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_welcome_email_contains_cta_link(self, email_service):
        """Welcome email HTML contains reconciliation review CTA link."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "welcome_456"}

            await email_service.send_welcome_email(
                to_email="landlord@example.com",
                organization_name="Summit Real Estate",
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]
            assert "/reconciliations" in html
            assert "Review Draft Reconciliation" in html
            assert "Summit Real Estate" in html or "your" in html.lower()

    @pytest.mark.asyncio
    async def test_send_welcome_email_uses_service_base_urls(self):
        """Instance URL overrides apply to template body and shared footer."""
        service = EmailService(
            api_key="re_test_12345",
            from_address="noreply@capveri.com",
            unsubscribe_hmac_secret="test-unsub-secret",
            app_base_url="https://staging-app.capveri.test",
            marketing_base_url="https://staging.capveri.test",
        )

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "welcome_staging"}

            await service.send_welcome_email(
                to_email="landlord@example.com",
                organization_name="Summit Real Estate",
            )

            html = mock_send.call_args[0][0]["html"]
            assert "https://staging-app.capveri.test/reconciliations" in html
            assert "https://staging.capveri.test/help" in html
            assert "https://app.capveri.com/reconciliations" not in html
            assert "https://www.capveri.com/help" not in html

    @pytest.mark.asyncio
    async def test_send_welcome_email_api_failure_raises(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Resend API down")

            with pytest.raises(Exception, match="Resend API down"):
                await email_service.send_welcome_email(
                    to_email="fail@example.com",
                    organization_name="Test Org",
                )

            assert "Failed to send welcome email" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_welcome_email_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "welcome_log_789"}

            await email_service.send_welcome_email(
                to_email="log@example.com",
                organization_name="Log Org",
            )

            assert "Welcome email sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "welcome_log_789" in caplog.text


class TestSendFreeAuditResults:
    """Tests for send_free_audit_results method."""

    @pytest.mark.asyncio
    async def test_send_free_audit_results_with_recovery(self, email_service):
        """Subject includes dollar amount when recovery > 0."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "audit_result_123"}

            result = await email_service.send_free_audit_results(
                to_email="landlord@example.com",
                organization_name="Apex Properties",
                recovery_amount=12500,
                property_name="123 Main St",
            )

            assert result == {"status": "sent", "id": "audit_result_123"}

            call_args = mock_send.call_args[0][0]
            subject = call_args["subject"]
            html = call_args["html"]

            assert "12,500" in subject or "12500" in subject or "CapVeri" in subject
            assert "123 Main St" in subject or "123 Main St" in html
            assert "$249" in html or "subscribe" in html.lower()
            assert "/settings/billing" in html or "billing" in html.lower()
            assert "capveri.com/unsubscribe" in call_args["headers"]["List-Unsubscribe"]
            assert "List-Unsubscribe-Post" not in call_args["headers"]
            assert "capveri.com/unsubscribe" in html

    @pytest.mark.asyncio
    async def test_send_free_audit_results_no_recovery(self, email_service):
        """Neutral subject/body when recovery is 0."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "audit_result_456"}

            result = await email_service.send_free_audit_results(
                to_email="landlord@example.com",
                organization_name="Apex Properties",
                recovery_amount=0,
                property_name="456 Oak Ave",
            )

            assert result == {"status": "sent", "id": "audit_result_456"}

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]

            assert (
                "clean" in html.lower()
                or "looks good" in html.lower()
                or "no" in html.lower()
            )
            assert "subscribe" in html.lower() or "other buildings" in html.lower()

    @pytest.mark.asyncio
    async def test_send_free_audit_results_api_failure_raises(
        self, email_service, caplog
    ):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Connection refused")

            with pytest.raises(Exception, match="Connection refused"):
                await email_service.send_free_audit_results(
                    to_email="fail@example.com",
                    organization_name="Fail Org",
                    recovery_amount=5000,
                    property_name="Fail Property",
                )

            assert "Failed to send free audit results" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_free_audit_results_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "audit_log_999"}

            await email_service.send_free_audit_results(
                to_email="log@example.com",
                organization_name="Log Org",
                recovery_amount=3000,
                property_name="Log Property",
            )

            assert "Free audit results email sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "audit_log_999" in caplog.text


class TestSendTeamInvitation:
    """Tests for send_team_invitation method."""

    @pytest.mark.asyncio
    async def test_send_team_invitation_success(self, email_service):
        """Successfully send team invitation email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "team_invite_123"}

            expires_at = datetime(2025, 3, 31, 23, 59, 59, tzinfo=UTC)

            result = await email_service.send_team_invitation(
                to_email="newteam@example.com",
                invitation_token="team_token_abc",
                organization_name="Acme Properties",
                role="admin",
                inviter_name="Jane Manager",
                expires_at=expires_at,
            )

            assert result == {"status": "sent", "id": "team_invite_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "newteam@example.com"
            assert "Acme Properties" in call_args["subject"]
            assert "team_token_abc" in call_args["html"]
            assert "Acme Properties" in call_args["html"]
            assert "March 31, 2025" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_team_invitation_no_inviter_name(self, email_service):
        """Team invitation uses fallback text when inviter_name is None."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "team_invite_456"}

            expires_at = datetime(2025, 6, 1, tzinfo=UTC)

            await email_service.send_team_invitation(
                to_email="anon@example.com",
                invitation_token="anon_token",
                organization_name="Beta Corp",
                role="member",
                inviter_name=None,
                expires_at=expires_at,
            )

            call_args = mock_send.call_args[0][0]
            assert (
                "team administrator" in call_args["html"].lower()
                or "administrator" in call_args["html"]
            )

    @pytest.mark.asyncio
    async def test_send_team_invitation_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Network error")

            expires_at = datetime(2025, 1, 1, tzinfo=UTC)

            with pytest.raises(Exception, match="Network error"):
                await email_service.send_team_invitation(
                    to_email="fail@example.com",
                    invitation_token="fail_token",
                    organization_name="Fail Corp",
                    role="viewer",
                    inviter_name="Admin",
                    expires_at=expires_at,
                )

            assert "Failed to send team invitation" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_team_invitation_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "team_log_789"}

            await email_service.send_team_invitation(
                to_email="log@example.com",
                invitation_token="log_token",
                organization_name="Log Corp",
                role="admin",
                inviter_name="Log Manager",
                expires_at=datetime(2025, 12, 31, tzinfo=UTC),
            )

            assert "Team invitation sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "team_log_789" in caplog.text


class TestSendTeamWelcome:
    """Tests for send_team_welcome method."""

    @pytest.mark.asyncio
    async def test_send_team_welcome_success(self, email_service):
        """Successfully send team welcome email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "team_welcome_123"}

            result = await email_service.send_team_welcome(
                to_email="newmember@example.com",
                full_name="Carol Davis",
                organization_name="Summit Properties",
                role="member",
            )

            assert result == {"status": "sent", "id": "team_welcome_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "newmember@example.com"
            assert "Summit Properties" in call_args["subject"]
            assert "Carol Davis" in call_args["html"]
            assert "Summit Properties" in call_args["html"]
            assert "Member" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_team_welcome_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Timeout")

            with pytest.raises(Exception, match="Timeout"):
                await email_service.send_team_welcome(
                    to_email="fail@example.com",
                    full_name="Fail User",
                    organization_name="Fail Corp",
                    role="viewer",
                )

            assert "Failed to send team welcome email" in caplog.text
            assert any(
                record.name == "app.services.email.resend_service"
                for record in caplog.records
            )

    @pytest.mark.asyncio
    async def test_send_team_welcome_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "welcome_log_999"}

            await email_service.send_team_welcome(
                to_email="log@example.com",
                full_name="Log User",
                organization_name="Log Corp",
                role="admin",
            )

            assert "Team welcome email sent" in caplog.text
            assert any(
                record.name == "app.services.email.resend_service"
                for record in caplog.records
            )
            assert "welcome_log_999" in caplog.text


class TestSendContentDownload:
    """Tests for send_content_download method."""

    @pytest.mark.asyncio
    async def test_send_content_download_with_url(self, email_service):
        """Successfully send content download email with URL."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "download_123"}

            result = await email_service.send_content_download(
                to_email="prospect@example.com",
                first_name="Alice",
                asset_name="CAM Audit Checklist",
                download_url="https://signed.s3.example.com/checklist.pdf",
            )

            assert result == {"status": "sent", "id": "download_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["from"] == "noreply@capveri.com"
            assert call_args["to"] == "prospect@example.com"
            assert "CAM Audit Checklist" in call_args["subject"]
            assert "Alice" in call_args["html"]
            assert "signed.s3.example.com" in call_args["html"]
            assert "capveri.com/unsubscribe" in call_args["headers"]["List-Unsubscribe"]
            assert "List-Unsubscribe-Post" not in call_args["headers"]
            assert "capveri.com/unsubscribe" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_content_download_without_url(self, email_service):
        """Content download email shows fallback when URL is empty."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "download_456"}

            await email_service.send_content_download(
                to_email="prospect@example.com",
                first_name="Bob",
                asset_name="CAM Guide",
                download_url="",
            )

            call_args = mock_send.call_args[0][0]
            html = call_args["html"]
            assert "Bob" in html
            assert (
                "support" in html.lower()
                or "contact" in html.lower()
                or "prepare" in html.lower()
            )

    @pytest.mark.asyncio
    async def test_send_content_download_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Send failed")

            with pytest.raises(Exception, match="Send failed"):
                await email_service.send_content_download(
                    to_email="fail@example.com",
                    first_name="Fail",
                    asset_name="Fail Guide",
                    download_url="https://example.com/fail.pdf",
                )

            assert "Failed to send content download email" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_send_content_download_logs_success(self, email_service, caplog):
        """Successful send logs email ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "download_log_777"}

            await email_service.send_content_download(
                to_email="log@example.com",
                first_name="Log",
                asset_name="Log Guide",
                download_url="https://example.com/log.pdf",
            )

            assert "Content download email sent" in caplog.text
            assert_email_in_log(caplog.text)
            assert "download_log_777" in caplog.text


class TestForwardInboundEmail:
    """Tests for forward_inbound_email method."""

    @pytest.mark.asyncio
    async def test_forward_inbound_email_success(self, email_service):
        """Successfully forward an inbound email."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "fwd_123"}

            result = await email_service.forward_inbound_email(
                to_email="angel@capveri.com",
                original_from="customer@example.com",
                original_to="support@capveri.com",
                subject="Billing question",
                html="<p>I have a billing question.</p>",
                text="I have a billing question.",
            )

            assert result == {"status": "sent", "id": "fwd_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["to"] == "angel@capveri.com"
            assert "support@capveri.com" in call_args["subject"]
            assert "Billing question" in call_args["subject"]
            assert "customer@example.com" in call_args["html"]
            assert call_args["reply_to"] == "customer@example.com"

    @pytest.mark.asyncio
    async def test_forward_inbound_email_no_html(self, email_service):
        """Forward email handles None html content."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "fwd_456"}

            await email_service.forward_inbound_email(
                to_email="angel@capveri.com",
                original_from="plain@example.com",
                original_to="support@capveri.com",
                subject="Plain text email",
                html=None,
                text="Plain text content",
            )

            call_args = mock_send.call_args[0][0]
            assert "plain@example.com" in call_args["html"]
            assert "plain@example.com" in call_args["text"]
            assert "Plain text content" in call_args["text"]

    @pytest.mark.asyncio
    async def test_forward_inbound_email_api_failure(self, email_service, caplog):
        """API failure raises exception and logs error."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.side_effect = Exception("Forward failed")

            with pytest.raises(Exception, match="Forward failed"):
                await email_service.forward_inbound_email(
                    to_email="angel@capveri.com",
                    original_from="fail@example.com",
                    original_to="support@capveri.com",
                    subject="Fail",
                    html=None,
                    text=None,
                )

            assert "Failed to forward inbound email" in caplog.text
            assert_email_in_log(caplog.text)

    @pytest.mark.asyncio
    async def test_forward_inbound_email_logs_success(self, email_service, caplog):
        """Successful forward logs message ID."""
        caplog.set_level(logging.INFO)

        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "fwd_log_888"}

            await email_service.forward_inbound_email(
                to_email="angel@capveri.com",
                original_from="log@example.com",
                original_to="support@capveri.com",
                subject="Log test",
                html="<p>Log</p>",
                text="Log",
            )

            assert "Inbound email forwarded" in caplog.text
            assert_email_in_log(caplog.text)
            assert "fwd_log_888" in caplog.text


class TestSendFeedbackNotification:
    """Tests for send_feedback_notification method."""

    @pytest.mark.asyncio
    async def test_send_feedback_notification_success(self, email_service):
        """Successfully send internal feedback notification."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "feedback_123"}

            result = await email_service.send_feedback_notification(
                to_email="angel.campa@capveri.com",
                feedback_type="bug",
                message="There is a parsing issue in imports table.",
                page_url="/properties/prop-1",
                user_email="user@example.com",
                user_id="user-123",
                organization_id="org-123",
                screenshot_url="https://example.com/screenshot.png",
            )

            assert result == {"status": "sent", "id": "feedback_123"}

            call_args = mock_send.call_args[0][0]
            assert call_args["to"] == "angel.campa@capveri.com"
            assert call_args["subject"] == "New CapVeri Feedback Submission"
            assert "parsing issue" in call_args["html"]
            assert "/properties/prop-1" in call_args["html"]
            assert "user@example.com" in call_args["html"]


class TestEmailSubjectRouting:
    """Regression tests to ensure each scenario preserves its own subject."""

    @pytest.mark.asyncio
    async def test_non_welcome_methods_do_not_use_welcome_subject(self, email_service):
        """Ensure service methods keep scenario-specific subjects."""
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "subject_test_1"}
            await email_service.send_team_invitation(
                to_email="teammate@example.com",
                invitation_token="invite-token",
                organization_name="Acme Org",
                role="member",
                inviter_name="Admin User",
                expires_at=datetime(2026, 12, 31, tzinfo=UTC),
            )
            team_subject = mock_send.call_args[0][0]["subject"]

            mock_send.return_value = {"id": "subject_test_2"}
            await email_service.send_dispute_update(
                to_email="tenant@example.com",
                tenant_name="Tenant",
                property_name="Property A",
                dispute_status="Under Review",
                portal_url="https://app.capveri.com/tenant/disputes/1",
            )
            dispute_subject = mock_send.call_args[0][0]["subject"]

            welcome_fragment = "Your first CAM reconciliation is ready"
            assert welcome_fragment not in team_subject
            assert welcome_fragment not in dispute_subject


class TestSendAdminNotification:
    """Tests for send_admin_notification."""

    @pytest.mark.asyncio
    async def test_send_admin_notification_calls_resend_with_correct_params(
        self, email_service
    ):
        """send_admin_notification forwards to_email, subject, and html to Resend."""
        with patch.object(
            email_service, "_send_email", return_value={"id": "admin-msg-1"}
        ) as mock_send:
            result = await email_service.send_admin_notification(
                to_email="angel.campa@capveri.com",
                subject="New signup: Acme (user@acme.com)",
                body_html="<p>New user signed up</p>",
            )

        mock_send.assert_called_once_with(
            {
                "from": "noreply@capveri.com",
                "to": "angel.campa@capveri.com",
                "subject": "New signup: Acme (user@acme.com)",
                "html": "<p>New user signed up</p>",
            }
        )
        assert result == {"status": "sent", "id": "admin-msg-1"}


class TestTrialLifecycleEmails:
    """Tests for trial-started and trial-ending-soon emails."""

    @pytest.mark.asyncio
    async def test_send_signup_confirmation_email_success(self, email_service):
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "signup_confirmation_123"}

            result = await email_service.send_signup_confirmation_email(
                to_email="owner@example.com",
                organization_name="Acme Properties",
                checkout_url="https://app.capveri.com/settings/billing?intent=select-plan&source=signup",
            )

            assert result == {"status": "sent", "id": "signup_confirmation_123"}
            call_args = mock_send.call_args[0][0]
            assert call_args["subject"] == "Your CapVeri account is ready"
            assert call_args["to"] == "owner@example.com"
            assert "Acme Properties" in call_args["html"]
            assert "Continue setup" in call_args["html"]
            assert (
                "https://app.capveri.com/settings/billing?intent=select-plan&source=signup"
                in unescape(call_args["html"])
            )
            assert "capveri.com/unsubscribe" in call_args["headers"]["List-Unsubscribe"]
            assert "List-Unsubscribe-Post" not in call_args["headers"]
            assert "capveri.com/unsubscribe" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_trial_started_email_success(self, email_service):
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "trial_start_123"}

            result = await email_service.send_trial_started_email(
                to_email="owner@example.com",
                organization_name="Acme Properties",
                trial_days=30,
                trial_start=datetime(2026, 4, 20, tzinfo=UTC),
                charge_date=datetime(2026, 5, 20, tzinfo=UTC),
                charge_amount_formatted="$998/year",
                billing_url="https://app.capveri.com/settings/billing",
            )

            assert result == {"status": "sent", "id": "trial_start_123"}
            call_args = mock_send.call_args[0][0]
            assert call_args["subject"] == "Your CapVeri free trial has started"
            assert "Acme Properties" in call_args["html"]
            assert "April 20, 2026" in call_args["html"]
            assert "May 20, 2026" in call_args["html"]
            assert "$998/year" in call_args["html"]
            assert "/mo" not in call_args["html"]
            assert "No credit card is required to start" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_trial_ending_soon_email_success(self, email_service):
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "trial_end_123"}

            result = await email_service.send_trial_ending_soon_email(
                to_email="owner@example.com",
                organization_name="Acme Properties",
                trial_start=datetime(2026, 4, 20, tzinfo=UTC),
                charge_date=datetime(2026, 5, 20, tzinfo=UTC),
                charge_amount_formatted="$998/year",
                billing_url="https://app.capveri.com/settings/billing",
            )

            assert result == {"status": "sent", "id": "trial_end_123"}
            call_args = mock_send.call_args[0][0]
            assert call_args["subject"] == "Your CapVeri trial ends in 3 days"
            assert "Acme Properties" in call_args["html"]
            assert "April 20, 2026" in call_args["html"]
            assert "May 20, 2026" in call_args["html"]
            assert "$998/year" in call_args["html"]
            assert "/mo" not in call_args["html"]
            assert "your workspace will pause" in call_args["html"]

    @pytest.mark.asyncio
    async def test_send_trial_paused_email_success(self, email_service):
        with patch("app.services.email.resend_service.resend.Emails.send") as mock_send:
            mock_send.return_value = {"id": "trial_paused_123"}

            result = await email_service.send_trial_paused_email(
                to_email="owner@example.com",
                organization_name="Acme Properties",
                charge_date=datetime(2026, 5, 20, tzinfo=UTC),
                charge_amount_formatted="$998/year",
                billing_url="https://app.capveri.com/settings/billing",
            )

            assert result == {"status": "sent", "id": "trial_paused_123"}
            call_args = mock_send.call_args[0][0]
            assert call_args["subject"] == "Your CapVeri trial has ended"
            assert "Acme Properties" in call_args["html"]
            assert "May 20, 2026" in call_args["html"]
            assert "$998/year" in call_args["html"]
            assert "/mo" not in call_args["html"]
            assert "workspace is now paused" in call_args["html"]
