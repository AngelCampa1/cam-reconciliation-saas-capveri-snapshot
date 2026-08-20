"""
Content Lead Capture API endpoints.

Public endpoint for gated content downloads (lead magnets).
Captures email + name, generates a signed download URL, sends email,
and enrolls lead in the centralized Sequencer.
"""

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from pydantic import BaseModel, EmailStr, Field

from app.config import get_settings
from app.database.client import get_supabase_admin
from app.services.analytics.posthog import capture_backend_event
from app.services.email import EmailService, get_email_service
from app.services.leads.asset_registry import get_asset
from app.services.leads.asset_storage import get_lead_magnet_url
from app.services.leads.unsubscribe import verify_unsubscribe_token
from app.services.sequencer import (
    enroll_sequencer_sequence,
    record_sequencer_event,
    unsubscribe_sequencer_contact,
)
from app.services.turnstile import get_client_ip, verify_turnstile

logger = logging.getLogger(__name__)

PLG_FREE_AUDIT_SLUG = "plg_free_audit"

# Default nurture sequence for content-download leads.
DEFAULT_CONTENT_SEQUENCE_SLUG = "capveri-nurture-value-1"

# Route content-download enrollment to a tailored sequence based on lead source.
# Sources not listed here fall back to DEFAULT_CONTENT_SEQUENCE_SLUG.
CONTENT_SEQUENCE_BY_SOURCE: dict[str, str] = {
    "exit_intent_popup": "capveri-exit-intent-nurture",
}


def _content_sequence_slug_for_source(source: str | None) -> str:
    """Resolve the nurture sequence slug for a content-download lead source."""
    return CONTENT_SEQUENCE_BY_SOURCE.get(source or "", DEFAULT_CONTENT_SEQUENCE_SLUG)


# Rate limit: 1 download per email+slug per 24 hours
RATE_LIMIT_WINDOW_HOURS = 24

OUTBOUND_ATTRIBUTION_FIELDS = (
    "ve_product",
    "ve_icp",
    "ve_campaign_id",
    "ve_variant",
    "ve_step",
    "ve_offer",
    "ve_instantly_campaign_id",
    "ve_lead_list_id",
    "ve_sender_pool",
    "ve_sequence_day",
    "ve_branding",
)


class ContentLeadRequest(BaseModel):
    first_name: str | None = Field(default=None, max_length=100)
    email: EmailStr
    company: str | None = None
    asset_slug: str
    source: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    ve_product: str | None = None
    ve_icp: str | None = None
    ve_campaign_id: str | None = None
    ve_variant: str | None = None
    ve_step: str | None = None
    ve_offer: str | None = None
    ve_instantly_campaign_id: str | None = None
    ve_lead_list_id: str | None = None
    ve_sender_pool: str | None = None
    ve_sequence_day: str | None = None
    ve_branding: str | None = None
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


class ContentLeadResponse(BaseModel):
    success: bool
    message: str


class CalculatorUnlockRequest(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    slug: str
    source: str | None = None
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


class CalculatorUnlockResponse(BaseModel):
    unlocked: bool
    message: str


class PlgSignupLeadRequest(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    organization_name: str | None = None
    leakage_amount: Decimal | None = None
    property_name: str | None = None
    utm_source: str | None = None
    utm_campaign: str | None = None
    ve_product: str | None = None
    ve_icp: str | None = None
    ve_campaign_id: str | None = None
    ve_variant: str | None = None
    ve_step: str | None = None
    ve_offer: str | None = None
    ve_instantly_campaign_id: str | None = None
    ve_lead_list_id: str | None = None
    ve_sender_pool: str | None = None
    ve_sequence_day: str | None = None
    ve_branding: str | None = None
    turnstile_token: str | None = None
    company_website: str | None = Field(default=None, max_length=200)


class PlgSignupLeadResponse(BaseModel):
    success: bool
    message: str


class UnsubscribeResponse(BaseModel):
    success: bool
    message: str


router = APIRouter(prefix="/leads", tags=["Leads"])


def _get_email_domain(email: str) -> str | None:
    domain = email.strip().lower().split("@")[-1]
    return domain or None


def _get_lead_distinct_id(email: str) -> str:
    normalized_email = email.strip().lower()
    digest = hashlib.sha256(f"capveri-lead:{normalized_email}".encode()).hexdigest()
    domain = _get_email_domain(normalized_email) or "unknown"
    return f"lead:{domain}:{digest[:16]}"


def _amount_bucket(amount: Decimal | None) -> str:
    if amount is None:
        return "unknown"
    if amount < Decimal("10000"):
        return "0-10k"
    if amount < Decimal("50000"):
        return "10k-50k"
    if amount < Decimal("100000"):
        return "50k-100k"
    if amount < Decimal("500000"):
        return "100k-500k"
    if amount < Decimal("1000000"):
        return "500k-1m"
    return "1m+"


def _outbound_attribution_properties(payload: BaseModel) -> dict[str, str]:
    properties: dict[str, str] = {}
    for field in OUTBOUND_ATTRIBUTION_FIELDS:
        value = getattr(payload, field, None)
        if value:
            properties[field] = value
    return properties


async def _capture_lead_event(
    event: str,
    *,
    email: str,
    properties: dict[str, Any],
) -> None:
    email_domain = _get_email_domain(email)
    await capture_backend_event(
        event,
        distinct_id=_get_lead_distinct_id(email),
        properties={
            **({"lead_email_domain": email_domain} if email_domain else {}),
            **properties,
        },
    )


async def check_download_rate_limit(email: str, asset_slug: str, db: Any) -> None:
    window_start = datetime.now(UTC) - timedelta(hours=RATE_LIMIT_WINDOW_HOURS)
    result = (
        db.table("content_leads")
        .select("id")
        .eq("email", email)
        .eq("asset_slug", asset_slug)
        .gte("created_at", window_start.isoformat())
        .execute()
    )
    if result.data and len(result.data) >= 1:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "You have already requested this download."
                " Check your email for the link."
            ),
        )


async def _check_suppressed(email: str, db: Any) -> bool:
    result = (
        db.table("email_suppressions")
        .select("email")
        .eq("email", email.lower())
        .execute()
    )
    return bool(result.data)


@router.post(
    "/content-download",
    response_model=ContentLeadResponse,
    status_code=status.HTTP_200_OK,
    summary="Capture content lead",
    description=(
        "Capture email + name for a gated content download. "
        "Stores lead, generates signed URL, sends download email, "
        "and enrolls in Sequencer nurture. Public endpoint."
    ),
)
async def capture_content_lead(
    payload: ContentLeadRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    email_service: Annotated[EmailService, Depends(get_email_service)],
    db: Any = Depends(get_supabase_admin),
) -> ContentLeadResponse:
    settings = get_settings()
    email = str(payload.email).lower()
    if payload.company_website:
        return ContentLeadResponse(
            success=True, message="Check your email for the download link"
        )
    if not await verify_turnstile(
        payload.turnstile_token,
        settings,
        remote_ip=get_client_ip(http_request),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification failed. Please try again.",
        )
    asset = get_asset(payload.asset_slug)

    if not asset or asset.format not in ("pdf", "xlsx"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown asset_slug {payload.asset_slug!r}.",
        )

    if not asset.enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Asset {payload.asset_slug!r} is not yet available.",
        )

    if await _check_suppressed(email, db):
        return ContentLeadResponse(
            success=True,
            message="Check your email for the download link",
        )

    await check_download_rate_limit(email, payload.asset_slug, db)
    outbound_attribution = _outbound_attribution_properties(payload)

    try:
        download_url = get_lead_magnet_url(asset.storage_path)
    except Exception as e:
        logger.error(
            "Failed to generate presigned URL for %s: %s",
            asset.storage_path,
            e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Download link is temporarily unavailable. " "Please try again shortly."
            ),
        ) from e

    lead_data = {
        "first_name": payload.first_name,
        "email": email,
        "company": payload.company,
        "asset_slug": payload.asset_slug,
        "source": payload.source,
        "utm_source": payload.utm_source,
        "utm_medium": payload.utm_medium,
        "utm_campaign": payload.utm_campaign,
    }
    insert_result = db.table("content_leads").insert(lead_data).execute()
    lead_id = insert_result.data[0]["id"] if insert_result.data else "unknown"
    await _capture_lead_event(
        "lead_form_submit",
        email=email,
        properties={
            "lead_id": lead_id,
            "lead_type": "content_download",
            "asset_slug": payload.asset_slug,
            "asset_format": asset.format,
            "source": payload.source,
            "utm_source": payload.utm_source,
            "utm_medium": payload.utm_medium,
            "utm_campaign": payload.utm_campaign,
            **outbound_attribution,
        },
    )

    # Best-effort email + Sequencer enrollment run after the response so the
    # caller is not blocked on slow providers (F-144). Failures are swallowed
    # and logged exactly as before.
    async def _send_download_email() -> None:
        try:
            await email_service.send_content_download(
                to_email=email,
                first_name=payload.first_name or "",
                asset_name=asset.display_name,
                download_url=download_url,
            )
        except Exception as e:
            logger.error(
                "Failed to send content download email for %s: %s",
                payload.email,
                e,
                exc_info=True,
            )

    async def _enroll_in_sequencer() -> None:
        try:
            await enroll_sequencer_sequence(
                settings,
                email=email,
                sequence_slug=_content_sequence_slug_for_source(payload.source),
                external_id=f"content:{lead_id}:nurture",
                metadata={
                    "assetSlug": payload.asset_slug,
                    "assetName": asset.display_name,
                    "source": payload.source,
                    "utmSource": payload.utm_source,
                    "utmMedium": payload.utm_medium,
                    "utmCampaign": payload.utm_campaign,
                    **outbound_attribution,
                },
            )
        except Exception as e:
            logger.error(
                "Failed to enroll content lead in Sequencer for %s: %s",
                payload.email,
                e,
                exc_info=True,
            )

    background_tasks.add_task(_send_download_email)
    background_tasks.add_task(_enroll_in_sequencer)

    return ContentLeadResponse(
        success=True,
        message="Check your email for the download link",
    )


@router.post(
    "/calculator-unlock",
    response_model=CalculatorUnlockResponse,
    status_code=status.HTTP_200_OK,
    summary="Unlock calculator financial projections",
    description=("Capture email + name for a calculator unlock. Public endpoint."),
)
async def calculator_unlock(
    payload: CalculatorUnlockRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    email_service: Annotated[EmailService, Depends(get_email_service)],
    db: Any = Depends(get_supabase_admin),
) -> CalculatorUnlockResponse:
    settings = get_settings()
    email = str(payload.email).lower()
    if payload.company_website:
        return CalculatorUnlockResponse(unlocked=True, message="Results unlocked.")
    if not await verify_turnstile(
        payload.turnstile_token,
        settings,
        remote_ip=get_client_ip(http_request),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification failed. Please try again.",
        )
    asset = get_asset(payload.slug)

    if not asset or asset.format != "calculator_unlock":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown calculator slug: {payload.slug!r}",
        )

    if not asset.enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Calculator {payload.slug!r} is not yet available.",
        )

    if await _check_suppressed(email, db):
        return CalculatorUnlockResponse(unlocked=True, message="Results unlocked.")

    await check_download_rate_limit(email, payload.slug, db)

    try:
        download_url = get_lead_magnet_url(asset.storage_path)
    except Exception as e:
        logger.error(
            "Failed to generate presigned URL for calculator companion %s: %s",
            asset.storage_path,
            e,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Calculator companion download is temporarily unavailable. "
                "Please try again shortly."
            ),
        ) from e

    insert_result = (
        db.table("content_leads")
        .insert(
            {
                "first_name": payload.first_name,
                "email": email,
                "asset_slug": payload.slug,
                "source": payload.source,
            }
        )
        .execute()
    )
    lead_id = insert_result.data[0]["id"] if insert_result.data else "unknown"
    await _capture_lead_event(
        "calculator_unlock_completed",
        email=email,
        properties={
            "lead_id": lead_id,
            "lead_type": "calculator_unlock",
            "asset_slug": payload.slug,
            "source": payload.source,
        },
    )

    # Best-effort email + Sequencer enrollment run after the response so the
    # caller is not blocked on slow providers (F-144). Failures are swallowed
    # and logged exactly as before.
    async def _send_companion_email() -> None:
        try:
            await email_service.send_content_download(
                to_email=email,
                first_name=payload.first_name,
                asset_name=asset.display_name,
                download_url=download_url,
            )
        except Exception as e:
            logger.error(
                "Failed to send calculator companion email for %s: %s",
                payload.email,
                e,
                exc_info=True,
            )

    async def _enroll_in_sequencer() -> None:
        try:
            await enroll_sequencer_sequence(
                settings,
                email=email,
                sequence_slug="capveri-nurture-value-1",
                external_id=f"calculator:{lead_id}:nurture",
                metadata={
                    "assetSlug": payload.slug,
                    "assetName": asset.display_name,
                    "source": payload.source,
                },
            )
        except Exception as e:
            logger.error(
                "Failed to enroll calculator lead in Sequencer for %s: %s",
                payload.email,
                e,
                exc_info=True,
            )

    background_tasks.add_task(_send_companion_email)
    background_tasks.add_task(_enroll_in_sequencer)

    return CalculatorUnlockResponse(unlocked=True, message="Results unlocked.")


@router.post(
    "/plg-signup",
    response_model=PlgSignupLeadResponse,
    status_code=status.HTTP_200_OK,
    summary="Capture PLG free-audit signup lead",
    description=(
        "Stores lead from the PLG onboarding email-capture step. Public endpoint."
    ),
)
async def plg_signup(
    payload: PlgSignupLeadRequest,
    http_request: Request,
    db: Any = Depends(get_supabase_admin),
) -> PlgSignupLeadResponse:
    settings = get_settings()
    email = str(payload.email).lower()
    if payload.company_website:
        return PlgSignupLeadResponse(
            success=True,
            message="Your audit results are saved — check your email.",
        )
    if not await verify_turnstile(
        payload.turnstile_token,
        settings,
        remote_ip=get_client_ip(http_request),
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verification failed. Please try again.",
        )
    if await _check_suppressed(email, db):
        return PlgSignupLeadResponse(
            success=True,
            message="Your audit results are saved — check your email.",
        )

    await check_download_rate_limit(email, PLG_FREE_AUDIT_SLUG, db)
    outbound_attribution = _outbound_attribution_properties(payload)

    lead_data = {
        "first_name": payload.first_name,
        "email": email,
        "company": payload.organization_name,
        "asset_slug": PLG_FREE_AUDIT_SLUG,
        "utm_source": payload.utm_source,
        "utm_campaign": payload.utm_campaign,
    }
    insert_result = db.table("content_leads").insert(lead_data).execute()
    lead_id = insert_result.data[0]["id"] if insert_result.data else "unknown"
    await _capture_lead_event(
        "plg_signup_lead_captured",
        email=email,
        properties={
            "lead_id": lead_id,
            "lead_type": "plg_free_audit",
            "asset_slug": PLG_FREE_AUDIT_SLUG,
            "leakage_amount_bucket": _amount_bucket(payload.leakage_amount),
            "utm_source": payload.utm_source,
            "utm_campaign": payload.utm_campaign,
            **outbound_attribution,
        },
    )
    try:
        await record_sequencer_event(
            settings,
            email=email,
            event="signup_completed",
            metadata={
                "lead_id": lead_id,
                "source": "plg_free_audit",
                "asset_slug": PLG_FREE_AUDIT_SLUG,
                "utm_source": payload.utm_source,
                "utm_campaign": payload.utm_campaign,
                **outbound_attribution,
            },
        )
    except Exception as e:
        logger.error(
            "Failed to record PLG signup event in Sequencer for %s: %s",
            payload.email,
            e,
            exc_info=True,
        )

    return PlgSignupLeadResponse(
        success=True,
        message="Your audit results are saved — check your email.",
    )


@router.post(
    "/unsubscribe",
    response_model=UnsubscribeResponse,
    status_code=status.HTTP_200_OK,
    summary="Unsubscribe from marketing emails",
    description=(
        "Verify HMAC token, suppress email, and forward suppression to Sequencer. "
        "Public endpoint."
    ),
)
async def unsubscribe(
    background_tasks: BackgroundTasks,
    e: str = Query(..., description="Base64url-encoded email"),
    t: str = Query(..., description="HMAC-SHA256 token"),
    db: Any = Depends(get_supabase_admin),
) -> UnsubscribeResponse:
    settings = get_settings()
    verified_email = verify_unsubscribe_token(e, t, settings.unsubscribe_hmac_secret)
    if not verified_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired unsubscribe link.",
        )
    email = verified_email.lower()

    db.table("email_suppressions").upsert(
        {"email": email, "reason": "user_unsubscribe"},
        on_conflict="email",
    ).execute()

    db.table("content_leads").update(
        {"unsubscribed_at": datetime.now(UTC).isoformat()}
    ).eq("email", email).is_("unsubscribed_at", "null").execute()

    # Suppression is already recorded above (the real response). Forwarding the
    # unsubscribe to the Sequencer is best-effort and runs after the response so
    # the caller is not blocked on a slow provider (F-144). Failures are
    # swallowed and logged exactly as before.
    async def _forward_unsubscribe() -> None:
        try:
            await unsubscribe_sequencer_contact(
                settings,
                email=email,
                metadata={"source": "capveri-unsubscribe-link"},
            )
        except Exception as exc:
            logger.warning(
                "Could not forward unsubscribe to Sequencer for %s: %s", email, exc
            )

    background_tasks.add_task(_forward_unsubscribe)

    return UnsubscribeResponse(
        success=True,
        message="You've been unsubscribed. You won't receive further marketing emails.",
    )
