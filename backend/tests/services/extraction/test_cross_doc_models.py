"""Tests for cross-document analysis Pydantic models."""

from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.services.extraction.cross_doc_models import (
    AuditorContext,
    CrossDocAnalysisInput,
    CrossDocAnalysisResult,
    CrossDocFinding,
    DataAvailability,
    FindingCategory,
    FindingSeverity,
    GLPoolContext,
    LeaseContext,
    TermOverrideSuggestion,
)

# ---------------------------------------------------------------------------
# TermOverrideSuggestion
# ---------------------------------------------------------------------------


def test_term_override_suggestion_valid() -> None:
    lease_id = str(uuid4())
    override = TermOverrideSuggestion(
        field_name="cap_rate",
        lease_id=lease_id,
        current_value="0.05",
        suggested_value="0.03",
        reasoning="Amendment #2 reduces cap rate",
        confidence=85,
    )
    assert override.field_name == "cap_rate"
    assert override.lease_id == lease_id
    assert override.confidence == 85
    assert override.finding_id is None  # not set for inline overrides


def test_term_override_suggestion_preserves_finding_id() -> None:
    """finding_id must survive model_validate so persistence can look up decisions."""
    fid = str(uuid4())
    data = {
        "field_name": "base_year",
        "lease_id": str(uuid4()),
        "current_value": "2020",
        "suggested_value": "2021",
        "reasoning": "Amendment",
        "confidence": 80,
        "finding_id": fid,
    }
    override = TermOverrideSuggestion.model_validate(data)
    assert override.finding_id == fid


def test_cross_doc_finding_financial_impact_allows_negative() -> None:
    """Negative financial_impact_estimate is valid (tenant was overbilled)."""
    finding = CrossDocFinding(
        category=FindingCategory.billing_anomaly,
        severity=FindingSeverity.warning,
        title="Tenant overbilled",
        detail="Tenant was charged more than their lease allows",
        financial_impact_estimate=Decimal("-5000.00"),
    )
    assert finding.financial_impact_estimate == Decimal("-5000.00")


def test_term_override_confidence_boundary_values() -> None:
    base = dict(
        field_name="x",
        lease_id=str(uuid4()),
        current_value="a",
        suggested_value="b",
        reasoning="r",
    )
    TermOverrideSuggestion(**base, confidence=0)
    TermOverrideSuggestion(**base, confidence=100)

    with pytest.raises(ValidationError):
        TermOverrideSuggestion(**base, confidence=-1)

    with pytest.raises(ValidationError):
        TermOverrideSuggestion(**base, confidence=101)


# ---------------------------------------------------------------------------
# CrossDocFinding
# ---------------------------------------------------------------------------


def test_cross_doc_finding_defaults() -> None:
    finding = CrossDocFinding(
        category=FindingCategory.billing_anomaly,
        severity=FindingSeverity.warning,
        title="High mgmt fee",
        detail="Management fee exceeds 5% of operating expenses",
    )
    assert finding.id is not None
    assert finding.affected_leases == []
    assert finding.affected_pools == []
    assert finding.financial_impact_estimate is None
    assert finding.override_suggestion is None


def test_cross_doc_finding_with_override() -> None:
    override = TermOverrideSuggestion(
        field_name="base_year",
        lease_id=str(uuid4()),
        current_value="2020",
        suggested_value="2021",
        reasoning="Amendment sets new base year",
        confidence=90,
    )
    finding = CrossDocFinding(
        category=FindingCategory.term_override,
        severity=FindingSeverity.critical,
        title="Base year mismatch",
        detail="GL data implies different base year",
        financial_impact_estimate=Decimal("12000.00"),
        override_suggestion=override,
    )
    assert finding.financial_impact_estimate == Decimal("12000.00")
    assert finding.override_suggestion is not None
    assert finding.override_suggestion.field_name == "base_year"


def test_cross_doc_finding_unique_ids() -> None:
    f1 = CrossDocFinding(
        category=FindingCategory.lease_nuance,
        severity=FindingSeverity.info,
        title="T1",
        detail="D1",
    )
    f2 = CrossDocFinding(
        category=FindingCategory.lease_nuance,
        severity=FindingSeverity.info,
        title="T2",
        detail="D2",
    )
    assert f1.id != f2.id


# ---------------------------------------------------------------------------
# CrossDocAnalysisResult
# ---------------------------------------------------------------------------


def test_cross_doc_analysis_result_valid() -> None:
    prop_id = uuid4()
    result = CrossDocAnalysisResult(
        property_id=prop_id,
        period_year=2024,
        overall_risk_score=42,
        analysis_summary="Two minor issues found.",
        token_usage=1500,
    )
    assert result.property_id == prop_id
    assert result.findings == []
    assert result.lease_term_overrides == []
    assert result.documents_analyzed == {}


def test_cross_doc_analysis_result_risk_score_boundary() -> None:
    base = dict(
        property_id=uuid4(),
        period_year=2024,
        analysis_summary="ok",
    )
    CrossDocAnalysisResult(**base, overall_risk_score=0)
    CrossDocAnalysisResult(**base, overall_risk_score=100)

    with pytest.raises(ValidationError):
        CrossDocAnalysisResult(**base, overall_risk_score=-1)

    with pytest.raises(ValidationError):
        CrossDocAnalysisResult(**base, overall_risk_score=101)


def test_cross_doc_analysis_result_with_findings() -> None:
    finding = CrossDocFinding(
        category=FindingCategory.cross_doc_mismatch,
        severity=FindingSeverity.critical,
        title="Pro-rata mismatch",
        detail="Lease says 12%, GL implies 15%",
        affected_leases=["lease-abc"],
        affected_pools=["CAM"],
    )
    result = CrossDocAnalysisResult(
        property_id=uuid4(),
        period_year=2023,
        findings=[finding],
        overall_risk_score=75,
        analysis_summary="Critical mismatch detected.",
        documents_analyzed={"leases": 5, "gl_accounts": 120},
    )
    assert len(result.findings) == 1
    assert result.documents_analyzed["leases"] == 5


def test_cross_doc_analysis_empty_findings_is_valid() -> None:
    result = CrossDocAnalysisResult(
        property_id=uuid4(),
        period_year=2024,
        findings=[],
        overall_risk_score=0,
        analysis_summary="No issues found.",
    )
    assert result.findings == []
    assert result.overall_risk_score == 0


def test_cross_doc_analysis_result_period_year_bounds() -> None:
    base = dict(property_id=uuid4(), overall_risk_score=0, analysis_summary="ok")
    CrossDocAnalysisResult(**base, period_year=1900)
    CrossDocAnalysisResult(**base, period_year=2100)

    with pytest.raises(ValidationError):
        CrossDocAnalysisResult(**base, period_year=1899)

    with pytest.raises(ValidationError):
        CrossDocAnalysisResult(**base, period_year=2101)


def test_cross_doc_analysis_result_token_usage_must_be_non_negative() -> None:
    base = dict(
        property_id=uuid4(),
        period_year=2024,
        overall_risk_score=0,
        analysis_summary="ok",
    )
    CrossDocAnalysisResult(**base, token_usage=0)
    CrossDocAnalysisResult(**base, token_usage=99999)

    with pytest.raises(ValidationError):
        CrossDocAnalysisResult(**base, token_usage=-1)


def test_cross_doc_analysis_input_period_year_bounds() -> None:
    base = dict(property_id=uuid4(), property_name="Tower")
    CrossDocAnalysisInput(**base, period_year=1900)
    CrossDocAnalysisInput(**base, period_year=2100)

    with pytest.raises(ValidationError):
        CrossDocAnalysisInput(**base, period_year=1899)

    with pytest.raises(ValidationError):
        CrossDocAnalysisInput(**base, period_year=2101)


# ---------------------------------------------------------------------------
# DataAvailability
# ---------------------------------------------------------------------------


def test_data_availability_defaults() -> None:
    da = DataAvailability()
    assert da.has_verified_leases is False
    assert da.has_gl_data is False
    assert da.has_cam_statements is False
    assert da.has_prior_year_data is False
    assert da.lease_count == 0
    assert da.gl_account_count == 0


def test_data_availability_partial() -> None:
    da = DataAvailability(
        has_verified_leases=True,
        has_gl_data=True,
        lease_count=3,
        gl_account_count=45,
    )
    assert da.has_verified_leases is True
    assert da.has_cam_statements is False
    assert da.lease_count == 3


# ---------------------------------------------------------------------------
# AuditorContext
# ---------------------------------------------------------------------------


def test_auditor_context_optional_fields() -> None:
    ctx = AuditorContext()
    assert ctx.market is None
    assert ctx.typical_management_fee_pct is None
    assert ctx.known_vendor_patterns == []

    ctx2 = AuditorContext(
        market="NYC",
        typical_management_fee_pct=Decimal("0.04"),
        known_vendor_patterns=["ACME Landscaping"],
        custom_rules=["No janitorial in base year"],
    )
    assert ctx2.market == "NYC"
    assert ctx2.typical_management_fee_pct == Decimal("0.04")


# ---------------------------------------------------------------------------
# CrossDocAnalysisInput
# ---------------------------------------------------------------------------


def test_cross_doc_analysis_input_defaults() -> None:
    inp = CrossDocAnalysisInput(
        property_id=uuid4(),
        property_name="Tower One",
        period_year=2024,
    )
    assert inp.lease_contexts == []
    assert inp.gl_pool_contexts == []
    assert inp.estimated_tokens == 0
    assert inp.data_availability.has_verified_leases is False


def test_cross_doc_analysis_input_with_contexts() -> None:
    lease_ctx = LeaseContext(
        lease_id=str(uuid4()),
        tenant_name="Acme Corp",
        pro_rata_share=Decimal("0.12"),
        base_year=2020,
    )
    pool_ctx = GLPoolContext(
        pool_name="CAM",
        pool_type="operating",
        total_amount=Decimal("500000.00"),
        account_count=35,
        top_vendors=["Vendor A", "Vendor B"],
        is_gross_up_applicable=True,
    )
    inp = CrossDocAnalysisInput(
        property_id=uuid4(),
        property_name="Tower One",
        period_year=2024,
        lease_contexts=[lease_ctx],
        gl_pool_contexts=[pool_ctx],
        data_availability=DataAvailability(
            has_verified_leases=True,
            has_gl_data=True,
            lease_count=1,
            gl_account_count=35,
        ),
    )
    assert len(inp.lease_contexts) == 1
    assert inp.lease_contexts[0].tenant_name == "Acme Corp"
    assert inp.gl_pool_contexts[0].total_amount == Decimal("500000.00")
    assert inp.data_availability.has_verified_leases is True
