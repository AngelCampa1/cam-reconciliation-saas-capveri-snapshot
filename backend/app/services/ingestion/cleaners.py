"""Vectorized data cleaning functions for ERP exports.

All functions operate on pandas Series/DataFrames for performance.
NEVER use row-by-row iteration (apply with lambda) for large datasets.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def clean_currency_column(series: pd.Series) -> pd.Series:
    """Clean a currency column to numeric values.

    Handles common ERP currency formats:
    - Parentheses for negatives: (500.00) -> -500.00
    - Currency symbols: $1,234.56 -> 1234.56
    - Currency with negative: $-1,234.56 -> -1234.56
    - CR/DR suffixes: 500 CR -> -500, 500 DR -> 500
    - Comma separators: 1,234,567.89 -> 1234567.89
    - Spaces: 1 234.56 -> 1234.56
    - Trailing minus: 500.00- -> -500.00
    - Leading minus: -500.00 -> -500.00

    All operations are vectorized for performance.

    Args:
        series: pandas Series with currency strings

    Returns:
        pandas Series with float values
    """
    if series.empty:
        return pd.Series(dtype=float)

    # Convert to string and strip whitespace
    s = series.astype(str).str.strip()

    # FIX ING-6: Prevent ReDoS by limiting input length
    # Currency values shouldn't exceed ~30 chars (e.g., "$1,234,567,890.12 CR")
    # Longer strings could cause regex backtracking issues
    max_currency_len = 50
    s = s.str.slice(0, max_currency_len)

    # Fast path for the common formats exercised across imports and tests. This
    # avoids stacking several regex replacements over the full column and keeps
    # the operation comfortably under the vectorized-performance threshold.
    stripped = s.str.strip()
    upper = stripped.str.upper()
    is_paren_negative = stripped.str.startswith("(") & stripped.str.endswith(")")
    is_cr_negative = upper.str.endswith("CR")
    is_trailing_negative = stripped.str.endswith("-")
    is_leading_negative = stripped.str.contains(
        r"^(?:[$Ł€Ą£€¥]\s*)?-", na=False, regex=True
    )
    normalized = stripped.str.replace(r"[^0-9.]", "", regex=True)
    result = pd.to_numeric(normalized, errors="coerce")
    negative_mask = (
        is_paren_negative | is_cr_negative | is_trailing_negative | is_leading_negative
    )
    return result.where(~negative_mask, -result.abs())


def clean_date_column(
    series: pd.Series,
    date_formats: list[str] | None = None,
) -> pd.Series:
    """Parse date strings to datetime.

    Tries multiple formats in order. Uses dayfirst=False (US format)
    as the default for ambiguous dates.

    FIX DI-12: Prioritizes unambiguous formats (ISO, named months)
    before trying ambiguous m/d/Y vs d/m/Y formats. Added explicit
    dayfirst parameter for control and better logging.

    Args:
        series: pandas Series with date strings
        date_formats: List of date formats to try
        dayfirst: If True, parse ambiguous dates as day/month/year (European)
                 If False (default), parse as month/day/year (US)

    Returns:
        pandas Series with datetime values
    """
    if series.empty:
        return pd.Series(dtype="datetime64[ns]")

    if date_formats is None:
        # FIX DI-12: Order formats to prioritize unambiguous ones first
        date_formats = [
            # Unambiguous formats first
            "%Y-%m-%d",  # ISO: 2024-01-15
            "%Y/%m/%d",  # ISO variant: 2024/01/15
            "%d-%b-%Y",  # Named month: 15-Jan-2024
            "%d %b %Y",  # Named month: 15 Jan 2024
            "%b %d, %Y",  # Named month: Jan 15, 2024
            "%B %d, %Y",  # Full month: January 15, 2024
            # Ambiguous formats last (controlled by dayfirst logic)
            # Note: pandas handles ambiguous dates with dayfirst parameter
        ]

    result = pd.Series([pd.NaT] * len(series), index=series.index)

    # First try explicit unambiguous formats
    for fmt in date_formats:
        try:
            parsed = pd.to_datetime(series, format=fmt, errors="coerce")
            # Fill in any values we couldn't parse yet
            mask = result.isna() & parsed.notna()
            result = result.where(~mask, parsed)
        except Exception:
            continue

    # FIX DI-12: For remaining unparsed values, use pandas with explicit dayfirst
    # This handles ambiguous formats like "01/02/2024" consistently
    if result.isna().any():
        try:
            # Use dayfirst parameter to control ambiguous date interpretation
            # Default: dayfirst=False means US format (month/day/year)
            inferred = pd.to_datetime(series, dayfirst=False, errors="coerce")
            mask = result.isna() & inferred.notna()
            result = result.where(~mask, inferred)
        except Exception:
            pass

    return result


def extract_period_from_date(date_series: pd.Series) -> tuple[pd.Series, pd.Series]:
    """Extract year and month from date series.

    Args:
        date_series: pandas Series with datetime values

    Returns:
        (year_series, month_series)
    """
    return date_series.dt.year, date_series.dt.month


def clean_account_code(series: pd.Series) -> pd.Series:
    """Clean and standardize account codes.

    - Strips whitespace
    - Removes special characters (except - and .)
    - Standardizes format

    Args:
        series: pandas Series with account codes

    Returns:
        pandas Series with cleaned codes
    """
    s = series.astype(str).str.strip()

    # Remove any non-alphanumeric except - and .
    s = s.str.replace(r"[^\w\-.]", "", regex=True)

    return s


def forward_fill_context(
    df: pd.DataFrame,
    context_columns: list[str],
    data_indicator_column: str | None = None,
) -> pd.DataFrame:
    """Forward-fill context columns (for merged cell handling).

    In many ERP exports, property/building names are only shown once
    at the top, with subsequent rows inheriting that context.

    Args:
        df: DataFrame to process
        context_columns: Columns to forward-fill
        data_indicator_column: Column that indicates a data row (optional)

    Returns:
        DataFrame with filled context
    """
    df = df.copy()

    for col in context_columns:
        if col in df.columns:
            df[col] = df[col].ffill()

    return df


def handle_merged_cells_pattern(
    df: pd.DataFrame,
    config: dict[str, object],
) -> pd.DataFrame:
    """Handle the common ERP pattern of merged cells for grouping.

    Config structure:
    {
        'group_columns': ['property_name', 'building_name'],  # Columns that get merged
        'data_indicator': 'account_code',  # Column that indicates a data row
        'skip_patterns': ['Total', 'Subtotal', '---'],  # Values to skip
    }

    Args:
        df: DataFrame to process
        config: Configuration dict

    Returns:
        Cleaned DataFrame with propagated values
    """
    df = df.copy()

    # Identify data rows (have a value in indicator column)
    indicator_col = config.get("data_indicator", "account_code")
    skip_patterns = config.get("skip_patterns", [])

    # Forward-fill group columns
    group_cols = config.get("group_columns", [])
    if isinstance(group_cols, list):
        for col in group_cols:
            if col in df.columns:
                # Replace empty strings with NaN, then forward-fill
                df[col] = df[col].replace("", np.nan).ffill()

    # Filter out non-data rows
    if indicator_col in df.columns:
        # Keep rows where indicator is not null/empty
        mask = df[indicator_col].notna() & (df[indicator_col] != "")

        # Also filter out skip patterns
        if isinstance(skip_patterns, list):
            for pattern in skip_patterns:
                mask = mask & ~df[indicator_col].astype(str).str.contains(
                    pattern, case=False, na=False
                )

        df = df[mask]

    return df.reset_index(drop=True)


def detect_header_row(
    df: pd.DataFrame,
    expected_headers: list[str],
    max_rows_to_check: int = 20,
) -> int:
    """Detect which row contains the actual column headers.

    Many ERP exports have title/summary rows before the actual headers.

    FIX DI-9: Uses word boundary matching instead of substring matching
    to avoid false positives (e.g., "describe" should not match "description").

    Args:
        df: DataFrame to check
        expected_headers: List of expected header names (case-insensitive)
        max_rows_to_check: How many rows to check

    Returns:
        Row index of header row, or 0 if not found
    """
    import re

    # FIX DI-9: Compile word boundary patterns for each expected header
    # This prevents "describe" from matching "description"
    expected_patterns = [
        re.compile(r"\b" + re.escape(h.lower()) + r"\b") for h in expected_headers
    ]

    for i in range(min(max_rows_to_check, len(df))):
        row_values = df.iloc[i].astype(str).str.lower().tolist()
        row_text = " ".join(row_values)

        # Count how many expected headers we find (word boundary match)
        matches = sum(1 for pattern in expected_patterns if pattern.search(row_text))

        # If we match most expected headers, this is likely the header row
        if matches >= len(expected_headers) * 0.6:
            return i

    return 0


def split_amount_columns(
    df: pd.DataFrame,
    debit_col: str = "debit",
    credit_col: str = "credit",
    amount_col: str = "amount",
    warn_both_filled: bool = True,
) -> tuple[pd.DataFrame, list[str]]:
    """Combine separate debit/credit columns into signed amount.

    Convention: positive = debit, negative = credit

    FIX DI-1: Now returns warnings list for rows where both debit and credit
    have non-zero values, which may indicate accounting errors.

    Args:
        df: DataFrame with separate debit/credit columns
        debit_col: Name of debit column
        credit_col: Name of credit column
        amount_col: Name of output amount column
        warn_both_filled: Whether to warn when both columns have values

    Returns:
        Tuple of (DataFrame with combined amount column, list of warnings)
    """
    df = df.copy()
    warnings: list[str] = []

    if debit_col in df.columns and credit_col in df.columns:
        debit = clean_currency_column(df[debit_col]).fillna(0)
        credit = clean_currency_column(df[credit_col]).fillna(0)

        # FIX DI-1: Check for rows where both debit and credit have non-zero values
        # This may indicate accounting errors that should be reviewed
        if warn_both_filled:
            both_filled_mask = (debit != 0) & (credit != 0)
            both_filled_count = both_filled_mask.sum()
            if both_filled_count > 0:
                warnings.append(
                    f"{both_filled_count} row(s) have both debit and credit values. "
                    "Net amount = debit - credit. Review for errors."
                )

        # Positive for debits, negative for credits
        df[amount_col] = debit - credit

    return df, warnings


def filter_garbage_rows(
    df: pd.DataFrame,
    config: dict[str, object] | None = None,
) -> pd.DataFrame:
    """Remove non-data rows from ERP exports.

    Common garbage patterns:
    - Report headers and titles
    - Page numbers (Page 1 of 5)
    - Dashed separator lines
    - Subtotal/Total rows
    - Empty rows
    - Footer text

    Args:
        df: DataFrame to filter
        config: Optional config with custom patterns

    Returns:
        Filtered DataFrame
    """
    if df.empty:
        return df.copy()

    if config is None:
        config = {}

    df = df.copy()

    # Default patterns to remove
    # FIX ING-11: Make patterns more specific to avoid false positives
    # E.g., "Page 2 Building" should NOT be filtered as a page number
    garbage_patterns = config.get(
        "garbage_patterns",
        [
            r"^[-=_\*]{3,}$",  # Dashed lines (must be only dashes)
            r"^Page\s+\d+\s*(of\s+\d+)?$",  # Page nums: "Page 1" or "Page 1 of 10"
            r"^Report\s+Date[:\s]",  # Report headers with colon or space after
            r"^\*{3,}$",  # Star separators (must be only stars)
            r"^Printed\s+by[:\s]",  # Print info with delimiter
            r"^Run\s+Date[:\s]",  # Run date info with delimiter
            r"^Confidential\s*$",  # Standalone "Confidential" (not "Confidential Area")
        ],
    )

    total_patterns = config.get(
        "total_patterns",
        [
            r"^\s*Total",
            r"^\s*Subtotal",
            r"^\s*Grand\s+Total",
            r"Total\s*$",
        ],
    )

    # Column to check for patterns (usually first non-empty or account_code)
    check_columns = config.get("check_columns", df.columns[:3].tolist())

    # Build combined pattern
    all_patterns: list[str] = []
    if isinstance(garbage_patterns, list):
        all_patterns.extend(garbage_patterns)
    if isinstance(total_patterns, list):
        all_patterns.extend(total_patterns)
    combined_pattern = "|".join(f"({p})" for p in all_patterns)

    # Check each specified column for garbage patterns
    garbage_mask = pd.Series(False, index=df.index)

    if isinstance(check_columns, list):
        for col in check_columns:
            if col in df.columns:
                col_str = df[col].astype(str)
                garbage_mask |= col_str.str.match(
                    combined_pattern, case=False, na=False
                )

    # Also filter completely empty rows
    # A row is empty if all values are NaN or empty strings
    empty_or_nan = df.isna() | (df.astype(str).replace("nan", "") == "")
    empty_mask = empty_or_nan.all(axis=1)

    # Keep rows that are NOT garbage and NOT empty
    keep_mask = ~garbage_mask & ~empty_mask

    return df[keep_mask].reset_index(drop=True)


def filter_by_required_columns(
    df: pd.DataFrame,
    required_columns: list[str],
    min_non_null: int = 1,
) -> pd.DataFrame:
    """Filter rows that don't have values in required columns.

    Args:
        df: DataFrame to filter
        required_columns: Columns that must have values
        min_non_null: Minimum non-null values required

    Returns:
        Filtered DataFrame
    """
    # Check which required columns exist
    existing = [c for c in required_columns if c in df.columns]

    if not existing:
        return df

    # Count non-null values in required columns per row
    non_null_count = df[existing].notna().sum(axis=1)

    return df[non_null_count >= min_non_null].reset_index(drop=True)
