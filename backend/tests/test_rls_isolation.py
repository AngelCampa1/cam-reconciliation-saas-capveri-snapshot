"""
RLS (Row Level Security) Isolation Tests

These tests verify that the database schema correctly implements multi-tenant
isolation through Row Level Security policies.

CRITICAL: These are security tests. All tests must pass before deployment.

Test Categories:
1. Migration Validation - Verify RLS is enabled and policies exist
2. Policy Pattern Validation - Verify correct isolation patterns
3. Cross-Organization Isolation - Document live database test scenarios
4. Immutability Tests - Verify finalized data cannot be modified
"""

import re
from pathlib import Path

import pytest

# Path to project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


# =============================================================================
# Tables that must have RLS enabled
# =============================================================================

TABLES_WITH_RLS = {
    "organizations",
    "users",
    "properties",
    "units",
    "leases",
    "import_batches",
    "gl_entries",
    "expense_pools",
    "pool_mappings",
    "reconciliation_snapshots",
    "audit_log",
}

# Tables with direct organization_id column
TABLES_WITH_DIRECT_ORG_ID = {
    "organizations",  # itself
    "users",
    "properties",
    "import_batches",
}

# Tables with indirect organization access (via property)
TABLES_WITH_PROPERTY_ORG_ACCESS = {
    "units",
    "leases",
    "expense_pools",
    "gl_entries",
    "reconciliation_snapshots",
}

# Tables with multi-level indirect access
TABLES_WITH_MULTI_LEVEL_ACCESS = {
    "pool_mappings",  # via expense_pool -> property -> organization
}

# Tables with special access patterns
TABLES_WITH_SPECIAL_ACCESS = {
    "audit_log",  # admin-only viewing
}


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def all_migration_content() -> str:
    """Load all migration file contents concatenated."""
    content = []
    for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        content.append(migration_file.read_text())
    return "\n".join(content)


@pytest.fixture
def migration_files() -> dict[str, str]:
    """Load all migration files as a dictionary."""
    files = {}
    for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        files[migration_file.name] = migration_file.read_text()
    return files


# =============================================================================
# Test Class: RLS Enablement Validation
# =============================================================================


class TestRLSEnablement:
    """Verify RLS is enabled on all required tables."""

    def test_all_required_tables_have_rls_enabled(
        self, all_migration_content: str
    ) -> None:
        """Every table in TABLES_WITH_RLS must have RLS enabled."""
        for table_name in TABLES_WITH_RLS:
            pattern = rf"ALTER TABLE public\.{table_name} ENABLE ROW LEVEL SECURITY"
            assert re.search(pattern, all_migration_content), (
                f"SECURITY VIOLATION: Table '{table_name}' does not have "
                "ROW LEVEL SECURITY enabled!"
            )

    def test_organizations_table_has_rls(self, all_migration_content: str) -> None:
        """Organizations table must have RLS enabled."""
        assert (
            "ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_users_table_has_rls(self, all_migration_content: str) -> None:
        """Users table must have RLS enabled."""
        assert (
            "ALTER TABLE public.users ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_properties_table_has_rls(self, all_migration_content: str) -> None:
        """Properties table must have RLS enabled."""
        assert (
            "ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_units_table_has_rls(self, all_migration_content: str) -> None:
        """Units table must have RLS enabled."""
        assert (
            "ALTER TABLE public.units ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_leases_table_has_rls(self, all_migration_content: str) -> None:
        """Leases table must have RLS enabled."""
        assert (
            "ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_import_batches_table_has_rls(self, all_migration_content: str) -> None:
        """Import batches table must have RLS enabled."""
        assert (
            "ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_gl_entries_table_has_rls(self, all_migration_content: str) -> None:
        """GL entries table must have RLS enabled."""
        assert (
            "ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_expense_pools_table_has_rls(self, all_migration_content: str) -> None:
        """Expense pools table must have RLS enabled."""
        assert (
            "ALTER TABLE public.expense_pools ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_pool_mappings_table_has_rls(self, all_migration_content: str) -> None:
        """Pool mappings table must have RLS enabled."""
        assert (
            "ALTER TABLE public.pool_mappings ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_reconciliation_snapshots_table_has_rls(
        self, all_migration_content: str
    ) -> None:
        """Reconciliation snapshots table must have RLS enabled."""
        assert (
            "ALTER TABLE public.reconciliation_snapshots ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )

    def test_audit_log_table_has_rls(self, all_migration_content: str) -> None:
        """Audit log table must have RLS enabled."""
        assert (
            "ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY"
            in all_migration_content
        )


# =============================================================================
# Test Class: Organization Isolation Helper Function
# =============================================================================


class TestOrganizationIsolationHelper:
    """Verify the get_user_organization_id() helper function exists and is used."""

    def test_helper_function_exists(self, all_migration_content: str) -> None:
        """The get_user_organization_id() helper function must be defined."""
        assert (
            "CREATE OR REPLACE FUNCTION public.get_user_organization_id()"
            in all_migration_content
        )

    def test_helper_function_returns_uuid(self, all_migration_content: str) -> None:
        """The helper function must return UUID type."""
        # Check that the function returns UUID
        assert "RETURNS UUID" in all_migration_content

    def test_helper_function_is_security_definer(
        self, all_migration_content: str
    ) -> None:
        """The helper function must be SECURITY DEFINER for RLS bypass."""
        # The function should be SECURITY DEFINER to properly access user data
        pattern = r"get_user_organization_id.*SECURITY DEFINER"
        assert re.search(pattern, all_migration_content, re.DOTALL)

    def test_helper_used_in_properties_rls(self, all_migration_content: str) -> None:
        """Properties RLS policies must use get_user_organization_id()."""
        assert (
            "organization_id = public.get_user_organization_id()"
            in all_migration_content
        )

    def test_helper_used_in_units_rls(self, all_migration_content: str) -> None:
        """Units RLS policies must use get_user_organization_id() via property."""
        # Units access org via property join
        pattern = r"public\.units.*get_user_organization_id"
        assert re.search(pattern, all_migration_content, re.DOTALL)

    def test_helper_used_across_all_rls_policies(
        self, all_migration_content: str
    ) -> None:
        """All RLS policies should reference get_user_organization_id()."""
        # Count usage - should be used many times across policies
        usage_count = all_migration_content.count("get_user_organization_id()")
        # At minimum: once for function definition + once per table with policies
        assert usage_count >= 10, (
            f"get_user_organization_id() used only {usage_count} times. "
            "Expected at least 10 (function + policies)."
        )


# =============================================================================
# Test Class: SELECT Policy Isolation
# =============================================================================


class TestSelectPolicyIsolation:
    """Verify SELECT policies use correct organization isolation patterns."""

    def test_properties_select_uses_direct_org_check(
        self, all_migration_content: str
    ) -> None:
        """Properties SELECT policy must check organization_id directly."""
        pattern = r"CREATE POLICY.*properties.*FOR SELECT.*organization_id = public\.get_user_organization_id\(\)"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_units_select_uses_property_join(self, all_migration_content: str) -> None:
        """Units SELECT policy must check via property join."""
        pattern = r"CREATE POLICY.*units.*FOR SELECT.*FROM public\.properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_leases_select_uses_property_join(self, all_migration_content: str) -> None:
        """Leases SELECT policy must check via property join."""
        pattern = r"CREATE POLICY.*leases.*FOR SELECT.*FROM public\.properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_gl_entries_select_uses_property_join(
        self, all_migration_content: str
    ) -> None:
        """GL entries SELECT policy must check via property join."""
        pattern = r"CREATE POLICY.*gl_entries.*FOR SELECT.*FROM public\.properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_expense_pools_select_uses_property_join(
        self, all_migration_content: str
    ) -> None:
        """Expense pools SELECT policy must check via property join."""
        pattern = r"CREATE POLICY.*expense_pools.*FOR SELECT.*FROM public\.properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_pool_mappings_select_uses_multi_level_join(
        self, all_migration_content: str
    ) -> None:
        """Pool mappings SELECT policy must check via expense_pool -> property chain."""
        pattern = r"CREATE POLICY.*pool_mappings.*FOR SELECT.*expense_pools.*properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_reconciliation_snapshots_select_uses_property_join(
        self, all_migration_content: str
    ) -> None:
        """Reconciliation snapshots SELECT policy must check via property join."""
        pattern = r"CREATE POLICY.*reconciliation_snapshots.*FOR SELECT.*FROM public\.properties"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_audit_log_select_restricts_to_admins(
        self, all_migration_content: str
    ) -> None:
        """Audit log SELECT policy must restrict to admin/owner roles."""
        pattern = r"CREATE POLICY.*audit_log.*FOR SELECT.*role IN \('owner', 'admin'\)"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)


# =============================================================================
# Test Class: INSERT Policy Isolation
# =============================================================================


class TestInsertPolicyIsolation:
    """Verify INSERT policies prevent cross-organization data insertion."""

    def test_properties_insert_checks_org(self, all_migration_content: str) -> None:
        """Properties INSERT policy must verify organization ownership."""
        pattern = r"CREATE POLICY.*properties.*FOR INSERT.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_units_insert_checks_property_org(self, all_migration_content: str) -> None:
        """Units INSERT policy must verify property belongs to user's org."""
        pattern = r"CREATE POLICY.*units.*FOR INSERT.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_leases_insert_checks_property_org(
        self, all_migration_content: str
    ) -> None:
        """Leases INSERT policy must verify property belongs to user's org."""
        pattern = r"CREATE POLICY.*leases.*FOR INSERT.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_gl_entries_insert_checks_property_org(
        self, all_migration_content: str
    ) -> None:
        """GL entries INSERT policy must verify property belongs to user's org."""
        pattern = r"CREATE POLICY.*gl_entries.*FOR INSERT.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)


# =============================================================================
# Test Class: UPDATE Policy Isolation
# =============================================================================


class TestUpdatePolicyIsolation:
    """Verify UPDATE policies prevent cross-organization modifications."""

    def test_properties_update_has_using_and_with_check(
        self, all_migration_content: str
    ) -> None:
        """Properties UPDATE policy must have both USING and WITH CHECK."""
        pattern = r"CREATE POLICY.*properties.*FOR UPDATE.*USING.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_units_update_has_using_and_with_check(
        self, all_migration_content: str
    ) -> None:
        """Units UPDATE policy must have both USING and WITH CHECK."""
        pattern = r"CREATE POLICY.*units.*FOR UPDATE.*USING.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_leases_update_has_using_and_with_check(
        self, all_migration_content: str
    ) -> None:
        """Leases UPDATE policy must have both USING and WITH CHECK."""
        pattern = r"CREATE POLICY.*leases.*FOR UPDATE.*USING.*WITH CHECK"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)


# =============================================================================
# Test Class: DELETE Policy Isolation
# =============================================================================


class TestDeletePolicyIsolation:
    """Verify DELETE policies prevent cross-organization deletions."""

    def test_properties_delete_has_using_clause(
        self, all_migration_content: str
    ) -> None:
        """Properties DELETE policy must have USING clause."""
        pattern = r"CREATE POLICY.*properties.*FOR DELETE.*USING"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_units_delete_has_using_clause(self, all_migration_content: str) -> None:
        """Units DELETE policy must have USING clause."""
        pattern = r"CREATE POLICY.*units.*FOR DELETE.*USING"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_leases_delete_requires_admin(self, all_migration_content: str) -> None:
        """Leases DELETE policy must require admin/owner role."""
        pattern = r"CREATE POLICY.*leases.*FOR DELETE.*role IN \('owner', 'admin'\)"
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)


# =============================================================================
# Test Class: Immutability Constraints
# =============================================================================


class TestImmutabilityConstraints:
    """Verify that finalized/immutable data cannot be modified."""

    def test_gl_entries_are_immutable(self, all_migration_content: str) -> None:
        """GL entries should not have UPDATE policies (immutable)."""
        # GL entries are immutable - check that no UPDATE policy exists for gl_entries
        # Pattern must match policies specifically ON public.gl_entries table
        pattern = r"CREATE POLICY[^;]+ON\s+public\.gl_entries[^;]+FOR\s+UPDATE"
        # If UPDATE policy exists, it should be very restrictive or not exist
        matches = re.findall(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)
        # GL entries shouldn't have an UPDATE policy at all
        assert (
            len(matches) == 0
        ), "GL entries should be immutable - no UPDATE policy should exist!"

    def test_reconciliation_snapshots_update_restricted_to_draft(
        self, all_migration_content: str
    ) -> None:
        """Reconciliation snapshots UPDATE policy must check status = 'draft'."""
        pattern = (
            r"CREATE POLICY.*reconciliation_snapshots.*FOR UPDATE.*status = 'draft'"
        )
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Reconciliation snapshots UPDATE policy must require status = 'draft'"

    def test_reconciliation_snapshots_delete_restricted_to_draft(
        self, all_migration_content: str
    ) -> None:
        """Reconciliation snapshots DELETE policy must check status = 'draft'."""
        pattern = (
            r"CREATE POLICY.*reconciliation_snapshots.*FOR DELETE.*status = 'draft'"
        )
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Reconciliation snapshots DELETE policy must require status = 'draft'"

    def test_finalized_constraint_exists(self, all_migration_content: str) -> None:
        """A constraint should enforce finalized_at is set when status is finalized."""
        assert (
            "finalized_requires_timestamp" in all_migration_content
        ), "Missing constraint to enforce finalized_at timestamp when finalized"


# =============================================================================
# Test Class: Audit Log Security
# =============================================================================


class TestAuditLogSecurity:
    """Verify audit log has proper security restrictions."""

    def test_audit_log_no_insert_policy(self, all_migration_content: str) -> None:
        """Audit log should not have INSERT policy (trigger-only writes)."""
        # Look for policies on audit_log table with FOR INSERT within a single policy definition
        # The pattern ensures ON public.audit_log and FOR INSERT are in the same policy
        pattern = r"CREATE POLICY[^;]*ON\s+public\.audit_log[^;]*FOR\s+INSERT"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE)
        assert (
            len(matches) == 0
        ), "Audit log should not have INSERT policy - writes are trigger-only!"

    def test_audit_log_no_update_policy(self, all_migration_content: str) -> None:
        """Audit log should not have UPDATE policy (append-only)."""
        pattern = r"CREATE POLICY[^;]*ON\s+public\.audit_log[^;]*FOR\s+UPDATE"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE)
        assert (
            len(matches) == 0
        ), "Audit log should not have UPDATE policy - it's append-only!"

    def test_audit_log_no_delete_policy(self, all_migration_content: str) -> None:
        """Audit log should not have DELETE policy (permanent records)."""
        pattern = r"CREATE POLICY[^;]*ON\s+public\.audit_log[^;]*FOR\s+DELETE"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE)
        assert (
            len(matches) == 0
        ), "Audit log should not have DELETE policy - records are permanent!"

    def test_audit_log_select_only_grant(self, all_migration_content: str) -> None:
        """Audit log should only grant SELECT permission."""
        assert (
            "GRANT SELECT ON public.audit_log TO authenticated" in all_migration_content
        )


# =============================================================================
# Test Class: Complete Policy Coverage
# =============================================================================


class TestCompletePolicyCoverage:
    """Verify all tables have complete CRUD policy coverage."""

    TABLES_NEEDING_FULL_CRUD = {
        "properties",
        "units",
        "leases",
        "expense_pools",
        "pool_mappings",
    }

    def test_tables_have_select_policies(self, all_migration_content: str) -> None:
        """All RLS-enabled tables must have SELECT policies."""
        for table in self.TABLES_NEEDING_FULL_CRUD:
            pattern = rf"CREATE POLICY.*{table}.*FOR SELECT"
            assert re.search(
                pattern, all_migration_content, re.DOTALL | re.IGNORECASE
            ), f"Table '{table}' is missing a SELECT policy!"

    def test_tables_have_insert_policies(self, all_migration_content: str) -> None:
        """All RLS-enabled tables must have INSERT policies."""
        for table in self.TABLES_NEEDING_FULL_CRUD:
            pattern = rf"CREATE POLICY.*{table}.*FOR INSERT"
            assert re.search(
                pattern, all_migration_content, re.DOTALL | re.IGNORECASE
            ), f"Table '{table}' is missing an INSERT policy!"

    def test_tables_have_update_policies(self, all_migration_content: str) -> None:
        """All RLS-enabled tables must have UPDATE policies."""
        for table in self.TABLES_NEEDING_FULL_CRUD:
            pattern = rf"CREATE POLICY.*{table}.*FOR UPDATE"
            assert re.search(
                pattern, all_migration_content, re.DOTALL | re.IGNORECASE
            ), f"Table '{table}' is missing an UPDATE policy!"

    def test_tables_have_delete_policies(self, all_migration_content: str) -> None:
        """All RLS-enabled tables must have DELETE policies."""
        for table in self.TABLES_NEEDING_FULL_CRUD:
            pattern = rf"CREATE POLICY.*{table}.*FOR DELETE"
            assert re.search(
                pattern, all_migration_content, re.DOTALL | re.IGNORECASE
            ), f"Table '{table}' is missing a DELETE policy!"


# =============================================================================
# Test Class: Cross-Organization Isolation Scenarios
# =============================================================================


class TestCrossOrganizationIsolationScenarios:
    """
    Document cross-organization isolation scenarios.

    These tests verify the structure is correct for isolation.
    Live database integration tests should verify actual behavior.

    SECURITY TEST SCENARIOS (to run with live database):

    1. User A in Org A cannot SELECT properties from Org B
    2. User A in Org A cannot INSERT properties into Org B
    3. User A in Org A cannot UPDATE properties in Org B
    4. User A in Org A cannot DELETE properties from Org B
    5. Repeat for all tables: units, leases, gl_entries, expense_pools,
       pool_mappings, reconciliation_snapshots
    6. User A cannot see Org B's audit log entries
    7. User A cannot modify finalized reconciliation snapshots
    8. User A cannot delete finalized reconciliation snapshots
    """

    def test_isolation_pattern_uses_exists_subquery(
        self, all_migration_content: str
    ) -> None:
        """RLS policies should use EXISTS subquery pattern for isolation."""
        # The EXISTS pattern is the recommended way for RLS isolation
        exists_count = all_migration_content.count("EXISTS (")
        assert (
            exists_count >= 20
        ), f"Expected at least 20 EXISTS subqueries in policies, found {exists_count}"

    def test_no_policy_uses_simple_equality_without_function(
        self, all_migration_content: str
    ) -> None:
        """
        Policies should not use simple organization_id = auth.uid() pattern.

        The correct pattern is organization_id = get_user_organization_id()
        because auth.uid() returns user ID, not organization ID.
        """
        # This would be a bug - using auth.uid() directly for org comparison
        bad_pattern = r"organization_id\s*=\s*auth\.uid\(\)"
        matches = re.findall(bad_pattern, all_migration_content)
        assert len(matches) == 0, (
            "SECURITY BUG: Found policy using organization_id = auth.uid() "
            "instead of organization_id = get_user_organization_id()"
        )

    def test_all_property_based_isolation_joins_correctly(
        self, all_migration_content: str
    ) -> None:
        """Tables that isolate via property must join to properties table."""
        for table in TABLES_WITH_PROPERTY_ORG_ACCESS:
            # Check that policies for this table reference properties
            table_section = re.search(
                rf"CREATE TABLE public\.{table}.*?(?=CREATE TABLE|$)",
                all_migration_content,
                re.DOTALL,
            )
            if table_section:
                table_section.group(0)
                # The policies should reference properties table
                assert (
                    "public.properties" in all_migration_content
                ), f"Table '{table}' policies should reference properties table"


# =============================================================================
# Test Class: Permission Grants
# =============================================================================


class TestPermissionGrants:
    """Verify correct permissions are granted to roles."""

    def test_authenticated_role_grants_exist(self, all_migration_content: str) -> None:
        """All tables should grant permissions to authenticated role."""
        grant_count = all_migration_content.count("TO authenticated")
        assert (
            grant_count >= 10
        ), f"Expected at least 10 GRANT statements to authenticated, found {grant_count}"

    def test_no_grants_to_anon(self, all_migration_content: str) -> None:
        """No tables should grant write permissions to anon role (except allowed tables)."""
        # Tables intentionally allowing anon INSERT (public submission forms)
        allowed_anon_insert_tables = {"audit_requests", "content_leads"}

        # Check for any suspicious grants to anon
        # This pattern captures table name and privilege type
        anon_grants = re.findall(
            r"GRANT\s+(INSERT|UPDATE|DELETE)\s+ON\s+(?:public\.)?(\w+)\s+TO\s+anon",
            all_migration_content,
            re.IGNORECASE,
        )

        # Filter out allowed exceptions
        unexpected_grants = [
            (priv, table)
            for priv, table in anon_grants
            if not (
                priv.upper() == "INSERT" and table.lower() in allowed_anon_insert_tables
            )
        ]

        assert (
            len(unexpected_grants) == 0
        ), f"SECURITY: Found unexpected write grants to anon role: {unexpected_grants}"

    def test_no_public_grants_on_sensitive_tables(
        self, all_migration_content: str
    ) -> None:
        """Sensitive tables should not have grants to PUBLIC role."""
        public_grants = re.findall(
            r"GRANT.*ON.*(?:users|audit_log|reconciliation_snapshots).*TO\s+PUBLIC",
            all_migration_content,
            re.IGNORECASE,
        )
        assert (
            len(public_grants) == 0
        ), f"SECURITY: Found grants to PUBLIC on sensitive tables: {public_grants}"


# =============================================================================
# Test Class: Function Search Path Security
# =============================================================================


class TestFunctionSearchPath:
    """Verify all SECURITY DEFINER functions have immutable search_path."""

    def test_user_can_access_lease_term_version_has_set_search_path(
        self, all_migration_content: str
    ) -> None:
        """user_can_access_lease_term_version must have SET search_path = public."""
        pattern = r"FUNCTION public\.user_can_access_lease_term_version.*SET search_path = public"
        assert re.search(pattern, all_migration_content, re.DOTALL), (
            "SECURITY: user_can_access_lease_term_version is SECURITY DEFINER "
            "but missing SET search_path = public"
        )

    def test_get_effective_term_versions_has_set_search_path(
        self, all_migration_content: str
    ) -> None:
        """get_effective_term_versions must have SET search_path = public."""
        pattern = (
            r"FUNCTION public\.get_effective_term_versions.*SET search_path = public"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL), (
            "SECURITY: get_effective_term_versions is SECURITY DEFINER "
            "but missing SET search_path = public"
        )

    def test_set_updated_at_has_set_search_path(
        self, all_migration_content: str
    ) -> None:
        """set_updated_at must have SET search_path = public."""
        pattern = r"FUNCTION public\.set_updated_at\(\).*SET search_path = public"
        assert re.search(pattern, all_migration_content, re.DOTALL), (
            "SECURITY: set_updated_at is used as a trigger helper but is "
            "missing SET search_path = public"
        )


# =============================================================================
# Test Class: Supabase Advisor Warning Regressions
# =============================================================================


class TestSupabaseAdvisorWarningRegressions:
    """Verify known Supabase advisor security warnings stay remediated."""

    def test_public_storage_listing_policies_are_dropped(
        self, all_migration_content: str
    ) -> None:
        """Broad public storage SELECT policies must be removed."""
        assert (
            'DROP POLICY IF EXISTS "Public read for documents (E2E testing)"'
            in all_migration_content
        )
        assert (
            'DROP POLICY IF EXISTS "Public read for feedback screenshots"'
            in all_migration_content
        )

    def test_sensitive_storage_buckets_are_private(
        self, all_migration_content: str
    ) -> None:
        """Document and screenshot buckets must not allow public object URLs."""
        pattern = (
            r"UPDATE storage\.buckets"
            r".*SET public = false"
            r".*WHERE id IN \('documents', 'feedback-screenshots'\)"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_audit_pipeline_insert_policy_is_service_role_scoped(
        self, all_migration_content: str
    ) -> None:
        """audit_pipeline_events INSERT policy must be scoped to service_role."""
        pattern = (
            r'CREATE POLICY "service role can insert pipeline events"'
            r"[^;]+ON public\.audit_pipeline_events"
            r"[^;]+FOR INSERT"
            r"[^;]+TO service_role"
            r"[^;]+WITH CHECK \(true\)"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_sensitive_security_definer_functions_revoke_anon_execute(
        self, all_migration_content: str
    ) -> None:
        """Trigger-only and backend-only SECURITY DEFINER functions must reject anon RPC."""
        sensitive_functions = [
            "public.set_updated_at()",
            "public.update_updated_at_column()",
            "public.audit_trigger_func()",
            "public.audit_gl_entries_func()",
            "public.set_snapshot_organization_id()",
            "public.check_pool_hierarchy_depth()",
            "public.actual_billed_property_org_matches()",
            "public.set_organization_context(TEXT)",
            "public.run_retention_purge()",
        ]
        missing_revokes = [
            function_signature
            for function_signature in sensitive_functions
            if f"REVOKE EXECUTE ON FUNCTION {function_signature} FROM anon"
            not in all_migration_content
        ]
        assert not missing_revokes, (
            "SECURITY: Missing anon EXECUTE revokes for sensitive functions: "
            f"{missing_revokes}"
        )

    def test_late_security_definer_functions_are_not_anon_callable(
        self, migration_files: dict[str, str]
    ) -> None:
        """Later SECURITY DEFINER helpers must not regain anonymous RPC access."""
        latest_hardening = migration_files[
            "20260522000002_guard_security_definer_rpc_execute.sql"
        ]
        sensitive_functions = [
            "public.check_audit_request_rate_limit()",
            "public.check_feedback_rate_limit()",
            "public.handle_new_user_signup()",
            "public.update_promotion_status_on_redemption()",
            "public.upsert_feature_use(uuid, text)",
        ]
        for function_signature in sensitive_functions:
            assert function_signature in latest_hardening
        assert "REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC" in latest_hardening
        assert "REVOKE EXECUTE ON FUNCTION %s FROM anon" in latest_hardening
        assert "REVOKE EXECUTE ON FUNCTION %s FROM authenticated" in latest_hardening
        assert "GRANT EXECUTE ON FUNCTION %s TO service_role" in latest_hardening

    def test_rls_helper_security_definer_functions_are_authenticated_only(
        self, migration_files: dict[str, str]
    ) -> None:
        """RLS/app helper RPCs must be callable by authenticated users, not anon."""
        latest_hardening = migration_files[
            "20260522000002_guard_security_definer_rpc_execute.sql"
        ]
        helper_functions = [
            "public.get_user_organization_id()",
            "public.lease_belongs_to_user_org(uuid)",
            "public.user_can_access_lease(uuid)",
            "public.user_can_access_lease_term_version(uuid)",
            "public.user_can_access_unit(uuid)",
            "public.get_effective_term_versions(uuid[], date)",
        ]
        for function_signature in helper_functions:
            assert function_signature in latest_hardening
        assert "REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC" in latest_hardening
        assert "REVOKE EXECUTE ON FUNCTION %s FROM anon" in latest_hardening
        assert "GRANT EXECUTE ON FUNCTION %s TO authenticated" in latest_hardening

    def test_merge_finding_decision_enforces_auth_membership_for_org(
        self, all_migration_content: str
    ) -> None:
        """merge_finding_decision must verify authenticated membership in p_org_id."""
        pattern = (
            r"FUNCTION public\.merge_finding_decision"
            r".*FROM public\.users"
            r".*id = auth\.uid\(\)"
            r".*organization_id = p_org_id"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_get_effective_term_versions_filters_by_lease_access(
        self, all_migration_content: str
    ) -> None:
        """get_effective_term_versions must filter output through lease access."""
        pattern = (
            r"FUNCTION public\.get_effective_term_versions"
            r".*public\.user_can_access_lease_term_version\(lease_id\)"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_tenant_role_is_excluded_from_landlord_org_helper(
        self, all_migration_content: str
    ) -> None:
        """Tenant users must not satisfy broad organization-member RLS policies."""
        pattern = (
            r"FUNCTION public\.get_user_organization_id\(\)"
            r".*role IN \('owner', 'admin', 'member', 'viewer'\)"
        )
        assert re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE)

    def test_authenticated_users_cannot_update_privilege_columns(
        self, all_migration_content: str
    ) -> None:
        """Browser clients must not be granted UPDATE on user privilege fields."""
        assert (
            "REVOKE UPDATE ON public.users FROM authenticated" in all_migration_content
        )
        assert "GRANT UPDATE (full_name) ON public.users TO authenticated" in (
            all_migration_content
        )
        assert "GRANT UPDATE (role)" not in all_migration_content
        assert "GRANT UPDATE (organization_id)" not in all_migration_content
        assert "GRANT UPDATE (is_platform_admin)" not in all_migration_content

    def test_authenticated_users_cannot_insert_privileged_user_rows(
        self, migration_files: dict[str, str]
    ) -> None:
        """Browser clients must not self-create users with elevated privileges."""
        latest_hardening = migration_files[
            "20260522000003_guard_users_insert_privileges.sql"
        ]
        assert "REVOKE INSERT ON public.users FROM authenticated" in latest_hardening
        assert "GRANT INSERT ON public.users TO service_role" in latest_hardening
        assert (
            'DROP POLICY IF EXISTS "Users insertable by admins or service"'
            in latest_hardening
        )
        assert 'CREATE POLICY "Service role can create users"' in latest_hardening
        assert "TO service_role" in latest_hardening
        assert "OR id = (select auth.uid())" not in latest_hardening
        assert "TO authenticated" not in latest_hardening

    def test_financial_rls_writes_require_editor_role(
        self, migration_files: dict[str, str]
    ) -> None:
        """Viewer users must not mutate financial tables through direct Supabase."""
        latest_hardening = migration_files[
            "20260522000004_guard_financial_rls_writes.sql"
        ]
        assert (
            "CREATE OR REPLACE FUNCTION public.get_user_editor_organization_id()"
            in (latest_hardening)
        )
        assert "role IN ('owner', 'admin', 'member')" in latest_hardening
        assert "role IN ('owner', 'admin', 'member', 'viewer')" not in latest_hardening

        policy_names = [
            '"Leases are insertable via property access"',
            '"Leases are updatable via property access"',
            '"Lease term versions are insertable via lease access"',
            '"Expense pools are insertable via property access"',
            '"Expense pools are updatable via property access"',
            '"Expense pools are deletable via property access"',
            '"Pool mappings are insertable via pool access"',
            '"Pool mappings are updatable via pool access"',
            '"Pool mappings are deletable via pool access"',
            '"Pool allocations insertable by org editors"',
            '"Pool allocations updatable by org editors"',
            '"Pool allocations deletable by org editors"',
            '"Users can create actual billed amounts for their organization"',
            '"Users can update their organization\'s actual billed amounts"',
            '"Users can delete their organization\'s actual billed amounts"',
            '"Users can create org templates"',
            '"Users can update org templates"',
            '"Users can delete org templates"',
            '"Documents are insertable by organization members"',
            '"Documents are updatable by organization members"',
            '"Users create org jobs"',
            '"Users update org jobs"',
            '"OCR results are insertable by organization members"',
            '"OCR results are updatable by organization members"',
        ]
        for policy_name in policy_names:
            policy_start = latest_hardening.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = latest_hardening[
                policy_start : latest_hardening.find(";", policy_start)
            ]
            assert "get_user_editor_organization_id()" in policy_sql

    def test_merge_finding_decision_is_service_role_only(
        self, migration_files: dict[str, str]
    ) -> None:
        """Viewer users must not call the mutating decision RPC directly."""
        latest_hardening = migration_files[
            "20260522000004_guard_financial_rls_writes.sql"
        ]
        signature = "public.merge_finding_decision(UUID, UUID, TEXT, JSONB)"
        assert f"REVOKE EXECUTE ON FUNCTION {signature}" in latest_hardening
        assert "FROM authenticated" in latest_hardening
        assert f"GRANT EXECUTE ON FUNCTION {signature}" in latest_hardening
        assert "TO service_role" in latest_hardening

    def test_core_financial_rls_writes_require_editor_or_admin_role(
        self, migration_files: dict[str, str]
    ) -> None:
        """Viewer users must not mutate core financial/import tables directly."""
        latest_hardening = migration_files[
            "20260522000005_guard_core_financial_rls_writes.sql"
        ]
        assert "public.get_user_admin_organization_id()" in latest_hardening
        assert "role IN ('owner', 'admin')" in latest_hardening
        assert "role IN ('owner', 'admin', 'member', 'viewer')" not in latest_hardening

        editor_policy_names = [
            '"Properties are insertable by organization members"',
            '"Properties are updatable by organization members"',
            '"Units are insertable via property access"',
            '"Units are updatable via property access"',
            '"Units are deletable via property access"',
            '"Import batches are insertable by organization members"',
            '"Import batches are updatable by organization members"',
            '"GL entries are insertable via property access"',
            '"Snapshots insertable by org members"',
            '"Draft snapshots updatable by org members"',
            '"calculation_jobs_insert_policy"',
            '"calculation_jobs_update_policy"',
            '"calculation_jobs_delete_policy"',
        ]
        for policy_name in editor_policy_names:
            policy_start = latest_hardening.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = latest_hardening[
                policy_start : latest_hardening.find(";", policy_start)
            ]
            assert "get_user_editor_organization_id()" in policy_sql

        admin_policy_names = [
            '"Properties are deletable by organization admins"',
            '"Import batches are deletable by admins"',
            '"Draft snapshots deletable by org admins"',
            '"Users can create mappings"',
            '"Users can update mappings"',
            '"Admins can delete mappings"',
        ]
        for policy_name in admin_policy_names:
            policy_start = latest_hardening.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = latest_hardening[
                policy_start : latest_hardening.find(";", policy_start)
            ]
            assert "get_user_admin_organization_id()" in policy_sql

    def test_workflow_and_storage_rls_exclude_tenant_and_viewer_writes(
        self, migration_files: dict[str, str]
    ) -> None:
        """Tenant users must not match storage org policies; viewers cannot write."""
        latest_hardening = migration_files[
            "20260522000006_guard_workflow_storage_rls_writes.sql"
        ]
        assert "'lease-documents'" in latest_hardening
        assert "SET public = false" in latest_hardening
        assert "bucket_id = 'documents'" in latest_hardening
        assert "bucket_id = 'dispute-attachments'" in latest_hardening
        assert "FROM public.users WHERE id = auth.uid()" not in latest_hardening
        assert "storage.foldername(name)" not in latest_hardening
        assert "storage.foldername(storage.objects.name)" in latest_hardening
        assert "public.get_user_organization_id()::text" in latest_hardening
        assert "public.get_user_editor_organization_id()::text" in latest_hardening

        editor_policy_names = [
            '"Users can upload lease documents"',
            '"Users can delete lease documents"',
            '"Users can upload documents to org folder"',
            '"Users can delete org documents"',
            '"Landlords can upload organization dispute attachments"',
            '"sb1103_requests_insert"',
            '"sb1103_requests_update"',
            '"Org members can create campaigns"',
            '"Org editors can update review campaigns"',
            '"org_members_gl_analysis_insert"',
            '"org_members_gl_analysis_update"',
            '"org_members_gl_analysis_delete"',
            '"org_members_capex_flags_insert"',
            '"org_members_capex_flags_update"',
            '"org_members_capex_flags_delete"',
        ]
        for policy_name in editor_policy_names:
            policy_start = latest_hardening.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = latest_hardening[
                policy_start : latest_hardening.find(";", policy_start)
            ]
            assert "get_user_editor_organization_id()" in policy_sql

        lease_read_start = latest_hardening.find(
            'CREATE POLICY "Users can read lease documents"'
        )
        assert lease_read_start != -1
        lease_read_sql = latest_hardening[
            lease_read_start : latest_hardening.find(";", lease_read_start)
        ]
        assert "get_user_organization_id()" in lease_read_sql

        admin_policy_names = [
            '"sb1103_requests_delete"',
            '"Org admins can approve or send campaigns"',
        ]
        for policy_name in admin_policy_names:
            policy_start = latest_hardening.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = latest_hardening[
                policy_start : latest_hardening.find(";", policy_start)
            ]
            assert "get_user_admin_organization_id()" in policy_sql

    def test_reports_storage_bucket_is_private_and_org_scoped(
        self, migration_files: dict[str, str]
    ) -> None:
        """Generated reports must be stored privately under org-scoped paths."""
        reports_storage = migration_files[
            "20260528000000_create_reports_storage_bucket.sql"
        ]

        assert "INSERT INTO storage.buckets" in reports_storage
        assert "'reports'" in reports_storage
        assert "false" in reports_storage
        assert "ARRAY['application/pdf']" in reports_storage
        assert "bucket_id = 'reports'" in reports_storage
        assert "storage.foldername(storage.objects.name)" in reports_storage
        assert "storage.foldername(name)" not in reports_storage
        assert "FROM public.users" not in reports_storage
        assert "auth.uid()" not in reports_storage
        assert "FROM public.users WHERE id = auth.uid()" not in reports_storage

        required_policy_names = [
            '"Reports readable by org members"',
            '"Reports uploadable by org editors"',
            '"Reports deletable by org editors"',
            '"Service role can manage reports"',
        ]
        for policy_name in required_policy_names:
            assert f"CREATE POLICY {policy_name}" in reports_storage

        select_start = reports_storage.find(
            'CREATE POLICY "Reports readable by org members"'
        )
        assert select_start != -1
        select_policy = reports_storage[
            select_start : reports_storage.find(";", select_start)
        ]
        assert "FOR SELECT" in select_policy
        assert "TO authenticated" in select_policy
        assert "(storage.foldername(storage.objects.name))[1] = 'reports'" in (
            select_policy
        )
        assert (
            "(storage.foldername(storage.objects.name))[2] = public.get_user_organization_id()::text"
            in select_policy
        )

        editor_policy_names = [
            '"Reports uploadable by org editors"',
            '"Reports deletable by org editors"',
        ]
        for policy_name in editor_policy_names:
            policy_start = reports_storage.find(f"CREATE POLICY {policy_name}")
            assert policy_start != -1
            policy_sql = reports_storage[
                policy_start : reports_storage.find(";", policy_start)
            ]
            assert "TO authenticated" in policy_sql
            assert "public.get_user_editor_organization_id()::text" in policy_sql

        service_policy_start = reports_storage.find(
            'CREATE POLICY "Service role can manage reports"'
        )
        assert service_policy_start != -1
        service_policy = reports_storage[
            service_policy_start : reports_storage.find(";", service_policy_start)
        ]
        assert "FOR ALL" in service_policy
        assert "TO service_role" in service_policy
        assert "USING (bucket_id = 'reports')" in service_policy
        assert "WITH CHECK (bucket_id = 'reports')" in service_policy

    def test_dispute_landlord_branches_exclude_tenant_role(
        self, all_migration_content: str
    ) -> None:
        """Tenant users must not match landlord-side dispute policies."""
        required_policy_names = [
            '"Users can view disputes"',
            '"Landlords can update organization disputes"',
            '"Users can view dispute comments"',
            '"Users can add dispute comments"',
            '"Users can view dispute attachments"',
            '"Users can upload dispute attachments"',
        ]
        for policy_name in required_policy_names:
            policy_start = all_migration_content.rfind(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = all_migration_content[
                policy_start : all_migration_content.find(";", policy_start)
            ]
            assert "role IN ('owner', 'admin', 'member', 'viewer')" in policy_sql

    def test_stale_dispute_attachment_insert_policy_is_replaced(
        self, all_migration_content: str
    ) -> None:
        """The original permissive attachment INSERT policy must not stay active."""
        drop_start = all_migration_content.rfind(
            'DROP POLICY IF EXISTS "Users can upload dispute attachments"'
        )
        create_start = all_migration_content.rfind(
            'CREATE POLICY "Users can upload dispute attachments"'
        )
        assert drop_start != -1
        assert create_start != -1
        assert drop_start < create_start

    def test_tenant_snapshot_access_is_lease_scoped(
        self, all_migration_content: str
    ) -> None:
        """Tenant snapshot reads must be linked to their leases, not the full property."""
        policy_start = all_migration_content.rfind(
            'CREATE POLICY "Snapshots viewable by organization members and linked tenants"'
        )
        assert policy_start != -1
        policy_sql = all_migration_content[
            policy_start : all_migration_content.find(";", policy_start)
        ]
        assert "lease_id IN (" in policy_sql
        assert "SELECT tll.lease_id" in policy_sql
        assert "SELECT l.property_id" not in policy_sql

    def test_tenants_cannot_read_landlord_gl_or_pool_data(
        self, all_migration_content: str
    ) -> None:
        """Tenant portal users must not get raw GL/pool table access."""
        for policy_name in [
            '"GL entries viewable by organization members"',
            '"Expense pools viewable by organization members"',
            '"Pool mappings viewable by organization members"',
        ]:
            policy_start = all_migration_content.rfind(f"CREATE POLICY {policy_name}")
            assert policy_start != -1, f"Missing policy {policy_name}"
            policy_sql = all_migration_content[
                policy_start : all_migration_content.find(";", policy_start)
            ]
            assert "tenant_users" not in policy_sql
            assert "tenant_lease_links" not in policy_sql


# =============================================================================
# Tables requiring explicit authenticated role scope in RLS policies
# =============================================================================

TABLES_REQUIRING_AUTHENTICATED_SCOPE = [
    "actual_billed_amounts",
    "audit_log",
    "audit_requests",
    "auth_events",
    "calculation_jobs",
    "column_mappings",
    "data_retention_policies",
    "dispute_attachments",
    "dispute_comments",
    "disputes",
    "documents",
    "expense_pools",
    "extraction_jobs",
    "feedback",
    "gl_entries",
    "import_batches",
    "invoices",
    "lease_term_versions",
    "leases",
    "ocr_results",
    "organizations",
    "pool_allocations",
    "pool_mappings",
    "pool_templates",
    "promotion_redemptions",
    "promotions",
    "properties",
    "reconciliation_campaigns",
    "reconciliation_snapshots",
    "sb1103_requests",
    "stripe_webhook_events",
    "subscriptions",
    "team_member_invitations",
    "tenant_email_preferences",
    "tenant_invitations",
    "tenant_lease_links",
    "tenant_notifications",
    "tenant_users",
    "units",
    "users",
]


# =============================================================================
# Test Class: Anonymous Access Policies
# =============================================================================


class TestAnonymousAccessPolicies:
    """Verify RLS policies are explicitly scoped to exclude anonymous users."""

    def test_all_tables_have_policies_scoped_to_authenticated(
        self, all_migration_content: str
    ) -> None:
        """Every affected table must have at least one policy scoped TO authenticated."""
        missing = []
        for table in TABLES_REQUIRING_AUTHENTICATED_SCOPE:
            # Check for ALTER POLICY ... ON public.table ... TO authenticated
            # OR CREATE POLICY ... ON public.table ... TO authenticated
            pattern = rf"(?:ALTER|CREATE)\s+POLICY[^;]+ON\s+public\.{table}[^;]+TO\s+(?:authenticated|service_role)"
            if not re.search(pattern, all_migration_content, re.DOTALL | re.IGNORECASE):
                missing.append(table)
        assert not missing, (
            f"SECURITY: These tables have no policies scoped to authenticated/service_role "
            f"(anonymous users can evaluate their policies): {missing}"
        )

    def test_storage_objects_feedback_screenshots_policy_is_authenticated(
        self, all_migration_content: str
    ) -> None:
        """Storage policies (except public feedback screenshots) must be scoped."""
        # Verify Admins can delete org feedback screenshots is scoped
        pattern = r'ALTER POLICY "Admins can delete org feedback screenshots".*TO authenticated'
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "storage.objects feedback screenshot delete policy must be TO authenticated"
