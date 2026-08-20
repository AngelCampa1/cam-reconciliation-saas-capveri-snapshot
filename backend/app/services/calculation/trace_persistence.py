"""Persistence for calculation traces.

This module provides functions to save and retrieve calculation traces
from reconciliation snapshots stored in the database.
"""

import hashlib
import json
from typing import Any, cast
from uuid import UUID

from app.database.client import get_supabase_admin
from app.services.calculation.models import CalculationStep, CalculationTrace


def compute_trace_checksum(trace: CalculationTrace) -> str:
    """Compute a SHA-256 checksum of the calculation trace.

    Uses sorted-key JSON serialization for determinism. The checksum is stored
    alongside the trace in reconciliation_snapshots to prove immutability.
    """
    trace_dict = trace.model_dump(mode="json")
    serialized = json.dumps(trace_dict, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


async def save_trace_to_snapshot(
    snapshot_id: UUID,
    trace: CalculationTrace,
) -> None:
    """Save calculation trace to a reconciliation snapshot.

    Args:
        snapshot_id: ID of the reconciliation snapshot
        trace: Complete calculation trace

    Example:
        >>> trace = CalculationTrace(...)
        >>> trace.add_step("Occupancy", {...}, "weighted avg", Decimal("0.85"))
        >>> await save_trace_to_snapshot(snapshot_id, trace)
    """
    client = get_supabase_admin()

    # Convert trace to JSON - serialize steps using Pydantic's model_dump
    trace_json = [step.model_dump() for step in trace.steps]

    client.table("reconciliation_snapshots").update(
        {
            "calculation_trace": trace_json,
            "engine_version": trace.engine_version or None,
            "trace_checksum": compute_trace_checksum(trace),
        }
    ).eq("id", str(snapshot_id)).execute()


async def get_trace_from_snapshot(
    snapshot_id: UUID,
) -> CalculationTrace | None:
    """Retrieve calculation trace from a snapshot.

    Args:
        snapshot_id: ID of the reconciliation snapshot

    Returns:
        CalculationTrace or None if not found

    Example:
        >>> trace = await get_trace_from_snapshot(snapshot_id)
        >>> if trace:
        ...     print(f"Found {len(trace.steps)} steps")
    """
    client = get_supabase_admin()

    result = (
        client.table("reconciliation_snapshots")
        .select("calculation_trace, property_id, period_start_date, period_end_date")
        .eq("id", str(snapshot_id))
        .single()
        .execute()
    )

    if not result.data:
        return None

    # Cast to expected dict type
    data = cast(dict[str, Any], result.data)

    # Reconstruct CalculationTrace from database data
    trace = CalculationTrace(
        calculation_type="reconciliation",
        property_id=UUID(str(data["property_id"])),
        period_start=data["period_start_date"],
        period_end=data["period_end_date"],
    )

    # Rebuild steps from JSON
    calc_trace = data.get("calculation_trace", [])
    if calc_trace:
        for step_data in calc_trace:
            trace.steps.append(CalculationStep(**step_data))

    return trace


def trace_to_readable_format(trace: CalculationTrace) -> str:
    """Convert trace to human-readable format for export.

    Args:
        trace: Calculation trace to format

    Returns:
        Human-readable string representation

    Example:
        >>> readable = trace_to_readable_format(trace)
        >>> print(readable)
        Calculation Trace: reconciliation
        Period: 2024-01-01 to 2024-12-31
        ------------------------------------------------------------
        1. Calculate occupancy
           Inputs: {'lease_count': 10}
           Operation: weighted average
           Result: 0.85
    """
    lines = [
        f"Calculation Trace: {trace.calculation_type}",
        f"Period: {trace.period_start} to {trace.period_end}",
        "-" * 60,
    ]

    for step in trace.steps:
        lines.append(f"\n{step.step_order}. {step.step_name}")
        lines.append(f"   Inputs: {step.input_values}")
        lines.append(f"   Operation: {step.operation}")
        lines.append(f"   Result: {step.output_value}")
        if step.note:
            lines.append(f"   Note: {step.note}")

    return "\n".join(lines)
