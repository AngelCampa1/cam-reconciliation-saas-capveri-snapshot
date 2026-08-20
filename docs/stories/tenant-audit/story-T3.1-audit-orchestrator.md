# Story T3.1: Audit Orchestrator (Celery Task)

## Story Info
- **Epic**: T3 — Audit Pipeline & Report
- **Estimated Hours**: 10
- **Dependencies**: T1.1 (data model), T2.3 (extraction pipeline integration)
- **Status**: `pending`

## User Story
As a tenant who has paid for a CAM audit, I want the system to automatically process my uploaded documents through extraction, calculation, quality review, report generation, and email delivery so that I receive my audit report without any manual intervention.

## Acceptance Criteria
- Celery task `run_tenant_audit` drives the audit through all states: `PAID` -> `EXTRACTING_LEASE` -> `EXTRACTING_CAM` -> `CALCULATING` -> `REVIEWING` -> `GENERATING_REPORT` -> `COMPLETED`
- Each state transition is persisted to `tenant_audits.status` with optimistic concurrency
- Each state transition logs an event to `tenant_audit_events`
- document reader, Claude, and S3 operations retry up to 3 times with exponential backoff
- Calculation and ReportLab steps do not retry (deterministic failures indicate bad input)
- On any unrecoverable failure, status is set to `FAILED` with `error_message` populated
- On failure after payment, a full Stripe refund is issued automatically
- Failure and completion emails are sent via the email service (Story T3.5)
- Task is idempotent: re-running a task that already reached `COMPLETED` is a no-op
- Task timeout is 10 minutes; exceeded timeout triggers failure path
- Celery task is triggered by the Stripe webhook handler after payment confirmation

## Technical Specifications

### Audit Status Enum (Extended)

```python
# backend/app/models/tenant_audit.py (extend existing enum)

class TenantAuditStatus(str, Enum):
    """Extended status state machine for tenant audits."""

    CREATED = "created"
    PAYMENT_PENDING = "payment_pending"
    PAID = "paid"
    EXTRACTING_LEASE = "extracting_lease"
    EXTRACTING_CAM = "extracting_cam"
    CALCULATING = "calculating"
    REVIEWING = "reviewing"
    GENERATING_REPORT = "generating_report"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"


# Extended valid transitions for the processing pipeline
VALID_STATUS_TRANSITIONS: dict[TenantAuditStatus, list[TenantAuditStatus]] = {
    TenantAuditStatus.CREATED: [TenantAuditStatus.PAYMENT_PENDING],
    TenantAuditStatus.PAYMENT_PENDING: [
        TenantAuditStatus.PAID,
        TenantAuditStatus.CREATED,
    ],
    TenantAuditStatus.PAID: [
        TenantAuditStatus.EXTRACTING_LEASE,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.EXTRACTING_LEASE: [
        TenantAuditStatus.EXTRACTING_CAM,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.EXTRACTING_CAM: [
        TenantAuditStatus.CALCULATING,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.CALCULATING: [
        TenantAuditStatus.REVIEWING,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.REVIEWING: [
        TenantAuditStatus.GENERATING_REPORT,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.GENERATING_REPORT: [
        TenantAuditStatus.COMPLETED,
        TenantAuditStatus.FAILED,
    ],
    TenantAuditStatus.FAILED: [TenantAuditStatus.REFUNDED],
    TenantAuditStatus.COMPLETED: [],
    TenantAuditStatus.REFUNDED: [],
}
```

### Celery Task

```python
# backend/app/tasks/tenant_audit.py
import logging
from datetime import UTC, datetime
from uuid import UUID

import sentry_sdk
from celery import shared_task
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.models.tenant_audit import TenantAuditStatus

logger = logging.getLogger(__name__)

# Retry decorator for transient external service failures
retry_transient = retry(
    retry=retry_if_exception_type((ConnectionError, TimeoutError, OSError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    reraise=True,
)


@shared_task(
    bind=True,
    name="tenant_audit.run",
    max_retries=0,  # No Celery-level retries; we handle retries per-step
    soft_time_limit=540,  # 9 minutes soft limit
    time_limit=600,  # 10 minutes hard limit
    acks_late=True,
)
def run_tenant_audit(self, audit_id: str) -> dict:
    """
    Drive a tenant audit through the full processing pipeline.

    State machine:
        PAID -> EXTRACTING_LEASE -> EXTRACTING_CAM -> CALCULATING
        -> REVIEWING -> GENERATING_REPORT -> COMPLETED

    On failure at any step:
        -> FAILED -> auto-refund -> REFUNDED

    Args:
        audit_id: UUID string of the tenant_audits row.

    Returns:
        dict with status, audit_id, and completion metadata.
    """
    import asyncio

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run_tenant_audit_async(audit_id))
    finally:
        loop.close()


async def _run_tenant_audit_async(audit_id: str) -> dict:
    """Async implementation of the audit pipeline."""
    from app.database.client import get_service_client
    from app.services.tenant_audit.repository import TenantAuditRepository

    supabase = get_service_client()
    repo = TenantAuditRepository(supabase)
    audit_uuid = UUID(audit_id)

    # Fetch current audit state
    audit = await repo.get_by_id(audit_uuid)
    if audit is None:
        raise ValueError(f"Tenant audit {audit_id} not found")

    # Idempotency: already completed, nothing to do
    if audit.status == TenantAuditStatus.COMPLETED:
        logger.info("Audit %s already completed, skipping", audit_id)
        return {"status": "already_completed", "audit_id": audit_id}

    # Must be in PAID state to start processing
    if audit.status != TenantAuditStatus.PAID:
        raise ValueError(
            f"Audit {audit_id} is in status '{audit.status.value}', "
            f"expected 'paid' to start processing"
        )

    try:
        # Step 1: Extract lease
        audit = await _step_extract_lease(repo, audit)

        # Step 2: Extract CAM statement
        audit = await _step_extract_cam(repo, audit)

        # Step 3: Calculate reconciliation
        audit = await _step_calculate(repo, audit)

        # Step 4: Quality gate review
        audit = await _step_review(repo, audit)

        # Step 5: Generate report (includes discrepancy detection)
        audit = await _step_generate_report(repo, audit)

        # Step 6: Mark completed and send email
        audit = await repo.update_status(
            audit_id=audit.id,
            current_status=TenantAuditStatus.GENERATING_REPORT,
            new_status=TenantAuditStatus.COMPLETED,
            extra_fields={"completed_at": datetime.now(UTC).isoformat()},
        )
        await repo.log_event(audit.id, "status_change", {
            "from": "generating_report",
            "to": "completed",
        })

        # Send completion email
        await _send_completion_email(audit)

        sentry_sdk.metrics.count("tenant_audit.completed", 1.0)
        logger.info("Audit %s completed successfully", audit_id)

        return {
            "status": "completed",
            "audit_id": audit_id,
            "completed_at": audit.completed_at.isoformat() if audit.completed_at else None,
        }

    except Exception as exc:
        logger.exception("Audit %s failed: %s", audit_id, exc)
        sentry_sdk.capture_exception(exc)
        sentry_sdk.metrics.count("tenant_audit.failed", 1.0)
        await _handle_failure(repo, audit, exc)
        return {"status": "failed", "audit_id": audit_id, "error": str(exc)}


async def _step_extract_lease(repo, audit):
    """Extract lease recovery terms from uploaded lease PDF."""
    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.PAID,
        new_status=TenantAuditStatus.EXTRACTING_LEASE,
        extra_fields={"processing_started_at": datetime.now(UTC).isoformat()},
    )
    await repo.log_event(audit.id, "status_change", {
        "from": "paid",
        "to": "extracting_lease",
    })

    from app.services.extraction.orchestrator import ExtractionOrchestrator
    from app.services.extraction.s3_client import S3Client

    s3 = S3Client()

    @retry_transient
    async def _extract():
        lease_bytes = await s3.download(audit.lease_file_key)
        orchestrator = ExtractionOrchestrator()
        return await orchestrator.extract_lease(lease_bytes)

    lease_result = await _extract()

    audit = await repo.update_fields(audit.id, {
        "extraction_result": {
            **(audit.extraction_result or {}),
            "lease": lease_result.model_dump(mode="json"),
        },
    })
    await repo.log_event(audit.id, "extraction_complete", {
        "document_type": "lease",
        "low_confidence_fields": len(lease_result.get_low_confidence_fields()),
    })

    return audit


async def _step_extract_cam(repo, audit):
    """Extract CAM statement values from uploaded reconciliation PDF."""
    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.EXTRACTING_LEASE,
        new_status=TenantAuditStatus.EXTRACTING_CAM,
    )
    await repo.log_event(audit.id, "status_change", {
        "from": "extracting_lease",
        "to": "extracting_cam",
    })

    from app.services.extraction.orchestrator import ExtractionOrchestrator
    from app.services.extraction.s3_client import S3Client

    s3 = S3Client()

    @retry_transient
    async def _extract():
        cam_bytes = await s3.download(audit.reconciliation_file_key)
        orchestrator = ExtractionOrchestrator()
        return await orchestrator.extract_cam_statement(cam_bytes)

    cam_result = await _extract()

    audit = await repo.update_fields(audit.id, {
        "extraction_result": {
            **(audit.extraction_result or {}),
            "cam_statement": cam_result.model_dump(mode="json"),
        },
    })
    await repo.log_event(audit.id, "extraction_complete", {
        "document_type": "cam_statement",
        "low_confidence_fields": len(cam_result.get_low_confidence_fields()),
    })

    return audit


async def _step_calculate(repo, audit):
    """Run reconciliation calculation using bridged extraction data."""
    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.EXTRACTING_CAM,
        new_status=TenantAuditStatus.CALCULATING,
    )
    await repo.log_event(audit.id, "status_change", {
        "from": "extracting_cam",
        "to": "calculating",
    })

    from app.services.extraction.cam_statement_models import CamStatementExtractionResult
    from app.services.extraction.extraction_models import LeaseExtractionResult
    from app.services.calculation.orchestrator import run_property_reconciliation
    from app.services.tenant_audit.bridge import ExtractionToCalculationBridge

    # Reconstruct extraction results from stored JSONB
    lease_extraction = LeaseExtractionResult.model_validate(
        audit.extraction_result["lease"]
    )
    cam_extraction = CamStatementExtractionResult.model_validate(
        audit.extraction_result["cam_statement"]
    )

    # Bridge to calculation engine inputs
    bridge = ExtractionToCalculationBridge()
    recon_input, lease_terms_list, pool_summaries = bridge.convert(
        lease_extraction=lease_extraction,
        cam_extraction=cam_extraction,
    )

    # Run the existing calculation engine (deterministic, no retry)
    recon_result = await run_property_reconciliation(
        input_data=recon_input,
        leases=lease_terms_list,
        pool_summaries=pool_summaries,
    )

    audit = await repo.update_fields(audit.id, {
        "calculation_result": recon_result.model_dump(mode="json"),
    })
    await repo.log_event(audit.id, "calculation_complete", {
        "total_recovery": str(recon_result.total_recovery),
        "tenant_count": len(recon_result.tenant_reconciliations),
    })

    return audit


async def _step_review(repo, audit):
    """Run automated quality gate checks before report generation."""
    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.CALCULATING,
        new_status=TenantAuditStatus.REVIEWING,
    )
    await repo.log_event(audit.id, "status_change", {
        "from": "calculating",
        "to": "reviewing",
    })

    from app.services.tenant_audit.quality_gate import QualityGate

    gate = QualityGate()
    gate_result = gate.review(
        extraction_result=audit.extraction_result,
        calculation_result=audit.calculation_result,
    )

    await repo.log_event(audit.id, "quality_gate", {
        "passed": gate_result.passed,
        "warnings": [w.model_dump() for w in gate_result.warnings],
        "failures": [f.model_dump() for f in gate_result.failures],
    })

    if not gate_result.passed:
        raise ValueError(
            f"Quality gate failed: {[f.message for f in gate_result.failures]}"
        )

    return audit


async def _step_generate_report(repo, audit):
    """Detect discrepancies and generate PDF report."""
    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.REVIEWING,
        new_status=TenantAuditStatus.GENERATING_REPORT,
    )
    await repo.log_event(audit.id, "status_change", {
        "from": "reviewing",
        "to": "generating_report",
    })

    from app.services.extraction.cam_statement_models import CamStatementExtractionResult
    from app.services.calculation.orchestrator import PropertyReconciliation
    from app.services.tenant_audit.discrepancy_detector import DiscrepancyDetector
    from app.services.tenant_audit.report_generator import TenantAuditReportGenerator
    from app.services.extraction.s3_client import S3Client

    cam_extraction = CamStatementExtractionResult.model_validate(
        audit.extraction_result["cam_statement"]
    )
    calculation = PropertyReconciliation.model_validate(audit.calculation_result)

    # Detect discrepancies
    detector = DiscrepancyDetector()
    discrepancies = detector.detect(
        cam_extraction=cam_extraction,
        calculation=calculation,
    )

    # Generate PDF (deterministic, no retry)
    generator = TenantAuditReportGenerator()
    pdf_bytes = generator.generate(
        audit=audit,
        discrepancies=discrepancies,
        cam_extraction=cam_extraction,
        calculation=calculation,
    )

    # Upload to S3 (retry on transient failure)
    s3 = S3Client()

    @retry_transient
    async def _upload():
        report_key = f"tenant-audits/{audit.id}/report.pdf"
        await s3.upload(report_key, pdf_bytes, content_type="application/pdf")
        return report_key

    report_key = await _upload()

    audit = await repo.update_fields(audit.id, {
        "report_file_key": report_key,
        "discrepancies": [d.model_dump(mode="json") for d in discrepancies],
    })
    await repo.log_event(audit.id, "report_generated", {
        "report_key": report_key,
        "discrepancy_count": len(discrepancies),
        "total_impact": str(sum(d.impact_amount for d in discrepancies)),
    })

    return audit


async def _handle_failure(repo, audit, exc: Exception) -> None:
    """Set FAILED status, issue refund, send failure email."""
    from datetime import UTC, datetime

    try:
        audit = await repo.update_status(
            audit_id=audit.id,
            current_status=audit.status,
            new_status=TenantAuditStatus.FAILED,
            extra_fields={
                "error_message": str(exc)[:1000],
                "error_code": type(exc).__name__,
                "failed_at": datetime.now(UTC).isoformat(),
            },
        )
        await repo.log_event(audit.id, "failed", {
            "error": str(exc)[:1000],
            "error_type": type(exc).__name__,
            "failed_in_status": audit.status.value,
        })
    except Exception:
        logger.exception("Failed to update audit %s to FAILED status", audit.id)

    # Auto-refund if payment was collected
    if audit.payment_intent_id:
        try:
            await _issue_refund(repo, audit)
        except Exception:
            logger.exception("Failed to issue refund for audit %s", audit.id)

    # Send failure notification
    try:
        await _send_failure_email(audit)
    except Exception:
        logger.exception("Failed to send failure email for audit %s", audit.id)


async def _issue_refund(repo, audit) -> None:
    """Issue a full Stripe refund for a failed audit."""
    from app.services.billing.stripe_client import StripeClient

    stripe = StripeClient()

    @retry_transient
    async def _refund():
        return stripe.create_refund(
            payment_intent_id=audit.payment_intent_id,
            reason="audit_processing_failed",
        )

    refund = await _refund()

    await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.FAILED,
        new_status=TenantAuditStatus.REFUNDED,
        extra_fields={
            "refund_id": refund.id,
            "refunded_at": datetime.now(UTC).isoformat(),
        },
    )
    await repo.log_event(audit.id, "refunded", {
        "refund_id": refund.id,
        "amount_cents": audit.amount_paid_cents,
    })


async def _send_completion_email(audit) -> None:
    """Send audit completion email with report download link."""
    from app.services.tenant_audit.email import TenantAuditEmailService

    email_service = TenantAuditEmailService()

    @retry_transient
    async def _send():
        return await email_service.send_audit_complete(
            to_email=audit.email,
            access_token=str(audit.access_token),
            property_name=audit.property_name,
        )

    await _send()


async def _send_failure_email(audit) -> None:
    """Send audit failure notification email."""
    from app.services.tenant_audit.email import TenantAuditEmailService

    email_service = TenantAuditEmailService()

    @retry_transient
    async def _send():
        return await email_service.send_audit_failed(
            to_email=audit.email,
            access_token=str(audit.access_token),
            property_name=audit.property_name,
        )

    await _send()
```

### Quality Gate

```python
# backend/app/services/tenant_audit/quality_gate.py
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class QualityIssue(BaseModel):
    """A single quality gate finding."""

    category: str = Field(description="Category: extraction, calculation, consistency")
    message: str
    severity: str = Field(description="warn or fail")
    field: str | None = None
    value: str | None = None


class QualityGateResult(BaseModel):
    """Result of quality gate review."""

    passed: bool
    warnings: list[QualityIssue] = Field(default_factory=list)
    failures: list[QualityIssue] = Field(default_factory=list)


class QualityGate:
    """Automated review checks before report generation."""

    def review(
        self,
        extraction_result: dict[str, Any],
        calculation_result: dict[str, Any],
    ) -> QualityGateResult:
        """
        Run all quality checks on extraction and calculation results.

        Checks:
        1. Extraction confidence -- all critical fields above 0.50
        2. Impossible values -- negative expenses, pro_rata_share > 1.0
        3. Lease/CAM period consistency -- periods should overlap
        4. Calculation sanity -- total_recovery >= 0, tenant_share >= 0
        """
        warnings: list[QualityIssue] = []
        failures: list[QualityIssue] = []

        # Check 1: Extraction confidence
        lease_data = extraction_result.get("lease", {})
        cam_data = extraction_result.get("cam_statement", {})
        for extraction in lease_data.get("extractions", []):
            if extraction.get("confidence", 100) < 50:
                failures.append(QualityIssue(
                    category="extraction",
                    message=f"Lease field '{extraction['field']}' has critically low confidence ({extraction['confidence']}%)",
                    severity="fail",
                    field=extraction["field"],
                    value=str(extraction.get("confidence")),
                ))
            elif extraction.get("confidence", 100) < 70:
                warnings.append(QualityIssue(
                    category="extraction",
                    message=f"Lease field '{extraction['field']}' has low confidence ({extraction['confidence']}%)",
                    severity="warn",
                    field=extraction["field"],
                    value=str(extraction.get("confidence")),
                ))

        # Check 2: Impossible values
        pro_rata = lease_data.get("pro_rata_share")
        if pro_rata is not None:
            pro_rata_dec = Decimal(str(pro_rata))
            if pro_rata_dec > Decimal("1"):
                failures.append(QualityIssue(
                    category="extraction",
                    message=f"pro_rata_share is {pro_rata_dec}, which exceeds 1.0 (100%)",
                    severity="fail",
                    field="pro_rata_share",
                    value=str(pro_rata_dec),
                ))
            if pro_rata_dec <= Decimal("0"):
                failures.append(QualityIssue(
                    category="extraction",
                    message=f"pro_rata_share is {pro_rata_dec}, which is non-positive",
                    severity="fail",
                    field="pro_rata_share",
                    value=str(pro_rata_dec),
                ))

        # Check 3: Calculation sanity
        total_recovery = calculation_result.get("total_recovery")
        if total_recovery is not None and Decimal(str(total_recovery)) < Decimal("0"):
            failures.append(QualityIssue(
                category="calculation",
                message=f"total_recovery is negative ({total_recovery})",
                severity="fail",
                field="total_recovery",
                value=str(total_recovery),
            ))

        # Check 4: Total expenses should be positive
        total_expenses = calculation_result.get("total_operating_expenses")
        if total_expenses is not None and Decimal(str(total_expenses)) <= Decimal("0"):
            failures.append(QualityIssue(
                category="calculation",
                message=f"total_operating_expenses is non-positive ({total_expenses})",
                severity="fail",
                field="total_operating_expenses",
                value=str(total_expenses),
            ))

        return QualityGateResult(
            passed=len(failures) == 0,
            warnings=warnings,
            failures=failures,
        )
```

### Celery Configuration

```python
# backend/app/core/celery_app.py (relevant config)
from celery import Celery

celery_app = Celery("capveri")
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,  # One task at a time per worker
    task_routes={
        "tenant_audit.run": {"queue": "tenant_audit"},
    },
)
```

### Webhook Trigger

```python
# In the Stripe webhook handler (T1.3), after payment confirmation:
async def handle_checkout_completed(session_data: dict) -> None:
    """Trigger audit processing after successful payment."""
    from app.tasks.tenant_audit import run_tenant_audit

    audit = await repo.get_by_checkout_session_id(session_data["id"])
    if audit is None:
        logger.warning("No audit found for checkout session %s", session_data["id"])
        return

    audit = await repo.update_status(
        audit_id=audit.id,
        current_status=TenantAuditStatus.PAYMENT_PENDING,
        new_status=TenantAuditStatus.PAID,
        extra_fields={
            "payment_intent_id": session_data.get("payment_intent"),
            "amount_paid_cents": session_data.get("amount_total"),
            "paid_at": datetime.now(UTC).isoformat(),
        },
    )
    await repo.log_event(audit.id, "payment_confirmed", {
        "payment_intent": session_data.get("payment_intent"),
        "amount_cents": session_data.get("amount_total"),
    })

    # Send "audit started" email
    from app.services.tenant_audit.email import TenantAuditEmailService
    email_service = TenantAuditEmailService()
    await email_service.send_audit_started(
        to_email=audit.email,
        access_token=str(audit.access_token),
        property_name=audit.property_name,
    )

    # Dispatch Celery task
    run_tenant_audit.delay(str(audit.id))
```

## Test Cases
- Test `run_tenant_audit` with a fully mocked pipeline that succeeds end-to-end, verify status reaches `COMPLETED`
- Test `run_tenant_audit` when audit is already `COMPLETED`, verify it returns `already_completed` and makes no state changes
- Test `run_tenant_audit` when audit is not in `PAID` status, verify it raises `ValueError`
- Test `run_tenant_audit` when lease extraction fails, verify status is set to `FAILED` and refund is issued
- Test `run_tenant_audit` when CAM extraction fails, verify status is set to `FAILED` and refund is issued
- Test `run_tenant_audit` when calculation fails (deterministic), verify no retry and status is `FAILED`
- Test `run_tenant_audit` when quality gate fails, verify status is `FAILED` with quality gate error message
- Test `run_tenant_audit` when report generation fails, verify status is `FAILED` and refund is issued
- Test retry behavior for document reader failures: verify 3 retries with exponential backoff before failing
- Test retry behavior for S3 upload: verify 3 retries before failing
- Test `_handle_failure` when refund API call itself fails, verify failure is logged but does not crash
- Test `_handle_failure` when email send fails, verify failure is logged but does not crash
- Test `QualityGate.review` passes when all values are valid
- Test `QualityGate.review` fails when `pro_rata_share` exceeds 1.0
- Test `QualityGate.review` fails when extraction confidence is below 50%
- Test `QualityGate.review` warns (but passes) when extraction confidence is between 50-70%
- Test `QualityGate.review` fails when `total_recovery` is negative
- Test each state transition is logged as a `tenant_audit_events` record
- Test optimistic concurrency: concurrent status updates should not corrupt state
- Test task timeout: verify that exceeding `time_limit` triggers the failure path

## Definition of Done
- [ ] `TenantAuditStatus` enum extended with processing sub-states
- [ ] `VALID_STATUS_TRANSITIONS` updated for full pipeline
- [ ] `run_tenant_audit` Celery task implemented with all pipeline steps
- [ ] Each step transitions status and logs events
- [ ] Retry logic for document reader, Claude, S3 with tenacity (3 attempts, exponential backoff)
- [ ] No retry for calculation and ReportLab steps
- [ ] Failure handler: set FAILED, issue refund, send failure email
- [ ] Idempotency: re-running completed audit is a no-op
- [ ] `QualityGate` class with extraction confidence, impossible value, and calculation sanity checks
- [ ] Celery config with dedicated `tenant_audit` queue
- [ ] Webhook handler triggers task after payment confirmation
- [ ] All unit tests pass with `pytest --tb=short`
- [ ] Coverage maintained at >= 95%
