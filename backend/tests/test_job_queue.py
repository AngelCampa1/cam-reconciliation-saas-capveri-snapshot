"""
Unit tests for extraction job queue infrastructure.

Tests cover:
- ExtractionJob model validation and properties
- Job status tracking
- Retry logic
- Job creation and updates
- Celery task stub behavior
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, call, patch
from uuid import uuid4

import pytest

from app.models.enums import ExtractionJobPriority, ExtractionJobStatus
from app.services.extraction.job_queue import (
    ExtractionJob,
    ExtractionJobCreate,
    ExtractionJobSummary,
    ExtractionJobUpdate,
    create_extraction_job,
    get_extraction_job,
    process_extraction_task,
    retry_extraction_job,
    update_extraction_job,
)
from app.services.extraction.s3_client import StorageError


class TestExtractionJobModel:
    """Test ExtractionJob Pydantic model."""

    @pytest.fixture
    def job_data(self):
        """Create sample job data."""
        return {
            "id": uuid4(),
            "document_id": uuid4(),
            "organization_id": uuid4(),
            "status": ExtractionJobStatus.PENDING,
            "priority": ExtractionJobPriority.NORMAL,
            "retry_count": 0,
        }

    def test_job_creation_with_defaults(self, job_data):
        """Test creating job with default values."""
        job = ExtractionJob(**job_data)

        assert job.id == job_data["id"]
        assert job.document_id == job_data["document_id"]
        assert job.status == ExtractionJobStatus.PENDING
        assert job.priority == ExtractionJobPriority.NORMAL
        assert job.retry_count == 0
        assert job.error_message is None
        assert job.result_data is None
        assert isinstance(job.created_at, datetime)
        assert job.started_at is None
        assert job.completed_at is None

    def test_job_with_all_fields(self):
        """Test job with all fields populated."""
        now = datetime.utcnow()
        job = ExtractionJob(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
            status=ExtractionJobStatus.COMPLETED,
            priority=ExtractionJobPriority.HIGH,
            retry_count=1,
            error_message=None,
            result_data={"pro_rata_share": "0.05"},
            created_at=now,
            started_at=now + timedelta(seconds=10),
            completed_at=now + timedelta(minutes=2),
        )

        assert job.status == ExtractionJobStatus.COMPLETED
        assert job.priority == ExtractionJobPriority.HIGH
        assert job.retry_count == 1
        assert job.result_data == {"pro_rata_share": "0.05"}
        assert job.started_at is not None
        assert job.completed_at is not None

    def test_retry_count_validation(self, job_data):
        """Test retry count must be between 0 and 3."""
        # Valid retry counts
        for count in [0, 1, 2, 3]:
            job = ExtractionJob(**{**job_data, "retry_count": count})
            assert job.retry_count == count

        # Invalid retry count
        with pytest.raises(ValueError):
            ExtractionJob(**{**job_data, "retry_count": 4})

    def test_is_terminal_property(self):
        """Test is_terminal property identifies completed/failed jobs."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        # Terminal states
        completed = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.COMPLETED,
        )
        assert completed.is_terminal

        failed = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.FAILED,
        )
        assert failed.is_terminal

        # Non-terminal states
        pending = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.PENDING,
        )
        assert not pending.is_terminal

        processing = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.PROCESSING,
        )
        assert not processing.is_terminal

        retrying = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.RETRYING,
        )
        assert not retrying.is_terminal

    def test_can_retry_property(self):
        """Test can_retry property checks retry eligibility."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        # Can retry - failed with retries remaining
        for retry_count in [0, 1, 2]:
            job = ExtractionJob(
                id=job_id,
                document_id=doc_id,
                organization_id=org_id,
                status=ExtractionJobStatus.FAILED,
                retry_count=retry_count,
            )
            assert job.can_retry

        # Cannot retry - max retries reached
        max_retries = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.FAILED,
            retry_count=3,
        )
        assert not max_retries.can_retry

        # Cannot retry - not failed
        completed = ExtractionJob(
            id=job_id,
            document_id=doc_id,
            organization_id=org_id,
            status=ExtractionJobStatus.COMPLETED,
            retry_count=0,
        )
        assert not completed.can_retry

    def test_processing_duration_property(self):
        """Test processing_duration calculates job duration."""
        now = datetime.utcnow()
        start = now + timedelta(seconds=10)
        end = now + timedelta(minutes=2, seconds=15)

        # Job with duration
        job = ExtractionJob(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
            started_at=start,
            completed_at=end,
        )
        assert job.processing_duration == timedelta(minutes=2, seconds=5)

        # Job without completion
        incomplete = ExtractionJob(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
            started_at=start,
            completed_at=None,
        )
        assert incomplete.processing_duration is None

        # Job not started
        not_started = ExtractionJob(
            id=uuid4(),
            document_id=uuid4(),
            organization_id=uuid4(),
        )
        assert not_started.processing_duration is None


class TestExtractionJobCreate:
    """Test ExtractionJobCreate model."""

    def test_create_request_minimal(self):
        """Test minimal create request."""
        create = ExtractionJobCreate(
            document_id=uuid4(),
            organization_id=uuid4(),
        )

        assert create.priority == ExtractionJobPriority.NORMAL

    def test_create_request_with_priority(self):
        """Test create request with custom priority."""
        create = ExtractionJobCreate(
            document_id=uuid4(),
            organization_id=uuid4(),
            priority=ExtractionJobPriority.URGENT,
        )

        assert create.priority == ExtractionJobPriority.URGENT


class TestExtractionJobUpdate:
    """Test ExtractionJobUpdate model."""

    def test_update_status_only(self):
        """Test updating only status."""
        update = ExtractionJobUpdate(status=ExtractionJobStatus.PROCESSING)

        assert update.status == ExtractionJobStatus.PROCESSING
        assert update.error_message is None
        assert update.result_data is None

    def test_update_with_error(self):
        """Test updating with error message."""
        update = ExtractionJobUpdate(
            status=ExtractionJobStatus.FAILED,
            error_message="API rate limit exceeded",
        )

        assert update.status == ExtractionJobStatus.FAILED
        assert update.error_message == "API rate limit exceeded"

    def test_update_with_result(self):
        """Test updating with result data."""
        result = {"pro_rata_share": "0.0525", "base_year": 2020}
        update = ExtractionJobUpdate(
            status=ExtractionJobStatus.COMPLETED,
            result_data=result,
        )

        assert update.status == ExtractionJobStatus.COMPLETED
        assert update.result_data == result


class TestExtractionJobSummary:
    """Test ExtractionJobSummary model."""

    def test_summary_fields(self):
        """Test summary contains essential fields."""
        now = datetime.utcnow()
        summary = ExtractionJobSummary(
            id=uuid4(),
            document_id=uuid4(),
            status=ExtractionJobStatus.COMPLETED,
            priority=ExtractionJobPriority.HIGH,
            retry_count=1,
            created_at=now,
            completed_at=now + timedelta(minutes=2),
            error_message=None,
        )

        assert summary.status == ExtractionJobStatus.COMPLETED
        assert summary.priority == ExtractionJobPriority.HIGH
        assert summary.retry_count == 1
        assert summary.completed_at is not None


class TestProcessExtractionTask:
    """Test Celery task behavior."""

    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_by_document_id_sync")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_task_accepts_legacy_document_id_argument(
        self,
        mock_update,
        mock_run_document_extraction,
        mock_get_job,
        mock_get_job_by_document,
        mock_get_supabase,
    ):
        """Task resolves queued pre-deploy messages that passed document_id."""
        job_id = uuid4()
        doc_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = None
        mock_get_job_by_document.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=uuid4()
        )
        mock_run_document_extraction.return_value = ({"profile": {}}, 123)

        result = process_extraction_task.run(str(doc_id), priority=5)

        assert result["status"] == "completed"
        mock_get_job_by_document.assert_called_once_with(doc_id)
        assert mock_update.call_args_list[0][0][0] == job_id
        assert mock_run_document_extraction.call_args[0][0] == doc_id

    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_task_processes_successfully(
        self, mock_update, mock_run_document_extraction, mock_get_job, mock_get_supabase
    ):
        """Task should update job and finish for successful extraction."""
        job_id = uuid4()
        doc_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=uuid4()
        )
        mock_run_document_extraction.return_value = ({"profile": {}}, 123)

        result = process_extraction_task.run(str(job_id), priority=5)

        assert result["status"] == "completed"
        assert mock_update.call_count == 2
        mock_run_document_extraction.assert_called_once()
        assert mock_run_document_extraction.call_args[0][0] == doc_id

    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_task_retries_transient_errors(
        self, mock_update, mock_run_document_extraction, mock_get_job, mock_get_supabase
    ):
        """Task marks job as retrying and calls retry for transient errors."""
        job_id = uuid4()
        doc_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=uuid4()
        )
        mock_run_document_extraction.side_effect = StorageError("throttled")
        retry_exc = RuntimeError("scheduled retry")

        with (
            patch.object(process_extraction_task.request, "retries", 1, create=True),
            patch.object(process_extraction_task, "max_retries", 3),
            patch.object(
                process_extraction_task, "retry", side_effect=retry_exc
            ) as mock_retry,
        ):
            with pytest.raises(RuntimeError, match="scheduled retry"):
                process_extraction_task.run(str(job_id), priority=5)

        assert mock_retry.call_count == 1
        assert mock_update.call_count == 2
        update_payload = mock_update.call_args_list[1][0][1]
        assert update_payload.status == ExtractionJobStatus.RETRYING
        assert update_payload.retry_count == 2

    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_task_fails_when_retries_exhausted(
        self, mock_update, mock_run_document_extraction, mock_get_job, mock_get_supabase
    ):
        """Task marks job as failed after max retries for transient errors."""
        job_id = uuid4()
        doc_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=uuid4()
        )
        mock_run_document_extraction.side_effect = StorageError("still throttled")

        with (
            patch.object(process_extraction_task.request, "retries", 3, create=True),
            patch.object(process_extraction_task, "max_retries", 3),
        ):
            with pytest.raises(StorageError, match="still throttled"):
                process_extraction_task.run(str(job_id), priority=5)

        assert mock_update.call_count == 2
        update_payload = mock_update.call_args_list[1][0][1]
        assert update_payload.status == ExtractionJobStatus.FAILED
        mock_get_supabase.return_value.table.return_value.update.assert_called()

    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_task_marks_document_failed_on_non_transient_error(
        self, mock_update, mock_run_document_extraction, mock_get_job, mock_get_supabase
    ):
        """Task updates documents table and job status for non-transient errors."""
        job_id = uuid4()
        doc_id = uuid4()
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=uuid4()
        )
        mock_run_document_extraction.side_effect = ValueError("bad payload")

        with pytest.raises(ValueError, match="bad payload"):
            process_extraction_task.run(str(job_id), priority=5)

        assert mock_update.call_count == 2
        update_payload = mock_update.call_args_list[1][0][1]
        assert update_payload.status == ExtractionJobStatus.FAILED
        mock_client.table.return_value.update.assert_called()

    @patch("app.services.extraction.job_queue.process_extraction_task.apply_async")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @pytest.mark.asyncio
    async def test_create_extraction_job_enqueues_task(
        self, mock_get_supabase, mock_apply_async
    ):
        """Job creation should enqueue celery task."""
        doc_id = uuid4()
        org_id = uuid4()
        mock_client = MagicMock()
        mock_client.table.return_value.insert.return_value.execute.return_value.data = [
            {
                "id": str(uuid4()),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "pending",
                "priority": 5,
                "retry_count": 0,
                "error_message": None,
                "result_data": None,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": None,
                "completed_at": None,
                "next_retry_at": None,
            }
        ]
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": str(doc_id)}
        ]
        mock_get_supabase.return_value = mock_client
        mock_apply_async.return_value = MagicMock(id="celery-task-id")

        create_req = ExtractionJobCreate(
            document_id=doc_id,
            organization_id=org_id,
            priority=ExtractionJobPriority.NORMAL,
        )
        job = await create_extraction_job(create_req)
        assert job.document_id == doc_id
        mock_apply_async.assert_called_once()
        assert mock_apply_async.call_args.kwargs["args"] == [str(job.id)]

    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    @patch("app.services.extraction.job_queue.process_extraction_task.apply_async")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @pytest.mark.asyncio
    async def test_create_extraction_job_marks_document_failed_when_enqueue_fails(
        self, mock_get_supabase, mock_apply_async, mock_update_job
    ):
        """Failed broker enqueue leaves document/job in failed state."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()
        mock_client = MagicMock()
        mock_client.table.return_value.insert.return_value.execute.return_value.data = [
            {
                "id": str(job_id),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "pending",
                "priority": 5,
                "retry_count": 0,
                "error_message": None,
                "result_data": None,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": None,
                "completed_at": None,
                "next_retry_at": None,
            }
        ]
        mock_get_supabase.return_value = mock_client
        mock_apply_async.side_effect = RuntimeError("broker down")

        with pytest.raises(RuntimeError, match="broker down"):
            await create_extraction_job(
                ExtractionJobCreate(document_id=doc_id, organization_id=org_id)
            )

        document_update = mock_client.table.return_value.update.call_args[0][0]
        assert document_update["status"] == "failed"
        assert "Failed to enqueue extraction job" in document_update["error_message"]
        mock_update_job.assert_called_once()
        assert mock_update_job.call_args[0][0] == job_id


class TestProcessExtractionTaskAnalytics:
    """Test PostHog lifecycle emissions from the Celery extraction task."""

    @staticmethod
    def _event_names(mock_capture):
        return [c.args[0] for c in mock_capture.call_args_list]

    @staticmethod
    def _props_for(mock_capture, event_name):
        for c in mock_capture.call_args_list:
            if c.args[0] == event_name:
                return c.kwargs["properties"]
        raise AssertionError(f"event {event_name} not captured")

    @patch("app.services.extraction.job_queue.capture_backend_event_sync")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_success_emits_started_and_completed(
        self,
        mock_update,
        mock_run_document_extraction,
        mock_get_job,
        mock_get_supabase,
        mock_capture,
    ):
        """Successful run emits started + completed with token and field counts."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=org_id
        )
        mock_run_document_extraction.return_value = (
            {"profile": {"base_rent": 1, "term_months": 12, "tenant_id": "t"}},
            123,
        )

        process_extraction_task.run(str(job_id), priority=5)

        assert self._event_names(mock_capture) == [
            "lease_extraction_job_started",
            "lease_extraction_job_completed",
        ]
        for c in mock_capture.call_args_list:
            assert c.kwargs["organization_id"] == str(org_id)
            assert c.kwargs["distinct_id"] == f"org:{org_id}"
        completed = self._props_for(mock_capture, "lease_extraction_job_completed")
        assert completed["tokens_used"] == 123
        assert completed["field_count"] == 3
        assert completed["document_id"] == str(doc_id)

    @patch("app.services.extraction.job_queue.capture_backend_event_sync")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_transient_retry_emits_started_and_retrying(
        self,
        mock_update,
        mock_run_document_extraction,
        mock_get_job,
        mock_get_supabase,
        mock_capture,
    ):
        """A scheduled retry emits started + retrying with class-name error type."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=org_id
        )
        mock_run_document_extraction.side_effect = StorageError("secret throttle blob")

        with (
            patch.object(process_extraction_task.request, "retries", 1, create=True),
            patch.object(process_extraction_task, "max_retries", 3),
            patch.object(
                process_extraction_task, "retry", side_effect=RuntimeError("retry")
            ),
        ):
            with pytest.raises(RuntimeError, match="retry"):
                process_extraction_task.run(str(job_id), priority=5)

        assert self._event_names(mock_capture) == [
            "lease_extraction_job_started",
            "lease_extraction_job_retrying",
        ]
        retrying = self._props_for(mock_capture, "lease_extraction_job_retrying")
        assert retrying["error_type"] == "StorageError"
        assert retrying["retry_count"] == 1
        assert retrying["delay_seconds"] == 60 * (2**1)
        self._assert_no_raw_error_string(mock_capture, "secret throttle blob")

    @patch("app.services.extraction.job_queue.capture_backend_event_sync")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_exhausted_retries_emits_started_and_failed(
        self,
        mock_update,
        mock_run_document_extraction,
        mock_get_job,
        mock_get_supabase,
        mock_capture,
    ):
        """Exhausted transient retries emit started + failed."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=org_id
        )
        mock_run_document_extraction.side_effect = StorageError("secret throttle blob")

        with (
            patch.object(process_extraction_task.request, "retries", 3, create=True),
            patch.object(process_extraction_task, "max_retries", 3),
        ):
            with pytest.raises(StorageError, match="secret throttle blob"):
                process_extraction_task.run(str(job_id), priority=5)

        assert self._event_names(mock_capture) == [
            "lease_extraction_job_started",
            "lease_extraction_job_failed",
        ]
        failed = self._props_for(mock_capture, "lease_extraction_job_failed")
        assert failed["error_type"] == "StorageError"
        assert failed["retry_count"] == 3
        self._assert_no_raw_error_string(mock_capture, "secret throttle blob")

    @patch("app.services.extraction.job_queue.capture_backend_event_sync")
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.get_extraction_job_sync")
    @patch("app.services.extraction.job_queue.run_document_extraction")
    @patch("app.services.extraction.job_queue.update_extraction_job_sync")
    def test_terminal_exception_emits_started_and_failed(
        self,
        mock_update,
        mock_run_document_extraction,
        mock_get_job,
        mock_get_supabase,
        mock_capture,
    ):
        """A non-transient exception emits started + failed with class name only."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()
        mock_get_supabase.return_value = MagicMock()
        mock_get_job.return_value = ExtractionJob(
            id=job_id, document_id=doc_id, organization_id=org_id
        )
        mock_run_document_extraction.side_effect = ValueError("raw secret payload")

        with pytest.raises(ValueError, match="raw secret payload"):
            process_extraction_task.run(str(job_id), priority=5)

        assert self._event_names(mock_capture) == [
            "lease_extraction_job_started",
            "lease_extraction_job_failed",
        ]
        failed = self._props_for(mock_capture, "lease_extraction_job_failed")
        assert failed["error_type"] == "ValueError"
        self._assert_no_raw_error_string(mock_capture, "raw secret payload")

    @staticmethod
    def _assert_no_raw_error_string(mock_capture, raw_message):
        for c in mock_capture.call_args_list:
            for value in c.kwargs["properties"].values():
                assert raw_message not in str(value)


class TestJobManagementFunctions:
    """Test job management async functions."""

    @pytest.fixture
    def mock_supabase(self):
        """Create a mock Supabase client."""
        mock_client = MagicMock()
        return mock_client

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.process_extraction_task.apply_async")
    async def test_create_extraction_job(self, mock_apply_async, mock_get_supabase):
        """Test creating extraction job."""
        doc_id = uuid4()
        org_id = uuid4()

        create_req = ExtractionJobCreate(
            document_id=doc_id,
            organization_id=org_id,
            priority=ExtractionJobPriority.HIGH,
        )

        # Mock the database insert response
        mock_client = MagicMock()
        mock_client.table.return_value.insert.return_value.execute.return_value.data = [
            {
                "id": str(doc_id),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "pending",
                "priority": 10,
                "retry_count": 0,
                "error_message": None,
                "result_data": None,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": None,
                "completed_at": None,
                "next_retry_at": None,
            }
        ]
        mock_get_supabase.return_value = mock_client
        mock_apply_async.return_value = MagicMock(id="task-1")

        job = await create_extraction_job(create_req)

        assert job.document_id == create_req.document_id
        assert job.organization_id == create_req.organization_id
        assert job.status == ExtractionJobStatus.PENDING
        assert job.priority == ExtractionJobPriority.HIGH
        assert job.retry_count == 0
        mock_apply_async.assert_called_once()
        assert mock_apply_async.call_args.kwargs["args"] == [str(job.id)]

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_get_extraction_job_returns_none(self, mock_get_supabase):
        """Test get_extraction_job returns None when job not found."""
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )
        mock_get_supabase.return_value = mock_client

        job = await get_extraction_job(uuid4())
        assert job is None

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_update_extraction_job_returns_none(self, mock_get_supabase):
        """Test update_extraction_job returns None when job not found."""
        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = (
            None
        )
        mock_get_supabase.return_value = mock_client

        job = await update_extraction_job(
            uuid4(),
            ExtractionJobUpdate(status=ExtractionJobStatus.COMPLETED),
        )
        assert job is None

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_retry_extraction_job_with_no_job(self, mock_get_supabase):
        """Test retry_extraction_job with non-existent job."""
        # Mock get_extraction_job to return None
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = (
            None
        )
        mock_get_supabase.return_value = mock_client

        job = await retry_extraction_job(uuid4())
        assert job is None


class TestJobPriorityEnum:
    """Test ExtractionJobPriority enum."""

    def test_priority_values(self):
        """Test priority enum values."""
        assert ExtractionJobPriority.LOW.value == 0
        assert ExtractionJobPriority.NORMAL.value == 5
        assert ExtractionJobPriority.HIGH.value == 10
        assert ExtractionJobPriority.URGENT.value == 15

    def test_priority_ordering(self):
        """Test priority enum ordering (higher = more urgent)."""
        assert ExtractionJobPriority.URGENT > ExtractionJobPriority.HIGH
        assert ExtractionJobPriority.HIGH > ExtractionJobPriority.NORMAL
        assert ExtractionJobPriority.NORMAL > ExtractionJobPriority.LOW


class TestJobStatusEnum:
    """Test ExtractionJobStatus enum."""

    def test_status_values(self):
        """Test status enum values."""
        assert ExtractionJobStatus.PENDING.value == "pending"
        assert ExtractionJobStatus.PROCESSING.value == "processing"
        assert ExtractionJobStatus.COMPLETED.value == "completed"
        assert ExtractionJobStatus.FAILED.value == "failed"
        assert ExtractionJobStatus.RETRYING.value == "retrying"

    def test_all_statuses_present(self):
        """Test all required statuses are defined."""
        statuses = list(ExtractionJobStatus)
        assert len(statuses) == 5
        assert ExtractionJobStatus.PENDING in statuses
        assert ExtractionJobStatus.PROCESSING in statuses
        assert ExtractionJobStatus.COMPLETED in statuses
        assert ExtractionJobStatus.FAILED in statuses
        assert ExtractionJobStatus.RETRYING in statuses


class TestJobQueueEdgeCases:
    """Edge case tests for job queue functions to increase coverage."""

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_get_extraction_job_returns_job(self, mock_get_supabase):
        """Test get_extraction_job returns job when found (lines 273-274)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": str(job_id),
            "document_id": str(doc_id),
            "organization_id": str(org_id),
            "status": "processing",
            "priority": 5,
            "retry_count": 0,
            "error_message": None,
            "result_data": None,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
            "next_retry_at": None,
        }
        mock_get_supabase.return_value = mock_client

        job = await get_extraction_job(job_id)

        assert job is not None
        assert job.document_id == doc_id
        assert job.status == ExtractionJobStatus.PROCESSING

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_get_extraction_job_filters_by_organization(self, mock_get_supabase):
        """User-facing job lookups include organization scope in the query."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        query = MagicMock()
        query.select.return_value = query
        query.eq.return_value = query
        query.maybe_single.return_value = query
        query.execute.return_value.data = {
            "id": str(job_id),
            "document_id": str(doc_id),
            "organization_id": str(org_id),
            "status": "processing",
            "priority": 5,
            "retry_count": 0,
            "error_message": None,
            "result_data": None,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": None,
            "next_retry_at": None,
        }
        mock_client.table.return_value = query
        mock_get_supabase.return_value = mock_client

        job = await get_extraction_job(job_id, organization_id=org_id)

        assert job is not None
        query.eq.assert_has_calls(
            [
                call("id", str(job_id)),
                call("organization_id", str(org_id)),
            ]
        )

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_update_job_auto_populates_started_at(self, mock_get_supabase):
        """Test update auto-populates started_at when status=PROCESSING (line 313)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": str(job_id),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "processing",
                "priority": 5,
                "retry_count": 0,
                "error_message": None,
                "result_data": None,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": None,
                "next_retry_at": None,
            }
        ]
        mock_get_supabase.return_value = mock_client

        job = await update_extraction_job(
            job_id, ExtractionJobUpdate(status=ExtractionJobStatus.PROCESSING)
        )

        assert job is not None
        assert job.status == ExtractionJobStatus.PROCESSING
        # Verify update was called with started_at auto-populated
        call_args = mock_client.table.return_value.update.call_args[0][0]
        assert "started_at" in call_args

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_update_job_auto_populates_completed_at(self, mock_get_supabase):
        """Test update auto-populates completed_at for COMPLETED status (lines 314-318)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": str(job_id),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "completed",
                "priority": 5,
                "retry_count": 0,
                "error_message": None,
                "result_data": {"pro_rata_share": "0.05"},
                "created_at": datetime.utcnow().isoformat(),
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat(),
                "next_retry_at": None,
            }
        ]
        mock_get_supabase.return_value = mock_client

        job = await update_extraction_job(
            job_id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.COMPLETED,
                result_data={"pro_rata_share": "0.05"},
            ),
        )

        assert job is not None
        assert job.status == ExtractionJobStatus.COMPLETED
        # Verify completed_at was auto-populated
        call_args = mock_client.table.return_value.update.call_args[0][0]
        assert "completed_at" in call_args

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_update_job_auto_populates_completed_at_for_failed(
        self, mock_get_supabase
    ):
        """Test update auto-populates completed_at for FAILED status (lines 314-318)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {
                "id": str(job_id),
                "document_id": str(doc_id),
                "organization_id": str(org_id),
                "status": "failed",
                "priority": 5,
                "retry_count": 0,
                "error_message": "API error",
                "result_data": None,
                "created_at": datetime.utcnow().isoformat(),
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat(),
                "next_retry_at": None,
            }
        ]
        mock_get_supabase.return_value = mock_client

        job = await update_extraction_job(
            job_id,
            ExtractionJobUpdate(
                status=ExtractionJobStatus.FAILED, error_message="API error"
            ),
        )

        assert job is not None
        assert job.status == ExtractionJobStatus.FAILED
        # Verify completed_at was auto-populated
        call_args = mock_client.table.return_value.update.call_args[0][0]
        assert "completed_at" in call_args

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    async def test_retry_job_that_cannot_retry(self, mock_get_supabase):
        """Test retry_extraction_job raises error when job can't retry (line 366-370)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        # Job at max retries
        mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": str(job_id),
            "document_id": str(doc_id),
            "organization_id": str(org_id),
            "status": "failed",
            "priority": 5,
            "retry_count": 3,  # Max retries reached
            "error_message": "API error",
            "result_data": None,
            "created_at": datetime.utcnow().isoformat(),
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "next_retry_at": None,
        }
        mock_get_supabase.return_value = mock_client

        with pytest.raises(ValueError, match="cannot be retried"):
            await retry_extraction_job(job_id)

    @pytest.mark.asyncio
    @patch("app.services.extraction.job_queue.get_supabase_admin")
    @patch("app.services.extraction.job_queue.process_extraction_task.apply_async")
    async def test_retry_job_success(self, mock_apply_async, mock_get_supabase):
        """Test successful retry_extraction_job (lines 372-393)."""
        job_id = uuid4()
        doc_id = uuid4()
        org_id = uuid4()

        mock_client = MagicMock()
        call_count = [0]

        def mock_execute():
            call_count[0] += 1
            result = MagicMock()
            if call_count[0] == 1:
                # First call: get_extraction_job (initial fetch)
                result.data = {
                    "id": str(job_id),
                    "document_id": str(doc_id),
                    "organization_id": str(org_id),
                    "status": "failed",
                    "priority": 5,
                    "retry_count": 1,  # Can still retry
                    "error_message": "API error",
                    "result_data": None,
                    "created_at": datetime.utcnow().isoformat(),
                    "started_at": datetime.utcnow().isoformat(),
                    "completed_at": datetime.utcnow().isoformat(),
                    "next_retry_at": None,
                }
            elif call_count[0] == 2:
                # Second call: update_extraction_job
                result.data = [
                    {
                        "id": str(job_id),
                        "document_id": str(doc_id),
                        "organization_id": str(org_id),
                        "status": "retrying",
                        "priority": 5,
                        "retry_count": 2,
                        "error_message": "API error",
                        "result_data": None,
                        "created_at": datetime.utcnow().isoformat(),
                        "started_at": datetime.utcnow().isoformat(),
                        "completed_at": datetime.utcnow().isoformat(),
                        "next_retry_at": datetime.utcnow().isoformat(),
                    }
                ]
            else:
                # Third call: get_extraction_job (final fetch)
                result.data = {
                    "id": str(job_id),
                    "document_id": str(doc_id),
                    "organization_id": str(org_id),
                    "status": "retrying",
                    "priority": 5,
                    "retry_count": 2,
                    "error_message": "API error",
                    "result_data": None,
                    "created_at": datetime.utcnow().isoformat(),
                    "started_at": datetime.utcnow().isoformat(),
                    "completed_at": datetime.utcnow().isoformat(),
                    "next_retry_at": datetime.utcnow().isoformat(),
                }
            return result

        mock_client.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.side_effect = (
            mock_execute
        )
        mock_client.table.return_value.update.return_value.eq.return_value.execute.side_effect = (
            mock_execute
        )
        mock_get_supabase.return_value = mock_client
        mock_apply_async.return_value = MagicMock(id="task-2")

        job = await retry_extraction_job(job_id)

        assert job is not None
        assert job.status == ExtractionJobStatus.RETRYING
        assert job.retry_count == 2
