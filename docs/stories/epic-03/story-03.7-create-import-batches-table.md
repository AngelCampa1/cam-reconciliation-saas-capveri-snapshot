# Story 3.7: Create Import Batches Table

## Story Info
- **Epic**: Database Schema & Multi-Tenancy
- **Estimated Hours**: 2
- **Dependencies**: Story 3.4
- **Status**: `completed`

## User Story
**As a** data importer
**I want** import batches tracked with status and deduplication
**So that** I don't accidentally import the same file twice

## Acceptance Criteria
- [x] **AC1**: `import_batches` table created with:
  - `id`, `organization_id`, `property_id`
  - `file_name`, `file_hash` (SHA256 for dedup)
  - `source_system` (yardi, mri, generic)
  - `status` (pending, processing, completed, failed)
  - `row_count`, `error_count`
  - `error_log` JSONB
  - Timestamps
- [x] **AC2**: Unique constraint on (organization_id, file_hash)
- [x] **AC3**: Index on status for queue processing

## Technical Specifications

**File to Create**:
```
supabase/migrations/
└── 20240101000006_create_import_batches.sql
```

**Migration SQL**:
```sql
-- Create import_batches table
CREATE TABLE public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_hash CHAR(64) NOT NULL,  -- SHA256 hex string
    source_system VARCHAR(50) NOT NULL
        CHECK (source_system IN ('yardi', 'mri', 'generic')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    row_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_log JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate imports within an organization
    CONSTRAINT unique_file_per_org UNIQUE (organization_id, file_hash)
);

-- Indexes
CREATE INDEX idx_import_batches_organization_id ON public.import_batches(organization_id);
CREATE INDEX idx_import_batches_property_id ON public.import_batches(property_id);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);
CREATE INDEX idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER update_import_batches_updated_at
    BEFORE UPDATE ON public.import_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Import batches are viewable by organization members"
    ON public.import_batches
    FOR SELECT
    USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Import batches are insertable by organization members"
    ON public.import_batches
    FOR INSERT
    WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Import batches are updatable by organization members"
    ON public.import_batches
    FOR UPDATE
    USING (organization_id = public.get_user_organization_id());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.import_batches TO authenticated;

COMMENT ON TABLE public.import_batches IS 'Tracks data import jobs with deduplication';
COMMENT ON COLUMN public.import_batches.file_hash IS 'SHA256 hash of file contents for deduplication';
```

## Definition of Done
- [x] Deduplication constraint works
- [x] Status tracking enabled
- [x] Error log captures issues

## Implementation Notes
- Created `supabase/migrations/20240101000006_create_import_batches.sql`
- file_hash is CHAR(64) for SHA256 hex string
- Unique constraint `unique_file_per_org` prevents duplicate imports
- error_log JSONB stores array of error details for failed rows
- RLS: direct organization_id check (simpler pattern than property-based)
- Added source_system index for filtering by import source
- Added 36 new tests to `backend/tests/test_migrations.py` (187 total migration tests)
