"""Live OpenRouter extraction for real-world SEC HTML lease text.

The generated PDF live tests prove the native-PDF path on clean fixtures. This
test adds noisier SEC HTML leases converted to text and sent through the
text-mode OpenRouter client. It is intentionally skipped unless enabled because
it spends real provider calls.

Run standalone:
    RUN_OPENROUTER_LIVE_TEST=1 pytest \
        tests/services/extraction/test_live_openrouter_real_world_html_extraction.py -q -s
"""

from __future__ import annotations

import json
import os
from decimal import Decimal

import pytest

from app.config import settings
from app.models.enums import AccountingBasis, CapType, PoolType
from app.services.extraction import validate_extraction
from app.services.extraction.extraction_models import LeaseExtractionResult
from app.services.extraction.json_utils import extract_json
from app.services.extraction.prompts import LEASE_EXTRACTION_PROMPT
from tests.services.extraction.conftest import (
    REAL_WORLD_FIXTURES_DIR,
    call_llm,
    coerce_llm_output,
    extract_text_from_html,
)

HTML_CASES = (
    pytest.param(
        "generation-net-lease",
        "generation-income-lease.htm",
        id="generation-net-lease",
    ),
    pytest.param(
        "houston-commercial",
        "neurogene-stella-link-lease.htm",
        id="houston-commercial",
    ),
    pytest.param(
        "kissimmee-office",
        "la-rosa-lease.htm",
        id="kissimmee-office",
        marks=pytest.mark.xfail(
            reason=(
                "live OpenRouter currently treats a CAM base-rate clause as a "
                "high-confidence 100% pro-rata share even though the source "
                "does not state a fixed percentage"
            ),
            strict=True,
        ),
    ),
    pytest.param("oaks-retail", "oaks-shopping-center-lease.htm", id="oaks-retail"),
    pytest.param(
        "research-park-office",
        "exact-sciences-lease.htm",
        id="research-park-office",
    ),
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


def _expected_terms(case_slug: str) -> dict:
    expected_path = (
        REAL_WORLD_FIXTURES_DIR / case_slug / "expected" / "lease-extraction.json"
    )
    return json.loads(expected_path.read_text(encoding="utf-8"))["lease_terms"]


def _decimal(value: object) -> Decimal:
    return Decimal(str(value))


def _assert_close(actual: Decimal, expected: Decimal) -> None:
    assert abs(actual - expected) <= Decimal("0.0001")


@pytest.mark.asyncio
@pytest.mark.parametrize(("case_slug", "lease_filename"), HTML_CASES)
async def test_live_openrouter_extracts_real_world_html_lease_terms(
    case_slug: str,
    lease_filename: str,
) -> None:
    expected = _expected_terms(case_slug)
    document_text = extract_text_from_html(
        REAL_WORLD_FIXTURES_DIR / case_slug / "leases" / lease_filename
    )

    raw_text, tokens = await call_llm(document_text, LEASE_EXTRACTION_PROMPT)
    raw_json = extract_json(raw_text)
    coerce_llm_output(raw_json)

    extraction = LeaseExtractionResult.model_validate(raw_json)
    validation = validate_extraction(extraction)

    assert tokens > 0
    assert validation.errors == []
    assert extraction.cap_type == CapType(expected["cap_type"])
    asserted_fields = {"cap_type"}

    if expected["cap_rate"] is None:
        assert extraction.cap_rate is None
    else:
        assert extraction.cap_rate is not None
        _assert_close(extraction.cap_rate, _decimal(expected["cap_rate"]))
        asserted_fields.add("cap_rate")

    if expected["admin_fee_percent"] is None:
        assert extraction.admin_fee_percentage == Decimal("0")
    else:
        _assert_close(
            extraction.admin_fee_percentage,
            _decimal(expected["admin_fee_percent"]),
        )
        if _decimal(expected["admin_fee_percent"]) != Decimal("0"):
            asserted_fields.add("admin_fee_percentage")

    expected_management_fee = expected.get("management_fee_percentage")
    if expected_management_fee is None:
        assert extraction.management_fee_percentage is None
    else:
        assert extraction.management_fee_percentage is not None
        _assert_close(
            extraction.management_fee_percentage,
            _decimal(expected_management_fee),
        )
        asserted_fields.add("management_fee_percentage")

    expected_pro_rata = expected["pro_rata_share"]
    if expected_pro_rata is not None:
        _assert_close(extraction.pro_rata_share, _decimal(expected_pro_rata))
        asserted_fields.add("pro_rata_share")
    else:
        field_extraction = extraction.get_extraction("pro_rata_share")
        if field_extraction is not None:
            assert field_extraction.confidence < 50

    expected_pools = {PoolType(value) for value in expected["excluded_pools"]}
    assert set(extraction.excluded_pools) == expected_pools

    expected_basis = expected["accounting_basis"]
    if expected_basis is not None:
        assert extraction.accounting_basis == AccountingBasis(expected_basis)

    for field in sorted(asserted_fields):
        field_extraction = extraction.get_extraction(field)
        if field_extraction is not None:
            assert field_extraction.source_text.strip()
            assert field_extraction.confidence >= 70
