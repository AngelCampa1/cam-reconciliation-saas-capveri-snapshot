"""Forensic JSON store for extraction pipeline replay.

Writes raw JSON dumps to Cloudflare R2 under:
    extractions/raw/{document_id}/{stage}.json

All writes are best-effort — failures emit a Sentry breadcrumb but never raise.
"""

import json
import logging
from typing import Any
from uuid import UUID

import sentry_sdk

from app.services.extraction.s3_client import StorageClient

logger = logging.getLogger(__name__)

# Stage key constants match pipeline_events.py
STAGE_EXTRACT_PRIMARY = "extract_primary"
STAGE_EXTRACT_SIBLING = "extract_sibling"
STAGE_JUDGE_INPUT = "judge_input"
STAGE_JUDGE_OUTPUT = "judge_output"
STAGE_GAP_FILLER = "gap_filler"
STAGE_VALIDATION_REPROMPT = "validation_reprompt"
STAGE_MERGED = "merged"


def write_forensic_json(
    storage_client: StorageClient,
    document_id: UUID,
    stage: str,
    data: Any,
) -> None:
    """Upload a JSON snapshot for one pipeline stage to R2.

    Key pattern: extractions/raw/{document_id}/{stage}.json

    Best-effort: logs and emits a Sentry breadcrumb on failure, never raises.
    """
    key = f"extractions/raw/{document_id}/{stage}.json"
    try:
        payload = json.dumps(data, default=str).encode("utf-8")
        storage_client.upload_document(
            key=key,
            content=payload,
            content_type="application/json",
        )
    except Exception:
        logger.warning(
            "forensic_store: failed to write %s for document %s",
            stage,
            document_id,
            exc_info=True,
        )
        sentry_sdk.add_breadcrumb(
            category="forensic_store",
            message=f"Failed to write forensic JSON stage={stage}",
            data={"document_id": str(document_id), "stage": stage, "key": key},
            level="warning",
        )
