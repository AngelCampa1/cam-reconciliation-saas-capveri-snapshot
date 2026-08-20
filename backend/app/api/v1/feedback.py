"""Feedback API endpoints.

Provides endpoints for users to submit feedback and for admins to manage it.
Implements rate limiting to prevent abuse.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, cast
from urllib.parse import unquote, urlparse
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from limits import parse
from pydantic import BaseModel, Field

from app.api.v1.uploads import read_upload_with_limit
from app.auth.dependencies import get_current_admin_user, get_current_user
from app.config import get_settings
from app.core.rate_limiting import build_ip_rate_limit_key, moving_window
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.models.feedback import (
    Feedback,
    FeedbackCreate,
    FeedbackStatus,
    FeedbackType,
    FeedbackUpdate,
)
from app.models.user import User
from app.services.email import EmailService, get_email_service
from app.services.turnstile import get_client_ip, verify_turnstile

ADMIN_FEEDBACK_EMAIL = get_settings().admin_notification_email


class MarketingFeedbackCreate(BaseModel):
    """Payload accepted from the public marketing site feedback widget."""

    type: FeedbackType
    message: str = Field(..., min_length=10, max_length=2000)
    page_url: str = Field("", max_length=2000)
    user_agent: str | None = Field(None, max_length=500)
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limit configuration: 3 submissions per hour
RATE_LIMIT_COUNT = 3
RATE_LIMIT_WINDOW = timedelta(hours=1)
MARKETING_FEEDBACK_RATE_LIMIT = parse(
    "100 per 1 minute"
    if get_settings().environment in ("development", "test")
    else "5 per 1 hour"
)
SCREENSHOT_SIGNED_URL_TTL_SECONDS = 3600
SCREENSHOT_BUCKET = "feedback-screenshots"
SCREENSHOT_PATH_PREFIX = "feedback/"


def _extract_feedback_screenshot_path(
    screenshot_reference: str | None,
    organization_id: str,
) -> str | None:
    """Normalize screenshot references to a private storage object path."""
    if not screenshot_reference:
        return None

    expected_prefix = f"{SCREENSHOT_PATH_PREFIX}{organization_id}/"
    if screenshot_reference.startswith(SCREENSHOT_PATH_PREFIX):
        if not screenshot_reference.startswith(expected_prefix):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Screenshot path is outside the current organization",
            )
        return screenshot_reference

    parsed = urlparse(screenshot_reference)
    if not parsed.scheme or not parsed.netloc:
        return screenshot_reference

    path = unquote(parsed.path)
    bucket_marker = f"/{SCREENSHOT_BUCKET}/"
    if bucket_marker not in path:
        return screenshot_reference

    screenshot_path = path.split(bucket_marker, 1)[1]
    if not screenshot_path.startswith(expected_prefix):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Screenshot path is outside the current organization",
        )

    return screenshot_path


def _create_feedback_screenshot_signed_url(
    screenshot_path: str | None,
    supabase: SupabaseDB,
) -> str | None:
    """Create a short-lived URL for a stored feedback screenshot path."""
    if not screenshot_path or not screenshot_path.startswith(SCREENSHOT_PATH_PREFIX):
        return screenshot_path

    storage = supabase.storage.from_(SCREENSHOT_BUCKET)
    signed_url_response = storage.create_signed_url(
        screenshot_path, SCREENSHOT_SIGNED_URL_TTL_SECONDS
    )
    signed_url = (
        signed_url_response.get("signedURL")
        or signed_url_response.get("signedUrl")
        or signed_url_response.get("signed_url")
    )
    if not signed_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage signed URL creation failed",
        )

    return str(signed_url)


def _feedback_with_signed_screenshot(
    data: dict[str, Any],
    supabase: SupabaseDB,
) -> Feedback:
    response_data = dict(data)
    response_data["screenshot_url"] = _create_feedback_screenshot_signed_url(
        cast(str | None, response_data.get("screenshot_url")),
        supabase,
    )
    return Feedback(**response_data)


@router.post("", response_model=Feedback, status_code=status.HTTP_201_CREATED)
async def create_feedback(
    data: FeedbackCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> Feedback:
    """
    Submit user feedback.

    Rate limited to 3 submissions per hour per user.
    Automatically captures user context and timestamps.

    Args:
        data: Feedback submission data
        current_user: Authenticated user (from JWT)
        supabase: Database client

    Returns:
        Created feedback record

    Raises:
        HTTPException 429: Rate limit exceeded (3/hour)
        HTTPException 422: Invalid feedback data
    """
    user_id = str(current_user.id)
    org_id = str(current_user.organization_id)

    # Check rate limit - count feedback from last hour
    cutoff = (datetime.now(UTC) - RATE_LIMIT_WINDOW).isoformat()
    recent_result = (
        supabase.table("feedback")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .execute()
    )

    recent_count = recent_result.count or 0

    if recent_count >= RATE_LIMIT_COUNT:
        detail = (
            f"Rate limit exceeded. Maximum {RATE_LIMIT_COUNT} " "submissions per hour."
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
        )

    screenshot_path = _extract_feedback_screenshot_path(data.screenshot_url, org_id)

    # Create feedback entry
    insert_data = {
        "user_id": user_id,
        "organization_id": org_id,
        "type": data.type.value,
        "status": FeedbackStatus.NEW.value,
        "message": data.message,
        "page_url": data.page_url,
        "screenshot_url": screenshot_path,
        "user_agent": data.user_agent,
        "metadata": data.metadata or {},
    }

    result = supabase.table("feedback").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create feedback",
        )

    feedback = _feedback_with_signed_screenshot(
        cast(dict[str, Any], result.data[0]), supabase
    )

    try:
        email_screenshot_url = _create_feedback_screenshot_signed_url(
            screenshot_path, supabase
        )
        await email_service.send_feedback_notification(
            to_email=ADMIN_FEEDBACK_EMAIL,
            feedback_type=data.type.value,
            message=data.message,
            page_url=data.page_url,
            user_email=current_user.email,
            user_id=user_id,
            organization_id=org_id,
            screenshot_url=email_screenshot_url,
        )
    except Exception as exc:
        logger.warning("Failed to send feedback notification email: %s", exc)

    return feedback


@router.post("/marketing", status_code=status.HTTP_200_OK)
async def create_marketing_feedback(
    data: MarketingFeedbackCreate,
    request: Request,
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> dict[str, str]:
    """Submit feedback from the public marketing site.

    No authentication required. Sends an email notification to the admin
    and returns immediately. Email failures are logged but never surfaced
    to the caller.
    """
    if data.company_website:
        return {"status": "ok"}

    client_ip = get_client_ip(request) or "unknown"
    rate_limit_key = build_ip_rate_limit_key("marketing-feedback", client_ip)
    if not moving_window.hit(MARKETING_FEEDBACK_RATE_LIMIT, rate_limit_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please try again later.",
        )

    if not await verify_turnstile(
        data.turnstile_token,
        get_settings(),
        remote_ip=client_ip,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification failed. Please try again.",
        )

    try:
        await email_service.send_feedback_notification(
            to_email=ADMIN_FEEDBACK_EMAIL,
            feedback_type=data.type.value,
            message=data.message,
            page_url=data.page_url,
            user_email="anonymous (marketing site)",
            user_id="n/a",
            organization_id="n/a",
        )
    except Exception as exc:
        logger.warning("Failed to send marketing feedback notification email: %s", exc)

    return {"status": "ok"}


@router.get("", response_model=list[Feedback])
async def list_feedback(
    _admin: Annotated[User, Depends(get_current_admin_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
    type: Annotated[FeedbackType | None, Query()] = None,
    status_filter: Annotated[FeedbackStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[Feedback]:
    """
    List all feedback (admin only).

    Supports filtering by type and status, with pagination.

    Args:
        type: Optional filter by feedback type
        status_filter: Optional filter by status
        page: Page number (1-indexed)
        per_page: Items per page (1-100)
        _admin: Authenticated admin user (verified by dependency)
        supabase: Database client

    Returns:
        List of feedback records, ordered by creation date (newest first)
    """
    query = (
        supabase.table("feedback")
        .select("*")
        .eq("organization_id", str(_admin.organization_id))
        .order("created_at", desc=True)
    )

    # Apply filters if provided
    if type:
        query = query.eq("type", type.value)
    if status_filter:
        query = query.eq("status", status_filter.value)

    # Apply pagination
    start = (page - 1) * per_page
    end = start + per_page - 1
    query = query.range(start, end)

    result = query.execute()
    return [
        _feedback_with_signed_screenshot(cast(dict[str, Any], item), supabase)
        for item in (result.data or [])
    ]


@router.get("/my", response_model=list[Feedback])
async def list_my_feedback(
    current_user: Annotated[User, Depends(get_current_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
) -> list[Feedback]:
    """
    List current user's feedback submissions.

    Returns the most recent 20 feedback items submitted by the authenticated user.

    Args:
        current_user: Authenticated user
        supabase: Database client

    Returns:
        List of user's feedback, ordered by creation date (newest first)
    """
    result = (
        supabase.table("feedback")
        .select("*")
        .eq("user_id", str(current_user.id))
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )

    return [Feedback(**cast(dict[str, Any], item)) for item in (result.data or [])]


@router.get("/stats/summary")
async def get_feedback_stats(
    _admin: Annotated[User, Depends(get_current_admin_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
) -> dict[str, Any]:
    """
    Get feedback statistics (admin only).

    Aggregates feedback counts by type and status for dashboard display.

    Args:
        _admin: Authenticated admin user
        supabase: Database client

    Returns:
        Statistics dictionary with:
        - total: Total feedback count
        - by_type: Count grouped by feedback type
        - by_status: Count grouped by status
    """
    result = (
        supabase.table("feedback")
        .select("type, status")
        .eq("organization_id", str(_admin.organization_id))
        .execute()
    )

    feedback_list = cast(list[dict[str, Any]], result.data or [])

    by_type: dict[str, int] = {}
    by_status: dict[str, int] = {}

    for item in feedback_list:
        feedback_type = str(item["type"])
        feedback_status = str(item["status"])

        by_type[feedback_type] = by_type.get(feedback_type, 0) + 1
        by_status[feedback_status] = by_status.get(feedback_status, 0) + 1

    return {
        "total": len(feedback_list),
        "by_type": by_type,
        "by_status": by_status,
    }


@router.get("/{feedback_id}", response_model=Feedback)
async def get_feedback(
    feedback_id: UUID,
    _admin: Annotated[User, Depends(get_current_admin_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
) -> Feedback:
    """
    Get specific feedback by ID (admin only).

    Args:
        feedback_id: UUID of the feedback to retrieve
        _admin: Authenticated admin user
        supabase: Database client

    Returns:
        Feedback record

    Raises:
        HTTPException 404: Feedback not found
    """
    result = (
        supabase.table("feedback")
        .select("*")
        .eq("id", str(feedback_id))
        .eq("organization_id", str(_admin.organization_id))
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found",
        )

    return _feedback_with_signed_screenshot(cast(dict[str, Any], result.data), supabase)


@router.patch("/{feedback_id}", response_model=Feedback)
async def update_feedback(
    feedback_id: UUID,
    data: FeedbackUpdate,
    _admin: Annotated[User, Depends(get_current_admin_user)],
    supabase: Annotated[SupabaseDB, Depends(get_supabase)],
) -> Feedback:
    """
    Update feedback status and metadata (admin only).

    Allows admins to change status and add notes to feedback items.

    Args:
        feedback_id: UUID of the feedback to update
        data: Update data (status and/or metadata)
        _admin: Authenticated admin user
        supabase: Database client

    Returns:
        Updated feedback record

    Raises:
        HTTPException 400: No updates provided
        HTTPException 404: Feedback not found
    """
    updates: dict[str, Any] = {}

    if data.status:
        updates["status"] = data.status.value
    if data.metadata is not None:
        updates["metadata"] = data.metadata

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates provided",
        )

    # Always update the timestamp
    updates["updated_at"] = datetime.now(UTC).isoformat()

    result = (
        supabase.table("feedback")
        .update(updates)
        .eq("id", str(feedback_id))
        .eq("organization_id", str(_admin.organization_id))
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found",
        )

    return Feedback(**cast(dict[str, Any], result.data[0]))


# Screenshot upload configuration
MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024  # 5MB in bytes


@router.post("/screenshot", status_code=status.HTTP_201_CREATED)
async def upload_screenshot(
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    supabase_admin: Annotated[SupabaseDB, Depends(get_supabase_admin)],
) -> dict[str, str]:
    """
    Upload feedback screenshot to storage.

    Authenticates the request with the user's JWT, scopes the object path to
    that user's organization, then uploads with the backend admin client.
    Files are uploaded to: feedback/{organization_id}/{unique_filename}

    Args:
        file: Image file upload (max 5MB)
        current_user: Authenticated user (from JWT)

    Returns:
        Dict with 'url' key containing public URL of uploaded screenshot

    Raises:
        HTTPException 400: Invalid file type or size
        HTTPException 401: Authentication required
        HTTPException 500: Storage upload failure
    """
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image",
        )

    content = await read_upload_with_limit(
        file,
        max_size=MAX_SCREENSHOT_SIZE,
        too_large_detail="File too large. Maximum size is 5MB.",
    )

    # Generate unique filename with timestamp to prevent collisions
    file_extension = file.content_type.split("/")[-1]  # e.g., "png" from "image/png"
    unique_filename = f"{uuid4()}.{file_extension}"

    # Construct storage path: feedback/{organization_id}/{unique_filename}
    storage_path = f"feedback/{current_user.organization_id}/{unique_filename}"

    try:
        storage = supabase_admin.storage.from_(SCREENSHOT_BUCKET)

        # Upload with the backend admin client after endpoint auth has scoped
        # the object key to the authenticated user's organization.
        upload_result = storage.upload(
            storage_path, content, {"content-type": file.content_type}
        )

        # Check for upload errors
        if hasattr(upload_result, "error") and upload_result.error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Storage upload failed: {upload_result.error}",
            )

        signed_url_response = storage.create_signed_url(
            storage_path, SCREENSHOT_SIGNED_URL_TTL_SECONDS
        )
        signed_url = (
            signed_url_response.get("signedURL")
            or signed_url_response.get("signedUrl")
            or signed_url_response.get("signed_url")
        )
        if not signed_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Storage signed URL creation failed",
            )

        return {"url": signed_url, "storage_path": storage_path}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload screenshot: {str(e)}",
        )
