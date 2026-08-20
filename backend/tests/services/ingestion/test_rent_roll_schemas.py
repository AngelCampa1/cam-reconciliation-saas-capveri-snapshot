"""Tests for rent roll parsing schemas.

These tests ensure the RentRollRow, PropertyMetadata, and RentRollParseResult
schemas correctly validate and serialize rent roll data.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.services.ingestion.schemas import (
    PropertyMetadata,
    RentRollParseResult,
    RentRollRow,
)


class TestRentRollRow:
    """Tests for RentRollRow schema."""

    def test_valid_row_with_required_fields_only(self) -> None:
        """RentRollRow accepts minimum required fields."""
        row = RentRollRow(
            unit_number="101",
            rentable_sqft=Decimal("1500.00"),
        )
        assert row.unit_number == "101"
        assert row.rentable_sqft == Decimal("1500.00")
        assert row.tenant_name is None
        assert row.lease_start is None

    def test_valid_row_with_all_fields(self) -> None:
        """RentRollRow accepts all fields including optional."""
        row = RentRollRow(
            unit_number="101-A",
            rentable_sqft=Decimal("1500.00"),
            usable_sqft=Decimal("1350.00"),
            floor=3,
            tenant_name="Acme Corporation",
            lease_start=date(2024, 1, 1),
            lease_end=date(2026, 12, 31),
            base_rent=Decimal("3500.00"),
            cam_share=Decimal("0.0523"),
            raw_row_data={"original_col": "value"},
        )
        assert row.unit_number == "101-A"
        assert row.usable_sqft == Decimal("1350.00")
        assert row.floor == 3
        assert row.tenant_name == "Acme Corporation"
        assert row.lease_start == date(2024, 1, 1)
        assert row.lease_end == date(2026, 12, 31)
        assert row.base_rent == Decimal("3500.00")
        assert row.cam_share == Decimal("0.0523")

    def test_vacant_unit_no_tenant_data(self) -> None:
        """RentRollRow handles vacant units without tenant/lease info."""
        row = RentRollRow(
            unit_number="202",
            rentable_sqft=Decimal("2000.00"),
            usable_sqft=Decimal("1800.00"),
        )
        assert row.tenant_name is None
        assert row.lease_start is None
        assert row.lease_end is None
        assert row.base_rent is None

    def test_unit_number_required(self) -> None:
        """RentRollRow requires unit_number."""
        with pytest.raises(ValidationError) as exc_info:
            RentRollRow(rentable_sqft=Decimal("1500.00"))  # type: ignore[call-arg]
        assert "unit_number" in str(exc_info.value)

    def test_rentable_sqft_required(self) -> None:
        """RentRollRow requires rentable_sqft."""
        with pytest.raises(ValidationError) as exc_info:
            RentRollRow(unit_number="101")  # type: ignore[call-arg]
        assert "rentable_sqft" in str(exc_info.value)

    def test_serialization_to_dict(self) -> None:
        """RentRollRow serializes to dict correctly."""
        row = RentRollRow(
            unit_number="101",
            rentable_sqft=Decimal("1500.00"),
            tenant_name="Test Tenant",
        )
        data = row.model_dump()
        assert data["unit_number"] == "101"
        assert data["rentable_sqft"] == Decimal("1500.00")
        assert data["tenant_name"] == "Test Tenant"


class TestPropertyMetadata:
    """Tests for PropertyMetadata schema."""

    def test_all_fields_optional(self) -> None:
        """PropertyMetadata allows all fields to be None."""
        metadata = PropertyMetadata()
        assert metadata.name is None
        assert metadata.address_line1 is None
        assert metadata.city is None
        assert metadata.state is None
        assert metadata.postal_code is None

    def test_partial_metadata(self) -> None:
        """PropertyMetadata accepts partial data."""
        metadata = PropertyMetadata(
            name="Downtown Tower",
            city="Austin",
        )
        assert metadata.name == "Downtown Tower"
        assert metadata.address_line1 is None
        assert metadata.city == "Austin"
        assert metadata.state is None

    def test_full_metadata(self) -> None:
        """PropertyMetadata accepts complete address data."""
        metadata = PropertyMetadata(
            name="Downtown Tower",
            address_line1="123 Main Street",
            city="Austin",
            state="TX",
            postal_code="78701",
        )
        assert metadata.name == "Downtown Tower"
        assert metadata.address_line1 == "123 Main Street"
        assert metadata.city == "Austin"
        assert metadata.state == "TX"
        assert metadata.postal_code == "78701"


class TestRentRollParseResult:
    """Tests for RentRollParseResult schema."""

    def test_successful_parse_result(self) -> None:
        """RentRollParseResult captures successful parse data."""
        units = [
            RentRollRow(
                unit_number="101",
                rentable_sqft=Decimal("1500.00"),
                tenant_name="Acme Corp",
            ),
            RentRollRow(
                unit_number="102",
                rentable_sqft=Decimal("2000.00"),
            ),
        ]
        result = RentRollParseResult(
            success=True,
            source_system="yardi_rent_roll",
            property_metadata=PropertyMetadata(name="Test Building"),
            units=units,
            row_count=2,
        )
        assert result.success is True
        assert result.source_system == "yardi_rent_roll"
        assert result.property_metadata.name == "Test Building"
        assert len(result.units) == 2
        assert result.row_count == 2
        assert result.error_count == 0
        assert result.errors == []
        assert result.warnings == []

    def test_parse_result_with_errors(self) -> None:
        """RentRollParseResult captures parse errors."""
        result = RentRollParseResult(
            success=False,
            source_system="mri_rent_roll",
            property_metadata=PropertyMetadata(),
            units=[],
            row_count=0,
            error_count=3,
            errors=[
                "Row 5: Missing unit_number",
                "Row 8: Invalid sqft value",
                "Row 12: Date parsing failed",
            ],
        )
        assert result.success is False
        assert result.error_count == 3
        assert len(result.errors) == 3

    def test_parse_result_with_warnings(self) -> None:
        """RentRollParseResult captures warnings."""
        result = RentRollParseResult(
            success=True,
            source_system="yardi_rent_roll",
            property_metadata=PropertyMetadata(),
            units=[RentRollRow(unit_number="101", rentable_sqft=Decimal("1000"))],
            row_count=1,
            warnings=["5 units missing lease dates", "Property name not detected"],
        )
        assert result.success is True
        assert len(result.warnings) == 2

    def test_required_fields(self) -> None:
        """RentRollParseResult requires core fields."""
        with pytest.raises(ValidationError):
            RentRollParseResult()  # type: ignore[call-arg]

    def test_serialization_for_api_response(self) -> None:
        """RentRollParseResult serializes correctly for API response."""
        result = RentRollParseResult(
            success=True,
            source_system="yardi_rent_roll",
            property_metadata=PropertyMetadata(name="Test"),
            units=[
                RentRollRow(
                    unit_number="101",
                    rentable_sqft=Decimal("1500.00"),
                    lease_start=date(2024, 1, 1),
                )
            ],
            row_count=1,
        )
        data = result.model_dump(mode="json")
        assert data["success"] is True
        assert data["source_system"] == "yardi_rent_roll"
        assert data["property_metadata"]["name"] == "Test"
        assert data["units"][0]["unit_number"] == "101"
        # Decimal should serialize to string in JSON mode
        assert data["units"][0]["rentable_sqft"] == "1500.00"
        # Date should serialize to ISO format
        assert data["units"][0]["lease_start"] == "2024-01-01"


class TestRentRollRowSqftValidation:
    """Tests for sqft field validation in RentRollRow."""

    def test_rejects_negative_rentable_sqft(self) -> None:
        """RentRollRow rejects negative rentable_sqft."""
        with pytest.raises(ValidationError) as exc_info:
            RentRollRow(
                unit_number="101",
                rentable_sqft=Decimal("-500.00"),
            )
        assert "positive" in str(exc_info.value).lower()

    def test_rejects_zero_rentable_sqft(self) -> None:
        """RentRollRow rejects zero rentable_sqft."""
        with pytest.raises(ValidationError) as exc_info:
            RentRollRow(
                unit_number="101",
                rentable_sqft=Decimal("0"),
            )
        assert "positive" in str(exc_info.value).lower()

    def test_rejects_negative_usable_sqft(self) -> None:
        """RentRollRow rejects negative usable_sqft."""
        with pytest.raises(ValidationError) as exc_info:
            RentRollRow(
                unit_number="101",
                rentable_sqft=Decimal("1500.00"),
                usable_sqft=Decimal("-100.00"),
            )
        assert "positive" in str(exc_info.value).lower()

    def test_allows_positive_sqft_values(self) -> None:
        """RentRollRow accepts positive sqft values."""
        row = RentRollRow(
            unit_number="101",
            rentable_sqft=Decimal("1500.00"),
            usable_sqft=Decimal("1350.00"),
        )
        assert row.rentable_sqft == Decimal("1500.00")
        assert row.usable_sqft == Decimal("1350.00")

    def test_allows_none_usable_sqft(self) -> None:
        """RentRollRow allows None usable_sqft (optional field)."""
        row = RentRollRow(
            unit_number="101",
            rentable_sqft=Decimal("1500.00"),
            usable_sqft=None,
        )
        assert row.usable_sqft is None
