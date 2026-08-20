# Story 5.10: Create MRI Parser Tests

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Not Started
**Estimated Time**: 3 hours

---

## User Story

**As a** developer
**I want** comprehensive tests for the MRI parser
**So that** I'm confident it handles MRI exports correctly

---

## Acceptance Criteria

- [ ] **AC1**: Tests use real MRI fixture file
- [ ] **AC2**: Tests verify specific expected values
- [ ] **AC3**: Tests cover period parsing formats
- [ ] **AC4**: Tests cover debit/credit combination
- [ ] **AC5**: 95%+ coverage

---

## Technical Specifications

### Files to Create

```
backend/tests/
├── fixtures/
│   └── mri_rentroll_sample.csv
└── test_mri_parser.py
```

### Implementation Details

**test_mri_parser.py**:
```python
"""
Tests for MRI Rent Roll Parser
"""
import pytest
from io import BytesIO
from pathlib import Path

from app.services.ingestion.parsers.mri import MRIRentRollParser


@pytest.fixture
def parser():
    return MRIRentRollParser()


class TestMRIParser:
    """Test MRI parser functionality."""

    def test_can_handle_mri_file(self, parser):
        """Parser should identify MRI format."""
        header = b'PERIOD,REF NUM,SOURCE,ACCOUNT,DEBIT,CREDIT'
        confidence = parser.can_handle(header, 'rentroll.csv')
        assert confidence >= 0.5

    def test_parse_combines_debit_credit(self, parser):
        """Parser should combine debit/credit into signed amount."""
        csv = b'''PERIOD,ACCOUNT,DESCRIPTION,DEBIT,CREDIT
2024-01,5000,Expense,100.00,
2024-01,4000,Income,,200.00
'''
        file = BytesIO(csv)
        result = parser.parse(file, 'test.csv', 'prop-123')

        assert result.success
        assert result.row_count == 2

    def test_parse_period_yyyy_mm(self, parser):
        """Parser should handle YYYY-MM period format."""
        csv = b'''PERIOD,ACCOUNT,DESCRIPTION,DEBIT,CREDIT
2024-03,5000,Test,100.00,
'''
        file = BytesIO(csv)
        result = parser.parse(file, 'test.csv', 'prop-123')

        assert result.success

    def test_parse_period_mm_yyyy(self, parser):
        """Parser should handle MM/YYYY period format."""
        csv = b'''PERIOD,ACCOUNT,DESCRIPTION,DEBIT,CREDIT
03/2024,5000,Test,100.00,
'''
        file = BytesIO(csv)
        result = parser.parse(file, 'test.csv', 'prop-123')

        assert result.success
```

---

## Definition of Done

- [ ] Fixture created
- [ ] Tests pass
- [ ] Edge cases covered
- [ ] 95%+ coverage

---

## Notes

The MRI parser tests focus on the unique aspects of MRI format: separate DEBIT/CREDIT columns and various PERIOD formats. Tests verify that these are correctly combined and parsed into the standard format.
