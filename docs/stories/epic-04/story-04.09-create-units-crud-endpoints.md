# Story 4.9: Create Units CRUD Endpoints

### User Story
**As an** API consumer
**I want** CRUD operations for units nested under properties
**So that** I can manage units within a property context

### Acceptance Criteria

- [x] **AC1**: `GET /api/v1/properties/{property_id}/units` lists units
- [x] **AC2**: `GET /api/v1/properties/{property_id}/units/{unit_id}` returns single unit
- [x] **AC3**: `POST /api/v1/properties/{property_id}/units` creates unit
- [x] **AC4**: `PUT /api/v1/properties/{property_id}/units/{unit_id}` updates unit
- [x] **AC5**: `DELETE /api/v1/properties/{property_id}/units/{unit_id}` deletes unit
- [x] **AC6**: Property FK enforced in all operations
- [x] **AC7**: Unit number unique within property

### Technical Specifications

**Files to Create**:
```
backend/app/
├── schemas/
│   └── unit.py
└── api/v1/
    └── units.py
```

**schemas/unit.py**:
```python
"""Unit request/response schemas."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class UnitStatus:
    """Unit status constants."""
    VACANT = "vacant"
    OCCUPIED = "occupied"
    UNDER_RENOVATION = "under_renovation"


class UnitBase(BaseModel):
    """Base unit fields."""
    unit_number: str = Field(..., min_length=1, max_length=50)
    rentable_sqft: Decimal = Field(..., gt=0)
    usable_sqft: Decimal = Field(..., gt=0)
    floor: Optional[int] = Field(None, ge=0)
    status: str = Field(
        default=UnitStatus.VACANT,
        pattern=f"^({UnitStatus.VACANT}|{UnitStatus.OCCUPIED}|{UnitStatus.UNDER_RENOVATION})$"
    )


class UnitCreate(UnitBase):
    """Schema for creating a unit."""
    pass


class UnitUpdate(BaseModel):
    """Schema for updating a unit."""
    unit_number: Optional[str] = Field(None, min_length=1, max_length=50)
    rentable_sqft: Optional[Decimal] = Field(None, gt=0)
    usable_sqft: Optional[Decimal] = Field(None, gt=0)
    floor: Optional[int] = Field(None, ge=0)
    status: Optional[str] = None


class UnitResponse(UnitBase):
    """Unit response schema."""
    id: UUID
    property_id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UnitListResponse(BaseModel):
    """List of units."""
    data: list[UnitResponse]
    count: int
```

**api/v1/units.py**:
```python
"""Unit management endpoints (nested under properties)."""
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.auth.dependencies import OrgContext
from app.exceptions.handlers import NotFoundError, ConflictError
from app.schemas.unit import (
    UnitCreate,
    UnitUpdate,
    UnitResponse,
    UnitListResponse,
)

router = APIRouter()


async def verify_property_access(property_id: UUID, ctx: OrgContext) -> None:
    """Verify user has access to the property."""
    result = ctx.table("properties") \
        .select("id") \
        .eq("id", str(property_id)) \
        .single() \
        .execute()

    if result.data is None:
        raise NotFoundError("Property", str(property_id))


@router.get("", response_model=UnitListResponse)
async def list_units(
    property_id: UUID,
    ctx: OrgContext,
):
    """List all units for a property."""
    await verify_property_access(property_id, ctx)

    result = ctx.table("units") \
        .select("*", count="exact") \
        .eq("property_id", str(property_id)) \
        .order("unit_number") \
        .execute()

    return UnitListResponse(
        data=result.data,
        count=result.count or len(result.data),
    )


@router.get("/{unit_id}", response_model=UnitResponse)
async def get_unit(
    property_id: UUID,
    unit_id: UUID,
    ctx: OrgContext,
):
    """Get a single unit."""
    await verify_property_access(property_id, ctx)

    result = ctx.table("units") \
        .select("*") \
        .eq("id", str(unit_id)) \
        .eq("property_id", str(property_id)) \
        .single() \
        .execute()

    if result.data is None:
        raise NotFoundError("Unit", str(unit_id))

    return result.data


@router.post("", response_model=UnitResponse, status_code=status.HTTP_201_CREATED)
async def create_unit(
    property_id: UUID,
    unit_data: UnitCreate,
    ctx: OrgContext,
):
    """Create a new unit in the property."""
    await verify_property_access(property_id, ctx)

    data = unit_data.model_dump(mode="json")
    data["property_id"] = str(property_id)

    try:
        result = ctx.table("units") \
            .insert(data) \
            .execute()
        return result.data[0]
    except Exception as e:
        if "unique_unit_per_property" in str(e):
            raise ConflictError(
                f"Unit '{unit_data.unit_number}' already exists in this property"
            )
        raise


@router.put("/{unit_id}", response_model=UnitResponse)
async def update_unit(
    property_id: UUID,
    unit_id: UUID,
    unit_data: UnitUpdate,
    ctx: OrgContext,
):
    """Update a unit."""
    await verify_property_access(property_id, ctx)

    update_data = unit_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = ctx.table("units") \
        .update(update_data) \
        .eq("id", str(unit_id)) \
        .eq("property_id", str(property_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Unit", str(unit_id))

    return result.data[0]


@router.delete("/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_unit(
    property_id: UUID,
    unit_id: UUID,
    ctx: OrgContext,
):
    """Delete a unit."""
    await verify_property_access(property_id, ctx)

    result = ctx.table("units") \
        .delete() \
        .eq("id", str(unit_id)) \
        .eq("property_id", str(property_id)) \
        .execute()

    if not result.data:
        raise NotFoundError("Unit", str(unit_id))

    return None
```

### Definition of Done
- [x] All CRUD operations work
- [x] Property FK enforced
- [x] 409 for duplicate unit numbers
- [x] Nested routing works

### Estimated Time: 2 hours

### Completion Notes
**Completed**: 2025-12-29

**Implementation Details**:
- Created `app/schemas/unit.py` with API-specific `UnitCreateRequest` schema (property_id comes from URL path)
- Implemented full CRUD in `app/api/v1/units.py` with `verify_property_access` helper
- Created 44 comprehensive tests in `tests/test_units_crud.py`
- All 1423 tests passing with 98.99% coverage

**Key Design Decisions**:
- API schema (`UnitCreateRequest`) differs from domain model (`UnitCreate`) because property_id comes from URL path parameter
- Used `maybe_single()` for property access verification to avoid exceptions on missing data
- ConflictError raised for duplicate unit numbers within same property

---
