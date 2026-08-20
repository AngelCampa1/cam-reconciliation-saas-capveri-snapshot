"""Tests for CalculationJob domain models.

These tests verify that the Pydantic models correctly validate
calculation job data, including period validation, progress calculation,
and status tracking.
"""

from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.calculation_job import (
    CalculationJob,
    CalculationJobCreate,
    CalculationJobResponse,
    CalculationJobStatusResponse,
    CalculationJobSummary,
    is_terminal_status,
)
from app.models.enums import CalculationJobStatus


class TestCalculationJobCreate:
    """Tests for CalculationJobCreate DTO."""

    def test_valid_creation(self) -> None:
        """Valid job creation data is accepted."""
        job = CalculationJobCreate(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        assert job.force_recalculate is False  # Default

    def test_force_recalculate_can_be_true(self) -> None:
        """force_recalculate can be set to True."""
        job = CalculationJobCreate(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
        )
        assert job.force_recalculate is True

    def test_period_end_must_be_after_start(self) -> None:
        """period_end must be after period_start."""
        with pytest.raises(ValueError) as exc_info:
            CalculationJobCreate(
                property_id=uuid4(),
                period_start=date(2024, 12, 31),
                period_end=date(2024, 1, 1),
            )
        assert "must be after" in str(exc_info.value)

    def test_period_end_cannot_equal_start(self) -> None:
        """period_end cannot equal period_start."""
        same_date = date(2024, 6, 15)
        with pytest.raises(ValueError) as exc_info:
            CalculationJobCreate(
                property_id=uuid4(),
                period_start=same_date,
                period_end=same_date,
            )
        assert "must be after" in str(exc_info.value)

    def test_required_fields(self) -> None:
        """All required fields must be provided."""
        with pytest.raises(ValidationError):
            CalculationJobCreate()  # type: ignore[call-arg]


class TestCalculationJob:
    """Tests for full CalculationJob model."""

    def test_minimal_job(self) -> None:
        """Job can be created with minimal fields."""
        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.PENDING,
            force_recalculate=False,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert job.processed_leases == 0
        assert job.total_leases is None
        assert job.snapshot_ids == []
        assert job.error_message is None

    def test_job_with_progress(self) -> None:
        """Job can track progress."""
        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.RUNNING,
            force_recalculate=False,
            total_leases=10,
            processed_leases=5,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert job.total_leases == 10
        assert job.processed_leases == 5

    def test_job_with_results(self) -> None:
        """Completed job includes snapshot IDs."""
        snapshot_ids = [uuid4(), uuid4(), uuid4()]
        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.COMPLETED,
            force_recalculate=False,
            total_leases=3,
            processed_leases=3,
            snapshot_ids=snapshot_ids,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
        )
        assert job.snapshot_ids == snapshot_ids
        assert job.completed_at is not None

    def test_job_with_error(self) -> None:
        """Failed job includes error details."""
        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.FAILED,
            force_recalculate=False,
            error_message="Database connection failed",
            error_details={"code": "DB_ERROR", "retry_count": 3},
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert job.error_message == "Database connection failed"
        assert job.error_details["code"] == "DB_ERROR"

    def test_from_attributes(self) -> None:
        """Job can be created from ORM attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.organization_id = uuid4()
                self.property_id = uuid4()
                self.period_start = date(2024, 1, 1)
                self.period_end = date(2024, 12, 31)
                self.status = "completed"
                self.force_recalculate = False
                self.total_leases = 5
                self.processed_leases = 5
                self.snapshot_ids = [str(uuid4())]
                self.error_message = None
                self.error_details = None
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)
                self.started_at = datetime.now(UTC)
                self.completed_at = datetime.now(UTC)

        orm_obj = MockORM()
        job = CalculationJob.model_validate(orm_obj)
        assert job.id == orm_obj.id
        assert job.status == CalculationJobStatus.COMPLETED


class TestCalculationJobSummary:
    """Tests for CalculationJobSummary model."""

    def test_summary_fields(self) -> None:
        """Summary contains essential fields."""
        summary = CalculationJobSummary(
            id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.PENDING,
            created_at=datetime.now(UTC),
        )
        assert summary.total_leases is None
        assert summary.processed_leases == 0
        assert summary.snapshot_ids == []


class TestCalculationJobResponse:
    """Tests for CalculationJobResponse model."""

    def test_response_creation(self) -> None:
        """Response includes job ID and message."""
        response = CalculationJobResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.PENDING,
            message="Calculation job created successfully",
        )
        assert response.message == "Calculation job created successfully"
        assert response.status == CalculationJobStatus.PENDING


class TestCalculationJobStatusResponse:
    """Tests for CalculationJobStatusResponse model."""

    def test_progress_calculation_with_total(self) -> None:
        """Progress percentage is calculated when total_leases is set."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.RUNNING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=10,
            processed_leases=7,
            created_at=datetime.now(UTC),
        )
        assert response.progress_percentage == 70

    def test_progress_calculation_zero_processed(self) -> None:
        """Progress is 0% when no leases processed."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.PENDING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=10,
            processed_leases=0,
            created_at=datetime.now(UTC),
        )
        assert response.progress_percentage == 0

    def test_progress_calculation_complete(self) -> None:
        """Progress is 100% when all leases processed."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.COMPLETED,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=5,
            processed_leases=5,
            created_at=datetime.now(UTC),
        )
        assert response.progress_percentage == 100

    def test_progress_none_when_total_unknown(self) -> None:
        """Progress is None when total_leases not set."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.RUNNING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=None,
            processed_leases=3,
            created_at=datetime.now(UTC),
        )
        assert response.progress_percentage is None

    def test_progress_none_when_total_zero(self) -> None:
        """Progress is None when total_leases is 0."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.RUNNING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=0,
            processed_leases=0,
            created_at=datetime.now(UTC),
        )
        assert response.progress_percentage is None


class TestIsTerminalStatus:
    """Tests for is_terminal_status function."""

    def test_completed_is_terminal(self) -> None:
        """COMPLETED status is terminal."""
        assert is_terminal_status(CalculationJobStatus.COMPLETED) is True

    def test_failed_is_terminal(self) -> None:
        """FAILED status is terminal."""
        assert is_terminal_status(CalculationJobStatus.FAILED) is True

    def test_pending_is_not_terminal(self) -> None:
        """PENDING status is not terminal."""
        assert is_terminal_status(CalculationJobStatus.PENDING) is False

    def test_running_is_not_terminal(self) -> None:
        """RUNNING status is not terminal."""
        assert is_terminal_status(CalculationJobStatus.RUNNING) is False


class TestCalculationJobImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """CalculationJob models can be imported from app.models."""
        from app.models import (
            CalculationJob,
            CalculationJobCreate,
            CalculationJobResponse,
            CalculationJobStatus,
            CalculationJobStatusResponse,
            CalculationJobSummary,
        )

        assert CalculationJob is not None
        assert CalculationJobCreate is not None
        assert CalculationJobSummary is not None
        assert CalculationJobResponse is not None
        assert CalculationJobStatusResponse is not None
        assert CalculationJobStatus is not None
