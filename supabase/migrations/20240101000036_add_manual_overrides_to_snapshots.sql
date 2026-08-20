-- Migration: Add manual_overrides column to reconciliation_snapshots
-- Purpose: Track manual cell edits separately from immutable calculation_trace
-- Created: 2025-12-31
-- Story: Epic 12 (Stories 12.3, 12.4) - Grid editing functionality

-- Add JSONB column to track manual cell edits
ALTER TABLE public.reconciliation_snapshots
ADD COLUMN manual_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add comment explaining structure
COMMENT ON COLUMN public.reconciliation_snapshots.manual_overrides IS
  'Tracks manual overrides by field name. Structure: {
    "field_name": {
      "value": "1234.56",
      "user_id": "uuid",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }';

-- Add GIN index for efficient JSONB queries
CREATE INDEX idx_reconciliation_snapshots_overrides
  ON public.reconciliation_snapshots USING GIN (manual_overrides);

-- Add comment to the index
COMMENT ON INDEX idx_reconciliation_snapshots_overrides IS
  'GIN index for manual_overrides JSONB queries';
