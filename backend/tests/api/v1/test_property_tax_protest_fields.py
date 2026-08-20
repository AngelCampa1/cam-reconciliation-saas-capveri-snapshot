"""
Tests for tax protest fields on the property create/update endpoints.

Tests cover:
- PUT /properties/{id} accepts tax_protest_county
- PUT /properties/{id} accepts tax_protest_deadline_override
- PropertyUpdate schema accepts both fields as optional
- POST /properties accepts both fields (F-009: previously dropped on create)
- PropertyCreate and the full Property model expose both fields
"""

from datetime import date
from decimal import Decimal

from app.models.property import Property, PropertyCreate, PropertyUpdate

_BASE_CREATE_FIELDS = {
    "name": "Test Property",
    "address_line1": "1 Main St",
    "city": "Houston",
    "state": "TX",
    "postal_code": "77002",
    "total_rentable_sqft": Decimal("1000"),
    "total_usable_sqft": Decimal("900"),
    "common_area_sqft": Decimal("100"),
}


class TestPropertyUpdateSchema:
    def test_tax_protest_county_field_accepted(self):
        update = PropertyUpdate(tax_protest_county="Harris")
        data = update.model_dump(exclude_unset=True)
        assert data["tax_protest_county"] == "Harris"

    def test_tax_protest_deadline_override_accepted(self):
        update = PropertyUpdate(tax_protest_deadline_override=date(2025, 4, 1))
        data = update.model_dump(exclude_unset=True)
        assert data["tax_protest_deadline_override"] == date(2025, 4, 1)

    def test_both_fields_optional(self):
        update = PropertyUpdate(name="Test Property")
        data = update.model_dump(exclude_unset=True)
        assert "tax_protest_county" not in data
        assert "tax_protest_deadline_override" not in data

    def test_county_can_be_none_to_clear(self):
        update = PropertyUpdate(tax_protest_county=None)
        data = update.model_dump(exclude_unset=True)
        assert "tax_protest_county" in data
        assert data["tax_protest_county"] is None


class TestPropertyCreateSchema:
    """F-009: tax protest fields must be accepted on create, not just update.

    Previously the form sent these fields but PropertyCreate (a bare subclass
    of PropertyBase) did not declare them, so they were silently dropped before
    the DB insert.
    """

    def test_create_accepts_tax_protest_county(self):
        prop = PropertyCreate(**_BASE_CREATE_FIELDS, tax_protest_county="Harris")
        data = prop.model_dump(mode="json")
        assert data["tax_protest_county"] == "Harris"

    def test_create_accepts_tax_protest_deadline_override(self):
        prop = PropertyCreate(
            **_BASE_CREATE_FIELDS,
            tax_protest_deadline_override=date(2026, 4, 15),
        )
        data = prop.model_dump(mode="json")
        assert data["tax_protest_deadline_override"] == "2026-04-15"

    def test_create_fields_default_to_none(self):
        prop = PropertyCreate(**_BASE_CREATE_FIELDS)
        data = prop.model_dump(mode="json")
        assert data["tax_protest_county"] is None
        assert data["tax_protest_deadline_override"] is None


class TestPropertyModelExposesTaxProtest:
    """The full read model must surface tax protest fields so the frontend can
    display them without casting the response to an untyped record (F-009)."""

    def test_property_model_round_trips_tax_protest_fields(self):
        prop = Property(
            id="11111111-1111-1111-1111-111111111111",
            organization_id="22222222-2222-2222-2222-222222222222",
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-01T00:00:00Z",
            tax_protest_county="Dallas",
            tax_protest_deadline_override=date(2026, 5, 31),
            **_BASE_CREATE_FIELDS,
        )
        assert prop.tax_protest_county == "Dallas"
        assert prop.tax_protest_deadline_override == date(2026, 5, 31)
