"""Tests for CapEx flag models."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.capex_flag import (
    CapExFlag,
    CapExFlagWithEntry,
    CapExReviewRequest,
    CapExRunResponse,
    CapExSummary,
)


class TestCapExFlag:
    """Tests for the full CapExFlag model."""

    def test_valid_pending_flag(self) -> None:
        """Should create a valid pending CapEx flag with all required fields."""
        now = datetime.now(UTC)
        flag = CapExFlag(
            id=uuid4(),
            organization_id=uuid4(),
            gl_entry_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            flag_reason="Amount exceeds $25,000 threshold",
            rule_name="amount_threshold",
            confidence_score=Decimal("0.60"),
            matched_pattern=None,
            disposition="pending",
            reviewed_at=None,
            reviewed_by_user_id=None,
            review_note=None,
            classifier_version="1.0",
            created_at=now,
        )
        assert flag.period_year == 2024
        assert flag.disposition == "pending"
        assert flag.confidence_score == Decimal("0.60")

    def test_reviewed_flag(self) -> None:
        """Should accept review fields when disposition is confirmed or dismissed."""
        now = datetime.now(UTC)
        user_id = uuid4()
        flag = CapExFlag(
            id=uuid4(),
            organization_id=uuid4(),
            gl_entry_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            flag_reason="Keyword match: capital improvement",
            rule_name="account_keyword",
            confidence_score=Decimal("0.90"),
            matched_pattern="capital improvement",
            disposition="confirmed_capex",
            reviewed_at=now,
            reviewed_by_user_id=user_id,
            review_note="Confirmed — roof replacement project",
            classifier_version="1.0",
            created_at=now,
        )
        assert flag.disposition == "confirmed_capex"
        assert flag.reviewed_by_user_id == user_id

    def test_period_year_lower_bound(self) -> None:
        """Should reject period_year below 1990."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            CapExFlag(
                id=uuid4(),
                organization_id=uuid4(),
                gl_entry_id=uuid4(),
                property_id=uuid4(),
                period_year=1989,
                flag_reason="Test",
                rule_name="test",
                confidence_score=Decimal("0.50"),
                disposition="pending",
                classifier_version="1.0",
                created_at=now,
            )

    def test_period_year_upper_bound(self) -> None:
        """Should reject period_year above 2100."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            CapExFlag(
                id=uuid4(),
                organization_id=uuid4(),
                gl_entry_id=uuid4(),
                property_id=uuid4(),
                period_year=2101,
                flag_reason="Test",
                rule_name="test",
                confidence_score=Decimal("0.50"),
                disposition="pending",
                classifier_version="1.0",
                created_at=now,
            )

    def test_confidence_score_bounds(self) -> None:
        """Should reject confidence_score outside 0-1 range."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            CapExFlag(
                id=uuid4(),
                organization_id=uuid4(),
                gl_entry_id=uuid4(),
                property_id=uuid4(),
                period_year=2024,
                flag_reason="Test",
                rule_name="test",
                confidence_score=Decimal("1.50"),
                disposition="pending",
                classifier_version="1.0",
                created_at=now,
            )

    def test_invalid_disposition(self) -> None:
        """Should reject invalid disposition values."""
        now = datetime.now(UTC)
        with pytest.raises(ValidationError):
            CapExFlag(
                id=uuid4(),
                organization_id=uuid4(),
                gl_entry_id=uuid4(),
                property_id=uuid4(),
                period_year=2024,
                flag_reason="Test",
                rule_name="test",
                confidence_score=Decimal("0.50"),
                disposition="invalid_value",
                classifier_version="1.0",
                created_at=now,
            )

    def test_from_attributes_config(self) -> None:
        """Should be constructible from ORM-like attributes."""
        assert CapExFlag.model_config.get("from_attributes") is True


class TestCapExFlagWithEntry:
    """Tests for CapExFlagWithEntry (joined GL entry data)."""

    def test_includes_entry_fields(self) -> None:
        """Should include GL entry details alongside flag data."""
        now = datetime.now(UTC)
        flag = CapExFlagWithEntry(
            id=uuid4(),
            organization_id=uuid4(),
            gl_entry_id=uuid4(),
            property_id=uuid4(),
            period_year=2024,
            flag_reason="Amount exceeds $100,000 threshold",
            rule_name="amount_threshold",
            confidence_score=Decimal("0.85"),
            matched_pattern=None,
            disposition="pending",
            reviewed_at=None,
            reviewed_by_user_id=None,
            review_note=None,
            classifier_version="1.0",
            created_at=now,
            account_code="1500",
            account_description="Building Improvements",
            vendor_name="ABC Construction",
            amount=Decimal("150000.00"),
            description="Roof replacement — Building A",
            transaction_date="2024-06-15",
        )
        assert flag.account_code == "1500"
        assert flag.amount == Decimal("150000.00")
        assert flag.vendor_name == "ABC Construction"


class TestCapExReviewRequest:
    """Tests for the review request DTO."""

    def test_valid_confirm(self) -> None:
        """Should accept confirmed_capex disposition."""
        req = CapExReviewRequest(
            disposition="confirmed_capex",
            review_note="Verified as capital project",
        )
        assert req.disposition == "confirmed_capex"

    def test_valid_dismiss(self) -> None:
        """Should accept dismissed disposition."""
        req = CapExReviewRequest(
            disposition="dismissed",
            review_note=None,
        )
        assert req.disposition == "dismissed"

    def test_rejects_pending(self) -> None:
        """Should reject 'pending' — reviews must resolve to confirmed or dismissed."""
        with pytest.raises(ValidationError):
            CapExReviewRequest(
                disposition="pending",
                review_note=None,
            )


class TestCapExRunResponse:
    """Tests for the classification run response."""

    def test_includes_counts(self) -> None:
        """Should include flag count and entry count."""
        resp = CapExRunResponse(
            flags_created=12,
            gl_entries_scanned=847,
            property_id=uuid4(),
            period_year=2024,
        )
        assert resp.flags_created == 12
        assert resp.gl_entries_scanned == 847


class TestCapExSummary:
    """Tests for the summary model."""

    def test_counts(self) -> None:
        """Should report counts by disposition."""
        summary = CapExSummary(
            total=15,
            pending=8,
            confirmed_capex=5,
            dismissed=2,
            total_flagged_amount=Decimal("425000.00"),
        )
        assert summary.total == 15
        assert summary.pending == 8
        assert summary.total_flagged_amount == Decimal("425000.00")
