-- Migration: Create SB1103 Compliance Requests Table
--
-- California SB 1103 (effective January 1, 2025) requires landlords to provide
-- Qualified Commercial Tenants (QCTs) with an itemized 18-month historical CAM
-- expense ledger within 30 days of a written request. Failure to comply gives
-- the tenant the right to rescind their lease.
--
-- This table tracks compliance requests, response deadlines, and export history.

CREATE TABLE public.sb1103_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id         UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    lease_id            UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    requested_by_name   VARCHAR(255) NOT NULL,
    requested_by_email  VARCHAR(255) NOT NULL,
    request_date        DATE NOT NULL,
    response_deadline   DATE NOT NULL,       -- request_date + 30 days
    window_start_date   DATE NOT NULL,       -- request_date - 18 calendar months
    window_end_date     DATE NOT NULL,       -- = request_date
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'exported', 'delivered', 'overdue')),
    export_format       VARCHAR(10) CHECK (export_format IN ('pdf', 'excel', 'both')),
    exported_at         TIMESTAMPTZ,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT window_start_before_end CHECK (window_start_date < window_end_date),
    CONSTRAINT deadline_after_request  CHECK (response_deadline > request_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_sb1103_requests_organization_id ON public.sb1103_requests(organization_id);
CREATE INDEX idx_sb1103_requests_property_id     ON public.sb1103_requests(property_id);
CREATE INDEX idx_sb1103_requests_lease_id        ON public.sb1103_requests(lease_id);
CREATE INDEX idx_sb1103_requests_status          ON public.sb1103_requests(status);
CREATE INDEX idx_sb1103_requests_response_deadline ON public.sb1103_requests(response_deadline);

-- updated_at trigger (reuses existing function)
CREATE TRIGGER update_sb1103_requests_updated_at
    BEFORE UPDATE ON public.sb1103_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE public.sb1103_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sb1103_requests_select"
    ON public.sb1103_requests FOR SELECT
    USING (organization_id = get_user_organization_id());

CREATE POLICY "sb1103_requests_insert"
    ON public.sb1103_requests FOR INSERT
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "sb1103_requests_update"
    ON public.sb1103_requests FOR UPDATE
    USING (organization_id = get_user_organization_id())
    WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "sb1103_requests_delete"
    ON public.sb1103_requests FOR DELETE
    USING (organization_id = get_user_organization_id());

-- Data retention: compliance records have same legal weight as disputes (10 years)
INSERT INTO public.data_retention_policies
    (table_name, retention_category, retention_years, purge_after_days, purge_condition, legal_basis, notes)
VALUES
(
    'sb1103_requests',
    'financial_permanent',
    10,
    NULL,
    'Never purged automatically; retained for full 10-year period',
    'California Civil Code Section 1938.1 (SB 1103), California CCP Section 337',
    'SB 1103 compliance requests -- legal records of landlord response to QCT ledger requests'
);
