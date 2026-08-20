-- Migration: Fix Audit Trigger for Tables Without organization_id Column
-- Description: Handle leases table which gets organization_id via property FK
-- Dependencies: 20240101000040_fix_audit_trigger_operator.sql

-- Drop and recreate the audit trigger function to handle tables without direct organization_id
CREATE OR REPLACE FUNCTION public.audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_org_id UUID;
    v_property_id UUID;
BEGIN
    -- Get organization_id from the row
    -- For leases table, organization_id comes via property FK
    -- For other tables, it's a direct column
    IF TG_TABLE_NAME = 'leases' THEN
        -- Leases table: get organization_id via property
        IF TG_OP = 'DELETE' THEN
            v_property_id := OLD.property_id;
        ELSE
            v_property_id := NEW.property_id;
        END IF;

        -- Query properties table to get organization_id
        SELECT organization_id INTO v_org_id
        FROM public.properties
        WHERE id = v_property_id;
    ELSE
        -- All other audited tables have direct organization_id column
        IF TG_OP = 'DELETE' THEN
            v_org_id := OLD.organization_id;
        ELSE
            v_org_id := NEW.organization_id;
        END IF;
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

COMMENT ON FUNCTION public.audit_trigger_func() IS 'Generic audit trigger function that handles tables with and without direct organization_id column (e.g., leases gets org via property FK)';
