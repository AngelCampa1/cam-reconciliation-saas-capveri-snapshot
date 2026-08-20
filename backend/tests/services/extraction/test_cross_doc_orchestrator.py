"""Tests for CrossDocOrchestrator."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from app.services.extraction.cross_doc_models import (
    CrossDocAnalysisInput,
    CrossDocAnalysisResult,
    DataAvailability,
)
from app.services.extraction.cross_doc_orchestrator import (
    CrossDocAnalysisError,
    CrossDocInsufficientDataError,
    CrossDocOrchestrator,
    CrossDocValidationError,
    _normalize_model_finding_ids,
)


def _make_valid_result(property_id, period_year=2024) -> dict:
    return {
        "property_id": str(property_id),
        "period_year": period_year,
        "findings": [],
        "lease_term_overrides": [],
        "overall_risk_score": 10,
        "analysis_summary": "No issues found.",
        "documents_analyzed": {"leases": 2, "gl_accounts": 30},
        "token_usage": 1200,
    }


def test_normalize_model_finding_ids_repairs_invalid_uuid_and_override_link() -> None:
    bad_id = "c3d4e5f6-7890-4c12-defg-b34567890123"
    data = _make_valid_result(uuid4())
    data["findings"] = [
        {
            "id": bad_id,
            "category": "term_override",
            "severity": "critical",
            "title": "Latest side letter overrides pro-rata share",
            "detail": "The model used a placeholder-like invalid UUID.",
            "affected_leases": [str(uuid4())],
            "affected_pools": [],
            "financial_impact_estimate": None,
            "source_documents": ["Second Amendment"],
            "override_suggestion": None,
        }
    ]
    data["lease_term_overrides"] = [
        {
            "finding_id": bad_id,
            "field_name": "pro_rata_share",
            "lease_id": str(uuid4()),
            "current_value": "0.1250",
            "suggested_value": "0.0750",
            "reasoning": "Latest side letter supersedes the original schedule.",
            "confidence": 92,
        }
    ]

    _normalize_model_finding_ids(data)

    repaired_id = data["findings"][0]["id"]
    assert repaired_id != bad_id
    assert data["lease_term_overrides"][0]["finding_id"] == repaired_id
    CrossDocAnalysisResult.model_validate(data)


@pytest.mark.asyncio
async def test_run_analysis_happy_path() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower A",
        period_year=2024,
        data_availability=DataAvailability(
            has_verified_leases=True,
            lease_count=2,
        ),
    )
    valid_json = json.dumps(_make_valid_result(prop_id))

    client = MagicMock()
    client.extract = AsyncMock(return_value=(valid_json, 1200))
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": str(uuid4())}]
    )

    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with patch(
            "app.services.extraction.cross_doc_orchestrator.save_analysis",
            new=AsyncMock(),
        ):
            result = await orch.run_analysis(prop_id, 2024, org_id)

    assert isinstance(result, CrossDocAnalysisResult)
    assert result.overall_risk_score == 10
    assert result.token_usage == 1200


@pytest.mark.asyncio
async def test_run_analysis_skips_when_no_verified_leases() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower B",
        period_year=2024,
        data_availability=DataAvailability(
            has_verified_leases=False,
            lease_count=0,
        ),
    )

    client = MagicMock()
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with pytest.raises(CrossDocInsufficientDataError):
            await orch.run_analysis(prop_id, 2024, org_id)


@pytest.mark.asyncio
async def test_run_analysis_warns_on_orphaned_override_finding_id() -> None:
    """Top-level override referencing unknown finding_id logs a warning but does not raise."""
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower W",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    unknown_finding_id = str(uuid4())
    result_dict = _make_valid_result(prop_id)
    result_dict["lease_term_overrides"] = [
        {
            "field_name": "base_year",
            "lease_id": str(uuid4()),
            "current_value": "2020",
            "suggested_value": "2021",
            "reasoning": "Amendment",
            "confidence": 80,
            "finding_id": unknown_finding_id,  # doesn't reference any finding in findings[]
        }
    ]
    valid_json = json.dumps(result_dict)

    client = MagicMock()
    client.extract = AsyncMock(return_value=(valid_json, 500))
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": str(uuid4())}]
    )

    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with patch(
            "app.services.extraction.cross_doc_orchestrator.save_analysis",
            new=AsyncMock(),
        ):
            with patch(
                "app.services.extraction.cross_doc_orchestrator.logger"
            ) as mock_logger:
                result = await orch.run_analysis(prop_id, 2024, org_id)

    # Should succeed (no exception)
    assert isinstance(result, CrossDocAnalysisResult)
    # Should have logged a warning about the orphaned finding_id
    warning_calls = [str(call) for call in mock_logger.warning.call_args_list]
    assert any(
        "unknown finding_id" in c or "orphaned" in c or unknown_finding_id in c
        for c in warning_calls
    )


@pytest.mark.asyncio
async def test_run_analysis_invalid_json_raises_validation_error() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower C",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    client = MagicMock()
    client.extract = AsyncMock(return_value=("NOT JSON AT ALL", 100))
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with pytest.raises(CrossDocValidationError, match="invalid JSON"):
            await orch.run_analysis(prop_id, 2024, org_id)


@pytest.mark.asyncio
async def test_run_analysis_schema_validation_failure() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower D",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    # Missing required fields
    bad_json = json.dumps({"property_id": str(prop_id)})
    client = MagicMock()
    client.extract = AsyncMock(return_value=(bad_json, 100))
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with pytest.raises(CrossDocValidationError, match="schema validation"):
            await orch.run_analysis(prop_id, 2024, org_id)


@pytest.mark.asyncio
async def test_run_analysis_strips_markdown_code_fence() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower E",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    raw_json = json.dumps(_make_valid_result(prop_id))
    wrapped = f"```json\n{raw_json}\n```"

    client = MagicMock()
    client.extract = AsyncMock(return_value=(wrapped, 1200))
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with patch(
            "app.services.extraction.cross_doc_orchestrator.save_analysis",
            new=AsyncMock(),
        ):
            result = await orch.run_analysis(prop_id, 2024, org_id)

    assert isinstance(result, CrossDocAnalysisResult)


@pytest.mark.asyncio
async def test_run_analysis_enforces_caller_property_id_not_claude_echo() -> None:
    """Orchestrator always uses caller-supplied property_id even when Claude echoes a different one."""
    prop_id = uuid4()
    wrong_prop_id = uuid4()  # Claude "hallucinates" a different property_id
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower G",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    # Claude returns a result with a different property_id
    result_with_wrong_id = _make_valid_result(wrong_prop_id)
    valid_json = json.dumps(result_with_wrong_id)

    client = MagicMock()
    client.extract = AsyncMock(return_value=(valid_json, 500))
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with patch(
            "app.services.extraction.cross_doc_orchestrator.save_analysis",
            new=AsyncMock(),
        ):
            result = await orch.run_analysis(prop_id, 2024, org_id)

    # Caller's property_id wins; Claude's echo is discarded
    assert result.property_id == prop_id
    assert result.property_id != wrong_prop_id


@pytest.mark.asyncio
async def test_run_analysis_claude_exception_raises_error() -> None:
    prop_id = uuid4()
    org_id = uuid4()

    assembled = CrossDocAnalysisInput(
        property_id=prop_id,
        property_name="Tower F",
        period_year=2024,
        data_availability=DataAvailability(has_verified_leases=True, lease_count=1),
    )

    client = MagicMock()
    client.extract = AsyncMock(side_effect=RuntimeError("API down"))
    db = MagicMock()
    orch = CrossDocOrchestrator(openrouter_client=client, db=db)

    with patch(
        "app.services.extraction.cross_doc_orchestrator.CrossDocAssembler"
    ) as MockAssembler:
        MockAssembler.return_value.assemble = AsyncMock(return_value=assembled)
        with pytest.raises(CrossDocAnalysisError, match="API down"):
            await orch.run_analysis(prop_id, 2024, org_id)
