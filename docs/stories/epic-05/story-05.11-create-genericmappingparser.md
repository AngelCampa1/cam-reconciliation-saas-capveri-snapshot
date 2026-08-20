# Story 5.11: Create GenericMappingParser

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 3 hours

---

## User Story

**As a** user with an unknown ERP format
**I want** to manually map columns
**So that** I can import data from any system

---

## Acceptance Criteria

- [x] **AC1**: Returns raw DataFrame without transformations
- [x] **AC2**: Stores detected columns for mapping wizard
- [x] **AC3**: Preserves all original data
- [x] **AC4**: Applies mapping configuration when provided
- [x] **AC5**: Validates mapped output

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/parsers/
└── generic.py
```

### Implementation Details

**generic.py**:
```python
"""
Generic Mapping Parser

For files that don't match known formats.
Returns raw data for user-driven column mapping.
"""
from typing import BinaryIO, Optional

import pandas as pd

from app.services.ingestion.base import IngestionStrategy, ParseResult
from app.services.ingestion.cleaners import (
    clean_currency_column,
    clean_date_column,
    extract_period_from_date,
)


class ColumnMapping(dict):
    """Column mapping configuration."""
    account_code: Optional[str] = None
    account_description: Optional[str] = None
    amount: Optional[str] = None
    transaction_date: Optional[str] = None
    vendor_name: Optional[str] = None


class GenericMappingParser(IngestionStrategy):
    """
    Generic parser for unknown file formats.

    Two-phase operation:
    1. Initial parse: Return raw columns for mapping wizard
    2. With mapping: Apply column mapping and clean data
    """

    @property
    def source_system(self) -> str:
        return 'generic'

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Always returns low confidence as fallback."""
        return 0.1

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
        column_mapping: Optional[dict] = None,
    ) -> ParseResult:
        """Parse generic file with optional column mapping."""
        errors = []
        warnings = []

        try:
            # Read file
            if file_name.lower().endswith('.xlsx') or file_name.lower().endswith('.xls'):
                df = pd.read_excel(file)
            else:
                df = pd.read_csv(file, encoding='utf-8', on_bad_lines='skip')

            if df.empty:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    row_count=0,
                    error_count=1,
                    errors=['File is empty'],
                )

            # If no mapping provided, return for mapping wizard
            if column_mapping is None:
                warnings.append('No column mapping provided - raw data returned')
                return ParseResult(
                    success=True,
                    source_system=self.source_system,
                    row_count=len(df),
                    error_count=0,
                    warnings=warnings,
                )

            # Apply column mapping
            df = self._apply_mapping(df, column_mapping)

            # Clean mapped columns
            if 'amount' in df.columns:
                df['amount'] = clean_currency_column(df['amount'])

            if 'transaction_date' in df.columns:
                df['transaction_date'] = clean_date_column(df['transaction_date'])
                df['period_year'], df['period_month'] = extract_period_from_date(
                    df['transaction_date']
                )

            # Add property_id
            df['property_id'] = property_id

            # Preserve raw data
            df['raw_row_data'] = df.apply(lambda row: row.to_dict(), axis=1)

            # Validate
            validation_errors = self._validate_output(df)
            errors.extend(validation_errors)

            return ParseResult(
                success=len(errors) == 0,
                source_system=self.source_system,
                row_count=len(df),
                error_count=len(errors),
                errors=errors,
                warnings=warnings,
            )

        except Exception as e:
            return ParseResult(
                success=False,
                source_system=self.source_system,
                row_count=0,
                error_count=1,
                errors=[f'Parse error: {str(e)}'],
            )

    def _apply_mapping(
        self,
        df: pd.DataFrame,
        mapping: dict,
    ) -> pd.DataFrame:
        """Apply column mapping to DataFrame."""
        df = df.copy()

        # Rename columns based on mapping
        rename_map = {}
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
    ) -> dict:
        """
        Get sample data for mapping wizard.

        Returns column names and sample values.
        """
        if file_name.lower().endswith('.xlsx') or file_name.lower().endswith('.xls'):
            df = pd.read_excel(file, nrows=rows)
        else:
            df = pd.read_csv(file, nrows=rows, encoding='utf-8')

        return {
            'columns': list(df.columns),
            'sample_rows': df.to_dict('records'),
            'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
        }
```

---

## Definition of Done

- [x] Returns raw data for mapping
- [x] Applies mapping when provided
- [x] Sample data works for wizard
- [x] Validates output

---

## Notes

The generic parser enables CapVeri to handle ANY ERP format, even ones we've never seen before. It operates in two phases: first returning raw data for the mapping wizard UI, then applying user-specified column mappings on subsequent import.
