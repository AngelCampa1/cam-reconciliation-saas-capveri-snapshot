-- Force PostgREST to refresh its schema cache after legal_acceptances table
-- creation. Production reported PGRST205 for public.legal_acceptances.

NOTIFY pgrst, 'reload schema';
