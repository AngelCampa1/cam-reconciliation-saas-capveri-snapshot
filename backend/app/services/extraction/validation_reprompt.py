"""Validation reflexion loop: re-prompt the model to reconcile invalid fields.

Runs after gap-fill, before the pipeline's final ``model_validate``. The merged
extraction is checked against business rules (``validation.py``). When the
validator reports a consistency ERROR, we re-prompt the model with the
validator's guidance, asking it to reconcile the coupled fields together, then
patch ``merged``.

Fail-open: bounded by ``max_attempts``; on exhaustion or any error we return
``merged`` unchanged so a human can verify in the HITL UI.
"""

from __future__ import annotations

import copy
import logging
from typing import Any

import sentry_sdk
from pydantic import ValidationError

from app.config import settings
from app.services.extraction.extraction_models import LeaseExtractionResult
from app.services.extraction.json_utils import coerce_llm_output, extract_json
from app.services.extraction.openrouter_client import OpenRouterClient
from app.services.extraction.validation import validate_extraction
from app.services.extraction.validation_reprompt_prompts import (
    build_reprompt,
    fields_to_reconcile,
)

logger = logging.getLogger(__name__)


def _structural_reconcile_fields(merged: dict[str, Any]) -> list[str]:
    """Return repairable coupled fields when schema validation fails first."""
    cap_type = merged.get("cap_type")
    cap_rate = merged.get("cap_rate")
    if cap_type not in (None, "", "none") and cap_rate is None:
        return ["cap_rate"]
    return []


async def reprompt_invalid_fields(
    reader: OpenRouterClient,
    pdf_bytes: bytes,
    filename: str,
    merged: dict[str, Any],
    *,
    max_attempts: int | None = None,
) -> tuple[dict[str, Any], int]:
    """Re-prompt the model to reconcile fields the validator flags as invalid."""
    if max_attempts is None:
        max_attempts = settings.extraction_validation_max_attempts

    total_tokens = 0

    for _ in range(max_attempts):
        try:
            candidate = copy.deepcopy(merged)
            coerce_llm_output(candidate)
            result_model = LeaseExtractionResult.model_validate(candidate)
        except (ValueError, ValidationError):
            invalid_fields = _structural_reconcile_fields(merged)
            if not invalid_fields:
                break
            guidance = [
                "cap_rate is required when cap_type is not 'none'; reconcile "
                "cap_type and cap_rate from the lease."
            ]
        else:
            validation = validate_extraction(result_model)
            if validation.is_valid:
                break

            invalid_fields = sorted({error.field for error in validation.errors})
            guidance = [error.message for error in validation.errors]

        reconcile_fields = fields_to_reconcile(invalid_fields)
        prompt = build_reprompt(invalid_fields, guidance)

        try:
            response_text, tokens, _ = await reader.extract_pdf(
                prompt=prompt,
                pdf_bytes=pdf_bytes,
                filename=filename,
                model=settings.validation_reprompt_model,
                temperature=0.0,
                fallback_models=[
                    settings.validation_reprompt_fallback,
                    settings.validation_reprompt_fallback_2,
                ],
            )
            total_tokens += tokens
            parsed = extract_json(response_text)
        except Exception:
            logger.warning(
                "validation_reprompt: re-extraction failed for %s - skipping",
                filename,
                exc_info=True,
            )
            sentry_sdk.add_breadcrumb(
                category="validation_reprompt",
                message="Validation re-prompt failed",
                data={"filename": filename, "fields": sorted(reconcile_fields)},
                level="warning",
            )
            break

        patched = False
        for field in reconcile_fields:
            if field in parsed:
                merged[field] = parsed[field]
                patched = True

        if not patched:
            break

    return merged, total_tokens
