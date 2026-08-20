-- Migration: Add BOMA 2024 compliance fields to properties table
-- Adds building measurement standard version and date to enable
-- detection of mixed-vintage denominator errors during reconciliation.

ALTER TABLE public.properties
ADD COLUMN boma_standard_version VARCHAR(10) NOT NULL DEFAULT '2024'
    CHECK (boma_standard_version IN ('2010', '2017', '2024', 'custom'));

ALTER TABLE public.properties
ADD COLUMN rsf_measurement_date DATE;

COMMENT ON COLUMN public.properties.boma_standard_version IS
'BOMA Office Standard version used to measure total_rentable_sqft (2010, 2017, 2024, or custom)';
COMMENT ON COLUMN public.properties.rsf_measurement_date IS
'Date the building RSF was last certified under the recorded BOMA standard';
