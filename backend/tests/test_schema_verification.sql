-- ==============================================================================
-- Database Schema Verification Script
-- ==============================================================================
--
-- This script verifies that the database schema is complete and correctly
-- configured for multi-tenancy, security, and performance.
--
-- Run this script against a Supabase database to verify:
-- 1. All tables have organization_id (except auth tables and audit_log)
-- 2. All tables have RLS enabled
-- 3. All foreign keys are valid
-- 4. All indexes exist for query performance
-- 5. All JSONB columns have GIN indexes
-- 6. All constraints are enforced
--
-- Usage:
--   psql -d your_database -f test_schema_verification.sql
--
-- Expected: All queries should return 0 rows (no violations found)
-- ==============================================================================

\echo '======================================================================'
\echo 'Schema Verification Report'
\echo 'Started at:' `date`
\echo '======================================================================'
\echo ''

-- ==============================================================================
-- Test 1: Verify all tables have organization_id column
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 1: Verify all tables have organization_id column'
\echo 'Expected: 0 rows (all tables have organization_id)'
\echo '----------------------------------------------------------------------'

SELECT
    table_name,
    'MISSING organization_id column' AS violation
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('audit_log', 'spatial_ref_sys')  -- Exceptions
  AND table_name NOT IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'organization_id'
  )
ORDER BY table_name;

\echo ''

-- ==============================================================================
-- Test 2: Verify all tables have RLS enabled
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 2: Verify all tables have RLS enabled'
\echo 'Expected: 0 rows (all tables have RLS enabled)'
\echo '----------------------------------------------------------------------'

SELECT
    tablename,
    'RLS NOT ENABLED' AS violation
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('spatial_ref_sys')  -- Exceptions
  AND rowsecurity = false  -- RLS is not enabled
ORDER BY tablename;

\echo ''

-- ==============================================================================
-- Test 3: Verify all tables have RLS policies
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 3: Verify all tables have RLS policies'
\echo 'Expected: 0 rows (all RLS-enabled tables have policies)'
\echo '----------------------------------------------------------------------'

SELECT
    tablename,
    'RLS enabled but NO POLICIES defined' AS violation
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('spatial_ref_sys')
  AND rowsecurity = true  -- RLS is enabled
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = pg_tables.tablename
  )
ORDER BY tablename;

\echo ''

-- ==============================================================================
-- Test 4: Verify all foreign keys are valid
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 4: List all foreign key relationships (should be comprehensive)'
\echo 'Expected: All FK relationships listed'
\echo '----------------------------------------------------------------------'

SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    a.attname AS column_name,
    confrelid::regclass AS referenced_table,
    af.attname AS referenced_column
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
JOIN pg_attribute af ON af.attnum = ANY(c.confkey) AND af.attrelid = c.confrelid
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

\echo ''

-- ==============================================================================
-- Test 5: Verify indexes on foreign key columns
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 5: Verify foreign keys have indexes'
\echo 'Expected: 0 rows (all FK columns have indexes)'
\echo '----------------------------------------------------------------------'

-- Foreign keys without indexes (performance issue)
SELECT
    conrelid::regclass AS table_name,
    a.attname AS column_name,
    'Foreign key without index' AS violation
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND a.attnum = ANY(i.indkey)
  )
ORDER BY table_name, column_name;

\echo ''

-- ==============================================================================
-- Test 6: Verify GIN indexes on JSONB columns
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 6: Verify JSONB columns have GIN indexes'
\echo 'Expected: 0 rows (all JSONB columns have GIN indexes)'
\echo '----------------------------------------------------------------------'

SELECT
    t.table_name,
    c.column_name,
    'JSONB column without GIN index' AS violation
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE c.table_schema = 'public'
  AND c.data_type = 'jsonb'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes idx
    WHERE idx.schemaname = 'public'
      AND idx.tablename = c.table_name
      AND idx.indexdef LIKE '%USING gin%'
      AND idx.indexdef LIKE '%' || c.column_name || '%'
  )
ORDER BY t.table_name, c.column_name;

\echo ''

-- ==============================================================================
-- Test 7: Verify all tables have created_at and updated_at
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 7: Verify audit timestamp columns exist'
\echo 'Expected: 0 rows (all tables have created_at and updated_at)'
\echo '----------------------------------------------------------------------'

-- Tables without created_at
SELECT
    table_name,
    'MISSING created_at column' AS violation
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('audit_log', 'spatial_ref_sys', 'pool_mappings')  -- Exceptions
  AND table_name NOT IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'created_at'
  )
ORDER BY table_name;

\echo ''

-- Tables without updated_at
SELECT
    table_name,
    'MISSING updated_at column' AS violation
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN ('audit_log', 'spatial_ref_sys', 'pool_mappings', 'gl_entries', 'import_batches')  -- Exceptions
  AND table_name NOT IN (
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
  )
ORDER BY table_name;

\echo ''

-- ==============================================================================
-- Test 8: Verify CHECK constraints exist
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 8: List all CHECK constraints (should include important validations)'
\echo 'Expected: Constraints for finalized_requires_timestamp, allocation_percentage, etc.'
\echo '----------------------------------------------------------------------'

SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE contype = 'c'  -- CHECK constraints
  AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

\echo ''

-- ==============================================================================
-- Test 9: Verify UNIQUE constraints exist
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 9: List all UNIQUE constraints'
\echo 'Expected: Unique constraints on emails, import batch fingerprints, etc.'
\echo '----------------------------------------------------------------------'

SELECT
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    a.attname AS column_name
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE contype = 'u'  -- UNIQUE constraints
  AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

\echo ''

-- ==============================================================================
-- Test 10: Verify NOT NULL constraints on critical columns
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 10: Verify NOT NULL constraints on critical columns'
\echo 'Expected: organization_id, property_id, email, etc. are NOT NULL'
\echo '----------------------------------------------------------------------'

-- Critical columns that should be NOT NULL
SELECT
    table_name,
    column_name,
    'Should be NOT NULL but is nullable' AS violation
FROM information_schema.columns
WHERE table_schema = 'public'
  AND is_nullable = 'YES'
  AND (
    (column_name = 'organization_id' AND table_name != 'organizations')
    OR (column_name = 'property_id' AND table_name NOT IN ('properties'))
    OR (column_name = 'email' AND table_name IN ('users'))
    OR (column_name = 'name' AND table_name IN ('organizations', 'properties', 'expense_pools'))
  )
ORDER BY table_name, column_name;

\echo ''

-- ==============================================================================
-- Test 11: Verify triggers exist
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 11: List all triggers (should include audit triggers, updated_at)'
\echo 'Expected: Audit log triggers, updated_at triggers'
\echo '----------------------------------------------------------------------'

SELECT
    trigger_name,
    event_object_table AS table_name,
    event_manipulation AS event,
    action_timing AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo ''

-- ==============================================================================
-- Test 12: Verify helper functions exist
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 12: Verify required helper functions exist'
\echo 'Expected: get_user_organization_id and other critical functions'
\echo '----------------------------------------------------------------------'

SELECT
    routine_name,
    routine_type,
    data_type AS return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_user_organization_id',
    'update_updated_at_column'
  )
ORDER BY routine_name;

\echo ''

-- ==============================================================================
-- Test 13: Verify immutability constraints
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 13: Verify immutability constraints on reconciliation_snapshots'
\echo 'Expected: Constraint that prevents updates when finalized'
\echo '----------------------------------------------------------------------'

SELECT
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.reconciliation_snapshots'::regclass
  AND conname LIKE '%finalized%'
ORDER BY conname;

\echo ''

-- ==============================================================================
-- Test 14: Verify permission grants
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 14: Verify table permissions for authenticated role'
\echo 'Expected: Authenticated role has appropriate SELECT/INSERT/UPDATE/DELETE'
\echo '----------------------------------------------------------------------'

SELECT
    table_name,
    privilege_type,
    grantee
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'service_role')
ORDER BY table_name, grantee, privilege_type;

\echo ''

-- ==============================================================================
-- Test 15: Verify no dangerous grants to anon role
-- ==============================================================================

\echo '----------------------------------------------------------------------'
\echo 'Test 15: Verify no write permissions for anon role'
\echo 'Expected: 0 rows (anon should not have INSERT/UPDATE/DELETE)'
\echo '----------------------------------------------------------------------'

SELECT
    table_name,
    privilege_type,
    'SECURITY: anon role has write permission' AS violation
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee = 'anon'
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY table_name, privilege_type;

\echo ''

-- ==============================================================================
-- Summary
-- ==============================================================================

\echo '======================================================================'
\echo 'Schema Verification Complete'
\echo 'Finished at:' `date`
\echo '======================================================================'
\echo ''
\echo 'Review the output above for any violations.'
\echo 'Expected: All violation queries should return 0 rows.'
\echo 'If any violations are found, fix the schema and re-run this script.'
\echo ''
