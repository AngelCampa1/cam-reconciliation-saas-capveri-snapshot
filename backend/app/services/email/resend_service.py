"""Email sending service using Resend API."""

import asyncio
import html
import logging
from datetime import datetime
from typing import Any, cast

import pybreaker
import resend

from app.core.circuit_breakers import get_resend_breaker
from app.exceptions import ServiceUnavailableError
from app.services.email.renderer import render_email
from app.services.leads.unsubscribe import build_unsubscribe_token

logger = logging.getLogger(__name__)


class EmailService:
    """Email sending via Resend API."""

    def __init__(
        self,
        api_key: str,
        from_address: str,
        unsubscribe_hmac_secret: str = "",
        app_base_url: str | None = None,
        marketing_base_url: str | None = None,
    ):
        """Initialize email service with Resend API key.

        Args:
            api_key: Resend API key
            from_address: Default sender email address
            unsubscribe_hmac_secret: HMAC secret for tokenizing unsubscribe URLs
                in marketing emails. Required for any send method that passes
                ``show_unsubscribe=True``.
        """
        resend.api_key = api_key
        self.from_address = from_address
        self._unsubscribe_hmac_secret = unsubscribe_hmac_secret
        if app_base_url is None or marketing_base_url is None:
            from app.config import get_settings

            settings = get_settings()
            app_base_url = app_base_url or settings.app_base_url
            marketing_base_url = marketing_base_url or settings.marketing_base_url
        self.app_base_url = app_base_url.rstrip("/")
        self.marketing_base_url = marketing_base_url.rstrip("/")

    def _build_unsubscribe_url(self, email: str) -> str:
        """Build a tokenized unsubscribe URL for the given recipient."""
        if not self._unsubscribe_hmac_secret:
            raise ValueError(
                "EmailService.unsubscribe_hmac_secret is not set; cannot build "
                "unsubscribe URL for marketing email."
            )
        email_b64, token = build_unsubscribe_token(email, self._unsubscribe_hmac_secret)
        return f"{self.marketing_base_url}/unsubscribe?e={email_b64}&t={token}"

    def _marketing_email_headers(self, unsubscribe_url: str) -> dict[str, str]:
        """Standard headers for a customer-facing email with unsubscribe support."""
        return {
            "List-Unsubscribe": f"<{unsubscribe_url}>",
        }

    def _render_recipient_email(
        self, to_email: str, template_name: str, **kwargs: object
    ) -> tuple[str, dict[str, str]]:
        """Render a customer-facing email with footer and unsubscribe headers."""
        unsubscribe_url = self._build_unsubscribe_url(to_email)
        html_content = self._render_email(
            template_name,
            show_unsubscribe=True,
            unsubscribe_url=unsubscribe_url,
            **kwargs,
        )
        return html_content, self._marketing_email_headers(unsubscribe_url)

    def _render_email(
        self, template_name: str, show_unsubscribe: bool = False, **kwargs: object
    ) -> str:
        context: dict[str, object] = {
            "app_base_url": self.app_base_url,
            "marketing_base_url": self.marketing_base_url,
            "findings_url": f"{self.app_base_url}/dashboard",
            "reconciliations_url": f"{self.app_base_url}/reconciliations",
            "register_url": f"{self.app_base_url}/auth/register",
        }
        context.update(kwargs)
        return cast(
            str,
            render_email(
                template_name,
                show_unsubscribe=show_unsubscribe,
                **context,
            ),
        )

    async def _send_email(self, params: dict) -> dict:
        """Send email via Resend with circuit breaker protection.

        The Resend SDK call is synchronous (``requests``-based), so it runs in
        a worker thread to avoid blocking the event loop.
        """

        def _do_send() -> dict:
            breaker = cast(Any, get_resend_breaker())
            return cast(
                dict,
                breaker.call(lambda: resend.Emails.send(cast(Any, params))),
            )

        try:
            return await asyncio.to_thread(_do_send)
        except pybreaker.CircuitBreakerError as e:
            raise ServiceUnavailableError(
                "Resend", original_error=e, retry_after=120
            ) from e

    async def send_new_statement_notification(
        self,
        to_email: str,
        tenant_name: str,
        property_name: str,
        period: str,
        amount: str,
        portal_url: str,
    ) -> dict[str, Any]:
        """Send email when new reconciliation statement is available.

        Args:
            to_email: Recipient email address
            tenant_name: Name of the tenant
            property_name: Property name
            period: Statement period (e.g., "2024")
            amount: Tenant's share amount (e.g., "$12,500.00")
            portal_url: URL to view statement in tenant portal

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        html_content, headers = self._render_recipient_email(
            to_email,
            "statement_notification.html",
            tenant_name=tenant_name,
            property_name=property_name,
            period=period,
            amount=amount,
            portal_url=portal_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"New CAM Statement Available - {property_name}",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info(
                "Statement notification sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send statement notification to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_tenant_invitation(
        self,
        to_email: str,
        invitation_token: str,
        expires_at: datetime,
    ) -> dict[str, Any]:
        """Send invitation email for tenant portal signup.

        Args:
            to_email: Recipient email address
            invitation_token: Unique invitation token
            expires_at: Token expiration datetime

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        signup_url = f"{self.app_base_url}/tenant/signup?token={invitation_token}"

        html_content, headers = self._render_recipient_email(
            to_email,
            "tenant_invitation.html",
            signup_url=signup_url,
            expires_at_formatted=expires_at.strftime("%B %d, %Y"),
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "You're Invited to CapVeri Tenant Portal",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Tenant invitation sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send tenant invitation to %s: %s", to_email, e, exc_info=True
            )
            raise

    async def send_dispute_update(
        self,
        to_email: str,
        tenant_name: str,
        property_name: str,
        dispute_status: str,
        portal_url: str,
    ) -> dict[str, Any]:
        """Send email when dispute status changes.

        Args:
            to_email: Recipient email address
            tenant_name: Name of the tenant
            property_name: Property name
            dispute_status: New dispute status
            portal_url: URL to view dispute in tenant portal

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        html_content, headers = self._render_recipient_email(
            to_email,
            "dispute_update.html",
            tenant_name=tenant_name,
            property_name=property_name,
            dispute_status=dispute_status,
            portal_url=portal_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"Dispute Update - {property_name}",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Dispute update sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send dispute update to %s: %s", to_email, e, exc_info=True
            )
            raise

    async def send_new_dispute_notification(
        self,
        to_email: str,
        admin_name: str,
        tenant_name: str,
        category: str,
        portal_url: str,
    ) -> dict[str, Any]:
        """Send email to landlord admin when tenant creates new dispute.

        Args:
            to_email: Admin email address
            admin_name: Name of the admin
            tenant_name: Name of the tenant who created the dispute
            category: Dispute category
            portal_url: URL to view dispute in admin portal

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        html_content, headers = self._render_recipient_email(
            to_email,
            "dispute_notification.html",
            admin_name=admin_name,
            tenant_name=tenant_name,
            category=category,
            portal_url=portal_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"New Tenant Dispute - {tenant_name}",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info(
                "New dispute notification sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send new dispute notification to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_dispute_comment_notification(
        self,
        to_email: str,
        admin_name: str,
        tenant_name: str,
        portal_url: str,
    ) -> dict[str, Any]:
        """Send email to landlord admin when tenant comments on a dispute."""
        html_content, headers = self._render_recipient_email(
            to_email,
            "dispute_comment_notification.html",
            admin_name=admin_name,
            tenant_name=tenant_name,
            portal_url=portal_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"New Dispute Comment - {tenant_name}",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info(
                "Dispute comment notification sent to %s: %s",
                to_email,
                response["id"],
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send dispute comment notification to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_team_invitation(
        self,
        to_email: str,
        invitation_token: str,
        organization_name: str,
        role: str,
        inviter_name: str | None,
        expires_at: datetime,
    ) -> dict[str, Any]:
        """Send invitation email for team member signup.

        Args:
            to_email: Recipient email address
            invitation_token: Unique invitation token
            organization_name: Name of the organization
            role: Role being invited to (admin, member, viewer)
            inviter_name: Name of the person sending the invitation
            expires_at: Token expiration datetime

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        signup_url = f"{self.marketing_base_url}/team/signup?token={invitation_token}"
        inviter_text = inviter_name or "A team administrator"
        role_display = role.title()

        html_content, headers = self._render_recipient_email(
            to_email,
            "team_invitation.html",
            signup_url=signup_url,
            inviter_text=inviter_text,
            organization_name=organization_name,
            role_display=role_display,
            expires_at_formatted=expires_at.strftime("%B %d, %Y"),
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"You're Invited to Join {organization_name}",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Team invitation sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send team invitation to %s: %s", to_email, e, exc_info=True
            )
            raise

    async def send_team_welcome(
        self,
        to_email: str,
        full_name: str,
        organization_name: str,
        role: str,
    ) -> dict[str, Any]:
        """Send welcome email after team member signup.

        Args:
            to_email: Recipient email address
            full_name: New user's full name
            organization_name: Name of the organization
            role: User's role (admin, member, viewer)

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        login_url = f"{self.marketing_base_url}/login"
        role_display = role.title()

        html_content, headers = self._render_recipient_email(
            to_email,
            "team_welcome.html",
            full_name=full_name,
            organization_name=organization_name,
            role_display=role_display,
            login_url=login_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"Welcome to {organization_name} on CapVeri",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Team welcome email sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send team welcome email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_content_download(
        self,
        to_email: str,
        first_name: str,
        asset_name: str,
        download_url: str,
    ) -> dict[str, Any]:
        """Send email with download link for a content asset (downloadable resource).

        Args:
            to_email: Recipient email address
            first_name: Recipient first name
            asset_name: Human-readable asset name
            download_url: Signed URL for the downloadable file (empty string on
                Storage error)

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        unsubscribe_url = self._build_unsubscribe_url(to_email)
        html_content = self._render_email(
            "content_download.html",
            show_unsubscribe=True,
            first_name=first_name,
            asset_name=asset_name,
            download_url=download_url,
            unsubscribe_url=unsubscribe_url,
            register_url=f"{self.app_base_url}/auth/register",
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": f"Your {asset_name} is ready",
                    "html": html_content,
                    "headers": self._marketing_email_headers(unsubscribe_url),
                }
            )
            logger.info(
                "Content download email sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send content download email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def forward_inbound_email(
        self,
        to_email: str,
        original_from: str,
        original_to: str,
        subject: str,
        html: str | None,
        text: str | None,
    ) -> dict[str, Any]:
        """Forward an inbound email to specified address.

        Args:
            to_email: Destination email (configured admin inbox)
            original_from: Original sender email
            original_to: Original recipient
            subject: Email subject line
            html: HTML content (if available)
            text: Plain text content (if available)

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        forwarded_subject = f"[Fwd: {original_to}] {subject}"

        forwarded_html = self._render_email(
            "forward_email.html",
            show_unsubscribe=False,
            original_from=original_from,
            original_to=original_to,
            subject=subject,
            original_html=(html or ""),
            internal_forward_recipient=to_email,
        )
        forwarded_text = (
            f"From: {original_from}\nTo: {original_to}\n"
            f"Subject: {subject}\n\n{text or ''}"
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": forwarded_subject,
                    "html": forwarded_html,
                    "text": forwarded_text,
                    # Allow direct replies to original sender
                    "reply_to": original_from,
                }
            )

            logger.info(
                "Inbound email forwarded from %s to %s: %s",
                original_from,
                to_email,
                response["id"],
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to forward inbound email from %s: %s",
                original_from,
                e,
                exc_info=True,
            )
            raise

    async def send_welcome_email(
        self,
        to_email: str,
        organization_name: str,
    ) -> dict[str, Any]:
        """Send post-onboarding email after first audit draft is created.

        Args:
            to_email: Recipient email address
            organization_name: Name of the new organization

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        html_content, headers = self._render_recipient_email(
            to_email,
            "welcome.html",
            organization_name=organization_name,
            reconciliations_url=f"{self.app_base_url}/reconciliations",
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "Your first CAM reconciliation is ready - review your draft",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Welcome email sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send welcome email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_signup_confirmation_email(
        self,
        to_email: str,
        organization_name: str,
        checkout_url: str,
    ) -> dict[str, Any]:
        """Send the transactional receipt after account creation."""
        html_content, headers = self._render_recipient_email(
            to_email,
            "signup_confirmation.html",
            organization_name=organization_name,
            checkout_url=checkout_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "Your CapVeri account is ready",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info(
                "Signup confirmation email sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send signup confirmation email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_trial_started_email(
        self,
        to_email: str,
        organization_name: str,
        trial_days: int,
        trial_start: datetime,
        charge_date: datetime,
        charge_amount_formatted: str,
        billing_url: str,
    ) -> dict[str, Any]:
        """Send the initial transactional email after a trial starts."""
        html_content, headers = self._render_recipient_email(
            to_email,
            "trial_started.html",
            organization_name=organization_name,
            trial_days=trial_days,
            trial_start_formatted=trial_start.strftime("%B %d, %Y"),
            charge_date_formatted=charge_date.strftime("%B %d, %Y"),
            charge_amount_formatted=charge_amount_formatted,
            billing_url=billing_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "Your CapVeri free trial has started",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Trial started email sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send trial started email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_trial_ending_soon_email(
        self,
        to_email: str,
        organization_name: str,
        trial_start: datetime,
        charge_date: datetime,
        charge_amount_formatted: str,
        billing_url: str,
    ) -> dict[str, Any]:
        """Send the 3-day reminder before a trial converts."""
        html_content, headers = self._render_recipient_email(
            to_email,
            "trial_ending_soon.html",
            organization_name=organization_name,
            trial_start_formatted=trial_start.strftime("%B %d, %Y"),
            charge_date_formatted=charge_date.strftime("%B %d, %Y"),
            charge_amount_formatted=charge_amount_formatted,
            billing_url=billing_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "Your CapVeri trial ends in 3 days",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info(
                "Trial ending soon email sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send trial ending soon email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_trial_paused_email(
        self,
        to_email: str,
        organization_name: str,
        charge_date: datetime,
        charge_amount_formatted: str,
        billing_url: str,
    ) -> dict[str, Any]:
        """Send the access-paused email when a trial ends without billing."""
        html_content, headers = self._render_recipient_email(
            to_email,
            "trial_paused.html",
            organization_name=organization_name,
            charge_date_formatted=charge_date.strftime("%B %d, %Y"),
            charge_amount_formatted=charge_amount_formatted,
            billing_url=billing_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "Your CapVeri trial has ended",
                    "html": html_content,
                    "headers": headers,
                }
            )
            logger.info("Trial paused email sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send trial paused email to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_feedback_notification(
        self,
        to_email: str,
        feedback_type: str,
        message: str,
        page_url: str,
        user_email: str,
        user_id: str,
        organization_id: str,
        screenshot_url: str | None = None,
    ) -> dict[str, Any]:
        """Send internal notification for a newly submitted user feedback item."""
        html_content = (
            "<h2>New User Feedback Submitted</h2>"
            f"<p><strong>Type:</strong> {feedback_type}</p>"
            f"<p><strong>User:</strong> {user_email} ({user_id})</p>"
            f"<p><strong>Organization:</strong> {organization_id}</p>"
            f"<p><strong>Page:</strong> {page_url}</p>"
            f"<p><strong>Message:</strong><br/>{message}</p>"
            + (
                f'<p><strong>Screenshot:</strong> <a href="{screenshot_url}">{screenshot_url}</a></p>'
                if screenshot_url
                else ""
            )
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": "New CapVeri Feedback Submission",
                    "html": html_content,
                }
            )
            logger.info(
                "Feedback notification sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send feedback notification to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_free_audit_results(
        self,
        to_email: str,
        organization_name: str,
        recovery_amount: int,
        property_name: str,
    ) -> dict[str, Any]:
        """Send post-audit email with recovery amount after free audit completes.

        Args:
            to_email: Recipient email address
            organization_name: Name of the organization
            recovery_amount: Dollar amount of CAM recovery opportunity (0 if none)
            property_name: Name of the audited property

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        billing_url = f"{self.app_base_url}/settings/billing"

        if recovery_amount > 0:
            formatted = f"${recovery_amount:,.0f}"
            subject = f"CapVeri found {formatted} in {property_name}"
        else:
            subject = "Your CAM check results are ready"

        unsubscribe_url = self._build_unsubscribe_url(to_email)
        html_content = self._render_email(
            "audit_results.html",
            show_unsubscribe=True,
            organization_name=organization_name,
            recovery_amount=recovery_amount,
            property_name=property_name,
            billing_url=billing_url,
            findings_url=f"{self.app_base_url}/dashboard",
            unsubscribe_url=unsubscribe_url,
        )

        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": subject,
                    "html": html_content,
                    "headers": self._marketing_email_headers(unsubscribe_url),
                }
            )
            logger.info(
                "Free audit results email sent to %s: %s", to_email, response["id"]
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send free audit results to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_admin_notification(
        self, to_email: str, subject: str, body_html: str
    ) -> dict[str, Any]:
        """Send a plain internal admin notification email."""
        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": to_email,
                    "subject": subject,
                    "html": body_html,
                }
            )
            logger.info("Admin notification sent to %s: %s", to_email, response["id"])
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send admin notification to %s: %s",
                to_email,
                e,
                exc_info=True,
            )
            raise

    async def send_contact_notification(
        self,
        admin_email: str,
        name: str,
        email: str,
        inquiry_type: str,
        company: str | None = None,
        phone: str | None = None,
        message: str | None = None,
    ) -> dict[str, Any]:
        """Send admin notification for a general contact form submission.

        Args:
            admin_email: Admin recipient address
            name: Submitter's full name
            email: Submitter's email address
            inquiry_type: Type of inquiry (e.g. "support", "demo")
            company: Submitter's company name (optional)
            phone: Submitter's phone number (optional)
            message: Free-text message from submitter (optional)

        Returns:
            Response with status and message ID

        Raises:
            Exception: If email send fails
        """
        safe_name = html.escape(name)
        safe_email = html.escape(email)
        safe_inquiry_type = html.escape(inquiry_type)
        company_line = (
            f"<li><strong>Company:</strong> {html.escape(company)}</li>"
            if company
            else ""
        )
        phone_line = (
            f"<li><strong>Phone:</strong> {html.escape(phone)}</li>" if phone else ""
        )
        message_line = (
            f"<li><strong>Message:</strong><br>{html.escape(message)}</li>"
            if message
            else ""
        )

        html_content = f"""
<html><body>
<h2>New Contact Form Submission</h2>
<ul>
  <li><strong>Name:</strong> {safe_name}</li>
  <li><strong>Email:</strong> {safe_email}</li>
  <li><strong>Inquiry Type:</strong> {safe_inquiry_type}</li>
  {company_line}
  {phone_line}
  {message_line}
</ul>
</body></html>
"""
        try:
            response = await self._send_email(
                {
                    "from": self.from_address,
                    "to": admin_email,
                    "subject": f"Contact Form: {safe_inquiry_type} from {safe_name}",
                    "html": html_content,
                }
            )
            logger.info(
                "Contact notification sent for %s (%s): %s",
                email,
                inquiry_type,
                response["id"],
            )
            return {"status": "sent", "id": response["id"]}
        except Exception as e:
            logger.error(
                "Failed to send contact notification for %s: %s",
                email,
                e,
                exc_info=True,
            )
            raise
