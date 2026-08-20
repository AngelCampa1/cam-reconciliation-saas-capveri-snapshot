"""Tests for Invoice domain models.

Validates InvoiceStatus enum and all Invoice Pydantic models
for correct validation and serialization.
"""

import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.invoice import (
    Invoice,
    InvoiceCreate,
    InvoiceStatus,
    InvoiceSummary,
    InvoiceUpdate,
)

# =============================================================================
# InvoiceStatus Enum Tests
# =============================================================================


class TestInvoiceStatusEnum:
    """Tests for InvoiceStatus enumeration."""

    def test_draft_value(self) -> None:
        """Draft status has correct value."""
        assert InvoiceStatus.DRAFT.value == "draft"

    def test_open_value(self) -> None:
        """Open status has correct value."""
        assert InvoiceStatus.OPEN.value == "open"

    def test_paid_value(self) -> None:
        """Paid status has correct value."""
        assert InvoiceStatus.PAID.value == "paid"

    def test_void_value(self) -> None:
        """Void status has correct value."""
        assert InvoiceStatus.VOID.value == "void"

    def test_uncollectible_value(self) -> None:
        """Uncollectible status has correct value."""
        assert InvoiceStatus.UNCOLLECTIBLE.value == "uncollectible"

    def test_has_five_statuses(self) -> None:
        """Enum has exactly five status values."""
        assert len(InvoiceStatus) == 5

    def test_enum_is_string_subclass(self) -> None:
        """InvoiceStatus is a str subclass for JSON serialization."""
        assert issubclass(InvoiceStatus, str)

    def test_can_compare_with_string(self) -> None:
        """Enum values can be compared with string literals."""
        assert InvoiceStatus.PAID == "paid"
        assert InvoiceStatus.DRAFT == "draft"

    def test_all_values_are_lowercase(self) -> None:
        """All enum values are lowercase."""
        for status in InvoiceStatus:
            assert status.value == status.value.lower()


# =============================================================================
# InvoiceCreate Model Tests
# =============================================================================


class TestInvoiceCreateModel:
    """Tests for InvoiceCreate DTO."""

    def test_minimal_create(self) -> None:
        """Create with only required fields."""
        org_id = uuid4()
        now = datetime.now(UTC)
        create = InvoiceCreate(
            organization_id=org_id,
            amount_due=Decimal("100.00"),
            period_start=now,
            period_end=now,
        )
        assert create.organization_id == org_id
        assert create.amount_due == Decimal("100.00")
        assert create.amount_paid == Decimal("0.00")  # Default
        assert create.currency == "usd"  # Default
        assert create.status == InvoiceStatus.DRAFT  # Default
        assert create.subscription_id is None
        assert create.stripe_invoice_id is None
        assert create.due_date is None

    def test_create_with_all_fields(self) -> None:
        """Create with all fields populated."""
        org_id = uuid4()
        sub_id = uuid4()
        now = datetime.now(UTC)
        create = InvoiceCreate(
            organization_id=org_id,
            subscription_id=sub_id,
            stripe_invoice_id="in_1234567890",
            amount_due=Decimal("250.00"),
            amount_paid=Decimal("50.00"),
            currency="eur",
            status=InvoiceStatus.OPEN,
            period_start=now,
            period_end=now,
            due_date=now,
        )
        assert create.subscription_id == sub_id
        assert create.stripe_invoice_id == "in_1234567890"
        assert create.amount_paid == Decimal("50.00")
        assert create.currency == "eur"
        assert create.status == InvoiceStatus.OPEN
        assert create.due_date == now

    def test_create_requires_organization_id(self) -> None:
        """Organization ID is required."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                amount_due=Decimal("100.00"),
                period_start=now,
                period_end=now,
            )  # type: ignore
        assert "organization_id" in str(exc_info.value)

    def test_create_requires_amount_due(self) -> None:
        """Amount due is required."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                period_start=now,
                period_end=now,
            )  # type: ignore
        assert "amount_due" in str(exc_info.value)

    def test_create_requires_period_start(self) -> None:
        """Period start is required."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                period_end=now,
            )  # type: ignore
        assert "period_start" in str(exc_info.value)

    def test_create_requires_period_end(self) -> None:
        """Period end is required."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                period_start=now,
            )  # type: ignore
        assert "period_end" in str(exc_info.value)

    def test_create_rejects_negative_amount_due(self) -> None:
        """Negative amount_due is rejected."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("-100.00"),
                period_start=now,
                period_end=now,
            )
        assert "amount_due" in str(exc_info.value)

    def test_create_rejects_negative_amount_paid(self) -> None:
        """Negative amount_paid is rejected."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                amount_paid=Decimal("-50.00"),
                period_start=now,
                period_end=now,
            )
        assert "amount_paid" in str(exc_info.value)

    def test_create_rejects_invalid_status(self) -> None:
        """Invalid status value is rejected."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                period_start=now,
                period_end=now,
                status="invalid_status",  # type: ignore
            )
        assert "status" in str(exc_info.value)

    def test_create_accepts_zero_amount(self) -> None:
        """Zero amount is valid."""
        now = datetime.now(UTC)
        create = InvoiceCreate(
            organization_id=uuid4(),
            amount_due=Decimal("0.00"),
            period_start=now,
            period_end=now,
        )
        assert create.amount_due == Decimal("0.00")

    def test_create_serializes_to_json(self) -> None:
        """InvoiceCreate serializes to JSON correctly."""
        now = datetime.now(UTC)
        create = InvoiceCreate(
            organization_id=uuid4(),
            amount_due=Decimal("99.99"),
            period_start=now,
            period_end=now,
        )
        json_str = create.model_dump_json()
        data = json.loads(json_str)
        assert data["status"] == "draft"
        assert data["currency"] == "usd"


# =============================================================================
# InvoiceUpdate Model Tests
# =============================================================================


class TestInvoiceUpdateModel:
    """Tests for InvoiceUpdate DTO."""

    def test_empty_update(self) -> None:
        """Update with no fields is valid."""
        update = InvoiceUpdate()
        assert update.amount_paid is None
        assert update.status is None
        assert update.stripe_invoice_id is None
        assert update.paid_at is None
        assert update.pdf_url is None

    def test_update_amount_paid_only(self) -> None:
        """Update only the amount paid."""
        update = InvoiceUpdate(amount_paid=Decimal("100.00"))
        assert update.amount_paid == Decimal("100.00")
        assert update.status is None

    def test_update_status_only(self) -> None:
        """Update only the status."""
        update = InvoiceUpdate(status=InvoiceStatus.PAID)
        assert update.status == InvoiceStatus.PAID
        assert update.amount_paid is None

    def test_update_paid_at(self) -> None:
        """Update paid_at timestamp."""
        now = datetime.now(UTC)
        update = InvoiceUpdate(paid_at=now)
        assert update.paid_at == now

    def test_update_pdf_url(self) -> None:
        """Update PDF URL."""
        update = InvoiceUpdate(pdf_url="https://example.com/invoice.pdf")
        assert update.pdf_url == "https://example.com/invoice.pdf"

    def test_update_multiple_fields(self) -> None:
        """Update multiple fields at once."""
        now = datetime.now(UTC)
        update = InvoiceUpdate(
            amount_paid=Decimal("100.00"),
            status=InvoiceStatus.PAID,
            paid_at=now,
            pdf_url="https://example.com/invoice.pdf",
        )
        assert update.amount_paid == Decimal("100.00")
        assert update.status == InvoiceStatus.PAID
        assert update.paid_at == now
        assert update.pdf_url == "https://example.com/invoice.pdf"

    def test_update_rejects_invalid_status(self) -> None:
        """Invalid status value is rejected."""
        with pytest.raises(ValidationError):
            InvoiceUpdate(status="bad_status")  # type: ignore

    def test_update_rejects_negative_amount_paid(self) -> None:
        """Negative amount_paid is rejected."""
        with pytest.raises(ValidationError):
            InvoiceUpdate(amount_paid=Decimal("-50.00"))


# =============================================================================
# Invoice Model Tests
# =============================================================================


class TestInvoiceModel:
    """Tests for full Invoice model."""

    @pytest.fixture
    def valid_invoice_data(self) -> dict:
        """Provide valid invoice data."""
        now = datetime.now(UTC)
        return {
            "id": uuid4(),
            "organization_id": uuid4(),
            "subscription_id": uuid4(),
            "stripe_invoice_id": "in_abc123",
            "amount_due": Decimal("199.99"),
            "amount_paid": Decimal("199.99"),
            "currency": "usd",
            "status": InvoiceStatus.PAID,
            "period_start": now,
            "period_end": now,
            "due_date": now,
            "paid_at": now,
            "pdf_url": "https://example.com/invoice.pdf",
            "created_at": now,
            "updated_at": now,
        }

    def test_create_full_invoice(self, valid_invoice_data: dict) -> None:
        """Create invoice with all fields."""
        invoice = Invoice(**valid_invoice_data)
        assert invoice.id == valid_invoice_data["id"]
        assert invoice.organization_id == valid_invoice_data["organization_id"]
        assert invoice.amount_due == Decimal("199.99")
        assert invoice.amount_paid == Decimal("199.99")
        assert invoice.status == InvoiceStatus.PAID
        assert invoice.pdf_url == "https://example.com/invoice.pdf"

    def test_invoice_without_optional_fields(self) -> None:
        """Create invoice without optional fields."""
        now = datetime.now(UTC)
        invoice = Invoice(
            id=uuid4(),
            organization_id=uuid4(),
            subscription_id=None,
            stripe_invoice_id=None,
            amount_due=Decimal("50.00"),
            amount_paid=Decimal("0.00"),
            currency="usd",
            status=InvoiceStatus.DRAFT,
            period_start=now,
            period_end=now,
            due_date=None,
            paid_at=None,
            pdf_url=None,
            created_at=now,
            updated_at=now,
        )
        assert invoice.subscription_id is None
        assert invoice.stripe_invoice_id is None
        assert invoice.due_date is None
        assert invoice.paid_at is None
        assert invoice.pdf_url is None

    def test_invoice_requires_id(self, valid_invoice_data: dict) -> None:
        """Invoice requires ID."""
        del valid_invoice_data["id"]
        with pytest.raises(ValidationError) as exc_info:
            Invoice(**valid_invoice_data)
        assert "id" in str(exc_info.value)

    def test_invoice_requires_organization_id(self, valid_invoice_data: dict) -> None:
        """Invoice requires organization_id."""
        del valid_invoice_data["organization_id"]
        with pytest.raises(ValidationError) as exc_info:
            Invoice(**valid_invoice_data)
        assert "organization_id" in str(exc_info.value)

    def test_invoice_requires_period_dates(self, valid_invoice_data: dict) -> None:
        """Invoice requires period start and end dates."""
        del valid_invoice_data["period_start"]
        with pytest.raises(ValidationError) as exc_info:
            Invoice(**valid_invoice_data)
        assert "period_start" in str(exc_info.value)

    def test_invoice_requires_timestamps(self, valid_invoice_data: dict) -> None:
        """Invoice requires created_at and updated_at."""
        del valid_invoice_data["created_at"]
        with pytest.raises(ValidationError) as exc_info:
            Invoice(**valid_invoice_data)
        assert "created_at" in str(exc_info.value)

    def test_invoice_serializes_to_json(self, valid_invoice_data: dict) -> None:
        """Invoice serializes to JSON correctly."""
        invoice = Invoice(**valid_invoice_data)
        json_str = invoice.model_dump_json()
        data = json.loads(json_str)
        assert data["status"] == "paid"
        assert data["currency"] == "usd"
        assert "id" in data
        assert "organization_id" in data

    def test_invoice_from_attributes(self, valid_invoice_data: dict) -> None:
        """Invoice supports from_attributes for ORM mode."""

        # Simulate ORM object with attributes
        class MockORM:
            pass

        mock = MockORM()
        for key, value in valid_invoice_data.items():
            setattr(mock, key, value)

        invoice = Invoice.model_validate(mock)
        assert invoice.amount_due == Decimal("199.99")
        assert invoice.status == InvoiceStatus.PAID

    def test_invoice_decimal_precision(self) -> None:
        """Invoice preserves decimal precision."""
        now = datetime.now(UTC)
        invoice = Invoice(
            id=uuid4(),
            organization_id=uuid4(),
            amount_due=Decimal("1234.56"),
            amount_paid=Decimal("1234.56"),
            currency="usd",
            status=InvoiceStatus.PAID,
            period_start=now,
            period_end=now,
            created_at=now,
            updated_at=now,
        )
        assert invoice.amount_due == Decimal("1234.56")
        assert invoice.amount_paid == Decimal("1234.56")


# =============================================================================
# InvoiceSummary Model Tests
# =============================================================================


class TestInvoiceSummaryModel:
    """Tests for InvoiceSummary model."""

    def test_create_summary(self) -> None:
        """Create invoice summary with all fields."""
        now = datetime.now(UTC)
        summary = InvoiceSummary(
            id=uuid4(),
            organization_id=uuid4(),
            amount_due=Decimal("100.00"),
            amount_paid=Decimal("50.00"),
            currency="usd",
            status=InvoiceStatus.OPEN,
            period_end=now,
            due_date=now,
        )
        assert summary.amount_due == Decimal("100.00")
        assert summary.amount_paid == Decimal("50.00")
        assert summary.status == InvoiceStatus.OPEN

    def test_summary_with_null_due_date(self) -> None:
        """Create summary with null due_date."""
        now = datetime.now(UTC)
        summary = InvoiceSummary(
            id=uuid4(),
            organization_id=uuid4(),
            amount_due=Decimal("100.00"),
            amount_paid=Decimal("0.00"),
            currency="usd",
            status=InvoiceStatus.DRAFT,
            period_end=now,
            due_date=None,
        )
        assert summary.due_date is None

    def test_summary_requires_all_required_fields(self) -> None:
        """Summary requires all required fields."""
        with pytest.raises(ValidationError):
            InvoiceSummary(
                id=uuid4(),
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                # Missing other required fields
            )  # type: ignore

    def test_summary_serializes_to_json(self) -> None:
        """Summary serializes to JSON correctly."""
        now = datetime.now(UTC)
        summary = InvoiceSummary(
            id=uuid4(),
            organization_id=uuid4(),
            amount_due=Decimal("250.00"),
            amount_paid=Decimal("250.00"),
            currency="eur",
            status=InvoiceStatus.PAID,
            period_end=now,
            due_date=now,
        )
        json_str = summary.model_dump_json()
        data = json.loads(json_str)
        assert data["status"] == "paid"
        assert data["currency"] == "eur"


# =============================================================================
# Cross-Model Consistency Tests
# =============================================================================


class TestInvoiceModelConsistency:
    """Tests for consistency across invoice models."""

    def test_all_statuses_in_create_and_update(self) -> None:
        """All status values work in both Create and Update."""
        now = datetime.now(UTC)
        for status in InvoiceStatus:
            create = InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                period_start=now,
                period_end=now,
                status=status,
            )
            assert create.status == status

            update = InvoiceUpdate(status=status)
            assert update.status == status

    def test_json_round_trip(self) -> None:
        """Invoice survives JSON round-trip."""
        now = datetime.now(UTC)
        original = Invoice(
            id=uuid4(),
            organization_id=uuid4(),
            subscription_id=uuid4(),
            stripe_invoice_id="in_test123",
            amount_due=Decimal("500.00"),
            amount_paid=Decimal("500.00"),
            currency="usd",
            status=InvoiceStatus.PAID,
            period_start=now,
            period_end=now,
            due_date=now,
            paid_at=now,
            pdf_url="https://example.com/test.pdf",
            created_at=now,
            updated_at=now,
        )
        json_str = original.model_dump_json()
        restored = Invoice.model_validate_json(json_str)
        assert restored.status == original.status
        assert restored.stripe_invoice_id == original.stripe_invoice_id
        assert restored.pdf_url == original.pdf_url

    def test_currency_max_length(self) -> None:
        """Currency field respects max length."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                organization_id=uuid4(),
                amount_due=Decimal("100.00"),
                currency="toolong",
                period_start=now,
                period_end=now,
            )
        assert "currency" in str(exc_info.value)
