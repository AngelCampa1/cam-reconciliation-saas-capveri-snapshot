# Epic T2: CAM Statement Extraction

## Epic Info
- **Product**: Tenant CAM Audit
- **Stories**: T2.1, T2.2, T2.3
- **Total Estimated Hours**: 22
- **Status**: `pending`

## Goal

Extract structured financial data from landlord-provided CAM reconciliation statements (PDF) using the existing OCR + LLM extraction pipeline. Produce a validated `CamStatementExtractionResult` that downstream audit calculations can consume without human-in-the-loop gating. Confidence scores are surfaced in the audit report instead.

## Context

CapVeri already has a production extraction pipeline for lease documents:

- **`ExtractionOrchestrator`** coordinates OCR-to-LLM flow
- **`AnthropicClient`** wraps Claude with retry, circuit breaker, and token tracking
- **`document_reader_client.py`** / `job_poller.py` handle async document reader OCR
- **`result_parser.py`** produces `ParsedDocument` from document reader blocks
- **`confidence.py`** scores fields 0.0-1.0 and flags low-confidence extractions
- **`LEASE_EXTRACTION_PROMPT`** extracts lease recovery terms into `LeaseExtractionResult`

This epic adds a **parallel extraction path** for CAM reconciliation statements. Where lease extraction captures recovery *terms* (pro-rata share, caps, base year), CAM statement extraction captures reconciliation *actuals* (expense line items, adjustments, totals, stated tenant share).

## Architecture

```
PDF Upload
    |
    v
document reader (async OCR)          <-- existing
    |
    v
ParsedDocument (text + geometry)   <-- existing
    |
    v
CAM_STATEMENT_EXTRACTION_PROMPT   <-- NEW (Story T2.1)
    |
    v
Claude 3.5 Sonnet (temp=0.0)      <-- existing AnthropicClient
    |
    v
JSON parse + strip code blocks    <-- existing pattern
    |
    v
CamStatementExtractionResult      <-- NEW (Story T2.2)
    |  (Pydantic model_validate)
    v
Confidence scoring (per-field)    <-- NEW weights for CAM fields
    |  (threshold < 0.75 flags)
    v
Audit calculation engine          <-- downstream consumer
```

## New Files

| File | Story | Purpose |
|------|-------|---------|
| `backend/app/services/extraction/cam_statement_prompt.py` | T2.1 | Extraction prompt for CAM reconciliation statements |
| `backend/app/services/extraction/cam_statement_models.py` | T2.2 | Pydantic models for structured extraction result |
| `backend/tests/services/extraction/test_cam_statement_prompt.py` | T2.1 | Prompt construction tests |
| `backend/tests/services/extraction/test_cam_statement_models.py` | T2.2 | Model validation tests |
| `backend/tests/services/extraction/test_cam_statement_extraction.py` | T2.3 | Integration tests for full pipeline |

## Key Design Decisions

1. **No HITL for tenant audits** -- Unlike landlord-side lease extraction (which gates on human verification), tenant audit extractions flow straight through. Confidence scores are included in the audit report so auditors can see which values need manual spot-checking.

2. **Decimal everywhere** -- All monetary amounts use `Decimal`, never `float`. Pydantic models enforce this at the schema level.

3. **Temperature 0.0** -- Deterministic extraction output. No sampling randomness.

4. **Reuse existing infrastructure** -- `AnthropicClient`, `ExtractionOrchestrator` pattern, JSON parsing with markdown code block stripping, and document reader OCR pipeline are all reused. Only the prompt and response model are new.

5. **Confidence threshold at 0.75** -- Slightly lower than the landlord-side 0.80 threshold since CAM statements have more variability in format. Fields below 0.75 are flagged in the report with an amber indicator.

## Stories

| Story | Title | Hours | Dependencies |
|-------|-------|-------|-------------|
| [T2.1](./story-T2.1-cam-statement-extraction-prompt.md) | CAM Statement Extraction Prompt | 6 | Existing extraction pipeline |
| [T2.2](./story-T2.2-cam-extraction-model-and-validation.md) | CAM Extraction Model and Validation | 8 | None (parallel with T2.1) |
| [T2.3](./story-T2.3-extraction-pipeline-integration.md) | Extraction Pipeline Integration | 8 | T2.1, T2.2 |

## Dependencies

- **Upstream**: Existing extraction pipeline (`backend/app/services/extraction/`)
- **Downstream**: Epic T3 (CAM Audit Calculation Engine) consumes `CamStatementExtractionResult`
