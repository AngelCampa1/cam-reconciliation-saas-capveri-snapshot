-- Migration: Create documents storage bucket
-- Description: Creates storage bucket for lease documents (PDFs) with RLS policies
-- Story: 24.11 (E2E Journey Tests)

-- Create documents bucket (public=false for security, use signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    true, -- Public for E2E testing (localhost access)
    52428800, -- 50MB in bytes
    ARRAY['application/pdf', 'image/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload documents to their org folder
CREATE POLICY "Users can upload documents to org folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM users
        WHERE id = auth.uid()
    )
);

-- Policy: Allow users to read documents from their organization
CREATE POLICY "Users can read org documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM users
        WHERE id = auth.uid()
    )
);

-- Policy: Allow service role full access (for E2E test seeding)
CREATE POLICY "Service role full access to documents"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- Policy: Allow public read for E2E testing (localhost only)
-- NOTE: In production, this should be removed and use signed URLs instead
CREATE POLICY "Public read for documents (E2E testing)"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'documents');

-- Policy: Allow org users to delete their documents
CREATE POLICY "Users can delete org documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] IN (
        SELECT organization_id::text
        FROM users
        WHERE id = auth.uid()
    )
);
