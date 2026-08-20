"""Tests for pool template API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import status
from fastapi.testclient import TestClient

from app.auth.dependencies import OrganizationContext, get_org_scoped_context
from app.main import app
from app.models.enums import UserRole


@pytest.fixture
def mock_auth_context():
    """Mock authentication context."""
    context = MagicMock(spec=OrganizationContext)
    context.organization_id = uuid4()
    context.client = MagicMock()
    context.user_id = uuid4()
    context.user = MagicMock(role=UserRole.MEMBER)
    return context


@pytest.fixture
def client(mock_auth_context):
    """FastAPI test client with mocked auth."""
    app.dependency_overrides[get_org_scoped_context] = lambda: mock_auth_context
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def patch_template_service():
    """Patch PoolTemplateService."""
    with patch("app.api.v1.pool_templates.PoolTemplateService") as mock:
        yield mock


@pytest.fixture
def patch_copy_service():
    """Patch PoolCopyService."""
    with patch("app.api.v1.pool_templates.PoolCopyService") as mock:
        yield mock


class TestListTemplates:
    """Tests for GET /pool-templates endpoint."""

    def test_list_all_templates(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should list all templates without filter."""
        mock_service = AsyncMock()
        mock_service.list_templates.return_value = [
            {
                "id": str(uuid4()),
                "name": "Template 1",
                "description": "Test description",
                "property_type": "office",
                "is_system": True,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]
        patch_template_service.return_value = mock_service

        response = client.get("/api/v1/pool-templates")

        assert response.status_code == status.HTTP_200_OK
        assert len(response.json()) == 1
        mock_service.list_templates.assert_called_once_with(property_type=None)

    def test_list_templates_filtered_by_property_type(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should filter templates by property type."""
        mock_service = AsyncMock()
        mock_service.list_templates.return_value = [
            {
                "id": str(uuid4()),
                "name": "Office Template",
                "description": "Test",
                "property_type": "office",
                "is_system": True,
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]
        patch_template_service.return_value = mock_service

        response = client.get("/api/v1/pool-templates?property_type=office")

        assert response.status_code == status.HTTP_200_OK
        mock_service.list_templates.assert_called_once_with(property_type="office")


class TestGetTemplate:
    """Tests for GET /pool-templates/{template_id} endpoint."""

    def test_get_existing_template(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return template when found."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.get_template.return_value = {
            "id": str(template_id),
            "name": "Test Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(mock_auth_context.organization_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        patch_template_service.return_value = mock_service

        response = client.get(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["id"] == str(template_id)

    def test_get_nonexistent_template_returns_404(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 404 when template not found."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.get_template.side_effect = ValueError("Template not found")
        patch_template_service.return_value = mock_service

        response = client.get(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()


class TestCreateTemplate:
    """Tests for POST /pool-templates endpoint."""

    def test_create_valid_template(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should create template and return 201."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.create_template.return_value = {
            "id": str(template_id),
            "name": "New Template",
            "description": "Test",
            "property_type": "retail",
            "structure": {
                "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(mock_auth_context.organization_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        patch_template_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates",
            json={
                "name": "New Template",
                "description": "Test",
                "property_type": "retail",
                "structure": {
                    "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
                },
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.json()["name"] == "New Template"

    def test_create_template_validation_error_returns_400(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 400 when creation fails validation."""
        mock_service = AsyncMock()
        mock_service.create_template.side_effect = ValueError("Invalid structure")
        patch_template_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates",
            json={
                "name": "Bad Template",
                "description": "Test",
                "property_type": "office",
                "structure": {
                    "pools": [
                        {"name": "Test", "gross_up_enabled": True, "children": []}
                    ]
                },
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid" in response.json()["detail"].lower()


class TestUpdateTemplate:
    """Tests for PUT /pool-templates/{template_id} endpoint."""

    def test_update_custom_template(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should update custom template successfully."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.update_template.return_value = {
            "id": str(template_id),
            "name": "Updated Template",
            "description": "Updated",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(mock_auth_context.organization_id),
            "version": 2,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }
        patch_template_service.return_value = mock_service

        response = client.put(
            f"/api/v1/pool-templates/{template_id}",
            json={"name": "Updated Template", "description": "Updated"},
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["name"] == "Updated Template"

    def test_update_system_template_returns_403(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 403 when trying to update system template."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.update_template.side_effect = ValueError(
            "Cannot update system templates"
        )
        patch_template_service.return_value = mock_service

        response = client.put(
            f"/api/v1/pool-templates/{template_id}",
            json={"name": "Hacked System Template"},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "system template" in response.json()["detail"].lower()

    def test_update_nonexistent_template_returns_404(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 404 when template not found."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.update_template.side_effect = ValueError("Template not found")
        patch_template_service.return_value = mock_service

        response = client.put(
            f"/api/v1/pool-templates/{template_id}",
            json={"name": "Updated"},
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_update_template_other_error_returns_400(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 400 for other validation errors."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.update_template.side_effect = ValueError("Invalid data")
        patch_template_service.return_value = mock_service

        response = client.put(
            f"/api/v1/pool-templates/{template_id}",
            json={"name": "Test"},
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "invalid" in response.json()["detail"].lower()


class TestDeleteTemplate:
    """Tests for DELETE /pool-templates/{template_id} endpoint."""

    def test_delete_custom_template(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should delete custom template successfully."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.delete_template.return_value = None
        patch_template_service.return_value = mock_service

        response = client.delete(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_service.delete_template.assert_called_once_with(template_id)

    def test_delete_system_template_returns_403(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 403 when trying to delete system template."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.delete_template.side_effect = ValueError(
            "Cannot delete system templates"
        )
        patch_template_service.return_value = mock_service

        response = client.delete(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "system template" in response.json()["detail"].lower()

    def test_delete_nonexistent_template_returns_404(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 404 when template not found."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.delete_template.side_effect = ValueError("Template not found")
        patch_template_service.return_value = mock_service

        response = client.delete(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_delete_template_other_error_returns_400(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 400 for other errors."""
        template_id = uuid4()
        mock_service = AsyncMock()
        mock_service.delete_template.side_effect = ValueError("Other error")
        patch_template_service.return_value = mock_service

        response = client.delete(f"/api/v1/pool-templates/{template_id}")

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestApplyTemplate:
    """Tests for POST /pool-templates/apply endpoint."""

    def test_apply_template_success(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should apply template to property successfully."""
        template_id = uuid4()
        property_id = uuid4()
        mock_service = AsyncMock()
        mock_service.apply_template_to_property.return_value = {
            "template_name": "Test Template",
            "pools_created": 2,
            "parent_pools": [{"id": str(uuid4()), "name": "CAM"}],
            "child_pools": [{"id": str(uuid4()), "name": "Janitorial"}],
        }
        patch_template_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/apply",
            json={
                "template_id": str(template_id),
                "property_id": str(property_id),
                "delete_existing": True,
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["pools_created"] == 2

    def test_apply_template_not_found_returns_404(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 404 when template or property not found."""
        template_id = uuid4()
        property_id = uuid4()
        mock_service = AsyncMock()
        mock_service.apply_template_to_property.side_effect = ValueError(
            "Template not found"
        )
        patch_template_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/apply",
            json={
                "template_id": str(template_id),
                "property_id": str(property_id),
                "delete_existing": False,
            },
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_apply_template_other_error_returns_400(
        self, client, mock_auth_context, patch_template_service
    ):
        """Should return 400 for other errors."""
        template_id = uuid4()
        property_id = uuid4()
        mock_service = AsyncMock()
        mock_service.apply_template_to_property.side_effect = ValueError(
            "Invalid request"
        )
        patch_template_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/apply",
            json={
                "template_id": str(template_id),
                "property_id": str(property_id),
                "delete_existing": True,
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestCopyPools:
    """Tests for POST /pool-templates/copy endpoint."""

    def test_copy_pools_success(self, client, mock_auth_context, patch_copy_service):
        """Should copy pools between properties successfully."""
        source_id = uuid4()
        target_id = uuid4()
        mock_service = MagicMock()
        mock_service.copy_pools.return_value = {
            "pools_copied": 5,
            "parent_pools_copied": 2,
            "child_pools_copied": 3,
        }
        patch_copy_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/copy",
            json={
                "source_property_id": str(source_id),
                "target_property_id": str(target_id),
                "mode": "replace",
            },
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.json()["pools_copied"] == 5

    def test_copy_pools_property_not_found_returns_404(
        self, client, mock_auth_context, patch_copy_service
    ):
        """Should return 404 when property not found."""
        source_id = uuid4()
        target_id = uuid4()
        mock_service = MagicMock()
        mock_service.copy_pools.side_effect = ValueError("Property not found")
        patch_copy_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/copy",
            json={
                "source_property_id": str(source_id),
                "target_property_id": str(target_id),
                "mode": "merge",
            },
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "not found" in response.json()["detail"].lower()

    def test_copy_pools_access_denied_returns_404(
        self, client, mock_auth_context, patch_copy_service
    ):
        """Should return 404 when access denied."""
        source_id = uuid4()
        target_id = uuid4()
        mock_service = MagicMock()
        mock_service.copy_pools.side_effect = ValueError(
            "Property not found or access denied"
        )
        patch_copy_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/copy",
            json={
                "source_property_id": str(source_id),
                "target_property_id": str(target_id),
                "mode": "replace",
            },
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "access denied" in response.json()["detail"].lower()

    def test_copy_pools_validation_error_returns_400(
        self, client, mock_auth_context, patch_copy_service
    ):
        """Should return 400 for validation errors."""
        source_id = uuid4()
        target_id = uuid4()
        mock_service = MagicMock()
        mock_service.copy_pools.side_effect = ValueError("Invalid mode")
        patch_copy_service.return_value = mock_service

        response = client.post(
            "/api/v1/pool-templates/copy",
            json={
                "source_property_id": str(source_id),
                "target_property_id": str(target_id),
                "mode": "merge",
            },
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
