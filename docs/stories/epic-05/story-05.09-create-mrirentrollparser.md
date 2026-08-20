# Story 5.9: Create MRIRentRollParser

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 4 hours

---

## User Story

**As a** user importing MRI exports
**I want** my MRI rent roll exports parsed correctly
**So that** I can use MRI data without manual processing

---

## Acceptance Criteria

- [x] **AC1**: Parses standard MRI rent roll export
- [x] **AC2**: Handles PERIOD, REF, SOURCE columns
- [x] **AC3**: Handles separate DEBIT/CREDIT columns
- [x] **AC4**: Extracts tenant and unit information
- [x] **AC5**: Parses dates in MRI format

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/parsers/
└── mri.py
```

### Implementation Details

**mri.py**:
```python
"""
MRI Rent Roll Parser

Parses rent roll exports from MRI property management software.
"""
import re
from typing import BinaryIO

import pandas as pd

from app.services.ingestion.base import IngestionStrategy, ParseResult
from app.services.ingestion.cleaners import (
    clean_currency_column,
    clean_date_column,
    extract_period_from_date,
    split_amount_columns,
    filter_garbage_rows,
    detect_header_row,
)


class MRIRentRollParser(IngestionStrategy):
    """
    Parser for MRI Rent Roll exports.

    Expected format:
    - CSV or Excel export
    - PERIOD column for fiscal period
    - REF column for reference numbers
    - SOURCE column for entry source
    - Separate DEBIT and CREDIT columns
    """

    @property
    def source_system(self) -> str:
        return 'mri'

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like an MRI export."""
        text = file_header.decode('utf-8', errors='ignore').upper()

        score = 0.0

        # Strong indicators
        if 'MRI' in text:
            score += 0.5

        # Column patterns
        if 'PERIOD' in text:
            score += 0.2
        if 'REF' in text and 'NUM' in text:
            score += 0.2
        if 'SOURCE' in text:
            score += 0.2
        if 'DEBIT' in text and 'CREDIT' in text:
            score += 0.2

        return min(score, 1.0)

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """Parse MRI rent roll export."""
        errors = []
        warnings = []

        try:
            # Read file
            if file_name.lower().endswith('.xlsx') or file_name.lower().endswith('.xls'):
                df = pd.read_excel(file, header=None)
            else:
                df = pd.read_csv(file, header=None, encoding='utf-8', on_bad_lines='skip')

            if df.empty:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    row_count=0,
                    error_count=1,
                    errors=['File is empty'],
                )

            # Detect header row
            expected_headers = ['period', 'account', 'debit', 'credit']
            header_row = detect_header_row(df, expected_headers)

            if header_row > 0:
                df.columns = df.iloc[header_row]
                df = df.iloc[header_row + 1:].reset_index(drop=True)

            # Standardize columns
            df = self._standardize_column_names(df)

            # Filter garbage
            df = filter_garbage_rows(df)

            # Combine debit/credit into signed amount
            df = split_amount_columns(df, 'debit', 'credit', 'amount')

            # Parse dates/periods
            if 'period' in df.columns:
                df = self._parse_mri_period(df)
            elif 'transaction_date' in df.columns:
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

            # Drop invalid rows
            initial = len(df)
            df = df.dropna(subset=['account_code', 'amount'])
            dropped = initial - len(df)
            if dropped:
                warnings.append(f'Dropped {dropped} rows with missing data')

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

    def _standardize_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map MRI column names to standard names."""
        mappings = {
            'period': 'period',
            'ref num': 'reference_number',
            'ref': 'reference_number',
            'source': 'source',
            'account': 'account_code',
            'acct': 'account_code',
            'description': 'account_description',
            'desc': 'account_description',
            'debit': 'debit',
            'dr': 'debit',
            'credit': 'credit',
            'cr': 'credit',
            'date': 'transaction_date',
            'vendor': 'vendor_name',
            'tenant': 'tenant_name',
            'unit': 'unit_number',
        }

        df.columns = df.columns.astype(str).str.lower().str.strip()
        df = df.rename(columns=mappings)
        return df

    def _parse_mri_period(self, df: pd.DataFrame) -> pd.DataFrame:
        """Parse MRI period format (e.g., '2024-01' or '01/2024')."""
        df = df.copy()

        period = df['period'].astype(str)

        # Try YYYY-MM format
        match = period.str.extract(r'(\d{4})-(\d{2})')
        if match.notna().any().any():
            df['period_year'] = pd.to_numeric(match[0], errors='coerce')
            df['period_month'] = pd.to_numeric(match[1], errors='coerce')
        else:
            # Try MM/YYYY format
            match = period.str.extract(r'(\d{1,2})/(\d{4})')
            df['period_year'] = pd.to_numeric(match[1], errors='coerce')
            df['period_month'] = pd.to_numeric(match[0], errors='coerce')

        # Create transaction date from period
        df['transaction_date'] = pd.to_datetime(
            df['period_year'].astype(str) + '-' + df['period_month'].astype(str) + '-01',
            errors='coerce'
        )

        return df
```

---

## Definition of Done

- [x] Parses MRI format correctly
- [x] PERIOD column handled
- [x] DEBIT/CREDIT combined
- [x] Tests verify output

---

## Notes

MRI Software is another major property management system. The key difference from Yardi is that MRI uses separate DEBIT and CREDIT columns instead of signed amounts, and often includes PERIOD columns in YYYY-MM or MM/YYYY format instead of transaction dates.
