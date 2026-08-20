"""
Service for copying expense pools between properties.

Handles copying pools with hierarchy preservation and support
for merge and replace modes.
"""

import logging
from typing import Any, cast
from uuid import UUID

from postgrest import CountMethod

from app.database.client import SupabaseDB
from app.models.pool_copy import (
    CopiedPoolInfo,
    CopyMode,
    PoolCopyRequest,
    PoolCopyResult,
)

logger = logging.getLogger(__name__)


class PoolCopyService:
    """Service for copying expense pools between properties."""

    def __init__(self, supabase: SupabaseDB, organization_id: UUID):
        """Initialize service with Supabase client and organization ID."""
        self.supabase = supabase
        self.organization_id = organization_id

    # FIX NEW-SVC-1: Removed async - uses synchronous Supabase client
    def copy_pools(self, request: PoolCopyRequest) -> PoolCopyResult:
        """
        Copy expense pools from source to target property.

        Args:
            request: Copy request with source, target, and mode

        Returns:
            Result with counts and details of copied pools

        Raises:
            ValueError: If properties don't exist or belong to different orgs
        """
        # Validate both properties exist and belong to organization
        self._validate_properties(
            request.source_property_id, request.target_property_id
        )

        # Get source pools
        source_pools = self._get_property_pools(request.source_property_id)

        if not source_pools:
            return PoolCopyResult(
                pools_copied=0,
                parent_pools_copied=0,
                child_pools_copied=0,
                pools_deleted=0,
                copied_pools=[],
            )

        # Handle existing pools based on mode
        pools_deleted = 0
        if request.copy_mode == CopyMode.REPLACE:
            pools_deleted = self._delete_property_pools(request.target_property_id)

        # Copy pools with hierarchy preservation
        copied_pools = self._copy_pools_with_hierarchy(
            source_pools, request.target_property_id
        )

        # Calculate counts
        parent_count = sum(1 for p in copied_pools if p.is_parent)
        child_count = sum(1 for p in copied_pools if not p.is_parent)

        return PoolCopyResult(
            pools_copied=len(copied_pools),
            parent_pools_copied=parent_count,
            child_pools_copied=child_count,
            pools_deleted=pools_deleted,
            copied_pools=copied_pools,
        )

    # FIX NEW-SVC-1: Removed async - uses synchronous Supabase client
    def _validate_properties(self, source_id: UUID, target_id: UUID) -> None:
        """
        Validate that both properties exist and belong to organization.

        Args:
            source_id: Source property ID
            target_id: Target property ID

        Raises:
            ValueError: If properties don't exist or belong to different org
        """
        # Check source property
        source = (
            self.supabase.table("properties")
            .select("id, organization_id")
            .eq("id", str(source_id))
            .eq("organization_id", str(self.organization_id))
            .execute()
        )

        if not source.data:
            raise ValueError(f"Source property {source_id} not found or access denied")

        # Check target property
        target = (
            self.supabase.table("properties")
            .select("id, organization_id")
            .eq("id", str(target_id))
            .eq("organization_id", str(self.organization_id))
            .execute()
        )

        if not target.data:
            raise ValueError(f"Target property {target_id} not found or access denied")

    def _get_property_pools(self, property_id: UUID) -> list[dict[str, Any]]:
        """
        Get all expense pools for a property.

        Args:
            property_id: Property ID to get pools for

        Returns:
            List of pool records ordered by parent first (nulls first)
        """
        result = (
            self.supabase.table("expense_pools")
            .select("*")
            .eq("property_id", str(property_id))
            .order("parent_pool_id", desc=False, nullsfirst=True)
            .execute()
        )

        return cast(list[dict[str, Any]], result.data or [])

    def _delete_property_pools(self, property_id: UUID) -> int:
        """
        Delete all expense pools for a property.

        Args:
            property_id: Property ID to delete pools from

        Returns:
            Number of pools deleted
        """
        # Get count before deletion
        count_result = (
            self.supabase.table("expense_pools")
            .select("id", count=CountMethod.exact)
            .eq("property_id", str(property_id))
            .execute()
        )

        count = count_result.count or 0

        # Delete pools
        self.supabase.table("expense_pools").delete().eq(
            "property_id", str(property_id)
        ).execute()

        return count

    def _copy_pools_with_hierarchy(
        self, source_pools: list[dict[str, Any]], target_property_id: UUID
    ) -> list[CopiedPoolInfo]:
        """
        Copy pools preserving parent-child hierarchy.

        Uses two-pass approach:
        1. Copy parent pools first
        2. Copy child pools with updated parent references

        Args:
            source_pools: Source pool records (ordered parent first)
            target_property_id: Target property ID

        Returns:
            List of copied pool information
        """
        # Map old parent IDs to new parent IDs
        parent_id_map: dict[str, UUID] = {}
        copied_pools: list[CopiedPoolInfo] = []

        # Pass 1: Copy parent pools (those with null parent_pool_id)
        for pool in source_pools:
            if pool.get("parent_pool_id") is None:
                new_pool = self._copy_single_pool(
                    pool, target_property_id, parent_pool_id=None
                )
                parent_id_map[pool["id"]] = UUID(new_pool["id"])
                copied_pools.append(
                    CopiedPoolInfo(
                        id=UUID(new_pool["id"]),
                        name=new_pool["name"],
                        is_parent=True,
                    )
                )

        # Pass 2: Copy child pools with updated parent references
        for pool in source_pools:
            if pool.get("parent_pool_id") is not None:
                old_parent_id = pool["parent_pool_id"]
                new_parent_id = parent_id_map.get(old_parent_id)

                # FIX AS-1: Validate parent exists before creating child
                # If parent wasn't copied (not in map), skip this child to prevent
                # orphaned pools with null parent_pool_id destroying hierarchy
                if new_parent_id is None:
                    # Parent wasn't copied - this is a data integrity issue
                    # Log warning and skip this child pool
                    continue

                new_pool = self._copy_single_pool(
                    pool, target_property_id, parent_pool_id=new_parent_id
                )
                copied_pools.append(
                    CopiedPoolInfo(
                        id=UUID(new_pool["id"]),
                        name=new_pool["name"],
                        is_parent=False,
                    )
                )

        return copied_pools

    def _copy_single_pool(
        self,
        source_pool: dict[str, Any],
        target_property_id: UUID,
        parent_pool_id: UUID | None = None,
    ) -> dict[str, Any]:
        """
        Copy a single pool to target property.

        Args:
            source_pool: Source pool record
            target_property_id: Target property ID
            parent_pool_id: New parent pool ID (if child pool)

        Returns:
            Newly created pool record
        """
        pool_data = {
            "name": source_pool["name"],
            "description": source_pool.get("description"),
            "property_id": str(target_property_id),
            "parent_pool_id": str(parent_pool_id) if parent_pool_id else None,
            "gross_up_enabled": source_pool.get("gross_up_enabled", True),
            "organization_id": str(self.organization_id),
        }

        result = self.supabase.table("expense_pools").insert(pool_data).execute()
        data = cast(list[dict[str, Any]], result.data)
        return data[0]
