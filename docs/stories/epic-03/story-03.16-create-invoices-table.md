# Story 3.16: Create Invoices Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.15 (Subscriptions Table)
- **Status**: `completed`

## User Story
**As a** billing system
**I want** invoice records stored for payment history
**So that** organizations can view their billing history and download invoices

## Acceptance Criteria
- [x] **AC1**: `invoices` table created with fields:
  - `id`, `organization_id` (FK), `subscription_id` (FK nullable)
  - `stripe_invoice_id` (unique, indexed)
  - `amount_due`, `amount_paid` (NUMERIC)
  - `currency` (default 'usd')
  - `status` (enum: draft, open, paid, void, uncollectible)
  - `period_start`, `period_end` (TIMESTAMPTZ)
  - `due_date`, `paid_at` (TIMESTAMPTZ nullable)
  - `pdf_url` (nullable)
  - Timestamps
- [x] **AC2**: RLS: organization members can view their invoices
- [x] **AC3**: Only service role can INSERT/UPDATE (webhook creates invoices)
- [x] **AC4**: Indexes on stripe_invoice_id, organization_id, status

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000013_create_invoices.sql
```

**Migration SQL**:
```sql
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
COMMENT ON COLUMN public.invoices.stripe_invoice_id IS 'Stripe invoice ID (in_xxx)';
COMMENT ON COLUMN public.invoices.pdf_url IS 'Stripe-hosted invoice PDF URL';
```

## Definition of Done
- [x] All columns created with correct types
- [x] Invoice status enum created
- [x] RLS restricts view access to organization members
- [x] Service role required for write operations
- [x] Constraints validate amounts and periods

## Implementation Notes
- Invoices are write-protected from users (Stripe webhooks only)
- No DELETE policy - invoices are immutable financial records
- PDF URL stored for direct download from Stripe
- Amount fields use NUMERIC(12,2) for financial precision
