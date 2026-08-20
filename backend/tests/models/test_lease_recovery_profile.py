"""Tests for lease recovery profile accounting_basis field."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.enums import AccountingBasis
from app.models.lease_recovery_profile import (
    LeaseRecoveryProfile,
    LeaseRecoveryProfileCreate,
    LeaseRecoveryProfileUpdate,
)


class TestAccountingBasisOnRecoveryProfile:
    """Tests for accounting_basis field on recovery profile models."""

    def test_accepts_cash_basis(self) -> None:
        """accounting_basis accepts 'cash'."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
            accounting_basis=AccountingBasis.CASH,
        )
        assert profile.accounting_basis == AccountingBasis.CASH

    def test_accepts_accrual_basis(self) -> None:
        """accounting_basis accepts 'accrual'."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
            accounting_basis=AccountingBasis.ACCRUAL,
        )
        assert profile.accounting_basis == AccountingBasis.ACCRUAL

    def test_defaults_to_none(self) -> None:
        """accounting_basis defaults to None."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
        )
        assert profile.accounting_basis is None

    def test_rejects_invalid_value(self) -> None:
        """accounting_basis rejects invalid values."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.10"),
                accounting_basis="hybrid",  # type: ignore[arg-type]
            )

    def test_create_model_accepts_accounting_basis(self) -> None:
        """LeaseRecoveryProfileCreate accepts accounting_basis."""
        create = LeaseRecoveryProfileCreate(
            pro_rata_share=Decimal("0.10"),
            accounting_basis=AccountingBasis.ACCRUAL,
        )
        assert create.accounting_basis == AccountingBasis.ACCRUAL

    def test_update_model_accepts_accounting_basis(self) -> None:
        """LeaseRecoveryProfileUpdate accepts accounting_basis."""
        update = LeaseRecoveryProfileUpdate(
            accounting_basis=AccountingBasis.CASH,
        )
        assert update.accounting_basis == AccountingBasis.CASH

    def test_existing_validation_still_works(self) -> None:
        """Existing cap_rate validation still works with accounting_basis."""
        with pytest.raises(ValidationError, match="cap_rate is required"):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.10"),
                cap_type="non_cumulative",
                accounting_basis=AccountingBasis.CASH,
            )

    def test_serialization_roundtrip(self) -> None:
        """accounting_basis survives JSON serialization roundtrip."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
            accounting_basis=AccountingBasis.ACCRUAL,
        )
        data = profile.model_dump(mode="json")
        assert data["accounting_basis"] == "accrual"
        restored = LeaseRecoveryProfile(**data)
        assert restored.accounting_basis == AccountingBasis.ACCRUAL


class TestManagementFeeOnRecoveryProfile:
    """management_fee_percentage is distinct from admin_fee_percentage."""

    def test_defaults_to_none(self) -> None:
        """Unlike admin_fee (defaults to 0), management fee defaults to None."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.10"))
        assert profile.management_fee_percentage is None
        assert profile.admin_fee_percentage == Decimal("0")

    def test_accepts_decimal_value(self) -> None:
        """A 4% management fee is stored distinctly from any admin fee."""
        profile = LeaseRecoveryProfile(
            pro_rata_share=Decimal("0.10"),
            admin_fee_percentage=Decimal("0.05"),
            management_fee_percentage=Decimal("0.04"),
        )
        assert profile.management_fee_percentage == Decimal("0.04")
        assert profile.admin_fee_percentage == Decimal("0.05")

    def test_rejects_above_max(self) -> None:
        """management_fee_percentage cannot exceed 0.20."""
        with pytest.raises(ValidationError):
            LeaseRecoveryProfile(
                pro_rata_share=Decimal("0.10"),
                management_fee_percentage=Decimal("0.25"),
            )

    def test_create_model_accepts_management_fee(self) -> None:
        """LeaseRecoveryProfileCreate threads management_fee_percentage."""
        create = LeaseRecoveryProfileCreate(
            pro_rata_share=Decimal("0.10"),
            management_fee_percentage=Decimal("0.04"),
        )
        assert create.management_fee_percentage == Decimal("0.04")

    def test_create_model_defaults_to_none(self) -> None:
        """LeaseRecoveryProfileCreate defaults management_fee to None."""
        create = LeaseRecoveryProfileCreate(pro_rata_share=Decimal("0.10"))
        assert create.management_fee_percentage is None

    def test_update_model_accepts_management_fee(self) -> None:
        """LeaseRecoveryProfileUpdate threads management_fee_percentage."""
        update = LeaseRecoveryProfileUpdate(
            management_fee_percentage=Decimal("0.04"),
        )
        assert update.management_fee_percentage == Decimal("0.04")

    def test_serialization_roundtrip_preserves_null(self) -> None:
        """A null management fee survives a JSON roundtrip as None (not 0)."""
        profile = LeaseRecoveryProfile(pro_rata_share=Decimal("0.10"))
        data = profile.model_dump(mode="json")
        assert data["management_fee_percentage"] is None
        restored = LeaseRecoveryProfile(**data)
        assert restored.management_fee_percentage is None
