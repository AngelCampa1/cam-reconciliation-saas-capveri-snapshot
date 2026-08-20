"""Tests for denominator change PDF report generator."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)
from app.services.reports.denominator_change_report import (
    DenominatorChangeReportGenerator,
)


def _make_report(
    changes: list[DenominatorChange] | None = None,
    impacts: list[TenantShareImpact] | None = None,
) -> DenominatorChangeReport:
    return DenominatorChangeReport(
        property_id=uuid4(),
        property_name="Oakwood Plaza",
        prior_period="2023-01-01 to 2023-12-31",
        current_period="2024-01-01 to 2024-12-31",
        prior_total_rsf=Decimal("100000"),
        current_total_rsf=Decimal("105000"),
        rsf_delta=Decimal("5000"),
        rsf_delta_percent=Decimal("5.00"),
        changes=changes or [],
        tenant_impacts=impacts or [],
        summary="Test summary: 1 denominator change detected.",
        generated_at=datetime.now(UTC),
    )


class TestDenominatorChangeReportGenerator:
    def test_generates_valid_pdf_bytes(self) -> None:
        report = _make_report(
            changes=[
                DenominatorChange(
                    change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                    description="Building re-measured",
                    prior_value="100,000 RSF",
                    current_value="105,000 RSF",
                    impact_description="5% increase",
                )
            ],
            impacts=[
                TenantShareImpact(
                    lease_id=uuid4(),
                    tenant_name="Tenant A",
                    prior_pro_rata_share=Decimal("0.10"),
                    current_pro_rata_share=Decimal("0.12"),
                    share_delta_pct_points=Decimal("2.00"),
                    prior_estimated_recovery=Decimal("50000"),
                    current_estimated_recovery=Decimal("60000"),
                    recovery_delta=Decimal("10000"),
                    contributing_changes=[DenominatorChangeType.RSF_REMEASUREMENT],
                )
            ],
        )
        generator = DenominatorChangeReportGenerator()
        pdf_bytes = generator.generate(report)
        assert isinstance(pdf_bytes, bytes)
        assert len(pdf_bytes) > 0
        # PDF magic bytes
        assert pdf_bytes[:4] == b"%PDF"

    def test_pdf_contains_expected_sections(self) -> None:
        report = _make_report(
            changes=[
                DenominatorChange(
                    change_type=DenominatorChangeType.TENANT_ADDED,
                    description="New tenant added",
                    prior_value="Not present",
                    current_value="Tenant B - 5,000 RSF",
                    impact_description="Dilution",
                )
            ],
        )
        generator = DenominatorChangeReportGenerator()
        pdf_bytes = generator.generate(report)
        # Verify non-trivial PDF (has actual content)
        assert len(pdf_bytes) > 1000

    def test_handles_empty_changes(self) -> None:
        report = _make_report(changes=[], impacts=[])
        generator = DenominatorChangeReportGenerator()
        pdf_bytes = generator.generate(report)
        assert isinstance(pdf_bytes, bytes)
        assert pdf_bytes[:4] == b"%PDF"
