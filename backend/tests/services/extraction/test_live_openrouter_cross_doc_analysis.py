"""Live OpenRouter cross-document analysis checks.

This spends real OpenRouter tokens and is skipped unless explicitly enabled:
    RUN_OPENROUTER_LIVE_TEST=1 pytest \
        tests/services/extraction/test_live_openrouter_cross_doc_analysis.py -q
"""

from __future__ import annotations

import json
import os
from decimal import Decimal
from uuid import uuid4

import pytest

from app.config import settings
from app.services.extraction.cross_doc_models import (
    AuditorContext,
    CrossDocAnalysisInput,
    CrossDocAnalysisResult,
    DataAvailability,
    GLPoolContext,
    LeaseContext,
)
from app.services.extraction.cross_doc_orchestrator import _normalize_model_finding_ids
from app.services.extraction.cross_doc_prompt import (
    CROSS_DOC_ANALYSIS_PROMPT,
    build_cross_doc_user_message,
)
from app.services.extraction.json_utils import extract_json
from app.services.extraction.openrouter_client import OpenRouterClient

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


def _package_input(property_id, lease_id) -> CrossDocAnalysisInput:
    return CrossDocAnalysisInput(
        property_id=property_id,
        property_name="Stella Link Amendment Package",
        period_year=2024,
        lease_contexts=[
            LeaseContext(
                lease_id=str(lease_id),
                tenant_name="Amendment Package Tenant",
                pro_rata_share=Decimal("0.1250"),
                base_year=2021,
                term_start="2021-01-01",
                term_end="2029-12-31",
                verified_at="2024-12-20T12:00:00Z",
                recovery_profile={
                    "current_extracted_terms": {
                        "pro_rata_share": "0.1250",
                        "cap_type": "cumulative",
                        "cap_rate": "0.06",
                    },
                    "source_documents_in_chronological_order": [
                        {
                            "date": "2021-01-01",
                            "name": "Original Lease",
                            "text": (
                                "Tenant pays 12.50% of Operating Expenses. "
                                "Annual controllable expense increases are capped "
                                "at a cumulative six percent per year."
                            ),
                        },
                        {
                            "date": "2023-04-15",
                            "name": "Tenant Estoppel",
                            "text": (
                                "The estoppel repeats the original 12.50% pro-rata "
                                "share but does not amend the lease."
                            ),
                        },
                        {
                            "date": "2023-05-10",
                            "name": "First Amendment - Controllable Expense Cap",
                            "text": (
                                "Effective January 1, 2024, the prior cumulative "
                                "six percent cap is deleted. Controllable operating "
                                "expenses are capped separately each year at four "
                                "percent, with no banking, carryforward, or "
                                "compounding of unused capacity."
                            ),
                        },
                        {
                            "date": "2023-06-01",
                            "name": "Second Amendment and Side Letter",
                            "text": (
                                "Effective January 1, 2024, Tenant's rentable area "
                                "is reduced. Tenant's pro-rata share shall be 7.50%. "
                                "This side letter supersedes all conflicting prior "
                                "statements, estoppels, and lease schedules."
                            ),
                        },
                    ],
                },
            )
        ],
        gl_pool_contexts=[
            GLPoolContext(
                pool_name="Operating Expenses",
                pool_type="operating",
                total_amount=Decimal("400000.00"),
                account_count=12,
                top_vendors=["Metro Services"],
                is_gross_up_applicable=False,
            )
        ],
        auditor_context=AuditorContext(
            market="Houston",
            custom_rules=[
                "When a dated side letter supersedes prior lease schedules, use the latest contractual share.",
                "When an amendment deletes banking or carryforward, classify the cap as non_cumulative.",
            ],
        ),
        prior_year_totals={"Operating Expenses": Decimal("360000.00")},
        data_availability=DataAvailability(
            has_verified_leases=True,
            has_gl_data=True,
            has_prior_year_data=True,
            lease_count=1,
            gl_account_count=12,
        ),
        estimated_tokens=1800,
    )


@pytest.mark.asyncio
async def test_live_openrouter_cross_doc_package_suggests_latest_prorata_override():
    property_id = uuid4()
    lease_id = uuid4()
    input_data = _package_input(property_id, lease_id)

    response_text, tokens_used = await OpenRouterClient().extract(
        prompt=CROSS_DOC_ANALYSIS_PROMPT,
        document_text=build_cross_doc_user_message(input_data),
        model=settings.cross_doc_model,
        temperature=0.1,
        fallback_models=[settings.cross_doc_fallback, settings.cross_doc_fallback_2],
    )

    extracted = extract_json(response_text)
    data = extracted if isinstance(extracted, dict) else json.loads(extracted)
    data["token_usage"] = tokens_used
    data["property_id"] = str(property_id)
    data["period_year"] = input_data.period_year
    _normalize_model_finding_ids(data)
    result = CrossDocAnalysisResult.model_validate(data)

    overrides = [
        override
        for override in result.lease_term_overrides
        if override.lease_id == str(lease_id)
        and override.field_name == "pro_rata_share"
    ]
    inline_overrides = [
        finding.override_suggestion
        for finding in result.findings
        if finding.override_suggestion is not None
        and finding.override_suggestion.lease_id == str(lease_id)
        and finding.override_suggestion.field_name == "pro_rata_share"
    ]
    all_overrides = [*overrides, *inline_overrides]
    cap_type_overrides = [
        override
        for override in result.lease_term_overrides
        if override.lease_id == str(lease_id) and override.field_name == "cap_type"
    ]
    inline_cap_type_overrides = [
        finding.override_suggestion
        for finding in result.findings
        if finding.override_suggestion is not None
        and finding.override_suggestion.lease_id == str(lease_id)
        and finding.override_suggestion.field_name == "cap_type"
    ]
    all_cap_type_overrides = [*cap_type_overrides, *inline_cap_type_overrides]
    cap_rate_overrides = [
        override
        for override in result.lease_term_overrides
        if override.lease_id == str(lease_id) and override.field_name == "cap_rate"
    ]
    inline_cap_rate_overrides = [
        finding.override_suggestion
        for finding in result.findings
        if finding.override_suggestion is not None
        and finding.override_suggestion.lease_id == str(lease_id)
        and finding.override_suggestion.field_name == "cap_rate"
    ]
    all_cap_rate_overrides = [*cap_rate_overrides, *inline_cap_rate_overrides]

    assert tokens_used > 0
    assert result.documents_analyzed.get("leases", 0) >= 1
    assert result.overall_risk_score > 0
    assert all_overrides, result.model_dump()
    assert any(
        Decimal(str(override.suggested_value)).quantize(Decimal("0.0001"))
        == Decimal("0.0750")
        for override in all_overrides
    )
    assert any(override.confidence >= 70 for override in all_overrides)
    assert any(
        str(override.suggested_value) == "non_cumulative"
        for override in all_cap_type_overrides
    ), result.model_dump()
    assert any(override.confidence >= 70 for override in all_cap_type_overrides)
    assert any(
        Decimal(str(override.suggested_value)).quantize(Decimal("0.0001"))
        == Decimal("0.0400")
        for override in all_cap_rate_overrides
    ), result.model_dump()
    assert any(override.confidence >= 70 for override in all_cap_rate_overrides)
