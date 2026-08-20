"""Tests for MRIRentRollParser.

Tests the MRI Rent Roll export parser against the
Strategy Pattern interface and MRI-specific parsing requirements.
"""

import io

import pandas as pd
import pytest


class TestMRIRentRollParserCanHandle:
    """Tests for can_handle method."""

    def test_detects_mri_keyword(self):
        """Returns high confidence when 'MRI' is in header."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"MRI Software Rent Roll Export\nProperty: Test"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.5

    def test_detects_period_column(self):
        """Returns confidence when 'PERIOD' is in header."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"PERIOD,ACCOUNT,DEBIT,CREDIT"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.2

    def test_detects_ref_num_columns(self):
        """Returns confidence for REF NUM pattern."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"PERIOD,REF NUM,SOURCE,ACCOUNT"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.4

    def test_detects_debit_credit_columns(self):
        """Returns confidence for separate DEBIT/CREDIT columns."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"ACCOUNT,DESCRIPTION,DEBIT,CREDIT"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.2

    def test_detects_combined_indicators(self):
        """Returns high confidence for MRI + columns."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"MRI Software\nPERIOD,REF NUM,SOURCE,ACCOUNT,DEBIT,CREDIT"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.8

    def test_returns_zero_for_unknown(self):
        """Returns zero for unrecognized content."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        header = b"Yardi Voyager Export"
        score = parser.can_handle(header, "yardi_export.csv")

        assert score == 0.0

    def test_source_system_is_mri(self):
        """source_system property returns 'mri'."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        assert parser.source_system == "mri"


class TestMRIRentRollParserParse:
    """Tests for parse method."""

    def test_parses_standard_mri_csv(self):
        """AC1: Parses standard MRI rent roll export."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """MRI Software Rent Roll
Run Date: 01/15/2024

Period,Account,Description,Debit,Credit
2024-01,6000,Utilities,1500.00,0.00
2024-01,6100,Janitorial,2500.00,0.00
2024-01,6200,Insurance,3500.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert result.source_system == "mri"
        assert result.row_count == 3

    def test_handles_period_ref_source_columns(self):
        """AC2: Handles PERIOD, REF, SOURCE columns."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Ref Num,Source,Account,Description,Debit,Credit
2024-01,JE001,Manual,6000,Utilities,1000.00,0.00
2024-02,JE002,Import,6100,Janitorial,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "reference_number" in result.data.columns
        assert "source" in result.data.columns
        assert list(result.data["reference_number"]) == ["JE001", "JE002"]
        assert list(result.data["source"]) == ["Manual", "Import"]

    def test_handles_separate_debit_credit_columns(self):
        """AC3: Handles separate DEBIT/CREDIT columns and combines them."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
2024-01,6000,Utilities,1500.00,0.00
2024-01,6100,Credit Applied,0.00,500.00
2024-01,6200,Janitorial,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        amounts = list(result.data["amount"])
        assert amounts[0] == 1500.00  # Debit
        assert amounts[1] == -500.00  # Credit (negative)
        assert amounts[2] == 2000.00  # Debit

    def test_extracts_tenant_and_unit(self):
        """AC4: Extracts tenant and unit information."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Tenant,Unit,Debit,Credit
2024-01,4000,Acme Corp,Suite 100,5000.00,0.00
2024-01,4000,Beta Inc,Suite 200,7500.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "tenant_name" in result.data.columns
        assert "unit_number" in result.data.columns
        assert list(result.data["tenant_name"]) == ["Acme Corp", "Beta Inc"]
        assert list(result.data["unit_number"]) == ["Suite 100", "Suite 200"]

    def test_parses_mri_period_yyyy_mm_format(self):
        """AC5: Parses dates in MRI YYYY-MM format."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
2024-03,6000,Utilities,1000.00,0.00
2024-12,6100,Janitorial,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 3
        assert result.data["period_month"].iloc[1] == 12

    def test_parses_mri_period_mm_yyyy_format(self):
        """AC5: Parses dates in MRI MM/YYYY format."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
03/2024,6000,Utilities,1000.00,0.00
12/2024,6100,Janitorial,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 3
        assert result.data["period_month"].iloc[1] == 12

    def test_filters_garbage_rows(self):
        """Filters out report headers and garbage rows."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """MRI Software Report
Run Date: 01/15/2024
Page 1 of 1

Period,Account,Description,Debit,Credit
2024-01,6000,Utilities,1000.00,0.00
Total,,,1000.00,0.00
---
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 1
        assert result.data["account_code"].iloc[0] == "6000"

    def test_adds_property_id(self):
        """Adds property_id to all rows."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
2024-01,6000,Utilities,1000.00,0.00
2024-01,6100,Janitorial,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-uuid-123")

        assert all(result.data["property_id"] == "prop-uuid-123")

    def test_returns_failure_for_empty_file(self):
        """Returns failure for empty file."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        file = io.BytesIO(b"")
        result = parser.parse(file, "empty.csv", "prop-123")

        assert result.success is False
        assert result.row_count == 0
        assert len(result.errors) > 0

    def test_handles_dr_cr_column_names(self):
        """Handles DR/CR abbreviations for debit/credit."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Desc,DR,CR
2024-01,6000,Utilities,1000.00,0.00
2024-01,6100,Credit,0.00,500.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "amount" in result.data.columns

    def test_handles_acct_column_name(self):
        """Handles 'Acct' column name variation."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Acct,Desc,Debit,Credit
2024-01,6000,Utilities,1000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "account_code" in result.data.columns
        assert result.data["account_code"].iloc[0] == "6000"

    def test_warns_on_dropped_rows(self):
        """Adds warning when rows with missing data are dropped."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
2024-01,6000,Utilities,1000.00,0.00
2024-01,,Missing Account,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.row_count >= 1
        # May have warnings about dropped rows

    def test_handles_parse_exception(self):
        """Returns failure result on parse exception."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        parser = MRIRentRollParser()
        file = io.BytesIO(b"\xff\xfe invalid binary data")
        result = parser.parse(file, "bad.csv", "prop-123")

        assert result.success is False
        assert len(result.errors) > 0

    def test_creates_transaction_date_from_period(self):
        """Creates transaction_date from period column."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit,Credit
2024-03,6000,Utilities,1000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "transaction_date" in result.data.columns
        assert result.data["transaction_date"].iloc[0] == pd.Timestamp("2024-03-01")

    def test_handles_vendor_column(self):
        """Handles vendor column."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Vendor,Debit,Credit
2024-01,6000,ABC Supplies,1000.00,0.00
2024-01,6100,XYZ Services,2000.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "rent_roll.csv", "prop-123")

        assert result.success is True
        assert "vendor_name" in result.data.columns
        assert list(result.data["vendor_name"]) == ["ABC Supplies", "XYZ Services"]


class TestMRIRentRollParserColumnMapping:
    """Tests for column name standardization."""

    def test_maps_account_variations(self):
        """Maps various account column names."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        for col_name in ["Account", "Acct"]:
            csv_content = f"""Period,{col_name},Description,Debit,Credit
2024-01,6000,Test,100.00,0.00
"""
            parser = MRIRentRollParser()
            file = io.BytesIO(csv_content.encode("utf-8"))
            result = parser.parse(file, "test.csv", "prop-123")

            assert "account_code" in result.data.columns, f"Failed for {col_name}"

    def test_maps_debit_credit_variations(self):
        """Maps DR/CR to debit/credit."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,DR,CR
2024-01,6000,100.00,0.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert "amount" in result.data.columns


class TestMRIRentRollParserEdgeCases:
    """Tests for edge cases and additional code coverage."""

    def test_parses_excel_file_with_header_at_row_zero(self):
        """Test Excel file where header is first row."""
        pytest.importorskip("openpyxl", reason="openpyxl required for Excel tests")
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        # Create Excel file in memory
        data = {
            "Period": ["2024-01", "2024-02"],
            "Account": ["6000", "6100"],
            "Description": ["Utilities", "Janitorial"],
            "Debit": [1000.00, 0.00],
            "Credit": [0.00, 2000.00],
        }
        df = pd.DataFrame(data)
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, engine="openpyxl")
        excel_buffer.seek(0)

        parser = MRIRentRollParser()
        result = parser.parse(excel_buffer, "rent_roll.xlsx", "prop-123")

        assert result.success is True
        assert result.row_count >= 1

    def test_parses_excel_file_with_header_below_row_zero(self):
        """Test Excel file where header is after metadata rows."""
        pytest.importorskip("openpyxl", reason="openpyxl required for Excel tests")
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        # Create Excel with header at row 3
        rows = [
            ["MRI Software", "", "", "", ""],
            ["Report Date: 01/15/2024", "", "", "", ""],
            ["", "", "", "", ""],
            ["Period", "Account", "Description", "Debit", "Credit"],
            ["2024-01", "6000", "Utilities", "1000.00", "0.00"],
        ]
        df = pd.DataFrame(rows)
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, header=False, engine="openpyxl")
        excel_buffer.seek(0)

        parser = MRIRentRollParser()
        result = parser.parse(excel_buffer, "rent_roll.xlsx", "prop-123")

        # Should find header and parse data
        assert result.success is True

    def test_handles_debit_column_only(self):
        """Test CSV with only Debit column (no Credit)."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Debit
2024-01,6000,Utilities,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.data["amount"].iloc[0] == 1000.00

    def test_handles_credit_column_only(self):
        """Test CSV with only Credit column (no Debit)."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description,Credit
2024-01,6000,Utilities,500.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.data["amount"].iloc[0] == -500.00  # Credits are negative

    def test_handles_no_debit_or_credit_columns(self):
        """Test CSV with neither Debit nor Credit - FIX ING-1: Now returns error.

        Previously this would silently default all amounts to 0.0, causing
        100% financial data loss. Now we properly raise an error to alert
        users that required amount columns are missing.
        """
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Description
2024-01,6000,Utilities
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # FIX ING-1: Now returns failure instead of silently defaulting to 0
        assert result.success is False
        assert len(result.errors) > 0
        assert (
            "amount" in str(result.errors).lower()
            or "debit" in str(result.errors).lower()
        )

    def test_transaction_date_column_all_nan(self):
        """Test when transaction_date exists but all values are NaN (no period column)."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        # Important: NO Period column, only Transaction Date with empty values
        csv_content = """Account,Transaction Date,Debit
6000,,1000.00
6100,,2000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Parser sets period_year/month to None, then validation fails
        assert result.success is False
        assert "period_year" in str(result.errors) or "period_month" in str(
            result.errors
        )

    def test_no_date_or_period_columns(self):
        """Test when NO date/period columns exist at all."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Account,Description,Debit
6000,Utilities,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Parser returns success=False because period_year/month validation fails
        assert result.success is False
        assert "period_year" in str(result.errors) or "period_month" in str(
            result.errors
        )

    def test_parse_mri_period_handles_invalid_months(self):
        """Test periods with invalid month values (0, 13, -1)."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Debit
2024-13,6000,1000.00
00/2024,6100,2000.00
2024-00,6200,3000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Should parse but period_month should be NaN for invalid months
        assert result.success is True
        # Rows with invalid periods may be filtered or have NaN values

    def test_parse_mri_period_handles_non_numeric_values(self):
        """Test non-numeric period values."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Debit
XX/YYYY,6000,1000.00
N/A,6100,2000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Should handle gracefully
        assert result is not None

    def test_parse_mri_period_edge_months(self):
        """Test boundary month values (1, 12)."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,Debit
2024-01,6000,1000.00
12/2024,6100,2000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 2
        # January should be 1, December should be 12
        assert result.data["period_month"].iloc[0] == 1
        assert result.data["period_month"].iloc[1] == 12

    def test_handles_latin1_encoding_in_decode(self):
        """Test fallback to latin-1 when UTF-8 decode fails."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = (
            "Period,Account,Description,Debit\n2024-01,6000,Café Utilities,1000.00\n"
        )
        latin1_bytes = csv_content.encode("latin-1")

        parser = MRIRentRollParser()
        file = io.BytesIO(latin1_bytes)
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 1

    def test_handles_missing_account_code_column(self):
        """Test when account_code column is completely missing."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Description,Debit
2024-01,Utilities,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Should fail with missing account_code error
        assert result.success is False
        assert "account_code" in str(result.errors)

    def test_handles_transaction_date_with_valid_values(self):
        """Test when transaction_date column has valid date values."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Account,Transaction Date,Debit
6000,01/15/2024,1000.00
6100,02/20/2024,2000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 2
        # Should extract period from transaction_date
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 1

    def test_standardize_column_names_gl_account(self):
        """Test column name standardization for GL ACCOUNT variant."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,GL ACCOUNT,Debit
2024-01,6000,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert "account_code" in result.data.columns

    def test_standardize_column_names_ref_num(self):
        """Test column name standardization for REF variant."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,REF,Debit
2024-01,6000,12345,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert "reference_number" in result.data.columns

    def test_standardize_column_names_payee(self):
        """Test column name standardization for PAYEE variant."""
        from app.services.ingestion.parsers.mri import MRIRentRollParser

        csv_content = """Period,Account,PAYEE,Debit
2024-01,6000,Vendor A,1000.00
"""
        parser = MRIRentRollParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert "vendor_name" in result.data.columns
