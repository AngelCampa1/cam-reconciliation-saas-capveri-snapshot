"""Utilities for extracting JSON from messy model responses.

Handles common issues: markdown code fences, <think> reasoning blocks,
leading/trailing prose, and malformed JSON.
"""

from __future__ import annotations

import json
import re
from typing import Any

# Compiled regex for stripping leading DeepSeek R1 <think>...</think> blocks.
_THINK_TAG_RE = re.compile(r"\A<think>.*?</think>\s*", re.DOTALL)

# Matches ```json ... ``` or ``` ... ``` code fences.
_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)

_LEASE_EXCERPT_PATTERNS = (
    re.compile(r"\badministrative fee\b", re.IGNORECASE),
    re.compile(r"\badministration fee\b", re.IGNORECASE),
    re.compile(r"\badmin fee\b", re.IGNORECASE),
    re.compile(r"\bsupervision fee\b", re.IGNORECASE),
    re.compile(r"\bproportional share\b", re.IGNORECASE),
    re.compile(r"\bproportionate share\b", re.IGNORECASE),
    re.compile(r"\bpro[- ]?rata share\b", re.IGNORECASE),
    re.compile(r"\bcommon area maintenance payment\b", re.IGNORECASE),
    re.compile(r"\bbase rate of\b", re.IGNORECASE),
)


def strip_thinking_tags(text: str) -> str:
    """Remove a leading DeepSeek R1 <think>...</think> block.

    Only the first leading block is removed.  Subsequent occurrences
    inside the actual response content are left intact.
    """
    return _THINK_TAG_RE.sub("", text)


def extract_json(text: str) -> dict[str, Any]:
    """Extract a JSON object from a model response.

    Tries multiple strategies in order:
    1. Strip ``<think>`` blocks, then try direct parse
    2. Extract content from markdown code fences
    3. Find the first ``{`` and last ``}`` and parse that substring

    Raises:
        ValueError: If no valid JSON can be extracted.
    """
    if not text or not text.strip():
        raise ValueError("Empty response text")

    # Step 1: Strip think tags
    cleaned = strip_thinking_tags(text).strip()

    # Step 2: Try direct parse
    try:
        result = json.loads(cleaned)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, RecursionError):
        # RecursionError: json.loads recurses per nesting level, so a deeply
        # nested (or maliciously nested) model response blows the stack. Treat
        # it like any other parse failure so this function keeps its contract of
        # raising only ValueError — callers (e.g. the judge) catch ValueError to
        # fail open, and a non-ValueError would crash them instead.
        pass

    # Step 3: Try extracting from code fences
    fence_match = _CODE_FENCE_RE.search(cleaned)
    if fence_match:
        try:
            result = json.loads(fence_match.group(1).strip())
            if isinstance(result, dict):
                return result
        except (json.JSONDecodeError, RecursionError):
            pass

    # Step 4: Find first { and last } — brute force substring
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace : last_brace + 1]
        try:
            result = json.loads(candidate)
            if isinstance(result, dict):
                return result
        except (json.JSONDecodeError, RecursionError):
            pass

    raise ValueError(f"Could not extract JSON from response (length={len(text)})")


def coerce_llm_output(raw: dict) -> None:
    """Coerce common LLM JSON quirks to match Pydantic schema.

    Handles: null pro_rata_share/admin_fee_percentage, non-string extraction
    values, and empty source_text fields. Called before model_validate so
    validation failures from benign LLM output variations are avoided.
    """
    if raw.get("admin_fee_percentage") is None:
        raw["admin_fee_percentage"] = "0"

    if raw.get("pro_rata_share") is None:
        raw["pro_rata_share"] = "0"

    for ext in raw.get("extractions", []):
        if ext.get("value") is None:
            ext["value"] = "null"
        elif not isinstance(ext["value"], str):
            ext["value"] = str(ext["value"])
        if not ext.get("source_text"):
            ext["source_text"] = "Not explicitly stated in document."


def truncate_document(text: str, max_chars: int) -> str:
    """Truncate document text to max_chars, preserving page markers.

    If truncation occurs mid-page, appends a truncation notice.
    """
    if len(text) <= max_chars:
        return text

    truncated = text[:max_chars]

    # Try to cut at the last page marker boundary
    last_marker = truncated.rfind("--- PAGE ")
    if last_marker > max_chars * 0.8:
        truncated = truncated[:last_marker]

    return truncated + "\n\n[Document truncated — remaining pages omitted]"


def prioritize_lease_excerpts(text: str, max_chars: int) -> str:
    """Prepend exact high-signal lease excerpts before normal truncation.

    Long SEC HTML leases often place REA/declaration exhibits after the main
    lease. A head-only truncation can omit late CAM fee clauses even though they
    govern recovery. This helper copies small exact snippets around
    lease-recovery keywords, then applies the same character cap.
    """
    excerpts = _find_lease_excerpts(text)
    if not excerpts:
        return truncate_document(text, max_chars)

    excerpt_block = "\n\n".join(
        f"[Excerpt {index + 1}]\n{excerpt}" for index, excerpt in enumerate(excerpts)
    )
    prioritized = (
        "[High-signal lease recovery excerpts copied verbatim from the document]\n"
        f"{excerpt_block}\n\n"
        "[Full document text]\n"
        f"{text}"
    )
    return truncate_document(prioritized, max_chars)


def _find_lease_excerpts(text: str) -> list[str]:
    windows: list[tuple[int, int]] = []
    for pattern in _LEASE_EXCERPT_PATTERNS:
        for match in pattern.finditer(text):
            start = max(0, match.start() - 180)
            end = min(len(text), match.end() + 850)
            if any(
                start >= existing_start and end <= existing_end
                for existing_start, existing_end in windows
            ):
                continue
            windows.append((start, end))

    merged: list[tuple[int, int]] = []
    for start, end in sorted(windows):
        if not merged or start > merged[-1][1] + 200:
            merged.append((start, end))
            continue
        previous_start, previous_end = merged[-1]
        merged[-1] = (previous_start, max(previous_end, end))

    excerpts = []
    for start, end in merged[:8]:
        excerpt = text[start:end].strip()
        if excerpt:
            excerpts.append(excerpt)
    return excerpts
