"""Tests for lease term version models."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.lease_term_version import (
    LeaseTermVersion,
    LeaseTermVersionCreate,
    LeaseTermVersionSummary,
)


class TestLeaseTermVersion:
    """Tests for the full LeaseTermVersion read model."""

    def test_valid_lease_term_version(self) -> None:
        """All fields populated correctly."""
        version = LeaseTermVersion(
            id=uuid4(),
            lease_id=uuid4(),
            version_number=1,
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
            cap_type="none",
            admin_fee_percentage=Decimal("0"),
            excluded_pools=[],
            created_at=datetime.now(UTC),
        )
        assert version.version_number == 1
        assert version.pro_rata_share == Decimal("0.05")

    def test_cap_rate_required_when_cap_type_not_none(self) -> None:
        """cap_rate must be set when cap_type is not 'none'."""
        with pytest.raises(ValidationError, match="cap_rate is required"):
            LeaseTermVersion(
                id=uuid4(),
                lease_id=uuid4(),
                version_number=1,
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("0.05"),
                cap_type="non_cumulative",
                cap_rate=None,
                admin_fee_percentage=Decimal("0"),
                excluded_pools=[],
                created_at=datetime.now(UTC),
            )

    def test_cap_rate_allowed_when_cap_type_none(self) -> None:
        """cap_rate=None is fine when cap_type='none'."""
        version = LeaseTermVersion(
            id=uuid4(),
            lease_id=uuid4(),
            version_number=1,
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.10"),
            cap_type="none",
            cap_rate=None,
            admin_fee_percentage=Decimal("0"),
            excluded_pools=[],
            created_at=datetime.now(UTC),
        )
        assert version.cap_rate is None

    def test_pro_rata_share_range_validation(self) -> None:
        """pro_rata_share must be between 0 and 1."""
        with pytest.raises(ValidationError):
            LeaseTermVersion(
                id=uuid4(),
                lease_id=uuid4(),
                version_number=1,
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("1.5"),
                cap_type="none",
                admin_fee_percentage=Decimal("0"),
                excluded_pools=[],
                created_at=datetime.now(UTC),
            )

    def test_admin_fee_max_20_percent(self) -> None:
        """admin_fee_percentage cannot exceed 0.20."""
        with pytest.raises(ValidationError):
            LeaseTermVersion(
                id=uuid4(),
                lease_id=uuid4(),
                version_number=1,
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("0.05"),
                cap_type="none",
                admin_fee_percentage=Decimal("0.25"),
                excluded_pools=[],
                created_at=datetime.now(UTC),
            )

    def test_base_year_range(self) -> None:
        """base_year must be between 1990 and 2100."""
        with pytest.raises(ValidationError):
            LeaseTermVersion(
                id=uuid4(),
                lease_id=uuid4(),
                version_number=1,
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("0.05"),
                cap_type="none",
                admin_fee_percentage=Decimal("0"),
                excluded_pools=[],
                base_year=1980,
                created_at=datetime.now(UTC),
            )

    def test_optional_fields_default_to_none(self) -> None:
        """Optional fields like base_year, cap_rate default to None."""
        version = LeaseTermVersion(
            id=uuid4(),
            lease_id=uuid4(),
            version_number=1,
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
            cap_type="none",
            admin_fee_percentage=Decimal("0"),
            excluded_pools=[],
            created_at=datetime.now(UTC),
        )
        assert version.base_year is None
        assert version.base_year_amount is None
        assert version.cap_rate is None
        assert version.amendment_reason is None
        assert version.created_by is None
        assert version.management_fee_percentage is None

    def test_management_fee_percentage_accepted(self) -> None:
        """management_fee_percentage stores a valid decimal distinct from admin fee."""
        version = LeaseTermVersion(
            id=uuid4(),
            lease_id=uuid4(),
            version_number=1,
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
            cap_type="none",
            admin_fee_percentage=Decimal("0"),
            management_fee_percentage=Decimal("0.04"),
            excluded_pools=[],
            created_at=datetime.now(UTC),
        )
        assert version.management_fee_percentage == Decimal("0.04")
        assert version.admin_fee_percentage == Decimal("0")

    def test_management_fee_max_20_percent(self) -> None:
        """management_fee_percentage cannot exceed 0.20."""
        with pytest.raises(ValidationError):
            LeaseTermVersion(
                id=uuid4(),
                lease_id=uuid4(),
                version_number=1,
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("0.05"),
                cap_type="none",
                admin_fee_percentage=Decimal("0"),
                management_fee_percentage=Decimal("0.25"),
                excluded_pools=[],
                created_at=datetime.now(UTC),
            )


class TestLeaseTermVersionCreate:
    """Tests for the create DTO."""

    def test_valid_create(self) -> None:
        """Minimal valid create DTO."""
        create = LeaseTermVersionCreate(
            effective_date=date(2025, 4, 1),
            pro_rata_share=Decimal("0.08"),
            cap_type="cumulative",
            cap_rate=Decimal("0.05"),
            amendment_reason="Expansion — added Suite 200",
        )
        assert create.effective_date == date(2025, 4, 1)
        assert create.amendment_reason == "Expansion — added Suite 200"

    def test_create_defaults(self) -> None:
        """Defaults match DB column defaults."""
        create = LeaseTermVersionCreate(
            effective_date=date(2025, 1, 1),
            pro_rata_share=Decimal("0.05"),
        )
        assert create.cap_type == "none"
        assert create.admin_fee_percentage == Decimal("0")
        assert create.management_fee_percentage is None
        assert create.gross_up_base_year is False
        assert create.excluded_pools == []

    def test_create_cap_rate_required_validation(self) -> None:
        """cap_rate required when cap_type is not none."""
        with pytest.raises(ValidationError, match="cap_rate is required"):
            LeaseTermVersionCreate(
                effective_date=date(2025, 1, 1),
                pro_rata_share=Decimal("0.05"),
                cap_type="non_cumulative",
            )


class TestLeaseTermVersionSummary:
    """Tests for the timeline summary model."""

    def test_summary_fields(self) -> None:
        """Summary contains timeline-relevant fields only."""
        summary = LeaseTermVersionSummary(
            id=uuid4(),
            version_number=3,
            effective_date=date(2025, 7, 1),
            pro_rata_share=Decimal("0.12"),
            cap_type="cumulative",
            amendment_reason="Renewal with cap renegotiation",
            created_at=datetime.now(UTC),
        )
        assert summary.version_number == 3
        assert summary.amendment_reason == "Renewal with cap renegotiation"
