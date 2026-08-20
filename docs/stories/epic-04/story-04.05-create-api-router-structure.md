# Story 4.5: Create API Router Structure

### User Story
**As a** developer
**I want** a well-organized API router structure
**So that** I can easily add new endpoints in logical groupings

### Acceptance Criteria

- [x] **AC1**: `/api/v1/` prefix for all routes
- [x] **AC2**: Separate routers for each resource (properties, units, leases, etc.)
- [x] **AC3**: All routes documented in OpenAPI spec
- [x] **AC4**: Tags organize endpoints in documentation
- [x] **AC5**: Version prefix allows future API versions

### Technical Specifications

**Files to Create**:
```
backend/app/api/
├── __init__.py
├── v1/
│   ├── __init__.py
│   ├── properties.py
│   ├── units.py
│   ├── leases.py
│   └── ingestion.py
└── deps.py
```

**api/__init__.py**:
```python
"""
API router configuration.

All API routes are registered here with the /api/v1 prefix.
"""
from fastapi import APIRouter

from app.api.v1 import properties, units, leases

router = APIRouter()

# Include all v1 routers
router.include_router(
    properties.router,
    prefix="/properties",
    tags=["Properties"],
)

router.include_router(
    units.router,
    prefix="/properties/{property_id}/units",
    tags=["Units"],
)

router.include_router(
    leases.router,
    prefix="/leases",
    tags=["Leases"],
)
```

**api/v1/properties.py** (skeleton):
```python
"""
Property management endpoints.
"""
from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.auth.dependencies import OrgContext, CurrentUser

router = APIRouter()


@router.get("")
async def list_properties(ctx: OrgContext):
    """List all properties for the organization."""
    # Implementation in Story 4.8
    pass


@router.get("/{property_id}")
async def get_property(property_id: UUID, ctx: OrgContext):
    """Get a single property by ID."""
    pass


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_property(ctx: OrgContext):
    """Create a new property."""
    pass


@router.put("/{property_id}")
async def update_property(property_id: UUID, ctx: OrgContext):
    """Update a property."""
    pass


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(property_id: UUID, ctx: OrgContext):
    """Delete a property."""
    pass
```

### Definition of Done
- [x] Router structure created
- [x] All routers registered
- [x] OpenAPI shows endpoints
- [x] Tags organize documentation

### Estimated Time: 2 hours

### Completion Notes

**Completed**: 2025-12-29

**Implementation**:
- Created `backend/app/api/v1/properties.py` with 5 CRUD endpoints (skeleton)
- Created `backend/app/api/v1/units.py` with 5 CRUD endpoints (nested under properties)
- Created `backend/app/api/v1/leases.py` with 7 endpoints (CRUD + recovery profile)
- Created `backend/app/api/v1/ingestion.py` with 7 data ingestion endpoints
- Created `backend/app/api/deps.py` with common dependencies and pagination helpers
- Updated `backend/app/api/v1/__init__.py` to aggregate all routers with tags
- Updated `backend/app/api/__init__.py` to include v1 router

**API Structure**:
- `/api/v1/properties` - Property management (tag: Properties)
- `/api/v1/properties/{property_id}/units` - Unit management (tag: Units)
- `/api/v1/leases` - Lease management (tag: Leases)
- `/api/v1/ingestion` - Data ingestion (tag: Data Ingestion)

**Files Created/Modified**:
- `backend/app/api/v1/properties.py` (new)
- `backend/app/api/v1/units.py` (new)
- `backend/app/api/v1/leases.py` (new)
- `backend/app/api/v1/ingestion.py` (new)
- `backend/app/api/deps.py` (new)
- `backend/app/api/v1/__init__.py` (modified)
- `backend/app/api/__init__.py` (modified)
- `backend/tests/test_api_router_structure.py` (new, 62 tests)

**Test Results**: 993 total backend tests passing, 99.89% coverage

---

## Future API Routes (Integration Notes)

The following API routes should be added when their respective epics are implemented:

**Epic 21 (Billing) - Add to api/v1/__init__.py**:
```python
from app.api.v1 import billing

router.include_router(
    billing.router,
    prefix="/billing",
    tags=["Billing"],
)
```

Routes to implement:
- `GET /api/v1/billing/subscription` - Current subscription status
- `POST /api/v1/billing/checkout` - Create Stripe checkout session
- `POST /api/v1/billing/portal` - Create Stripe customer portal session
- `GET /api/v1/billing/invoices` - Invoice history
- `POST /api/v1/billing/webhooks/stripe` - Stripe webhook handler

**Epic 22 (Promotions) - Add to api/v1/__init__.py**:
```python
from app.api.v1 import promotions

router.include_router(
    promotions.router,
    prefix="/promotions",
    tags=["Promotions"],
    dependencies=[Depends(require_admin)],  # Admin-only
)
```

Routes to implement:
- `GET /api/v1/promotions/coupons` - List Stripe coupons
- `POST /api/v1/promotions/coupons` - Create coupon
- `GET /api/v1/promotions/codes` - List promotion codes
- `POST /api/v1/promotions/codes` - Create promotion code

**Epic 23 (Feedback) - Add to api/v1/__init__.py**:
```python
from app.api.v1 import feedback

router.include_router(
    feedback.router,
    prefix="/feedback",
    tags=["Feedback"],
)
```

Routes to implement:
- `POST /api/v1/feedback` - Submit feedback (rate limited)
- `POST /api/v1/feedback/screenshot` - Upload screenshot
- `GET /api/v1/feedback` - List feedback (admin only)
- `PATCH /api/v1/feedback/{id}/status` - Update status (admin only)

---
