"""Shared extraction processing pipeline used by worker tasks."""

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID

import sentry_sdk
from pydantic import ValidationError

from app.config import settings
from app.database.client import SupabaseDB
from app.models.document import Document
from app.models.enums import DocumentStatus
from app.models.ocr_result import OCRResultCreate
from app.services.extraction.dual.dual_orchestrator import DualExtractOrchestrator
from app.services.extraction.extraction_models import LeaseExtractionResult
from app.services.extraction.forensic_store import (
    STAGE_EXTRACT_PRIMARY,
    STAGE_EXTRACT_SIBLING,
    STAGE_GAP_FILLER,
    STAGE_JUDGE_INPUT,
    STAGE_JUDGE_OUTPUT,
    STAGE_MERGED,
    STAGE_VALIDATION_REPROMPT,
    write_forensic_json,
)
from app.services.extraction.gap_filler import fill_fields, get_missing_critical_fields
from app.services.extraction.json_utils import coerce_llm_output
from app.services.extraction.openrouter_client import OpenRouterClient
from app.services.extraction.pipeline_events import (
    OUTCOME_FAILED,
    OUTCOME_SUCCESS,
)
from app.services.extraction.pipeline_events import (
    STAGE_EXTRACT_PRIMARY as EVT_EXTRACT_PRIMARY,
)
from app.services.extraction.pipeline_events import (
    STAGE_EXTRACT_SIBLING as EVT_EXTRACT_SIBLING,
)
from app.services.extraction.pipeline_events import STAGE_GAP_FILLER as EVT_GAP_FILLER
from app.services.extraction.pipeline_events import STAGE_JUDGE as EVT_JUDGE
from app.services.extraction.pipeline_events import STAGE_MERGE as EVT_MERGE
from app.services.extraction.pipeline_events import (
    STAGE_VALIDATION_REPROMPT as EVT_VALIDATION_REPROMPT,
)
from app.services.extraction.pipeline_events import (
    emit_pipeline_event,
)
from app.services.extraction.s3_client import StorageClient, get_storage_client
from app.services.extraction.validation_reprompt import reprompt_invalid_fields

logger = logging.getLogger(__name__)


class ExtractionProcessorError(Exception):
    """Raised when the extraction pipeline fails."""


def _build_reader_job_id(document_id: UUID) -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"dual-extract:{document_id}:{timestamp}"


def _persist_reader_artifacts(
    document_id: UUID,
    document: Document,
    result: LeaseExtractionResult,
    reader_job_id: str,
    supabase_admin: SupabaseDB,
) -> None:
    # Replace prior page artifacts so retries do not accumulate duplicate OCR rows.
    supabase_admin.table("ocr_results").delete().eq(
        "document_id", str(document_id)
    ).execute()

    page_map: dict[int, dict[str, Any]] = {}
    for extraction in result.extractions:
        page_number = extraction.page or 1
        page_payload = page_map.setdefault(
            page_number,
            {
                "text_blocks": [],
                "tables": [],
                "key_value_pairs": [],
                "full_text_parts": [],
            },
        )
        page_payload["text_blocks"].append(
            {
                "text": extraction.source_text,
                "block_type": "SOURCE_TEXT",
                "confidence": extraction.confidence,
                "bounding_box": extraction.bounding_box,
            }
        )
        page_payload["key_value_pairs"].append(
            {
                "key": extraction.field,
                "value": extraction.value,
                "confidence": extraction.confidence,
            }
        )
        page_payload["full_text_parts"].append(extraction.source_text)

    if not page_map:
        page_map[1] = {
            "text_blocks": [],
            "tables": [],
            "key_value_pairs": [],
            "full_text_parts": [],
        }

    for page_number, page_payload in page_map.items():
        ocr_data = OCRResultCreate(
            document_id=document_id,
            organization_id=document.organization_id,
            page_number=page_number,
            text_blocks=page_payload["text_blocks"],
            tables=page_payload["tables"],
            key_value_pairs=page_payload["key_value_pairs"],
            full_text="\n".join(page_payload["full_text_parts"]),
            reader_job_id=reader_job_id,
            extracted_at=datetime.now(UTC),
        )
        supabase_admin.table("ocr_results").insert(
            ocr_data.model_dump(mode="json")
        ).execute()


def _build_extraction_payload(
    result: LeaseExtractionResult,
    tokens_used: int,
    reader_job_id: str,
    primary_model: str,
    sibling_model: str,
) -> dict[str, Any]:
    raw_data = result.model_dump(mode="json")
    profile_data = {k: v for k, v in raw_data.items() if k != "extractions"}
    confidence_scores = {
        extraction.field: extraction.confidence / 100.0
        for extraction in result.extractions
    }
    source_references = []
    for extraction in result.extractions:
        ref: dict[str, Any] = {
            "field": extraction.field,
            "value": extraction.value,
            "text": extraction.source_text,
            "source_text": extraction.source_text,
            "confidence": extraction.confidence / 100.0,
            "page": extraction.page,
            "boundingBox": extraction.bounding_box,
        }
        source_references.append(ref)

    return {
        "profile": profile_data,
        "confidence_scores": confidence_scores,
        "source_references": source_references,
        "_meta": {
            "pipeline": "dual-extract",
            "provider": "openrouter",
            "primary_model": primary_model,
            "sibling_model": sibling_model,
            "reader_job_id": reader_job_id,
            "tokens_used": tokens_used,
        },
    }


def run_document_extraction(
    document_id: UUID,
    supabase_admin: SupabaseDB,
    storage_client: StorageClient | None = None,
    document_reader_client: OpenRouterClient | None = None,
) -> tuple[dict[str, Any], int]:
    """Run PDF extraction for one document and persist outputs.

    Uses the dual-extract + judge pipeline:
      1. Download PDF bytes from R2
      2. Run primary and sibling extractors in parallel
      3. Judge every per-field disagreement
      4. Merge using judge verdicts
      5. Gap-fill any missing critical fields
      6. Persist: OCR results, extraction_result, forensic R2 JSONs, pipeline events
    """
    storage = storage_client or get_storage_client()
    reader = document_reader_client or OpenRouterClient()
    pipeline_start = time.monotonic()
    logger.info("Extraction pipeline started", extra={"document_id": str(document_id)})
    sentry_sdk.set_context("extraction", {"document_id": str(document_id)})

    try:
        doc_response = (
            supabase_admin.table("documents")
            .select("*")
            .eq("id", str(document_id))
            .maybe_single()
            .execute()
        )
        if not doc_response or not doc_response.data:
            raise ExtractionProcessorError(f"Document not found: {document_id}")

        raw_document = cast(dict[str, Any], doc_response.data)
        storage_bucket = raw_document.get("storage_bucket") or raw_document.get(
            "s3_bucket"
        )
        storage_key = raw_document.get("storage_key") or raw_document.get("s3_key")
        if not storage_bucket or not storage_key:
            raise ExtractionProcessorError(
                "Document missing object storage location information"
            )

        document = Document.model_validate(raw_document)
        organization_id = document.organization_id
        logger.info(
            "Document loaded",
            extra={
                "document_id": str(document_id),
                "storage_bucket": document.storage_bucket,
                "storage_key": document.storage_key,
                "organization_id": str(organization_id),
            },
        )
        supabase_admin.table("documents").update(
            {
                "status": DocumentStatus.PROCESSING.value,
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("id", str(document_id)).execute()

        reader_job_id = _build_reader_job_id(document_id)
        pdf_start = time.monotonic()
        pdf_bytes = storage.get_document_bytes(document.storage_key)
        logger.info(
            "Document downloaded from object storage",
            extra={
                "document_id": str(document_id),
                "downloaded_bytes": len(pdf_bytes),
                "download_seconds": round(time.monotonic() - pdf_start, 2),
            },
        )

        # ------------------------------------------------------------------
        # Dual-extract + judge
        # ------------------------------------------------------------------
        orchestrator = DualExtractOrchestrator(reader=reader)
        dual_start = time.monotonic()
        dual_result, merged_json = asyncio.run(
            orchestrator.extract_lease(pdf_bytes, document.filename)
        )
        dual_elapsed_ms = int((time.monotonic() - dual_start) * 1000)

        # Persist per-stage forensic snapshots (best-effort)
        write_forensic_json(
            storage, document_id, STAGE_EXTRACT_PRIMARY, dual_result.primary_json
        )
        write_forensic_json(
            storage, document_id, STAGE_EXTRACT_SIBLING, dual_result.sibling_json
        )
        write_forensic_json(
            storage,
            document_id,
            STAGE_JUDGE_INPUT,
            {
                "primary_json": {
                    k: v
                    for k, v in dual_result.primary_json.items()
                    if k != "extractions"
                },
                "sibling_json": {
                    k: v
                    for k, v in dual_result.sibling_json.items()
                    if k != "extractions"
                },
            },
        )
        write_forensic_json(storage, document_id, STAGE_JUDGE_OUTPUT, merged_json)

        # Emit per-stage pipeline events (best-effort)
        emit_pipeline_event(
            supabase_admin,
            document_id,
            organization_id,
            EVT_EXTRACT_PRIMARY,
            model=dual_result.primary_model,
            tokens_used=dual_result.primary_tokens,
            duration_ms=dual_result.primary_duration_ms,
            outcome=OUTCOME_FAILED if dual_result.primary_failed else OUTCOME_SUCCESS,
        )
        emit_pipeline_event(
            supabase_admin,
            document_id,
            organization_id,
            EVT_EXTRACT_SIBLING,
            model=dual_result.sibling_model,
            tokens_used=dual_result.sibling_tokens,
            duration_ms=dual_result.sibling_duration_ms,
            outcome=OUTCOME_FAILED if dual_result.sibling_failed else OUTCOME_SUCCESS,
        )
        emit_pipeline_event(
            supabase_admin,
            document_id,
            organization_id,
            EVT_JUDGE,
            model=dual_result.judge_model,
            tokens_used=dual_result.judge_tokens,
            duration_ms=dual_result.judge_duration_ms,
            outcome=OUTCOME_SUCCESS,
        )
        emit_pipeline_event(
            supabase_admin,
            document_id,
            organization_id,
            EVT_MERGE,
            model="",
            tokens_used=0,
            duration_ms=dual_elapsed_ms,
            outcome=OUTCOME_SUCCESS,
        )

        # ------------------------------------------------------------------
        # Gap-fill missing critical fields
        # ------------------------------------------------------------------
        missing = get_missing_critical_fields(merged_json)
        gap_tokens = 0
        if missing:
            logger.info(
                "gap_filler: filling %d missing fields for %s: %s",
                len(missing),
                document_id,
                missing,
            )
            gap_start = time.monotonic()
            merged_json, gap_tokens = asyncio.run(
                fill_fields(reader, pdf_bytes, document.filename, missing, merged_json)
            )
            gap_elapsed_ms = int((time.monotonic() - gap_start) * 1000)
            write_forensic_json(storage, document_id, STAGE_GAP_FILLER, merged_json)
            emit_pipeline_event(
                supabase_admin,
                document_id,
                organization_id,
                EVT_GAP_FILLER,
                model=f"gap-fill:{','.join(missing)}",
                tokens_used=gap_tokens,
                duration_ms=gap_elapsed_ms,
                outcome=OUTCOME_SUCCESS,
            )

        # ------------------------------------------------------------------
        # Validation reflexion: reconcile inconsistent fields via re-prompt
        # ------------------------------------------------------------------
        reprompt_start = time.monotonic()
        merged_json, reprompt_tokens = asyncio.run(
            reprompt_invalid_fields(reader, pdf_bytes, document.filename, merged_json)
        )
        if reprompt_tokens > 0:
            reprompt_elapsed_ms = int((time.monotonic() - reprompt_start) * 1000)
            write_forensic_json(
                storage, document_id, STAGE_VALIDATION_REPROMPT, merged_json
            )
            emit_pipeline_event(
                supabase_admin,
                document_id,
                organization_id,
                EVT_VALIDATION_REPROMPT,
                model=settings.validation_reprompt_model,
                tokens_used=reprompt_tokens,
                duration_ms=reprompt_elapsed_ms,
                outcome=OUTCOME_SUCCESS,
            )

        # Final merged snapshot
        write_forensic_json(storage, document_id, STAGE_MERGED, merged_json)

        # ------------------------------------------------------------------
        # Validate merged JSON against LeaseExtractionResult schema
        # ------------------------------------------------------------------
        try:
            coerce_llm_output(merged_json)
            extraction_result = LeaseExtractionResult.model_validate(merged_json)
        except (ValueError, ValidationError) as e:
            raise ExtractionProcessorError(
                f"Dual extraction returned invalid payload: {e}"
            ) from e

        total_tokens = (
            dual_result.primary_tokens
            + dual_result.sibling_tokens
            + dual_result.judge_tokens
            + gap_tokens
            + reprompt_tokens
        )

        # ------------------------------------------------------------------
        # Persist OCR artifacts + update documents table
        # ------------------------------------------------------------------
        _persist_reader_artifacts(
            document_id=document_id,
            document=document,
            result=extraction_result,
            reader_job_id=reader_job_id,
            supabase_admin=supabase_admin,
        )
        extraction_data = _build_extraction_payload(
            result=extraction_result,
            tokens_used=total_tokens,
            reader_job_id=reader_job_id,
            primary_model=dual_result.primary_model,
            sibling_model=dual_result.sibling_model,
        )
        supabase_admin.table("documents").update(
            cast(
                dict[str, Any],
                {
                    "status": DocumentStatus.READY_FOR_REVIEW.value,
                    "reader_job_id": reader_job_id,
                    "extraction_result": extraction_data,
                    "processed_at": datetime.now(UTC).isoformat(),
                    "updated_at": datetime.now(UTC).isoformat(),
                },
            )
        ).eq("id", str(document_id)).execute()

        total_elapsed = round(time.monotonic() - pipeline_start, 2)
        logger.info(
            "Extraction pipeline completed",
            extra={
                "document_id": str(document_id),
                "fields_extracted": len(extraction_result.extractions),
                "total_pipeline_seconds": total_elapsed,
                "total_tokens": total_tokens,
                "primary_model": dual_result.primary_model,
                "sibling_model": dual_result.sibling_model,
                "primary_failed": dual_result.primary_failed,
                "sibling_failed": dual_result.sibling_failed,
            },
        )
        return extraction_data, total_tokens
    except Exception:
        logger.error(
            "Extraction pipeline failed",
            extra={"document_id": str(document_id)},
            exc_info=True,
        )
        raise
