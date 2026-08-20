"""Tests for tenant invitation creation API endpoint.

Tests POST /api/v1/tenant/invitations for creating new tenant invitations.
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from tests.conftest import ORG_A_ID, MockQueryBuilder


class TestCreateTenantInvitation:
    """Tests for POST /api/v1/tenant/invitations endpoint."""

    def test_create_invitation_returns_201_with_valid_data(self, org_a_admin_client):
        """POST invitation returns 201 with valid lease and email."""
        lease_id = str(uuid4())

        # Mock lease exists and belongs to org
        lease_data = {
            "id": lease_id,
            "properties.organization_id": str(ORG_A_ID),
            "property_id": str(uuid4()),
        }

        # Mock the created invitation
        created_invitation = {
            "id": str(uuid4()),
            "email": "tenant@example.com",
            "lease_id": lease_id,
            "token": "test-secure-token-12345",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(org_a_admin_client.user.id),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "used_at": None,
            "is_revoked": False,
        }

        def mock_table(table_name):
            if table_name == "leases":
                return MockQueryBuilder(data=[lease_data])
            elif table_name == "tenant_invitations":
                return MockQueryBuilder(data=[created_invitation])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Mock supabase_admin for the service (used for inserts)
        mock_admin_client = MagicMock()
        mock_admin_client.table.side_effect = mock_table

        # Mock email service
        with (
            patch(
                "app.api.v1.tenant.invitations.get_email_service"
            ) as mock_email_service,
            patch(
                "app.services.tenant_invitation.get_supabase_admin",
                return_value=mock_admin_client,
            ),
        ):
            mock_service = MagicMock()
            mock_service.send_tenant_invitation = AsyncMock(
                return_value={"status": "sent", "id": "email-123"}
            )
            mock_email_service.return_value = mock_service

            # Act
            response = org_a_admin_client.post(
                "/api/v1/tenant/invitations",
                json={"email": "tenant@example.com", "lease_id": lease_id},
            )

        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "tenant@example.com"
        assert data["lease_id"] == lease_id
        assert "token" in data
        assert "expires_at" in data

    def test_create_invitation_requires_admin_role(self, org_a_member_client):
        """POST invitation returns 403 for non-admin users."""
        lease_id = str(uuid4())

        # Act
        response = org_a_member_client.post(
            "/api/v1/tenant/invitations",
            json={"email": "tenant@example.com", "lease_id": lease_id},
        )

        # Assert
        assert response.status_code == 403
        assert "Admin privileges required" in response.json()["detail"]

    def test_create_invitation_validates_lease_exists(self, org_a_admin_client):
        """POST invitation returns 404 for non-existent lease."""
        non_existent_lease_id = str(uuid4())

        # Mock no lease found
        def mock_table(table_name):
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_admin_client.post(
            "/api/v1/tenant/invitations",
            json={"email": "tenant@example.com", "lease_id": non_existent_lease_id},
        )

        # Assert
        assert response.status_code == 404
        assert "lease" in response.json()["detail"].lower()

    def test_create_invitation_rejects_lease_from_different_org(
        self, org_a_admin_client
    ):
        """POST invitation returns 404 when lease belongs to another org."""
        lease_id = str(uuid4())

        def mock_table(table_name):
            if table_name == "leases":
                return MockQueryBuilder(
                    data=[
                        {
                            "id": lease_id,
                            "organization_id": str(uuid4()),
                        }
                    ]
                )
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        response = org_a_admin_client.post(
            "/api/v1/tenant/invitations",
            json={"email": "tenant@example.com", "lease_id": lease_id},
        )

        assert response.status_code == 404
        assert "lease" in response.json()["detail"].lower()

    def test_create_invitation_validates_email_format(self, org_a_admin_client):
        """POST invitation returns 422 for invalid email format."""
        lease_id = str(uuid4())

        # Act
        response = org_a_admin_client.post(
            "/api/v1/tenant/invitations",
            json={"email": "invalid-email", "lease_id": lease_id},
        )

        # Assert
        assert response.status_code == 422  # Validation error

    def test_create_invitation_sets_7_day_expiration(self, org_a_admin_client):
        """POST invitation sets expiration to 7 days from now."""
        lease_id = str(uuid4())
        now = datetime.now(UTC)

        lease_data = {
            "id": lease_id,
            "properties.organization_id": str(ORG_A_ID),
        }

        created_invitation = {
            "id": str(uuid4()),
            "email": "tenant@example.com",
            "lease_id": lease_id,
            "token": "test-token",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(org_a_admin_client.user.id),
            "expires_at": (now + timedelta(days=7)).isoformat(),
            "created_at": now.isoformat(),
            "used_at": None,
            "is_revoked": False,
        }

        def mock_table(table_name):
            if table_name == "leases":
                return MockQueryBuilder(data=[lease_data])
            elif table_name == "tenant_invitations":
                return MockQueryBuilder(data=[created_invitation])
            return MockQueryBuilder(data=[])

        org_a_admin_client.mock_supabase.table.side_effect = mock_table

        # Mock supabase_admin for the service (used for inserts)
        mock_admin_client = MagicMock()
        mock_admin_client.table.side_effect = mock_table

        with (
            patch(
                "app.api.v1.tenant.invitations.get_email_service"
            ) as mock_email_service,
            patch(
                "app.services.tenant_invitation.get_supabase_admin",
                return_value=mock_admin_client,
            ),
        ):
            mock_service = MagicMock()
            mock_service.send_tenant_invitation = AsyncMock(
                return_value={"status": "sent", "id": "email-123"}
            )
            mock_email_service.return_value = mock_service

            # Act
            response = org_a_admin_client.post(
                "/api/v1/tenant/invitations",
                json={"email": "tenant@example.com", "lease_id": lease_id},
            )

        # Assert
        assert response.status_code == 201
        data = response.json()
        expires_at = datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
        # Should be approximately 7 days from now (within 1 minute tolerance)
        expected_expiry = now + timedelta(days=7)
        assert abs((expires_at - expected_expiry).total_seconds()) < 60

    @pytest.mark.asyncio
    async def test_create_invitation_logs_email_success_on_direct_call(self):
        """Direct call exercises the successful email send branch."""
        from app.api.v1.tenant.invitations import create_tenant_invitation
        from app.models.tenant import TenantInvitationCreateRequest

        lease_id = uuid4()
        request = TenantInvitationCreateRequest(
            email="tenant@example.com",
            lease_id=lease_id,
        )
        ctx = MagicMock()
        ctx.organization_id = ORG_A_ID
        user = MagicMock()
        user.id = uuid4()
        db = MagicMock()
        email_service = MagicMock()
        email_service.send_tenant_invitation = AsyncMock(
            return_value={"id": "email-123"}
        )

        lease_result = MagicMock(data=[{"id": str(lease_id)}])
        ctx.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
            lease_result
        )

        invitation = {
            "id": str(uuid4()),
            "email": "tenant@example.com",
            "lease_id": str(lease_id),
            "token": "test-secure-token-12345",
            "organization_id": str(ORG_A_ID),
            "invited_by": str(user.id),
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
            "used_at": None,
            "is_revoked": False,
        }

        with patch(
            "app.api.v1.tenant.invitations.TenantInvitationService.create_invitation",
            new=AsyncMock(return_value=invitation),
        ):
            result = await create_tenant_invitation(
                request=request,
                ctx=ctx,
                user=user,
                db=db,
                email_service=email_service,
            )

        assert result.email == "tenant@example.com"
        email_service.send_tenant_invitation.assert_awaited_once()
