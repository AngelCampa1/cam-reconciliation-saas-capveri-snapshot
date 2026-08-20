-- Fixes CAPVERI-BACKEND-1K: exit-intent popup captures email-only leads,
-- so first_name must be nullable.
ALTER TABLE content_leads ALTER COLUMN first_name DROP NOT NULL;
