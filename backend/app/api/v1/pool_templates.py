"""API endpoints for pool template management."""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import (
    OrganizationContext,
    get_org_scoped_context,
    require_org_editor,
)
from app.models.pool_copy import PoolCopyRequest, PoolCopyResult
from app.models.pool_template import (
    ApplyTemplateRequest,
    PoolTemplate,
    PoolTemplateCreate,
    PoolTemplateList,
    PoolTemplateUpdate,
)
from app.services.pools.copy_service import PoolCopyService
from app.services.pools.template_service import PoolTemplateService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pool-templates", tags=["Pool Templates"])


def get_template_service(
    context: OrganizationContext = Depends(get_org_scoped_context),
) -> PoolTemplateService:
    """Get pool template service instance.

    Args:
        context: Organization context with Supabase client

    Returns:
        PoolTemplateService instance
    """
    return PoolTemplateService(context.client, context.organization_id)


def get_copy_service(
    context: OrganizationContext = Depends(get_org_scoped_context),
) -> PoolCopyService:
    """Get pool copy service instance.

    Args:
        context: Organization context with Supabase client

    Returns:
        PoolCopyService instance
    """
    return PoolCopyService(context.client, context.organization_id)


@router.get("", response_model=list[PoolTemplateList])
async def list_templates(
    property_type: str | None = Query(
        None, description="Filter by property type (e.g., 'retail', 'office')"
    ),
    service: PoolTemplateService = Depends(get_template_service),
) -> list[PoolTemplateList]:
    """List all available pool templates.

    Returns both system templates and organization custom templates.

    Args:
        property_type: Optional filter by property type
        service: Pool template service instance

    Returns:
        List of pool templates with basic information
    """
    return await service.list_templates(property_type=property_type)


@router.get("/{template_id}", response_model=PoolTemplate)
async def get_template(
    template_id: UUID,
    service: PoolTemplateService = Depends(get_template_service),
) -> PoolTemplate:
    """Get a specific pool template by ID.

    Args:
        template_id: Template UUID
        service: Pool template service instance

    Returns:
        Full pool template with structure

    Raises:
        HTTPException: 404 if template not found
    """
    try:
        return await service.get_template(template_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post(
    "",
    response_model=PoolTemplate,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_template(
    template_data: PoolTemplateCreate,
    service: PoolTemplateService = Depends(get_template_service),
) -> PoolTemplate:
    """Create a new custom pool template.

    Only custom templates can be created (system templates are pre-defined).

    Args:
        template_data: Template data to create
        service: Pool template service instance

    Returns:
        Created pool template

    Raises:
        HTTPException: 400 if creation fails
    """
    try:
        return await service.create_template(template_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
        ) from e


@router.put(
    "/{template_id}",
    response_model=PoolTemplate,
    dependencies=[Depends(require_org_editor)],
)
async def update_template(
    template_id: UUID,
    update_data: PoolTemplateUpdate,
    service: PoolTemplateService = Depends(get_template_service),
) -> PoolTemplate:
    """Update an existing custom pool template.

    System templates cannot be updated.

    Args:
        template_id: Template UUID to update
        update_data: Fields to update
        service: Pool template service instance

    Returns:
        Updated pool template

    Raises:
        HTTPException: 404 if template not found, 403 if system template
    """
    try:
        return await service.update_template(template_id, update_data)
    except ValueError as e:
        if "system template" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
            ) from e
        elif "not found" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
            ) from e
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
            ) from e


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor)],
)
async def delete_template(
    template_id: UUID,
    service: PoolTemplateService = Depends(get_template_service),
) -> None:
    """Delete a custom pool template.

    System templates cannot be deleted.

    Args:
        template_id: Template UUID to delete
        service: Pool template service instance

    Raises:
        HTTPException: 404 if template not found, 403 if system template
    """
    try:
        await service.delete_template(template_id)
    except ValueError as e:
        if "system template" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=str(e)
            ) from e
        elif "not found" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
            ) from e
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
            ) from e


@router.post(
    "/apply",
    response_model=dict[str, Any],
    dependencies=[Depends(require_org_editor)],
)
async def apply_template(
    request: ApplyTemplateRequest,
    service: PoolTemplateService = Depends(get_template_service),
) -> dict[str, Any]:
    """Apply a pool template to a property.

    Creates expense pools based on the template structure.
    Optionally deletes existing pools before applying.

    Args:
        request: Apply template request
        service: Pool template service instance

    Returns:
        Information about created pools

    Raises:
        HTTPException: 404 if template or property not found, 400 on failure
    """
    try:
        return await service.apply_template_to_property(request)
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
            ) from e
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
            ) from e


@router.post(
    "/copy",
    response_model=PoolCopyResult,
    dependencies=[Depends(require_org_editor)],
)
async def copy_pools(
    request: PoolCopyRequest,
    service: PoolCopyService = Depends(get_copy_service),
) -> PoolCopyResult:
    """Copy expense pools from one property to another.

    Supports merge and replace modes for handling existing pools.

    Args:
        request: Copy request with source, target, and mode
        service: Pool copy service instance

    Returns:
        Result with counts and details of copied pools

    Raises:
        HTTPException: 404 if properties not found, 400 on validation failure
    """
    try:
        return service.copy_pools(request)
    except ValueError as e:
        if "not found" in str(e).lower() or "access denied" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(e)
            ) from e
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)
            ) from e
