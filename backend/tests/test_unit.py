"""Tests for Unit domain models.

These tests verify that the Pydantic models correctly validate
unit data, including area fields, status enum, and the constraint
that usable sqft <= rentable sqft.
"""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.enums import NATA_SPACE_TYPES, SpaceType, UnitStatus
from app.models.unit import (
    Unit,
    UnitCreate,
    UnitSummary,
    UnitUpdate,
)


def make_valid_unit_data() -> dict:
    """Create valid unit data for testing."""
    return {
        "unit_number": "Suite 101",
        "rentable_sqft": Decimal("5000.00"),
        "usable_sqft": Decimal("4250.00"),
        "floor": 1,
        "status": UnitStatus.VACANT,
    }


class TestUnitBase:
    """Tests for UnitBase model fields."""

    def test_valid_unit(self) -> None:
        """Valid unit data is accepted."""
        data = make_valid_unit_data()
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.unit_number == "Suite 101"
        assert unit.rentable_sqft == Decimal("5000.00")
        assert unit.status == UnitStatus.VACANT

    def test_unit_number_required(self) -> None:
        """Unit number field is required."""
        data = make_valid_unit_data()
        del data["unit_number"]
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "unit_number" in str(exc_info.value)

    def test_unit_number_min_length(self) -> None:
        """Unit number must be at least 1 character."""
        data = make_valid_unit_data()
        data["unit_number"] = ""
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "at least 1" in str(exc_info.value)

    def test_unit_number_max_length(self) -> None:
        """Unit number cannot exceed 50 characters."""
        data = make_valid_unit_data()
        data["unit_number"] = "x" * 51
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "50" in str(exc_info.value)

    def test_floor_optional(self) -> None:
        """Floor is optional."""
        data = make_valid_unit_data()
        del data["floor"]
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.floor is None

    def test_floor_can_be_zero(self) -> None:
        """Floor can be 0 (ground floor)."""
        data = make_valid_unit_data()
        data["floor"] = 0
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.floor == 0

    def test_floor_cannot_be_negative(self) -> None:
        """Floor cannot be negative."""
        data = make_valid_unit_data()
        data["floor"] = -1
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "greater than or equal to 0" in str(exc_info.value)

    def test_status_defaults_to_vacant(self) -> None:
        """Status defaults to VACANT if not specified."""
        data = make_valid_unit_data()
        del data["status"]
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.status == UnitStatus.VACANT


class TestUnitStatus:
    """Tests for UnitStatus enum validation."""

    def test_valid_status_vacant(self) -> None:
        """VACANT status is accepted."""
        data = make_valid_unit_data()
        data["status"] = UnitStatus.VACANT
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.status == UnitStatus.VACANT

    def test_valid_status_occupied(self) -> None:
        """OCCUPIED status is accepted."""
        data = make_valid_unit_data()
        data["status"] = UnitStatus.OCCUPIED
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.status == UnitStatus.OCCUPIED

    def test_valid_status_under_renovation(self) -> None:
        """UNDER_RENOVATION status is accepted."""
        data = make_valid_unit_data()
        data["status"] = UnitStatus.UNDER_RENOVATION
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.status == UnitStatus.UNDER_RENOVATION

    def test_invalid_status_rejected(self) -> None:
        """Invalid status values are rejected."""
        data = make_valid_unit_data()
        data["status"] = "invalid_status"
        with pytest.raises(ValidationError):
            UnitCreate(property_id=uuid4(), **data)

    def test_status_string_values(self) -> None:
        """Status enum string values work correctly."""
        data = make_valid_unit_data()
        data["status"] = "occupied"
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.status == UnitStatus.OCCUPIED
        assert unit.status.value == "occupied"


class TestAreaFields:
    """Tests for area field validations."""

    def test_rentable_sqft_must_be_positive(self) -> None:
        """Rentable sqft must be greater than 0."""
        data = make_valid_unit_data()

        data["rentable_sqft"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "greater than 0" in str(exc_info.value)

        data["rentable_sqft"] = Decimal("-100")
        with pytest.raises(ValidationError):
            UnitCreate(property_id=uuid4(), **data)

    def test_usable_sqft_must_be_positive(self) -> None:
        """Usable sqft must be greater than 0."""
        data = make_valid_unit_data()

        data["usable_sqft"] = Decimal("0")
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "greater than 0" in str(exc_info.value)

    def test_usable_cannot_exceed_rentable(self) -> None:
        """Usable sqft cannot exceed rentable sqft."""
        data = make_valid_unit_data()
        data["rentable_sqft"] = Decimal("3000")
        data["usable_sqft"] = Decimal("4000")  # Greater than rentable
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        assert "cannot exceed" in str(exc_info.value).lower()

    def test_usable_equal_to_rentable_is_valid(self) -> None:
        """Usable sqft equal to rentable sqft is valid."""
        data = make_valid_unit_data()
        data["rentable_sqft"] = Decimal("5000")
        data["usable_sqft"] = Decimal("5000")
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.usable_sqft == unit.rentable_sqft

    def test_decimal_precision(self) -> None:
        """Decimal values maintain precision."""
        data = make_valid_unit_data()
        data["rentable_sqft"] = Decimal("1234.56")
        data["usable_sqft"] = Decimal("1000.99")
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.rentable_sqft == Decimal("1234.56")
        assert unit.usable_sqft == Decimal("1000.99")

    def test_validate_area_relationships_with_edge_case_decimals(self) -> None:
        """Test area validation with edge case Decimal values."""
        data = make_valid_unit_data()
        # Test with usable slightly exceeding rentable (edge case)
        data["rentable_sqft"] = Decimal("5000.00")
        data["usable_sqft"] = Decimal("5000.01")  # Exceeds by 0.01
        with pytest.raises(ValueError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        error_msg = str(exc_info.value)
        assert "5000.01" in error_msg
        assert "5000.00" in error_msg
        assert "cannot exceed" in error_msg.lower()

    def test_validate_area_relationships_error_message_format(self) -> None:
        """Test that validation error includes both values in message."""
        data = make_valid_unit_data()
        data["rentable_sqft"] = Decimal("3000.50")
        data["usable_sqft"] = Decimal("4000.75")
        with pytest.raises(ValueError) as exc_info:
            UnitCreate(property_id=uuid4(), **data)
        error_msg = str(exc_info.value)
        # Verify both Decimal values appear in error message
        assert "4000.75" in error_msg  # usable value
        assert "3000.50" in error_msg  # rentable value


class TestUnitCreate:
    """Tests for UnitCreate DTO."""

    def test_create_requires_property_id(self) -> None:
        """UnitCreate requires property_id."""
        data = make_valid_unit_data()
        with pytest.raises(ValidationError) as exc_info:
            UnitCreate(**data)  # type: ignore[call-arg]
        assert "property_id" in str(exc_info.value)

    def test_create_with_property_id(self) -> None:
        """UnitCreate accepts property_id."""
        data = make_valid_unit_data()
        prop_id = uuid4()
        unit = UnitCreate(property_id=prop_id, **data)
        assert unit.property_id == prop_id

    def test_create_minimal(self) -> None:
        """Unit can be created with minimal required fields."""
        unit = UnitCreate(
            property_id=uuid4(),
            unit_number="A1",
            rentable_sqft=Decimal("1000"),
            usable_sqft=Decimal("900"),
        )
        assert unit.floor is None
        assert unit.status == UnitStatus.VACANT


class TestUnitUpdate:
    """Tests for UnitUpdate DTO."""

    def test_all_fields_optional(self) -> None:
        """Update DTO can be created with no fields."""
        update = UnitUpdate()
        assert update.unit_number is None
        assert update.rentable_sqft is None
        assert update.usable_sqft is None
        assert update.floor is None
        assert update.status is None

    def test_partial_update_unit_number(self) -> None:
        """Only unit_number can be updated."""
        update = UnitUpdate(unit_number="Suite 200")
        assert update.unit_number == "Suite 200"
        assert update.rentable_sqft is None

    def test_partial_update_sqft(self) -> None:
        """Only area fields can be updated."""
        update = UnitUpdate(
            rentable_sqft=Decimal("6000"),
            usable_sqft=Decimal("5500"),
        )
        assert update.rentable_sqft == Decimal("6000")
        assert update.usable_sqft == Decimal("5500")
        assert update.unit_number is None

    def test_partial_update_status(self) -> None:
        """Only status can be updated."""
        update = UnitUpdate(status=UnitStatus.OCCUPIED)
        assert update.status == UnitStatus.OCCUPIED
        assert update.unit_number is None

    def test_update_validations_apply(self) -> None:
        """Validations apply to update fields."""
        # Unit number too short
        with pytest.raises(ValidationError):
            UnitUpdate(unit_number="")

        # Negative sqft
        with pytest.raises(ValidationError):
            UnitUpdate(rentable_sqft=Decimal("-100"))

        # Invalid status
        with pytest.raises(ValidationError):
            UnitUpdate(status="invalid")  # type: ignore[arg-type]


class TestUnit:
    """Tests for full Unit model."""

    def test_full_unit(self) -> None:
        """Unit model includes all required fields."""
        unit_id = uuid4()
        prop_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_unit_data()
        unit = Unit(
            id=unit_id,
            property_id=prop_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        assert unit.id == unit_id
        assert unit.property_id == prop_id
        assert unit.unit_number == "Suite 101"
        assert unit.created_at == now

    def test_from_attributes(self) -> None:
        """Unit can be created from ORM object attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.property_id = uuid4()
                self.unit_number = "Suite 300"
                self.rentable_sqft = Decimal("3500")
                self.usable_sqft = Decimal("3000")
                self.floor = 3
                self.status = UnitStatus.OCCUPIED
                self.created_at = datetime.now(UTC)
                self.updated_at = datetime.now(UTC)

        orm_obj = MockORM()
        unit = Unit.model_validate(orm_obj)
        assert unit.id == orm_obj.id
        assert unit.unit_number == "Suite 300"
        assert unit.status == UnitStatus.OCCUPIED

    def test_serialization(self) -> None:
        """Unit serializes to dict correctly."""
        unit_id = uuid4()
        prop_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_unit_data()
        unit = Unit(
            id=unit_id,
            property_id=prop_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        result = unit.model_dump()
        assert result["id"] == unit_id
        assert result["property_id"] == prop_id
        assert result["unit_number"] == "Suite 101"
        assert result["status"] == UnitStatus.VACANT

    def test_json_serialization(self) -> None:
        """Unit serializes to JSON correctly."""
        unit_id = uuid4()
        prop_id = uuid4()
        now = datetime.now(UTC)
        data = make_valid_unit_data()
        unit = Unit(
            id=unit_id,
            property_id=prop_id,
            created_at=now,
            updated_at=now,
            **data,
        )
        json_str = unit.model_dump_json()
        assert str(unit_id) in json_str
        assert "Suite 101" in json_str
        assert "5000" in json_str
        assert "vacant" in json_str

    def test_id_required(self) -> None:
        """ID is required for full Unit model."""
        data = make_valid_unit_data()
        with pytest.raises(ValidationError):
            Unit(
                property_id=uuid4(),
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
                **data,
            )  # type: ignore[call-arg]

    def test_property_id_required(self) -> None:
        """Property ID is required for full Unit model."""
        data = make_valid_unit_data()
        with pytest.raises(ValidationError):
            Unit(
                id=uuid4(),
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
                **data,
            )  # type: ignore[call-arg]


class TestUnitSummary:
    """Tests for UnitSummary model."""

    def test_summary_fields(self) -> None:
        """UnitSummary contains only essential fields."""
        summary = UnitSummary(
            id=uuid4(),
            unit_number="Suite 500",
            rentable_sqft=Decimal("2500"),
            status=UnitStatus.OCCUPIED,
        )
        assert summary.unit_number == "Suite 500"
        assert summary.rentable_sqft == Decimal("2500")
        assert summary.status == UnitStatus.OCCUPIED

    def test_from_attributes(self) -> None:
        """UnitSummary can be created from ORM attributes."""

        class MockORM:
            def __init__(self) -> None:
                self.id = uuid4()
                self.unit_number = "Suite 600"
                self.rentable_sqft = Decimal("4000")
                self.status = UnitStatus.UNDER_RENOVATION

        orm_obj = MockORM()
        summary = UnitSummary.model_validate(orm_obj)
        assert summary.unit_number == "Suite 600"
        assert summary.status == UnitStatus.UNDER_RENOVATION


class TestSpaceTypeField:
    """Tests for BOMA 2024 space_type field on Unit."""

    def test_space_type_defaults_to_office(self) -> None:
        """space_type defaults to SpaceType.OFFICE."""
        unit = UnitCreate(
            property_id=uuid4(),
            unit_number="Suite 101",
            rentable_sqft=Decimal("5000"),
            usable_sqft=Decimal("4500"),
        )
        assert unit.space_type == SpaceType.OFFICE

    def test_space_type_accepts_all_values(self) -> None:
        """space_type accepts all SpaceType enum values."""
        data = make_valid_unit_data()
        for space_type in SpaceType:
            data["space_type"] = space_type
            unit = UnitCreate(property_id=uuid4(), **data)
            assert unit.space_type == space_type

    def test_space_type_accepts_string_values(self) -> None:
        """space_type accepts string values and coerces to enum."""
        data = make_valid_unit_data()
        data["space_type"] = "outdoor_amenity"
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.space_type == SpaceType.OUTDOOR_AMENITY

    def test_space_type_rejects_invalid(self) -> None:
        """space_type rejects invalid values."""
        data = make_valid_unit_data()
        data["space_type"] = "invalid_type"
        with pytest.raises(ValidationError):
            UnitCreate(property_id=uuid4(), **data)

    def test_nata_types_usable_in_membership_check(self) -> None:
        """Units with NATA space types can be detected via NATA_SPACE_TYPES."""
        data = make_valid_unit_data()
        data["space_type"] = SpaceType.STORAGE
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.space_type in NATA_SPACE_TYPES

        data["space_type"] = SpaceType.OFFICE
        unit = UnitCreate(property_id=uuid4(), **data)
        assert unit.space_type not in NATA_SPACE_TYPES

    def test_space_type_in_update(self) -> None:
        """space_type can be updated via UnitUpdate."""
        update = UnitUpdate(space_type=SpaceType.RETAIL)
        assert update.space_type == SpaceType.RETAIL

    def test_space_type_update_optional(self) -> None:
        """space_type is optional in UnitUpdate."""
        update = UnitUpdate()
        assert update.space_type is None

    def test_space_type_serialized(self) -> None:
        """space_type appears in Unit serialization as string value."""
        data = make_valid_unit_data()
        data["space_type"] = SpaceType.OUTDOOR_AMENITY
        unit = Unit(
            id=uuid4(),
            property_id=uuid4(),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            **data,
        )
        json_str = unit.model_dump_json()
        assert "outdoor_amenity" in json_str


class TestUnitImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """Unit models can be imported from app.models."""
        from app.models import Unit, UnitCreate, UnitStatus, UnitSummary, UnitUpdate

        assert Unit is not None
        assert UnitCreate is not None
        assert UnitUpdate is not None
        assert UnitSummary is not None
        assert UnitStatus is not None

    def test_unit_status_values(self) -> None:
        """UnitStatus enum has correct values."""
        from app.models import UnitStatus

        assert UnitStatus.VACANT.value == "vacant"
        assert UnitStatus.OCCUPIED.value == "occupied"
        assert UnitStatus.UNDER_RENOVATION.value == "under_renovation"
