"""
Tenant signup endpoint.

PUBLIC endpoint (no authentication required) for completing tenant signup
after receiving an invitation.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.database.client import SupabaseDB, get_supabase
from app.exceptions.handlers import InvalidInvitationTokenError
from app.models.schemas.tenant_auth import (
    TenantSignupRequest,
    TenantSignupResponse,
    TenantUserResponse,
)
from app.services.tenant_invitation import TenantInvitationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant", tags=["tenant-auth"])


@router.post("/signup", response_model=TenantSignupResponse, status_code=201)
async def tenant_signup(
    request: TenantSignupRequest,
    db: SupabaseDB = Depends(get_supabase),
) -> TenantSignupResponse:
    """
    Complete tenant signup (PUBLIC endpoint).

    Process (atomic):
    1. Validate invitation token
    2. Create Supabase Auth user
    3. Create TenantUser database record
    4. Link tenant to lease
    5. Mark invitation used
    6. Return tokens

    Args:
        request: Signup request with token, password, and contact name
        db: Supabase client

    Returns:
        TenantSignupResponse with user info and auth tokens

    Raises:
        410: Invalid/expired/used token
        422: Weak password
        409: Email already registered
        500: Signup process failed
    """
    service = TenantInvitationService(db)

    try:
        tenant_user, access_token, refresh_token = await service.complete_signup(
            token=request.token,
            password=request.password,
            contact_name=request.contact_name,
            accepted_terms=request.accepted_terms,
            terms_version=request.terms_version,
            terms_hash=request.terms_hash,
        )

        # Build tenant user response
        tenant_user_data = TenantUserResponse(
            id=tenant_user["id"],
            user_id=tenant_user["user_id"],
            organization_id=tenant_user["organization_id"],
            contact_name=tenant_user["contact_name"],
            contact_email=tenant_user["contact_email"],
            created_at=tenant_user["created_at"],
        )

        return TenantSignupResponse(
            success=True,
            user_id=tenant_user["user_id"],
            access_token=access_token,
            refresh_token=refresh_token,
            tenant_user=tenant_user_data.model_dump(),
        )

    except InvalidInvitationTokenError as e:
        raise HTTPException(
            status_code=410,
            detail={"error": "Invalid invitation", "reason": e.reason},
        )
