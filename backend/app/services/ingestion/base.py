"""Ingestion Strategy Base Class.

Defines the interface for all ERP data parsers using the Strategy Pattern.
Each ERP system (Yardi, MRI, etc.) has its own export format. Subclasses
implement the specific parsing logic for each format.

The Strategy Pattern allows adding new parsers without modifying existing
code - just create a new subclass implementing the interface.
"""

from abc import ABC, abstractmethod
from typing import BinaryIO

import pandas as pd

from app.services.ingestion.schemas import ParseResult


class IngestionStrategy(ABC):
    """Abstract base class for ERP data parsers.

    This class defines the interface that all ingestion parsers must implement.
    The Strategy Pattern enables:
    - Open/Closed Principle: Add new parsers without modifying existing code
    - Dependency Inversion: Code depends on abstraction, not concrete parsers
    - Single Responsibility: Each parser handles one ERP format

    Subclasses MUST implement:
    - source_system property: Returns the source system identifier
    - can_handle(): Determines if the parser can handle a given file
    - parse(): Parses the file and returns normalized GL entries

    Example:
        >>> class YardiParser(IngestionStrategy):
        ...     @property
        ...     def source_system(self) -> str:
        ...         return "yardi"
        ...
        ...     def can_handle(self, file_header: bytes, file_name: str) -> float:
        ...         # Check for Yardi-specific markers
        ...         return 1.0 if b"Yardi" in file_header else 0.0
        ...
        ...     def parse(
        ...         self, file: BinaryIO, file_name: str, property_id: str
        ...     ) -> ParseResult:
        ...         # Parse the Yardi file
        ...         ...
    """

    @property
    @abstractmethod
    def source_system(self) -> str:
        """Return the name of this source system.

        Returns:
            Lowercase identifier for the source system (e.g., 'yardi', 'mri', 'generic')
        """

    @abstractmethod
    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Determine if this parser can handle the given file.

        Uses file fingerprinting to identify the source system. The header
        and filename are used to detect patterns specific to each ERP.

        Args:
            file_header: First 4KB of file content for signature detection
            file_name: Original file name (may contain hints like "yardi_export.csv")

        Returns:
            Confidence score 0.0-1.0, where:
            - 1.0: Definitely this format
            - 0.5-0.9: Likely this format
            - 0.0: Definitely not this format
        """

    @abstractmethod
    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """Parse the file and return normalized GL entries.

        This is the main entry point for ingestion. The parser must:
        1. Read and parse the file format
        2. Normalize data to the standard schema
        3. Validate and clean the data
        4. Return a ParseResult with the DataFrame and metadata

        Args:
            file: File-like object to parse (seekable)
            file_name: Original file name for error reporting
            property_id: UUID of the property this data belongs to

        Returns:
            ParseResult containing:
            - success: True if parsing completed without fatal errors
            - data: pandas DataFrame with standardized columns
            - row_count: Number of valid rows parsed
            - error_count: Number of rows that failed validation
            - errors: List of error messages
            - warnings: List of warning messages

        Raises:
            ValueError: If file format is invalid or cannot be parsed
        """

    def _validate_output(self, df: pd.DataFrame) -> list[str]:
        """Validate the output DataFrame matches expected schema.

        Checks that all required columns are present and have the correct types.
        This should be called by all parse() implementations before returning.

        Args:
            df: The DataFrame to validate

        Returns:
            List of validation errors (empty list if valid)
        """
        errors: list[str] = []

        # FIX ING-9: Handle empty DataFrame gracefully
        # Empty DataFrame is valid (just has no data), skip column type checks
        if df.empty:
            return errors

        # Required columns
        required_cols = [
            "account_code",
            "account_description",
            "amount",
            "transaction_date",
            "period_year",
            "period_month",
        ]

        for col in required_cols:
            if col not in df.columns:
                errors.append(f"Missing required column: {col}")

        # Type validations (only if columns exist)
        if "amount" in df.columns:
            if not pd.api.types.is_numeric_dtype(df["amount"]):
                errors.append("Column 'amount' must be numeric")

        if "transaction_date" in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df["transaction_date"]):
                errors.append("Column 'transaction_date' must be datetime")

        if "period_year" in df.columns:
            if not pd.api.types.is_integer_dtype(df["period_year"]):
                errors.append("Column 'period_year' must be integer")
            # Note: NaN values allowed (invalid dates coerce to NaN)

        if "period_month" in df.columns:
            if not pd.api.types.is_integer_dtype(df["period_month"]):
                errors.append("Column 'period_month' must be integer")
            # Note: NaN values allowed (invalid dates coerce to NaN)

        return errors

    def _standardize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Ensure all required columns exist with correct types.

        Adds missing optional columns with defaults and converts types.
        This should be called by parse() implementations to ensure
        consistent output.

        Args:
            df: The DataFrame to standardize

        Returns:
            DataFrame with standardized columns and types
        """
        # FIX ING-9: Handle empty DataFrame gracefully
        # Return copy immediately if empty to avoid edge cases with column access
        if df.empty:
            return df.copy()

        # Create a copy to avoid modifying the original
        df = df.copy()

        # Add missing optional columns with defaults
        if "vendor_name" not in df.columns:
            df["vendor_name"] = None

        if "description" not in df.columns:
            df["description"] = None

        if "accrual_date" not in df.columns:
            df["accrual_date"] = None

        if "raw_row_data" not in df.columns:
            # FIX DI-7: Use list comprehension to create independent dicts
            # [{}] * len(df) creates shared references - all rows point to same dict!
            df = df.copy()
            # pandas accepts list of dicts for column assignment
            df["raw_row_data"] = [{} for _ in range(len(df))]  # type: ignore[assignment]

        # Ensure correct types
        if "amount" in df.columns:
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

        if "period_year" in df.columns:
            df["period_year"] = df["period_year"].astype("Int64")

        if "period_month" in df.columns:
            df["period_month"] = df["period_month"].astype("Int64")

        return df

    def _build_validation_mask(
        self,
        df: pd.DataFrame,
        required_columns: list[str],
        exclude_zero_amounts: bool = True,
    ) -> pd.Series:
        """Build boolean mask for rows with complete required data.

        Filters out rows that have null or empty values in any required column.
        This prevents DB constraint violations when inserting incomplete data.

        FIX DI-11: Optionally excludes rows with zero amounts, as these often
        indicate data entry errors or missing values in financial data.

        Args:
            df: Parsed DataFrame
            required_columns: List of column names that must have non-null values
            exclude_zero_amounts: If True, excludes rows where amount == 0

        Returns:
            Boolean Series where True = row has all required data
        """
        # FIX ING-9: Handle empty DataFrame gracefully
        if df.empty:
            return pd.Series([], dtype=bool)

        # Start with all True (all rows valid by default)
        mask = pd.Series([True] * len(df), index=df.index)

        # For each required column, exclude rows with null/empty values
        for col in required_columns:
            if col in df.columns:
                # FIX DI-20: Explicitly exclude NaT values which convert to "NaT" string
                # Handle both None, empty strings, and pandas NaT
                mask &= (
                    df[col].notna()
                    & (df[col].astype(str).str.strip() != "")
                    & (df[col].astype(str).str.strip() != "NaT")
                )

        # FIX DI-11: Exclude zero amounts if configured
        # Zero amounts often indicate data errors in financial data
        if exclude_zero_amounts and "amount" in df.columns:
            mask &= df["amount"] != 0

        return mask
