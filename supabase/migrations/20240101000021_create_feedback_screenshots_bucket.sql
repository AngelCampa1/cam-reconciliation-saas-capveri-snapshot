-- Migration: Create feedback-screenshots storage bucket
-- Description: Creates storage bucket for feedback screenshots with RLS policies
-- Story: 23.3

-- Create feedback-screenshots bucket (public for viewing)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'feedback-screenshots',
    'feedback-screenshots',
    true,
    5242880, -- 5MB in bytes
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow authenticated users to upload feedback screenshots to their org folder
CREATE POLICY "Users can upload feedback screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = 'feedback'
    AND (storage.foldername(name))[2] = (
        SELECT organization_id::text
        FROM users
        WHERE id = auth.uid()
    )
);

-- Policy: Allow public read for feedback screenshots (for viewing in feedback admin dashboard)
CREATE POLICY "Public read for feedback screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'feedback-screenshots');

-- Policy: Allow org admins to delete feedback screenshots from their org
CREATE POLICY "Admins can delete org feedback screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'feedback-screenshots'
    AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'admin'
        AND users.organization_id::text = (storage.foldername(name))[2]
    )
);
