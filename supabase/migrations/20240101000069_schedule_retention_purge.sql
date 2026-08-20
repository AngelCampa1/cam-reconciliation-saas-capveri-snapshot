-- Migration 069: Schedule weekly retention purge via pg_cron
--
-- PREREQUISITE: Enable pg_cron in Supabase Dashboard -> Database -> Extensions
-- before applying this migration.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'capveri-retention-purge',
    '0 2 * * 0',
    'SELECT public.run_retention_purge()'
);
