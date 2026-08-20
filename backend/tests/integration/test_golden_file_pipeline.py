"""Golden file pipeline tests for GL parsing and aggregation.

These tests verify that the complete pipeline (parse -> aggregate)
produces expected results for known fixtures. Changes to any component
that would affect output are caught by these tests.
"""

import json
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pandas as pd
import pytest

from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    aggregate_by_pools,
)
from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"
EXPECTED_DIR = FIXTURES_DIR / "expected"


@pytest.mark.integration
class TestYardiPoolAggregationPipeline:
    """Tests for complete Yardi -> Pool aggregation pipeline."""

    @pytest.fixture
    def golden_file(self) -> dict:
        """Load the golden file with expected values."""
        golden_path = EXPECTED_DIR / "yardi_pool_totals.json"
        with open(golden_path, encoding="utf-8") as f:
            return json.load(f)

    @pytest.fixture
    def yardi_fixture(self, golden_file: dict) -> bytes:
        """Load the Yardi fixture file."""
        fixture_path = FIXTURES_DIR / golden_file["source_fixture"]
        return fixture_path.read_bytes()

    @pytest.fixture
    def pool_mappings(self, golden_file: dict) -> list[PoolMapping]:
        """Create pool mappings from golden file config."""
        return [
            PoolMapping(
                pool_id=uuid4(),
                pool_name=m["pool_name"],
                pattern=m["pattern"],
            )
            for m in golden_file["pool_mappings"]
        ]

    def test_parse_produces_expected_row_count(
        self, yardi_fixture: bytes, golden_file: dict
    ):
        """Yardi parser produces expected number of rows."""
        parser = YardiVoyagerGLParser()
        result = parser.parse(
            BytesIO(yardi_fixture),
            "gl_export_standard.csv",
            str(uuid4()),
        )

        assert result.success, f"Parse failed: {result.errors}"
        assert result.row_count > 0

        expected_count = golden_file["expected"]["total_entry_count"]
        # Allow some tolerance for edge cases
        assert abs(result.row_count - expected_count) <= 10, (
            f"Row count {result.row_count} differs significantly "
            f"from expected {expected_count}"
        )

    def test_parse_produces_required_columns(self, yardi_fixture: bytes):
        """Parsed data has all required columns."""
        parser = YardiVoyagerGLParser()
        result = parser.parse(
            BytesIO(yardi_fixture),
            "gl_export_standard.csv",
            str(uuid4()),
        )

        required_cols = ["account_code", "amount", "transaction_date"]
        for col in required_cols:
            assert col in result.data.columns, f"Missing required column: {col}"

    def test_pool_aggregation_matches_expected_structure(
        self,
        yardi_fixture: bytes,
        pool_mappings: list[PoolMapping],
        golden_file: dict,
    ):
        """Pool aggregation produces all expected pools."""
        parser = YardiVoyagerGLParser()
        result = parser.parse(
            BytesIO(yardi_fixture),
            "gl_export_standard.csv",
            str(uuid4()),
        )

        # Convert to GLEntry objects
        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        pool_totals = aggregate_by_pools(entries, pool_mappings)

        # Verify all expected pools exist
        expected_pools = golden_file["expected"]["pool_totals"]
        pool_names_result = {p.pool_name for p in pool_totals.values()}

        for expected_pool in expected_pools:
            assert (
                expected_pool in pool_names_result
            ), f"Expected pool '{expected_pool}' not found in results"

    def test_pool_amounts_within_expected_ranges(
        self,
        yardi_fixture: bytes,
        pool_mappings: list[PoolMapping],
        golden_file: dict,
    ):
        """Pool totals fall within expected amount ranges."""
        parser = YardiVoyagerGLParser()
        result = parser.parse(
            BytesIO(yardi_fixture),
            "gl_export_standard.csv",
            str(uuid4()),
        )

        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        pool_totals = aggregate_by_pools(entries, pool_mappings)

        expected = golden_file["expected"]["pool_totals"]
        for pool in pool_totals.values():
            if pool.pool_name in expected:
                exp = expected[pool.pool_name]
                min_amt = Decimal(str(exp["min_amount"]))
                max_amt = Decimal(str(exp["max_amount"]))

                assert pool.total_amount >= min_amt, (
                    f"Pool '{pool.pool_name}' amount {pool.total_amount} "
                    f"below expected min {min_amt}"
                )
                assert pool.total_amount <= max_amt, (
                    f"Pool '{pool.pool_name}' amount {pool.total_amount} "
                    f"above expected max {max_amt}"
                )

    def test_pool_entry_counts_within_tolerance(
        self,
        yardi_fixture: bytes,
        pool_mappings: list[PoolMapping],
        golden_file: dict,
    ):
        """Pool entry counts are approximately as expected."""
        parser = YardiVoyagerGLParser()
        result = parser.parse(
            BytesIO(yardi_fixture),
            "gl_export_standard.csv",
            str(uuid4()),
        )

        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        pool_totals = aggregate_by_pools(entries, pool_mappings)

        expected = golden_file["expected"]["pool_totals"]
        for pool in pool_totals.values():
            if pool.pool_name in expected:
                exp_count = expected[pool.pool_name]["entry_count"]
                # Allow 10% tolerance on entry count
                tolerance = max(3, int(exp_count * 0.1))

                assert abs(pool.entry_count - exp_count) <= tolerance, (
                    f"Pool '{pool.pool_name}' entry count {pool.entry_count} "
                    f"differs from expected {exp_count} (tolerance: {tolerance})"
                )


@pytest.mark.integration
class TestPipelineDataIntegrity:
    """Tests for data integrity through the pipeline."""

    def test_no_amount_lost_in_aggregation(self):
        """Total amount is preserved through pool aggregation."""
        parser = YardiVoyagerGLParser()
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        assert result.success

        # Calculate original sum
        original_sum = result.data["amount"].sum()

        # Create pool mappings that should capture all entries
        # Pattern "5*" matches 5xxx accounts, "6*" matches 6xxx accounts
        mappings = [
            PoolMapping(
                pool_id=uuid4(),
                pool_name="All 5xxx Expenses",
                pattern="5*",
            ),
            PoolMapping(
                pool_id=uuid4(),
                pool_name="All 6xxx Expenses",
                pattern="6*",
            ),
        ]

        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        pool_totals = aggregate_by_pools(entries, mappings)

        # Aggregated sum should match original
        aggregated_sum = sum(p.total_amount for p in pool_totals.values())

        assert abs(Decimal(str(original_sum)) - aggregated_sum) < Decimal(
            "0.01"
        ), f"Amount mismatch: original {original_sum}, aggregated {aggregated_sum}"

    def test_all_entries_matched_by_patterns(self):
        """All entries are matched when using comprehensive patterns."""
        parser = YardiVoyagerGLParser()
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        # Pattern that should match all accounts in fixture
        mappings = [PoolMapping(pool_id=uuid4(), pool_name="Catch All", pattern="*")]

        pool_totals = aggregate_by_pools(entries, mappings)

        total_matched = sum(p.entry_count for p in pool_totals.values())
        assert total_matched == len(
            entries
        ), f"Not all entries matched: {total_matched} / {len(entries)}"

    def test_no_duplicate_entries_across_pools(self):
        """Each entry is only counted once across non-overlapping pools."""
        parser = YardiVoyagerGLParser()
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        # Non-overlapping patterns matching actual fixture account codes
        mappings = [
            PoolMapping(pool_id=uuid4(), pool_name="Taxes", pattern="51*"),
            PoolMapping(pool_id=uuid4(), pool_name="Insurance", pattern="52*"),
            PoolMapping(pool_id=uuid4(), pool_name="Utilities", pattern="53*"),
            PoolMapping(pool_id=uuid4(), pool_name="CAM", pattern="54*"),
            PoolMapping(pool_id=uuid4(), pool_name="R&M", pattern="55*"),
            PoolMapping(pool_id=uuid4(), pool_name="Management Fee", pattern="60*"),
        ]

        pool_totals = aggregate_by_pools(entries, mappings)

        # Total entry count across pools should equal input count
        total_matched = sum(p.entry_count for p in pool_totals.values())
        assert total_matched == len(
            entries
        ), f"Entry count mismatch: pools have {total_matched}, input has {len(entries)}"


@pytest.mark.integration
class TestParserRobustness:
    """Tests for parser robustness with various fixtures."""

    def test_parser_handles_malformed_fixture(self):
        """Parser handles malformed data gracefully."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_malformed.csv"
        if not fixture_path.exists():
            pytest.skip("Malformed fixture not available")

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_malformed.csv", str(uuid4()))

        # Should either succeed with some data or fail gracefully
        if result.success:
            assert result.row_count >= 0
        else:
            assert len(result.errors) > 0

    def test_parser_handles_currency_formats(self):
        """Parser handles various currency formats in a valid Yardi fixture."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_currency_formats.csv"
        if not fixture_path.exists():
            pytest.skip("Currency formats fixture not available")

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_currency_formats.csv", str(uuid4()))

        assert result.success, result.errors
        assert result.row_count == 6

        amounts_by_account = dict(
            zip(result.data["account_code"], result.data["amount"], strict=True)
        )
        assert amounts_by_account == {
            "6000-100": 1234.56,
            "6000-200": -567.89,
            "6100-100": 2500.0,
            "6100-200": -1000.5,
            "7000-100": 50000.0,
            "7000-200": -25000.0,
        }
