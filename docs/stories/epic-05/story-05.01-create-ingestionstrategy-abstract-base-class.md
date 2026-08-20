# Story 5.1: Create IngestionStrategy Abstract Base Class

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: `completed`
**Estimated Time**: 2 hours

---

## User Story

**As a** developer
**I want** a well-defined strategy interface for parsers
**So that** I can add new ERP parsers without modifying existing code

---

## Acceptance Criteria

- [ ] **AC1**: Abstract `IngestionStrategy` class defined with `parse()` method
- [ ] **AC2**: `parse()` returns validated DataFrame with standard columns
- [ ] **AC3**: Output schema validates column types and required fields
- [ ] **AC4**: Base class cannot be instantiated directly
- [ ] **AC5**: Subclasses must implement `parse()` and `can_handle()` methods

---

## Technical Specifications

### Files to Create

```
backend/app/
└── services/
    └── ingestion/
        ├── __init__.py
        ├── base.py
        └── schemas.py
```

### Implementation Details

**base.py**:
```python
"""
Ingestion Strategy Base Class

Defines the interface for all ERP data parsers using the Strategy Pattern.
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO, Optional

import pandas as pd
from pydantic import BaseModel, Field

from app.services.ingestion.schemas import GLEntryRow, ParseResult


class IngestionMetadata(BaseModel):
    """Metadata about a parsed file."""
    source_system: str = Field(..., description="Detected source system (yardi, mri, generic)")
    file_name: str
    row_count: int
    error_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class IngestionStrategy(ABC):
    """
    Abstract base class for ERP data parsers.

    Each ERP system (Yardi, MRI, etc.) has its own export format.
    Subclasses implement the specific parsing logic for each format.

    The Strategy Pattern allows adding new parsers without modifying
    existing code - just create a new subclass.
    """

    @property
    @abstractmethod
    def source_system(self) -> str:
        """Return the name of this source system (e.g., 'yardi', 'mri')."""
        pass

    @abstractmethod
    def can_handle(self, file_header: bytes, file_name: str) -> float:
        """
        Determine if this parser can handle the given file.

        Args:
            file_header: First 4KB of file content
            file_name: Original file name

        Returns:
            Confidence score 0.0-1.0, where 1.0 means definitely this format
        """
        pass

    @abstractmethod
    def parse(
        self,
        file: BinaryIO,
        file_name: str,
        property_id: str,
    ) -> ParseResult:
        """
        Parse the file and return normalized GL entries.

        Args:
            file: File-like object to parse
            file_name: Original file name
            property_id: UUID of the property this data belongs to

        Returns:
            ParseResult with DataFrame of normalized entries and metadata
        """
        pass

    def _validate_output(self, df: pd.DataFrame) -> list[str]:
        """
        Validate the output DataFrame matches expected schema.

        Returns list of validation errors (empty if valid).
        """
        errors = []

        # Required columns
        required_cols = [
            'account_code', 'account_description', 'amount',
            'transaction_date', 'period_year', 'period_month'
        ]

        for col in required_cols:
            if col not in df.columns:
                errors.append(f"Missing required column: {col}")

        # Type validations
        if 'amount' in df.columns:
            if not pd.api.types.is_numeric_dtype(df['amount']):
                errors.append("Column 'amount' must be numeric")

        if 'transaction_date' in df.columns:
            if not pd.api.types.is_datetime64_any_dtype(df['transaction_date']):
                errors.append("Column 'transaction_date' must be datetime")

        return errors

    def _standardize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Ensure all required columns exist with correct types."""
        # Add missing optional columns with defaults
        if 'vendor_name' not in df.columns:
            df['vendor_name'] = None

        if 'description' not in df.columns:
            df['description'] = None

        # Ensure correct types
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        df['period_year'] = df['period_year'].astype(int)
        df['period_month'] = df['period_month'].astype(int)

        return df
```

**schemas.py**:
```python
"""
Data schemas for ingestion output.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

import pandas as pd
from pydantic import BaseModel, Field


class GLEntryRow(BaseModel):
    """Schema for a single GL entry row after parsing."""
    account_code: str = Field(..., max_length=50)
    account_description: str = Field(..., max_length=255)
    amount: Decimal = Field(..., description="Signed amount: + debit, - credit")
    transaction_date: date
    period_year: int = Field(..., ge=1990, le=2100)
    period_month: int = Field(..., ge=1, le=12)
    vendor_name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    raw_row_data: dict[str, Any] = Field(default_factory=dict)


class ParseResult(BaseModel):
    """Result of parsing an ingestion file."""
    success: bool
    source_system: str
    data: Any = Field(..., description="pandas.DataFrame - stored as object reference, not serialized")
    row_count: int
    error_count: int
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

    class Config:
        arbitrary_types_allowed = True  # Allow DataFrame storage
```

**Note**: The `data` field holds the pandas DataFrame. While Pydantic doesn't serialize DataFrames well, we use `arbitrary_types_allowed=True` to store the DataFrame reference. The DataFrame is used in-memory during the ingestion pipeline and is not persisted via this model.

---

## Definition of Done

- [ ] ABC defined with abstract methods
- [ ] Output validation implemented
- [ ] Cannot instantiate directly
- [ ] Test verifies interface

---

## Notes

This is the foundational story for the entire ingestion system. The Strategy Pattern allows us to add support for new ERP systems without modifying existing code - just create a new subclass implementing the interface.
