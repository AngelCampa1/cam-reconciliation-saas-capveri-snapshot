-- Create column_mappings table for storing user-defined GL column mappings
-- Story 5.11: Generic Mapping Parser
-- Allows users to save custom column mappings for CSV/Excel files that don't match Yardi/MRI formats

CREATE TABLE public.column_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(1000),
    source_system VARCHAR(50) NOT NULL CHECK (source_system IN ('yardi', 'mri', 'generic')),
    mapping_config JSONB NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_mapping_per_org UNIQUE (organization_id, source_system, name)
);

-- Indexes for performance
CREATE INDEX idx_column_mappings_organization_id ON public.column_mappings(organization_id);
CREATE INDEX idx_column_mappings_source_system ON public.column_mappings(source_system);

-- Row Level Security
ALTER TABLE public.column_mappings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view org mappings" ON public.column_mappings FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create mappings" ON public.column_mappings FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update mappings" ON public.column_mappings FOR UPDATE
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Admins can delete mappings" ON public.column_mappings FOR DELETE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role IN ('owner', 'admin')
        )
    );

-- Comment for documentation
COMMENT ON TABLE public.column_mappings IS 'Stores user-defined column mappings for generic GL file imports';
COMMENT ON COLUMN public.column_mappings.mapping_config IS 'JSONB object mapping internal field names to CSV column names, e.g. {"account_code": "GL Account", "amount": "Amount", "transaction_date": "Date"}';
