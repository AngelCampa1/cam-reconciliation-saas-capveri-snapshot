"""
Tests for ReconciliationSnapshot Pydantic models.

Covers:
- ReconciliationSnapshot model validation
- ReconciliationSnapshotCreate validation
- ReconciliationSnapshotUpdate validation
- ReconciliationSnapshotFinalize validation
- ReconciliationSnapshotSummary validation
- Helper functions
- Immutability rules
- Serialization
"""

import json
from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.enums import ReconciliationStatus
from app.models.reconciliation_snapshot import (
    ReconciliationCellUpdate,
    ReconciliationSnapshot,
    ReconciliationSnapshotCreate,
    ReconciliationSnapshotFinalize,
    ReconciliationSnapshotSummary,
    ReconciliationSnapshotUpdate,
    can_modify_snapshot,
    decode_cell_id,
    encode_cell_id,
    format_recovery_amount,
)


class TestReconciliationSnapshotModel:
    """Tests for the full ReconciliationSnapshot model."""

    def test_snapshot_with_all_fields(self) -> None:
        """Create snapshot with all fields."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            calculation_trace=[{"step": "gross_up", "value": "105000.00"}],
            created_at=now,
            updated_at=now,
        )
        assert snapshot.total_recovery == Decimal("13800.00")
        assert snapshot.is_finalized is False

    def test_snapshot_draft_status_default(self) -> None:
        """Snapshot defaults to DRAFT status."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            created_at=now,
            updated_at=now,
        )
        assert snapshot.status == ReconciliationStatus.DRAFT

    def test_snapshot_finalized_status(self) -> None:
        """Create finalized snapshot."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.FINALIZED,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            finalized_at=now,
            finalized_by_user_id=uuid4(),
            created_at=now,
            updated_at=now,
        )
        assert snapshot.is_finalized is True

    def test_finalized_requires_finalized_at(self) -> None:
        """Finalized status requires finalized_at to be set."""
        now = datetime.now()
        with pytest.raises(ValidationError) as exc_info:
            ReconciliationSnapshot(
                id=uuid4(),
                property_id=uuid4(),
                lease_id=uuid4(),
                period_start_date=date(2024, 1, 1),
                period_end_date=date(2024, 12, 31),
                status=ReconciliationStatus.FINALIZED,
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("15000.00"),
                tenant_share_after_cap=Decimal("12000.00"),
                admin_fee=Decimal("1800.00"),
                total_recovery=Decimal("13800.00"),
                finalized_at=None,  # Missing
                created_at=now,
                updated_at=now,
            )
        assert "finalized_at must be set when status is FINALIZED" in str(
            exc_info.value
        )

    def test_empty_calculation_trace_default(self) -> None:
        """Calculation trace defaults to empty list."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            created_at=now,
            updated_at=now,
        )
        assert snapshot.calculation_trace == []


class TestSnapshotPoolBreakdowns:
    """Per-pool recovery split persistence (Module A 'Produce', Slice 2c)."""

    @staticmethod
    def _pool_dict() -> dict[str, object]:
        """A single PoolRecovery-shaped JSONB element."""
        return {
            "pool_name": "cam",
            "recoverable_amount": Decimal("1000.00"),
            "is_cap_eligible": True,
            "is_admin_fee_eligible": True,
            "share_before_cap": Decimal("15000.00"),
            "cap_adjustment": Decimal("-3000.00"),
            "share_after_cap": Decimal("12000.00"),
            "admin_fee": Decimal("1800.00"),
            "total_recovery": Decimal("13800.00"),
        }

    def _full_kwargs(self) -> dict[str, object]:
        now = datetime.now()
        return {
            "id": uuid4(),
            "property_id": uuid4(),
            "lease_id": uuid4(),
            "period_start_date": date(2024, 1, 1),
            "period_end_date": date(2024, 12, 31),
            "total_operating_expenses": Decimal("100000.00"),
            "grossed_up_expenses": Decimal("105000.00"),
            "base_year_amount": Decimal("90000.00"),
            "tenant_share_before_cap": Decimal("15000.00"),
            "tenant_share_after_cap": Decimal("12000.00"),
            "admin_fee": Decimal("1800.00"),
            "total_recovery": Decimal("13800.00"),
            "created_at": now,
            "updated_at": now,
        }

    def test_read_model_defaults_pool_breakdowns_to_none(self) -> None:
        """Aggregate-only snapshots (no pool input) read back as None."""
        snapshot = ReconciliationSnapshot(**self._full_kwargs())
        assert snapshot.pool_breakdowns is None

    def test_read_model_accepts_pool_breakdowns(self) -> None:
        """A populated per-pool split round-trips on the read model."""
        snapshot = ReconciliationSnapshot(
            pool_breakdowns=[self._pool_dict()], **self._full_kwargs()
        )
        assert snapshot.pool_breakdowns is not None
        assert snapshot.pool_breakdowns[0]["pool_name"] == "cam"

    def test_create_defaults_pool_breakdowns_to_none(self) -> None:
        """Create DTO defaults to None when no per-pool split is supplied."""
        create = ReconciliationSnapshotCreate(
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
        )
        assert create.pool_breakdowns is None

    def test_create_json_dump_serializes_pool_decimals_then_reads_back(self) -> None:
        """model_dump(mode='json') turns Decimals into JSON-safe strings, and a
        snapshot reconstructed from that JSONB payload preserves the split."""
        create = ReconciliationSnapshotCreate(
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            pool_breakdowns=[self._pool_dict()],
        )

        payload = create.model_dump(mode="json")
        # JSONB-safe: nested Decimals are serialized to strings.
        assert payload["pool_breakdowns"][0]["recoverable_amount"] == "1000.00"

        # Simulate a DB row read back through the full model (select *).
        row = {**payload, "id": str(uuid4())}
        now = datetime.now()
        row["created_at"] = now
        row["updated_at"] = now
        snapshot = ReconciliationSnapshot(**row)
        assert snapshot.pool_breakdowns is not None
        assert snapshot.pool_breakdowns[0]["cap_adjustment"] == "-3000.00"


class TestReconciliationSnapshotCreate:
    """Tests for ReconciliationSnapshotCreate model."""

    def test_create_with_required_fields(self) -> None:
        """Create with all required fields."""
        create = ReconciliationSnapshotCreate(
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
        )
        assert create.status == ReconciliationStatus.DRAFT
        assert create.calculation_trace == []

    def test_create_requires_property_id(self) -> None:
        """property_id is required."""
        with pytest.raises(ValidationError):
            ReconciliationSnapshotCreate(
                lease_id=uuid4(),
                period_start_date=date(2024, 1, 1),
                period_end_date=date(2024, 12, 31),
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("15000.00"),
                tenant_share_after_cap=Decimal("12000.00"),
                admin_fee=Decimal("1800.00"),
                total_recovery=Decimal("13800.00"),
            )

    def test_create_requires_lease_id(self) -> None:
        """lease_id is required."""
        with pytest.raises(ValidationError):
            ReconciliationSnapshotCreate(
                property_id=uuid4(),
                period_start_date=date(2024, 1, 1),
                period_end_date=date(2024, 12, 31),
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("15000.00"),
                tenant_share_after_cap=Decimal("12000.00"),
                admin_fee=Decimal("1800.00"),
                total_recovery=Decimal("13800.00"),
            )

    def test_create_validates_period_dates(self) -> None:
        """period_end_date must be after period_start_date."""
        with pytest.raises(ValidationError) as exc_info:
            ReconciliationSnapshotCreate(
                property_id=uuid4(),
                lease_id=uuid4(),
                period_start_date=date(2024, 12, 31),
                period_end_date=date(2024, 1, 1),  # Before start
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("15000.00"),
                tenant_share_after_cap=Decimal("12000.00"),
                admin_fee=Decimal("1800.00"),
                total_recovery=Decimal("13800.00"),
            )
        assert "period_end_date must be after period_start_date" in str(exc_info.value)

    def test_create_rejects_same_dates(self) -> None:
        """period_end_date cannot equal period_start_date."""
        with pytest.raises(ValidationError):
            ReconciliationSnapshotCreate(
                property_id=uuid4(),
                lease_id=uuid4(),
                period_start_date=date(2024, 1, 1),
                period_end_date=date(2024, 1, 1),  # Same date
                total_operating_expenses=Decimal("100000.00"),
                grossed_up_expenses=Decimal("105000.00"),
                base_year_amount=Decimal("90000.00"),
                tenant_share_before_cap=Decimal("15000.00"),
                tenant_share_after_cap=Decimal("12000.00"),
                admin_fee=Decimal("1800.00"),
                total_recovery=Decimal("13800.00"),
            )

    def test_create_with_calculation_trace(self) -> None:
        """Create with calculation trace."""
        trace = [
            {"step": "gross_up", "input": "100000", "output": "105000"},
            {"step": "base_year", "input": "90000", "output": "15000"},
        ]
        create = ReconciliationSnapshotCreate(
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            calculation_trace=trace,
        )
        assert len(create.calculation_trace) == 2


class TestReconciliationSnapshotUpdate:
    """Tests for ReconciliationSnapshotUpdate model."""

    def test_update_all_fields_optional(self) -> None:
        """All fields are optional."""
        update = ReconciliationSnapshotUpdate()
        assert update.status is None
        assert update.total_operating_expenses is None

    def test_update_status_only(self) -> None:
        """Update only status."""
        update = ReconciliationSnapshotUpdate(status=ReconciliationStatus.FINALIZED)
        assert update.status == ReconciliationStatus.FINALIZED
        assert update.total_recovery is None

    def test_update_financial_values(self) -> None:
        """Update financial values."""
        update = ReconciliationSnapshotUpdate(
            total_operating_expenses=Decimal("110000.00"),
            total_recovery=Decimal("15000.00"),
        )
        assert update.total_operating_expenses == Decimal("110000.00")
        assert update.total_recovery == Decimal("15000.00")

    def test_update_calculation_trace(self) -> None:
        """Update calculation trace."""
        update = ReconciliationSnapshotUpdate(
            calculation_trace=[{"step": "recalculated", "value": "new"}]
        )
        assert len(update.calculation_trace) == 1


class TestReconciliationSnapshotFinalize:
    """Tests for ReconciliationSnapshotFinalize model."""

    def test_finalize_requires_user_id(self) -> None:
        """finalized_by_user_id is required."""
        with pytest.raises(ValidationError):
            ReconciliationSnapshotFinalize()

    def test_finalize_with_user_id(self) -> None:
        """Create finalize DTO with user ID."""
        user_id = uuid4()
        finalize = ReconciliationSnapshotFinalize(finalized_by_user_id=user_id)
        assert finalize.finalized_by_user_id == user_id


class TestReconciliationSnapshotSummary:
    """Tests for ReconciliationSnapshotSummary model."""

    def test_summary_with_all_fields(self) -> None:
        """Create summary with all fields."""
        now = datetime.now()
        summary = ReconciliationSnapshotSummary(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.FINALIZED,
            total_recovery=Decimal("13800.00"),
            is_finalized=True,
            finalized_at=now,
            property_name="Main Street Building",
            tenant_name="Acme Corp",
        )
        assert summary.property_name == "Main Street Building"
        assert summary.tenant_name == "Acme Corp"

    def test_summary_without_optional_fields(self) -> None:
        """Create summary without optional fields."""
        summary = ReconciliationSnapshotSummary(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_recovery=Decimal("13800.00"),
        )
        assert summary.property_name is None
        assert summary.tenant_name is None
        assert summary.is_finalized is False


class TestCanModifySnapshot:
    """Tests for the can_modify_snapshot helper function."""

    def test_can_modify_draft_snapshot(self) -> None:
        """Draft snapshots can be modified."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            created_at=now,
            updated_at=now,
        )
        assert can_modify_snapshot(snapshot) is True

    def test_cannot_modify_finalized_snapshot(self) -> None:
        """Finalized snapshots cannot be modified."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.FINALIZED,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            finalized_at=now,
            finalized_by_user_id=uuid4(),
            created_at=now,
            updated_at=now,
        )
        assert can_modify_snapshot(snapshot) is False


class TestFormatRecoveryAmount:
    """Tests for the format_recovery_amount helper function."""

    def test_format_positive_amount(self) -> None:
        """Format positive recovery amount."""
        assert format_recovery_amount(Decimal("13800.00")) == "$13,800.00"

    def test_format_large_amount(self) -> None:
        """Format large recovery amount with thousands separator."""
        assert format_recovery_amount(Decimal("1234567.89")) == "$1,234,567.89"

    def test_format_zero(self) -> None:
        """Format zero amount."""
        assert format_recovery_amount(Decimal("0")) == "$0.00"

    def test_format_negative_amount(self) -> None:
        """Format negative amount (credit) with the minus leading the symbol."""
        assert format_recovery_amount(Decimal("-500.00")) == "-$500.00"

    def test_format_small_amount(self) -> None:
        """Format small amount."""
        assert format_recovery_amount(Decimal("0.50")) == "$0.50"


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self) -> None:
        """Model can be serialized to dict."""
        now = datetime.now()
        snapshot_id = uuid4()
        property_id = uuid4()
        lease_id = uuid4()

        snapshot = ReconciliationSnapshot(
            id=snapshot_id,
            property_id=property_id,
            lease_id=lease_id,
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            created_at=now,
            updated_at=now,
        )

        data = snapshot.model_dump()
        assert data["id"] == snapshot_id
        assert data["property_id"] == property_id
        assert data["lease_id"] == lease_id
        assert data["status"] == ReconciliationStatus.DRAFT
        assert data["is_finalized"] is False

    def test_to_json(self) -> None:
        """Model can be serialized to JSON."""
        now = datetime.now()
        snapshot = ReconciliationSnapshot(
            id=uuid4(),
            property_id=uuid4(),
            lease_id=uuid4(),
            period_start_date=date(2024, 1, 1),
            period_end_date=date(2024, 12, 31),
            status=ReconciliationStatus.DRAFT,
            total_operating_expenses=Decimal("100000.00"),
            grossed_up_expenses=Decimal("105000.00"),
            base_year_amount=Decimal("90000.00"),
            tenant_share_before_cap=Decimal("15000.00"),
            tenant_share_after_cap=Decimal("12000.00"),
            admin_fee=Decimal("1800.00"),
            total_recovery=Decimal("13800.00"),
            created_at=now,
            updated_at=now,
        )

        json_str = snapshot.model_dump_json()
        parsed = json.loads(json_str)
        assert parsed["status"] == "draft"
        assert "total_recovery" in parsed

    def test_from_attributes(self) -> None:
        """Model can be created from ORM-like object."""
        now = datetime.now()

        class MockORM:
            id = uuid4()
            property_id = uuid4()
            lease_id = uuid4()
            period_start_date = date(2024, 1, 1)
            period_end_date = date(2024, 12, 31)
            status = ReconciliationStatus.DRAFT
            total_operating_expenses = Decimal("100000.00")
            grossed_up_expenses = Decimal("105000.00")
            base_year_amount = Decimal("90000.00")
            tenant_share_before_cap = Decimal("15000.00")
            tenant_share_after_cap = Decimal("12000.00")
            admin_fee = Decimal("1800.00")
            total_recovery = Decimal("13800.00")
            calculation_trace = []
            finalized_at = None
            finalized_by_user_id = None
            created_at = now
            updated_at = now

        snapshot = ReconciliationSnapshot.model_validate(MockORM())
        assert snapshot.total_recovery == Decimal("13800.00")


class TestReconciliationCellUpdate:
    """Tests for ReconciliationCellUpdate validation."""

    def test_positive_value_accepted(self) -> None:
        """Positive values are accepted."""
        update = ReconciliationCellUpdate(value=Decimal("100.00"))
        assert update.value == Decimal("100.00")

    def test_zero_value_accepted(self) -> None:
        """Zero value is accepted."""
        update = ReconciliationCellUpdate(value=Decimal("0"))
        assert update.value == Decimal("0")

    def test_negative_value_rejected(self) -> None:
        """Negative values are rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ReconciliationCellUpdate(value=Decimal("-100.00"))
        assert "non-negative" in str(exc_info.value)


class TestCellIdFunctions:
    """Tests for cell ID encoding/decoding functions."""

    def test_encode_valid_field(self) -> None:
        """Encoding with valid field works."""
        snapshot_id = uuid4()
        encoded = encode_cell_id(snapshot_id, "total_operating_expenses")
        assert isinstance(encoded, str)
        assert len(encoded) > 0

    def test_encode_invalid_field_raises_error(self) -> None:
        """Encoding with invalid field raises ValueError."""
        snapshot_id = uuid4()
        with pytest.raises(ValueError) as exc_info:
            encode_cell_id(snapshot_id, "invalid_field")
        assert "not editable" in str(exc_info.value)

    def test_decode_valid_cell_id(self) -> None:
        """Decoding valid cell_id works."""
        snapshot_id = uuid4()
        encoded = encode_cell_id(snapshot_id, "admin_fee")
        decoded_id, decoded_field = decode_cell_id(encoded)
        assert decoded_id == snapshot_id
        assert decoded_field == "admin_fee"

    def test_decode_invalid_base64_raises_error(self) -> None:
        """Decoding invalid base64 raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            decode_cell_id("not-valid-base64!!!")
        assert "Invalid cell_id encoding" in str(exc_info.value)

    def test_decode_missing_colon_raises_error(self) -> None:
        """Decoding cell_id without colon separator raises ValueError."""
        import base64

        # Encode a string without colon
        invalid = base64.urlsafe_b64encode(b"no-colon-here").decode()
        with pytest.raises(ValueError) as exc_info:
            decode_cell_id(invalid)
        assert "snapshot_id:field_name" in str(exc_info.value)

    def test_decode_invalid_uuid_raises_error(self) -> None:
        """Decoding cell_id with invalid UUID raises ValueError."""
        import base64

        # Encode "not-a-uuid:total_recovery"
        invalid = base64.urlsafe_b64encode(b"not-a-uuid:total_recovery").decode()
        with pytest.raises(ValueError) as exc_info:
            decode_cell_id(invalid)
        assert "Invalid snapshot_id" in str(exc_info.value)

    def test_decode_invalid_field_raises_error(self) -> None:
        """Decoding cell_id with invalid field name raises ValueError."""
        import base64

        snapshot_id = uuid4()
        # Encode with invalid field name
        invalid = base64.urlsafe_b64encode(
            f"{snapshot_id}:invalid_field".encode()
        ).decode()
        with pytest.raises(ValueError) as exc_info:
            decode_cell_id(invalid)
        assert "not editable" in str(exc_info.value)


class TestImports:
    """Tests for module imports."""

    def test_import_from_models(self) -> None:
        """All exports are available from models package."""
        from app.models import (
            ReconciliationSnapshot,
            ReconciliationSnapshotCreate,
            ReconciliationSnapshotFinalize,
            ReconciliationSnapshotSummary,
            ReconciliationSnapshotUpdate,
            can_modify_snapshot,
            format_recovery_amount,
        )

        assert ReconciliationSnapshot is not None
        assert ReconciliationSnapshotCreate is not None
        assert ReconciliationSnapshotUpdate is not None
        assert ReconciliationSnapshotFinalize is not None
        assert ReconciliationSnapshotSummary is not None
        assert can_modify_snapshot is not None
        assert format_recovery_amount is not None
