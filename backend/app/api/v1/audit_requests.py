"""
Audit Requests API endpoints.

Public endpoint for free revenue audit requests.
Supports lead capture, status tracking, and admin management.
"""

from datetime import UTC, datetime, timedelta
from enum import Enum
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field

from app.auth.dependencies import get_current_platform_admin
from app.config import get_settings
from app.database.client import get_supabase
from app.models.user import User
from app.services.turnstile import get_client_ip, verify_turnstile


class AuditRequestStatus(str, Enum):
    """Audit request lifecycle states."""

    PENDING = "pending"
    CONTACTED = "contacted"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CONVERTED = "converted"
    REJECTED = "rejected"


class AuditRequestCreate(BaseModel):
    """Schema for creating an audit request."""

    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    company: str = Field(..., min_length=1, max_length=200)
    building_count: int = Field(..., gt=0, le=1000)
    phone: str | None = Field(None, max_length=50)
    portfolio_sqft: int | None = Field(None, gt=0)
    current_system: str | None = Field(None, max_length=100)
    message: str | None = None
    source: str | None = Field(None, max_length=100)
    referral_code: str | None = Field(None, max_length=50)
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


class AuditRequestUpdate(BaseModel):
    """Schema for updating an audit request."""

    status: AuditRequestStatus | None = None
    notes: str | None = None
    estimated_recovery: int | None = Field(None, gt=0)
    assigned_to: UUID | None = None


class AuditRequestResponse(BaseModel):
    """Schema for audit request response."""

    id: UUID
    name: str
    email: str
    company: str
    building_count: int
    phone: str | None = None
    portfolio_sqft: int | None = None
    current_system: str | None = None
    message: str | None = None
    source: str | None = None
    status: AuditRequestStatus
    notes: str | None = None
    estimated_recovery: int | None = None
    assigned_to: UUID | None = None
    organization_id: UUID | None = None
    contacted_at: datetime | None = None
    scheduled_at: datetime | None = None
    completed_at: datetime | None = None
    converted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/audit-requests", tags=["Audit Requests"])

# Rate limit: max 3 requests per email per 24 hours
RATE_LIMIT_MAX = 3
RATE_LIMIT_WINDOW_HOURS = 24


async def check_rate_limit(email: str, db: Any) -> None:
    """Check if email has exceeded rate limit."""
    window_start = datetime.now(UTC) - timedelta(hours=RATE_LIMIT_WINDOW_HOURS)

    result = (
        db.table("audit_requests")
        .select("id")
        .eq("email", email)
        .gte("created_at", window_start.isoformat())
        .execute()
    )

    if result.count and result.count >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {RATE_LIMIT_MAX} "
                "audit requests per email per day"
            ),
        )

    if result.data and len(result.data) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: maximum {RATE_LIMIT_MAX} "
                "audit requests per email per day"
            ),
        )


@router.post(
    "",
    response_model=AuditRequestResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create audit request",
    description=(
        "Submit a request for a free revenue audit. "
        "Public endpoint - no authentication required."
    ),
)
async def create_audit_request(
    request: AuditRequestCreate,
    http_request: Request,
    db: Any = Depends(get_supabase),
) -> AuditRequestResponse:
    """Create a new audit request (public endpoint)."""
    settings = get_settings()
    email = str(request.email).lower()
    if request.company_website:
        now = datetime.now(UTC)
        return AuditRequestResponse(
            id=uuid4(),
            name=request.name,
            email=email,
            company=request.company,
            building_count=request.building_count,
            phone=request.phone,
            portfolio_sqft=request.portfolio_sqft,
            current_system=request.current_system,
            message=request.message,
            source=request.source,
            status=AuditRequestStatus.PENDING,
            created_at=now,
            updated_at=now,
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
    # Check rate limit
    await check_rate_limit(email, db)

    # Insert audit request
    data = {
        "name": request.name,
        "email": email,
        "company": request.company,
        "building_count": request.building_count,
        "phone": request.phone,
        "portfolio_sqft": request.portfolio_sqft,
        "current_system": request.current_system,
        "message": request.message,
        "source": request.source,
        "referral_code": request.referral_code,
        "status": AuditRequestStatus.PENDING.value,
    }

    result = db.table("audit_requests").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create audit request",
        )

    return AuditRequestResponse(**result.data[0])


@router.get(
    "",
    response_model=list[AuditRequestResponse],
    summary="List audit requests",
    description="List all audit requests. Admin only.",
)
async def list_audit_requests(
    _: Annotated[User, Depends(get_current_platform_admin)],
    status_filter: AuditRequestStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Any = Depends(get_supabase),
) -> list[AuditRequestResponse]:
    """List audit requests (admin only)."""
    query = db.table("audit_requests").select("*")
    query = query.order("created_at", desc=True)

    if status_filter:
        query = query.eq("status", status_filter.value)

    # Pagination
    start = (page - 1) * per_page
    end = start + per_page - 1
    query = query.range(start, end)

    result = query.execute()

    return [AuditRequestResponse(**item) for item in (result.data or [])]


@router.get(
    "/{request_id}",
    response_model=AuditRequestResponse,
    summary="Get audit request",
    description="Get a specific audit request by ID. Admin only.",
)
async def get_audit_request(
    _: Annotated[User, Depends(get_current_platform_admin)],
    request_id: UUID,
    db: Any = Depends(get_supabase),
) -> AuditRequestResponse:
    """Get audit request by ID (admin only)."""
    result = (
        db.table("audit_requests")
        .select("*")
        .eq("id", str(request_id))
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit request not found",
        )

    return AuditRequestResponse(**result.data)


@router.patch(
    "/{request_id}",
    response_model=AuditRequestResponse,
    summary="Update audit request",
    description="Update an audit request status and details. Admin only.",
)
async def update_audit_request(
    _: Annotated[User, Depends(get_current_platform_admin)],
    request_id: UUID,
    update: AuditRequestUpdate,
    db: Any = Depends(get_supabase),
) -> AuditRequestResponse:
    """Update audit request (admin only)."""
    # Build update data
    update_data: dict[str, Any] = {}

    if update.status is not None:
        update_data["status"] = update.status.value
        # Set timestamp based on status
        now = datetime.now(UTC).isoformat()
        if update.status == AuditRequestStatus.CONTACTED:
            update_data["contacted_at"] = now
        elif update.status == AuditRequestStatus.SCHEDULED:
            update_data["scheduled_at"] = now
        elif update.status == AuditRequestStatus.COMPLETED:
            update_data["completed_at"] = now
        elif update.status == AuditRequestStatus.CONVERTED:
            update_data["converted_at"] = now

    if update.notes is not None:
        update_data["notes"] = update.notes

    if update.estimated_recovery is not None:
        update_data["estimated_recovery"] = update.estimated_recovery

    if update.assigned_to is not None:
        update_data["assigned_to"] = str(update.assigned_to)

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates provided",
        )

    result = (
        db.table("audit_requests")
        .update(update_data)
        .eq("id", str(request_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit request not found",
        )

    return AuditRequestResponse(**result.data[0])
