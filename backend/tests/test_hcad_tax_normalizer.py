"""
Tests for HCAD Tax Base Year Normalizer.

Texas ARB retroactive property tax reductions lower the tenant's expense
stop, meaning more tax can legally pass through. This tool quantifies
the recovery opportunity.

Formula:
    adjusted_base = original_base_year - retroactive_adjustment
    original_passthrough  = max(0, current_year_tax - original_base_year) * pro_rata
    corrected_passthrough = max(0, current_year_tax - adjusted_base) * pro_rata
    recovery_delta = corrected_passthrough - original_passthrough
"""

from decimal import Decimal

from fastapi.testclient import TestClient

from app.main import app
from app.services.calculation.hcad_tax_normalizer import (
    HcadInput,
    calculate_hcad_tax_normalization,
)

# ---------------------------------------------------------------------------
# Service unit tests
# ---------------------------------------------------------------------------


class TestHcadTaxNormalization:
    """Tests for calculate_hcad_tax_normalization()."""

    def test_basic_recovery(self):
        """Positive recovery delta when retroactive adjustment lowers base."""
        # original_base=100k, retro_adj=10k → adjusted_base=90k
        # current=120k, pro_rata=5%
        # original_passthrough = (120k-100k)*0.05 = 1_000
        # corrected_passthrough = (120k-90k)*0.05 = 1_500
        # recovery_delta = 500
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("10000.00"),
                current_year_tax=Decimal("120000.00"),
                pro_rata_pct=Decimal("0.05"),
            )
        )

        assert result.adjusted_base_year == Decimal("90000.00")
        assert result.original_passthrough == Decimal("1000.00")
        assert result.corrected_passthrough == Decimal("1500.00")
        assert result.recovery_delta == Decimal("500.00")
        assert result.cap_was_applied is None
        assert result.capped_corrected_passthrough is None
        assert result.capped_recovery is None

    def test_no_recovery_when_tax_below_adjusted_base(self):
        """Zero delta when current tax is below the adjusted base."""
        # original_base=100k, retro_adj=10k → adjusted_base=90k
        # current=85k (below both bases)
        # original_passthrough = 0, corrected_passthrough = 0
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("10000.00"),
                current_year_tax=Decimal("85000.00"),
                pro_rata_pct=Decimal("0.05"),
            )
        )

        assert result.original_passthrough == Decimal("0.00")
        assert result.corrected_passthrough == Decimal("0.00")
        assert result.recovery_delta == Decimal("0.00")

    def test_recovery_when_tax_below_original_base_but_above_adjusted(self):
        """Recovery exists when tax is below original base but above adjusted base.

        This is the key HCAD scenario: landlord was billing $0 (tax under original
        base) but should have been billing after retroactive reduction.
        """
        # original_base=100k, retro_adj=30k → adjusted_base=70k
        # current=80k (below original base, above adjusted base)
        # original_passthrough = max(0, 80k-100k)*0.05 = 0
        # corrected_passthrough = max(0, 80k-70k)*0.05 = 500
        # recovery_delta = 500
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("30000.00"),
                current_year_tax=Decimal("80000.00"),
                pro_rata_pct=Decimal("0.05"),
            )
        )

        assert result.adjusted_base_year == Decimal("70000.00")
        assert result.original_passthrough == Decimal("0.00")
        assert result.corrected_passthrough == Decimal("500.00")
        assert result.recovery_delta == Decimal("500.00")

    def test_zero_retroactive_adjustment_no_delta(self):
        """No recovery when retroactive adjustment is zero."""
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("0.00"),
                current_year_tax=Decimal("130000.00"),
                pro_rata_pct=Decimal("0.05"),
            )
        )

        assert result.adjusted_base_year == Decimal("100000.00")
        assert result.original_passthrough == result.corrected_passthrough
        assert result.recovery_delta == Decimal("0.00")

    def test_cap_limits_recovery(self):
        """Cap reduces the recovery when corrected passthrough exceeds cap limit."""
        # original_base=100k, retro_adj=10k → adjusted_base=90k
        # current=150k, pro_rata=5%
        # original_passthrough = (150k-100k)*0.05 = 2_500
        # corrected_passthrough = (150k-90k)*0.05 = 3_000
        # cap_rate=10%: max_allowed = 2_500 * 1.10 = 2_750
        # capped_corrected = 2_750 (since 3_000 > 2_750)
        # capped_recovery = 2_750 - 2_500 = 250
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("10000.00"),
                current_year_tax=Decimal("150000.00"),
                pro_rata_pct=Decimal("0.05"),
                cap_rate=Decimal("0.10"),
            )
        )

        assert result.original_passthrough == Decimal("2500.00")
        assert result.corrected_passthrough == Decimal("3000.00")
        assert result.recovery_delta == Decimal("500.00")
        assert result.cap_was_applied is True
        assert result.capped_corrected_passthrough == Decimal("2750.00")
        assert result.capped_recovery == Decimal("250.00")

    def test_cap_not_triggered_when_recovery_within_limit(self):
        """Cap is not triggered when corrected passthrough is within the cap limit."""
        # original_base=100k, retro_adj=5k → adjusted_base=95k
        # current=130k, pro_rata=5%
        # original_passthrough = (130k-100k)*0.05 = 1_500
        # corrected_passthrough = (130k-95k)*0.05 = 1_750
        # cap_rate=50%: max_allowed = 1_500 * 1.50 = 2_250
        # 1_750 <= 2_250, so cap NOT triggered
        # capped_corrected = 1_750 (same as corrected)
        # capped_recovery = 250 (same as recovery_delta)
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("5000.00"),
                current_year_tax=Decimal("130000.00"),
                pro_rata_pct=Decimal("0.05"),
                cap_rate=Decimal("0.50"),
            )
        )

        assert result.original_passthrough == Decimal("1500.00")
        assert result.corrected_passthrough == Decimal("1750.00")
        assert result.recovery_delta == Decimal("250.00")
        assert result.cap_was_applied is False
        assert result.capped_corrected_passthrough == Decimal("1750.00")
        assert result.capped_recovery == Decimal("250.00")

    def test_decimal_precision(self):
        """All money values are quantized to cents (2 decimal places)."""
        # Use values that produce fractional cents before rounding
        # original_base=100k, retro_adj=3k → adjusted_base=97k
        # current=110001, pro_rata=1/3
        # original_passthrough = (110001-100000) * (1/3) = 10001/3 = 3333.67 (rounded)
        # corrected_passthrough = (110001-97000) * (1/3) = 13001/3 = 4333.67 (rounded)
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000"),
                retroactive_adjustment=Decimal("3000"),
                current_year_tax=Decimal("110001"),
                pro_rata_pct=Decimal("0.3333333333"),
            )
        )

        # Result must have exactly 2 decimal places
        assert result.original_passthrough == result.original_passthrough.quantize(
            Decimal("0.01")
        )
        assert result.corrected_passthrough == result.corrected_passthrough.quantize(
            Decimal("0.01")
        )
        assert result.recovery_delta == result.recovery_delta.quantize(Decimal("0.01"))

    def test_pro_rata_applied_correctly(self):
        """Pro-rata percentage is applied to the increase, not the total tax."""
        # Two tenants with different pro-rata, same tax scenario
        # original_base=100k, retro_adj=20k → adjusted_base=80k
        # current=110k
        # original_passthrough = max(0, 110k-100k)*pro_rata = 10k * pro_rata
        # corrected_passthrough = max(0, 110k-80k)*pro_rata = 30k * pro_rata
        result_10pct = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("20000.00"),
                current_year_tax=Decimal("110000.00"),
                pro_rata_pct=Decimal("0.10"),
            )
        )
        result_20pct = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("20000.00"),
                current_year_tax=Decimal("110000.00"),
                pro_rata_pct=Decimal("0.20"),
            )
        )

        assert result_10pct.original_passthrough == Decimal("1000.00")
        assert result_10pct.corrected_passthrough == Decimal("3000.00")
        assert result_10pct.recovery_delta == Decimal("2000.00")

        assert result_20pct.original_passthrough == Decimal("2000.00")
        assert result_20pct.corrected_passthrough == Decimal("6000.00")
        assert result_20pct.recovery_delta == Decimal("4000.00")

        # 20% pro-rata gives exactly double the 10% result
        assert result_20pct.recovery_delta == result_10pct.recovery_delta * 2

    def test_retro_adj_exceeding_base_raises_validation_error(self):
        """retroactive_adjustment > original_base_year_assessment is rejected."""
        import pytest
        from pydantic import ValidationError

        with pytest.raises(ValidationError, match="retroactive_adjustment"):
            HcadInput(
                original_base_year_assessment=Decimal("50000.00"),
                retroactive_adjustment=Decimal("100000.00"),  # exceeds base
                current_year_tax=Decimal("120000.00"),
                pro_rata_pct=Decimal("0.05"),
            )

    def test_cap_with_zero_original_passthrough(self):
        """Cap is bypassed when original passthrough is zero (FIX CAP-4 in caps.py).

        When current tax is below the original base year, the landlord billed $0.
        In that case, calculate_non_cumulative_cap receives prior_amount=0 and
        returns no cap per the FIX CAP-4 rule — the cap cannot limit a $0 baseline.
        """
        # original_base=100k, retro_adj=30k → adjusted_base=70k
        # current=80k (below original base, above adjusted base)
        # original_passthrough = max(0, 80k-100k)*0.05 = 0
        # corrected_passthrough = max(0, 80k-70k)*0.05 = 500
        # cap_rate=5%: prior_amount=0, so cap bypassed per FIX CAP-4
        result = calculate_hcad_tax_normalization(
            HcadInput(
                original_base_year_assessment=Decimal("100000.00"),
                retroactive_adjustment=Decimal("30000.00"),
                current_year_tax=Decimal("80000.00"),
                pro_rata_pct=Decimal("0.05"),
                cap_rate=Decimal("0.05"),
            )
        )

        assert result.original_passthrough == Decimal("0.00")
        assert result.corrected_passthrough == Decimal("500.00")
        assert result.cap_was_applied is False
        assert result.capped_corrected_passthrough == Decimal("500.00")
        assert result.capped_recovery == Decimal("500.00")


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

client = TestClient(app)

VALID_PAYLOAD = {
    "original_base_year_assessment": "100000.00",
    "retroactive_adjustment": "10000.00",
    "current_year_tax": "120000.00",
    "pro_rata_pct": "0.05",
}


class TestHcadTaxNormalizerEndpoint:
    """Tests for POST /api/v1/tools/hcad-tax-normalizer/calculate."""

    def test_calculate_endpoint_happy_path(self):
        """Returns 200 with correct calculation result."""
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=VALID_PAYLOAD,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["adjusted_base_year"] == "90000.00"
        assert data["original_passthrough"] == "1000.00"
        assert data["corrected_passthrough"] == "1500.00"
        assert data["recovery_delta"] == "500.00"
        assert data["cap_was_applied"] is None

    def test_calculate_endpoint_with_cap(self):
        """Returns capped values when cap_rate is provided."""
        payload = {
            **VALID_PAYLOAD,
            "current_year_tax": "150000.00",
            "cap_rate": "0.10",
        }
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=payload,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["cap_was_applied"] is True
        assert data["capped_corrected_passthrough"] == "2750.00"
        assert data["capped_recovery"] == "250.00"

    def test_calculate_endpoint_missing_required_field_422(self):
        """Returns 422 when a required field is missing."""
        incomplete = {
            "original_base_year_assessment": "100000.00",
            "retroactive_adjustment": "10000.00",
            # missing current_year_tax and pro_rata_pct
        }
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=incomplete,
        )
        assert response.status_code == 422

    def test_calculate_endpoint_no_auth_required(self):
        """Endpoint is accessible without any Authorization header."""
        # Deliberately send no Authorization header
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=VALID_PAYLOAD,
            headers={},  # no Authorization
        )
        assert response.status_code == 200

    def test_calculate_endpoint_retro_exceeds_base_returns_error(self):
        """Returns an error when retroactive_adjustment > original_base_year_assessment."""
        payload = {
            **VALID_PAYLOAD,
            "retroactive_adjustment": "200000.00",  # exceeds original_base=100000
        }
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=payload,
        )
        # App custom exception handler returns 400 for cross-field validation errors
        assert response.status_code in (400, 422)

    def test_calculate_endpoint_zero_adjustment_returns_zero_delta(self):
        """Zero retroactive adjustment → zero recovery delta."""
        payload = {
            **VALID_PAYLOAD,
            "retroactive_adjustment": "0",
        }
        response = client.post(
            "/api/v1/tools/hcad-tax-normalizer/calculate",
            json=payload,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["recovery_delta"] == "0.00"
