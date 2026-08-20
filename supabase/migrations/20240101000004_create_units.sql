-- Migration: Create Units Table
-- Description: Individual leasable units within properties for tenant occupancy tracking
-- Dependencies: 20240101000003_create_properties.sql

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
    CONSTRAINT unique_unit_per_property UNIQUE (property_id, unit_number),

    -- Usable cannot exceed rentable
    CONSTRAINT unit_usable_not_greater_than_rentable
        CHECK (usable_sqft <= rentable_sqft)
);

-- Create indexes for common queries
CREATE INDEX idx_units_property_id ON public.units(property_id);
CREATE INDEX idx_units_status ON public.units(status);
CREATE INDEX idx_units_floor ON public.units(floor);

-- Apply updated_at trigger (function created in organizations migration)
CREATE TRIGGER update_units_updated_at
    BEFORE UPDATE ON public.units
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Helper function to check unit access via property organization
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

-- RLS Policy: Units are viewable via property organization access
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

-- RLS Policy: Units are insertable via property organization access
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

-- RLS Policy: Units are updatable via property organization access
CREATE POLICY "Units are updatable via property access"
    ON public.units
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

-- RLS Policy: Units are deletable via property organization access (admin/owner only)
CREATE POLICY "Units are deletable via property access"
    ON public.units
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.units IS 'Individual leasable units within properties for CAM reconciliation';
COMMENT ON COLUMN public.units.id IS 'Unique identifier for the unit';
COMMENT ON COLUMN public.units.property_id IS 'Property this unit belongs to';
COMMENT ON COLUMN public.units.unit_number IS 'Unit identifier within the property (e.g., 101, A-5, Suite 200)';
COMMENT ON COLUMN public.units.rentable_sqft IS 'Rentable square feet for this unit';
COMMENT ON COLUMN public.units.usable_sqft IS 'Usable square feet for this unit';
COMMENT ON COLUMN public.units.floor IS 'Floor number (0 = ground floor, NULL if not applicable)';
COMMENT ON COLUMN public.units.status IS 'Occupancy status: vacant, occupied, or under_renovation';
COMMENT ON COLUMN public.units.created_at IS 'When the unit was created';
COMMENT ON COLUMN public.units.updated_at IS 'When the unit was last updated';
COMMENT ON FUNCTION public.user_can_access_unit(UUID) IS 'Checks if current user can access a unit via property organization membership';
