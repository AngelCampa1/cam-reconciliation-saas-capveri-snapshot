-- Force PostgREST to refresh its schema cache after the subscriptions.tier
-- migration. Production reported PGRST204 for subscriptions.tier even though
-- the column exists in Postgres.

NOTIFY pgrst, 'reload schema';
