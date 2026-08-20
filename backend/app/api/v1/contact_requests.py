"""
Contact Requests API endpoint.

Public endpoint for general contact form submissions (non-audit inquiries).
Sends an admin notification email; no database storage required.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.config import Settings, get_settings
from app.services.email import EmailService, build_email_service
from app.services.turnstile import get_client_ip, verify_turnstile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contact-requests", tags=["Contact Requests"])

# Simple in-memory per-email rate limit: max 3 submissions per 24 hours.
# Resets on process restart, but adequate for a low-traffic contact form.
_rate_limit: dict[str, list[datetime]] = {}
RATE_LIMIT_MAX = 3
RATE_LIMIT_WINDOW = timedelta(hours=24)


def _check_rate_limit(email: str) -> None:
    """Raise 429 if this email has exceeded the contact request rate limit."""
    now = datetime.now(UTC)
    window_start = now - RATE_LIMIT_WINDOW
    timestamps = [t for t in _rate_limit.get(email, []) if t > window_start]
    if len(timestamps) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {RATE_LIMIT_MAX} "
                "contact requests per email per day"
            ),
        )
    timestamps.append(now)
    _rate_limit[email] = timestamps


def get_email_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> EmailService:
    """Dependency for email service, using the shared Settings singleton."""
    return build_email_service(settings)


class ContactRequestCreate(BaseModel):
    """Schema for a general contact form submission."""

    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    inquiry_type: str = Field(..., min_length=1, max_length=50)
    company: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=50)
    message: str | None = Field(None, max_length=5000)
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


class ContactRequestResponse(BaseModel):
    """Response for contact request submission."""

    success: bool
    message: str


@router.post(
    "",
    response_model=ContactRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit contact inquiry",
    description=(
        "Submit a general contact inquiry (non-audit). "
        "Public endpoint — no authentication required. "
        "Sends an admin notification email."
    ),
)
async def create_contact_request(
    request: ContactRequestCreate,
    http_request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> ContactRequestResponse:
    """Handle a general contact form submission."""
    if request.company_website:
        return ContactRequestResponse(
            success=True,
            message=(
                "Your message has been received. We'll be in touch within 24 hours."
            ),
        )
    if not await verify_turnstile(
        request.turnstile_token,
        settings,
        remote_ip=get_client_ip(http_request),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification failed. Please try again.",
        )
    _check_rate_limit(request.email)
    try:
        await email_service.send_contact_notification(
            admin_email=settings.admin_notification_email,
            name=request.name,
            email=request.email,
            inquiry_type=request.inquiry_type,
            company=request.company,
            phone=request.phone,
            message=request.message,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Failed to send contact notification for %s (%s)",
            request.email,
            request.inquiry_type,
        )
        # Do not surface internal email errors to the user

    return ContactRequestResponse(
        success=True,
        message="Your message has been received. We'll be in touch within 24 hours.",
    )
