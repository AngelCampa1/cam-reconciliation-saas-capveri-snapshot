-- Migration: Add Organizations Settings GIN Index
-- Description: Support indexed JSONB filters on organization settings.
-- Dependencies: 20240101000001_create_organizations.sql

CREATE INDEX IF NOT EXISTS idx_organizations_settings_gin
    ON public.organizations USING GIN (settings);

COMMENT ON INDEX public.idx_organizations_settings_gin IS
    'GIN index for JSONB filters on organization settings';
