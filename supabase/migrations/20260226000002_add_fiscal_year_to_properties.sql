-- Migration: Add Fiscal Year Start Month to Properties
-- Description: Properties can now specify when their fiscal year begins.
--   Calendar-year properties use month 1 (January, the default).
--   April-start fiscal years use month 4, etc.
-- Dependencies: 20240101000003_create_properties.sql

ALTER TABLE public.properties
    ADD COLUMN fiscal_year_start_month INT NOT NULL DEFAULT 1
        CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12);

COMMENT ON COLUMN public.properties.fiscal_year_start_month IS 'Month (1-12) when the fiscal year begins. Default 1 = calendar year.';
