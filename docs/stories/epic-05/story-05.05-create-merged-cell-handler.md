# Story 5.5: Create Merged Cell Handler

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Not Started
**Estimated Time**: 2 hours

---

## User Story

**As a** parser
**I want** to handle Excel files with merged cells
**So that** property/building context propagates correctly

---

## Acceptance Criteria

- [ ] **AC1**: Forward-fills property name when empty
- [ ] **AC2**: Forward-fills building name when empty
- [ ] **AC3**: Identifies header rows vs data rows
- [ ] **AC4**: Works with both CSV and Excel
- [ ] **AC5**: Preserves original data in raw_row_data

---

## Technical Specifications

### Files to Extend

```
backend/app/services/ingestion/
└── cleaners.py (add functions)
```

### Implementation Details

**Additional cleaners.py content**:
```python
def handle_merged_cells_pattern(
    df: pd.DataFrame,
    config: dict,
) -> pd.DataFrame:
    """
    Handle the common ERP pattern of merged cells for grouping.

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
    indicator_col = config.get('data_indicator', 'account_code')
    skip_patterns = config.get('skip_patterns', [])

    # Forward-fill group columns
    for col in config.get('group_columns', []):
        if col in df.columns:
            # Only forward-fill, don't back-fill
            df[col] = df[col].replace('', np.nan).ffill()

    # Filter out non-data rows
    if indicator_col in df.columns:
        # Keep rows where indicator is not null/empty
        mask = df[indicator_col].notna() & (df[indicator_col] != '')

        # Also filter out skip patterns
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
    """
    Detect which row contains the actual column headers.

    Many ERP exports have title/summary rows before the actual headers.

    Args:
        df: DataFrame to check
        expected_headers: List of expected header names (case-insensitive)
        max_rows_to_check: How many rows to check

    Returns:
        Row index of header row, or 0 if not found
    """
    expected_lower = [h.lower() for h in expected_headers]

    for i in range(min(max_rows_to_check, len(df))):
        row_values = df.iloc[i].astype(str).str.lower().tolist()

        # Count how many expected headers we find
        matches = sum(1 for h in expected_lower if h in row_values)

        # If we match most expected headers, this is likely the header row
        if matches >= len(expected_lower) * 0.6:
            return i

    return 0


def split_amount_columns(
    df: pd.DataFrame,
    debit_col: str = 'debit',
    credit_col: str = 'credit',
    amount_col: str = 'amount',
) -> pd.DataFrame:
    """
    Combine separate debit/credit columns into signed amount.

    Convention: positive = debit, negative = credit

    Args:
        df: DataFrame with separate debit/credit columns
        debit_col: Name of debit column
        credit_col: Name of credit column
        amount_col: Name of output amount column

    Returns:
        DataFrame with combined amount column
    """
    df = df.copy()

    if debit_col in df.columns and credit_col in df.columns:
        debit = clean_currency_column(df[debit_col]).fillna(0)
        credit = clean_currency_column(df[credit_col]).fillna(0)

        # Positive for debits, negative for credits
        df[amount_col] = debit - credit

        # Optionally drop original columns
        # df = df.drop(columns=[debit_col, credit_col])

    return df
```

---

## Definition of Done

- [ ] Forward-fill works
- [ ] Header detection works
- [ ] Debit/Credit split works
- [ ] Tests pass

---

## Notes

Many ERP exports use merged cells in Excel to group related rows under a property or building name. When exported to CSV, these merged cells result in empty values that need to be forward-filled. The `handle_merged_cells_pattern` function handles this common pattern while also filtering out header rows, total rows, and other garbage.
