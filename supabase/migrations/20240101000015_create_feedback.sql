-- Migration: Create Feedback Table
-- Description: User feedback, bug reports, and feature requests
-- Dependencies: 20240101000002_create_users.sql, 20240101000001_create_organizations.sql

-- Create feedback type enum
CREATE TYPE public.feedback_type AS ENUM (
    'bug',
    'feature_request',
    'general'
);

-- Create feedback status enum
CREATE TYPE public.feedback_status AS ENUM (
    'new',
    'reviewed',
    'resolved',
    'dismissed'
);

-- Create feedback table
CREATE TABLE public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    type public.feedback_type NOT NULL DEFAULT 'general',
    status public.feedback_status NOT NULL DEFAULT 'new',
    message TEXT NOT NULL CHECK (LENGTH(message) >= 10 AND LENGTH(message) <= 5000),
    screenshot_url TEXT,
    page_url VARCHAR(2000) NOT NULL,
    user_agent VARCHAR(500),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_organization_id ON public.feedback(organization_id);
CREATE INDEX idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX idx_feedback_status ON public.feedback(status);
CREATE INDEX idx_feedback_type ON public.feedback(type);
CREATE INDEX idx_feedback_created_at ON public.feedback(created_at DESC);

-- Composite index for rate limiting query
CREATE INDEX idx_feedback_user_hourly
    ON public.feedback(user_id, created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Rate limiting function
CREATE OR REPLACE FUNCTION public.check_feedback_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
    recent_count INTEGER;
BEGIN
    -- Count feedback from this user in the last hour
    SELECT COUNT(*) INTO recent_count
    FROM public.feedback
    WHERE user_id = NEW.user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF recent_count >= 10 THEN
        RAISE EXCEPTION 'Rate limit exceeded: maximum 10 feedback submissions per hour';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_feedback_rate_limit
    BEFORE INSERT ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.check_feedback_rate_limit();

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own feedback
CREATE POLICY "Users can view their own feedback"
    ON public.feedback
    FOR SELECT
    USING (user_id = auth.uid());

-- Admins/owners can view all feedback in their organization
CREATE POLICY "Admins can view all organization feedback"
    ON public.feedback
    FOR SELECT
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- Users can create feedback for themselves
CREATE POLICY "Users can create feedback"
    ON public.feedback
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id = public.get_user_organization_id()
    );

-- Only admins can update feedback status
CREATE POLICY "Admins can update feedback status"
    ON public.feedback
    FOR UPDATE
    USING (
        organization_id = public.get_user_organization_id()
        AND EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        organization_id = public.get_user_organization_id()
    );

-- No DELETE - feedback is retained for analysis

-- Grant permissions
GRANT SELECT, INSERT ON public.feedback TO authenticated;
GRANT UPDATE ON public.feedback TO authenticated;

COMMENT ON TABLE public.feedback IS 'User feedback, bug reports, and feature requests';
COMMENT ON COLUMN public.feedback.id IS 'Primary key UUID';
COMMENT ON COLUMN public.feedback.user_id IS 'FK to users who submitted feedback';
COMMENT ON COLUMN public.feedback.organization_id IS 'FK to organizations';
COMMENT ON COLUMN public.feedback.type IS 'Feedback type: bug, feature_request, or general';
COMMENT ON COLUMN public.feedback.status IS 'Feedback status: new, reviewed, resolved, dismissed';
COMMENT ON COLUMN public.feedback.message IS 'Feedback message (10-5000 characters)';
COMMENT ON COLUMN public.feedback.screenshot_url IS 'URL to uploaded screenshot in Supabase Storage';
COMMENT ON COLUMN public.feedback.page_url IS 'Page URL where feedback was submitted';
COMMENT ON COLUMN public.feedback.user_agent IS 'Browser user agent string';
COMMENT ON COLUMN public.feedback.metadata IS 'JSONB: browser, os, viewport, console_errors';
COMMENT ON COLUMN public.feedback.created_at IS 'When the feedback was created';
COMMENT ON COLUMN public.feedback.updated_at IS 'When the feedback was last updated';
COMMENT ON TYPE public.feedback_type IS 'Feedback types: bug, feature_request, general';
COMMENT ON TYPE public.feedback_status IS 'Feedback lifecycle states';
