# Story 5.7: Create YardiVoyagerGLParser

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 4 hours

---

## User Story

**As a** user importing Yardi exports
**I want** my Yardi Voyager GL exports parsed correctly
**So that** I don't have to manually clean the data

---

## Acceptance Criteria

- [x] **AC1**: Parses standard Yardi Voyager GL Detail export
- [x] **AC2**: Handles merged property/building rows
- [x] **AC3**: Extracts account code and description
- [x] **AC4**: Parses amounts (including negatives in parens)
- [x] **AC5**: Extracts transaction date and period

---

## Technical Specifications

### Files to Create

```
backend/app/services/ingestion/parsers/
├── __init__.py
└── yardi.py
```

### Implementation Details

**yardi.py**:
```python
"""
Yardi Voyager GL Parser

Parses GL Detail exports from Yardi Voyager property management software.
"""
import re
from typing import BinaryIO

import pandas as pd

from app.services.ingestion.base import IngestionStrategy, ParseResult
from app.services.ingestion.cleaners import (
    clean_currency_column,
    clean_date_column,
    extract_period_from_date,
    handle_merged_cells_pattern,
    filter_garbage_rows,
    detect_header_row,
)


class YardiVoyagerGLParser(IngestionStrategy):
    """
    Parser for Yardi Voyager GL Detail exports.

    Expected format:
    - CSV or Excel export
    - May have report header rows before data
    - Property/Building names in merged cells
    - Account Code, Description, Date, Amount columns
    - Amounts may use (parentheses) for negatives
    """

    @property
    def source_system(self) -> str:
        return 'yardi'

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """Check if this looks like a Yardi export."""
        text = file_header.decode('utf-8', errors='ignore').upper()

        score = 0.0

        # Strong indicators
        if 'YARDI' in text:
            score += 0.5
        if 'VOYAGER' in text:
            score += 0.3

        # Moderate indicators
        if 'GL DETAIL' in text:
            score += 0.2
        if 'PROPERTY' in text and 'ACCOUNT' in text:
            score += 0.2

        # Weak indicators
        if file_name.lower().startswith('gl'):
            score += 0.1

        return min(score, 1.0)

    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """Parse Yardi Voyager GL export."""
        errors = []
        warnings = []

        try:
            # Read file based on extension
            if file_name.lower().endswith('.xlsx') or file_name.lower().endswith('.xls'):
                df = pd.read_excel(file, header=None)
            else:
                # CSV - detect encoding and delimiter
                df = pd.read_csv(file, header=None, encoding='utf-8', on_bad_lines='skip')

            if df.empty:
                return ParseResult(
                    success=False,
                    source_system=self.source_system,
                    row_count=0,
                    error_count=1,
                    errors=['File is empty or could not be parsed'],
                )

            # Detect header row
            expected_headers = ['account', 'description', 'amount', 'date']
            header_row = detect_header_row(df, expected_headers)

            if header_row > 0:
                # Use detected row as headers
                df.columns = df.iloc[header_row]
                df = df.iloc[header_row + 1:].reset_index(drop=True)

            # Standardize column names
            df = self._standardize_columns_names(df)

            # Handle merged cells for property context
            df = handle_merged_cells_pattern(df, {
                'group_columns': ['property_name', 'building_name'],
                'data_indicator': 'account_code',
                'skip_patterns': ['Total', 'Subtotal', '---'],
            })

            # Filter garbage rows
            df = filter_garbage_rows(df)

            # Clean data columns
            df['amount'] = clean_currency_column(df['amount'])
            df['transaction_date'] = clean_date_column(df['transaction_date'])
            df['period_year'], df['period_month'] = extract_period_from_date(df['transaction_date'])

            # Clean account codes
            df['account_code'] = df['account_code'].astype(str).str.strip()

            # Add property_id
            df['property_id'] = property_id

            # Preserve raw data
            df['raw_row_data'] = df.apply(
                lambda row: row.to_dict(),
                axis=1
            )

            # Validate output
            validation_errors = self._validate_output(df)
            if validation_errors:
                errors.extend(validation_errors)

            # Filter out rows with missing required data
            initial_count = len(df)
            df = df.dropna(subset=['account_code', 'amount', 'transaction_date'])
            dropped = initial_count - len(df)

            if dropped > 0:
                warnings.append(f'Dropped {dropped} rows with missing required fields')

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

    def _standardize_columns_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map various column names to standard names."""
        column_mappings = {
            # Account code variations
            'account code': 'account_code',
            'account': 'account_code',
            'acct': 'account_code',
            'acct code': 'account_code',
            'gl account': 'account_code',

            # Description variations
            'account description': 'account_description',
            'description': 'account_description',
            'desc': 'account_description',
            'acct desc': 'account_description',

            # Amount variations
            'amount': 'amount',
            'net amount': 'amount',
            'total': 'amount',

            # Date variations
            'date': 'transaction_date',
            'transaction date': 'transaction_date',
            'trans date': 'transaction_date',
            'posting date': 'transaction_date',
            'journal date': 'transaction_date',

            # Vendor
            'vendor': 'vendor_name',
            'vendor name': 'vendor_name',
            'payee': 'vendor_name',

            # Property context
            'property': 'property_name',
            'property name': 'property_name',
            'building': 'building_name',
            'building name': 'building_name',
        }

        # Lowercase all column names
        df.columns = df.columns.astype(str).str.lower().str.strip()

        # Apply mappings
        df = df.rename(columns=column_mappings)

        return df
```

---

## Definition of Done

- [ ] Parses fixture file correctly
- [ ] All fields extracted
- [ ] Merged cells handled
- [ ] Tests verify specific values

---

## Notes

Yardi Voyager is one of the most popular property management systems. The parser handles Yardi's specific quirks including merged cells for property grouping, various column naming conventions, and parenthetical negatives for amounts.
