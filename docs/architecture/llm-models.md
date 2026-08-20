# LLM Model Selection

All LLM calls route through **OpenRouter** (`openrouter.ai/api/v1`) using an OpenAI-compatible API. There is no direct Anthropic/OpenAI/Google SDK dependency and no Claude or AWS Textract usage anywhere in the pipeline — every model is reached through a single OpenRouter API key.

The source of truth for every model slug is `backend/app/config.py`. This document mirrors those settings; if the two ever disagree, `config.py` wins.

## Pipeline at a Glance

CapVeri runs a **dual-extract + judge** pipeline for lease document processing:

1. Two independent models extract the same PDF in parallel (primary + sibling).
2. A judge model arbitrates every per-field disagreement (text-only role).
3. A deterministic Python merger applies the judge verdicts (fail-open to primary).
4. A gap-filler re-extracts any critical fields still missing after the merge.

Native-PDF multimodal extraction is used throughout — no OCR text round-trip. See [dual-extraction.md](dual-extraction.md) for the full stage-by-stage flow, merge rules, and failure modes.

Three additional text-only roles run downstream of extraction: cross-document reconciliation, GL anomaly analysis, and expense-pool matching.

## Model Roles

Every role declares a primary plus two fallbacks. The full fallback chain is forwarded to OpenRouter via the request `models` array, so failover happens server-side in a single round-trip.

| Role | Setting | Primary | Fallback 1 | Fallback 2 | PDF? |
|---|---|---|---|---|---|
| Extraction (primary) | `extraction_primary_model` | `google/gemini-3.1-flash-lite` | `google/gemini-3-flash-preview` | `moonshotai/kimi-k2.6` | ✅ |
| Extraction (sibling) | `extraction_sibling_model` | `google/gemini-3.1-flash-lite` | `google/gemini-3-flash-preview` | `openai/gpt-5.4-mini` | ✅ |
| Judge | `extraction_judge_model` | `z-ai/glm-5.1` | `openai/gpt-5.4-mini` | `moonshotai/kimi-k2.6` | ❌ |
| Gap filler | `gap_filler_model` | `google/gemini-3.1-flash-lite` | `google/gemini-3-flash-preview` | `moonshotai/kimi-k2.6` | ✅ |
| Cross-doc reconciliation | `cross_doc_model` | `z-ai/glm-5.1` | `openai/gpt-5.4-mini` | `moonshotai/kimi-k2.6` | ❌ |
| GL anomaly analysis | `gl_analysis_model` | `z-ai/glm-5.1` | `openai/gpt-5.4-mini` | `moonshotai/kimi-k2.6` | ❌ |
| Pool matching | `pool_matching_model` | `moonshotai/kimi-k2.6` | `openai/gpt-5.4-mini` | `google/gemini-3-flash-preview` | ❌ |

### Role notes

- **Extraction primary / sibling** receive the same PDF bytes and the same lease prompt and run concurrently via `asyncio.gather`. Both primary routes use the lighter, cheaper Gemini 3.1 Flash Lite model; Gemini 3 Flash is kept as a fallback, not a primary route.
- **Judge** sees only the per-field diff payload (JSON), never the full PDF. It is fail-open: any error yields an empty verdict set and the merger falls back to the primary value.
- **Gap filler** re-extracts specific missing critical fields on demand (multimodal, per-field prompts). It only overwrites `None` values.
- **Cross-doc reconciliation** and **GL anomaly analysis** are text-only reasoning roles over already-extracted summaries.
- **Pool matching** is a cheap classification role mapping GL line items to expense pools.

## Roles by PDF Capability

- **PDF-input roles** (extraction primary, extraction sibling, gap filler) chain only through PDF-capable models.
- **Text-input roles** (judge, cross-doc, GL analysis, pool matching) operate on JSON/text and may use either text-only or multimodal models.

## Document Truncation Cap

Text-only LLM calls truncate their document input at `extraction_max_document_chars` (default `100_000`) to bound token cost.

## Token Usage

The OpenRouter client returns `tokens_used` (prompt + completion tokens) for every call, so each stage's token consumption is observable. There is **no** per-model dollar cost table or audit-level budget meter in this repo yet — a `pricing.py` cost-estimation module is a candidate import from the sibling repo, not a current dependency. Until it lands, treat token counts (not dollar amounts) as the cost signal.

## Why OpenRouter

1. **Single API key** — one `OPENROUTER_API_KEY` covers every provider.
2. **OpenAI-compatible** — one client works with any model slug, no per-provider SDK.
3. **Server-side fallback** — the request `models` array is honored by OpenRouter; failover takes one round-trip.
4. **Cost transparency** — OpenRouter provides unified usage tracking across providers.

## Overriding Models

Set env vars before starting the backend. Slugs must exist on OpenRouter (verify with `curl https://openrouter.ai/api/v1/models`):

```bash
OPENROUTER_API_KEY=sk-or-...

# Dual-extract pipeline
EXTRACTION_PRIMARY_MODEL=google/gemini-3.1-flash-lite
EXTRACTION_PRIMARY_FALLBACK=google/gemini-3-flash-preview
EXTRACTION_SIBLING_MODEL=google/gemini-3.1-flash-lite
EXTRACTION_SIBLING_FALLBACK=google/gemini-3-flash-preview
EXTRACTION_JUDGE_MODEL=z-ai/glm-5.1

# Gap filler
GAP_FILLER_MODEL=google/gemini-3.1-flash-lite
GAP_FILLER_FALLBACK=google/gemini-3-flash-preview

# Text-only downstream roles
CROSS_DOC_MODEL=z-ai/glm-5.1
GL_ANALYSIS_MODEL=z-ai/glm-5.1
POOL_MATCHING_MODEL=moonshotai/kimi-k2.6
```

Each role also accepts `*_FALLBACK` and `*_FALLBACK_2` overrides (see `backend/app/config.py` for the complete list).

## Statement Classification (Deferred)

CapVeri does not currently run a dedicated statement line-item classifier or a findings critic as standing pipeline stages. When statement extraction is added in a future release, classification must be a **separate post-extraction LLM pass** — never embedded into the extraction prompt itself. Mixing extraction and classification in one prompt degrades both tasks and makes each harder to iterate on.
