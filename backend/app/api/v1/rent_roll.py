"""Rent Roll import endpoints.

Provides endpoints for previewing and importing rent roll files to
create Properties, Units, and Leases from CSV/Excel exports.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.api.deps import get_stripe_service
from app.api.v1.uploads import read_upload_with_limit
from app.auth.dependencies import CurrentAdminUser, OrgContext
from app.services.billing.building_sync import BuildingSyncService
from app.services.billing.quota_enforcement import QuotaEnforcementService
from app.services.billing.stripe_client import StripeService
from app.services.rent_roll_import import RentRollImportService

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_RENT_ROLL_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB
RENT_ROLL_TOO_LARGE_DETAIL = "File too large. Maximum size is 10MB."


# Response schemas
class PropertyMetadataResponse(BaseModel):
    """Property metadata from rent roll parsing."""

    name: str | None = None
    address_line1: str | None = None
    city: str | None = None
    state: str | None = None
    postal_code: str | None = None


class UnitPreviewResponse(BaseModel):
    """Unit data from rent roll preview."""

    unit_number: str
    rentable_sqft: str
    usable_sqft: str | None = None
    floor: int | None = None
    tenant_name: str | None = None
    lease_start: str | None = None
    lease_end: str | None = None
    base_rent: str | None = None
    cam_share: str | None = None


class RentRollPreviewResponse(BaseModel):
    """Response for rent roll preview endpoint."""

    success: bool = Field(description="Whether parsing succeeded")
    source_system: str = Field(description="Detected source system")
    property_metadata: PropertyMetadataResponse = Field(
        default_factory=PropertyMetadataResponse
    )
    units: list[UnitPreviewResponse] = Field(default_factory=list)
    row_count: int = Field(default=0)
    error_count: int = Field(default=0)
    total_units: int = Field(default=0, description="Total unit count")
    occupied_units: int = Field(default=0, description="Occupied unit count")
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RentRollImportResponse(BaseModel):
    """Response for rent roll import endpoint."""

    success: bool
    property_id: str | None = None
    property_name: str | None = None
    units_created: int = 0
    leases_created: int = 0
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


@router.post("/preview", response_model=RentRollPreviewResponse)
async def preview_rent_roll(
    ctx: OrgContext,
    file: Annotated[UploadFile, File(description="Rent roll CSV or Excel file")],
) -> RentRollPreviewResponse:
    """Preview a rent roll file without importing.

    Parses the uploaded file and returns structured preview data including
    detected property metadata, unit information, and parsing statistics.

    Args:
        ctx: Organization-scoped context
        file: Uploaded rent roll file

    Returns:
        Preview data with property metadata, units, and statistics
    """
    service = RentRollImportService()

    content = await read_upload_with_limit(
        file,
        max_size=MAX_RENT_ROLL_UPLOAD_SIZE,
        too_large_detail=RENT_ROLL_TOO_LARGE_DETAIL,
    )

    # Parse using preview (no DB interaction)
    from io import BytesIO

    file_obj = BytesIO(content)
    result = service.preview(file_obj, file.filename or "unknown.csv")

    # Convert units to response format
    units = []
    for unit in result.units:
        units.append(
            UnitPreviewResponse(
                unit_number=unit.unit_number,
                rentable_sqft=str(unit.rentable_sqft),
                usable_sqft=str(unit.usable_sqft) if unit.usable_sqft else None,
                floor=unit.floor,
                tenant_name=unit.tenant_name,
                lease_start=str(unit.lease_start) if unit.lease_start else None,
                lease_end=str(unit.lease_end) if unit.lease_end else None,
                base_rent=str(unit.base_rent) if unit.base_rent else None,
                cam_share=str(unit.cam_share) if unit.cam_share else None,
            )
        )

    # Calculate summary stats
    total_units = len(result.units)
    occupied_units = sum(1 for u in result.units if u.tenant_name is not None)

    return RentRollPreviewResponse(
        success=result.success,
        source_system=result.source_system,
        property_metadata=PropertyMetadataResponse(
            name=result.property_metadata.name,
            address_line1=result.property_metadata.address_line1,
            city=result.property_metadata.city,
            state=result.property_metadata.state,
            postal_code=result.property_metadata.postal_code,
        ),
        units=units,
        row_count=result.row_count,
        error_count=result.error_count,
        total_units=total_units,
        occupied_units=occupied_units,
        errors=result.errors,
        warnings=result.warnings,
    )


@router.post(
    "/import",
    response_model=RentRollImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_rent_roll(
    ctx: OrgContext,
    admin: CurrentAdminUser,  # Require admin role
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
    file: Annotated[UploadFile, File(description="Rent roll CSV or Excel file")],
    property_name: Annotated[
        str | None, Form(description="Override detected property name")
    ] = None,
    address: Annotated[
        str | None, Form(description="Override detected address")
    ] = None,
    city: Annotated[str | None, Form(description="Override detected city")] = None,
    state: Annotated[str | None, Form(description="Override detected state")] = None,
    postal_code: Annotated[
        str | None, Form(description="Override detected postal code")
    ] = None,
) -> RentRollImportResponse:
    """Import a rent roll file, creating Property, Units, and Leases.

    Parses the uploaded file and creates database records for the property,
    all units, and any leases with complete tenant information.

    Requires admin privileges.

    Args:
        ctx: Organization-scoped context
        admin: Admin user verification
        file: Uploaded rent roll file
        property_name: Optional override for property name
        address: Optional override for address
        city: Optional override for city
        state: Optional override for state
        postal_code: Optional override for postal code

    Returns:
        Import result with created entity IDs and counts

    Raises:
        400: If file parsing or import fails
        403: If user lacks admin privileges
    """
    service = RentRollImportService()

    content = await read_upload_with_limit(
        file,
        max_size=MAX_RENT_ROLL_UPLOAD_SIZE,
        too_large_detail=RENT_ROLL_TOO_LARGE_DETAIL,
    )

    from io import BytesIO

    file_obj = BytesIO(content)
    preview = service.preview(file_obj, file.filename or "unknown.csv")
    if not preview.success:
        error_message = preview.errors[0] if preview.errors else "Import failed"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message,
        )

    quota = QuotaEnforcementService(ctx)
    quota.assert_can_add_property()
    quota.assert_can_add_billable_units(len(preview.units))

    file_obj.seek(0)

    # Perform import using the Supabase client from context
    result = service.import_rent_roll(
        file=file_obj,
        file_name=file.filename or "unknown.csv",
        organization_id=ctx.organization_id,
        db=ctx.client,  # Use Supabase client from context
        property_name_override=property_name,
        address_override=address,
        city_override=city,
        state_override=state,
        postal_code_override=postal_code,
    )

    # Handle failure
    if not result.success:
        error_message = result.errors[0] if result.errors else "Import failed"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message,
        )

    building_sync = BuildingSyncService(stripe_service=stripe_service, db=ctx.client)
    try:
        await building_sync.sync_building_count(ctx.organization_id)
        await building_sync.sync_unit_count(ctx.organization_id)
    except ValueError as e:
        logger.warning(
            f"Could not sync billing usage for org {ctx.organization_id}: {e}"
        )

    return RentRollImportResponse(
        success=result.success,
        property_id=str(result.property_id) if result.property_id else None,
        property_name=result.property_name,
        units_created=result.units_created,
        leases_created=result.leases_created,
        errors=result.errors,
        warnings=result.warnings,
    )
