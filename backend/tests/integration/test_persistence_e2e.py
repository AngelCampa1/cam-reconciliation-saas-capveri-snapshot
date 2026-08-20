"""E2E tests for GL persistence with real database.

Tests verify that data integrity is maintained through the
database persistence layer, including:
- Decimal precision preservation
- Negative amount handling
- Large dataset chunking
- Batch operations

These tests require a local Supabase instance to be running.
"""

from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pandas as pd
import pytest

from app.services.ingestion.persistence import (
    delete_batch_entries,
    get_batch_entries,
    persist_gl_entries,
)

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.mark.e2e
class TestPersistenceRoundtrip:
    """Tests for data integrity through database persistence."""

    @pytest.fixture
    def e2e_property_id(self, real_supabase_client, e2e_org_a) -> str:
        """Create a test property for E2E tests."""
        property_id = str(uuid4())
        property_data = {
            "id": property_id,
            "organization_id": str(e2e_org_a["id"]),
            "name": "E2E Test Property",
            "address_line1": "123 Test St",
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

        yield property_id

        # Cleanup
        real_supabase_client.table("properties").delete().eq(
            "id", property_id
        ).execute()

    def _create_import_batch(self, real_supabase_client, org_id, property_id):
        """Helper to create an import batch for tests."""
        batch_id = str(uuid4())
        batch_data = {
            "id": batch_id,
            "organization_id": str(org_id),
            "property_id": property_id,
            "file_name": f"test_{batch_id[:8]}.csv",
            "file_hash": batch_id.replace("-", "") + "0" * 32,  # Unique hash
            "source_system": "generic",
            "status": "completed",
            "row_count": 0,
        }
        real_supabase_client.table("import_batches").upsert(
            batch_data, on_conflict="id"
        ).execute()
        return batch_id

    def test_decimal_precision_survives_roundtrip(
        self, real_supabase_client, e2e_org_a, e2e_property_id
    ):
        """Decimal amounts maintain precision through database."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200"],
                "account_description": ["Taxes", "Utilities"],
                "amount": [Decimal("1234.56"), Decimal("9999.99")],
                "transaction_date": [date(2024, 1, 15), date(2024, 1, 15)],
                "period_year": [2024, 2024],
                "period_month": [1, 1],
                "vendor_name": ["Vendor A", "Vendor B"],
                "description": ["Test entry 1", "Test entry 2"],
            }
        )

        org_id = e2e_org_a["id"]
        batch_id = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_id
        )

        try:
            rows_inserted = persist_gl_entries(
                df,
                batch_id,
                e2e_property_id,
                org_id,
                validate=False,
            )

            assert rows_inserted == 2

            # Retrieve and verify
            entries = get_batch_entries(batch_id, org_id)
            assert len(entries) == 2

            amounts = sorted([Decimal(str(e["amount"])) for e in entries])
            assert amounts == [Decimal("1234.56"), Decimal("9999.99")]

        finally:
            # Cleanup
            delete_batch_entries(batch_id, org_id)

    def test_negative_amounts_preserved(
        self, real_supabase_client, e2e_org_a, e2e_property_id
    ):
        """Credits (negative amounts) survive database storage."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5100"],
                "account_description": ["Taxes", "Taxes Refund"],
                "amount": [Decimal("1000.00"), Decimal("-500.00")],
                "transaction_date": [date(2024, 1, 15), date(2024, 1, 20)],
                "period_year": [2024, 2024],
                "period_month": [1, 1],
                "vendor_name": ["Govt", "Govt"],
                "description": ["Tax payment", "Tax refund"],
            }
        )

        org_id = e2e_org_a["id"]
        batch_id = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_id
        )

        try:
            rows_inserted = persist_gl_entries(
                df,
                batch_id,
                e2e_property_id,
                org_id,
                validate=False,
            )

            assert rows_inserted == 2

            entries = get_batch_entries(batch_id, org_id)
            amounts = {Decimal(str(e["amount"])) for e in entries}

            assert Decimal("1000.00") in amounts
            assert Decimal("-500.00") in amounts

        finally:
            delete_batch_entries(batch_id, org_id)

    def test_chunking_with_large_dataset(
        self, real_supabase_client, e2e_org_a, e2e_property_id
    ):
        """Large datasets insert correctly with chunking."""
        # Create 500 rows (5 chunks at chunk_size=100)
        # Note: Supabase has a default 1000 row limit on queries
        num_rows = 500
        df = pd.DataFrame(
            {
                "account_code": [f"5{i % 10}00" for i in range(num_rows)],
                "account_description": [f"Account {i}" for i in range(num_rows)],
                "amount": [Decimal(f"{i}.00") for i in range(num_rows)],
                "transaction_date": [date(2024, 1, 15)] * num_rows,
                "period_year": [2024] * num_rows,
                "period_month": [1] * num_rows,
                "vendor_name": [f"Vendor {i % 100}" for i in range(num_rows)],
                "description": [f"Entry {i}" for i in range(num_rows)],
            }
        )

        org_id = e2e_org_a["id"]
        batch_id = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_id
        )

        try:
            # Use smaller chunk size to test chunking behavior
            rows_inserted = persist_gl_entries(
                df,
                batch_id,
                e2e_property_id,
                org_id,
                chunk_size=100,
                validate=False,
            )

            assert rows_inserted == num_rows

            entries = get_batch_entries(batch_id, org_id)
            assert len(entries) == num_rows

        finally:
            delete_batch_entries(batch_id, org_id)

    def test_zero_amounts_stored_correctly(
        self, real_supabase_client, e2e_org_a, e2e_property_id
    ):
        """Zero amounts are stored and retrieved correctly."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200", "5300"],
                "account_description": ["Zero Entry", "Positive", "Negative"],
                "amount": [Decimal("0.00"), Decimal("100.00"), Decimal("-50.00")],
                "transaction_date": [date(2024, 1, 15)] * 3,
                "period_year": [2024] * 3,
                "period_month": [1] * 3,
                "vendor_name": ["Vendor"] * 3,
                "description": ["Test"] * 3,
            }
        )

        org_id = e2e_org_a["id"]
        batch_id = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_id
        )

        try:
            rows_inserted = persist_gl_entries(
                df,
                batch_id,
                e2e_property_id,
                org_id,
                validate=False,
            )

            assert rows_inserted == 3

            entries = get_batch_entries(batch_id, org_id)
            amounts = {Decimal(str(e["amount"])) for e in entries}

            assert Decimal("0.00") in amounts
            assert Decimal("100.00") in amounts
            assert Decimal("-50.00") in amounts

        finally:
            delete_batch_entries(batch_id, org_id)


@pytest.mark.e2e
class TestBatchOperations:
    """Tests for batch-level database operations."""

    @pytest.fixture
    def e2e_property_for_batch(self, real_supabase_client, e2e_org_a) -> str:
        """Create a test property for batch tests."""
        property_id = str(uuid4())
        property_data = {
            "id": property_id,
            "organization_id": str(e2e_org_a["id"]),
            "name": "Batch Test Property",
            "address_line1": "456 Batch St",
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
        yield property_id
        real_supabase_client.table("properties").delete().eq(
            "id", property_id
        ).execute()

    def _create_import_batch(self, real_supabase_client, org_id, property_id):
        """Helper to create an import batch."""
        batch_id = str(uuid4())
        batch_data = {
            "id": batch_id,
            "organization_id": str(org_id),
            "property_id": property_id,
            "file_name": f"test_{batch_id[:8]}.csv",
            "file_hash": batch_id.replace("-", "") + "0" * 32,  # Unique hash
            "source_system": "generic",
            "status": "completed",
            "row_count": 0,
        }
        real_supabase_client.table("import_batches").upsert(
            batch_data, on_conflict="id"
        ).execute()
        return batch_id

    def test_batch_deletion_removes_all_entries(
        self, real_supabase_client, e2e_org_a, e2e_property_for_batch
    ):
        """delete_batch_entries removes all entries for a batch."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200", "5300"],
                "account_description": ["A", "B", "C"],
                "amount": [Decimal("100.00")] * 3,
                "transaction_date": [date(2024, 1, 15)] * 3,
                "period_year": [2024] * 3,
                "period_month": [1] * 3,
                "vendor_name": ["Vendor"] * 3,
                "description": ["Test"] * 3,
            }
        )

        org_id = e2e_org_a["id"]
        batch_id = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_for_batch
        )

        # Insert
        persist_gl_entries(
            df,
            batch_id,
            e2e_property_for_batch,
            org_id,
            validate=False,
        )

        # Verify inserted
        entries = get_batch_entries(batch_id, org_id)
        assert len(entries) == 3

        # Delete
        deleted = delete_batch_entries(batch_id, org_id)
        assert deleted == 3

        # Verify deleted
        entries = get_batch_entries(batch_id, org_id)
        assert len(entries) == 0

    def test_multiple_batches_independent(
        self, real_supabase_client, e2e_org_a, e2e_property_for_batch
    ):
        """Multiple batches are stored and retrieved independently."""
        df1 = pd.DataFrame(
            {
                "account_code": ["5100"],
                "account_description": ["Batch 1"],
                "amount": [Decimal("100.00")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": ["Vendor"],
                "description": ["Test"],
            }
        )

        df2 = pd.DataFrame(
            {
                "account_code": ["5200"],
                "account_description": ["Batch 2"],
                "amount": [Decimal("200.00")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": ["Vendor"],
                "description": ["Test"],
            }
        )

        org_id = e2e_org_a["id"]
        batch_id_1 = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_for_batch
        )
        batch_id_2 = self._create_import_batch(
            real_supabase_client, org_id, e2e_property_for_batch
        )

        try:
            persist_gl_entries(
                df1, batch_id_1, e2e_property_for_batch, org_id, validate=False
            )
            persist_gl_entries(
                df2, batch_id_2, e2e_property_for_batch, org_id, validate=False
            )

            # Verify independent retrieval
            entries_1 = get_batch_entries(batch_id_1, org_id)
            entries_2 = get_batch_entries(batch_id_2, org_id)

            assert len(entries_1) == 1
            assert len(entries_2) == 1
            assert Decimal(str(entries_1[0]["amount"])) == Decimal("100.00")
            assert Decimal(str(entries_2[0]["amount"])) == Decimal("200.00")

            # Delete one batch, verify other unaffected
            delete_batch_entries(batch_id_1, org_id)

            entries_1 = get_batch_entries(batch_id_1, org_id)
            entries_2 = get_batch_entries(batch_id_2, org_id)

            assert len(entries_1) == 0
            assert len(entries_2) == 1

        finally:
            delete_batch_entries(batch_id_1, org_id)
            delete_batch_entries(batch_id_2, org_id)
