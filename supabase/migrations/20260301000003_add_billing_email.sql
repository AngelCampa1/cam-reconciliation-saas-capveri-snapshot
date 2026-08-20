-- Migration: Add billing_email to organizations
-- Allows organizations to specify a separate billing contact email.
-- Falls back to the owner's auth email when NULL (handled in application layer).

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS billing_email TEXT;

COMMENT ON COLUMN public.organizations.billing_email IS
    'Optional billing contact email. When NULL, the owner''s auth email is used for Stripe receipts.';
