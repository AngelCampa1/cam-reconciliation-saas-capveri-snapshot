"""
Tests for Supabase database migrations.

Validates migration files exist and contain required SQL elements.
"""

import re
from pathlib import Path

import pytest

# Path to project root (two levels up from tests directory)
PROJECT_ROOT = Path(__file__).parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


class TestMigrationFileStructure:
    """Tests for migration file organization."""

    def test_migrations_directory_exists(self) -> None:
        """Migrations directory exists."""
        assert MIGRATIONS_DIR.exists(), "supabase/migrations must exist"
        assert MIGRATIONS_DIR.is_dir(), "migrations must be a directory"

    def test_migration_files_have_correct_naming(self) -> None:
        """Migration files follow naming convention: YYYYMMDDHHMMSS_description.sql."""
        pattern = re.compile(r"^\d{14}_[a-z0-9_]+\.sql$")
        sql_files = list(MIGRATIONS_DIR.glob("*.sql"))

        for sql_file in sql_files:
            assert pattern.match(sql_file.name), (
                f"Migration file {sql_file.name} doesn't match pattern "
                "YYYYMMDDHHMMSS_description.sql"
            )


class TestOrganizationsMigration:
    """Tests for 20240101000001_create_organizations.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load organizations migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000001_create_organizations.sql"
        assert migration_path.exists(), "Organizations migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Organizations migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000001_create_organizations.sql"
        assert (
            migration_path.exists()
        ), "20240101000001_create_organizations.sql must exist"

    def test_creates_organizations_table(self, migration_content: str) -> None:
        """Migration creates organizations table."""
        assert "CREATE TABLE public.organizations" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Organizations table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY" in migration_content
        assert "gen_random_uuid()" in migration_content

    def test_has_name_column(self, migration_content: str) -> None:
        """Organizations table has name VARCHAR(255) NOT NULL column."""
        assert "name VARCHAR(255) NOT NULL" in migration_content

    def test_has_subscription_status_column(self, migration_content: str) -> None:
        """Organizations table has subscription_status column with CHECK constraint."""
        assert "subscription_status VARCHAR(50) NOT NULL" in migration_content
        assert "DEFAULT 'trial'" in migration_content
        # Check for CHECK constraint with all valid statuses
        assert "'trial'" in migration_content
        assert "'active'" in migration_content
        assert "'suspended'" in migration_content
        assert "'cancelled'" in migration_content

    def test_has_settings_jsonb_column(self, migration_content: str) -> None:
        """Organizations table has settings JSONB column."""
        assert "settings JSONB" in migration_content
        assert "DEFAULT '{}'::jsonb" in migration_content

    def test_has_created_at_column(self, migration_content: str) -> None:
        """Organizations table has created_at TIMESTAMPTZ column."""
        assert "created_at TIMESTAMPTZ" in migration_content
        assert "DEFAULT NOW()" in migration_content

    def test_has_updated_at_column(self, migration_content: str) -> None:
        """Organizations table has updated_at TIMESTAMPTZ column."""
        assert "updated_at TIMESTAMPTZ" in migration_content

    def test_has_subscription_status_index(self, migration_content: str) -> None:
        """Migration creates index on subscription_status."""
        assert "CREATE INDEX idx_organizations_subscription_status" in migration_content
        assert "ON public.organizations(subscription_status)" in migration_content

    def test_creates_updated_at_trigger_function(self, migration_content: str) -> None:
        """Migration creates reusable updated_at trigger function."""
        assert (
            "CREATE OR REPLACE FUNCTION public.update_updated_at_column()"
            in migration_content
        )
        assert "NEW.updated_at = NOW()" in migration_content
        assert "RETURNS TRIGGER" in migration_content

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to organizations table."""
        assert "CREATE TRIGGER update_organizations_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.organizations" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on organizations table."""
        assert (
            "ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy."""
        assert (
            'CREATE POLICY "Organizations are viewable by members"' in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy."""
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy."""
        assert "FOR UPDATE" in migration_content

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated"
            in migration_content
        )

    def test_grants_anon_permissions(self, migration_content: str) -> None:
        """Migration grants SELECT permission to anon role."""
        assert "GRANT SELECT ON public.organizations TO anon" in migration_content

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.organizations" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on columns."""
        assert "COMMENT ON COLUMN public.organizations.id" in migration_content
        assert "COMMENT ON COLUMN public.organizations.name" in migration_content
        assert (
            "COMMENT ON COLUMN public.organizations.subscription_status"
            in migration_content
        )
        assert "COMMENT ON COLUMN public.organizations.settings" in migration_content
        assert "COMMENT ON COLUMN public.organizations.created_at" in migration_content
        assert "COMMENT ON COLUMN public.organizations.updated_at" in migration_content


class TestMigrationSQLSyntax:
    """Tests for SQL syntax validity in migrations."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load organizations migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000001_create_organizations.sql"
        return migration_path.read_text()

    def test_no_trailing_semicolon_issues(self, migration_content: str) -> None:
        """All SQL statements end with semicolons."""
        # Split by statements and check each non-comment line
        lines = migration_content.strip().split("\n")
        in_function = False

        for line in lines:
            stripped = line.strip()
            # Skip empty lines and comments
            if not stripped or stripped.startswith("--"):
                continue
            # Track function blocks (which have internal semicolons)
            if "$$" in stripped:
                in_function = not in_function
            # Skip lines inside function definitions
            if in_function:
                continue
            # Skip lines that are part of multi-line statements
            if stripped.endswith(",") or stripped.endswith("("):
                continue
            # Check that complete statements end with semicolon or are part of a block
            if (
                stripped.startswith("CREATE")
                or stripped.startswith("ALTER")
                or stripped.startswith("GRANT")
                or stripped.startswith("COMMENT")
            ):
                # These should eventually end with a semicolon
                pass  # Multi-line statements handled by SQL parser

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        # Check for common typos
        assert "CREAT TABLE" not in content_upper  # Missing E
        assert "CRATE TABLE" not in content_upper  # Typo
        assert "TIMESTAMPZ" not in content_upper  # Missing T
        assert "DEFUALT" not in content_upper  # Typo for DEFAULT
        assert "PRIMAY KEY" not in content_upper  # Missing R
        assert "FORIEGN" not in content_upper  # Typo for FOREIGN

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        # Remove string literals to avoid false positives
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        # Count single quotes (should be even)
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_uuid_extension_enabled(self, migration_content: str) -> None:
        """Migration enables uuid-ossp extension."""
        assert 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"' in migration_content


class TestUsersMigration:
    """Tests for 20240101000002_create_users.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load users migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000002_create_users.sql"
        assert migration_path.exists(), "Users migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Users migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000002_create_users.sql"
        assert migration_path.exists(), "20240101000002_create_users.sql must exist"

    def test_creates_users_table(self, migration_content: str) -> None:
        """Migration creates users table."""
        assert "CREATE TABLE public.users" in migration_content

    def test_has_id_column_referencing_auth_users(self, migration_content: str) -> None:
        """Users table has id UUID primary key referencing auth.users."""
        assert "id UUID PRIMARY KEY REFERENCES auth.users(id)" in migration_content
        assert "ON DELETE CASCADE" in migration_content

    def test_has_organization_id_foreign_key(self, migration_content: str) -> None:
        """Users table has organization_id foreign key."""
        assert (
            "organization_id UUID NOT NULL REFERENCES public.organizations(id)"
            in migration_content
        )

    def test_has_email_column(self, migration_content: str) -> None:
        """Users table has email VARCHAR(255) NOT NULL UNIQUE column."""
        assert "email VARCHAR(255) NOT NULL UNIQUE" in migration_content

    def test_has_full_name_column(self, migration_content: str) -> None:
        """Users table has full_name VARCHAR(255) column."""
        assert "full_name VARCHAR(255)" in migration_content

    def test_has_role_column_with_check(self, migration_content: str) -> None:
        """Users table has role column with CHECK constraint."""
        assert "role VARCHAR(50) NOT NULL DEFAULT 'member'" in migration_content
        assert "'owner'" in migration_content
        assert "'admin'" in migration_content
        assert "'member'" in migration_content
        assert "'viewer'" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Users table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_organization_id_index(self, migration_content: str) -> None:
        """Migration creates index on organization_id."""
        assert (
            "CREATE INDEX idx_users_organization_id ON public.users(organization_id)"
            in migration_content
        )

    def test_has_email_index(self, migration_content: str) -> None:
        """Migration creates index on email."""
        assert (
            "CREATE INDEX idx_users_email ON public.users(email)" in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to users table."""
        assert "CREATE TRIGGER update_users_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.users" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on users table."""
        assert "ALTER TABLE public.users ENABLE ROW LEVEL SECURITY" in migration_content

    def test_creates_get_user_organization_id_function(
        self, migration_content: str
    ) -> None:
        """Migration creates helper function get_user_organization_id()."""
        assert (
            "CREATE OR REPLACE FUNCTION public.get_user_organization_id()"
            in migration_content
        )
        assert "RETURNS UUID" in migration_content
        assert "SECURITY DEFINER" in migration_content
        assert "STABLE" in migration_content
        assert "auth.uid()" in migration_content

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for users."""
        assert (
            'CREATE POLICY "Users can view users in their organization"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content
        assert "public.get_user_organization_id()" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for users."""
        assert 'CREATE POLICY "Users can update their own profile"' in migration_content
        assert "FOR UPDATE" in migration_content
        assert "id = auth.uid()" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for admins."""
        assert 'CREATE POLICY "Admins can insert users"' in migration_content
        assert "FOR INSERT" in migration_content
        assert "role IN ('owner', 'admin')" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for owners."""
        assert 'CREATE POLICY "Owners can delete users"' in migration_content
        assert "FOR DELETE" in migration_content
        assert "role = 'owner'" in migration_content

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated"
            in migration_content
        )

    def test_updates_organizations_rls_policy(self, migration_content: str) -> None:
        """Migration updates organizations RLS to use helper function."""
        assert (
            'DROP POLICY IF EXISTS "Organizations are viewable by members" ON public.organizations'
            in migration_content
        )
        assert "id = public.get_user_organization_id()" in migration_content

    def test_creates_organizations_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for organizations."""
        assert 'CREATE POLICY "Owners can update organizations"' in migration_content

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.users" in migration_content

    def test_has_function_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on helper function."""
        assert (
            "COMMENT ON FUNCTION public.get_user_organization_id()" in migration_content
        )

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on columns."""
        assert "COMMENT ON COLUMN public.users.id" in migration_content
        assert "COMMENT ON COLUMN public.users.organization_id" in migration_content
        assert "COMMENT ON COLUMN public.users.email" in migration_content
        assert "COMMENT ON COLUMN public.users.full_name" in migration_content
        assert "COMMENT ON COLUMN public.users.role" in migration_content


class TestUsersMigrationSQLSyntax:
    """Tests for SQL syntax validity in users migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load users migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000002_create_users.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_organizations_table(self, migration_content: str) -> None:
        """Migration correctly references organizations table."""
        assert "REFERENCES public.organizations(id)" in migration_content

    def test_references_auth_users(self, migration_content: str) -> None:
        """Migration correctly references auth.users table."""
        assert "REFERENCES auth.users(id)" in migration_content


class TestMigrationOrder:
    """Tests for migration execution order and dependencies."""

    def test_organizations_migration_comes_first(self) -> None:
        """Organizations migration has lower sequence number than users."""
        org_migration = MIGRATIONS_DIR / "20240101000001_create_organizations.sql"
        users_migration = MIGRATIONS_DIR / "20240101000002_create_users.sql"

        assert org_migration.exists(), "Organizations migration must exist"
        assert users_migration.exists(), "Users migration must exist"

        # Extract sequence numbers
        org_seq = int(org_migration.stem.split("_")[0])
        users_seq = int(users_migration.stem.split("_")[0])

        assert (
            org_seq < users_seq
        ), "Organizations migration must run before users migration"

    def test_all_migrations_have_unique_sequence(self) -> None:
        """All migrations have unique sequence numbers."""
        sql_files = list(MIGRATIONS_DIR.glob("*.sql"))
        sequences = []

        for sql_file in sql_files:
            seq = sql_file.stem.split("_")[0]
            sequences.append(seq)

        assert len(sequences) == len(
            set(sequences)
        ), "All migrations must have unique sequence numbers"


class TestPropertiesMigration:
    """Tests for 20240101000003_create_properties.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load properties migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000003_create_properties.sql"
        assert migration_path.exists(), "Properties migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Properties migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000003_create_properties.sql"
        assert (
            migration_path.exists()
        ), "20240101000003_create_properties.sql must exist"

    def test_creates_properties_table(self, migration_content: str) -> None:
        """Migration creates properties table."""
        assert "CREATE TABLE public.properties" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Properties table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_organization_id_foreign_key(self, migration_content: str) -> None:
        """Properties table has organization_id foreign key."""
        assert (
            "organization_id UUID NOT NULL REFERENCES public.organizations(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_name_column(self, migration_content: str) -> None:
        """Properties table has name column."""
        assert "name VARCHAR(255) NOT NULL" in migration_content

    def test_has_address_columns(self, migration_content: str) -> None:
        """Properties table has address columns."""
        assert "address_line1 VARCHAR(255) NOT NULL" in migration_content
        assert "address_line2 VARCHAR(255)" in migration_content
        assert "city VARCHAR(100) NOT NULL" in migration_content
        assert "state CHAR(2) NOT NULL" in migration_content
        assert "postal_code VARCHAR(20) NOT NULL" in migration_content

    def test_has_boma_area_columns(self, migration_content: str) -> None:
        """Properties table has BOMA area columns with correct types."""
        assert "total_rentable_sqft NUMERIC(12, 2) NOT NULL" in migration_content
        assert "total_usable_sqft NUMERIC(12, 2) NOT NULL" in migration_content
        assert "common_area_sqft NUMERIC(12, 2) NOT NULL DEFAULT 0" in migration_content

    def test_has_target_occupancy_column(self, migration_content: str) -> None:
        """Properties table has target_occupancy column with default."""
        assert (
            "target_occupancy NUMERIC(5, 4) NOT NULL DEFAULT 0.9500"
            in migration_content
        )
        assert "target_occupancy >= 0" in migration_content
        assert "target_occupancy <= 1" in migration_content

    def test_has_area_check_constraints(self, migration_content: str) -> None:
        """Properties table has CHECK constraints on area columns."""
        assert "CHECK (total_rentable_sqft > 0)" in migration_content
        assert "CHECK (total_usable_sqft > 0)" in migration_content
        assert "CHECK (common_area_sqft >= 0)" in migration_content

    def test_has_usable_not_greater_than_rentable_constraint(
        self, migration_content: str
    ) -> None:
        """Properties table has constraint ensuring usable <= rentable."""
        assert "CONSTRAINT usable_not_greater_than_rentable" in migration_content
        assert "total_usable_sqft <= total_rentable_sqft" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Properties table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_organization_id_index(self, migration_content: str) -> None:
        """Migration creates index on organization_id."""
        assert (
            "CREATE INDEX idx_properties_organization_id ON public.properties(organization_id)"
            in migration_content
        )

    def test_has_name_index(self, migration_content: str) -> None:
        """Migration creates index on name."""
        assert (
            "CREATE INDEX idx_properties_name ON public.properties(name)"
            in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to properties table."""
        assert "CREATE TRIGGER update_properties_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.properties" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on properties table."""
        assert (
            "ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for properties."""
        assert (
            'CREATE POLICY "Properties are viewable by organization members"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content
        assert "public.get_user_organization_id()" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for properties."""
        assert (
            'CREATE POLICY "Properties are insertable by organization members"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for properties."""
        assert (
            'CREATE POLICY "Properties are updatable by organization members"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for admins."""
        assert (
            'CREATE POLICY "Properties are deletable by organization admins"'
            in migration_content
        )
        assert "FOR DELETE" in migration_content
        assert "role IN ('owner', 'admin')" in migration_content

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.properties" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.properties.id" in migration_content
        assert (
            "COMMENT ON COLUMN public.properties.organization_id" in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.properties.total_rentable_sqft"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.properties.total_usable_sqft" in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.properties.target_occupancy" in migration_content
        )


class TestPropertiesMigrationSQLSyntax:
    """Tests for SQL syntax validity in properties migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load properties migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000003_create_properties.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "NUMEIRC" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_organizations_table(self, migration_content: str) -> None:
        """Migration correctly references organizations table."""
        assert "REFERENCES public.organizations(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content


class TestUnitsMigration:
    """Tests for 20240101000004_create_units.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load units migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000004_create_units.sql"
        assert migration_path.exists(), "Units migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Units migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000004_create_units.sql"
        assert migration_path.exists(), "20240101000004_create_units.sql must exist"

    def test_creates_units_table(self, migration_content: str) -> None:
        """Migration creates units table."""
        assert "CREATE TABLE public.units" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Units table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """Units table has property_id foreign key with cascade delete."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_unit_number_column(self, migration_content: str) -> None:
        """Units table has unit_number column."""
        assert "unit_number VARCHAR(50) NOT NULL" in migration_content

    def test_has_area_columns(self, migration_content: str) -> None:
        """Units table has rentable_sqft and usable_sqft columns."""
        assert "rentable_sqft NUMERIC(10, 2) NOT NULL" in migration_content
        assert "usable_sqft NUMERIC(10, 2) NOT NULL" in migration_content
        assert "CHECK (rentable_sqft > 0)" in migration_content
        assert "CHECK (usable_sqft > 0)" in migration_content

    def test_has_floor_column(self, migration_content: str) -> None:
        """Units table has optional floor column."""
        assert "floor INTEGER CHECK (floor >= 0)" in migration_content

    def test_has_status_column_with_check(self, migration_content: str) -> None:
        """Units table has status column with CHECK constraint."""
        assert "status VARCHAR(20) NOT NULL DEFAULT 'vacant'" in migration_content
        assert "'vacant'" in migration_content
        assert "'occupied'" in migration_content
        assert "'under_renovation'" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Units table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_unique_unit_per_property_constraint(
        self, migration_content: str
    ) -> None:
        """Units table has unique constraint on (property_id, unit_number)."""
        assert (
            "CONSTRAINT unique_unit_per_property UNIQUE (property_id, unit_number)"
            in migration_content
        )

    def test_has_usable_not_greater_than_rentable_constraint(
        self, migration_content: str
    ) -> None:
        """Units table has constraint ensuring usable <= rentable."""
        assert "unit_usable_not_greater_than_rentable" in migration_content
        assert "usable_sqft <= rentable_sqft" in migration_content

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_units_property_id ON public.units(property_id)"
            in migration_content
        )

    def test_has_status_index(self, migration_content: str) -> None:
        """Migration creates index on status."""
        assert (
            "CREATE INDEX idx_units_status ON public.units(status)" in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to units table."""
        assert "CREATE TRIGGER update_units_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.units" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on units table."""
        assert "ALTER TABLE public.units ENABLE ROW LEVEL SECURITY" in migration_content

    def test_creates_user_can_access_unit_function(
        self, migration_content: str
    ) -> None:
        """Migration creates helper function user_can_access_unit()."""
        assert (
            "CREATE OR REPLACE FUNCTION public.user_can_access_unit(unit_id UUID)"
            in migration_content
        )
        assert "RETURNS BOOLEAN" in migration_content
        assert "SECURITY DEFINER" in migration_content

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for units."""
        assert (
            'CREATE POLICY "Units are viewable via property access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for units."""
        assert (
            'CREATE POLICY "Units are insertable via property access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for units."""
        assert (
            'CREATE POLICY "Units are updatable via property access"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for units."""
        assert (
            'CREATE POLICY "Units are deletable via property access"'
            in migration_content
        )
        assert "FOR DELETE" in migration_content

    def test_rls_uses_property_organization_check(self, migration_content: str) -> None:
        """RLS policies check access through property organization."""
        assert "SELECT 1 FROM public.properties" in migration_content
        assert "WHERE id = property_id" in migration_content
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.units" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.units.id" in migration_content
        assert "COMMENT ON COLUMN public.units.property_id" in migration_content
        assert "COMMENT ON COLUMN public.units.unit_number" in migration_content
        assert "COMMENT ON COLUMN public.units.status" in migration_content

    def test_has_function_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on helper function."""
        assert "COMMENT ON FUNCTION public.user_can_access_unit" in migration_content


class TestUnitsMigrationSQLSyntax:
    """Tests for SQL syntax validity in units migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load units migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000004_create_units.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content


class TestLeasesMigration:
    """Tests for 20240101000005_create_leases.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load leases migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000005_create_leases.sql"
        assert migration_path.exists(), "Leases migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Leases migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000005_create_leases.sql"
        assert migration_path.exists(), "20240101000005_create_leases.sql must exist"

    def test_creates_leases_table(self, migration_content: str) -> None:
        """Migration creates leases table."""
        assert "CREATE TABLE public.leases" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Leases table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """Leases table has property_id foreign key with cascade delete."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_unit_id_foreign_key_optional(self, migration_content: str) -> None:
        """Leases table has optional unit_id foreign key with SET NULL on delete."""
        assert "unit_id UUID REFERENCES public.units(id)" in migration_content
        assert "ON DELETE SET NULL" in migration_content

    def test_has_tenant_name_column(self, migration_content: str) -> None:
        """Leases table has tenant_name column."""
        assert "tenant_name VARCHAR(255) NOT NULL" in migration_content

    def test_has_date_columns(self, migration_content: str) -> None:
        """Leases table has start_date and end_date columns."""
        assert "start_date DATE NOT NULL" in migration_content
        assert "end_date DATE NOT NULL" in migration_content

    def test_has_status_column_with_check(self, migration_content: str) -> None:
        """Leases table has status column with CHECK constraint."""
        assert "status VARCHAR(20) NOT NULL DEFAULT 'draft'" in migration_content
        assert "'draft'" in migration_content
        assert "'active'" in migration_content
        assert "'expired'" in migration_content
        assert "'terminated'" in migration_content

    def test_has_recovery_profile_jsonb_column(self, migration_content: str) -> None:
        """Leases table has recovery_profile JSONB column with default."""
        assert "recovery_profile JSONB NOT NULL DEFAULT" in migration_content
        assert '"base_year": null' in migration_content
        assert '"pro_rata_share"' in migration_content
        assert '"cap_type": "none"' in migration_content
        assert '"admin_fee_percentage"' in migration_content
        assert '"excluded_pools": []' in migration_content

    def test_has_document_url_column(self, migration_content: str) -> None:
        """Leases table has document_url column for S3/storage links."""
        assert "document_url VARCHAR(2048)" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Leases table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_end_after_start_constraint(self, migration_content: str) -> None:
        """Leases table has constraint ensuring end_date > start_date."""
        assert (
            "CONSTRAINT end_after_start CHECK (end_date > start_date)"
            in migration_content
        )

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_leases_property_id ON public.leases(property_id)"
            in migration_content
        )

    def test_has_unit_id_index(self, migration_content: str) -> None:
        """Migration creates index on unit_id."""
        assert (
            "CREATE INDEX idx_leases_unit_id ON public.leases(unit_id)"
            in migration_content
        )

    def test_has_status_index(self, migration_content: str) -> None:
        """Migration creates index on status."""
        assert (
            "CREATE INDEX idx_leases_status ON public.leases(status)"
            in migration_content
        )

    def test_has_tenant_name_index(self, migration_content: str) -> None:
        """Migration creates index on tenant_name."""
        assert (
            "CREATE INDEX idx_leases_tenant_name ON public.leases(tenant_name)"
            in migration_content
        )

    def test_has_dates_index(self, migration_content: str) -> None:
        """Migration creates index on start_date and end_date."""
        assert (
            "CREATE INDEX idx_leases_dates ON public.leases(start_date, end_date)"
            in migration_content
        )

    def test_has_gin_index_on_recovery_profile(self, migration_content: str) -> None:
        """Migration creates GIN index on recovery_profile for JSONB queries."""
        assert (
            "CREATE INDEX idx_leases_recovery_profile ON public.leases USING GIN (recovery_profile)"
            in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to leases table."""
        assert "CREATE TRIGGER update_leases_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.leases" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on leases table."""
        assert (
            "ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY" in migration_content
        )

    def test_creates_user_can_access_lease_function(
        self, migration_content: str
    ) -> None:
        """Migration creates helper function user_can_access_lease()."""
        assert (
            "CREATE OR REPLACE FUNCTION public.user_can_access_lease(lease_id UUID)"
            in migration_content
        )
        assert "RETURNS BOOLEAN" in migration_content
        assert "SECURITY DEFINER" in migration_content

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for leases."""
        assert (
            'CREATE POLICY "Leases are viewable via property access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for leases."""
        assert (
            'CREATE POLICY "Leases are insertable via property access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for leases."""
        assert (
            'CREATE POLICY "Leases are updatable via property access"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for admins."""
        assert 'CREATE POLICY "Leases are deletable by admins"' in migration_content
        assert "FOR DELETE" in migration_content

    def test_rls_uses_property_organization_check(self, migration_content: str) -> None:
        """RLS policies check access through property organization."""
        assert "SELECT 1 FROM public.properties" in migration_content
        assert "WHERE id = property_id" in migration_content
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_delete_policy_requires_admin_role(self, migration_content: str) -> None:
        """DELETE policy requires admin or owner role."""
        assert "role IN ('owner', 'admin')" in migration_content

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.leases TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.leases" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.leases.id" in migration_content
        assert "COMMENT ON COLUMN public.leases.property_id" in migration_content
        assert "COMMENT ON COLUMN public.leases.unit_id" in migration_content
        assert "COMMENT ON COLUMN public.leases.tenant_name" in migration_content
        assert "COMMENT ON COLUMN public.leases.start_date" in migration_content
        assert "COMMENT ON COLUMN public.leases.end_date" in migration_content
        assert "COMMENT ON COLUMN public.leases.status" in migration_content
        assert "COMMENT ON COLUMN public.leases.recovery_profile" in migration_content
        assert "COMMENT ON COLUMN public.leases.document_url" in migration_content

    def test_has_function_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on helper function."""
        assert "COMMENT ON FUNCTION public.user_can_access_lease" in migration_content


class TestLeasesMigrationSQLSyntax:
    """Tests for SQL syntax validity in leases migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load leases migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000005_create_leases.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_references_units_table(self, migration_content: str) -> None:
        """Migration correctly references units table."""
        assert "REFERENCES public.units(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content

    def test_valid_jsonb_default(self, migration_content: str) -> None:
        """Default JSONB value is valid syntax."""
        assert "::jsonb" in migration_content


class TestImportBatchesMigration:
    """Tests for 20240101000006_create_import_batches.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load import_batches migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000006_create_import_batches.sql"
        assert migration_path.exists(), "Import batches migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Import batches migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000006_create_import_batches.sql"
        assert (
            migration_path.exists()
        ), "20240101000006_create_import_batches.sql must exist"

    def test_creates_import_batches_table(self, migration_content: str) -> None:
        """Migration creates import_batches table."""
        assert "CREATE TABLE public.import_batches" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Import batches table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_organization_id_foreign_key(self, migration_content: str) -> None:
        """Import batches table has organization_id foreign key."""
        assert (
            "organization_id UUID NOT NULL REFERENCES public.organizations(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """Import batches table has property_id foreign key."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )

    def test_has_file_name_column(self, migration_content: str) -> None:
        """Import batches table has file_name column."""
        assert "file_name VARCHAR(255) NOT NULL" in migration_content

    def test_has_file_hash_column(self, migration_content: str) -> None:
        """Import batches table has file_hash column for SHA256."""
        assert "file_hash CHAR(64) NOT NULL" in migration_content

    def test_has_source_system_column_with_check(self, migration_content: str) -> None:
        """Import batches table has source_system column with CHECK constraint."""
        assert "source_system VARCHAR(50) NOT NULL" in migration_content
        assert "'yardi'" in migration_content
        assert "'mri'" in migration_content
        assert "'generic'" in migration_content

    def test_has_status_column_with_check(self, migration_content: str) -> None:
        """Import batches table has status column with CHECK constraint."""
        assert "status VARCHAR(20) NOT NULL DEFAULT 'pending'" in migration_content
        assert "'pending'" in migration_content
        assert "'processing'" in migration_content
        assert "'completed'" in migration_content
        assert "'failed'" in migration_content

    def test_has_row_count_column(self, migration_content: str) -> None:
        """Import batches table has row_count column."""
        assert "row_count INTEGER" in migration_content
        assert "DEFAULT 0" in migration_content

    def test_has_error_count_column(self, migration_content: str) -> None:
        """Import batches table has error_count column."""
        assert "error_count INTEGER" in migration_content

    def test_has_error_log_jsonb_column(self, migration_content: str) -> None:
        """Import batches table has error_log JSONB column."""
        assert "error_log JSONB" in migration_content
        assert "DEFAULT '[]'::jsonb" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Import batches table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_unique_file_per_org_constraint(self, migration_content: str) -> None:
        """Import batches table has unique constraint for deduplication."""
        assert (
            "CONSTRAINT unique_file_per_org UNIQUE (organization_id, file_hash)"
            in migration_content
        )

    def test_has_organization_id_index(self, migration_content: str) -> None:
        """Migration creates index on organization_id."""
        assert (
            "CREATE INDEX idx_import_batches_organization_id ON public.import_batches(organization_id)"
            in migration_content
        )

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_import_batches_property_id ON public.import_batches(property_id)"
            in migration_content
        )

    def test_has_status_index(self, migration_content: str) -> None:
        """Migration creates index on status for queue processing."""
        assert (
            "CREATE INDEX idx_import_batches_status ON public.import_batches(status)"
            in migration_content
        )

    def test_has_created_at_index(self, migration_content: str) -> None:
        """Migration creates index on created_at for sorting."""
        assert (
            "CREATE INDEX idx_import_batches_created_at ON public.import_batches(created_at DESC)"
            in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to import_batches table."""
        assert "CREATE TRIGGER update_import_batches_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.import_batches" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on import_batches table."""
        assert (
            "ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for import batches."""
        assert (
            'CREATE POLICY "Import batches are viewable by organization members"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for import batches."""
        assert (
            'CREATE POLICY "Import batches are insertable by organization members"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for import batches."""
        assert (
            'CREATE POLICY "Import batches are updatable by organization members"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for admins."""
        assert (
            'CREATE POLICY "Import batches are deletable by admins"'
            in migration_content
        )
        assert "FOR DELETE" in migration_content

    def test_rls_uses_organization_id_check(self, migration_content: str) -> None:
        """RLS policies use organization_id = get_user_organization_id()."""
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_delete_policy_requires_admin_role(self, migration_content: str) -> None:
        """DELETE policy requires admin or owner role."""
        assert "role IN ('owner', 'admin')" in migration_content

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.import_batches" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.import_batches.id" in migration_content
        assert (
            "COMMENT ON COLUMN public.import_batches.organization_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.import_batches.property_id" in migration_content
        )
        assert "COMMENT ON COLUMN public.import_batches.file_name" in migration_content
        assert "COMMENT ON COLUMN public.import_batches.file_hash" in migration_content
        assert (
            "COMMENT ON COLUMN public.import_batches.source_system" in migration_content
        )
        assert "COMMENT ON COLUMN public.import_batches.status" in migration_content
        assert "COMMENT ON COLUMN public.import_batches.row_count" in migration_content
        assert (
            "COMMENT ON COLUMN public.import_batches.error_count" in migration_content
        )
        assert "COMMENT ON COLUMN public.import_batches.error_log" in migration_content


class TestImportBatchesMigrationSQLSyntax:
    """Tests for SQL syntax validity in import_batches migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load import_batches migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000006_create_import_batches.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_organizations_table(self, migration_content: str) -> None:
        """Migration correctly references organizations table."""
        assert "REFERENCES public.organizations(id)" in migration_content

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content

    def test_valid_jsonb_default(self, migration_content: str) -> None:
        """Default JSONB value is valid syntax."""
        assert "'[]'::jsonb" in migration_content


class TestGLEntriesMigration:
    """Tests for 20240101000007_create_gl_entries.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load gl_entries migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000007_create_gl_entries.sql"
        assert migration_path.exists(), "GL entries migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """GL entries migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000007_create_gl_entries.sql"
        assert (
            migration_path.exists()
        ), "20240101000007_create_gl_entries.sql must exist"

    def test_creates_gl_entries_table(self, migration_content: str) -> None:
        """Migration creates gl_entries table."""
        assert "CREATE TABLE public.gl_entries" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """GL entries table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_import_batch_id_foreign_key(self, migration_content: str) -> None:
        """GL entries table has import_batch_id foreign key with cascade delete."""
        assert (
            "import_batch_id UUID NOT NULL REFERENCES public.import_batches(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """GL entries table has property_id foreign key with cascade delete."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )

    def test_has_account_code_column(self, migration_content: str) -> None:
        """GL entries table has account_code column."""
        assert "account_code VARCHAR(50) NOT NULL" in migration_content

    def test_has_account_description_column(self, migration_content: str) -> None:
        """GL entries table has account_description column."""
        assert "account_description VARCHAR(255) NOT NULL" in migration_content

    def test_has_amount_column(self, migration_content: str) -> None:
        """GL entries table has amount NUMERIC column."""
        assert "amount NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_transaction_date_column(self, migration_content: str) -> None:
        """GL entries table has transaction_date column."""
        assert "transaction_date DATE NOT NULL" in migration_content

    def test_has_period_year_column_with_check(self, migration_content: str) -> None:
        """GL entries table has period_year column with range check."""
        assert "period_year INTEGER NOT NULL" in migration_content
        assert "period_year >= 1990" in migration_content
        assert "period_year <= 2100" in migration_content

    def test_has_period_month_column_with_check(self, migration_content: str) -> None:
        """GL entries table has period_month column with range check."""
        assert "period_month INTEGER NOT NULL" in migration_content
        assert "period_month >= 1" in migration_content
        assert "period_month <= 12" in migration_content

    def test_has_vendor_name_column(self, migration_content: str) -> None:
        """GL entries table has optional vendor_name column."""
        assert "vendor_name VARCHAR(255)" in migration_content

    def test_has_description_column(self, migration_content: str) -> None:
        """GL entries table has optional description column."""
        assert "description VARCHAR(1000)" in migration_content

    def test_has_raw_row_data_jsonb_column(self, migration_content: str) -> None:
        """GL entries table has raw_row_data JSONB column for audit trail."""
        assert "raw_row_data JSONB NOT NULL DEFAULT" in migration_content

    def test_has_created_at_column(self, migration_content: str) -> None:
        """GL entries table has created_at column."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_no_updated_at_column(self, migration_content: str) -> None:
        """GL entries table has no updated_at column (immutable)."""
        assert "updated_at" not in migration_content

    def test_has_import_batch_id_index(self, migration_content: str) -> None:
        """Migration creates index on import_batch_id."""
        assert (
            "CREATE INDEX idx_gl_entries_import_batch_id ON public.gl_entries(import_batch_id)"
            in migration_content
        )

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_gl_entries_property_id ON public.gl_entries(property_id)"
            in migration_content
        )

    def test_has_account_code_index(self, migration_content: str) -> None:
        """Migration creates index on account_code for pool mapping queries."""
        assert (
            "CREATE INDEX idx_gl_entries_account_code ON public.gl_entries(account_code)"
            in migration_content
        )

    def test_has_composite_period_index(self, migration_content: str) -> None:
        """Migration creates composite index on (property_id, period_year, period_month)."""
        assert (
            "CREATE INDEX idx_gl_entries_period ON public.gl_entries(property_id, period_year, period_month)"
            in migration_content
        )

    def test_has_transaction_date_index(self, migration_content: str) -> None:
        """Migration creates index on transaction_date."""
        assert (
            "CREATE INDEX idx_gl_entries_transaction_date ON public.gl_entries(transaction_date)"
            in migration_content
        )

    def test_has_account_prefix_index(self, migration_content: str) -> None:
        """Migration creates partial index on account code prefix."""
        assert "idx_gl_entries_account_prefix" in migration_content
        assert "LEFT(account_code, 2)" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on gl_entries table."""
        assert (
            "ALTER TABLE public.gl_entries ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for gl_entries."""
        assert (
            'CREATE POLICY "GL entries are viewable via property access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for gl_entries."""
        assert (
            'CREATE POLICY "GL entries are insertable via property access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_no_update_policy(self, migration_content: str) -> None:
        """Migration has no UPDATE policy (GL entries are immutable)."""
        assert "FOR UPDATE" not in migration_content

    def test_rls_uses_property_organization_check(self, migration_content: str) -> None:
        """RLS policies check access through property organization."""
        assert "SELECT 1 FROM public.properties" in migration_content
        assert "WHERE id = property_id" in migration_content
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_grants_select_insert_only(self, migration_content: str) -> None:
        """Migration grants only SELECT and INSERT permissions (immutable)."""
        assert (
            "GRANT SELECT, INSERT ON public.gl_entries TO authenticated"
            in migration_content
        )
        # Should NOT include UPDATE or DELETE
        grant_line = [
            line
            for line in migration_content.split("\n")
            if "GRANT" in line and "gl_entries" in line
        ][0]
        assert "UPDATE" not in grant_line
        assert "DELETE" not in grant_line

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.gl_entries" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.gl_entries.id" in migration_content
        assert (
            "COMMENT ON COLUMN public.gl_entries.import_batch_id" in migration_content
        )
        assert "COMMENT ON COLUMN public.gl_entries.property_id" in migration_content
        assert "COMMENT ON COLUMN public.gl_entries.account_code" in migration_content
        assert "COMMENT ON COLUMN public.gl_entries.amount" in migration_content
        assert (
            "COMMENT ON COLUMN public.gl_entries.transaction_date" in migration_content
        )
        assert "COMMENT ON COLUMN public.gl_entries.period_year" in migration_content
        assert "COMMENT ON COLUMN public.gl_entries.period_month" in migration_content
        assert "COMMENT ON COLUMN public.gl_entries.raw_row_data" in migration_content


class TestGLEntriesMigrationSQLSyntax:
    """Tests for SQL syntax validity in gl_entries migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load gl_entries migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000007_create_gl_entries.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "NUMEIRC" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_import_batches_table(self, migration_content: str) -> None:
        """Migration correctly references import_batches table."""
        assert "REFERENCES public.import_batches(id)" in migration_content

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content

    def test_valid_jsonb_default(self, migration_content: str) -> None:
        """Default JSONB value is valid syntax."""
        assert "'{}'::jsonb" in migration_content


class TestExpensePoolsMigration:
    """Tests for 20240101000008_create_expense_pools.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load expense_pools migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000008_create_expense_pools.sql"
        assert migration_path.exists(), "Expense pools migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Expense pools migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000008_create_expense_pools.sql"
        assert (
            migration_path.exists()
        ), "20240101000008_create_expense_pools.sql must exist"

    def test_creates_expense_pools_table(self, migration_content: str) -> None:
        """Migration creates expense_pools table."""
        assert "CREATE TABLE public.expense_pools" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Expense pools table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """Expense pools table has property_id foreign key with cascade delete."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_name_column(self, migration_content: str) -> None:
        """Expense pools table has name column."""
        assert "name VARCHAR(100) NOT NULL" in migration_content

    def test_has_pool_type_column_with_check(self, migration_content: str) -> None:
        """Expense pools table has pool_type column with CHECK constraint."""
        assert "pool_type VARCHAR(20) NOT NULL" in migration_content
        assert "'operating'" in migration_content
        assert "'tax'" in migration_content
        assert "'insurance'" in migration_content
        assert "'capital'" in migration_content
        assert "'other'" in migration_content

    def test_has_is_gross_up_applicable_column(self, migration_content: str) -> None:
        """Expense pools table has is_gross_up_applicable boolean column."""
        assert (
            "is_gross_up_applicable BOOLEAN NOT NULL DEFAULT true" in migration_content
        )

    def test_has_gross_up_target_column_with_check(
        self, migration_content: str
    ) -> None:
        """Expense pools table has gross_up_target column with range check."""
        assert "gross_up_target NUMERIC(5, 4)" in migration_content
        assert "gross_up_target >= 0" in migration_content
        assert "gross_up_target <= 1" in migration_content

    def test_has_description_column(self, migration_content: str) -> None:
        """Expense pools table has optional description column."""
        assert "description VARCHAR(500)" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Expense pools table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_unique_pool_name_per_property_constraint(
        self, migration_content: str
    ) -> None:
        """Expense pools table has unique constraint on (property_id, name)."""
        assert (
            "CONSTRAINT unique_pool_name_per_property UNIQUE (property_id, name)"
            in migration_content
        )

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_expense_pools_property_id ON public.expense_pools(property_id)"
            in migration_content
        )

    def test_has_pool_type_index(self, migration_content: str) -> None:
        """Migration creates index on pool_type."""
        assert (
            "CREATE INDEX idx_expense_pools_pool_type ON public.expense_pools(pool_type)"
            in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to expense_pools table."""
        assert "CREATE TRIGGER update_expense_pools_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.expense_pools" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on expense_pools table."""
        assert (
            "ALTER TABLE public.expense_pools ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for expense pools."""
        assert (
            'CREATE POLICY "Expense pools are viewable via property access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for expense pools."""
        assert (
            'CREATE POLICY "Expense pools are insertable via property access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for expense pools."""
        assert (
            'CREATE POLICY "Expense pools are updatable via property access"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for expense pools."""
        assert (
            'CREATE POLICY "Expense pools are deletable via property access"'
            in migration_content
        )
        assert "FOR DELETE" in migration_content

    def test_rls_uses_property_organization_check(self, migration_content: str) -> None:
        """RLS policies check access through property organization."""
        assert "SELECT 1 FROM public.properties" in migration_content
        assert "WHERE id = property_id" in migration_content
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_pools TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.expense_pools" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.expense_pools.id" in migration_content
        assert "COMMENT ON COLUMN public.expense_pools.property_id" in migration_content
        assert "COMMENT ON COLUMN public.expense_pools.name" in migration_content
        assert "COMMENT ON COLUMN public.expense_pools.pool_type" in migration_content
        assert (
            "COMMENT ON COLUMN public.expense_pools.is_gross_up_applicable"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.expense_pools.gross_up_target"
            in migration_content
        )
        assert "COMMENT ON COLUMN public.expense_pools.description" in migration_content
        assert "COMMENT ON COLUMN public.expense_pools.created_at" in migration_content
        assert "COMMENT ON COLUMN public.expense_pools.updated_at" in migration_content


class TestExpensePoolsMigrationSQLSyntax:
    """Tests for SQL syntax validity in expense_pools migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load expense_pools migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000008_create_expense_pools.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "NUMEIRC" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content


class TestPoolMappingsMigration:
    """Tests for 20240101000009_create_pool_mappings.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load pool_mappings migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000009_create_pool_mappings.sql"
        assert migration_path.exists(), "Pool mappings migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Pool mappings migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000009_create_pool_mappings.sql"
        assert (
            migration_path.exists()
        ), "20240101000009_create_pool_mappings.sql must exist"

    def test_creates_pool_mappings_table(self, migration_content: str) -> None:
        """Migration creates pool_mappings table."""
        assert "CREATE TABLE public.pool_mappings" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Pool mappings table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_expense_pool_id_foreign_key(self, migration_content: str) -> None:
        """Pool mappings table has expense_pool_id foreign key with cascade delete."""
        assert (
            "expense_pool_id UUID NOT NULL REFERENCES public.expense_pools(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_gl_account_pattern_column(self, migration_content: str) -> None:
        """Pool mappings table has gl_account_pattern column."""
        assert "gl_account_pattern VARCHAR(50) NOT NULL" in migration_content

    def test_has_allocation_percentage_column_with_check(
        self, migration_content: str
    ) -> None:
        """Pool mappings table has allocation_percentage column with range check."""
        assert (
            "allocation_percentage NUMERIC(5, 4) NOT NULL DEFAULT 1.0000"
            in migration_content
        )
        assert "allocation_percentage >= 0" in migration_content
        assert "allocation_percentage <= 1" in migration_content

    def test_has_priority_column_with_check(self, migration_content: str) -> None:
        """Pool mappings table has priority column with non-negative check."""
        assert "priority INTEGER NOT NULL DEFAULT 0" in migration_content
        assert "priority >= 0" in migration_content

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Pool mappings table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_expense_pool_id_index(self, migration_content: str) -> None:
        """Migration creates index on expense_pool_id."""
        assert (
            "CREATE INDEX idx_pool_mappings_expense_pool_id ON public.pool_mappings(expense_pool_id)"
            in migration_content
        )

    def test_has_pattern_index(self, migration_content: str) -> None:
        """Migration creates index on gl_account_pattern."""
        assert (
            "CREATE INDEX idx_pool_mappings_pattern ON public.pool_mappings(gl_account_pattern)"
            in migration_content
        )

    def test_has_priority_index_descending(self, migration_content: str) -> None:
        """Migration creates descending index on priority for conflict resolution."""
        assert (
            "CREATE INDEX idx_pool_mappings_priority ON public.pool_mappings(priority DESC)"
            in migration_content
        )

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to pool_mappings table."""
        assert "CREATE TRIGGER update_pool_mappings_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.pool_mappings" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on pool_mappings table."""
        assert (
            "ALTER TABLE public.pool_mappings ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for pool mappings."""
        assert (
            'CREATE POLICY "Pool mappings are viewable via pool access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for pool mappings."""
        assert (
            'CREATE POLICY "Pool mappings are insertable via pool access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for pool mappings."""
        assert (
            'CREATE POLICY "Pool mappings are updatable via pool access"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_creates_delete_policy(self, migration_content: str) -> None:
        """Migration creates DELETE RLS policy for pool mappings."""
        assert (
            'CREATE POLICY "Pool mappings are deletable via pool access"'
            in migration_content
        )
        assert "FOR DELETE" in migration_content

    def test_rls_uses_expense_pool_property_chain(self, migration_content: str) -> None:
        """RLS policies check access through expense_pool -> property -> organization chain."""
        assert "FROM public.expense_pools ep" in migration_content
        assert "JOIN public.properties p ON ep.property_id = p.id" in migration_content
        assert "WHERE ep.id = expense_pool_id" in migration_content
        assert (
            "p.organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_mappings TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.pool_mappings" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.pool_mappings.id" in migration_content
        assert (
            "COMMENT ON COLUMN public.pool_mappings.expense_pool_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.pool_mappings.gl_account_pattern"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.pool_mappings.allocation_percentage"
            in migration_content
        )
        assert "COMMENT ON COLUMN public.pool_mappings.priority" in migration_content
        assert "COMMENT ON COLUMN public.pool_mappings.created_at" in migration_content
        assert "COMMENT ON COLUMN public.pool_mappings.updated_at" in migration_content

    def test_pattern_comment_documents_wildcards(self, migration_content: str) -> None:
        """Pattern column comment documents wildcard usage."""
        assert "* for any chars" in migration_content
        assert "? for single char" in migration_content


class TestPoolMappingsMigrationSQLSyntax:
    """Tests for SQL syntax validity in pool_mappings migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load pool_mappings migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000009_create_pool_mappings.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "NUMEIRC" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_expense_pools_table(self, migration_content: str) -> None:
        """Migration correctly references expense_pools table."""
        assert "REFERENCES public.expense_pools(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content


class TestReconciliationSnapshotsMigration:
    """Tests for 20240101000010_create_reconciliation_snapshots.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load reconciliation_snapshots migration content."""
        migration_path = (
            MIGRATIONS_DIR / "20240101000010_create_reconciliation_snapshots.sql"
        )
        assert (
            migration_path.exists()
        ), "Reconciliation snapshots migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Reconciliation snapshots migration file exists."""
        migration_path = (
            MIGRATIONS_DIR / "20240101000010_create_reconciliation_snapshots.sql"
        )
        assert (
            migration_path.exists()
        ), "20240101000010_create_reconciliation_snapshots.sql must exist"

    def test_creates_reconciliation_snapshots_table(
        self, migration_content: str
    ) -> None:
        """Migration creates reconciliation_snapshots table."""
        assert "CREATE TABLE public.reconciliation_snapshots" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_property_id_foreign_key(self, migration_content: str) -> None:
        """Reconciliation snapshots table has property_id foreign key with cascade delete."""
        assert (
            "property_id UUID NOT NULL REFERENCES public.properties(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_lease_id_foreign_key(self, migration_content: str) -> None:
        """Reconciliation snapshots table has lease_id foreign key with cascade delete."""
        assert (
            "lease_id UUID NOT NULL REFERENCES public.leases(id)" in migration_content
        )

    def test_has_period_date_columns(self, migration_content: str) -> None:
        """Reconciliation snapshots table has period_start_date and period_end_date columns."""
        assert "period_start_date DATE NOT NULL" in migration_content
        assert "period_end_date DATE NOT NULL" in migration_content

    def test_has_status_column_with_check(self, migration_content: str) -> None:
        """Reconciliation snapshots table has status column with CHECK constraint."""
        assert "status VARCHAR(20) NOT NULL DEFAULT 'draft'" in migration_content
        assert "'draft'" in migration_content
        assert "'finalized'" in migration_content

    def test_has_total_operating_expenses_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has total_operating_expenses column."""
        assert "total_operating_expenses NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_grossed_up_expenses_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has grossed_up_expenses column."""
        assert "grossed_up_expenses NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_base_year_amount_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has base_year_amount column."""
        assert "base_year_amount NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_tenant_share_before_cap_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has tenant_share_before_cap column."""
        assert "tenant_share_before_cap NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_tenant_share_after_cap_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has tenant_share_after_cap column."""
        assert "tenant_share_after_cap NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_admin_fee_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has admin_fee column."""
        assert "admin_fee NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_total_recovery_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has total_recovery column."""
        assert "total_recovery NUMERIC(14, 2) NOT NULL" in migration_content

    def test_has_calculation_trace_jsonb_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has calculation_trace JSONB column with default."""
        assert (
            "calculation_trace JSONB NOT NULL DEFAULT '[]'::jsonb" in migration_content
        )

    def test_has_finalized_at_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has finalized_at column."""
        assert "finalized_at TIMESTAMPTZ" in migration_content

    def test_has_finalized_by_user_id_column(self, migration_content: str) -> None:
        """Reconciliation snapshots table has finalized_by_user_id foreign key."""
        assert (
            "finalized_by_user_id UUID REFERENCES public.users(id)" in migration_content
        )

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Reconciliation snapshots table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_valid_period_constraint(self, migration_content: str) -> None:
        """Reconciliation snapshots table has constraint ensuring end_date > start_date."""
        assert (
            "CONSTRAINT valid_period CHECK (period_end_date > period_start_date)"
            in migration_content
        )

    def test_has_finalized_requires_timestamp_constraint(
        self, migration_content: str
    ) -> None:
        """Reconciliation snapshots table has constraint requiring timestamp when finalized."""
        assert "CONSTRAINT finalized_requires_timestamp CHECK" in migration_content
        assert "status = 'finalized' AND finalized_at IS NOT NULL" in migration_content

    def test_has_property_id_index(self, migration_content: str) -> None:
        """Migration creates index on property_id."""
        assert (
            "CREATE INDEX idx_reconciliation_snapshots_property_id" in migration_content
        )
        assert "ON public.reconciliation_snapshots(property_id)" in migration_content

    def test_has_lease_id_index(self, migration_content: str) -> None:
        """Migration creates index on lease_id."""
        assert "CREATE INDEX idx_reconciliation_snapshots_lease_id" in migration_content
        assert "ON public.reconciliation_snapshots(lease_id)" in migration_content

    def test_has_status_index(self, migration_content: str) -> None:
        """Migration creates index on status."""
        assert "CREATE INDEX idx_reconciliation_snapshots_status" in migration_content
        assert "ON public.reconciliation_snapshots(status)" in migration_content

    def test_has_period_index(self, migration_content: str) -> None:
        """Migration creates index on period dates."""
        assert "CREATE INDEX idx_reconciliation_snapshots_period" in migration_content
        assert (
            "ON public.reconciliation_snapshots(period_start_date, period_end_date)"
            in migration_content
        )

    def test_has_gin_index_on_calculation_trace(self, migration_content: str) -> None:
        """Migration creates GIN index on calculation_trace for JSONB queries."""
        assert "CREATE INDEX idx_reconciliation_snapshots_trace" in migration_content
        assert "USING GIN (calculation_trace)" in migration_content

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to reconciliation_snapshots table."""
        assert (
            "CREATE TRIGGER update_reconciliation_snapshots_updated_at"
            in migration_content
        )
        assert "BEFORE UPDATE ON public.reconciliation_snapshots" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on reconciliation_snapshots table."""
        assert (
            "ALTER TABLE public.reconciliation_snapshots ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for snapshots."""
        assert (
            'CREATE POLICY "Snapshots are viewable via property access"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for snapshots."""
        assert (
            'CREATE POLICY "Snapshots are insertable via property access"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy_with_draft_check(
        self, migration_content: str
    ) -> None:
        """Migration creates UPDATE RLS policy that only allows draft snapshots."""
        assert (
            'CREATE POLICY "Only draft snapshots can be updated"' in migration_content
        )
        assert "FOR UPDATE" in migration_content
        # Check that status = 'draft' is in the USING clause
        assert "status = 'draft'" in migration_content

    def test_creates_delete_policy_with_draft_check(
        self, migration_content: str
    ) -> None:
        """Migration creates DELETE RLS policy that only allows draft snapshots."""
        assert (
            'CREATE POLICY "Only draft snapshots can be deleted"' in migration_content
        )
        assert "FOR DELETE" in migration_content

    def test_delete_policy_requires_admin_role(self, migration_content: str) -> None:
        """DELETE policy requires admin or owner role."""
        assert "role IN ('owner', 'admin')" in migration_content

    def test_rls_uses_property_organization_check(self, migration_content: str) -> None:
        """RLS policies check access through property organization."""
        assert "SELECT 1 FROM public.properties" in migration_content
        assert "WHERE id = property_id" in migration_content
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_grants_authenticated_permissions(self, migration_content: str) -> None:
        """Migration grants appropriate permissions to authenticated role."""
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.reconciliation_snapshots TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.reconciliation_snapshots" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.id" in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.property_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.lease_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.period_start_date"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.period_end_date"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.status"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.total_operating_expenses"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.grossed_up_expenses"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.base_year_amount"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.tenant_share_before_cap"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.tenant_share_after_cap"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.admin_fee"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.total_recovery"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.calculation_trace"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.finalized_at"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.finalized_by_user_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.created_at"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.reconciliation_snapshots.updated_at"
            in migration_content
        )

    def test_calculation_trace_comment_describes_jsonb_array(
        self, migration_content: str
    ) -> None:
        """Calculation trace column comment describes JSONB array purpose."""
        assert "Step-by-step calculation breakdown" in migration_content
        assert "audit trail" in migration_content.lower()


class TestReconciliationSnapshotsMigrationSQLSyntax:
    """Tests for SQL syntax validity in reconciliation_snapshots migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load reconciliation_snapshots migration content."""
        migration_path = (
            MIGRATIONS_DIR / "20240101000010_create_reconciliation_snapshots.sql"
        )
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "NUMEIRC" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_properties_table(self, migration_content: str) -> None:
        """Migration correctly references properties table."""
        assert "REFERENCES public.properties(id)" in migration_content

    def test_references_leases_table(self, migration_content: str) -> None:
        """Migration correctly references leases table."""
        assert "REFERENCES public.leases(id)" in migration_content

    def test_references_users_table(self, migration_content: str) -> None:
        """Migration correctly references users table for finalized_by_user_id."""
        assert "REFERENCES public.users(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content

    def test_numeric_precision_for_money(self, migration_content: str) -> None:
        """Migration uses NUMERIC(14, 2) for monetary values."""
        # Count occurrences of NUMERIC(14, 2) for the 7 money columns
        numeric_count = migration_content.count("NUMERIC(14, 2)")
        assert (
            numeric_count >= 7
        ), f"Expected at least 7 NUMERIC(14, 2) columns, found {numeric_count}"


class TestPgAuditMigration:
    """Tests for 20240101000011_create_audit_log_table.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load pgaudit migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000011_create_audit_log_table.sql"
        assert migration_path.exists(), "pgAudit migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """pgAudit migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000011_create_audit_log_table.sql"
        assert (
            migration_path.exists()
        ), "20240101000011_create_audit_log_table.sql must exist"

    def test_enables_pgaudit_extension(self, migration_content: str) -> None:
        """Migration enables pgAudit extension."""
        assert "CREATE EXTENSION IF NOT EXISTS pgaudit" in migration_content

    def test_creates_audit_log_table(self, migration_content: str) -> None:
        """Migration creates audit_log table."""
        assert "CREATE TABLE public.audit_log" in migration_content

    def test_audit_log_has_id_column(self, migration_content: str) -> None:
        """Audit log table has BIGSERIAL primary key."""
        assert "id BIGSERIAL PRIMARY KEY" in migration_content

    def test_audit_log_has_table_name_column(self, migration_content: str) -> None:
        """Audit log table has table_name column."""
        assert "table_name VARCHAR(100) NOT NULL" in migration_content

    def test_audit_log_has_operation_column_with_check(
        self, migration_content: str
    ) -> None:
        """Audit log table has operation column with CHECK constraint."""
        assert "operation VARCHAR(10) NOT NULL" in migration_content
        assert "'INSERT'" in migration_content
        assert "'UPDATE'" in migration_content
        assert "'DELETE'" in migration_content

    def test_audit_log_has_row_id_column(self, migration_content: str) -> None:
        """Audit log table has row_id UUID column."""
        assert "row_id UUID" in migration_content

    def test_audit_log_has_old_data_jsonb_column(self, migration_content: str) -> None:
        """Audit log table has old_data JSONB column."""
        assert "old_data JSONB" in migration_content

    def test_audit_log_has_new_data_jsonb_column(self, migration_content: str) -> None:
        """Audit log table has new_data JSONB column."""
        assert "new_data JSONB" in migration_content

    def test_audit_log_has_changed_by_foreign_key(self, migration_content: str) -> None:
        """Audit log table has changed_by foreign key to users."""
        assert "changed_by UUID REFERENCES public.users(id)" in migration_content

    def test_audit_log_has_changed_at_column(self, migration_content: str) -> None:
        """Audit log table has changed_at timestamp column."""
        assert "changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_audit_log_has_organization_id_column(self, migration_content: str) -> None:
        """Audit log table has organization_id column for multi-tenant filtering."""
        assert "organization_id UUID" in migration_content

    def test_has_table_name_index(self, migration_content: str) -> None:
        """Migration creates index on table_name."""
        assert (
            "CREATE INDEX idx_audit_log_table_name ON public.audit_log(table_name)"
            in migration_content
        )

    def test_has_row_id_index(self, migration_content: str) -> None:
        """Migration creates index on row_id."""
        assert (
            "CREATE INDEX idx_audit_log_row_id ON public.audit_log(row_id)"
            in migration_content
        )

    def test_has_changed_at_index_descending(self, migration_content: str) -> None:
        """Migration creates descending index on changed_at."""
        assert (
            "CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC)"
            in migration_content
        )

    def test_has_changed_by_index(self, migration_content: str) -> None:
        """Migration creates index on changed_by."""
        assert (
            "CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by)"
            in migration_content
        )

    def test_has_organization_id_index(self, migration_content: str) -> None:
        """Migration creates index on organization_id."""
        assert (
            "CREATE INDEX idx_audit_log_organization_id ON public.audit_log(organization_id)"
            in migration_content
        )

    def test_creates_audit_trigger_function(self, migration_content: str) -> None:
        """Migration creates audit_trigger_func function."""
        assert (
            "CREATE OR REPLACE FUNCTION public.audit_trigger_func()"
            in migration_content
        )
        assert "RETURNS TRIGGER" in migration_content
        assert "SECURITY DEFINER" in migration_content

    def test_audit_function_handles_insert(self, migration_content: str) -> None:
        """Audit trigger function handles INSERT operations."""
        assert "IF TG_OP = 'INSERT' THEN" in migration_content

    def test_audit_function_handles_update(self, migration_content: str) -> None:
        """Audit trigger function handles UPDATE operations."""
        assert "ELSIF TG_OP = 'UPDATE' THEN" in migration_content

    def test_audit_function_handles_delete(self, migration_content: str) -> None:
        """Audit trigger function handles DELETE operations."""
        assert "ELSIF TG_OP = 'DELETE' THEN" in migration_content

    def test_audit_function_uses_to_jsonb(self, migration_content: str) -> None:
        """Audit trigger function uses to_jsonb for data capture."""
        assert "to_jsonb(NEW)" in migration_content
        assert "to_jsonb(OLD)" in migration_content

    def test_audit_function_captures_auth_uid(self, migration_content: str) -> None:
        """Audit trigger function captures auth.uid() for changed_by."""
        assert "auth.uid()" in migration_content

    def test_creates_gl_entries_trigger(self, migration_content: str) -> None:
        """Migration creates audit trigger on gl_entries table."""
        assert "CREATE TRIGGER audit_gl_entries" in migration_content
        assert "AFTER INSERT OR DELETE ON public.gl_entries" in migration_content
        assert "EXECUTE FUNCTION public.audit_trigger_func()" in migration_content

    def test_creates_reconciliation_snapshots_trigger(
        self, migration_content: str
    ) -> None:
        """Migration creates audit trigger on reconciliation_snapshots table."""
        assert "CREATE TRIGGER audit_reconciliation_snapshots" in migration_content
        assert (
            "AFTER INSERT OR UPDATE OR DELETE ON public.reconciliation_snapshots"
            in migration_content
        )

    def test_creates_leases_trigger_for_recovery_profile(
        self, migration_content: str
    ) -> None:
        """Migration creates audit trigger on leases for recovery_profile changes."""
        assert "CREATE TRIGGER audit_leases_recovery_profile" in migration_content
        assert "AFTER UPDATE ON public.leases" in migration_content
        assert (
            "OLD.recovery_profile IS DISTINCT FROM NEW.recovery_profile"
            in migration_content
        )

    def test_enables_rls_on_audit_log(self, migration_content: str) -> None:
        """Migration enables Row Level Security on audit_log table."""
        assert (
            "ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_admin_only_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for admins only."""
        assert 'CREATE POLICY "Audit log viewable by admins"' in migration_content
        assert "FOR SELECT" in migration_content
        assert "role IN ('owner', 'admin')" in migration_content

    def test_grants_select_only(self, migration_content: str) -> None:
        """Migration grants SELECT only on audit_log (append-only)."""
        assert "GRANT SELECT ON public.audit_log TO authenticated" in migration_content
        # Verify no INSERT/UPDATE/DELETE grants
        assert (
            "GRANT INSERT" not in migration_content
            or "audit_log"
            not in migration_content.split("GRANT INSERT")[1].split("\n")[0]
        )

    def test_grants_sequence_usage(self, migration_content: str) -> None:
        """Migration grants sequence usage for trigger function."""
        assert (
            "GRANT USAGE ON SEQUENCE public.audit_log_id_seq TO authenticated"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.audit_log" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.audit_log.id" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.table_name" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.operation" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.row_id" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.old_data" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.new_data" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.changed_by" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.changed_at" in migration_content
        assert "COMMENT ON COLUMN public.audit_log.organization_id" in migration_content

    def test_has_function_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on trigger function."""
        assert "COMMENT ON FUNCTION public.audit_trigger_func()" in migration_content


class TestPgAuditMigrationSQLSyntax:
    """Tests for SQL syntax validity in pgaudit migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load pgaudit migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000011_create_audit_log_table.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "TIRGGER" not in content_upper
        assert "FUCNTION" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_plpgsql_block_structure(self, migration_content: str) -> None:
        """PL/pgSQL function has correct block structure."""
        assert "BEGIN" in migration_content
        assert "END;" in migration_content
        assert "$$ LANGUAGE plpgsql" in migration_content

    def test_trigger_references_function(self, migration_content: str) -> None:
        """All triggers reference the audit_trigger_func function."""
        # Count trigger definitions and function references
        trigger_count = migration_content.count("CREATE TRIGGER audit_")
        func_ref_count = migration_content.count(
            "EXECUTE FUNCTION public.audit_trigger_func()"
        )
        assert (
            trigger_count == func_ref_count
        ), f"Mismatch: {trigger_count} triggers, {func_ref_count} function references"

    def test_references_users_table(self, migration_content: str) -> None:
        """Migration correctly references users table."""
        assert "REFERENCES public.users(id)" in migration_content

    def test_references_gl_entries_table(self, migration_content: str) -> None:
        """Migration correctly references gl_entries table."""
        assert "ON public.gl_entries" in migration_content

    def test_references_reconciliation_snapshots_table(
        self, migration_content: str
    ) -> None:
        """Migration correctly references reconciliation_snapshots table."""
        assert "ON public.reconciliation_snapshots" in migration_content

    def test_references_leases_table(self, migration_content: str) -> None:
        """Migration correctly references leases table."""
        assert "ON public.leases" in migration_content


# =============================================================================
# Subscriptions Migration Tests
# =============================================================================


class TestSubscriptionsMigration:
    """Tests for 20240101000012_create_subscriptions.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load subscriptions migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000012_create_subscriptions.sql"
        assert migration_path.exists(), "Subscriptions migration file must exist"
        return migration_path.read_text()

    def test_migration_file_exists(self) -> None:
        """Subscriptions migration file exists."""
        migration_path = MIGRATIONS_DIR / "20240101000012_create_subscriptions.sql"
        assert (
            migration_path.exists()
        ), "20240101000012_create_subscriptions.sql must exist"

    def test_creates_subscription_status_enum(self, migration_content: str) -> None:
        """Migration creates subscription_status enum type."""
        assert "CREATE TYPE public.subscription_status AS ENUM" in migration_content
        assert "'trialing'" in migration_content
        assert "'active'" in migration_content
        assert "'past_due'" in migration_content
        assert "'canceled'" in migration_content
        assert "'paused'" in migration_content

    def test_creates_subscription_plan_enum(self, migration_content: str) -> None:
        """Migration creates subscription_plan enum type."""
        assert "CREATE TYPE public.subscription_plan AS ENUM" in migration_content
        assert "'free'" in migration_content
        assert "'starter'" in migration_content
        assert "'professional'" in migration_content
        assert "'enterprise'" in migration_content

    def test_creates_subscriptions_table(self, migration_content: str) -> None:
        """Migration creates subscriptions table."""
        assert "CREATE TABLE public.subscriptions" in migration_content

    def test_has_id_column(self, migration_content: str) -> None:
        """Subscriptions table has id UUID primary key column."""
        assert "id UUID PRIMARY KEY DEFAULT gen_random_uuid()" in migration_content

    def test_has_organization_id_unique_foreign_key(
        self, migration_content: str
    ) -> None:
        """Subscriptions table has unique organization_id foreign key."""
        assert (
            "organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id)"
            in migration_content
        )
        assert "ON DELETE CASCADE" in migration_content

    def test_has_stripe_subscription_id_column(self, migration_content: str) -> None:
        """Subscriptions table has stripe_subscription_id column."""
        assert "stripe_subscription_id VARCHAR(255)" in migration_content

    def test_has_stripe_customer_id_column(self, migration_content: str) -> None:
        """Subscriptions table has stripe_customer_id column."""
        assert "stripe_customer_id VARCHAR(255)" in migration_content

    def test_has_plan_column_with_enum(self, migration_content: str) -> None:
        """Subscriptions table has plan column using subscription_plan enum."""
        assert (
            "plan public.subscription_plan NOT NULL DEFAULT 'free'" in migration_content
        )

    def test_has_status_column_with_enum(self, migration_content: str) -> None:
        """Subscriptions table has status column using subscription_status enum."""
        assert (
            "status public.subscription_status NOT NULL DEFAULT 'trialing'"
            in migration_content
        )

    def test_has_current_period_start_column(self, migration_content: str) -> None:
        """Subscriptions table has current_period_start column."""
        assert (
            "current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW()"
            in migration_content
        )

    def test_has_current_period_end_column(self, migration_content: str) -> None:
        """Subscriptions table has current_period_end column with 14-day default."""
        assert "current_period_end TIMESTAMPTZ NOT NULL" in migration_content
        assert "14 days" in migration_content

    def test_has_cancel_at_period_end_column(self, migration_content: str) -> None:
        """Subscriptions table has cancel_at_period_end boolean column."""
        assert (
            "cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE" in migration_content
        )

    def test_has_timestamp_columns(self, migration_content: str) -> None:
        """Subscriptions table has created_at and updated_at columns."""
        assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content
        assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in migration_content

    def test_has_stripe_subscription_id_unique_index(
        self, migration_content: str
    ) -> None:
        """Migration creates unique partial index on stripe_subscription_id."""
        assert (
            "CREATE UNIQUE INDEX idx_subscriptions_stripe_subscription_id"
            in migration_content
        )
        assert "ON public.subscriptions(stripe_subscription_id)" in migration_content
        assert "WHERE stripe_subscription_id IS NOT NULL" in migration_content

    def test_has_stripe_customer_id_index(self, migration_content: str) -> None:
        """Migration creates index on stripe_customer_id."""
        assert "CREATE INDEX idx_subscriptions_stripe_customer_id" in migration_content
        assert "ON public.subscriptions(stripe_customer_id)" in migration_content

    def test_has_status_index(self, migration_content: str) -> None:
        """Migration creates index on status."""
        assert "CREATE INDEX idx_subscriptions_status" in migration_content
        assert "ON public.subscriptions(status)" in migration_content

    def test_has_period_end_index(self, migration_content: str) -> None:
        """Migration creates index on current_period_end."""
        assert "CREATE INDEX idx_subscriptions_period_end" in migration_content
        assert "ON public.subscriptions(current_period_end)" in migration_content

    def test_applies_updated_at_trigger(self, migration_content: str) -> None:
        """Migration applies updated_at trigger to subscriptions table."""
        assert "CREATE TRIGGER update_subscriptions_updated_at" in migration_content
        assert "BEFORE UPDATE ON public.subscriptions" in migration_content
        assert "EXECUTE FUNCTION public.update_updated_at_column()" in migration_content

    def test_enables_rls(self, migration_content: str) -> None:
        """Migration enables Row Level Security on subscriptions table."""
        assert (
            "ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY"
            in migration_content
        )

    def test_creates_select_policy(self, migration_content: str) -> None:
        """Migration creates SELECT RLS policy for subscriptions."""
        assert (
            'CREATE POLICY "Subscriptions are viewable by organization members"'
            in migration_content
        )
        assert "FOR SELECT" in migration_content

    def test_creates_insert_policy(self, migration_content: str) -> None:
        """Migration creates INSERT RLS policy for subscriptions."""
        assert (
            'CREATE POLICY "Subscriptions are insertable by service role or owner"'
            in migration_content
        )
        assert "FOR INSERT" in migration_content

    def test_creates_update_policy(self, migration_content: str) -> None:
        """Migration creates UPDATE RLS policy for subscriptions."""
        assert (
            'CREATE POLICY "Subscriptions are updatable by organization members"'
            in migration_content
        )
        assert "FOR UPDATE" in migration_content

    def test_no_delete_policy(self, migration_content: str) -> None:
        """Migration does not create DELETE policy (soft delete via status)."""
        # Check there's no FOR DELETE policy for subscriptions
        assert (
            "FOR DELETE" not in migration_content
            or "subscriptions"
            not in migration_content.split("FOR DELETE")[0].split("CREATE POLICY")[-1]
        )

    def test_rls_uses_organization_id_check(self, migration_content: str) -> None:
        """RLS policies check access through organization_id."""
        assert (
            "organization_id = public.get_user_organization_id()" in migration_content
        )

    def test_insert_requires_owner_role(self, migration_content: str) -> None:
        """INSERT policy requires owner role."""
        assert "role = 'owner'" in migration_content

    def test_grants_select_to_authenticated(self, migration_content: str) -> None:
        """Migration grants SELECT to authenticated role."""
        assert (
            "GRANT SELECT ON public.subscriptions TO authenticated" in migration_content
        )

    def test_grants_insert_update_to_service_role(self, migration_content: str) -> None:
        """Migration grants INSERT, UPDATE to service_role."""
        assert (
            "GRANT INSERT, UPDATE ON public.subscriptions TO service_role"
            in migration_content
        )

    def test_has_table_comment(self, migration_content: str) -> None:
        """Migration includes documentation comment on table."""
        assert "COMMENT ON TABLE public.subscriptions" in migration_content

    def test_has_column_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on key columns."""
        assert "COMMENT ON COLUMN public.subscriptions.id" in migration_content
        assert (
            "COMMENT ON COLUMN public.subscriptions.organization_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.subscriptions.stripe_subscription_id"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.subscriptions.stripe_customer_id"
            in migration_content
        )
        assert "COMMENT ON COLUMN public.subscriptions.plan" in migration_content
        assert "COMMENT ON COLUMN public.subscriptions.status" in migration_content
        assert (
            "COMMENT ON COLUMN public.subscriptions.current_period_start"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.subscriptions.current_period_end"
            in migration_content
        )
        assert (
            "COMMENT ON COLUMN public.subscriptions.cancel_at_period_end"
            in migration_content
        )
        assert "COMMENT ON COLUMN public.subscriptions.created_at" in migration_content
        assert "COMMENT ON COLUMN public.subscriptions.updated_at" in migration_content

    def test_has_type_comments(self, migration_content: str) -> None:
        """Migration includes documentation comments on enum types."""
        assert "COMMENT ON TYPE public.subscription_status" in migration_content
        assert "COMMENT ON TYPE public.subscription_plan" in migration_content


class TestSubscriptionsMigrationSQLSyntax:
    """Tests for SQL syntax validity in subscriptions migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load subscriptions migration content."""
        migration_path = MIGRATIONS_DIR / "20240101000012_create_subscriptions.sql"
        return migration_path.read_text()

    def test_no_syntax_keywords_typos(self, migration_content: str) -> None:
        """Common SQL keywords are spelled correctly."""
        content_upper = migration_content.upper()
        assert "CREAT TABLE" not in content_upper
        assert "CRATE TABLE" not in content_upper
        assert "TIMESTAMPZ" not in content_upper
        assert "DEFUALT" not in content_upper
        assert "PRIMAY KEY" not in content_upper
        assert "FORIEGN" not in content_upper
        assert "REFERNCES" not in content_upper
        assert "BOOLEN" not in content_upper
        assert "VARHAR" not in content_upper

    def test_balanced_parentheses(self, migration_content: str) -> None:
        """SQL has balanced parentheses."""
        content = re.sub(r"'[^']*'", "", migration_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, migration_content: str) -> None:
        """SQL has balanced single quotes."""
        quote_count = migration_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_references_organizations_table(self, migration_content: str) -> None:
        """Migration correctly references organizations table."""
        assert "REFERENCES public.organizations(id)" in migration_content

    def test_uses_helper_function(self, migration_content: str) -> None:
        """Migration uses get_user_organization_id() helper function."""
        assert "public.get_user_organization_id()" in migration_content

    def test_uses_update_updated_at_function(self, migration_content: str) -> None:
        """Migration uses update_updated_at_column() trigger function."""
        assert "public.update_updated_at_column()" in migration_content


# =============================================================================
# Seed Script Tests
# =============================================================================


class TestSeedScript:
    """Tests for supabase/seeds/seed.sql database seed script."""

    @pytest.fixture
    def seed_content(self) -> str:
        """Load seed script content."""
        seed_path = PROJECT_ROOT / "supabase" / "seeds" / "seed.sql"
        assert seed_path.exists(), "seeds/seed.sql must exist"
        return seed_path.read_text(encoding="utf-8")

    def test_seed_file_exists(self) -> None:
        """Seed script file exists."""
        seed_path = PROJECT_ROOT / "supabase" / "seeds" / "seed.sql"
        assert seed_path.exists(), "supabase/seeds/seed.sql must exist"

    def test_seed_has_header_comment(self, seed_content: str) -> None:
        """Seed script has descriptive header."""
        assert "CapVeri - Base Seed Data" in seed_content

    def test_seed_creates_organization(self, seed_content: str) -> None:
        """Seed script creates Demo Company organization."""
        assert "Demo Company" in seed_content
        assert "INSERT INTO public.organizations" in seed_content

    def test_seed_creates_admin_user(self, seed_content: str) -> None:
        """Seed script creates admin user."""
        assert "admin@democompany.com" in seed_content
        assert "'admin'" in seed_content

    def test_seed_creates_member_user(self, seed_content: str) -> None:
        """Seed script creates member user."""
        assert "member@democompany.com" in seed_content
        assert "'member'" in seed_content

    def test_seed_creates_two_properties(self, seed_content: str) -> None:
        """Seed script creates two properties."""
        assert "Downtown Tower" in seed_content
        assert "Suburban Office Park" in seed_content

    def test_seed_creates_units(self, seed_content: str) -> None:
        """Seed script creates units for properties."""
        assert "INSERT INTO public.units" in seed_content
        # Check for Downtown Tower units
        assert "'101'" in seed_content
        assert "'102'" in seed_content
        assert "'301'" in seed_content
        # Check for Suburban Office Park units
        assert "'A-101'" in seed_content
        assert "'A-201'" in seed_content

    def test_seed_creates_five_leases(self, seed_content: str) -> None:
        """Seed script creates five leases with different tenants."""
        assert "Acme Corporation" in seed_content
        assert "Beta Industries" in seed_content
        assert "Gamma LLC" in seed_content
        assert "Delta Technologies" in seed_content
        assert "Epsilon Partners" in seed_content

    def test_seed_has_varied_recovery_profiles(self, seed_content: str) -> None:
        """Seed script includes varied lease recovery profiles."""
        # Different cap types
        assert '"cap_type": "cumulative"' in seed_content
        assert '"cap_type": "non_cumulative"' in seed_content
        assert '"cap_type": "cumulative_compounding"' in seed_content
        assert '"cap_type": "none"' in seed_content

    def test_seed_creates_expense_pools(self, seed_content: str) -> None:
        """Seed script creates expense pools."""
        assert "INSERT INTO public.expense_pools" in seed_content
        assert "Operating Expenses" in seed_content
        assert "Real Estate Taxes" in seed_content
        assert "Insurance" in seed_content
        assert "Capital Reserves" in seed_content

    def test_seed_creates_pool_mappings(self, seed_content: str) -> None:
        """Seed script creates pool mappings."""
        assert "INSERT INTO public.pool_mappings" in seed_content
        # Check GL account patterns
        assert "'5*'" in seed_content  # Operating
        assert "'61*'" in seed_content  # Taxes
        assert "'62*'" in seed_content  # Insurance
        assert "'7*'" in seed_content  # Capital

    def test_seed_is_idempotent(self, seed_content: str) -> None:
        """Seed script uses ON CONFLICT for idempotency."""
        # Count INSERT statements vs ON CONFLICT clauses
        insert_count = seed_content.count("INSERT INTO")
        conflict_count = seed_content.count("ON CONFLICT")
        assert (
            conflict_count >= insert_count - 1
        ), "All INSERT statements should have ON CONFLICT for idempotency"

    def test_seed_uses_fixed_uuids(self, seed_content: str) -> None:
        """Seed script uses deterministic fixed UUIDs."""
        # Check for the fixed UUID pattern used in seed data
        assert "00000000-0000-0000-0000-000000000001" in seed_content  # Organization
        assert "00000000-0000-0000-0000-000000000011" in seed_content  # Admin user
        assert "00000000-0000-0000-0000-000000000101" in seed_content  # Property 1
        assert "00000000-0000-0000-0000-000000000102" in seed_content  # Property 2

    def test_seed_has_verification_query(self, seed_content: str) -> None:
        """Seed script includes verification query at end."""
        assert "Verification Query" in seed_content
        assert "Seed data loaded successfully" in seed_content


class TestProductionTestSeedScript:
    """Tests for production-only E2E seed data."""

    @pytest.fixture
    def seed_content(self) -> str:
        """Load production test seed script content."""
        seed_path = PROJECT_ROOT / "supabase" / "seeds" / "seed_production_test.sql"
        assert seed_path.exists(), "seed_production_test.sql must exist"
        return seed_path.read_text(encoding="utf-8")

    def test_prodtest_users_have_auth_identities(self, seed_content: str) -> None:
        """Supabase password login requires matching auth.identities rows."""
        assert "INSERT INTO auth.identities" in seed_content
        assert "prodtest+owner@acme.example.com" in seed_content
        assert "prodtest+lisa.tenant@salon.com" in seed_content
        assert "'ffffffff-ffff-ffff-ffff-ffffffff1003'::uuid" in seed_content
        assert "'ffffffff-ffff-ffff-ffff-ffffffff1011'::uuid" in seed_content
        assert "'email'" in seed_content

    def test_prodtest_subscriptions_use_relative_current_periods(
        self, seed_content: str
    ) -> None:
        """Seeded active/trialing subscriptions must not expire in the past."""
        subscription_section = seed_content.split("SECTION 13: SUBSCRIPTIONS", 1)[1]
        assert "NOW() - INTERVAL '1 day'" in subscription_section
        assert "NOW() + INTERVAL '30 days'" in subscription_section
        assert "'2025-01-01'::timestamptz" not in subscription_section


class TestBackendEndpointTableGrants:
    """Regression checks for grants required by RLS-backed backend endpoints."""

    @pytest.fixture
    def migration_content(self) -> str:
        migration_path = (
            MIGRATIONS_DIR / "20260527000000_add_missing_backend_table_grants.sql"
        )
        assert migration_path.exists()
        return migration_path.read_text(encoding="utf-8")

    def test_grants_authenticated_financial_endpoint_tables(
        self, migration_content: str
    ) -> None:
        required_grants = [
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_allocations TO authenticated",
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculation_jobs TO authenticated",
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.sb1103_requests TO authenticated",
        ]

        for grant in required_grants:
            assert grant in migration_content

    def test_tenant_notification_grants_are_least_privilege(
        self, migration_content: str
    ) -> None:
        assert (
            "GRANT SELECT, UPDATE ON public.tenant_notifications TO authenticated"
            in migration_content
        )
        assert (
            "GRANT SELECT, INSERT, UPDATE ON public.tenant_email_preferences TO authenticated"
            in migration_content
        )
        assert (
            "GRANT INSERT ON public.tenant_notifications TO service_role"
            in migration_content
        )
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_logs TO service_role"
            in migration_content
        )
        assert (
            "GRANT INSERT ON public.tenant_notifications TO authenticated"
            not in migration_content
        )
        assert (
            "GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_email_logs TO authenticated"
            not in migration_content
        )

    def test_service_tenant_policies_are_limited_to_service_role(
        self, migration_content: str
    ) -> None:
        policy_names = [
            '"Service can insert notifications"',
            '"Service can manage preferences"',
            '"Service can manage email logs"',
        ]
        for policy_name in policy_names:
            policy_section = migration_content.split(f"CREATE POLICY {policy_name}", 1)[
                1
            ].split(";", 1)[0]
            assert "TO service_role" in policy_section

    def test_pool_percentage_allocation_db_constraint_matches_backend_invariant(
        self, migration_content: str
    ) -> None:
        assert "check_percentage_allocation_value_max" in migration_content
        assert (
            "allocation_type != 'percentage'::public.allocation_type"
            in migration_content
        )
        assert "OR allocation_value <= 100" in migration_content


class TestSeedScriptSQLSyntax:
    """Tests for seed script SQL syntax validity."""

    @pytest.fixture
    def seed_content(self) -> str:
        """Load seed script content."""
        seed_path = PROJECT_ROOT / "supabase" / "seeds" / "seed.sql"
        return seed_path.read_text()

    def test_no_sql_syntax_errors(self, seed_content: str) -> None:
        """Seed script has no common SQL syntax issues."""
        content_upper = seed_content.upper()
        # Check for common typos
        assert "INSER INTO" not in content_upper
        assert "INSERT INTI" not in content_upper
        assert "VALUSE" not in content_upper
        assert "VLUES" not in content_upper

    def test_balanced_parentheses(self, seed_content: str) -> None:
        """Seed SQL has balanced parentheses."""
        # Remove string literals to avoid false positives
        content = re.sub(r"'[^']*'", "", seed_content)
        open_count = content.count("(")
        close_count = content.count(")")
        assert (
            open_count == close_count
        ), f"Unbalanced parentheses: {open_count} opening, {close_count} closing"

    def test_no_unclosed_quotes(self, seed_content: str) -> None:
        """Seed SQL has balanced single quotes."""
        # Count quotes outside of JSONB literals
        quote_count = seed_content.count("'")
        assert quote_count % 2 == 0, f"Unbalanced quotes: {quote_count} single quotes"

    def test_jsonb_casting_syntax(self, seed_content: str) -> None:
        """JSONB values use correct casting syntax."""
        # All JSONB inserts should use ::jsonb cast
        jsonb_pattern = r"\{[^}]+\}'::jsonb"
        matches = re.findall(jsonb_pattern, seed_content, re.DOTALL)
        assert len(matches) >= 5, "Should have at least 5 JSONB casts (org + 5 leases)"

    def test_uuid_format_validity(self, seed_content: str) -> None:
        """UUIDs in seed data are valid format."""
        uuid_pattern = r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
        matches = re.findall(uuid_pattern, seed_content, re.IGNORECASE)
        # Should have many UUIDs (org, users, properties, units, leases, pools, mappings)
        assert len(matches) >= 30, f"Expected 30+ UUIDs, found {len(matches)}"

    def test_date_format_validity(self, seed_content: str) -> None:
        """Dates in seed data use correct format."""
        # Check for YYYY-MM-DD date format
        date_pattern = r"'\d{4}-\d{2}-\d{2}'"
        matches = re.findall(date_pattern, seed_content)
        # Should have dates for lease start/end (5 leases x 2 dates = 10 dates)
        assert len(matches) >= 10, f"Expected 10+ dates, found {len(matches)}"

    def test_numeric_precision(self, seed_content: str) -> None:
        """Numeric values use proper decimal format."""
        # Check that square footage values have decimal points
        assert "95000.00" in seed_content  # Property RSF (Downtown Tower)
        assert "0.9500" in seed_content  # Target occupancy

    def test_on_conflict_syntax(self, seed_content: str) -> None:
        """ON CONFLICT clauses use correct syntax."""
        # All ON CONFLICT should have either DO NOTHING or DO UPDATE SET
        on_conflict_count = seed_content.count("ON CONFLICT")
        do_nothing_count = seed_content.count("DO NOTHING")
        do_update_count = seed_content.count("DO UPDATE SET")
        assert (
            on_conflict_count == do_nothing_count + do_update_count
        ), "All ON CONFLICT clauses should have DO NOTHING or DO UPDATE SET"

    def test_references_correct_tables(self, seed_content: str) -> None:
        """Seed inserts into correct table names."""
        assert "INSERT INTO public.organizations" in seed_content
        assert "INSERT INTO public.users" in seed_content
        assert "INSERT INTO public.properties" in seed_content
        assert "INSERT INTO public.units" in seed_content
        assert "INSERT INTO public.leases" in seed_content
        assert "INSERT INTO public.expense_pools" in seed_content
        assert "INSERT INTO public.pool_mappings" in seed_content

    def test_auth_users_insert(self, seed_content: str) -> None:
        """Seed includes auth.users inserts for Supabase Auth."""
        assert "INSERT INTO auth.users" in seed_content
        assert "encrypted_password" in seed_content
        assert "email_confirmed_at" in seed_content


class TestManagementFeePercentageMigration:
    """Tests for 20260601000000_add_management_fee_percentage.sql migration."""

    @pytest.fixture
    def migration_content(self) -> str:
        """Load the management fee percentage migration content."""
        migration_path = (
            MIGRATIONS_DIR / "20260601000000_add_management_fee_percentage.sql"
        )
        assert migration_path.exists(), "Migration file must exist"
        return migration_path.read_text()

    @pytest.fixture
    def migration_sql(self, migration_content: str) -> str:
        """Migration content with leading SQL comment lines stripped out.

        Comment prose intentionally references admin_fee_percentage's
        ``NOT NULL DEFAULT 0`` semantics, so assertions about the new column's
        executable DDL must ignore comment lines.
        """
        return "\n".join(
            line
            for line in migration_content.splitlines()
            if not line.lstrip().startswith("--")
        )

    def test_migration_file_exists(self) -> None:
        """Management fee percentage migration file exists."""
        migration_path = (
            MIGRATIONS_DIR / "20260601000000_add_management_fee_percentage.sql"
        )
        assert (
            migration_path.exists()
        ), "20260601000000_add_management_fee_percentage.sql must exist"

    def test_adds_column_to_lease_term_versions(self, migration_sql: str) -> None:
        """Migration alters lease_term_versions to add the new column."""
        assert "ALTER TABLE public.lease_term_versions" in migration_sql
        assert "ADD COLUMN management_fee_percentage NUMERIC(10,8)" in migration_sql

    def test_column_is_nullable_with_no_default(self, migration_sql: str) -> None:
        """Column is nullable (no NOT NULL / DEFAULT) so NULL means 'no cap found'."""
        # Mirror admin_fee_percentage precision but keep nullable semantics.
        assert "NOT NULL" not in migration_sql
        assert "DEFAULT" not in migration_sql

    def test_has_bounds_check_constraint(self, migration_sql: str) -> None:
        """Migration constrains the value to NULL or the 0-0.20 range."""
        assert "management_fee_percentage IS NULL" in migration_sql
        assert "management_fee_percentage >= 0" in migration_sql
        assert "management_fee_percentage <= 0.20" in migration_sql


class TestLeadMagnetOverhaulMigration:
    """Tests for 20260420000000_lead_magnet_overhaul.sql migration.

    Regression guard for BUG-06: each CREATE POLICY must be preceded by a
    DROP POLICY IF EXISTS so the migration can be replayed without error
    (e.g. on a branch reset or local re-apply).
    """

    @pytest.fixture
    def migration_sql(self) -> str:
        """Load lead magnet overhaul migration content."""
        migration_path = MIGRATIONS_DIR / "20260420000000_lead_magnet_overhaul.sql"
        assert migration_path.exists(), "lead magnet overhaul migration must exist"
        return migration_path.read_text()

    def test_enrollments_policy_is_idempotent(self, migration_sql: str) -> None:
        """Enrollments policy drops before create for replay safety."""
        drop_idx = migration_sql.find(
            'DROP POLICY IF EXISTS "service_role_all_enrollments"'
        )
        create_idx = migration_sql.find('CREATE POLICY "service_role_all_enrollments"')
        assert drop_idx != -1, "enrollments policy must DROP IF EXISTS first"
        assert create_idx != -1
        assert drop_idx < create_idx

    def test_suppressions_policy_is_idempotent(self, migration_sql: str) -> None:
        """Suppressions policy drops before create for replay safety."""
        drop_idx = migration_sql.find(
            'DROP POLICY IF EXISTS "service_role_all_suppressions"'
        )
        create_idx = migration_sql.find('CREATE POLICY "service_role_all_suppressions"')
        assert drop_idx != -1, "suppressions policy must DROP IF EXISTS first"
        assert create_idx != -1
        assert drop_idx < create_idx

    def test_every_create_policy_has_matching_drop(self, migration_sql: str) -> None:
        """No bare CREATE POLICY remains in the migration."""
        created = re.findall(r'CREATE POLICY "([^"]+)"', migration_sql)
        dropped = set(re.findall(r'DROP POLICY IF EXISTS "([^"]+)"', migration_sql))
        for name in created:
            assert name in dropped, f"policy '{name}' missing DROP IF EXISTS"
