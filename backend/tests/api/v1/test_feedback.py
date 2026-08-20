"""Tests for feedback API endpoints."""

from datetime import UTC, datetime
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.v1.feedback import get_email_service
from app.auth.dependencies import get_current_admin_user, get_current_user
from app.main import app
from app.models.enums import UserRole
from app.models.user import User


class OversizedChunkOnlyUpload:
    """UploadFile test double that fails if code attempts an unbounded read."""

    filename = "large.png"
    content_type = "image/png"

    def __init__(self, max_size: int):
        self.max_size = max_size
        self.bytes_served = 0
        self.unbounded_read_attempted = False

    async def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            self.unbounded_read_attempted = True
            raise AssertionError("unbounded read attempted")
        remaining = self.max_size + 1 - self.bytes_served
        if remaining <= 0:
            return b""
        chunk_size = min(size, remaining)
        self.bytes_served += chunk_size
        return b"x" * chunk_size


@pytest.fixture
def test_org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def test_user(test_org_id):
    """Test regular user."""
    return User(
        id=uuid4(),
        email="user@example.com",
        organization_id=test_org_id,
        role=UserRole.MEMBER,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def test_admin(test_org_id):
    """Test admin user."""
    return User(
        id=uuid4(),
        email="admin@example.com",
        organization_id=test_org_id,
        role=UserRole.ADMIN,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def test_client(test_user, mock_supabase):
    """Create test client with regular user dependency overrides."""
    from app.database.client import get_supabase, get_supabase_admin

    # Create separate mock admin client
    mock_supabase_admin = MagicMock()

    async def mock_get_user():
        return test_user

    def mock_get_db():
        return mock_supabase

    def mock_get_admin_db():
        return mock_supabase_admin

    mock_email_service = MagicMock()
    mock_email_service.send_feedback_notification = AsyncMock(
        return_value={"status": "sent", "id": "feedback_123"}
    )

    app.dependency_overrides[get_current_user] = mock_get_user
    app.dependency_overrides[get_current_admin_user] = None  # Should fail admin checks
    app.dependency_overrides[get_supabase] = mock_get_db
    app.dependency_overrides[get_supabase_admin] = mock_get_admin_db
    app.dependency_overrides[get_email_service] = lambda: mock_email_service

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    client.mock_supabase_admin = mock_supabase_admin
    client.mock_email_service = mock_email_service
    yield client

    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(test_admin, mock_supabase):
    """Create test client with admin user dependency overrides."""
    from app.database.client import get_supabase

    async def mock_get_admin():
        return test_admin

    def mock_get_db():
        return mock_supabase

    app.dependency_overrides[get_current_user] = mock_get_admin
    app.dependency_overrides[get_current_admin_user] = mock_get_admin
    app.dependency_overrides[get_supabase] = mock_get_db

    client = TestClient(app)
    client.mock_supabase = mock_supabase
    yield client

    app.dependency_overrides.clear()


class TestCreateFeedback:
    """Tests for POST /api/v1/feedback endpoint."""

    def test_create_feedback_success(self, test_client, test_user):
        """Should create feedback successfully under rate limit."""
        # Get mock from fixture
        mock_supabase = test_client.mock_supabase

        # Mock rate limit check - no recent feedback
        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        # Mock insert response
        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(test_user.id),
                "organization_id": str(test_user.organization_id),
                "type": "bug",
                "status": "new",
                "message": "This is a test feedback message that is long enough",
                "page_url": "/dashboard",
                "screenshot_url": None,
                "user_agent": "Mozilla/5.0",
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        # Setup mock chain
        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "feedback":
                # For rate limit check
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    rate_limit_response
                )
                # For insert
                mock_table.insert.return_value.execute.return_value = insert_response
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "This is a test feedback message that is long enough",
                "page_url": "/dashboard",
                "user_agent": "Mozilla/5.0",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["type"] == "bug"
        assert data["message"] == "This is a test feedback message that is long enough"
        assert data["status"] == "new"
        test_client.mock_email_service.send_feedback_notification.assert_called_once()
        assert (
            test_client.mock_email_service.send_feedback_notification.call_args.kwargs[
                "to_email"
            ]
            == "angel.campa@capveri.com"
        )

    def test_create_feedback_rate_limit_exceeded(self, test_client, test_user):
        """Should return 429 when rate limit exceeded."""
        # Get mock from fixture
        mock_supabase = test_client.mock_supabase

        # Mock rate limit check - 3 recent feedback items
        rate_limit_response = MagicMock()
        rate_limit_response.count = 3
        rate_limit_response.data = [{"id": str(uuid4())} for _ in range(3)]

        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            rate_limit_response
        )

        mock_supabase.table.return_value = mock_table

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "feature_request",
                "message": "This is too much feedback from the user",
                "page_url": "/features",
            },
        )

        assert response.status_code == 429
        assert "Rate limit exceeded" in response.json()["detail"]

    def test_create_feedback_invalid_type(self, test_client):
        """Should return 422 for invalid feedback type."""
        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "invalid_type",
                "message": "This is a test message that is long enough",
                "page_url": "/test",
            },
        )

        assert response.status_code == 422

    def test_create_feedback_database_failure(self, test_client):
        """Should return 500 when database insert fails (line 96)."""
        # Get mock from fixture
        mock_supabase = test_client.mock_supabase

        # Mock rate limit check - no recent feedback (should pass)
        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        # Mock insert response - database failure
        insert_response = MagicMock()
        insert_response.data = None  # Database failure

        # Setup mock chain
        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "feedback":
                # For rate limit check (pass)
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    rate_limit_response
                )
                # For insert (fail)
                mock_table.insert.return_value.execute.return_value = insert_response
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "Test message that is long enough for validation",
                "page_url": "/test",
            },
        )

        assert response.status_code == 500
        assert "Failed to create feedback" in response.json()["detail"]

    def test_create_feedback_succeeds_when_email_notification_fails(
        self, test_client, test_user
    ):
        """Should still create feedback when notification email fails."""
        mock_supabase = test_client.mock_supabase
        test_client.mock_email_service.send_feedback_notification.side_effect = (
            Exception("Resend failed")
        )

        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(test_user.id),
                "organization_id": str(test_user.organization_id),
                "type": "general",
                "status": "new",
                "message": "Feedback still persists even if email notification fails.",
                "page_url": "/dashboard",
                "screenshot_url": None,
                "user_agent": "Mozilla/5.0",
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        def table_side_effect(table_name):
            mock_table = MagicMock()
            if table_name == "feedback":
                mock_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
                    rate_limit_response
                )
                mock_table.insert.return_value.execute.return_value = insert_response
            return mock_table

        mock_supabase.table.side_effect = table_side_effect

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "general",
                "message": "Feedback still persists even if email notification fails.",
                "page_url": "/dashboard",
            },
        )

        assert response.status_code == 201

    def test_create_feedback_stores_screenshot_path_and_signs_responses(
        self, test_client, test_user
    ):
        """Should persist screenshot object paths and mint fresh signed URLs."""
        mock_supabase = test_client.mock_supabase
        screenshot_path = f"feedback/{test_user.organization_id}/screenshot.png"
        submitted_url = (
            "https://example.supabase.co/storage/v1/object/sign/"
            f"feedback-screenshots/{screenshot_path}?token=old"
        )
        fresh_url = (
            "https://example.supabase.co/storage/v1/object/sign/"
            f"feedback-screenshots/{screenshot_path}?token=fresh"
        )

        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        insert_response = MagicMock()
        insert_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(test_user.id),
                "organization_id": str(test_user.organization_id),
                "type": "bug",
                "status": "new",
                "message": "Screenshot references should stay valid for admins.",
                "page_url": "/dashboard",
                "screenshot_url": screenshot_path,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        feedback_table = MagicMock()
        feedback_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            rate_limit_response
        )
        feedback_table.insert.return_value.execute.return_value = insert_response
        mock_supabase.table.return_value = feedback_table

        storage_bucket = mock_supabase.storage.from_.return_value
        storage_bucket.create_signed_url.return_value = {"signedURL": fresh_url}

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "Screenshot references should stay valid for admins.",
                "page_url": "/dashboard",
                "screenshot_url": submitted_url,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["screenshot_url"] == fresh_url
        inserted = feedback_table.insert.call_args.args[0]
        assert inserted["screenshot_url"] == screenshot_path
        test_client.mock_email_service.send_feedback_notification.assert_called_once()
        assert (
            test_client.mock_email_service.send_feedback_notification.call_args.kwargs[
                "screenshot_url"
            ]
            == fresh_url
        )

    def test_create_feedback_rejects_cross_org_screenshot_path(
        self, test_client, test_user
    ):
        """Should not persist screenshot paths outside the user's organization."""
        mock_supabase = test_client.mock_supabase
        foreign_org_id = uuid4()
        screenshot_path = f"feedback/{foreign_org_id}/screenshot.png"
        submitted_url = (
            "https://example.supabase.co/storage/v1/object/sign/"
            f"feedback-screenshots/{screenshot_path}?token=old"
        )

        rate_limit_response = MagicMock()
        rate_limit_response.count = 0
        rate_limit_response.data = []

        feedback_table = MagicMock()
        feedback_table.select.return_value.eq.return_value.gte.return_value.execute.return_value = (
            rate_limit_response
        )
        mock_supabase.table.return_value = feedback_table

        response = test_client.post(
            "/api/v1/feedback",
            json={
                "type": "bug",
                "message": "Cross org screenshots should not be accepted.",
                "page_url": "/dashboard",
                "screenshot_url": submitted_url,
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == (
            "Screenshot path is outside the current organization"
        )
        feedback_table.insert.assert_not_called()
        test_client.mock_email_service.send_feedback_notification.assert_not_called()


class TestListFeedback:
    """Tests for GET /api/v1/feedback endpoint (admin only)."""

    def test_list_feedback_as_admin(self, admin_client):
        """Should list all feedback for admin users."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "bug",
                "status": "new",
                "message": "This is test feedback one",
                "page_url": "/page1",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "feature_request",
                "status": "reviewed",
                "message": "This is test feedback two",
                "page_url": "/page2",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/feedback")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

    def test_list_feedback_signs_stored_screenshot_path(
        self, admin_client, test_org_id
    ):
        """Should return fresh signed URLs for stored screenshot paths."""
        mock_supabase = admin_client.mock_supabase
        screenshot_path = f"feedback/{test_org_id}/screenshot.png"
        fresh_url = (
            "https://example.supabase.co/storage/v1/object/sign/"
            f"feedback-screenshots/{screenshot_path}?token=fresh"
        )

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(test_org_id),
                "type": "bug",
                "status": "new",
                "message": "This is test feedback one",
                "page_url": "/page1",
                "screenshot_url": screenshot_path,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.execute.return_value = mock_response
        mock_supabase.table.return_value = mock_table
        mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
            "signedURL": fresh_url
        }

        response = admin_client.get("/api/v1/feedback")

        assert response.status_code == 200
        data = response.json()
        assert data[0]["screenshot_url"] == fresh_url
        mock_supabase.storage.from_.return_value.create_signed_url.assert_called_once_with(
            screenshot_path, 3600
        )

    def test_list_feedback_with_filters(self, admin_client):
        """Should filter feedback by type and status."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "bug",
                "status": "new",
                "message": "This is a bug report",
                "page_url": "/bugs",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get(
            "/api/v1/feedback?type=bug&status=new&page=1&per_page=10"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "bug"

    def test_list_feedback_filter_type_only(self, admin_client):
        """Should filter feedback by type only (covers line 132-133)."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "feature_request",
                "status": "new",
                "message": "Feature request",
                "page_url": "/features",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/feedback?type=feature_request")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["type"] == "feature_request"

    def test_list_feedback_filter_status_only(self, admin_client):
        """Should filter feedback by status only (covers line 134-135)."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "bug",
                "status": "resolved",
                "message": "Resolved issue",
                "page_url": "/resolved",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.order.return_value = mock_table
        mock_table.range.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/feedback?status=resolved")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "resolved"


class TestListMyFeedback:
    """Tests for GET /api/v1/feedback/my endpoint."""

    def test_list_my_feedback(self, test_client, test_user):
        """Should list current user's feedback."""
        # Get mock from fixture
        mock_supabase = test_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "user_id": str(test_user.id),
                "organization_id": str(test_user.organization_id),
                "type": "general",
                "status": "new",
                "message": "This is my feedback message",
                "page_url": "/my-page",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = (
            mock_response
        )

        mock_supabase.table.return_value = mock_table

        response = test_client.get("/api/v1/feedback/my")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["message"] == "This is my feedback message"


class TestGetFeedbackStats:
    """Tests for GET /api/v1/feedback/stats/summary endpoint."""

    def test_get_feedback_stats_as_admin(self, admin_client):
        """Should return feedback statistics for admin users."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {"type": "bug", "status": "new"},
            {"type": "bug", "status": "reviewed"},
            {"type": "feature_request", "status": "new"},
            {"type": "general", "status": "resolved"},
        ]

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get("/api/v1/feedback/stats/summary")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 4
        assert data["by_type"]["bug"] == 2
        assert data["by_type"]["feature_request"] == 1
        assert data["by_status"]["new"] == 2
        assert data["by_status"]["reviewed"] == 1


class TestGetFeedback:
    """Tests for GET /api/v1/feedback/{feedback_id} endpoint."""

    def test_get_feedback_by_id_as_admin(self, admin_client):
        """Should retrieve specific feedback by ID for admin users."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        feedback_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = {
            "id": str(feedback_id),
            "user_id": str(uuid4()),
            "organization_id": str(uuid4()),
            "type": "bug",
            "status": "new",
            "message": "This is specific feedback",
            "page_url": "/specific",
            "screenshot_url": None,
            "user_agent": None,
            "metadata": {},
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.single.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "This is specific feedback"

    def test_get_feedback_signs_stored_screenshot_path(self, admin_client, test_org_id):
        """Should return a fresh signed URL for a stored screenshot path."""
        mock_supabase = admin_client.mock_supabase

        feedback_id = uuid4()
        screenshot_path = f"feedback/{test_org_id}/screenshot.png"
        fresh_url = (
            "https://example.supabase.co/storage/v1/object/sign/"
            f"feedback-screenshots/{screenshot_path}?token=fresh"
        )
        mock_response = MagicMock()
        mock_response.data = {
            "id": str(feedback_id),
            "user_id": str(uuid4()),
            "organization_id": str(test_org_id),
            "type": "bug",
            "status": "new",
            "message": "This is specific feedback",
            "page_url": "/specific",
            "screenshot_url": screenshot_path,
            "user_agent": None,
            "metadata": {},
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.single.return_value = mock_table
        mock_table.execute.return_value = mock_response
        mock_supabase.table.return_value = mock_table
        mock_supabase.storage.from_.return_value.create_signed_url.return_value = {
            "signedURL": fresh_url
        }

        response = admin_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["screenshot_url"] == fresh_url

    def test_get_feedback_not_found(self, admin_client):
        """Should return 404 for non-existent feedback."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        feedback_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = None

        mock_table = MagicMock()
        mock_table.select.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.single.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.get(f"/api/v1/feedback/{feedback_id}")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestUpdateFeedback:
    """Tests for PATCH /api/v1/feedback/{feedback_id} endpoint."""

    def test_update_feedback_status(self, admin_client):
        """Should update feedback status as admin."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        feedback_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(feedback_id),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "type": "bug",
                "status": "reviewed",
                "message": "This has been updated",
                "page_url": "/update",
                "screenshot_url": None,
                "user_agent": None,
                "metadata": {"admin_note": "Working on it"},
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_table = MagicMock()
        mock_table.update.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={
                "status": "reviewed",
                "metadata": {"admin_note": "Working on it"},
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "reviewed"

    def test_update_feedback_no_updates(self, admin_client):
        """Should return 400 when no updates provided."""
        feedback_id = uuid4()

        response = admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={},
        )

        assert response.status_code == 400
        assert "No updates provided" in response.json()["detail"]

    def test_update_feedback_not_found(self, admin_client):
        """Should return 404 when feedback doesn't exist."""
        # Get mock from fixture
        mock_supabase = admin_client.mock_supabase

        feedback_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = []

        mock_table = MagicMock()
        mock_table.update.return_value = mock_table
        mock_table.eq.return_value = mock_table
        mock_table.execute.return_value = mock_response

        mock_supabase.table.return_value = mock_table

        response = admin_client.patch(
            f"/api/v1/feedback/{feedback_id}",
            json={"status": "resolved"},
        )

        assert response.status_code == 404


class TestUploadScreenshot:
    """Tests for POST /api/v1/feedback/screenshot endpoint."""

    @pytest.mark.asyncio
    async def test_upload_screenshot_rejects_oversized_file_without_unbounded_read(
        self, test_user
    ):
        """Should reject oversized screenshots without reading the whole stream."""
        from fastapi import HTTPException

        from app.api.v1.feedback import MAX_SCREENSHOT_SIZE, upload_screenshot

        file = OversizedChunkOnlyUpload(MAX_SCREENSHOT_SIZE)
        mock_supabase_admin = MagicMock()

        with pytest.raises(HTTPException) as exc_info:
            await upload_screenshot(
                file=file,
                current_user=test_user,
                supabase_admin=mock_supabase_admin,
            )

        assert exc_info.value.status_code == 400
        assert "File too large" in exc_info.value.detail
        assert file.unbounded_read_attempted is False
        assert file.bytes_served == MAX_SCREENSHOT_SIZE + 1
        mock_supabase_admin.storage.from_.assert_not_called()

    def test_upload_screenshot_success(self, test_client, test_user):
        """Should upload screenshot successfully with real storage call."""
        # Get mock admin client from fixture
        mock_supabase_admin = test_client.mock_supabase_admin

        # Create a fake image file (PNG magic bytes)
        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = BytesIO(image_data)

        # Mock storage upload chain for admin client
        mock_upload_result = MagicMock()
        mock_upload_result.error = None

        mock_storage_bucket = MagicMock()
        mock_storage_bucket.upload.return_value = mock_upload_result
        mock_storage_bucket.create_signed_url.return_value = {
            "signedURL": (
                f"https://example.supabase.co/storage/v1/object/sign/"
                f"feedback-screenshots/feedback/{test_user.organization_id}/test.png"
            )
        }

        mock_supabase_admin.storage.from_.return_value = mock_storage_bucket

        response = test_client.post(
            "/api/v1/feedback/screenshot",
            files={"file": ("screenshot.png", file, "image/png")},
        )

        assert response.status_code == 201
        data = response.json()
        assert "url" in data
        assert "storage_path" in data
        assert "feedback-screenshots" in data["url"]
        assert str(test_user.organization_id) in data["url"]

        # Verify storage upload called with correct path
        mock_storage_bucket.upload.assert_called_once()
        storage_path = mock_storage_bucket.upload.call_args[0][0]
        assert storage_path.startswith(f"feedback/{test_user.organization_id}/")
        assert storage_path.endswith(".png")
        assert data["storage_path"] == storage_path
        mock_storage_bucket.create_signed_url.assert_called_once_with(
            storage_path, 3600
        )
        mock_storage_bucket.get_public_url.assert_not_called()

    def test_upload_screenshot_invalid_type(self, test_client):
        """Should reject non-image files."""
        file_data = b"not an image"
        file = BytesIO(file_data)

        response = test_client.post(
            "/api/v1/feedback/screenshot",
            files={"file": ("document.pdf", file, "application/pdf")},
        )

        assert response.status_code == 400
        assert "must be an image" in response.json()["detail"].lower()

    def test_upload_screenshot_too_large(self, test_client):
        """Should reject files larger than 5MB."""
        # Create a file larger than 5MB
        large_file_data = b"x" * (6 * 1024 * 1024)  # 6MB
        file = BytesIO(large_file_data)

        response = test_client.post(
            "/api/v1/feedback/screenshot",
            files={"file": ("large.jpg", file, "image/jpeg")},
        )

        assert response.status_code == 400
        assert "too large" in response.json()["detail"].lower()

    def test_upload_screenshot_storage_exception_returns_500(self, test_client):
        """Should return 500 when storage raises unexpectedly."""
        image_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = BytesIO(image_data)

        test_client.mock_supabase_admin.storage.from_.side_effect = Exception(
            "storage down"
        )

        response = test_client.post(
            "/api/v1/feedback/screenshot",
            files={"file": ("broken.png", file, "image/png")},
        )

        assert response.status_code == 500
        assert "Failed to upload screenshot" in response.json()["detail"]
