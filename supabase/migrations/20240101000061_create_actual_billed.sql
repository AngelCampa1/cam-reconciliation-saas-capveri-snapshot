-- Migration: Create Actual Billed Amounts Table
-- Description: Stores what users actually billed tenants for comparison with CapVeri calculations
-- Dependencies: 20240101000001_create_organizations.sql, 20240101000003_create_properties.sql

-- Create actual billed amounts table
CREATE TABLE public.actual_billed_amounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Organization scope
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

    -- Period
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,

    -- Tenant reference (optional - for tenant-level tracking)
    lease_id UUID REFERENCES public.leases(id) ON DELETE SET NULL,
    tenant_name VARCHAR(255),  -- For imports where lease doesn't exist yet

    -- The key field: what they actually billed
    billed_amount NUMERIC(14, 2) NOT NULL CHECK (billed_amount >= 0),

    -- Source tracking
    source_type VARCHAR(50) NOT NULL DEFAULT 'csv_import'
        CHECK (source_type IN ('manual', 'csv_import', 'yardi_recon', 'mri_recon')),
    import_batch_id UUID,  -- Reference to import batch if from file

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_period CHECK (period_start_date < period_end_date)
);

-- Indexes
CREATE INDEX idx_actual_billed_org_id ON public.actual_billed_amounts(organization_id);
CREATE INDEX idx_actual_billed_property_id ON public.actual_billed_amounts(property_id);
CREATE INDEX idx_actual_billed_period ON public.actual_billed_amounts(property_id, period_start_date, period_end_date);
CREATE INDEX idx_actual_billed_lease_id ON public.actual_billed_amounts(lease_id);

-- Updated_at trigger
CREATE TRIGGER update_actual_billed_amounts_updated_at
    BEFORE UPDATE ON public.actual_billed_amounts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.actual_billed_amounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (organization-scoped)

-- SELECT: Users can view actual_billed_amounts for their organization
CREATE POLICY "Users can view their organization's actual billed amounts"
    ON public.actual_billed_amounts
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = (SELECT auth.uid())
        )
    );

-- INSERT: Users can create actual_billed_amounts for their organization
CREATE POLICY "Users can create actual billed amounts for their organization"
    ON public.actual_billed_amounts
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = (SELECT auth.uid())
        )
    );

-- UPDATE: Users can update actual_billed_amounts for their organization
CREATE POLICY "Users can update their organization's actual billed amounts"
    ON public.actual_billed_amounts
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = (SELECT auth.uid())
        )
    );

-- DELETE: Users can delete actual_billed_amounts for their organization
CREATE POLICY "Users can delete their organization's actual billed amounts"
    ON public.actual_billed_amounts
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users
            WHERE id = (SELECT auth.uid())
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.actual_billed_amounts TO authenticated;

-- Comments
COMMENT ON TABLE public.actual_billed_amounts IS 'Stores what users actually billed tenants for leakage comparison';
COMMENT ON COLUMN public.actual_billed_amounts.id IS 'Primary key UUID';
COMMENT ON COLUMN public.actual_billed_amounts.organization_id IS 'Organization that owns this data';
COMMENT ON COLUMN public.actual_billed_amounts.property_id IS 'Property this billing data relates to';
COMMENT ON COLUMN public.actual_billed_amounts.period_start_date IS 'Start of the billing period';
COMMENT ON COLUMN public.actual_billed_amounts.period_end_date IS 'End of the billing period';
COMMENT ON COLUMN public.actual_billed_amounts.lease_id IS 'Associated lease if known';
COMMENT ON COLUMN public.actual_billed_amounts.tenant_name IS 'Tenant name from import (for matching)';
COMMENT ON COLUMN public.actual_billed_amounts.billed_amount IS 'What was actually billed to the tenant';
COMMENT ON COLUMN public.actual_billed_amounts.source_type IS 'How this data was entered: manual, csv_import, yardi_recon, mri_recon';
COMMENT ON COLUMN public.actual_billed_amounts.import_batch_id IS 'Reference to import batch if from file upload';
