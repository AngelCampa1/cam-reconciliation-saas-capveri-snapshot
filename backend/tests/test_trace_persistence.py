"""Tests for calculation trace persistence."""

from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.services.calculation.models import CalculationTrace
from app.services.calculation.trace_persistence import (
    get_trace_from_snapshot,
    save_trace_to_snapshot,
    trace_to_readable_format,
)


class TestSaveTraceToSnapshot:
    """Tests for saving traces to reconciliation snapshots."""

    @pytest.mark.asyncio
    async def test_save_trace_with_multiple_steps(self):
        """AC5: Trace stored in calculation_trace JSONB column."""
        snapshot_id = uuid4()
        property_id = uuid4()

        # Create trace with steps
        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Calculate occupancy",
            inputs={"lease_count": 10},
            operation="weighted average",
            output=Decimal("0.85"),
        )
        trace.add_step(
            name="Gross-up factor",
            inputs={"occupancy": Decimal("0.85"), "target": Decimal("0.95")},
            operation="0.95 / 0.85",
            output=Decimal("1.117647"),
        )

        # Mock the database client
        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_update = MagicMock()
            mock_eq = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.update.return_value = mock_update
            mock_update.eq.return_value = mock_eq
            mock_eq.execute = MagicMock()

            mock_get_client.return_value = mock_client

            # Save trace
            await save_trace_to_snapshot(snapshot_id, trace)

            # Verify database was called with correct data
            mock_client.table.assert_called_once_with("reconciliation_snapshots")

            # Get the trace_json that was passed to update
            call_args = mock_table.update.call_args
            trace_json = call_args[0][0]["calculation_trace"]

            assert len(trace_json) == 2
            assert trace_json[0]["step_name"] == "Calculate occupancy"
            assert trace_json[1]["step_name"] == "Gross-up factor"

    @pytest.mark.asyncio
    async def test_save_trace_with_notes(self):
        """AC3: Notes explain business context."""
        snapshot_id = uuid4()
        property_id = uuid4()

        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Apply cap",
            inputs={"amount": Decimal("15000"), "cap": Decimal("14000")},
            operation="min(amount, cap)",
            output=Decimal("14000"),
            note="5% cumulative cap applied - saved tenant $1000",
        )

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_update = MagicMock()
            mock_eq = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.update.return_value = mock_update
            mock_update.eq.return_value = mock_eq
            mock_eq.execute = MagicMock()

            mock_get_client.return_value = mock_client

            await save_trace_to_snapshot(snapshot_id, trace)

            call_args = mock_table.update.call_args
            trace_json = call_args[0][0]["calculation_trace"]

            assert (
                trace_json[0]["note"]
                == "5% cumulative cap applied - saved tenant $1000"
            )

    @pytest.mark.asyncio
    async def test_save_empty_trace(self):
        """Edge case: Save trace with no steps."""
        snapshot_id = uuid4()
        property_id = uuid4()

        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_update = MagicMock()
            mock_eq = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.update.return_value = mock_update
            mock_update.eq.return_value = mock_eq
            mock_eq.execute = MagicMock()

            mock_get_client.return_value = mock_client

            await save_trace_to_snapshot(snapshot_id, trace)

            call_args = mock_table.update.call_args
            trace_json = call_args[0][0]["calculation_trace"]

            assert trace_json == []


class TestGetTraceFromSnapshot:
    """Tests for retrieving traces from snapshots."""

    @pytest.mark.asyncio
    async def test_get_trace_returns_hydrated_object(self):
        """AC8: Trace retrieval returns fully hydrated CalculationTrace object."""
        snapshot_id = uuid4()
        property_id = uuid4()

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": [
                {
                    "step_order": 1,
                    "step_name": "Occupancy",
                    "input_values": {"lease_count": "5"},
                    "operation": "weighted avg",
                    "output_value": "0.75",
                    "note": None,
                },
                {
                    "step_order": 2,
                    "step_name": "Gross-up",
                    "input_values": {"occupancy": "0.75"},
                    "operation": "0.95 / 0.75",
                    "output_value": "1.2666",
                    "note": "Target 95%",
                },
            ],
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            trace = await get_trace_from_snapshot(snapshot_id)

            assert trace is not None
            assert isinstance(trace, CalculationTrace)
            assert trace.calculation_type == "reconciliation"
            assert trace.property_id == property_id
            assert len(trace.steps) == 2
            assert trace.steps[0].step_name == "Occupancy"
            assert trace.steps[1].step_name == "Gross-up"
            assert trace.steps[1].note == "Target 95%"

    @pytest.mark.asyncio
    async def test_get_trace_nonexistent_snapshot(self):
        """Return None if snapshot doesn't exist."""
        snapshot_id = uuid4()

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=None))

            mock_get_client.return_value = mock_client

            trace = await get_trace_from_snapshot(snapshot_id)

            assert trace is None

    @pytest.mark.asyncio
    async def test_get_trace_with_empty_steps(self):
        """Handle snapshot with no trace steps."""
        snapshot_id = uuid4()
        property_id = uuid4()

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": [],
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            trace = await get_trace_from_snapshot(snapshot_id)

            assert trace is not None
            assert len(trace.steps) == 0

    @pytest.mark.asyncio
    async def test_get_trace_preserves_step_order(self):
        """AC2: Steps are numbered sequentially."""
        snapshot_id = uuid4()
        property_id = uuid4()

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": [
                {
                    "step_order": 1,
                    "step_name": "First",
                    "input_values": {},
                    "operation": "op1",
                    "output_value": "100",
                    "note": None,
                },
                {
                    "step_order": 2,
                    "step_name": "Second",
                    "input_values": {},
                    "operation": "op2",
                    "output_value": "200",
                    "note": None,
                },
                {
                    "step_order": 3,
                    "step_name": "Third",
                    "input_values": {},
                    "operation": "op3",
                    "output_value": "300",
                    "note": None,
                },
            ],
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            trace = await get_trace_from_snapshot(snapshot_id)

            assert trace.steps[0].step_order == 1
            assert trace.steps[1].step_order == 2
            assert trace.steps[2].step_order == 3


class TestTraceToReadableFormat:
    """Tests for human-readable trace export."""

    def test_readable_format_with_full_trace(self):
        """AC7: Human-readable export format available."""
        trace = CalculationTrace(
            calculation_type="tenant_share",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Exclude pools",
            inputs={"total": Decimal("100000"), "excluded": ["CapEx"]},
            operation="total - excluded",
            output=Decimal("90000"),
            note="CapEx not recoverable per lease",
        )
        trace.add_step(
            name="Pro-rata share",
            inputs={"amount": Decimal("90000"), "share": Decimal("0.15")},
            operation="90000 * 0.15",
            output=Decimal("13500"),
        )

        result = trace_to_readable_format(trace)

        assert "Calculation Trace: tenant_share" in result
        assert "Period: 2024-01-01 to 2024-12-31" in result
        assert "1. Exclude pools" in result
        assert "Operation: total - excluded" in result
        assert "Result: 90000" in result
        assert "Note: CapEx not recoverable per lease" in result
        assert "2. Pro-rata share" in result

    def test_readable_format_without_notes(self):
        """Verify notes are optional in readable format."""
        trace = CalculationTrace(
            calculation_type="occupancy",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Calculate average",
            inputs={"values": [0.8, 0.9, 0.85]},
            operation="sum / count",
            output=Decimal("0.85"),
        )

        result = trace_to_readable_format(trace)

        lines = result.split("\n")
        # Should not have a "Note:" line for step without note
        note_lines = [line for line in lines if "Note:" in line]
        assert len(note_lines) == 0

    def test_readable_format_empty_trace(self):
        """Handle trace with no steps."""
        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        result = trace_to_readable_format(trace)

        assert "Calculation Trace: reconciliation" in result
        assert "Period: 2024-01-01 to 2024-12-31" in result
        # Should have header and separator only
        lines = [line for line in result.split("\n") if line.strip()]
        assert len(lines) >= 2  # At least header and separator

    def test_readable_format_step_numbering(self):
        """AC2: Verify sequential step numbering in output."""
        trace = CalculationTrace(
            calculation_type="caps",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        for i in range(5):
            trace.add_step(f"Step {i+1}", {}, "operation", Decimal(str(i)))

        result = trace_to_readable_format(trace)

        assert "1. Step 1" in result
        assert "2. Step 2" in result
        assert "3. Step 3" in result
        assert "4. Step 4" in result
        assert "5. Step 5" in result


class TestTraceJsonSerialization:
    """Tests for JSON serialization of traces."""

    def test_trace_is_json_serializable(self):
        """AC4: Trace is JSON-serializable."""
        import json

        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Test step",
            inputs={"value": Decimal("123.45")},
            operation="test",
            output=Decimal("678.90"),
        )

        # Convert to dict (what we'll save to database)
        trace_dict = [step.model_dump() for step in trace.steps]

        # Verify it can be JSON serialized
        json_str = json.dumps(trace_dict)
        assert json_str is not None

        # Verify it can be deserialized
        deserialized = json.loads(json_str)
        assert len(deserialized) == 1
        assert deserialized[0]["step_name"] == "Test step"

    def test_trace_step_has_all_required_fields(self):
        """AC1: Every step has input, operation, output."""
        trace = CalculationTrace(
            calculation_type="test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step(
            name="Sample",
            inputs={"a": 1, "b": 2},
            operation="a + b",
            output=Decimal("3"),
        )

        step_dict = trace.steps[0].model_dump()

        assert "input_values" in step_dict
        assert "operation" in step_dict
        assert "output_value" in step_dict
        # Note: JSON serialization converts ints to strings in some cases
        # Just verify the keys exist and values are present
        assert "a" in step_dict["input_values"]
        assert "b" in step_dict["input_values"]
        assert step_dict["operation"] == "a + b"
        assert step_dict["output_value"] == "3"


class TestTracePersistenceEdgeCases:
    """Edge case tests to improve trace_persistence coverage (60% -> 95%)."""

    @pytest.mark.asyncio
    async def test_save_trace_with_database_failure(self):
        """Should raise appropriate exception on database save failure."""
        snapshot_id = uuid4()
        property_id = uuid4()

        trace = CalculationTrace(
            calculation_type="reconciliation",
            property_id=property_id,
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        trace.add_step("Test", {"x": 1}, "test op", Decimal("100"))

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_update = MagicMock()
            mock_eq = MagicMock()

            # Simulate database failure
            mock_eq.execute = MagicMock(
                side_effect=Exception("Database connection error")
            )

            mock_client.table.return_value = mock_table
            mock_table.update.return_value = mock_update
            mock_update.eq.return_value = mock_eq

            mock_get_client.return_value = mock_client

            # Should propagate the exception
            with pytest.raises(Exception, match="Database connection error"):
                await save_trace_to_snapshot(snapshot_id, trace)

    @pytest.mark.asyncio
    async def test_get_trace_with_database_failure(self):
        """Should raise appropriate exception on database read failure."""
        snapshot_id = uuid4()

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            # Simulate database failure
            mock_single.execute = MagicMock(side_effect=Exception("Connection timeout"))

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single

            mock_get_client.return_value = mock_client

            # Should propagate the exception
            with pytest.raises(Exception, match="Connection timeout"):
                await get_trace_from_snapshot(snapshot_id)

    @pytest.mark.asyncio
    async def test_get_trace_with_null_calculation_trace(self):
        """Handle snapshot where calculation_trace is NULL (None).

        When calculation_trace is None, the if calc_trace check is False,
        so the loop body is skipped and we get an empty trace.
        """
        snapshot_id = uuid4()
        property_id = uuid4()

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": None,  # NULL in database (key exists, value is None)
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            # None is falsy so if calc_trace is False, no iteration happens
            trace = await get_trace_from_snapshot(snapshot_id)

            assert trace is not None
            assert len(trace.steps) == 0

    @pytest.mark.asyncio
    async def test_get_trace_with_missing_calculation_trace_key(self):
        """Should handle snapshot where calculation_trace key is missing."""
        snapshot_id = uuid4()
        property_id = uuid4()

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            # calculation_trace key missing entirely
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            trace = await get_trace_from_snapshot(snapshot_id)

            # Should return trace with empty steps (get() returns [] as default)
            assert trace is not None
            assert len(trace.steps) == 0

    @pytest.mark.asyncio
    async def test_retrieve_large_trace_performance(self):
        """Large trace (100 steps) should load within reasonable time."""
        import time

        snapshot_id = uuid4()
        property_id = uuid4()

        # Create mock data with 100 steps
        large_trace_data = []
        for i in range(100):
            large_trace_data.append(
                {
                    "step_order": i + 1,
                    "step_name": f"Step {i+1}",
                    "input_values": {"value": str(i)},
                    "operation": f"operation_{i}",
                    "output_value": str(i * 10),
                    "note": f"Note {i}" if i % 5 == 0 else None,
                }
            )

        mock_data = {
            "property_id": str(property_id),
            "period_start_date": "2024-01-01",
            "period_end_date": "2024-12-31",
            "calculation_trace": large_trace_data,
        }

        with patch(
            "app.services.calculation.trace_persistence.get_supabase_admin"
        ) as mock_get_client:
            mock_client = MagicMock()
            mock_table = MagicMock()
            mock_select = MagicMock()
            mock_eq = MagicMock()
            mock_single = MagicMock()

            mock_client.table.return_value = mock_table
            mock_table.select.return_value = mock_select
            mock_select.eq.return_value = mock_eq
            mock_eq.single.return_value = mock_single
            mock_single.execute = MagicMock(return_value=MagicMock(data=mock_data))

            mock_get_client.return_value = mock_client

            start_time = time.time()
            trace = await get_trace_from_snapshot(snapshot_id)
            elapsed_time = time.time() - start_time

            # Should load in under 2 seconds (as per plan)
            assert elapsed_time < 2.0, f"Took {elapsed_time:.2f}s (expected < 2s)"

            # Verify all steps loaded
            assert len(trace.steps) == 100
            assert trace.steps[0].step_name == "Step 1"
            assert trace.steps[99].step_name == "Step 100"

    def test_readable_format_large_trace(self):
        """Large trace (50 steps) should format without errors."""
        trace = CalculationTrace(
            calculation_type="large_reconciliation",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        # Add 50 steps
        for i in range(50):
            trace.add_step(
                name=f"Step {i+1}",
                inputs={"index": i},
                operation=f"operation_{i}",
                output=Decimal(str(i * 100)),
            )

        result = trace_to_readable_format(trace)

        # Verify formatting completed
        assert "Calculation Trace: large_reconciliation" in result
        assert "1. Step 1" in result
        assert "50. Step 50" in result

        # Verify all steps are present
        lines = result.split("\n")
        step_lines = [
            line for line in lines if line.strip().startswith(tuple("0123456789"))
        ]
        assert len(step_lines) == 50

    def test_readable_format_with_very_long_values(self):
        """Should handle trace with very long string values."""
        trace = CalculationTrace(
            calculation_type="test",
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )

        # Create step with long input values
        long_operation = "A" * 500  # 500 character operation string
        long_note = "B" * 1000  # 1000 character note

        trace.add_step(
            name="Long value test",
            inputs={"long_value": "X" * 200},
            operation=long_operation,
            output=Decimal("123"),
            note=long_note,
        )

        result = trace_to_readable_format(trace)

        # Should not raise exception
        assert result is not None
        assert "Long value test" in result
        assert long_operation in result
        assert long_note in result
