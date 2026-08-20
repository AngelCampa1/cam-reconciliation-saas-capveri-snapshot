"""
Database performance contract tests.

These tests verify that migrations keep the indexes and query-supporting schema
objects needed for the application's high-volume database paths. They do not
benchmark a live database; live performance checks belong in benchmark or E2E
suites with production-like data.
"""

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).parent.parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


def _normalize_sql(sql: str) -> str:
    """Normalize whitespace so assertions are insensitive to SQL formatting."""
    return re.sub(r"\s+", " ", sql.lower()).strip()


def _load_migration(filename: str) -> str:
    path = MIGRATIONS_DIR / filename
    assert path.exists(), f"Missing migration: {filename}"
    return _normalize_sql(path.read_text())


@pytest.fixture(scope="module")
def migrations() -> dict[str, str]:
    """Load migrations that define performance-critical schema objects."""
    filenames = [
        "20240101000003_create_properties.sql",
        "20240101000004_create_units.sql",
        "20240101000005_create_leases.sql",
        "20240101000007_create_gl_entries.sql",
        "20240101000008_create_expense_pools.sql",
        "20240101000009_create_pool_mappings.sql",
        "20240101000010_create_reconciliation_snapshots.sql",
        "20240101000060_fix_rls_performance.sql",
        "20260227000001_create_gl_analysis_results.sql",
        "20260227000002_fix_rls_performance.sql",
        "20260302000001_add_accrual_date_and_accounting_basis.sql",
        "20260302000002_create_capex_flags.sql",
        "20260311000000_cross_doc_analyses.sql",
        "20260520000000_add_organizations_settings_gin_index.sql",
    ]
    return {filename: _load_migration(filename) for filename in filenames}


class TestIndexedQueryContracts:
    """Verify the migrations support the application's common indexed lookups."""

    def test_property_organization_lookup_has_index(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000003_create_properties.sql"]

        assert "create index idx_properties_organization_id" in migration
        assert "on public.properties(organization_id)" in migration

    def test_gl_entry_property_account_and_period_lookups_have_indexes(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000007_create_gl_entries.sql"]
        accrual_migration = migrations[
            "20260302000001_add_accrual_date_and_accounting_basis.sql"
        ]

        assert "create index idx_gl_entries_property_id" in migration
        assert "on public.gl_entries(property_id)" in migration
        assert "create index idx_gl_entries_account_code" in migration
        assert "on public.gl_entries(account_code)" in migration
        assert "create index idx_gl_entries_transaction_date" in migration
        assert "on public.gl_entries(transaction_date)" in migration
        assert "create index idx_gl_entries_period" in migration
        assert (
            "on public.gl_entries(property_id, period_year, period_month)" in migration
        )
        assert "create index idx_gl_entries_accrual_date" in accrual_migration
        assert "on public.gl_entries(property_id, accrual_date)" in accrual_migration

    def test_gl_entry_account_prefix_pool_mapping_index_exists(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000007_create_gl_entries.sql"]

        assert "create index idx_gl_entries_account_prefix" in migration
        assert "on public.gl_entries((left(account_code, 2)))" in migration


class TestJoinPerformanceContracts:
    """Verify foreign-key join paths have supporting indexes on child tables."""

    def test_property_child_tables_have_property_id_indexes(
        self, migrations: dict[str, str]
    ) -> None:
        expected_indexes = {
            "20240101000004_create_units.sql": (
                "idx_units_property_id",
                "public.units(property_id)",
            ),
            "20240101000005_create_leases.sql": (
                "idx_leases_property_id",
                "public.leases(property_id)",
            ),
            "20240101000007_create_gl_entries.sql": (
                "idx_gl_entries_property_id",
                "public.gl_entries(property_id)",
            ),
            "20240101000008_create_expense_pools.sql": (
                "idx_expense_pools_property_id",
                "public.expense_pools(property_id)",
            ),
            "20240101000010_create_reconciliation_snapshots.sql": (
                "idx_reconciliation_snapshots_property_id",
                "public.reconciliation_snapshots(property_id)",
            ),
        }

        for filename, (index_name, indexed_expression) in expected_indexes.items():
            migration = migrations[filename]
            assert f"create index {index_name}" in migration
            assert f"on {indexed_expression}" in migration

    def test_pool_mapping_join_chain_has_indexes(
        self, migrations: dict[str, str]
    ) -> None:
        expense_pools = migrations["20240101000008_create_expense_pools.sql"]
        pool_mappings = migrations["20240101000009_create_pool_mappings.sql"]

        assert "create index idx_expense_pools_property_id" in expense_pools
        assert "on public.expense_pools(property_id)" in expense_pools
        assert "create index idx_pool_mappings_expense_pool_id" in pool_mappings
        assert "on public.pool_mappings(expense_pool_id)" in pool_mappings
        assert "create index idx_pool_mappings_priority" in pool_mappings
        assert "on public.pool_mappings(priority desc)" in pool_mappings

    def test_reconciliation_cap_history_batch_lookup_has_indexes(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000010_create_reconciliation_snapshots.sql"]

        assert "create index idx_reconciliation_snapshots_lease_id" in migration
        assert "on public.reconciliation_snapshots(lease_id)" in migration
        assert "create index idx_reconciliation_snapshots_status" in migration
        assert "on public.reconciliation_snapshots(status)" in migration
        assert "create index idx_reconciliation_snapshots_period" in migration
        assert (
            "on public.reconciliation_snapshots(period_start_date, period_end_date)"
            in migration
        )


class TestJSONBQueryContracts:
    """Verify JSONB-heavy columns retain GIN indexes."""

    def test_lease_recovery_profile_has_gin_index(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000005_create_leases.sql"]

        assert "create index idx_leases_recovery_profile" in migration
        assert "on public.leases using gin (recovery_profile)" in migration

    def test_reconciliation_calculation_trace_has_gin_index(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations["20240101000010_create_reconciliation_snapshots.sql"]

        assert "create index idx_reconciliation_snapshots_trace" in migration
        assert (
            "on public.reconciliation_snapshots using gin (calculation_trace)"
            in migration
        )

    def test_organization_settings_has_gin_index_for_jsonb_filters(
        self, migrations: dict[str, str]
    ) -> None:
        migration = migrations[
            "20260520000000_add_organizations_settings_gin_index.sql"
        ]

        assert "idx_organizations_settings_gin" in migration
        assert "on public.organizations using gin (settings)" in migration


class TestRLSPolicyPerformanceContracts:
    """Verify RLS policy helpers are structured to avoid avoidable per-row work."""

    def test_rls_performance_migrations_use_select_wrapped_auth_functions(
        self, migrations: dict[str, str]
    ) -> None:
        first_fix = migrations["20240101000060_fix_rls_performance.sql"]
        second_fix = migrations["20260227000002_fix_rls_performance.sql"]

        assert "(select auth.uid())" in first_fix
        assert "(select auth.uid())" in second_fix

    def test_org_scoped_analysis_tables_have_organization_indexes(
        self, migrations: dict[str, str]
    ) -> None:
        gl_analysis = migrations["20260227000001_create_gl_analysis_results.sql"]
        capex_flags = migrations["20260302000002_create_capex_flags.sql"]
        cross_doc = migrations["20260311000000_cross_doc_analyses.sql"]

        assert "idx_gl_analysis_org" in gl_analysis
        assert "on gl_analysis_results (organization_id)" in gl_analysis
        assert "idx_capex_flags_org" in capex_flags
        assert "on capex_flags (organization_id)" in capex_flags
        assert "idx_cross_doc_analyses_org" in cross_doc
        assert "on public.cross_doc_analyses (organization_id)" in cross_doc
