"""Yardi Voyager GL Parser.

Parses GL Detail exports from Yardi Voyager property management software.
"""

from __future__ import annotations

import logging
from typing import BinaryIO

import pandas as pd

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.cleaners import (
    clean_currency_column,
    clean_date_column,
    extract_period_from_date,
    filter_garbage_rows,
    handle_merged_cells_pattern,
    split_amount_columns,
)
from app.services.ingestion.schemas import ParseResult

logger = logging.getLogger(__name__)


class YardiVoyagerGLParser(IngestionStrategy):
    """Parser for Yardi Voyager GL Detail exports.

    Expected format:
    - CSV or Excel export
    - May have report header rows before data
    - Property/Building names in merged cells
    - Account Code, Description, Date, Amount columns
    - Amounts may use (parentheses) for negatives
    """

    @property
    def source_system(self) -> str:
        """Return the source system identifier."""
        return "yardi"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like a Yardi export.

        Args:
            file_header: First bytes of file for signature detection
            file_name: Original file name

        Returns:
            Confidence score 0.0-1.0
        """
        text = file_header.decode("utf-8", errors="ignore").upper()

        score = 0.0

        # Strong indicators
        if "YARDI" in text:
            score += 0.5
        if "VOYAGER" in text:
            score += 0.3

        # Moderate indicators
        if "GL DETAIL" in text:
            score += 0.2
        if "PROPERTY" in text and "ACCOUNT" in text:
            score += 0.2

        # Weak indicators
        if file_name.lower().startswith("gl"):
            score += 0.1

        return min(score, 1.0)

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """Parse Yardi Voyager GL export.

        Args:
            file: File-like object to parse
            file_name: Original file name
            property_id: UUID of the property

        Returns:
            ParseResult with parsed data and metadata
        """
        errors: list[str] = []
        warnings: list[str] = []

        try:
            # Read file based on extension
            if file_name.lower().endswith((".xlsx", ".xls")):
                df = pd.read_excel(file, header=0)
            else:
                # FIX DI-8: Use streaming approach for header detection
                # instead of reading entire file into memory
                # FIX DI-15: Handle UTF-8 BOM by using 'utf-8-sig' encoding
                lines: list[str] = []
                try:
                    # Read only the first 100 lines for header detection
                    for i, line_bytes in enumerate(file):
                        if i >= 100:
                            break
                        try:
                            # FIX DI-15: utf-8-sig automatically strips BOM
                            line = line_bytes.decode("utf-8-sig").strip()
                        except UnicodeDecodeError:
                            line = line_bytes.decode("latin-1").strip()
                        lines.append(line)
                except Exception:
                    # Fallback: read entire content if streaming fails
                    file.seek(0)
                    try:
                        text_content = file.read().decode("utf-8-sig")
                    except UnicodeDecodeError:
                        file.seek(0)
                        text_content = file.read().decode("latin-1")
                    lines = text_content.strip().split("\n")

                # Find header row by looking for line with most expected headers
                header_row_idx = self._find_header_row(lines)

                # Read CSV starting from header row
                # skiprows skips lines before header, first row becomes header
                # dtype=str: read all columns as strings to preserve exact values
                # (e.g. account code "5100.10" must not become float 5100.1)
                file.seek(0)
                try:
                    # FIX DI-15: Use utf-8-sig to handle BOM
                    df = pd.read_csv(
                        file,
                        skiprows=header_row_idx,
                        encoding="utf-8-sig",
                        on_bad_lines="skip",
                        dtype=str,
                    )
                except Exception:
                    file.seek(0)
                    df = pd.read_csv(
                        file,
                        skiprows=header_row_idx,
                        encoding="latin-1",
                        on_bad_lines="skip",
                        dtype=str,
                    )
                finally:
                    # FIX DI-10: Always reset file position after reading
                    file.seek(0)

            if df.empty:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=["File is empty or could not be parsed"],
                )

            # Standardize column names
            df = self._standardize_column_names(df)

            # Handle merged cells for property context
            if "property_name" in df.columns or "building_name" in df.columns:
                df = handle_merged_cells_pattern(
                    df,
                    {
                        "group_columns": ["property_name", "building_name"],
                        "data_indicator": "account_code",
                        "skip_patterns": ["Total", "Subtotal", "---"],
                    },
                )

            # Filter garbage rows
            df = filter_garbage_rows(df)

            # Ensure required columns exist
            if "account_code" not in df.columns:
                errors.append("Missing required column: account_code")
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=errors,
                )

            # Combine debit/credit into signed amount if present
            if "debit" in df.columns and "credit" in df.columns:
                df, split_warnings = split_amount_columns(
                    df, "debit", "credit", "amount"
                )
                warnings.extend(split_warnings)
            elif "debit" in df.columns:
                df["amount"] = pd.to_numeric(df["debit"], errors="coerce").fillna(0)
            elif "credit" in df.columns:
                # FIX ING-8: Check sign convention before negating credits
                # Standard: credits positive in source, negate for accounting sign
                # Non-standard: credits already negative, don't double-negate
                credit_values = pd.to_numeric(df["credit"], errors="coerce").fillna(0)
                # If most non-zero credits already negative, source pre-applied sign
                non_zero_credits = credit_values[credit_values != 0]
                if len(non_zero_credits) > 0 and (non_zero_credits < 0).mean() > 0.5:
                    # Most credits already negative - don't negate
                    df["amount"] = credit_values
                else:
                    # Standard convention - negate positive credits
                    df["amount"] = -credit_values

            # Clean data columns - amount is required for financial data
            if "amount" in df.columns:
                df["amount"] = clean_currency_column(df["amount"])
            else:
                # Missing amount column is a critical error for financial data
                # Don't silently default to 0.0 as this masks data issues
                errors.append(
                    "Missing required column: amount. "
                    "The file must contain an Amount, Net Amount, or Total column."
                )
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=errors,
                )

            if "transaction_date" in df.columns:
                df["transaction_date"] = clean_date_column(df["transaction_date"])
            else:
                df["transaction_date"] = pd.NaT

            if "accrual_date" in df.columns:
                df["accrual_date"] = clean_date_column(df["accrual_date"])

            # Extract period from date
            if df["transaction_date"].notna().any():
                df["period_year"], df["period_month"] = extract_period_from_date(
                    df["transaction_date"]
                )
            else:
                df["period_year"] = pd.NA
                df["period_month"] = pd.NA

            # Clean account codes
            df["account_code"] = df["account_code"].astype(str).str.strip()

            # Ensure account_description exists
            if "account_description" not in df.columns:
                df["account_description"] = ""

            # Add property_id
            df["property_id"] = property_id

            # Filter out rows with missing required data FIRST
            initial_count = len(df)
            required_columns = ["account_code", "amount", "transaction_date"]
            validation_mask = self._build_validation_mask(df, required_columns)

            df = df[validation_mask].reset_index(drop=True)
            dropped = initial_count - len(df)

            if dropped > 0:
                warnings.append(f"Excluded {dropped} rows with missing required data")

            # Check if any valid rows remain
            if len(df) == 0:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=[
                        f"No valid rows found. All {initial_count} rows had "
                        f"missing required data."
                    ],
                    warnings=warnings,
                )

            # Standardize columns to ensure correct types BEFORE validation
            df = self._standardize_columns(df)

            # Validate output structure and types AFTER standardization
            validation_errors = self._validate_output(df)
            if validation_errors:
                errors.extend(validation_errors)

            return ParseResult(
                success=len(errors) == 0,
                source_system=self.source_system,
                data=df,
                row_count=len(df),
                error_count=len(errors),
                errors=errors,
                warnings=warnings,
            )

        except Exception as e:
            return ParseResult(
                success=False,
                source_system=self.source_system,
                data=pd.DataFrame(),
                row_count=0,
                error_count=1,
                errors=[f"Parse error: {str(e)}"],
            )

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map various column names to standard names.

        Args:
            df: DataFrame with original column names

        Returns:
            DataFrame with standardized column names
        """
        column_mappings = {
            # Account code variations
            "account code": "account_code",
            "account": "account_code",
            "acct": "account_code",
            "acct code": "account_code",
            "gl account": "account_code",
            # Description variations
            "account description": "account_description",
            "description": "account_description",
            "desc": "account_description",
            "acct desc": "account_description",
            # Amount variations
            "amount": "amount",
            "net amount": "amount",
            "total": "amount",
            # Date variations
            "date": "transaction_date",
            "transaction date": "transaction_date",
            "trans date": "transaction_date",
            "posting date": "transaction_date",
            "journal date": "transaction_date",
            # Accrual date variations
            "accrual date": "accrual_date",
            "effective date": "accrual_date",
            "service date": "accrual_date",
            "invoice date": "accrual_date",
            # Vendor
            "vendor": "vendor_name",
            "vendor name": "vendor_name",
            "payee": "vendor_name",
            # Property context
            "property": "property_name",
            "property name": "property_name",
            "building": "building_name",
            "building name": "building_name",
        }

        # Lowercase all column names
        df.columns = df.columns.astype(str).str.lower().str.strip()

        # Apply mappings
        df = df.rename(columns=column_mappings)

        return df

    def _find_header_row(self, lines: list[str]) -> int:
        """Find the header row index by looking for expected column names.

        Uses word boundary matching to avoid false positives from prose text
        containing substrings like "describe" matching "description".

        Args:
            lines: List of file lines

        Returns:
            Index of the header row (0-based)
        """
        import re

        # Use word boundary patterns to avoid substring false positives
        # e.g., "describe" should NOT match "description" pattern
        expected_patterns = [
            re.compile(r"\baccount\b", re.IGNORECASE),
            re.compile(r"\bdescription\b", re.IGNORECASE),
            re.compile(r"\bamount\b", re.IGNORECASE),
            re.compile(r"\bdate\b", re.IGNORECASE),
        ]

        for i, line in enumerate(lines):
            # Count how many expected headers appear in this line as whole words
            matches = sum(1 for pattern in expected_patterns if pattern.search(line))
            # FIX ING-3: Require 3+ patterns to avoid false positives
            # A metadata row like "Date: 01/15/2025" could match only "date"
            # A proper header row should have multiple column names
            if matches >= 3:
                return i

        # Fallback: try with 2 patterns if no 3+ match found
        # This handles edge cases where header has few columns
        for i, line in enumerate(lines):
            matches = sum(1 for pattern in expected_patterns if pattern.search(line))
            if matches >= 2:
                return i

        return 0
