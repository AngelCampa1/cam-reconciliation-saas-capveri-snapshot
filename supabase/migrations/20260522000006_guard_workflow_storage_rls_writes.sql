-- Close remaining tenant/viewer write paths in compliance, campaign, analysis,
-- and storage policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'lease-documents',
    'lease-documents',
    false,
    26214400,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload lease documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read lease documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete lease documents" ON storage.objects;

CREATE POLICY "Users can upload lease documents"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'lease-documents'
        AND EXISTS (
            SELECT 1
            FROM public.leases l
            JOIN public.properties p ON p.id = l.property_id
            WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Users can read lease documents"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'lease-documents'
        AND EXISTS (
            SELECT 1
            FROM public.leases l
            JOIN public.properties p ON p.id = l.property_id
            WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
            AND p.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Users can delete lease documents"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'lease-documents'
        AND EXISTS (
            SELECT 1
            FROM public.leases l
            JOIN public.properties p ON p.id = l.property_id
            WHERE l.id::text = (storage.foldername(storage.objects.name))[1]
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "Users can upload documents to org folder"
    ON storage.objects;
DROP POLICY IF EXISTS "Users can read org documents"
    ON storage.objects;
DROP POLICY IF EXISTS "Users can delete org documents"
    ON storage.objects;

CREATE POLICY "Users can upload documents to org folder"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(storage.objects.name))[1] = public.get_user_editor_organization_id()::text
    );

CREATE POLICY "Users can read org documents"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(storage.objects.name))[1] = public.get_user_organization_id()::text
    );

CREATE POLICY "Users can delete org documents"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'documents'
        AND (storage.foldername(storage.objects.name))[1] = public.get_user_editor_organization_id()::text
    );

DROP POLICY IF EXISTS "Landlords can access organization dispute attachments"
    ON storage.objects;
DROP POLICY IF EXISTS "Landlords can upload organization dispute attachments"
    ON storage.objects;

CREATE POLICY "Landlords can access organization dispute attachments"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT d.id::text
            FROM public.disputes d
            WHERE d.organization_id = public.get_user_organization_id()
        )
    );

CREATE POLICY "Landlords can upload organization dispute attachments"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'dispute-attachments'
        AND (storage.foldername(storage.objects.name))[1] IN (
            SELECT d.id::text
            FROM public.disputes d
            WHERE d.organization_id = public.get_user_editor_organization_id()
        )
    );

DROP POLICY IF EXISTS "sb1103_requests_insert" ON public.sb1103_requests;
DROP POLICY IF EXISTS "sb1103_requests_update" ON public.sb1103_requests;
DROP POLICY IF EXISTS "sb1103_requests_delete" ON public.sb1103_requests;

CREATE POLICY "sb1103_requests_insert"
    ON public.sb1103_requests
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "sb1103_requests_update"
    ON public.sb1103_requests
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "sb1103_requests_delete"
    ON public.sb1103_requests
    FOR DELETE
    USING (organization_id = public.get_user_admin_organization_id());

DROP POLICY IF EXISTS "Org members can create campaigns"
    ON public.reconciliation_campaigns;
DROP POLICY IF EXISTS "Org members can update their campaigns"
    ON public.reconciliation_campaigns;
DROP POLICY IF EXISTS "Org editors can update review campaigns"
    ON public.reconciliation_campaigns;
DROP POLICY IF EXISTS "Org admins can approve or send campaigns"
    ON public.reconciliation_campaigns;

CREATE POLICY "Org members can create campaigns"
    ON public.reconciliation_campaigns
    FOR INSERT
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        AND EXISTS (
            SELECT 1
            FROM public.properties p
            WHERE p.id = property_id
            AND p.organization_id = public.get_user_editor_organization_id()
        )
    );

CREATE POLICY "Org editors can update review campaigns"
    ON public.reconciliation_campaigns
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (
        organization_id = public.get_user_editor_organization_id()
        AND status IN ('finalized', 'in_review')
    );

CREATE POLICY "Org admins can approve or send campaigns"
    ON public.reconciliation_campaigns
    FOR UPDATE
    USING (organization_id = public.get_user_admin_organization_id())
    WITH CHECK (organization_id = public.get_user_admin_organization_id());

DROP POLICY IF EXISTS "org_members_gl_analysis" ON public.gl_analysis_results;
DROP POLICY IF EXISTS "org_members_gl_analysis_select" ON public.gl_analysis_results;
DROP POLICY IF EXISTS "org_members_gl_analysis_insert" ON public.gl_analysis_results;
DROP POLICY IF EXISTS "org_members_gl_analysis_update" ON public.gl_analysis_results;
DROP POLICY IF EXISTS "org_members_gl_analysis_delete" ON public.gl_analysis_results;

CREATE POLICY "org_members_gl_analysis_select"
    ON public.gl_analysis_results
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_gl_analysis_insert"
    ON public.gl_analysis_results
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "org_members_gl_analysis_update"
    ON public.gl_analysis_results
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "org_members_gl_analysis_delete"
    ON public.gl_analysis_results
    FOR DELETE
    USING (organization_id = public.get_user_editor_organization_id());

DROP POLICY IF EXISTS "org_members_capex_flags" ON public.capex_flags;
DROP POLICY IF EXISTS "org_members_capex_flags_select" ON public.capex_flags;
DROP POLICY IF EXISTS "org_members_capex_flags_insert" ON public.capex_flags;
DROP POLICY IF EXISTS "org_members_capex_flags_update" ON public.capex_flags;
DROP POLICY IF EXISTS "org_members_capex_flags_delete" ON public.capex_flags;

CREATE POLICY "org_members_capex_flags_select"
    ON public.capex_flags
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "org_members_capex_flags_insert"
    ON public.capex_flags
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "org_members_capex_flags_update"
    ON public.capex_flags
    FOR UPDATE
    USING (organization_id = public.get_user_editor_organization_id())
    WITH CHECK (organization_id = public.get_user_editor_organization_id());

CREATE POLICY "org_members_capex_flags_delete"
    ON public.capex_flags
    FOR DELETE
    USING (organization_id = public.get_user_editor_organization_id());
