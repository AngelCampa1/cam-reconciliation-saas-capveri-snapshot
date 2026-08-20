from datetime import date
from uuid import uuid4

from app.services.calculation.models import CalculationTrace
from app.services.calculation.trace_persistence import compute_trace_checksum


def test_compute_trace_checksum_returns_64_char_hex():
    trace = CalculationTrace(
        calculation_type="tenant_share",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
        engine_version="abc123",
    )
    checksum = compute_trace_checksum(trace)
    assert len(checksum) == 64
    assert all(c in "0123456789abcdef" for c in checksum)


def test_compute_trace_checksum_is_deterministic():
    trace = CalculationTrace(
        calculation_type="gross_up",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    assert compute_trace_checksum(trace) == compute_trace_checksum(trace)


def test_compute_trace_checksum_changes_when_trace_changes():
    pid = uuid4()
    trace1 = CalculationTrace(
        calculation_type="gross_up",
        property_id=pid,
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    trace2 = CalculationTrace(
        calculation_type="occupancy",
        property_id=pid,
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    assert compute_trace_checksum(trace1) != compute_trace_checksum(trace2)
