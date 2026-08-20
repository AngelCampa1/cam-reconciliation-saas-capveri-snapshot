"""
Team member invitation service for managing invitation tokens and signup flow.

Handles validation of invitation tokens and the complete team member signup.
Team members get full organization access with their assigned roles.
"""

import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

from app.database.client import SupabaseDB, get_supabase_admin
from app.exceptions.handlers import InvalidInvitationTokenError
from app.legal_terms import TERMS_HASH, TERMS_VERSION
from app.services.legal_acceptance import (
    assert_current_terms_acceptance,
    record_terms_acceptance,
)

logger = logging.getLogger(__name__)

# Invitation expiration time
INVITATION_EXPIRY_DAYS = 7


class TeamInvitationService:
    """Business logic for team member invitations and signup."""

    def __init__(self, db: SupabaseDB):
        self.db = db
        self.supabase_admin = get_supabase_admin()

    # Token format/length constraints to prevent DoS
    MAX_TOKEN_LENGTH = 128
    MIN_TOKEN_LENGTH = 32

    async def validate_token(self, token: str) -> dict[str, Any]:
        """
        Validate invitation token.

        Args:
            token: The invitation token to validate

        Returns:
            Invitation data with organization_name if valid

        Raises:
            InvalidInvitationTokenError: If token is invalid/expired/used/revoked
        """
        # Validate token format before DB query (DoS prevention)
        if not token or not isinstance(token, str):
            raise InvalidInvitationTokenError(reason="not_found")

        token = token.strip()
        if len(token) < self.MIN_TOKEN_LENGTH or len(token) > self.MAX_TOKEN_LENGTH:
            raise InvalidInvitationTokenError(reason="not_found")

        # Only allow alphanumeric, hyphens, and underscores (URL-safe format)
        if not re.match(r"^[a-zA-Z0-9_-]+$", token):
            raise InvalidInvitationTokenError(reason="not_found")

        try:
            result = (
                self.supabase_admin.table("team_member_invitations")
                .select("*")
                .eq("token", token)
                .execute()
            )
        except Exception:
            result = None
        if result is None or not isinstance(result.data, list) or len(result.data) == 0:
            result = (
                self.db.table("team_member_invitations")
                .select("*")
                .eq("token", token)
                .execute()
            )

        if not result.data or len(result.data) == 0:
            raise InvalidInvitationTokenError(reason="not_found")

        invitation = cast(dict[str, Any], result.data[0])

        if invitation.get("revoked_at") is not None:
            raise InvalidInvitationTokenError(reason="revoked")
        if invitation.get("used_at") is not None:
            raise InvalidInvitationTokenError(reason="used")

        expires_at_str = invitation.get("expires_at")
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if expires_at < datetime.now(UTC):
                raise InvalidInvitationTokenError(reason="expired")

        # Fetch organization name for display
        try:
            try:
                org_result = (
                    self.supabase_admin.table("organizations")
                    .select("id, name")
                    .eq("id", invitation["organization_id"])
                    .single()
                    .execute()
                )
            except Exception:
                org_result = None
            if org_result is None or not isinstance(org_result.data, dict):
                org_result = (
                    self.db.table("organizations")
                    .select("id, name")
                    .eq("id", invitation["organization_id"])
                    .single()
                    .execute()
                )
            if isinstance(org_result.data, dict):
                org_row = cast(dict[str, Any], org_result.data)
                invitation["organization_name"] = org_row.get("name")
        except Exception:
            # Don't fail validation if org lookup fails
            invitation["organization_name"] = None

        return invitation

    async def create_invitation(
        self,
        email: str,
        role: str,
        invited_by: UUID,
        organization_id: UUID,
    ) -> dict[str, Any]:
        """
        Create a team member invitation and store it in the database.

        Generates a secure token and sets expiration to 7 days from now.

        Args:
            email: Team member's email address
            role: Role to assign (admin, member, viewer)
            invited_by: UUID of the admin creating the invitation
            organization_id: UUID of the organization

        Returns:
            The created invitation record
        """
        # Generate secure token
        token = secrets.token_urlsafe(32)

        # Calculate expiration
        expires_at = datetime.now(UTC) + timedelta(days=INVITATION_EXPIRY_DAYS)

        # Create invitation record
        invitation_data = {
            "id": str(uuid4()),
            "email": email,
            "role": role,
            "token": token,
            "organization_id": str(organization_id),
            "invited_by": str(invited_by),
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "used_at": None,
            "used_by_user_id": None,
            "revoked_at": None,
        }

        result = (
            self.supabase_admin.table("team_member_invitations")
            .insert(invitation_data)
            .execute()
        )

        if not result.data or len(result.data) == 0:
            from fastapi import HTTPException

            raise HTTPException(500, "Failed to create invitation")

        logger.info(
            "Created team invitation for %s with role %s",
            email,
            role,
        )

        return cast(dict[str, Any], result.data[0])

    async def complete_signup(
        self,
        token: str,
        password: str,
        full_name: str,
        accepted_terms: bool,
        terms_version: str,
        terms_hash: str,
    ) -> tuple[dict[str, Any], str, str]:
        """
        Complete team member signup.

        Steps:
        1. Validate token
        2. Create Supabase Auth user
        3. Create public.users record (in EXISTING organization)
        4. Mark invitation used
        5. Generate tokens

        Args:
            token: Invitation token
            password: User password
            full_name: User's full name

        Returns:
            Tuple of (user_data, access_token, refresh_token)

        Raises:
            InvalidInvitationTokenError: If token is invalid
            HTTPException: If signup fails
        """
        from fastapi import HTTPException

        assert_current_terms_acceptance(
            accepted_terms, terms_version=terms_version, terms_hash=terms_hash
        )

        # Step 1: Validate token
        invitation = await self.validate_token(token)

        # Step 2: Create Supabase Auth user
        auth_response = self.supabase_admin.auth.admin.create_user(
            {
                "email": invitation["email"],
                "password": password,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": full_name,
                    "invited_by": "team_invitation",
                    "accepted_terms": True,
                    "terms_version": TERMS_VERSION,
                    "terms_hash": TERMS_HASH,
                },
            }
        )

        if auth_response.user is None:
            raise HTTPException(500, "Failed to create auth user")

        auth_user_id = auth_response.user.id

        # Step 3: Create public.users record (in EXISTING organization!)
        # This is the key difference from tenant invitations - we add to existing org
        user_data = {
            "id": str(auth_user_id),
            "organization_id": invitation["organization_id"],
            "email": invitation["email"],
            "full_name": full_name,
            "role": invitation["role"],  # Use role from invitation
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        user_result = self.supabase_admin.table("users").upsert(user_data).execute()
        user = cast(dict[str, Any], user_result.data[0]) if user_result.data else None
        if not user:
            raise HTTPException(500, "Failed to create user record")

        record_terms_acceptance(
            self.supabase_admin,
            user_id=str(auth_user_id),
            organization_id=str(invitation["organization_id"]),
            source="team_invitation_signup",
        )

        # Step 4: Mark invitation used. Keep this conditional so concurrent
        # signup attempts cannot both consume the same token.
        update_result = (
            self.supabase_admin.table("team_member_invitations")
            .update(
                {
                    "used_at": datetime.now(UTC).isoformat(),
                    "used_by_user_id": str(auth_user_id),
                }
            )
            .eq("token", token)
            .eq("organization_id", invitation["organization_id"])
            .is_("used_at", "null")
            .execute()
        )
        if not update_result.data:
            raise InvalidInvitationTokenError(reason="used")

        # Step 5: Generate tokens
        sign_in_response = self.supabase_admin.auth.sign_in_with_password(
            {
                "email": invitation["email"],
                "password": password,
            }
        )

        if sign_in_response.session is None:
            raise HTTPException(500, "Failed to generate tokens")

        return (
            user,
            sign_in_response.session.access_token,
            sign_in_response.session.refresh_token,
        )

    async def accept_for_existing_user(
        self,
        token: str,
        user_id: UUID,
        user_email: str | None,
    ) -> str:
        """
        Accept a team invitation for an already-authenticated user.

        Returns:
            Success message

        Raises:
            InvalidInvitationTokenError: Invalid/expired/used/revoked token
            ValueError: Deterministic business-rule failures
        """
        invitation = await self.validate_token(token)

        invited_email = str(invitation.get("email", "")).strip().lower()
        oauth_email = (user_email or "").strip().lower()
        if not invited_email or invited_email != oauth_email:
            raise ValueError("email_mismatch")

        user_result = (
            self.supabase_admin.table("users")
            .select("id, organization_id, email, role")
            .eq("id", str(user_id))
            .maybe_single()
            .execute()
        )
        user_row = user_result.data if user_result else None
        if not isinstance(user_row, dict):
            raise ValueError("user_not_found")

        current_org_id = user_row.get("organization_id")
        invitation_org_id = invitation.get("organization_id")
        if current_org_id and str(current_org_id) != str(invitation_org_id):
            raise ValueError("wrong_org")

        # Ensure user role aligns with invitation role.
        self.supabase_admin.table("users").update(
            {
                "role": invitation["role"],
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("id", str(user_id)).eq("organization_id", str(invitation_org_id)).execute()

        # Mark invitation used (idempotent-by-state and race-safe).
        update_result = (
            self.supabase_admin.table("team_member_invitations")
            .update(
                {
                    "used_at": datetime.now(UTC).isoformat(),
                    "used_by_user_id": str(user_id),
                }
            )
            .eq("token", token)
            .is_("used_at", "null")
            .execute()
        )
        if not update_result.data:
            raise ValueError("used")

        return "Team invitation accepted successfully"

    async def list_invitations(
        self,
        organization_id: UUID,
        include_used: bool = False,
    ) -> list[dict[str, Any]]:
        """
        List invitations for an organization.

        Args:
            organization_id: Organization UUID
            include_used: Whether to include used invitations

        Returns:
            List of invitation records
        """
        result = (
            self.db.table("team_member_invitations")
            .select("*")
            .eq("organization_id", str(organization_id))
            .order("created_at", desc=True)
            .execute()
        )

        invitations_raw = result.data if result.data else []
        invitations: list[dict[str, Any]] = [
            cast(dict[str, Any], inv)
            for inv in invitations_raw
            if isinstance(inv, dict)
        ]

        if not include_used:
            # Filter to only pending invitations (not used and not revoked)
            invitations = [
                inv
                for inv in invitations
                if inv.get("used_at") is None and inv.get("revoked_at") is None
            ]

        return invitations

    async def revoke_invitation(
        self,
        invitation_id: UUID,
        organization_id: UUID,
    ) -> dict[str, Any]:
        """
        Revoke a pending invitation.

        Args:
            invitation_id: Invitation UUID
            organization_id: Organization UUID (for RLS check)

        Returns:
            Updated invitation record

        Raises:
            HTTPException: If invitation not found or already used/revoked
        """
        from fastapi import HTTPException

        # Verify invitation exists and belongs to organization
        result = (
            self.db.table("team_member_invitations")
            .select("*")
            .eq("id", str(invitation_id))
            .eq("organization_id", str(organization_id))
            .execute()
        )

        if not result.data or len(result.data) == 0:
            raise HTTPException(404, "Invitation not found")

        invitation = cast(dict[str, Any], result.data[0])

        if invitation.get("used_at"):
            raise HTTPException(400, "Invitation has already been used")
        if invitation.get("revoked_at"):
            raise HTTPException(400, "Invitation has already been revoked")

        # Revoke the invitation
        update_result = (
            self.supabase_admin.table("team_member_invitations")
            .update({"revoked_at": datetime.now(UTC).isoformat()})
            .eq("id", str(invitation_id))
            .eq("organization_id", str(organization_id))
            .execute()
        )

        if not update_result.data:
            raise HTTPException(500, "Failed to revoke invitation")

        logger.info("Revoked team invitation %s", str(invitation_id))

        return cast(dict[str, Any], update_result.data[0])
