-- Scope GL import deduplication to the target property.
--
-- The same source GL file can be valid for multiple properties in one
-- organization. Keep duplicate protection for repeat uploads to the same
-- property without blocking another property's import.

ALTER TABLE public.import_batches
    DROP CONSTRAINT IF EXISTS unique_file_per_org;

ALTER TABLE public.import_batches
    ADD CONSTRAINT unique_file_per_property
    UNIQUE (organization_id, property_id, file_hash);
