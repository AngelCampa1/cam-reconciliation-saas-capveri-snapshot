-- Migration: Create GL Entries Table
-- Description: Normalized general ledger entries from ERP imports for expense reconciliation
-- Dependencies: 20240101000006_create_import_batches.sql

-- Create gl_entries table
CREATE TABLE public.gl_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

    -- GL data fields
    account_code VARCHAR(50) NOT NULL,
    account_description VARCHAR(255) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,  -- Signed: positive=debit, negative=credit
    transaction_date DATE NOT NULL,
    period_year INTEGER NOT NULL CHECK (period_year >= 1990 AND period_year <= 2100),
    period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
    vendor_name VARCHAR(255),
    description VARCHAR(1000),

    -- Preserve original data for audit trail
    raw_row_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Only created_at - GL entries are immutable after import
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes for common queries
CREATE INDEX idx_gl_entries_import_batch_id ON public.gl_entries(import_batch_id);
CREATE INDEX idx_gl_entries_property_id ON public.gl_entries(property_id);
CREATE INDEX idx_gl_entries_account_code ON public.gl_entries(account_code);
CREATE INDEX idx_gl_entries_transaction_date ON public.gl_entries(transaction_date);

-- Composite index for period-based queries (most common query pattern)
CREATE INDEX idx_gl_entries_period ON public.gl_entries(property_id, period_year, period_month);

-- Partial index for common account code prefixes (optimization for pool mapping)
CREATE INDEX idx_gl_entries_account_prefix ON public.gl_entries((LEFT(account_code, 2)));

-- Enable Row Level Security
ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policy: GL entries are viewable via property organization access
CREATE POLICY "GL entries are viewable via property access"
    ON public.gl_entries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- RLS Policy: GL entries are insertable via property organization access
CREATE POLICY "GL entries are insertable via property access"
    ON public.gl_entries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.properties
            WHERE id = property_id
            AND organization_id = public.get_user_organization_id()
        )
    );

-- Note: GL entries are immutable after import
-- No UPDATE policy - entries should never be modified
-- DELETE is handled via CASCADE from import_batches table

-- Grant permissions to Supabase roles (SELECT and INSERT only - immutable)
GRANT SELECT, INSERT ON public.gl_entries TO authenticated;

-- Add documentation comments
COMMENT ON TABLE public.gl_entries IS 'Normalized general ledger entries from ERP imports for CAM reconciliation';
COMMENT ON COLUMN public.gl_entries.id IS 'Unique identifier for the GL entry';
COMMENT ON COLUMN public.gl_entries.import_batch_id IS 'Import batch this entry belongs to (for batch deletion)';
COMMENT ON COLUMN public.gl_entries.property_id IS 'Property this GL entry is associated with';
COMMENT ON COLUMN public.gl_entries.account_code IS 'GL account code (e.g., 6000, 6100-001)';
COMMENT ON COLUMN public.gl_entries.account_description IS 'Description of the GL account';
COMMENT ON COLUMN public.gl_entries.amount IS 'Signed amount: positive for debits (expenses), negative for credits';
COMMENT ON COLUMN public.gl_entries.transaction_date IS 'Date of the transaction';
COMMENT ON COLUMN public.gl_entries.period_year IS 'Fiscal year for the entry (1990-2100)';
COMMENT ON COLUMN public.gl_entries.period_month IS 'Fiscal month for the entry (1-12)';
COMMENT ON COLUMN public.gl_entries.vendor_name IS 'Name of the vendor (if applicable)';
COMMENT ON COLUMN public.gl_entries.description IS 'Transaction description or memo';
COMMENT ON COLUMN public.gl_entries.raw_row_data IS 'Original CSV row data preserved for audit trail';
COMMENT ON COLUMN public.gl_entries.created_at IS 'When the GL entry was imported';
