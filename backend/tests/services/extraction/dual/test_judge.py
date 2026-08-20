"""Tests for dual-extract judge module."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.extraction.dual.dual_models import (
    JudgeResult,
    JudgeVerdict,
)
from app.services.extraction.dual.judge import compute_diff, judge_extractions


class TestComputeDiff:
    def test_no_diff_when_identical(self) -> None:
        a = {"field1": "value", "field2": 42}
        b = {"field1": "value", "field2": 42}
        assert compute_diff(a, b) == {}

    def test_detects_simple_disagreement(self) -> None:
        a = {"cap_rate": "0.05", "base_year": 2020}
        b = {"cap_rate": "0.06", "base_year": 2020}
        diff = compute_diff(a, b)
        assert "cap_rate" in diff
        assert diff["cap_rate"] == ("0.05", "0.06")

    def test_treats_none_and_missing_as_equivalent(self) -> None:
        a = {"field": None}
        b = {}
        assert compute_diff(a, b) == {}

    def test_skips_extractions_key(self) -> None:
        a = {"extractions": [{"field": "x"}], "name": "A"}
        b = {"extractions": [{"field": "y"}], "name": "A"}
        diff = compute_diff(a, b)
        assert "extractions" not in diff
        assert diff == {}

    def test_recurses_into_nested_dicts(self) -> None:
        a = {"meta": {"source": "a", "version": 1}}
        b = {"meta": {"source": "b", "version": 1}}
        diff = compute_diff(a, b)
        assert "meta.source" in diff
        assert "meta.version" not in diff

    def test_treats_lists_as_atoms(self) -> None:
        a = {"excluded_pools": ["capital", "admin"]}
        b = {"excluded_pools": ["capital"]}
        diff = compute_diff(a, b)
        assert "excluded_pools" in diff

    def test_normalizes_decimal_like_strings(self) -> None:
        """0.050000 and 0.05 should be considered equal."""
        a = {"cap_rate": "0.050000"}
        b = {"cap_rate": "0.05"}
        assert compute_diff(a, b) == {}

    def test_detects_none_vs_value_as_diff(self) -> None:
        a = {"base_year": None}
        b = {"base_year": 2020}
        diff = compute_diff(a, b)
        assert "base_year" in diff

    def test_uses_dotted_prefix_in_recursive_calls(self) -> None:
        a = {"outer": {"inner": {"deep": "x"}}}
        b = {"outer": {"inner": {"deep": "y"}}}
        diff = compute_diff(a, b)
        assert "outer.inner.deep" in diff


class TestJudgeExtractions:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_diff(self) -> None:
        reader = MagicMock()
        result = await judge_extractions(reader, {}, {}, {})
        assert isinstance(result, JudgeResult)
        assert result.verdicts == []
        assert not reader.extract.called

    @pytest.mark.asyncio
    async def test_parses_verdicts_from_llm_response(self) -> None:
        reader = MagicMock()
        llm_json = json.dumps(
            {
                "verdicts": [
                    {
                        "field": "cap_rate",
                        "verdict": "primary_wins",
                        "chosen_value": "0.05",
                        "rationale": "Primary cites §12.3",
                    },
                    {
                        "field": "base_year",
                        "verdict": "sibling_wins",
                        "chosen_value": 2020,
                        "rationale": "Sibling matches lease date",
                    },
                ]
            }
        )
        reader.extract = AsyncMock(return_value=(llm_json, 500))
        diff = {"cap_rate": ("0.05", "0.06"), "base_year": (None, 2020)}

        with patch("app.services.extraction.dual.judge.settings") as mock_settings:
            mock_settings.extraction_judge_model = "z-ai/glm-5.1"
            mock_settings.extraction_judge_fallback = "openai/gpt-5.4-mini"
            mock_settings.extraction_judge_fallback_2 = "moonshotai/kimi-k2.6"
            result = await judge_extractions(reader, diff, {}, {})

        assert len(result.verdicts) == 2
        cap_v = result.get_verdict("cap_rate")
        assert cap_v is not None
        assert cap_v.verdict == JudgeVerdict.PRIMARY_WINS

        base_v = result.get_verdict("base_year")
        assert base_v is not None
        assert base_v.verdict == JudgeVerdict.SIBLING_WINS

    @pytest.mark.asyncio
    async def test_fail_open_on_llm_exception(self) -> None:
        reader = MagicMock()
        reader.extract = AsyncMock(side_effect=RuntimeError("API down"))
        diff = {"cap_rate": ("0.05", "0.06")}

        with patch("app.services.extraction.dual.judge.settings") as mock_settings:
            mock_settings.extraction_judge_model = "z-ai/glm-5.1"
            mock_settings.extraction_judge_fallback = "openai/gpt-5.4-mini"
            mock_settings.extraction_judge_fallback_2 = "moonshotai/kimi-k2.6"
            result = await judge_extractions(reader, diff, {}, {})

        assert isinstance(result, JudgeResult)
        assert result.verdicts == []

    @pytest.mark.asyncio
    async def test_fail_open_on_malformed_json(self) -> None:
        reader = MagicMock()
        reader.extract = AsyncMock(return_value=("NOT JSON AT ALL", 100))
        diff = {"cap_rate": ("0.05", "0.06")}

        with (
            patch("app.services.extraction.dual.judge.settings") as mock_settings,
            patch(
                "app.services.extraction.dual.judge.extract_json",
                side_effect=ValueError("bad json"),
            ),
        ):
            mock_settings.extraction_judge_model = "z-ai/glm-5.1"
            mock_settings.extraction_judge_fallback = "openai/gpt-5.4-mini"
            mock_settings.extraction_judge_fallback_2 = "moonshotai/kimi-k2.6"
            result = await judge_extractions(reader, diff, {}, {})

        assert isinstance(result, JudgeResult)
        assert result.verdicts == []

    @pytest.mark.asyncio
    async def test_unknown_verdict_value_defaults_to_trust_neither(self) -> None:
        reader = MagicMock()
        llm_json = json.dumps(
            {
                "verdicts": [
                    {
                        "field": "cap_rate",
                        "verdict": "maybe_primary",
                        "chosen_value": None,
                        "rationale": "",
                    }
                ]
            }
        )
        reader.extract = AsyncMock(return_value=(llm_json, 100))
        diff = {"cap_rate": ("0.05", "0.06")}

        with patch("app.services.extraction.dual.judge.settings") as mock_settings:
            mock_settings.extraction_judge_model = "z-ai/glm-5.1"
            mock_settings.extraction_judge_fallback = "openai/gpt-5.4-mini"
            mock_settings.extraction_judge_fallback_2 = "moonshotai/kimi-k2.6"
            result = await judge_extractions(reader, diff, {}, {})

        v = result.get_verdict("cap_rate")
        assert v is not None
        assert v.verdict == JudgeVerdict.TRUST_NEITHER

    @pytest.mark.asyncio
    async def test_skips_non_dict_verdict_items(self) -> None:
        """Non-dict items in the verdicts list are silently ignored."""
        reader = MagicMock()
        llm_json = json.dumps(
            {
                "verdicts": [
                    "not a dict",
                    None,
                    {
                        "field": "cap_rate",
                        "verdict": "primary_wins",
                        "chosen_value": "0.05",
                        "rationale": "",
                    },
                ]
            }
        )
        reader.extract = AsyncMock(return_value=(llm_json, 100))
        diff = {"cap_rate": ("0.05", "0.06")}

        with patch("app.services.extraction.dual.judge.settings") as mock_settings:
            mock_settings.extraction_judge_model = "z-ai/glm-5.1"
            mock_settings.extraction_judge_fallback = "openai/gpt-5.4-mini"
            mock_settings.extraction_judge_fallback_2 = "moonshotai/kimi-k2.6"
            result = await judge_extractions(reader, diff, {}, {})

        # Only the dict item should produce a verdict
        assert len(result.verdicts) == 1
        assert result.verdicts[0].field == "cap_rate"
