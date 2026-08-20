-- Track authentication events for security monitoring
-- This table logs all login attempts (success and failure) for security auditing

CREATE TABLE public.auth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL CHECK (event_type IN ('login_success', 'login_failure')),
    email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying by email and timestamp
CREATE INDEX idx_auth_events_email ON public.auth_events(email);
CREATE INDEX idx_auth_events_timestamp ON public.auth_events(timestamp DESC);
CREATE INDEX idx_auth_events_type ON public.auth_events(event_type);

-- Enable RLS for security logging table
-- Only service role should write, admins can read
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (needed for backend auth logging)
CREATE POLICY "Service role full access" ON public.auth_events
    FOR ALL
    USING (auth.role() = 'service_role');

-- Allow admins to view auth event logs for security monitoring
CREATE POLICY "Admins can view auth events" ON public.auth_events
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add comment explaining table purpose
COMMENT ON TABLE public.auth_events IS 'Security audit log for authentication attempts (login success/failure)';
COMMENT ON COLUMN public.auth_events.event_type IS 'Type of auth event: login_success or login_failure';
COMMENT ON COLUMN public.auth_events.email IS 'Email address attempting to authenticate';
COMMENT ON COLUMN public.auth_events.ip_address IS 'IP address of the authentication request';
COMMENT ON COLUMN public.auth_events.user_agent IS 'User agent string from request headers';
COMMENT ON COLUMN public.auth_events.timestamp IS 'When the authentication attempt occurred';
