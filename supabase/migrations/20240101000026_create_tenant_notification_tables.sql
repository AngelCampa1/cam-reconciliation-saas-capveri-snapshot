-- Migration: Create tenant notification system tables
-- Story: 19.3 - Create Tenant Notification System
-- Description: Adds tables for in-app notifications, email preferences, and email logs for rate limiting

-- Create NotificationType enum
CREATE TYPE public.notificationtype AS ENUM (
    'new_statement',
    'dispute_update',
    'statement_reminder',
    'system'
);

-- Create tenant_notifications table
CREATE TABLE public.tenant_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_user_id UUID NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
    notification_type notificationtype NOT NULL,
    title VARCHAR(255) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    link_url VARCHAR(500),
    related_entity_id UUID,  -- Can reference statements, disputes, etc.
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for querying notifications by tenant user
CREATE INDEX idx_tenant_notifications_tenant_user_id ON public.tenant_notifications(tenant_user_id);

-- Create index for querying unread notifications
CREATE INDEX idx_tenant_notifications_unread ON public.tenant_notifications(tenant_user_id) WHERE read_at IS NULL;

-- Create index for ordering by creation time
CREATE INDEX idx_tenant_notifications_created_at ON public.tenant_notifications(created_at DESC);

-- Create tenant_email_preferences table
CREATE TABLE public.tenant_email_preferences (
    tenant_user_id UUID PRIMARY KEY REFERENCES tenant_users(id) ON DELETE CASCADE,
    new_statement_emails BOOLEAN NOT NULL DEFAULT TRUE,
    dispute_update_emails BOOLEAN NOT NULL DEFAULT TRUE,
    reminder_emails BOOLEAN NOT NULL DEFAULT TRUE,
    marketing_emails BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create tenant_email_logs table for rate limiting
CREATE TABLE public.tenant_email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_user_id UUID NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
    email_type VARCHAR(100) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for rate limiting queries (last hour)
CREATE INDEX idx_tenant_email_logs_rate_limiting ON public.tenant_email_logs(tenant_user_id, sent_at);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE public.tenant_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_email_logs ENABLE ROW LEVEL SECURITY;

-- tenant_notifications policies
-- Tenants can only see their own notifications
CREATE POLICY "Tenants can view own notifications"
    ON public.tenant_notifications FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

-- Tenants can update their own notification read status
CREATE POLICY "Tenants can update own notification read status"
    ON public.tenant_notifications FOR UPDATE
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

-- Backend service can insert notifications
CREATE POLICY "Service can insert notifications"
    ON public.tenant_notifications FOR INSERT
    WITH CHECK (true);  -- Backend authenticated via service role key

-- tenant_email_preferences policies
-- Tenants can view their own preferences
CREATE POLICY "Tenants can view own preferences"
    ON public.tenant_email_preferences FOR SELECT
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

-- Tenants can update their own preferences
CREATE POLICY "Tenants can update own preferences"
    ON public.tenant_email_preferences FOR UPDATE
    USING (
        tenant_user_id IN (
            SELECT id FROM tenant_users WHERE user_id = auth.uid()
        )
    );

-- Backend service can insert/update preferences
CREATE POLICY "Service can manage preferences"
    ON public.tenant_email_preferences FOR ALL
    USING (true);  -- Backend authenticated via service role key

-- tenant_email_logs policies
-- Only backend service can access email logs (for rate limiting)
CREATE POLICY "Service can manage email logs"
    ON public.tenant_email_logs FOR ALL
    USING (true);  -- Backend authenticated via service role key

-- Comments
COMMENT ON TABLE public.tenant_notifications IS 'In-app notifications for tenant users';
COMMENT ON TABLE public.tenant_email_preferences IS 'Email notification preferences per tenant user';
COMMENT ON TABLE public.tenant_email_logs IS 'Log of sent emails for rate limiting (10 emails/hour per tenant)';
COMMENT ON COLUMN public.tenant_notifications.related_entity_id IS 'References related entities like statement_id, dispute_id, etc.';
COMMENT ON INDEX public.idx_tenant_notifications_unread IS 'Optimizes queries for unread notification counts';
COMMENT ON INDEX public.idx_tenant_email_logs_rate_limiting IS 'Optimizes rate limiting queries (emails in past hour)';
