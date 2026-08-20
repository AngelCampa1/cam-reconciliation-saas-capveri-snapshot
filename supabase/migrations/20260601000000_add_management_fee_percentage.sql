-- Migration: add management_fee_percentage to lease_term_versions
--
-- Adds a nullable management fee percentage to the versioned lease-terms store,
-- distinct from admin_fee_percentage. A management fee is a percentage of
-- operating expenses charged by the property manager (often phrased as
-- "administrative and overhead charge"); admin_fee_percentage is a flat
-- surcharge billed ON TOP of the CAM total. They are different concepts and
-- must be stored separately so downstream extraction and (future) detection
-- logic can distinguish them.
--
-- Nullability: unlike admin_fee_percentage (NOT NULL DEFAULT 0), this column is
-- nullable with NO default. NULL means "no management fee cap found in the
-- lease" and is semantically different from 0 ("an explicit 0% cap"). This
-- mirrors the Decimal | None model semantics in the application layer.
--
-- The leases.recovery_profile JSONB column also carries this value as the key
-- "management_fee_percentage"; JSONB is schemaless, so no column change is
-- required there. Existing rows without the key read back as NULL/None via the
-- application data fetcher, which is the correct default.

ALTER TABLE public.lease_term_versions
    ADD COLUMN management_fee_percentage NUMERIC(10,8)
        CHECK (
            management_fee_percentage IS NULL
            OR (management_fee_percentage >= 0 AND management_fee_percentage <= 0.20)
        );

COMMENT ON COLUMN public.lease_term_versions.management_fee_percentage IS
    'Permitted management fee as a decimal (0-0.20), distinct from admin_fee_percentage. NULL = no cap found.';
