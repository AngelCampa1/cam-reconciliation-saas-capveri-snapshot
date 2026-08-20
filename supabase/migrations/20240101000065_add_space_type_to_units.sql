-- Migration: Add BOMA 2024 space_type to units table
-- Adds NATA space classification to enable detection of load-factor
-- errors where NATA areas are incorrectly grossed up in pro-rata calculations.

ALTER TABLE public.units
ADD COLUMN space_type VARCHAR(30) NOT NULL DEFAULT 'office'
    CHECK (space_type IN ('office', 'retail', 'laboratory', 'storage', 'outdoor_amenity', 'equipment_shaft', 'other'));

COMMENT ON COLUMN public.units.space_type IS
'BOMA 2024 space classification. NATA types (storage, outdoor_amenity, equipment_shaft) require zero load factor in pro-rata calculations.';
