-- Migration: Fix Reconciliation Snapshots RLS Circular Dependency
-- Description: Add organization_id to reconciliation_snapshots and use direct RLS
-- Dependencies: 20240101000036_add_manual_overrides_to_snapshots.sql

-- Problem: reconciliation_snapshots RLS checks properties table, which may check leases,
-- which checks properties again → circular dependency

-- Solution: Add organization_id column to reconciliation_snapshots for direct RLS check

-- Step 1: Add organization_id column (populated via trigger)
ALTER TABLE public.reconciliation_snapshots
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Step 2: Backfill organization_id for existing records
UPDATE public.reconciliation_snapshots rs
SET organization_id = p.organization_id
FROM public.properties p
WHERE rs.property_id = p.id
AND rs.organization_id IS NULL;

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_snapshots_organization_id
ON public.reconciliation_snapshots(organization_id);

-- Step 4: Drop existing RLS policies on reconciliation_snapshots
DROP POLICY IF EXISTS "Snapshots are viewable by organization members and linked tenants" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots are insertable by organization members" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots are updatable by organization members" ON public.reconciliation_snapshots;
DROP POLICY IF EXISTS "Snapshots are deletable by organization admins" ON public.reconciliation_snapshots;

-- Step 5: Create simple RLS policies using organization_id directly (no joins!)
CREATE POLICY "Snapshots viewable by org"
ON public.reconciliation_snapshots
FOR SELECT
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Snapshots insertable by org"
ON public.reconciliation_snapshots
FOR INSERT
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Snapshots updatable by org"
ON public.reconciliation_snapshots
FOR UPDATE
USING (organization_id = public.get_user_organization_id())
WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Snapshots deletable by org admins"
ON public.reconciliation_snapshots
FOR DELETE
USING (
    organization_id = public.get_user_organization_id()
    AND EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND role IN ('owner', 'admin')
    )
);

-- Step 6: Create trigger to auto-populate organization_id on INSERT
CREATE OR REPLACE FUNCTION public.set_snapshot_organization_id()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-populate organization_id from property when inserting
    IF NEW.organization_id IS NULL THEN
        -- Use SECURITY DEFINER on this trigger function to bypass RLS
        SELECT organization_id INTO NEW.organization_id
        FROM public.properties
        WHERE id = NEW.property_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_set_snapshot_organization_id ON public.reconciliation_snapshots;

CREATE TRIGGER trigger_set_snapshot_organization_id
BEFORE INSERT ON public.reconciliation_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_snapshot_organization_id();

-- Documentation
COMMENT ON COLUMN public.reconciliation_snapshots.organization_id IS
    'Organization ID for RLS. Auto-populated from property.organization_id via trigger to avoid circular dependency in RLS policies.';

COMMENT ON TRIGGER trigger_set_snapshot_organization_id ON public.reconciliation_snapshots IS
    'Auto-populates organization_id from property before insert to enable simple RLS policies without joins.';
