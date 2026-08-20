"""MRI Rent Roll Parser.

Parses rent roll exports from MRI property management software.
"""

from __future__ import annotations

import logging
from typing import BinaryIO

import pandas as pd

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.cleaners import (
    clean_date_column,
    extract_period_from_date,
    filter_garbage_rows,
    split_amount_columns,
)
from app.services.ingestion.schemas import ParseResult

logger = logging.getLogger(__name__)


class MRIRentRollParser(IngestionStrategy):
    """Parser for MRI Rent Roll exports.

    Expected format:
    - CSV or Excel export
    - PERIOD column for fiscal period (YYYY-MM or MM/YYYY)
    - REF NUM column for reference numbers
    - SOURCE column for entry source
    - Separate DEBIT and CREDIT columns
    - Optional TENANT and UNIT columns
    """

    @property
    def source_system(self) -> str:
        """Return the source system identifier."""
        return "mri"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like an MRI export.

        Args:
            file_header: First bytes of file for signature detection
            file_name: Original file name

        Returns:
            Confidence score 0.0-1.0
        """
        text = file_header.decode("utf-8", errors="ignore").upper()

        score = 0.0

        # Strong indicators
        if "MRI" in text:
            score += 0.5

        # Column patterns specific to MRI
        if "PERIOD" in text:
            score += 0.2
        if "REF" in text and "NUM" in text:
            score += 0.2
        if "SOURCE" in text:
            score += 0.2
        if "DEBIT" in text and "CREDIT" in text:
            score += 0.2

        return min(score, 1.0)

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """Parse MRI rent roll export.

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
                df = pd.read_excel(file, header=None)
                # For Excel, detect header row
                header_row_idx = self._find_header_row_df(df)
                if header_row_idx > 0:
                    df.columns = df.iloc[header_row_idx].astype(str)
                    df = df.iloc[header_row_idx + 1 :].reset_index(drop=True)
                else:
                    df.columns = df.iloc[0].astype(str)
                    df = df.iloc[1:].reset_index(drop=True)
            else:
                # For CSV, read content first to find header row
                file_content = file.read()
                file.seek(0)

                try:
                    # FIX ING-7: Use utf-8-sig to handle UTF-8 BOM consistently
                    text_content = file_content.decode("utf-8-sig")
                except UnicodeDecodeError:
                    text_content = file_content.decode("latin-1")

                # Find header row by scanning lines
                lines = text_content.strip().split("\n")
                header_row_idx = self._find_header_row(lines)

                # Read CSV starting from header row
                file.seek(0)
                try:
                    # FIX ING-7: Use utf-8-sig to handle UTF-8 BOM consistently
                    df = pd.read_csv(
                        file,
                        skiprows=header_row_idx,
                        encoding="utf-8-sig",
                        on_bad_lines="skip",
                        dtype=str,  # preserve "5800.10" not float 5800.1
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

            # Filter garbage rows
            df = filter_garbage_rows(df)

            # Combine debit/credit into signed amount
            if "debit" in df.columns and "credit" in df.columns:
                df, split_warnings = split_amount_columns(
                    df, "debit", "credit", "amount"
                )
                warnings.extend(split_warnings)
            elif "debit" in df.columns:
                df["amount"] = pd.to_numeric(df["debit"], errors="coerce").fillna(0)
            elif "credit" in df.columns:
                df["amount"] = -pd.to_numeric(df["credit"], errors="coerce").fillna(0)
            elif "amount" in df.columns:
                # FIX ING-1: Check for existing amount column before erroring
                df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
            else:
                # FIX ING-1: Raise error instead of silently defaulting to zero
                # Silent zero default causes 100% data loss without any warning
                errors.append(
                    "Missing required amount columns: expected 'debit'/'credit' "
                    "or 'amount' column. Cannot parse financial data without amounts."
                )
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    data=pd.DataFrame(),
                    row_count=0,
                    error_count=1,
                    errors=errors,
                )

            # Parse dates/periods
            if "period" in df.columns:
                df = self._parse_mri_period(df)
            elif "transaction_date" in df.columns:
                df["transaction_date"] = clean_date_column(df["transaction_date"])
                if df["transaction_date"].notna().any():
                    df["period_year"], df["period_month"] = extract_period_from_date(
                        df["transaction_date"]
                    )
                else:
                    df["period_year"] = None
                    df["period_month"] = None
            else:
                df["transaction_date"] = pd.NaT
                df["period_year"] = None
                df["period_month"] = None

            if "accrual_date" in df.columns:
                df["accrual_date"] = clean_date_column(df["accrual_date"])

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

            # Clean account codes - handle numeric values that may have .0 suffix
            df["account_code"] = (
                df["account_code"]
                .astype(str)
                .str.strip()
                .str.replace(r"\.0$", "", regex=True)
            )

            # Ensure account_description exists
            if "account_description" not in df.columns:
                df["account_description"] = ""

            # Add property_id
            df["property_id"] = property_id

            # Validate output
            validation_errors = self._validate_output(df)
            if validation_errors:
                errors.extend(validation_errors)

            # Filter out rows with missing required data
            # FIX DI-20: Require transaction_date to prevent NULL constraint violations
            initial_count = len(df)
            required_columns = ["account_code", "amount", "transaction_date"]
            validation_mask = self._build_validation_mask(df, required_columns)

            df = df[validation_mask].reset_index(drop=True)
            dropped = initial_count - len(df)

            if dropped > 0:
                warnings.append(f"Excluded {dropped} rows with missing required data")

            # Standardize columns to ensure correct types
            df = self._standardize_columns(df)

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

    def _find_header_row(self, lines: list[str]) -> int:
        """Find the header row index by looking for expected column names.

        Uses word boundary matching to avoid false positives from prose text
        containing substrings like "counterpart" matching "account".

        Args:
            lines: List of file lines

        Returns:
            Index of the header row (0-based)
        """
        import re

        # FIX ING-13: Use word boundary patterns to avoid substring false positives
        # e.g., "counterpart" should NOT match "account" pattern
        expected_patterns = [
            re.compile(r"\bperiod\b", re.IGNORECASE),
            re.compile(r"\baccount\b", re.IGNORECASE),
            re.compile(r"\bdebit\b", re.IGNORECASE),
            re.compile(r"\bcredit\b", re.IGNORECASE),
        ]

        for i, line in enumerate(lines):
            # Count how many expected headers appear in this line as whole words
            matches = sum(1 for pattern in expected_patterns if pattern.search(line))
            # Header row should have at least 2 expected column names
            if matches >= 2:
                return i

        return 0

    def _find_header_row_df(self, df: pd.DataFrame) -> int:
        """Find the header row in a DataFrame.

        Uses word boundary matching to avoid false positives.

        Args:
            df: DataFrame with data

        Returns:
            Index of the header row (0-based)
        """
        import re

        # FIX ING-13: Use word boundary patterns to avoid substring false positives
        expected_patterns = [
            re.compile(r"\bperiod\b", re.IGNORECASE),
            re.compile(r"\baccount\b", re.IGNORECASE),
            re.compile(r"\bdebit\b", re.IGNORECASE),
            re.compile(r"\bcredit\b", re.IGNORECASE),
        ]

        for i in range(min(20, len(df))):
            row_values = df.iloc[i].astype(str).tolist()
            # Check each cell value against all patterns
            matches = 0
            for pattern in expected_patterns:
                if any(pattern.search(str(val)) for val in row_values):
                    matches += 1
            if matches >= 2:
                return i

        return 0

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map MRI column names to standard names.

        Args:
            df: DataFrame with original column names

        Returns:
            DataFrame with standardized column names
        """
        column_mappings = {
            # Period
            "period": "period",
            # Reference number variations
            "ref num": "reference_number",
            "ref": "reference_number",
            "reference": "reference_number",
            "reference number": "reference_number",
            # Source
            "source": "source",
            # Account code variations
            "account": "account_code",
            "acct": "account_code",
            "account code": "account_code",
            "gl account": "account_code",
            # Description variations
            "description": "account_description",
            "desc": "account_description",
            "account description": "account_description",
            # Debit/Credit variations
            "debit": "debit",
            "dr": "debit",
            "credit": "credit",
            "cr": "credit",
            # Date variations
            "date": "transaction_date",
            "transaction date": "transaction_date",
            "trans date": "transaction_date",
            "posting date": "transaction_date",
            # Accrual date variations
            "accrual date": "accrual_date",
            "effective date": "accrual_date",
            "service date": "accrual_date",
            "invoice date": "accrual_date",
            # Vendor
            "vendor": "vendor_name",
            "vendor name": "vendor_name",
            "payee": "vendor_name",
            # Tenant
            "tenant": "tenant_name",
            "tenant name": "tenant_name",
            "lessee": "tenant_name",
            # Unit
            "unit": "unit_number",
            "unit number": "unit_number",
            "suite": "unit_number",
            "space": "unit_number",
        }

        # Lowercase all column names
        df.columns = df.columns.astype(str).str.lower().str.strip()

        # Apply mappings
        df = df.rename(columns=column_mappings)

        return df

    def _parse_mri_period(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parse MRI period format (e.g., '2024-01' or '01/2024').

        Args:
            df: DataFrame with period column

        Returns:
            DataFrame with period_year, period_month, and transaction_date
        """
        df = df.copy()

        period = df["period"].astype(str)

        # FIX DI-4 & DI-5: Initialize columns with pd.NA (nullable Int64)
        # Using pd.NA for consistency with other parsers (Yardi uses pd.NA)
        # Previously used float("nan") which caused type mismatches
        df["period_year"] = pd.NA
        df["period_month"] = pd.NA

        # Try YYYY-MM format first
        match_yyyy_mm = period.str.extract(r"(\d{4})-(\d{1,2})")
        has_yyyy_mm = match_yyyy_mm[0].notna()

        if has_yyyy_mm.any():
            df.loc[has_yyyy_mm, "period_year"] = pd.to_numeric(
                match_yyyy_mm.loc[has_yyyy_mm, 0], errors="coerce"
            )
            df.loc[has_yyyy_mm, "period_month"] = pd.to_numeric(
                match_yyyy_mm.loc[has_yyyy_mm, 1], errors="coerce"
            )

        # Try MM/YYYY format for remaining
        remaining = ~has_yyyy_mm & period.notna()
        if remaining.any():
            match_mm_yyyy = period.str.extract(r"(\d{1,2})/(\d{4})")
            has_mm_yyyy = match_mm_yyyy[0].notna() & remaining

            if has_mm_yyyy.any():
                df.loc[has_mm_yyyy, "period_year"] = pd.to_numeric(
                    match_mm_yyyy.loc[has_mm_yyyy, 1], errors="coerce"
                )
                df.loc[has_mm_yyyy, "period_month"] = pd.to_numeric(
                    match_mm_yyyy.loc[has_mm_yyyy, 0], errors="coerce"
                )

        # Validate period values before processing
        # Months must be 1-12, years must be in reasonable range (1990-2100)
        # FIX DI-4: Use pd.NA for consistency with other parsers
        if df["period_month"].notna().any():
            invalid_months = (df["period_month"] < 1) | (df["period_month"] > 12)
            if invalid_months.any():
                df.loc[invalid_months, "period_month"] = pd.NA

        if df["period_year"].notna().any():
            invalid_years = (df["period_year"] < 1990) | (df["period_year"] > 2100)
            if invalid_years.any():
                df.loc[invalid_years, "period_year"] = pd.NA

        # Create transaction date from period
        # ASSUMPTION: Uses first day of month for period-based dates
        # This is intentional for reconciliation alignment since MRI periods
        # typically represent the entire month, not a specific day
        valid_period = df["period_year"].notna() & df["period_month"].notna()
        df["transaction_date"] = pd.NaT

        if valid_period.any():
            date_strings = (
                df.loc[valid_period, "period_year"].astype(int).astype(str)
                + "-"
                + df.loc[valid_period, "period_month"]
                .astype(int)
                .astype(str)
                .str.zfill(2)
                + "-01"
            )
            df.loc[valid_period, "transaction_date"] = pd.to_datetime(
                date_strings, errors="coerce"
            )

        # Convert period_year and period_month to nullable int type
        # Invalid values will be filtered out by validation mask
        df["period_year"] = df["period_year"].astype("Int64")
        df["period_month"] = df["period_month"].astype("Int64")

        return df
