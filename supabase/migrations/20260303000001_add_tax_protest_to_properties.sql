-- Add tax protest configuration columns to properties table
-- Used by the Tax Protest Data Package feature to store county and optional deadline overrides

ALTER TABLE public.properties
    ADD COLUMN tax_protest_county TEXT,
    ADD COLUMN tax_protest_deadline_override DATE;

COMMENT ON COLUMN public.properties.tax_protest_county IS
    'County name for tax protest deadline lookup (e.g. ''Harris'', ''Dallas'')';
COMMENT ON COLUMN public.properties.tax_protest_deadline_override IS
    'Optional per-property override for the tax protest filing deadline';

-- RLS note: these columns are added to the existing `properties` table which already has
-- row-level security policies covering all columns. The new columns inherit those policies
-- automatically (organization-scoped read/write). No additional policies are needed.
