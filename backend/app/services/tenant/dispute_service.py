"""Dispute workflow service with rate limiting."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

from postgrest import CountMethod

from app.database.client import SupabaseDB
from app.models.dispute import RateLimitError
from app.models.enums import DisputeCategory, DisputeStatus
from app.services.tenant.notification_service import TenantNotificationService

logger = logging.getLogger(__name__)


class DisputeService:
    """Manages dispute creation, lifecycle, and communication."""

    MAX_DISPUTES_PER_DAY = 3  # Rate limit per tenant

    def __init__(self, notification_service: TenantNotificationService):
        """Initialize dispute service.

        Args:
            notification_service: Service for sending notifications
        """
        self.notification_service = notification_service

    async def create_dispute(
        self,
        tenant_user_id: UUID,
        statement_id: UUID,
        category: DisputeCategory,
        description: str,
        db: SupabaseDB,
    ) -> dict[str, Any]:
        """Create a new dispute with rate limiting.

        Args:
            tenant_user_id: ID of tenant user creating the dispute
            statement_id: ID of reconciliation snapshot being disputed
            category: Category of the dispute
            description: Detailed description of the issue
            db: Supabase client

        Returns:
            Created dispute data

        Raises:
            RateLimitError: If tenant exceeded daily dispute limit
            PermissionError: If tenant not found
            ValueError: If statement not found or invalid input
        """
        # Validate input
        if not description or len(description) > 5000:
            raise ValueError("Description must be 1-5000 characters")

        # Get tenant and verify exists
        tenant_result = (
            db.table("tenant_users").select("*").eq("id", str(tenant_user_id)).execute()
        )
        if not tenant_result.data:
            raise PermissionError("Tenant not found")

        # Cast JSON result to dict for type safety
        tenant = cast(dict[str, Any], tenant_result.data[0])

        # FIX AS-3: Pre-check rate limit (optimistic, non-blocking)
        # This is a soft check; the real enforcement happens after insert
        if await self._is_rate_limited(tenant_user_id, db):
            raise RateLimitError("Maximum 3 disputes per day exceeded")

        # Verify statement exists in the tenant's org and is available to tenants.
        statement_result = (
            db.table("reconciliation_snapshots")
            .select("organization_id, status")
            .eq("id", str(statement_id))
            .eq("organization_id", str(tenant["organization_id"]))
            .execute()
        )
        if not statement_result.data:
            raise ValueError("Statement not found")

        # Cast JSON result to dict for type safety
        statement_row = cast(dict[str, Any], statement_result.data[0])
        if statement_row.get("status") != "finalized":
            raise ValueError("Statement must be finalized before it can be disputed")
        organization_id = statement_row["organization_id"]

        # Create dispute
        dispute_data = {
            "tenant_user_id": str(tenant_user_id),
            "statement_id": str(statement_id),
            "organization_id": organization_id,
            "category": category.value,
            "description": description,
            "status": DisputeStatus.OPEN.value,
        }

        result = db.table("disputes").insert(dispute_data).execute()
        # Cast JSON result to dict for type safety
        dispute = cast(dict[str, Any], result.data[0])

        # FIX AS-3: Atomic rate limit enforcement using optimistic locking
        # After insert, check if we're now over limit (includes just-inserted dispute)
        # If over limit, rollback by deleting and raise error
        # This prevents TOCTOU race condition where concurrent requests slip through
        if await self._is_over_limit_after_insert(tenant_user_id, db):
            # Rollback: delete the just-inserted dispute
            try:
                db.table("disputes").delete().eq("id", dispute["id"]).execute()
            except Exception:
                pass  # Best effort rollback
            raise RateLimitError(
                "Maximum 3 disputes per day exceeded (concurrent request detected)"
            )

        # Create initial comment from description
        comment_data = {
            "dispute_id": dispute["id"],
            "author_id": tenant["user_id"],
            "content": description,
            "is_internal": False,
        }
        db.table("dispute_comments").insert(comment_data).execute()

        # Notify landlord of new dispute (async, fire-and-forget)
        try:
            await self.notification_service.notify_new_dispute(
                organization_id=organization_id,
                dispute_id=dispute["id"],
                tenant_name=tenant.get("contact_name", "Unknown"),
                category=category.value,
                db=db,
            )
        except Exception as e:
            # Don't fail dispute creation if notification fails, but log the error
            logger.error(
                f"Failed to send notification for dispute {dispute['id']}: {e}",
                exc_info=True,
            )

        return dispute

    async def _is_rate_limited(self, tenant_user_id: UUID, db: SupabaseDB) -> bool:
        """Check if tenant has exceeded daily dispute limit.

        Args:
            tenant_user_id: ID of tenant user to check
            db: Supabase client

        Returns:
            True if rate limited, False otherwise
        """
        one_day_ago = datetime.now(UTC) - timedelta(days=1)

        result = (
            db.table("disputes")
            .select("id", count=CountMethod.exact)
            .eq("tenant_user_id", str(tenant_user_id))
            .gte("created_at", one_day_ago.isoformat())
            .execute()
        )

        count = result.count or 0
        return count >= self.MAX_DISPUTES_PER_DAY

    async def _is_over_limit_after_insert(
        self, tenant_user_id: UUID, db: SupabaseDB
    ) -> bool:
        """FIX AS-3: Check if tenant is over limit AFTER inserting a dispute.

        Used for optimistic locking to prevent TOCTOU race conditions.
        If count > MAX_DISPUTES_PER_DAY, the dispute should be rolled back.

        Args:
            tenant_user_id: ID of tenant user to check
            db: Supabase client

        Returns:
            True if over limit (should rollback), False otherwise
        """
        one_day_ago = datetime.now(UTC) - timedelta(days=1)

        result = (
            db.table("disputes")
            .select("id", count=CountMethod.exact)
            .eq("tenant_user_id", str(tenant_user_id))
            .gte("created_at", one_day_ago.isoformat())
            .execute()
        )

        count = result.count or 0
        # If count > MAX, we're over limit (includes the just-inserted dispute)
        return count > self.MAX_DISPUTES_PER_DAY

    async def add_comment(
        self,
        dispute_id: UUID,
        author_id: UUID,
        content: str,
        is_internal: bool,
        db: SupabaseDB,
    ) -> dict[str, Any]:
        """Add a comment to a dispute.

        Args:
            dispute_id: ID of dispute to comment on
            author_id: ID of user adding the comment
            content: Comment content
            is_internal: Whether the comment is internal (hidden from tenant)
            db: Supabase client

        Returns:
            Created comment data

        Raises:
            ValueError: If dispute not found or invalid input
        """
        # Validate input
        if not content or len(content) > 50000:
            raise ValueError("Content must be 1-50000 characters")

        # Verify dispute exists
        dispute_result = (
            db.table("disputes").select("*").eq("id", str(dispute_id)).execute()
        )
        if not dispute_result.data:
            raise ValueError("Dispute not found")

        # Cast JSON result to dict for type safety
        dispute = cast(dict[str, Any], dispute_result.data[0])

        # Create comment
        comment_data = {
            "dispute_id": str(dispute_id),
            "author_id": str(author_id),
            "content": content,
            "is_internal": is_internal,
        }

        result = (
            db.table("dispute_comments")
            .insert(cast(dict[str, Any], comment_data))
            .execute()
        )
        # Cast JSON result to dict for type safety
        comment = cast(dict[str, Any], result.data[0])

        # Notify other party of new comment (unless internal)
        if not is_internal:
            try:
                await self._notify_comment(dispute, comment, db)
            except Exception as e:
                # Don't fail comment creation if notification fails, but log
                logger.error(
                    f"Failed to send notification for comment on "
                    f"dispute {dispute_id}: {e}",
                    exc_info=True,
                )

        return comment

    async def _notify_comment(
        self, dispute: dict[str, Any], comment: dict[str, Any], db: SupabaseDB
    ) -> None:
        """Notify relevant party of new comment.

        Args:
            dispute: Dispute data
            comment: Comment data
            db: Supabase client
        """
        # Check if comment author is tenant or landlord
        tenant_result = (
            db.table("tenant_users")
            .select("user_id, contact_name")
            .eq("id", dispute["tenant_user_id"])
            .execute()
        )
        if not tenant_result.data:
            return

        # Cast JSON result to dict for type safety
        tenant_row = cast(dict[str, Any], tenant_result.data[0])
        tenant_user_id = tenant_row["user_id"]

        # If author is tenant, notify landlord; if landlord, notify tenant
        if comment["author_id"] == tenant_user_id:
            await self.notification_service.notify_dispute_comment_to_landlord(
                organization_id=UUID(str(dispute["organization_id"])),
                dispute_id=UUID(str(dispute["id"])),
                tenant_name=tenant_row.get("contact_name", "Unknown"),
                db=db,
            )
        else:
            # Landlord commented, notify tenant
            # Get property name from statement
            statement_result = (
                db.table("reconciliation_snapshots")
                .select("property_id")
                .eq("id", dispute["statement_id"])
                .execute()
            )
            if statement_result.data:
                # Cast JSON result to dict for type safety
                statement_row = cast(dict[str, Any], statement_result.data[0])
                property_result = (
                    db.table("properties")
                    .select("name")
                    .eq("id", statement_row["property_id"])
                    .execute()
                )
                if property_result.data:
                    # Cast JSON result to dict for type safety
                    property_row = cast(dict[str, Any], property_result.data[0])
                    property_name = property_row["name"]
                else:
                    property_name = "Unknown Property"
            else:
                property_name = "Unknown Property"

            await self.notification_service.notify_dispute_update(
                tenant_user_id=dispute["tenant_user_id"],
                dispute_id=dispute["id"],
                property_name=property_name,
                dispute_status=dispute["status"],
            )

    async def update_status(
        self,
        dispute_id: UUID,
        new_status: DisputeStatus,
        resolution_summary: str | None,
        resolved_by: UUID | None,
        db: SupabaseDB,
    ) -> dict[str, Any]:
        """Update dispute status with optional resolution.

        Args:
            dispute_id: ID of dispute to update
            new_status: New status for the dispute
            resolution_summary: Summary of resolution (required for resolved/rejected)
            resolved_by: ID of user resolving the dispute
            db: SupabaseDB

        Returns:
            Updated dispute data

        Raises:
            ValueError: If dispute not found or invalid state transition
        """
        # Get current dispute
        dispute_result = (
            db.table("disputes").select("*").eq("id", str(dispute_id)).execute()
        )
        if not dispute_result.data:
            raise ValueError("Dispute not found")

        # Cast JSON result to dict for type safety
        dispute = cast(dict[str, Any], dispute_result.data[0])
        current_status = DisputeStatus(dispute["status"])

        # Validate state transition
        valid_transitions = {
            DisputeStatus.OPEN: [
                DisputeStatus.UNDER_REVIEW,
                DisputeStatus.REJECTED,
            ],
            DisputeStatus.UNDER_REVIEW: [
                DisputeStatus.RESOLVED,
                DisputeStatus.REJECTED,
            ],
            DisputeStatus.RESOLVED: [DisputeStatus.CLOSED],
            DisputeStatus.REJECTED: [DisputeStatus.CLOSED],
        }

        if new_status not in valid_transitions.get(current_status, []):
            raise ValueError(
                f"Cannot transition from {current_status.value} to {new_status.value}"
            )

        if new_status in [DisputeStatus.RESOLVED, DisputeStatus.REJECTED] and not (
            resolution_summary and resolution_summary.strip()
        ):
            raise ValueError("Resolution summary is required")

        # Prepare update data
        update_data: dict[str, str | None] = {"status": new_status.value}

        if new_status in [DisputeStatus.RESOLVED, DisputeStatus.REJECTED]:
            update_data["resolution_summary"] = resolution_summary
            update_data["resolved_at"] = datetime.now(UTC).isoformat()
            update_data["resolved_by"] = str(resolved_by) if resolved_by else None

        # Update dispute
        result = (
            db.table("disputes").update(update_data).eq("id", str(dispute_id)).execute()
        )
        # Cast JSON result to dict for type safety
        updated_dispute = cast(dict[str, Any], result.data[0])

        # Notify tenant of status change
        try:
            # Get property name from statement
            statement_result = (
                db.table("reconciliation_snapshots")
                .select("property_id")
                .eq("id", dispute["statement_id"])
                .execute()
            )
            if statement_result.data:
                # Cast JSON result to dict for type safety
                statement_row = cast(dict[str, Any], statement_result.data[0])
                property_result = (
                    db.table("properties")
                    .select("name")
                    .eq("id", statement_row["property_id"])
                    .execute()
                )
                if property_result.data:
                    # Cast JSON result to dict for type safety
                    property_row = cast(dict[str, Any], property_result.data[0])
                    property_name = property_row["name"]
                else:
                    property_name = "Unknown Property"
            else:
                property_name = "Unknown Property"

            await self.notification_service.notify_dispute_update(
                tenant_user_id=dispute["tenant_user_id"],
                dispute_id=dispute["id"],
                property_name=property_name,
                dispute_status=new_status.value,
            )
        except Exception as e:
            # Don't fail status update if notification fails, but log
            logger.error(
                f"Failed to send notification for status update on "
                f"dispute {dispute_id}: {e}",
                exc_info=True,
            )

        return updated_dispute
