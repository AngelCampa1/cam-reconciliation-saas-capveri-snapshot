-- ==============================================================================
-- Reset Manual Testing Data
-- ==============================================================================
--
-- WARNING: This script deletes ALL manual testing data from the database.
-- Development seed data (from seed.sql) is NOT affected.
--
-- This script is SAFE to run multiple times (idempotent).
--
-- Manual Testing Data Identification:
-- - Organizations: Names contain "Acme Property", "Beta Real", "Gamma", "Delta", "Epsilon"
-- - Users: Emails end with "@test.capveri.com" or contain tenant domains
-- - All related data cascades from these organizations
--
-- Usage:
--   psql -U postgres -h 127.0.0.1 -p 54322 -d postgres < supabase/seed_helpers/reset_manual_testing.sql
--
-- ==============================================================================

-- Disable triggers temporarily for faster deletion
SET session_replication_role = replica;

BEGIN;

-- Print starting message
DO $$
BEGIN
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'RESETTING MANUAL TESTING DATA';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- Delete in Dependency Order (children first, parents last)
-- ==============================================================================

-- Step 1: Delete Dispute System Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[1/20] Deleting dispute attachments...';
    DELETE FROM dispute_attachments
    WHERE dispute_id IN (
        SELECT id FROM disputes
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % dispute attachments', delete_count;

    RAISE NOTICE '[2/20] Deleting dispute comments...';
    DELETE FROM dispute_comments
    WHERE dispute_id IN (
        SELECT id FROM disputes
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % dispute comments', delete_count;

    RAISE NOTICE '[3/20] Deleting disputes...';
    DELETE FROM disputes
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % disputes', delete_count;
END $$;

-- Step 2: Delete Tenant Portal Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[4/20] Deleting tenant lease links...';
    DELETE FROM tenant_lease_links
    WHERE tenant_user_id IN (
        SELECT id FROM tenant_users
        WHERE email LIKE '%@retailstore.com'
           OR email LIKE '%@coffeeshop.com'
           OR email LIKE '%@salon.com'
           OR email LIKE '%@gym.com'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % tenant lease links', delete_count;

    RAISE NOTICE '[5/20] Deleting tenant invitations...';
    DELETE FROM tenant_invitations
    WHERE email LIKE '%@test.capveri.com'
       OR email LIKE '%@retailstore.com'
       OR email LIKE '%@coffeeshop.com'
       OR email LIKE '%@salon.com'
       OR email LIKE '%@gym.com';
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % tenant invitations', delete_count;

    RAISE NOTICE '[6/20] Deleting tenant users...';
    DELETE FROM tenant_users
    WHERE email LIKE '%@retailstore.com'
       OR email LIKE '%@coffeeshop.com'
       OR email LIKE '%@salon.com'
       OR email LIKE '%@gym.com';
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % tenant users', delete_count;
END $$;

-- Step 3: Delete Documents and OCR Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[7/20] Deleting documents...';
    DELETE FROM documents
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % documents', delete_count;
END $$;

-- Step 4: Delete Reconciliation and Calculation Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[8/20] Deleting reconciliation snapshots...';
    DELETE FROM reconciliation_snapshots
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % reconciliation snapshots', delete_count;

    RAISE NOTICE '[9/20] Deleting calculation jobs...';
    DELETE FROM calculation_jobs
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % calculation jobs', delete_count;
END $$;

-- Step 5: Delete GL Entries and Import Batches
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[10/20] Deleting GL entries...';
    DELETE FROM gl_entries
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % GL entries', delete_count;

    RAISE NOTICE '[11/20] Deleting import batches...';
    DELETE FROM import_batches
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % import batches', delete_count;
END $$;

-- Step 6: Delete Pool Configuration
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[12/20] Deleting pool allocations...';
    DELETE FROM pool_allocations
    WHERE source_pool_id IN (
        SELECT id FROM expense_pools
        WHERE property_id IN (
            SELECT id FROM properties
            WHERE organization_id IN (
                SELECT id FROM organizations
                WHERE name LIKE '%Acme Property%'
                   OR name LIKE '%Beta Real%'
                   OR name LIKE '%Gamma%'
                   OR name LIKE '%Delta%'
                   OR name LIKE '%Epsilon%'
            )
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % pool allocations', delete_count;

    RAISE NOTICE '[13/20] Deleting pool mappings...';
    DELETE FROM pool_mappings
    WHERE expense_pool_id IN (
        SELECT id FROM expense_pools
        WHERE property_id IN (
            SELECT id FROM properties
            WHERE organization_id IN (
                SELECT id FROM organizations
                WHERE name LIKE '%Acme Property%'
                   OR name LIKE '%Beta Real%'
                   OR name LIKE '%Gamma%'
                   OR name LIKE '%Delta%'
                   OR name LIKE '%Epsilon%'
            )
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % pool mappings', delete_count;

    RAISE NOTICE '[14/20] Deleting expense pools...';
    DELETE FROM expense_pools
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % expense pools', delete_count;
END $$;

-- Step 7: Delete Leases and Units
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[15/20] Deleting leases...';
    DELETE FROM leases
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % leases', delete_count;

    RAISE NOTICE '[16/20] Deleting units...';
    DELETE FROM units
    WHERE property_id IN (
        SELECT id FROM properties
        WHERE organization_id IN (
            SELECT id FROM organizations
            WHERE name LIKE '%Acme Property%'
               OR name LIKE '%Beta Real%'
               OR name LIKE '%Gamma%'
               OR name LIKE '%Delta%'
               OR name LIKE '%Epsilon%'
        )
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % units', delete_count;

    RAISE NOTICE '[17/20] Deleting properties...';
    DELETE FROM properties
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % properties', delete_count;
END $$;

-- Step 8: Delete Billing Data
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    RAISE NOTICE '[18/20] Deleting invoices...';
    DELETE FROM invoices
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % invoices', delete_count;

    RAISE NOTICE '[19/20] Deleting subscriptions...';
    DELETE FROM subscriptions
    WHERE organization_id IN (
        SELECT id FROM organizations
        WHERE name LIKE '%Acme Property%'
           OR name LIKE '%Beta Real%'
           OR name LIKE '%Gamma%'
           OR name LIKE '%Delta%'
           OR name LIKE '%Epsilon%'
    );
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % subscriptions', delete_count;
END $$;

-- Step 9: Delete Users (public.users and auth.users)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
    user_ids UUID[];
BEGIN
    RAISE NOTICE '[20/20] Deleting users...';

    -- Collect user IDs first
    SELECT ARRAY_AGG(id) INTO user_ids
    FROM users
    WHERE email LIKE '%@test.capveri.com'
       OR email LIKE '%@retailstore.com'
       OR email LIKE '%@coffeeshop.com'
       OR email LIKE '%@salon.com'
       OR email LIKE '%@gym.com';

    -- Delete from public.users
    DELETE FROM users
    WHERE email LIKE '%@test.capveri.com'
       OR email LIKE '%@retailstore.com'
       OR email LIKE '%@coffeeshop.com'
       OR email LIKE '%@salon.com'
       OR email LIKE '%@gym.com';
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % user profiles (public.users)', delete_count;

    -- Delete from auth.users
    IF user_ids IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = ANY(user_ids);
        GET DIAGNOSTICS delete_count = ROW_COUNT;
        RAISE NOTICE '   Deleted % auth users (auth.users)', delete_count;
    END IF;
END $$;

-- Step 10: Delete Organizations (final step)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    delete_count INT;
BEGIN
    DELETE FROM organizations
    WHERE name LIKE '%Acme Property%'
       OR name LIKE '%Beta Real%'
       OR name LIKE '%Gamma%'
       OR name LIKE '%Delta%'
       OR name LIKE '%Epsilon%';
    GET DIAGNOSTICS delete_count = ROW_COUNT;
    RAISE NOTICE '   Deleted % organizations', delete_count;
END $$;

-- Print completion message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE 'MANUAL TESTING DATA RESET COMPLETE';
    RAISE NOTICE '==============================================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'All manual testing data has been removed from the database.';
    RAISE NOTICE 'You can now reload fresh test data using seed_manual_testing.sql';
    RAISE NOTICE '';
END $$;

COMMIT;

-- Re-enable triggers
SET session_replication_role = DEFAULT;
