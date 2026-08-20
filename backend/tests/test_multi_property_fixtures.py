"""Tests for multi-property fixture set.

Validates that the coordinated multi-property fixture set is properly structured
and all files are correctly linked through the master manifest.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pandas as pd
import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"
MANIFEST_PATH = FIXTURES_DIR / "multi_property_manifest.json"


def fixture_path(relative_path: str) -> Path:
    """Resolve manifest paths generated with Windows separators."""
    return FIXTURES_DIR.joinpath(*relative_path.split("\\"))


class TestMultiPropertyManifest:
    """Tests for the multi-property manifest file."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_manifest_exists(self) -> None:
        """Manifest file exists."""
        assert MANIFEST_PATH.exists()

    def test_manifest_structure(self, manifest: dict[str, Any]) -> None:
        """Manifest has required top-level fields."""
        assert "generated_date" in manifest
        assert "seed" in manifest
        assert "properties" in manifest
        assert "total_tenants" in manifest
        assert "total_sqft" in manifest

    def test_manifest_seed(self, manifest: dict[str, Any]) -> None:
        """Manifest uses seed 42 for reproducibility."""
        assert manifest["seed"] == 42

    def test_manifest_has_three_properties(self, manifest: dict[str, Any]) -> None:
        """Manifest includes exactly 3 properties."""
        assert len(manifest["properties"]) == 3

    def test_manifest_tenant_count(self, manifest: dict[str, Any]) -> None:
        """Total tenant count matches sum across properties."""
        total_tenants = sum(prop["num_tenants"] for prop in manifest["properties"])
        assert manifest["total_tenants"] == total_tenants
        assert total_tenants == 12  # 4 + 3 + 5

    def test_manifest_sqft_total(self, manifest: dict[str, Any]) -> None:
        """Total sqft matches sum across properties."""
        total_sqft = sum(prop["total_sqft"] for prop in manifest["properties"])
        assert manifest["total_sqft"] == total_sqft
        assert total_sqft == 375000  # 100k + 75k + 200k


class TestPropertyDefinitions:
    """Tests for property-level data in manifest."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_property_ids(self, manifest: dict[str, Any]) -> None:
        """Properties have correct IDs."""
        prop_ids = [prop["property_id"] for prop in manifest["properties"]]
        assert "PROP001" in prop_ids
        assert "PROP002" in prop_ids
        assert "PROP003" in prop_ids

    def test_property_names(self, manifest: dict[str, Any]) -> None:
        """Properties have descriptive names."""
        prop_names = [prop["name"] for prop in manifest["properties"]]
        assert "Parkview Office Tower" in prop_names
        assert "Metro Business Center" in prop_names
        assert "Harbor Industrial Park" in prop_names

    def test_property_classes(self, manifest: dict[str, Any]) -> None:
        """Properties have different classes."""
        classes = [prop["class"] for prop in manifest["properties"]]
        assert "Class A Office" in classes
        assert "Class B Office" in classes
        assert "Industrial" in classes

    def test_property_occupancy_rates(self, manifest: dict[str, Any]) -> None:
        """Property occupancy rates are realistic."""
        for prop in manifest["properties"]:
            assert 0.85 <= prop["occupancy_rate"] <= 1.0


class TestFinancialTerms:
    """Tests for financial terms in properties."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_all_properties_have_financial_terms(
        self, manifest: dict[str, Any]
    ) -> None:
        """All properties have financial_terms section."""
        for prop in manifest["properties"]:
            assert "financial_terms" in prop
            terms = prop["financial_terms"]
            assert "base_year" in terms
            assert "cap_type" in terms
            assert "cap_rate" in terms
            assert "gross_up_target" in terms
            assert "admin_fee_percent" in terms

    def test_base_year_is_2024(self, manifest: dict[str, Any]) -> None:
        """All properties use 2024 as base year."""
        for prop in manifest["properties"]:
            assert prop["financial_terms"]["base_year"] == 2024

    def test_different_cap_types(self, manifest: dict[str, Any]) -> None:
        """Properties use different cap types."""
        cap_types = [
            prop["financial_terms"]["cap_type"] for prop in manifest["properties"]
        ]
        assert "cumulative" in cap_types
        assert "non_cumulative" in cap_types
        assert "cumulative_compounding" in cap_types

    def test_cap_rates_realistic(self, manifest: dict[str, Any]) -> None:
        """Cap rates are in realistic range (3-5%)."""
        for prop in manifest["properties"]:
            cap_rate = prop["financial_terms"]["cap_rate"]
            assert 0.03 <= cap_rate <= 0.05

    def test_gross_up_targets_realistic(self, manifest: dict[str, Any]) -> None:
        """Gross-up targets are in realistic range (90-95%)."""
        for prop in manifest["properties"]:
            target = prop["financial_terms"]["gross_up_target"]
            assert 0.90 <= target <= 0.95


class TestFileExistence:
    """Tests that all referenced files actually exist."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_gl_exports_exist(self, manifest: dict[str, Any]) -> None:
        """All GL export files exist."""
        for prop in manifest["properties"]:
            gl_path = fixture_path(prop["files"]["gl_export"])
            assert gl_path.exists(), f"Missing GL export: {gl_path}"

    def test_rent_rolls_exist(self, manifest: dict[str, Any]) -> None:
        """All rent roll files exist."""
        for prop in manifest["properties"]:
            rr_path = fixture_path(prop["files"]["rent_roll"])
            assert rr_path.exists(), f"Missing rent roll: {rr_path}"

    def test_lease_pdfs_exist(self, manifest: dict[str, Any]) -> None:
        """All lease PDF files exist."""
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                lease_path = fixture_path(tenant["lease_pdf"])
                assert lease_path.exists(), f"Missing lease PDF: {lease_path}"

    def test_expected_extraction_files_exist(self, manifest: dict[str, Any]) -> None:
        """All expected extraction JSON files exist."""
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                expected_path = fixture_path(tenant["expected_extraction"])
                assert expected_path.exists(), f"Missing expected file: {expected_path}"


class TestTenantData:
    """Tests for tenant-level data coordination."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_tenant_ids_unique(self, manifest: dict[str, Any]) -> None:
        """All tenant IDs are unique across properties."""
        all_tenant_ids = []
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                all_tenant_ids.append(tenant["tenant_id"])
        assert len(all_tenant_ids) == len(set(all_tenant_ids))

    def test_tenant_ids_follow_convention(self, manifest: dict[str, Any]) -> None:
        """Tenant IDs follow property-T## convention."""
        for prop in manifest["properties"]:
            prop_id = prop["property_id"]
            for tenant in prop["tenants"]:
                tenant_id = tenant["tenant_id"]
                assert tenant_id.startswith(prop_id)
                assert "-T" in tenant_id

    def test_tenant_sqft_reasonable(self, manifest: dict[str, Any]) -> None:
        """Tenant sqft values are in reasonable range."""
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                # Min 1k, max proportional to building size
                assert 1000 <= tenant["rentable_sqft"] <= prop["total_sqft"]
                assert 800 <= tenant["usable_sqft"] <= prop["total_sqft"]
                assert tenant["usable_sqft"] < tenant["rentable_sqft"]

    def test_tenant_rent_positive(self, manifest: dict[str, Any]) -> None:
        """Tenant monthly rent is positive."""
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                assert tenant["monthly_rent"] > 0


class TestRentRollCoordination:
    """Tests that rent rolls match tenant data in manifest."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_rent_roll_tenant_count_matches(self, manifest: dict[str, Any]) -> None:
        """Rent roll has same number of tenants as manifest."""
        for prop in manifest["properties"]:
            rr_path = fixture_path(prop["files"]["rent_roll"])
            df = pd.read_csv(rr_path, skiprows=4)  # Skip MRI headers

            # Count non-header rows
            tenant_rows = len(df)
            manifest_tenants = len(prop["tenants"])

            assert tenant_rows == manifest_tenants

    def test_rent_roll_sqft_matches(self, manifest: dict[str, Any]) -> None:
        """Rent roll square footage matches manifest."""
        for prop in manifest["properties"]:
            rr_path = fixture_path(prop["files"]["rent_roll"])
            df = pd.read_csv(rr_path, skiprows=4)

            # Get total sqft from rent roll
            rr_total_sqft = df["SQFT"].sum()

            # Get total from manifest
            manifest_total = sum(t["rentable_sqft"] for t in prop["tenants"])

            assert rr_total_sqft == manifest_total


class TestExpectedReconciliation:
    """Tests for expected reconciliation calculations."""

    @pytest.fixture
    def manifest(self) -> dict[str, Any]:
        """Load the multi-property manifest."""
        with open(MANIFEST_PATH) as f:
            return cast(dict[str, Any], json.load(f))

    def test_expected_reconciliation_structure(self, manifest: dict[str, Any]) -> None:
        """Expected reconciliation has required fields."""
        for prop in manifest["properties"]:
            for tenant in prop["tenants"]:
                recon = tenant["expected_reconciliation"]
                assert "tenant_id" in recon
                assert "property_id" in recon
                assert "reconciliation_year" in recon
                assert "base_year" in recon
                assert "pro_rata_share" in recon
                assert "building_expenses" in recon
                assert "tenant_billable" in recon

    def test_pro_rata_shares_sum_close_to_100(self, manifest: dict[str, Any]) -> None:
        """Pro-rata shares sum to approximately 100% per property."""
        for prop in manifest["properties"]:
            total_share = sum(
                t["expected_reconciliation"]["pro_rata_share"] for t in prop["tenants"]
            )
            # Should be close to 1.0 (100%), accounting for vacancy
            assert 0.85 <= total_share <= 1.0


class TestFixtureSetCompleteness:
    """Tests for overall fixture set completeness."""

    def test_all_subdirectories_exist(self) -> None:
        """All required subdirectories exist."""
        assert (FIXTURES_DIR / "yardi").exists()
        assert (FIXTURES_DIR / "mri").exists()
        assert (FIXTURES_DIR / "leases").exists()
        assert (FIXTURES_DIR / "expected").exists()

    def test_yardi_directory_has_files(self) -> None:
        """Yardi directory contains multi-property GL export files."""
        yardi_files = list((FIXTURES_DIR / "yardi").glob("gl_export_prop*.csv"))
        assert len(yardi_files) == 3

    def test_mri_directory_has_files(self) -> None:
        """MRI directory contains multi-property rent roll files."""
        mri_files = list((FIXTURES_DIR / "mri").glob("rent_roll_prop*.csv"))
        assert len(mri_files) == 3

    def test_leases_directory_has_pdfs(self) -> None:
        """Leases directory contains PDF files."""
        lease_files = list((FIXTURES_DIR / "leases").glob("lease_*.pdf"))
        assert len(lease_files) == 12

    def test_expected_directory_has_extraction_files(self) -> None:
        """Expected directory contains extraction JSON files."""
        expected_files = list((FIXTURES_DIR / "expected").glob("lease_*_expected.json"))
        # Should have 12 tenant extraction files plus 14 calculation expected files
        assert len(expected_files) >= 12
