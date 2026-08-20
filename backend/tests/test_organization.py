"""Tests for Organization domain models.

These tests verify that the Pydantic models correctly validate
organization data, including settings, subscription status,
and name constraints.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.organization import (
    Organization,
    OrganizationCreate,
    OrganizationSettings,
    OrganizationUpdate,
    SubscriptionStatus,
)


class TestSubscriptionStatus:
    """Tests for SubscriptionStatus enum."""

    def test_subscription_status_values(self) -> None:
        """All subscription status values are correct."""
        assert SubscriptionStatus.ACTIVE.value == "active"
        assert SubscriptionStatus.TRIAL.value == "trial"
        assert SubscriptionStatus.SUSPENDED.value == "suspended"
        assert SubscriptionStatus.CANCELLED.value == "cancelled"

    def test_subscription_status_is_string_enum(self) -> None:
        """SubscriptionStatus serializes to string."""
        assert str(SubscriptionStatus.ACTIVE) == "SubscriptionStatus.ACTIVE"
        assert SubscriptionStatus.ACTIVE == "active"

    def test_subscription_status_count(self) -> None:
        """There are exactly 4 subscription statuses."""
        assert len(SubscriptionStatus) == 4


class TestOrganizationSettings:
    """Tests for OrganizationSettings model."""

    def test_default_values(self) -> None:
        """Default settings are applied correctly."""
        settings = OrganizationSettings()
        assert settings.timezone == "America/New_York"
        assert settings.default_currency == "USD"
        assert settings.fiscal_year_end_month == 12

    def test_custom_values(self) -> None:
        """Custom settings override defaults."""
        settings = OrganizationSettings(
            timezone="Europe/London",
            default_currency="GBP",
            fiscal_year_end_month=3,
        )
        assert settings.timezone == "Europe/London"
        assert settings.default_currency == "GBP"
        assert settings.fiscal_year_end_month == 3

    def test_fiscal_year_end_month_minimum(self) -> None:
        """Fiscal year end month must be at least 1."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationSettings(fiscal_year_end_month=0)
        assert "greater than or equal to 1" in str(exc_info.value)

    def test_fiscal_year_end_month_maximum(self) -> None:
        """Fiscal year end month must be at most 12."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationSettings(fiscal_year_end_month=13)
        assert "less than or equal to 12" in str(exc_info.value)

    def test_fiscal_year_end_month_all_valid_values(self) -> None:
        """All months 1-12 are valid for fiscal year end."""
        for month in range(1, 13):
            settings = OrganizationSettings(fiscal_year_end_month=month)
            assert settings.fiscal_year_end_month == month

    def test_serialization(self) -> None:
        """Settings serialize to dict correctly."""
        settings = OrganizationSettings(
            timezone="Asia/Tokyo",
            default_currency="JPY",
            fiscal_year_end_month=6,
        )
        data = settings.model_dump()
        assert data == {
            "timezone": "Asia/Tokyo",
            "default_currency": "JPY",
            "fiscal_year_end_month": 6,
            "contact_name": None,
            "contact_title": None,
            "contact_company": None,
            "contact_phone": None,
            "contact_email": None,
            "contact_address": None,
        }


class TestOrganizationCreate:
    """Tests for OrganizationCreate DTO."""

    def test_minimal_creation(self) -> None:
        """Organization can be created with just a name."""
        org = OrganizationCreate(name="Acme Corp")
        assert org.name == "Acme Corp"
        assert org.subscription_status == SubscriptionStatus.TRIAL
        assert org.settings.timezone == "America/New_York"

    def test_full_creation(self) -> None:
        """Organization can be created with all fields."""
        settings = OrganizationSettings(
            timezone="America/Los_Angeles",
            default_currency="CAD",
            fiscal_year_end_month=9,
        )
        org = OrganizationCreate(
            name="Test Company",
            subscription_status=SubscriptionStatus.ACTIVE,
            settings=settings,
        )
        assert org.name == "Test Company"
        assert org.subscription_status == SubscriptionStatus.ACTIVE
        assert org.settings.timezone == "America/Los_Angeles"
        assert org.settings.default_currency == "CAD"
        assert org.settings.fiscal_year_end_month == 9

    def test_name_required(self) -> None:
        """Name field is required."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationCreate()  # type: ignore[call-arg]
        assert "name" in str(exc_info.value)

    def test_name_min_length(self) -> None:
        """Name must be at least 1 character."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationCreate(name="")
        assert "String should have at least 1 character" in str(exc_info.value)

    def test_name_max_length(self) -> None:
        """Name must be at most 255 characters."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationCreate(name="x" * 256)
        assert "String should have at most 255 characters" in str(exc_info.value)

    def test_name_255_chars_is_valid(self) -> None:
        """Name at exactly 255 characters is valid."""
        org = OrganizationCreate(name="x" * 255)
        assert len(org.name) == 255

    def test_name_1_char_is_valid(self) -> None:
        """Name at exactly 1 character is valid."""
        org = OrganizationCreate(name="A")
        assert len(org.name) == 1

    def test_subscription_status_from_string(self) -> None:
        """Subscription status can be set from string value."""
        org = OrganizationCreate(name="Test", subscription_status="active")  # type: ignore[arg-type]
        assert org.subscription_status == SubscriptionStatus.ACTIVE

    def test_invalid_subscription_status(self) -> None:
        """Invalid subscription status raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            OrganizationCreate(name="Test", subscription_status="invalid")  # type: ignore[arg-type]
        assert "subscription_status" in str(exc_info.value)


class TestOrganizationUpdate:
    """Tests for OrganizationUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """Update DTO can be created with no fields."""
        update = OrganizationUpdate()
        assert update.name is None
        assert update.subscription_status is None
        assert update.settings is None

    def test_partial_update_name_only(self) -> None:
        """Only name can be updated."""
        update = OrganizationUpdate(name="New Name")
        assert update.name == "New Name"
        assert update.subscription_status is None
        assert update.settings is None

    def test_partial_update_status_only(self) -> None:
        """Only subscription status can be updated."""
        update = OrganizationUpdate(subscription_status=SubscriptionStatus.SUSPENDED)
        assert update.name is None
        assert update.subscription_status == SubscriptionStatus.SUSPENDED
        assert update.settings is None

    def test_partial_update_settings_only(self) -> None:
        """Only settings can be updated."""
        settings = OrganizationSettings(timezone="UTC")
        update = OrganizationUpdate(settings=settings)
        assert update.name is None
        assert update.subscription_status is None
        assert update.settings is not None
        assert update.settings.timezone == "UTC"

    def test_full_update(self) -> None:
        """All fields can be updated at once."""
        settings = OrganizationSettings(fiscal_year_end_month=6)
        update = OrganizationUpdate(
            name="Updated Corp",
            subscription_status=SubscriptionStatus.ACTIVE,
            settings=settings,
        )
        assert update.name == "Updated Corp"
        assert update.subscription_status == SubscriptionStatus.ACTIVE
        assert update.settings.fiscal_year_end_month == 6

    def test_name_validation_on_update(self) -> None:
        """Name validation applies on update too."""
        with pytest.raises(ValidationError):
            OrganizationUpdate(name="")

        with pytest.raises(ValidationError):
            OrganizationUpdate(name="x" * 256)


class TestOrganization:
    """Tests for full Organization model."""

    def test_full_organization(self) -> None:
        """Organization model includes all fields."""
        org_id = uuid4()
        now = datetime.now(UTC)
        org = Organization(
            id=org_id,
            name="Full Org",
            subscription_status=SubscriptionStatus.ACTIVE,
            settings=OrganizationSettings(),
            created_at=now,
            updated_at=now,
        )
        assert org.id == org_id
        assert org.name == "Full Org"
        assert org.subscription_status == SubscriptionStatus.ACTIVE
        assert org.created_at == now
        assert org.updated_at == now

    def test_from_attributes(self) -> None:
        """Organization can be created from ORM object attributes."""

        # Simulate an ORM-like object
        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.name = "ORM Org"
                self.subscription_status = "active"
                self.settings = {
                    "timezone": "UTC",
                    "default_currency": "EUR",
                    "fiscal_year_end_month": 1,
                }
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)

        orm_obj = MockORM()
        org = Organization.model_validate(orm_obj)
        assert org.id == orm_obj.id
        assert org.name == "ORM Org"
        assert org.subscription_status == SubscriptionStatus.ACTIVE
        assert org.settings.timezone == "UTC"
        assert org.settings.default_currency == "EUR"
        assert org.settings.fiscal_year_end_month == 1

    def test_serialization(self) -> None:
        """Organization serializes to dict correctly."""
        org_id = uuid4()
        now = datetime.now(UTC)
        org = Organization(
            id=org_id,
            name="Serialize Test",
            subscription_status=SubscriptionStatus.TRIAL,
            settings=OrganizationSettings(),
            created_at=now,
            updated_at=now,
        )
        data = org.model_dump()
        assert data["id"] == org_id
        assert data["name"] == "Serialize Test"
        assert data["subscription_status"] == SubscriptionStatus.TRIAL
        assert data["settings"]["timezone"] == "America/New_York"
        assert data["created_at"] == now
        assert data["updated_at"] == now

    def test_json_serialization(self) -> None:
        """Organization serializes to JSON correctly."""
        org_id = uuid4()
        now = datetime.now(UTC)
        org = Organization(
            id=org_id,
            name="JSON Test",
            subscription_status=SubscriptionStatus.CANCELLED,
            settings=OrganizationSettings(fiscal_year_end_month=6),
            created_at=now,
            updated_at=now,
        )
        json_str = org.model_dump_json()
        assert str(org_id) in json_str
        assert "JSON Test" in json_str
        assert "cancelled" in json_str
        assert "fiscal_year_end_month" in json_str

    def test_id_required(self) -> None:
        """ID is required for full Organization model."""
        with pytest.raises(ValidationError):
            Organization(
                name="No ID",
                subscription_status=SubscriptionStatus.ACTIVE,
                settings=OrganizationSettings(),
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_created_at_required(self) -> None:
        """Created at timestamp is required."""
        with pytest.raises(ValidationError):
            Organization(
                id=uuid4(),
                name="No Created",
                subscription_status=SubscriptionStatus.ACTIVE,
                settings=OrganizationSettings(),
                updated_at=datetime.now(UTC),
            )  # type: ignore[call-arg]

    def test_updated_at_required(self) -> None:
        """Updated at timestamp is required."""
        with pytest.raises(ValidationError):
            Organization(
                id=uuid4(),
                name="No Updated",
                subscription_status=SubscriptionStatus.ACTIVE,
                settings=OrganizationSettings(),
                created_at=datetime.now(UTC),
            )  # type: ignore[call-arg]
