-- Create dispute workflow tables for tenant portal
-- Migration: 20240101000023
-- Story: 19.4 - Create Dispute Workflow

-- Create dispute status enum
CREATE TYPE public.disputestatus AS ENUM (
    'open',
    'under_review',
    'resolved',
    'rejected',
    'closed'
);

-- Create dispute category enum
CREATE TYPE public.disputecategory AS ENUM (
    'calculation_error',
    'missing_credit',
    'incorrect_area',
    'base_year_issue',
    'billing_question',
    'other'
);

-- Create disputes table
CREATE TABLE public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_user_id UUID NOT NULL REFERENCES tenant_users(id) ON DELETE CASCADE,
    statement_id UUID NOT NULL REFERENCES reconciliation_snapshots(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    category disputecategory NOT NULL,
    description TEXT NOT NULL CHECK (char_length(description) <= 5000),
    status disputestatus NOT NULL DEFAULT 'open',

    -- Resolution tracking
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_summary TEXT CHECK (resolution_summary IS NULL OR char_length(resolution_summary) <= 5000),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create dispute_comments table for threaded communication
CREATE TABLE public.dispute_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create dispute_attachments table for file uploads
CREATE TABLE public.dispute_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    mime_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_disputes_tenant_user ON public.disputes(tenant_user_id);
CREATE INDEX idx_disputes_statement ON public.disputes(statement_id);
CREATE INDEX idx_disputes_organization ON public.disputes(organization_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_created_at ON public.disputes(created_at DESC);

CREATE INDEX idx_dispute_comments_dispute ON public.dispute_comments(dispute_id);
CREATE INDEX idx_dispute_comments_created_at ON public.dispute_comments(created_at);

CREATE INDEX idx_dispute_attachments_dispute ON public.dispute_attachments(dispute_id);

-- Enable Row Level Security
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for disputes

-- Tenants can view their own disputes
CREATE POLICY "Tenants can view own disputes"
    ON public.disputes FOR SELECT
    USING (tenant_user_id IN (
        SELECT id FROM tenant_users WHERE user_id = auth.uid()
    ));

-- Tenants can create disputes
CREATE POLICY "Tenants can create disputes"
    ON public.disputes FOR INSERT
    WITH CHECK (tenant_user_id IN (
        SELECT id FROM tenant_users WHERE user_id = auth.uid()
    ));

-- Landlords can view disputes for their organization
CREATE POLICY "Landlords can view organization disputes"
    ON public.disputes FOR SELECT
    USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- Landlords can update dispute status
CREATE POLICY "Landlords can update organization disputes"
    ON public.disputes FOR UPDATE
    USING (organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    ));

-- RLS Policies for dispute_comments

-- Tenants can view comments on their disputes (excluding internal comments)
CREATE POLICY "Tenants can view own dispute comments"
    ON public.dispute_comments FOR SELECT
    USING (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
        AND is_internal = FALSE
    );

-- Tenants can add comments to their disputes
CREATE POLICY "Tenants can add comments to own disputes"
    ON public.dispute_comments FOR INSERT
    WITH CHECK (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
        AND author_id = auth.uid()
        AND is_internal = FALSE
    );

-- Landlords can view all comments for their organization's disputes
CREATE POLICY "Landlords can view organization dispute comments"
    ON public.dispute_comments FOR SELECT
    USING (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Landlords can add comments (including internal)
CREATE POLICY "Landlords can add comments to organization disputes"
    ON public.dispute_comments FOR INSERT
    WITH CHECK (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
        AND author_id = auth.uid()
    );

-- RLS Policies for dispute_attachments

-- Tenants can view attachments on their disputes
CREATE POLICY "Tenants can view own dispute attachments"
    ON public.dispute_attachments FOR SELECT
    USING (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- Tenants can upload attachments to their disputes
CREATE POLICY "Tenants can upload to own disputes"
    ON public.dispute_attachments FOR INSERT
    WITH CHECK (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
        AND uploaded_by = auth.uid()
    );

-- Landlords can view attachments for their organization's disputes
CREATE POLICY "Landlords can view organization dispute attachments"
    ON public.dispute_attachments FOR SELECT
    USING (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Landlords can upload attachments
CREATE POLICY "Landlords can upload to organization disputes"
    ON public.dispute_attachments FOR INSERT
    WITH CHECK (
        dispute_id IN (
            SELECT id FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
        AND uploaded_by = auth.uid()
    );

-- Create storage bucket for dispute attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('dispute-attachments', 'dispute-attachments', false);

-- Storage policies for dispute attachments

-- Tenants can upload to their own dispute folders
CREATE POLICY "Tenants can upload dispute attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- Tenants can view their own dispute attachments
CREATE POLICY "Tenants can view own dispute attachments"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM disputes
            WHERE tenant_user_id IN (
                SELECT id FROM tenant_users WHERE user_id = auth.uid()
            )
        )
    );

-- Landlords can view and upload to organization dispute folders
CREATE POLICY "Landlords can access organization dispute attachments"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Landlords can upload organization dispute attachments"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM disputes
            WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER disputes_updated_at
    BEFORE UPDATE ON public.disputes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_disputes_updated_at();

-- Add comment documenting the schema
COMMENT ON TABLE public.disputes IS 'Tenant disputes against reconciliation statements';
COMMENT ON TABLE public.dispute_comments IS 'Threaded comments for dispute resolution';
COMMENT ON TABLE public.dispute_attachments IS 'File attachments supporting disputes';
