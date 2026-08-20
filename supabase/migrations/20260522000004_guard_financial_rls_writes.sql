-- Require editor-level landlord roles for direct browser writes to financial
-- configuration and extraction state tables. Viewers retain read access through
-- existing SELECT policies, but cannot mutate CAM inputs through PostgREST.

CREATE OR REPLACE FUNCTION public.get_user_editor_organization_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    PERFORM set_config('row_security', 'off', true);
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = (select auth.uid())
    AND role IN ('owner', 'admin', 'member');
    RETURN v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_editor_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_editor_organization_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_editor_organization_id() TO authenticated;

DROP POLICY IF EXISTS "Leases are insertable via property access" ON public.leases;
CREATE POLICY "Leases are insertable via property access"
    ON public.leases
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Leases are updatable via property access" ON public.leases;
CREATE POLICY "Leases are updatable via property access"
    ON public.leases
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Lease term versions are insertable via lease access"
    ON public.lease_term_versions;
CREATE POLICY "Lease term versions are insertable via lease access"
    ON public.lease_term_versions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.leases l
            JOIN public.properties p ON l.property_id = p.id
            WHERE l.id = lease_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Expense pools are insertable via property access"
    ON public.expense_pools;
CREATE POLICY "Expense pools are insertable via property access"
    ON public.expense_pools
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Expense pools are updatable via property access"
    ON public.expense_pools;
CREATE POLICY "Expense pools are updatable via property access"
    ON public.expense_pools
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Expense pools are deletable via property access"
    ON public.expense_pools;
CREATE POLICY "Expense pools are deletable via property access"
    ON public.expense_pools
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Pool mappings are insertable via pool access"
    ON public.pool_mappings;
CREATE POLICY "Pool mappings are insertable via pool access"
    ON public.pool_mappings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Pool mappings are updatable via pool access"
    ON public.pool_mappings;
CREATE POLICY "Pool mappings are updatable via pool access"
    ON public.pool_mappings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Pool mappings are deletable via pool access"
    ON public.pool_mappings;
CREATE POLICY "Pool mappings are deletable via pool access"
    ON public.pool_mappings
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = expense_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "tenant_isolation_pool_allocations"
    ON public.pool_allocations;
CREATE POLICY "Pool allocations viewable via pool access"
    ON public.pool_allocations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = pool_allocations.source_pool_id
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Pool allocations insertable by org editors"
    ON public.pool_allocations
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = source_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
        AND EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = target_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Pool allocations updatable by org editors"
    ON public.pool_allocations
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = pool_allocations.source_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = source_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
        AND EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = target_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Pool allocations deletable by org editors"
    ON public.pool_allocations
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.expense_pools ep
            JOIN public.properties p ON ep.property_id = p.id
            WHERE ep.id = pool_allocations.source_pool_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Users can create actual billed amounts for their organization"
    ON public.actual_billed_amounts;
CREATE POLICY "Users can create actual billed amounts for their organization"
    ON public.actual_billed_amounts
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Users can update their organization's actual billed amounts"
    ON public.actual_billed_amounts;
CREATE POLICY "Users can update their organization's actual billed amounts"
    ON public.actual_billed_amounts
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Users can delete their organization's actual billed amounts"
    ON public.actual_billed_amounts;
CREATE POLICY "Users can delete their organization's actual billed amounts"
    ON public.actual_billed_amounts
    FOR DELETE
    USING (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Users can create org templates" ON public.pool_templates;
CREATE POLICY "Users can create org templates"
    ON public.pool_templates
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        AND is_system = false
    );

DROP POLICY IF EXISTS "Users can update org templates" ON public.pool_templates;
CREATE POLICY "Users can update org templates"
    ON public.pool_templates
    FOR UPDATE
    USING (
        organization_id = public.get_user_editor_organization_id()
        AND is_system = false
    )
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        AND is_system = false
    );

DROP POLICY IF EXISTS "Users can delete org templates" ON public.pool_templates;
CREATE POLICY "Users can delete org templates"
    ON public.pool_templates
    FOR DELETE
    USING (
        organization_id = public.get_user_editor_organization_id()
        AND is_system = false
    );

DROP POLICY IF EXISTS "Documents are insertable by organization members"
    ON public.documents;
CREATE POLICY "Documents are insertable by organization members"
    ON public.documents
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Documents are updatable by organization members"
    ON public.documents;
CREATE POLICY "Documents are updatable by organization members"
    ON public.documents
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Users create org jobs" ON public.extraction_jobs;
CREATE POLICY "Users create org jobs"
    ON public.extraction_jobs
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "Users update org jobs" ON public.extraction_jobs;
CREATE POLICY "Users update org jobs"
    ON public.extraction_jobs
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "OCR results are insertable by organization members"
    ON public.ocr_results;
CREATE POLICY "OCR results are insertable by organization members"
    ON public.ocr_results
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "OCR results are updatable by organization members"
    ON public.ocr_results;
CREATE POLICY "OCR results are updatable by organization members"
    ON public.ocr_results
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

REVOKE EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB)
    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB)
    FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB)
    FROM authenticated;
GRANT EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB)
    TO service_role;
