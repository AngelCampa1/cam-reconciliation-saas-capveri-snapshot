"""Live OpenRouter extraction checks for generated lease PDFs.

These tests intentionally call OpenRouter through the production dual-extract
path. They are skipped unless explicitly enabled with RUN_OPENROUTER_LIVE_TEST=1.
"""

from __future__ import annotations

import json
import os
from decimal import Decimal
from pathlib import Path

import pytest

from app.config import settings
from app.models.enums import CapType
from app.services.extraction import validate_extraction
from app.services.extraction.dual.dual_orchestrator import DualExtractOrchestrator
from app.services.extraction.extraction_models import LeaseExtractionResult

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures"
ASSERTED_FIELDS = (
    "base_year",
    "pro_rata_share",
    "cap_type",
    "cap_rate",
    "admin_fee_percentage",
)

pytestmark = [
    pytest.mark.skipif(
        os.getenv("RUN_OPENROUTER_LIVE_TEST") != "1",
        reason="set RUN_OPENROUTER_LIVE_TEST=1 to spend real OpenRouter calls",
    ),
    pytest.mark.skipif(
        not settings.openrouter_api_key,
        reason="OPENROUTER_API_KEY is not configured",
    ),
]


def _discover_lease_cases() -> tuple[str, ...]:
    cases = []
    for pdf_path in sorted((FIXTURES_DIR / "leases").glob("lease_prop*.pdf")):
        case_id = pdf_path.stem
        expected_path = FIXTURES_DIR / "expected" / f"{case_id}_expected.json"
        if expected_path.exists():
            cases.append(case_id)
    assert cases, "expected at least one generated lease fixture"
    return tuple(cases)


def _load_expected(case_id: str) -> dict:
    expected_path = FIXTURES_DIR / "expected" / f"{case_id}_expected.json"
    return json.loads(expected_path.read_text(encoding="utf-8"))["lease_terms"]


def _decimal(value: object) -> Decimal:
    return Decimal(str(value))


def _assert_decimal_close(actual: Decimal, expected: Decimal) -> None:
    tolerance = Decimal("0.0001")
    assert abs(actual - expected) <= tolerance


@pytest.mark.parametrize("case_id", _discover_lease_cases())
@pytest.mark.asyncio
async def test_live_openrouter_generated_lease_matches_expected_terms(
    case_id: str,
) -> None:
    pdf_path = FIXTURES_DIR / "leases" / f"{case_id}.pdf"
    expected = _load_expected(case_id)

    dual_result, merged = await DualExtractOrchestrator().extract_lease(
        pdf_path.read_bytes(),
        pdf_path.name,
    )
    extraction = LeaseExtractionResult.model_validate(merged)
    validation = validate_extraction(extraction)

    assert validation.errors == []
    assert extraction.base_year == expected["base_year"]
    _assert_decimal_close(
        extraction.pro_rata_share,
        _decimal(expected["pro_rata_share"]),
    )
    assert extraction.cap_type == CapType(expected["cap_type"])
    assert extraction.cap_rate is not None
    _assert_decimal_close(extraction.cap_rate, _decimal(expected["cap_rate"]))
    _assert_decimal_close(
        extraction.admin_fee_percentage,
        _decimal(expected["admin_fee_percent"]),
    )

    for field in ASSERTED_FIELDS:
        field_extraction = extraction.get_extraction(field)
        assert field_extraction is not None, f"missing extraction metadata for {field}"
        assert field_extraction.source_text.strip()
        assert field_extraction.confidence >= 80

    assert dual_result.primary_model
    assert dual_result.sibling_model
    assert dual_result.primary_tokens + dual_result.sibling_tokens > 0
    assert not (dual_result.primary_failed and dual_result.sibling_failed)
    if dual_result.fields_judged:
        assert dual_result.judge_model
        assert dual_result.judge_tokens > 0
