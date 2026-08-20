"""
PLG Onboarding API endpoints.

Handles anonymous user bootstrap and account upgrade for the
product-led growth (PLG) onboarding flow.
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import CurrentUser
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.services.email import EmailService, get_email_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboard", tags=["PLG Onboard"])

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class OnboardInitResponse(BaseModel):
    organization_id: str
    user_id: str
    already_existed: bool


class OnboardUpgradeRequest(BaseModel):
    email: EmailStr
    organization_name: str | None = None


class OnboardUpgradeResponse(BaseModel):
    success: bool


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# POST /onboard/init
# ---------------------------------------------------------------------------

# Backward-compatible alias retained for existing tests and overrides.
get_onboard_email_service = get_email_service


def _get_existing_onboard_user(db: Any, user_id: str) -> dict[str, Any] | None:
    existing = (
        db.table("users")
        .select("id, organization_id, email")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        return dict(existing.data)
    return None


def _delete_bootstrap_org(db: Any, org_id: str) -> None:
    try:
        db.table("organizations").delete().eq("id", org_id).execute()
    except Exception as e:
        logger.warning(
            "Failed to clean up onboarding bootstrap org %s after user insert race: %s",
            org_id,
            e,
        )


@router.post(
    "/init",
    response_model=OnboardInitResponse,
    status_code=status.HTTP_200_OK,
    summary="Bootstrap org+user for anonymous Supabase user",
    description=(
        "Validates anonymous JWT, creates org + user rows (idempotent). "
        "Public endpoint - uses bearer token, not CurrentUser dependency."
    ),
)
async def onboard_init(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    db: Any = Depends(get_supabase_admin),
) -> OnboardInitResponse:
    """Bootstrap org and user rows for an anonymous Supabase user."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Validate the JWT directly via Supabase — no users row exists yet
    try:
        auth_response = supabase.auth.get_user(token)
        if not auth_response or not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        auth_user = auth_response.user
    except HTTPException:
        raise
    except Exception as e:
        logger.debug("Token validation failed for /onboard/init: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    user_id = str(auth_user.id)

    # Idempotency check — return existing row if already bootstrapped
    existing = _get_existing_onboard_user(db, user_id)
    if existing:
        return OnboardInitResponse(
            organization_id=str(existing["organization_id"]),
            user_id=user_id,
            already_existed=True,
        )

    # Create org with placeholder name (admin client bypasses RLS)
    org_result = db.table("organizations").insert({"name": "Anonymous Org"}).execute()
    org_id = str(org_result.data[0]["id"])

    # Create user with placeholder email
    placeholder_email = f"anon+{user_id[:8]}@placeholder.capveri.com"
    try:
        db.table("users").insert(
            {
                "id": user_id,
                "organization_id": org_id,
                "email": placeholder_email,
                "role": "owner",
            }
        ).execute()
    except Exception as e:
        existing_after_race = _get_existing_onboard_user(db, user_id)
        _delete_bootstrap_org(db, org_id)
        if existing_after_race:
            return OnboardInitResponse(
                organization_id=str(existing_after_race["organization_id"]),
                user_id=user_id,
                already_existed=True,
            )
        logger.warning("Onboarding user bootstrap failed for %s: %s", user_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create onboarding user record",
        ) from e

    return OnboardInitResponse(
        organization_id=org_id,
        user_id=user_id,
        already_existed=False,
    )


# ---------------------------------------------------------------------------
# PATCH /onboard/upgrade
# ---------------------------------------------------------------------------


@router.patch(
    "/upgrade",
    response_model=OnboardUpgradeResponse,
    status_code=status.HTTP_200_OK,
    summary="Upgrade anonymous account to real account",
    description=(
        "Called after supabase.auth.updateUser() sets email+password. "
        "Updates users.email and organizations.name, sends welcome email."
    ),
)
async def onboard_upgrade(
    payload: OnboardUpgradeRequest,
    current_user: CurrentUser,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    email_service: Annotated[EmailService, Depends(get_onboard_email_service)],
    db: Any = Depends(get_supabase_admin),
) -> OnboardUpgradeResponse:
    """Promote anonymous account to real account after email+password are set."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        auth_response = supabase.auth.get_user(credentials.credentials)
        auth_user = auth_response.user if auth_response else None
    except Exception as e:
        logger.debug("Token validation failed for /onboard/upgrade: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    auth_email = getattr(auth_user, "email", None)
    if auth_user is None or str(getattr(auth_user, "id", "")) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if auth_email is None or auth_email.casefold() != payload.email.casefold():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email must match the authenticated Supabase account",
        )

    org_name = payload.organization_name or payload.email.split("@")[0].capitalize()

    # Update users.email — raise 404 if no row exists (init was never called)
    user_result = (
        db.table("users")
        .update({"email": payload.email})
        .eq("id", str(current_user.id))
        .execute()
    )
    if not user_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User record not found. Call /onboard/init first.",
        )

    # Update organizations.name — log warning if org row is missing (inconsistent state)
    org_result = (
        db.table("organizations")
        .update({"name": org_name})
        .eq("id", str(current_user.organization_id))
        .execute()
    )
    if not org_result.data:
        logger.warning(
            "Organization row missing during upgrade for user %s, org %s",
            str(current_user.id),
            str(current_user.organization_id),
        )

    # Send welcome email (fire-and-forget on failure)
    try:
        await email_service.send_welcome_email(
            to_email=payload.email,
            organization_name=org_name,
        )
    except Exception as e:
        logger.warning("Welcome email failed for %s: %s", payload.email, e)

    return OnboardUpgradeResponse(success=True)
