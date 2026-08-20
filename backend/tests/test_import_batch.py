"""Tests for Import Batch Tracking.

Tests the import batch tracking system including:
- SHA256 file hashing for deduplication
- Duplicate file detection
- Status tracking (pending, processing, completed, failed)
- Error log storage
"""

import io
from datetime import datetime
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest


class TestComputeFileHash:
    """Tests for compute_file_hash function."""

    def test_computes_sha256_hash(self):
        """AC1: SHA256 hash computed for uploaded files."""
        from app.services.ingestion.batch import compute_file_hash

        content = b"Test file content for hashing"
        file = io.BytesIO(content)

        hash_result = compute_file_hash(file)

        # SHA256 produces 64 hex characters
        assert len(hash_result) == 64
        assert all(c in "0123456789abcdef" for c in hash_result)

    def test_same_content_same_hash(self):
        """Same content produces same hash."""
        from app.services.ingestion.batch import compute_file_hash

        content = b"Identical content"
        file1 = io.BytesIO(content)
        file2 = io.BytesIO(content)

        hash1 = compute_file_hash(file1)
        hash2 = compute_file_hash(file2)

        assert hash1 == hash2

    def test_different_content_different_hash(self):
        """Different content produces different hash."""
        from app.services.ingestion.batch import compute_file_hash

        file1 = io.BytesIO(b"Content A")
        file2 = io.BytesIO(b"Content B")

        hash1 = compute_file_hash(file1)
        hash2 = compute_file_hash(file2)

        assert hash1 != hash2

    def test_resets_file_position(self):
        """File position reset to start after hashing."""
        from app.services.ingestion.batch import compute_file_hash

        content = b"Test content"
        file = io.BytesIO(content)
        file.seek(5)  # Move to middle

        compute_file_hash(file)

        assert file.tell() == 0  # Should be reset to start

    def test_handles_large_file(self):
        """Handles large files efficiently (chunked reading)."""
        from app.services.ingestion.batch import compute_file_hash

        # 1MB of data
        content = b"x" * (1024 * 1024)
        file = io.BytesIO(content)

        hash_result = compute_file_hash(file)

        assert len(hash_result) == 64

    def test_handles_empty_file(self):
        """Handles empty file."""
        from app.services.ingestion.batch import compute_file_hash

        file = io.BytesIO(b"")

        hash_result = compute_file_hash(file)

        # SHA256 of empty string
        assert (
            hash_result
            == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        )


class TestImportBatchModel:
    """Tests for ImportBatch model."""

    def test_creates_batch_with_defaults(self):
        """Creates batch with default values."""
        from app.services.ingestion.batch import ImportBatch

        batch = ImportBatch(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            file_name="test.csv",
            file_hash="abc123",
            source_system="yardi",
        )

        assert batch.status == "pending"
        assert batch.row_count == 0
        assert batch.error_count == 0
        assert batch.error_log == []

    def test_creates_batch_with_all_fields(self):
        """Creates batch with all fields."""
        from app.services.ingestion.batch import ImportBatch

        batch_id = uuid4()
        org_id = uuid4()
        prop_id = uuid4()
        now = datetime.now()

        batch = ImportBatch(
            id=batch_id,
            organization_id=org_id,
            property_id=prop_id,
            file_name="data.csv",
            file_hash="def456",
            source_system="mri",
            status="completed",
            row_count=100,
            error_count=5,
            error_log=[{"message": "Error 1"}, {"message": "Error 2"}],
            created_at=now,
            updated_at=now,
        )

        assert batch.id == batch_id
        assert batch.organization_id == org_id
        assert batch.property_id == prop_id
        assert batch.file_name == "data.csv"
        assert batch.status == "completed"
        assert batch.row_count == 100
        assert batch.error_count == 5
        assert len(batch.error_log) == 2

    def test_batch_status_values(self):
        """AC3: Status tracked (pending, processing, completed, failed)."""
        from app.services.ingestion.batch import ImportBatch

        valid_statuses = ["pending", "processing", "completed", "failed"]

        for status in valid_statuses:
            batch = ImportBatch(
                id=uuid4(),
                organization_id=uuid4(),
                property_id=uuid4(),
                file_name="test.csv",
                file_hash="abc123",
                source_system="generic",
                status=status,
            )
            assert batch.status == status


class TestDuplicateFileError:
    """Tests for DuplicateFileError exception."""

    def test_creates_error_with_existing_batch(self):
        """AC2: Duplicate files rejected with clear message."""
        from app.services.ingestion.batch import DuplicateFileError, ImportBatch

        existing = ImportBatch(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            file_name="original.csv",
            file_hash="abc123",
            source_system="yardi",
            created_at=datetime(2024, 1, 15, 10, 30),
        )

        error = DuplicateFileError(existing)

        assert error.existing_batch == existing
        assert "already imported" in str(error).lower()
        assert str(existing.id) in str(error)

    def test_error_is_exception(self):
        """DuplicateFileError is an Exception."""
        from app.services.ingestion.batch import DuplicateFileError, ImportBatch

        existing = ImportBatch(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            file_name="test.csv",
            file_hash="abc",
            source_system="mri",
        )

        error = DuplicateFileError(existing)

        assert isinstance(error, Exception)


class TestCheckDuplicate:
    """Tests for check_duplicate function."""

    def test_returns_none_when_no_duplicate(self):
        """Returns None when file not previously imported."""
        from app.services.ingestion.batch import check_duplicate

        org_id = uuid4()
        file_hash = "unique_hash_123"

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            mock_result = MagicMock(data=[])

            mock_in = MagicMock()
            mock_in.execute.return_value = mock_result
            mock_eq2 = MagicMock()
            mock_eq2.in_.return_value = mock_in
            mock_eq1 = MagicMock()
            mock_eq1.eq.return_value = mock_eq2
            mock_select = MagicMock()
            mock_select.eq.return_value = mock_eq1
            mock_table = MagicMock()
            mock_table.select.return_value = mock_select
            mock_client.table.return_value = mock_table

            result = check_duplicate(org_id, file_hash)

            assert result is None

    def test_returns_batch_when_duplicate_found(self):
        """Returns existing batch when duplicate found."""
        from app.services.ingestion.batch import check_duplicate

        org_id = uuid4()
        batch_id = uuid4()
        prop_id = uuid4()
        file_hash = "duplicate_hash_456"

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            duplicate_data = [
                {
                    "id": str(batch_id),
                    "organization_id": str(org_id),
                    "property_id": str(prop_id),
                    "file_name": "existing.csv",
                    "file_hash": file_hash,
                    "source_system": "yardi",
                    "status": "completed",
                    "row_count": 50,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": "2024-01-15T10:30:00",
                    "updated_at": "2024-01-15T10:35:00",
                }
            ]

            mock_result = MagicMock(data=duplicate_data)

            mock_in = MagicMock()
            mock_in.execute.return_value = mock_result
            mock_eq2 = MagicMock()
            mock_eq2.in_.return_value = mock_in
            mock_eq1 = MagicMock()
            mock_eq1.eq.return_value = mock_eq2
            mock_select = MagicMock()
            mock_select.eq.return_value = mock_eq1
            mock_table = MagicMock()
            mock_table.select.return_value = mock_select
            mock_client.table.return_value = mock_table

            result = check_duplicate(org_id, file_hash)

            assert result is not None
            assert result.file_hash == file_hash
            assert result.status == "completed"


class TestCheckDuplicateAllowFailedReimport:
    """Tests for check_duplicate with allow_failed_reimport parameter."""

    def test_check_duplicate_blocks_failed_when_reimport_disabled(self):
        """FIX DI-13: Test allow_failed_reimport=False includes FAILED in blocking."""
        from app.services.ingestion.batch import check_duplicate

        org_id = uuid4()
        batch_id = uuid4()
        prop_id = uuid4()
        file_hash = "failed_import_hash"

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            # Mock a FAILED batch exists
            failed_data = [
                {
                    "id": str(batch_id),
                    "organization_id": str(org_id),
                    "property_id": str(prop_id),
                    "file_name": "failed.csv",
                    "file_hash": file_hash,
                    "source_system": "yardi",
                    "status": "failed",  # FAILED status
                    "row_count": 0,
                    "error_count": 5,
                    "error_log": [{"message": "Error 1"}],
                    "created_at": "2024-01-15T10:30:00",
                    "updated_at": "2024-01-15T10:35:00",
                }
            ]

            mock_result = MagicMock(data=failed_data)

            mock_in = MagicMock()
            mock_in.execute.return_value = mock_result
            mock_eq2 = MagicMock()
            mock_eq2.in_.return_value = mock_in
            mock_eq1 = MagicMock()
            mock_eq1.eq.return_value = mock_eq2
            mock_select = MagicMock()
            mock_select.eq.return_value = mock_eq1
            mock_table = MagicMock()
            mock_table.select.return_value = mock_select
            mock_client.table.return_value = mock_table

            # With allow_failed_reimport=False, FAILED batches should block
            result = check_duplicate(org_id, file_hash, allow_failed_reimport=False)

            assert result is not None
            assert result.status == "failed"

            # Verify in_() was called with FAILED and PENDING included
            in_call_args = mock_eq2.in_.call_args[0]
            assert "status" in str(in_call_args) or in_call_args[0] == "status"
            statuses = in_call_args[1] if len(in_call_args) > 1 else []
            assert "failed" in statuses
            assert "pending" in statuses


class TestCreateBatch:
    """Tests for create_batch function."""

    def test_creates_batch_record(self):
        """Creates new batch record in database."""
        from app.services.ingestion.batch import create_batch

        org_id = uuid4()
        prop_id = uuid4()
        file_name = "import.csv"
        file_hash = "new_hash_789"
        source_system = "mri"

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            # Mock the insert response
            insert_data = [
                {
                    "id": str(uuid4()),
                    "organization_id": str(org_id),
                    "property_id": str(prop_id),
                    "file_name": file_name,
                    "file_hash": file_hash,
                    "source_system": source_system,
                    "status": "pending",
                    "row_count": 0,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": "2024-01-15T10:30:00",
                    "updated_at": None,
                }
            ]

            mock_result = MagicMock(data=insert_data)

            mock_insert = MagicMock()
            mock_insert.execute.return_value = mock_result
            mock_table = MagicMock()
            mock_table.insert.return_value = mock_insert
            mock_client.table.return_value = mock_table

            result = create_batch(org_id, prop_id, file_name, file_hash, source_system)

            # AC5: Batch ID returned for status polling
            assert result.id is not None
            assert result.file_name == file_name
            assert result.status == "pending"

    def test_batch_starts_with_pending_status(self):
        """New batch starts with 'pending' status."""
        from app.services.ingestion.batch import create_batch

        organization_id = uuid4()

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            insert_data = [
                {
                    "id": str(uuid4()),
                    "organization_id": str(organization_id),
                    "property_id": str(uuid4()),
                    "file_name": "test.csv",
                    "file_hash": "abc",
                    "source_system": "generic",
                    "status": "pending",
                    "row_count": 0,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": None,
                    "updated_at": None,
                }
            ]

            mock_result = MagicMock(data=insert_data)

            mock_insert = MagicMock()
            mock_insert.execute.return_value = mock_result
            mock_table = MagicMock()
            mock_table.insert.return_value = mock_insert
            mock_client.table.return_value = mock_table

            result = create_batch(uuid4(), uuid4(), "test.csv", "abc", "generic")

            assert result.status == "pending"


class TestCreateBatchRaceCondition:
    """Tests for race condition handling in create_batch."""

    def test_create_batch_handles_race_condition(self):
        """FIX DI-14: Detect and rollback duplicate batch from concurrent insert."""
        from app.services.ingestion.batch import DuplicateFileError, create_batch

        org_id = uuid4()
        prop_id = uuid4()
        file_hash = "race_condition_hash"
        our_batch_id = uuid4()
        first_batch_id = uuid4()  # Another batch that was inserted first

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            # Our insert succeeds (we don't know about race yet)
            insert_data = [
                {
                    "id": str(our_batch_id),
                    "organization_id": str(org_id),
                    "property_id": str(prop_id),
                    "file_name": "test.csv",
                    "file_hash": file_hash,
                    "source_system": "yardi",
                    "status": "pending",
                    "row_count": 0,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": "2024-01-15T10:30:01",  # Our batch created second
                    "updated_at": None,
                }
            ]

            # Race condition detection: returns 2 batches, ours is second
            race_check_data = [
                {
                    "id": str(first_batch_id),
                    "created_at": "2024-01-15T10:30:00",
                },  # First
                {
                    "id": str(our_batch_id),
                    "created_at": "2024-01-15T10:30:01",
                },  # Second (ours)
            ]

            # Existing batch data for check_duplicate return (full data)
            existing_batch_data = [
                {
                    "id": str(first_batch_id),
                    "organization_id": str(org_id),
                    "property_id": str(prop_id),
                    "file_name": "test.csv",
                    "file_hash": file_hash,
                    "source_system": "yardi",
                    "status": "pending",
                    "row_count": 0,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": "2024-01-15T10:30:00",
                    "updated_at": None,
                }
            ]

            select_call_count = 0

            def mock_table(table_name):
                nonlocal select_call_count
                mock_tbl = MagicMock()

                if table_name == "import_batches":
                    # Insert call
                    mock_insert = MagicMock()
                    mock_insert.execute.return_value = MagicMock(data=insert_data)
                    mock_tbl.insert.return_value = mock_insert

                    # Select for race check and check_duplicate
                    mock_select = MagicMock()
                    mock_eq = MagicMock()
                    mock_eq2 = MagicMock()
                    mock_in = MagicMock()
                    mock_order = MagicMock()

                    # Track select calls and return appropriate data
                    def select_execute():
                        nonlocal select_call_count
                        select_call_count += 1
                        # First select (race check with order) returns 2 batches
                        # Second select (check_duplicate) returns full existing batch
                        if select_call_count == 1:
                            return MagicMock(data=race_check_data)
                        else:
                            return MagicMock(data=existing_batch_data)

                    mock_order.execute = select_execute
                    mock_in.order.return_value = mock_order
                    mock_in.execute = select_execute
                    mock_eq2.in_.return_value = mock_in
                    mock_eq.eq.return_value = mock_eq2
                    mock_select.eq.return_value = mock_eq
                    mock_tbl.select.return_value = mock_select

                    # Delete for rollback
                    mock_delete = MagicMock()
                    mock_delete_eq = MagicMock()
                    mock_delete_eq.execute.return_value = MagicMock(data=[])
                    mock_delete.eq.return_value = mock_delete_eq
                    mock_tbl.delete.return_value = mock_delete

                return mock_tbl

            mock_client.table = mock_table

            # Should raise DuplicateFileError because we're not the first batch
            with pytest.raises(DuplicateFileError) as exc_info:
                create_batch(org_id, prop_id, "test.csv", file_hash, "yardi")

            # Verify the error references the existing batch
            assert exc_info.value.existing_batch is not None


class TestUpdateBatchStatus:
    """Tests for update_batch_status function."""

    def test_updates_status(self):
        """AC3: Updates batch status."""
        from app.services.ingestion.batch import update_batch_status

        batch_id = uuid4()
        organization_id = uuid4()

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            update_data = [
                {
                    "id": str(batch_id),
                    "organization_id": str(organization_id),
                    "property_id": str(uuid4()),
                    "file_name": "test.csv",
                    "file_hash": "abc",
                    "source_system": "yardi",
                    "status": "processing",
                    "row_count": 0,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": None,
                    "updated_at": None,
                }
            ]

            mock_result = MagicMock(data=update_data)

            mock_eq = MagicMock()
            mock_eq.execute.return_value = mock_result
            mock_update = MagicMock()
            mock_update.eq.return_value.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client.table.return_value = mock_table

            result = update_batch_status(batch_id, organization_id, "processing")

            assert result.status == "processing"

    def test_updates_row_count(self):
        """Updates row count on completion."""
        from app.services.ingestion.batch import update_batch_status

        batch_id = uuid4()
        organization_id = uuid4()

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            update_data = [
                {
                    "id": str(batch_id),
                    "organization_id": str(organization_id),
                    "property_id": str(uuid4()),
                    "file_name": "test.csv",
                    "file_hash": "abc",
                    "source_system": "yardi",
                    "status": "completed",
                    "row_count": 150,
                    "error_count": 0,
                    "error_log": [],
                    "created_at": None,
                    "updated_at": None,
                }
            ]

            mock_result = MagicMock(data=update_data)

            mock_eq = MagicMock()
            mock_eq.execute.return_value = mock_result
            mock_update = MagicMock()
            mock_update.eq.return_value.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client.table.return_value = mock_table

            result = update_batch_status(
                batch_id, organization_id, "completed", row_count=150
            )

            assert result.row_count == 150

    def test_updates_error_log(self):
        """AC4: Error log stored for failed imports."""
        from app.services.ingestion.batch import update_batch_status

        batch_id = uuid4()
        organization_id = uuid4()
        errors = [
            {"message": "Row 5: Invalid amount"},
            {"message": "Row 12: Missing account code"},
        ]

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client

            update_data = [
                {
                    "id": str(batch_id),
                    "organization_id": str(organization_id),
                    "property_id": str(uuid4()),
                    "file_name": "test.csv",
                    "file_hash": "abc",
                    "source_system": "yardi",
                    "status": "failed",
                    "row_count": 10,
                    "error_count": 2,
                    "error_log": errors,
                    "created_at": None,
                    "updated_at": None,
                }
            ]

            mock_result = MagicMock(data=update_data)

            mock_eq = MagicMock()
            mock_eq.execute.return_value = mock_result
            mock_update = MagicMock()
            mock_update.eq.return_value.eq.return_value = mock_eq
            mock_table = MagicMock()
            mock_table.update.return_value = mock_update
            mock_client.table.return_value = mock_table

            result = update_batch_status(
                batch_id,
                organization_id,
                "failed",
                row_count=10,
                error_count=2,
                error_log=errors,
            )

            assert result.status == "failed"
            assert result.error_count == 2
            assert result.error_log == errors

    def test_rejects_invalid_status(self):
        """Only known batch statuses are accepted."""
        from app.services.ingestion.batch import update_batch_status

        with pytest.raises(ValueError, match="Invalid import batch status"):
            update_batch_status(uuid4(), uuid4(), "archived")

    def test_raises_when_batch_not_in_organization(self):
        """Org-scoped updates must fail when no batch matches."""
        from app.services.ingestion.batch import update_batch_status

        with patch("app.services.ingestion.batch.get_supabase_admin") as mock_get:
            mock_client = MagicMock()
            mock_get.return_value = mock_client
            mock_client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
                data=[]
            )

            with pytest.raises(ValueError, match="Import batch not found"):
                update_batch_status(uuid4(), uuid4(), "processing")


class TestBatchStatusEnum:
    """Tests for BatchStatus enum."""

    def test_has_required_statuses(self):
        """AC3: Has all required status values."""
        from app.services.ingestion.batch import BatchStatus

        assert hasattr(BatchStatus, "PENDING")
        assert hasattr(BatchStatus, "PROCESSING")
        assert hasattr(BatchStatus, "COMPLETED")
        assert hasattr(BatchStatus, "FAILED")

    def test_status_values(self):
        """Status values are lowercase strings."""
        from app.services.ingestion.batch import BatchStatus

        assert BatchStatus.PENDING.value == "pending"
        assert BatchStatus.PROCESSING.value == "processing"
        assert BatchStatus.COMPLETED.value == "completed"
        assert BatchStatus.FAILED.value == "failed"


class TestBatchMetrics:
    """Sentry metrics emitted at batch lifecycle transitions."""

    def test_create_batch_emits_started_metric(self):
        """create_batch increments cam.import.batch.started counter."""
        from unittest.mock import MagicMock, patch

        from app.services.ingestion.batch import create_batch

        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "organization_id": str(uuid4()),
                "property_id": str(uuid4()),
                "file_name": "test.csv",
                "file_hash": "abc123",
                "source_system": "yardi",
                "status": "pending",
                "row_count": 0,
                "error_count": 0,
                "error_log": [],
                "created_at": None,
                "updated_at": None,
            }
        ]
        # Duplicate check returns no other batches
        mock_dup = MagicMock()
        mock_dup.data = [mock_result.data[0]]

        with (
            patch("app.services.ingestion.batch.get_supabase_admin") as mock_db,
            patch("sentry_sdk.metrics.count") as mock_metric,
        ):
            client = mock_db.return_value
            client.table.return_value.insert.return_value.execute.return_value = (
                mock_result
            )
            client.table.return_value.select.return_value.eq.return_value.eq.return_value.in_.return_value.order.return_value.execute.return_value = (
                mock_dup
            )

            create_batch(uuid4(), uuid4(), "test.csv", "abc123", "yardi")

            mock_metric.assert_called_once_with(
                "cam.import.batch.started", 1.0, attributes={"source_system": "yardi"}
            )

    def test_update_batch_status_completed_emits_metric(self):
        """update_batch_status emits cam.import.batch.finished on completed."""
        from unittest.mock import MagicMock, patch

        from app.services.ingestion.batch import update_batch_status

        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "organization_id": str(uuid4()),
                "property_id": str(uuid4()),
                "file_name": "test.csv",
                "file_hash": "abc123",
                "source_system": "yardi",
                "status": "completed",
                "row_count": 100,
                "error_count": 0,
                "error_log": [],
                "created_at": None,
                "updated_at": None,
            }
        ]

        with (
            patch("app.services.ingestion.batch.get_supabase_admin") as mock_db,
            patch("sentry_sdk.metrics.count") as mock_metric,
        ):
            client = mock_db.return_value
            client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
                mock_result
            )

            update_batch_status(uuid4(), uuid4(), "completed", row_count=100)

            mock_metric.assert_called_once_with(
                "cam.import.batch.finished", 1.0, attributes={"status": "completed"}
            )

    def test_update_batch_status_processing_does_not_emit_metric(self):
        """update_batch_status does NOT emit metric for non-terminal statuses."""
        from unittest.mock import MagicMock, patch

        from app.services.ingestion.batch import update_batch_status

        mock_result = MagicMock()
        mock_result.data = [
            {
                "id": str(uuid4()),
                "organization_id": str(uuid4()),
                "property_id": str(uuid4()),
                "file_name": "test.csv",
                "file_hash": "abc123",
                "source_system": "yardi",
                "status": "processing",
                "row_count": 0,
                "error_count": 0,
                "error_log": [],
                "created_at": None,
                "updated_at": None,
            }
        ]

        with (
            patch("app.services.ingestion.batch.get_supabase_admin") as mock_db,
            patch("sentry_sdk.metrics.count") as mock_metric,
        ):
            client = mock_db.return_value
            client.table.return_value.update.return_value.eq.return_value.eq.return_value.execute.return_value = (
                mock_result
            )

            update_batch_status(uuid4(), uuid4(), "processing")

            mock_metric.assert_not_called()
