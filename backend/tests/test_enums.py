"""Tests for core enumeration types.

Verifies:
1. All enum values are correct
2. JSON serialization works (str mixin)
3. Enum members can be compared to strings
"""

import json

import pytest

from app.models.enums import (
    NATA_SPACE_TYPES,
    BomaStandardVersion,
    CapType,
    ImportStatus,
    LeaseStatus,
    PoolType,
    ReconciliationStatus,
    SpaceType,
    UserRole,
)


class TestCapType:
    """Tests for CapType enum."""

    def test_values(self) -> None:
        """Verify all CapType values match expected strings."""
        assert CapType.NONE.value == "none"
        assert CapType.NON_CUMULATIVE.value == "non_cumulative"
        assert CapType.CUMULATIVE.value == "cumulative"
        assert CapType.CUMULATIVE_COMPOUNDING.value == "cumulative_compounding"

    def test_member_count(self) -> None:
        """Verify CapType has exactly 4 members."""
        assert len(CapType) == 4

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert CapType.NONE == "none"
        assert CapType.CUMULATIVE == "cumulative"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"cap_type": CapType.CUMULATIVE_COMPOUNDING}
        json_str = json.dumps(data)
        assert '"cumulative_compounding"' in json_str

    def test_from_string(self) -> None:
        """Verify enum can be created from string value."""
        assert CapType("none") == CapType.NONE
        assert CapType("cumulative_compounding") == CapType.CUMULATIVE_COMPOUNDING


class TestPoolType:
    """Tests for PoolType enum."""

    def test_values(self) -> None:
        """Verify all PoolType values match expected strings."""
        assert PoolType.OPERATING.value == "operating"
        assert PoolType.TAX.value == "tax"
        assert PoolType.INSURANCE.value == "insurance"
        assert PoolType.CAPITAL.value == "capital"
        assert PoolType.OTHER.value == "other"

    def test_member_count(self) -> None:
        """Verify PoolType has exactly 5 members."""
        assert len(PoolType) == 5

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert PoolType.OPERATING == "operating"
        assert PoolType.TAX == "tax"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"pool_type": PoolType.INSURANCE}
        json_str = json.dumps(data)
        assert '"insurance"' in json_str


class TestLeaseStatus:
    """Tests for LeaseStatus enum."""

    def test_values(self) -> None:
        """Verify all LeaseStatus values match expected strings."""
        assert LeaseStatus.DRAFT.value == "draft"
        assert LeaseStatus.ACTIVE.value == "active"
        assert LeaseStatus.EXPIRED.value == "expired"
        assert LeaseStatus.TERMINATED.value == "terminated"

    def test_member_count(self) -> None:
        """Verify LeaseStatus has exactly 4 members."""
        assert len(LeaseStatus) == 4

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert LeaseStatus.ACTIVE == "active"
        assert LeaseStatus.TERMINATED == "terminated"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"status": LeaseStatus.ACTIVE}
        json_str = json.dumps(data)
        assert '"active"' in json_str


class TestImportStatus:
    """Tests for ImportStatus enum."""

    def test_values(self) -> None:
        """Verify all ImportStatus values match expected strings."""
        assert ImportStatus.PENDING.value == "pending"
        assert ImportStatus.PROCESSING.value == "processing"
        assert ImportStatus.COMPLETED.value == "completed"
        assert ImportStatus.FAILED.value == "failed"

    def test_member_count(self) -> None:
        """Verify ImportStatus has exactly 4 members."""
        assert len(ImportStatus) == 4

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert ImportStatus.PENDING == "pending"
        assert ImportStatus.COMPLETED == "completed"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"status": ImportStatus.PROCESSING}
        json_str = json.dumps(data)
        assert '"processing"' in json_str


class TestUserRole:
    """Tests for UserRole enum."""

    def test_values(self) -> None:
        """Verify all UserRole values match expected strings."""
        assert UserRole.OWNER.value == "owner"
        assert UserRole.ADMIN.value == "admin"
        assert UserRole.MEMBER.value == "member"
        assert UserRole.VIEWER.value == "viewer"
        assert UserRole.TENANT.value == "tenant"

    def test_member_count(self) -> None:
        """Verify UserRole has exactly 5 members."""
        assert len(UserRole) == 5

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert UserRole.OWNER == "owner"
        assert UserRole.VIEWER == "viewer"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"role": UserRole.ADMIN}
        json_str = json.dumps(data)
        assert '"admin"' in json_str

    def test_role_hierarchy_values(self) -> None:
        """Verify role values for common permission checks."""
        # Common pattern: check if user has at least admin role
        admin_roles = {UserRole.OWNER.value, UserRole.ADMIN.value}
        assert UserRole.OWNER.value in admin_roles
        assert UserRole.ADMIN.value in admin_roles
        assert UserRole.MEMBER.value not in admin_roles


class TestReconciliationStatus:
    """Tests for ReconciliationStatus enum."""

    def test_values(self) -> None:
        """Verify all ReconciliationStatus values match expected strings."""
        assert ReconciliationStatus.DRAFT.value == "draft"
        assert ReconciliationStatus.FINALIZED.value == "finalized"

    def test_member_count(self) -> None:
        """Verify ReconciliationStatus has exactly 2 members."""
        assert len(ReconciliationStatus) == 2

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert ReconciliationStatus.DRAFT == "draft"
        assert ReconciliationStatus.FINALIZED == "finalized"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"status": ReconciliationStatus.FINALIZED}
        json_str = json.dumps(data)
        assert '"finalized"' in json_str


class TestEnumImports:
    """Tests for enum imports from models package."""

    def test_import_from_models(self) -> None:
        """Verify all enums can be imported from app.models."""
        from app.models import (
            CapType,
            ImportStatus,
            LeaseStatus,
            PoolType,
            ReconciliationStatus,
            UserRole,
        )

        # Verify they're the correct types
        assert CapType.NONE.value == "none"
        assert ImportStatus.PENDING.value == "pending"
        assert LeaseStatus.ACTIVE.value == "active"
        assert PoolType.OPERATING.value == "operating"
        assert ReconciliationStatus.DRAFT.value == "draft"
        assert UserRole.OWNER.value == "owner"


class TestBomaStandardVersion:
    """Tests for BomaStandardVersion enum."""

    def test_values(self) -> None:
        """Verify all BomaStandardVersion values match expected strings."""
        assert BomaStandardVersion.V2010.value == "2010"
        assert BomaStandardVersion.V2017.value == "2017"
        assert BomaStandardVersion.V2024.value == "2024"
        assert BomaStandardVersion.CUSTOM.value == "custom"

    def test_member_count(self) -> None:
        """Verify BomaStandardVersion has exactly 4 members."""
        assert len(BomaStandardVersion) == 4

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert BomaStandardVersion.V2024 == "2024"
        assert BomaStandardVersion.CUSTOM == "custom"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"boma_version": BomaStandardVersion.V2024}
        json_str = json.dumps(data)
        assert '"2024"' in json_str

    def test_from_string(self) -> None:
        """Verify enum can be created from string value."""
        assert BomaStandardVersion("2024") == BomaStandardVersion.V2024
        assert BomaStandardVersion("2017") == BomaStandardVersion.V2017
        assert BomaStandardVersion("custom") == BomaStandardVersion.CUSTOM


class TestSpaceType:
    """Tests for SpaceType enum."""

    def test_values(self) -> None:
        """Verify all SpaceType values match expected strings."""
        assert SpaceType.OFFICE.value == "office"
        assert SpaceType.RETAIL.value == "retail"
        assert SpaceType.LABORATORY.value == "laboratory"
        assert SpaceType.STORAGE.value == "storage"
        assert SpaceType.OUTDOOR_AMENITY.value == "outdoor_amenity"
        assert SpaceType.EQUIPMENT_SHAFT.value == "equipment_shaft"
        assert SpaceType.OTHER.value == "other"

    def test_member_count(self) -> None:
        """Verify SpaceType has exactly 7 members."""
        assert len(SpaceType) == 7

    def test_string_comparison(self) -> None:
        """Verify enum members can be compared to strings."""
        assert SpaceType.OFFICE == "office"
        assert SpaceType.OUTDOOR_AMENITY == "outdoor_amenity"

    def test_json_serialization(self) -> None:
        """Verify enum serializes to JSON string correctly."""
        data = {"space_type": SpaceType.OUTDOOR_AMENITY}
        json_str = json.dumps(data)
        assert '"outdoor_amenity"' in json_str

    def test_from_string(self) -> None:
        """Verify enum can be created from string value."""
        assert SpaceType("office") == SpaceType.OFFICE
        assert SpaceType("equipment_shaft") == SpaceType.EQUIPMENT_SHAFT


class TestNataSpaceTypes:
    """Tests for NATA_SPACE_TYPES constant."""

    def test_nata_types_are_frozenset(self) -> None:
        """Verify NATA_SPACE_TYPES is a frozenset (immutable constant)."""
        assert isinstance(NATA_SPACE_TYPES, frozenset)

    def test_nata_types_contain_correct_members(self) -> None:
        """Verify NATA_SPACE_TYPES contains exactly the three NATA classifications."""
        assert SpaceType.STORAGE in NATA_SPACE_TYPES
        assert SpaceType.OUTDOOR_AMENITY in NATA_SPACE_TYPES
        assert SpaceType.EQUIPMENT_SHAFT in NATA_SPACE_TYPES
        assert len(NATA_SPACE_TYPES) == 3

    def test_non_nata_types_excluded(self) -> None:
        """Verify standard space types are not in NATA_SPACE_TYPES."""
        assert SpaceType.OFFICE not in NATA_SPACE_TYPES
        assert SpaceType.RETAIL not in NATA_SPACE_TYPES
        assert SpaceType.LABORATORY not in NATA_SPACE_TYPES
        assert SpaceType.OTHER not in NATA_SPACE_TYPES

    def test_nata_types_usable_as_membership_check(self) -> None:
        """Verify NATA_SPACE_TYPES can be used for 'in' checks."""
        outdoor_amenity = SpaceType("outdoor_amenity")
        assert outdoor_amenity in NATA_SPACE_TYPES

        office = SpaceType("office")
        assert office not in NATA_SPACE_TYPES


class TestEnumEdgeCases:
    """Edge case tests for enums."""

    def test_invalid_value_raises(self) -> None:
        """Verify invalid enum value raises ValueError."""
        with pytest.raises(ValueError):
            CapType("invalid_value")

    def test_enum_is_hashable(self) -> None:
        """Verify enums can be used as dict keys."""
        role_permissions = {
            UserRole.OWNER: ["read", "write", "delete", "admin"],
            UserRole.ADMIN: ["read", "write", "delete"],
            UserRole.MEMBER: ["read", "write"],
            UserRole.VIEWER: ["read"],
        }
        assert "admin" in role_permissions[UserRole.OWNER]

    def test_enum_in_set(self) -> None:
        """Verify enums can be used in sets."""
        active_statuses = {LeaseStatus.DRAFT, LeaseStatus.ACTIVE}
        assert LeaseStatus.ACTIVE in active_statuses
        assert LeaseStatus.EXPIRED not in active_statuses
