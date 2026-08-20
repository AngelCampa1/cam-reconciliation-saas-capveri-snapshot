-- ==============================================================================
-- CapVeri.com - PRODUCTION TEST Data Cleanup
-- ==============================================================================
--
-- PURPOSE: Remove all [PROD-TEST] data from production
--
-- IDENTIFIES TEST DATA BY:
-- - Organization names starting with '[PROD-TEST]'
-- - Property names starting with '[PROD-TEST]'
-- - User emails starting with 'prodtest+'
-- - UUIDs matching 'ffffffff-ffff-ffff-ffff-ffffffff%' pattern
-- - Stripe IDs containing 'prodtest_'
--
-- SAFE TO RUN: Only deletes data matching test patterns
--
-- ==============================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  PRODUCTION TEST DATA CLEANUP                                ║';
    RAISE NOTICE '║  Removing all [PROD-TEST] prefixed data                      ║';
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
END $$;

-- Store IDs for cascading deletes
CREATE TEMP TABLE prod_test_org_ids AS
SELECT id FROM organizations WHERE name LIKE '[PROD-TEST]%';

CREATE TEMP TABLE prod_test_property_ids AS
SELECT id FROM properties WHERE name LIKE '[PROD-TEST]%';

CREATE TEMP TABLE prod_test_user_ids AS
SELECT id FROM users WHERE email LIKE 'prodtest+%';

CREATE TEMP TABLE prod_test_tenant_user_ids AS
SELECT id FROM tenant_users WHERE contact_email LIKE 'prodtest+%';

-- ==============================================================================
-- DELETE IN REVERSE DEPENDENCY ORDER
-- ==============================================================================

-- 1. Invoices
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM invoices WHERE organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[1/14] Deleted % invoices', deleted_count;
END $$;

-- 2. Subscriptions
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM subscriptions
    WHERE organization_id IN (SELECT id FROM prod_test_org_ids)
       OR stripe_customer_id LIKE 'cus_prodtest_%';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[2/14] Deleted % subscriptions', deleted_count;
END $$;

-- 3. Disputes (via tenant_user_id)
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM disputes
    WHERE tenant_user_id IN (SELECT id FROM prod_test_tenant_user_ids)
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[3/14] Deleted % disputes', deleted_count;
END $$;

-- 4. Tenant lease links
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tenant_lease_links
    WHERE tenant_user_id IN (SELECT id FROM prod_test_tenant_user_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[4/14] Deleted % tenant lease links', deleted_count;
END $$;

-- 5. Tenant users
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM tenant_users
    WHERE contact_email LIKE 'prodtest+%'
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[5/14] Deleted % tenant users', deleted_count;
END $$;

-- 6. Reconciliation snapshots
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM reconciliation_snapshots
    WHERE property_id IN (SELECT id FROM prod_test_property_ids)
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[6/14] Deleted % reconciliation snapshots', deleted_count;
END $$;

-- 7. GL entries
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM gl_entries
    WHERE property_id IN (SELECT id FROM prod_test_property_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[7/14] Deleted % GL entries', deleted_count;
END $$;

-- 8. Import batches
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM import_batches
    WHERE property_id IN (SELECT id FROM prod_test_property_ids)
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[8/14] Deleted % import batches', deleted_count;
END $$;

-- 9. Pool mappings
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM pool_mappings
    WHERE expense_pool_id IN (
        SELECT id FROM expense_pools WHERE property_id IN (SELECT id FROM prod_test_property_ids)
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[9/14] Deleted % pool mappings', deleted_count;
END $$;

-- 10. Expense pools
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM expense_pools WHERE property_id IN (SELECT id FROM prod_test_property_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[10/14] Deleted % expense pools', deleted_count;
END $$;

-- 11. Leases
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM leases
    WHERE tenant_name LIKE '[PROD-TEST]%'
       OR property_id IN (SELECT id FROM prod_test_property_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[11/14] Deleted % leases', deleted_count;
END $$;

-- 12. Units
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM units WHERE property_id IN (SELECT id FROM prod_test_property_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[12/14] Deleted % units', deleted_count;
END $$;

-- 13. Properties
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM properties
    WHERE name LIKE '[PROD-TEST]%'
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[13/14] Deleted % properties', deleted_count;
END $$;

-- 14. User profiles
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM users
    WHERE email LIKE 'prodtest+%'
       OR organization_id IN (SELECT id FROM prod_test_org_ids);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '[14/14] Deleted % user profiles', deleted_count;
END $$;

-- 15. Auth users
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM auth.users WHERE email LIKE 'prodtest+%';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '        Deleted % auth users', deleted_count;
END $$;

-- 16. Organizations
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM organizations WHERE name LIKE '[PROD-TEST]%';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '        Deleted % organizations', deleted_count;
END $$;

-- Cleanup temp tables
DROP TABLE IF EXISTS prod_test_org_ids;
DROP TABLE IF EXISTS prod_test_property_ids;
DROP TABLE IF EXISTS prod_test_user_ids;
DROP TABLE IF EXISTS prod_test_tenant_user_ids;

-- Verification
DO $$
DECLARE
    remaining_orgs INTEGER;
    remaining_users INTEGER;
    remaining_props INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_orgs FROM organizations WHERE name LIKE '[PROD-TEST]%';
    SELECT COUNT(*) INTO remaining_users FROM users WHERE email LIKE 'prodtest+%';
    SELECT COUNT(*) INTO remaining_props FROM properties WHERE name LIKE '[PROD-TEST]%';

    RAISE NOTICE '';
    RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
    IF remaining_orgs = 0 AND remaining_users = 0 AND remaining_props = 0 THEN
        RAISE NOTICE '║  CLEANUP COMPLETE - All test data removed                    ║';
    ELSE
        RAISE NOTICE '║  WARNING: Some test data may remain                          ║';
    END IF;
    RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
END $$;

COMMIT;
