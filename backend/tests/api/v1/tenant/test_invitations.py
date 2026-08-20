"""
Tests for tenant invitation validation API endpoint.

Following TDD Red-Green-Refactor:
- These tests are written FIRST (Red phase)
- Implementation follows to make them pass (Green phase)
- Then refactor for quality

Story: Epic 19, Story 19.1 - Tenant Portal authentication
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def test_client():
    """Create test client."""
    return TestClient(app)


class TestValidateInvitationToken:
    """Tests for GET /api/v1/tenant/invitations/{token}/validate endpoint."""

    def test_validate_invitation_valid_token(self, test_client):
        """Should return invitation details for valid token."""
        token = "a" * 32  # Valid 32-char token
        valid_invitation = {
            "token": token,
            "email": "tenant@example.com",
            "lease_id": str(uuid4()),
            "organization_id": str(uuid4()),
            "expires_at": (datetime.now(UTC) + timedelta(days=3)).isoformat(),
            "revoked_at": None,
            "used_at": None,
        }

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService"
        ) as mock_service_class:
            mock_service = MagicMock()
            # Service returns a dict, not an object with attributes
            mock_invitation_dict = {
                "email": valid_invitation["email"],
                "lease_id": valid_invitation["lease_id"],
                "organization_id": valid_invitation["organization_id"],
                "expires_at": valid_invitation["expires_at"],
            }

            mock_service.validate_token = AsyncMock(return_value=mock_invitation_dict)
            mock_service_class.return_value = mock_service

            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

            assert response.status_code == 200
            data = response.json()
            assert data["valid"] is True
            assert data["email"] == valid_invitation["email"]
            assert data["lease_id"] == valid_invitation["lease_id"]
            assert data["organization_id"] == valid_invitation["organization_id"]
            assert "expires_at" in data
            assert data["error_reason"] is None

    def test_validate_invitation_expired_token(self, test_client):
        """Should return 200 with valid=false and error_reason='expired' for expired token."""
        token = "a" * 32

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService"
        ) as mock_service_class:
            from app.exceptions.handlers import InvalidInvitationTokenError

            mock_service = MagicMock()
            mock_service.validate_token = AsyncMock(
                side_effect=InvalidInvitationTokenError(reason="expired")
            )
            mock_service_class.return_value = mock_service

            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

            assert response.status_code == 200
            data = response.json()
            assert data["valid"] is False
            assert data["error_reason"] == "expired"

    def test_validate_invitation_used_token(self, test_client):
        """Should return 200 with valid=false and error_reason='used' for used token."""
        token = "a" * 32

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService"
        ) as mock_service_class:
            from app.exceptions.handlers import InvalidInvitationTokenError

            mock_service = MagicMock()
            mock_service.validate_token = AsyncMock(
                side_effect=InvalidInvitationTokenError(reason="used")
            )
            mock_service_class.return_value = mock_service

            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

            assert response.status_code == 200
            data = response.json()
            assert data["valid"] is False
            assert data["error_reason"] == "used"

    def test_validate_invitation_revoked_token(self, test_client):
        """Should return 200 with valid=false and error_reason='revoked' for revoked token."""
        token = "a" * 32

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService"
        ) as mock_service_class:
            from app.exceptions.handlers import InvalidInvitationTokenError

            mock_service = MagicMock()
            mock_service.validate_token = AsyncMock(
                side_effect=InvalidInvitationTokenError(reason="revoked")
            )
            mock_service_class.return_value = mock_service

            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

            assert response.status_code == 200
            data = response.json()
            assert data["valid"] is False
            assert data["error_reason"] == "revoked"

    def test_validate_invitation_nonexistent_token(self, test_client):
        """Should return 200 with valid=false and error_reason='not_found' (not 404 - prevent enumeration)."""
        token = "nonexistent_token_" + "x" * 16

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService"
        ) as mock_service_class:
            from app.exceptions.handlers import InvalidInvitationTokenError

            mock_service = MagicMock()
            mock_service.validate_token = AsyncMock(
                side_effect=InvalidInvitationTokenError(reason="not_found")
            )
            mock_service_class.return_value = mock_service

            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

            # Returns 200 (not 404) to prevent token enumeration
            assert response.status_code == 200
            data = response.json()
            assert data["valid"] is False
            assert data["error_reason"] == "not_found"

    def test_validate_invitation_returns_429_when_rate_limit_exceeded(
        self, test_client
    ):
        """Should return 429 with Retry-After when public validation limit is hit."""
        token = "a" * 32

        with (
            patch(
                "app.api.v1.tenant.invitations.moving_window.hit", return_value=False
            ),
            patch(
                "app.api.v1.tenant.invitations.moving_window.get_window_stats",
                return_value=MagicMock(reset_time=130.0),
            ),
            patch("app.api.v1.tenant.invitations.time.time", return_value=100.0),
            patch("app.api.v1.tenant.invitations.TenantInvitationService") as service,
        ):
            response = test_client.get(f"/api/v1/tenant/invitations/{token}/validate")

        assert response.status_code == 429
        assert response.headers["Retry-After"] == "30"
        assert (
            response.json()["detail"] == "Rate limit exceeded. Retry after 30 seconds."
        )
        service.return_value.validate_token.assert_not_called()
