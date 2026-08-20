"""Tests for dual-extract orchestrator."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.extraction.dual.dual_models import (
    FieldVerdict,
    JudgeResult,
    JudgeVerdict,
)
from app.services.extraction.dual.dual_orchestrator import DualExtractOrchestrator


def _primary_response(data: dict) -> tuple[str, int, str, int]:
    return json.dumps(data), 100, "google/gemini-3.1-flash-lite", 50


def _sibling_response(data: dict) -> tuple[str, int, str, int]:
    return json.dumps(data), 80, "google/gemini-3.1-flash-lite", 40


class TestDualExtractOrchestrator:
    @pytest.mark.asyncio
    async def test_both_succeed_judge_called_and_merged(self) -> None:
        primary_data = {"cap_rate": "0.05", "base_year": 2020}
        sibling_data = {"cap_rate": "0.06", "base_year": 2020}
        judge_result = JudgeResult(
            verdicts=[
                FieldVerdict(
                    field="cap_rate",
                    verdict=JudgeVerdict.SIBLING_WINS,
                    chosen_value="0.06",
                    rationale="",
                )
            ],
            fields_judged=1,
            model_used="z-ai/glm-5.1",
            tokens_used=42,
        )

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=_primary_response(primary_data)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=_sibling_response(sibling_data)),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                AsyncMock(return_value=judge_result),
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        assert merged["cap_rate"] == "0.06"
        assert merged["base_year"] == 2020
        assert not dual_result.primary_failed
        assert not dual_result.sibling_failed
        # Judge telemetry must be threaded back into DualExtractionResult
        assert dual_result.judge_tokens == 42
        assert dual_result.judge_model == "z-ai/glm-5.1"
        assert dual_result.fields_judged == 1

    @pytest.mark.asyncio
    async def test_no_diff_skips_judge(self) -> None:
        data = {"cap_rate": "0.05", "base_year": 2020}
        judge_mock = AsyncMock()

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=_primary_response(data)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=_sibling_response(data)),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                judge_mock,
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        judge_mock.assert_not_called()
        assert merged["cap_rate"] == "0.05"
        # When both sides agree, judge is never called so telemetry must be zero
        assert dual_result.judge_tokens == 0
        assert dual_result.judge_duration_ms == 0
        assert dual_result.fields_judged == 0

    @pytest.mark.asyncio
    async def test_primary_fails_sibling_used_alone(self) -> None:
        sibling_data = {"cap_rate": "0.07", "base_year": 2021}
        judge_mock = AsyncMock()

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(side_effect=RuntimeError("primary down")),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=_sibling_response(sibling_data)),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                judge_mock,
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        judge_mock.assert_not_called()
        assert merged["cap_rate"] == "0.07"
        assert dual_result.primary_failed

    @pytest.mark.asyncio
    async def test_sibling_fails_primary_used_alone(self) -> None:
        primary_data = {"cap_rate": "0.05", "base_year": 2019}
        judge_mock = AsyncMock()

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=_primary_response(primary_data)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(side_effect=RuntimeError("sibling down")),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                judge_mock,
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        judge_mock.assert_not_called()
        assert merged["cap_rate"] == "0.05"
        assert dual_result.sibling_failed

    @pytest.mark.asyncio
    async def test_both_fail_raises_primary_exception(self) -> None:
        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(side_effect=RuntimeError("primary down")),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(side_effect=RuntimeError("sibling down")),
            ),
        ):
            with pytest.raises(RuntimeError, match="primary down"):
                await orchestrator.extract_lease(b"pdf", "lease.pdf")

    @pytest.mark.asyncio
    async def test_primary_json_parse_fails_sibling_used_alone(self) -> None:
        """Primary extract succeeds but returns malformed JSON → sibling used alone."""
        sibling_data = {"cap_rate": "0.07", "base_year": 2021}
        judge_mock = AsyncMock()

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=("NOT JSON", 100, "primary-model", 50)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=_sibling_response(sibling_data)),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                judge_mock,
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        judge_mock.assert_not_called()
        assert merged["cap_rate"] == "0.07"
        assert dual_result.primary_failed

    @pytest.mark.asyncio
    async def test_sibling_json_parse_fails_primary_used_alone(self) -> None:
        """Sibling extract succeeds but returns malformed JSON → primary used alone."""
        primary_data = {"cap_rate": "0.05", "base_year": 2019}
        judge_mock = AsyncMock()

        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=_primary_response(primary_data)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=("NOT JSON", 80, "sibling-model", 40)),
            ),
            patch(
                "app.services.extraction.dual.dual_orchestrator.judge_extractions",
                judge_mock,
            ),
        ):
            dual_result, merged = await orchestrator.extract_lease(b"pdf", "lease.pdf")

        judge_mock.assert_not_called()
        assert merged["cap_rate"] == "0.05"
        assert dual_result.sibling_failed

    @pytest.mark.asyncio
    async def test_both_json_parse_fail_raises_value_error(self) -> None:
        """Both extractions return malformed JSON → raises ValueError."""
        orchestrator = DualExtractOrchestrator(reader=MagicMock())
        with (
            patch.object(
                orchestrator,
                "_run_primary",
                AsyncMock(return_value=("NOT JSON", 100, "primary", 50)),
            ),
            patch.object(
                orchestrator,
                "_run_sibling",
                AsyncMock(return_value=("ALSO NOT JSON", 80, "sibling", 40)),
            ),
        ):
            with pytest.raises(ValueError, match="both extractor JSON parse failures"):
                await orchestrator.extract_lease(b"pdf", "lease.pdf")


class TestRunPrimaryAndSibling:
    @pytest.mark.asyncio
    async def test_run_primary_delegates_to_reader(self) -> None:
        """_run_primary calls reader.extract_pdf with the primary model chain."""
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(
                '{"cap_rate": "0.05"}',
                100,
                "google/gemini-3.1-flash-lite",
            )
        )
        orchestrator = DualExtractOrchestrator(reader=reader)

        with patch("app.services.extraction.dual.dual_orchestrator.settings") as mock_s:
            mock_s.extraction_primary_model = "google/gemini-3.1-flash-lite"
            mock_s.extraction_primary_fallback = "google/gemini-3-flash-preview"
            mock_s.extraction_primary_fallback_2 = "moonshotai/kimi-k2.6"
            result = await orchestrator._run_primary(b"pdf", "lease.pdf")

        text, tokens, model, duration_ms = result
        assert text == '{"cap_rate": "0.05"}'
        assert tokens == 100
        assert model == "google/gemini-3.1-flash-lite"
        assert duration_ms >= 0
        reader.extract_pdf.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_sibling_delegates_to_reader(self) -> None:
        """_run_sibling calls reader.extract_pdf with the sibling model chain."""
        reader = MagicMock()
        reader.extract_pdf = AsyncMock(
            return_value=(
                '{"cap_rate": "0.06"}',
                80,
                "google/gemini-3.1-flash-lite",
            )
        )
        orchestrator = DualExtractOrchestrator(reader=reader)

        with patch("app.services.extraction.dual.dual_orchestrator.settings") as mock_s:
            mock_s.extraction_sibling_model = "google/gemini-3.1-flash-lite"
            mock_s.extraction_sibling_fallback = "google/gemini-3-flash-preview"
            mock_s.extraction_sibling_fallback_2 = "openai/gpt-5.4-mini"
            result = await orchestrator._run_sibling(b"pdf", "lease.pdf")

        text, tokens, model, duration_ms = result
        assert text == '{"cap_rate": "0.06"}'
        assert tokens == 80
        assert model == "google/gemini-3.1-flash-lite"
        assert duration_ms >= 0
