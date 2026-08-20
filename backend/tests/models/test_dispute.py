"""Tests for dispute workflow models."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.dispute import (
    AddCommentRequest,
    CreateDisputeRequest,
    Dispute,
    DisputeAttachment,
    DisputeCategory,
    DisputeComment,
    DisputeStatus,
    RateLimitError,
    UpdateStatusRequest,
)


class TestDisputeEnums:
    """Tests for dispute enum types."""

    def test_dispute_status_values(self) -> None:
        """Test all dispute status enum values exist."""
        assert DisputeStatus.OPEN.value == "open"
        assert DisputeStatus.UNDER_REVIEW.value == "under_review"
        assert DisputeStatus.RESOLVED.value == "resolved"
        assert DisputeStatus.REJECTED.value == "rejected"
        assert DisputeStatus.CLOSED.value == "closed"
        assert len(DisputeStatus) == 5

    def test_dispute_category_values(self) -> None:
        """Test all dispute category enum values exist."""
        assert DisputeCategory.CALCULATION_ERROR.value == "calculation_error"
        assert DisputeCategory.MISSING_CREDIT.value == "missing_credit"
        assert DisputeCategory.INCORRECT_AREA.value == "incorrect_area"
        assert DisputeCategory.BASE_YEAR_ISSUE.value == "base_year_issue"
        assert DisputeCategory.BILLING_QUESTION.value == "billing_question"
        assert DisputeCategory.OTHER.value == "other"
        assert len(DisputeCategory) == 6


class TestCreateDisputeRequest:
    """Tests for CreateDisputeRequest DTO."""

    def test_valid_request(self) -> None:
        """Test creating a valid dispute request."""
        request = CreateDisputeRequest(
            statement_id=uuid4(),
            category=DisputeCategory.CALCULATION_ERROR,
            description="There is an error in the CAM calculation for Q4 2024.",
        )
        assert request.category == DisputeCategory.CALCULATION_ERROR
        assert len(request.description) > 10

    def test_description_too_short(self) -> None:
        """Test validation fails when description is too short."""
        with pytest.raises(ValidationError) as exc_info:
            CreateDisputeRequest(
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="Too short",
            )
        assert "at least 10 characters" in str(exc_info.value).lower()

    def test_description_too_long(self) -> None:
        """Test validation fails when description exceeds maximum length."""
        with pytest.raises(ValidationError):
            CreateDisputeRequest(
                statement_id=uuid4(),
                category=DisputeCategory.CALCULATION_ERROR,
                description="x" * 5001,  # Max is 5000
            )


class TestDispute:
    """Tests for Dispute model."""

    def test_valid_dispute(self) -> None:
        """Test creating a valid dispute."""
        dispute = Dispute(
            id=uuid4(),
            tenant_user_id=uuid4(),
            statement_id=uuid4(),
            organization_id=uuid4(),
            category=DisputeCategory.CALCULATION_ERROR.value,
            description="There is an error in the calculation.",
            status=DisputeStatus.OPEN.value,
            assigned_to=None,
            resolution_summary=None,
            resolved_at=None,
            resolved_by=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert dispute.status == DisputeStatus.OPEN.value
        assert dispute.category == DisputeCategory.CALCULATION_ERROR.value


class TestDisputeComment:
    """Tests for DisputeComment model."""

    def test_valid_comment(self) -> None:
        """Test creating a valid dispute comment."""
        comment = DisputeComment(
            id=uuid4(),
            dispute_id=uuid4(),
            author_id=uuid4(),
            content="This is a comment on the dispute.",
            is_internal=False,
            created_at=datetime.now(UTC),
        )
        assert comment.content == "This is a comment on the dispute."
        assert comment.is_internal is False


class TestDisputeAttachment:
    """Tests for DisputeAttachment model."""

    def test_valid_attachment(self) -> None:
        """Test creating a valid dispute attachment."""
        attachment = DisputeAttachment(
            id=uuid4(),
            dispute_id=uuid4(),
            uploaded_by=uuid4(),
            filename="invoice.pdf",
            storage_path="disputes/123/invoice.pdf",
            file_size=1024000,
            mime_type="application/pdf",
            created_at=datetime.now(UTC),
        )
        assert attachment.filename == "invoice.pdf"
        assert attachment.mime_type == "application/pdf"


class TestAddCommentRequest:
    """Tests for AddCommentRequest DTO."""

    def test_valid_tenant_comment(self) -> None:
        """Test creating a valid tenant comment request."""
        request = AddCommentRequest(
            content="I need clarification on the base year calculation.",
            is_internal=False,
        )
        assert request.is_internal is False

    def test_valid_admin_internal_comment(self) -> None:
        """Test creating a valid admin internal comment request."""
        request = AddCommentRequest(
            content="Internal note: Need to check lease terms.",
            is_internal=True,
        )
        assert request.is_internal is True


class TestUpdateStatusRequest:
    """Tests for UpdateStatusRequest DTO."""

    def test_valid_status_update_to_under_review(self) -> None:
        """Test updating status to under review."""
        request = UpdateStatusRequest(
            status=DisputeStatus.UNDER_REVIEW,
            resolution_summary=None,
        )
        assert request.status == DisputeStatus.UNDER_REVIEW
        assert request.resolution_summary is None

    def test_valid_status_update_to_resolved(self) -> None:
        """Test updating status to resolved with resolution summary."""
        request = UpdateStatusRequest(
            status=DisputeStatus.RESOLVED,
            resolution_summary="The calculation has been corrected and credit issued.",
        )
        assert request.status == DisputeStatus.RESOLVED
        assert request.resolution_summary is not None


class TestRateLimitError:
    """Tests for RateLimitError exception."""

    def test_rate_limit_error(self) -> None:
        """Test raising RateLimitError exception."""
        with pytest.raises(RateLimitError) as exc_info:
            raise RateLimitError("Maximum 3 disputes per day exceeded")
        assert "3 disputes per day" in str(exc_info.value)
