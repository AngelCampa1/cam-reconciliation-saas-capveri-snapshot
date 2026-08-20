"""
Team member signup endpoint.

PUBLIC endpoint for completing team member signup after invitation.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.database.client import SupabaseDB, get_supabase
from app.exceptions.handlers import InvalidInvitationTokenError
from app.models.schemas.team_auth import (
    TeamMemberSignupRequest,
    TeamMemberSignupResponse,
)
from app.services.email import EmailService, get_email_service
from app.services.team_invitation import TeamInvitationService

router = APIRouter(prefix="/team", tags=["team-management"])

logger = logging.getLogger(__name__)


@router.post(
    "/signup",
    response_model=TeamMemberSignupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def team_member_signup(
    request: TeamMemberSignupRequest,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> TeamMemberSignupResponse:
    """
    Complete team member signup with invitation token (PUBLIC endpoint).

    Creates a new user account and adds them to the invited organization
    with the role specified in the invitation.

    Args:
        request: Signup details (token, password, full_name)
        db: Supabase client
        email_service: Email service for sending welcome email

    Returns:
        Signup response with auth tokens and user data

    Raises:
        HTTPException 410: If token is invalid, expired, used, or revoked
    """
    service = TeamInvitationService(db)

    try:
        user_data, access_token, refresh_token = await service.complete_signup(
            token=request.token,
            password=request.password,
            full_name=request.full_name,
            accepted_terms=request.accepted_terms,
            terms_version=request.terms_version,
            terms_hash=request.terms_hash,
        )

        # Send welcome email
        try:
            await email_service.send_team_welcome(
                to_email=user_data["email"],
                full_name=request.full_name,
                organization_name=user_data.get(
                    "organization_name", "your organization"
                ),
                role=user_data["role"],
            )
            logger.info("Sent welcome email to %s", user_data["email"])
        except Exception as e:
            # Log but don't fail - signup is complete
            logger.warning(
                "Failed to send welcome email to %s: %s", user_data["email"], e
            )

        return TeamMemberSignupResponse(
            success=True,
            user_id=user_data["id"],
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_data,
        )

    except InvalidInvitationTokenError as e:
        # Return 410 Gone with error reason
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "message": "Invalid invitation token",
                "reason": e.reason,
            },
        )
