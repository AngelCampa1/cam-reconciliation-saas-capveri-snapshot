"""Malformed CSV Fixture Generator.

Generates CSV files with various real-world errors for testing parser robustness.
"""

from __future__ import annotations

import codecs
import csv
import json
from pathlib import Path
from typing import Any


class MalformedFixtureGenerator:
    """Generator for malformed CSV fixtures to test parser error handling."""

    def __init__(self, base_output_dir: Path):
        """Initialize the generator.

        Args:
            base_output_dir: Base directory for fixture output
        """
        self.base_output_dir = base_output_dir
        self.malformed_dir = base_output_dir / "malformed"
        self.expected_dir = base_output_dir / "expected"

    def generate_all(self) -> None:
        """Generate all malformed fixtures."""
        print("Generating malformed CSV fixtures...")

        # Encoding errors
        self.generate_utf8_bom_fixture()
        self.generate_windows1252_fixture()
        self.generate_mixed_encoding_fixture()

        # Structural errors
        self.generate_missing_columns_fixture()
        self.generate_extra_columns_fixture()
        self.generate_inconsistent_rows_fixture()
        self.generate_empty_file_fixture()
        self.generate_headers_only_fixture()

        # Data errors
        self.generate_invalid_dates_fixture()
        self.generate_non_numeric_amounts_fixture()
        self.generate_special_characters_fixture()

        # Format errors
        self.generate_merged_cells_fixture()
        self.generate_footer_rows_fixture()
        self.generate_page_breaks_fixture()
        self.generate_repeated_headers_fixture()

        # Comprehensive multi-error fixture
        self.generate_comprehensive_fixture()

        print("\n[SUCCESS] All malformed fixtures generated!")

    def generate_utf8_bom_fixture(self) -> None:
        """Generate CSV with UTF-8 BOM (Byte Order Mark)."""
        fixture_path = self.malformed_dir / "encoding_utf8_bom.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "wb") as f:
            # Write UTF-8 BOM
            f.write(codecs.BOM_UTF8)
            # Write normal CSV content
            f.write(b"Account Code,Account Description,Date,Amount\n")
            f.write(b"5100,Property Taxes,01/15/2025,5000.00\n")
            f.write(b"5200,Utilities,01/20/2025,1200.50\n")

        self._write_expected_errors(
            "encoding_utf8_bom",
            {
                "error_type": "encoding",
                "description": "CSV file with UTF-8 BOM (Byte Order Mark)",
                "parseable": True,
                "expected_behavior": "Parser should handle BOM gracefully by detecting and skipping it",
                "expected_warnings": ["UTF-8 BOM detected and removed"],
                "expected_rows": 2,
                "valid_rows": 2,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated UTF-8 BOM fixture")

    def generate_windows1252_fixture(self) -> None:
        """Generate CSV with Windows-1252 encoding."""
        fixture_path = self.malformed_dir / "encoding_windows1252.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        content = "Account Code,Account Description,Date,Amount\n"
        content += "5100,Property Taxes © 2025,01/15/2025,5000.00\n"
        content += "5200,Utilities — Electric,01/20/2025,1200.50\n"

        with open(fixture_path, "w", encoding="cp1252") as f:
            f.write(content)

        self._write_expected_errors(
            "encoding_windows1252",
            {
                "error_type": "encoding",
                "description": "CSV file encoded in Windows-1252 (not UTF-8)",
                "parseable": True,
                "expected_behavior": "Parser should detect encoding and decode properly, or use latin-1 fallback",
                "expected_warnings": [
                    "Non-UTF-8 encoding detected, using fallback decoder"
                ],
                "expected_rows": 2,
                "valid_rows": 2,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated Windows-1252 fixture")

    def generate_mixed_encoding_fixture(self) -> None:
        """Generate CSV with mixed encodings (corrupted file simulation)."""
        fixture_path = self.malformed_dir / "encoding_mixed.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "wb") as f:
            # UTF-8 header
            f.write(b"Account Code,Account Description,Date,Amount\n")
            # Windows-1252 row (will cause issues if read as UTF-8)
            f.write("5100,Property Taxes © 2025,01/15/2025,5000.00\n".encode("cp1252"))
            # UTF-8 row
            f.write(b"5200,Utilities,01/20/2025,1200.50\n")

        self._write_expected_errors(
            "encoding_mixed",
            {
                "error_type": "encoding",
                "description": "CSV file with mixed encodings (corrupted)",
                "parseable": "partial",
                "expected_behavior": "Parser should handle encoding errors gracefully using errors='ignore' or 'replace'",
                "expected_warnings": [
                    "Encoding errors encountered, some characters may be corrupted"
                ],
                "expected_rows": 2,
                "valid_rows": "1-2",  # Depends on error handling strategy
                "invalid_rows": "0-1",
            },
        )

        print("[OK] Generated mixed encoding fixture")

    def generate_missing_columns_fixture(self) -> None:
        """Generate CSV with missing columns in some rows."""
        fixture_path = self.malformed_dir / "structural_missing_columns.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")  # Valid
            f.write("5200,Utilities\n")  # Missing Date and Amount
            f.write("5300\n")  # Missing Description, Date, Amount
            f.write("5400,Janitorial,01/20/2025,800.00\n")  # Valid

        self._write_expected_errors(
            "structural_missing_columns",
            {
                "error_type": "structural",
                "description": "CSV with rows missing columns",
                "parseable": True,
                "expected_behavior": "Parser should handle missing columns by filling with empty strings/nulls",
                "expected_warnings": [
                    "Row 2: Missing columns (expected 4, got 2)",
                    "Row 3: Missing columns (expected 4, got 1)",
                ],
                "expected_rows": 4,
                "valid_rows": 2,
                "invalid_rows": 2,
            },
        )

        print("[OK] Generated missing columns fixture")

    def generate_extra_columns_fixture(self) -> None:
        """Generate CSV with extra columns in some rows."""
        fixture_path = self.malformed_dir / "structural_extra_columns.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")  # Valid
            f.write(
                "5200,Utilities,01/20/2025,1200.50,Extra,Data,Here\n"
            )  # Extra columns
            f.write("5300,Janitorial,01/22/2025,800.00\n")  # Valid

        self._write_expected_errors(
            "structural_extra_columns",
            {
                "error_type": "structural",
                "description": "CSV with rows having extra columns",
                "parseable": True,
                "expected_behavior": "Parser should ignore or warn about extra columns",
                "expected_warnings": [
                    "Row 2: Extra columns detected (expected 4, got 7)"
                ],
                "expected_rows": 3,
                "valid_rows": 2,
                "invalid_rows": 1,
            },
        )

        print("[OK] Generated extra columns fixture")

    def generate_inconsistent_rows_fixture(self) -> None:
        """Generate CSV with inconsistent row lengths."""
        fixture_path = self.malformed_dir / "structural_inconsistent_rows.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")  # 4 columns - valid
            f.write("5200,Utilities,01/20/2025\n")  # 3 columns - missing amount
            f.write("5300,Janitorial,01/22/2025,800.00,Extra\n")  # 5 columns - extra
            f.write("5400\n")  # 1 column - severely incomplete
            f.write("5500,Management Fee,01/25/2025,2000.00\n")  # 4 columns - valid

        self._write_expected_errors(
            "structural_inconsistent_rows",
            {
                "error_type": "structural",
                "description": "CSV with inconsistent row lengths throughout",
                "parseable": True,
                "expected_behavior": "Parser should handle varying row lengths gracefully",
                "expected_warnings": [
                    "Row 2: Inconsistent columns (expected 4, got 3)",
                    "Row 3: Inconsistent columns (expected 4, got 5)",
                    "Row 4: Inconsistent columns (expected 4, got 1)",
                ],
                "expected_rows": 5,
                "valid_rows": 2,
                "invalid_rows": 3,
            },
        )

        print("[OK] Generated inconsistent rows fixture")

    def generate_empty_file_fixture(self) -> None:
        """Generate completely empty CSV file."""
        fixture_path = self.malformed_dir / "structural_empty_file.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", encoding="utf-8") as f:
            f.write("")  # Completely empty

        self._write_expected_errors(
            "structural_empty_file",
            {
                "error_type": "structural",
                "description": "Completely empty CSV file (0 bytes)",
                "parseable": False,
                "expected_behavior": "Parser should detect empty file and return error",
                "expected_errors": ["File is empty or could not be parsed"],
                "expected_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated empty file fixture")

    def generate_headers_only_fixture(self) -> None:
        """Generate CSV with only headers, no data rows."""
        fixture_path = self.malformed_dir / "structural_headers_only.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            # No data rows

        self._write_expected_errors(
            "structural_headers_only",
            {
                "error_type": "structural",
                "description": "CSV with headers but no data rows",
                "parseable": True,
                "expected_behavior": "Parser should successfully parse but return empty DataFrame",
                "expected_warnings": ["File contains only headers, no data rows"],
                "expected_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated headers-only fixture")

    def generate_invalid_dates_fixture(self) -> None:
        """Generate CSV with invalid date formats."""
        fixture_path = self.malformed_dir / "data_invalid_dates.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Account Code", "Account Description", "Date", "Amount"])
            writer.writerow(
                ["5100", "Property Taxes", "01/15/2025", "5000.00"]
            )  # Valid
            writer.writerow(
                ["5200", "Utilities", "NOT_A_DATE", "1200.50"]
            )  # Invalid date
            writer.writerow(
                ["5300", "Janitorial", "13/45/2025", "800.00"]
            )  # Invalid date (impossible)
            writer.writerow(
                ["5400", "Management Fee", "2025-02-30", "2000.00"]
            )  # Invalid (Feb 30)
            writer.writerow(["5500", "Insurance", "", "3500.00"])  # Missing date

        self._write_expected_errors(
            "data_invalid_dates",
            {
                "error_type": "data",
                "description": "CSV with various invalid date formats",
                "parseable": True,
                "expected_behavior": "Parser should handle invalid dates by setting to null/NaT",
                "expected_warnings": [
                    "Row 2: Invalid date format 'NOT_A_DATE'",
                    "Row 3: Invalid date '13/45/2025'",
                    "Row 4: Invalid date '2025-02-30'",
                    "Row 5: Missing date",
                ],
                "expected_rows": 5,
                "valid_rows": 1,
                "invalid_rows": 4,
            },
        )

        print("[OK] Generated invalid dates fixture")

    def generate_non_numeric_amounts_fixture(self) -> None:
        """Generate CSV with non-numeric amounts."""
        fixture_path = self.malformed_dir / "data_non_numeric_amounts.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(
                ["Account Code", "Account Description", "Date", "Debit", "Credit"]
            )
            writer.writerow(
                ["5100", "Property Taxes", "01/15/2025", "5000.00", ""]
            )  # Valid
            writer.writerow(
                ["5200", "Utilities", "01/20/2025", "INVALID", ""]
            )  # Non-numeric
            writer.writerow(
                ["5300", "Janitorial", "01/22/2025", "$1,200.50", ""]
            )  # Has currency symbol
            writer.writerow(
                ["5400", "Management Fee", "01/25/2025", "", "N/A"]
            )  # Non-numeric credit
            writer.writerow(
                ["5500", "Insurance", "01/28/2025", "3500", ""]
            )  # Valid (integer)

        self._write_expected_errors(
            "data_non_numeric_amounts",
            {
                "error_type": "data",
                "description": "CSV with non-numeric amount values",
                "parseable": True,
                "expected_behavior": "Parser should handle non-numeric amounts by coercing to null/0",
                "expected_warnings": [
                    "Row 2: Non-numeric amount 'INVALID'",
                    "Row 3: Invalid amount format '$1,200.50' (contains currency symbol)",
                    "Row 4: Non-numeric credit 'N/A'",
                ],
                "expected_rows": 5,
                "valid_rows": 2,
                "invalid_rows": 3,
            },
        )

        print("[OK] Generated non-numeric amounts fixture")

    def generate_special_characters_fixture(self) -> None:
        """Generate CSV with special characters and edge cases."""
        fixture_path = self.malformed_dir / "data_special_characters.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Account Code", "Account Description", "Date", "Amount"])
            writer.writerow(
                ["5100", "Property Taxes", "01/15/2025", "5000.00"]
            )  # Valid
            writer.writerow(
                ["5200", "Utilities — Electric & Gas", "01/20/2025", "1200.50"]
            )  # Em dash
            writer.writerow(
                ["5300", 'Janitorial "Deep Clean"', "01/22/2025", "800.00"]
            )  # Smart quotes
            writer.writerow(
                ["5400", "Line\nBreak\nIssue", "01/25/2025", "2000.00"]
            )  # Embedded newlines
            writer.writerow(
                ["5500", "Null\x00Character", "01/28/2025", "3500.00"]
            )  # Null byte

        self._write_expected_errors(
            "data_special_characters",
            {
                "error_type": "data",
                "description": "CSV with special characters (em dashes, smart quotes, newlines, null bytes)",
                "parseable": True,
                "expected_behavior": "Parser should handle special characters without crashing",
                "expected_warnings": [
                    "Row 4: Embedded newline in field detected",
                    "Row 5: Null byte character detected and removed",
                ],
                "expected_rows": 5,
                "valid_rows": 2,
                "invalid_rows": 3,
            },
        )

        print("[OK] Generated special characters fixture")

    def generate_merged_cells_fixture(self) -> None:
        """Generate CSV simulating merged cells (blank cells below)."""
        fixture_path = self.malformed_dir / "format_merged_cells.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Property,Account Code,Account Description,Date,Amount\n")
            f.write("Building A,5100,Property Taxes,01/15/2025,5000.00\n")
            f.write(
                ",5200,Utilities,01/20/2025,1200.50\n"
            )  # Blank property (merged cell)
            f.write(
                ",5300,Janitorial,01/22/2025,800.00\n"
            )  # Blank property (merged cell)
            f.write("Building B,5400,Management Fee,01/25/2025,2000.00\n")
            f.write(
                ",5500,Insurance,01/28/2025,3500.00\n"
            )  # Blank property (merged cell)

        self._write_expected_errors(
            "format_merged_cells",
            {
                "error_type": "format",
                "description": "CSV simulating merged cells (blank values that should inherit from above)",
                "parseable": True,
                "expected_behavior": "Parser should use forward-fill to populate merged cell values",
                "expected_warnings": [
                    "Merged cells detected in column 'Property', applying forward-fill"
                ],
                "expected_rows": 5,
                "valid_rows": 5,  # All valid after forward-fill
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated merged cells fixture")

    def generate_footer_rows_fixture(self) -> None:
        """Generate CSV with footer/summary rows at the end."""
        fixture_path = self.malformed_dir / "format_footer_rows.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")
            f.write("5200,Utilities,01/20/2025,1200.50\n")
            f.write("5300,Janitorial,01/22/2025,800.00\n")
            f.write("\n")  # Blank row separator
            f.write("TOTAL,,,7000.50\n")  # Footer row
            f.write("Generated by: Yardi Voyager\n")  # Footer text
            f.write("Report Date: 01/30/2025\n")  # Footer text

        self._write_expected_errors(
            "format_footer_rows",
            {
                "error_type": "format",
                "description": "CSV with footer/summary rows at the end",
                "parseable": True,
                "expected_behavior": "Parser should detect and filter out footer rows",
                "expected_warnings": ["Footer rows detected and removed (rows 4-7)"],
                "expected_rows": 3,  # After filtering footers
                "valid_rows": 3,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated footer rows fixture")

    def generate_page_breaks_fixture(self) -> None:
        """Generate CSV with page breaks and repeated headers."""
        fixture_path = self.malformed_dir / "format_page_breaks.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            # Page 1
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")
            f.write("5200,Utilities,01/20/2025,1200.50\n")
            f.write("\n")  # Page break
            f.write("Page 2\n")  # Page marker
            f.write("\n")  # Blank line
            # Repeated headers
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5300,Janitorial,01/22/2025,800.00\n")
            f.write("5400,Management Fee,01/25/2025,2000.00\n")

        self._write_expected_errors(
            "format_page_breaks",
            {
                "error_type": "format",
                "description": "CSV with page breaks and repeated headers",
                "parseable": True,
                "expected_behavior": "Parser should detect and filter out page markers and repeated headers",
                "expected_warnings": [
                    "Page break detected at row 3",
                    "Repeated header row detected and removed (row 6)",
                ],
                "expected_rows": 4,  # After filtering page breaks
                "valid_rows": 4,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated page breaks fixture")

    def generate_repeated_headers_fixture(self) -> None:
        """Generate CSV with headers repeated in the middle of data."""
        fixture_path = self.malformed_dir / "format_repeated_headers.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "w", newline="", encoding="utf-8") as f:
            f.write("Account Code,Account Description,Date,Amount\n")
            f.write("5100,Property Taxes,01/15/2025,5000.00\n")
            f.write("5200,Utilities,01/20/2025,1200.50\n")
            f.write("Account Code,Account Description,Date,Amount\n")  # Repeated header
            f.write("5300,Janitorial,01/22/2025,800.00\n")
            f.write("5400,Management Fee,01/25/2025,2000.00\n")

        self._write_expected_errors(
            "format_repeated_headers",
            {
                "error_type": "format",
                "description": "CSV with header row repeated in the middle of data",
                "parseable": True,
                "expected_behavior": "Parser should detect and filter out repeated header rows",
                "expected_warnings": [
                    "Repeated header row detected at row 3 and removed"
                ],
                "expected_rows": 4,  # After filtering repeated header
                "valid_rows": 4,
                "invalid_rows": 0,
            },
        )

        print("[OK] Generated repeated headers fixture")

    def generate_comprehensive_fixture(self) -> None:
        """Generate comprehensive fixture combining multiple error types."""
        fixture_path = self.malformed_dir / "comprehensive_errors.csv"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)

        with open(fixture_path, "wb") as f:
            # UTF-8 BOM
            f.write(codecs.BOM_UTF8)

            # Multi-line header with property name
            f.write(b"Yardi Voyager GL Detail Report\n")
            f.write(b"Property: Test Building\n")
            f.write(b"\n")

            # Actual headers
            f.write(b"Account Code,Account Description,Date,Debit,Credit\n")

            # Valid row
            f.write(b"5100,Property Taxes,01/15/2025,5000.00,\n")

            # Missing columns
            f.write(b"5200,Utilities\n")

            # Invalid date
            f.write(b"5300,Janitorial,NOT_A_DATE,800.00,\n")

            # Non-numeric amount
            f.write(b"5400,Management Fee,01/25/2025,INVALID,\n")

            # Special characters (Windows-1252 encoding mixed in)
            f.write("5500,Insurance — Liability,01/28/2025,3500.00,\n".encode("cp1252"))

            # Repeated header
            f.write(b"Account Code,Account Description,Date,Debit,Credit\n")

            # Valid row
            f.write(b"5600,Repairs,01/30/2025,1500.00,\n")

            # Footer rows
            f.write(b"\n")
            f.write(b"TOTAL,,,10800.00,\n")
            f.write(b"Report Generated: 01/31/2025\n")

        self._write_expected_errors(
            "comprehensive_errors",
            {
                "error_type": "comprehensive",
                "description": "Comprehensive fixture combining multiple error types",
                "parseable": True,
                "expected_behavior": "Parser should handle all errors gracefully and extract valid rows",
                "expected_warnings": [
                    "UTF-8 BOM detected and removed",
                    "Encoding errors detected in some rows",
                    "Missing columns in row(s)",
                    "Invalid dates detected",
                    "Non-numeric amounts detected",
                    "Repeated headers detected and removed",
                    "Footer rows detected and removed",
                ],
                "expected_errors": [],
                "expected_rows": "2-3",  # Depends on how many rows can be salvaged
                "valid_rows": "2",
                "invalid_rows": "4-5",
                "recovery_rate": "~30-40%",
            },
        )

        print("[OK] Generated comprehensive errors fixture")

    def _write_expected_errors(
        self, fixture_name: str, expected_data: dict[str, Any]
    ) -> None:
        """Write expected errors JSON file.

        Args:
            fixture_name: Name of the fixture (without extension)
            expected_data: Expected error data
        """
        self.expected_dir.mkdir(parents=True, exist_ok=True)
        expected_path = self.expected_dir / f"{fixture_name}_expected.json"

        with open(expected_path, "w", encoding="utf-8") as f:
            json.dump(expected_data, f, indent=2)


def main():
    """Generate all malformed fixtures."""
    fixtures_dir = Path(__file__).parent.parent
    generator = MalformedFixtureGenerator(fixtures_dir)
    generator.generate_all()


if __name__ == "__main__":
    main()
