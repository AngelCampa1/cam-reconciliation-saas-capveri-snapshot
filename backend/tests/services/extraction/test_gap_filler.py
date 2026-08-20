"""Tests for gap-filler module."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.extraction.gap_filler import (
    CRITICAL_FIELDS,
    fill_fields,
    get_missing_critical_fields,
)
from app.services.extraction.gap_filler_prompts import GAP_FILLER_PROMPTS


class TestGetMissingCriticalFields:
    def test_returns_empty_when_all_present(self) -> None:
        merged = {f: "value" for f in CRITICAL_FIELDS}
        assert get_missing_critical_fields(merged) == []

    def test_returns_none_fields(self) -> None:
        merged = {
            "pro_rata_share": "0.05",
            "cap_type": None,
            "cap_rate": None,
            "base_year": 2020,
            "base_year_amount": None,
        }
        missing = get_missing_critical_fields(merged)
        assert set(missing) == {"cap_type", "cap_rate", "base_year_amount"}

    def test_treats_absent_keys_as_missing(self) -> None:
        merged: dict = {}
        assert set(get_missing_critical_fields(merged)) == set(CRITICAL_FIELDS)

    def test_preserves_order_from_critical_fields(self) -> None:
        merged = {f: None for f in CRITICAL_FIELDS}
        assert get_missing_critical_fields(merged) == CRITICAL_FIELDS


class TestFillFields:
    @pytest.mark.asyncio
    async def test_fills_none_field_from_llm_response(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(json.dumps({"cap_rate": "0.05"}), 100, "model")
        )
        merged: dict = {"cap_rate": None}

        result, tokens = await fill_fields(
            reader, b"pdf", "lease.pdf", ["cap_rate"], merged
        )

        assert result["cap_rate"] == "0.05"
        assert tokens == 100

    @pytest.mark.asyncio
    async def test_does_not_overwrite_non_none_value(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(json.dumps({"cap_rate": "0.99"}), 100, "model")
        )
        merged: dict = {"cap_rate": "0.05"}

        result, _ = await fill_fields(reader, b"pdf", "lease.pdf", ["cap_rate"], merged)

        assert result["cap_rate"] == "0.05"

    @pytest.mark.asyncio
    async def test_skips_field_with_no_prompt(self) -> None:
        reader = MagicMock()
        merged: dict = {"unknown_field": None}

        result, tokens = await fill_fields(
            reader, b"pdf", "lease.pdf", ["unknown_field"], merged
        )

        assert result["unknown_field"] is None
        assert tokens == 0
        reader.extract_pdf.assert_not_called()

    @pytest.mark.asyncio
    async def test_fail_open_on_llm_exception(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(side_effect=RuntimeError("API error"))
        merged: dict = {"cap_rate": None}

        result, tokens = await fill_fields(
            reader, b"pdf", "lease.pdf", ["cap_rate"], merged
        )

        assert result["cap_rate"] is None
        assert tokens == 0

    @pytest.mark.asyncio
    async def test_accumulates_tokens_across_fields(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            side_effect=[
                (json.dumps({"cap_rate": "0.05"}), 100, "model"),
                (json.dumps({"base_year": 2020}), 150, "model"),
            ]
        )
        merged: dict = {"cap_rate": None, "base_year": None}

        _, tokens = await fill_fields(
            reader, b"pdf", "lease.pdf", ["cap_rate", "base_year"], merged
        )

        assert tokens == 250

    @pytest.mark.asyncio
    async def test_skips_null_value_in_llm_response(self) -> None:
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(json.dumps({"cap_rate": None}), 50, "model")
        )
        merged: dict = {"cap_rate": None}

        result, _ = await fill_fields(reader, b"pdf", "lease.pdf", ["cap_rate"], merged)

        assert result["cap_rate"] is None


class TestGapFillerPrompts:
    def test_cap_type_prompt_uses_schema_values(self) -> None:
        prompt = GAP_FILLER_PROMPTS["cap_type"]

        assert '{"cap_type": "non_cumulative"}' in prompt
        assert "Never return uppercase enum names or LESSER_OF" in prompt
