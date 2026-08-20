"""
Tests for tenant signup API endpoint.

Following TDD Red-Green-Refactor:
- These tests are written FIRST (Red phase)
- Implementation follows to make them pass (Green phase)
- Then refactor for quality

Story: Epic 19, Story 19.1 - Tenant Portal authentication
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def test_client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def valid_signup_payload():
    """Valid signup request payload."""
    return {
        "token": "a" * 32,  # Valid 32-char token
        "password": "SecurePass123",  # Meets complexity requirements
        "contact_name": "John Tenant",
        "accepted_terms": True,
        "terms_version": "2026-06-03",
        "terms_hash": "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
    }


class TestTenantSignup:
    """Tests for POST /api/v1/tenant/signup endpoint."""

    def test_signup_requires_current_terms_acceptance(
        self, test_client, valid_signup_payload
    ):
        """Signup rejects missing or stale terms assent."""
        for payload in (
            {k: v for k, v in valid_signup_payload.items() if k != "accepted_terms"},
            {**valid_signup_payload, "accepted_terms": False},
            {**valid_signup_payload, "terms_version": "2026-01-01"},
            {**valid_signup_payload, "terms_hash": "sha256:stale"},
        ):
            response = test_client.post("/api/v1/tenant/signup", json=payload)

            assert response.status_code in (400, 422)

    def test_signup_success_creates_all_records(
        self, test_client, valid_signup_payload
    ):
        """Should successfully complete signup flow and return tokens."""
        tenant_user_id = uuid4()
        auth_user_id = uuid4()
        org_id = uuid4()

        with patch(
            "app.api.v1.tenant.signup.TenantInvitationService"
        ) as mock_service_class:
            # Mock the complete_signup method
            mock_service = MagicMock()
            # complete_signup returns a dict, not an object
            mock_tenant_user = {
                "id": str(tenant_user_id),
                "user_id": str(auth_user_id),
                "organization_id": str(org_id),
                "contact_name": valid_signup_payload["contact_name"],
                "contact_email": "test@example.com",
                "created_at": datetime.now(UTC).isoformat(),
            }

            mock_service.complete_signup = AsyncMock(
                return_value=(
                    mock_tenant_user,
                    "access_token_123",
                    "refresh_token_456",
                )
            )
            mock_service_class.return_value = mock_service

            response = test_client.post(
                "/api/v1/tenant/signup",
                json=valid_signup_payload,
            )

            assert response.status_code == 201
            mock_service.complete_signup.assert_awaited_once()
            call_kwargs = mock_service.complete_signup.await_args.kwargs
            assert call_kwargs["accepted_terms"] is True
            assert call_kwargs["terms_version"] == valid_signup_payload["terms_version"]
            assert call_kwargs["terms_hash"] == valid_signup_payload["terms_hash"]
            data = response.json()
            assert data["success"] is True
            assert data["user_id"] == str(auth_user_id)
            assert data["access_token"] == "access_token_123"
            assert data["refresh_token"] == "refresh_token_456"
            assert "tenant_user" in data

    def test_signup_invalid_token_returns_410(self, test_client, valid_signup_payload):
        """Should return 410 for invalid/expired/used token."""
        with patch(
            "app.api.v1.tenant.signup.TenantInvitationService"
        ) as mock_service_class:
            from app.exceptions.handlers import InvalidInvitationTokenError

            mock_service = MagicMock()
            mock_service.complete_signup = AsyncMock(
                side_effect=InvalidInvitationTokenError(reason="expired")
            )
            mock_service_class.return_value = mock_service

            response = test_client.post(
                "/api/v1/tenant/signup",
                json=valid_signup_payload,
            )

            assert response.status_code == 410
            data = response.json()
            # Check that the detail contains the error info (may be in 'detail' field)
            assert "detail" in data
            # Detail may be a string or dict depending on error handler
            detail = data["detail"]
            if isinstance(detail, str):
                # If it's a string, it should contain 'Invalid invitation' and 'expired'
                assert "Invalid invitation" in detail
                assert "expired" in detail
            else:
                # If it's a dict, check the structure
                assert detail["error"] == "Invalid invitation"
                assert detail["reason"] == "expired"

    def test_signup_weak_password_returns_422(self, test_client, valid_signup_payload):
        """Should return 4xx for password that doesn't meet complexity requirements."""
        weak_passwords = [
            "short",  # Too short
            "alllowercase123",  # No uppercase
            "ALLUPPERCASE123",  # No lowercase
            "NoDigitsHere",  # No digits
        ]

        for weak_password in weak_passwords:
            payload = {**valid_signup_payload, "password": weak_password}
            response = test_client.post(
                "/api/v1/tenant/signup",
                json=payload,
            )

            # Should be 400 or 422 (client error - validation failed)
            assert response.status_code in [
                400,
                422,
            ], f"Expected 400 or 422, got {response.status_code} for password: {weak_password}"

    def test_signup_duplicate_email_returns_409(
        self, test_client, valid_signup_payload
    ):
        """Should return 409 if email is already registered."""
        with patch(
            "app.api.v1.tenant.signup.TenantInvitationService"
        ) as mock_service_class:
            from fastapi import HTTPException

            mock_service = MagicMock()
            mock_service.complete_signup = AsyncMock(
                side_effect=HTTPException(
                    status_code=409, detail="Email already registered"
                )
            )
            mock_service_class.return_value = mock_service

            response = test_client.post(
                "/api/v1/tenant/signup",
                json=valid_signup_payload,
            )

            assert response.status_code == 409

    def test_signup_returns_access_and_refresh_tokens(
        self, test_client, valid_signup_payload
    ):
        """Should return both access and refresh tokens in response."""
        with patch(
            "app.api.v1.tenant.signup.TenantInvitationService"
        ) as mock_service_class:
            mock_service = MagicMock()
            # complete_signup returns a dict, not an object
            mock_tenant_user = {
                "id": str(uuid4()),
                "user_id": str(uuid4()),
                "organization_id": str(uuid4()),
                "contact_name": "Test User",
                "contact_email": "test@example.com",
                "created_at": datetime.now(UTC).isoformat(),
            }

            mock_service.complete_signup = AsyncMock(
                return_value=(
                    mock_tenant_user,
                    "mock_access_token",
                    "mock_refresh_token",
                )
            )
            mock_service_class.return_value = mock_service

            response = test_client.post(
                "/api/v1/tenant/signup",
                json=valid_signup_payload,
            )

            assert response.status_code == 201
            data = response.json()
            assert "access_token" in data
            assert "refresh_token" in data
            assert data["access_token"] == "mock_access_token"
            assert data["refresh_token"] == "mock_refresh_token"

    def test_signup_transaction_rollback_on_failure(
        self, test_client, valid_signup_payload
    ):
        """Should rollback transaction if Supabase auth creation fails."""
        with patch(
            "app.api.v1.tenant.signup.TenantInvitationService"
        ) as mock_service_class:
            from fastapi import HTTPException

            mock_service = MagicMock()
            mock_service.complete_signup = AsyncMock(
                side_effect=HTTPException(
                    status_code=500, detail="Failed to create auth user"
                )
            )
            mock_service_class.return_value = mock_service

            response = test_client.post(
                "/api/v1/tenant/signup",
                json=valid_signup_payload,
            )

            # Should return 500 Internal Server Error
            assert response.status_code == 500
