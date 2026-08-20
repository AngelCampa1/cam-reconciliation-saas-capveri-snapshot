"""Tests for the comparison domain model (B1.1).

Pure Pydantic v2 + Decimal types. No mocks.
"""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.comparison.models import (
    ComparisonResult,
    TenantVariance,
    VarianceDirection,
    classify_variance,
)


class TestVarianceDirection:
    """Tests for VarianceDirection enum values."""

    def test_enum_values(self):
        assert VarianceDirection.OVERCHARGE.value == "overcharge"
        assert VarianceDirection.UNDERCHARGE.value == "undercharge"
        assert VarianceDirection.MATCH.value == "match"


class TestClassifyVariance:
    """Tests for the tolerance-based direction classifier."""

    @pytest.mark.parametrize(
        ("variance", "tolerance", "expected"),
        [
            (Decimal("100"), Decimal("0.01"), VarianceDirection.OVERCHARGE),
            (Decimal("-100"), Decimal("0.01"), VarianceDirection.UNDERCHARGE),
            (Decimal("0"), Decimal("0.01"), VarianceDirection.MATCH),
            # Exactly at tolerance is inclusive => MATCH.
            (Decimal("0.01"), Decimal("0.01"), VarianceDirection.MATCH),
            (Decimal("-0.01"), Decimal("0.01"), VarianceDirection.MATCH),
            # Just beyond tolerance flips direction.
            (Decimal("0.02"), Decimal("0.01"), VarianceDirection.OVERCHARGE),
            (Decimal("-0.02"), Decimal("0.01"), VarianceDirection.UNDERCHARGE),
            # Custom (wider) tolerance.
            (Decimal("5"), Decimal("10"), VarianceDirection.MATCH),
        ],
    )
    def test_classification(self, variance, tolerance, expected):
        assert classify_variance(variance, tolerance) is expected

    def test_default_tolerance_is_one_cent(self):
        assert classify_variance(Decimal("0.01")) is VarianceDirection.MATCH
        assert classify_variance(Decimal("0.02")) is VarianceDirection.OVERCHARGE


class TestTenantVariance:
    """Tests for the TenantVariance model."""

    def test_creates_valid_overcharge(self):
        tv = TenantVariance(
            lease_id="lease-1",
            tenant_name="Acme",
            capveri_correct=Decimal("1000"),
            actual_charged=Decimal("1200"),
            variance=Decimal("200"),
            direction=VarianceDirection.OVERCHARGE,
            abs_variance=Decimal("200"),
            variance_pct=Decimal("20"),
        )
        assert tv.lease_id == "lease-1"
        assert tv.tenant_name == "Acme"
        assert tv.direction is VarianceDirection.OVERCHARGE
        assert tv.variance_pct == Decimal("20")

    def test_tenant_name_and_pct_optional(self):
        tv = TenantVariance(
            lease_id="lease-1",
            capveri_correct=Decimal("0"),
            actual_charged=Decimal("500"),
            variance=Decimal("500"),
            direction=VarianceDirection.OVERCHARGE,
            abs_variance=Decimal("500"),
        )
        assert tv.tenant_name is None
        assert tv.variance_pct is None


class TestComparisonResult:
    """Tests for the ComparisonResult aggregate model."""

    def test_creates_valid_result(self):
        prop_id = uuid4()
        result = ComparisonResult(
            property_id=prop_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            tolerance=Decimal("0.01"),
            tenants=[],
            total_capveri_correct=Decimal("0"),
            total_actual_charged=Decimal("0"),
            total_net_variance=Decimal("0"),
            total_overcharge=Decimal("0"),
            total_undercharge=Decimal("0"),
            overcharge_count=0,
            undercharge_count=0,
            match_count=0,
        )
        assert result.property_id == prop_id
        assert result.tenants == []
