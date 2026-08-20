"""Dual-extract orchestrator.

Runs primary and sibling PDF extractors in parallel, judges every disagreement,
and merges into a single extraction result.

Failure modes:
  - One side fails → surviving side used alone (no judge needed)
  - Both fail      → raises the primary exception
  - JSON parse fails on one side → that side treated as failed
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import sentry_sdk

from app.config import settings
from app.services.extraction.dual.dual_merger import merge_dual_extractions
from app.services.extraction.dual.dual_models import DualExtractionResult, JudgeResult
from app.services.extraction.dual.judge import compute_diff, judge_extractions
from app.services.extraction.json_utils import coerce_llm_output, extract_json
from app.services.extraction.openrouter_client import (
    OpenRouterClient,
    get_openrouter_client,
)
from app.services.extraction.prompts import LEASE_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)


class DualExtractOrchestrator:
    """Parallel dual-extraction orchestrator with judge arbitration.

    Runs primary and sibling extractors against the same PDF in parallel,
    then merges disagreements via the judge model.
    """

    def __init__(self, reader: OpenRouterClient | None = None) -> None:
        self.reader = reader or get_openrouter_client()

    async def extract_lease(
        self,
        pdf_bytes: bytes,
        filename: str,
    ) -> tuple[DualExtractionResult, dict[str, Any]]:
        """Run dual extraction and return (DualExtractionResult, merged_json_dict).

        The merged dict is raw JSON — caller must validate with LeaseExtractionResult.

        Args:
            pdf_bytes: Raw PDF bytes fetched from R2.
            filename: Original filename (used in the file content part).

        Returns:
            Tuple of (DualExtractionResult metadata, merged extraction dict).

        Raises:
            Exception: If both primary and sibling extraction fail.
        """
        # Run both extractors in parallel
        results = await asyncio.gather(
            self._run_primary(pdf_bytes, filename),
            self._run_sibling(pdf_bytes, filename),
            return_exceptions=True,
        )

        primary_result, sibling_result = results[0], results[1]

        primary_ok = not isinstance(primary_result, BaseException)
        sibling_ok = not isinstance(sibling_result, BaseException)

        if not primary_ok and not sibling_ok:
            logger.error("dual_orchestrator: both extractors failed for %s", filename)
            assert isinstance(primary_result, BaseException)
            sentry_sdk.capture_exception(primary_result)
            raise primary_result

        # Unpack successful results; treat failed sides as empty
        if primary_ok:
            p_text, p_tokens, p_model, p_duration_ms = primary_result  # type: ignore[misc]
        else:
            assert isinstance(primary_result, BaseException)
            logger.warning(
                "dual_orchestrator: primary extraction failed, using sibling alone",
                exc_info=primary_result,
            )
            sentry_sdk.capture_exception(primary_result)
            p_text, p_tokens, p_model, p_duration_ms = (
                "",
                0,
                settings.extraction_primary_model,
                0,
            )

        if sibling_ok:
            s_text, s_tokens, s_model, s_duration_ms = sibling_result  # type: ignore[misc]
        else:
            assert isinstance(sibling_result, BaseException)
            logger.warning(
                "dual_orchestrator: sibling extraction failed, using primary alone",
                exc_info=sibling_result,
            )
            sentry_sdk.capture_exception(sibling_result)
            s_text, s_tokens, s_model, s_duration_ms = (
                "",
                0,
                settings.extraction_sibling_model,
                0,
            )

        # Parse each side's JSON
        primary_json: dict[str, Any] = {}
        primary_parse_ok = False
        if primary_ok and p_text:
            try:
                primary_json = extract_json(p_text)
                coerce_llm_output(primary_json)
                primary_parse_ok = True
            except Exception:
                logger.warning(
                    "dual_orchestrator: primary JSON parse failed for %s",
                    filename,
                    exc_info=True,
                )
                primary_ok = False

        sibling_json: dict[str, Any] = {}
        sibling_parse_ok = False
        if sibling_ok and s_text:
            try:
                sibling_json = extract_json(s_text)
                coerce_llm_output(sibling_json)
                sibling_parse_ok = True
            except Exception:
                logger.warning(
                    "dual_orchestrator: sibling JSON parse failed for %s",
                    filename,
                    exc_info=True,
                )
                sibling_ok = False

        if not primary_ok and not sibling_ok:
            raise ValueError(
                f"dual_orchestrator: both extractor JSON parse failures for {filename}"
            )

        dual_result = DualExtractionResult(
            primary_json=primary_json if primary_parse_ok else {},
            sibling_json=sibling_json if sibling_parse_ok else {},
            primary_model=p_model,
            sibling_model=s_model,
            primary_tokens=p_tokens,
            sibling_tokens=s_tokens,
            primary_duration_ms=p_duration_ms,
            sibling_duration_ms=s_duration_ms,
            primary_failed=not primary_parse_ok,
            sibling_failed=not sibling_parse_ok,
        )

        # If only one side succeeded, use it directly (no judge needed)
        if not primary_parse_ok:
            return dual_result, sibling_json
        if not sibling_parse_ok:
            return dual_result, primary_json

        # Both succeeded — judge disagreements and merge
        diff = compute_diff(primary_json, sibling_json)

        judge_result: JudgeResult
        if diff:
            logger.info(
                "dual_orchestrator: judging %d disagreements for %s",
                len(diff),
                filename,
            )
            judge_start = time.monotonic()
            judge_result = await judge_extractions(
                self.reader, diff, primary_json, sibling_json
            )
            judge_duration_ms = int((time.monotonic() - judge_start) * 1000)
        else:
            judge_result = JudgeResult()
            judge_duration_ms = 0

        merged = merge_dual_extractions(primary_json, sibling_json, judge_result)

        # Populate judge telemetry back into the result
        dual_result.judge_model = judge_result.model_used
        dual_result.judge_tokens = judge_result.tokens_used
        dual_result.judge_duration_ms = judge_duration_ms
        dual_result.fields_judged = judge_result.fields_judged

        logger.info(
            "dual_orchestrator: merged extraction for %s — "
            "%d fields judged, primary=%s sibling=%s judge=%s",
            filename,
            judge_result.fields_judged,
            p_model,
            s_model,
            judge_result.model_used,
        )

        return dual_result, merged

    async def _run_primary(
        self,
        pdf_bytes: bytes,
        filename: str,
    ) -> tuple[str, int, str, int]:
        """Run primary PDF extraction. Returns (text, tokens, model, duration_ms)."""
        start = time.monotonic()
        text, tokens, resolved_model = await self.reader.extract_pdf(
            prompt=LEASE_EXTRACTION_PROMPT,
            pdf_bytes=pdf_bytes,
            filename=filename,
            model=settings.extraction_primary_model,
            temperature=0.0,
            fallback_models=[
                settings.extraction_primary_fallback,
                settings.extraction_primary_fallback_2,
            ],
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return text, tokens, resolved_model, duration_ms

    async def _run_sibling(
        self,
        pdf_bytes: bytes,
        filename: str,
    ) -> tuple[str, int, str, int]:
        """Run sibling PDF extraction. Returns (text, tokens, model, duration_ms)."""
        start = time.monotonic()
        text, tokens, resolved_model = await self.reader.extract_pdf(
            prompt=LEASE_EXTRACTION_PROMPT,
            pdf_bytes=pdf_bytes,
            filename=filename,
            model=settings.extraction_sibling_model,
            temperature=0.0,
            fallback_models=[
                settings.extraction_sibling_fallback,
                settings.extraction_sibling_fallback_2,
            ],
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return text, tokens, resolved_model, duration_ms
