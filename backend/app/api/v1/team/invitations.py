"""
Team member invitation endpoints.

Includes PUBLIC endpoints for validating invitation tokens and
AUTHENTICATED endpoints for creating/managing invitations (admin only).
"""

import logging
import time
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    status,
)

from app.auth.dependencies import (
    OrgContext,
    get_current_admin_user,
    get_current_user,
    get_org_scoped_context,
)
from app.core.rate_limiting import (
    PUBLIC_INVITATION_RATE_LIMIT,
    build_ip_rate_limit_key,
    moving_window,
)
from app.database.client import SupabaseDB, get_supabase
from app.exceptions.handlers import InvalidInvitationTokenError
from app.models.schemas.team_auth import (
    TeamInvitationAcceptRequest,
    TeamInvitationAcceptResponse,
    TeamInvitationValidationResponse,
)
from app.models.team_invitation import (
    TeamMemberInvitation,
    TeamMemberInvitationCreateRequest,
)
from app.models.user import User
from app.services.email import EmailService, get_email_service
from app.services.team_invitation import TeamInvitationService

router = APIRouter(prefix="/team/invitations", tags=["team-management"])

logger = logging.getLogger(__name__)


@router.post("/accept", response_model=TeamInvitationAcceptResponse)
async def accept_team_invitation(
    request: TeamInvitationAcceptRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> TeamInvitationAcceptResponse:
    """Accept a team invitation for an already authenticated OAuth user."""
    if current_user.id != request.user_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="User mismatch")

    service = TeamInvitationService(db)
    try:
        message = await service.accept_for_existing_user(
            token=request.token,
            user_id=request.user_id,
            user_email=current_user.email,
        )
        return TeamInvitationAcceptResponse(success=True, message=message)
    except InvalidInvitationTokenError as e:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_invitation", "reason": e.reason},
        )
    except ValueError as e:
        from fastapi import HTTPException

        reason = str(e)
        status_map = {
            "email_mismatch": 403,
            "user_not_found": 404,
            "wrong_org": 409,
            "used": 409,
        }
        raise HTTPException(
            status_code=status_map.get(reason, 400),
            detail={"error": "invitation_accept_failed", "reason": reason},
        )


@router.get("/{token}/validate", response_model=TeamInvitationValidationResponse)
async def validate_team_invitation_token(
    token: str,
    request: Request,
    db: SupabaseDB = Depends(get_supabase),
) -> TeamInvitationValidationResponse:
    """
    Validate a team member invitation token (PUBLIC endpoint).

    Security:
    - Returns 200 (not 404) for all invalid tokens (prevent enumeration)
    - Same response structure for expired/used/revoked
    - Rate limited to 10 requests per minute per IP

    Args:
        token: The invitation token to validate
        request: Incoming request used for IP-based rate limiting
        db: Supabase client

    Returns:
        Validation result with invitation details if valid
    """
    client_host = request.client.host if request.client else "unknown"
    rate_limit_key = build_ip_rate_limit_key("team-invitation-validate", client_host)

    if not moving_window.hit(PUBLIC_INVITATION_RATE_LIMIT, rate_limit_key):
        stats = moving_window.get_window_stats(
            PUBLIC_INVITATION_RATE_LIMIT, rate_limit_key
        )
        retry_after = max(1, int(stats.reset_time - time.time()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after)},
        )

    service = TeamInvitationService(db)

    try:
        invitation = await service.validate_token(token)

        return TeamInvitationValidationResponse(
            valid=True,
            email=invitation["email"],
            organization_name=invitation.get("organization_name"),
            role=invitation["role"],
            expires_at=invitation["expires_at"],
        )

    except InvalidInvitationTokenError as e:
        from typing import Literal, cast

        reason = cast(Literal["expired", "used", "revoked", "not_found"], e.reason)
        return TeamInvitationValidationResponse(
            valid=False,
            error_reason=reason,
        )


@router.post(
    "", response_model=TeamMemberInvitation, status_code=status.HTTP_201_CREATED
)
async def create_team_invitation(
    request: TeamMemberInvitationCreateRequest,
    background_tasks: BackgroundTasks,
    ctx: Annotated[OrgContext, Depends(get_org_scoped_context)],
    user: Annotated[User, Depends(get_current_admin_user)],
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> TeamMemberInvitation:
    """
    Create and send a team member invitation (admin only).

    Creates a new invitation record with a secure token and sends an email
    to the team member with instructions to set up their account.

    The invitation expires after 7 days and can only be used once.

    Args:
        request: Invitation details (email, role)
        ctx: Organization-scoped context
        user: Admin user creating the invitation
        db: Supabase client
        email_service: Email service for sending invitation

    Returns:
        The created invitation record

    Raises:
        HTTPException 403: If user is not an admin
    """
    # Create invitation via service
    service = TeamInvitationService(db)
    invitation = await service.create_invitation(
        email=request.email,
        role=request.role,
        invited_by=user.id,
        organization_id=ctx.organization_id,
    )

    # Get organization name for email
    org_name = "your organization"
    try:
        org_result = (
            ctx.table("organizations")
            .select("name")
            .eq("id", str(ctx.organization_id))
            .single()
            .execute()
        )
        if isinstance(org_result.data, dict):
            org_data = cast(dict[str, Any], org_result.data)
            org_name = str(org_data.get("name", org_name))
    except Exception:
        pass  # Use default if lookup fails

    # Send invitation email as a best-effort background task so the HTTP
    # response is not blocked on a slow email provider (F-144). Failures are
    # swallowed/logged exactly as before — the invitation already exists and
    # the email can be resent.
    async def _send_invitation_email() -> None:
        try:
            from datetime import datetime

            expires_at = datetime.fromisoformat(
                invitation["expires_at"].replace("Z", "+00:00")
            )
            await email_service.send_team_invitation(
                to_email=request.email,
                invitation_token=invitation["token"],
                organization_name=org_name,
                role=request.role,
                inviter_name=user.full_name,
                expires_at=expires_at,
            )
            logger.info("Sent team invitation email to %s", request.email)
        except Exception as e:
            # Log but don't fail - invitation is created, email can be resent
            logger.warning(
                "Failed to send team invitation email to %s: %s", request.email, e
            )

    background_tasks.add_task(_send_invitation_email)

    return TeamMemberInvitation(**invitation)


@router.get("", response_model=list[TeamMemberInvitation])
async def list_team_invitations(
    ctx: Annotated[OrgContext, Depends(get_org_scoped_context)],
    user: Annotated[User, Depends(get_current_admin_user)],
    include_used: bool = False,
) -> list[TeamMemberInvitation]:
    """
    List team member invitations for the organization (admin only).

    Args:
        ctx: Organization-scoped context
        user: Admin user
        include_used: Whether to include already used invitations

    Returns:
        List of invitation records
    """
    service = TeamInvitationService(ctx.client)
    invitations = await service.list_invitations(
        organization_id=ctx.organization_id,
        include_used=include_used,
    )

    return [TeamMemberInvitation(**inv) for inv in invitations]


@router.delete("/{invitation_id}")
async def revoke_team_invitation(
    invitation_id: UUID,
    ctx: Annotated[OrgContext, Depends(get_org_scoped_context)],
    user: Annotated[User, Depends(get_current_admin_user)],
) -> dict[str, str]:
    """
    Revoke a pending team member invitation (admin only).

    Args:
        invitation_id: UUID of the invitation to revoke
        ctx: Organization-scoped context
        user: Admin user

    Returns:
        Success message
    """
    service = TeamInvitationService(ctx.client)
    await service.revoke_invitation(
        invitation_id=invitation_id,
        organization_id=ctx.organization_id,
    )

    return {"status": "revoked", "invitation_id": str(invitation_id)}
