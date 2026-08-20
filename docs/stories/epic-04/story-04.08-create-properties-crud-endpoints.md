# Story 4.8: Create Properties CRUD Endpoints

### User Story
**As an** API consumer
**I want** full CRUD operations for properties
**So that** I can manage properties via the API

### Acceptance Criteria

- [x] **AC1**: `GET /api/v1/properties` lists all properties for org
- [x] **AC2**: `GET /api/v1/properties/{id}` returns single property
- [x] **AC3**: `POST /api/v1/properties` creates new property
- [x] **AC4**: `PUT /api/v1/properties/{id}` updates property
- [x] **AC5**: `DELETE /api/v1/properties/{id}` deletes property (admin only)
- [x] **AC6**: All endpoints enforce RLS (org isolation)
- [x] **AC7**: Proper HTTP status codes (201 for create, 204 for delete)

### Technical Specifications

**Files to Create** (all paths relative to project root):
```
backend/app/
├── schemas/
│   └── property.py
└── api/v1/
    └── properties.py
```

**schemas/property.py**:
```python
"""Property request/response schemas."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class PropertyBase(BaseModel):
    """Base property fields."""
    name: str = Field(..., min_length=1, max_length=255)
    address_line1: str = Field(..., min_length=1, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=2, max_length=2)
    postal_code: str = Field(..., min_length=1, max_length=20)
    total_rentable_sqft: Decimal = Field(..., gt=0)
    total_usable_sqft: Decimal = Field(..., gt=0)
    common_area_sqft: Decimal = Field(default=Decimal("0"), ge=0)
    target_occupancy: Decimal = Field(
        default=Decimal("0.95"),
        ge=0,
        le=1,
        description="Target occupancy rate (0-1)"
    )

    @field_validator("state")
    @classmethod
    def uppercase_state(cls, v: str) -> str:
        return v.upper()

    @field_validator("total_usable_sqft")
    @classmethod
    def usable_not_greater_than_rentable(cls, v: Decimal, info) -> Decimal:
        if "total_rentable_sqft" in info.data:
            if v > info.data["total_rentable_sqft"]:
                raise ValueError("Usable sqft cannot exceed rentable sqft")
        return v


class PropertyCreate(PropertyBase):
    """Schema for creating a property."""
    pass


class PropertyUpdate(BaseModel):
    """Schema for updating a property (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line1: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    state: Optional[str] = Field(None, min_length=2, max_length=2)
    postal_code: Optional[str] = Field(None, min_length=1, max_length=20)
    total_rentable_sqft: Optional[Decimal] = Field(None, gt=0)
    total_usable_sqft: Optional[Decimal] = Field(None, gt=0)
    common_area_sqft: Optional[Decimal] = Field(None, ge=0)
    target_occupancy: Optional[Decimal] = Field(None, ge=0, le=1)


class PropertyResponse(PropertyBase):
    """Property response schema."""
    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PropertyListResponse(BaseModel):
    """Paginated list of properties."""
    data: list[PropertyResponse]
    count: int
    has_more: bool = False
```

**api/v1/properties.py**:
```python
"""Property management endpoints."""
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.auth.dependencies import OrgContext, CurrentAdminUser
from app.exceptions.handlers import NotFoundError
from app.schemas.property import (
    PropertyCreate,
    PropertyUpdate,
    PropertyResponse,
    PropertyListResponse,
)

router = APIRouter()


@router.get("", response_model=PropertyListResponse)
async def list_properties(
    ctx: OrgContext,
    skip: int = 0,
    limit: int = 100,
):
    """
    List all properties for the current organization.

    RLS ensures only organization's properties are returned.
    """
    result = ctx.table("properties") \
        .select("*", count="exact") \
        .range(skip, skip + limit - 1) \
        .order("created_at", desc=True) \
        .execute()

    return PropertyListResponse(
        data=result.data,
        count=result.count or len(result.data),
        has_more=(result.count or 0) > skip + limit,
    )


@router.get("/{property_id}", response_model=PropertyResponse)
async def get_property(
    property_id: UUID,
    ctx: OrgContext,
):
    """Get a single property by ID."""
    result = ctx.table("properties") \
        .select("*") \
        .eq("id", str(property_id)) \
        .single() \
        .execute()

    if result.data is None:
        raise NotFoundError("Property", str(property_id))

    return result.data


@router.post("", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
async def create_property(
    property_data: PropertyCreate,
    ctx: OrgContext,
):
    """Create a new property in the current organization."""
    data = property_data.model_dump(mode="json")
    data["organization_id"] = str(ctx.organization_id)

    result = ctx.table("properties") \
        .insert(data) \
        .execute()

    return result.data[0]


@router.put("/{property_id}", response_model=PropertyResponse)
async def update_property(
    property_id: UUID,
    property_data: PropertyUpdate,
    ctx: OrgContext,
):
    """Update a property."""
    # Only include non-None fields
    update_data = property_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = ctx.table("properties") \
        .update(update_data) \
        .eq("id", str(property_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Property", str(property_id))

    return result.data[0]


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(
    property_id: UUID,
    ctx: OrgContext,
    admin: CurrentAdminUser,  # Require admin role
):
    """
    Delete a property.

    Requires admin privileges. Cascades to units, leases, etc.
    """
    result = ctx.table("properties") \
        .delete() \
        .eq("id", str(property_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Property", str(property_id))

    return None
```

### Definition of Done
- [x] All CRUD operations work
- [x] RLS enforced
- [x] Validation errors return 422
- [x] 404 for missing resources

### Completion Notes
**Completed**: 2025-12-29

**Files Created/Modified**:
- `backend/app/schemas/property.py` - API schemas with PropertyListResponse
- `backend/app/schemas/__init__.py` - Added property schema exports
- `backend/app/api/v1/properties.py` - Full CRUD implementation (5 endpoints)
- `backend/tests/test_properties_crud.py` - 35 comprehensive tests

**Test Results**: 1309 tests passing, 99.44% coverage

### Estimated Time: 3 hours

---
