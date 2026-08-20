"""Tests for denominator change models."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)


class TestDenominatorChangeType:
    def test_enum_members_exist(self) -> None:
        assert DenominatorChangeType.RSF_REMEASUREMENT == "rsf_remeasurement"
        assert DenominatorChangeType.TENANT_ADDED == "tenant_added"
        assert DenominatorChangeType.TENANT_REMOVED == "tenant_removed"
        assert DenominatorChangeType.SELF_MAINTENANCE_START == "self_maintenance_start"
        assert DenominatorChangeType.SELF_MAINTENANCE_STOP == "self_maintenance_stop"
        assert DenominatorChangeType.EXCLUSION_CHANGE == "exclusion_change"
        assert DenominatorChangeType.BOMA_STANDARD_CHANGE == "boma_standard_change"
        assert DenominatorChangeType.SHARE_RECALCULATION == "share_recalculation"

    def test_enum_is_str(self) -> None:
        assert isinstance(DenominatorChangeType.RSF_REMEASUREMENT, str)


class TestDenominatorChange:
    def test_valid_construction(self) -> None:
        change = DenominatorChange(
            change_type=DenominatorChangeType.RSF_REMEASUREMENT,
            description="Building re-measured under BOMA 2024",
            prior_value="100,000 RSF",
            current_value="105,000 RSF",
            impact_description="Total rentable area increased by 5,000 RSF (5.0%)",
        )
        assert change.change_type == DenominatorChangeType.RSF_REMEASUREMENT
        assert change.description == "Building re-measured under BOMA 2024"
        assert change.prior_value == "100,000 RSF"
        assert change.current_value == "105,000 RSF"

    def test_missing_required_field_raises(self) -> None:
        with pytest.raises(Exception):
            DenominatorChange(
                change_type=DenominatorChangeType.TENANT_ADDED,
                description="New tenant added",
            )  # type: ignore[call-arg]


class TestTenantShareImpact:
    def test_valid_construction(self) -> None:
        impact = TenantShareImpact(
            lease_id=uuid4(),
            tenant_name="Acme Corp",
            prior_pro_rata_share=Decimal("0.1000"),
            current_pro_rata_share=Decimal("0.1667"),
            share_delta_pct_points=Decimal("6.67"),
            prior_estimated_recovery=Decimal("50000.00"),
            current_estimated_recovery=Decimal("83350.00"),
            recovery_delta=Decimal("33350.00"),
            contributing_changes=[
                DenominatorChangeType.TENANT_REMOVED,
                DenominatorChangeType.RSF_REMEASUREMENT,
            ],
        )
        assert impact.tenant_name == "Acme Corp"
        assert impact.share_delta_pct_points == Decimal("6.67")
        assert len(impact.contributing_changes) == 2

    def test_decimal_precision_preserved(self) -> None:
        impact = TenantShareImpact(
            lease_id=uuid4(),
            tenant_name="Test Tenant",
            prior_pro_rata_share=Decimal("0.123456"),
            current_pro_rata_share=Decimal("0.654321"),
            share_delta_pct_points=Decimal("53.0865"),
            prior_estimated_recovery=Decimal("12345.67"),
            current_estimated_recovery=Decimal("65432.10"),
            recovery_delta=Decimal("53086.43"),
            contributing_changes=[DenominatorChangeType.RSF_REMEASUREMENT],
        )
        assert impact.prior_pro_rata_share == Decimal("0.123456")
        assert impact.current_pro_rata_share == Decimal("0.654321")


class TestDenominatorChangeReport:
    def test_valid_construction(self) -> None:
        prop_id = uuid4()
        now = datetime.now(UTC)
        report = DenominatorChangeReport(
            property_id=prop_id,
            property_name="Oakwood Plaza",
            prior_period="2023-01-01 to 2023-12-31",
            current_period="2024-01-01 to 2024-12-31",
            prior_total_rsf=Decimal("100000"),
            current_total_rsf=Decimal("105000"),
            rsf_delta=Decimal("5000"),
            rsf_delta_percent=Decimal("5.00"),
            changes=[
                DenominatorChange(
                    change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                    description="Building re-measured",
                    prior_value="100,000 RSF",
                    current_value="105,000 RSF",
                    impact_description="5% increase in total RSF",
                ),
            ],
            tenant_impacts=[],
            summary="Total RSF changed from 100,000 to 105,000 (5.00% increase). 1 denominator change detected.",
            generated_at=now,
        )
        assert report.property_id == prop_id
        assert report.rsf_delta == Decimal("5000")
        assert len(report.changes) == 1
        assert len(report.tenant_impacts) == 0

    def test_empty_changes_list(self) -> None:
        report = DenominatorChangeReport(
            property_id=uuid4(),
            property_name="Test Property",
            prior_period="2023-01-01 to 2023-12-31",
            current_period="2024-01-01 to 2024-12-31",
            prior_total_rsf=Decimal("50000"),
            current_total_rsf=Decimal("50000"),
            rsf_delta=Decimal("0"),
            rsf_delta_percent=Decimal("0.00"),
            changes=[],
            tenant_impacts=[],
            summary="No denominator changes detected between periods.",
            generated_at=datetime.now(UTC),
        )
        assert len(report.changes) == 0
        assert report.rsf_delta == Decimal("0")

    def test_report_with_multiple_changes_and_impacts(self) -> None:
        lease_id = uuid4()
        report = DenominatorChangeReport(
            property_id=uuid4(),
            property_name="Multi-Change Property",
            prior_period="2022-01-01 to 2022-12-31",
            current_period="2023-01-01 to 2023-12-31",
            prior_total_rsf=Decimal("200000"),
            current_total_rsf=Decimal("180000"),
            rsf_delta=Decimal("-20000"),
            rsf_delta_percent=Decimal("-10.00"),
            changes=[
                DenominatorChange(
                    change_type=DenominatorChangeType.TENANT_REMOVED,
                    description="Anchor tenant vacated",
                    prior_value="Suite 100 - BigCo (40,000 RSF)",
                    current_value="Vacant",
                    impact_description="Anchor tenant no longer in pool",
                ),
                DenominatorChange(
                    change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                    description="Building re-measured",
                    prior_value="200,000 RSF",
                    current_value="180,000 RSF",
                    impact_description="RSF decreased 10%",
                ),
            ],
            tenant_impacts=[
                TenantShareImpact(
                    lease_id=lease_id,
                    tenant_name="Small Tenant A",
                    prior_pro_rata_share=Decimal("0.0500"),
                    current_pro_rata_share=Decimal("0.0556"),
                    share_delta_pct_points=Decimal("0.56"),
                    prior_estimated_recovery=Decimal("25000.00"),
                    current_estimated_recovery=Decimal("27800.00"),
                    recovery_delta=Decimal("2800.00"),
                    contributing_changes=[
                        DenominatorChangeType.TENANT_REMOVED,
                        DenominatorChangeType.RSF_REMEASUREMENT,
                    ],
                ),
            ],
            summary="2 denominator changes detected.",
            generated_at=datetime.now(UTC),
        )
        assert len(report.changes) == 2
        assert len(report.tenant_impacts) == 1
        assert report.tenant_impacts[0].recovery_delta == Decimal("2800.00")
