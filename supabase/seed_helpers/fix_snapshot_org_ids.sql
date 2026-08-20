-- Quick fix: Backfill organization_id for reconciliation_snapshots
-- Run this on an existing database to fix missing organization_id values

-- Show current state
DO $$
DECLARE
    total_count INTEGER;
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM reconciliation_snapshots;
    SELECT COUNT(*) INTO null_count FROM reconciliation_snapshots WHERE organization_id IS NULL;

    RAISE NOTICE 'Before fix:';
    RAISE NOTICE '  Total snapshots: %', total_count;
    RAISE NOTICE '  Snapshots with NULL organization_id: %', null_count;
END $$;

-- Backfill organization_id from properties table
UPDATE reconciliation_snapshots rs
SET organization_id = p.organization_id
FROM properties p
WHERE rs.property_id = p.id
AND rs.organization_id IS NULL;

-- Verify fix
DO $$
DECLARE
    total_count INTEGER;
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM reconciliation_snapshots;
    SELECT COUNT(*) INTO null_count FROM reconciliation_snapshots WHERE organization_id IS NULL;

    RAISE NOTICE '';
    RAISE NOTICE 'After fix:';
    RAISE NOTICE '  Total snapshots: %', total_count;
    RAISE NOTICE '  Snapshots with NULL organization_id: %', null_count;

    IF null_count = 0 THEN
        RAISE NOTICE '  SUCCESS: All snapshots now have organization_id set';
    ELSE
        RAISE WARNING '  WARNING: % snapshots still have NULL organization_id!', null_count;
    END IF;
END $$;
