-- Require editor/admin landlord roles for remaining direct browser writes to
-- core financial, ingestion, and reconciliation tables.

CREATE OR REPLACE FUNCTION public.get_user_admin_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID;
BEGIN
    SELECT organization_id INTO v_org_id
    FROM public.users
    WHERE id = (select auth.uid())
    AND role IN ('owner', 'admin');

    RETURN v_org_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_admin_organization_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_admin_organization_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_admin_organization_id() TO authenticated;

DROP POLICY IF EXISTS "Properties are insertable by organization members"
    ON public.properties;
DROP POLICY IF EXISTS "Properties are updatable by organization members"
    ON public.properties;
DROP POLICY IF EXISTS "Properties are deletable by organization admins"
    ON public.properties;

CREATE POLICY "Properties are insertable by organization members"
    ON public.properties
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "Properties are updatable by organization members"
    ON public.properties
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "Properties are deletable by organization admins"
    ON public.properties
    FOR DELETE
    USING (organization_id = public.get_user_admin_organization_id());

DROP POLICY IF EXISTS "Units are insertable via property access" ON public.units;
DROP POLICY IF EXISTS "Units are updatable via property access" ON public.units;
DROP POLICY IF EXISTS "Units are deletable via property access" ON public.units;

CREATE POLICY "Units are insertable via property access"
    ON public.units
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Units are updatable via property access"
    ON public.units
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Units are deletable via property access"
    ON public.units
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Import batches are insertable by organization members"
    ON public.import_batches;
DROP POLICY IF EXISTS "Import batches are updatable by organization members"
    ON public.import_batches;
DROP POLICY IF EXISTS "Import batches are deletable by admins"
    ON public.import_batches;

CREATE POLICY "Import batches are insertable by organization members"
    ON public.import_batches
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "Import batches are updatable by organization members"
    ON public.import_batches
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "Import batches are deletable by admins"
    ON public.import_batches
    FOR DELETE
    USING (organization_id = public.get_user_admin_organization_id());

DROP POLICY IF EXISTS "GL entries are insertable via property access"
    ON public.gl_entries;

CREATE POLICY "GL entries are insertable via property access"
    ON public.gl_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Snapshots insertable by org members"
    ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Draft snapshots updatable by org members"
    ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Draft snapshots deletable by org admins"
    ON public.reconciliation_snapshots;

CREATE POLICY "Snapshots insertable by org members"
    ON public.reconciliation_snapshots
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        OR EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Draft snapshots updatable by org members"
    ON public.reconciliation_snapshots
    FOR UPDATE
    USING (
        status = 'draft'
        AND (
            organization_id = public.get_user_editor_organization_id()
            OR EXISTS (
                SELECT 1
                FROM public.properties p
                WHERE p.id = property_id
                AND p.organization_id = public.get_user_editor_organization_id()
            )
        )
    )
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        OR EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Draft snapshots deletable by org admins"
    ON public.reconciliation_snapshots
    FOR DELETE
    USING (
        status = 'draft'
        AND (
            organization_id = public.get_user_admin_organization_id()
            OR EXISTS (
                SELECT 1
                FROM public.properties p
                WHERE p.id = property_id
                AND p.organization_id = public.get_user_admin_organization_id()
            )
        )
    );

DROP POLICY IF EXISTS "calculation_jobs_insert_policy"
    ON public.calculation_jobs;
DROP POLICY IF EXISTS "calculation_jobs_update_policy"
    ON public.calculation_jobs;
DROP POLICY IF EXISTS "calculation_jobs_delete_policy"
    ON public.calculation_jobs;

CREATE POLICY "calculation_jobs_insert_policy"
    ON public.calculation_jobs
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "calculation_jobs_update_policy"
    ON public.calculation_jobs
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "calculation_jobs_delete_policy"
    ON public.calculation_jobs
    FOR DELETE
    USING (
        organization_id = public.get_user_editor_organization_id()
        AND status IN ('pending', 'failed')
    );

DROP POLICY IF EXISTS "Users can create mappings" ON public.column_mappings;
DROP POLICY IF EXISTS "Users can update mappings" ON public.column_mappings;
DROP POLICY IF EXISTS "Admins can delete mappings" ON public.column_mappings;

CREATE POLICY "Users can create mappings"
    ON public.column_mappings
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_admin_organization_id());

CREATE POLICY "Users can update mappings"
    ON public.column_mappings
    FOR UPDATE
    USING (organization_id = public.get_user_admin_organization_id())
    WITH CHECK (organization_id = public.get_user_admin_organization_id());

CREATE POLICY "Admins can delete mappings"
    ON public.column_mappings
    FOR DELETE
    USING (organization_id = public.get_user_admin_organization_id());
