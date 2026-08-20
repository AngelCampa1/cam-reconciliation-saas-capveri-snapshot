"""Lease term version endpoints.

Provides CRUD for versioned lease recovery terms. Each version
has an effective date; the calculation engine uses the version
effective during the reconciliation period.
"""

import logging
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import CurrentAdminUser, OrgContext, require_org_editor
from app.models.lease_term_version import (
    LeaseTermVersion,
    LeaseTermVersionCreate,
    LeaseTermVersionSummary,
)
from app.services.lease_terms import LeaseTermService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/{lease_id}/term-versions",
    response_model=list[LeaseTermVersionSummary],
)
async def list_term_versions(
    lease_id: UUID,
    ctx: OrgContext,
) -> list[LeaseTermVersionSummary]:
    """List all term versions for a lease, newest first."""
    service = LeaseTermService(ctx.client, ctx.organization_id)
    return service.list_versions(lease_id)


@router.get(
    "/{lease_id}/term-versions/effective",
    response_model=LeaseTermVersion,
)
async def get_effective_term_version(
    lease_id: UUID,
    ctx: OrgContext,
    as_of: Annotated[date, Query(description="Date to check effective terms for")],
) -> LeaseTermVersion:
    """Get the term version effective on a given date."""
    service = LeaseTermService(ctx.client, ctx.organization_id)
    version = service.get_effective_terms(lease_id, as_of)
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No term version effective on {as_of} for lease {lease_id}",
        )
    return version


@router.get(
    "/{lease_id}/term-versions/{version_id}",
    response_model=LeaseTermVersion,
)
async def get_term_version(
    lease_id: UUID,
    version_id: UUID,
    ctx: OrgContext,
) -> LeaseTermVersion:
    """Get a specific term version."""
    service = LeaseTermService(ctx.client, ctx.organization_id)
    version = service.get_version(version_id, lease_id=lease_id)
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Term version {version_id} not found",
        )
    return version


@router.post(
    "/{lease_id}/term-versions",
    response_model=LeaseTermVersion,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_term_version(
    lease_id: UUID,
    data: LeaseTermVersionCreate,
    ctx: OrgContext,
) -> LeaseTermVersion:
    """Create a new term version (amendment)."""
    service = LeaseTermService(ctx.client, ctx.organization_id)
    return service.create_version(lease_id, data, ctx.user.id)


@router.delete(
    "/{lease_id}/term-versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_term_version(
    lease_id: UUID,
    version_id: UUID,
    ctx: OrgContext,
    admin: CurrentAdminUser,
) -> None:
    """Delete a term version (admin, blocked if finalized)."""
    service = LeaseTermService(ctx.client, ctx.organization_id)
    try:
        service.delete_version(version_id, lease_id=lease_id)
    except ValueError as e:
        if "finalized" in str(e):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(e),
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
