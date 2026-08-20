"""Tests for GLEntry domain model.

Tests cover:
- Full GLEntry model with all fields
- Signed amount handling (positive=debit, negative=credit)
- Period year/month validation
- Raw row data preservation
- GLEntryCreate DTO
- GLEntryUpdate DTO
- GLEntrySummary aggregation model
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import (
    GLEntry,
    GLEntryCreate,
    GLEntrySummary,
    GLEntryUpdate,
)


class TestGLEntryModel:
    """Tests for the full GLEntry model."""

    def test_gl_entry_with_all_fields(self):
        """Test creating a GL entry with all fields populated."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000-100",
            account_description="Janitorial Services",
            amount=Decimal("1500.00"),
            transaction_date=date(2024, 6, 15),
            period_year=2024,
            period_month=6,
            vendor_name="ABC Cleaning Co",
            description="Monthly cleaning service - June 2024",
            raw_row_data={"original_field": "value", "row_number": 42},
            created_at=now,
        )

        assert entry.account_code == "6000-100"
        assert entry.account_description == "Janitorial Services"
        assert entry.amount == Decimal("1500.00")
        assert entry.period_year == 2024
        assert entry.period_month == 6
        assert entry.vendor_name == "ABC Cleaning Co"
        assert entry.raw_row_data["row_number"] == 42

    def test_gl_entry_with_minimal_fields(self):
        """Test creating a GL entry with only required fields."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="7000",
            account_description="Utilities",
            amount=Decimal("500.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert entry.vendor_name is None
        assert entry.description is None
        assert entry.raw_row_data == {}

    def test_gl_entry_optional_fields(self):
        """Test that optional fields default correctly."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="8000",
            account_description="Insurance",
            amount=Decimal("2000.00"),
            transaction_date=date(2024, 3, 1),
            period_year=2024,
            period_month=3,
            vendor_name=None,
            description=None,
            created_at=now,
        )

        assert entry.vendor_name is None
        assert entry.description is None


class TestSignedAmount:
    """Tests for signed amount handling."""

    def test_positive_amount_debit(self):
        """Test that positive amount represents a debit."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Operating Expense",
            amount=Decimal("1000.00"),
            transaction_date=date(2024, 1, 15),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert entry.amount > 0
        assert entry.amount == Decimal("1000.00")

    def test_negative_amount_credit(self):
        """Test that negative amount represents a credit."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Credit Adjustment",
            amount=Decimal("-500.00"),
            transaction_date=date(2024, 1, 20),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert entry.amount < 0
        assert entry.amount == Decimal("-500.00")

    def test_zero_amount(self):
        """Test that zero amount is valid."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Zero Entry",
            amount=Decimal("0.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert entry.amount == Decimal("0.00")

    def test_large_amount(self):
        """Test handling of large amounts."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Large Expense",
            amount=Decimal("9999999.99"),
            transaction_date=date(2024, 12, 31),
            period_year=2024,
            period_month=12,
            created_at=now,
        )

        assert entry.amount == Decimal("9999999.99")

    def test_amount_with_cents(self):
        """Test amount with decimal places."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6100",
            account_description="Miscellaneous",
            amount=Decimal("123.45"),
            transaction_date=date(2024, 5, 15),
            period_year=2024,
            period_month=5,
            created_at=now,
        )

        assert entry.amount == Decimal("123.45")


class TestAccountCodeValidation:
    """Tests for account_code field validation."""

    def test_account_code_required(self):
        """Test that account_code is required."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_description="Missing Code",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
                created_at=now,
            )

        assert "account_code" in str(exc_info.value)

    def test_account_code_min_length(self):
        """Test that account_code must be at least 1 character."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="",
                account_description="Empty Code",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
                created_at=now,
            )

        assert "account_code" in str(exc_info.value)

    def test_account_code_max_length(self):
        """Test that account_code must be at most 50 characters."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="A" * 51,
                account_description="Too Long Code",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
                created_at=now,
            )

        assert "account_code" in str(exc_info.value)

    def test_account_code_at_max_length(self):
        """Test account_code at exactly 50 characters."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="A" * 50,
            account_description="Max Length Code",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert len(entry.account_code) == 50


class TestPeriodValidation:
    """Tests for period_year and period_month validation."""

    def test_period_year_minimum(self):
        """Test period_year at minimum (1990)."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Historic Entry",
            amount=Decimal("100.00"),
            transaction_date=date(1990, 1, 1),
            period_year=1990,
            period_month=1,
            created_at=now,
        )

        assert entry.period_year == 1990

    def test_period_year_maximum(self):
        """Test period_year at maximum (2100)."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Future Entry",
            amount=Decimal("100.00"),
            transaction_date=date(2100, 12, 31),
            period_year=2100,
            period_month=12,
            created_at=now,
        )

        assert entry.period_year == 2100

    def test_period_year_below_minimum(self):
        """Test period_year below minimum is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="6000",
                account_description="Too Old",
                amount=Decimal("100.00"),
                transaction_date=date(1989, 1, 1),
                period_year=1989,
                period_month=1,
                created_at=now,
            )

        assert "period_year" in str(exc_info.value)

    def test_period_year_above_maximum(self):
        """Test period_year above maximum is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="6000",
                account_description="Too Far Future",
                amount=Decimal("100.00"),
                transaction_date=date(2101, 1, 1),
                period_year=2101,
                period_month=1,
                created_at=now,
            )

        assert "period_year" in str(exc_info.value)

    def test_period_month_minimum(self):
        """Test period_month at minimum (1)."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="January Entry",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 15),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        assert entry.period_month == 1

    def test_period_month_maximum(self):
        """Test period_month at maximum (12)."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="December Entry",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 12, 15),
            period_year=2024,
            period_month=12,
            created_at=now,
        )

        assert entry.period_month == 12

    def test_period_month_below_minimum(self):
        """Test period_month below minimum is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="6000",
                account_description="Invalid Month",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=0,
                created_at=now,
            )

        assert "period_month" in str(exc_info.value)

    def test_period_month_above_maximum(self):
        """Test period_month above maximum is rejected."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            GLEntry(
                id=uuid4(),
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="6000",
                account_description="Invalid Month",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 12, 1),
                period_year=2024,
                period_month=13,
                created_at=now,
            )

        assert "period_month" in str(exc_info.value)


class TestRawRowData:
    """Tests for raw_row_data preservation."""

    def test_raw_row_data_empty(self):
        """Test empty raw_row_data."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Empty Raw Data",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            raw_row_data={},
            created_at=now,
        )

        assert entry.raw_row_data == {}

    def test_raw_row_data_with_values(self):
        """Test raw_row_data preserves original CSV values."""
        now = datetime.now()
        raw_data = {
            "Account": "6000-100",
            "Description": "Janitorial",
            "Debit": "1500.00",
            "Credit": "",
            "Date": "06/15/2024",
            "Vendor": "ABC Cleaning",
            "Row Number": 42,
        }

        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000-100",
            account_description="Janitorial",
            amount=Decimal("1500.00"),
            transaction_date=date(2024, 6, 15),
            period_year=2024,
            period_month=6,
            raw_row_data=raw_data,
            created_at=now,
        )

        assert entry.raw_row_data["Account"] == "6000-100"
        assert entry.raw_row_data["Debit"] == "1500.00"
        assert entry.raw_row_data["Row Number"] == 42

    def test_raw_row_data_with_nested_values(self):
        """Test raw_row_data with nested structures."""
        now = datetime.now()
        raw_data = {
            "metadata": {"source": "Yardi", "version": "2.0"},
            "values": ["a", "b", "c"],
        }

        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="Nested Data",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            raw_row_data=raw_data,
            created_at=now,
        )

        assert entry.raw_row_data["metadata"]["source"] == "Yardi"
        assert entry.raw_row_data["values"] == ["a", "b", "c"]


class TestGLEntryCreate:
    """Tests for GLEntryCreate DTO."""

    def test_create_with_all_fields(self):
        """Test creating with all fields."""
        create = GLEntryCreate(
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000-200",
            account_description="Utilities - Electric",
            amount=Decimal("750.50"),
            transaction_date=date(2024, 7, 1),
            period_year=2024,
            period_month=7,
            vendor_name="Power Company",
            description="July electric bill",
            raw_row_data={"source": "manual"},
        )

        assert create.account_code == "6000-200"
        assert create.amount == Decimal("750.50")
        assert create.vendor_name == "Power Company"

    def test_create_with_minimal_fields(self):
        """Test creating with minimal required fields."""
        create = GLEntryCreate(
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="7000",
            account_description="Tax Expense",
            amount=Decimal("5000.00"),
            transaction_date=date(2024, 4, 15),
            period_year=2024,
            period_month=4,
        )

        assert create.vendor_name is None
        assert create.description is None
        assert create.raw_row_data == {}

    def test_create_requires_import_batch_id(self):
        """Test that import_batch_id is required."""
        with pytest.raises(ValidationError) as exc_info:
            GLEntryCreate(
                property_id=uuid4(),
                account_code="6000",
                account_description="Missing Batch",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
            )

        assert "import_batch_id" in str(exc_info.value)

    def test_create_requires_property_id(self):
        """Test that property_id is required."""
        with pytest.raises(ValidationError) as exc_info:
            GLEntryCreate(
                import_batch_id=uuid4(),
                account_code="6000",
                account_description="Missing Property",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
            )

        assert "property_id" in str(exc_info.value)

    def test_create_validates_account_code(self):
        """Test that create validates account_code constraints."""
        with pytest.raises(ValidationError):
            GLEntryCreate(
                import_batch_id=uuid4(),
                property_id=uuid4(),
                account_code="",
                account_description="Empty Code",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 1),
                period_year=2024,
                period_month=1,
            )


class TestGLEntryUpdate:
    """Tests for GLEntryUpdate DTO."""

    def test_update_all_fields_optional(self):
        """Test that all fields are optional for updates."""
        update = GLEntryUpdate()
        assert update.vendor_name is None
        assert update.description is None

    def test_update_vendor_name_only(self):
        """Test partial update with just vendor_name."""
        update = GLEntryUpdate(vendor_name="Updated Vendor")
        assert update.vendor_name == "Updated Vendor"
        assert update.description is None

    def test_update_description_only(self):
        """Test partial update with just description."""
        update = GLEntryUpdate(description="Updated description text")
        assert update.description == "Updated description text"
        assert update.vendor_name is None

    def test_update_both_fields(self):
        """Test update with both fields."""
        update = GLEntryUpdate(
            vendor_name="New Vendor Name",
            description="Corrected entry description",
        )
        assert update.vendor_name == "New Vendor Name"
        assert update.description == "Corrected entry description"

    def test_update_validates_vendor_name_length(self):
        """Test update validates vendor_name max length."""
        with pytest.raises(ValidationError):
            GLEntryUpdate(vendor_name="A" * 256)

    def test_update_validates_description_length(self):
        """Test update validates description max length."""
        with pytest.raises(ValidationError):
            GLEntryUpdate(description="A" * 1001)


class TestGLEntrySummary:
    """Tests for GLEntrySummary aggregation model."""

    def test_summary_with_positive_total(self):
        """Test summary with positive total amount."""
        summary = GLEntrySummary(
            account_code="6000",
            account_description="Operating Expenses",
            total_amount=Decimal("15000.00"),
            entry_count=25,
        )

        assert summary.account_code == "6000"
        assert summary.total_amount == Decimal("15000.00")
        assert summary.entry_count == 25

    def test_summary_with_negative_total(self):
        """Test summary with negative total (credits exceeded debits)."""
        summary = GLEntrySummary(
            account_code="4000",
            account_description="Revenue",
            total_amount=Decimal("-50000.00"),
            entry_count=10,
        )

        assert summary.total_amount == Decimal("-50000.00")
        assert summary.entry_count == 10

    def test_summary_with_zero_total(self):
        """Test summary with zero total (balanced account)."""
        summary = GLEntrySummary(
            account_code="5000",
            account_description="Clearing Account",
            total_amount=Decimal("0.00"),
            entry_count=2,
        )

        assert summary.total_amount == Decimal("0.00")

    def test_summary_entry_count_minimum(self):
        """Test entry_count must be non-negative."""
        with pytest.raises(ValidationError):
            GLEntrySummary(
                account_code="6000",
                account_description="Invalid Count",
                total_amount=Decimal("100.00"),
                entry_count=-1,
            )

    def test_summary_entry_count_zero(self):
        """Test entry_count can be zero."""
        summary = GLEntrySummary(
            account_code="6000",
            account_description="No Entries",
            total_amount=Decimal("0.00"),
            entry_count=0,
        )

        assert summary.entry_count == 0


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self):
        """Test serialization to dictionary."""
        now = datetime.now()
        entry_id = uuid4()
        batch_id = uuid4()
        property_id = uuid4()

        entry = GLEntry(
            id=entry_id,
            import_batch_id=batch_id,
            property_id=property_id,
            account_code="6000",
            account_description="Test Account",
            amount=Decimal("1234.56"),
            transaction_date=date(2024, 6, 15),
            period_year=2024,
            period_month=6,
            raw_row_data={"key": "value"},
            created_at=now,
        )

        data = entry.model_dump()
        assert data["id"] == entry_id
        assert data["import_batch_id"] == batch_id
        assert data["amount"] == Decimal("1234.56")
        assert data["raw_row_data"]["key"] == "value"

    def test_to_json(self):
        """Test serialization to JSON."""
        now = datetime.now()
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="6000",
            account_description="JSON Test",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 1),
            period_year=2024,
            period_month=1,
            created_at=now,
        )

        json_str = entry.model_dump_json()
        assert "JSON Test" in json_str
        assert "6000" in json_str

    def test_from_attributes(self):
        """Test creating from ORM-like object."""

        class MockGLEntry:
            id = uuid4()
            import_batch_id = uuid4()
            property_id = uuid4()
            account_code = "7000"
            account_description = "ORM Entry"
            amount = Decimal("500.00")
            transaction_date = date(2024, 3, 15)
            period_year = 2024
            period_month = 3
            vendor_name = "Test Vendor"
            description = "Test description"
            raw_row_data = {"orm": True}
            created_at = datetime.now()

        entry = GLEntry.model_validate(MockGLEntry())
        assert entry.account_code == "7000"
        assert entry.amount == Decimal("500.00")
        assert entry.raw_row_data["orm"] is True


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self):
        """Test importing from app.models package."""
        from app.models import (
            GLEntry,
            GLEntryCreate,
            GLEntrySummary,
            GLEntryUpdate,
        )

        assert GLEntry is not None
        assert GLEntryCreate is not None
        assert GLEntrySummary is not None
        assert GLEntryUpdate is not None
