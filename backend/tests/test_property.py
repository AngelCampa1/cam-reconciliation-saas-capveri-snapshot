"""Tests for Property domain models.

These tests verify that the Pydantic models correctly validate
property data, including BOMA area fields, address validation,
and the critical constraint that usable sqft <= rentable sqft.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.enums import BomaStandardVersion
from app.models.property import (
    Property,
    PropertyCreate,
    PropertySummary,
    PropertyUpdate,
)


def make_valid_property_data() -> dict:
    """Create valid property data for testing."""
    return {
        "name": "Test Building",
        "address_line1": "123 Main Street",
        "address_line2": "Suite 100",
        "city": "New York",
        "state": "NY",
        "postal_code": "10001",
        "total_rentable_sqft": Decimal("100000.00"),
        "total_usable_sqft": Decimal("85000.00"),
        "common_area_sqft": Decimal("15000.00"),
        "target_occupancy": Decimal("0.95"),
    }


class TestPropertyBase:
    """Tests for PropertyBase model fields."""

    def test_valid_property(self) -> None:
        """Valid property data is accepted."""
        data = make_valid_property_data()
        prop = PropertyCreate(**data)
        assert prop.name == "Test Building"
        assert prop.address_line1 == "123 Main Street"
        assert prop.total_rentable_sqft == Decimal("100000.00")

    def test_name_required(self) -> None:
        """Name field is required."""
        data = make_valid_property_data()
        del data["name"]
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "name" in str(exc_info.value)

    def test_name_min_length(self) -> None:
        """Name must be at least 1 character."""
        data = make_valid_property_data()
        data["name"] = ""
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "at least 1" in str(exc_info.value)

    def test_name_max_length(self) -> None:
        """Name cannot exceed 255 characters."""
        data = make_valid_property_data()
        data["name"] = "x" * 256
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "255" in str(exc_info.value)

    def test_address_line1_required(self) -> None:
        """Address line 1 is required."""
        data = make_valid_property_data()
        del data["address_line1"]
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_address_line2_optional(self) -> None:
        """Address line 2 is optional."""
        data = make_valid_property_data()
        del data["address_line2"]
        prop = PropertyCreate(**data)
        assert prop.address_line2 is None

    def test_city_required(self) -> None:
        """City is required."""
        data = make_valid_property_data()
        del data["city"]
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_state_must_be_2_chars(self) -> None:
        """State must be exactly 2 characters."""
        data = make_valid_property_data()

        # Too short
        data["state"] = "N"
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

        # Too long
        data["state"] = "NYC"
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_state_valid_2_chars(self) -> None:
        """State with exactly 2 characters is accepted."""
        data = make_valid_property_data()
        data["state"] = "CA"
        prop = PropertyCreate(**data)
        assert prop.state == "CA"

    def test_postal_code_required(self) -> None:
        """Postal code is required."""
        data = make_valid_property_data()
        del data["postal_code"]
        with pytest.raises(ValidationError):
            PropertyCreate(**data)


class TestBOMAAreaFields:
    """Tests for BOMA area field validations."""

    def test_rentable_sqft_must_be_positive(self) -> None:
        """Total rentable sqft must be greater than 0."""
        data = make_valid_property_data()

        data["total_rentable_sqft"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "greater than 0" in str(exc_info.value)

        data["total_rentable_sqft"] = Decimal("-100")
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_usable_sqft_must_be_positive(self) -> None:
        """Total usable sqft must be greater than 0."""
        data = make_valid_property_data()

        data["total_usable_sqft"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "greater than 0" in str(exc_info.value)

    def test_common_area_can_be_zero(self) -> None:
        """Common area sqft can be 0."""
        data = make_valid_property_data()
        data["common_area_sqft"] = Decimal("0")
        prop = PropertyCreate(**data)
        assert prop.common_area_sqft == Decimal("0")

    def test_common_area_cannot_be_negative(self) -> None:
        """Common area sqft cannot be negative."""
        data = make_valid_property_data()
        data["common_area_sqft"] = Decimal("-100")
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_usable_cannot_exceed_rentable(self) -> None:
        """Usable sqft cannot exceed rentable sqft (BOMA constraint)."""
        data = make_valid_property_data()
        data["total_rentable_sqft"] = Decimal("50000")
        data["total_usable_sqft"] = Decimal("60000")  # Greater than rentable
        with pytest.raises(ValidationError) as exc_info:
            PropertyCreate(**data)
        assert "cannot exceed" in str(exc_info.value).lower()

    def test_usable_equal_to_rentable_is_valid(self) -> None:
        """Usable sqft equal to rentable sqft is valid."""
        data = make_valid_property_data()
        data["total_rentable_sqft"] = Decimal("50000")
        data["total_usable_sqft"] = Decimal("50000")
        data["common_area_sqft"] = Decimal("0")
        prop = PropertyCreate(**data)
        assert prop.total_usable_sqft == prop.total_rentable_sqft

    def test_target_occupancy_default(self) -> None:
        """Target occupancy defaults to 0.95."""
        data = make_valid_property_data()
        del data["target_occupancy"]
        prop = PropertyCreate(**data)
        assert prop.target_occupancy == Decimal("0.95")

    def test_target_occupancy_range(self) -> None:
        """Target occupancy must be between 0 and 1."""
        data = make_valid_property_data()

        # Below 0
        data["target_occupancy"] = Decimal("-0.1")
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

        # Above 1
        data["target_occupancy"] = Decimal("1.1")
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_target_occupancy_at_bounds(self) -> None:
        """Target occupancy at 0 and 1 are valid."""
        data = make_valid_property_data()

        data["target_occupancy"] = Decimal("0")
        prop = PropertyCreate(**data)
        assert prop.target_occupancy == Decimal("0")

        data["target_occupancy"] = Decimal("1")
        prop = PropertyCreate(**data)
        assert prop.target_occupancy == Decimal("1")

    def test_decimal_precision(self) -> None:
        """Decimal values maintain precision."""
        data = make_valid_property_data()
        data["total_rentable_sqft"] = Decimal("12345.67")
        data["total_usable_sqft"] = Decimal("10000.99")
        data["target_occupancy"] = Decimal("0.9275")
        prop = PropertyCreate(**data)
        assert prop.total_rentable_sqft == Decimal("12345.67")
        assert prop.total_usable_sqft == Decimal("10000.99")
        assert prop.target_occupancy == Decimal("0.9275")

    def test_validate_area_relationships_with_edge_case_decimals(self) -> None:
        """Test area validation with edge case Decimal values."""
        data = make_valid_property_data()
        # Test with usable slightly exceeding rentable (edge case)
        data["total_rentable_sqft"] = Decimal("100000.00")
        data["total_usable_sqft"] = Decimal("100000.01")  # Exceeds by 0.01
        with pytest.raises(ValueError) as exc_info:
            PropertyCreate(**data)
        error_msg = str(exc_info.value)
        assert "100000.01" in error_msg
        assert "100000.00" in error_msg
        assert "cannot exceed" in error_msg.lower()

    def test_validate_area_relationships_error_message_format(self) -> None:
        """Test that validation error includes both values in message."""
        data = make_valid_property_data()
        data["total_rentable_sqft"] = Decimal("75000.50")
        data["total_usable_sqft"] = Decimal("90000.75")
        with pytest.raises(ValueError) as exc_info:
            PropertyCreate(**data)
        error_msg = str(exc_info.value)
        # Verify both Decimal values appear in error message
        assert "90000.75" in error_msg  # usable value
        assert "75000.50" in error_msg  # rentable value


class TestPropertyCreate:
    """Tests for PropertyCreate DTO."""

    def test_create_minimal(self) -> None:
        """Property can be created with minimal required fields."""
        data = make_valid_property_data()
        del data["address_line2"]
        del data["target_occupancy"]
        prop = PropertyCreate(**data)
        assert prop.address_line2 is None
        assert prop.target_occupancy == Decimal("0.95")

    def test_create_full(self) -> None:
        """Property can be created with all fields."""
        data = make_valid_property_data()
        prop = PropertyCreate(**data)
        assert prop.name == "Test Building"
        assert prop.address_line2 == "Suite 100"
        assert prop.target_occupancy == Decimal("0.95")


class TestPropertyUpdate:
    """Tests for PropertyUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """Update DTO can be created with no fields."""
        update = PropertyUpdate()
        assert update.name is None
        assert update.address_line1 is None
        assert update.total_rentable_sqft is None

    def test_partial_update_name(self) -> None:
        """Only name can be updated."""
        update = PropertyUpdate(name="New Name")
        assert update.name == "New Name"
        assert update.city is None

    def test_partial_update_sqft(self) -> None:
        """Only area fields can be updated."""
        update = PropertyUpdate(
            total_rentable_sqft=Decimal("75000"),
            total_usable_sqft=Decimal("60000"),
        )
        assert update.total_rentable_sqft == Decimal("75000")
        assert update.total_usable_sqft == Decimal("60000")
        assert update.name is None

    def test_update_validations_apply(self) -> None:
        """Validations apply to update fields."""
        # Name too short
        with pytest.raises(ValidationError):
            PropertyUpdate(name="")

        # Negative sqft
        with pytest.raises(ValidationError):
            PropertyUpdate(total_rentable_sqft=Decimal("-100"))

        # Invalid occupancy
        with pytest.raises(ValidationError):
            PropertyUpdate(target_occupancy=Decimal("1.5"))

    def test_update_state_validation(self) -> None:
        """State validation applies on update."""
        with pytest.raises(ValidationError):
            PropertyUpdate(state="NYC")

        update = PropertyUpdate(state="TX")
        assert update.state == "TX"


class TestProperty:
    """Tests for full Property model."""

    def test_full_property(self) -> None:
        """Property model includes all required fields."""
        prop_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_property_data()
        prop = Property(
            id=prop_id,
            organization_id=org_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        assert prop.id == prop_id
        assert prop.organization_id == org_id
        assert prop.name == "Test Building"
        assert prop.created_at == now

    def test_from_attributes(self) -> None:
        """Property can be created from ORM object attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.organization_id = uuid4()
                self.name = "ORM Building"
                self.address_line1 = "456 Oak Ave"
                self.address_line2 = None
                self.city = "Chicago"
                self.state = "IL"
                self.postal_code = "60601"
                self.total_rentable_sqft = Decimal("50000")
                self.total_usable_sqft = Decimal("42000")
                self.common_area_sqft = Decimal("8000")
                self.target_occupancy = Decimal("0.90")
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)

        orm_obj = MockORM()
        prop = Property.model_validate(orm_obj)
        assert prop.id == orm_obj.id
        assert prop.name == "ORM Building"
        assert prop.total_rentable_sqft == Decimal("50000")

    def test_serialization(self) -> None:
        """Property serializes to dict correctly."""
        prop_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_property_data()
        prop = Property(
            id=prop_id,
            organization_id=org_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        result = prop.model_dump()
        assert result["id"] == prop_id
        assert result["organization_id"] == org_id
        assert result["name"] == "Test Building"
        assert result["total_rentable_sqft"] == Decimal("100000.00")

    def test_json_serialization(self) -> None:
        """Property serializes to JSON correctly."""
        prop_id = uuid4()
        org_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_property_data()
        prop = Property(
            id=prop_id,
            organization_id=org_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        json_str = prop.model_dump_json()
        assert str(prop_id) in json_str
        assert "Test Building" in json_str
        assert "100000" in json_str

    def test_id_required(self) -> None:
        """ID is required for full Property model."""
        data = make_valid_property_data()
        with pytest.raises(ValidationError):
            Property(
                organization_id=uuid4(),
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
                **data,
            )  # type: ignore[call-arg]

    def test_organization_id_required(self) -> None:
        """Organization ID is required for full Property model."""
        data = make_valid_property_data()
        with pytest.raises(ValidationError):
            Property(
                id=uuid4(),
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
                **data,
            )  # type: ignore[call-arg]


class TestPropertySummary:
    """Tests for PropertySummary model."""

    def test_summary_fields(self) -> None:
        """PropertySummary contains only essential fields."""
        summary = PropertySummary(
            id=uuid4(),
            name="Summary Building",
            city="Boston",
            state="MA",
            total_rentable_sqft=Decimal("75000"),
        )
        assert summary.name == "Summary Building"
        assert summary.city == "Boston"
        assert summary.state == "MA"
        assert summary.total_rentable_sqft == Decimal("75000")

    def test_from_attributes(self) -> None:
        """PropertySummary can be created from ORM attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.name = "ORM Summary"
                self.city = "Seattle"
                self.state = "WA"
                self.total_rentable_sqft = Decimal("25000")

        orm_obj = MockORM()
        summary = PropertySummary.model_validate(orm_obj)
        assert summary.name == "ORM Summary"
        assert summary.city == "Seattle"


class TestBomaFields:
    """Tests for BOMA 2024 compliance fields on Property."""

    def test_boma_standard_version_defaults_to_2024(self) -> None:
        """boma_standard_version defaults to V2024."""
        data = make_valid_property_data()
        prop = PropertyCreate(**data)
        assert prop.boma_standard_version == BomaStandardVersion.V2024

    def test_boma_standard_version_accepts_all_versions(self) -> None:
        """boma_standard_version accepts all BomaStandardVersion values."""
        data = make_valid_property_data()
        for version in BomaStandardVersion:
            data["boma_standard_version"] = version
            prop = PropertyCreate(**data)
            assert prop.boma_standard_version == version

    def test_boma_standard_version_accepts_string_values(self) -> None:
        """boma_standard_version accepts string values and coerces to enum."""
        data = make_valid_property_data()
        data["boma_standard_version"] = "2017"
        prop = PropertyCreate(**data)
        assert prop.boma_standard_version == BomaStandardVersion.V2017

    def test_boma_standard_version_rejects_invalid(self) -> None:
        """boma_standard_version rejects invalid values."""
        data = make_valid_property_data()
        data["boma_standard_version"] = "1999"
        with pytest.raises(ValidationError):
            PropertyCreate(**data)

    def test_rsf_measurement_date_optional(self) -> None:
        """rsf_measurement_date is optional and defaults to None."""
        data = make_valid_property_data()
        prop = PropertyCreate(**data)
        assert prop.rsf_measurement_date is None

    def test_rsf_measurement_date_accepts_date(self) -> None:
        """rsf_measurement_date accepts a date value."""
        from datetime import date

        data = make_valid_property_data()
        measurement_date = date(2024, 1, 15)
        data["rsf_measurement_date"] = measurement_date
        prop = PropertyCreate(**data)
        assert prop.rsf_measurement_date == measurement_date

    def test_boma_fields_in_update(self) -> None:
        """BOMA fields can be updated in PropertyUpdate."""
        from datetime import date

        update = PropertyUpdate(
            boma_standard_version=BomaStandardVersion.V2017,
            rsf_measurement_date=date(2024, 6, 1),
        )
        assert update.boma_standard_version == BomaStandardVersion.V2017
        assert update.rsf_measurement_date is not None

    def test_boma_update_fields_are_optional(self) -> None:
        """BOMA fields in PropertyUpdate are optional."""
        update = PropertyUpdate()
        assert update.boma_standard_version is None
        assert update.rsf_measurement_date is None

    def test_boma_fields_serialized_in_property(self) -> None:
        """BOMA fields appear in serialized Property output."""
        from datetime import UTC, date, datetime

        data = make_valid_property_data()
        data["boma_standard_version"] = BomaStandardVersion.V2017
        data["rsf_measurement_date"] = date(2024, 3, 1)
        prop = Property(
            id=uuid4(),
            organization_id=uuid4(),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **data,
        )
        result = prop.model_dump()
        assert result["boma_standard_version"] == BomaStandardVersion.V2017
        assert result["rsf_measurement_date"] is not None


class TestPropertyImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """Property models can be imported from app.models."""
        from app.models import Property, PropertyCreate, PropertySummary, PropertyUpdate

        assert Property is not None
        assert PropertyCreate is not None
        assert PropertyUpdate is not None
        assert PropertySummary is not None
