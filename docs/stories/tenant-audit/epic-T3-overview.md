# Epic T3: Audit Pipeline & Report

## Epic Info
- **Product**: Tenant CAM Audit
- **Stories**: T3.1, T3.2, T3.3, T3.4, T3.5
- **Total Estimated Hours**: 38
- **Status**: `pending`

## Goal

Implement the end-to-end audit pipeline that takes a paid tenant audit from raw file uploads through extraction, calculation, discrepancy detection, PDF report generation, and email delivery. This epic wires together the existing extraction engine (Epic T2), the existing calculation engine (`run_property_reconciliation`), and new discrepancy detection and reporting layers into a Celery-orchestrated state machine.

## Context

After Epic T1 (data model + payment) and Epic T2 (CAM statement extraction), we have:

- A `tenant_audits` table with payment state tracked
- `LeaseExtractionResult` from the existing lease extraction pipeline
- `CamStatementExtractionResult` from Epic T2
- `run_property_reconciliation()` in `backend/app/services/calculation/orchestrator.py` that produces `PropertyReconciliation` with per-tenant `TenantReconciliation` results

What is missing:

1. **Orchestrator** -- A Celery task that drives the audit through states: `PAID` -> `EXTRACTING_LEASE` -> `EXTRACTING_CAM` -> `CALCULATING` -> `REVIEWING` -> `GENERATING_REPORT` -> `COMPLETED` | `FAILED`
2. **Bridge** -- Converts extraction results (`LeaseExtractionResult` + `CamStatementExtractionResult`) into calculation engine inputs (`ReconciliationInput` + `LeaseTerms` + `dict[UUID, ExpensePoolSummary]`)
3. **Discrepancy detector** -- Compares landlord's stated CAM values against independently calculated correct values
4. **PDF report generator** -- ReportLab PDF with tier-appropriate sections
5. **Email delivery** -- Resend templates for audit started, complete, and failed notifications

## Architecture

```
Stripe webhook (payment confirmed)
    |
    v
Celery task: run_tenant_audit
    |
    ├── 1. EXTRACTING_LEASE
    │       ExtractionOrchestrator.extract_lease(lease_pdf)
    │       -> LeaseExtractionResult
    │
    ├── 2. EXTRACTING_CAM
    │       ExtractionOrchestrator.extract_cam_statement(cam_pdf)
    │       -> CamStatementExtractionResult
    │
    ├── 3. CALCULATING
    │       ExtractionToCalculationBridge.convert(lease, cam)
    │       -> ReconciliationInput, LeaseTerms, ExpensePoolSummary
    │       run_property_reconciliation(input, leases, pools)
    │       -> PropertyReconciliation
    │
    ├── 4. REVIEWING
    │       QualityGate.review(extraction, calculation)
    │       -> QualityGateResult (pass/warn/fail)
    │
    ├── 5. GENERATING_REPORT
    │       DiscrepancyDetector.detect(cam_extraction, calculation)
    │       -> list[Discrepancy]
    │       TenantAuditReportGenerator.generate(audit, discrepancies, tier)
    │       -> PDF bytes
    │       Upload PDF to S3
    │
    └── 6. COMPLETED
            Send completion email with report link
            Update status to COMPLETED

    On any error:
        Log event, set FAILED status, auto-refund, send failure email
```

## State Machine

```
     CREATED
        |
        | (payment confirmed via webhook)
        v
      PAID
        |
        | (Celery task starts)
        v
  EXTRACTING_LEASE
        |
        | (lease PDF -> LeaseExtractionResult)
        v
  EXTRACTING_CAM
        |
        | (CAM PDF -> CamStatementExtractionResult)
        v
   CALCULATING
        |
        | (bridge + run_property_reconciliation)
        v
    REVIEWING
        |
        | (quality gate checks)
        v
 GENERATING_REPORT
        |
        | (discrepancy detection + ReportLab PDF + S3 upload)
        v
   COMPLETED -----> (send completion email)

   Any step can -> FAILED -> (auto-refund + failure email)
```

## Error Handling

| Component | Retry? | Max Attempts | Rationale |
|-----------|--------|-------------|-----------|
| document reader OCR | Yes | 3 | Transient AWS errors |
| Claude extraction | Yes | 3 | Rate limits, transient errors |
| S3 upload/download | Yes | 3 | Network transience |
| Calculation engine | No | 1 | Deterministic -- if it fails, input is bad |
| ReportLab PDF | No | 1 | Deterministic -- if it fails, input is bad |
| Stripe refund | Yes | 3 | Network transience |
| Resend email | Yes | 3 | Network transience |

On unrecoverable failure:
1. Log error details to `tenant_audit_events`
2. Set status to `FAILED` with `error_message`
3. Issue full Stripe refund via `payment_intent_id`
4. Send failure notification email to tenant

## Stories

| Story | Title | Hours | Dependencies |
|-------|-------|-------|-------------|
| [T3.1](./story-T3.1-audit-orchestrator.md) | Audit Orchestrator (Celery Task) | 10 | T1.1, T2.3 |
| [T3.2](./story-T3.2-extraction-to-calculation-bridge.md) | Extraction-to-Calculation Bridge | 8 | T2.2 |
| [T3.3](./story-T3.3-discrepancy-detector.md) | Discrepancy Detector | 6 | T3.2 |
| [T3.4](./story-T3.4-pdf-report-generator.md) | PDF Report Generator | 8 | T3.3 |
| [T3.5](./story-T3.5-email-delivery.md) | Email Delivery | 6 | T3.1 |

## Dependencies

- **Upstream**: Epic T1 (data model, payment, repository), Epic T2 (CAM statement extraction)
- **Downstream**: Epic T4 (marketing-tenant site links to audit status page)
- **External**: document reader, Claude 3.5 Sonnet, Stripe, Resend, S3

## Key Design Decisions

1. **Celery over FastAPI BackgroundTasks** -- Audit processing takes 30-120 seconds. Celery provides retry, dead-letter, and monitoring. FastAPI BackgroundTasks would block worker processes.

2. **State machine in DB, not in code** -- Each state transition is persisted to `tenant_audits.status` with optimistic concurrency. If the worker crashes, the audit is in a known state and can be resumed or refunded.

3. **Bridge pattern** -- The extraction models (`LeaseExtractionResult`, `CamStatementExtractionResult`) and calculation models (`ReconciliationInput`, `LeaseTerms`, `ExpensePoolSummary`) are intentionally decoupled. The bridge function converts between them, keeping both sides independently testable.

4. **Quality gate before report** -- Automated sanity checks catch impossible values (negative expenses, pro-rata > 100%, lease/CAM period mismatch) before generating a report. Prevents sending obviously wrong reports to paying customers.

5. **Tier-based report sections** -- Standard tier gets core checks. Detailed adds occupancy, capital classification, admin fee analysis. Expert adds dispute letter draft with lease clause citations. This justifies the 4x price difference.

6. **$1 tolerance for rounding** -- CAM calculations involve multiple rounding steps. A $0.50 difference between landlord's number and ours is not a discrepancy. The tolerance is $1.00 to avoid false positives.
