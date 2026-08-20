"""Tests for the validation reflexion (re-prompt) loop.

The validator (validation.py) is internal business logic and is NEVER mocked.
Only the OpenRouter client (external boundary) is mocked.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.extraction.validation_reprompt import reprompt_invalid_fields
from app.services.extraction.validation_reprompt_prompts import (
    RECONCILIATION_GROUPS,
    build_reprompt,
    fields_to_reconcile,
)


def _extractions() -> list[dict]:
    return [
        {
            "field": "pro_rata_share",
            "value": "0.05",
            "confidence": 90,
            "source_text": "Tenant's share is 5%.",
        }
    ]


def _orphaned_cap_rate_merged() -> dict:
    """Merged dict that validates structurally but fails business rules.

    cap_type NONE + a non-null cap_rate is an orphaned cap_rate: pydantic
    accepts it, but validate_extraction reports a consistency error on cap_type.
    """
    return {
        "pro_rata_share": "0.05",
        "cap_type": "none",
        "cap_rate": "0.05",
        "extractions": _extractions(),
    }


def _clean_merged() -> dict:
    return {
        "pro_rata_share": "0.05",
        "cap_type": "none",
        "cap_rate": None,
        "extractions": _extractions(),
    }


class TestFieldsToReconcile:
    def test_cap_field_expands_to_full_cap_group(self) -> None:
        assert fields_to_reconcile(["cap_type"]) == {"cap_type", "cap_rate"}
        assert fields_to_reconcile(["cap_rate"]) == {"cap_type", "cap_rate"}

    def test_unknown_field_maps_to_itself(self) -> None:
        assert fields_to_reconcile(["base_year"]) == {"base_year"}

    def test_reconciliation_groups_cover_cap_pair(self) -> None:
        assert RECONCILIATION_GROUPS["cap_type"] == ("cap_type", "cap_rate")
        assert RECONCILIATION_GROUPS["cap_rate"] == ("cap_type", "cap_rate")


class TestBuildReprompt:
    def test_includes_guidance_messages_and_cap_fields(self) -> None:
        prompt = build_reprompt(
            ["cap_type"], ["Cap type is required when cap rate is set"]
        )
        assert "Cap type is required when cap rate is set" in prompt
        assert "cap_type" in prompt
        assert "cap_rate" in prompt

    def test_non_cap_field_omits_cap_group_detail(self) -> None:
        # A field outside the cap group reconciles to itself and must NOT pull
        # in the cap-specific guidance block.
        prompt = build_reprompt(["base_year"], ["Base year looks wrong"])
        assert "Base year looks wrong" in prompt
        assert '"base_year": ...' in prompt
        assert "CAM expense cap" not in prompt


class TestRepromptInvalidFields:
    @pytest.mark.asyncio
    async def test_reconciles_orphaned_cap_rate(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(
                json.dumps({"cap_type": "non_cumulative", "cap_rate": "0.05"}),
                120,
                "model",
            )
        )
        merged = _orphaned_cap_rate_merged()

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=2
        )

        assert result["cap_type"] == "non_cumulative"
        assert result["cap_rate"] == "0.05"
        assert tokens == 120
        # One re-extract was enough — the second attempt validated clean.
        reader.extract_pdf.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_skips_when_already_valid(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock()
        merged = _clean_merged()

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=2
        )

        assert tokens == 0
        assert result["cap_rate"] is None
        reader.extract_pdf.assert_not_called()

    @pytest.mark.asyncio
    async def test_reconciles_cap_type_missing_cap_rate_structural_error(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(
                json.dumps({"cap_type": "cumulative", "cap_rate": "0.06"}),
                130,
                "model",
            )
        )
        merged = {
            "pro_rata_share": "0.05",
            "cap_type": "cumulative",
            "cap_rate": None,
            "extractions": _extractions(),
        }

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=2
        )

        assert tokens == 130
        reader.extract_pdf.assert_awaited_once()
        assert result["cap_type"] == "cumulative"
        assert result["cap_rate"] == "0.06"

    @pytest.mark.asyncio
    async def test_fail_open_on_llm_exception(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(side_effect=RuntimeError("API down"))
        merged = _orphaned_cap_rate_merged()

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=2
        )

        assert tokens == 0
        # Original (still-invalid) values preserved; nothing clobbered.
        assert result["cap_type"] == "none"
        assert result["cap_rate"] == "0.05"

    @pytest.mark.asyncio
    async def test_exhausts_attempts_when_model_keeps_failing(self) -> None:
        reader = MagicMock()
        # Model keeps returning the same orphaned state -> never validates.
        reader.extract_pdf = AsyncMock(
            return_value=(
                json.dumps({"cap_type": "none", "cap_rate": "0.05"}),
                50,
                "model",
            )
        )
        merged = _orphaned_cap_rate_merged()

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=3
        )

        assert reader.extract_pdf.await_count == 3
        assert tokens == 150
        assert result["cap_type"] == "none"

    @pytest.mark.asyncio
    async def test_stops_when_model_returns_no_reconcile_fields(self) -> None:
        reader = MagicMock()
        # Response has none of the coupled fields -> nothing to patch, stop.
        reader.extract_pdf = AsyncMock(
            return_value=(json.dumps({"unrelated": "x"}), 30, "model")
        )
        merged = _orphaned_cap_rate_merged()

        result, tokens = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=3
        )

        # Called once, then stops (no progress possible).
        reader.extract_pdf.assert_awaited_once()
        assert tokens == 30
        assert result["cap_type"] == "none"

    @pytest.mark.asyncio
    async def test_only_patches_reconcile_group_fields(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(
                json.dumps(
                    {
                        "cap_type": "non_cumulative",
                        "cap_rate": "0.05",
                        "pro_rata_share": "0.99",
                    }
                ),
                40,
                "model",
            )
        )
        merged = _orphaned_cap_rate_merged()

        result, _ = await reprompt_invalid_fields(
            reader, b"pdf", "lease.pdf", merged, max_attempts=2
        )

        # pro_rata_share is not in the reconcile group -> must not be overwritten.
        assert result["pro_rata_share"] == "0.05"
        assert result["cap_type"] == "non_cumulative"
