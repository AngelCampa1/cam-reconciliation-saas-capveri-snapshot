# Story 4.10: Create Leases CRUD Endpoints

### User Story
**As an** API consumer
**I want** CRUD operations for leases including recovery profile updates
**So that** I can manage tenant leases and their billing terms

### Acceptance Criteria

- [x] **AC1**: Standard CRUD endpoints for leases
- [x] **AC2**: `PUT /api/v1/leases/{id}/recovery-profile` updates only recovery profile
- [x] **AC3**: Recovery profile JSONB properly validated
- [x] **AC4**: Date validation (end > start) enforced
- [x] **AC5**: Unit association optional but validated if provided

### Technical Specifications

**Files to Create**:
```
backend/app/
├── schemas/
│   └── lease.py
└── api/v1/
    └── leases.py
```

**schemas/lease.py**:
```python
"""Lease request/response schemas."""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class LeaseStatus:
    """Lease status constants."""
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"


class CapType:
    """Cap type constants."""
    NONE = "none"
    NON_CUMULATIVE = "non_cumulative"
    CUMULATIVE = "cumulative"
    CUMULATIVE_COMPOUNDING = "cumulative_compounding"


class LeaseRecoveryProfile(BaseModel):
    """
    Lease recovery profile for CAM calculations.

    This defines all the terms that affect how expenses
    are allocated to this tenant.
    """
    base_year: Optional[int] = Field(
        None,
        ge=1990,
        le=2100,
        description="Base year for expense stop"
    )
    base_year_amount: Optional[Decimal] = Field(
        None,
        ge=0,
        description="Fixed base year amount (if not calculated)"
    )
    gross_up_base_year: bool = Field(
        default=False,
        description="Whether to gross up base year to target occupancy"
    )
    pro_rata_share: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=1,
        description="Tenant's proportionate share (0-1)"
    )
    cap_type: str = Field(
        default=CapType.NONE,
        description="Type of expense cap"
    )
    cap_rate: Optional[Decimal] = Field(
        None,
        ge=0,
        le=1,
        description="Annual cap rate (0-1), required if cap_type != none"
    )
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=0.50,
        description="Admin fee percentage (0-0.50)"
    )
    excluded_pools: List[str] = Field(
        default_factory=list,
        description="List of expense pool names to exclude"
    )

    @model_validator(mode="after")
    def validate_cap_rate_required(self):
        """Cap rate required if cap type is not 'none'."""
        if self.cap_type != CapType.NONE and self.cap_rate is None:
            raise ValueError("cap_rate is required when cap_type is not 'none'")
        return self


class LeaseBase(BaseModel):
    """Base lease fields."""
    tenant_name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    status: str = Field(default=LeaseStatus.DRAFT)
    unit_id: Optional[UUID] = None
    document_url: Optional[str] = Field(None, max_length=2048)

    @model_validator(mode="after")
    def validate_dates(self):
        """End date must be after start date."""
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class LeaseCreate(LeaseBase):
    """Schema for creating a lease."""
    property_id: UUID
    recovery_profile: LeaseRecoveryProfile = Field(
        default_factory=LeaseRecoveryProfile
    )


class LeaseUpdate(BaseModel):
    """Schema for updating a lease."""
    tenant_name: Optional[str] = Field(None, min_length=1, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None
    unit_id: Optional[UUID] = None
    document_url: Optional[str] = Field(None, max_length=2048)


class LeaseRecoveryProfileUpdate(LeaseRecoveryProfile):
    """Schema specifically for updating recovery profile."""
    pass


class LeaseResponse(LeaseBase):
    """Lease response schema."""
    id: UUID
    property_id: UUID
    recovery_profile: LeaseRecoveryProfile
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeaseListResponse(BaseModel):
    """List of leases."""
    data: list[LeaseResponse]
    count: int
    has_more: bool = False
```

**api/v1/leases.py**:
```python
"""Lease management endpoints."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Query

from app.auth.dependencies import OrgContext, CurrentAdminUser
from app.exceptions.handlers import NotFoundError
from app.schemas.lease import (
    LeaseCreate,
    LeaseUpdate,
    LeaseRecoveryProfileUpdate,
    LeaseResponse,
    LeaseListResponse,
)

router = APIRouter()


@router.get("", response_model=LeaseListResponse)
async def list_leases(
    ctx: OrgContext,
    property_id: UUID | None = Query(None, description="Filter by property"),
    status_filter: str | None = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 100,
):
    """List all leases for the organization."""
    query = ctx.table("leases") \
        .select("*", count="exact")

    if property_id:
        query = query.eq("property_id", str(property_id))

    if status_filter:
        query = query.eq("status", status_filter)

    result = query \
        .range(skip, skip + limit - 1) \
        .order("created_at", desc=True) \
        .execute()

    return LeaseListResponse(
        data=result.data,
        count=result.count or len(result.data),
        has_more=(result.count or 0) > skip + limit,
    )


@router.get("/{lease_id}", response_model=LeaseResponse)
async def get_lease(
    lease_id: UUID,
    ctx: OrgContext,
):
    """Get a single lease by ID."""
    result = ctx.table("leases") \
        .select("*") \
        .eq("id", str(lease_id)) \
        .single() \
        .execute()

    if result.data is None:
        raise NotFoundError("Lease", str(lease_id))

    return result.data


@router.post("", response_model=LeaseResponse, status_code=status.HTTP_201_CREATED)
async def create_lease(
    lease_data: LeaseCreate,
    ctx: OrgContext,
):
    """Create a new lease."""
    # Verify property belongs to org
    prop_result = ctx.table("properties") \
        .select("id") \
        .eq("id", str(lease_data.property_id)) \
        .single() \
        .execute()

    if prop_result.data is None:
        raise NotFoundError("Property", str(lease_data.property_id))

    # Verify unit if provided
    if lease_data.unit_id:
        unit_result = ctx.table("units") \
            .select("id") \
            .eq("id", str(lease_data.unit_id)) \
            .eq("property_id", str(lease_data.property_id)) \
            .single() \
            .execute()

        if unit_result.data is None:
            raise NotFoundError("Unit", str(lease_data.unit_id))

    data = lease_data.model_dump(mode="json")

    result = ctx.table("leases") \
        .insert(data) \
        .execute()

    return result.data[0]


@router.put("/{lease_id}", response_model=LeaseResponse)
async def update_lease(
    lease_id: UUID,
    lease_data: LeaseUpdate,
    ctx: OrgContext,
):
    """Update a lease (excluding recovery profile)."""
    update_data = lease_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = ctx.table("leases") \
        .update(update_data) \
        .eq("id", str(lease_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return result.data[0]


@router.put("/{lease_id}/recovery-profile", response_model=LeaseResponse)
async def update_recovery_profile(
    lease_id: UUID,
    profile_data: LeaseRecoveryProfileUpdate,
    ctx: OrgContext,
):
    """
    Update the recovery profile for a lease.

    This is a separate endpoint because recovery profile changes
    have significant impact on calculations and may need different
    authorization or audit logging.
    """
    result = ctx.table("leases") \
        .update({"recovery_profile": profile_data.model_dump(mode="json")}) \
        .eq("id", str(lease_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return result.data[0]


@router.delete("/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lease(
    lease_id: UUID,
    ctx: OrgContext,
    admin: CurrentAdminUser,  # Require admin
):
    """Delete a lease. Requires admin privileges."""
    result = ctx.table("leases") \
        .delete() \
        .eq("id", str(lease_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return None
```

### Definition of Done
- [x] All CRUD operations work
- [x] Recovery profile validated
- [x] Date validation works
- [x] JSONB updates correctly

### Estimated Time: 3 hours

---
