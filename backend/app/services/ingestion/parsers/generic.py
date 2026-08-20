"""Generic Mapping Parser.

For files that don't match known ERP formats.
Returns raw data for user-driven column mapping.

Two-phase operation:
1. Initial parse (no mapping): Return raw columns for mapping wizard
2. With mapping: Apply column mapping and clean data
"""

from __future__ import annotations

import logging
from typing import Any, BinaryIO

import pandas as pd

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.cleaners import (
    clean_currency_column,
    clean_date_column,
    extract_period_from_date,
)
from app.services.ingestion.schemas import ParseResult

logger = logging.getLogger(__name__)


class GenericMappingParser(IngestionStrategy):
    """Parser for unknown file formats.

    This parser is a fallback for files that don't match any known
    ERP format. It operates in two phases:

    Phase 1 (no mapping provided):
        - Reads the file as-is
        - Returns raw DataFrame with original columns
        - Provides column list and sample data for mapping wizard

    Phase 2 (mapping provided):
        - Applies user-specified column mappings
        - Cleans mapped columns (currency, dates)
        - Validates output against required schema

    Expected format:
    - CSV or Excel export
    - Any column structure
    - User must provide column mapping for Phase 2
    """

    @property
    def source_system(self) -> str:
        """Return the source system identifier."""
        return "generic"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Always returns low confidence as fallback parser.

        Args:
            file_header: First bytes of file (unused)
            file_name: Original file name (unused)

        Returns:
            0.1 - Low confidence, only used when no other parser matches
        """
        return 0.1

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
        column_mapping: dict[str, str] | None = None,
    ) -> ParseResult:
        """Parse generic file with optional column mapping.

        Args:
            file: File-like object to parse
            file_name: Original file name
            property_id: UUID of the property
            column_mapping: Optional dict mapping standard names to source columns
                           e.g., {"account_code": "AcctNum", "amount": "Amt"}

        Returns:
            ParseResult with parsed data and metadata
        """
        errors: list[str] = []
        warnings: list[str] = []

        try:
            # Read file based on extension
            if file_name.lower().endswith((".xlsx", ".xls")):
                df = pd.read_excel(file)
            else:
                # FIX ING-7: Use utf-8-sig to handle UTF-8 BOM consistently
                # This prevents BOM from corrupting the first column name
                try:
                    df = pd.read_csv(file, encoding="utf-8-sig", on_bad_lines="skip")
                except UnicodeDecodeError:
                    file.seek(0)
                    df = pd.read_csv(file, encoding="latin-1", on_bad_lines="skip")
                except pd.errors.EmptyDataError:
                    return ParseResult(
                        success=False,
                        source_system=self.source_system,
                        data=pd.DataFrame(),
                        row_count=0,
                        error_count=1,
                        errors=["File is empty - no data to parse"],
                    )

            if df.empty:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=["File is empty or could not be parsed"],
                )

            # Phase 1: No mapping provided - return raw data for mapping wizard
            if column_mapping is None:
                warnings.append("No column mapping provided - raw data returned")
                return ParseResult(
                    success=True,
                    source_system=self.source_system,
                    data=df,
                    row_count=len(df),
                    error_count=0,
                    warnings=warnings,
                )

            # Phase 2: Apply column mapping
            df = self._apply_mapping(df, column_mapping)

            # Clean mapped columns
            if "amount" in df.columns:
                df["amount"] = clean_currency_column(df["amount"])

            if "transaction_date" in df.columns:
                df["transaction_date"] = clean_date_column(df["transaction_date"])
                if df["transaction_date"].notna().any():
                    df["period_year"], df["period_month"] = extract_period_from_date(
                        df["transaction_date"]
                    )
                else:
                    df["period_year"] = None
                    df["period_month"] = None

            if "accrual_date" in df.columns:
                df["accrual_date"] = clean_date_column(df["accrual_date"])

            # Add property_id
            df["property_id"] = property_id

            # Ensure required columns exist with defaults if not mapped
            if "account_description" not in df.columns:
                df["account_description"] = ""

            if "period_year" not in df.columns:
                df["period_year"] = None

            if "period_month" not in df.columns:
                df["period_month"] = None

            if "transaction_date" not in df.columns:
                df["transaction_date"] = pd.NaT

            # Standardize columns to ensure correct types
            df = self._standardize_columns(df)

            # FIX ING-2: Check for critical required columns and fail if missing
            # When column_mapping is provided (Phase 2), these columns MUST exist
            # Otherwise the data is unusable for financial calculations
            critical_columns = ["account_code", "amount"]
            missing_critical = [
                col for col in critical_columns if col not in df.columns
            ]
            if missing_critical:
                errors.append(
                    f"Missing critical columns after mapping: {missing_critical}. "
                    "Please ensure column mapping includes 'account_code' and 'amount'."
                )
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=df,
                    row_count=len(df),
                    error_count=len(errors),
                    errors=errors,
                    warnings=warnings,
                )

            # Validate output for non-critical issues
            validation_errors = self._validate_output(df)
            if validation_errors:
                # For generic parser, non-critical validation issues are warnings
                warnings.extend(validation_errors)

            # Success is determined by whether there are actual errors
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

    def _apply_mapping(
        self,
        df: pd.DataFrame,
        mapping: dict[str, str],
    ) -> pd.DataFrame:
        """Apply column mapping to DataFrame.

        Args:
            df: DataFrame with original columns
            mapping: Dict mapping standard names to source column names
                    e.g., {"account_code": "AcctNum", "amount": "Amt"}

        Returns:
            DataFrame with renamed columns
        """
        df = df.copy()

        # Build rename map: source_column -> standard_name
        rename_map: dict[str, str] = {}
        for standard_name, source_column in mapping.items():
            if source_column and source_column in df.columns:
                rename_map[source_column] = standard_name

        df = df.rename(columns=rename_map)
        return df

    def get_sample_data(
        self,
        file: BinaryIO,
        file_name: str,
        rows: int = 5,
    ) -> dict[str, Any]:
        """Get sample data for mapping wizard.

        Returns column names and sample values to help users
        understand file structure and create column mappings.

        Args:
            file: File-like object to sample
            file_name: Original file name
            rows: Number of sample rows to return (default 5)

        Returns:
            Dict containing:
            - columns: List of column names
            - sample_rows: List of dicts with sample data
            - dtypes: Dict of column name to data type string
        """
        if file_name.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(file, nrows=rows)
        else:
            try:
                # FIX ING-7: Use utf-8-sig for consistent BOM handling
                df = pd.read_csv(file, nrows=rows, encoding="utf-8-sig")
            except UnicodeDecodeError:
                file.seek(0)
                df = pd.read_csv(file, nrows=rows, encoding="latin-1")

        return {
            "columns": list(df.columns),
            "sample_rows": df.to_dict("records"),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
        }
