"""
Enum Synchronization Verification Tests

Verifies that all enum values match across:
1. Python (backend/app/models/enums.py)
2. TypeScript (frontend/src/types/enums.ts)
3. PostgreSQL (database enum types)

CRITICAL: Enums must match exactly to prevent data corruption and validation errors.

Test Categories:
1. Python Enum Structure - Verify all enums are properly defined
2. Python-TypeScript Sync - Ensure frontend matches backend
3. Python-PostgreSQL Sync - Ensure database matches backend
4. Enum Value Format - Verify lowercase snake_case convention
"""

import re
from pathlib import Path

import pytest

from app.models import (
    CalculationJobStatus,
    CapType,
    DisputeCategory,
    DisputeStatus,
    DocumentStatus,
    DocumentType,
    ExtractionJobPriority,
    ExtractionJobStatus,
    ImportStatus,
    LeaseStatus,
    NotificationType,
    PoolType,
    ReconciliationStatus,
    StatementStatus,
    UnitStatus,
    UserRole,
)
from app.models.feedback import FeedbackStatus, FeedbackType
from app.models.invoice import InvoiceStatus
from app.models.organization import SubscriptionStatus
from app.models.promotion import DiscountType, PromotionStatus
from app.models.subscription import BillingSubscriptionStatus

# Path to project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
FRONTEND_ENUMS_PATH = PROJECT_ROOT / "frontend" / "src" / "types" / "enums.ts"
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


# =============================================================================
# Test Data: All Enums
# =============================================================================


ALL_STRING_ENUMS = {
    "CapType": CapType,
    "PoolType": PoolType,
    "LeaseStatus": LeaseStatus,
    "ImportStatus": ImportStatus,
    "UserRole": UserRole,
    "ReconciliationStatus": ReconciliationStatus,
    "UnitStatus": UnitStatus,
    "DocumentStatus": DocumentStatus,
    "DocumentType": DocumentType,
    "ExtractionJobStatus": ExtractionJobStatus,
    "StatementStatus": StatementStatus,
    "NotificationType": NotificationType,
    "DisputeStatus": DisputeStatus,
    "DisputeCategory": DisputeCategory,
    "CalculationJobStatus": CalculationJobStatus,
    "InvoiceStatus": InvoiceStatus,
    "FeedbackType": FeedbackType,
    "FeedbackStatus": FeedbackStatus,
    "SubscriptionStatus": SubscriptionStatus,
    "BillingSubscriptionStatus": BillingSubscriptionStatus,
    "DiscountType": DiscountType,
    "PromotionStatus": PromotionStatus,
}

ALL_INT_ENUMS = {
    "ExtractionJobPriority": ExtractionJobPriority,
}

DATABASE_ENUMS = {
    "invoice_status": InvoiceStatus,
    "discount_type": DiscountType,
    "promotion_status": PromotionStatus,
    "feedback_type": FeedbackType,
    "feedback_status": FeedbackStatus,
    "disputestatus": DisputeStatus,
    "disputecategory": DisputeCategory,
    "notificationtype": NotificationType,
}


# =============================================================================
# Test Class: Python Enum Structure
# =============================================================================


class TestPythonEnumStructure:
    """Verify Python enums are properly defined."""

    def test_all_string_enums_use_str_mixin(self) -> None:
        """All string enums must inherit from str to ensure JSON serialization."""
        for enum_name, enum_class in ALL_STRING_ENUMS.items():
            assert issubclass(
                enum_class, str
            ), f"{enum_name} must inherit from str for JSON serialization"

    def test_all_int_enums_use_int_mixin(self) -> None:
        """All integer enums must inherit from int."""
        for enum_name, enum_class in ALL_INT_ENUMS.items():
            assert issubclass(
                enum_class, int
            ), f"{enum_name} must inherit from int for numeric values"

    def test_string_enum_values_are_lowercase_snake_case(self) -> None:
        """All string enum values must be lowercase with underscores."""
        for enum_name, enum_class in ALL_STRING_ENUMS.items():
            for member in enum_class:
                value = member.value
                assert (
                    value == value.lower()
                ), f"{enum_name}.{member.name} value '{value}' must be lowercase"
                assert (
                    " " not in value
                ), f"{enum_name}.{member.name} value '{value}' must not contain spaces"

    def test_enum_names_are_capitalized(self) -> None:
        """All enum member names must be UPPERCASE."""
        for enum_name, enum_class in ALL_STRING_ENUMS.items():
            for member in enum_class:
                name = member.name
                assert (
                    name == name.upper()
                ), f"{enum_name} member name '{name}' must be UPPERCASE"

    def test_no_duplicate_values_in_enums(self) -> None:
        """Each enum must have unique values."""
        for enum_name, enum_class in {**ALL_STRING_ENUMS, **ALL_INT_ENUMS}.items():
            values = [member.value for member in enum_class]
            assert len(values) == len(
                set(values)
            ), f"{enum_name} has duplicate values: {values}"


# =============================================================================
# Test Class: Enum Completeness
# =============================================================================


class TestEnumCompleteness:
    """Verify all enums have comprehensive value coverage."""

    def test_cap_type_has_all_variants(self) -> None:
        """CapType should have all cap calculation variants."""
        expected = {"none", "non_cumulative", "cumulative", "cumulative_compounding"}
        actual = {member.value for member in CapType}
        assert actual == expected, f"CapType missing variants: {expected - actual}"

    def test_user_role_has_all_roles(self) -> None:
        """UserRole should have all user permission levels."""
        expected = {"owner", "admin", "member", "viewer", "tenant"}
        actual = {member.value for member in UserRole}
        assert actual == expected, f"UserRole missing roles: {expected - actual}"

    def test_lease_status_has_all_states(self) -> None:
        """LeaseStatus should have all lease lifecycle states."""
        expected = {"draft", "active", "expired", "terminated"}
        actual = {member.value for member in LeaseStatus}
        assert actual == expected, f"LeaseStatus missing states: {expected - actual}"

    def test_reconciliation_status_has_all_states(self) -> None:
        """ReconciliationStatus should have all workflow states."""
        expected = {"draft", "finalized"}
        actual = {member.value for member in ReconciliationStatus}
        assert (
            actual == expected
        ), f"ReconciliationStatus missing states: {expected - actual}"

    def test_unit_status_has_all_states(self) -> None:
        """UnitStatus should have all occupancy states."""
        expected = {"vacant", "occupied", "under_renovation"}
        actual = {member.value for member in UnitStatus}
        assert actual == expected, f"UnitStatus missing states: {expected - actual}"

    def test_import_status_has_all_states(self) -> None:
        """ImportStatus should have all import workflow states."""
        expected = {"pending", "processing", "completed", "failed"}
        actual = {member.value for member in ImportStatus}
        assert actual == expected, f"ImportStatus missing states: {expected - actual}"

    def test_document_status_has_all_states(self) -> None:
        """DocumentStatus should have all OCR pipeline states."""
        expected = {
            "pending",
            "processing",
            "completed",
            "failed",
            "ready_for_review",
            "verified",
            "rejected",
        }
        actual = {member.value for member in DocumentStatus}
        assert actual == expected, f"DocumentStatus missing states: {expected - actual}"

    def test_dispute_status_has_all_states(self) -> None:
        """DisputeStatus should have all dispute workflow states."""
        expected = {"open", "under_review", "resolved", "rejected", "closed"}
        actual = {member.value for member in DisputeStatus}
        assert actual == expected, f"DisputeStatus missing states: {expected - actual}"


# =============================================================================
# Test Class: Frontend TypeScript Enum Sync
# =============================================================================


class TestFrontendEnumSync:
    """Verify frontend TypeScript enums match backend Python enums."""

    @pytest.fixture
    def frontend_enums_content(self) -> str:
        """Load frontend enums.ts file content."""
        return FRONTEND_ENUMS_PATH.read_text()

    def test_frontend_enums_file_exists(self) -> None:
        """Frontend enums.ts file must exist."""
        assert (
            FRONTEND_ENUMS_PATH.exists()
        ), f"Frontend enums file not found at {FRONTEND_ENUMS_PATH}"

    def test_frontend_has_all_backend_enums(self, frontend_enums_content: str) -> None:
        """Frontend must define all backend enum types."""
        for enum_name in ALL_STRING_ENUMS.keys():
            assert (
                f"export enum {enum_name}" in frontend_enums_content
                or f"export const {enum_name}" in frontend_enums_content
            ), f"Frontend missing enum: {enum_name}"

    def test_frontend_cap_type_matches_backend(
        self, frontend_enums_content: str
    ) -> None:
        """Frontend CapType values must match backend."""
        backend_values = {member.value for member in CapType}
        for value in backend_values:
            # TypeScript enum format: NONE: 'none' or NONE: "none"
            assert (
                f"'{value}'" in frontend_enums_content
                or f'"{value}"' in frontend_enums_content
            ), f"Frontend CapType missing value: {value}"

    def test_frontend_user_role_matches_backend(
        self, frontend_enums_content: str
    ) -> None:
        """Frontend UserRole values must match backend."""
        backend_values = {member.value for member in UserRole}
        for value in backend_values:
            assert (
                f"'{value}'" in frontend_enums_content
                or f'"{value}"' in frontend_enums_content
            ), f"Frontend UserRole missing value: {value}"

    def test_frontend_lease_status_matches_backend(
        self, frontend_enums_content: str
    ) -> None:
        """Frontend LeaseStatus values must match backend."""
        backend_values = {member.value for member in LeaseStatus}
        for value in backend_values:
            assert (
                f"'{value}'" in frontend_enums_content
                or f'"{value}"' in frontend_enums_content
            ), f"Frontend LeaseStatus missing value: {value}"

    def test_frontend_unit_status_matches_backend(
        self, frontend_enums_content: str
    ) -> None:
        """Frontend UnitStatus values must match backend."""
        backend_values = {member.value for member in UnitStatus}
        for value in backend_values:
            assert (
                f"'{value}'" in frontend_enums_content
                or f'"{value}"' in frontend_enums_content
            ), f"Frontend UnitStatus missing value: {value}"

    def test_frontend_reconciliation_status_matches_backend(
        self, frontend_enums_content: str
    ) -> None:
        """Frontend ReconciliationStatus values must match backend."""
        backend_values = {member.value for member in ReconciliationStatus}
        for value in backend_values:
            assert (
                f"'{value}'" in frontend_enums_content
                or f'"{value}"' in frontend_enums_content
            ), f"Frontend ReconciliationStatus missing value: {value}"


# =============================================================================
# Test Class: Database Enum Sync (Documentation)
# =============================================================================


class TestDatabaseEnumSync:
    """
    Document database enum types that should match Python enums.

    These tests verify the pattern is correct. Actual database enum
    verification requires running SQL queries against a live database.
    """

    @pytest.fixture
    def database_enum_definitions(self) -> dict[str, set[str]]:
        """Parse PostgreSQL enum definitions from migration files."""
        all_sql = "\n".join(
            migration.read_text() for migration in sorted(MIGRATIONS_DIR.glob("*.sql"))
        )
        definitions = {}
        for match in re.finditer(
            r"CREATE\s+TYPE\s+(?:public\.)?(\w+)\s+AS\s+ENUM\s*\((.*?)\);",
            all_sql,
            re.IGNORECASE | re.DOTALL,
        ):
            definitions[match.group(1)] = set(re.findall(r"'([^']+)'", match.group(2)))
        return definitions

    def test_database_enum_types_documented(
        self, database_enum_definitions: dict[str, set[str]]
    ) -> None:
        """
        Database should have enum types for critical enums.

        Expected PostgreSQL enum types:
        - user_role_enum
        - lease_status_enum
        - unit_status_enum
        - reconciliation_status_enum
        - import_status_enum
        - document_status_enum
        - subscription_status_enum

        Verify with:
        SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;
        """
        for enum_type in DATABASE_ENUMS:
            assert (
                enum_type in database_enum_definitions
            ), f"Database enum type missing from migrations: {enum_type}"

    def test_database_enum_values_match_python(
        self, database_enum_definitions: dict[str, set[str]]
    ) -> None:
        """
        Database enum values should match Python enum values.

        Example query to verify:
        SELECT enumlabel FROM pg_enum WHERE enumtypid = 'user_role_enum'::regtype::oid;

        Should return: owner, admin, member, viewer, tenant
        """
        for enum_type, enum_class in DATABASE_ENUMS.items():
            expected = {member.value for member in enum_class}
            actual = database_enum_definitions[enum_type]
            assert actual == expected, (
                f"Database enum {enum_type} does not match Python enum "
                f"{enum_class.__name__}: missing={expected - actual}, "
                f"extra={actual - expected}"
            )


# =============================================================================
# Test Class: Enum Usage Consistency
# =============================================================================


class TestEnumUsageConsistency:
    """Verify enums are used consistently in models."""

    def test_status_enums_use_consistent_naming(self) -> None:
        """All status enums should follow *Status naming convention."""
        status_enums = [
            name for name in ALL_STRING_ENUMS.keys() if name.endswith("Status")
        ]
        assert len(status_enums) >= 10, "Expected at least 10 status enums"

        # All status enums should have PENDING/COMPLETED/FAILED or similar workflow
        for enum_name in status_enums:
            enum_class = ALL_STRING_ENUMS[enum_name]
            values = {member.value for member in enum_class}
            # Status enums typically have workflow-style values
            assert len(values) >= 2, f"{enum_name} should have at least 2 states"

    def test_type_enums_use_consistent_naming(self) -> None:
        """All type enums should follow *Type naming convention."""
        type_enums = [name for name in ALL_STRING_ENUMS.keys() if name.endswith("Type")]
        assert len(type_enums) >= 4, "Expected at least 4 type enums"

        for enum_name in type_enums:
            enum_class = ALL_STRING_ENUMS[enum_name]
            values = {member.value for member in enum_class}
            # Type enums typically categorize entities
            assert len(values) >= 2, f"{enum_name} should have at least 2 types"


# =============================================================================
# Test Class: Enum Documentation
# =============================================================================


class TestEnumDocumentation:
    """Verify enums are properly documented."""

    def test_all_enums_have_docstrings(self) -> None:
        """All enum classes must have docstrings."""
        for enum_name, enum_class in {
            **ALL_STRING_ENUMS,
            **ALL_INT_ENUMS,
        }.items():
            assert enum_class.__doc__ is not None, f"{enum_name} must have a docstring"
            assert (
                len(enum_class.__doc__.strip()) > 10
            ), f"{enum_name} docstring is too short"

    def test_enum_docstrings_describe_purpose(self) -> None:
        """Enum docstrings should describe their purpose."""
        for enum_name, enum_class in {
            **ALL_STRING_ENUMS,
            **ALL_INT_ENUMS,
        }.items():
            doc = enum_class.__doc__.strip().lower()
            # Docstring should contain descriptive words
            assert any(
                word in doc
                for word in ["status", "type", "category", "priority", "state", "role"]
            ), f"{enum_name} docstring should describe its purpose"


# =============================================================================
# Test Class: Enum Serialization
# =============================================================================


class TestEnumSerialization:
    """Verify enums serialize correctly for API responses."""

    def test_string_enums_serialize_as_values(self) -> None:
        """String enums should serialize as their string values."""
        for enum_name, enum_class in ALL_STRING_ENUMS.items():
            for member in enum_class:
                # When used in Pydantic models, should serialize as value
                assert isinstance(
                    member.value, str
                ), f"{enum_name}.{member.name} value must be string"
                # Pydantic uses member.value for serialization, not str(member)
                assert isinstance(
                    member, str
                ), f"{enum_name}.{member.name} must be str subclass for JSON serialization"

    def test_int_enums_serialize_as_integers(self) -> None:
        """Integer enums should serialize as their integer values."""
        for enum_name, enum_class in ALL_INT_ENUMS.items():
            for member in enum_class:
                assert isinstance(
                    member.value, int
                ), f"{enum_name}.{member.name} value must be integer"
