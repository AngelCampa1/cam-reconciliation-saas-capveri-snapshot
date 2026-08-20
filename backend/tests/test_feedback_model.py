"""Tests for Feedback domain models.

Tests cover FeedbackType enum, FeedbackStatus enum, and all Pydantic models
for user feedback, bug reports, and feature requests.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.feedback import (
    Feedback,
    FeedbackCreate,
    FeedbackStatus,
    FeedbackSummary,
    FeedbackType,
    FeedbackUpdate,
)


class TestFeedbackTypeEnum:
    """Tests for FeedbackType enum."""

    def test_feedback_type_values(self):
        """Should have correct enum values."""
        assert FeedbackType.BUG == "bug"
        assert FeedbackType.FEATURE_REQUEST == "feature_request"
        assert FeedbackType.GENERAL == "general"

    def test_feedback_type_member_count(self):
        """Should have exactly 3 members."""
        assert len(FeedbackType) == 3

    def test_feedback_type_is_string_enum(self):
        """Should be usable as string."""
        assert FeedbackType.BUG.value == "bug"
        assert FeedbackType.FEATURE_REQUEST == "feature_request"


class TestFeedbackStatusEnum:
    """Tests for FeedbackStatus enum."""

    def test_feedback_status_values(self):
        """Should have correct enum values."""
        assert FeedbackStatus.NEW == "new"
        assert FeedbackStatus.REVIEWED == "reviewed"
        assert FeedbackStatus.RESOLVED == "resolved"
        assert FeedbackStatus.DISMISSED == "dismissed"

    def test_feedback_status_member_count(self):
        """Should have exactly 4 members."""
        assert len(FeedbackStatus) == 4

    def test_feedback_status_is_string_enum(self):
        """Should be usable as string."""
        assert FeedbackStatus.NEW.value == "new"
        assert FeedbackStatus.RESOLVED == "resolved"


class TestFeedbackCreate:
    """Tests for FeedbackCreate model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid feedback creation data."""
        return {
            "type": FeedbackType.BUG,
            "message": "The reconciliation grid is not loading correctly when I click the button.",
            "page_url": "/properties/123/reconciliation",
        }

    def test_create_valid_feedback(self, valid_data):
        """Should create feedback with valid data."""
        feedback = FeedbackCreate(**valid_data)
        assert feedback.type == FeedbackType.BUG
        assert "reconciliation" in feedback.message
        assert feedback.page_url == "/properties/123/reconciliation"

    def test_message_minimum_length(self, valid_data):
        """Should reject message shorter than 10 characters."""
        valid_data["message"] = "Too short"
        with pytest.raises(ValidationError) as exc_info:
            FeedbackCreate(**valid_data)
        assert "message" in str(exc_info.value)

    def test_message_exactly_10_characters(self, valid_data):
        """Should accept message with exactly 10 characters."""
        valid_data["message"] = "1234567890"
        feedback = FeedbackCreate(**valid_data)
        assert len(feedback.message) == 10

    def test_message_maximum_length(self, valid_data):
        """Should reject message longer than 5000 characters."""
        valid_data["message"] = "A" * 5001
        with pytest.raises(ValidationError) as exc_info:
            FeedbackCreate(**valid_data)
        assert "message" in str(exc_info.value)

    def test_message_exactly_5000_characters(self, valid_data):
        """Should accept message with exactly 5000 characters."""
        valid_data["message"] = "A" * 5000
        feedback = FeedbackCreate(**valid_data)
        assert len(feedback.message) == 5000

    def test_page_url_required(self, valid_data):
        """Should require page_url."""
        del valid_data["page_url"]
        with pytest.raises(ValidationError) as exc_info:
            FeedbackCreate(**valid_data)
        assert "page_url" in str(exc_info.value)

    def test_page_url_maximum_length(self, valid_data):
        """Should reject page_url longer than 2000 characters."""
        valid_data["page_url"] = "/" + "a" * 2000
        with pytest.raises(ValidationError) as exc_info:
            FeedbackCreate(**valid_data)
        assert "page_url" in str(exc_info.value)

    def test_screenshot_url_optional(self, valid_data):
        """Should allow None screenshot_url."""
        feedback = FeedbackCreate(**valid_data)
        assert feedback.screenshot_url is None

    def test_screenshot_url_provided(self, valid_data):
        """Should accept screenshot_url."""
        valid_data["screenshot_url"] = (
            "https://storage.example.com/screenshots/abc123.png"
        )
        feedback = FeedbackCreate(**valid_data)
        assert (
            feedback.screenshot_url
            == "https://storage.example.com/screenshots/abc123.png"
        )

    def test_user_agent_optional(self, valid_data):
        """Should allow None user_agent."""
        feedback = FeedbackCreate(**valid_data)
        assert feedback.user_agent is None

    def test_user_agent_provided(self, valid_data):
        """Should accept user_agent."""
        valid_data["user_agent"] = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0"
        )
        feedback = FeedbackCreate(**valid_data)
        assert "Chrome" in feedback.user_agent

    def test_user_agent_maximum_length(self, valid_data):
        """Should reject user_agent longer than 500 characters."""
        valid_data["user_agent"] = "A" * 501
        with pytest.raises(ValidationError) as exc_info:
            FeedbackCreate(**valid_data)
        assert "user_agent" in str(exc_info.value)

    def test_metadata_default_empty(self, valid_data):
        """Should default metadata to empty dict."""
        feedback = FeedbackCreate(**valid_data)
        assert feedback.metadata == {}

    def test_metadata_with_browser_info(self, valid_data):
        """Should accept metadata with browser info."""
        valid_data["metadata"] = {
            "browser": "Chrome 120.0.0",
            "os": "Windows 11",
        }
        feedback = FeedbackCreate(**valid_data)
        assert feedback.metadata["browser"] == "Chrome 120.0.0"
        assert feedback.metadata["os"] == "Windows 11"

    def test_metadata_with_viewport(self, valid_data):
        """Should accept metadata with viewport info."""
        valid_data["metadata"] = {
            "viewport": {"width": 1920, "height": 1080},
        }
        feedback = FeedbackCreate(**valid_data)
        assert feedback.metadata["viewport"]["width"] == 1920
        assert feedback.metadata["viewport"]["height"] == 1080

    def test_metadata_with_console_errors(self, valid_data):
        """Should accept metadata with console errors."""
        valid_data["metadata"] = {
            "console_errors": [
                "TypeError: Cannot read property 'id' of undefined",
                "Failed to fetch resource",
            ],
        }
        feedback = FeedbackCreate(**valid_data)
        assert len(feedback.metadata["console_errors"]) == 2

    def test_all_feedback_types(self, valid_data):
        """Should accept all feedback types."""
        for feedback_type in FeedbackType:
            valid_data["type"] = feedback_type
            feedback = FeedbackCreate(**valid_data)
            assert feedback.type == feedback_type


class TestFeedbackUpdate:
    """Tests for FeedbackUpdate model."""

    def test_all_fields_optional(self):
        """Should allow empty update."""
        update = FeedbackUpdate()
        assert update.status is None
        assert update.metadata is None

    def test_update_status(self):
        """Should update status."""
        update = FeedbackUpdate(status=FeedbackStatus.REVIEWED)
        assert update.status == FeedbackStatus.REVIEWED

    def test_update_metadata(self):
        """Should update metadata."""
        update = FeedbackUpdate(metadata={"admin_notes": "Investigating"})
        assert update.metadata["admin_notes"] == "Investigating"

    def test_all_status_values_valid(self):
        """Should accept all status values."""
        for status in FeedbackStatus:
            update = FeedbackUpdate(status=status)
            assert update.status == status


class TestFeedback:
    """Tests for Feedback model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid full feedback data."""
        now = datetime.now(UTC)
        return {
            "id": uuid4(),
            "user_id": uuid4(),
            "organization_id": uuid4(),
            "type": FeedbackType.BUG,
            "status": FeedbackStatus.NEW,
            "message": "The export button doesn't work when there are more than 100 items.",
            "screenshot_url": "https://storage.example.com/screenshots/bug123.png",
            "page_url": "/properties/456/units",
            "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "metadata": {"browser": "Safari", "os": "macOS"},
            "created_at": now,
            "updated_at": now,
        }

    def test_create_full_feedback(self, valid_data):
        """Should create feedback with all fields."""
        feedback = Feedback(**valid_data)
        assert feedback.id == valid_data["id"]
        assert feedback.user_id == valid_data["user_id"]
        assert feedback.organization_id == valid_data["organization_id"]
        assert feedback.type == FeedbackType.BUG
        assert feedback.status == FeedbackStatus.NEW
        assert "export button" in feedback.message

    def test_status_default(self, valid_data):
        """Should default status to NEW."""
        del valid_data["status"]
        feedback = Feedback(**valid_data)
        assert feedback.status == FeedbackStatus.NEW

    def test_screenshot_url_nullable(self, valid_data):
        """Should accept None screenshot_url."""
        valid_data["screenshot_url"] = None
        feedback = Feedback(**valid_data)
        assert feedback.screenshot_url is None

    def test_user_agent_nullable(self, valid_data):
        """Should accept None user_agent."""
        valid_data["user_agent"] = None
        feedback = Feedback(**valid_data)
        assert feedback.user_agent is None

    def test_metadata_default_empty(self, valid_data):
        """Should default metadata to empty dict."""
        del valid_data["metadata"]
        feedback = Feedback(**valid_data)
        assert feedback.metadata == {}

    def test_from_attributes_config(self, valid_data):
        """Should have from_attributes=True for ORM compatibility."""
        assert Feedback.model_config.get("from_attributes") is True


class TestFeedbackSummary:
    """Tests for FeedbackSummary model."""

    @pytest.fixture
    def valid_data(self):
        """Return valid summary data."""
        return {
            "id": uuid4(),
            "type": FeedbackType.FEATURE_REQUEST,
            "status": FeedbackStatus.REVIEWED,
            "message": "It would be great to have Light-Only Mode support.",
            "page_url": "/settings",
            "created_at": datetime.now(UTC),
        }

    def test_create_summary(self, valid_data):
        """Should create summary with essential fields."""
        summary = FeedbackSummary(**valid_data)
        assert summary.id == valid_data["id"]
        assert summary.type == FeedbackType.FEATURE_REQUEST
        assert summary.status == FeedbackStatus.REVIEWED
        assert "Light-Only Mode" in summary.message

    def test_from_attributes_config(self, valid_data):
        """Should have from_attributes=True for ORM compatibility."""
        assert FeedbackSummary.model_config.get("from_attributes") is True


class TestFeedbackEdgeCases:
    """Edge case tests for Feedback models."""

    def test_message_at_boundary_lengths(self):
        """Should accept messages at boundary lengths."""
        # Exactly 10 characters
        feedback_min = FeedbackCreate(
            type=FeedbackType.GENERAL,
            message="1234567890",
            page_url="/test",
        )
        assert len(feedback_min.message) == 10

        # Exactly 5000 characters
        feedback_max = FeedbackCreate(
            type=FeedbackType.GENERAL,
            message="A" * 5000,
            page_url="/test",
        )
        assert len(feedback_max.message) == 5000

    def test_page_url_various_formats(self):
        """Should accept various URL formats."""
        urls = [
            "/dashboard",
            "/properties/123",
            "/properties/123/units?filter=active",
            "/reconciliation#summary",
            "https://app.capveri.com/dashboard",
        ]
        for url in urls:
            feedback = FeedbackCreate(
                type=FeedbackType.GENERAL,
                message="Testing URL format validation.",
                page_url=url,
            )
            assert feedback.page_url == url

    def test_metadata_with_complex_structure(self):
        """Should accept complex metadata structures."""
        metadata = {
            "browser": "Chrome 120.0.0",
            "os": "Windows 11",
            "viewport": {"width": 1920, "height": 1080},
            "console_errors": [
                "TypeError: Cannot read property 'id' of undefined",
                "NetworkError: Failed to fetch",
            ],
            "component_stack": "at ReconciliationGrid > at PropertyPage > at App",
            "custom_field": {"nested": {"deep": "value"}},
        }
        feedback = FeedbackCreate(
            type=FeedbackType.BUG,
            message="Complex metadata test feedback message.",
            page_url="/test",
            metadata=metadata,
        )
        assert feedback.metadata["browser"] == "Chrome 120.0.0"
        assert feedback.metadata["viewport"]["width"] == 1920
        assert len(feedback.metadata["console_errors"]) == 2
        assert feedback.metadata["custom_field"]["nested"]["deep"] == "value"

    def test_feature_request_type(self):
        """Should handle feature request type correctly."""
        feedback = FeedbackCreate(
            type=FeedbackType.FEATURE_REQUEST,
            message="Please add the ability to export reconciliation reports to PDF.",
            page_url="/properties/123/reconciliation",
        )
        assert feedback.type == FeedbackType.FEATURE_REQUEST

    def test_general_feedback_type(self):
        """Should handle general feedback type correctly."""
        feedback = FeedbackCreate(
            type=FeedbackType.GENERAL,
            message="The new interface looks great! Much easier to navigate.",
            page_url="/dashboard",
        )
        assert feedback.type == FeedbackType.GENERAL

    def test_all_status_transitions(self):
        """Should allow all valid status values."""
        now = datetime.now(UTC)
        base_data = {
            "id": uuid4(),
            "user_id": uuid4(),
            "organization_id": uuid4(),
            "type": FeedbackType.BUG,
            "message": "Test message for status transitions.",
            "page_url": "/test",
            "created_at": now,
            "updated_at": now,
        }

        for status in FeedbackStatus:
            base_data["status"] = status
            feedback = Feedback(**base_data)
            assert feedback.status == status
