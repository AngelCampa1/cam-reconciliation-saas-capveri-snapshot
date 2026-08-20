-- Migration: Enable pgAudit Extension and Application-Level Auditing
-- Description: Audit logging for financial tables for compliance and traceability
-- Dependencies: 20240101000010_create_reconciliation_snapshots.sql

-- Enable pgAudit extension (if available in the PostgreSQL instance)
-- Note: pgAudit may require superuser privileges and server configuration.
-- In Supabase, this may need to be enabled via the dashboard or may not be available.
-- The extension is optional - application-level auditing works regardless.
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Create application-level audit log table
-- This provides queryable auditing independent of pgAudit server logs
CREATE TABLE public.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_id UUID,
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES public.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Additional context for audit queries
    organization_id UUID,
    session_info JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for common audit queries
CREATE INDEX idx_audit_log_table_name ON public.audit_log(table_name);
CREATE INDEX idx_audit_log_row_id ON public.audit_log(row_id);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by);
CREATE INDEX idx_audit_log_organization_id ON public.audit_log(organization_id);

-- Composite index for common query patterns
CREATE INDEX idx_audit_log_table_operation ON public.audit_log(table_name, operation);

-- Generic audit trigger function
-- Captures INSERT, UPDATE, DELETE operations with before/after data
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get organization_id from the row (all audited tables have this column)
    IF TG_OP = 'DELETE' THEN
        v_org_id := OLD.organization_id;
    ELSE
        v_org_id := NEW.organization_id;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, new_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.uid(), v_org_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.audit_log (table_name, operation, row_id, old_data, changed_by, organization_id)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), auth.uid(), v_org_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to financial tables

-- GL Entries: Track INSERT and DELETE (entries are immutable, no UPDATE)
CREATE TRIGGER audit_gl_entries
    AFTER INSERT OR DELETE ON public.gl_entries
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Reconciliation Snapshots: Track all DML operations
CREATE TRIGGER audit_reconciliation_snapshots
    AFTER INSERT OR UPDATE OR DELETE ON public.reconciliation_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

-- Leases: Track UPDATE only when recovery_profile changes (financial terms)
CREATE TRIGGER audit_leases_recovery_profile
    AFTER UPDATE ON public.leases
    FOR EACH ROW
    WHEN (OLD.recovery_profile IS DISTINCT FROM NEW.recovery_profile)
    EXECUTE FUNCTION public.audit_trigger_func();

-- Enable Row Level Security on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Audit log viewable by admins/owners only
-- Auditors need admin role to view the audit trail
CREATE POLICY "Audit log viewable by admins"
    ON public.audit_log
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- No INSERT/UPDATE/DELETE policies - audit_log is append-only via triggers
-- Users cannot directly modify the audit log

-- Grant SELECT only to authenticated users (RLS restricts to admins)
GRANT SELECT ON public.audit_log TO authenticated;

-- Grant usage on the sequence for the trigger function
GRANT USAGE ON SEQUENCE public.audit_log_id_seq TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.audit_log IS 'Application-level audit trail for financial data changes';
COMMENT ON COLUMN public.audit_log.id IS 'Auto-incrementing audit entry ID';
COMMENT ON COLUMN public.audit_log.table_name IS 'Name of the table that was modified';
COMMENT ON COLUMN public.audit_log.operation IS 'DML operation: INSERT, UPDATE, or DELETE';
COMMENT ON COLUMN public.audit_log.row_id IS 'UUID of the affected row';
COMMENT ON COLUMN public.audit_log.old_data IS 'JSONB snapshot of row before change (UPDATE/DELETE)';
COMMENT ON COLUMN public.audit_log.new_data IS 'JSONB snapshot of row after change (INSERT/UPDATE)';
COMMENT ON COLUMN public.audit_log.changed_by IS 'User who made the change';
COMMENT ON COLUMN public.audit_log.changed_at IS 'Timestamp of the change';
COMMENT ON COLUMN public.audit_log.organization_id IS 'Organization context for multi-tenant filtering';
COMMENT ON COLUMN public.audit_log.session_info IS 'Additional session context (optional)';
COMMENT ON FUNCTION public.audit_trigger_func() IS 'Generic audit trigger function for capturing DML operations';
