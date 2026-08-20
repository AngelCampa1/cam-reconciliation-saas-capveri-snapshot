"""Tests for lease PDF fixtures.

Validates that generated lease PDFs meet requirements and work with OCR/extraction.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from PyPDF2 import PdfReader

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "leases"
EXPECTED_DIR = Path(__file__).parent / "fixtures" / "expected"


class TestStandardLeasePDF:
    """Tests for the standard commercial lease PDF fixture."""

    @pytest.fixture
    def pdf_path(self) -> Path:
        """Return path to standard lease PDF."""
        return FIXTURES_DIR / "sample_commercial_lease.pdf"

    @pytest.fixture
    def expected_values(self) -> dict:
        """Load expected extraction values."""
        with open(EXPECTED_DIR / "sample_commercial_lease_expected.json") as f:
            return json.load(f)

    def test_pdf_exists(self, pdf_path: Path) -> None:
        """PDF file exists and is readable."""
        assert pdf_path.exists()
        assert pdf_path.is_file()
        assert pdf_path.stat().st_size > 0

    def test_pdf_readable(self, pdf_path: Path) -> None:
        """PDF can be opened and read."""
        reader = PdfReader(str(pdf_path))
        assert reader is not None
        assert len(reader.pages) > 0

    def test_pdf_has_multiple_pages(self, pdf_path: Path) -> None:
        """PDF has reasonable number of pages for a commercial lease."""
        reader = PdfReader(str(pdf_path))
        # Commercial leases are typically 2-10 pages
        assert len(reader.pages) >= 1
        assert len(reader.pages) <= 10

    def test_pdf_text_extractable(self, pdf_path: Path) -> None:
        """PDF text is selectable (not image-based)."""
        reader = PdfReader(str(pdf_path))
        first_page = reader.pages[0]
        text = first_page.extract_text()

        # Should have substantial text content
        assert len(text) > 100
        # Should not be mostly whitespace
        assert len(text.strip()) > 50

    def test_pdf_contains_title(self, pdf_path: Path) -> None:
        """PDF contains lease title."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        assert "COMMERCIAL LEASE AGREEMENT" in full_text.upper()

    def test_pdf_contains_all_articles(self, pdf_path: Path) -> None:
        """PDF contains all required article sections."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        full_text_upper = full_text.upper()

        required_articles = [
            "ARTICLE 1",  # Parties
            "ARTICLE 2",  # Premises
            "ARTICLE 3",  # Term
            "ARTICLE 4",  # Base Rent
            "ARTICLE 5",  # Operating Expenses
        ]

        for article in required_articles:
            assert article in full_text_upper, f"Missing {article}"

    def test_pdf_contains_base_year(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF clearly documents base year."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        base_year = expected_values["lease_terms"]["base_year"]
        # Check for "Base Year" mention
        assert "BASE YEAR" in full_text.upper() or "Base Year" in full_text
        # Check for the specific year value
        assert str(base_year) in full_text

    def test_pdf_contains_pro_rata_share(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF clearly documents pro rata share."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for "Pro Rata Share" mention
        assert (
            "PRO RATA SHARE" in full_text.upper()
            or "Pro Rata Share" in full_text
            or "proportionate share" in full_text.lower()
        )

        # Check for percentage value (3.12%)
        pro_rata_share = expected_values["lease_terms"]["pro_rata_share"]
        percentage = pro_rata_share * 100
        # Allow for slight formatting differences
        assert f"{percentage:.2f}" in full_text or f"{percentage:.4f}" in full_text

    def test_pdf_contains_expense_cap(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF clearly documents expense cap type and rate."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for cap mention
        assert "CAP" in full_text.upper() or "Cap" in full_text

        cap_type = expected_values["lease_terms"]["cap_type"]
        if cap_type == "cumulative":
            assert "CUMULATIVE" in full_text.upper() or "Cumulative" in full_text
        elif cap_type == "non_cumulative":
            assert (
                "NON-CUMULATIVE" in full_text.upper() or "Non-Cumulative" in full_text
            )

        # Check for cap rate (5%)
        cap_rate = expected_values["lease_terms"]["cap_rate"]
        cap_rate_percent = cap_rate * 100
        assert (
            f"{cap_rate_percent:.0f}%" in full_text
            or f"{cap_rate_percent:.1f}%" in full_text
        )

    def test_pdf_contains_gross_up(self, pdf_path: Path, expected_values: dict) -> None:
        """PDF clearly documents gross-up provision."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for gross-up mention
        assert (
            "GROSS" in full_text.upper()
            or "Gross-Up" in full_text
            or "grossed up" in full_text.lower()
        )

        # Check for target occupancy (95%)
        gross_up_target = expected_values["lease_terms"]["gross_up_target"]
        target_percent = gross_up_target * 100
        assert f"{target_percent:.0f}%" in full_text

    def test_pdf_contains_admin_fee(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF clearly documents administrative fee."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for admin fee mention
        assert (
            "ADMINISTRATIVE FEE" in full_text.upper()
            or "Administrative Fee" in full_text
            or "admin" in full_text.lower()
        )

        # Check for fee percentage (15%)
        admin_fee = expected_values["lease_terms"]["admin_fee_percent"]
        fee_percent = admin_fee * 100
        assert f"{fee_percent:.0f}%" in full_text

    def test_pdf_contains_square_footage(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF contains square footage information."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        rentable_sqft = expected_values["premises"]["rentable_sqft"]
        usable_sqft = expected_values["premises"]["usable_sqft"]

        # Check for square footage values
        assert f"{rentable_sqft:,}" in full_text or str(rentable_sqft) in full_text
        assert f"{usable_sqft:,}" in full_text or str(usable_sqft) in full_text

        # Check for "Rentable" and "Usable" terms
        assert "RENTABLE" in full_text.upper() or "Rentable" in full_text
        assert "USABLE" in full_text.upper() or "Usable" in full_text

    def test_pdf_contains_rent_amounts(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF contains base rent amounts."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        monthly_rent = expected_values["rent"]["monthly_base_rent"]
        annual_rent = expected_values["rent"]["annual_base_rent"]

        # Check for rent amounts (formatted with commas or without)
        assert (
            f"{monthly_rent:,.2f}" in full_text
            or f"{monthly_rent:.2f}" in full_text
            or str(int(monthly_rent)) in full_text
        )
        assert (
            f"{annual_rent:,.2f}" in full_text
            or f"{annual_rent:.2f}" in full_text
            or str(int(annual_rent)) in full_text
        )

    def test_pdf_contains_lease_dates(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF contains lease term dates."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for year references from the dates
        assert "2025" in full_text  # Commencement year
        assert "2029" in full_text or "2030" in full_text  # Expiration year

    def test_pdf_has_summary_table(self, pdf_path: Path) -> None:
        """PDF includes a lease summary table."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for summary schedule
        assert (
            "SCHEDULE A" in full_text.upper()
            or "LEASE SUMMARY" in full_text.upper()
            or "Summary" in full_text
        )

    def test_expected_values_json_valid(self, expected_values: dict) -> None:
        """Expected values JSON has correct structure."""
        # Check top-level keys
        assert "lease_terms" in expected_values
        assert "premises" in expected_values
        assert "rent" in expected_values
        assert "dates" in expected_values
        assert "extraction_confidence" in expected_values

        # Check lease terms
        lease_terms = expected_values["lease_terms"]
        assert "base_year" in lease_terms
        assert "pro_rata_share" in lease_terms
        assert "cap_type" in lease_terms
        assert "cap_rate" in lease_terms
        assert "gross_up_target" in lease_terms
        assert "admin_fee_percent" in lease_terms

        # Validate types
        assert isinstance(lease_terms["base_year"], int)
        assert isinstance(lease_terms["pro_rata_share"], int | float)
        assert isinstance(lease_terms["cap_type"], str)
        assert isinstance(lease_terms["cap_rate"], int | float)
        assert isinstance(lease_terms["gross_up_target"], int | float)
        assert isinstance(lease_terms["admin_fee_percent"], int | float)

        # Validate ranges
        assert lease_terms["base_year"] >= 2020
        assert lease_terms["base_year"] <= 2030
        assert 0 <= lease_terms["pro_rata_share"] <= 1
        assert 0 <= lease_terms["cap_rate"] <= 1
        assert 0 <= lease_terms["gross_up_target"] <= 1
        assert 0 <= lease_terms["admin_fee_percent"] <= 1

    def test_boma_compliance_mentioned(self, pdf_path: Path) -> None:
        """PDF mentions BOMA standards for area calculation."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for BOMA reference
        assert "BOMA" in full_text.upper() or "Boma" in full_text

    def test_load_factor_documented(
        self, pdf_path: Path, expected_values: dict
    ) -> None:
        """PDF documents the load factor."""
        reader = PdfReader(str(pdf_path))
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text()

        # Check for load factor mention
        assert (
            "LOAD FACTOR" in full_text.upper()
            or "Load Factor" in full_text
            or "load factor" in full_text.lower()
        )

        # Load factor value should be present
        load_factor = expected_values["premises"]["load_factor"]
        # Allow for formatting differences
        assert (
            f"{load_factor:.4f}" in full_text
            or f"{load_factor:.3f}" in full_text
            or f"{load_factor:.2f}" in full_text
        )
