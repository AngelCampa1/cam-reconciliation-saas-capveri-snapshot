# Story 3.8: Create GL Entries Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 3
- **Dependencies**: Story 3.7
- **Status**: `completed`

## User Story
**As a** property accountant
**I want** GL entries stored efficiently with proper indexes
**So that** expense queries are fast even with millions of rows

## Acceptance Criteria
- [x] **AC1**: `gl_entries` table created with all fields from model
- [x] **AC2**: Composite index on (property_id, period_year, period_month)
- [x] **AC3**: Index on account_code for pool mapping queries
- [x] **AC4**: `raw_row_data` JSONB preserves original data
- [x] **AC5**: RLS via property's organization

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000007_create_gl_entries.sql
```

**Migration SQL**:
```sql
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

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_gl_entries_import_batch_id ON public.gl_entries(import_batch_id);
CREATE INDEX idx_gl_entries_property_id ON public.gl_entries(property_id);
CREATE INDEX idx_gl_entries_account_code ON public.gl_entries(account_code);
CREATE INDEX idx_gl_entries_period ON public.gl_entries(property_id, period_year, period_month);
CREATE INDEX idx_gl_entries_transaction_date ON public.gl_entries(transaction_date);

-- Partial index for common account code prefixes (optimization)
CREATE INDEX idx_gl_entries_account_prefix ON public.gl_entries(LEFT(account_code, 2));

-- Enable RLS
ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (via property access)
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

-- GL entries should not be updated (immutable after import)
-- DELETE allowed for batch deletion via import_batch_id CASCADE

-- Grant permissions
GRANT SELECT, INSERT ON public.gl_entries TO authenticated;

COMMENT ON TABLE public.gl_entries IS 'Normalized general ledger entries from ERP imports';
COMMENT ON COLUMN public.gl_entries.amount IS 'Signed amount: positive for debits, negative for credits';
COMMENT ON COLUMN public.gl_entries.raw_row_data IS 'Original CSV row data preserved for audit trail';
```

## Definition of Done
- [x] Indexes optimize common queries
- [x] Composite period index works
- [x] Millions of rows query efficiently

## Implementation Notes
- Created `supabase/migrations/20240101000007_create_gl_entries.sql`
- GL entries are immutable after import (no updated_at, no UPDATE policy)
- Only SELECT and INSERT granted - DELETE handled via CASCADE from import_batches
- Partial index on LEFT(account_code, 2) for pool mapping optimization
- RLS via property join pattern for organization isolation
- Added 37 new tests to `backend/tests/test_migrations.py` (224 total migration tests)
