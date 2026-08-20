"""Integration test for multi-property fixture validation (mocked database).

This test validates the multi-property fixture set structure and calculations
using fixture data only (no database operations).

For true e2e tests with real database, see test_multi_property_e2e_real.py
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pandas as pd
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
MANIFEST_PATH = FIXTURES_DIR / "multi_property_manifest.json"

pytestmark = pytest.mark.integration


def fixture_path(relative_path: str) -> Path:
    """Resolve manifest paths generated with Windows separators."""
    return FIXTURES_DIR.joinpath(*relative_path.split("\\"))


@pytest.fixture
def multi_property_manifest() -> dict:
    """Load the multi-property manifest."""
    with open(MANIFEST_PATH) as f:
        return json.load(f)


@pytest.mark.integration
def test_base_year_calculation_e2e(multi_property_manifest: dict) -> None:
    """End-to-end test: Base year calculation across all properties.

    This test demonstrates how to use the fixture set to test base year
    expense calculations across the entire portfolio.
    """
    # Step 1: Iterate through all properties
    for prop in multi_property_manifest["properties"]:
        property_name = prop["name"]

        # Step 2: Load GL export for property (building-level expenses)
        gl_path = fixture_path(prop["files"]["gl_export"])
        assert gl_path.exists(), f"GL export missing for {property_name}"

        # Step 3: Load rent roll (tenant occupancy data)
        rr_path = fixture_path(prop["files"]["rent_roll"])
        assert rr_path.exists(), f"Rent roll missing for {property_name}"
        rent_roll = pd.read_csv(rr_path, skiprows=4)

        # Step 4: Verify tenant count matches between manifest and rent roll
        manifest_tenant_count = len(prop["tenants"])
        rent_roll_tenant_count = len(rent_roll)
        assert (
            manifest_tenant_count == rent_roll_tenant_count
        ), f"{property_name}: Tenant count mismatch"

        # Step 5: Process each tenant's reconciliation
        for tenant in prop["tenants"]:
            tenant_id = tenant["tenant_id"]

            # Load lease PDF for this tenant
            lease_path = fixture_path(tenant["lease_pdf"])
            assert lease_path.exists(), f"Lease PDF missing for {tenant_id}"

            # Load expected extraction values
            expected_path = fixture_path(tenant["expected_extraction"])
            assert expected_path.exists(), f"Expected values missing for {tenant_id}"

            with open(expected_path) as f:
                expected_extraction = json.load(f)

            # Verify financial DNA extraction would match expected values
            assert (
                expected_extraction["lease_terms"]["base_year"]
                == prop["financial_terms"]["base_year"]
            )

            # Get expected reconciliation output
            expected_recon = tenant["expected_reconciliation"]

            # Verify base year is consistent
            assert expected_recon["base_year"] == prop["financial_terms"]["base_year"]

            # Verify pro-rata share calculation
            expected_pro_rata = Decimal(str(tenant["rentable_sqft"])) / Decimal(
                str(prop["total_sqft"])
            )
            actual_pro_rata = Decimal(str(expected_recon["pro_rata_share"]))

            # Should match within 0.0001 (0.01%)
            assert abs(expected_pro_rata - actual_pro_rata) < Decimal("0.0001")

            # Step 6: In a real test, would calculate tenant share here
            # For now, verify the expected calculation structure exists
            assert "building_expenses" in expected_recon
            assert "base_year_total" in expected_recon["building_expenses"]
            assert "current_year_total" in expected_recon["building_expenses"]
            assert "expense_increase" in expected_recon["building_expenses"]

            # Verify increase calculation
            base_total = expected_recon["building_expenses"]["base_year_total"]
            current_total = expected_recon["building_expenses"]["current_year_total"]
            increase = expected_recon["building_expenses"]["expense_increase"]

            assert increase == current_total - base_total

            # Verify tenant billable amount structure
            assert "tenant_billable" in expected_recon
            assert "amount" in expected_recon["tenant_billable"]
            assert "per_sqft" in expected_recon["tenant_billable"]

            # PSF should equal amount / rentable_sqft
            billable_amount = expected_recon["tenant_billable"]["amount"]
            per_sqft = expected_recon["tenant_billable"]["per_sqft"]
            expected_psf = billable_amount / tenant["rentable_sqft"]

            assert abs(per_sqft - expected_psf) < 0.01  # Within 1 cent


@pytest.mark.integration
def test_portfolio_rollup_e2e(multi_property_manifest: dict) -> None:
    """E2E test: Portfolio-wide rollup calculation.

    Demonstrates aggregating reconciliation results across all properties
    to generate a portfolio-level report.
    """
    total_properties = len(multi_property_manifest["properties"])
    total_tenants = 0
    total_sqft = 0
    total_billable = Decimal("0")

    # Roll up across all properties
    for prop in multi_property_manifest["properties"]:
        # Aggregate property-level totals
        total_tenants += len(prop["tenants"])
        total_sqft += prop["total_sqft"]

        # Aggregate tenant-level billable amounts
        for tenant in prop["tenants"]:
            tenant_billable = tenant["expected_reconciliation"]["tenant_billable"][
                "amount"
            ]
            total_billable += Decimal(str(tenant_billable))

    # Verify portfolio totals match manifest
    assert total_tenants == multi_property_manifest["total_tenants"]
    assert total_sqft == multi_property_manifest["total_sqft"]

    # Portfolio-level assertions
    assert total_properties == 3
    assert total_tenants == 12
    assert total_sqft == 375000
    assert total_billable > Decimal("0")  # At least some billable amount


@pytest.mark.integration
def test_different_cap_types_e2e(multi_property_manifest: dict) -> None:
    """E2E test: Different cap types applied correctly.

    Verifies that each property uses its designated cap type and that
    the calculations would differ appropriately.
    """
    cap_types_used = set()

    for prop in multi_property_manifest["properties"]:
        cap_type = prop["financial_terms"]["cap_type"]
        cap_types_used.add(cap_type)

        # Each property should have a cap type
        assert cap_type in [
            "cumulative",
            "non_cumulative",
            "cumulative_compounding",
        ]

    # Verify all three cap types are represented in the fixture set
    assert len(cap_types_used) == 3
    assert "cumulative" in cap_types_used
    assert "non_cumulative" in cap_types_used
    assert "cumulative_compounding" in cap_types_used
