-- Migration: Create Lease Term Versions Table
-- Description: Versioned lease recovery terms with effective-date semantics.
--   Replaces single-JSONB recovery_profile with temporal versioning so
--   reconciliation can look up the terms that were effective during any period.
-- Dependencies: 20240101000005_create_leases.sql

CREATE TABLE public.lease_term_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    version_number INT NOT NULL DEFAULT 1,
    effective_date DATE NOT NULL,

    -- Recovery profile fields (flat columns, not JSONB)
    base_year INT CHECK (base_year >= 1990 AND base_year <= 2100),
    base_year_amount NUMERIC(14,2) CHECK (base_year_amount >= 0),
    gross_up_base_year BOOLEAN NOT NULL DEFAULT FALSE,
    pro_rata_share NUMERIC(10,8) NOT NULL CHECK (pro_rata_share >= 0 AND pro_rata_share <= 1),
    cap_type VARCHAR(30) NOT NULL DEFAULT 'none'
        CHECK (cap_type IN ('none','non_cumulative','cumulative','cumulative_compounding')),
    cap_rate NUMERIC(10,8) CHECK (cap_rate >= 0 AND cap_rate <= 1),
    admin_fee_percentage NUMERIC(10,8) NOT NULL DEFAULT 0
        CHECK (admin_fee_percentage >= 0 AND admin_fee_percentage <= 0.20),
    excluded_pools JSONB NOT NULL DEFAULT '[]'::jsonb,
    rsf_measurement_standard VARCHAR(10),
    rsf_measurement_date DATE,

    -- Amendment metadata
    amendment_reason TEXT,
    amendment_document_url VARCHAR(2048),

    -- Audit
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT cap_rate_required CHECK (cap_type = 'none' OR cap_rate IS NOT NULL),
    CONSTRAINT unique_lease_version UNIQUE (lease_id, version_number),
    CONSTRAINT unique_lease_effective_date UNIQUE (lease_id, effective_date)
);

-- Efficient lookup: "latest version effective on or before date X"
CREATE INDEX idx_ltv_effective ON public.lease_term_versions(lease_id, effective_date DESC);

-- Apply updated_at is not needed here — versions are immutable (append-only)

-- Enable Row Level Security
ALTER TABLE public.lease_term_versions ENABLE ROW LEVEL SECURITY;

-- Helper: check access via lease → property → org chain
CREATE OR REPLACE FUNCTION public.user_can_access_lease_term_version(p_lease_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.leases l
        JOIN public.properties p ON l.property_id = p.id
        WHERE l.id = p_lease_id
        AND p.organization_id = public.get_user_organization_id()
    )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- RLS: SELECT via lease ownership
CREATE POLICY "Lease term versions are viewable via lease access"
    ON public.lease_term_versions
    FOR SELECT
    USING (public.user_can_access_lease_term_version(lease_id));

-- RLS: INSERT via lease ownership
CREATE POLICY "Lease term versions are insertable via lease access"
    ON public.lease_term_versions
    FOR INSERT
    WITH CHECK (public.user_can_access_lease_term_version(lease_id));

-- RLS: DELETE (admin/owner only)
CREATE POLICY "Lease term versions are deletable by admins"
    ON public.lease_term_versions
    FOR DELETE
    USING (
        public.user_can_access_lease_term_version(lease_id)
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Batch lookup RPC: returns effective version per lease as-of a date
CREATE OR REPLACE FUNCTION public.get_effective_term_versions(
    p_lease_ids UUID[],
    p_as_of DATE
)
RETURNS SETOF public.lease_term_versions
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT DISTINCT ON (lease_id) *
    FROM public.lease_term_versions
    WHERE lease_id = ANY(p_lease_ids)
      AND effective_date <= p_as_of
    ORDER BY lease_id, effective_date DESC;
$$;

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.lease_term_versions TO authenticated;

-- Comments
COMMENT ON TABLE public.lease_term_versions IS 'Versioned lease recovery terms with effective-date semantics for temporal lookups';
COMMENT ON COLUMN public.lease_term_versions.version_number IS 'Auto-incremented version within a lease (1, 2, 3...)';
COMMENT ON COLUMN public.lease_term_versions.effective_date IS 'Date from which these terms take effect';
COMMENT ON COLUMN public.lease_term_versions.amendment_reason IS 'Free-text reason for the amendment (expansion, renewal, renegotiation)';
COMMENT ON FUNCTION public.get_effective_term_versions(UUID[], DATE) IS 'Batch lookup: returns the effective term version for each lease as-of a given date';
