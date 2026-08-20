# Story 3.6: Create Leases Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 3
- **Dependencies**: Story 3.5
- **Status**: `completed`

## User Story
**As a** property accountant
**I want** leases stored with embedded recovery profiles
**So that** tenant billing terms are captured and queryable

## Acceptance Criteria
- [x] **AC1**: `leases` table created with:
  - `id`, `property_id`, `unit_id` (optional)
  - `tenant_name`, `start_date`, `end_date`, `status`
  - `recovery_profile` JSONB (LeaseRecoveryProfile structure)
  - `document_url` (S3 link)
  - Timestamps
- [x] **AC2**: GIN index on recovery_profile for JSONB queries
- [x] **AC3**: Check constraint: end_date > start_date
- [x] **AC4**: RLS via property's organization

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000005_create_leases.sql
```

**Migration SQL**:
```sql
-- Create leases table
CREATE TABLE public.leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    tenant_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'expired', 'terminated')),

    -- Recovery profile stored as JSONB
    recovery_profile JSONB NOT NULL DEFAULT '{
        "base_year": null,
        "base_year_amount": null,
        "gross_up_base_year": false,
        "pro_rata_share": "0",
        "cap_type": "none",
        "cap_rate": null,
        "admin_fee_percentage": "0",
        "excluded_pools": []
    }'::jsonb,

    document_url VARCHAR(2048),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Date validation
    CONSTRAINT end_after_start CHECK (end_date > start_date)
);

-- Indexes
CREATE INDEX idx_leases_property_id ON public.leases(property_id);
CREATE INDEX idx_leases_unit_id ON public.leases(unit_id);
CREATE INDEX idx_leases_status ON public.leases(status);
CREATE INDEX idx_leases_tenant_name ON public.leases(tenant_name);
CREATE INDEX idx_leases_dates ON public.leases(start_date, end_date);

-- GIN index for JSONB queries on recovery_profile
CREATE INDEX idx_leases_recovery_profile ON public.leases USING GIN (recovery_profile);

-- Updated_at trigger
CREATE TRIGGER update_leases_updated_at
    BEFORE UPDATE ON public.leases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Leases are viewable via property access"
    ON public.leases
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Leases are insertable via property access"
    ON public.leases
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Leases are updatable via property access"
    ON public.leases
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Leases are deletable by admins"
    ON public.leases
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties p
            JOIN public.users u ON u.organization_id = p.organization_id
            WHERE p.id = property_id
            AND u.id = auth.uid()
            AND u.role IN ('owner', 'admin')
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;

COMMENT ON TABLE public.leases IS 'Tenant leases with embedded recovery profiles';
COMMENT ON COLUMN public.leases.recovery_profile IS 'JSONB containing all CAM recovery terms';
```

## Definition of Done
- [x] JSONB recovery_profile works
- [x] GIN index created
- [x] Date validation enforced
- [x] RLS via property

## Implementation Notes
- Created `supabase/migrations/20240101000005_create_leases.sql`
- unit_id is optional (SET NULL on delete) for building-wide leases
- recovery_profile JSONB has default with all CAM recovery fields
- Created `user_can_access_lease(UUID)` helper function for RLS via property join
- RLS policies: SELECT/INSERT/UPDATE for members via property access, DELETE for admin/owner only
- Added 6 indexes including GIN index for JSONB queries
- Added 38 new tests to `backend/tests/test_migrations.py` (151 total migration tests)
