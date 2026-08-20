-- Harden storage buckets that may contain tenant documents or app screenshots.
-- Public bucket/object access bypasses application authorization when an object
-- path leaks, so access must flow through authenticated policies or signed URLs.

UPDATE storage.buckets
SET public = false
WHERE id IN ('documents', 'feedback-screenshots');

DROP POLICY IF EXISTS "Public read for documents (E2E testing)"
ON storage.objects;

DROP POLICY IF EXISTS "Public read for feedback screenshots"
ON storage.objects;

DROP POLICY IF EXISTS "Org users can read feedback screenshots"
ON storage.objects;

CREATE POLICY "Org users can read feedback screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = 'feedback'
    AND (storage.foldername(name))[2] = (
        SELECT organization_id::text
        FROM public.users
        WHERE id = (select auth.uid())
    )
);
