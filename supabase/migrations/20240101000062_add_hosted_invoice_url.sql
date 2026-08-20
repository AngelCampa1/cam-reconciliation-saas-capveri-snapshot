-- Migration: Add hosted_invoice_url to invoices
-- Description: Persist the Stripe hosted invoice URL so we can include it in 402 responses
-- Dependencies: 20240101000044_create_invoices.sql

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS hosted_invoice_url TEXT;

COMMENT ON COLUMN public.invoices.hosted_invoice_url IS 'Stripe hosted invoice URL for customer payment';
