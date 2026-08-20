-- Migration: Fix Audit Trigger Function - Correct RECORD Operator Usage
-- Description: Fix the audit_trigger_func to use correct PostgreSQL syntax for RECORD types
-- Dependencies: 20240101000011_create_audit_log_table.sql

-- Drop and recreate the audit trigger function with corrected syntax
-- The original function incorrectly used JSONB operators (? and ->>) on RECORD types (OLD/NEW)
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get organization_id from the row (all audited tables have this column)
    -- Use direct field access on RECORD types, not JSONB operators
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

COMMENT ON FUNCTION public.audit_trigger_func() IS 'Generic audit trigger function for capturing DML operations (fixed to use correct RECORD syntax)';
