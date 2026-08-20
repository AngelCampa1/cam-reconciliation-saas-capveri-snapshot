"""Tests for dispute management API endpoints (landlord admin)."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import (
    OrganizationContext,
    get_current_admin_user,
    get_current_user,
    get_org_scoped_context,
)
from app.main import app
from app.models.enums import DisputeStatus, UserRole
from app.models.user import User
from app.services.extraction import StorageError, get_storage_client


@pytest.fixture
def test_org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def test_admin(test_org_id):
    """Test admin user."""
    return User(
        id=uuid4(),
        email="admin@example.com",
        full_name="Ada Admin",
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
def admin_client(test_admin, test_org_id, mock_supabase):
    """Create test client with admin user dependency overrides."""

    async def mock_get_admin():
        return test_admin

    async def mock_get_org_context():
        return OrganizationContext(
            client=mock_supabase,
            organization_id=test_org_id,
            user=test_admin,
        )

    app.dependency_overrides[get_current_user] = mock_get_admin
    app.dependency_overrides[get_current_admin_user] = mock_get_admin
    app.dependency_overrides[get_org_scoped_context] = mock_get_org_context

    client = TestClient(app)
    client.mock_supabase = mock_supabase

    yield client

    # Clean up only the overrides this fixture created
    # Don't use .clear() as it removes overrides from other tests
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]
    if get_current_admin_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_admin_user]
    if get_org_scoped_context in app.dependency_overrides:
        del app.dependency_overrides[get_org_scoped_context]


class TestListOrganizationDisputes:
    """Tests for GET /api/v1/disputes endpoint."""

    def test_list_all_disputes(self, admin_client, test_org_id):
        """Should return all disputes for the organization."""
        mock_supabase = admin_client.mock_supabase

        # Mock Supabase response
        mock_response = MagicMock()
        dispute_id = uuid4()
        statement_id = uuid4()
        mock_response.data = [
            {
                "id": str(dispute_id),
                "statement_id": str(statement_id),
                "category": "calculation_error",
                "status": "open",
                "description": "Incorrect calculation in pool allocation",
                "created_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "statement_id": str(uuid4()),
                "category": "missing_credit",
                "status": "under_review",
                "description": "Missing tenant improvement credit",
                "created_at": datetime.now(UTC).isoformat(),
            },
        ]

        # Mock query chain
        mock_execute = MagicMock()
        mock_execute.execute.return_value = mock_response

        mock_range = MagicMock()
        mock_range.range.return_value = mock_execute

        mock_order = MagicMock()
        mock_order.order.return_value = mock_range

        mock_select = MagicMock()
        mock_select.select.return_value = mock_order
        mock_supabase.table.return_value = mock_select

        response = admin_client.get("/api/v1/disputes")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["category"] == "calculation_error"
        assert data[0]["status"] == "open"
        assert data[1]["category"] == "missing_credit"
        assert data[1]["status"] == "under_review"


class TestDisputeServiceDependency:
    """Tests for dispute service dependency wiring."""

    def test_get_dispute_service_normalizes_legacy_sender(self, mock_supabase):
        """Landlord dispute notifications use the canonical CapVeri sender."""
        from types import SimpleNamespace

        from app.api.v1 import disputes as disputes_routes
        from app.services.email.factory import DEFAULT_FROM_ADDRESS

        original_settings = disputes_routes.settings
        disputes_routes.settings = SimpleNamespace(
            resend_api_key="re_test_123",
            resend_from_address="CAMAudit <noreply@camaudit.io>",
            unsubscribe_hmac_secret="test-secret",
        )
        try:
            service = disputes_routes.get_dispute_service(mock_supabase)
        finally:
            disputes_routes.settings = original_settings

        assert (
            service.notification_service.email_service.from_address
            == DEFAULT_FROM_ADDRESS
        )

    def test_list_disputes_with_status_filter(self, admin_client):
        """Should filter disputes by status."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "statement_id": str(uuid4()),
                "category": "calculation_error",
                "status": "resolved",
                "description": "Fixed calculation issue",
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]

        # Mock query chain with filter
        mock_execute = MagicMock()
        mock_execute.execute.return_value = mock_response

        mock_range = MagicMock()
        mock_range.range.return_value = mock_execute

        mock_order = MagicMock()
        mock_order.order.return_value = mock_range

        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_order

        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq

        mock_supabase.table.return_value = mock_select

        response = admin_client.get("/api/v1/disputes?status=resolved")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "resolved"

    def test_list_disputes_with_pagination(self, admin_client):
        """Should paginate dispute results."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = []

        mock_execute = MagicMock()
        mock_execute.execute.return_value = mock_response

        mock_range = MagicMock()
        mock_range.range.return_value = mock_execute

        mock_order = MagicMock()
        mock_order.order.return_value = mock_range

        mock_select = MagicMock()
        mock_select.select.return_value = mock_order

        mock_supabase.table.return_value = mock_select

        response = admin_client.get("/api/v1/disputes?skip=10&limit=25")

        assert response.status_code == 200

        # Verify range was called with skip and limit
        mock_range.range.assert_called_once_with(10, 34)  # skip + limit - 1

    def test_list_disputes_empty_result(self, admin_client):
        """Should return empty list when no disputes."""
        mock_supabase = admin_client.mock_supabase

        mock_response = MagicMock()
        mock_response.data = []

        mock_execute = MagicMock()
        mock_execute.execute.return_value = mock_response

        mock_range = MagicMock()
        mock_range.range.return_value = mock_execute

        mock_order = MagicMock()
        mock_order.order.return_value = mock_range

        mock_select = MagicMock()
        mock_select.select.return_value = mock_order

        mock_supabase.table.return_value = mock_select

        response = admin_client.get("/api/v1/disputes")

        assert response.status_code == 200
        assert response.json() == []


class TestGetDispute:
    """Tests for GET /api/v1/disputes/{dispute_id} endpoint."""

    def _setup_dispute_table_mocks(
        self, mock_supabase, dispute_id, tenant_user_id, statement_id, test_org_id
    ):
        """Set up mock Supabase table responses for a dispute detail query."""
        mock_dispute_response = MagicMock()
        mock_dispute_response.data = [
            {
                "id": str(dispute_id),
                "tenant_user_id": str(tenant_user_id),
                "statement_id": str(statement_id),
                "organization_id": str(test_org_id),
                "category": "calculation_error",
                "description": "Pool allocation calculation is incorrect",
                "status": "under_review",
                "assigned_to": None,
                "resolution_summary": None,
                "resolved_at": None,
                "resolved_by": None,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        comment_id = uuid4()
        author_id = uuid4()
        mock_comments_response = MagicMock()
        mock_comments_response.data = [
            {
                "id": str(comment_id),
                "dispute_id": str(dispute_id),
                "author_id": str(author_id),
                "author": {"full_name": None},
                "content": "We are reviewing your dispute",
                "is_internal": False,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]

        attachment_id = uuid4()
        mock_attachments_response = MagicMock()
        mock_attachments_response.data = [
            {
                "id": str(attachment_id),
                "filename": "invoice.pdf",
                "storage_path": "disputes/test.pdf",
                "file_size": 12345,
                "mime_type": "application/pdf",
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]

        def table_side_effect(table_name):
            if table_name == "disputes":
                mock_exec = MagicMock()
                mock_exec.execute.return_value = mock_dispute_response
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_exec
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "dispute_comments":
                mock_exec = MagicMock()
                mock_exec.execute.return_value = mock_comments_response
                mock_order = MagicMock()
                mock_order.order.return_value = mock_exec
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_order
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "dispute_attachments":
                mock_exec = MagicMock()
                mock_exec.execute.return_value = mock_attachments_response
                mock_order = MagicMock()
                mock_order.order.return_value = mock_exec
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_order
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

    def test_get_dispute_with_comments_and_attachments(self, admin_client, test_org_id):
        """Should return full dispute details including comments and attachments."""
        mock_supabase = admin_client.mock_supabase

        dispute_id = uuid4()
        tenant_user_id = uuid4()
        statement_id = uuid4()

        self._setup_dispute_table_mocks(
            mock_supabase, dispute_id, tenant_user_id, statement_id, test_org_id
        )

        # Mock storage client to return a presigned URL
        mock_storage = MagicMock()
        fake_presigned_url = "https://r2.example.com/disputes/test.pdf?sig=abc"
        mock_storage.get_document_url.return_value = fake_presigned_url
        app.dependency_overrides[get_storage_client] = lambda: mock_storage

        try:
            response = admin_client.get(f"/api/v1/disputes/{dispute_id}")
        finally:
            if get_storage_client in app.dependency_overrides:
                del app.dependency_overrides[get_storage_client]

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(dispute_id)
        assert data["category"] == "calculation_error"
        assert data["status"] == "under_review"
        assert len(data["comments"]) == 1
        assert data["comments"][0]["content"] == "We are reviewing your dispute"
        assert data["comments"][0]["author_name"] == "Unknown"
        assert len(data["attachments"]) == 1
        assert data["attachments"][0]["filename"] == "invoice.pdf"
        assert data["attachments"][0]["file_url"] == fake_presigned_url
        mock_storage.get_document_url.assert_called_once_with("disputes/test.pdf")

    def test_get_dispute_attachment_presign_storage_error_fallback(
        self, admin_client, test_org_id
    ):
        """Should fall back to raw storage_path when presigning raises StorageError."""
        mock_supabase = admin_client.mock_supabase

        dispute_id = uuid4()
        tenant_user_id = uuid4()
        statement_id = uuid4()

        self._setup_dispute_table_mocks(
            mock_supabase, dispute_id, tenant_user_id, statement_id, test_org_id
        )

        # Mock storage client to raise StorageError
        mock_storage = MagicMock()
        mock_storage.get_document_url.side_effect = StorageError("boom")
        app.dependency_overrides[get_storage_client] = lambda: mock_storage

        try:
            response = admin_client.get(f"/api/v1/disputes/{dispute_id}")
        finally:
            if get_storage_client in app.dependency_overrides:
                del app.dependency_overrides[get_storage_client]

        assert response.status_code == 200
        data = response.json()
        # Falls back to raw storage_path
        assert data["attachments"][0]["file_url"] == "disputes/test.pdf"

    def test_get_dispute_not_found(self, admin_client):
        """Should return 404 when dispute doesn't exist."""
        mock_supabase = admin_client.mock_supabase

        dispute_id = uuid4()

        # Mock empty dispute response
        mock_dispute_response = MagicMock()
        mock_dispute_response.data = []

        mock_execute = MagicMock()
        mock_execute.execute.return_value = mock_dispute_response

        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_execute

        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq

        mock_supabase.table.return_value = mock_select

        response = admin_client.get(f"/api/v1/disputes/{dispute_id}")

        assert response.status_code == 404
        assert "Dispute not found" in response.json()["detail"]

    def test_get_dispute_invalid_id_format(self, admin_client):
        """Should return 422 for invalid UUID format."""
        response = admin_client.get("/api/v1/disputes/invalid-uuid")

        assert response.status_code == 422


class TestUpdateDisputeStatus:
    """Tests for PUT /api/v1/disputes/{dispute_id}/status endpoint."""

    def test_update_status_success(self, admin_client, test_admin):
        """Should update dispute status successfully."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()
        statement_id = uuid4()

        # Mock dispute service
        mock_dispute_service = MagicMock()
        mock_dispute_service.update_status = AsyncMock(
            return_value={
                "id": str(dispute_id),
                "statement_id": str(statement_id),
                "category": "calculation_error",
                "status": "resolved",
                "description": "Fixed the calculation",
                "created_at": datetime.now(UTC).isoformat(),
            }
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        with patch(
            "app.api.v1.disputes.capture_backend_event", new_callable=AsyncMock
        ) as mock_capture:
            response = admin_client.put(
                f"/api/v1/disputes/{dispute_id}/status",
                json={
                    "status": "resolved",
                    "resolution_summary": "Fixed calculation error in pool allocation",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "resolved"
        assert data["id"] == str(dispute_id)

        # Verify service was called
        mock_dispute_service.update_status.assert_called_once()
        call_kwargs = mock_dispute_service.update_status.call_args.kwargs
        assert call_kwargs["dispute_id"] == dispute_id
        assert call_kwargs["new_status"] == DisputeStatus.RESOLVED
        assert (
            call_kwargs["resolution_summary"]
            == "Fixed calculation error in pool allocation"
        )
        assert call_kwargs["resolved_by"] == test_admin.id
        mock_capture.assert_awaited_once()
        capture_kwargs = mock_capture.await_args.kwargs
        assert mock_capture.await_args.args == ("landlord_dispute_status_changed",)
        assert capture_kwargs["organization_id"] == str(test_admin.organization_id)
        assert capture_kwargs["user_id"] == str(test_admin.id)
        assert capture_kwargs["properties"] == {
            "dispute_id": str(dispute_id),
            "statement_id": str(statement_id),
            "category": "calculation_error",
            "new_status": "resolved",
        }

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_update_status_invalid_transition(self, admin_client):
        """Should return 400 for invalid status transition."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()

        # Mock dispute service to raise ValueError
        mock_dispute_service = MagicMock()
        mock_dispute_service.update_status = AsyncMock(
            side_effect=ValueError("Invalid status transition")
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.put(
            f"/api/v1/disputes/{dispute_id}/status",
            json={"status": "closed", "resolution_summary": None},
        )

        assert response.status_code == 400
        assert "Invalid status transition" in response.json()["detail"]

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_update_status_dispute_not_found(self, admin_client):
        """Should return 404 when dispute doesn't exist."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()

        mock_dispute_service = MagicMock()
        mock_dispute_service.update_status = AsyncMock(
            side_effect=ValueError("Dispute not found")
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.put(
            f"/api/v1/disputes/{dispute_id}/status",
            json={"status": "under_review", "resolution_summary": None},
        )

        assert response.status_code == 404
        assert "Dispute not found" in response.json()["detail"]

        del app.dependency_overrides[get_dispute_service]

    def test_update_status_invalid_dispute_id(self, admin_client):
        """Should return 422 for invalid dispute ID format."""
        from app.api.v1.disputes import get_dispute_service

        # Mock service (not actually called but dependency needs to be satisfied)
        mock_dispute_service = MagicMock()
        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.put(
            "/api/v1/disputes/invalid-uuid/status",
            json={"status": "resolved", "resolution_summary": "Fixed"},
        )

        assert response.status_code == 422

        # Clean up
        del app.dependency_overrides[get_dispute_service]


class TestAddAdminComment:
    """Tests for POST /api/v1/disputes/{dispute_id}/comments endpoint."""

    def test_add_public_comment(self, admin_client, test_admin):
        """Should add public comment successfully."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()
        comment_id = uuid4()

        # Mock dispute service
        mock_dispute_service = MagicMock()
        mock_dispute_service.add_comment = AsyncMock(
            return_value={
                "id": str(comment_id),
                "dispute_id": str(dispute_id),
                "author_id": str(test_admin.id),
                "content": "We have reviewed your dispute and will resolve it shortly",
                "is_internal": False,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        with patch(
            "app.api.v1.disputes.capture_backend_event", new_callable=AsyncMock
        ) as mock_capture:
            response = admin_client.post(
                f"/api/v1/disputes/{dispute_id}/comments",
                json={
                    "content": (
                        "We have reviewed your dispute and will resolve it shortly"
                    ),
                    "is_internal": False,
                },
            )

        assert response.status_code == 201
        data = response.json()
        assert (
            data["content"]
            == "We have reviewed your dispute and will resolve it shortly"
        )
        assert data["is_internal"] is False
        assert data["author_id"] == str(test_admin.id)
        # F-059: author_name resolves from the authenticated admin, not the
        # "Unknown" default (add_comment service result has no author join).
        assert data["author_name"] == "Ada Admin"

        # Verify service was called
        mock_dispute_service.add_comment.assert_called_once()
        call_kwargs = mock_dispute_service.add_comment.call_args.kwargs
        assert call_kwargs["dispute_id"] == dispute_id
        assert call_kwargs["author_id"] == test_admin.id
        assert call_kwargs["is_internal"] is False
        mock_capture.assert_awaited_once()
        capture_kwargs = mock_capture.await_args.kwargs
        assert mock_capture.await_args.args == ("landlord_dispute_comment_added",)
        assert capture_kwargs["organization_id"] == str(test_admin.organization_id)
        assert capture_kwargs["user_id"] == str(test_admin.id)
        assert capture_kwargs["properties"] == {
            "dispute_id": str(dispute_id),
            "is_internal": False,
        }
        assert "content" not in capture_kwargs["properties"]

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_add_internal_comment(self, admin_client, test_admin):
        """Should add internal comment successfully."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()
        comment_id = uuid4()

        # Mock dispute service
        mock_dispute_service = MagicMock()
        mock_dispute_service.add_comment = AsyncMock(
            return_value={
                "id": str(comment_id),
                "dispute_id": str(dispute_id),
                "author_id": str(test_admin.id),
                "content": "Internal note: need to check with accounting",
                "is_internal": True,
                "created_at": datetime.now(UTC).isoformat(),
            }
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.post(
            f"/api/v1/disputes/{dispute_id}/comments",
            json={
                "content": "Internal note: need to check with accounting",
                "is_internal": True,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["is_internal"] is True
        assert data["content"] == "Internal note: need to check with accounting"

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_add_comment_dispute_not_found(self, admin_client):
        """Should return 404 when dispute doesn't exist."""
        from app.api.v1.disputes import get_dispute_service

        dispute_id = uuid4()

        # Mock dispute service to raise ValueError
        mock_dispute_service = MagicMock()
        mock_dispute_service.add_comment = AsyncMock(
            side_effect=ValueError("Dispute not found")
        )

        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.post(
            f"/api/v1/disputes/{dispute_id}/comments",
            json={"content": "Test comment", "is_internal": False},
        )

        assert response.status_code == 404
        assert "Dispute not found" in response.json()["detail"]

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_add_comment_empty_content(self, admin_client):
        """Should return 422 for empty comment content."""
        from app.api.v1.disputes import get_dispute_service

        # Mock service (not actually called but dependency needs to be satisfied)
        mock_dispute_service = MagicMock()
        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        dispute_id = uuid4()

        response = admin_client.post(
            f"/api/v1/disputes/{dispute_id}/comments",
            json={"content": "", "is_internal": False},
        )

        assert response.status_code == 422

        # Clean up
        del app.dependency_overrides[get_dispute_service]

    def test_add_comment_invalid_dispute_id(self, admin_client):
        """Should return 422 for invalid dispute ID format."""
        from app.api.v1.disputes import get_dispute_service

        # Mock service (not actually called but dependency needs to be satisfied)
        mock_dispute_service = MagicMock()
        app.dependency_overrides[get_dispute_service] = lambda: mock_dispute_service

        response = admin_client.post(
            "/api/v1/disputes/invalid-uuid/comments",
            json={"content": "Test comment", "is_internal": False},
        )

        assert response.status_code == 422

        # Clean up
        del app.dependency_overrides[get_dispute_service]
