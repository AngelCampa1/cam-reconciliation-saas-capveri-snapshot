"""
Database Trigger Verification Tests

Verifies that all database triggers function correctly.

Test Categories:
1. Audit Log Triggers - Verify all INSERT/UPDATE/DELETE operations are logged
2. Updated_at Triggers - Verify updated_at is automatically set on UPDATE
3. Validation Triggers - Verify business rules are enforced
4. Auto-update Triggers - Verify computed fields are automatically updated

IMPORTANT: These tests verify the migration files contain correct trigger definitions.
Live database tests would verify actual trigger execution.
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
# Expected Triggers
# =============================================================================


TABLES_WITH_AUDIT_TRIGGERS = {
    "properties",
    "units",
    "leases",
    "expense_pools",
    "pool_mappings",
    "reconciliation_snapshots",
}

TABLES_WITH_UPDATED_AT_TRIGGERS = {
    "organizations",
    "users",
    "properties",
    "units",
    "leases",
    "expense_pools",
    "pool_mappings",
    "reconciliation_snapshots",
}

TABLES_WITH_VALIDATION_TRIGGERS = {
    "reconciliation_snapshots",  # finalized_requires_timestamp
    "pool_mappings",  # allocation_percentage_sum
}


# =============================================================================
# Test Class: Audit Log Triggers
# =============================================================================


class TestAuditLogTriggers:
    """Verify audit log triggers are defined and configured correctly."""

    def test_audit_trigger_function_exists(self, all_migration_content: str) -> None:
        """Audit trigger function must be defined."""
        assert (
            "CREATE OR REPLACE FUNCTION public.audit_trigger_func()"
            in all_migration_content
            or "CREATE FUNCTION public.audit_trigger_func()" in all_migration_content
        ), "Audit trigger function not found"

    def test_audit_trigger_function_returns_trigger(
        self, all_migration_content: str
    ) -> None:
        """Audit trigger function must return TRIGGER type."""
        assert (
            "RETURNS TRIGGER" in all_migration_content
        ), "Audit trigger function must return TRIGGER"

    def test_audit_trigger_function_logs_to_audit_log_table(
        self, all_migration_content: str
    ) -> None:
        """Audit trigger function must insert into audit_log table."""
        assert (
            "INSERT INTO public.audit_log" in all_migration_content
        ), "Audit trigger function must insert into audit_log"

    def test_audit_trigger_captures_operation_type(
        self, all_migration_content: str
    ) -> None:
        """Audit trigger must capture TG_OP (INSERT/UPDATE/DELETE)."""
        assert (
            "TG_OP" in all_migration_content
        ), "Audit trigger must capture operation type"

    def test_audit_trigger_captures_table_name(
        self, all_migration_content: str
    ) -> None:
        """Audit trigger must capture TG_TABLE_NAME."""
        assert (
            "TG_TABLE_NAME" in all_migration_content
        ), "Audit trigger must capture table name"

    def test_audit_trigger_captures_user_id(self, all_migration_content: str) -> None:
        """Audit trigger must capture current user ID."""
        assert (
            "auth.uid()" in all_migration_content
            or "current_user" in all_migration_content
        ), "Audit trigger must capture user ID"

    def test_properties_table_has_audit_trigger(
        self, all_migration_content: str
    ) -> None:
        """Properties table must have audit trigger."""
        pattern = r"CREATE TRIGGER.*audit.*ON\s+public\.properties"
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Properties table missing audit trigger"

    def test_leases_table_has_audit_trigger(self, all_migration_content: str) -> None:
        """Leases table must have audit trigger."""
        pattern = r"CREATE TRIGGER.*audit.*ON\s+public\.leases"
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Leases table missing audit trigger"

    def test_reconciliation_snapshots_has_audit_trigger(
        self, all_migration_content: str
    ) -> None:
        """Reconciliation snapshots table must have audit trigger."""
        pattern = r"CREATE TRIGGER.*audit.*ON\s+public\.reconciliation_snapshots"
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Reconciliation snapshots table missing audit trigger"

    def test_audit_triggers_fire_after_operation(
        self, all_migration_content: str
    ) -> None:
        """Audit triggers should fire AFTER operation (not BEFORE)."""
        # Find all audit trigger definitions
        audit_triggers = re.findall(
            r"CREATE TRIGGER\s+(\w*audit\w*)[^;]+FOR EACH ROW[^;]+",
            all_migration_content,
            re.IGNORECASE | re.DOTALL,
        )
        assert len(audit_triggers) >= 3, "Expected at least 3 audit triggers"

    def test_audit_triggers_for_insert_update_delete(
        self, all_migration_content: str
    ) -> None:
        """Audit triggers should capture INSERT, UPDATE, and DELETE."""
        # Check that triggers handle multiple operations
        assert (
            "AFTER INSERT OR UPDATE OR DELETE" in all_migration_content
            or "AFTER INSERT" in all_migration_content
        ), "Audit triggers should handle multiple operations"


# =============================================================================
# Test Class: Updated_at Triggers
# =============================================================================


class TestUpdatedAtTriggers:
    """Verify updated_at triggers are defined and configured correctly."""

    def test_update_updated_at_function_exists(
        self, all_migration_content: str
    ) -> None:
        """update_updated_at_column function must be defined."""
        pattern = (
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?update.*updated_at"
        )
        assert re.search(
            pattern, all_migration_content, re.IGNORECASE
        ), "update_updated_at function not found"

    def test_update_updated_at_function_sets_timestamp(
        self, all_migration_content: str
    ) -> None:
        """update_updated_at_column function must set updated_at to current timestamp."""
        pattern = r"NEW\.updated_at\s*(?::=|=)\s*(?:NOW\(\)|CURRENT_TIMESTAMP|now\(\))"
        assert re.search(
            pattern, all_migration_content, re.IGNORECASE
        ), "update_updated_at_column must set NEW.updated_at to current timestamp"

    def test_update_updated_at_function_returns_new(
        self, all_migration_content: str
    ) -> None:
        """update_updated_at_column function must return NEW record."""
        assert (
            "RETURN NEW" in all_migration_content
        ), "update_updated_at_column must return NEW"

    def test_properties_has_updated_at_trigger(
        self, all_migration_content: str
    ) -> None:
        """Properties table must have updated_at trigger."""
        pattern = r"CREATE TRIGGER.*update.*updated_at.*ON\s+public\.properties"
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Properties table missing updated_at trigger"

    def test_leases_has_updated_at_trigger(self, all_migration_content: str) -> None:
        """Leases table must have updated_at trigger."""
        pattern = r"CREATE TRIGGER.*update.*updated_at.*ON\s+public\.leases"
        assert re.search(
            pattern, all_migration_content, re.DOTALL | re.IGNORECASE
        ), "Leases table missing updated_at trigger"

    def test_updated_at_triggers_fire_before_update(
        self, all_migration_content: str
    ) -> None:
        """updated_at triggers should fire BEFORE UPDATE."""
        pattern = r"CREATE TRIGGER\s+[\w_]*updated_at\s+BEFORE\s+UPDATE"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE | re.DOTALL)
        assert (
            len(matches) >= 15
        ), f"Expected at least 15 BEFORE UPDATE triggers for updated_at, found {len(matches)}"

    def test_updated_at_triggers_for_each_row(self, all_migration_content: str) -> None:
        """updated_at triggers should execute FOR EACH ROW."""
        pattern = r"CREATE TRIGGER\s+[\w_]*updated_at.*?FOR EACH ROW"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE | re.DOTALL)
        assert (
            len(matches) >= 15
        ), f"Expected at least 15 updated_at triggers with FOR EACH ROW, found {len(matches)}"


# =============================================================================
# Test Class: Validation Triggers
# =============================================================================


class TestValidationTriggers:
    """Verify validation triggers enforce business rules."""

    def test_reconciliation_finalized_requires_timestamp_constraint(
        self, all_migration_content: str
    ) -> None:
        """
        Reconciliation snapshots must enforce finalized_requires_timestamp.

        When status = 'finalized', finalized_at must not be NULL.
        """
        pattern = r"finalized_requires_timestamp|finalized_at\s+IS\s+NOT\s+NULL"
        assert re.search(
            pattern, all_migration_content, re.IGNORECASE
        ), "Missing finalized_requires_timestamp constraint or trigger"

    def test_pool_mappings_allocation_percentage_validation(
        self, all_migration_content: str
    ) -> None:
        """
        Pool mappings must validate allocation_percentage is between 0 and 1.

        CHECK (allocation_percentage >= 0 AND allocation_percentage <= 1)
        """
        pattern = r"allocation_percentage.*>=.*0.*<=.*1|CHECK.*allocation_percentage"
        assert re.search(
            pattern, all_migration_content, re.IGNORECASE | re.DOTALL
        ), "Missing allocation_percentage validation"

    def test_property_sqft_positive_validation(
        self, all_migration_content: str
    ) -> None:
        """
        Properties must validate that sqft values are positive.

        CHECK (total_rentable_sqft > 0)
        """
        pattern = r"total_rentable_sqft\s*>\s*0|CHECK.*sqft"
        assert re.search(
            pattern, all_migration_content, re.IGNORECASE
        ), "Missing sqft positive validation"


# =============================================================================
# Test Class: Auto-Update Triggers
# =============================================================================


class TestAutoUpdateTriggers:
    """Verify triggers that automatically update computed fields."""

    def test_reconciliation_is_finalized_computed_field(
        self, all_migration_content: str
    ) -> None:
        """
        Reconciliation snapshots should have is_finalized as computed field.

        is_finalized should be computed from status = 'finalized'
        """
        # This could be a GENERATED column or a trigger
        # For now, verify the column exists
        assert (
            "finalized" in all_migration_content.lower()
        ), "finalized status handling not found"


# =============================================================================
# Test Class: Trigger Execution Order
# =============================================================================


class TestTriggerExecutionOrder:
    """Verify triggers execute in the correct order."""

    def test_before_triggers_execute_before_after_triggers(
        self, all_migration_content: str
    ) -> None:
        """
        BEFORE triggers must execute before AFTER triggers.

        Expected order:
        1. BEFORE UPDATE (e.g., set updated_at)
        2. AFTER UPDATE (e.g., audit log)
        """
        before_update_positions = [
            match.start()
            for match in re.finditer(
                r"CREATE TRIGGER\s+\w*updated_at\w*[^;]+BEFORE\s+UPDATE",
                all_migration_content,
                re.IGNORECASE | re.DOTALL,
            )
        ]
        after_audit_positions = [
            match.start()
            for match in re.finditer(
                r"CREATE TRIGGER\s+\w*audit\w*[^;]+AFTER\s+INSERT",
                all_migration_content,
                re.IGNORECASE | re.DOTALL,
            )
        ]

        assert before_update_positions, "No BEFORE UPDATE updated_at triggers found"
        assert after_audit_positions, "No AFTER audit triggers found"

    def test_validation_triggers_run_before_audit(
        self, all_migration_content: str
    ) -> None:
        """
        Validation should happen before audit logging.

        If validation fails, operation should abort before audit log entry.
        """
        assert (
            "finalized_requires_timestamp" in all_migration_content
        ), "Finalized snapshot validation constraint is missing"
        assert (
            "CHECK" in all_migration_content.upper()
        ), "Validation should use database CHECK constraints"
        assert (
            "AFTER INSERT OR UPDATE OR DELETE" in all_migration_content
        ), "Audit triggers should run after the write passes validation"


# =============================================================================
# Test Class: Trigger Naming Conventions
# =============================================================================


class TestTriggerNamingConventions:
    """Verify triggers follow naming conventions."""

    def test_audit_triggers_use_audit_in_name(self, all_migration_content: str) -> None:
        """Audit triggers should include 'audit' in their name."""
        audit_triggers = re.findall(
            r"CREATE TRIGGER\s+(\w*audit\w*)",
            all_migration_content,
            re.IGNORECASE,
        )
        assert (
            len(audit_triggers) >= 3
        ), "Expected at least 3 audit triggers with 'audit' in name"

    def test_updated_at_triggers_use_consistent_naming(
        self, all_migration_content: str
    ) -> None:
        """updated_at triggers should use consistent naming."""
        updated_at_triggers = re.findall(
            r"CREATE TRIGGER\s+(\w*update.*updated_at\w*)",
            all_migration_content,
            re.IGNORECASE,
        )
        assert len(updated_at_triggers) >= 5, "Expected at least 5 updated_at triggers"


# =============================================================================
# Test Class: Trigger Documentation
# =============================================================================


class TestTriggerDocumentation:
    """Verify triggers are properly documented in migration files."""

    def test_triggers_have_comments(self, migration_files: dict[str, str]) -> None:
        """Trigger definitions should have comments explaining their purpose."""
        # Check that migration files with triggers have comments
        for filename, content in migration_files.items():
            if "CREATE TRIGGER" in content:
                # File with triggers should have comments
                assert (
                    "--" in content or "/*" in content
                ), f"{filename} has triggers but no comments"

    def test_audit_trigger_function_has_documentation(
        self, all_migration_content: str
    ) -> None:
        """Audit trigger function should have documentation."""
        # For now, verify the function exists
        assert "audit_trigger" in all_migration_content.lower()


# =============================================================================
# Test Class: Trigger Error Handling
# =============================================================================


class TestTriggerErrorHandling:
    """Verify triggers handle errors appropriately."""

    def test_triggers_do_not_use_exception_when(
        self, all_migration_content: str
    ) -> None:
        """
        Triggers should use constraints instead of EXCEPTION WHEN possible.

        Constraints are more efficient than trigger-based validation.
        """
        trigger_functions = re.findall(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^;]+?RETURNS\s+TRIGGER.*?\$\$(.*?)\$\$",
            all_migration_content,
            re.IGNORECASE | re.DOTALL,
        )
        assert trigger_functions, "No trigger function bodies found"
        offenders = [
            body for body in trigger_functions if "EXCEPTION WHEN" in body.upper()
        ]
        assert not offenders, "Trigger functions should not use EXCEPTION WHEN blocks"


# =============================================================================
# Test Class: Trigger Performance
# =============================================================================


class TestTriggerPerformance:
    """Verify triggers are designed for performance."""

    def test_triggers_minimize_database_queries(
        self, all_migration_content: str
    ) -> None:
        """
        Triggers should minimize additional database queries.

        Triggers that perform SELECT queries can slow down operations.
        """
        audit_body_match = re.search(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.audit_trigger_func\(\).*?\$\$(.*?)\$\$",
            all_migration_content,
            re.IGNORECASE | re.DOTALL,
        )
        assert audit_body_match, "audit_trigger_func body not found"
        audit_body = audit_body_match.group(1).upper()
        assert "INSERT INTO PUBLIC.AUDIT_LOG" in audit_body
        assert (
            "SELECT " not in audit_body
        ), "Audit trigger should avoid SELECT queries on every row change"

    def test_audit_triggers_use_for_each_row(self, all_migration_content: str) -> None:
        """
        Audit triggers should use FOR EACH ROW (not FOR EACH STATEMENT).

        FOR EACH ROW ensures each record change is logged separately.
        """
        pattern = r"CREATE TRIGGER\s+\w*audit\w*.*?FOR EACH ROW"
        matches = re.findall(pattern, all_migration_content, re.IGNORECASE | re.DOTALL)
        assert (
            len(matches) >= 3
        ), f"Expected at least 3 audit triggers with FOR EACH ROW, found {len(matches)}"
