"""Tests for cross-document prompt and user message builder."""

import json
from decimal import Decimal
from uuid import uuid4

from app.services.extraction.cross_doc_models import (
    AuditorContext,
    CrossDocAnalysisInput,
    DataAvailability,
    FindingCategory,
    GLPoolContext,
    LeaseContext,
    PropertyAuditorOverrides,
)
from app.services.extraction.cross_doc_prompt import (
    CROSS_DOC_ANALYSIS_PROMPT,
    build_cross_doc_user_message,
)


def test_prompt_contains_role_section() -> None:
    assert "20+ years" in CROSS_DOC_ANALYSIS_PROMPT
    assert "CRE" in CROSS_DOC_ANALYSIS_PROMPT


def test_prompt_contains_output_schema() -> None:
    assert '"findings"' in CROSS_DOC_ANALYSIS_PROMPT
    assert '"overall_risk_score"' in CROSS_DOC_ANALYSIS_PROMPT
    assert '"lease_term_overrides"' in CROSS_DOC_ANALYSIS_PROMPT
    assert '"analysis_summary"' in CROSS_DOC_ANALYSIS_PROMPT


def test_prompt_contains_analysis_instructions() -> None:
    assert "LEASE NUANCES" in CROSS_DOC_ANALYSIS_PROMPT
    assert "CROSS-DOCUMENT MISMATCHES" in CROSS_DOC_ANALYSIS_PROMPT
    assert "BILLING ANOMALIES" in CROSS_DOC_ANALYSIS_PROMPT
    assert "TERM OVERRIDES" in CROSS_DOC_ANALYSIS_PROMPT


def test_prompt_contains_severity_guidelines() -> None:
    assert "INFO" in CROSS_DOC_ANALYSIS_PROMPT
    assert "WARNING" in CROSS_DOC_ANALYSIS_PROMPT
    assert "CRITICAL" in CROSS_DOC_ANALYSIS_PROMPT


def _make_input(**kwargs) -> CrossDocAnalysisInput:
    defaults = dict(
        property_id=uuid4(),
        property_name="Tower One",
        period_year=2024,
    )
    defaults.update(kwargs)
    return CrossDocAnalysisInput(**defaults)


def test_build_user_message_is_valid_json() -> None:
    inp = _make_input()
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert "property_id" in parsed
    assert "period_year" in parsed
    assert parsed["period_year"] == 2024


def test_build_user_message_includes_lease_contexts() -> None:
    lease = LeaseContext(
        lease_id=str(uuid4()),
        tenant_name="Acme Corp",
        pro_rata_share=Decimal("0.12"),
        base_year=2020,
    )
    inp = _make_input(lease_contexts=[lease])
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert len(parsed["lease_contexts"]) == 1
    assert parsed["lease_contexts"][0]["tenant_name"] == "Acme Corp"


def test_build_user_message_includes_gl_pool_contexts() -> None:
    pool = GLPoolContext(
        pool_name="CAM",
        pool_type="operating",
        total_amount=Decimal("300000.00"),
        account_count=20,
        top_vendors=["ACME Inc"],
        is_gross_up_applicable=True,
    )
    inp = _make_input(gl_pool_contexts=[pool])
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert len(parsed["gl_pool_contexts"]) == 1
    assert parsed["gl_pool_contexts"][0]["pool_name"] == "CAM"


def test_build_user_message_with_no_gl_data() -> None:
    """Message builder works when DataAvailability shows no GL data."""
    inp = _make_input(
        data_availability=DataAvailability(
            has_verified_leases=True,
            has_gl_data=False,
            lease_count=2,
        )
    )
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert parsed["data_availability"]["has_gl_data"] is False
    assert parsed["data_availability"]["lease_count"] == 2


def test_build_user_message_with_auditor_context() -> None:
    ctx = AuditorContext(
        market="NYC",
        custom_rules=["No janitorial in base year"],
    )
    inp = _make_input(auditor_context=ctx)
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert parsed["auditor_context"]["market"] == "NYC"
    assert "No janitorial in base year" in parsed["auditor_context"]["custom_rules"]


def test_build_user_message_with_property_overrides() -> None:
    overrides = PropertyAuditorOverrides(
        suppressed_finding_categories=[FindingCategory.billing_anomaly],
        special_instructions=["Tenant A has negotiated admin fee waiver"],
    )
    inp = _make_input(property_overrides=overrides)
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert (
        "billing_anomaly"
        in parsed["property_overrides"]["suppressed_finding_categories"]
    )


def test_build_user_message_with_prior_year_totals() -> None:
    inp = _make_input(prior_year_totals={"CAM": Decimal("450000.00")})
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)
    assert "CAM" in parsed["prior_year_totals"]
    # Decimal must round-trip as a float (via _json_default serialization)
    assert parsed["prior_year_totals"]["CAM"] == 450000.0


def test_build_user_message_decimal_in_nested_contexts() -> None:
    """Decimals in lease_contexts and gl_pool_contexts serialize to float, not string."""
    lease = LeaseContext(
        lease_id=str(__import__("uuid").uuid4()),
        tenant_name="Acme Corp",
        pro_rata_share=Decimal("0.1250"),
        base_year=2020,
    )
    pool = GLPoolContext(
        pool_name="CAM",
        pool_type="operating",
        total_amount=Decimal("750000.00"),
        account_count=42,
        top_vendors=["Vendor X"],
        is_gross_up_applicable=True,
    )
    inp = _make_input(lease_contexts=[lease], gl_pool_contexts=[pool])
    msg = build_cross_doc_user_message(inp)
    parsed = json.loads(msg)

    # pro_rata_share must be a float, not a string like "0.1250"
    pro_rata = parsed["lease_contexts"][0]["pro_rata_share"]
    assert isinstance(
        pro_rata, float
    ), f"Expected float, got {type(pro_rata)}: {pro_rata}"
    assert pro_rata == 0.125

    # total_amount must be a float, not a string
    total = parsed["gl_pool_contexts"][0]["total_amount"]
    assert isinstance(total, float), f"Expected float, got {type(total)}: {total}"
    assert total == 750000.0
