"""
Tests that the HOU-01 fixture files parse correctly with expected
row counts, amounts, and seeded error markers.
"""

import json
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest

FIXTURES = Path(__file__).parent / "erp_export_samples"


@pytest.fixture
def yardi_parse_result():
    from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

    data = (FIXTURES / "yardi_gl_hou01_2024.csv").read_bytes()
    return YardiVoyagerGLParser().parse(
        BytesIO(data), "yardi_gl_hou01_2024.csv", str(uuid4())
    )


@pytest.fixture
def mri_parse_result():
    from app.services.ingestion.parsers.mri import MRIRentRollParser

    data = (FIXTURES / "mri_gl_hou01_2024.csv").read_bytes()
    return MRIRentRollParser().parse(
        BytesIO(data), "mri_gl_hou01_2024.csv", str(uuid4())
    )


def test_yardi_hou01_parses_30_rows(yardi_parse_result):
    result = yardi_parse_result
    assert result.success is True
    assert result.row_count == 30
    assert result.error_count == 0


def test_yardi_hou01_property_tax_row(yardi_parse_result):
    """Error 1: property tax row must be present at $95,000 — not grossed up."""
    result = yardi_parse_result
    tax_rows = result.data[result.data["account_code"].str.startswith("5800")]
    assert len(tax_rows) == 1
    assert Decimal(str(tax_rows.iloc[0]["amount"])) == Decimal("95000.00")


def test_yardi_hou01_capex_misclassification_row(yardi_parse_result):
    """Error 2: HVAC chiller overhaul $12,000 present in 5300.15."""
    result = yardi_parse_result
    rm_rows = result.data[result.data["account_code"] == "5300.15"]
    assert len(rm_rows) == 1
    assert Decimal(str(rm_rows.iloc[0]["amount"])) == Decimal("12000.00")
    # Description or vendor must mention the chiller
    description = str(rm_rows.iloc[0].get("account_description", ""))
    vendor = str(rm_rows.iloc[0].get("vendor_name", ""))
    assert "Chiller" in description or "Chiller" in vendor or "HVAC" in description


def test_mri_hou01_parses_30_rows(mri_parse_result):
    result = mri_parse_result
    assert result.success is True
    assert result.row_count == 30
    assert result.error_count == 0


def test_mri_hou01_amounts_match_yardi(yardi_parse_result, mri_parse_result):
    """MRI and Yardi fixtures must contain the same dollar totals."""
    yardi_total = float(yardi_parse_result.data["amount"].sum())
    mri_total = float(mri_parse_result.data["amount"].sum())
    assert abs(yardi_total - mri_total) < 0.01


def test_lease_abstracts_json_valid():
    fixture = Path(__file__).parent / "lease_abstracts_hou01.json"
    data = json.loads(fixture.read_text())
    assert len(data["tenants"]) == 5
    assert "error_1_gross_up_on_tax" in data["_seeded_errors"]
    assert "error_2_capex_misclassification" in data["_seeded_errors"]
    assert "error_3_cap_violation" in data["_seeded_errors"]


def test_cap_violation_math_is_correct():
    """Error 3: verify the cap violation amount in the fixture is correct."""
    fixture = Path(__file__).parent / "lease_abstracts_hou01.json"
    data = json.loads(fixture.read_text())
    err = data["_seeded_errors"]["error_3_cap_violation"]
    prior = Decimal(str(err["prior_year_controllable"]))
    current = Decimal(str(err["current_year_controllable"]))
    cap_limit = Decimal(str(err["five_pct_cap_limit"]))

    assert abs(cap_limit - prior * Decimal("1.05")) < Decimal("1.00")
    assert current > cap_limit
    assert Decimal(str(err["cap_violation_amount"])) == (current - cap_limit).quantize(
        Decimal("0.01")
    )
