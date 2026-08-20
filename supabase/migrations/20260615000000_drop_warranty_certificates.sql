-- Remove the E&O warranty certificate feature (legal-liability risk).
-- The CREATE migration (20260224100002_create_warranty_certificates.sql) stays in
-- history; this migration permanently drops the table, its RLS policies, indexes,
-- and trigger. The table removal cascades to dependent policies/indexes/trigger.

DROP TRIGGER IF EXISTS update_warranty_certificates_updated_at ON public.warranty_certificates;

DROP TABLE IF EXISTS public.warranty_certificates CASCADE;
