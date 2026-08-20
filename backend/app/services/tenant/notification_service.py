"""Tenant notification service with rate limiting."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from postgrest import CountMethod

from app.config import get_settings
from app.database.client import SupabaseDB, get_supabase_admin
from app.models.enums import NotificationType
from app.models.tenant_notification import (
    TenantEmailPreferences,
)
from app.services.email import EmailService

logger = logging.getLogger(__name__)


class TenantNotificationService:
    """Manages in-app and email notifications for tenants."""

    MAX_EMAILS_PER_HOUR = 10  # Rate limit per tenant

    def __init__(self, email_service: EmailService, db: SupabaseDB):
        """Initialize notification service.

        Args:
            email_service: Email service for sending notifications
            db: Supabase client for database access
        """
        self.email_service = email_service
        self.db = db
        self.app_base_url = get_settings().app_base_url.rstrip("/")

    async def notify_new_statement(
        self,
        tenant_user_id: UUID,
        statement_id: UUID,
        property_name: str,
        period: str,
        amount: str,
    ) -> None:
        """Create notification and optionally send email for new statement.

        Args:
            tenant_user_id: Tenant user ID
            statement_id: Statement ID
            property_name: Property name
            period: Statement period (e.g., "2024")
            amount: Formatted amount (e.g., "$12,500.00")

        Raises:
            Exception: If database operations fail
        """
        # Create in-app notification
        notification_data = {
            "tenant_user_id": str(tenant_user_id),
            "notification_type": NotificationType.NEW_STATEMENT.value,
            "title": f"New Statement: {property_name}",
            "message": (
                f"Your {period} reconciliation statement is ready. " f"Amount: {amount}"
            ),
            "link_url": f"/tenant/statements/{statement_id}",
            "related_entity_id": str(statement_id),
        }

        self.db.table("tenant_notifications").insert(notification_data).execute()

        # Check email preferences
        prefs = await self._get_email_preferences(tenant_user_id)
        if not prefs.new_statement_emails:
            return

        # Check rate limit
        if await self._is_rate_limited(tenant_user_id):
            return

        # Get tenant email
        tenant_result = (
            self.db.table("tenant_users")
            .select("contact_name, contact_email")
            .eq("id", str(tenant_user_id))
            .single()
            .execute()
        )

        if not tenant_result.data:
            return

        tenant_data = cast(dict[str, Any], tenant_result.data)
        tenant_name = tenant_data["contact_name"]
        tenant_email = tenant_data["contact_email"]

        # Send email
        portal_url = f"{self.app_base_url}/tenant/statements/{statement_id}"
        await self.email_service.send_new_statement_notification(
            to_email=tenant_email,
            tenant_name=tenant_name,
            property_name=property_name,
            period=period,
            amount=amount,
            portal_url=portal_url,
        )

        # Log email for rate limiting
        await self._log_email(tenant_user_id, "new_statement", tenant_email)

    async def notify_new_dispute(
        self,
        organization_id: UUID,
        dispute_id: UUID,
        tenant_name: str,
        category: str,
        db: SupabaseDB,
    ) -> None:
        """Create notification for landlord when tenant creates a dispute.

        FIX AS-4: Implemented landlord notification for new disputes.
        Gets organization admin users and sends notifications to each.

        Args:
            organization_id: Organization ID
            dispute_id: Dispute ID
            tenant_name: Name of tenant who created dispute
            category: Dispute category
            db: Supabase client
        """
        notification_db = get_supabase_admin()

        # FIX AS-4: Get all admin users for the organization
        admin_result = (
            notification_db.table("users")
            .select("id, email, full_name")
            .eq("organization_id", str(organization_id))
            .in_("role", ["owner", "admin"])
            .execute()
        )

        if not admin_result.data:
            # No admins found - silently return (not an error condition)
            return

        # Create in-app notification for each admin
        admins = cast(list[dict[str, Any]], admin_result.data)
        for admin in admins:
            notification_data = {
                "user_id": admin["id"],
                "notification_type": "NEW_DISPUTE",
                "title": f"New Dispute from {tenant_name}",
                "message": f"Tenant {tenant_name} has filed a {category} dispute.",
                "link_url": f"/disputes/{dispute_id}",
                "related_entity_id": str(dispute_id),
            }

            try:
                notification_db.table("user_notifications").insert(
                    notification_data
                ).execute()
            except Exception:
                # Don't fail if single notification insert fails
                continue

            # Send email notification to admin
            if admin.get("email"):
                try:
                    portal_url = f"{self.app_base_url}/disputes/{dispute_id}"
                    await self.email_service.send_new_dispute_notification(
                        to_email=admin["email"],
                        admin_name=admin.get("full_name") or "Admin",
                        tenant_name=tenant_name,
                        category=category,
                        portal_url=portal_url,
                    )
                except Exception:
                    # Don't fail if email fails - notification already created
                    continue

    async def notify_dispute_comment_to_landlord(
        self,
        organization_id: UUID,
        dispute_id: UUID,
        tenant_name: str,
        db: SupabaseDB,
    ) -> None:
        """Notify landlord admins when a tenant comments on an existing dispute."""
        notification_db = get_supabase_admin()

        admin_result = (
            notification_db.table("users")
            .select("id, email, full_name")
            .eq("organization_id", str(organization_id))
            .in_("role", ["owner", "admin"])
            .execute()
        )

        if not admin_result.data:
            return

        admins = cast(list[dict[str, Any]], admin_result.data)
        for admin in admins:
            notification_data = {
                "user_id": admin["id"],
                "notification_type": "DISPUTE_COMMENT",
                "title": f"New Comment from {tenant_name}",
                "message": (
                    f"Tenant {tenant_name} added a comment to an existing dispute."
                ),
                "link_url": f"/disputes/{dispute_id}",
                "related_entity_id": str(dispute_id),
            }

            try:
                notification_db.table("user_notifications").insert(
                    notification_data
                ).execute()
            except Exception:
                continue

            if admin.get("email"):
                try:
                    portal_url = f"{self.app_base_url}/disputes/{dispute_id}"
                    await self.email_service.send_dispute_comment_notification(
                        to_email=admin["email"],
                        admin_name=admin.get("full_name") or "Admin",
                        tenant_name=tenant_name,
                        portal_url=portal_url,
                    )
                except Exception:
                    continue

    async def notify_dispute_update(
        self,
        tenant_user_id: UUID,
        dispute_id: UUID,
        property_name: str,
        dispute_status: str,
    ) -> None:
        """Create notification and optionally send email for dispute update.

        Args:
            tenant_user_id: Tenant user ID
            dispute_id: Dispute ID
            property_name: Property name
            dispute_status: New dispute status

        Raises:
            Exception: If database operations fail
        """
        # Create in-app notification
        notification_data = {
            "tenant_user_id": str(tenant_user_id),
            "notification_type": NotificationType.DISPUTE_UPDATE.value,
            "title": f"Dispute Update: {property_name}",
            "message": f"Your dispute status has been updated to: {dispute_status}",
            "link_url": f"/tenant/disputes/{dispute_id}",
            "related_entity_id": str(dispute_id),
        }

        self.db.table("tenant_notifications").insert(notification_data).execute()

        # Check email preferences
        prefs = await self._get_email_preferences(tenant_user_id)
        if not prefs.dispute_update_emails:
            return

        # Check rate limit
        if await self._is_rate_limited(tenant_user_id):
            return

        # Get tenant email
        tenant_result = (
            self.db.table("tenant_users")
            .select("contact_name, contact_email")
            .eq("id", str(tenant_user_id))
            .single()
            .execute()
        )

        if not tenant_result.data:
            return

        tenant_data = cast(dict[str, Any], tenant_result.data)
        tenant_name = tenant_data["contact_name"]
        tenant_email = tenant_data["contact_email"]

        # Send email
        portal_url = f"{self.app_base_url}/tenant/disputes/{dispute_id}"
        await self.email_service.send_dispute_update(
            to_email=tenant_email,
            tenant_name=tenant_name,
            property_name=property_name,
            dispute_status=dispute_status,
            portal_url=portal_url,
        )

        # Log email for rate limiting
        await self._log_email(tenant_user_id, "dispute_update", tenant_email)

    async def mark_as_read(self, notification_id: UUID, tenant_user_id: UUID) -> None:
        """Mark a notification as read.

        Args:
            notification_id: Notification ID
            tenant_user_id: Tenant user ID (for security check)

        Raises:
            Exception: If notification not found or access denied
        """
        self.db.table("tenant_notifications").update(
            {"read_at": datetime.now(UTC).isoformat()}
        ).eq("id", str(notification_id)).eq(
            "tenant_user_id", str(tenant_user_id)
        ).execute()

    async def mark_all_as_read(self, tenant_user_id: UUID) -> int:
        """Mark all unread notifications as read for a tenant.

        Args:
            tenant_user_id: Tenant user ID

        Returns:
            Number of notifications marked as read

        Raises:
            Exception: If database operation fails
        """
        result = (
            self.db.table("tenant_notifications")
            .update({"read_at": datetime.now(UTC).isoformat()})
            .eq("tenant_user_id", str(tenant_user_id))
            .is_("read_at", "null")
            .execute()
        )

        return len(result.data) if result.data else 0

    async def _is_rate_limited(self, tenant_user_id: UUID) -> bool:
        """Check if tenant has exceeded email rate limit.

        Args:
            tenant_user_id: Tenant user ID

        Returns:
            True if rate limited, False otherwise
        """
        one_hour_ago = datetime.now(UTC) - timedelta(hours=1)

        result = (
            self.db.table("tenant_email_logs")
            .select("id", count=CountMethod.exact)
            .eq("tenant_user_id", str(tenant_user_id))
            .gte("sent_at", one_hour_ago.isoformat())
            .execute()
        )

        count = result.count or 0
        return count >= self.MAX_EMAILS_PER_HOUR

    async def _get_email_preferences(
        self, tenant_user_id: UUID
    ) -> TenantEmailPreferences:
        """Get or create default email preferences.

        Args:
            tenant_user_id: Tenant user ID

        Returns:
            Email preferences

        Raises:
            Exception: If database operation fails
        """
        result = (
            self.db.table("tenant_email_preferences")
            .select("*")
            .eq("tenant_user_id", str(tenant_user_id))
            .maybe_single()
            .execute()
        )

        if result and result.data:
            prefs_data = cast(dict[str, Any], result.data)
            return TenantEmailPreferences.model_validate(prefs_data)

        # Create default preferences
        default_prefs: dict[str, Any] = {
            "tenant_user_id": str(tenant_user_id),
            "new_statement_emails": True,
            "dispute_update_emails": True,
            "reminder_emails": True,
            "marketing_emails": False,
        }

        insert_result = (
            self.db.table("tenant_email_preferences").insert(default_prefs).execute()
        )

        insert_data = cast(list[dict[str, Any]], insert_result.data)
        return TenantEmailPreferences.model_validate(insert_data[0])

    async def _log_email(
        self, tenant_user_id: UUID, email_type: str, recipient_email: str
    ) -> None:
        """Log email for rate limiting.

        Args:
            tenant_user_id: Tenant user ID
            email_type: Type of email sent
            recipient_email: Recipient email address

        Raises:
            Exception: If database operation fails
        """
        log_data = {
            "tenant_user_id": str(tenant_user_id),
            "email_type": email_type,
            "recipient_email": recipient_email,
        }

        self.db.table("tenant_email_logs").insert(log_data).execute()
