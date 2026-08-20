-- Create the private reports bucket used for generated PDF report downloads.
-- Object names include the report namespace and organization folder:
-- reports/{organization_id}/{property_id}/{uuid}.pdf

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'reports',
    'reports',
    false,
    52428800,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Reports readable by org members" ON storage.objects;
DROP POLICY IF EXISTS "Reports uploadable by org editors" ON storage.objects;
DROP POLICY IF EXISTS "Reports deletable by org editors" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage reports" ON storage.objects;

CREATE POLICY "Reports readable by org members"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'reports'
        AND (storage.foldername(storage.objects.name))[1] = 'reports'
        AND (storage.foldername(storage.objects.name))[2] = public.get_user_organization_id()::text
    );

CREATE POLICY "Reports uploadable by org editors"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'reports'
        AND (storage.foldername(storage.objects.name))[1] = 'reports'
        AND (storage.foldername(storage.objects.name))[2] = public.get_user_editor_organization_id()::text
    );

CREATE POLICY "Reports deletable by org editors"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'reports'
        AND (storage.foldername(storage.objects.name))[1] = 'reports'
        AND (storage.foldername(storage.objects.name))[2] = public.get_user_editor_organization_id()::text
    );

CREATE POLICY "Service role can manage reports"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'reports')
    WITH CHECK (bucket_id = 'reports');
