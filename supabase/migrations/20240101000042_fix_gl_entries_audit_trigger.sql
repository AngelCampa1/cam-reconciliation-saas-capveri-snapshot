-- Migration: Fix GL Entries Audit Trigger - Handle Missing organization_id
-- Description: gl_entries table doesn't have organization_id, it's scoped via property_id
-- Dependencies: 20240101000040_fix_audit_trigger_operator.sql

-- Drop the existing audit trigger on gl_entries
DROP TRIGGER IF EXISTS audit_gl_entries ON public.gl_entries;

-- Create a specialized audit trigger function for gl_entries
CREATE OR REPLACE FUNCTION public.audit_gl_entries_func()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get organization_id via property_id (gl_entries doesn't have organization_id directly)
    IF TG_OP = 'DELETE' THEN
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = OLD.property_id;
    ELSE
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = NEW.property_id;
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

COMMENT ON FUNCTION public.audit_gl_entries_func() IS 'Audit trigger function for gl_entries table (gets organization_id via property_id)';

-- Re-create the audit trigger using the specialized function
CREATE TRIGGER audit_gl_entries
    AFTER INSERT OR DELETE ON public.gl_entries
    FOR EACH ROW EXECUTE FUNCTION public.audit_gl_entries_func();

COMMENT ON TRIGGER audit_gl_entries ON public.gl_entries IS 'Audit trail for GL entries (uses specialized function to resolve organization_id)';
