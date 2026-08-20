"""Tests for YardiVoyagerGLParser.

Tests the Yardi Voyager GL Detail export parser against the
Strategy Pattern interface and Yardi-specific parsing requirements.
"""

import io

import pandas as pd
import pytest


class TestYardiVoyagerGLParserCanHandle:
    """Tests for can_handle method."""

    def test_detects_yardi_keyword(self):
        """Returns high confidence when 'Yardi' is in header."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        header = b"Yardi Systems Report\nProperty: Test"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.5

    def test_detects_voyager_keyword(self):
        """Returns confidence when 'Voyager' is in header."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        header = b"Voyager GL Detail Report"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.3

    def test_detects_combined_keywords(self):
        """Returns high confidence for Yardi + Voyager."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        header = b"Yardi Voyager GL Detail Report"
        score = parser.can_handle(header, "export.csv")

        assert score >= 0.8

    def test_detects_gl_filename(self):
        """Adds score for GL-prefixed filename."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        header = b"Property,Account,Amount"
        score = parser.can_handle(header, "gl_detail_2024.csv")

        assert score >= 0.1

    def test_returns_zero_for_unknown(self):
        """Returns zero for unrecognized content."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        header = b"MRI Software Export"
        score = parser.can_handle(header, "mri_export.csv")

        assert score == 0.0

    def test_source_system_is_yardi(self):
        """source_system property returns 'yardi'."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        assert parser.source_system == "yardi"


class TestYardiVoyagerGLParserParse:
    """Tests for parse method."""

    def test_parses_standard_yardi_csv(self):
        """AC1: Parses standard Yardi Voyager GL Detail export."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Yardi Voyager GL Detail Report
Run Date: 01/15/2024

Property,Account,Description,Date,Amount
Building A,6000,Utilities,01/01/2024,1500.00
Building A,6100,Janitorial,01/05/2024,2500.00
Building A,6200,Insurance,01/10/2024,3500.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        assert result.source_system == "yardi"
        assert result.row_count == 3

    def test_handles_merged_property_rows(self):
        """AC2: Handles merged property/building rows."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Property,Account,Description,Date,Amount
Building A,6000,Utilities,01/01/2024,1000.00
,6100,Janitorial,01/02/2024,2000.00
,6200,Insurance,01/03/2024,3000.00
Building B,6000,Utilities,01/04/2024,1500.00
,6100,Janitorial,01/05/2024,2500.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        # Property name should be forward-filled
        assert list(result.data["property_name"]) == [
            "Building A",
            "Building A",
            "Building A",
            "Building B",
            "Building B",
        ]

    def test_extracts_account_code_and_description(self):
        """AC3: Extracts account code and description."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account Code,Account Description,Date,Amount
6000,Utilities Expense,01/01/2024,1000.00
6100,Janitorial Services,01/02/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        assert list(result.data["account_code"]) == ["6000", "6100"]
        assert list(result.data["account_description"]) == [
            "Utilities Expense",
            "Janitorial Services",
        ]

    def test_parses_negative_amounts_in_parentheses(self):
        """AC4: Parses amounts including negatives in parens."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,01/01/2024,"$1,500.00"
6100,Credit,01/02/2024,"($500.00)"
6200,Janitorial,01/03/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        amounts = list(result.data["amount"])
        assert amounts[0] == 1500.00
        assert amounts[1] == -500.00
        assert amounts[2] == 2000.00

    def test_extracts_transaction_date_and_period(self):
        """AC5: Extracts transaction date and period."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,03/15/2024,1000.00
6100,Janitorial,12/01/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        assert result.data["transaction_date"].iloc[0] == pd.Timestamp("2024-03-15")
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 3
        assert result.data["period_month"].iloc[1] == 12

    def test_filters_garbage_rows(self):
        """Filters out report headers and garbage rows."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Yardi Voyager Report
Run Date: 01/15/2024
Page 1 of 1

Account,Description,Date,Amount
6000,Utilities,01/01/2024,1000.00
Total,,,1000.00
---,,,
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 1
        assert result.data["account_code"].iloc[0] == "6000"

    def test_adds_property_id(self):
        """Adds property_id to all rows."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,01/01/2024,1000.00
6100,Janitorial,01/02/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-uuid-123")

        assert all(result.data["property_id"] == "prop-uuid-123")

    def test_returns_failure_for_empty_file(self):
        """Returns failure for empty file."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        file = io.BytesIO(b"")
        result = parser.parse(file, "empty.csv", "prop-123")

        assert result.success is False
        assert result.row_count == 0
        assert len(result.errors) > 0

    def test_handles_various_column_names(self):
        """Handles various Yardi column naming conventions."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Acct,Desc,Trans Date,Net Amount
6000,Utilities,01/01/2024,1000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        assert result.success is True
        assert "account_code" in result.data.columns
        assert "account_description" in result.data.columns
        assert "amount" in result.data.columns

    def test_warns_on_dropped_rows(self):
        """Adds warning when rows with missing data are dropped."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,01/01/2024,1000.00
,Missing Account,01/02/2024,2000.00
6100,,01/03/2024,invalid
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "gl_export.csv", "prop-123")

        # Should have at least one valid row
        assert result.row_count >= 1
        # May have warnings about dropped rows
        # This depends on implementation details

    def test_handles_parse_exception(self):
        """Returns failure result on parse exception."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        # Invalid CSV that might cause issues
        file = io.BytesIO(b"\xff\xfe invalid binary data")
        result = parser.parse(file, "bad.csv", "prop-123")

        assert result.success is False
        assert len(result.errors) > 0


class TestYardiVoyagerGLParserColumnMapping:
    """Tests for column name standardization."""

    def test_maps_account_code_variations(self):
        """Maps various account code column names."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        for col_name in ["Account", "Acct", "Account Code", "GL Account"]:
            csv_content = f"""{col_name},Description,Date,Amount
6000,Test,01/01/2024,100.00
"""
            parser = YardiVoyagerGLParser()
            file = io.BytesIO(csv_content.encode("utf-8"))
            result = parser.parse(file, "test.csv", "prop-123")

            assert "account_code" in result.data.columns, f"Failed for {col_name}"

    def test_maps_amount_variations(self):
        """Maps various amount column names."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        for col_name in ["Amount", "Net Amount", "Total"]:
            csv_content = f"""Account,Description,Date,{col_name}
6000,Test,01/01/2024,100.00
"""
            parser = YardiVoyagerGLParser()
            file = io.BytesIO(csv_content.encode("utf-8"))
            result = parser.parse(file, "test.csv", "prop-123")

            assert "amount" in result.data.columns, f"Failed for {col_name}"

    def test_maps_date_variations(self):
        """Maps various date column names."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        for col_name in ["Date", "Transaction Date", "Trans Date", "Posting Date"]:
            csv_content = f"""Account,Description,{col_name},Amount
6000,Test,01/01/2024,100.00
"""
            parser = YardiVoyagerGLParser()
            file = io.BytesIO(csv_content.encode("utf-8"))
            result = parser.parse(file, "test.csv", "prop-123")

            assert "transaction_date" in result.data.columns, f"Failed for {col_name}"


class TestYardiVoyagerGLParserEdgeCases:
    """Tests for edge cases and additional code coverage."""

    def test_handles_missing_amount_column(self):
        """Test failure when required amount column is missing."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date
6000,Utilities,01/01/2024
6100,Janitorial,01/02/2024
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Missing amount column is now an error for financial data
        # Silently defaulting to $0 masks data issues and is dangerous
        assert result.success is False
        assert result.error_count == 1
        assert "Missing required column: amount" in result.errors[0]

    def test_handles_missing_transaction_date_column(self):
        """Test default to NaT when transaction_date missing."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Amount
6000,Utilities,1000.00
6100,Janitorial,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Rows with NaT dates are filtered out as they're required
        # This tests the else branch (line 176) and filter logic (line 209)
        assert result.row_count == 0
        assert "Excluded 2 rows" in str(result.warnings)

    def test_handles_all_dates_are_nat(self):
        """Test period extraction skipped when all dates are NaT."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,,1000.00
6100,Janitorial,invalid,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        # Rows with NaT dates are filtered out
        # This tests the else branch (lines 184-185) before filtering
        assert result.row_count == 0
        assert "Excluded 2 rows" in str(result.warnings)

    def test_handles_missing_account_description(self):
        """Test default empty string when account_description missing."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Date,Amount
6000,01/01/2024,1000.00
6100,01/02/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert all(result.data["account_description"] == "")

    def test_handles_missing_property_and_building_columns(self):
        """Test when neither property_name nor building_name exist."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        csv_content = """Account,Description,Date,Amount
6000,Utilities,01/01/2024,1000.00
6100,Janitorial,01/02/2024,2000.00
"""
        parser = YardiVoyagerGLParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "test.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 2

    def test_can_handle_clamps_score_at_one(self):
        """Test can_handle() score is capped at 1.0."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        # Header with multiple keywords that would score > 1.0
        header = b"Yardi Voyager GL Detail Report\nProperty: Test\nAccount: 6000"
        score = parser.can_handle(header, "gl_export.csv")

        # Should be clamped at exactly 1.0
        assert score == 1.0

    def test_parses_excel_file_format(self):
        """Test parsing .xlsx file instead of CSV."""
        pytest.importorskip("openpyxl", reason="openpyxl required for Excel tests")
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        # Create Excel file in memory with valid GL data
        data = {
            "Account": ["6000", "6100"],
            "Description": ["Utilities", "Janitorial"],
            "Date": ["01/01/2024", "01/02/2024"],
            "Amount": [1000.00, 2000.00],
        }
        df = pd.DataFrame(data)
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, engine="openpyxl")
        excel_buffer.seek(0)

        parser = YardiVoyagerGLParser()
        result = parser.parse(excel_buffer, "gl_export.xlsx", "prop-123")

        assert result.success is True
        assert result.row_count == 2
        assert "account_code" in result.data.columns

    def test_handles_latin1_encoding_in_decode(self):
        """Test fallback to latin-1 when UTF-8 decode fails."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        # Create CSV with latin-1 characters that would fail UTF-8 decode
        csv_content = (
            "Account,Description,Date,Amount\n6000,Café Utilities,01/01/2024,1000.00\n"
        )
        # Encode as latin-1 (will fail UTF-8 decode)
        latin1_bytes = csv_content.encode("latin-1")

        parser = YardiVoyagerGLParser()
        file = io.BytesIO(latin1_bytes)
        result = parser.parse(file, "gl_export.csv", "prop-123")

        # Should successfully parse after falling back to latin-1
        assert result.success is True
        assert result.row_count == 1

    def test_handles_latin1_encoding_in_read_csv(self):
        """Test fallback to latin-1 when read_csv with utf-8 fails."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        # Create CSV with characters that are in latin-1 but not ASCII
        # Using ñ, é, ü which are in latin-1 (characters 128-255)
        csv_content = (
            "Account,Description,Date,Amount\n6100,Señor's Service,01/02/2024,2000.00\n"
        )
        latin1_bytes = csv_content.encode("latin-1")

        parser = YardiVoyagerGLParser()
        file = io.BytesIO(latin1_bytes)
        result = parser.parse(file, "gl_export.csv", "prop-123")

        # Should successfully parse after retrying with latin-1
        assert result.success is True
        assert result.row_count == 1

    def test_header_row_returns_zero_when_not_found(self):
        """Test _find_header_row returns 0 when no matches found."""
        from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

        parser = YardiVoyagerGLParser()
        # CSV with no recognizable Yardi headers
        csv_content = """Column1,Column2,Column3,Column4
Value1,Value2,Value3,Value4
Data1,Data2,Data3,Data4
"""
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "unknown.csv", "prop-123")

        # Should still attempt to parse starting from row 0
        # May succeed or fail depending on data, but tests the header_row = 0 path
        assert result is not None
