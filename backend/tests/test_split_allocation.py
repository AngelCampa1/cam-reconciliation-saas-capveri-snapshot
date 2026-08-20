"""
Tests for split allocation percentage handler.

Story 6.12: Create Allocation Percentage Handler

Allows same GL account to split across multiple expense pools
with percentage-based allocation and remainder handling.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

from app.services.calculation.models import CalculationTrace
from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    SplitAllocation,
    aggregate_with_splits,
    validate_split_allocation,
)


class TestValidateSplitAllocation:
    """Test split allocation validation."""

    def test_valid_split_100_percent(self):
        """Valid split that sums to 100%."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[
                (pool1_id, Decimal("0.60")),  # 60%
                (pool2_id, Decimal("0.40")),  # 40%
            ],
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 0

    def test_valid_split_with_remainder(self):
        """Valid split < 100% with default pool."""
        pool1_id = uuid4()
        default_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[
                (pool1_id, Decimal("0.70")),  # 70%
            ],
            default_pool_id=default_id,  # 30% goes to default
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 0

    def test_invalid_split_exceeds_100_percent(self):
        """AC2: Validation error when percentages > 100%."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[
                (pool1_id, Decimal("0.70")),  # 70%
                (pool2_id, Decimal("0.50")),  # 50% = 120% total!
            ],
        )

        errors = validate_split_allocation(split)

        assert len(errors) > 0
        assert any("exceed 100%" in err for err in errors)

    def test_invalid_split_no_default_for_remainder(self):
        """AC2: Validation error when < 100% without default."""
        pool1_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[
                (pool1_id, Decimal("0.70")),  # 70%, but no default for remaining 30%
            ],
            default_pool_id=None,
        )

        errors = validate_split_allocation(split)

        assert len(errors) > 0
        assert any("no default pool" in err for err in errors)

    def test_invalid_duplicate_pool_ids(self):
        """AC2: Validation error for duplicate pools."""
        pool_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[
                (pool_id, Decimal("0.50")),
                (pool_id, Decimal("0.50")),  # Same pool twice!
            ],
        )

        errors = validate_split_allocation(split)

        assert len(errors) > 0
        assert any("duplicate" in err.lower() for err in errors)


class TestAggregateWithSplits:
    """Test split allocation aggregation."""

    def test_50_50_split(self):
        """AC4: 50/50 split test."""
        utilities_id = uuid4()
        common_area_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("1000.00"),
            )
        ]
        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=common_area_id, pool_name="Common Area", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (utilities_id, Decimal("0.50")),  # 50%
                    (common_area_id, Decimal("0.50")),  # 50%
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # $1000 * 50% = $500 each
        assert result[utilities_id].total_amount == Decimal("500.00")
        assert result[common_area_id].total_amount == Decimal("500.00")

    def test_60_40_split(self):
        """AC1: Same account maps to multiple pools with different percentages."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("1000.00"),
            )
        ]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool1_id, Decimal("0.60")),  # 60%
                    (pool2_id, Decimal("0.40")),  # 40%
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        assert result[pool1_id].total_amount == Decimal("600.00")
        assert result[pool2_id].total_amount == Decimal("400.00")

    def test_split_with_remainder_to_default(self):
        """AC3: Remainder goes to default pool."""
        utilities_id = uuid4()
        default_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("1000.00"),
            )
        ]
        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=default_id, pool_name="Default Pool", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (utilities_id, Decimal("0.70")),  # 70%
                ],
                default_pool_id=default_id,  # 30% goes here
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # $1000 * 70% = $700 to utilities
        assert result[utilities_id].total_amount == Decimal("700.00")
        # $1000 * 30% = $300 to default
        assert result[default_id].total_amount == Decimal("300.00")

    def test_multiple_entries_with_different_splits(self):
        """Multiple GL entries with different split configurations."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        pool3_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("500.00")),
        ]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
            PoolMapping(pool_id=pool3_id, pool_name="Pool 3", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool1_id, Decimal("0.50")),
                    (pool2_id, Decimal("0.50")),
                ],
            ),
            SplitAllocation(
                account_pattern="5200",
                splits=[
                    (pool2_id, Decimal("0.60")),
                    (pool3_id, Decimal("0.40")),
                ],
            ),
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # 5100: $1000 * 50% = $500 to pool1, $500 to pool2
        # 5200: $500 * 60% = $300 to pool2, $200 to pool3
        assert result[pool1_id].total_amount == Decimal("500.00")
        assert result[pool2_id].total_amount == Decimal("800.00")  # $500 + $300
        assert result[pool3_id].total_amount == Decimal("200.00")

    def test_wildcard_patterns_in_splits(self):
        """Split allocations support wildcard patterns."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="5110", amount=Decimal("300.00")),
            GLEntry(id=uuid4(), account_code="5120", amount=Decimal("200.00")),
        ]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="51*",  # Matches all 51xx accounts
                splits=[
                    (pool1_id, Decimal("0.60")),
                    (pool2_id, Decimal("0.40")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # All three entries match 51* pattern
        # Total: $1000, split 60/40
        assert result[pool1_id].total_amount == Decimal("600.00")
        assert result[pool2_id].total_amount == Decimal("400.00")

    def test_non_split_entries_use_standard_mappings(self):
        """Entries not matching splits use standard pool mappings."""
        utilities_id = uuid4()
        maintenance_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("1000.00")
            ),  # Split
            GLEntry(
                id=uuid4(), account_code="6100", amount=Decimal("500.00")
            ),  # Standard
        ]
        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=maintenance_id, pool_name="Maintenance", pattern="6*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (utilities_id, Decimal("1.00")),  # 100% to utilities
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # 5100: $1000 via split to utilities
        # 6100: $500 via standard mapping to maintenance
        assert result[utilities_id].total_amount == Decimal("1000.00")
        assert result[maintenance_id].total_amount == Decimal("500.00")

    def test_trace_shows_split_breakdown(self):
        """AC5: Trace shows split allocation breakdown."""
        trace = CalculationTrace(
            calculation_type="split_allocation_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool1_id, Decimal("0.50")),
                    (pool2_id, Decimal("0.50")),
                ],
            )
        ]

        aggregate_with_splits(entries, mappings, splits, trace=trace)

        # Should have steps showing split
        assert len(trace.steps) > 0
        split_steps = [s for s in trace.steps if "split" in s.step_name.lower()]
        assert len(split_steps) >= 2  # At least one for each pool

    def test_negative_amounts_split_correctly(self):
        """Negative amounts (credits) are split correctly."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("-1000.00"),  # Credit
            )
        ]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool1_id, Decimal("0.50")),
                    (pool2_id, Decimal("0.50")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # -$1000 * 50% = -$500 each
        assert result[pool1_id].total_amount == Decimal("-500.00")
        assert result[pool2_id].total_amount == Decimal("-500.00")

    def test_zero_amount_entry(self):
        """Zero amount entries are handled."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("0.00"))]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="5*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="5*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool1_id, Decimal("0.50")),
                    (pool2_id, Decimal("0.50")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        assert result[pool1_id].total_amount == Decimal("0.00")
        assert result[pool2_id].total_amount == Decimal("0.00")

    def test_empty_splits_uses_standard_mappings(self):
        """Empty splits list falls back to standard mappings."""
        pool_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
        mappings = [PoolMapping(pool_id=pool_id, pool_name="Utilities", pattern="5*")]
        splits = []  # No splits

        result = aggregate_with_splits(entries, mappings, splits)

        # Should use standard mapping
        assert result[pool_id].total_amount == Decimal("1000.00")

    def test_case_insensitive_split_patterns(self):
        """Split patterns are case-insensitive."""
        pool1_id = uuid4()
        pool2_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="ABC123", amount=Decimal("1000.00")),
            GLEntry(id=uuid4(), account_code="abc123", amount=Decimal("500.00")),
        ]
        mappings = [
            PoolMapping(pool_id=pool1_id, pool_name="Pool 1", pattern="ABC*"),
            PoolMapping(pool_id=pool2_id, pool_name="Pool 2", pattern="ABC*"),
        ]
        splits = [
            SplitAllocation(
                account_pattern="ABC*",
                splits=[
                    (pool1_id, Decimal("0.50")),
                    (pool2_id, Decimal("0.50")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Both entries should match and be split 50/50
        # Total: $1500, split 50/50 = $750 each
        assert result[pool1_id].total_amount == Decimal("750.00")
        assert result[pool2_id].total_amount == Decimal("750.00")
