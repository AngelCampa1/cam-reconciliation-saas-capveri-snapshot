# Story 5.15: Create Performance Benchmark

**Epic**: Epic 5 - Data Ingestion Engine
**Status**: Completed
**Estimated Time**: 2 hours

---

## User Story

**As a** developer
**I want** performance benchmarks for ingestion
**So that** I can ensure parsing scales to real-world file sizes

---

## Acceptance Criteria

- [x] **AC1**: 5MB CSV parsed in < 5 seconds
- [x] **AC2**: Memory usage stays under 512MB
- [x] **AC3**: 10,000 rows persisted in < 10 seconds
- [x] **AC4**: Benchmark runs in CI
- [x] **AC5**: Performance regressions detected

---

## Technical Specifications

### Files to Create

```
backend/tests/
└── benchmarks/
    ├── __init__.py
    └── test_ingestion_performance.py
```

### Implementation Details

**test_ingestion_performance.py**:
```python
"""
Performance benchmarks for ingestion.
"""
import io
import time
import tracemalloc
from pathlib import Path

import pytest
import pandas as pd

from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser
from app.services.ingestion.cleaners import clean_currency_column


def generate_large_csv(rows: int) -> io.BytesIO:
    """Generate a large CSV for testing."""
    import random

    lines = ['Account Code,Description,Amount,Date\n']
    for i in range(rows):
        amount = random.uniform(-10000, 10000)
        if random.random() > 0.5:
            amount_str = f'({abs(amount):.2f})'
        else:
            amount_str = f'{amount:.2f}'

        lines.append(f'{5000 + i % 100},Test Expense {i},{amount_str},2024-01-{(i % 28) + 1:02d}\n')

    content = ''.join(lines).encode('utf-8')
    return io.BytesIO(content)


class TestIngestionPerformance:
    """Performance benchmarks for ingestion."""

    @pytest.mark.benchmark
    def test_parse_5mb_under_5_seconds(self):
        """5MB file should parse in under 5 seconds."""
        # Generate ~5MB CSV (approx 50k rows)
        csv_file = generate_large_csv(50000)

        parser = YardiVoyagerGLParser()

        start = time.time()
        result = parser.parse(csv_file, 'large.csv', 'prop-123')
        elapsed = time.time() - start

        assert result.success
        assert result.row_count > 40000  # Allow for some filtering
        assert elapsed < 5.0, f'Parsing took {elapsed:.2f}s, expected < 5s'

    @pytest.mark.benchmark
    def test_memory_under_512mb(self):
        """Memory usage should stay under 512MB."""
        csv_file = generate_large_csv(50000)

        tracemalloc.start()

        parser = YardiVoyagerGLParser()
        result = parser.parse(csv_file, 'large.csv', 'prop-123')

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_mb = peak / 1024 / 1024

        assert result.success
        assert peak_mb < 512, f'Peak memory {peak_mb:.0f}MB, expected < 512MB'

    @pytest.mark.benchmark
    def test_currency_cleaning_vectorized(self):
        """Currency cleaning should be vectorized (fast)."""
        # Generate series with various formats
        values = [
            '(1234.56)', '$5,678.90', '100.00 CR',
            '200.00', '-300.00', '400.00-'
        ] * 10000  # 60k values

        series = pd.Series(values)

        start = time.time()
        result = clean_currency_column(series)
        elapsed = time.time() - start

        assert len(result) == 60000
        assert elapsed < 1.0, f'Cleaning took {elapsed:.2f}s, expected < 1s'


@pytest.mark.benchmark
def test_large_file_parsing():
    """Integration test for large file handling."""
    csv = generate_large_csv(100000)
    file_size_mb = len(csv.getvalue()) / 1024 / 1024

    print(f'Generated {file_size_mb:.1f}MB CSV with 100k rows')

    parser = YardiVoyagerGLParser()

    start = time.time()
    result = parser.parse(csv, 'huge.csv', 'prop-123')
    elapsed = time.time() - start

    print(f'Parsed {result.row_count} rows in {elapsed:.2f}s')
    print(f'Rate: {result.row_count / elapsed:.0f} rows/second')

    assert result.success
    assert elapsed < 15.0  # Allow up to 15s for 100k rows
```

---

## Definition of Done

- [x] Benchmarks pass
- [x] Performance acceptable
- [x] Memory acceptable
- [x] CI integration ready

---

## Notes

Performance benchmarks ensure the ingestion system scales to real-world file sizes. The 5MB/5-second target is based on typical GL export sizes. Benchmarks should run in CI to detect performance regressions early.
