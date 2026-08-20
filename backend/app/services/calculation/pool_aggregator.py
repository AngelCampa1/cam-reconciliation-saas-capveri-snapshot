"""
Expense pool aggregation from GL entries.

This module aggregates GL entries into expense pools based on
account code pattern matching. Supports:
- Wildcard patterns (* and ?)
- Allocation percentages for split accounts
- Priority-based matching
- Complete audit trail
"""

import re
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.calculation.models import (
    UNIT_COUNT,
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationTrace,
)


class GLEntry(BaseModel):
    """Minimal GL entry for aggregation."""

    id: UUID = Field(description="Unique entry ID")
    account_code: str = Field(description="GL account code")
    amount: Decimal = Field(description="Entry amount (can be negative)")


class PoolMapping(BaseModel):
    """Pool mapping configuration."""

    pool_id: UUID = Field(description="Expense pool ID")
    pool_name: str = Field(description="Expense pool name")
    pattern: str = Field(description="Account code pattern (* and ? wildcards)")
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        description="Percentage of amount to allocate (1.0 = 100%)",
    )
    priority: int = Field(default=0, description="Priority (higher = matched first)")


class PoolTotal(BaseModel):
    """Total for a single pool."""

    pool_id: UUID = Field(description="Expense pool ID")
    pool_name: str = Field(description="Expense pool name")
    total_amount: Decimal = Field(description="Total amount for this pool")
    entry_count: int = Field(description="Number of entries matched")
    matched_accounts: list[str] = Field(description="Unique account codes matched")


class SplitAllocation(BaseModel):
    """Split allocation configuration for an account pattern."""

    account_pattern: str = Field(description="Account code pattern to split")
    splits: list[tuple[UUID, Decimal]] = Field(
        description="List of (pool_id, percentage) tuples"
    )
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        description="Portion of matching entry amount this split controls",
    )
    priority: int = Field(default=0, description="Priority (higher = matched first)")
    default_pool_id: UUID | None = Field(
        default=None,
        description="Pool ID for remainder if splits < 100%",
    )


def pattern_to_regex(pattern: str) -> str:
    """
    Convert wildcard pattern to regex.

    Wildcards:
        * - matches any characters (zero or more)
        ? - matches single character

    Args:
        pattern: Wildcard pattern (e.g., "5*", "51??")

    Returns:
        Regex pattern string

    Example:
        >>> pattern_to_regex("5*")
        '^5.*$'
        >>> pattern_to_regex("51?0")
        '^51.0$'
    """
    # FIX FC-8: Handle patterns with backslashes correctly
    # Process character by character to avoid issues with re.escape + wildcard replacement
    result = []
    for char in pattern:
        if char in {"*", "%"}:
            result.append(".*")  # Wildcard: any characters
        elif char == "?":
            result.append(".")  # Wildcard: single character
        else:
            # Escape any regex special characters in literal characters
            result.append(re.escape(char))

    # Anchor to match full string
    return f"^{''.join(result)}$"


def build_split_allocations_from_pool_allocations(
    mappings: list[PoolMapping],
    allocation_rows: list[dict[str, object]],
    valid_pool_ids: set[UUID] | None = None,
) -> list[SplitAllocation]:
    """Build account-pattern split allocations from persisted pool allocation rows.

    Persisted rows split a source pool into target pools. The aggregator works at the
    account-pattern level, so each mapping on a source pool becomes a split pattern
    using the source pool's configured target percentages.
    """
    allocations_by_source: dict[UUID, list[tuple[UUID, Decimal]]] = {}
    for row in allocation_rows:
        if row.get("allocation_type") != "percentage":
            continue

        source_pool_id = UUID(str(row["source_pool_id"]))
        target_pool_id = UUID(str(row["target_pool_id"]))
        if valid_pool_ids is not None and target_pool_id not in valid_pool_ids:
            continue

        percentage = Decimal(str(row["allocation_value"])) / Decimal("100")
        allocations_by_source.setdefault(source_pool_id, []).append(
            (target_pool_id, percentage)
        )

    splits: list[SplitAllocation] = []
    for mapping in mappings:
        target_splits = allocations_by_source.get(mapping.pool_id)
        if target_splits:
            splits.append(
                SplitAllocation(
                    account_pattern=mapping.pattern,
                    splits=target_splits,
                    allocation_percentage=mapping.allocation_percentage,
                    priority=mapping.priority,
                    default_pool_id=mapping.pool_id,
                )
            )

    return sorted(splits, key=lambda split: split.priority, reverse=True)


def aggregate_by_pools(
    entries: list[GLEntry],
    mappings: list[PoolMapping],
    trace: CalculationTrace | None = None,
) -> dict[UUID, PoolTotal]:
    """
    Aggregate GL entries by expense pool.

    For each entry, finds matching pool(s) based on account patterns.
    If multiple patterns match, uses highest priority first.
    Applies allocation percentage for split accounts.

    Args:
        entries: GL entries to aggregate
        mappings: Pool mapping configurations
        trace: Optional calculation trace

    Returns:
        Dictionary of pool ID to totals

    Example:
        >>> pool_id = UUID("...")
        >>> entries = [
        ...     GLEntry(id=UUID("..."), account_code="5100", amount=Decimal("500")),
        ...     GLEntry(id=UUID("..."), account_code="5200", amount=Decimal("300")),
        ... ]
        >>> mappings = [
        ...     PoolMapping(pool_id=pool_id, pool_name="Utilities", pattern="5*")
        ... ]
        >>> result = aggregate_by_pools(entries, mappings)
        >>> result[pool_id].total_amount
        Decimal('800.00')
    """
    # Compile patterns for performance
    compiled_mappings = [
        (mapping, re.compile(pattern_to_regex(mapping.pattern), re.IGNORECASE))
        for mapping in mappings
    ]

    # Sort by priority (higher first)
    compiled_mappings.sort(key=lambda x: x[0].priority, reverse=True)

    # Initialize pool totals
    pool_totals: dict[UUID, PoolTotal] = {}
    for mapping in mappings:
        if mapping.pool_id not in pool_totals:
            pool_totals[mapping.pool_id] = PoolTotal(
                pool_id=mapping.pool_id,
                pool_name=mapping.pool_name,
                total_amount=Decimal("0"),
                entry_count=0,
                matched_accounts=[],
            )

    # Aggregate entries
    unmatched_entries = []

    for entry in entries:
        matched = False
        # FIX NEW-FC-4: Track total allocation per entry to prevent over-allocation
        # Without this, split allocations <100% could allow multiple patterns
        # to match the same entry, potentially allocating >100% of its value.
        remaining_allocation = Decimal("1")

        for mapping, regex in compiled_mappings:
            # Skip if entry is fully allocated
            if remaining_allocation <= Decimal("0"):
                break

            if regex.match(entry.account_code):
                pool = pool_totals[mapping.pool_id]

                # FIX NEW-FC-4: Cap allocation to remaining percentage
                actual_allocation = min(
                    mapping.allocation_percentage, remaining_allocation
                )
                allocated_amount = entry.amount * actual_allocation
                remaining_allocation -= actual_allocation

                pool.total_amount += allocated_amount
                pool.entry_count += 1

                # Track unique account codes
                if entry.account_code not in pool.matched_accounts:
                    pool.matched_accounts.append(entry.account_code)

                matched = True

                # If fully allocated, don't check other patterns
                if remaining_allocation <= Decimal("0"):
                    break

        if not matched:
            unmatched_entries.append(entry)

    # Add trace steps
    if trace:
        for pool_id, pool in pool_totals.items():
            trace.add_step(
                name=f"Aggregate pool: {pool.pool_name}",
                inputs={
                    "entry_count": pool.entry_count,
                    "unique_accounts": len(pool.matched_accounts),
                },
                operation="Sum matching GL entries",
                output=pool.total_amount,
                input_units={"entry_count": UNIT_COUNT, "unique_accounts": UNIT_COUNT},
            )

        if unmatched_entries:
            unmatched_total = sum(e.amount for e in unmatched_entries)
            trace.add_step(
                name="Unmatched entries",
                inputs={"count": len(unmatched_entries)},
                operation="Entries not matching any pool",
                output=unmatched_total,
                note="Consider adding pool mappings for these accounts",
                input_units={"count": UNIT_COUNT},
            )

    return pool_totals


def validate_split_allocation(split: SplitAllocation) -> list[str]:
    """
    Validate split allocation configuration.

    Args:
        split: Split allocation to validate

    Returns:
        List of error messages (empty if valid)

    Example:
        >>> split = SplitAllocation(
        ...     account_pattern="5100",
        ...     splits=[(uuid4(), Decimal("0.70")), (uuid4(), Decimal("0.50"))],
        ... )
        >>> errors = validate_split_allocation(split)
        >>> len(errors) > 0
        True
    """
    errors = []

    # Check for duplicate pool IDs
    pool_ids = [pool_id for pool_id, _ in split.splits]
    if len(pool_ids) != len(set(pool_ids)):
        errors.append(
            f"Split allocation for '{split.account_pattern}' contains duplicate pool IDs"
        )

    # Check total percentages
    total_percentage = sum(percentage for _, percentage in split.splits)

    # FIX FC-3: Add tolerance for rounding discrepancies
    # Percentages like [0.333, 0.333, 0.334] may not sum to exactly 1.0
    tolerance = Decimal("0.0001")  # 0.01% tolerance

    if total_percentage > Decimal("1.0") + tolerance:
        errors.append(
            f"Split allocation for '{split.account_pattern}' percentages exceed 100% "
            f"(total: {total_percentage * 100}%)"
        )

    # Check if remainder exists but no default pool
    # FIX FC-3: Use tolerance for "less than 1.0" check as well
    if total_percentage < Decimal("1.0") - tolerance and split.default_pool_id is None:
        remainder = (Decimal("1.0") - total_percentage) * 100
        errors.append(
            f"Split allocation for '{split.account_pattern}' has {remainder}% remainder "
            f"but no default pool specified"
        )

    return errors


def aggregate_with_splits(
    entries: list[GLEntry],
    mappings: list[PoolMapping],
    splits: list[SplitAllocation],
    trace: CalculationTrace | None = None,
) -> dict[UUID, PoolTotal]:
    """
    Aggregate GL entries by pool with split allocation support.

    For entries matching a split pattern, allocates amounts across
    multiple pools based on configured percentages. Non-split entries
    use standard pool mappings.

    Args:
        entries: GL entries to aggregate
        mappings: Pool mapping configurations
        splits: Split allocation configurations
        trace: Optional calculation trace

    Returns:
        Dictionary of pool ID to totals

    Example:
        >>> utilities_id = UUID("...")
        >>> common_id = UUID("...")
        >>> entries = [GLEntry(id=UUID("..."), account_code="5100", amount=Decimal("1000"))]
        >>> mappings = [
        ...     PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
        ...     PoolMapping(pool_id=common_id, pool_name="Common", pattern="5*"),
        ... ]
        >>> splits = [
        ...     SplitAllocation(
        ...         account_pattern="5100",
        ...         splits=[(utilities_id, Decimal("0.5")), (common_id, Decimal("0.5"))],
        ...     )
        ... ]
        >>> result = aggregate_with_splits(entries, mappings, splits)
        >>> result[utilities_id].total_amount
        Decimal('500.00')
    """
    # Persisted pool allocations are generated from source pool mappings. They must
    # be evaluated in the same priority order as regular mappings so broad split
    # patterns cannot bypass a higher-priority regular mapping.
    mapping_keys = {(mapping.pool_id, mapping.pattern) for mapping in mappings}
    persisted_splits = {
        (split.default_pool_id, split.account_pattern): split
        for split in splits
        if split.default_pool_id is not None
        and (split.default_pool_id, split.account_pattern) in mapping_keys
    }

    # Keep support for direct SplitAllocation inputs used by existing callers/tests.
    legacy_splits = [
        split
        for split in splits
        if (split.default_pool_id, split.account_pattern) not in persisted_splits
    ]
    compiled_legacy_splits = [
        (split, re.compile(pattern_to_regex(split.account_pattern), re.IGNORECASE))
        for split in legacy_splits
    ]
    compiled_legacy_splits.sort(key=lambda item: item[0].priority, reverse=True)

    compiled_mappings = [
        (mapping, re.compile(pattern_to_regex(mapping.pattern), re.IGNORECASE))
        for mapping in mappings
    ]
    compiled_mappings.sort(key=lambda item: item[0].priority, reverse=True)

    # Initialize pool totals from mappings
    pool_totals: dict[UUID, PoolTotal] = {}
    pool_names: dict[UUID, str] = {}
    for mapping in mappings:
        pool_names[mapping.pool_id] = mapping.pool_name
        if mapping.pool_id not in pool_totals:
            pool_totals[mapping.pool_id] = PoolTotal(
                pool_id=mapping.pool_id,
                pool_name=mapping.pool_name,
                total_amount=Decimal("0"),
                entry_count=0,
                matched_accounts=[],
            )

    # Process each entry
    for entry in entries:
        split_matched = False

        for split, regex in compiled_legacy_splits:
            if regex.match(entry.account_code):
                split_matched = True

                # Apply split allocations
                split_base_amount = entry.amount * split.allocation_percentage
                for pool_id, percentage in split.splits:
                    if pool_id not in pool_totals:
                        # Create pool if needed
                        pool_totals[pool_id] = PoolTotal(
                            pool_id=pool_id,
                            pool_name=pool_names.get(pool_id, f"Pool {pool_id}"),
                            total_amount=Decimal("0"),
                            entry_count=0,
                            matched_accounts=[],
                        )

                    pool = pool_totals[pool_id]
                    allocated_amount = split_base_amount * percentage
                    pool.total_amount += allocated_amount
                    pool.entry_count += 1

                    if entry.account_code not in pool.matched_accounts:
                        pool.matched_accounts.append(entry.account_code)

                    if trace:
                        trace.add_step(
                            name=f"Split allocation: {pool.pool_name}",
                            inputs={
                                "account": entry.account_code,
                                "amount": entry.amount,
                                "percentage": percentage,
                            },
                            operation=f"{entry.amount} * {percentage}",
                            output=allocated_amount,
                            note=f"Split from {split.account_pattern}",
                            input_units={
                                "account": UNIT_TEXT,
                                "percentage": UNIT_RATIO,
                            },
                        )

                # Handle remainder to default pool
                total_split_percentage = sum(pct for _, pct in split.splits)
                if total_split_percentage < Decimal("1.0") and split.default_pool_id:
                    remainder_percentage = Decimal("1.0") - total_split_percentage
                    remainder_amount = split_base_amount * remainder_percentage

                    if split.default_pool_id not in pool_totals:
                        pool_totals[split.default_pool_id] = PoolTotal(
                            pool_id=split.default_pool_id,
                            pool_name=pool_names.get(
                                split.default_pool_id, f"Pool {split.default_pool_id}"
                            ),
                            total_amount=Decimal("0"),
                            entry_count=0,
                            matched_accounts=[],
                        )

                    default_pool = pool_totals[split.default_pool_id]
                    default_pool.total_amount += remainder_amount
                    default_pool.entry_count += 1

                    if entry.account_code not in default_pool.matched_accounts:
                        default_pool.matched_accounts.append(entry.account_code)

                    if trace:
                        trace.add_step(
                            name=f"Split remainder: {default_pool.pool_name}",
                            inputs={
                                "account": entry.account_code,
                                "amount": entry.amount,
                                "remainder": remainder_percentage,
                            },
                            operation=f"{entry.amount} * {remainder_percentage}",
                            output=remainder_amount,
                            note=f"Remainder from {split.account_pattern}",
                            input_units={"account": UNIT_TEXT, "remainder": UNIT_RATIO},
                        )

                break  # Only match first split pattern

        if split_matched:
            continue

        remaining_allocation = Decimal("1")
        for mapping, regex in compiled_mappings:
            if remaining_allocation <= Decimal("0"):
                break
            if not regex.match(entry.account_code):
                continue

            persisted_split = persisted_splits.get((mapping.pool_id, mapping.pattern))
            actual_allocation = min(
                (
                    persisted_split.allocation_percentage
                    if persisted_split is not None
                    else mapping.allocation_percentage
                ),
                remaining_allocation,
            )
            remaining_allocation -= actual_allocation

            if persisted_split is None:
                pool = pool_totals[mapping.pool_id]
                allocated_amount = entry.amount * actual_allocation
                pool.total_amount += allocated_amount
                pool.entry_count += 1
                if entry.account_code not in pool.matched_accounts:
                    pool.matched_accounts.append(entry.account_code)
                continue

            split_base_amount = entry.amount * actual_allocation
            for pool_id, percentage in persisted_split.splits:
                if pool_id not in pool_totals:
                    pool_totals[pool_id] = PoolTotal(
                        pool_id=pool_id,
                        pool_name=pool_names.get(pool_id, f"Pool {pool_id}"),
                        total_amount=Decimal("0"),
                        entry_count=0,
                        matched_accounts=[],
                    )

                pool = pool_totals[pool_id]
                allocated_amount = split_base_amount * percentage
                pool.total_amount += allocated_amount
                pool.entry_count += 1

                if entry.account_code not in pool.matched_accounts:
                    pool.matched_accounts.append(entry.account_code)

                if trace:
                    trace.add_step(
                        name=f"Split allocation: {pool.pool_name}",
                        inputs={
                            "account": entry.account_code,
                            "amount": entry.amount,
                            "percentage": percentage,
                        },
                        operation=f"{split_base_amount} * {percentage}",
                        output=allocated_amount,
                        note=f"Split from {persisted_split.account_pattern}",
                        input_units={"account": UNIT_TEXT, "percentage": UNIT_RATIO},
                    )

            total_split_percentage = sum(pct for _, pct in persisted_split.splits)
            if (
                total_split_percentage < Decimal("1.0")
                and persisted_split.default_pool_id
            ):
                remainder_percentage = Decimal("1.0") - total_split_percentage
                remainder_amount = split_base_amount * remainder_percentage

                default_pool = pool_totals[persisted_split.default_pool_id]
                default_pool.total_amount += remainder_amount
                default_pool.entry_count += 1

                if entry.account_code not in default_pool.matched_accounts:
                    default_pool.matched_accounts.append(entry.account_code)

                if trace:
                    trace.add_step(
                        name=f"Split remainder: {default_pool.pool_name}",
                        inputs={
                            "account": entry.account_code,
                            "amount": entry.amount,
                            "remainder": remainder_percentage,
                        },
                        operation=f"{split_base_amount} * {remainder_percentage}",
                        output=remainder_amount,
                        note=f"Remainder from {persisted_split.account_pattern}",
                        input_units={"account": UNIT_TEXT, "remainder": UNIT_RATIO},
                    )

    return pool_totals
