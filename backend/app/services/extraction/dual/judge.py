"""Judge module for dual-extract arbitration.

Computes per-field diffs between primary and sibling extractions,
then asks the judge model to resolve every disagreement.
Fail-open: any parse failure returns an empty JudgeResult rather than raising.
"""

from __future__ import annotations

import json
import logging
import math
import time
from typing import Any

import sentry_sdk

from app.config import settings
from app.services.extraction.dual.dual_models import (
    FieldVerdict,
    JudgeResult,
    JudgeVerdict,
)
from app.services.extraction.json_utils import extract_json
from app.services.extraction.openrouter_client import OpenRouterClient

logger = logging.getLogger(__name__)

JUDGE_SYSTEM_PROMPT = (
    "You are an expert commercial real estate lease analyst acting as an arbitration judge. "
    "You will receive two independent extractions of the same lease document. "
    "For each field where they disagree, decide which value is correct or whether neither can be trusted.\n\n"
    "Return ONLY a JSON object with this exact schema:\n"
    '{"verdicts": [{"field": "<field_name>", "verdict": "primary_wins|sibling_wins|trust_neither", '
    '"chosen_value": <value or null>, "rationale": "<one sentence>"}]}\n\n'
    "Rules:\n"
    "- Only include fields that appear in the disagreements list\n"
    "- primary_wins: extraction A's value is correct\n"
    "- sibling_wins: extraction B's value is correct\n"
    "- trust_neither: both values are suspect; caller will use a safe default\n"
    "- Be conservative: prefer trust_neither for financial fields (pro_rata_share, cap_rate, base_year_amount) when uncertain\n"
    "- For enum fields (cap_type), prefer whichever matches a valid enum if the other does not"
)


def _normalize_value(v: Any) -> Any:
    """Normalize a value for comparison (convert Decimal-like strings to floats)."""
    if v is None:
        return None
    if isinstance(v, str):
        try:
            f = float(v)
            # NaN/inf strings (e.g. "NaN", "inf") parse to non-finite floats that
            # break reflexivity (nan != nan), so an extraction holding such a token
            # would falsely diff against itself. Keep the stripped string instead.
            if not math.isfinite(f):
                return v.strip()
            # Round to avoid floating-point noise in comparisons
            return round(f, 10)
        except (ValueError, TypeError):
            return v.strip()
    return v


def compute_diff(
    a: dict[str, Any],
    b: dict[str, Any],
    _prefix: str = "",
) -> dict[str, tuple[Any, Any]]:
    """Compute per-field disagreements between two extraction dicts.

    Returns {dotted_field_name: (a_value, b_value)} for all fields that differ.
    - Nested dicts are recursed with dotted key names.
    - Lists are treated as atoms (compared whole).
    - None and missing key both treated as None.
    - The "extractions" key is skipped (it is audit metadata, not a data field).
    """
    diff: dict[str, tuple[Any, Any]] = {}
    all_keys = set(a.keys()) | set(b.keys())

    for key in all_keys:
        if key == "extractions":
            continue

        full_key = f"{_prefix}{key}" if _prefix else key
        a_val = a.get(key)
        b_val = b.get(key)

        # Recurse into nested dicts
        if isinstance(a_val, dict) and isinstance(b_val, dict):
            nested = compute_diff(a_val, b_val, _prefix=f"{full_key}.")
            diff.update(nested)
            continue

        # Normalize then compare
        if _normalize_value(a_val) != _normalize_value(b_val):
            diff[full_key] = (a_val, b_val)

    return diff


async def judge_extractions(
    reader: OpenRouterClient,
    diff: dict[str, tuple[Any, Any]],
    primary_json: dict[str, Any],
    sibling_json: dict[str, Any],
) -> JudgeResult:
    """Ask the judge model to arbitrate every disagreement.

    Returns a JudgeResult with a FieldVerdict for each disputed field.
    Fail-open: on any error, returns an empty JudgeResult so the merger
    can fall back to primary values.
    """
    if not diff:
        return JudgeResult()

    # Build a compact representation of disagreements + both JSONs
    disagreements = [
        {"field": field, "primary_value": a_val, "sibling_value": b_val}
        for field, (a_val, b_val) in diff.items()
    ]
    user_message = json.dumps(
        {
            "disagreements": disagreements,
            "primary_extraction": {
                k: v for k, v in primary_json.items() if k != "extractions"
            },
            "sibling_extraction": {
                k: v for k, v in sibling_json.items() if k != "extractions"
            },
        },
        default=str,
    )

    start = time.monotonic()
    try:
        response_text, tokens_used = await reader.extract(
            prompt=user_message,
            document_text="",
            model=settings.extraction_judge_model,
            temperature=0.0,
            fallback_models=[
                settings.extraction_judge_fallback,
                settings.extraction_judge_fallback_2,
            ],
            system_prompt=JUDGE_SYSTEM_PROMPT,
        )
    except Exception:
        logger.warning(
            "judge_extractions: LLM call failed — returning empty result (fail-open)",
            exc_info=True,
        )
        sentry_sdk.capture_message(
            "judge_extractions: LLM call failed",
            level="warning",
        )
        return JudgeResult()

    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "judge_extractions: completed in %dms, %d tokens, %d fields",
        duration_ms,
        tokens_used,
        len(diff),
    )

    try:
        raw = extract_json(response_text)
        raw_verdicts = raw.get("verdicts", [])
    except (ValueError, KeyError):
        logger.warning(
            "judge_extractions: could not parse judge response — fail-open",
            exc_info=True,
        )
        return JudgeResult(
            fields_judged=len(diff),
            model_used=settings.extraction_judge_model,
            tokens_used=tokens_used,
        )

    verdicts: list[FieldVerdict] = []
    for item in raw_verdicts:
        if not isinstance(item, dict):
            continue
        raw_verdict = item.get("verdict", "trust_neither")
        try:
            verdict_enum = JudgeVerdict(raw_verdict)
        except ValueError:
            verdict_enum = JudgeVerdict.TRUST_NEITHER

        verdicts.append(
            FieldVerdict(
                field=str(item.get("field", "")),
                verdict=verdict_enum,
                chosen_value=item.get("chosen_value"),
                rationale=str(item.get("rationale", "")),
            )
        )

    return JudgeResult(
        verdicts=verdicts,
        fields_judged=len(diff),
        model_used=settings.extraction_judge_model,
        tokens_used=tokens_used,
    )
