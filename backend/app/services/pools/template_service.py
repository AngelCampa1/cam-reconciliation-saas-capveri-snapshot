"""Pool template service for managing reusable pool configurations."""

import logging
from typing import Any, cast
from uuid import UUID

from postgrest.exceptions import APIError

from app.database.client import SupabaseDB
from app.models.pool_template import (
    ApplyTemplateRequest,
    PoolTemplate,
    PoolTemplateCreate,
    PoolTemplateList,
    PoolTemplateUpdate,
)

logger = logging.getLogger(__name__)


class PoolTemplateService:
    """Service for managing pool templates."""

    def __init__(self, supabase: SupabaseDB, organization_id: UUID):
        """Initialize the pool template service.

        Args:
            supabase: Supabase client instance
            organization_id: Organization ID for scoping custom templates
        """
        self.supabase = supabase
        self.organization_id = organization_id

    async def list_templates(
        self, property_type: str | None = None
    ) -> list[PoolTemplateList]:
        """List all available pool templates (system + organization custom).

        Args:
            property_type: Optional filter by property type

        Returns:
            List of pool templates with basic info
        """
        query = self.supabase.table("pool_templates").select(
            "id, name, description, property_type, is_system, " "structure, created_at"
        )

        # Filter by property type if provided
        if property_type:
            query = query.eq("property_type", property_type)

        # Order: system templates first, then by name
        query = query.order("is_system", desc=True).order("name")

        response = query.execute()

        # Calculate pool_count from structure
        templates = []
        rows = cast(list[dict[str, Any]], response.data)
        for row in rows:
            pool_count = len(row.get("structure", {}).get("pools", []))
            templates.append(
                PoolTemplateList(
                    id=row["id"],
                    name=row["name"],
                    description=row.get("description"),
                    property_type=row.get("property_type"),
                    is_system=row["is_system"],
                    pool_count=pool_count,
                    created_at=row["created_at"],
                )
            )

        return templates

    async def get_template(self, template_id: UUID) -> PoolTemplate:
        """Get a specific pool template by ID.

        Args:
            template_id: Template ID to retrieve

        Returns:
            Full pool template

        Raises:
            ValueError: If template not found or access denied
        """
        response = (
            self.supabase.table("pool_templates")
            .select("*")
            .eq("id", str(template_id))
            .single()
            .execute()
        )

        if not response.data:
            raise ValueError(f"Template {template_id} not found")

        row = cast(dict[str, Any], response.data)
        return PoolTemplate(**row)

    async def create_template(self, template_data: PoolTemplateCreate) -> PoolTemplate:
        """Create a new custom pool template.

        Args:
            template_data: Template data to create

        Returns:
            Created pool template

        Raises:
            ValueError: If creation fails
        """
        # Prepare data with organization_id
        insert_data = {
            "name": template_data.name,
            "description": template_data.description,
            "property_type": template_data.property_type,
            "structure": template_data.structure,
            "is_system": False,  # Custom templates are never system templates
            "organization_id": str(self.organization_id),
            "version": 1,
        }

        try:
            response = (
                self.supabase.table("pool_templates").insert(insert_data).execute()
            )
        except APIError as e:
            raise ValueError(f"Failed to create template: {e}")

        if not response.data:
            raise ValueError("Failed to create template: No data returned")

        rows = cast(list[dict[str, Any]], response.data)
        return PoolTemplate(**rows[0])

    async def update_template(
        self, template_id: UUID, update_data: PoolTemplateUpdate
    ) -> PoolTemplate:
        """Update an existing custom pool template.

        System templates cannot be updated.

        Args:
            template_id: Template ID to update
            update_data: Fields to update

        Returns:
            Updated pool template

        Raises:
            ValueError: If template not found, is a system template, or update fails
        """
        # First verify template exists and is not a system template
        existing = await self.get_template(template_id)
        if existing.is_system:
            raise ValueError("Cannot update system templates")

        if existing.organization_id != self.organization_id:
            raise ValueError("Cannot update templates from other organizations")

        # Build update dictionary with only provided fields
        update_dict: dict[str, Any] = {}
        if update_data.name is not None:
            update_dict["name"] = update_data.name
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.property_type is not None:
            update_dict["property_type"] = update_data.property_type
        if update_data.structure is not None:
            update_dict["structure"] = update_data.structure
            # Increment version when structure changes
            update_dict["version"] = existing.version + 1

        if not update_dict:
            # Nothing to update
            return existing

        try:
            response = (
                self.supabase.table("pool_templates")
                .update(update_dict)
                .eq("id", str(template_id))
                .execute()
            )
        except APIError as e:
            raise ValueError(f"Failed to update template: {e}")

        if not response.data:
            raise ValueError("Failed to update template: No data returned")

        rows = cast(list[dict[str, Any]], response.data)
        return PoolTemplate(**rows[0])

    async def delete_template(self, template_id: UUID) -> None:
        """Delete a custom pool template.

        System templates cannot be deleted.

        Args:
            template_id: Template ID to delete

        Raises:
            ValueError: If template not found, is a system template, or deletion fails
        """
        # First verify template exists and is not a system template
        existing = await self.get_template(template_id)
        if existing.is_system:
            raise ValueError("Cannot delete system templates")

        if existing.organization_id != self.organization_id:
            raise ValueError("Cannot delete templates from other organizations")

        try:
            self.supabase.table("pool_templates").delete().eq(
                "id", str(template_id)
            ).execute()
        except APIError as e:
            raise ValueError(f"Failed to delete template: {e}")

    async def apply_template_to_property(
        self, request: ApplyTemplateRequest
    ) -> dict[str, Any]:
        """Apply a pool template to a property.

        This creates expense pools based on the template structure.
        If delete_existing is True, existing pools are deleted first.

        Args:
            request: Apply template request with template_id, property_id,
                delete_existing

        Returns:
            Dictionary with created pool information

        Raises:
            ValueError: If template or property not found, or application fails
        """
        # Get the template
        template = await self.get_template(request.template_id)

        # Verify property exists and belongs to this organization
        property_response = (
            self.supabase.table("properties")
            .select("id, name")
            .eq("id", str(request.property_id))
            .eq("organization_id", str(self.organization_id))
            .single()
            .execute()
        )

        if not property_response.data:
            raise ValueError(
                f"Property {request.property_id} not found or access denied"
            )

        # Delete existing pools if requested
        if request.delete_existing:
            try:
                self.supabase.table("expense_pools").delete().eq(
                    "property_id", str(request.property_id)
                ).execute()
            except APIError as e:
                raise ValueError(f"Failed to delete existing pools: {e}")

        # Create pools from template structure
        pools_to_create = []
        structure = template.structure

        for pool_node in structure.get("pools", []):
            # Create parent pool
            parent_pool_data = {
                "property_id": str(request.property_id),
                "name": pool_node["name"],
                "gross_up_enabled": pool_node.get("gross_up_enabled", True),
                "parent_pool_id": None,
            }
            pools_to_create.append(parent_pool_data)

        # Insert parent pools first
        try:
            parent_response = (
                self.supabase.table("expense_pools").insert(pools_to_create).execute()
            )
        except APIError as e:
            raise ValueError(f"Failed to create pools from template: {e}")

        created_parents = (
            cast(list[dict[str, Any]], parent_response.data)
            if parent_response.data
            else []
        )

        # Create child pools with parent references
        child_pools = []
        parent_id_map = {p["name"]: p["id"] for p in created_parents}

        for pool_node in structure.get("pools", []):
            parent_id = parent_id_map.get(pool_node["name"])
            if not parent_id:
                continue

            for child_node in pool_node.get("children", []):
                child_pool_data = {
                    "property_id": str(request.property_id),
                    "name": child_node["name"],
                    "gross_up_enabled": child_node.get("gross_up_enabled", True),
                    "parent_pool_id": parent_id,
                }
                child_pools.append(child_pool_data)

        # Insert child pools if any
        created_children = []
        if child_pools:
            try:
                child_response = (
                    self.supabase.table("expense_pools").insert(child_pools).execute()
                )
                created_children = (
                    cast(list[dict[str, Any]], child_response.data)
                    if child_response.data
                    else []
                )
            except APIError as e:
                # FIX AS-2: Rollback parent pools if child creation fails
                # This prevents orphaned parents with no children
                if created_parents:
                    try:
                        parent_ids = [p["id"] for p in created_parents]
                        self.supabase.table("expense_pools").delete().in_(
                            "id", parent_ids
                        ).execute()
                    except APIError:
                        # Log but don't mask original error
                        pass
                raise ValueError(
                    f"Failed to create child pools (rolled back {len(created_parents)} "
                    f"parent pools): {e}"
                )

        return {
            "template_name": template.name,
            "property_id": str(request.property_id),
            "pools_created": len(created_parents) + len(created_children),
            "parent_pools": created_parents,
            "child_pools": created_children,
        }
