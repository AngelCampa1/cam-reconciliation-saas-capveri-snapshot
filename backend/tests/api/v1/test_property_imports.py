"""Tests for property import history endpoints.

Story: Property Detail Imports Tab (Full Stack)
Tests verify the import history listing endpoint for properties.
"""

from uuid import uuid4

from tests.conftest import (
    ORG_A_ID,
    ORG_A_PROPERTY_ID,
    ORG_B_PROPERTY_ID,
    MockQueryBuilder,
)


class TestListPropertyImports:
    """Tests for GET /api/v1/properties/{property_id}/imports"""

    def test_list_imports_returns_paginated_response(
        self, org_a_member_client, sample_import_batches
    ):
        """Test listing import batches for a property returns paginated data."""
        property_id = str(ORG_A_PROPERTY_ID)

        # Mock: Need to handle both property check and import batches query
        def mock_table(table_name):
            if table_name == "properties":
                # Return property exists
                return MockQueryBuilder(
                    data=[{"id": property_id, "organization_id": str(ORG_A_ID)}]
                )
            elif table_name == "import_batches":
                # Return import batches
                return MockQueryBuilder(data=sample_import_batches, count=3)
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # ACT
        response = org_a_member_client.get(f"/api/v1/properties/{property_id}/imports")

        # ASSERT
        assert response.status_code == 200
        data = response.json()

        # Verify paginated response structure
        assert "imports" in data
        assert "total" in data
        assert len(data["imports"]) == 3
        assert data["total"] == 3

        # Verify import item structure
        import_item = data["imports"][0]
        assert "id" in import_item
        assert "filename" in import_item
        assert "status" in import_item
        assert "parser_type" in import_item
        assert "rows_processed" in import_item
        assert "rows_imported" in import_item
        assert "rows_failed" in import_item
        assert "created_at" in import_item

    def test_list_imports_filters_by_status(
        self, org_a_member_client, sample_import_batches
    ):
        """Test filtering import batches by status query parameter."""
        property_id = str(ORG_A_PROPERTY_ID)

        # Create batches with different statuses
        failed_batch = {**sample_import_batches[0], "status": "failed"}
        completed_batch = {**sample_import_batches[1], "status": "completed"}

        # Mock: Handle both property check and filtered import batches
        def mock_table(table_name):
            if table_name == "properties":
                return MockQueryBuilder(
                    data=[{"id": property_id, "organization_id": str(ORG_A_ID)}]
                )
            elif table_name == "import_batches":
                # MockQueryBuilder will filter by status
                return MockQueryBuilder(data=[failed_batch, completed_batch])
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # ACT: Filter by failed status
        response = org_a_member_client.get(
            f"/api/v1/properties/{property_id}/imports?status=failed"
        )

        # ASSERT
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["imports"][0]["status"] == "failed"

    def test_list_imports_paginates(self, org_a_member_client, many_import_batches):
        """Test pagination with page and size query parameters."""
        property_id = str(ORG_A_PROPERTY_ID)

        # Mock: Handle both property check and paginated import batches
        def mock_table(table_name):
            if table_name == "properties":
                return MockQueryBuilder(
                    data=[{"id": property_id, "organization_id": str(ORG_A_ID)}]
                )
            elif table_name == "import_batches":
                # Return first 5 of 25 batches
                return MockQueryBuilder(data=many_import_batches[:5], count=25)
            return MockQueryBuilder(data=[])

        org_a_member_client.mock_supabase.table.side_effect = mock_table

        # ACT: Request page 1 with size 5
        response = org_a_member_client.get(
            f"/api/v1/properties/{property_id}/imports?page=1&size=5"
        )

        # ASSERT
        assert response.status_code == 200
        data = response.json()
        assert len(data["imports"]) == 5
        assert data["total"] == 25

    def test_list_imports_returns_404_for_nonexistent_property(
        self, org_a_member_client
    ):
        """Test 404 error when property doesn't exist."""
        fake_property_id = str(uuid4())

        # Mock: Return empty result for property lookup
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(data=[])

        # ACT
        response = org_a_member_client.get(
            f"/api/v1/properties/{fake_property_id}/imports"
        )

        # ASSERT
        assert response.status_code == 404
        assert "Property not found" in response.json()["detail"]

    def test_list_imports_respects_org_isolation(
        self, org_a_member_client, org_b_member_client, sample_import_batches
    ):
        """Test that users can only see imports from their own organization."""
        property_id = str(ORG_B_PROPERTY_ID)

        # Mock: Return batches for Org B property
        org_a_member_client.mock_supabase.table.return_value = MockQueryBuilder(
            data=[]  # Org A user should not see Org B property
        )

        # ACT: Org A user tries to access Org B property imports
        response = org_a_member_client.get(f"/api/v1/properties/{property_id}/imports")

        # ASSERT: Should return 404 (property not found for this org)
        assert response.status_code == 404
