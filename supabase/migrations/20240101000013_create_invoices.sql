-- Migration: Create Invoices Table
-- Description: Billing invoices synced from Stripe for payment history
-- Dependencies: 20240101000012_create_subscriptions.sql

-- Create invoice status enum
CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'open',
    'paid',
    'void',
    'uncollectible'
);

-- Create invoices table
CREATE TABLE public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(255),
    amount_due NUMERIC(12, 2) NOT NULL CHECK (amount_due >= 0),
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'usd',
    status public.invoice_status NOT NULL DEFAULT 'draft',
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: period_end must be after period_start
    CONSTRAINT invoice_period_valid CHECK (period_end > period_start),
    -- Constraint: amount_paid cannot exceed amount_due
    CONSTRAINT amount_paid_not_exceeding CHECK (amount_paid <= amount_due)
);

-- Indexes
CREATE UNIQUE INDEX idx_invoices_stripe_invoice_id
    ON public.invoices(stripe_invoice_id)
    WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX idx_invoices_organization_id ON public.invoices(organization_id);
CREATE INDEX idx_invoices_subscription_id ON public.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_created_at ON public.invoices(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their organization's invoices
CREATE POLICY "Invoices are viewable by organization members"
    ON public.invoices
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

-- Only service role can INSERT (webhook creates invoices)
CREATE POLICY "Invoices are insertable by service role"
    ON public.invoices
    FOR INSERT
    WITH CHECK (FALSE);  -- Deny all direct inserts, use service role

-- Only service role can UPDATE (webhook updates invoices)
CREATE POLICY "Invoices are updatable by service role"
    ON public.invoices
    FOR UPDATE
    USING (FALSE);  -- Deny all direct updates, use service role

-- No DELETE policy - invoices are immutable financial records

-- Grant permissions
GRANT SELECT ON public.invoices TO authenticated;
GRANT INSERT, UPDATE ON public.invoices TO service_role;

COMMENT ON TABLE public.invoices IS 'Billing invoices synced from Stripe';
COMMENT ON COLUMN public.invoices.id IS 'Primary key UUID';
COMMENT ON COLUMN public.invoices.organization_id IS 'FK to organizations';
COMMENT ON COLUMN public.invoices.subscription_id IS 'FK to subscriptions, nullable for one-time invoices';
COMMENT ON COLUMN public.invoices.stripe_invoice_id IS 'Stripe invoice ID (in_xxx)';
COMMENT ON COLUMN public.invoices.amount_due IS 'Total amount due in smallest currency unit';
COMMENT ON COLUMN public.invoices.amount_paid IS 'Amount paid so far';
COMMENT ON COLUMN public.invoices.currency IS 'ISO 4217 currency code (lowercase)';
COMMENT ON COLUMN public.invoices.status IS 'Invoice lifecycle status';
COMMENT ON COLUMN public.invoices.period_start IS 'Start of billing period';
COMMENT ON COLUMN public.invoices.period_end IS 'End of billing period';
COMMENT ON COLUMN public.invoices.due_date IS 'Payment due date';
COMMENT ON COLUMN public.invoices.paid_at IS 'When payment was received';
COMMENT ON COLUMN public.invoices.pdf_url IS 'Stripe-hosted invoice PDF URL';
COMMENT ON COLUMN public.invoices.created_at IS 'When the invoice was created';
COMMENT ON COLUMN public.invoices.updated_at IS 'When the invoice was last updated';
COMMENT ON TYPE public.invoice_status IS 'Invoice lifecycle states: draft, open, paid, void, uncollectible';
