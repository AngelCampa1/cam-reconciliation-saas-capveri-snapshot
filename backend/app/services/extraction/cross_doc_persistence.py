"""
Persistence functions for cross-document analysis results.

All functions are async-compatible thin wrappers over the Supabase client
(which uses synchronous PostgREST calls under the hood).
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from pydantic import ValidationError

from app.database.client import SupabaseDB
from app.services.extraction.cross_doc_models import (
    CrossDocAnalysisResult,
    CrossDocFinding,
    TermOverrideSuggestion,
)

logger = logging.getLogger(__name__)


async def save_analysis(
    db: SupabaseDB,
    result: CrossDocAnalysisResult,
    org_id: UUID,
) -> str:
    """Insert a new cross_doc_analyses row and return its id.

    Args:
        db: Supabase client.
        result: Validated CrossDocAnalysisResult from Claude.
        org_id: Organization UUID (for RLS).

    Returns:
        UUID string of the newly created row.
    """
    # NOTE: The `findings` column stores the full CrossDocAnalysisResult dump (not
    # just the findings list. Accessors use `findings_blob.get("findings", [])` to
    # reach the inner list. This naming reflects the DB column and is intentional.
    row = {
        "organization_id": str(org_id),
        "property_id": str(result.property_id),
        "period_year": result.period_year,
        "status": "pending",
        "findings": result.model_dump(mode="json"),
        "finding_decisions": {},
        "token_usage": result.token_usage,
    }
    resp = db.table("cross_doc_analyses").insert(row).execute()
    created = resp.data[0] if resp.data else {}
    return str(created.get("id", ""))


async def update_finding_decision(
    db: SupabaseDB,
    analysis_id: UUID,
    finding_id: str,
    decision: str,
    reason: str,
    org_id: UUID | None = None,
    user_id: str | None = None,
) -> None:
    """Record accept/dismiss/deferred decision for a single finding.

    Uses an atomic Postgres RPC (merge_finding_decision) to merge the decision
    into the finding_decisions JSONB column, avoiding read-modify-write races.

    Args:
        db: Supabase client.
        analysis_id: UUID of the cross_doc_analyses row.
        finding_id: UUID string of the finding (CrossDocFinding.id).
        decision: One of "accepted", "dismissed", "deferred".
        reason: Human-readable reason for the decision.
        org_id: Organization UUID for explicit org-scoping on DB writes.
        user_id: ID of the user making the decision (for audit trail).
    """
    decision_record: dict[str, Any] = {
        "decision": decision,
        "reason": reason,
        "user_id": user_id,
        "decided_at": datetime.now(UTC).isoformat(),
    }
    rpc_resp = db.rpc(
        "merge_finding_decision",
        {
            "p_analysis_id": str(analysis_id),
            "p_org_id": str(org_id) if org_id is not None else None,
            "p_finding_id": finding_id,
            "p_decision": decision_record,
        },
    ).execute()
    merged_decisions: dict[str, Any] = rpc_resp.data or {}
    if not merged_decisions:
        logger.warning(
            "update_finding_decision: merge_finding_decision RPC returned empty "
            "for analysis %s (org_id=%s); row may not exist",
            analysis_id,
            org_id,
        )
        return

    # If every finding (regardless of severity) has a decision, advance to reviewed
    _maybe_advance_status(db, analysis_id, merged_decisions, org_id=org_id)


def _maybe_advance_status(
    db: SupabaseDB,
    analysis_id: UUID,
    decisions: dict[str, Any],
    org_id: UUID | None = None,
) -> None:
    """Advance status: pending→in_review on first decision, →reviewed when all done."""
    status_q = (
        db.table("cross_doc_analyses")
        .select("findings, status")
        .eq("id", str(analysis_id))
    )
    if org_id is not None:
        status_q = status_q.eq("organization_id", str(org_id))
    analysis_resp = status_q.maybe_single().execute()
    data: dict[str, Any] = (analysis_resp.data if analysis_resp else None) or {}
    current_status = data.get("status")
    if current_status == "reviewed":
        return

    findings_raw = data.get("findings")
    if not isinstance(findings_raw, dict):
        logger.error(
            "_maybe_advance_status: malformed findings blob for analysis %s "
            "(expected dict, got %s); status not advanced",
            analysis_id,
            type(findings_raw).__name__,
        )
        # Do NOT raise here: the finding decision has already been persisted by
        # the atomic RPC above. Raising would bubble a 500 to the caller even
        # though the write succeeded. Status stays at its current value and the
        # data integrity issue must be investigated separately.
        findings_raw = {}
    findings_list: list[dict[str, Any]] = findings_raw.get("findings", [])

    # No findings to review — leave status unchanged rather than entering in_review
    if not findings_list:
        return

    # If every finding is decided, advance directly to reviewed (skip in_review write)
    all_decided = all(
        bool(f.get("id")) and str(f["id"]) in decisions for f in findings_list
    )
    if all_decided:
        reviewed_q = (
            db.table("cross_doc_analyses")
            .update({"status": "reviewed"})
            .eq("id", str(analysis_id))
        )
        if org_id is not None:
            reviewed_q = reviewed_q.eq("organization_id", str(org_id))
        reviewed_q.execute()
        return

    # First decision made → move to in_review
    if decisions and current_status == "pending":
        in_review_q = (
            db.table("cross_doc_analyses")
            .update({"status": "in_review"})
            .eq("id", str(analysis_id))
        )
        if org_id is not None:
            in_review_q = in_review_q.eq("organization_id", str(org_id))
        in_review_q.execute()


async def get_accepted_overrides(
    db: SupabaseDB,
    property_id: UUID,
    period_year: int,
    org_id: UUID,
) -> list[TermOverrideSuggestion]:
    """Return accepted TermOverrideSuggestions for a property/period.

    Collects accepted term overrides from two sources:
    1. findings[].override_suggestion where the finding decision is "accepted"
    2. top-level lease_term_overrides entries whose finding_id is accepted

    Args:
        db: Supabase client.
        property_id: UUID of the property.
        period_year: Fiscal year.
        org_id: Organization UUID (for multi-tenant scoping).

    Returns:
        List of accepted TermOverrideSuggestion objects.
    """
    resp = (
        db.table("cross_doc_analyses")
        .select("findings, finding_decisions")
        .eq("property_id", str(property_id))
        .eq("period_year", period_year)
        .eq("organization_id", str(org_id))
        .execute()
    )
    rows: list[dict[str, Any]] = resp.data or []

    overrides: list[TermOverrideSuggestion] = []
    for row in rows:
        findings_blob: dict[str, Any] = row.get("findings") or {}
        findings_list: list[dict[str, Any]] = findings_blob.get("findings", [])
        decisions: dict[str, Any] = row.get("finding_decisions") or {}
        overrides_list: list[dict[str, Any]] = findings_blob.get(
            "lease_term_overrides", []
        )

        for finding in findings_list:
            finding_id = str(finding.get("id", ""))
            decision_rec = decisions.get(finding_id, {})
            if decision_rec.get("decision") != "accepted":
                continue
            override_raw = finding.get("override_suggestion")
            if override_raw:
                try:
                    overrides.append(
                        TermOverrideSuggestion.model_validate(override_raw)
                    )
                except (ValidationError, ValueError, TypeError):
                    logger.warning(
                        "Failed to parse override_suggestion for finding %s",
                        finding_id,
                        exc_info=True,
                    )

        # Also collect top-level lease_term_overrides that are accepted
        for override_raw in overrides_list:
            finding_ref = str(override_raw.get("finding_id", ""))
            if not finding_ref:
                logger.warning(
                    "Top-level lease_term_override missing finding_id; "
                    "skipping. Override: %s",
                    override_raw,
                )
                continue
            decision_rec = decisions.get(finding_ref, {})
            if decision_rec.get("decision") == "accepted":
                try:
                    overrides.append(
                        TermOverrideSuggestion.model_validate(override_raw)
                    )
                except (ValidationError, ValueError, TypeError):
                    logger.warning(
                        "Failed to parse top-level override for finding_ref %s",
                        finding_ref,
                        exc_info=True,
                    )

    return overrides


async def get_accepted_advisories(
    db: SupabaseDB,
    property_id: UUID,
    period_year: int,
    org_id: UUID,
) -> list[CrossDocFinding]:
    """Return accepted advisory findings (non-override findings) for property/period.

    These are injected as trace annotations in the reconciliation engine.

    Args:
        db: Supabase client.
        property_id: UUID of the property.
        period_year: Fiscal year.
        org_id: Organization UUID (for multi-tenant scoping).

    Returns:
        List of accepted CrossDocFinding objects that have no override_suggestion.
    """
    resp = (
        db.table("cross_doc_analyses")
        .select("findings, finding_decisions")
        .eq("property_id", str(property_id))
        .eq("period_year", period_year)
        .eq("organization_id", str(org_id))
        .execute()
    )
    rows: list[dict[str, Any]] = resp.data or []

    advisories: list[CrossDocFinding] = []
    for row in rows:
        findings_blob: dict[str, Any] = row.get("findings") or {}
        findings_list: list[dict[str, Any]] = findings_blob.get("findings", [])
        decisions: dict[str, Any] = row.get("finding_decisions") or {}

        for finding in findings_list:
            finding_id = str(finding.get("id", ""))
            decision_rec = decisions.get(finding_id, {})
            if decision_rec.get("decision") != "accepted":
                continue
            # Advisory = finding without an override_suggestion
            if finding.get("override_suggestion"):
                continue
            try:
                advisories.append(CrossDocFinding.model_validate(finding))
            except (ValidationError, ValueError, TypeError):
                logger.warning(
                    "Failed to parse finding %s as CrossDocFinding",
                    finding_id,
                    exc_info=True,
                )

    return advisories
