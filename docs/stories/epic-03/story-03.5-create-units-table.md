# Story 3.5: Create Units Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.4
- **Status**: `completed`

## User Story
**As a** property manager
**I want** individual units within properties tracked
**So that** I can manage tenant occupancy at the unit level

## Acceptance Criteria
- [x] **AC1**: `units` table created with:
  - `id`, `property_id` (FK), `unit_number`
  - `rentable_sqft`, `usable_sqft` (NUMERIC)
  - `floor` (INTEGER, optional)
  - `status` (vacant, occupied, under_renovation)
  - Timestamps
- [x] **AC2**: Unique constraint on (property_id, unit_number)
- [x] **AC3**: ON DELETE CASCADE from properties
- [x] **AC4**: RLS inherited from property's organization

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000004_create_units.sql
```

**Migration SQL**:
```sql
-- Create units table
CREATE TABLE public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    unit_number VARCHAR(50) NOT NULL,
    rentable_sqft NUMERIC(10, 2) NOT NULL CHECK (rentable_sqft > 0),
    usable_sqft NUMERIC(10, 2) NOT NULL CHECK (usable_sqft > 0),
    floor INTEGER CHECK (floor >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'vacant'
        CHECK (status IN ('vacant', 'occupied', 'under_renovation')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unit number unique within property
    CONSTRAINT unique_unit_per_property UNIQUE (property_id, unit_number)
);

-- Indexes
CREATE INDEX idx_units_property_id ON public.units(property_id);
CREATE INDEX idx_units_status ON public.units(status);

-- Updated_at trigger
CREATE TRIGGER update_units_updated_at
    BEFORE UPDATE ON public.units
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Helper function to check unit access via property
CREATE OR REPLACE FUNCTION public.user_can_access_unit(unit_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.units u
        JOIN public.properties p ON u.property_id = p.id
        WHERE u.id = unit_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policies (access through property's organization)
CREATE POLICY "Units are viewable via property access"
    ON public.units
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Units are insertable via property access"
    ON public.units
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Units are updatable via property access"
    ON public.units
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Units are deletable via property access"
    ON public.units
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;

COMMENT ON TABLE public.units IS 'Individual leasable units within properties';
```

## Definition of Done
- [x] Unit number unique per property
- [x] Cascade delete works
- [x] RLS via property access

## Implementation Notes
- Created `supabase/migrations/20240101000004_create_units.sql`
- Added `unit_usable_not_greater_than_rentable` constraint (BOMA compliance)
- Created `user_can_access_unit(UUID)` helper function for RLS via property join
- RLS policies: SELECT/INSERT/UPDATE for members via property access, DELETE for admin/owner only
- Added indexes on property_id, status, and floor
- Added 30 new tests to `backend/tests/test_migrations.py` (113 total migration tests)
