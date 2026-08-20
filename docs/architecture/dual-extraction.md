# Dual-Extract + Judge Pipeline

## Overview

CapVeri uses a parallel dual-extract + judge architecture for lease document processing. Two independent models extract the same PDF simultaneously; a judge model arbitrates every disagreement; a gap-filler re-extracts any critical fields still missing after the merge.

All models are accessed via [OpenRouter](https://openrouter.ai) using the OpenAI-compatible API. Native-PDF multimodal extraction is used throughout: no OCR text round-trip.

## Pipeline Flow

```
Upload → R2
       └─ DualExtractOrchestrator:
            ├─ primary  extract_pdf  (Gemini 3.1 Flash Lite: extraction_primary_model) ┐ parallel
            └─ sibling  extract_pdf  (Gemini 3.1 Flash Lite: extraction_sibling_model) ┘
       └─ judge_extractions        (GLM-5.1: arbitrates every disagreement)
       └─ merge_dual_extractions   (applies judge verdicts)
       └─ gap_filler (optional)    (re-extracts None critical fields)
       └─ persist:
            - documents.extraction_result
            - audit_pipeline_events (one row per stage)
            - R2: extractions/raw/{document_id}/{stage}.json
```

## Extractors

Both extractors receive the same PDF bytes and the same `LEASE_EXTRACTION_PROMPT`. They run concurrently via `asyncio.gather`.

### Primary Extractor

| | |
|---|---|
| **Primary** | `google/gemini-3.1-flash-lite`: Gemini 3.1 Flash Lite |
| **Fallback 1** | `google/gemini-3-flash-preview`: Gemini 3 Flash |
| **Fallback 2** | `moonshotai/kimi-k2.6`: Kimi K2.6 |
| **Temperature** | 0.0 |
| **Input** | Native PDF bytes (base64 multimodal) |

### Sibling Extractor

| | |
|---|---|
| **Primary** | `google/gemini-3.1-flash-lite`: Gemini 3.1 Flash Lite |
| **Fallback 1** | `google/gemini-3-flash-preview`: Gemini 3 Flash |
| **Fallback 2** | `openai/gpt-5.4-mini`: GPT-5.4 Mini |
| **Temperature** | 0.0 |
| **Input** | Native PDF bytes (base64 multimodal) |

Both extractor primaries use the lighter Gemini 3.1 Flash Lite model to keep extraction cheap and fast. Gemini 3 Flash remains available only as a fallback route.

## Judge

Runs on every field where primary and sibling disagree. No critical-field filter. Every disagreement is escalated.

| | |
|---|---|
| **Primary** | `z-ai/glm-5.1`: GLM-5.1 (Zhipu AI) |
| **Fallback 1** | `openai/gpt-5.4-mini`: GPT-5.4 Mini |
| **Fallback 2** | `moonshotai/kimi-k2.6`: Kimi K2.6 |
| **Input** | Per-field diffs (JSON), not the full PDF |
| **Output** | `JudgeVerdict` per field: `primary_wins` / `sibling_wins` / `trust_neither` |

The judge is **fail-open**: any exception (API error, malformed JSON, bad verdict) results in an empty `JudgeResult` with no verdicts rather than a pipeline failure.

## Merge Rules

`merge_dual_extractions(primary, sibling, judge_result)` applies these rules in priority order:

| Situation | Outcome |
|-----------|---------|
| Primary and sibling agree | Primary value |
| Judge verdict: `sibling_wins` | Sibling value |
| Judge verdict: `primary_wins` | Primary value |
| Judge verdict: `trust_neither` | Primary (safe fallback) |
| Disagreement, no verdict | Primary (safe fallback) |
| Field only in sibling | Sibling value |
| Field only in primary | Primary value |
| `extractions` key (audit metadata) | Always primary |

Nested dicts are merged recursively. Judge verdicts for nested fields use dotted key paths (e.g., `meta.source`).

## Gap Filler

After merge, if any of the following critical fields are `None`, `gap_filler.fill_fields()` is called once per missing field with a targeted per-field prompt:

- `pro_rata_share`
- `cap_type`
- `cap_rate`
- `base_year`
- `base_year_amount`

| | |
|---|---|
| **Primary** | `google/gemini-3.1-flash-lite` |
| **Fallback 1** | `google/gemini-3-flash-preview` |
| **Fallback 2** | `moonshotai/kimi-k2.6` |

The gap filler **only overwrites `None` values**. It never replaces a value already present. Each field attempt is independent and fail-open.

## Failure Modes

| Failure | Behavior |
|---------|----------|
| One extractor fails | Surviving side used alone, no judge needed |
| Both extractors fail | Raises primary exception |
| One extractor returns malformed JSON | Treated as failed, other side used alone |
| Both extractor JSON parse failures | Raises `ValueError` |
| Judge API error | Fail-open: `JudgeResult()` with empty verdicts |
| Judge returns malformed JSON | Fail-open: empty verdicts |
| Judge returns unknown verdict value | Defaults to `TRUST_NEITHER` |
| Gap filler field failure | Logged + Sentry breadcrumb, field stays `None` |
| Forensic R2 write failure | Logged + Sentry breadcrumb, never raises |
| `audit_pipeline_events` insert failure | Logged + Sentry breadcrumb, never raises |

## Forensic Replay

Every pipeline stage writes a raw JSON snapshot to R2:

| Stage | R2 Key |
|-------|--------|
| Primary extraction result | `extractions/raw/{document_id}/extract_primary.json` |
| Sibling extraction result | `extractions/raw/{document_id}/extract_sibling.json` |
| Judge input (diff payload) | `extractions/raw/{document_id}/judge_input.json` |
| Judge output (verdicts) | `extractions/raw/{document_id}/judge_output.json` |
| Gap filler result | `extractions/raw/{document_id}/gap_filler.json` *(only if invoked)* |
| Final merged result | `extractions/raw/{document_id}/merged.json` |

All writes are best-effort and use the existing `StorageClient` against Cloudflare R2.

## Pipeline Events

Every stage writes one row to `audit_pipeline_events` (RLS on `organization_id`):

| Column | Description |
|--------|-------------|
| `stage` | `extract_primary`, `extract_sibling`, `judge`, `merge`, `gap_filler` |
| `model` | Resolved model slug (accounting for fallbacks) |
| `tokens_used` | Token count for this stage |
| `duration_ms` | Wall-clock time |
| `outcome` | `success`, `failed`, or `fallback` |
| `attempt_number` | Which attempt in the fallback chain |
| `error` | Truncated error message (max 2000 chars) |

## Configuration

All models are configurable via environment variables:

```bash
OPENROUTER_API_KEY=sk-or-...
DUAL_EXTRACT_ENABLED=true

# Primary extractor
EXTRACTION_PRIMARY_MODEL=google/gemini-3.1-flash-lite
EXTRACTION_PRIMARY_FALLBACK=google/gemini-3-flash-preview
EXTRACTION_PRIMARY_FALLBACK_2=moonshotai/kimi-k2.6

# Sibling extractor
EXTRACTION_SIBLING_MODEL=google/gemini-3.1-flash-lite
EXTRACTION_SIBLING_FALLBACK=google/gemini-3-flash-preview
EXTRACTION_SIBLING_FALLBACK_2=openai/gpt-5.4-mini

# Judge
EXTRACTION_JUDGE_MODEL=z-ai/glm-5.1
EXTRACTION_JUDGE_FALLBACK=openai/gpt-5.4-mini
EXTRACTION_JUDGE_FALLBACK_2=moonshotai/kimi-k2.6

# Gap filler
GAP_FILLER_MODEL=google/gemini-3.1-flash-lite
GAP_FILLER_FALLBACK=google/gemini-3-flash-preview
GAP_FILLER_FALLBACK_2=moonshotai/kimi-k2.6
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/app/services/extraction/dual/dual_orchestrator.py` | Parallel dual extraction coordinator |
| `backend/app/services/extraction/dual/judge.py` | Per-field diff computation + judge model call |
| `backend/app/services/extraction/dual/dual_merger.py` | Merge logic applying judge verdicts |
| `backend/app/services/extraction/dual/dual_models.py` | `JudgeResult`, `JudgeVerdict`, `DualExtractionResult` models |
| `backend/app/services/extraction/gap_filler.py` | Re-extract missing critical fields |
| `backend/app/services/extraction/gap_filler_prompts.py` | Per-field prompt templates |
| `backend/app/services/extraction/forensic_store.py` | Write raw JSON snapshots to R2 |
| `backend/app/services/extraction/pipeline_events.py` | Emit audit rows to `audit_pipeline_events` |
| `backend/app/services/extraction/openrouter_client.py` | OpenRouter API client (native PDF + text) |
| `backend/app/services/extraction/processor.py` | Entry point; wires dual orchestrator into document worker |
| `backend/app/config.py` | All model and feature flag settings |

## Classification (Deferred)

CapVeri does not currently extract statement line items. When statement extraction is added in a future release, **classification must be a separate post-extraction LLM pass**, never embedded into the statement-extraction prompt itself. Mixing extraction and classification in one prompt produces lower-quality results for both tasks and makes each harder to iterate on independently.
