"""Tests for pool template service."""

from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.pool_template import (
    ApplyTemplateRequest,
    PoolTemplateCreate,
    PoolTemplateUpdate,
)
from app.services.pools.template_service import PoolTemplateService


@pytest.fixture
def mock_supabase():
    """Create mock Supabase client."""
    return MagicMock()


@pytest.fixture
def org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def template_service(mock_supabase, org_id):
    """Create template service instance."""
    return PoolTemplateService(mock_supabase, org_id)


class TestListTemplates:
    """Tests for list_templates method."""

    async def test_list_all_templates(self, template_service, mock_supabase):
        """Should list all templates (system + org custom)."""
        # Mock response
        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "name": "Retail Center",
                "description": "System template",
                "property_type": "retail",
                "is_system": True,
                "structure": {
                    "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
                },
                "created_at": datetime.now(UTC).isoformat(),
            },
            {
                "id": str(uuid4()),
                "name": "My Template",
                "description": "Custom template",
                "property_type": "office",
                "is_system": False,
                "structure": {
                    "pools": [
                        {"name": "Utilities", "gross_up_enabled": True, "children": []},
                        {"name": "Taxes", "gross_up_enabled": False, "children": []},
                    ]
                },
                "created_at": datetime.now(UTC).isoformat(),
            },
        ]

        # Setup mock chain
        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_order = MagicMock()
        mock_order.order.return_value = mock_chain
        mock_select = MagicMock()
        mock_select.order.return_value = mock_order
        mock_table = MagicMock()
        mock_table.select.return_value = mock_select
        mock_supabase.table.return_value = mock_table

        # Call service
        templates = await template_service.list_templates()

        # Assertions
        assert len(templates) == 2
        assert templates[0].name == "Retail Center"
        assert templates[0].pool_count == 1
        assert templates[1].name == "My Template"
        assert templates[1].pool_count == 2

    async def test_list_templates_filtered_by_property_type(
        self, template_service, mock_supabase
    ):
        """Should filter templates by property type."""
        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "name": "Office Template",
                "description": "Office only",
                "property_type": "office",
                "is_system": True,
                "structure": {
                    "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
                },
                "created_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_order2 = MagicMock()
        mock_order2.order.return_value = mock_chain
        mock_order1 = MagicMock()
        mock_order1.order.return_value = mock_order2
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_order1
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        templates = await template_service.list_templates(property_type="office")

        assert len(templates) == 1
        assert templates[0].property_type == "office"


class TestGetTemplate:
    """Tests for get_template method."""

    async def test_get_existing_template(self, template_service, mock_supabase):
        """Should get template by ID."""
        template_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = {
            "id": str(template_id),
            "name": "Test Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []}
                ]
            },
            "is_system": False,
            "organization_id": str(template_service.organization_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        template = await template_service.get_template(template_id)

        assert str(template.id) == str(template_id)
        assert template.name == "Test Template"

    async def test_get_nonexistent_template(self, template_service, mock_supabase):
        """Should raise error for nonexistent template."""
        template_id = uuid4()
        mock_response = MagicMock()
        mock_response.data = None

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        with pytest.raises(ValueError, match="not found"):
            await template_service.get_template(template_id)


class TestCreateTemplate:
    """Tests for create_template method."""

    async def test_create_valid_template(self, template_service, mock_supabase, org_id):
        """Should create custom template."""
        create_data = PoolTemplateCreate(
            name="My Template",
            description="Custom",
            property_type="office",
            structure={
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []}
                ]
            },
        )

        mock_response = MagicMock()
        mock_response.data = [
            {
                "id": str(uuid4()),
                "name": "My Template",
                "description": "Custom",
                "property_type": "office",
                "structure": create_data.structure,
                "is_system": False,
                "organization_id": str(org_id),
                "version": 1,
                "created_at": datetime.now(UTC).isoformat(),
                "updated_at": datetime.now(UTC).isoformat(),
            }
        ]

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_insert = MagicMock()
        mock_insert.insert.return_value = mock_chain
        mock_supabase.table.return_value = mock_insert

        template = await template_service.create_template(create_data)

        assert template.name == "My Template"
        assert template.is_system is False
        assert template.organization_id == org_id

    async def test_create_template_api_error(self, template_service, mock_supabase):
        """Should raise ValueError when API error occurs."""
        from postgrest.exceptions import APIError

        create_data = PoolTemplateCreate(
            name="Test",
            description="Test",
            property_type="office",
            structure={
                "pools": [
                    {"name": "Test Pool", "gross_up_enabled": True, "children": []}
                ]
            },
        )

        mock_chain = MagicMock()
        mock_chain.execute.side_effect = APIError({"message": "Database error"})
        mock_insert = MagicMock()
        mock_insert.insert.return_value = mock_chain
        mock_supabase.table.return_value = mock_insert

        with pytest.raises(ValueError, match="Failed to create template"):
            await template_service.create_template(create_data)

    async def test_create_template_no_data_returned(
        self, template_service, mock_supabase
    ):
        """Should raise ValueError when no data is returned."""
        create_data = PoolTemplateCreate(
            name="Test",
            description="Test",
            property_type="office",
            structure={
                "pools": [
                    {"name": "Test Pool", "gross_up_enabled": True, "children": []}
                ]
            },
        )

        mock_response = MagicMock()
        mock_response.data = []

        mock_chain = MagicMock()
        mock_chain.execute.return_value = mock_response
        mock_insert = MagicMock()
        mock_insert.insert.return_value = mock_chain
        mock_supabase.table.return_value = mock_insert

        with pytest.raises(ValueError, match="No data returned"):
            await template_service.create_template(create_data)


class TestUpdateTemplate:
    """Tests for update_template method."""

    async def test_update_custom_template(
        self, template_service, mock_supabase, org_id
    ):
        """Should update custom template."""
        template_id = uuid4()

        # Mock get_template call
        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Old Name",
            "description": "Old desc",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []}
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Mock update call
        update_response = MagicMock()
        update_response.data = [
            {
                **get_response.data,
                "name": "New Name",
                "version": 2,
            }
        ]

        def table_side_effect(table_name):
            if table_name == "pool_templates":
                # First call for get
                if not hasattr(table_side_effect, "called"):
                    table_side_effect.called = True
                    mock_chain = MagicMock()
                    mock_chain.execute.return_value = get_response
                    mock_single = MagicMock()
                    mock_single.single.return_value = mock_chain
                    mock_eq = MagicMock()
                    mock_eq.eq.return_value = mock_single
                    mock_select = MagicMock()
                    mock_select.select.return_value = mock_eq
                    return mock_select
                else:
                    # Second call for update
                    mock_chain = MagicMock()
                    mock_chain.execute.return_value = update_response
                    mock_eq = MagicMock()
                    mock_eq.eq.return_value = mock_chain
                    mock_update = MagicMock()
                    mock_update.update.return_value = mock_eq
                    return mock_update
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        update_data = PoolTemplateUpdate(name="New Name")
        template = await template_service.update_template(template_id, update_data)

        assert template.name == "New Name"

    async def test_cannot_update_system_template(self, template_service, mock_supabase):
        """Should reject updates to system templates."""
        template_id = uuid4()

        # Mock get_template to return system template
        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "System Template",
            "description": "System",
            "property_type": "retail",
            "structure": {
                "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
            },
            "is_system": True,
            "organization_id": None,
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = get_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        update_data = PoolTemplateUpdate(name="Hacked")

        with pytest.raises(ValueError, match="Cannot update system templates"):
            await template_service.update_template(template_id, update_data)

    async def test_cannot_update_other_org_template(
        self, template_service, mock_supabase
    ):
        """Should reject updates to templates from other organizations."""
        template_id = uuid4()
        other_org_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Other Org Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "Pool", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(other_org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = get_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        update_data = PoolTemplateUpdate(name="Hacked")

        with pytest.raises(ValueError, match="other organizations"):
            await template_service.update_template(template_id, update_data)

    async def test_update_template_no_changes(
        self, template_service, mock_supabase, org_id
    ):
        """Should return existing template when no updates provided."""
        template_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Test Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "Pool", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = get_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        update_data = PoolTemplateUpdate()  # No fields set
        template = await template_service.update_template(template_id, update_data)

        assert str(template.id) == str(template_id)
        assert template.name == "Test Template"

    async def test_update_template_description(
        self, template_service, mock_supabase, org_id
    ):
        """Should update only description."""
        template_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Test",
            "description": "Old",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "Pool", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        update_response = MagicMock()
        update_response.data = [
            {
                **get_response.data,
                "description": "New description",
            }
        ]

        def table_side_effect(table_name):
            if not hasattr(table_side_effect, "called"):
                table_side_effect.called = True
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            else:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = update_response
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_chain
                mock_update = MagicMock()
                mock_update.update.return_value = mock_eq
                return mock_update

        mock_supabase.table.side_effect = table_side_effect

        update_data = PoolTemplateUpdate(description="New description")
        template = await template_service.update_template(template_id, update_data)

        assert template.description == "New description"

    async def test_update_template_structure_increments_version(
        self, template_service, mock_supabase, org_id
    ):
        """Should increment version when structure changes."""
        template_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Test",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Old Pool", "gross_up_enabled": False, "children": []}
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        new_structure = {
            "pools": [{"name": "New Pool", "gross_up_enabled": True, "children": []}]
        }
        update_response = MagicMock()
        update_response.data = [
            {
                **get_response.data,
                "structure": new_structure,
                "version": 2,
            }
        ]

        def table_side_effect(table_name):
            if not hasattr(table_side_effect, "called"):
                table_side_effect.called = True
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            else:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = update_response
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_chain
                mock_update = MagicMock()
                mock_update.update.return_value = mock_eq
                return mock_update

        mock_supabase.table.side_effect = table_side_effect

        update_data = PoolTemplateUpdate(structure=new_structure)
        template = await template_service.update_template(template_id, update_data)

        assert template.version == 2
        assert template.structure == new_structure


class TestDeleteTemplate:
    """Tests for delete_template method."""

    async def test_delete_custom_template(
        self, template_service, mock_supabase, org_id
    ):
        """Should delete custom template."""
        template_id = uuid4()

        # Mock get_template call
        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "My Template",
            "description": "Custom",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []}
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        def table_side_effect(table_name):
            if table_name == "pool_templates":
                if not hasattr(table_side_effect, "called"):
                    table_side_effect.called = True
                    # First call for get
                    mock_chain = MagicMock()
                    mock_chain.execute.return_value = get_response
                    mock_single = MagicMock()
                    mock_single.single.return_value = mock_chain
                    mock_eq = MagicMock()
                    mock_eq.eq.return_value = mock_single
                    mock_select = MagicMock()
                    mock_select.select.return_value = mock_eq
                    return mock_select
                else:
                    # Second call for delete
                    mock_chain = MagicMock()
                    mock_eq = MagicMock()
                    mock_eq.eq.return_value = mock_chain
                    mock_delete = MagicMock()
                    mock_delete.delete.return_value = mock_eq
                    return mock_delete
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        await template_service.delete_template(template_id)
        # Should not raise error

    async def test_cannot_delete_system_template(self, template_service, mock_supabase):
        """Should reject deletion of system templates."""
        template_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "System Template",
            "description": "System",
            "property_type": "retail",
            "structure": {
                "pools": [{"name": "CAM", "gross_up_enabled": True, "children": []}]
            },
            "is_system": True,
            "organization_id": None,
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = get_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        with pytest.raises(ValueError, match="Cannot delete system templates"):
            await template_service.delete_template(template_id)

    async def test_cannot_delete_other_org_template(
        self, template_service, mock_supabase
    ):
        """Should reject deletion of templates from other organizations."""
        template_id = uuid4()
        other_org_id = uuid4()

        get_response = MagicMock()
        get_response.data = {
            "id": str(template_id),
            "name": "Other Org Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "Pool", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(other_org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        mock_chain = MagicMock()
        mock_chain.execute.return_value = get_response
        mock_single = MagicMock()
        mock_single.single.return_value = mock_chain
        mock_eq = MagicMock()
        mock_eq.eq.return_value = mock_single
        mock_select = MagicMock()
        mock_select.select.return_value = mock_eq
        mock_supabase.table.return_value = mock_select

        with pytest.raises(ValueError, match="other organizations"):
            await template_service.delete_template(template_id)


class TestApplyTemplate:
    """Tests for apply_template_to_property method."""

    async def test_apply_template_creates_pools(
        self, template_service, mock_supabase, org_id
    ):
        """Should create pools from template structure."""
        template_id = uuid4()
        property_id = uuid4()

        # Mock get_template
        get_template_response = MagicMock()
        get_template_response.data = {
            "id": str(template_id),
            "name": "Test Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [
                    {
                        "name": "Utilities",
                        "gross_up_enabled": True,
                        "children": [
                            {
                                "name": "Electric",
                                "gross_up_enabled": True,
                                "children": [],
                            },
                            {"name": "Water", "gross_up_enabled": True, "children": []},
                        ],
                    },
                    {"name": "Taxes", "gross_up_enabled": False, "children": []},
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        # Mock property check
        property_response = MagicMock()
        property_response.data = {"id": str(property_id), "name": "Test Property"}

        # Mock pool creation
        parent_pool_response = MagicMock()
        parent_pool_response.data = [
            {"id": str(uuid4()), "name": "Utilities", "property_id": str(property_id)},
            {"id": str(uuid4()), "name": "Taxes", "property_id": str(property_id)},
        ]

        child_pool_response = MagicMock()
        child_pool_response.data = [
            {"id": str(uuid4()), "name": "Electric", "property_id": str(property_id)},
            {"id": str(uuid4()), "name": "Water", "property_id": str(property_id)},
        ]

        call_count = 0

        def table_side_effect(table_name):
            nonlocal call_count
            call_count += 1

            if table_name == "pool_templates" and call_count == 1:
                # get_template
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_template_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "properties" and call_count == 2:
                # property check
                mock_chain = MagicMock()
                mock_chain.execute.return_value = property_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq2 = MagicMock()
                mock_eq2.eq.return_value = mock_single
                mock_eq1 = MagicMock()
                mock_eq1.eq.return_value = mock_eq2
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq1
                return mock_select
            elif table_name == "expense_pools" and call_count == 3:
                # delete existing
                mock_chain = MagicMock()
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_chain
                mock_delete = MagicMock()
                mock_delete.delete.return_value = mock_eq
                return mock_delete
            elif table_name == "expense_pools" and call_count == 4:
                # insert parent pools
                mock_chain = MagicMock()
                mock_chain.execute.return_value = parent_pool_response
                mock_insert = MagicMock()
                mock_insert.insert.return_value = mock_chain
                return mock_insert
            elif table_name == "expense_pools" and call_count == 5:
                # insert child pools
                mock_chain = MagicMock()
                mock_chain.execute.return_value = child_pool_response
                mock_insert = MagicMock()
                mock_insert.insert.return_value = mock_chain
                return mock_insert
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        request = ApplyTemplateRequest(
            template_id=template_id,
            property_id=property_id,
            delete_existing=True,
        )

        result = await template_service.apply_template_to_property(request)

        assert result["template_name"] == "Test Template"
        assert result["pools_created"] == 4  # 2 parent + 2 child
        assert len(result["parent_pools"]) == 2
        assert len(result["child_pools"]) == 2

    async def test_apply_template_without_deleting_existing(
        self, template_service, mock_supabase, org_id
    ):
        """Should apply template without deleting existing pools."""
        template_id = uuid4()
        property_id = uuid4()

        get_template_response = MagicMock()
        get_template_response.data = {
            "id": str(template_id),
            "name": "Test Template",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []},
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        property_response = MagicMock()
        property_response.data = {"id": str(property_id), "name": "Test Property"}

        parent_pool_response = MagicMock()
        parent_pool_response.data = [
            {"id": str(uuid4()), "name": "Utilities", "property_id": str(property_id)},
        ]

        call_count = 0

        def table_side_effect(table_name):
            nonlocal call_count
            call_count += 1

            if table_name == "pool_templates" and call_count == 1:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_template_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "properties" and call_count == 2:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = property_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq2 = MagicMock()
                mock_eq2.eq.return_value = mock_single
                mock_eq1 = MagicMock()
                mock_eq1.eq.return_value = mock_eq2
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq1
                return mock_select
            elif table_name == "expense_pools" and call_count == 3:
                # insert parent pools (no delete operation)
                mock_chain = MagicMock()
                mock_chain.execute.return_value = parent_pool_response
                mock_insert = MagicMock()
                mock_insert.insert.return_value = mock_chain
                return mock_insert
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        request = ApplyTemplateRequest(
            template_id=template_id,
            property_id=property_id,
            delete_existing=False,  # Don't delete existing
        )

        result = await template_service.apply_template_to_property(request)

        assert result["pools_created"] == 1
        assert len(result["child_pools"]) == 0

    async def test_apply_template_property_not_found(
        self, template_service, mock_supabase, org_id
    ):
        """Should raise error when property not found."""
        template_id = uuid4()
        property_id = uuid4()

        get_template_response = MagicMock()
        get_template_response.data = {
            "id": str(template_id),
            "name": "Test",
            "description": "Test",
            "property_type": "office",
            "structure": {
                "pools": [{"name": "Pool", "gross_up_enabled": True, "children": []}]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        property_response = MagicMock()
        property_response.data = None

        def table_side_effect(table_name):
            if table_name == "pool_templates":
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_template_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "properties":
                mock_chain = MagicMock()
                mock_chain.execute.return_value = property_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq2 = MagicMock()
                mock_eq2.eq.return_value = mock_single
                mock_eq1 = MagicMock()
                mock_eq1.eq.return_value = mock_eq2
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq1
                return mock_select
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        request = ApplyTemplateRequest(
            template_id=template_id,
            property_id=property_id,
            delete_existing=True,
        )

        with pytest.raises(ValueError, match="not found or access denied"):
            await template_service.apply_template_to_property(request)

    async def test_apply_template_no_child_pools(
        self, template_service, mock_supabase, org_id
    ):
        """Should handle templates with no child pools."""
        template_id = uuid4()
        property_id = uuid4()

        get_template_response = MagicMock()
        get_template_response.data = {
            "id": str(template_id),
            "name": "Flat Template",
            "description": "No children",
            "property_type": "office",
            "structure": {
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []},
                    {"name": "Taxes", "gross_up_enabled": False, "children": []},
                ]
            },
            "is_system": False,
            "organization_id": str(org_id),
            "version": 1,
            "created_at": datetime.now(UTC).isoformat(),
            "updated_at": datetime.now(UTC).isoformat(),
        }

        property_response = MagicMock()
        property_response.data = {"id": str(property_id), "name": "Test Property"}

        parent_pool_response = MagicMock()
        parent_pool_response.data = [
            {"id": str(uuid4()), "name": "Utilities", "property_id": str(property_id)},
            {"id": str(uuid4()), "name": "Taxes", "property_id": str(property_id)},
        ]

        call_count = 0

        def table_side_effect(table_name):
            nonlocal call_count
            call_count += 1

            if table_name == "pool_templates" and call_count == 1:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = get_template_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_single
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq
                return mock_select
            elif table_name == "properties" and call_count == 2:
                mock_chain = MagicMock()
                mock_chain.execute.return_value = property_response
                mock_single = MagicMock()
                mock_single.single.return_value = mock_chain
                mock_eq2 = MagicMock()
                mock_eq2.eq.return_value = mock_single
                mock_eq1 = MagicMock()
                mock_eq1.eq.return_value = mock_eq2
                mock_select = MagicMock()
                mock_select.select.return_value = mock_eq1
                return mock_select
            elif table_name == "expense_pools" and call_count == 3:
                # delete existing
                mock_chain = MagicMock()
                mock_eq = MagicMock()
                mock_eq.eq.return_value = mock_chain
                mock_delete = MagicMock()
                mock_delete.delete.return_value = mock_eq
                return mock_delete
            elif table_name == "expense_pools" and call_count == 4:
                # insert parent pools
                mock_chain = MagicMock()
                mock_chain.execute.return_value = parent_pool_response
                mock_insert = MagicMock()
                mock_insert.insert.return_value = mock_chain
                return mock_insert
            return MagicMock()

        mock_supabase.table.side_effect = table_side_effect

        request = ApplyTemplateRequest(
            template_id=template_id,
            property_id=property_id,
            delete_existing=True,
        )

        result = await template_service.apply_template_to_property(request)

        assert result["pools_created"] == 2  # Only parents
        assert len(result["parent_pools"]) == 2
        assert len(result["child_pools"]) == 0
