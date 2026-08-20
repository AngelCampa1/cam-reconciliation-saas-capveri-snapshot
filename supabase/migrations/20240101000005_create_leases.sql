-- Migration: Create Leases Table
-- Description: Tenant leases with embedded recovery profiles for CAM reconciliation
-- Dependencies: 20240101000004_create_units.sql

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

    -- Recovery profile stored as JSONB (LeaseRecoveryProfile structure)
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

    -- Date validation: end date must be after start date
    CONSTRAINT end_after_start CHECK (end_date > start_date)
);

-- Create indexes for common queries
CREATE INDEX idx_leases_property_id ON public.leases(property_id);
CREATE INDEX idx_leases_unit_id ON public.leases(unit_id);
CREATE INDEX idx_leases_status ON public.leases(status);
CREATE INDEX idx_leases_tenant_name ON public.leases(tenant_name);
CREATE INDEX idx_leases_dates ON public.leases(start_date, end_date);

-- GIN index for JSONB queries on recovery_profile
CREATE INDEX idx_leases_recovery_profile ON public.leases USING GIN (recovery_profile);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_leases_updated_at
    BEFORE UPDATE ON public.leases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

-- Helper function to check lease access via property organization
CREATE OR REPLACE FUNCTION public.user_can_access_lease(lease_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.leases l
        JOIN public.properties p ON l.property_id = p.id
        WHERE l.id = lease_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS Policy: Leases are viewable via property organization access
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

-- RLS Policy: Leases are insertable via property organization access
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

-- RLS Policy: Leases are updatable via property organization access
CREATE POLICY "Leases are updatable via property access"
    ON public.leases
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- RLS Policy: Leases are deletable via property organization access (admin/owner only)
CREATE POLICY "Leases are deletable by admins"
    ON public.leases
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.leases IS 'Tenant leases with embedded recovery profiles for CAM reconciliation';
COMMENT ON COLUMN public.leases.id IS 'Unique identifier for the lease';
COMMENT ON COLUMN public.leases.property_id IS 'Property this lease belongs to';
COMMENT ON COLUMN public.leases.unit_id IS 'Optional unit within the property (NULL for building-wide leases)';
COMMENT ON COLUMN public.leases.tenant_name IS 'Name of the tenant';
COMMENT ON COLUMN public.leases.start_date IS 'Lease commencement date';
COMMENT ON COLUMN public.leases.end_date IS 'Lease expiration date';
COMMENT ON COLUMN public.leases.status IS 'Lease status: draft, active, expired, or terminated';
COMMENT ON COLUMN public.leases.recovery_profile IS 'JSONB containing all CAM recovery terms (base year, caps, pro-rata share, etc.)';
COMMENT ON COLUMN public.leases.document_url IS 'URL to the lease document in storage (S3/Supabase Storage)';
COMMENT ON COLUMN public.leases.created_at IS 'When the lease was created';
COMMENT ON COLUMN public.leases.updated_at IS 'When the lease was last updated';
COMMENT ON FUNCTION public.user_can_access_lease(UUID) IS 'Checks if current user can access a lease via property organization membership';
