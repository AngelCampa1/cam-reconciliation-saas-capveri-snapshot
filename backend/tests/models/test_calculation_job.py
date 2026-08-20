"""
Tests for CalculationJob domain models.

Verifies the structure, validation, and behavior of calculation job models.
"""

from datetime import date, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import (
    CalculationJob,
    CalculationJobCreate,
    CalculationJobResponse,
    CalculationJobStatus,
    CalculationJobStatusResponse,
    CalculationJobSummary,
    is_terminal_status,
)


class TestCalculationJobCreate:
    """Tests for CalculationJobCreate model validation."""

    def test_valid_request(self):
        """Test valid calculation job request."""
        data = CalculationJobCreate(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        assert data.force_recalculate is False  # Default value

    def test_with_force_recalculate(self):
        """Test request with force_recalculate flag."""
        data = CalculationJobCreate(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            force_recalculate=True,
        )

        assert data.force_recalculate is True

    def test_invalid_period_end_before_start(self):
        """Test validation rejects period_end before period_start."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationJobCreate(
                property_id=uuid4(),
                period_start=date(2024, 12, 31),
                period_end=date(2024, 1, 1),
            )

        assert "period_end must be after period_start" in str(exc_info.value)

    def test_invalid_period_end_equals_start(self):
        """Test validation rejects period_end equal to period_start."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationJobCreate(
                property_id=uuid4(),
                period_start=date(2024, 1, 1),
                period_end=date(2024, 1, 1),
            )

        assert "period_end must be after period_start" in str(exc_info.value)


class TestCalculationJob:
    """Tests for CalculationJob model."""

    def test_valid_job_pending(self):
        """Test valid pending job."""
        job_id = uuid4()
        org_id = uuid4()
        property_id = uuid4()

        job = CalculationJob(
            id=job_id,
            organization_id=org_id,
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.PENDING,
            force_recalculate=False,
            processed_leases=0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        assert job.id == job_id
        assert job.status == CalculationJobStatus.PENDING
        assert job.total_leases is None
        assert job.processed_leases == 0
        assert job.snapshot_ids == []
        assert job.error_message is None

    def test_valid_job_completed(self):
        """Test valid completed job with results."""
        snapshot_id1 = uuid4()
        snapshot_id2 = uuid4()

        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.COMPLETED,
            force_recalculate=False,
            total_leases=2,
            processed_leases=2,
            snapshot_ids=[snapshot_id1, snapshot_id2],
            created_at=datetime.now(),
            updated_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )

        assert job.status == CalculationJobStatus.COMPLETED
        assert job.total_leases == 2
        assert job.processed_leases == 2
        assert len(job.snapshot_ids) == 2
        assert job.completed_at is not None

    def test_valid_job_failed(self):
        """Test valid failed job with error info."""
        job = CalculationJob(
            id=uuid4(),
            organization_id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.FAILED,
            force_recalculate=False,
            processed_leases=1,
            total_leases=2,
            error_message="Property not found",
            error_details={"type": "NotFoundError", "property_id": "123"},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )

        assert job.status == CalculationJobStatus.FAILED
        assert job.error_message == "Property not found"
        assert job.error_details["type"] == "NotFoundError"


class TestCalculationJobSummary:
    """Tests for CalculationJobSummary model."""

    def test_summary_pending(self):
        """Test summary for pending job."""
        summary = CalculationJobSummary(
            id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.PENDING,
            created_at=datetime.now(),
        )

        assert summary.status == CalculationJobStatus.PENDING
        assert summary.completed_at is None
        assert summary.snapshot_ids == []

    def test_summary_completed(self):
        """Test summary for completed job."""
        snapshot_id = uuid4()
        completed_time = datetime.now()

        summary = CalculationJobSummary(
            id=uuid4(),
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            status=CalculationJobStatus.COMPLETED,
            total_leases=1,
            processed_leases=1,
            snapshot_ids=[snapshot_id],
            created_at=datetime.now(),
            completed_at=completed_time,
        )

        assert summary.status == CalculationJobStatus.COMPLETED
        assert summary.completed_at == completed_time
        assert len(summary.snapshot_ids) == 1


class TestCalculationJobResponse:
    """Tests for CalculationJobResponse model."""

    def test_response_structure(self):
        """Test response structure."""
        job_id = uuid4()

        response = CalculationJobResponse(
            job_id=job_id,
            status=CalculationJobStatus.PENDING,
            message="Job created successfully",
        )

        assert response.job_id == job_id
        assert response.status == CalculationJobStatus.PENDING
        assert "successfully" in response.message


class TestCalculationJobStatusResponse:
    """Tests for CalculationJobStatusResponse model."""

    def test_status_pending(self):
        """Test status response for pending job."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.PENDING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            created_at=datetime.now(),
        )

        assert response.status == CalculationJobStatus.PENDING
        assert response.progress_percentage is None  # No total_leases

    def test_status_running_with_progress(self):
        """Test status response with progress calculation."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.RUNNING,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=10,
            processed_leases=3,
            created_at=datetime.now(),
            started_at=datetime.now(),
        )

        assert response.status == CalculationJobStatus.RUNNING
        assert response.progress_percentage == 30  # 3/10 * 100

    def test_status_completed(self):
        """Test status response for completed job."""
        snapshot_ids = [uuid4(), uuid4()]

        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.COMPLETED,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=2,
            processed_leases=2,
            snapshot_ids=snapshot_ids,
            created_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )

        assert response.status == CalculationJobStatus.COMPLETED
        assert response.progress_percentage == 100
        assert len(response.snapshot_ids) == 2

    def test_status_failed(self):
        """Test status response for failed job."""
        response = CalculationJobStatusResponse(
            job_id=uuid4(),
            status=CalculationJobStatus.FAILED,
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_leases=2,
            processed_leases=1,
            error_message="Calculation error",
            created_at=datetime.now(),
            started_at=datetime.now(),
            completed_at=datetime.now(),
        )

        assert response.status == CalculationJobStatus.FAILED
        assert response.error_message == "Calculation error"
        assert response.progress_percentage == 50  # 1/2 * 100


class TestIsTerminalStatus:
    """Tests for is_terminal_status helper function."""

    def test_pending_not_terminal(self):
        """Test that PENDING status is not terminal."""
        assert not is_terminal_status(CalculationJobStatus.PENDING)

    def test_running_not_terminal(self):
        """Test that RUNNING status is not terminal."""
        assert not is_terminal_status(CalculationJobStatus.RUNNING)

    def test_completed_is_terminal(self):
        """Test that COMPLETED status is terminal."""
        assert is_terminal_status(CalculationJobStatus.COMPLETED)

    def test_failed_is_terminal(self):
        """Test that FAILED status is terminal."""
        assert is_terminal_status(CalculationJobStatus.FAILED)
