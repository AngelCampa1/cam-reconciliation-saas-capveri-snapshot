"""Structured pipeline event emitter.

Writes one row per extraction stage to audit_pipeline_events.
All writes are best-effort — failures emit a Sentry breadcrumb but never raise.
"""

import logging
from typing import Any
from uuid import UUID

import sentry_sdk

logger = logging.getLogger(__name__)

# Valid stage names
STAGE_EXTRACT_PRIMARY = "extract_primary"
STAGE_EXTRACT_SIBLING = "extract_sibling"
STAGE_JUDGE = "judge"
STAGE_MERGE = "merge"
STAGE_GAP_FILLER = "gap_filler"
STAGE_VALIDATION_REPROMPT = "validation_reprompt"

# Valid outcome names
OUTCOME_SUCCESS = "success"
OUTCOME_FAILED = "failed"


def emit_pipeline_event(
    supabase_admin: Any,
    document_id: UUID,
    organization_id: UUID,
    stage: str,
    model: str,
    tokens_used: int,
    duration_ms: int,
    outcome: str,
    attempt_number: int = 1,
    error: str | None = None,
) -> None:
    """Insert one pipeline event row into audit_pipeline_events.

    Best-effort: logs and emits a Sentry breadcrumb on failure, never raises.
    """
    try:
        row: dict[str, Any] = {
            "document_id": str(document_id),
            "organization_id": str(organization_id),
            "stage": stage,
            "model": model,
            "tokens_used": tokens_used,
            "duration_ms": duration_ms,
            "outcome": outcome,
            "attempt_number": attempt_number,
        }
        if error is not None:
            row["error"] = error[:2000]  # Guard against huge error strings
        supabase_admin.table("audit_pipeline_events").insert(row).execute()
    except Exception:
        logger.warning(
            "pipeline_events: failed to write event for %s/%s",
            document_id,
            stage,
            exc_info=True,
        )
        sentry_sdk.add_breadcrumb(
            category="pipeline_events",
            message=f"Failed to write pipeline event stage={stage}",
            data={"document_id": str(document_id), "stage": stage},
            level="warning",
        )
