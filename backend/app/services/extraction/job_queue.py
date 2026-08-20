"""Extraction job queue infrastructure for async lease processing."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID

import httpx
import sentry_sdk
from openai import APIConnectionError, APITimeoutError, RateLimitError
from pydantic import BaseModel, Field

from app.celery_app import celery_app
from app.database.client import get_supabase_admin
from app.exceptions.handlers import ServiceUnavailableError
from app.models.enums import ExtractionJobPriority, ExtractionJobStatus
from app.services.analytics.posthog import capture_backend_event_sync
from app.services.extraction.processor import (
    ExtractionProcessorError,
    run_document_extraction,
)
from app.services.extraction.s3_client import StorageError

logger = logging.getLogger(__name__)


class ExtractionJob(BaseModel):
    """Extraction job for tracking async lease processing."""

    id: UUID = Field(description="Generated extraction job ID")
    document_id: UUID = Field(description="Document being processed")
    organization_id: UUID = Field(description="Organization owning the document")
    status: ExtractionJobStatus = Field(
        default=ExtractionJobStatus.PENDING,
        description="Current job status",
    )
    priority: ExtractionJobPriority = Field(
        default=ExtractionJobPriority.NORMAL,
        description="Job priority (higher = more urgent)",
    )
    retry_count: int = Field(default=0, ge=0, le=3)
    error_message: str | None = None
    result_data: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    next_retry_at: datetime | None = None

    @property
    def is_terminal(self) -> bool:
        return self.status in (
            ExtractionJobStatus.COMPLETED,
            ExtractionJobStatus.FAILED,
        )

    @property
    def can_retry(self) -> bool:
        return self.status == ExtractionJobStatus.FAILED and self.retry_count < 3

    @property
    def processing_duration(self) -> timedelta | None:
        if self.started_at and self.completed_at:
            return self.completed_at - self.started_at
        return None


class ExtractionJobCreate(BaseModel):
    document_id: UUID
    organization_id: UUID
    priority: ExtractionJobPriority = ExtractionJobPriority.NORMAL


class ExtractionJobUpdate(BaseModel):
    status: ExtractionJobStatus | None = None
    error_message: str | None = None
    result_data: dict[str, Any] | None = None
    retry_count: int | None = None
    next_retry_at: datetime | None = None


class ExtractionJobSummary(BaseModel):
    id: UUID
    document_id: UUID
    status: ExtractionJobStatus
    priority: ExtractionJobPriority
    retry_count: int
    created_at: datetime
    completed_at: datetime | None
    error_message: str | None


TRANSIENT_EXCEPTIONS = (
    RateLimitError,
    APITimeoutError,
    APIConnectionError,
    StorageError,
    ServiceUnavailableError,
    httpx.HTTPError,
)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.services.extraction.process_extraction_task",
)
def process_extraction_task(self: Any, job_id: str, priority: int = 5) -> dict:
    """Run extraction pipeline in background worker."""
    extraction_job_id = UUID(job_id)
    client = get_supabase_admin()
    job = get_extraction_job_sync(extraction_job_id)
    if job is None:
        job = get_extraction_job_by_document_id_sync(extraction_job_id)
    if job is None:
        raise ExtractionProcessorError(f"Extraction job not found: {job_id}")
    extraction_job_id = job.id
    document_id = str(job.document_id)
    update_extraction_job_sync(
        extraction_job_id,
        ExtractionJobUpdate(status=ExtractionJobStatus.PROCESSING),
    )
    logger.info(
        "Extraction task started",
        extra={
            "document_id": document_id,
            "priority": priority,
            "celery_task_id": self.request.id,
        },
    )
    capture_backend_event_sync(
        "lease_extraction_job_started",
        organization_id=str(job.organization_id),
        distinct_id=f"org:{job.organization_id}",
        properties={
            "document_id": document_id,
            "priority": priority,
            "celery_task_id": self.request.id,
            "retry_count": int(getattr(self.request, "retries", 0)),
        },
    )
    sentry_sdk.set_context(
        "extraction_job",
        {
            "document_id": document_id,
            "priority": priority,
            "celery_task_id": self.request.id,
        },
    )
    try:
        extraction_data, tokens_used = run_document_extraction(job.document_id, client)
        update_extraction_job_sync(
            extraction_job_id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.COMPLETED,
                result_data={
                    "tokens_used": tokens_used,
                    "fields": list(extraction_data.get("profile", {}).keys()),
                },
            ),
        )
        logger.info(
            "Extraction task completed",
            extra={"document_id": document_id, "tokens_used": tokens_used},
        )
        capture_backend_event_sync(
            "lease_extraction_job_completed",
            organization_id=str(job.organization_id),
            distinct_id=f"org:{job.organization_id}",
            properties={
                "document_id": document_id,
                "tokens_used": tokens_used,
                "field_count": len(extraction_data.get("profile", {})),
            },
        )
        return {"document_id": document_id, "status": "completed"}
    except TRANSIENT_EXCEPTIONS as exc:
        retries = int(getattr(self.request, "retries", 0))
        if retries >= self.max_retries:
            mark_document_extraction_failed_sync(document_id, str(exc))
            update_extraction_job_sync(
                extraction_job_id,
                ExtractionJobUpdate(
                    status=ExtractionJobStatus.FAILED,
                    error_message=str(exc),
                ),
            )
            capture_backend_event_sync(
                "lease_extraction_job_failed",
                organization_id=str(job.organization_id),
                distinct_id=f"org:{job.organization_id}",
                properties={
                    "document_id": document_id,
                    "error_type": exc.__class__.__name__,
                    "retry_count": int(getattr(self.request, "retries", 0)),
                },
            )
            raise
        delay_seconds = 60 * (2**retries)
        update_extraction_job_sync(
            extraction_job_id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.RETRYING,
                retry_count=retries + 1,
                next_retry_at=datetime.now(UTC) + timedelta(seconds=delay_seconds),
                error_message=str(exc),
            ),
        )
        logger.warning(
            "Extraction task transient failure, scheduling retry",
            extra={
                "document_id": document_id,
                "error": str(exc),
                "retry_count": retries,
                "max_retries": self.max_retries,
                "delay_seconds": delay_seconds,
            },
        )
        capture_backend_event_sync(
            "lease_extraction_job_retrying",
            organization_id=str(job.organization_id),
            distinct_id=f"org:{job.organization_id}",
            properties={
                "document_id": document_id,
                "error_type": exc.__class__.__name__,
                "retry_count": retries,
                "delay_seconds": delay_seconds,
            },
        )
        raise self.retry(exc=exc, countdown=delay_seconds)
    except (ExtractionProcessorError, Exception) as exc:
        logger.error(
            "Extraction task failed permanently",
            extra={"document_id": document_id, "error": str(exc)},
            exc_info=True,
        )
        sentry_sdk.capture_exception(exc)
        mark_document_extraction_failed_sync(document_id, str(exc))
        update_extraction_job_sync(
            extraction_job_id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.FAILED,
                error_message=str(exc),
            ),
        )
        capture_backend_event_sync(
            "lease_extraction_job_failed",
            organization_id=str(job.organization_id),
            distinct_id=f"org:{job.organization_id}",
            properties={
                "document_id": document_id,
                "error_type": exc.__class__.__name__,
                "retry_count": int(getattr(self.request, "retries", 0)),
            },
        )
        raise


def get_extraction_job_sync(job_id: UUID) -> ExtractionJob | None:
    """Synchronous helper for Celery task context."""
    client = get_supabase_admin()
    result = (
        client.table("extraction_jobs")
        .select("*")
        .eq("id", str(job_id))
        .maybe_single()
        .execute()
    )
    if result and result.data:
        return ExtractionJob(**cast(dict[str, Any], result.data))
    return None


def get_extraction_job_by_document_id_sync(document_id: UUID) -> ExtractionJob | None:
    """Fallback for queued tasks created before the task argument switched to job ID."""
    client = get_supabase_admin()
    result = (
        client.table("extraction_jobs")
        .select("*")
        .eq("document_id", str(document_id))
        .order("created_at", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if result and result.data:
        return ExtractionJob(**cast(dict[str, Any], result.data))
    return None


def mark_document_extraction_failed_sync(document_id: str, error_message: str) -> None:
    """Keep user-facing document status in sync with terminal job failures."""
    client = get_supabase_admin()
    client.table("documents").update(
        {
            "status": "failed",
            "error_message": error_message,
            "updated_at": datetime.now(UTC).isoformat(),
        }
    ).eq("id", document_id).execute()


def update_extraction_job_sync(
    job_id: UUID, update: ExtractionJobUpdate
) -> ExtractionJob | None:
    """Synchronous helper for Celery task context."""
    client = get_supabase_admin()
    update_fields = update.model_dump(exclude_none=True)
    if (
        update.status == ExtractionJobStatus.PROCESSING
        and "started_at" not in update_fields
    ):
        update_fields["started_at"] = datetime.now(UTC).isoformat()
    elif (
        update.status in (ExtractionJobStatus.COMPLETED, ExtractionJobStatus.FAILED)
        and "completed_at" not in update_fields
    ):
        update_fields["completed_at"] = datetime.now(UTC).isoformat()
    if "status" in update_fields and isinstance(
        update_fields["status"], ExtractionJobStatus
    ):
        update_fields["status"] = update_fields["status"].value
    result = (
        client.table("extraction_jobs")
        .update(update_fields)
        .eq("id", str(job_id))
        .execute()
    )
    if result.data:
        data = cast(list[dict[str, Any]], result.data)
        return ExtractionJob(**data[0])
    return None


async def create_extraction_job(
    job_create: ExtractionJobCreate,
) -> ExtractionJob:
    """Create a new extraction job and queue it for processing."""
    client = get_supabase_admin()
    result = (
        client.table("extraction_jobs")
        .insert(
            {
                "document_id": str(job_create.document_id),
                "organization_id": str(job_create.organization_id),
                "status": ExtractionJobStatus.PENDING.value,
                "priority": job_create.priority.value,
            }
        )
        .execute()
    )
    data = cast(list[dict[str, Any]], result.data)
    job = ExtractionJob(**data[0])
    try:
        async_result = process_extraction_task.apply_async(
            args=[str(job.id)],
            kwargs={"priority": job.priority.value},
            priority=job.priority.value,
        )
    except Exception as exc:
        client.table("documents").update(
            {
                "status": "failed",
                "error_message": f"Failed to enqueue extraction job: {exc}",
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ).eq("id", str(job.document_id)).execute()
        update_extraction_job_sync(
            job.id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.FAILED,
                error_message=f"Failed to enqueue extraction job: {exc}",
            ),
        )
        raise

    client.table("extraction_jobs").update(
        {"result_data": {"task_id": async_result.id}}
    ).eq("id", str(job.id)).execute()
    return job


async def get_extraction_job(
    job_id: UUID, organization_id: UUID | None = None
) -> ExtractionJob | None:
    client = get_supabase_admin()
    query = client.table("extraction_jobs").select("*").eq("id", str(job_id))
    if organization_id is not None:
        query = query.eq("organization_id", str(organization_id))
    result = query.maybe_single().execute()
    if result and result.data:
        data = cast(dict[str, Any], result.data)
        return ExtractionJob(**data)
    return None


async def update_extraction_job(
    job_id: UUID,
    update: ExtractionJobUpdate,
) -> ExtractionJob | None:
    return update_extraction_job_sync(job_id, update)


async def retry_extraction_job(
    job_id: UUID, organization_id: UUID | None = None
) -> ExtractionJob | None:
    job = await get_extraction_job(job_id, organization_id=organization_id)
    if not job:
        return None
    if not job.can_retry:
        raise ValueError(
            f"Job {job_id} cannot be retried: "
            f"status={job.status}, retry_count={job.retry_count}"
        )
    delay_seconds = 60 * (2**job.retry_count)
    next_retry = datetime.now(UTC) + timedelta(seconds=delay_seconds)
    await update_extraction_job(
        job_id,
        ExtractionJobUpdate(
            status=ExtractionJobStatus.RETRYING,
            retry_count=job.retry_count + 1,
            next_retry_at=next_retry,
        ),
    )
    process_extraction_task.apply_async(
        args=[str(job.id)],
        kwargs={"priority": job.priority.value},
        countdown=delay_seconds,
        priority=job.priority.value,
    )
    return await get_extraction_job(job_id, organization_id=organization_id)
