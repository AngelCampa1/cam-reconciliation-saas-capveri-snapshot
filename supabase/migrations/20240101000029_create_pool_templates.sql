-- Migration: Create pool templates table
-- Story 17.3: Create Pool Templates
--
-- Creates pool_templates table for storing reusable pool configurations

-- Create pool_templates table
CREATE TABLE IF NOT EXISTS public.pool_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    property_type TEXT,
    structure JSONB NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_system_template CHECK (
        (is_system = true AND organization_id IS NULL) OR
        (is_system = false AND organization_id IS NOT NULL)
    ),
    CONSTRAINT valid_structure CHECK (
        jsonb_typeof(structure) = 'object' AND
        structure ? 'pools' AND
        jsonb_typeof(structure->'pools') = 'array'
    )
);

-- Create indexes
CREATE INDEX idx_pool_templates_org_id ON public.pool_templates(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_pool_templates_property_type ON public.pool_templates(property_type) WHERE property_type IS NOT NULL;
CREATE INDEX idx_pool_templates_is_system ON public.pool_templates(is_system) WHERE is_system = true;

-- Enable RLS
ALTER TABLE public.pool_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- System templates are visible to all authenticated users
CREATE POLICY "System templates visible to all"
    ON public.pool_templates
    FOR SELECT
    USING (is_system = true);

-- Users can see their organization's custom templates
CREATE POLICY "Users can view org templates"
    ON public.pool_templates
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
    );

-- Only org members can create custom templates
CREATE POLICY "Users can create org templates"
    ON public.pool_templates
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
        AND is_system = false
    );

-- Only org members can update their org's templates (not system templates)
CREATE POLICY "Users can update org templates"
    ON public.pool_templates
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
        AND is_system = false
    );

-- Only org members can delete their org's templates (not system templates)
CREATE POLICY "Users can delete org templates"
    ON public.pool_templates
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM public.users
            WHERE id = auth.uid()
        )
        AND is_system = false
    );

-- Create updated_at trigger
CREATE TRIGGER update_pool_templates_updated_at
    BEFORE UPDATE ON public.pool_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert system templates

-- Retail Center template
INSERT INTO public.pool_templates (name, description, property_type, structure, is_system, version) VALUES (
    'Retail Center',
    'Standard pool configuration for retail shopping centers',
    'retail',
    '{
        "pools": [
            {
                "name": "Common Area Maintenance",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Parking Lot", "gross_up_enabled": true},
                    {"name": "Landscaping", "gross_up_enabled": true},
                    {"name": "Security", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Utilities",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Electric", "gross_up_enabled": true},
                    {"name": "Water/Sewer", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Taxes & Insurance",
                "gross_up_enabled": false,
                "children": []
            }
        ]
    }'::jsonb,
    true,
    1
);

-- Office Building template
INSERT INTO public.pool_templates (name, description, property_type, structure, is_system, version) VALUES (
    'Office Building',
    'Standard pool configuration for office buildings',
    'office',
    '{
        "pools": [
            {
                "name": "Operating Expenses",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Janitorial", "gross_up_enabled": true},
                    {"name": "Elevators", "gross_up_enabled": true},
                    {"name": "HVAC", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Utilities",
                "gross_up_enabled": true,
                "children": []
            },
            {
                "name": "Real Estate Taxes",
                "gross_up_enabled": false,
                "children": []
            },
            {
                "name": "Insurance",
                "gross_up_enabled": false,
                "children": []
            }
        ]
    }'::jsonb,
    true,
    1
);

-- Mixed-Use Building template
INSERT INTO public.pool_templates (name, description, property_type, structure, is_system, version) VALUES (
    'Mixed-Use Building',
    'Standard pool configuration for mixed-use developments (residential + retail/office)',
    'mixed_use',
    '{
        "pools": [
            {
                "name": "Building Operations",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Janitorial", "gross_up_enabled": true},
                    {"name": "Elevators", "gross_up_enabled": true},
                    {"name": "HVAC", "gross_up_enabled": true},
                    {"name": "Security", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Common Area Maintenance",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Landscaping", "gross_up_enabled": true},
                    {"name": "Parking", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Utilities",
                "gross_up_enabled": true,
                "children": [
                    {"name": "Electric", "gross_up_enabled": true},
                    {"name": "Water/Sewer", "gross_up_enabled": true},
                    {"name": "Gas", "gross_up_enabled": true}
                ]
            },
            {
                "name": "Taxes & Insurance",
                "gross_up_enabled": false,
                "children": []
            }
        ]
    }'::jsonb,
    true,
    1
);
