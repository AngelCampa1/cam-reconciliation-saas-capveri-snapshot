"""Pipeline contract tests for GL data flow.

These tests verify contracts between pipeline components:
1. Parser output matches aggregator input expectations
2. Aggregator output matches persistence expectations
3. Total amounts are preserved through transformations

Integration tests run without a database, using mocks where needed.
E2E tests use a real database connection.
"""

from decimal import Decimal
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
from app.services.ingestion.quality_checks import run_all_quality_checks
from app.services.ingestion.validation import validate_gl_dataframe

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.mark.integration
class TestParserToAggregatorContract:
    """Tests verifying parser output matches aggregator input contract."""

    def test_parser_output_has_required_columns_for_aggregation(self):
        """Parser output contains columns needed for pool aggregation."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        assert result.success

        # Aggregator requires: account_code, amount
        assert "account_code" in result.data.columns
        assert "amount" in result.data.columns

        # Account codes should be strings
        assert pd.api.types.is_string_dtype(result.data["account_code"].dtype)

        # Amounts should be numeric
        assert pd.api.types.is_numeric_dtype(result.data["amount"])

    def test_parser_output_can_create_gl_entries(self):
        """Parser output can be converted to GLEntry objects."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        # Should be able to convert all valid rows to GLEntry
        entries = []
        conversion_errors = []

        for idx, row in result.data.iterrows():
            try:
                if pd.notna(row.get("amount")):
                    entry = GLEntry(
                        id=uuid4(),
                        account_code=str(row["account_code"]),
                        amount=Decimal(str(row["amount"])),
                    )
                    entries.append(entry)
            except Exception as e:
                conversion_errors.append(f"Row {idx}: {e}")

        # All rows with amounts should convert successfully
        assert len(conversion_errors) == 0, f"Conversion errors: {conversion_errors}"
        assert len(entries) > 0


@pytest.mark.integration
class TestParserToValidationContract:
    """Tests verifying parser output matches validation input contract."""

    def test_parser_output_has_required_columns_for_validation(self):
        """Parser output contains columns needed for validation."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        assert result.success

        # Validation requires: account_code, amount, transaction_date
        required = ["account_code", "amount", "transaction_date"]
        for col in required:
            assert col in result.data.columns, f"Missing {col}"

    def test_parser_output_can_pass_validation(self):
        """Parser output can be validated without errors."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        valid_df, validation_result = validate_gl_dataframe(result.data)

        # Should have valid rows (most should pass)
        assert validation_result.valid_count > 0

        # Invalid rate should be low for standard fixture
        invalid_rate = validation_result.invalid_count / (
            validation_result.valid_count + validation_result.invalid_count
        )
        assert invalid_rate < 0.1, f"High invalid rate: {invalid_rate:.2%}"


@pytest.mark.integration
class TestParserToQualityCheckContract:
    """Tests verifying parser output matches quality check input contract."""

    def test_parser_result_can_run_quality_checks(self):
        """Parser result is compatible with quality check system."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        # Should be able to run quality checks on parser result
        quality = run_all_quality_checks(result)

        # Standard fixture should pass quality checks
        assert quality.passed, f"Quality check failed: {quality.issues}"
        assert quality.score >= 80, f"Low quality score: {quality.score}"


@pytest.mark.integration
class TestAmountPreservationContract:
    """Tests verifying amounts are preserved through the pipeline."""

    def test_amount_sum_preserved_parser_to_aggregation(self):
        """Total amount is preserved from parser to pool aggregation."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        # Original sum from parser
        original_sum = result.data["amount"].sum()

        # Convert to GLEntry
        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        # Aggregate with catch-all pattern
        mappings = [PoolMapping(pool_id=uuid4(), pool_name="All", pattern="*")]
        pool_totals = aggregate_by_pools(entries, mappings)

        # Aggregated sum
        aggregated_sum = sum(p.total_amount for p in pool_totals.values())

        # Verify preservation (allowing for floating point conversion)
        diff = abs(Decimal(str(original_sum)) - aggregated_sum)
        assert diff < Decimal("0.01"), f"Amount loss: {diff}"

    def test_amount_sum_preserved_parser_to_validation(self):
        """Total amount is preserved from parser to validation."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        original_sum = result.data["amount"].sum()

        valid_df, validation_result = validate_gl_dataframe(result.data)

        validated_sum = valid_df["amount"].sum()

        # For standard fixture, most should be valid, so sums should be close
        # (allowing for filtered invalid rows)
        ratio = validated_sum / original_sum if original_sum != 0 else 0

        # At least 90% of amount should survive validation
        assert ratio >= 0.9, f"Too much amount lost in validation: {ratio:.2%}"


@pytest.mark.integration
class TestEntryCountContract:
    """Tests verifying entry counts are tracked correctly."""

    def test_entry_count_matches_between_components(self):
        """Entry counts are consistent between parser and aggregator."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        # Convert to entries
        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        # Aggregate
        mappings = [PoolMapping(pool_id=uuid4(), pool_name="All", pattern="*")]
        pool_totals = aggregate_by_pools(entries, mappings)

        # Total entries matched should equal input
        total_matched = sum(p.entry_count for p in pool_totals.values())

        assert total_matched == len(entries), (
            f"Entry count mismatch: aggregator matched {total_matched}, "
            f"input had {len(entries)}"
        )


@pytest.mark.e2e
class TestFullPipelineE2E:
    """E2E tests for the complete GL pipeline."""

    def _create_property(self, real_supabase_client, org_id):
        """Helper to create a test property."""
        property_id = str(uuid4())
        property_data = {
            "id": property_id,
            "organization_id": str(org_id),
            "name": "Pipeline Test Property",
            "address_line1": "123 Pipeline St",
            "city": "Test City",
            "state": "CA",
            "postal_code": "90210",
            "total_rentable_sqft": 10000.00,
            "total_usable_sqft": 9000.00,
            "common_area_sqft": 1000.00,
        }
        real_supabase_client.table("properties").upsert(
            property_data, on_conflict="id"
        ).execute()
        return property_id

    def _create_import_batch(self, real_supabase_client, org_id, property_id):
        """Helper to create an import batch."""
        batch_id = str(uuid4())
        batch_data = {
            "id": batch_id,
            "organization_id": str(org_id),
            "property_id": property_id,
            "file_name": f"test_{batch_id[:8]}.csv",
            "file_hash": batch_id.replace("-", "") + "0" * 32,
            "source_system": "yardi",
            "status": "completed",
            "row_count": 0,
        }
        real_supabase_client.table("import_batches").upsert(
            batch_data, on_conflict="id"
        ).execute()
        return batch_id

    def test_parse_validate_persist_roundtrip(self, real_supabase_client, e2e_org_a):
        """Complete pipeline: Parse -> Validate -> Persist -> Retrieve."""
        from app.services.ingestion.persistence import (
            delete_batch_entries,
            get_batch_entries,
            persist_gl_entries,
        )

        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"
        org_id = e2e_org_a["id"]

        # Create property and import batch first
        property_id = self._create_property(real_supabase_client, org_id)
        batch_id = self._create_import_batch(real_supabase_client, org_id, property_id)

        # 1. Parse
        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            parse_result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        assert parse_result.success

        # 2. Validate
        valid_df, validation_result = validate_gl_dataframe(parse_result.data)
        assert validation_result.valid_count > 0

        try:
            # 3. Persist (with validation disabled since we already validated)
            rows_inserted = persist_gl_entries(
                valid_df,
                batch_id,
                property_id,
                org_id,
                validate=False,
            )

            assert rows_inserted == len(valid_df)

            # 4. Retrieve
            entries = get_batch_entries(batch_id, org_id)
            assert len(entries) == len(valid_df)

            # 5. Verify amounts preserved
            persisted_sum = sum(Decimal(str(e["amount"])) for e in entries)
            original_sum = Decimal(str(valid_df["amount"].sum()))

            diff = abs(persisted_sum - original_sum)
            assert diff < Decimal("0.01"), f"Amount diff after persist: {diff}"

        finally:
            delete_batch_entries(batch_id, org_id)
            # Cleanup property
            real_supabase_client.table("properties").delete().eq(
                "id", property_id
            ).execute()

    def test_parse_aggregate_persist_aggregates(self, real_supabase_client, e2e_org_a):
        """Pipeline: Parse -> Aggregate -> Verify pool totals."""
        fixture_path = FIXTURES_DIR / "yardi" / "gl_export_standard.csv"

        # 1. Parse
        parser = YardiVoyagerGLParser()
        with open(fixture_path, "rb") as f:
            parse_result = parser.parse(f, "gl_export_standard.csv", str(uuid4()))

        # 2. Convert to entries
        entries = [
            GLEntry(
                id=uuid4(),
                account_code=row["account_code"],
                amount=Decimal(str(row["amount"])),
            )
            for _, row in parse_result.data.iterrows()
            if pd.notna(row.get("amount"))
        ]

        # 3. Aggregate by expense categories
        mappings = [
            PoolMapping(pool_id=uuid4(), pool_name="Taxes", pattern="5100"),
            PoolMapping(pool_id=uuid4(), pool_name="Insurance", pattern="511*"),
            PoolMapping(pool_id=uuid4(), pool_name="GL Insurance", pattern="512*"),
            PoolMapping(pool_id=uuid4(), pool_name="Utilities", pattern="52*"),
            PoolMapping(pool_id=uuid4(), pool_name="Maintenance", pattern="53*"),
            PoolMapping(pool_id=uuid4(), pool_name="Repairs", pattern="54*"),
            PoolMapping(pool_id=uuid4(), pool_name="Security", pattern="55*"),
            PoolMapping(pool_id=uuid4(), pool_name="Management", pattern="56*"),
            PoolMapping(pool_id=uuid4(), pool_name="Professional", pattern="57*"),
            PoolMapping(
                pool_id=uuid4(), pool_name="Other", pattern="*"
            ),  # Catch-all for unmatched
        ]

        pool_totals = aggregate_by_pools(entries, mappings)

        # 4. Verify pools with matching data have entries
        # Only assert on pools that have matching data in the fixture (5100-5499 range)
        expected_pools = {
            "Taxes",
            "Insurance",
            "GL Insurance",
            "Utilities",
            "Maintenance",
            "Repairs",
        }
        for pool in pool_totals.values():
            if pool.pool_name in expected_pools:
                assert (
                    pool.entry_count > 0
                ), f"Pool {pool.pool_name} should have entries"
                assert (
                    pool.total_amount > 0
                ), f"Pool {pool.pool_name} should have non-zero total"

        # 5. Verify total preserved
        total_aggregated = sum(p.total_amount for p in pool_totals.values())
        total_parsed = Decimal(str(parse_result.data["amount"].sum()))

        diff = abs(total_aggregated - total_parsed)
        assert diff < Decimal("0.01"), f"Amount diff in aggregation: {diff}"
