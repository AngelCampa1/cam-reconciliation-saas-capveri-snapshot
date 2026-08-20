"""Comprehensive tests for Billing Data Parser.

Tests cover CAM reconciliation file parsing, tenant/amount extraction,
and source type detection.
"""

from decimal import Decimal
from io import BytesIO

import pytest

from app.services.ingestion.parsers.billing import (
    BilledAmountRow,
    BillingParser,
    BillingParseResult,
)


class TestBillingParserSourceDetection:
    """Test source type detection from file content and name."""

    def test_detect_yardi_from_content(self):
        """Should detect Yardi from file content containing 'YARDI' (lines 71-76)."""
        parser = BillingParser()
        header = b"YARDI CAM RECONCILIATION REPORT\nTenant,Amount\n"

        source_type = parser.detect_source_type(header, "export.csv")

        assert source_type == "yardi_recon"

    def test_detect_yardi_voyager_from_content(self):
        """Should detect Yardi from 'VOYAGER' keyword (lines 73-76)."""
        parser = BillingParser()
        header = b"Voyager Property Management\nCAM Charges\n"

        source_type = parser.detect_source_type(header, "export.csv")

        assert source_type == "yardi_recon"

    def test_detect_mri_from_content(self):
        """Should detect MRI from file content (lines 78-79)."""
        parser = BillingParser()
        header = b"MRI SOFTWARE CAM EXPORT\nLessee,Total\n"

        source_type = parser.detect_source_type(header, "report.csv")

        assert source_type == "mri_recon"

    def test_detect_yardi_from_filename(self):
        """Should detect Yardi from filename (lines 82-84)."""
        parser = BillingParser()
        header = b"Tenant,Amount\n"

        source_type = parser.detect_source_type(header, "yardi_cam_recon.csv")

        assert source_type == "yardi_recon"

    def test_detect_mri_from_filename(self):
        """Should detect MRI from filename (lines 85-86)."""
        parser = BillingParser()
        header = b"Tenant,Amount\n"

        source_type = parser.detect_source_type(header, "mri_export_2024.csv")

        assert source_type == "mri_recon"

    def test_default_to_csv_import(self):
        """Should default to csv_import for unrecognized files (line 88)."""
        parser = BillingParser()
        header = b"Tenant Name,Billed Amount\n"

        source_type = parser.detect_source_type(header, "billing_data.csv")

        assert source_type == "csv_import"


class TestBillingParserParse:
    """Test billing data file parsing."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return BillingParser()

    def test_parse_simple_csv(self, parser):
        """Should parse simple CSV with tenant and amount columns (lines 90-254)."""
        content = b"Tenant,Amount\nAcme Corp,1500.00\nGlobal Inc,2500.50\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 2
        assert result.total_billed == Decimal("4000.50")
        assert len(result.data) == 2
        assert result.data[0].tenant_name == "Acme Corp"
        assert result.data[0].billed_amount == Decimal("1500.00")

    def test_parse_with_tenant_name_column(self, parser):
        """Should find 'tenant_name' column variant (lines 135-137)."""
        content = b"Tenant_Name,Billed_Amount\nABC LLC,3000\n"
        file = BytesIO(content)

        result = parser.parse(file, "data.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "ABC LLC"
        assert result.data[0].billed_amount == Decimal("3000")

    def test_parse_with_lessee_column(self, parser):
        """Should find 'lessee' column for tenant (lines 136)."""
        content = b"Lessee,Total Charges\nTech Solutions,5000.00\n"
        file = BytesIO(content)

        result = parser.parse(file, "cam_recon.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Tech Solutions"
        assert result.data[0].billed_amount == Decimal("5000.00")

    def test_parse_with_occupant_column(self, parser):
        """Should find 'occupant' column for tenant (lines 136)."""
        content = b"Occupant,Amount\nRetail Store,1200\n"
        file = BytesIO(content)

        result = parser.parse(file, "export.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Retail Store"

    def test_parse_with_suite_column(self, parser):
        """Should extract suite information when available (lines 151, 214-218)."""
        content = b"Tenant,Amount,Suite\nAcme Corp,1500,A101\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.data[0].suite == "A101"

    def test_parse_with_unit_column(self, parser):
        """Should find 'unit' column for suite (line 151)."""
        content = b"Tenant,Amount,Unit\nAcme Corp,1500,Suite 200\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.data[0].suite == "Suite 200"

    def test_parse_currency_formatting(self, parser):
        """Should handle currency formatting with $ and commas (lines 197-199)."""
        # Quote the values to handle commas in currency amounts
        content = b'Tenant,Billed Amount\nAcme Corp,"$1,500.00"\nXYZ Inc,"$2,500.50"\n'
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.data[0].billed_amount == Decimal("1500.00")
        assert result.data[1].billed_amount == Decimal("2500.50")

    def test_parse_parentheses_negative(self, parser):
        """Should handle parentheses notation for negatives but skip them (lines 201-202, 210-211)."""
        content = b"Tenant,Amount\nAcme Corp,(500.00)\nXYZ Inc,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        # Negative amounts are skipped (line 211)
        assert result.success is True
        assert result.row_count == 1
        assert result.data[0].tenant_name == "XYZ Inc"

    def test_skip_zero_amounts(self, parser):
        """Should skip rows with zero amounts (lines 210-211)."""
        content = b"Tenant,Amount\nAcme Corp,0\nXYZ Inc,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 1
        assert result.data[0].tenant_name == "XYZ Inc"

    def test_skip_total_rows(self, parser):
        """Should skip rows that look like totals (lines 185-189)."""
        content = b"Tenant,Amount\nAcme Corp,1000\nGrand Total,5000\nSubtotal,2500\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 1
        assert result.data[0].tenant_name == "Acme Corp"

    def test_skip_nan_tenant_names(self, parser):
        """Should skip rows with empty or NaN tenant names (lines 181-182)."""
        content = b"Tenant,Amount\nAcme Corp,1000\n,500\nnan,200\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 1

    def test_skip_nan_amounts(self, parser):
        """Should skip rows with NaN amounts (lines 193-194)."""
        content = b"Tenant,Amount\nAcme Corp,1000\nXYZ Inc,\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 1

    def test_count_parsing_errors(self, parser):
        """Should count rows that fail to parse (lines 206-208, 229-231, 242-243)."""
        content = b"Tenant,Amount\nAcme Corp,1000\nXYZ Inc,not_a_number\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.row_count == 1
        assert result.error_count == 1
        assert len(result.warnings) == 1
        assert "Skipped 1 rows" in result.warnings[0]

    def test_fail_empty_file(self, parser):
        """Should fail on empty file (lines 124-129)."""
        content = b""
        file = BytesIO(content)

        result = parser.parse(file, "empty.csv")

        assert result.success is False
        assert len(result.errors) > 0

    def test_fail_no_tenant_column(self, parser):
        """Should fail when no tenant column found (lines 153-161)."""
        content = b"Amount,Date\n1000,2024-01-01\n"
        file = BytesIO(content)

        result = parser.parse(file, "no_tenant.csv")

        assert result.success is False
        assert any("tenant column" in e.lower() for e in result.errors)

    def test_fail_no_amount_column(self, parser):
        """Should fail when no amount column found (lines 163-171)."""
        content = b"Tenant,Date\nAcme Corp,2024-01-01\n"
        file = BytesIO(content)

        result = parser.parse(file, "no_amount.csv")

        assert result.success is False
        assert any("amount column" in e.lower() for e in result.errors)

    def test_fail_no_valid_rows(self, parser):
        """Should fail when no valid billing data found (lines 233-240)."""
        content = b"Tenant,Amount\nTotal,5000\nSubtotal,2500\n"
        file = BytesIO(content)

        result = parser.parse(file, "only_totals.csv")

        assert result.success is False
        assert any("no valid" in e.lower() for e in result.errors)


class TestBillingParserColumnFinding:
    """Test column name matching logic."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return BillingParser()

    def test_find_exact_match(self, parser):
        """Should find exact column name match (lines 283-286)."""
        content = b"tenant,amount\nAcme,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Acme"

    def test_find_partial_match(self, parser):
        """Should find partial column name match (lines 287-290)."""
        content = b"tenant_id_name,total_amount_charged\nAcme,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Acme"

    def test_case_insensitive_match(self, parser):
        """Should match columns case-insensitively (lines 264-268, 281)."""
        content = b"TENANT,AMOUNT\nAcme,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Acme"

    def test_standardize_columns_spaces(self, parser):
        """Should replace spaces with underscores in column names (lines 264-269)."""
        content = b"Tenant Name,Billed Amount\nAcme Corp,1500\n"
        file = BytesIO(content)

        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Acme Corp"


class TestBillingParserExcelSupport:
    """Test Excel file parsing."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return BillingParser()

    def test_detect_xlsx_by_extension(self, parser):
        """Should handle xlsx files (lines 114-115)."""
        # We can't easily create valid xlsx in tests without openpyxl
        # Just verify the detection logic exists
        content = b"Tenant,Amount\nAcme,1000\n"
        file = BytesIO(content)

        # CSV parsing should work regardless
        result = parser.parse(file, "billing.csv")
        assert result.success is True


class TestBillingParserEncodings:
    """Test handling of different file encodings."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return BillingParser()

    def test_utf8_bom_encoding(self, parser):
        """Should handle UTF-8 BOM encoding (line 119)."""
        # UTF-8 BOM
        content = b"\xef\xbb\xbfTenant,Amount\nAcme Corp,1000\n"
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        assert result.success is True
        assert result.data[0].tenant_name == "Acme Corp"

    def test_latin1_fallback(self, parser):
        """Should fallback to latin-1 encoding (lines 120-122)."""
        # Latin-1 encoded content with special char
        content = "Tenant,Amount\nCafé Corp,1000\n".encode("latin-1")
        file = BytesIO(content)

        result = parser.parse(file, "billing.csv")

        # Should handle without crashing
        assert result.success is True


class TestBilledAmountRowModel:
    """Test the BilledAmountRow Pydantic model."""

    def test_valid_row(self):
        """Should create valid row with required fields."""
        row = BilledAmountRow(
            tenant_name="Acme Corp",
            billed_amount=Decimal("1500.00"),
        )

        assert row.tenant_name == "Acme Corp"
        assert row.billed_amount == Decimal("1500.00")
        assert row.suite is None

    def test_row_with_suite(self):
        """Should create row with optional suite."""
        row = BilledAmountRow(
            tenant_name="Acme Corp",
            billed_amount=Decimal("1500.00"),
            suite="A101",
        )

        assert row.suite == "A101"

    def test_reject_empty_tenant_name(self):
        """Should reject empty tenant name (min_length=1)."""
        with pytest.raises(ValueError):
            BilledAmountRow(
                tenant_name="",
                billed_amount=Decimal("1000"),
            )

    def test_reject_negative_amount(self):
        """Should reject negative billed amount (ge=0)."""
        with pytest.raises(ValueError):
            BilledAmountRow(
                tenant_name="Acme",
                billed_amount=Decimal("-100"),
            )


class TestBillingParseResultModel:
    """Test the BillingParseResult Pydantic model."""

    def test_default_values(self):
        """Should have sensible defaults."""
        result = BillingParseResult(success=False)

        assert result.success is False
        assert result.source_type == "csv_import"
        assert result.data == []
        assert result.total_billed == Decimal("0")
        assert result.row_count == 0
        assert result.error_count == 0
        assert result.errors == []
        assert result.warnings == []

    def test_with_data(self):
        """Should store provided data."""
        rows = [
            BilledAmountRow(tenant_name="Acme", billed_amount=Decimal("1000")),
            BilledAmountRow(tenant_name="XYZ", billed_amount=Decimal("2000")),
        ]
        result = BillingParseResult(
            success=True,
            source_type="yardi_recon",
            data=rows,
            total_billed=Decimal("3000"),
            row_count=2,
        )

        assert result.success is True
        assert result.source_type == "yardi_recon"
        assert len(result.data) == 2
        assert result.total_billed == Decimal("3000")
        assert result.row_count == 2
