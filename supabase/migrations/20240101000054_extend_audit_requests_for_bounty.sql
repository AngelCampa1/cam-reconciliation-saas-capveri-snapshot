-- Migration: Extend Audit Requests for Bounty Hunter Billing
-- Description: Add bounty tracking fields and new status values for recovery lifecycle
-- Dependencies: 20240101000048_create_audit_requests.sql

-- Add new status values for bounty lifecycle
ALTER TYPE public.audit_request_status ADD VALUE 'recovery_identified';
ALTER TYPE public.audit_request_status ADD VALUE 'recovery_confirmed';
ALTER TYPE public.audit_request_status ADD VALUE 'invoiced';
ALTER TYPE public.audit_request_status ADD VALUE 'paid';

-- Add bounty tracking fields
ALTER TABLE public.audit_requests
ADD COLUMN billing_type VARCHAR(20) NOT NULL DEFAULT 'bounty'
    CHECK (billing_type IN ('bounty', 'subscription'));

ALTER TABLE public.audit_requests
ADD COLUMN confirmed_recovery NUMERIC(14, 2);

ALTER TABLE public.audit_requests
ADD COLUMN bounty_fee NUMERIC(14, 2);

-- Note: bounty_invoice_id references invoices table, added after invoices migration
ALTER TABLE public.audit_requests
ADD COLUMN bounty_invoice_id UUID;

ALTER TABLE public.audit_requests
ADD COLUMN recovery_confirmed_at TIMESTAMPTZ;

ALTER TABLE public.audit_requests
ADD COLUMN recovery_invoiced_at TIMESTAMPTZ;

-- Indexes for bounty queries
CREATE INDEX idx_audit_requests_billing_type ON public.audit_requests(billing_type);
CREATE INDEX idx_audit_requests_bounty_invoice ON public.audit_requests(bounty_invoice_id)
    WHERE bounty_invoice_id IS NOT NULL;

-- Comments
COMMENT ON COLUMN public.audit_requests.billing_type IS 'Billing model: bounty (20% of recovery) or subscription';
COMMENT ON COLUMN public.audit_requests.confirmed_recovery IS 'Confirmed recovery amount in dollars';
COMMENT ON COLUMN public.audit_requests.bounty_fee IS 'Calculated 20% bounty fee in dollars';
COMMENT ON COLUMN public.audit_requests.bounty_invoice_id IS 'FK to invoices for bounty fee invoice';
COMMENT ON COLUMN public.audit_requests.recovery_confirmed_at IS 'When recovery was confirmed by client';
COMMENT ON COLUMN public.audit_requests.recovery_invoiced_at IS 'When bounty invoice was generated';
