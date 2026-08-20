"""Tests for pool template models."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.pool_template import (
    ApplyTemplateRequest,
    PoolStructureNode,
    PoolTemplate,
    PoolTemplateCreate,
    PoolTemplateStructure,
    PoolTemplateUpdate,
)


class TestPoolStructureNode:
    """Tests for PoolStructureNode model."""

    def test_valid_parent_node_without_children(self):
        """Should create node without children."""
        node = PoolStructureNode(
            name="Utilities",
            gross_up_enabled=True,
            children=[],
        )

        assert node.name == "Utilities"
        assert node.gross_up_enabled is True
        assert node.children == []

    def test_valid_parent_node_with_children(self):
        """Should create node with children (2-level hierarchy)."""
        node = PoolStructureNode(
            name="Utilities",
            gross_up_enabled=True,
            children=[
                PoolStructureNode(name="Electric", gross_up_enabled=True),
                PoolStructureNode(name="Water", gross_up_enabled=False),
            ],
        )

        assert node.name == "Utilities"
        assert len(node.children) == 2
        assert node.children[0].name == "Electric"
        assert node.children[1].name == "Water"

    def test_rejects_grandchildren(self):
        """Should reject nodes with grandchildren (3-level hierarchy)."""
        with pytest.raises(ValidationError) as exc_info:
            PoolStructureNode(
                name="Utilities",
                gross_up_enabled=True,
                children=[
                    PoolStructureNode(
                        name="Electric",
                        gross_up_enabled=True,
                        children=[
                            PoolStructureNode(name="Lighting", gross_up_enabled=True)
                        ],
                    )
                ],
            )

        assert "cannot exceed 2 levels" in str(exc_info.value)

    def test_default_gross_up_enabled(self):
        """Should default gross_up_enabled to True."""
        node = PoolStructureNode(name="Utilities")

        assert node.gross_up_enabled is True

    def test_rejects_empty_name(self):
        """Should reject empty name."""
        with pytest.raises(ValidationError):
            PoolStructureNode(name="")

    def test_rejects_name_too_long(self):
        """Should reject name longer than 100 characters."""
        with pytest.raises(ValidationError):
            PoolStructureNode(name="A" * 101)


class TestPoolTemplateStructure:
    """Tests for PoolTemplateStructure model."""

    def test_valid_structure(self):
        """Should create structure with pools."""
        structure = PoolTemplateStructure(
            pools=[
                PoolStructureNode(name="Utilities", gross_up_enabled=True),
                PoolStructureNode(name="Taxes", gross_up_enabled=False),
            ]
        )

        assert len(structure.pools) == 2
        assert structure.pools[0].name == "Utilities"

    def test_rejects_empty_pools(self):
        """Should reject structure with no pools."""
        with pytest.raises(ValidationError) as exc_info:
            PoolTemplateStructure(pools=[])

        assert "at least one pool" in str(exc_info.value)


class TestPoolTemplate:
    """Tests for PoolTemplate model."""

    def test_valid_system_template(self):
        """Should create valid system template."""
        template = PoolTemplate(
            id=uuid4(),
            name="Retail Center",
            description="Standard retail template",
            property_type="retail",
            structure={
                "pools": [
                    {"name": "CAM", "gross_up_enabled": True, "children": []},
                ]
            },
            is_system=True,
            organization_id=None,
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert template.is_system is True
        assert template.organization_id is None

    def test_valid_custom_template(self):
        """Should create valid custom template."""
        org_id = uuid4()
        template = PoolTemplate(
            id=uuid4(),
            name="My Custom Template",
            description="Custom template",
            property_type=None,
            structure={
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []},
                ]
            },
            is_system=False,
            organization_id=org_id,
            version=1,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        assert template.is_system is False
        assert template.organization_id == org_id

    def test_validates_structure_schema(self):
        """Should validate structure matches PoolTemplateStructure schema."""
        with pytest.raises(ValidationError):
            PoolTemplate(
                id=uuid4(),
                name="Invalid",
                description=None,
                property_type=None,
                structure={"pools": []},  # Empty pools not allowed
                is_system=False,
                organization_id=uuid4(),
                version=1,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )


class TestPoolTemplateCreate:
    """Tests for PoolTemplateCreate DTO."""

    def test_valid_create_request(self):
        """Should create valid create request."""
        create_data = PoolTemplateCreate(
            name="My Template",
            description="Test template",
            property_type="office",
            structure={
                "pools": [
                    {"name": "Utilities", "gross_up_enabled": True, "children": []},
                ]
            },
        )

        assert create_data.name == "My Template"
        assert create_data.property_type == "office"

    def test_validates_structure(self):
        """Should validate structure schema."""
        with pytest.raises(ValidationError):
            PoolTemplateCreate(
                name="Invalid",
                description=None,
                property_type=None,
                structure={"pools": []},  # Empty pools
            )


class TestPoolTemplateUpdate:
    """Tests for PoolTemplateUpdate DTO."""

    def test_partial_update(self):
        """Should allow partial updates."""
        update_data = PoolTemplateUpdate(
            name="New Name",
            description=None,
            property_type=None,
            structure=None,
        )

        assert update_data.name == "New Name"
        assert update_data.structure is None

    def test_validates_structure_if_provided(self):
        """Should validate structure if provided."""
        with pytest.raises(ValidationError):
            PoolTemplateUpdate(
                name=None,
                description=None,
                property_type=None,
                structure={"pools": []},  # Empty pools
            )


class TestApplyTemplateRequest:
    """Tests for ApplyTemplateRequest model."""

    def test_valid_request(self):
        """Should create valid apply request."""
        request = ApplyTemplateRequest(
            template_id=uuid4(),
            property_id=uuid4(),
            delete_existing=True,
        )

        assert request.delete_existing is True

    def test_default_delete_existing(self):
        """Should default delete_existing to True."""
        request = ApplyTemplateRequest(
            template_id=uuid4(),
            property_id=uuid4(),
        )

        assert request.delete_existing is True
