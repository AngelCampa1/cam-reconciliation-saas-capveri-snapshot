# Story 5.6: Create Garbage Row Filter

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 2 hours

---

## User Story

**As a** parser
**I want** to remove non-data rows automatically
**So that** I don't store report headers, footers, and page breaks

---

## Acceptance Criteria

- [x] **AC1**: Removes rows with "Page X of Y" patterns
- [x] **AC2**: Removes rows with dashed lines (---)
- [x] **AC3**: Removes rows with "Total" summaries
- [x] **AC4**: Removes empty rows
- [x] **AC5**: Preserves data rows accurately

---

## Technical Specifications

### Files to Extend

```
backend/app/services/ingestion/
└── cleaners.py (add filter_garbage_rows)
```

### Implementation Details

**Additional cleaners.py content**:
```python
def filter_garbage_rows(
    df: pd.DataFrame,
    config: dict = None,
) -> pd.DataFrame:
    """
    Remove non-data rows from ERP exports.

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
    if config is None:
        config = {}

    df = df.copy()

    # Default patterns to remove
    garbage_patterns = config.get('garbage_patterns', [
        r'^[-=_\*]{3,}$',              # Dashed lines
        r'^Page\s+\d+',                 # Page numbers
        r'^Report\s+Date',              # Report headers
        r'^\*{3,}',                      # Star separators
        r'^Printed\s+by',               # Print info
        r'^Run\s+Date',                 # Run date info
        r'^Confidential',               # Confidentiality notices
    ])

    total_patterns = config.get('total_patterns', [
        r'^\s*Total',
        r'^\s*Subtotal',
        r'^\s*Grand\s+Total',
        r'Total\s*$',
    ])

    # Column to check for patterns (usually first non-empty or account_code)
    check_columns = config.get('check_columns', df.columns[:3].tolist())

    # Build combined pattern
    all_patterns = garbage_patterns + total_patterns
    combined_pattern = '|'.join(f'({p})' for p in all_patterns)

    # Check each specified column for garbage patterns
    garbage_mask = pd.Series(False, index=df.index)

    for col in check_columns:
        if col in df.columns:
            col_str = df[col].astype(str)
            garbage_mask |= col_str.str.match(combined_pattern, case=False, na=False)

    # Also filter completely empty rows
    empty_mask = df.isna().all(axis=1) | (df == '').all(axis=1)

    # Keep rows that are NOT garbage and NOT empty
    keep_mask = ~garbage_mask & ~empty_mask

    return df[keep_mask].reset_index(drop=True)


def filter_by_required_columns(
    df: pd.DataFrame,
    required_columns: list[str],
    min_non_null: int = 1,
) -> pd.DataFrame:
    """
    Filter rows that don't have values in required columns.

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
```

---

## Definition of Done

- [x] All garbage patterns filtered
- [x] Data rows preserved
- [x] Empty rows removed
- [x] Configurable patterns

---

## Notes

ERP exports often contain non-data rows like page headers, footers, separator lines, and total/subtotal rows. The `filter_garbage_rows` function uses regex patterns to identify and remove these rows while preserving actual data. The patterns are configurable to handle different ERP systems' quirks.
