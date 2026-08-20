"""
Performance benchmarks for data ingestion.

Tests parsing speed, memory usage, and persistence performance
for real-world file sizes.

Run benchmarks with:
    pytest tests/benchmarks/ -v -m benchmark --tb=short

AC1: 5MB CSV parsed in < 5 seconds
AC2: Memory usage stays under 512MB
AC3: 10,000 rows persisted in < 10 seconds
AC4: Benchmark runs in CI
AC5: Performance regressions detected
"""

from __future__ import annotations

import io
import random
import time
import tracemalloc
from datetime import date
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pandas as pd
import pytest

from app.services.ingestion.cleaners import clean_currency_column
from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

if TYPE_CHECKING:
    pass


def generate_yardi_csv(rows: int) -> io.BytesIO:
    """Generate a synthetic Yardi GL CSV for testing.

    Creates realistic GL export data with:
    - Standard Yardi column headers
    - Various currency formats (parentheses, positives)
    - Account codes and descriptions
    - Dates spread across a year

    Args:
        rows: Number of data rows to generate

    Returns:
        BytesIO containing the CSV data
    """
    random.seed(42)  # Reproducible results

    # Yardi-style header
    lines = ["Account Code,Account Description,Amount,Date,Vendor Name\n"]

    accounts = [
        ("5000", "Utilities - Electric"),
        ("5010", "Utilities - Gas"),
        ("5020", "Utilities - Water"),
        ("5100", "Janitorial Services"),
        ("5110", "Janitorial Supplies"),
        ("5200", "Repairs & Maintenance"),
        ("5210", "HVAC Maintenance"),
        ("5300", "Landscaping"),
        ("5400", "Security Services"),
        ("5500", "Insurance"),
        ("6000", "Property Taxes"),
        ("6100", "Management Fees"),
    ]

    vendors = [
        "City Power Corp",
        "Natural Gas Co",
        "Metro Water District",
        "Clean Sweep Janitorial",
        "ABC Maintenance",
        "HVAC Solutions LLC",
        "Green Lawn Services",
        "SecureWatch Inc",
        "AllState Insurance",
        "County Tax Office",
        "Property Management Inc",
    ]

    for i in range(rows):
        account_code, account_desc = random.choice(accounts)
        amount = random.uniform(100, 25000)

        # Vary currency format
        if random.random() > 0.5:
            amount_str = f"({amount:.2f})"
        else:
            amount_str = f"{amount:.2f}"

        # Date in 2024
        month = (i % 12) + 1
        day = (i % 28) + 1
        date_str = f"{month:02d}/{day:02d}/2024"

        vendor = random.choice(vendors)

        lines.append(
            f"{account_code},{account_desc},{amount_str},{date_str},{vendor}\n"
        )

    content = "".join(lines).encode("utf-8")
    return io.BytesIO(content)


def generate_large_dataframe(rows: int) -> pd.DataFrame:
    """Generate a DataFrame for persistence testing.

    Args:
        rows: Number of rows to generate

    Returns:
        DataFrame ready for GL entry persistence
    """
    random.seed(42)

    data = {
        "account_code": [f"{5000 + i % 100}" for i in range(rows)],
        "account_description": [f"Test Expense {i}" for i in range(rows)],
        "amount": [random.uniform(-10000, 10000) for _ in range(rows)],
        "transaction_date": [
            date(2024, (i % 12) + 1, (i % 28) + 1) for i in range(rows)
        ],
        "period_year": [2024 for _ in range(rows)],
        "period_month": [(i % 12) + 1 for i in range(rows)],
        "vendor_name": [f"Vendor {i % 50}" for i in range(rows)],
        "description": [f"Transaction {i}" for i in range(rows)],
        "raw_row_data": [{} for _ in range(rows)],
    }

    return pd.DataFrame(data)


class TestParsingPerformance:
    """Performance benchmarks for file parsing."""

    @pytest.mark.benchmark
    def test_parse_5mb_under_5_seconds(self) -> None:
        """AC1: 5MB CSV file should parse in under 5 seconds.

        A 5MB CSV is approximately 50,000 rows of GL data.
        This is a realistic upper bound for monthly GL exports.
        """
        # Generate approximately 5MB CSV (50k rows)
        csv_file = generate_yardi_csv(50000)
        file_size_mb = len(csv_file.getvalue()) / (1024 * 1024)

        parser = YardiVoyagerGLParser()

        start_time = time.perf_counter()
        result = parser.parse(csv_file, "benchmark.csv", str(uuid4()))
        elapsed = time.perf_counter() - start_time

        assert result.success, f"Parse failed: {result.errors}"
        assert result.row_count >= 40000, f"Expected 40k+ rows, got {result.row_count}"
        assert (
            elapsed < 5.0
        ), f"Parsing {file_size_mb:.1f}MB took {elapsed:.2f}s, expected < 5s"

    @pytest.mark.benchmark
    def test_memory_under_512mb(self) -> None:
        """AC2: Memory usage should stay under 512MB for large files.

        Ensures we're not loading entire files into memory multiple times.
        """
        csv_file = generate_yardi_csv(50000)

        tracemalloc.start()

        parser = YardiVoyagerGLParser()
        result = parser.parse(csv_file, "memory_test.csv", str(uuid4()))

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        peak_mb = peak / (1024 * 1024)

        assert result.success, f"Parse failed: {result.errors}"
        assert peak_mb < 512, f"Peak memory {peak_mb:.0f}MB exceeds 512MB limit"


class TestCleaningPerformance:
    """Performance benchmarks for data cleaning operations."""

    @pytest.mark.benchmark
    def test_currency_cleaning_vectorized_60k_values(self) -> None:
        """Verify vectorized currency cleaning is fast.

        60,000 values should clean in under 1 second.
        This ensures we're using vectorized operations, not row-by-row.
        """
        # Generate series with various currency formats
        values = [
            "(1234.56)",
            "$5,678.90",
            "100.00 CR",
            "200.00",
            "-300.00",
            "400.00-",
        ] * 10000  # 60k values

        series = pd.Series(values)

        start_time = time.perf_counter()
        result = clean_currency_column(series)
        elapsed = time.perf_counter() - start_time

        assert len(result) == 60000
        assert elapsed < 1.0, f"Cleaning took {elapsed:.2f}s, expected < 1s"

    @pytest.mark.benchmark
    def test_currency_cleaning_100k_values(self) -> None:
        """Stress test: 100k currency values should clean in under 2 seconds."""
        random.seed(42)
        values = []
        formats = [
            lambda x: f"({abs(x):.2f})",
            lambda x: f"${x:,.2f}",
            lambda x: f"{abs(x):.2f} CR" if x < 0 else f"{x:.2f}",
            lambda x: f"{x:.2f}",
            lambda x: f"{abs(x):.2f}-" if x < 0 else f"{x:.2f}",
        ]

        for i in range(100000):
            amount = random.uniform(-10000, 10000)
            fmt = random.choice(formats)
            values.append(fmt(amount))

        series = pd.Series(values)

        start_time = time.perf_counter()
        result = clean_currency_column(series)
        elapsed = time.perf_counter() - start_time

        assert len(result) == 100000
        assert result.notna().sum() >= 99000  # Most should parse
        assert elapsed < 2.0, f"Cleaning 100k values took {elapsed:.2f}s, expected < 2s"


class TestPersistencePerformance:
    """Performance benchmarks for database persistence."""

    @pytest.mark.benchmark
    def test_10k_rows_persistence_under_10_seconds(self) -> None:
        """AC3: 10,000 rows should persist in under 10 seconds.

        Uses mocked database to test the preparation and chunking logic.
        Actual DB performance varies by infrastructure.
        """

        df = generate_large_dataframe(10000)
        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Mock the database client (synchronous Supabase client)
        mock_result = MagicMock()
        mock_result.data = [{}] * 500  # Each chunk returns 500 "inserted" rows

        mock_table = MagicMock()
        mock_table.insert.return_value.execute.return_value = mock_result

        mock_client = MagicMock()
        mock_client.table.return_value = mock_table

        with patch(
            "app.services.ingestion.persistence.get_supabase_admin",
            return_value=mock_client,
        ):
            from app.services.ingestion.persistence import persist_gl_entries

            start_time = time.perf_counter()
            # Synchronous call - no asyncio needed
            result = persist_gl_entries(df, batch_id, property_id, organization_id)
            elapsed = time.perf_counter() - start_time

        # Verify chunking occurred (10k rows / 500 chunk size = 20 chunks).
        # Assert on insert calls specifically: persist_gl_entries also makes one
        # table("import_batches").select(...) batch-ownership check before inserting,
        # so total table() calls are 21. Only the 20 chunk inserts call .insert().
        assert mock_table.insert.call_count == 20
        # persist_gl_entries returns (row_count, GLValidationResult) when validate=True (default)
        row_count = result[0] if isinstance(result, tuple) else result
        assert row_count == 10000  # 20 chunks * 500 mock rows
        assert (
            elapsed < 10.0
        ), f"Persistence prep for 10k rows took {elapsed:.2f}s, expected < 10s"

    @pytest.mark.benchmark
    def test_dataframe_preparation_5k_rows(self) -> None:
        """Test DataFrame to records conversion is fast.

        The conversion and type handling should be efficient.
        """

        df = generate_large_dataframe(5000)
        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Measure just the data preparation (no DB calls)
        mock_result = MagicMock()
        mock_result.data = [{}] * 500

        mock_table = MagicMock()
        mock_table.insert.return_value.execute.return_value = mock_result

        mock_client = MagicMock()
        mock_client.table.return_value = mock_table

        with patch(
            "app.services.ingestion.persistence.get_supabase_admin",
            return_value=mock_client,
        ):
            from app.services.ingestion.persistence import persist_gl_entries

            start_time = time.perf_counter()
            # Synchronous call - no asyncio needed
            persist_gl_entries(df, batch_id, property_id, organization_id)
            elapsed = time.perf_counter() - start_time

        assert elapsed < 5.0, f"5k row prep took {elapsed:.2f}s, expected < 5s"


class TestScalabilityBenchmarks:
    """Test scaling behavior for large datasets."""

    @pytest.mark.benchmark
    def test_100k_row_parsing(self) -> None:
        """Integration test: Parse 100k rows (approximately 10MB).

        This is a stress test to ensure the parser handles very large files.
        Target: under 15 seconds.
        """
        csv_file = generate_yardi_csv(100000)
        file_size_mb = len(csv_file.getvalue()) / (1024 * 1024)

        parser = YardiVoyagerGLParser()

        start_time = time.perf_counter()
        result = parser.parse(csv_file, "large.csv", str(uuid4()))
        elapsed = time.perf_counter() - start_time

        rows_per_second = result.row_count / elapsed if elapsed > 0 else 0

        assert result.success, f"Parse failed: {result.errors}"
        assert result.row_count >= 90000, f"Expected 90k+ rows, got {result.row_count}"
        assert elapsed < 15.0, (
            f"Parsing {file_size_mb:.1f}MB ({result.row_count} rows) "
            f"took {elapsed:.2f}s, expected < 15s"
        )

        # Log performance metrics for CI tracking
        print("\n--- Performance Metrics ---")
        print(f"File size: {file_size_mb:.1f}MB")
        print(f"Row count: {result.row_count:,}")
        print(f"Parse time: {elapsed:.2f}s")
        print(f"Throughput: {rows_per_second:,.0f} rows/second")
        print("---------------------------")

    @pytest.mark.benchmark
    def test_linear_scaling(self) -> None:
        """Verify parsing time scales roughly linearly with file size.

        Parse multiple sizes and ensure no exponential slowdown.
        """
        sizes = [1000, 5000, 10000]
        times: list[float] = []

        parser = YardiVoyagerGLParser()

        for size in sizes:
            csv_file = generate_yardi_csv(size)

            start_time = time.perf_counter()
            result = parser.parse(csv_file, f"scale_{size}.csv", str(uuid4()))
            elapsed = time.perf_counter() - start_time

            assert result.success
            times.append(elapsed)

        # Check that 10k doesn't take more than 3x the time of 5k
        # (accounting for some overhead)
        time_5k = times[1]
        time_10k = times[2]

        if time_5k > 0.01:  # Only check if times are meaningful
            ratio = time_10k / time_5k
            assert ratio < 3.0, (
                f"Scaling issue: 10k rows took {time_10k:.2f}s vs "
                f"5k at {time_5k:.2f}s (ratio: {ratio:.1f}x)"
            )


# Standalone benchmark function for CI output
@pytest.mark.benchmark
def test_benchmark_summary() -> None:
    """Generate a summary of key performance metrics.

    This test runs core benchmarks and outputs metrics for CI tracking.
    AC4: Benchmark runs in CI
    AC5: Performance regressions detected (via CI metric comparison)
    """
    metrics: dict[str, float] = {}

    # 1. Parse speed
    csv_file = generate_yardi_csv(50000)
    parser = YardiVoyagerGLParser()
    start = time.perf_counter()
    result = parser.parse(csv_file, "summary.csv", str(uuid4()))
    metrics["parse_50k_seconds"] = time.perf_counter() - start
    metrics["parse_50k_rows"] = float(result.row_count)

    # 2. Currency cleaning
    values = ["(1234.56)", "$5,678.90", "100.00 CR"] * 20000
    series = pd.Series(values)
    start = time.perf_counter()
    clean_currency_column(series)
    metrics["clean_60k_seconds"] = time.perf_counter() - start

    # 3. Memory for 50k parse
    csv_file = generate_yardi_csv(50000)
    tracemalloc.start()
    parser.parse(csv_file, "mem.csv", str(uuid4()))
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    metrics["memory_peak_mb"] = peak / (1024 * 1024)

    # Output for CI
    print("\n========== BENCHMARK SUMMARY ==========")
    print(f"Parse 50k rows: {metrics['parse_50k_seconds']:.2f}s")
    print(f"Clean 60k currencies: {metrics['clean_60k_seconds']:.3f}s")
    print(f"Peak memory: {metrics['memory_peak_mb']:.0f}MB")
    print("========================================")

    # Assert thresholds (AC5: detect regressions)
    assert metrics["parse_50k_seconds"] < 5.0, "REGRESSION: Parse speed"
    assert metrics["clean_60k_seconds"] < 1.0, "REGRESSION: Cleaning speed"
    assert metrics["memory_peak_mb"] < 512, "REGRESSION: Memory usage"
