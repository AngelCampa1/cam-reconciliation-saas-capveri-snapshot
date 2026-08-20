"""Tests for GL Entries Persistence.

Tests the GL entry persistence layer including:
- Batch insert from DataFrame
- Raw row data preservation
- Type conversions and validation
- Chunked insertion for performance
- Delete batch entries
"""

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pandas as pd
import pytest


class TestPersistGLEntries:
    """Tests for persist_gl_entries function."""

    def test_inserts_dataframe_to_database(self):
        """AC1: Batch insert from DataFrame."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        organization_id = uuid4()
        organization_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100"],
                "account_description": ["Utilities", "Janitorial"],
                "amount": [Decimal("1000.00"), Decimal("500.00")],
                "transaction_date": [date(2024, 1, 15), date(2024, 1, 20)],
                "period_year": [2024, 2024],
                "period_month": [1, 1],
                "vendor_name": ["Power Co", "CleanCorp"],
                "description": ["Electric bill", "Cleaning services"],
                "raw_row_data": [{"original": "row1"}, {"original": "row2"}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = MagicMock(
                return_value=MagicMock(
                    data=[
                        {"id": str(uuid4())},
                        {"id": str(uuid4())},
                    ]
                )
            )

            result = persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            assert result == 2
            mock_client.table.assert_called_with("gl_entries")

    def test_rejects_batch_outside_context(self):
        """Batch context must match before GL rows are inserted."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Utilities"],
                "amount": [Decimal("1000.00")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": ["Power Co"],
                "description": ["Electric bill"],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(
                data=[]
            )

            with pytest.raises(ValueError, match="Import batch not found"):
                persist_gl_entries(
                    df, batch_id, property_id, organization_id, validate=False
                )

            mock_client.table.return_value.insert.assert_not_called()

    def test_preserves_raw_row_data(self):
        """AC2: Raw row data preserved in JSONB."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        raw_data = {"Original Column": "value", "Amount": "$1,234.56"}
        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("1234.56")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [raw_data],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            # Verify the raw_row_data was included in the insert
            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["raw_row_data"] == raw_data

    def test_adds_batch_and_property_ids(self):
        """Adds batch_id and property_id to each record."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("100.00")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["import_batch_id"] == str(batch_id)
            assert records[0]["property_id"] == str(property_id)

    def test_converts_date_to_iso_string(self):
        """Converts transaction_date to ISO string for JSON serialization."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("100.00")],
                "transaction_date": [date(2024, 6, 15)],
                "period_year": [2024],
                "period_month": [6],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["transaction_date"] == "2024-06-15"

    def test_converts_datetime_to_iso_string(self):
        """Converts datetime to ISO string."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("100.00")],
                "transaction_date": [datetime(2024, 6, 15, 10, 30, 0)],
                "period_year": [2024],
                "period_month": [6],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            # datetime.isoformat() includes time component
            assert "2024-06-15" in records[0]["transaction_date"]

    def test_converts_string_date_via_fallback(self):
        """String dates without isoformat() converted via str()."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Use a string date (no isoformat method)
        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("100.00")],
                "transaction_date": ["2024-06-15"],  # String, not date object
                "period_year": [2024],
                "period_month": [6],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            # String date should be preserved via str() fallback
            assert records[0]["transaction_date"] == "2024-06-15"

    def test_handles_nat_date_values(self):
        """NaT (Not a Time) values converted to None."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Use pandas NaT for missing date
        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("100.00")],
                "transaction_date": [pd.NaT],  # NaT value
                "period_year": [2024],
                "period_month": [6],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            # NaT should be converted to None
            assert records[0]["transaction_date"] is None

    def test_serializes_amount_as_string_not_float(self):
        """Converts Decimal amount to str for JSON (no float precision loss)."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [Decimal("1234.56")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["amount"] == "1234.56"
            assert isinstance(records[0]["amount"], str)

    def test_large_decimal_amount_preserves_precision(self):
        """Large Decimal amounts must not lose precision via float conversion."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        large_amount = Decimal("999999999999.99")
        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Large Amount"],
                "amount": [large_amount],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["amount"] == "999999999999.99"
            assert isinstance(records[0]["amount"], str)

    def test_converts_periods_to_int(self):
        """Converts period_year and period_month to int."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [100.0],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024.0],  # Float from pandas
                "period_month": [1.0],  # Float from pandas
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["period_year"] == 2024
            assert records[0]["period_month"] == 1
            assert isinstance(records[0]["period_year"], int)
            assert isinstance(records[0]["period_month"], int)

    def test_handles_missing_columns(self):
        """Fills missing optional columns with None."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # DataFrame missing vendor_name, description
        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [100.0],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert "vendor_name" in records[0]
            assert "description" in records[0]

    def test_handles_null_raw_row_data(self):
        """Converts None raw_row_data to empty dict."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [100.0],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [None],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(df, batch_id, property_id, organization_id)

            insert_call = mock_client.table.return_value.insert.call_args
            records = insert_call[0][0]
            assert records[0]["raw_row_data"] == {}

    def test_chunks_large_inserts(self):
        """Inserts records in chunks for performance."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Create 1200 rows to test chunking
        df = pd.DataFrame(
            {
                "account_code": ["6000"] * 1200,
                "account_description": ["Test"] * 1200,
                "amount": [100.0] * 1200,
                "transaction_date": [date(2024, 1, 15)] * 1200,
                "period_year": [2024] * 1200,
                "period_month": [1] * 1200,
                "vendor_name": [None] * 1200,
                "description": [None] * 1200,
                "raw_row_data": [{}] * 1200,
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                side_effect=[
                    MagicMock(data=[{"id": str(uuid4())} for _ in range(500)]),
                    MagicMock(data=[{"id": str(uuid4())} for _ in range(500)]),
                    MagicMock(data=[{"id": str(uuid4())} for _ in range(200)]),
                ]
            )

            # Use chunk_size=500, so 1200 rows = 3 chunks (500, 500, 200)
            result = persist_gl_entries(
                df,
                batch_id,
                property_id,
                organization_id,
                chunk_size=500,
                validate=False,
            )

            # Should have 3 insert calls
            assert mock_client.table.return_value.insert.call_count == 3
            assert result == 1200

    def test_returns_total_inserted_count(self):
        """Returns total number of rows inserted."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        organization_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100", "6200"],
                "account_description": ["A", "B", "C"],
                "amount": [100.0, 200.0, 300.0],
                "transaction_date": [date(2024, 1, 15)] * 3,
                "period_year": [2024] * 3,
                "period_month": [1] * 3,
                "vendor_name": [None] * 3,
                "description": [None] * 3,
                "raw_row_data": [{}] * 3,
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value

            mock_chain.execute = MagicMock(
                return_value=MagicMock(
                    data=[
                        {"id": str(uuid4())},
                        {"id": str(uuid4())},
                        {"id": str(uuid4())},
                    ]
                )
            )

            result = persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            assert result == 3

    def test_handles_empty_dataframe(self):
        """Returns 0 for empty DataFrame."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            columns=[
                "account_code",
                "account_description",
                "amount",
                "transaction_date",
                "period_year",
                "period_month",
                "vendor_name",
                "description",
                "raw_row_data",
            ]
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            result = persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            assert result == 0
            # No insert should be called for empty DataFrame
            mock_client.table.return_value.insert.assert_not_called()


class TestPersistGLEntriesRollback:
    """Tests for rollback behavior on insert failure."""

    def test_rollback_on_insert_failure(self):
        """FIX DI-6: Rollback previously inserted chunks on error."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        # Create enough rows to require 2 chunks (chunk_size=2)
        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100", "6200", "6300"],
                "account_description": ["A", "B", "C", "D"],
                "amount": [100.0, 200.0, 300.0, 400.0],
                "transaction_date": [date(2024, 1, 15)] * 4,
                "period_year": [2024] * 4,
                "period_month": [1] * 4,
                "vendor_name": [None] * 4,
                "description": [None] * 4,
                "raw_row_data": [{}] * 4,
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            # Track insert call count to fail on second chunk
            insert_call_count = 0

            def mock_insert_execute():
                nonlocal insert_call_count
                insert_call_count += 1
                if insert_call_count == 1:
                    # First chunk succeeds
                    return MagicMock(data=[{"id": str(uuid4())}, {"id": str(uuid4())}])
                else:
                    # Second chunk fails
                    raise Exception("Database connection lost")

            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = mock_insert_execute

            # Mock the delete chain for rollback
            mock_delete_chain = mock_client.table.return_value.delete.return_value
            mock_delete_chain.eq.return_value.execute.return_value = MagicMock(data=[])

            # Should raise RuntimeError with rollback message
            with pytest.raises(RuntimeError) as exc_info:
                persist_gl_entries(
                    df,
                    batch_id,
                    property_id,
                    organization_id,
                    chunk_size=2,
                    validate=False,
                )

            # Verify error message mentions rollback
            assert "Rolled back" in str(exc_info.value)
            assert "chunk 2" in str(exc_info.value)

            # Verify DELETE was called for rollback
            mock_client.table.return_value.delete.assert_called()
            mock_delete_chain.eq.assert_called_with("import_batch_id", str(batch_id))

    def test_rollback_failure_still_raises_original_error(self):
        """Rollback failure doesn't mask original insert error."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100", "6200", "6300"],
                "account_description": ["A", "B", "C", "D"],
                "amount": [100.0, 200.0, 300.0, 400.0],
                "transaction_date": [date(2024, 1, 15)] * 4,
                "period_year": [2024] * 4,
                "period_month": [1] * 4,
                "vendor_name": [None] * 4,
                "description": [None] * 4,
                "raw_row_data": [{}] * 4,
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            insert_call_count = 0

            def mock_insert_execute():
                nonlocal insert_call_count
                insert_call_count += 1
                if insert_call_count == 1:
                    return MagicMock(data=[{"id": str(uuid4())}, {"id": str(uuid4())}])
                else:
                    raise Exception("Insert failed")

            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = mock_insert_execute

            # Mock delete to also fail (rollback fails)
            mock_delete_chain = mock_client.table.return_value.delete.return_value
            mock_delete_chain.eq.return_value.execute.side_effect = Exception(
                "Delete failed too"
            )

            # Should still raise RuntimeError about the original insert failure
            with pytest.raises(RuntimeError) as exc_info:
                persist_gl_entries(
                    df,
                    batch_id,
                    property_id,
                    organization_id,
                    chunk_size=2,
                    validate=False,
                )

            # Original error is preserved
            assert "Insert failed" in str(exc_info.value)


class TestPersistGLEntriesRetry:
    """Tests retry behavior for transient import batch FK visibility."""

    def test_retries_on_import_batch_fk_then_succeeds(self):
        """Retries transient import batch FK errors and inserts successfully."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Test"],
                "amount": [100.0],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = MagicMock(
                side_effect=[
                    Exception(
                        'insert or update on table "gl_entries" violates foreign key '
                        'constraint "gl_entries_import_batch_id_fkey"'
                    ),
                    MagicMock(data=[{"id": str(uuid4())}]),
                ]
            )

            with patch("app.services.ingestion.persistence.time.sleep") as mock_sleep:
                result = persist_gl_entries(
                    df, batch_id, property_id, organization_id, validate=False
                )

            assert result == 1
            assert mock_chain.execute.call_count == 2
            mock_sleep.assert_called_once()


class TestDeleteBatchEntries:
    """Tests for delete_batch_entries function."""

    def test_deletes_entries_by_batch_id(self):
        """Deletes all GL entries for a specific batch."""
        from app.services.ingestion.persistence import delete_batch_entries

        batch_id = uuid4()
        organization_id = uuid4()

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.delete.return_value

            mock_chain.eq.return_value.execute = MagicMock(
                return_value=MagicMock(
                    data=[
                        {"id": str(uuid4())},
                        {"id": str(uuid4())},
                        {"id": str(uuid4())},
                    ]
                )
            )

            result = delete_batch_entries(batch_id, organization_id)

            assert result == 3
            mock_client.table.assert_called_with("gl_entries")
            mock_client.table.return_value.delete.return_value.eq.assert_called_with(
                "import_batch_id", str(batch_id)
            )

    def test_returns_zero_when_no_entries(self):
        """Returns 0 when no entries found for batch."""
        from app.services.ingestion.persistence import delete_batch_entries

        batch_id = uuid4()
        organization_id = uuid4()

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.delete.return_value

            mock_chain.eq.return_value.execute = MagicMock(
                return_value=MagicMock(data=[])
            )

            result = delete_batch_entries(batch_id, organization_id)

            assert result == 0


class TestGetBatchEntries:
    """Tests for get_batch_entries function."""

    def test_retrieves_entries_by_batch_id(self):
        """Retrieves all GL entries for a batch."""
        from app.services.ingestion.persistence import get_batch_entries

        batch_id = uuid4()
        organization_id = uuid4()
        property_id = uuid4()

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            # Mock the response data
            mock_response = MagicMock(
                data=[
                    {
                        "id": str(uuid4()),
                        "import_batch_id": str(batch_id),
                        "property_id": str(property_id),
                        "account_code": "6000",
                        "account_description": "Utilities",
                        "amount": 1000.0,
                        "transaction_date": "2024-01-15",
                        "period_year": 2024,
                        "period_month": 1,
                        "vendor_name": "Power Co",
                        "description": "Electric",
                        "raw_row_data": {},
                        "created_at": "2024-01-15T10:00:00",
                    }
                ]
            )

            # Set up the complete chain with range for pagination
            mock_client.table.return_value.select.return_value.eq.return_value.range.return_value.execute.return_value = (
                mock_response
            )

            result = get_batch_entries(batch_id, organization_id)

            assert len(result) == 1
            assert result[0]["account_code"] == "6000"

    def test_returns_empty_list_when_no_entries(self):
        """Returns empty list when no entries found."""
        from app.services.ingestion.persistence import get_batch_entries

        batch_id = uuid4()
        organization_id = uuid4()

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.select.return_value

            mock_chain.eq.return_value.range.return_value.execute = MagicMock(
                return_value=MagicMock(data=[])
            )

            result = get_batch_entries(batch_id, organization_id)

            assert result == []


class TestAccrualDateSerialization:
    """Tests for accrual_date serialization in persistence layer."""

    def test_accrual_date_serialized_as_isoformat(self):
        """accrual_date is serialized to ISO string when present."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Utilities"],
                "amount": [Decimal("1000.00")],
                "transaction_date": [date(2024, 1, 15)],
                "accrual_date": [date(2024, 1, 10)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": ["Power Co"],
                "description": ["Electric bill"],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            inserted = mock_client.table.return_value.insert.call_args[0][0]
            assert inserted[0]["accrual_date"] == "2024-01-10"

    def test_accrual_date_none_when_missing(self):
        """accrual_date is None when not in source DataFrame."""
        from app.services.ingestion.persistence import persist_gl_entries

        batch_id = uuid4()
        property_id = uuid4()
        organization_id = uuid4()

        df = pd.DataFrame(
            {
                "account_code": ["6000"],
                "account_description": ["Utilities"],
                "amount": [Decimal("1000.00")],
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": ["Power Co"],
                "description": ["Electric bill"],
                "raw_row_data": [{}],
            }
        )

        with patch("app.services.ingestion.persistence.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_chain = mock_client.table.return_value.insert.return_value
            mock_chain.execute = MagicMock(
                return_value=MagicMock(data=[{"id": str(uuid4())}])
            )

            persist_gl_entries(
                df, batch_id, property_id, organization_id, validate=False
            )

            inserted = mock_client.table.return_value.insert.call_args[0][0]
            assert inserted[0]["accrual_date"] is None
