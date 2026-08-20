"""Shared property access checks for service-role-backed endpoints."""

from uuid import UUID

from fastapi import HTTPException, status

from app.auth.dependencies import OrganizationContext


def verify_property_belongs_to_org(property_id: UUID, ctx: OrganizationContext) -> None:
    """Reject missing or cross-organization properties before privileged work."""
    result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found",
        )
