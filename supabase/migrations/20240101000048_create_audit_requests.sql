-- Migration: Create Audit Requests Table
-- Description: Lead capture for free revenue audit requests (Bounty Hunter GTM)
-- Dependencies: 20240101000001_create_organizations.sql

-- Create audit request status enum
CREATE TYPE public.audit_request_status AS ENUM (
    'pending',
    'contacted',
    'scheduled',
    'in_progress',
    'completed',
    'converted',
    'rejected'
);

-- Create audit requests table (for unauthenticated leads)
CREATE TABLE public.audit_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Contact information
    name VARCHAR(200) NOT NULL,
    email VARCHAR(254) NOT NULL,
    company VARCHAR(200) NOT NULL,
    phone VARCHAR(50),

    -- Portfolio information
    building_count INTEGER NOT NULL CHECK (building_count > 0 AND building_count <= 1000),
    portfolio_sqft INTEGER,
    current_system VARCHAR(100),  -- Yardi, MRI, AppFolio, Excel, Other

    -- Request details
    message TEXT,
    source VARCHAR(100),  -- UTM tracking: utm_source, utm_campaign
    referral_code VARCHAR(50),

    -- Status tracking
    status public.audit_request_status NOT NULL DEFAULT 'pending',
    notes TEXT,

    -- Financial estimates (filled after initial analysis)
    estimated_recovery INTEGER,  -- In dollars

    -- Assignment
    assigned_to UUID REFERENCES public.users(id),

    -- Conversion tracking
    organization_id UUID REFERENCES public.organizations(id),
    converted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contacted_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_audit_requests_status ON public.audit_requests(status);
CREATE INDEX idx_audit_requests_email ON public.audit_requests(email);
CREATE INDEX idx_audit_requests_created_at ON public.audit_requests(created_at DESC);
CREATE INDEX idx_audit_requests_assigned_to ON public.audit_requests(assigned_to);
CREATE INDEX idx_audit_requests_organization_id ON public.audit_requests(organization_id);

-- Composite index for dashboard queries
CREATE INDEX idx_audit_requests_status_created
    ON public.audit_requests(status, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_audit_requests_updated_at
    BEFORE UPDATE ON public.audit_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Rate limiting function (prevent spam from same email)
CREATE OR REPLACE FUNCTION public.check_audit_request_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    -- Count requests from this email in the last 24 hours
    SELECT COUNT(*) INTO recent_count
    FROM public.audit_requests
    WHERE email = NEW.email
      AND created_at > NOW() - INTERVAL '24 hours';

    IF recent_count >= 3 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 3 audit requests per email per day';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_audit_request_rate_limit
    BEFORE INSERT ON public.audit_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.check_audit_request_rate_limit();

-- Enable RLS
ALTER TABLE public.audit_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Public INSERT policy (anyone can submit an audit request)
CREATE POLICY "Anyone can create audit requests"
    ON public.audit_requests
    FOR INSERT
    WITH CHECK (true);

-- Admins can view all audit requests
CREATE POLICY "Admins can view all audit requests"
    ON public.audit_requests
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Assigned users can view their assigned requests
CREATE POLICY "Assigned users can view their requests"
    ON public.audit_requests
    FOR SELECT
    USING (assigned_to = auth.uid());

-- Admins can update audit requests
CREATE POLICY "Admins can update audit requests"
    ON public.audit_requests
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Assigned users can update their assigned requests
CREATE POLICY "Assigned users can update their requests"
    ON public.audit_requests
    FOR UPDATE
    USING (assigned_to = auth.uid());

-- No DELETE - audit requests are retained for analytics

-- Grant permissions
GRANT INSERT ON public.audit_requests TO anon;  -- Public can submit
GRANT SELECT, UPDATE ON public.audit_requests TO authenticated;

-- Comments
COMMENT ON TABLE public.audit_requests IS 'Lead capture for free revenue audit requests (Bounty Hunter GTM)';
COMMENT ON COLUMN public.audit_requests.id IS 'Primary key UUID';
COMMENT ON COLUMN public.audit_requests.name IS 'Contact name';
COMMENT ON COLUMN public.audit_requests.email IS 'Contact email';
COMMENT ON COLUMN public.audit_requests.company IS 'Company name';
COMMENT ON COLUMN public.audit_requests.phone IS 'Phone number (optional)';
COMMENT ON COLUMN public.audit_requests.building_count IS 'Number of buildings in portfolio';
COMMENT ON COLUMN public.audit_requests.portfolio_sqft IS 'Total portfolio square footage (optional)';
COMMENT ON COLUMN public.audit_requests.current_system IS 'Current ERP system (Yardi, MRI, AppFolio, etc.)';
COMMENT ON COLUMN public.audit_requests.message IS 'Additional message from prospect';
COMMENT ON COLUMN public.audit_requests.source IS 'UTM tracking source';
COMMENT ON COLUMN public.audit_requests.referral_code IS 'Referral/partner code if applicable';
COMMENT ON COLUMN public.audit_requests.status IS 'Request status: pending, contacted, scheduled, in_progress, completed, converted, rejected';
COMMENT ON COLUMN public.audit_requests.notes IS 'Internal notes on the request';
COMMENT ON COLUMN public.audit_requests.estimated_recovery IS 'Estimated revenue recovery in dollars';
COMMENT ON COLUMN public.audit_requests.assigned_to IS 'User assigned to handle this request';
COMMENT ON COLUMN public.audit_requests.organization_id IS 'Organization created after conversion';
COMMENT ON COLUMN public.audit_requests.converted_at IS 'When the lead converted to customer';
COMMENT ON COLUMN public.audit_requests.created_at IS 'When the request was submitted';
COMMENT ON COLUMN public.audit_requests.updated_at IS 'When the request was last updated';
COMMENT ON COLUMN public.audit_requests.contacted_at IS 'When lead was first contacted';
COMMENT ON COLUMN public.audit_requests.scheduled_at IS 'When audit was scheduled';
COMMENT ON COLUMN public.audit_requests.completed_at IS 'When audit was completed';
COMMENT ON TYPE public.audit_request_status IS 'Audit request lifecycle states';
