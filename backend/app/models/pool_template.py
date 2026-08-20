"""PoolTemplate domain model for reusable pool configurations.

The PoolTemplate model stores pre-defined and custom pool structures
that can be applied to properties to quickly set up expense pool hierarchies.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PoolStructureNode(BaseModel):
    """Single node in a pool structure hierarchy.

    Represents a pool with optional nested children pools.
    """

    name: str = Field(..., min_length=1, max_length=100)
    gross_up_enabled: bool = Field(default=True)
    children: list["PoolStructureNode"] = Field(default_factory=list)

    @field_validator("children")
    @classmethod
    def validate_max_depth(
        cls, children: list["PoolStructureNode"]
    ) -> list["PoolStructureNode"]:
        """Validate maximum depth of 2 levels (parent → child only)."""
        if children:
            for child in children:
                if child.children:
                    raise ValueError(
                        "Pool hierarchy cannot exceed 2 levels (parent → child only)"
                    )
        return children


class PoolTemplateStructure(BaseModel):
    """Structure of a pool template.

    Contains the pool hierarchy as a list of root-level pools
    with optional nested children.
    """

    pools: list[PoolStructureNode]

    @field_validator("pools")
    @classmethod
    def validate_non_empty(
        cls, pools: list[PoolStructureNode]
    ) -> list[PoolStructureNode]:
        """Validate at least one pool exists."""
        if not pools:
            raise ValueError("Template must contain at least one pool")
        return pools


class PoolTemplate(BaseModel):
    """Full pool template model from database.

    Pool templates allow users to apply pre-defined pool structures
    to properties, saving time when setting up new properties.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    property_type: str | None = Field(
        None, description="Property type filter: retail, office, mixed_use, etc."
    )
    structure: dict[str, Any] = Field(
        ..., description="Pool hierarchy as JSON structure"
    )
    is_system: bool = Field(
        default=False,
        description="True for system templates, False for custom templates",
    )
    organization_id: UUID | None = Field(
        None,
        description="NULL for system templates, organization ID for custom templates",
    )
    version: int = Field(default=1, ge=1)
    created_at: datetime
    updated_at: datetime

    @field_validator("structure")
    @classmethod
    def validate_structure(cls, structure: dict[str, Any]) -> dict[str, Any]:
        """Validate structure matches PoolTemplateStructure schema."""
        # Parse and validate structure
        PoolTemplateStructure(**structure)
        return structure


class PoolTemplateCreate(BaseModel):
    """DTO for creating a custom pool template.

    Only for creating custom (non-system) templates.
    Organization ID will be set from authenticated user context.
    """

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    property_type: str | None = None
    structure: dict[str, Any]

    @field_validator("structure")
    @classmethod
    def validate_structure(cls, structure: dict[str, Any]) -> dict[str, Any]:
        """Validate structure matches PoolTemplateStructure schema."""
        PoolTemplateStructure(**structure)
        return structure


class PoolTemplateUpdate(BaseModel):
    """DTO for updating a custom pool template.

    System templates cannot be updated.
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    property_type: str | None = None
    structure: dict[str, Any] | None = None

    @field_validator("structure")
    @classmethod
    def validate_structure(
        cls, structure: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        """Validate structure matches PoolTemplateStructure schema if provided."""
        if structure is not None:
            PoolTemplateStructure(**structure)
        return structure


class PoolTemplateList(BaseModel):
    """Lightweight template for listing purposes."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None
    property_type: str | None
    is_system: bool
    pool_count: int = Field(
        default=0, description="Number of root-level pools in template"
    )
    created_at: datetime


class ApplyTemplateRequest(BaseModel):
    """Request to apply a template to a property."""

    template_id: UUID = Field(..., description="ID of template to apply")
    property_id: UUID = Field(..., description="ID of property to apply template to")
    delete_existing: bool = Field(
        default=True,
        description="Whether to delete existing pools before applying template",
    )
