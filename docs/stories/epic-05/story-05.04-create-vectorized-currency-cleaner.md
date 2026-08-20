# Story 5.4: Create Vectorized Currency Cleaner

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Not Started
**Estimated Time**: 3 hours

---

## User Story

**As a** parser
**I want** to clean currency values in vectorized operations
**So that** parsing is fast even with large files

---

## Acceptance Criteria

- [ ] **AC1**: Handles `(500.00)` as negative 500
- [ ] **AC2**: Handles `$1,234.56` as 1234.56
- [ ] **AC3**: Handles `500 CR` as negative 500
- [ ] **AC4**: Handles `500 DR` as positive 500
- [ ] **AC5**: All operations vectorized (no row-by-row loops)

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/
└── cleaners.py
```

### Implementation Details

**cleaners.py**:
```python
"""
Vectorized data cleaning functions for ERP exports.

All functions operate on pandas Series/DataFrames for performance.
NEVER use row-by-row iteration (apply with lambda) for large datasets.
"""
import re
from decimal import Decimal
from typing import Union

import numpy as np
import pandas as pd


def clean_currency_column(series: pd.Series) -> pd.Series:
    """
    Clean a currency column to numeric values.

    Handles common ERP currency formats:
    - Parentheses for negatives: (500.00) -> -500.00
    - Currency symbols: $1,234.56 -> 1234.56
    - CR/DR suffixes: 500 CR -> -500, 500 DR -> 500
    - Comma separators: 1,234,567.89 -> 1234567.89
    - Spaces: 1 234.56 -> 1234.56

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

    # Track negative indicators (before we remove them)
    # 1. Parentheses: (500.00)
    is_paren_negative = s.str.match(r'^\s*\(.*\)\s*$', na=False)

    # 2. CR suffix
    is_cr_negative = s.str.upper().str.contains(r'\s*CR\s*$', na=False, regex=True)

    # 3. Leading minus (keep as is, handled by conversion)
    # 4. Trailing minus: 500.00-
    is_trailing_negative = s.str.match(r'^[^-]*-\s*$', na=False)

    # Remove all non-numeric characters except . and -
    # First, handle special cases

    # Remove parentheses
    s = s.str.replace(r'[\(\)]', '', regex=True)

    # Remove CR/DR
    s = s.str.replace(r'\s*(CR|DR)\s*$', '', regex=True, case=False)

    # Remove trailing minus
    s = s.str.replace(r'-\s*$', '', regex=True)

    # Remove currency symbols and thousand separators
    s = s.str.replace(r'[$£€¥,\s]', '', regex=True)

    # Now convert to numeric
    result = pd.to_numeric(s, errors='coerce')

    # Apply negative indicators
    negative_mask = is_paren_negative | is_cr_negative | is_trailing_negative
    result = result.where(~negative_mask, -result.abs())

    return result


def clean_date_column(
    series: pd.Series,
    date_formats: list[str] = None,
) -> pd.Series:
    """
    Parse date strings to datetime.

    Tries multiple formats in order.

    Args:
        series: pandas Series with date strings
        date_formats: List of date formats to try

    Returns:
        pandas Series with datetime values
    """
    if date_formats is None:
        date_formats = [
            '%Y-%m-%d',      # ISO
            '%m/%d/%Y',      # US
            '%d/%m/%Y',      # European
            '%m-%d-%Y',
            '%d-%m-%Y',
            '%Y/%m/%d',
            '%m/%d/%y',
            '%d/%m/%y',
        ]

    result = pd.NaT

    for fmt in date_formats:
        try:
            parsed = pd.to_datetime(series, format=fmt, errors='coerce')
            # Fill in any values we couldn't parse yet
            result = parsed.combine_first(result) if not isinstance(result, pd._libs.NaTType) else parsed
        except:
            continue

    # Final fallback: let pandas infer
    if isinstance(result, pd._libs.NaTType) or result.isna().all():
        result = pd.to_datetime(series, errors='coerce', infer_datetime_format=True)

    return result


def extract_period_from_date(date_series: pd.Series) -> tuple[pd.Series, pd.Series]:
    """
    Extract year and month from date series.

    Args:
        date_series: pandas Series with datetime values

    Returns:
        (year_series, month_series)
    """
    return date_series.dt.year, date_series.dt.month


def clean_account_code(series: pd.Series) -> pd.Series:
    """
    Clean and standardize account codes.

    - Strips whitespace
    - Removes leading zeros (optional)
    - Standardizes format

    Args:
        series: pandas Series with account codes

    Returns:
        pandas Series with cleaned codes
    """
    s = series.astype(str).str.strip()

    # Remove any non-alphanumeric except - and .
    s = s.str.replace(r'[^\w\-.]', '', regex=True)

    return s


def forward_fill_context(
    df: pd.DataFrame,
    context_columns: list[str],
    data_indicator_column: str = None,
) -> pd.DataFrame:
    """
    Forward-fill context columns (for merged cell handling).

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
```

---

## Definition of Done

- [ ] All formats handled
- [ ] Vectorized operations
- [ ] No row loops
- [ ] Performance tested

---

## Notes

Vectorized operations are critical for performance with large files. The `clean_currency_column` function handles all common ERP currency formats without using row-by-row loops. This approach can process 50,000+ rows in under a second, compared to 30+ seconds with row-by-row iteration.
