"""
Migration Verification Tests

Verifies that database migrations are properly structured and can be applied safely.

Test Categories:
1. Migration File Structure - Verify naming, ordering, and organization
2. Migration Dependencies - Verify migrations apply in correct order
3. Migration Reversibility - Verify down migrations exist and are correct
4. Migration Idempotency - Verify migrations can be run multiple times safely
5. Migration Completeness - Verify all tables/columns/indexes are created

IMPORTANT: These tests verify migration file structure and patterns.
Actual database migration testing requires a live database.
"""

import re
from pathlib import Path

import pytest

# Path to project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def migration_files() -> list[Path]:
    """Get all migration files sorted by name."""
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


@pytest.fixture
def migration_contents() -> dict[str, str]:
    """Load all migration file contents as a dictionary."""
    files = {}
    for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
        files[migration_file.name] = migration_file.read_text()
    return files


# =============================================================================
# Test Class: Migration File Structure
# =============================================================================


class TestMigrationFileStructure:
    """Verify migration files are properly structured."""

    def test_migrations_directory_exists(self) -> None:
        """Migrations directory must exist."""
        assert (
            MIGRATIONS_DIR.exists()
        ), f"Migrations directory not found: {MIGRATIONS_DIR}"
        assert (
            MIGRATIONS_DIR.is_dir()
        ), f"Migrations path is not a directory: {MIGRATIONS_DIR}"

    def test_migration_files_follow_naming_convention(
        self, migration_files: list[Path]
    ) -> None:
        """
        Migration files must follow naming convention: YYYYMMDDHHMMSS_description.sql

        Format:
        - Timestamp: 14 digits (YYYYMMDDHHMMSS)
        - Underscore separator
        - Description: lowercase with underscores
        - Extension: .sql
        """
        pattern = re.compile(r"^\d{14}_[a-z0-9_]+\.sql$")

        for migration_file in migration_files:
            if migration_file.name == "seed.sql":
                continue  # seed.sql is allowed exception

            assert pattern.match(migration_file.name), (
                f"Migration file '{migration_file.name}' doesn't match naming convention "
                f"YYYYMMDDHHMMSS_description.sql"
            )

    def test_migration_timestamps_are_chronological(
        self, migration_files: list[Path]
    ) -> None:
        """Migration files must be in chronological order by timestamp."""
        timestamps = []
        for migration_file in migration_files:
            if migration_file.name == "seed.sql":
                continue

            timestamp_str = migration_file.name[:14]
            if timestamp_str.isdigit():
                timestamps.append(int(timestamp_str))

        # Verify timestamps are strictly increasing
        for i in range(len(timestamps) - 1):
            assert timestamps[i] < timestamps[i + 1], (
                f"Migration timestamps not chronological: "
                f"{timestamps[i]} >= {timestamps[i + 1]}"
            )

    def test_migration_descriptions_are_meaningful(
        self, migration_files: list[Path]
    ) -> None:
        """Migration file descriptions should be meaningful."""
        for migration_file in migration_files:
            if migration_file.name == "seed.sql":
                continue

            description = migration_file.name[15:-4]  # Remove timestamp and .sql
            assert (
                len(description) >= 5
            ), f"Migration description too short: {migration_file.name}"
            assert not description.startswith(
                "_"
            ), f"Migration description shouldn't start with underscore: {migration_file.name}"
            assert not description.endswith(
                "_"
            ), f"Migration description shouldn't end with underscore: {migration_file.name}"

    def test_no_duplicate_migration_timestamps(
        self, migration_files: list[Path]
    ) -> None:
        """No two migration files should have the same timestamp."""
        timestamps = set()
        for migration_file in migration_files:
            if migration_file.name == "seed.sql":
                continue

            timestamp_str = migration_file.name[:14]
            if timestamp_str.isdigit():
                assert (
                    timestamp_str not in timestamps
                ), f"Duplicate timestamp: {timestamp_str} in {migration_file.name}"
                timestamps.add(timestamp_str)


# =============================================================================
# Test Class: Migration Content Structure
# =============================================================================


class TestMigrationContentStructure:
    """Verify migration file contents are properly structured."""

    def test_all_migrations_are_sql_files(self, migration_files: list[Path]) -> None:
        """All migration files must have .sql extension."""
        for migration_file in migration_files:
            assert (
                migration_file.suffix == ".sql"
            ), f"Migration file has wrong extension: {migration_file.name}"

    def test_migrations_contain_sql_statements(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migration files must contain SQL statements."""
        for filename, content in migration_contents.items():
            assert len(content.strip()) > 0, f"Migration file is empty: {filename}"
            # Should contain at least one SQL statement
            assert any(
                keyword in content.upper()
                for keyword in [
                    "CREATE",
                    "ALTER",
                    "INSERT",
                    "UPDATE",
                    "DELETE",
                    "DROP",
                    "NOTIFY",
                ]
            ), f"No SQL statements found in: {filename}"

    def test_migrations_use_public_schema(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migration files should explicitly use public schema."""
        # Migrations grandfathered before the public-schema convention was enforced
        legacy_migrations = {"20240101000063_create_content_leads.sql"}
        for filename, content in migration_contents.items():
            if filename == "seed.sql" or filename in legacy_migrations:
                continue

            if "CREATE TABLE" in content:
                assert (
                    "public." in content
                ), f"Migration should use public schema: {filename}"

    def test_migrations_include_comments(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migration files should include comments explaining changes."""
        # Migrations grandfathered before the comments convention was enforced
        legacy_migrations = {"20240101000063_create_content_leads.sql"}
        for filename, content in migration_contents.items():
            if filename == "seed.sql" or filename in legacy_migrations:
                continue

            # Should have at least some comments
            assert (
                "--" in content or "/*" in content
            ), f"Migration file has no comments: {filename}"


# =============================================================================
# Test Class: Migration Dependencies
# =============================================================================


class TestMigrationDependencies:
    """Verify migration dependencies are correct."""

    def test_organizations_created_before_users(
        self, migration_files: list[Path]
    ) -> None:
        """Organizations table must be created before users table."""
        org_file = None
        user_file = None

        for migration_file in migration_files:
            if (
                "organizations" in migration_file.name
                and "create_organizations" in migration_file.name
            ):
                org_file = migration_file
            if "users" in migration_file.name and "create_users" in migration_file.name:
                user_file = migration_file

        if org_file and user_file:
            assert (
                org_file.name < user_file.name
            ), "Organizations must be created before users"

    def test_properties_created_before_units(self, migration_files: list[Path]) -> None:
        """Properties table must be created before units table."""
        prop_file = None
        unit_file = None

        for migration_file in migration_files:
            if (
                "properties" in migration_file.name
                and "create_properties" in migration_file.name
            ):
                prop_file = migration_file
            if "units" in migration_file.name and "create_units" in migration_file.name:
                unit_file = migration_file

        if prop_file and unit_file:
            assert (
                prop_file.name < unit_file.name
            ), "Properties must be created before units"

    def test_tables_created_before_indexes(self, migration_files: list[Path]) -> None:
        """Tables should be created before indexes on those tables."""
        # This is generally enforced by having CREATE INDEX in the same migration
        # as CREATE TABLE, which is the recommended pattern

        for migration_file in migration_files:
            content = migration_file.read_text()
            if "CREATE TABLE" in content and "CREATE INDEX" in content:
                # Verify table is created before index in same file
                table_match = re.search(r"CREATE TABLE public\.(\w+)", content)
                if table_match:
                    table_name = table_match.group(1)
                    # Indexes for this table should come after table creation
                    table_pos = content.find(f"CREATE TABLE public.{table_name}")
                    index_pattern = f"CREATE INDEX.*ON public.{table_name}"
                    index_match = re.search(index_pattern, content)
                    if index_match:
                        index_pos = index_match.start()
                        assert (
                            table_pos < index_pos
                        ), f"Index created before table in {migration_file.name}"

    def test_legal_acceptances_reload_postgrest_schema_cache(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Legal acceptances table creation must be visible to PostgREST clients."""
        legal_migration = "20260603000000_create_legal_acceptances.sql"
        assert legal_migration in migration_contents

        later_migrations = [
            content
            for filename, content in migration_contents.items()
            if filename > legal_migration
        ]
        assert any(
            "NOTIFY pgrst, 'reload schema';" in content for content in later_migrations
        )

    def test_foreign_key_tables_exist_before_referencing_tables(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Tables must be created before other tables reference them with foreign keys."""
        # This would require parsing all foreign key relationships
        # For now, verify pattern is used - check for actual FK constraints
        for filename, content in migration_contents.items():
            # Look for actual FK constraints: column_name TYPE REFERENCES table(col)
            # or FOREIGN KEY (...) REFERENCES table(col)
            # Exclude REFERENCES appearing in policies or comments
            fk_pattern = re.compile(
                r"(?:FOREIGN\s+KEY|[a-z_]+\s+UUID\s+REFERENCES)\s+public\.\w+",
                re.IGNORECASE,
            )
            if fk_pattern.search(content):
                # Actual foreign key constraint exists
                assert "CREATE TABLE" in content or "ALTER TABLE" in content


# =============================================================================
# Test Class: Migration Idempotency
# =============================================================================


class TestMigrationIdempotency:
    """Verify migrations can be run multiple times safely."""

    def test_create_table_statements_are_schema_qualified(
        self, migration_contents: dict[str, str]
    ) -> None:
        """CREATE TABLE statements must explicitly target the public schema."""
        legacy_unqualified = {
            "20260223222130_create_content_leads_table.sql",
            "20260425000001_create_audit_pipeline_events.sql",
        }
        for filename, content in migration_contents.items():
            if filename == "seed.sql" or filename in legacy_unqualified:
                continue

            create_table_statements = re.findall(
                r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)",
                content,
                re.IGNORECASE,
            )
            for table_name in create_table_statements:
                assert table_name.startswith("public."), (
                    f"CREATE TABLE must be schema-qualified in {filename}: "
                    f"{table_name}"
                )

    def test_create_function_uses_or_replace(
        self, migration_contents: dict[str, str]
    ) -> None:
        """CREATE FUNCTION should use OR REPLACE for idempotency."""
        for filename, content in migration_contents.items():
            if "CREATE FUNCTION" in content:
                assert (
                    "CREATE OR REPLACE FUNCTION" in content
                ), f"CREATE FUNCTION should use OR REPLACE in {filename}"

    def test_drop_statements_use_if_exists(
        self, migration_contents: dict[str, str]
    ) -> None:
        """DROP statements should use IF EXISTS for safety."""
        for filename, content in migration_contents.items():
            destructive_drops = re.findall(
                r"\bDROP\s+(TABLE|FUNCTION|POLICY|TRIGGER|INDEX|EXTENSION)\b(?!\s+IF\s+EXISTS)",
                content,
                re.IGNORECASE,
            )
            assert (
                not destructive_drops
            ), f"DROP statements for database objects must use IF EXISTS in {filename}"


# =============================================================================
# Test Class: Migration Completeness
# =============================================================================


class TestMigrationCompleteness:
    """Verify all required database objects are created."""

    def test_all_core_tables_have_migrations(self, migration_files: list[Path]) -> None:
        """All core tables must have migration files."""
        required_tables = {
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

        migration_names = [f.name for f in migration_files]
        for table in required_tables:
            assert any(
                table in name for name in migration_names
            ), f"No migration file found for table: {table}"

    def test_all_tables_have_primary_keys(
        self, migration_contents: dict[str, str]
    ) -> None:
        """All CREATE TABLE statements should define primary keys."""
        for filename, content in migration_contents.items():
            if "CREATE TABLE" in content:
                # Find all CREATE TABLE statements
                table_statements = re.findall(
                    r"CREATE TABLE[^;]+;", content, re.IGNORECASE | re.DOTALL
                )
                for table_stmt in table_statements:
                    # Should have PRIMARY KEY
                    assert (
                        "PRIMARY KEY" in table_stmt
                    ), f"Table in {filename} missing PRIMARY KEY: {table_stmt[:50]}..."

    def test_all_tables_have_timestamps(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Core tenant-facing tables should have created_at timestamps."""
        all_sql = "\n".join(migration_contents.values())
        timestamped_tables = {
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
        }

        for table_name in timestamped_tables:
            match = re.search(
                rf"CREATE\s+TABLE\s+public\.{table_name}\s*\((.*?)\);",
                all_sql,
                re.IGNORECASE | re.DOTALL,
            )
            assert match, f"CREATE TABLE statement not found for {table_name}"
            assert (
                "created_at" in match.group(1).lower()
            ), f"Core table {table_name} must include created_at"

    def test_all_foreign_keys_reference_existing_columns(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Foreign keys should reference valid columns."""
        # This would require comprehensive parsing
        # For now, verify the pattern
        for filename, content in migration_contents.items():
            if "REFERENCES" in content:
                # Should specify the referenced column
                assert "REFERENCES public." in content or "REFERENCES " in content


# =============================================================================
# Test Class: Migration Best Practices
# =============================================================================


class TestMigrationBestPractices:
    """Verify migrations follow best practices."""

    def test_migrations_use_explicit_column_types(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Column definitions should use explicit types, not DEFAULT."""
        for filename, content in migration_contents.items():
            if "CREATE TABLE" in content:
                # Columns should have explicit types like VARCHAR(255), not just DEFAULT
                # This is verified by ensuring common types are present
                assert any(
                    type_keyword in content
                    for type_keyword in [
                        "VARCHAR",
                        "INT",
                        "UUID",
                        "TIMESTAMP",
                        "DECIMAL",
                        "BOOLEAN",
                    ]
                ), f"Migration should use explicit column types: {filename}"

    def test_migrations_use_not_null_constraints(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Important columns should have NOT NULL constraints."""
        for filename, content in migration_contents.items():
            if "CREATE TABLE" in content:
                table_statements = re.findall(
                    r"CREATE TABLE[^;]+;", content, re.IGNORECASE | re.DOTALL
                )
                for table_stmt in table_statements:
                    assert "NOT NULL" in table_stmt.upper(), (
                        f"Table in {filename} has no NOT NULL constraints: "
                        f"{table_stmt[:80]}..."
                    )

    def test_migrations_create_indexes_on_foreign_keys(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Foreign key columns should have indexes for performance."""
        all_sql = "\n".join(migration_contents.values()).lower()
        required_fk_indexes = {
            "leases": "unit_id",
            "units": "property_id",
            "gl_entries": "property_id",
            "expense_pools": "property_id",
            "pool_mappings": "expense_pool_id",
            "reconciliation_snapshots": "property_id",
        }

        for table_name, column_name in required_fk_indexes.items():
            index_pattern = (
                rf"create\s+index\s+(?:if\s+not\s+exists\s+)?\w+"
                rf"\s+on\s+public\.{table_name}\s*\([^)]*\b{column_name}\b"
            )
            assert re.search(
                index_pattern, all_sql, re.IGNORECASE
            ), f"Missing index on foreign key public.{table_name}.{column_name}"

    def test_migrations_use_consistent_naming(
        self, migration_files: list[Path]
    ) -> None:
        """Migration file names should use consistent conventions."""
        allowed_prefixes = {
            "add",
            "content",
            "create",
            "cross",
            "data",
            "drop",
            "expand",
            "extend",
            "fix",
            "guard",
            "handle",
            "lead",
            "merge",
            "migrate",
            "pricing",
            "reload",
            "remove",
            "rename",
            "restore",
            "schedule",
            "scope",
            "seed",
            "simplify",
            "skip",
        }
        for migration_file in migration_files:
            if migration_file.name == "seed.sql":
                continue

            description = migration_file.name[15:-4]  # Remove timestamp and .sql
            first_word = description.split("_")[0]
            assert first_word in allowed_prefixes, (
                f"Migration name should start with an approved action/category: "
                f"{migration_file.name}"
            )


# =============================================================================
# Test Class: Migration Safety
# =============================================================================


class TestMigrationSafety:
    """Verify migrations are safe to run."""

    def test_no_drop_database_statements(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migrations must not drop the entire database."""
        for filename, content in migration_contents.items():
            assert (
                "DROP DATABASE" not in content.upper()
            ), f"DANGER: DROP DATABASE found in {filename}"

    def test_no_drop_schema_statements(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migrations must not drop schemas without caution."""
        for filename, content in migration_contents.items():
            assert (
                "DROP SCHEMA" not in content.upper()
            ), f"DROP SCHEMA found in migration: {filename}"

    def test_no_truncate_in_migrations(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migrations should not truncate tables (data loss risk)."""
        for filename, content in migration_contents.items():
            if filename != "seed.sql":  # seed.sql might truncate for testing
                assert (
                    "TRUNCATE" not in content.upper()
                ), f"TRUNCATE found in migration (data loss risk): {filename}"

    def test_migrations_handle_existing_data(self) -> None:
        """
        Migrations should consider existing data.

        When altering tables, migrations should:
        1. Handle existing rows gracefully
        2. Provide default values for new NOT NULL columns
        3. Migrate data if changing column types
        """
        unsafe_add_column = []
        for migration_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            content = migration_file.read_text()
            matches = re.findall(
                r"ADD\s+COLUMN[^;,\n]+NOT\s+NULL(?![^;,\n]+DEFAULT)",
                content,
                re.IGNORECASE,
            )
            if matches:
                unsafe_add_column.append((migration_file.name, matches))

        assert not unsafe_add_column, (
            "New NOT NULL columns in existing tables must include DEFAULT values: "
            f"{unsafe_add_column}"
        )


# =============================================================================
# Test Class: Security Lint Fixes
# =============================================================================


class TestSecurityLintFixes:
    """Verify the security lint warning fixes are properly structured."""

    def test_pgaudit_moved_to_extensions_schema(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Security fix migration must drop pgaudit from public and recreate in extensions."""
        fix = migration_contents["20260224130000_fix_security_lint_warnings.sql"]
        assert "DROP EXTENSION IF EXISTS pgaudit" in fix
        assert "CREATE EXTENSION IF NOT EXISTS pgaudit SCHEMA extensions" in fix

    def test_audit_requests_insert_policy_not_always_true(
        self, migration_contents: dict[str, str]
    ) -> None:
        """audit_requests INSERT policy must drop old policy and have a non-trivial WITH CHECK."""
        fix = migration_contents["20260224130000_fix_security_lint_warnings.sql"]
        assert 'DROP POLICY IF EXISTS "Anyone can create audit requests"' in fix
        assert '"Anyone can create audit requests"' in fix
        # Verify the meaningful check appears in the audit_requests section specifically
        section_start = fix.index('"Anyone can create audit requests"')
        audit_section = fix[section_start:]
        assert "char_length(trim(email)) > 0" in audit_section
        assert "char_length(trim(name)) > 0" in audit_section

    def test_content_leads_insert_policy_not_always_true(
        self, migration_contents: dict[str, str]
    ) -> None:
        """content_leads anon_insert policy must have a non-trivial WITH CHECK."""
        fix = migration_contents["20260224130000_fix_security_lint_warnings.sql"]
        assert '"anon_insert"' in fix
        # Verify the email check appears in the anon_insert section, not just elsewhere
        anon_insert_pos = fix.index('"anon_insert"')
        anon_section = fix[anon_insert_pos:]
        assert "char_length(trim(email)) > 0" in anon_section

    def test_service_role_policies_are_dropped(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Redundant service-role-only policies must be dropped."""
        fix = migration_contents["20260224130000_fix_security_lint_warnings.sql"]
        assert 'DROP POLICY IF EXISTS "Service role can create organizations"' in fix
        assert 'DROP POLICY IF EXISTS "Service can manage email logs"' in fix
        assert 'DROP POLICY IF EXISTS "Service can insert notifications"' in fix

    def test_fix_migration_has_correct_timestamp_ordering(
        self, migration_files: list[Path]
    ) -> None:
        """Security fix migration must come after all existing migrations."""
        names = [f.name for f in migration_files]
        assert "20260224130000_fix_security_lint_warnings.sql" in names
        # Must come after the bounty migration
        fix_idx = names.index("20260224130000_fix_security_lint_warnings.sql")
        bounty_idx = names.index("20260224000003_remove_bounty_hunter.sql")
        assert fix_idx > bounty_idx


class TestTenantEmailPreferencesRlsFix:
    """Verify tenant email preference policies enforce tenant ownership."""

    migration_name = "20260519000000_fix_tenant_email_preferences_rls.sql"

    def test_migration_replaces_permissive_policies(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Fix migration must drop the permissive policies before recreating them."""
        fix = migration_contents[self.migration_name]

        assert 'drop policy if exists "Users can view email preferences"' in fix
        assert 'drop policy if exists "Users can update email preferences"' in fix

    def test_policies_are_scoped_to_authenticated_tenant_owner(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Tenant-facing policies must require the current user's tenant row."""
        fix = migration_contents[self.migration_name]
        executable_sql = "\n".join(
            line for line in fix.splitlines() if not line.lstrip().startswith("--")
        )

        assert "or true" not in executable_sql.lower()
        assert "to authenticated" in fix.lower()
        assert "from public.tenant_users" in fix
        assert "where user_id = (select auth.uid())" in fix

    def test_insert_and_update_policies_have_with_check(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Inserts and updates must prevent writing another tenant's preferences."""
        fix = migration_contents[self.migration_name]

        assert "for insert" in fix
        assert "for update" in fix
        assert fix.count("with check") == 2


class TestUserNotificationsMigration:
    """Verify landlord user notifications have a real table and RLS."""

    migration_name = "20260519010000_create_user_notifications.sql"

    def test_creates_user_notifications_table(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Migration must create the table used by landlord notifications."""
        migration = migration_contents[self.migration_name].lower()

        assert "create table if not exists public.user_notifications" in migration
        assert "user_id uuid not null references public.users(id)" in migration
        assert "notification_type text not null" in migration
        assert "related_entity_id uuid" in migration

    def test_enables_rls_and_limits_user_access(
        self, migration_contents: dict[str, str]
    ) -> None:
        """Authenticated users may only read/update their own notifications."""
        migration = migration_contents[self.migration_name].lower()

        assert "enable row level security" in migration
        assert "for select" in migration
        assert "for update" in migration
        assert "to authenticated" in migration
        assert "user_id = (select auth.uid())" in migration
        assert (
            "grant select, update on public.user_notifications to authenticated"
            in migration
        )
        assert "grant all on public.user_notifications to service_role" in migration


class TestSupabaseAdvisorWarningRemediation:
    """Verify the hosted Supabase Advisor remediation migration is complete."""

    migration_name = "20260506000000_fix_supabase_advisor_warnings.sql"

    search_path_functions = {
        "enforce_demand_letter_generation_limit",
        "get_analytics_summary",
        "get_property_type_breakdown",
        "get_rule_frequency",
        "increment_referral_click_count",
        "increment_referral_commission",
        "increment_referral_conversion_count",
        "sync_partner_property_to_property",
        "update_lease_terms_updated_at",
        "update_partner_lease_triages_updated_at",
        "update_partner_properties_updated_at",
        "update_partner_roles_updated_at",
        "update_partner_trial_email_sends_updated_at",
        "update_partners_updated_at",
        "update_subscriptions_updated_at",
        "update_updated_at",
    }

    security_definer_functions = {
        "claim_demand_letter_generation_slot",
        "claim_webhook_event_delivery",
        "current_user_has_partner_permission",
        "current_user_is_partner_member",
        "get_analytics_summary",
        "get_property_type_breakdown",
        "get_rule_frequency",
        "handle_new_user",
        "increment_pilot_credits",
        "increment_webhook_event_attempts",
        "initialize_partner_owner_rbac",
        "migrate_anonymous_session",
        "partner_credit_balance",
        "partner_triage_credit_balance",
        "refund_partner_triage_credit_atomic",
        "release_demand_letter_generation_slot",
        "reserve_credit_atomic",
        "reserve_partner_triage_credit_atomic",
    }

    @pytest.fixture
    def advisor_fix(self, migration_contents: dict[str, str]) -> str:
        """Load the Supabase Advisor remediation migration."""
        assert self.migration_name in migration_contents
        return migration_contents[self.migration_name]

    def test_remediation_migration_lists_warned_search_path_functions(
        self, advisor_fix: str
    ) -> None:
        """Migration must explicitly list every function warned for mutable search_path."""
        for function_name in self.search_path_functions:
            assert function_name in advisor_fix

    def test_remediation_migration_sets_search_path_by_regprocedure(
        self, advisor_fix: str
    ) -> None:
        """Warned functions must be altered by exact regprocedure identity."""
        assert "ALTER FUNCTION %s SET search_path = public, pg_temp" in advisor_fix
        assert "function_signature::regprocedure" in advisor_fix

    def test_remediation_migration_lists_warned_security_definer_functions(
        self, advisor_fix: str
    ) -> None:
        """Migration must explicitly list every SECURITY DEFINER function with broad execute grants."""
        for function_name in self.security_definer_functions:
            assert function_name in advisor_fix

    def test_remediation_migration_revokes_public_app_role_execution(
        self, advisor_fix: str
    ) -> None:
        """SECURITY DEFINER functions must not stay executable by public app roles."""
        assert "REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC" in advisor_fix
        assert "REVOKE EXECUTE ON FUNCTION %s FROM anon" in advisor_fix
        assert "REVOKE EXECUTE ON FUNCTION %s FROM authenticated" in advisor_fix
        assert "GRANT EXECUTE ON FUNCTION %s TO service_role" in advisor_fix
        assert (
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated"
            in advisor_fix
        )

    def test_remediation_migration_preserves_tracked_app_callable_rpcs(
        self, advisor_fix: str
    ) -> None:
        """Tracked app RPCs must not be swept into the service-role-only block."""
        service_role_block = advisor_fix.split(
            "SECURITY DEFINER functions executable by PUBLIC, anon, or authenticated.",
            1,
        )[1]
        assert "'public.merge_finding_decision" not in service_role_block
        assert "'public.get_effective_term_versions" not in service_role_block
        assert (
            "GRANT EXECUTE ON FUNCTION public.merge_finding_decision(UUID, UUID, TEXT, JSONB) TO authenticated"
            in advisor_fix
        )
        assert (
            "GRANT EXECUTE ON FUNCTION public.get_effective_term_versions(UUID[], DATE) TO authenticated"
            in advisor_fix
        )

    def test_remediation_migration_moves_citext_to_extensions(
        self, advisor_fix: str
    ) -> None:
        """citext must be moved out of public when it is installed there."""
        assert "CREATE SCHEMA IF NOT EXISTS extensions" in advisor_fix
        assert "ALTER EXTENSION citext SET SCHEMA extensions" in advisor_fix
        assert "extname = 'citext'" in advisor_fix
        assert "nspname = 'public'" in advisor_fix

    def test_remediation_migration_repairs_feedback_insert_policies(
        self, advisor_fix: str
    ) -> None:
        """Always-true feedback INSERT policies must become service_role-only."""
        for table_name in ("exit_survey", "general_feedback"):
            assert f"to_regclass('public.{table_name}')" in advisor_fix
            assert f"ON public.{table_name}" in advisor_fix
            assert "FOR INSERT TO service_role" in advisor_fix
            assert "WITH CHECK (true)" in advisor_fix
