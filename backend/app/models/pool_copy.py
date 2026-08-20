"""
Pydantic models for pool copy operations.

Models for copying expense pools between properties with support
for merge and replace modes.
"""

from enum import Enum
from typing import Self
from uuid import UUID

from pydantic import BaseModel, Field, ValidationInfo, field_validator, model_validator


class CopyMode(str, Enum):
    """Mode for copying pools to target property."""

    MERGE = "merge"
    REPLACE = "replace"


class PoolCopyRequest(BaseModel):
    """Request to copy expense pools from one property to another."""

    source_property_id: UUID = Field(..., description="Property to copy pools from")
    target_property_id: UUID = Field(..., description="Property to copy pools to")
    copy_mode: CopyMode = Field(
        default=CopyMode.MERGE,
        description="How to handle existing pools in target property",
    )

    @field_validator("target_property_id")
    @classmethod
    def validate_different_properties(
        cls, target_id: UUID, info: ValidationInfo
    ) -> UUID:
        """Validate that source and target are different properties."""
        if "source_property_id" in info.data:
            source_id = info.data["source_property_id"]
            if target_id == source_id:
                raise ValueError(
                    "Cannot copy pools to the same property. "
                    "Source and target must be different."
                )
        return target_id


class CopiedPoolInfo(BaseModel):
    """Information about a single copied pool."""

    id: UUID = Field(..., description="New pool ID in target property")
    name: str = Field(..., description="Pool name")
    is_parent: bool = Field(..., description="Whether this is a parent pool")


class PoolCopyResult(BaseModel):
    """Result of copying pools between properties."""

    pools_copied: int = Field(..., description="Total number of pools copied", ge=0)
    parent_pools_copied: int = Field(
        ..., description="Number of parent pools copied", ge=0
    )
    child_pools_copied: int = Field(
        ..., description="Number of child pools copied", ge=0
    )
    pools_deleted: int = Field(
        default=0,
        description="Number of pools deleted in replace mode",
        ge=0,
    )
    copied_pools: list[CopiedPoolInfo] = Field(
        default_factory=list,
        description="Details of copied pools",
    )

    @model_validator(mode="after")
    def validate_pool_counts(self) -> Self:
        """Validate that parent + child counts equal total."""
        if self.parent_pools_copied + self.child_pools_copied != self.pools_copied:
            raise ValueError(
                f"Parent ({self.parent_pools_copied}) + "
                f"child ({self.child_pools_copied}) "
                f"pools must equal total ({self.pools_copied})"
            )
        return self
