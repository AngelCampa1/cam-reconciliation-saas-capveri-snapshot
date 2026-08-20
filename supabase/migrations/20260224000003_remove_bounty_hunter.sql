-- Migration: Remove Bounty Hunter System
-- The bounty hunter GTM model (20% of recovery) has been replaced by
-- "first audit is free". This migration removes all bounty-related infrastructure.

-- Step 1: Drop foreign keys
ALTER TABLE public.audit_requests DROP CONSTRAINT IF EXISTS fk_audit_requests_bounty_invoice;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS fk_invoices_audit_request;

-- Step 2: Drop bounty columns from audit_requests
ALTER TABLE public.audit_requests
  DROP COLUMN IF EXISTS billing_type,
  DROP COLUMN IF EXISTS confirmed_recovery,
  DROP COLUMN IF EXISTS bounty_fee,
  DROP COLUMN IF EXISTS bounty_invoice_id,
  DROP COLUMN IF EXISTS recovery_confirmed_at,
  DROP COLUMN IF EXISTS recovery_invoiced_at;

-- Step 3: Remove bounty status values (requires enum recreation in Postgres)
-- First remap any rows with bounty statuses to 'completed' to avoid cast failures
UPDATE public.audit_requests
  SET status = 'completed'
  WHERE status::text IN (
    'recovery_identified', 'recovery_confirmed', 'invoiced', 'paid'
  );

CREATE TYPE public.audit_request_status_new AS ENUM (
  'pending', 'contacted', 'scheduled', 'in_progress',
  'completed', 'converted', 'rejected'
);
ALTER TABLE public.audit_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.audit_requests
  ALTER COLUMN status TYPE public.audit_request_status_new
  USING status::text::public.audit_request_status_new;
ALTER TABLE public.audit_requests ALTER COLUMN status SET DEFAULT 'pending'::public.audit_request_status_new;
DROP TYPE public.audit_request_status;
ALTER TYPE public.audit_request_status_new RENAME TO audit_request_status;

-- Step 4: Drop bounty columns from invoices
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS invoice_type,
  DROP COLUMN IF EXISTS audit_request_id,
  DROP COLUMN IF EXISTS recovery_amount;

-- Step 5: Drop invoice_type enum
DROP TYPE IF EXISTS public.invoice_type;

-- Step 6: Drop orphaned indexes
DROP INDEX IF EXISTS idx_audit_requests_billing_type;
DROP INDEX IF EXISTS idx_audit_requests_bounty_invoice;
DROP INDEX IF EXISTS idx_invoices_invoice_type;
DROP INDEX IF EXISTS idx_invoices_audit_request_id;
