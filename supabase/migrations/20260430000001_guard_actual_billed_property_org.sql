-- Guard actual_billed_amounts against organization/property mismatches.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.actual_billed_amounts aba
        JOIN public.properties p ON p.id = aba.property_id
        WHERE aba.organization_id IS DISTINCT FROM p.organization_id
    ) THEN
        RAISE EXCEPTION
            'Existing actual_billed_amounts rows have organization_id values that do not match their property organization';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.actual_billed_property_org_matches()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.properties p
        WHERE p.id = NEW.property_id
          AND p.organization_id = NEW.organization_id
    ) THEN
        RAISE EXCEPTION
            'actual_billed_amounts.organization_id must match property organization'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_actual_billed_property_org
    ON public.actual_billed_amounts;

CREATE TRIGGER guard_actual_billed_property_org
    BEFORE INSERT OR UPDATE OF organization_id, property_id
    ON public.actual_billed_amounts
    FOR EACH ROW
    EXECUTE FUNCTION public.actual_billed_property_org_matches();
