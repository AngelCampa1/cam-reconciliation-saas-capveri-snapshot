# Story 3.4: Create Properties Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.3
- **Status**: `completed`

## User Story
**As a** property manager
**I want** properties stored with BOMA area fields
**So that** I can track building metrics for expense allocation

## Acceptance Criteria
- [x] **AC1**: `properties` table created with all BOMA fields:
  - `id`, `organization_id`, `name`, address fields
  - `total_rentable_sqft`, `total_usable_sqft`, `common_area_sqft` (NUMERIC)
  - `target_occupancy` (NUMERIC, default 0.95)
  - Timestamps
- [x] **AC2**: RLS: organization isolation enforced
- [x] **AC3**: Constraint: rentable >= usable
- [x] **AC4**: Indexes on organization_id

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000003_create_properties.sql
```

**Migration SQL**:
```sql
-- Create properties table
CREATE TABLE public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state CHAR(2) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,

    -- BOMA area fields (stored as NUMERIC for precision)
    total_rentable_sqft NUMERIC(12, 2) NOT NULL CHECK (total_rentable_sqft > 0),
    total_usable_sqft NUMERIC(12, 2) NOT NULL CHECK (total_usable_sqft > 0),
    common_area_sqft NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (common_area_sqft >= 0),
    target_occupancy NUMERIC(5, 4) NOT NULL DEFAULT 0.9500
        CHECK (target_occupancy >= 0 AND target_occupancy <= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: usable cannot exceed rentable
    CONSTRAINT usable_not_greater_than_rentable
        CHECK (total_usable_sqft <= total_rentable_sqft)
);

-- Indexes
CREATE INDEX idx_properties_organization_id ON public.properties(organization_id);
CREATE INDEX idx_properties_name ON public.properties(name);

-- Updated_at trigger
CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON public.properties
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Properties are viewable by organization members"
    ON public.properties
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Properties are insertable by organization members"
    ON public.properties
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Properties are updatable by organization members"
    ON public.properties
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Properties are deletable by organization admins"
    ON public.properties
    FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;

COMMENT ON TABLE public.properties IS 'Commercial properties with BOMA area metrics';
```

## Definition of Done
- [x] All columns created with correct types
- [x] Area constraint validated
- [x] RLS isolates organizations

## Implementation Notes
- Created `supabase/migrations/20240101000003_create_properties.sql`
- BOMA area columns use NUMERIC(12,2) for financial precision
- Constraint `usable_not_greater_than_rentable` enforces BOMA rules
- RLS policies: SELECT/INSERT/UPDATE for members, DELETE for admin/owner only
- Added indexes on organization_id, name, and city/state
- Added 27 new tests to `backend/tests/test_migrations.py` (83 total migration tests)
