-- F-024: make past exports re-downloadable.
-- Store the storage object path for each export so the download endpoint can
-- mint a fresh signed URL. Older rows (created before this migration) keep a
-- NULL storage_path and are reported as no longer downloadable.
ALTER TABLE public.export_history
    ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN public.export_history.storage_path IS
    'Object key in the private "reports" storage bucket. NULL for legacy rows '
    'recorded before persisted-file support (not re-downloadable).';

-- Broaden the reports bucket so every export format (not just PDF) can be
-- persisted for re-download. The bucket stays private; downloads are served
-- via short-lived signed URLs minted server-side. Upsert (rather than a bare
-- UPDATE) so the bucket exists with the correct settings even if this migration
-- runs against an environment where the create-bucket migration has not yet
-- materialised the row.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'reports',
    'reports',
    false,
    104857600,
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'text/plain',
        'application/zip'
    ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
