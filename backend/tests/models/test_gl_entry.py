"""Tests for GL entry model accrual_date field."""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

from app.models.gl_entry import GLEntry, GLEntryCreate


class TestGLEntryAccrualDate:
    """Tests for accrual_date field on GLEntry models."""

    def test_gl_entry_with_accrual_date(self) -> None:
        """GLEntry accepts an accrual_date."""
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="5100",
            account_description="Utilities",
            amount=Decimal("1000.00"),
            transaction_date=date(2024, 3, 15),
            accrual_date=date(2024, 2, 28),
            period_year=2024,
            period_month=3,
            created_at=datetime.now(),
        )
        assert entry.accrual_date == date(2024, 2, 28)

    def test_gl_entry_accrual_date_defaults_to_none(self) -> None:
        """accrual_date is None when not provided."""
        entry = GLEntry(
            id=uuid4(),
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="5100",
            account_description="Utilities",
            amount=Decimal("1000.00"),
            transaction_date=date(2024, 3, 15),
            period_year=2024,
            period_month=3,
            created_at=datetime.now(),
        )
        assert entry.accrual_date is None

    def test_gl_entry_create_with_accrual_date(self) -> None:
        """GLEntryCreate accepts an accrual_date."""
        create = GLEntryCreate(
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="5100",
            account_description="Utilities",
            amount=Decimal("500.00"),
            transaction_date=date(2024, 6, 1),
            accrual_date=date(2024, 5, 15),
            period_year=2024,
            period_month=6,
        )
        assert create.accrual_date == date(2024, 5, 15)

    def test_gl_entry_create_accrual_date_defaults_to_none(self) -> None:
        """GLEntryCreate accrual_date is None when not provided."""
        create = GLEntryCreate(
            import_batch_id=uuid4(),
            property_id=uuid4(),
            account_code="5100",
            account_description="Utilities",
            amount=Decimal("500.00"),
            transaction_date=date(2024, 6, 1),
            period_year=2024,
            period_month=6,
        )
        assert create.accrual_date is None
