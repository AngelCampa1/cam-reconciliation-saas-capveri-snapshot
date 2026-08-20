"""Additional tests for PoolTemplateService edge cases.

These tests cover error paths and edge cases for additional coverage.
"""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from postgrest.exceptions import APIError

from app.models.pool_template import (
    ApplyTemplateRequest,
    PoolTemplateUpdate,
)


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    return MagicMock()


@pytest.fixture
def service(mock_supabase):
    """Create PoolTemplateService with mocked dependencies."""
    from app.services.pools.template_service import PoolTemplateService

    return PoolTemplateService(supabase=mock_supabase, organization_id=uuid4())


def make_template_row(is_system: bool = False, org_id: str | None = None) -> dict:
    """Create a template row for testing."""
    return {
        "id": str(uuid4()),
        "name": "Test Template",
        "description": "Test description",
        "property_type": "office",
        "is_system": is_system,
        "structure": {"pools": [{"name": "Default Pool"}]},
        "organization_id": org_id,
        "version": 1,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z",
    }


class TestUpdateTemplateEdgeCases:
    """Edge case tests for update_template method."""

    async def test_update_with_property_type(self, service, mock_supabase) -> None:
        """Update template with property_type field (line 171)."""
        template_id = uuid4()
        template_row = make_template_row(
            is_system=False, org_id=str(service.organization_id)
        )
        template_row["id"] = str(template_id)

        # Mock get_template
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            template_row
        )

        # Mock update
        updated_row = dict(template_row)
        updated_row["property_type"] = "retail"
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            updated_row
        ]

        update_data = PoolTemplateUpdate(property_type="retail")
        result = await service.update_template(template_id, update_data)

        assert result.property_type == "retail"

    async def test_update_api_error(self, service, mock_supabase) -> None:
        """Update template API error raises ValueError (lines 188-189)."""
        template_id = uuid4()
        template_row = make_template_row(
            is_system=False, org_id=str(service.organization_id)
        )
        template_row["id"] = str(template_id)

        # Mock get_template
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            template_row
        )

        # Mock update to raise APIError
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.side_effect = APIError(
            {"message": "DB error"}
        )

        update_data = PoolTemplateUpdate(name="New Name")
        with pytest.raises(ValueError, match="Failed to update template"):
            await service.update_template(template_id, update_data)

    async def test_update_no_data_returned(self, service, mock_supabase) -> None:
        """Update template no data returned raises ValueError (line 192)."""
        template_id = uuid4()
        template_row = make_template_row(
            is_system=False, org_id=str(service.organization_id)
        )
        template_row["id"] = str(template_id)

        # Mock get_template
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            template_row
        )

        # Mock update to return empty data
        mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value.data = (
            []
        )

        update_data = PoolTemplateUpdate(name="New Name")
        with pytest.raises(ValueError, match="No data returned"):
            await service.update_template(template_id, update_data)


class TestDeleteTemplateEdgeCases:
    """Edge case tests for delete_template method."""

    async def test_delete_api_error(self, service, mock_supabase) -> None:
        """Delete template API error raises ValueError (lines 220-221)."""
        template_id = uuid4()
        template_row = make_template_row(
            is_system=False, org_id=str(service.organization_id)
        )
        template_row["id"] = str(template_id)

        # Mock get_template
        mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = (
            template_row
        )

        # Mock delete to raise APIError
        mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.side_effect = APIError(
            {"message": "DB error"}
        )

        with pytest.raises(ValueError, match="Failed to delete template"):
            await service.delete_template(template_id)


class TestApplyTemplateEdgeCases:
    """Edge case tests for apply_template_to_property method."""

    async def test_apply_delete_existing_api_error(
        self, service, mock_supabase
    ) -> None:
        """Apply template delete existing API error raises ValueError (lines 265-266)."""
        template_id = uuid4()
        property_id = uuid4()

        template_row = make_template_row()
        template_row["id"] = str(template_id)

        # Mock get_template
        call_count = [0]

        def select_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:
                # First call - get_template
                mock_result.eq.return_value.single.return_value.execute.return_value.data = (
                    template_row
                )
            else:
                # Second call - property check
                mock_result.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "id": str(property_id),
                    "name": "Test Property",
                }
            return mock_result

        mock_supabase.table.return_value.select.side_effect = select_side_effect

        # Mock delete to raise APIError
        mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.side_effect = APIError(
            {"message": "DB error"}
        )

        request = ApplyTemplateRequest(
            template_id=template_id, property_id=property_id, delete_existing=True
        )

        with pytest.raises(ValueError, match="Failed to delete existing pools"):
            await service.apply_template_to_property(request)

    async def test_apply_create_pools_api_error(self, service, mock_supabase) -> None:
        """Apply template create pools API error raises ValueError (lines 287-288)."""
        template_id = uuid4()
        property_id = uuid4()

        template_row = make_template_row()
        template_row["id"] = str(template_id)
        template_row["structure"] = {"pools": [{"name": "Pool 1"}]}

        # Mock get_template
        call_count = [0]

        def select_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:
                # First call - get_template
                mock_result.eq.return_value.single.return_value.execute.return_value.data = (
                    template_row
                )
            else:
                # Second call - property check
                mock_result.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "id": str(property_id),
                    "name": "Test Property",
                }
            return mock_result

        mock_supabase.table.return_value.select.side_effect = select_side_effect

        # Mock insert to raise APIError
        mock_supabase.table.return_value.insert.return_value.execute.side_effect = (
            APIError({"message": "DB error"})
        )

        request = ApplyTemplateRequest(
            template_id=template_id, property_id=property_id, delete_existing=False
        )

        with pytest.raises(ValueError, match="Failed to create pools from template"):
            await service.apply_template_to_property(request)

    async def test_apply_child_pools_api_error_with_rollback(
        self, service, mock_supabase
    ) -> None:
        """Apply template child pool error triggers rollback (lines 326-338)."""
        template_id = uuid4()
        property_id = uuid4()
        parent_pool_id = str(uuid4())

        template_row = make_template_row()
        template_row["id"] = str(template_id)
        template_row["structure"] = {
            "pools": [{"name": "Pool 1", "children": [{"name": "Child 1"}]}]
        }

        # Mock get_template
        call_count = [0]

        def select_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:
                # First call - get_template
                mock_result.eq.return_value.single.return_value.execute.return_value.data = (
                    template_row
                )
            else:
                # Second call - property check
                mock_result.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "id": str(property_id),
                    "name": "Test Property",
                }
            return mock_result

        mock_supabase.table.return_value.select.side_effect = select_side_effect

        # Track insert calls
        insert_call_count = [0]

        def insert_side_effect(*args, **kwargs):
            insert_call_count[0] += 1
            mock_result = MagicMock()
            if insert_call_count[0] == 1:
                # First insert - parent pools succeed
                mock_result.execute.return_value.data = [
                    {"id": parent_pool_id, "name": "Pool 1"}
                ]
            else:
                # Second insert - child pools fail
                mock_result.execute.side_effect = APIError({"message": "DB error"})
            return mock_result

        mock_supabase.table.return_value.insert.side_effect = insert_side_effect

        # Mock delete for rollback
        mock_supabase.table.return_value.delete.return_value.in_.return_value.execute.return_value = (
            MagicMock()
        )

        request = ApplyTemplateRequest(
            template_id=template_id, property_id=property_id, delete_existing=False
        )

        with pytest.raises(ValueError, match="Failed to create child pools"):
            await service.apply_template_to_property(request)

        # Verify rollback was attempted
        mock_supabase.table.return_value.delete.return_value.in_.assert_called()

    async def test_apply_parent_not_found_continues(
        self, service, mock_supabase
    ) -> None:
        """Apply template skips child when parent not in map (line 303)."""
        template_id = uuid4()
        property_id = uuid4()

        template_row = make_template_row()
        template_row["id"] = str(template_id)
        template_row["structure"] = {
            "pools": [
                {"name": "Pool 1", "children": [{"name": "Child 1"}]},
                {"name": "Pool 2"},  # No children
            ]
        }

        # Mock get_template
        call_count = [0]

        def select_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_result = MagicMock()
            if call_count[0] == 1:
                # First call - get_template
                mock_result.eq.return_value.single.return_value.execute.return_value.data = (
                    template_row
                )
            else:
                # Second call - property check
                mock_result.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "id": str(property_id),
                    "name": "Test Property",
                }
            return mock_result

        mock_supabase.table.return_value.select.side_effect = select_side_effect

        # First insert - parent pools succeed but returns empty (forcing continue at line 303)
        # This simulates the edge case where parent_id_map.get() returns None
        insert_call_count = [0]

        def insert_side_effect(*args, **kwargs):
            insert_call_count[0] += 1
            mock_result = MagicMock()
            if insert_call_count[0] == 1:
                # First insert - parent pools succeed but with different name
                mock_result.execute.return_value.data = [
                    {"id": str(uuid4()), "name": "Different Name"}
                ]
            else:
                # Second insert - child pools
                mock_result.execute.return_value.data = []
            return mock_result

        mock_supabase.table.return_value.insert.side_effect = insert_side_effect

        request = ApplyTemplateRequest(
            template_id=template_id, property_id=property_id, delete_existing=False
        )

        result = await service.apply_template_to_property(request)

        # Should complete without error, skipping child creation due to missing parent
        assert result["pools_created"] == 1  # Only parent created, child skipped
