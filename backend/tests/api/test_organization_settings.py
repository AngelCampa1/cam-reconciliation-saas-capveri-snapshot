"""Tests for organization settings API endpoints.

Tests GET and PATCH endpoints for organization settings management.
"""

from tests.conftest import ORG_A_ID, MockQueryBuilder


class TestGetOrganizationSettings:
    """Tests for GET /api/v1/organization/settings endpoint."""

    def test_get_settings_returns_current_settings(self, org_a_member_client):
        """GET settings returns organization's current settings."""
        # Arrange: Set up mock organization with settings
        org_data = {
            "id": str(ORG_A_ID),
            "name": "Test Organization",
            "settings": {
                "timezone": "America/Los_Angeles",
                "default_currency": "USD",
                "fiscal_year_end_month": 6,
            },
        }

        # Use side_effect to ensure consistent mock behavior
        def mock_table(table_name):
            if table_name == "organizations":
                return MockQueryBuilder(data=[org_data])
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # Act
        response = org_a_member_client.get("/api/v1/organization/settings")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "America/Los_Angeles"
        assert data["default_currency"] == "USD"
        assert data["fiscal_year_end_month"] == 6

    def test_get_settings_returns_defaults_if_not_set(self, org_a_member_client):
        """GET settings returns default values when settings are null."""
        # Arrange: Organization with null settings
        org_data = {
            "id": str(ORG_A_ID),
            "name": "Test Organization",
            "settings": None,
        }
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[org_data]
        )

        # Act
        response = org_a_member_client.get("/api/v1/organization/settings")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "America/New_York"  # default
        assert data["default_currency"] == "USD"  # default
        assert data["fiscal_year_end_month"] == 12  # default


class TestUpdateOrganizationSettings:
    """Tests for PATCH /api/v1/organization/settings endpoint."""

    def test_update_settings_requires_owner_role_for_member(self, org_a_member_client):
        """PATCH settings returns 403 for non-owner (member) users."""
        # Act
        response = org_a_member_client.patch(
            "/api/v1/organization/settings",
            json={"timezone": "Europe/London"},
        )

        # Assert
        assert response.status_code == 403
        assert "Owner privileges required" in response.json()["detail"]

    def test_update_settings_rejects_admin_non_owner(self, org_a_admin_client):
        """PATCH settings returns 403 for admins who are not owners (F-117).

        The organizations UPDATE RLS policy is owner-only, so a non-owner
        admin would pass a weaker API check but have the DB write silently
        filtered by RLS (a misleading 200). Requiring owner surfaces a real
        403 instead.
        """
        response = org_a_admin_client.patch(
            "/api/v1/organization/settings",
            json={"timezone": "Europe/London"},
        )

        assert response.status_code == 403
        assert "Owner privileges required" in response.json()["detail"]

    def test_update_settings_partial_update_works(self, org_a_owner_client):
        """PATCH settings allows partial updates (only provided fields)."""
        # Arrange: Existing settings
        existing_org = {
            "id": str(ORG_A_ID),
            "name": "Test Organization",
            "settings": {
                "timezone": "America/New_York",
                "default_currency": "USD",
                "fiscal_year_end_month": 12,
            },
        }
        updated_org = {
            **existing_org,
            "settings": {
                "timezone": "Europe/London",
                "default_currency": "USD",
                "fiscal_year_end_month": 12,
            },
        }

        # Mock: First call for GET, second for UPDATE
        org_a_owner_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[updated_org]
        )

        # Act: Only update timezone
        response = org_a_owner_client.patch(
            "/api/v1/organization/settings",
            json={"timezone": "Europe/London"},
        )

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "Europe/London"
        # Other fields should remain unchanged
        assert data["default_currency"] == "USD"
        assert data["fiscal_year_end_month"] == 12

    def test_update_settings_validates_fiscal_month_range(self, org_a_owner_client):
        """PATCH settings validates fiscal_year_end_month is 1-12."""
        # Act: Try invalid month
        response = org_a_owner_client.patch(
            "/api/v1/organization/settings",
            json={"fiscal_year_end_month": 13},
        )

        # Assert
        assert response.status_code == 422  # Validation error

    def test_update_settings_returns_updated_settings(self, org_a_owner_client):
        """PATCH settings returns the updated settings object."""
        # Arrange
        updated_org = {
            "id": str(ORG_A_ID),
            "name": "Test Organization",
            "settings": {
                "timezone": "Asia/Tokyo",
                "default_currency": "JPY",
                "fiscal_year_end_month": 3,
            },
        }
        org_a_owner_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[updated_org]
        )

        # Act
        response = org_a_owner_client.patch(
            "/api/v1/organization/settings",
            json={
                "timezone": "Asia/Tokyo",
                "default_currency": "JPY",
                "fiscal_year_end_month": 3,
            },
        )

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert data["timezone"] == "Asia/Tokyo"
        assert data["default_currency"] == "JPY"
        assert data["fiscal_year_end_month"] == 3
