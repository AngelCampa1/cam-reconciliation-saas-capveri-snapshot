"""Tests for User domain models.

These tests verify that the Pydantic models correctly validate
user data, including email format, role constraints, and
organization linkage.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.enums import UserRole
from app.models.user import (
    User,
    UserCreate,
    UserUpdate,
    UserWithOrg,
)


class TestUserBase:
    """Tests for UserBase model fields."""

    def test_valid_email(self) -> None:
        """Valid email addresses are accepted."""
        user = UserCreate(
            email="test@example.com",
            organization_id=uuid4(),
        )
        assert user.email == "test@example.com"

    def test_invalid_email_rejected(self) -> None:
        """Invalid email addresses are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(email="not-an-email", organization_id=uuid4())
        assert "email" in str(exc_info.value).lower()

    def test_email_without_domain_rejected(self) -> None:
        """Email without domain is rejected."""
        with pytest.raises(ValidationError):
            UserCreate(email="user@", organization_id=uuid4())

    def test_email_without_username_rejected(self) -> None:
        """Email without username is rejected."""
        with pytest.raises(ValidationError):
            UserCreate(email="@domain.com", organization_id=uuid4())

    def test_full_name_optional(self) -> None:
        """Full name is optional."""
        user = UserCreate(
            email="test@example.com",
            organization_id=uuid4(),
        )
        assert user.full_name is None

    def test_full_name_provided(self) -> None:
        """Full name can be provided."""
        user = UserCreate(
            email="test@example.com",
            full_name="John Doe",
            organization_id=uuid4(),
        )
        assert user.full_name == "John Doe"

    def test_full_name_max_length(self) -> None:
        """Full name cannot exceed 255 characters."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(
                email="test@example.com",
                full_name="x" * 256,
                organization_id=uuid4(),
            )
        assert "255" in str(exc_info.value)

    def test_full_name_at_255_chars(self) -> None:
        """Full name at exactly 255 characters is valid."""
        user = UserCreate(
            email="test@example.com",
            full_name="x" * 255,
            organization_id=uuid4(),
        )
        assert len(user.full_name) == 255

    def test_role_defaults_to_member(self) -> None:
        """Role defaults to MEMBER if not specified."""
        user = UserCreate(
            email="test@example.com",
            organization_id=uuid4(),
        )
        assert user.role == UserRole.MEMBER

    def test_all_roles_valid(self) -> None:
        """All UserRole values are valid."""
        for role in UserRole:
            user = UserCreate(
                email="test@example.com",
                role=role,
                organization_id=uuid4(),
            )
            assert user.role == role

    def test_invalid_role_rejected(self) -> None:
        """Invalid role values are rejected."""
        with pytest.raises(ValidationError):
            UserCreate(
                email="test@example.com",
                role="superadmin",  # type: ignore[arg-type]
                organization_id=uuid4(),
            )


class TestUserCreate:
    """Tests for UserCreate DTO."""

    def test_minimal_creation(self) -> None:
        """User can be created with just email and organization_id."""
        org_id = uuid4()
        user = UserCreate(
            email="minimal@example.com",
            organization_id=org_id,
        )
        assert user.email == "minimal@example.com"
        assert user.organization_id == org_id
        assert user.full_name is None
        assert user.role == UserRole.MEMBER

    def test_full_creation(self) -> None:
        """User can be created with all fields."""
        org_id = uuid4()
        user = UserCreate(
            email="full@example.com",
            full_name="Full User",
            role=UserRole.ADMIN,
            organization_id=org_id,
        )
        assert user.email == "full@example.com"
        assert user.full_name == "Full User"
        assert user.role == UserRole.ADMIN
        assert user.organization_id == org_id

    def test_organization_id_required(self) -> None:
        """Organization ID is required for user creation."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(email="test@example.com")  # type: ignore[call-arg]
        assert "organization_id" in str(exc_info.value)

    def test_email_required(self) -> None:
        """Email is required for user creation."""
        with pytest.raises(ValidationError) as exc_info:
            UserCreate(organization_id=uuid4())  # type: ignore[call-arg]
        assert "email" in str(exc_info.value)

    def test_role_from_string(self) -> None:
        """Role can be set from string value."""
        user = UserCreate(
            email="test@example.com",
            role="admin",  # type: ignore[arg-type]
            organization_id=uuid4(),
        )
        assert user.role == UserRole.ADMIN


class TestUserUpdate:
    """Tests for UserUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """Update DTO can be created with no fields."""
        update = UserUpdate()
        assert update.full_name is None
        assert update.role is None

    def test_update_full_name_only(self) -> None:
        """Only full_name can be updated."""
        update = UserUpdate(full_name="New Name")
        assert update.full_name == "New Name"
        assert update.role is None

    def test_update_role_only(self) -> None:
        """Only role can be updated."""
        update = UserUpdate(role=UserRole.ADMIN)
        assert update.full_name is None
        assert update.role == UserRole.ADMIN

    def test_update_both_fields(self) -> None:
        """Both fields can be updated."""
        update = UserUpdate(
            full_name="Updated User",
            role=UserRole.OWNER,
        )
        assert update.full_name == "Updated User"
        assert update.role == UserRole.OWNER

    def test_full_name_validation_on_update(self) -> None:
        """Full name max length applies on update."""
        with pytest.raises(ValidationError):
            UserUpdate(full_name="x" * 256)

    def test_role_validation_on_update(self) -> None:
        """Role must be valid on update."""
        with pytest.raises(ValidationError):
            UserUpdate(role="invalid")  # type: ignore[arg-type]

    def test_clear_full_name(self) -> None:
        """Full name can be set to empty string."""
        update = UserUpdate(full_name="")
        assert update.full_name == ""


class TestUser:
    """Tests for full User model."""

    def test_full_user(self) -> None:
        """User model includes all required fields."""
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        user = User(
            id=user_id,
            organization_id=org_id,
            email="full@example.com",
            full_name="Full User",
            role=UserRole.ADMIN,
            created_at=now,
            updated_at=now,
        )
        assert user.id == user_id
        assert user.organization_id == org_id
        assert user.email == "full@example.com"
        assert user.full_name == "Full User"
        assert user.role == UserRole.ADMIN
        assert user.created_at == now
        assert user.updated_at == now

    def test_from_attributes(self) -> None:
        """User can be created from ORM object attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.organization_id = uuid4()
                self.email = "orm@example.com"
                self.full_name = "ORM User"
                self.role = "viewer"
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)

        orm_obj = MockORM()
        user = User.model_validate(orm_obj)
        assert user.id == orm_obj.id
        assert user.organization_id == orm_obj.organization_id
        assert user.email == "orm@example.com"
        assert user.full_name == "ORM User"
        assert user.role == UserRole.VIEWER

    def test_serialization(self) -> None:
        """User serializes to dict correctly."""
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        user = User(
            id=user_id,
            organization_id=org_id,
            email="serialize@example.com",
            full_name="Serialize User",
            role=UserRole.MEMBER,
            created_at=now,
            updated_at=now,
        )
        data = user.model_dump()
        assert data["id"] == user_id
        assert data["organization_id"] == org_id
        assert data["email"] == "serialize@example.com"
        assert data["full_name"] == "Serialize User"
        assert data["role"] == UserRole.MEMBER
        assert data["created_at"] == now
        assert data["updated_at"] == now

    def test_json_serialization(self) -> None:
        """User serializes to JSON correctly."""
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        user = User(
            id=user_id,
            organization_id=org_id,
            email="json@example.com",
            full_name=None,
            role=UserRole.OWNER,
            created_at=now,
            updated_at=now,
        )
        json_str = user.model_dump_json()
        assert str(user_id) in json_str
        assert str(org_id) in json_str
        assert "json@example.com" in json_str
        assert "owner" in json_str

    def test_id_required(self) -> None:
        """ID is required for full User model."""
        with pytest.raises(ValidationError):
            User(
                organization_id=uuid4(),
                email="test@example.com",
                role=UserRole.MEMBER,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_organization_id_required(self) -> None:
        """Organization ID is required for full User model."""
        with pytest.raises(ValidationError):
            User(
                id=uuid4(),
                email="test@example.com",
                role=UserRole.MEMBER,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_created_at_required(self) -> None:
        """Created at timestamp is required."""
        with pytest.raises(ValidationError):
            User(
                id=uuid4(),
                organization_id=uuid4(),
                email="test@example.com",
                role=UserRole.MEMBER,
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_updated_at_required(self) -> None:
        """Updated at timestamp is required."""
        with pytest.raises(ValidationError):
            User(
                id=uuid4(),
                organization_id=uuid4(),
                email="test@example.com",
                role=UserRole.MEMBER,
                created_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_is_anonymous_defaults_to_false(self) -> None:
        """is_anonymous defaults to False for a regular user."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="test@example.com",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_anonymous is False

    def test_is_anonymous_can_be_set_true(self) -> None:
        """is_anonymous can be explicitly set to True for anonymous PLG sessions."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="anon@example.com",
            role=UserRole.MEMBER,
            is_anonymous=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_anonymous is True


class TestUserWithOrg:
    """Tests for UserWithOrg model."""

    def test_user_with_org(self) -> None:
        """UserWithOrg includes organization_name."""
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        user = UserWithOrg(
            id=user_id,
            organization_id=org_id,
            email="withorg@example.com",
            full_name="With Org User",
            role=UserRole.MEMBER,
            created_at=now,
            updated_at=now,
            organization_name="Acme Corp",
        )
        assert user.organization_name == "Acme Corp"
        assert user.email == "withorg@example.com"

    def test_organization_name_required(self) -> None:
        """Organization name is required for UserWithOrg."""
        with pytest.raises(ValidationError) as exc_info:
            UserWithOrg(
                id=uuid4(),
                organization_id=uuid4(),
                email="test@example.com",
                role=UserRole.MEMBER,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]
        assert "organization_name" in str(exc_info.value)

    def test_inherits_user_fields(self) -> None:
        """UserWithOrg inherits all User fields."""
        user_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        user = UserWithOrg(
            id=user_id,
            organization_id=org_id,
            email="inherit@example.com",
            full_name="Inherit Test",
            role=UserRole.ADMIN,
            created_at=now,
            updated_at=now,
            organization_name="Test Org",
        )
        assert user.id == user_id
        assert user.organization_id == org_id
        assert user.full_name == "Inherit Test"
        assert user.role == UserRole.ADMIN
        assert user.created_at == now

    def test_serialization_includes_org_name(self) -> None:
        """Serialization includes organization_name."""
        user = UserWithOrg(
            id=uuid4(),
            organization_id=uuid4(),
            email="serial@example.com",
            role=UserRole.VIEWER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            organization_name="Serial Corp",
        )
        data = user.model_dump()
        assert data["organization_name"] == "Serial Corp"


class TestUserProperties:
    """Tests for User model properties."""

    def test_is_admin_true_for_owner(self) -> None:
        """is_admin returns True for OWNER role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="owner@example.com",
            role=UserRole.OWNER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_admin is True

    def test_is_admin_true_for_admin(self) -> None:
        """is_admin returns True for ADMIN role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="admin@example.com",
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_admin is True

    def test_is_admin_false_for_member(self) -> None:
        """is_admin returns False for MEMBER role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="member@example.com",
            role=UserRole.MEMBER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_admin is False

    def test_is_admin_false_for_viewer(self) -> None:
        """is_admin returns False for VIEWER role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="viewer@example.com",
            role=UserRole.VIEWER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_admin is False

    def test_is_owner_true_for_owner(self) -> None:
        """is_owner returns True only for OWNER role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="owner@example.com",
            role=UserRole.OWNER,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_owner is True

    def test_is_owner_false_for_admin(self) -> None:
        """is_owner returns False for ADMIN role."""
        user = User(
            id=uuid4(),
            organization_id=uuid4(),
            email="admin@example.com",
            role=UserRole.ADMIN,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert user.is_owner is False


class TestUserImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """User models can be imported from app.models."""
        from app.models import User, UserCreate, UserUpdate, UserWithOrg

        assert User is not None
        assert UserCreate is not None
        assert UserUpdate is not None
        assert UserWithOrg is not None
