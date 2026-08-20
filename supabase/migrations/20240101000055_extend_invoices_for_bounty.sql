-- Migration: Extend Invoices for Bounty Hunter Billing
-- Description: Add invoice_type enum and bounty-specific fields
-- Dependencies: 20240101000013_create_invoices.sql, 20240101000054_extend_audit_requests_for_bounty.sql

-- Create invoice type enum
CREATE TYPE public.invoice_type AS ENUM ('subscription', 'bounty');

-- Add invoice_type column with default for existing records
ALTER TABLE public.invoices
ADD COLUMN invoice_type public.invoice_type NOT NULL DEFAULT 'subscription';

-- Add audit_request_id for bounty invoices
ALTER TABLE public.invoices
ADD COLUMN audit_request_id UUID REFERENCES public.audit_requests(id);

-- Add recovery_amount for bounty invoices (the amount recovery was based on)
ALTER TABLE public.invoices
ADD COLUMN recovery_amount NUMERIC(14, 2);

-- Indexes for bounty invoice queries
CREATE INDEX idx_invoices_type ON public.invoices(invoice_type);
CREATE INDEX idx_invoices_audit_request ON public.invoices(audit_request_id)
    WHERE audit_request_id IS NOT NULL;

-- Now add the FK constraint from audit_requests.bounty_invoice_id to invoices
ALTER TABLE public.audit_requests
ADD CONSTRAINT fk_audit_requests_bounty_invoice
    FOREIGN KEY (bounty_invoice_id) REFERENCES public.invoices(id);

-- RLS: Allow viewing bounty invoices for the associated audit request's organization
-- (The existing org-based policy handles subscription invoices)
-- Bounty invoices will use the audit_request's organization_id via the audit_request table

-- Comments
COMMENT ON TYPE public.invoice_type IS 'Invoice type: subscription (recurring) or bounty (one-time recovery fee)';
COMMENT ON COLUMN public.invoices.invoice_type IS 'Type of invoice: subscription or bounty';
COMMENT ON COLUMN public.invoices.audit_request_id IS 'FK to audit_requests for bounty invoices';
COMMENT ON COLUMN public.invoices.recovery_amount IS 'Confirmed recovery amount that bounty fee is calculated from';
