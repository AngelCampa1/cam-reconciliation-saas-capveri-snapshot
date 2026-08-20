"""Admin notification service for real customer activity alerts."""

from datetime import UTC, datetime

from app.services.email.resend_service import EmailService


class AdminNotificationService:
    """Sends internal notifications to the CapVeri admin when real customers act."""

    def __init__(self, email_service: EmailService, admin_email: str) -> None:
        self.email_service = email_service
        self.admin_email = admin_email

    def is_test_account(self, email: str) -> bool:
        """Return True if the email looks like an internal test account."""
        email_lower = email.lower()
        local, _, domain = email_lower.partition("@")
        tags = local.split("+")[1:]
        return domain == "capveri.com" or "test" in tags

    async def notify_onboarding_complete(
        self,
        user_email: str,
        user_name: str | None,
        org_name: str,
    ) -> None:
        """Send admin notification when a real user completes onboarding."""
        if self.is_test_account(user_email):
            return

        now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        subject = f"New signup: {org_name} ({user_email})"
        body_html = (
            "<h2>New Customer Signup</h2>"
            f"<p><strong>Name:</strong> {user_name or '(not set)'}</p>"
            f"<p><strong>Organization:</strong> {org_name}</p>"
            f"<p><strong>Email:</strong> {user_email}</p>"
            f"<p><strong>Time:</strong> {now}</p>"
        )
        await self.email_service.send_admin_notification(
            self.admin_email, subject, body_html
        )

    async def notify_subscription_started(
        self,
        user_email: str,
        org_name: str,
        plan: str,
        building_count: int,
    ) -> None:
        """Send admin notification when a real user starts a subscription."""
        if self.is_test_account(user_email):
            return

        now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        subject = f"New subscription: {org_name} — {plan}, {building_count} building(s)"
        body_html = (
            "<h2>New Subscription Started</h2>"
            f"<p><strong>Organization:</strong> {org_name}</p>"
            f"<p><strong>Plan:</strong> {plan}</p>"
            f"<p><strong>Buildings:</strong> {building_count}</p>"
            f"<p><strong>Email:</strong> {user_email}</p>"
            f"<p><strong>Time:</strong> {now}</p>"
        )
        await self.email_service.send_admin_notification(
            self.admin_email, subject, body_html
        )
