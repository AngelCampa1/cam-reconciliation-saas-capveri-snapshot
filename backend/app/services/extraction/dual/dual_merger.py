"""Merge dual extractions using judge verdicts.

Merge rules (priority order):
1. Fields where primary and sibling agree → primary value
2. Disagreements: judge PRIMARY_WINS → primary value
3. Disagreements: judge SIBLING_WINS → sibling value
4. Disagreements: judge TRUST_NEITHER → primary as safe fallback
5. Disagreements with no judge verdict → primary as safe fallback
6. Fields only in sibling (missing from primary) → sibling value
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.extraction.dual.dual_models import JudgeResult, JudgeVerdict

logger = logging.getLogger(__name__)


def merge_dual_extractions(
    primary: dict[str, Any],
    sibling: dict[str, Any],
    judge_result: JudgeResult,
) -> dict[str, Any]:
    """Merge primary and sibling extraction dicts using judge verdicts.

    Returns a new dict. Does not mutate primary or sibling.
    """
    merged: dict[str, Any] = {}
    all_keys = set(primary.keys()) | set(sibling.keys())

    for key in all_keys:
        # "extractions" is audit metadata — always prefer primary's copy
        if key == "extractions":
            merged[key] = primary.get(key, sibling.get(key))
            continue

        p_val = primary.get(key)
        s_val = sibling.get(key)

        # Key only in one side
        if key not in primary:
            merged[key] = s_val
            continue
        if key not in sibling:
            merged[key] = p_val
            continue

        # Both have the key — check if they agree
        if p_val == s_val:
            merged[key] = p_val
            continue

        # Nested dict: recurse (but still consult judge at leaf level via dotted key)
        if isinstance(p_val, dict) and isinstance(s_val, dict):
            merged[key] = _merge_nested(key, p_val, s_val, judge_result)
            continue

        # Disagreement — apply judge verdict
        merged[key] = _resolve_disagreement(key, p_val, s_val, judge_result)

    return merged


def _resolve_disagreement(
    field: str,
    primary_val: Any,
    sibling_val: Any,
    judge_result: JudgeResult,
) -> Any:
    """Choose a value for a disagreeing field using the judge verdict.

    When the judge provides a chosen_value (not None), that value is used directly —
    it may be a normalised form of the winning side's raw value. When chosen_value is
    None, the raw value from the winning side is used instead.

    Falls back to primary on TRUST_NEITHER or missing verdict.
    """
    verdict = judge_result.get_verdict(field)
    if verdict is None:
        logger.debug("merge: no verdict for field '%s', using primary", field)
        return primary_val

    if verdict.verdict == JudgeVerdict.SIBLING_WINS:
        chosen = (
            verdict.chosen_value if verdict.chosen_value is not None else sibling_val
        )
        logger.debug("merge: field '%s' → sibling wins (chosen=%r)", field, chosen)
        return chosen
    if verdict.verdict == JudgeVerdict.PRIMARY_WINS:
        chosen = (
            verdict.chosen_value if verdict.chosen_value is not None else primary_val
        )
        logger.debug("merge: field '%s' → primary wins (chosen=%r)", field, chosen)
        return chosen

    # TRUST_NEITHER: defensive fallback to primary; chosen_value is None by contract
    logger.debug("merge: field '%s' → trust_neither, defaulting to primary", field)
    return primary_val


def _merge_nested(
    parent_key: str,
    primary: dict[str, Any],
    sibling: dict[str, Any],
    judge_result: JudgeResult,
) -> dict[str, Any]:
    """Recursively merge nested dicts, consulting judge via dotted key paths."""
    merged: dict[str, Any] = {}
    all_keys = set(primary.keys()) | set(sibling.keys())

    for key in all_keys:
        dotted = f"{parent_key}.{key}"
        p_val = primary.get(key)
        s_val = sibling.get(key)

        if key not in primary:
            merged[key] = s_val
        elif key not in sibling:
            merged[key] = p_val
        elif p_val == s_val:
            merged[key] = p_val
        elif isinstance(p_val, dict) and isinstance(s_val, dict):
            merged[key] = _merge_nested(dotted, p_val, s_val, judge_result)
        else:
            # Try dotted key first, then plain key
            verdict = judge_result.get_verdict(dotted) or judge_result.get_verdict(key)
            if verdict is None:
                logger.debug(
                    "merge: no verdict for nested field '%s', using primary", dotted
                )
                merged[key] = p_val
            elif verdict.verdict == JudgeVerdict.SIBLING_WINS:
                chosen = (
                    verdict.chosen_value if verdict.chosen_value is not None else s_val
                )
                logger.debug(
                    "merge: nested field '%s' → sibling wins (chosen=%r)",
                    dotted,
                    chosen,
                )
                merged[key] = chosen
            elif verdict.verdict == JudgeVerdict.PRIMARY_WINS:
                chosen = (
                    verdict.chosen_value if verdict.chosen_value is not None else p_val
                )
                logger.debug(
                    "merge: nested field '%s' → primary wins (chosen=%r)",
                    dotted,
                    chosen,
                )
                merged[key] = chosen
            else:
                # TRUST_NEITHER: defensive fallback to primary
                logger.debug(
                    "merge: nested field '%s' → trust_neither, defaulting to primary",
                    dotted,
                )
                merged[key] = p_val

    return merged
