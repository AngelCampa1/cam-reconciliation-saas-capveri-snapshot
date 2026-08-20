-- Migration: Create Properties Table
-- Description: Commercial properties with BOMA area metrics for expense allocation
-- Dependencies: 20240101000002_create_users.sql

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

    -- BOMA area fields (stored as NUMERIC for financial precision)
    total_rentable_sqft NUMERIC(12, 2) NOT NULL CHECK (total_rentable_sqft > 0),
    total_usable_sqft NUMERIC(12, 2) NOT NULL CHECK (total_usable_sqft > 0),
    common_area_sqft NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (common_area_sqft >= 0),
    target_occupancy NUMERIC(5, 4) NOT NULL DEFAULT 0.9500
        CHECK (target_occupancy >= 0 AND target_occupancy <= 1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: usable cannot exceed rentable (BOMA requirement)
    CONSTRAINT usable_not_greater_than_rentable
        CHECK (total_usable_sqft <= total_rentable_sqft)
);

-- Create indexes for common queries
CREATE INDEX idx_properties_organization_id ON public.properties(organization_id);
CREATE INDEX idx_properties_name ON public.properties(name);
CREATE INDEX idx_properties_city_state ON public.properties(city, state);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON public.properties
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Organization members can view their properties
CREATE POLICY "Properties are viewable by organization members"
    ON public.properties
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- RLS Policy: Organization members can insert properties
CREATE POLICY "Properties are insertable by organization members"
    ON public.properties
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Organization members can update their properties
CREATE POLICY "Properties are updatable by organization members"
    ON public.properties
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id())
    WITH CHECK (organization_id = public.get_user_organization_id());

-- RLS Policy: Only admins and owners can delete properties
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

-- Grant permissions to Supabase roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.properties IS 'Commercial properties with BOMA area metrics for CAM reconciliation';
COMMENT ON COLUMN public.properties.id IS 'Unique identifier for the property';
COMMENT ON COLUMN public.properties.organization_id IS 'Organization that owns this property';
COMMENT ON COLUMN public.properties.name IS 'Display name of the property';
COMMENT ON COLUMN public.properties.address_line1 IS 'Street address line 1';
COMMENT ON COLUMN public.properties.address_line2 IS 'Street address line 2 (optional)';
COMMENT ON COLUMN public.properties.city IS 'City name';
COMMENT ON COLUMN public.properties.state IS 'Two-letter state code';
COMMENT ON COLUMN public.properties.postal_code IS 'ZIP or postal code';
COMMENT ON COLUMN public.properties.total_rentable_sqft IS 'Total rentable square feet per BOMA standards';
COMMENT ON COLUMN public.properties.total_usable_sqft IS 'Total usable square feet per BOMA standards';
COMMENT ON COLUMN public.properties.common_area_sqft IS 'Common area square feet (lobbies, hallways, etc.)';
COMMENT ON COLUMN public.properties.target_occupancy IS 'Target occupancy rate for gross-up calculations (default 95%)';
COMMENT ON COLUMN public.properties.created_at IS 'When the property was created';
COMMENT ON COLUMN public.properties.updated_at IS 'When the property was last updated';
