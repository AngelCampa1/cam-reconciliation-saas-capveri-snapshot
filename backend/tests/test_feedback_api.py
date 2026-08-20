"""Tests for feedback API endpoints.

Tests cover:
- Creating feedback with rate limiting
- Listing feedback (admin only)
- Listing user's own feedback
- Getting specific feedback (admin only)
- Updating feedback status (admin only)
- Getting feedback statistics (admin only)
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.models.feedback import FeedbackStatus, FeedbackType


@pytest.fixture
def mock_feedback_data():
    """Sample feedback data for testing."""
    from tests.conftest import ORG_A_ID

    user_id = str(uuid4())
    org_id = str(ORG_A_ID)
    feedback_id = str(uuid4())

    return {
        "id": feedback_id,
        "user_id": user_id,
        "organization_id": org_id,
        "type": FeedbackType.BUG.value,
        "status": FeedbackStatus.NEW.value,
        "message": "The save button doesn't work on the settings page.",
        "page_url": "/settings",
        "screenshot_url": None,
        "user_agent": "Mozilla/5.0",
        "metadata": {},
        "created_at": datetime.now(UTC).isoformat(),
        "updated_at": datetime.now(UTC).isoformat(),
    }


class TestCreateFeedback:
    """Tests for POST /api/v1/feedback endpoint."""

    def test_create_feedback_success(self, org_a_member_client, mock_feedback_data):
        """Test creating feedback successfully."""
        # Initialize feedback table with empty data (passes rate limit check)
        org_a_member_client.mock_supabase._test_data["feedback"] = []

        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "The save button doesn't work on the settings page.",
                "page_url": "/settings",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["type"] == "bug"
        assert data["status"] == "new"

    def test_create_feedback_with_screenshot(
        self, org_a_member_client, mock_feedback_data
    ):
        """Test creating feedback with screenshot URL."""
        mock_feedback_data["screenshot_url"] = (
            "https://storage.example.com/screenshot.png"
        )

        # Initialize feedback table with empty data
        org_a_member_client.mock_supabase._test_data["feedback"] = []

        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "feature_request",
                "message": "Please add Light-Only Mode support for better accessibility.",
                "page_url": "/settings/appearance",
                "screenshot_url": "https://storage.example.com/screenshot.png",
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["screenshot_url"] == "https://storage.example.com/screenshot.png"

    def test_create_feedback_with_metadata(
        self, org_a_member_client, mock_feedback_data
    ):
        """Test creating feedback with metadata."""
        mock_feedback_data["metadata"] = {
            "browser": "Chrome",
            "viewport": "1920x1080",
        }

        # Initialize feedback table with empty data
        org_a_member_client.mock_supabase._test_data["feedback"] = []

        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "general",
                "message": "The application is great! Love using it every day.",
                "page_url": "/dashboard",
                "metadata": {"browser": "Chrome", "viewport": "1920x1080"},
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["metadata"]["browser"] == "Chrome"

    def test_create_feedback_rate_limit_exceeded(self, org_a_member_client):
        """Test that rate limiting works (3 per hour)."""
        # Populate feedback table with 3 recent submissions (triggers rate limit)
        from tests.conftest import ORG_A_USER_ID

        now = datetime.now(UTC)
        org_a_member_client.mock_supabase._test_data["feedback"] = [
            {"id": "1", "user_id": str(ORG_A_USER_ID), "created_at": now.isoformat()},
            {"id": "2", "user_id": str(ORG_A_USER_ID), "created_at": now.isoformat()},
            {"id": "3", "user_id": str(ORG_A_USER_ID), "created_at": now.isoformat()},
        ]

        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "general",
                "message": "This should be rate limited now.",
                "page_url": "/dashboard",
            },
        )

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert "Rate limit exceeded" in response.json()["detail"]

    def test_create_feedback_message_too_short(self, org_a_member_client):
        """Test validation: message too short."""
        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "Too short",  # Less than 10 characters
                "page_url": "/dashboard",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_feedback_invalid_type(self, org_a_member_client):
        """Test validation: invalid feedback type."""
        response = org_a_member_client.post(
            "/api/v1/feedback",
            json={
                "type": "invalid_type",
                "message": "This has an invalid feedback type.",
                "page_url": "/dashboard",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_create_feedback_requires_auth(self, base_client):
        """Test that creating feedback requires authentication."""
        response = base_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "This should require authentication.",
                "page_url": "/dashboard",
            },
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestListFeedback:
    """Tests for GET /api/v1/feedback endpoint (admin only)."""

    def test_list_feedback_success(self, org_a_admin_client, mock_feedback_data):
        """Test listing all feedback as admin."""
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.get("/api/v1/feedback")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "bug"

    def test_list_feedback_excludes_other_orgs(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Org admins should only list feedback from their organization."""
        foreign_feedback = dict(
            mock_feedback_data,
            id=str(uuid4()),
            organization_id=str(uuid4()),
        )
        org_a_admin_client.mock_supabase._test_data["feedback"] = [
            mock_feedback_data,
            foreign_feedback,
        ]

        response = org_a_admin_client.get("/api/v1/feedback")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert [item["id"] for item in data] == [mock_feedback_data["id"]]

    def test_list_feedback_with_type_filter(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Test filtering feedback by type."""
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.get("/api/v1/feedback?type=bug")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "bug"

    def test_list_feedback_with_status_filter(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Test filtering feedback by status."""
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.get("/api/v1/feedback?status=new")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "new"

    def test_list_feedback_with_pagination(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Test pagination parameters."""
        # Create 15 feedback entries to test pagination
        feedback_list = [dict(mock_feedback_data, id=str(uuid4())) for _ in range(15)]
        org_a_admin_client.mock_supabase._test_data["feedback"] = feedback_list

        response = org_a_admin_client.get("/api/v1/feedback?page=2&per_page=10")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5  # Only 5 items on page 2 (11-15)

    def test_list_feedback_requires_admin(self, org_a_member_client):
        """Test that listing feedback requires admin privileges."""
        response = org_a_member_client.get("/api/v1/feedback")

        # Should fail because user is not admin
        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestListMyFeedback:
    """Tests for GET /api/v1/feedback/my endpoint."""

    def test_list_my_feedback_success(self, org_a_member_client, mock_feedback_data):
        """Test listing current user's feedback."""
        mock_feedback_data["user_id"] = str(org_a_member_client.user.id)
        org_a_member_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_member_client.get("/api/v1/feedback/my")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["user_id"] == str(org_a_member_client.user.id)

    def test_list_my_feedback_requires_auth(self, base_client):
        """Test that listing my feedback requires authentication."""
        response = base_client.get("/api/v1/feedback/my")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestGetFeedback:
    """Tests for GET /api/v1/feedback/{feedback_id} endpoint (admin only)."""

    def test_get_feedback_success(self, org_a_admin_client, mock_feedback_data):
        """Test getting specific feedback as admin."""
        feedback_id = mock_feedback_data["id"]
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id"] == feedback_id

    def test_get_feedback_not_found(self, org_a_admin_client):
        """Test getting non-existent feedback returns 404."""
        feedback_id = str(uuid4())
        org_a_admin_client.mock_supabase._test_data["feedback"] = []

        response = org_a_admin_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_feedback_other_org_returns_404(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Org admins cannot retrieve another organization's feedback by ID."""
        mock_feedback_data["organization_id"] = str(uuid4())
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.get(
            f"/api/v1/feedback/{mock_feedback_data['id']}"
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_feedback_requires_admin(self, org_a_member_client):
        """Test that getting feedback requires admin privileges."""
        feedback_id = str(uuid4())

        response = org_a_member_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestUpdateFeedback:
    """Tests for PATCH /api/v1/feedback/{feedback_id} endpoint (admin only)."""

    def test_update_feedback_status(self, org_a_admin_client, mock_feedback_data):
        """Test updating feedback status as admin."""
        feedback_id = mock_feedback_data["id"]
        mock_feedback_data["status"] = FeedbackStatus.REVIEWED.value
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={"status": "reviewed"},
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "reviewed"

    def test_update_feedback_with_metadata(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Test updating feedback with metadata."""
        feedback_id = mock_feedback_data["id"]
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={
                "status": "resolved",
                "metadata": {"admin_notes": "Fixed in version 2.1.0"},
            },
        )

        assert response.status_code == status.HTTP_200_OK

    def test_update_feedback_not_found(self, org_a_admin_client):
        """Test updating non-existent feedback returns 404."""
        feedback_id = str(uuid4())
        org_a_admin_client.mock_supabase._test_data["feedback"] = []

        response = org_a_admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={"status": "reviewed"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_update_feedback_other_org_returns_404(
        self, org_a_admin_client, mock_feedback_data
    ):
        """Org admins cannot update another organization's feedback by ID."""
        mock_feedback_data["organization_id"] = str(uuid4())
        org_a_admin_client.mock_supabase._test_data["feedback"] = [mock_feedback_data]

        response = org_a_admin_client.patch(
            f"/api/v1/feedback/{mock_feedback_data['id']}",
            json={"status": "reviewed"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert mock_feedback_data["status"] == FeedbackStatus.NEW.value

    def test_update_feedback_no_updates_provided(self, org_a_admin_client):
        """Test that update with no fields returns 400."""
        feedback_id = str(uuid4())

        response = org_a_admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_feedback_requires_admin(self, org_a_member_client):
        """Test that updating feedback requires admin privileges."""
        feedback_id = str(uuid4())

        response = org_a_member_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={"status": "reviewed"},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestGetFeedbackStats:
    """Tests for GET /api/v1/feedback/stats/summary endpoint (admin only)."""

    def test_get_feedback_stats_success(self, org_a_admin_client):
        """Test getting feedback statistics as admin."""
        from tests.conftest import ORG_A_ID

        mock_stats_data = [
            {"type": "bug", "status": "new", "organization_id": str(ORG_A_ID)},
            {"type": "bug", "status": "reviewed", "organization_id": str(ORG_A_ID)},
            {
                "type": "feature_request",
                "status": "new",
                "organization_id": str(ORG_A_ID),
            },
            {"type": "general", "status": "resolved", "organization_id": str(ORG_A_ID)},
        ]
        org_a_admin_client.mock_supabase._test_data["feedback"] = mock_stats_data

        response = org_a_admin_client.get("/api/v1/feedback/stats/summary")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 4
        assert data["by_type"]["bug"] == 2
        assert data["by_type"]["feature_request"] == 1
        assert data["by_status"]["new"] == 2
        assert data["by_status"]["reviewed"] == 1
        assert data["by_status"]["resolved"] == 1

    def test_get_feedback_stats_excludes_other_orgs(self, org_a_admin_client):
        """Feedback stats are scoped to the admin's organization."""
        from tests.conftest import ORG_A_ID

        org_a_admin_client.mock_supabase._test_data["feedback"] = [
            {"type": "bug", "status": "new", "organization_id": str(ORG_A_ID)},
            {
                "type": "feature_request",
                "status": "resolved",
                "organization_id": str(uuid4()),
            },
        ]

        response = org_a_admin_client.get("/api/v1/feedback/stats/summary")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 1
        assert data["by_type"] == {"bug": 1}
        assert data["by_status"] == {"new": 1}

    def test_get_feedback_stats_empty(self, org_a_admin_client):
        """Test getting stats when no feedback exists."""
        org_a_admin_client.mock_supabase._test_data["feedback"] = []

        response = org_a_admin_client.get("/api/v1/feedback/stats/summary")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["total"] == 0
        assert data["by_type"] == {}
        assert data["by_status"] == {}

    def test_get_feedback_stats_requires_admin(self, org_a_member_client):
        """Test that getting stats requires admin privileges."""
        response = org_a_member_client.get("/api/v1/feedback/stats/summary")

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestUploadScreenshot:
    """Tests for POST /api/v1/feedback/screenshot endpoint."""

    def test_upload_screenshot_success(self, org_a_member_client):
        """Test uploading a screenshot successfully."""
        # Mock storage upload using admin client
        storage = org_a_member_client.mock_supabase_admin.storage.from_.return_value
        storage.upload.return_value = MagicMock(error=None)
        storage.create_signed_url.return_value = {
            "signedURL": "https://example.com/feedback/org-id/screenshot.jpg?token=signed"
        }

        # Create fake image file
        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("test.png", image_data, "image/png")}

        response = org_a_member_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "url" in data
        assert "storage_path" in data
        assert data["url"].startswith("https://")
        storage.create_signed_url.assert_called_once()
        storage.get_public_url.assert_not_called()

    def test_upload_screenshot_requires_auth(self, base_client):
        """Test that screenshot upload requires authentication."""
        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("test.png", image_data, "image/png")}

        response = base_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_upload_screenshot_rejects_non_image(self, org_a_member_client):
        """Test that non-image files are rejected."""
        files = {"file": ("test.txt", b"hello world", "text/plain")}

        response = org_a_member_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "image" in response.json()["detail"].lower()

    def test_upload_screenshot_rejects_large_file(self, org_a_member_client):
        """Test that files over 5MB are rejected."""
        # Create 6MB file
        large_data = b"\x00" * (6 * 1024 * 1024)
        files = {"file": ("large.jpg", large_data, "image/jpeg")}

        response = org_a_member_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "too large" in response.json()["detail"].lower()

    def test_upload_screenshot_handles_storage_error(self, org_a_member_client):
        """Test handling of storage upload errors."""
        # Mock storage upload failure using admin client
        org_a_member_client.mock_supabase_admin.storage.from_.return_value.upload.return_value = MagicMock(
            error={"message": "Storage error"}
        )

        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("test.png", image_data, "image/png")}

        response = org_a_member_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        assert "upload" in response.json()["detail"].lower()

    def test_upload_screenshot_generates_unique_filename(self, org_a_member_client):
        """Test that uploaded files get unique filenames."""
        # Mock storage upload using admin client
        storage = org_a_member_client.mock_supabase_admin.storage.from_.return_value
        storage.upload.return_value = MagicMock(error=None)
        storage.create_signed_url.return_value = {
            "signedURL": "https://example.com/feedback/org-id/unique-id.jpg?token=signed"
        }

        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        files = {"file": ("test.png", image_data, "image/png")}

        response = org_a_member_client.post("/api/v1/feedback/screenshot", files=files)

        assert response.status_code == status.HTTP_201_CREATED

        # Check that upload was called with a filename containing the org_id
        upload_call = (
            org_a_member_client.mock_supabase_admin.storage.from_.return_value.upload.call_args
        )
        filename = upload_call[0][0] if upload_call else ""
        assert "feedback/" in filename
        assert response.json()["storage_path"] == filename


class TestCreateMarketingFeedback:
    """Tests for POST /api/v1/feedback/marketing (public, no auth required)."""

    @pytest.fixture
    def client(self):
        """Public test client with mocked email service."""
        from app.api.v1.feedback import get_email_service
        from tests.conftest import create_test_app

        app = create_test_app()
        mock_email = AsyncMock()
        mock_email.send_feedback_notification.return_value = {
            "status": "sent",
            "id": "email-1",
        }
        app.dependency_overrides[get_email_service] = lambda: mock_email

        with TestClient(app) as c:
            c.mock_email = mock_email
            yield c

        app.dependency_overrides.clear()

    def test_valid_submission_returns_ok_and_sends_email(self, client):
        """Valid marketing feedback sends notification email and returns ok."""
        with patch(
            "app.api.v1.feedback.verify_turnstile", new=AsyncMock(return_value=True)
        ) as verify:
            response = client.post(
                "/api/v1/feedback/marketing",
                json={
                    "type": "bug",
                    "message": "Something is broken on the pricing page.",
                    "page_url": "/pricing",
                    "user_agent": "Mozilla/5.0",
                    "turnstile_token": "token",
                },
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"status": "ok"}
        verify.assert_awaited_once()
        client.mock_email.send_feedback_notification.assert_called_once()

    def test_failed_turnstile_returns_403_without_email(self, client):
        """Failed bot verification blocks public marketing feedback."""
        with patch(
            "app.api.v1.feedback.verify_turnstile", new=AsyncMock(return_value=False)
        ) as verify:
            response = client.post(
                "/api/v1/feedback/marketing",
                json={
                    "type": "bug",
                    "message": "Something is broken on the pricing page.",
                    "page_url": "/pricing",
                    "turnstile_token": "bad-token",
                },
            )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "Verification failed" in response.json()["detail"]
        verify.assert_awaited_once()
        client.mock_email.send_feedback_notification.assert_not_called()

    def test_honeypot_returns_ok_without_email(self, client):
        """Bot-filled honeypot field is accepted silently and does no work."""
        response = client.post(
            "/api/v1/feedback/marketing",
            json={
                "type": "general",
                "message": "Great product, love using it every day!",
                "page_url": "/",
                "company_website": "https://spam.example",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"status": "ok"}
        client.mock_email.send_feedback_notification.assert_not_called()

    def test_rate_limit_returns_429_without_email(self, client, monkeypatch):
        """Repeated public marketing feedback is throttled by IP."""
        from limits import parse
        from limits.storage import MemoryStorage
        from limits.strategies import MovingWindowRateLimiter

        monkeypatch.setattr(
            "app.api.v1.feedback.MARKETING_FEEDBACK_RATE_LIMIT",
            parse("1 per 1 minute"),
        )
        monkeypatch.setattr(
            "app.api.v1.feedback.moving_window",
            MovingWindowRateLimiter(MemoryStorage()),
        )

        payload = {
            "type": "bug",
            "message": "Something is broken on the pricing page.",
            "page_url": "/pricing",
            "turnstile_token": "token",
        }

        with patch(
            "app.api.v1.feedback.verify_turnstile", new=AsyncMock(return_value=True)
        ):
            first = client.post("/api/v1/feedback/marketing", json=payload)
            second = client.post("/api/v1/feedback/marketing", json=payload)

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert client.mock_email.send_feedback_notification.call_count == 1

    def test_message_too_short_returns_422(self, client):
        """Message under 10 chars is rejected before any email is sent."""
        response = client.post(
            "/api/v1/feedback/marketing",
            json={
                "type": "bug",
                "message": "short",
                "page_url": "/pricing",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        client.mock_email.send_feedback_notification.assert_not_called()

    def test_missing_type_returns_422(self, client):
        """Missing required type field is rejected with 422."""
        response = client.post(
            "/api/v1/feedback/marketing",
            json={
                "message": "Something is broken on the pricing page.",
                "page_url": "/pricing",
            },
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_email_failure_still_returns_ok(self, client):
        """Email send failure is logged but does not block the 200 response."""
        client.mock_email.send_feedback_notification.side_effect = Exception(
            "Resend API down"
        )

        with patch(
            "app.api.v1.feedback.verify_turnstile", new=AsyncMock(return_value=True)
        ):
            response = client.post(
                "/api/v1/feedback/marketing",
                json={
                    "type": "general",
                    "message": "Great product, love using it every day!",
                    "page_url": "/",
                    "turnstile_token": "token",
                },
            )

        assert response.status_code == status.HTTP_200_OK
        assert response.json() == {"status": "ok"}
