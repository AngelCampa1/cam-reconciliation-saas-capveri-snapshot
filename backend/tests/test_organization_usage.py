"""
Tests for organization usage endpoints.
"""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.api.v1.organization import get_organization_usage
from app.auth.dependencies import OrganizationContext
from app.models.user import User


@pytest.fixture
def mock_org_context():
    """Mock OrganizationContext."""
    org_id = uuid4()
    user = User(
        id=uuid4(),
        email="user@example.com",
        organization_id=org_id,
        role="admin",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    ctx = MagicMock(spec=OrganizationContext)
    ctx.organization_id = org_id
    ctx.user = user
    ctx.client = MagicMock()

    return ctx


class TestGetOrganizationUsage:
    """Test GET /organization/usage endpoint."""

    @pytest.mark.asyncio
    async def test_returns_usage_statistics(self, mock_org_context):
        """Verify usage endpoint returns property and user counts."""
        # Mock properties count
        props_result = MagicMock()
        props_result.count = 5
        mock_org_context.client.table().select().eq().execute.return_value = (
            props_result
        )

        # Mock users count
        users_result = MagicMock()
        users_result.count = 3

        # Set up call sequence: first call returns props, second returns users
        mock_org_context.client.table().select().eq().execute.side_effect = [
            props_result,
            users_result,
        ]

        # Call endpoint
        response = await get_organization_usage(mock_org_context)

        # Verify response
        assert response["properties"] == 5
        assert response["users"] == 3

    @pytest.mark.asyncio
    async def test_handles_zero_counts(self, mock_org_context):
        """Verify endpoint handles zero counts correctly."""
        # Mock zero counts
        zero_result = MagicMock()
        zero_result.count = 0

        mock_org_context.client.table().select().eq().execute.side_effect = [
            zero_result,
            zero_result,
        ]

        # Call endpoint
        response = await get_organization_usage(mock_org_context)

        # Verify response
        assert response["properties"] == 0
        assert response["users"] == 0

    @pytest.mark.asyncio
    async def test_handles_none_counts(self, mock_org_context):
        """Verify endpoint handles None counts correctly."""
        # Mock None counts
        none_result = MagicMock()
        none_result.count = None

        mock_org_context.client.table().select().eq().execute.side_effect = [
            none_result,
            none_result,
        ]

        # Call endpoint
        response = await get_organization_usage(mock_org_context)

        # Verify response defaults to 0
        assert response["properties"] == 0
        assert response["users"] == 0

    @pytest.mark.asyncio
    async def test_scopes_to_organization(self, mock_org_context):
        """Verify queries are scoped to organization ID."""
        result = MagicMock()
        result.count = 1

        mock_org_context.client.table().select().eq().execute.side_effect = [
            result,
            result,
        ]

        # Call endpoint
        await get_organization_usage(mock_org_context)

        # Verify table() was called for both properties and users
        table_calls = mock_org_context.client.table.call_args_list
        # Extract table names from calls (skip the first empty call from fixture setup)
        table_names = [call[0][0] for call in table_calls if call[0]]
        assert "properties" in table_names
        assert "users" in table_names
