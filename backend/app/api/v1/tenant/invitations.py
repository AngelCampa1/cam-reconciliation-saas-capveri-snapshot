"""
Tenant invitation endpoints.

Includes PUBLIC endpoints for validating invitation tokens and
AUTHENTICATED endpoints for creating invitations (admin only).
"""

import logging
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import OrgContext, get_current_admin_user
from app.core.rate_limiting import (
    PUBLIC_INVITATION_RATE_LIMIT,
    build_ip_rate_limit_key,
    moving_window,
)
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.exceptions import NotFoundError
from app.exceptions.handlers import InvalidInvitationTokenError
from app.models.schemas.tenant_auth import InvitationValidationResponse
from app.models.tenant import TenantInvitation, TenantInvitationCreateRequest
from app.models.user import User
from app.services.billing.feature_usage import record_feature_use
from app.services.email import EmailService, get_email_service
from app.services.tenant_invitation import TenantInvitationService

router = APIRouter(prefix="/tenant/invitations", tags=["tenant-auth"])

logger = logging.getLogger(__name__)


@router.get("/{token}/validate", response_model=InvitationValidationResponse)
async def validate_invitation_token(
    token: str,
    request: Request,
    db: SupabaseDB = Depends(get_supabase),
) -> InvitationValidationResponse:
    """
    Validate a tenant invitation token (PUBLIC endpoint).

    Security:
    - Returns 200 (not 410) for all invalid tokens (prevent enumeration)
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
    rate_limit_key = build_ip_rate_limit_key("tenant-invitation-validate", client_host)

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

    service = TenantInvitationService(db)

    try:
        invitation = await service.validate_token(token)

        return InvitationValidationResponse(
            valid=True,
            email=invitation["email"],
            lease_id=invitation["lease_id"],
            organization_id=invitation["organization_id"],
            expires_at=invitation["expires_at"],
        )

    except InvalidInvitationTokenError as e:
        # Cast reason to expected literal type
        from typing import Literal, cast

        reason = cast(Literal["expired", "used", "revoked", "not_found"], e.reason)
        return InvitationValidationResponse(
            valid=False,
            error_reason=reason,
        )


@router.post("", response_model=TenantInvitation, status_code=status.HTTP_201_CREATED)
async def create_tenant_invitation(
    request: TenantInvitationCreateRequest,
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> TenantInvitation:
    """
    Create and send a tenant portal invitation (admin only).

    Creates a new invitation record with a secure token and sends an email
    to the tenant with instructions to set up their account.

    The invitation expires after 7 days and can only be used once.

    Args:
        request: Invitation details (email, lease_id)
        ctx: Organization-scoped context
        user: Admin user creating the invitation
        db: Supabase client
        email_service: Email service for sending invitation

    Returns:
        The created invitation record

    Raises:
        NotFoundError: If lease doesn't exist or doesn't belong to organization
        HTTPException 403: If user is not an admin
    """
    # Verify lease exists and belongs to organization
    lease_result = (
        ctx.table("leases")
        .select("id, properties!inner(organization_id)")
        .eq("id", str(request.lease_id))
        .eq("properties.organization_id", str(ctx.organization_id))
        .execute()
    )

    if not lease_result.data or len(lease_result.data) == 0:
        raise NotFoundError("lease", str(request.lease_id))

    # Create invitation via service
    service = TenantInvitationService(ctx.client)
    invitation = await service.create_invitation(
        email=request.email,
        lease_id=request.lease_id,
        invited_by=user.id,
        organization_id=ctx.organization_id,
    )

    # Send invitation email
    try:
        from datetime import datetime

        expires_at = datetime.fromisoformat(
            invitation["expires_at"].replace("Z", "+00:00")
        )
        await email_service.send_tenant_invitation(
            to_email=request.email,
            invitation_token=invitation["token"],
            expires_at=expires_at,
        )
        logger.info("Sent invitation email to %s", request.email)
    except Exception as e:
        # Log but don't fail - invitation is created, email can be resent
        logger.warning("Failed to send invitation email to %s: %s", request.email, e)

    record_feature_use(get_supabase_admin(), str(ctx.organization_id), "tenant_portal")
    return TenantInvitation(**invitation)
