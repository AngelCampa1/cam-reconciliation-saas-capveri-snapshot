"""Gap-filler: re-extract specific missing critical fields after dual-merge.

Called when the merged extraction has None for one or more critical fields.
Uses a native-PDF multimodal model for maximum recall on hard-to-find fields.
Fail-open: each field attempt is independent; partial failures are acceptable.
"""

from __future__ import annotations

import logging
from typing import Any

import sentry_sdk

from app.config import settings
from app.services.extraction.gap_filler_prompts import GAP_FILLER_PROMPTS
from app.services.extraction.json_utils import extract_json
from app.services.extraction.openrouter_client import OpenRouterClient

logger = logging.getLogger(__name__)

CRITICAL_FIELDS = [
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "base_year",
    "base_year_amount",
]


def get_missing_critical_fields(merged: dict[str, Any]) -> list[str]:
    """Return the subset of CRITICAL_FIELDS that are None or absent in merged."""
    return [f for f in CRITICAL_FIELDS if merged.get(f) is None]


async def fill_fields(
    reader: OpenRouterClient,
    pdf_bytes: bytes,
    filename: str,
    missing_fields: list[str],
    merged: dict[str, Any],
) -> tuple[dict[str, Any], int]:
    """Re-extract specific missing fields from the PDF and patch merged.

    Only overwrites None values — never replaces a non-None value already
    present in merged from the main extraction.

    Args:
        reader: OpenRouter client.
        pdf_bytes: Raw PDF bytes.
        filename: Original PDF filename.
        missing_fields: Fields to attempt re-extraction for.
        merged: The merged extraction dict (modified in-place).

    Returns:
        Tuple of (updated_merged_dict, total_tokens_used).
    """
    total_tokens = 0

    for field in missing_fields:
        prompt = GAP_FILLER_PROMPTS.get(field)
        if not prompt:
            logger.debug("gap_filler: no prompt for field '%s', skipping", field)
            continue

        try:
            response_text, tokens, _ = await reader.extract_pdf(
                prompt=prompt,
                pdf_bytes=pdf_bytes,
                filename=filename,
                model=settings.gap_filler_model,
                temperature=0.0,
                fallback_models=[
                    settings.gap_filler_fallback,
                    settings.gap_filler_fallback_2,
                ],
            )
            total_tokens += tokens

            parsed = extract_json(response_text)
            if field in parsed and parsed[field] is not None:
                # Only write if still None in merged (don't overwrite a concurrent fill)
                if merged.get(field) is None:
                    merged[field] = parsed[field]
                    logger.info(
                        "gap_filler: filled '%s' = %r for %s",
                        field,
                        parsed[field],
                        filename,
                    )
        except Exception:
            logger.warning(
                "gap_filler: failed for field '%s' on %s — skipping",
                field,
                filename,
                exc_info=True,
            )
            sentry_sdk.add_breadcrumb(
                category="gap_filler",
                message=f"Gap-fill failed for field={field}",
                data={"field": field, "filename": filename},
                level="warning",
            )

    return merged, total_tokens
