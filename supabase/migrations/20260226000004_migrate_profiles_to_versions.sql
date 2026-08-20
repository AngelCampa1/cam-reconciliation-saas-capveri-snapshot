-- Migration: Migrate Existing Recovery Profiles to Term Versions
-- Description: For every lease that has a recovery_profile, create a v1
--   lease_term_version with effective_date = lease.start_date.
--   The recovery_profile column is NOT dropped — it stays as a read cache.
-- Dependencies: 20260226000001_create_lease_term_versions.sql

INSERT INTO public.lease_term_versions (
    lease_id,
    version_number,
    effective_date,
    base_year,
    base_year_amount,
    gross_up_base_year,
    pro_rata_share,
    cap_type,
    cap_rate,
    admin_fee_percentage,
    excluded_pools,
    rsf_measurement_standard,
    rsf_measurement_date,
    amendment_reason
)
SELECT
    l.id AS lease_id,
    1 AS version_number,
    l.start_date AS effective_date,
    (l.recovery_profile->>'base_year')::INT,
    (l.recovery_profile->>'base_year_amount')::NUMERIC(14,2),
    COALESCE((l.recovery_profile->>'gross_up_base_year')::BOOLEAN, FALSE),
    COALESCE((l.recovery_profile->>'pro_rata_share')::NUMERIC(10,8), 0),
    COALESCE(l.recovery_profile->>'cap_type', 'none'),
    (l.recovery_profile->>'cap_rate')::NUMERIC(10,8),
    COALESCE((l.recovery_profile->>'admin_fee_percentage')::NUMERIC(10,8), 0),
    COALESCE(l.recovery_profile->'excluded_pools', '[]'::jsonb),
    l.recovery_profile->>'rsf_measurement_standard',
    (l.recovery_profile->>'rsf_measurement_date')::DATE,
    'Initial migration from recovery_profile JSONB'
FROM public.leases l
WHERE l.recovery_profile IS NOT NULL
  AND l.recovery_profile != '{}'::jsonb;
