"""Tests for GenericMappingParser.

Tests the generic fallback parser for unknown file formats.
Implements two-phase operation: raw data for mapping wizard,
then applying column mappings on subsequent import.
"""

import io

# openpyxl is a required dependency for Excel support (see pyproject.toml)
import openpyxl  # noqa: F401
import pandas as pd


class TestGenericMappingParserCanHandle:
    """Tests for can_handle method."""

    def test_returns_low_confidence(self):
        """Returns low confidence as fallback parser."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        parser = GenericMappingParser()
        header = b"Random data that doesn't match any known format"
        score = parser.can_handle(header, "random.csv")

        assert score == 0.1

    def test_returns_low_confidence_for_any_file(self):
        """Returns same low confidence for any file type."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        parser = GenericMappingParser()

        # Test various file types
        assert parser.can_handle(b"some data", "file.csv") == 0.1
        assert parser.can_handle(b"other data", "file.xlsx") == 0.1
        assert parser.can_handle(b"", "empty.txt") == 0.1

    def test_source_system_is_generic(self):
        """source_system property returns 'generic'."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        parser = GenericMappingParser()
        assert parser.source_system == "generic"


class TestGenericMappingParserParseWithoutMapping:
    """Tests for parse method without column mapping (phase 1)."""

    def test_returns_raw_dataframe_without_mapping(self):
        """AC1: Returns raw DataFrame without transformations."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """CustomCol1,CustomCol2,CustomAmount
Value1,Desc1,1000.00
Value2,Desc2,2000.00
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "unknown.csv", "prop-123")

        assert result.success is True
        assert result.source_system == "generic"
        assert result.row_count == 2
        # Original columns preserved
        assert "CustomCol1" in result.data.columns
        assert "CustomCol2" in result.data.columns
        assert "CustomAmount" in result.data.columns

    def test_stores_detected_columns(self):
        """AC2: Stores detected columns for mapping wizard."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Account,Description,Date,Amount,Vendor
1000,Utilities,01/15/2024,500.00,ABC Corp
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "data.csv", "prop-123")

        assert result.success is True
        # Columns are detected and available
        detected_cols = list(result.data.columns)
        assert "Account" in detected_cols
        assert "Description" in detected_cols
        assert "Date" in detected_cols
        assert "Amount" in detected_cols
        assert "Vendor" in detected_cols

    def test_preserves_all_original_data(self):
        """AC3: Preserves all original data."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Col1,Col2,Col3
A,B,C
D,E,F
G,H,I
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "data.csv", "prop-123")

        assert result.success is True
        assert result.row_count == 3
        # All values preserved
        assert list(result.data["Col1"]) == ["A", "D", "G"]
        assert list(result.data["Col2"]) == ["B", "E", "H"]
        assert list(result.data["Col3"]) == ["C", "F", "I"]

    def test_adds_warning_when_no_mapping(self):
        """Adds warning when returning raw data."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """A,B,C
1,2,3
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        result = parser.parse(file, "data.csv", "prop-123")

        assert result.success is True
        assert len(result.warnings) > 0
        assert any("mapping" in w.lower() for w in result.warnings)

    def test_returns_failure_for_empty_file(self):
        """Returns failure for empty file."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        parser = GenericMappingParser()
        file = io.BytesIO(b"")
        result = parser.parse(file, "empty.csv", "prop-123")

        assert result.success is False
        assert result.row_count == 0
        assert len(result.errors) > 0


class TestGenericMappingParserParseWithMapping:
    """Tests for parse method with column mapping (phase 2)."""

    def test_applies_column_mapping(self):
        """AC4: Applies mapping configuration when provided."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """AcctNum,AcctName,Amt,TransDate
6000,Utilities,1500.00,01/15/2024
6100,Janitorial,2500.00,01/16/2024
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "AcctNum",
            "account_description": "AcctName",
            "amount": "Amt",
            "transaction_date": "TransDate",
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert result.success is True
        assert "account_code" in result.data.columns
        assert "account_description" in result.data.columns
        assert "amount" in result.data.columns
        assert "transaction_date" in result.data.columns

    def test_cleans_amount_column(self):
        """Cleans currency values in mapped amount column."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt
6000,"$1,500.00"
6100,($500.00)
6200,2000.00
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "amount": "Amt",
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert result.success is True
        amounts = list(result.data["amount"])
        assert amounts[0] == 1500.00
        assert amounts[1] == -500.00
        assert amounts[2] == 2000.00

    def test_cleans_date_column(self):
        """Cleans and parses date values in mapped transaction_date column."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Date,Amt
6000,01/15/2024,1000.00
6100,2024-02-20,2000.00
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "transaction_date": "Date",
            "amount": "Amt",  # Required for ING-2 fix
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert result.success is True
        assert pd.api.types.is_datetime64_any_dtype(result.data["transaction_date"])

    def test_extracts_period_from_date(self):
        """Extracts period_year and period_month from transaction_date."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Date,Amt
6000,03/15/2024,1000.00
6100,12/20/2024,2000.00
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "transaction_date": "Date",
            "amount": "Amt",  # Required for ING-2 fix
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert result.success is True
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 3
        assert result.data["period_month"].iloc[1] == 12

    def test_adds_property_id(self):
        """Adds property_id to all rows when mapping provided."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt
6000,1000
6100,2000
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "amount": "Amt",
        }
        result = parser.parse(file, "data.csv", "prop-uuid-123", column_mapping=mapping)

        assert all(result.data["property_id"] == "prop-uuid-123")

    def test_validates_mapped_output(self):
        """AC5: Validates mapped output."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt,Date,Desc
6000,1000,01/15/2024,Utilities
6100,2000,01/16/2024,Janitorial
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "account_description": "Desc",
            "amount": "Amt",
            "transaction_date": "Date",
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        # Should validate and succeed with proper mapping
        assert result.success is True

    def test_handles_partial_mapping(self):
        """Handles partial column mapping."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt,Extra
6000,1000,ABC
6100,2000,DEF
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "amount": "Amt",
            # Extra column not mapped
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        # Should work with partial mapping
        assert "account_code" in result.data.columns
        assert "amount" in result.data.columns
        # Original unmapped column preserved
        assert "Extra" in result.data.columns

    def test_handles_invalid_source_column(self):
        """Handles mapping to non-existent source column."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt
6000,1000
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "NonExistentColumn",
            "amount": "Amt",
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        # Should handle gracefully - amount mapped, account_code not
        assert "amount" in result.data.columns
        # Original Code column still there
        assert "Code" in result.data.columns

    def test_handles_vendor_mapping(self):
        """Maps vendor_name column."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt,VendorCol
6000,1000,ABC Corp
6100,2000,XYZ Inc
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "amount": "Amt",
            "vendor_name": "VendorCol",
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert "vendor_name" in result.data.columns
        assert list(result.data["vendor_name"]) == ["ABC Corp", "XYZ Inc"]


class TestGenericMappingParserGetSampleData:
    """Tests for get_sample_data method."""

    def test_returns_column_names(self):
        """Returns list of column names."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """ColA,ColB,ColC
1,2,3
4,5,6
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        sample = parser.get_sample_data(file, "data.csv")

        assert "columns" in sample
        assert sample["columns"] == ["ColA", "ColB", "ColC"]

    def test_returns_sample_rows(self):
        """Returns sample rows as list of dicts."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """A,B
1,X
2,Y
3,Z
4,W
5,V
6,U
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        sample = parser.get_sample_data(file, "data.csv", rows=3)

        assert "sample_rows" in sample
        assert len(sample["sample_rows"]) == 3
        assert sample["sample_rows"][0] == {"A": 1, "B": "X"}
        assert sample["sample_rows"][1] == {"A": 2, "B": "Y"}
        assert sample["sample_rows"][2] == {"A": 3, "B": "Z"}

    def test_returns_dtypes(self):
        """Returns column data types."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """NumCol,StrCol,FloatCol
1,abc,1.5
2,def,2.5
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        sample = parser.get_sample_data(file, "data.csv")

        assert "dtypes" in sample
        assert "NumCol" in sample["dtypes"]
        assert "StrCol" in sample["dtypes"]
        assert "FloatCol" in sample["dtypes"]

    def test_handles_excel_file(self):
        """Handles Excel files for sample data."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        # Create a simple Excel file in memory
        df = pd.DataFrame({"A": [1, 2], "B": ["x", "y"]})
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False)
        excel_buffer.seek(0)

        parser = GenericMappingParser()
        sample = parser.get_sample_data(excel_buffer, "data.xlsx")

        assert sample["columns"] == ["A", "B"]
        assert len(sample["sample_rows"]) == 2


class TestGenericMappingParserEdgeCases:
    """Tests for edge cases and error handling."""

    def test_handles_parse_exception(self):
        """Returns failure result on parse exception."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        parser = GenericMappingParser()
        file = io.BytesIO(b"\xff\xfe invalid binary data")
        result = parser.parse(file, "bad.csv", "prop-123")

        assert result.success is False
        assert len(result.errors) > 0

    def test_handles_excel_file(self):
        """Handles Excel file parsing."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        # Create a simple Excel file in memory
        df = pd.DataFrame({"Code": ["6000", "6100"], "Amount": [1000, 2000]})
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False)
        excel_buffer.seek(0)

        parser = GenericMappingParser()
        result = parser.parse(excel_buffer, "data.xlsx", "prop-123")

        assert result.success is True
        assert result.row_count == 2
        assert "Code" in result.data.columns

    def test_handles_xls_extension(self):
        """Recognizes .xls extension as Excel."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        # Create Excel file
        df = pd.DataFrame({"A": [1, 2]})
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False)
        excel_buffer.seek(0)

        parser = GenericMappingParser()
        result = parser.parse(excel_buffer, "data.xls", "prop-123")

        assert result.success is True

    def test_handles_latin1_encoding(self):
        """Handles Latin-1 encoded files."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        # Latin-1 encoded content with special characters
        csv_content = "Name,Amount\nCafé,100\nNaïve,200\n"
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("latin-1"))
        parser.parse(file, "data.csv", "prop-123")

        # Should handle or fail gracefully
        # Note: pandas read_csv with utf-8 may fail on latin-1
        # The implementation should handle this

    def test_none_mapping_value_ignored(self):
        """Ignores None values in mapping dict."""
        from app.services.ingestion.parsers.generic import GenericMappingParser

        csv_content = """Code,Amt
6000,1000
"""
        parser = GenericMappingParser()
        file = io.BytesIO(csv_content.encode("utf-8"))
        mapping = {
            "account_code": "Code",
            "amount": "Amt",
            "vendor_name": None,  # Should be ignored
        }
        result = parser.parse(file, "data.csv", "prop-123", column_mapping=mapping)

        assert result.success is True
        assert "account_code" in result.data.columns
