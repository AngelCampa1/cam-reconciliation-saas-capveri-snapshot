"""
Auth support endpoints.

Provides supplemental endpoints for auth flows not handled by Supabase directly.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser
from app.config import get_settings
from app.database.client import SupabaseDB, get_supabase, get_supabase_admin
from app.models.user import User
from app.services.admin_notifications import AdminNotificationService
from app.services.email import EmailService, get_email_service
from app.services.legal_acceptance import (
    assert_current_terms_acceptance,
    record_terms_acceptance,
)
from app.services.sequencer import enroll_sequencer_sequence

logger = logging.getLogger(__name__)

router = APIRouter()

# Billing reminders live in the app only (escalating banner + read-only paywall),
# never in email — see the email-value-only product rule. The retired
# day_14_add_billing / day_24_keep_access rows were money-asks with no processor.
SIGNUP_NURTURE_SCHEDULE: tuple[tuple[str, int], ...] = (
    ("day_1_add_property", 1),
    ("day_3_upload_gl", 3),
    ("day_7_run_reconciliation", 7),
)


class WelcomeResponse(BaseModel):
    """Response for welcome email endpoint."""

    status: str


class LegalAcceptanceResponse(BaseModel):
    """Response for current terms acceptance endpoint."""

    status: str


class LegalAcceptanceRequest(BaseModel):
    """Request proving current terms acceptance."""

    accepted_terms: bool
    terms_version: str
    terms_hash: str


class DeleteAccountRequest(BaseModel):
    """Self-service account deletion request."""

    confirmation: Literal["DELETE"]


class DeleteAccountResponse(BaseModel):
    """Response for account deletion endpoint."""

    status: str


def _count_rows(db: SupabaseDB, table_name: str, column_name: str, value: str) -> int:
    result = (
        db.table(table_name)
        .select("id", count="exact")
        .eq(column_name, value)
        .limit(1)
        .execute()
    )
    return int(getattr(result, "count", None) or 0)


def _count_other_org_admins(db: SupabaseDB, organization_id: str, user_id: str) -> int:
    result = (
        db.table("users")
        .select("id", count="exact")
        .eq("organization_id", organization_id)
        .in_("role", ["owner", "admin"])
        .neq("id", user_id)
        .limit(1)
        .execute()
    )
    return int(getattr(result, "count", None) or 0)


def _assert_account_can_be_deleted(current_user: User, db: SupabaseDB) -> None:
    user_id = str(current_user.id)
    organization_id = str(current_user.organization_id)

    org_user_count = _count_rows(db, "users", "organization_id", organization_id)
    if org_user_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Add another organization user or contact support before deleting "
                "the last account in this organization."
            ),
        )

    if (
        current_user.is_admin
        and _count_other_org_admins(db, organization_id, user_id) <= 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Add another owner or admin before deleting this account so the "
                "organization keeps an administrator."
            ),
        )

    blocking_references = (
        ("tenant_users", "user_id", "tenant portal profile"),
        ("tenant_invitations", "invited_by", "tenant invitations"),
        ("team_member_invitations", "invited_by", "team invitations"),
        ("team_member_invitations", "used_by_user_id", "accepted team invitations"),
        ("audit_requests", "assigned_to", "assigned audit requests"),
        ("audit_log", "changed_by", "audit log entries"),
        ("documents", "verified_by", "document verification history"),
        ("documents", "rejected_by", "document rejection history"),
        ("reconciliation_snapshots", "finalized_by_user_id", "finalized snapshots"),
        ("column_mappings", "created_by", "column mappings"),
        ("lease_term_versions", "created_by", "lease term versions"),
        ("disputes", "assigned_to", "assigned disputes"),
        ("disputes", "resolved_by", "resolved disputes"),
        ("dispute_comments", "author_id", "dispute comments"),
        ("dispute_attachments", "uploaded_by", "dispute attachments"),
        ("gl_analysis_results", "ran_by_user_id", "GL analysis history"),
        (
            "gl_analysis_results",
            "dismissed_by_user_id",
            "dismissed GL analysis history",
        ),
        ("capex_flags", "reviewed_by_user_id", "CapEx review history"),
    )

    for table_name, column_name, label in blocking_references:
        if _count_rows(db, table_name, column_name, user_id) > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This account is linked to "
                    f"{label}. Contact support so CapVeri can preserve audit "
                    "history before deletion."
                ),
            )


@router.delete("/account", response_model=DeleteAccountResponse)
async def delete_account(
    payload: DeleteAccountRequest,
    current_user: CurrentUser,
    admin_db: Annotated[SupabaseDB, Depends(get_supabase_admin)],
) -> DeleteAccountResponse:
    """Delete the authenticated user's account when it is safe to do so."""
    _assert_account_can_be_deleted(current_user, admin_db)
    admin_db.auth.admin.delete_user(str(current_user.id))
    return DeleteAccountResponse(status="deleted")


@router.post("/welcome", response_model=WelcomeResponse)
async def send_welcome_email(
    payload: LegalAcceptanceRequest,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
    admin_db: Annotated[SupabaseDB, Depends(get_supabase_admin)],
    email_service: Annotated[EmailService, Depends(get_email_service)],
) -> WelcomeResponse:
    """
    Send signup receipt and enroll Sequencer after new organization signup.

    Called by the frontend immediately after successful Supabase signup.
    Always returns 200; email failures are logged but never break the flow.
    """
    assert_current_terms_acceptance(
        payload.accepted_terms,
        terms_version=payload.terms_version,
        terms_hash=payload.terms_hash,
    )

    try:
        record_terms_acceptance(
            admin_db,
            user_id=str(current_user.id),
            organization_id=str(current_user.organization_id),
            source="owner_signup",
        )
    except Exception as e:
        logger.warning("Could not record signup terms acceptance: %s", e)

    org_name = "your organization"
    try:
        org_result = (
            db.table("organizations")
            .select("name")
            .eq("id", str(current_user.organization_id))
            .single()
            .execute()
        )
        if org_result.data and org_result.data.get("name"):
            org_name = org_result.data["name"]
    except Exception as e:
        logger.warning("Could not fetch org name for signup email: %s", e)

    checkout_url = (
        f"{get_settings().app_base_url.rstrip('/')}"
        "/settings/billing?intent=select-plan&source=signup"
    )

    background_tasks.add_task(
        _send_signup_confirmation_safely,
        email_service,
        current_user.email,
        org_name,
        checkout_url,
    )

    _schedule_signup_nurture_safely(
        admin_db,
        user_id=str(current_user.id),
        organization_id=str(current_user.organization_id),
        email=current_user.email,
        organization_name=org_name,
    )

    try:
        settings = get_settings()
        metadata = {
            "userId": str(current_user.id),
            "organizationId": str(current_user.organization_id),
            "organizationName": org_name,
            "source": "capveri-signup",
        }
        await enroll_sequencer_sequence(
            settings,
            email=current_user.email,
            sequence_slug="capveri-fulfillment-intro",
            external_id=f"signup:{current_user.id}:fulfillment",
            metadata=metadata,
        )
        await enroll_sequencer_sequence(
            settings,
            email=current_user.email,
            sequence_slug="capveri-nurture-value-1",
            external_id=f"signup:{current_user.id}:nurture",
            metadata=metadata,
        )
        logger.info("Sequencer signup sequences enrolled for %s", current_user.email)
    except Exception as e:
        logger.warning(
            "Failed to enroll signup Sequencer sequences for %s: %s",
            current_user.email,
            e,
            exc_info=True,
        )

    background_tasks.add_task(
        _notify_admin_signup_safely,
        email_service,
        get_settings().admin_notification_email,
        current_user.email,
        current_user.full_name,
        org_name,
    )

    return WelcomeResponse(status="ok")


@router.post("/legal-acceptance/current", response_model=LegalAcceptanceResponse)
async def accept_current_terms(
    payload: LegalAcceptanceRequest,
    current_user: CurrentUser,
    admin_db: Annotated[SupabaseDB, Depends(get_supabase_admin)],
) -> LegalAcceptanceResponse:
    """Record authenticated assent to the current Terms of Service."""
    assert_current_terms_acceptance(
        payload.accepted_terms,
        terms_version=payload.terms_version,
        terms_hash=payload.terms_hash,
    )
    record_terms_acceptance(
        admin_db,
        user_id=str(current_user.id),
        organization_id=str(current_user.organization_id),
        source="authenticated_legal_gate",
    )
    return LegalAcceptanceResponse(status="accepted")


def _schedule_signup_nurture_safely(
    db: SupabaseDB,
    user_id: str,
    organization_id: str,
    email: str,
    organization_name: str,
) -> None:
    """Create app-owned signup nurture events without blocking signup."""
    now = datetime.now(UTC)
    rows = [
        {
            "organization_id": organization_id,
            "user_id": user_id,
            "email": email,
            "organization_name": organization_name,
            "email_type": email_type,
            "status": "pending",
            "scheduled_at": (now + timedelta(days=days)).isoformat(),
        }
        for email_type, days in SIGNUP_NURTURE_SCHEDULE
    ]

    try:
        db.table("signup_email_events").upsert(
            rows,
            on_conflict="user_id,email_type",
            ignore_duplicates=True,
        ).execute()
        logger.info("Signup nurture schedule ensured for %s", email)
    except Exception as e:
        logger.warning(
            "Failed to create signup nurture schedule for %s: %s",
            email,
            e,
            exc_info=True,
        )


async def _send_signup_confirmation_safely(
    email_service: EmailService,
    to_email: str,
    organization_name: str,
    checkout_url: str,
) -> None:
    try:
        await email_service.send_signup_confirmation_email(
            to_email=to_email,
            organization_name=organization_name,
            checkout_url=checkout_url,
        )
        logger.info("Signup confirmation email queued for %s", to_email)
    except Exception as e:
        logger.warning(
            "Failed to send signup confirmation email to %s: %s",
            to_email,
            e,
        )


async def _notify_admin_signup_safely(
    email_service: EmailService,
    admin_email: str,
    user_email: str,
    user_name: str | None,
    org_name: str,
) -> None:
    try:
        admin_svc = AdminNotificationService(email_service, admin_email)
        await admin_svc.notify_onboarding_complete(
            user_email=user_email,
            user_name=user_name,
            org_name=org_name,
        )
    except Exception as e:
        logger.warning("Admin onboarding notification failed: %s", e, exc_info=True)
