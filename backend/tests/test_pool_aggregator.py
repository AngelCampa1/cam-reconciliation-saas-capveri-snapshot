"""
Tests for expense pool aggregator.

Story 6.11: Create Expense Pool Aggregator

The aggregator takes GL entries and groups them by expense pools
based on account code patterns (e.g., "5*" matches all 5xxx accounts).
Supports wildcards and split allocations.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

from app.services.calculation.models import CalculationTrace
from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    SplitAllocation,
    aggregate_by_pools,
    aggregate_with_splits,
    build_split_allocations_from_pool_allocations,
    pattern_to_regex,
    validate_split_allocation,
)


class TestPatternToRegex:
    """Test wildcard pattern conversion to regex."""

    def test_exact_pattern(self):
        """Exact pattern with no wildcards."""
        pattern = "5100"
        regex = pattern_to_regex(pattern)
        assert regex == "^5100$"

    def test_star_wildcard(self):
        """Star wildcard matches any characters."""
        pattern = "5*"
        regex = pattern_to_regex(pattern)
        assert regex == "^5.*$"

    def test_percent_wildcard_matches_seed_patterns(self):
        """SQL-style percent wildcard matches seeded pool mapping patterns."""
        pattern = "51%"
        regex = pattern_to_regex(pattern)
        assert regex == "^51.*$"

    def test_question_wildcard(self):
        """Question mark matches single character."""
        pattern = "51?"
        regex = pattern_to_regex(pattern)
        assert regex == "^51.$"

    def test_combined_wildcards(self):
        """Multiple wildcards in same pattern."""
        pattern = "5?00*"
        regex = pattern_to_regex(pattern)
        assert regex == "^5.00.*$"

    def test_escapes_regex_special_chars(self):
        """Escape special regex characters."""
        pattern = "5100.00"
        regex = pattern_to_regex(pattern)
        # Dot should be escaped
        assert regex == "^5100\\.00$"


class TestAggregateByPools:
    """Test GL entry aggregation by expense pools."""

    def test_exact_match_single_entry(self):
        """AC1: Single entry with exact pattern match."""
        pool_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("1000.00"),
            )
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5100",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        assert pool_id in result
        pool = result[pool_id]
        assert pool.total_amount == Decimal("1000.00")
        assert pool.entry_count == 1
        assert "5100" in pool.matched_accounts

    def test_wildcard_star_matches_multiple(self):
        """AC2: Star wildcard matches multiple accounts."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("300.00")),
            GLEntry(id=uuid4(), account_code="5999", amount=Decimal("200.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Operating Expenses",
                pattern="5*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        assert pool.total_amount == Decimal("1000.00")  # 500 + 300 + 200
        assert pool.entry_count == 3
        assert len(pool.matched_accounts) == 3

    def test_wildcard_question_matches_single_char(self):
        """AC2: Question mark wildcard matches single character."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("100.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("200.00")),
            GLEntry(id=uuid4(), account_code="5300", amount=Decimal("300.00")),
            GLEntry(id=uuid4(), account_code="5400", amount=Decimal("400.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="5x00 Accounts",
                pattern="5?00",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        # All should match (5100, 5200, 5300, 5400)
        assert pool.total_amount == Decimal("1000.00")
        assert pool.entry_count == 4

    def test_multiple_pools_different_patterns(self):
        """AC1 & AC4: Multiple pools with different patterns."""
        utilities_id = uuid4()
        maintenance_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("300.00")),
            GLEntry(id=uuid4(), account_code="6100", amount=Decimal("400.00")),
            GLEntry(id=uuid4(), account_code="6200", amount=Decimal("200.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=utilities_id,
                pool_name="Utilities",
                pattern="5*",
            ),
            PoolMapping(
                pool_id=maintenance_id,
                pool_name="Maintenance",
                pattern="6*",
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        assert utilities_id in result
        assert maintenance_id in result
        assert result[utilities_id].total_amount == Decimal("800.00")
        assert result[maintenance_id].total_amount == Decimal("600.00")

    def test_allocation_percentage_splits_amount(self):
        """AC3: Allocation percentage splits entry across pools."""
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
            PoolMapping(
                pool_id=utilities_id,
                pool_name="Utilities",
                pattern="5100",
                allocation_percentage=Decimal("0.60"),  # 60%
                priority=1,
            ),
            PoolMapping(
                pool_id=common_area_id,
                pool_name="Common Area",
                pattern="5100",
                allocation_percentage=Decimal("0.40"),  # 40%
                priority=0,
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        # $1000 * 60% = $600 to utilities
        assert result[utilities_id].total_amount == Decimal("600.00")
        # $1000 * 40% = $400 to common area
        assert result[common_area_id].total_amount == Decimal("400.00")

    def test_priority_determines_match_order(self):
        """Higher priority patterns matched first."""
        specific_id = uuid4()
        general_id = uuid4()
        entries = [
            GLEntry(
                id=uuid4(),
                account_code="5100",
                amount=Decimal("1000.00"),
            )
        ]
        mappings = [
            PoolMapping(
                pool_id=general_id,
                pool_name="All Operating",
                pattern="5*",
                priority=0,  # Lower priority
            ),
            PoolMapping(
                pool_id=specific_id,
                pool_name="Specific Utilities",
                pattern="5100",
                priority=10,  # Higher priority
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        # Higher priority (specific) should get full amount
        assert result[specific_id].total_amount == Decimal("1000.00")
        assert result[specific_id].entry_count == 1
        # Lower priority (general) should get nothing (100% allocated to first)
        assert result[general_id].total_amount == Decimal("0")
        assert result[general_id].entry_count == 0

    def test_unmatched_entries_not_aggregated(self):
        """Entries not matching any pattern are skipped."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(
                id=uuid4(), account_code="9999", amount=Decimal("100.00")
            ),  # No match
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        # Only matched entry counted
        assert pool.total_amount == Decimal("500.00")
        assert pool.entry_count == 1

    def test_case_insensitive_matching(self):
        """Pattern matching is case-insensitive."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="ABC123", amount=Decimal("100.00")),
            GLEntry(id=uuid4(), account_code="abc123", amount=Decimal("200.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Test Pool",
                pattern="ABC*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        # Both should match
        assert pool.total_amount == Decimal("300.00")
        assert pool.entry_count == 2

    def test_empty_entries_returns_zero_totals(self):
        """Empty entries list returns initialized pools with zero."""
        pool_id = uuid4()
        entries = []
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        assert pool_id in result
        pool = result[pool_id]
        assert pool.total_amount == Decimal("0")
        assert pool.entry_count == 0
        assert len(pool.matched_accounts) == 0

    def test_empty_mappings_returns_empty_dict(self):
        """Empty mappings list returns empty result."""
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("100.00"))]
        mappings = []

        result = aggregate_by_pools(entries, mappings)

        assert len(result) == 0

    def test_trace_shows_pool_aggregation(self):
        """AC4: Trace shows aggregation for each pool."""
        trace = CalculationTrace(
            calculation_type="pool_aggregation_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("300.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        aggregate_by_pools(entries, mappings, trace=trace)

        # Should have step showing aggregation
        assert len(trace.steps) > 0
        pool_step = next(
            (s for s in trace.steps if "utilities" in s.step_name.lower()),
            None,
        )
        assert pool_step is not None
        # Check value (may have varying decimal precision)
        assert pool_step.output_value.startswith("800")

    def test_trace_shows_unmatched_entries(self):
        """Trace shows count and total of unmatched entries."""
        trace = CalculationTrace(
            calculation_type="pool_aggregation_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(
                id=uuid4(), account_code="9999", amount=Decimal("100.00")
            ),  # Unmatched
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        aggregate_by_pools(entries, mappings, trace=trace)

        # Should have step for unmatched entries
        unmatched_step = next(
            (s for s in trace.steps if "unmatched" in s.step_name.lower()),
            None,
        )
        assert unmatched_step is not None

    def test_negative_amounts_handled(self):
        """Negative amounts (credits) are aggregated correctly."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00")),
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("-200.00")
            ),  # Credit
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        # Net: $1000 - $200 = $800
        assert pool.total_amount == Decimal("800.00")
        assert pool.entry_count == 2

    def test_matched_accounts_deduplicated(self):
        """AC4: matched_accounts list contains unique account codes."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("300.00")
            ),  # Same account
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("200.00")),
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5*",
            )
        ]

        result = aggregate_by_pools(entries, mappings)

        pool = result[pool_id]
        assert pool.total_amount == Decimal("1000.00")
        assert pool.entry_count == 3
        # Only 2 unique accounts (5100, 5200)
        assert len(pool.matched_accounts) == 2
        assert "5100" in pool.matched_accounts
        assert "5200" in pool.matched_accounts

    def test_performance_large_dataset(self):
        """AC5: Performance acceptable for large datasets."""
        import time

        pool_id = uuid4()
        # Create 10,000 GL entries
        entries = [
            GLEntry(
                id=uuid4(),
                account_code=f"5{i:04d}",
                amount=Decimal("100.00"),
            )
            for i in range(10000)
        ]
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Large Pool",
                pattern="5*",
            )
        ]

        start = time.time()
        result = aggregate_by_pools(entries, mappings)
        elapsed = time.time() - start

        # Should complete in under 2 seconds (reasonable for 10k entries)
        assert elapsed < 2.0

        pool = result[pool_id]
        assert pool.total_amount == Decimal("1000000.00")  # 10k * $100
        assert pool.entry_count == 10000


class TestValidateSplitAllocation:
    """Test split allocation validation."""

    def test_valid_split_allocation(self):
        """Valid split allocation passes validation."""
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(uuid4(), Decimal("0.60")), (uuid4(), Decimal("0.40"))],
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 0

    def test_duplicate_pool_ids_error(self):
        """Duplicate pool IDs in splits raises error."""
        pool_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(pool_id, Decimal("0.50")), (pool_id, Decimal("0.50"))],
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 1
        assert "duplicate pool IDs" in errors[0]
        assert "5100" in errors[0]

    def test_percentages_exceed_100_error(self):
        """Percentages exceeding 100% raises error."""
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(uuid4(), Decimal("0.70")), (uuid4(), Decimal("0.50"))],
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 1
        assert "exceed 100%" in errors[0]
        assert "120" in errors[0]  # 70% + 50% = 120%

    def test_remainder_without_default_pool_error(self):
        """Remainder without default pool raises error."""
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(uuid4(), Decimal("0.60")), (uuid4(), Decimal("0.30"))],
            default_pool_id=None,
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 1
        assert "remainder" in errors[0].lower()
        assert "10" in errors[0]  # 100% - 90% = 10% remainder (format may vary)
        assert "no default pool" in errors[0].lower()

    def test_remainder_with_default_pool_valid(self):
        """Remainder with default pool is valid."""
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(uuid4(), Decimal("0.60")), (uuid4(), Decimal("0.30"))],
            default_pool_id=uuid4(),
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 0

    def test_exactly_100_percent_valid(self):
        """Exactly 100% allocation is valid."""
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(uuid4(), Decimal("0.60")), (uuid4(), Decimal("0.40"))],
        )

        errors = validate_split_allocation(split)

        assert len(errors) == 0

    def test_multiple_errors_reported(self):
        """Multiple validation errors reported together."""
        pool_id = uuid4()
        split = SplitAllocation(
            account_pattern="5100",
            splits=[(pool_id, Decimal("0.70")), (pool_id, Decimal("0.50"))],
        )

        errors = validate_split_allocation(split)

        # Should have 2 errors: duplicate pool IDs AND exceeds 100%
        assert len(errors) == 2
        assert any("duplicate" in e.lower() for e in errors)
        assert any("exceed" in e.lower() for e in errors)


class TestAggregateWithSplits:
    """Test GL entry aggregation with split allocation support."""

    def test_build_split_allocations_from_pool_allocation_rows(self):
        """Persisted source-pool allocations become account-pattern splits."""
        source_pool_id = uuid4()
        janitorial_id = uuid4()
        management_id = uuid4()
        mappings = [
            PoolMapping(
                pool_id=source_pool_id,
                pool_name="Operating",
                pattern="51%",
            )
        ]
        allocation_rows = [
            {
                "source_pool_id": str(source_pool_id),
                "target_pool_id": str(janitorial_id),
                "allocation_type": "percentage",
                "allocation_value": "60",
            },
            {
                "source_pool_id": str(source_pool_id),
                "target_pool_id": str(management_id),
                "allocation_type": "percentage",
                "allocation_value": "40",
            },
        ]

        splits = build_split_allocations_from_pool_allocations(
            mappings, allocation_rows
        )

        assert len(splits) == 1
        assert splits[0].account_pattern == "51%"
        assert splits[0].splits == [
            (janitorial_id, Decimal("0.6")),
            (management_id, Decimal("0.4")),
        ]

    def test_persisted_split_honors_mapping_allocation_percentage(self):
        """Target percentages split only the source mapping's allocated portion."""
        source_pool_id = uuid4()
        janitorial_id = uuid4()
        management_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
        mappings = [
            PoolMapping(
                pool_id=source_pool_id,
                pool_name="Operating",
                pattern="51%",
                allocation_percentage=Decimal("0.5"),
            ),
            PoolMapping(pool_id=janitorial_id, pool_name="Janitorial", pattern="9%"),
            PoolMapping(pool_id=management_id, pool_name="Management", pattern="8%"),
        ]
        splits = build_split_allocations_from_pool_allocations(
            mappings,
            [
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(janitorial_id),
                    "allocation_type": "percentage",
                    "allocation_value": "60",
                },
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(management_id),
                    "allocation_type": "percentage",
                    "allocation_value": "40",
                },
            ],
        )

        result = aggregate_with_splits(entries, mappings, splits)

        assert result[janitorial_id].total_amount == Decimal("300.000")
        assert result[management_id].total_amount == Decimal("200.000")
        assert result[source_pool_id].total_amount == Decimal("0")

    def test_persisted_split_respects_mapping_priority(self):
        """A broad split mapping must not bypass a higher-priority regular mapping."""
        broad_source_id = uuid4()
        target_id = uuid4()
        exact_pool_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
        mappings = [
            PoolMapping(
                pool_id=broad_source_id,
                pool_name="Broad Operating",
                pattern="5%",
                priority=1,
            ),
            PoolMapping(
                pool_id=exact_pool_id,
                pool_name="Exact Taxes",
                pattern="5100",
                priority=10,
            ),
            PoolMapping(pool_id=target_id, pool_name="Target", pattern="9%"),
        ]
        splits = build_split_allocations_from_pool_allocations(
            mappings,
            [
                {
                    "source_pool_id": str(broad_source_id),
                    "target_pool_id": str(target_id),
                    "allocation_type": "percentage",
                    "allocation_value": "100",
                }
            ],
        )

        result = aggregate_with_splits(entries, mappings, splits)

        assert result[exact_pool_id].total_amount == Decimal("1000.00")
        assert result[target_id].total_amount == Decimal("0")
        assert result[broad_source_id].total_amount == Decimal("0")

    def test_build_split_allocations_filters_invalid_target_pools(self):
        """Reconciliation can ignore allocation rows with target pools outside property."""
        source_pool_id = uuid4()
        valid_target_id = uuid4()
        invalid_target_id = uuid4()
        mappings = [
            PoolMapping(
                pool_id=source_pool_id,
                pool_name="Operating",
                pattern="51%",
            )
        ]

        splits = build_split_allocations_from_pool_allocations(
            mappings,
            [
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(valid_target_id),
                    "allocation_type": "percentage",
                    "allocation_value": "60",
                },
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(invalid_target_id),
                    "allocation_type": "percentage",
                    "allocation_value": "40",
                },
            ],
            valid_pool_ids={source_pool_id, valid_target_id},
        )

        assert splits[0].splits == [(valid_target_id, Decimal("0.6"))]

    def test_build_split_allocations_skips_fixed_amount_rows(self):
        """Persisted fixed amount rows are ignored until reconciliation supports them."""
        source_pool_id = uuid4()
        target_id = uuid4()
        mappings = [
            PoolMapping(
                pool_id=source_pool_id,
                pool_name="Operating",
                pattern="51%",
            )
        ]

        splits = build_split_allocations_from_pool_allocations(
            mappings,
            [
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(target_id),
                    "allocation_type": "fixed_amount",
                    "allocation_value": "100",
                }
            ],
        )

        assert splits == []

    def test_persisted_split_creates_target_pool_and_traces_remainder(self):
        """Persisted split path creates target pools and logs split trace steps."""
        trace = CalculationTrace(
            calculation_type="persisted_split_trace",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        source_pool_id = uuid4()
        target_id = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
        mappings = [
            PoolMapping(
                pool_id=source_pool_id,
                pool_name="Operating",
                pattern="51%",
            )
        ]
        splits = build_split_allocations_from_pool_allocations(
            mappings,
            [
                {
                    "source_pool_id": str(source_pool_id),
                    "target_pool_id": str(target_id),
                    "allocation_type": "percentage",
                    "allocation_value": "70",
                }
            ],
        )

        result = aggregate_with_splits(entries, mappings, splits, trace=trace)

        assert result[target_id].pool_name == f"Pool {target_id}"
        assert result[target_id].total_amount == Decimal("700.000")
        assert result[source_pool_id].total_amount == Decimal("300.000")
        assert any("Split allocation" in step.step_name for step in trace.steps)
        assert any("Split remainder" in step.step_name for step in trace.steps)

    def test_split_allocation_distributes_to_multiple_pools(self):
        """Entry matching split pattern is distributed across pools."""
        utilities_id = uuid4()
        common_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=common_id, pool_name="Common Area", pattern="5*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (utilities_id, Decimal("0.50")),
                    (common_id, Decimal("0.50")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # $1000 * 50% = $500 to each pool
        assert result[utilities_id].total_amount == Decimal("500.00")
        assert result[common_id].total_amount == Decimal("500.00")
        assert result[utilities_id].entry_count == 1
        assert result[common_id].entry_count == 1

    def test_non_split_entries_use_standard_aggregation(self):
        """Entries not matching split patterns use standard aggregation."""
        utilities_id = uuid4()

        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00")),
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("500.00")),
        ]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("0.50"))],
                default_pool_id=utilities_id,
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # 5100: $1000 * 50% (split) + $1000 * 50% (remainder) = $1000
        # 5200: $500 (standard aggregation, no split)
        # entry_count = 3 (split allocation + remainder allocation + standard entry)
        assert result[utilities_id].total_amount == Decimal("1500.00")
        assert result[utilities_id].entry_count == 3

    def test_split_remainder_to_default_pool(self):
        """Remainder percentage goes to default pool."""
        utilities_id = uuid4()
        common_id = uuid4()
        default_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=common_id, pool_name="Common", pattern="5*"),
            PoolMapping(pool_id=default_id, pool_name="Default", pattern="5*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (utilities_id, Decimal("0.40")),
                    (common_id, Decimal("0.30")),
                ],
                default_pool_id=default_id,
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        assert result[utilities_id].total_amount == Decimal("400.00")  # 40%
        assert result[common_id].total_amount == Decimal("300.00")  # 30%
        assert result[default_id].total_amount == Decimal("300.00")  # 30% remainder

    def test_mixed_split_and_standard_entries(self):
        """Mix of split and standard aggregation in same run."""
        utilities_id = uuid4()
        maintenance_id = uuid4()

        entries = [
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("1000.00")
            ),  # Split
            GLEntry(id=uuid4(), account_code="5200", amount=Decimal("500.00")),  # Split
            GLEntry(
                id=uuid4(), account_code="6100", amount=Decimal("300.00")
            ),  # Standard
        ]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=maintenance_id, pool_name="Maintenance", pattern="6*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="51*",
                splits=[(utilities_id, Decimal("1.0"))],
            ),
            SplitAllocation(
                account_pattern="52*",
                splits=[(utilities_id, Decimal("1.0"))],
            ),
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Utilities: 5100 ($1000) + 5200 ($500) = $1500
        assert result[utilities_id].total_amount == Decimal("1500.00")
        # Maintenance: 6100 ($300)
        assert result[maintenance_id].total_amount == Decimal("300.00")

    def test_split_creates_pool_if_not_in_mappings(self):
        """Split allocation creates pool total if pool not in mappings."""
        utilities_id = uuid4()
        new_pool_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        # Mappings only include utilities, not new_pool
        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (new_pool_id, Decimal("0.50")),
                    (utilities_id, Decimal("0.50")),
                ],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Both pools should exist in result
        assert new_pool_id in result
        assert utilities_id in result
        assert result[new_pool_id].total_amount == Decimal("500.00")
        assert result[utilities_id].total_amount == Decimal("500.00")

    def test_trace_logs_split_allocations(self):
        """Trace logs split allocation steps."""
        trace = CalculationTrace(
            calculation_type="split_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        utilities_id = uuid4()
        common_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=common_id, pool_name="Common", pattern="5*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("0.60")), (common_id, Decimal("0.40"))],
            )
        ]

        aggregate_with_splits(entries, mappings, splits, trace=trace)

        # Should have steps for split allocations
        assert len(trace.steps) >= 2
        split_steps = [s for s in trace.steps if "split" in s.step_name.lower()]
        assert len(split_steps) >= 2

    def test_trace_logs_remainder_allocation(self):
        """Trace logs remainder allocation to default pool."""
        trace = CalculationTrace(
            calculation_type="remainder_test",
            property_id=UUID("00000000-0000-0000-0000-000000000000"),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
        )
        utilities_id = uuid4()
        default_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=default_id, pool_name="Default", pattern="5*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("0.70"))],
                default_pool_id=default_id,
            )
        ]

        aggregate_with_splits(entries, mappings, splits, trace=trace)

        # Should have step for remainder
        remainder_step = next(
            (s for s in trace.steps if "remainder" in s.step_name.lower()),
            None,
        )
        assert remainder_step is not None

    def test_empty_entries_returns_zero_totals(self):
        """Empty entries with splits returns initialized pools at zero."""
        utilities_id = uuid4()

        entries = []

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("1.0"))],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        assert utilities_id in result
        assert result[utilities_id].total_amount == Decimal("0")
        assert result[utilities_id].entry_count == 0

    def test_split_matched_accounts_tracked(self):
        """Split allocations track matched account codes."""
        utilities_id = uuid4()

        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00")),
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
        ]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("1.0"))],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        pool = result[utilities_id]
        assert "5100" in pool.matched_accounts
        assert len(pool.matched_accounts) == 1  # Deduplicated

    def test_first_split_pattern_matched(self):
        """Only first matching split pattern is applied."""
        utilities_id = uuid4()
        other_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*"),
            PoolMapping(pool_id=other_id, pool_name="Other", pattern="5*"),
        ]

        splits = [
            SplitAllocation(
                account_pattern="51*",
                splits=[(utilities_id, Decimal("1.0"))],
            ),
            SplitAllocation(
                account_pattern="5*",  # Also matches but should be skipped
                splits=[(other_id, Decimal("1.0"))],
            ),
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Should only match first split (51*)
        assert result[utilities_id].total_amount == Decimal("1000.00")
        assert result[other_id].total_amount == Decimal("0")

    def test_duplicate_pool_id_in_mappings(self):
        """Edge case: Multiple mappings with same pool_id (line 146)."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="6100", amount=Decimal("300.00")),
        ]
        # Two mappings for same pool
        mappings = [
            PoolMapping(pool_id=pool_id, pool_name="Combined", pattern="5*"),
            PoolMapping(pool_id=pool_id, pool_name="Combined", pattern="6*"),
        ]

        result = aggregate_by_pools(entries, mappings)

        # Both patterns contribute to same pool
        assert result[pool_id].total_amount == Decimal("800.00")
        assert result[pool_id].entry_count == 2

    def test_entry_fully_allocated_mid_loop(self):
        """Edge case: Entry gets 100% allocated before checking all patterns (line 168)."""
        pool_a = uuid4()
        pool_b = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        # First pattern takes 100%, second should be skipped
        mappings = [
            PoolMapping(
                pool_id=pool_a,
                pool_name="Pool A",
                pattern="5*",
                allocation_percentage=Decimal("1.0"),  # 100%
                priority=10,
            ),
            PoolMapping(
                pool_id=pool_b,
                pool_name="Pool B",
                pattern="5*",
                allocation_percentage=Decimal(
                    "0.5"
                ),  # Would be 50% but no allocation left
                priority=5,
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        # Pool A gets full amount
        assert result[pool_a].total_amount == Decimal("1000.00")
        # Pool B gets nothing (entry already 100% allocated)
        assert result[pool_b].total_amount == Decimal("0")
        assert result[pool_b].entry_count == 0

    def test_default_pool_not_in_mappings(self):
        """Edge case: default_pool_id not in original mappings (line 387)."""
        utilities_id = uuid4()
        default_id = uuid4()

        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        # Only utilities in mappings, default_id is NOT
        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("0.70"))],
                default_pool_id=default_id,  # Not in mappings!
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Utilities gets 70%
        assert result[utilities_id].total_amount == Decimal("700.00")
        # Default pool created for 30% remainder
        assert default_id in result
        assert result[default_id].total_amount == Decimal("300.00")

    def test_duplicate_pool_id_in_split_mappings(self):
        """Edge case: Multiple mappings with same pool_id in aggregate_with_splits (line 326)."""
        pool_id = uuid4()
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(id=uuid4(), account_code="6100", amount=Decimal("300.00")),
        ]

        # Two mappings for same pool
        mappings = [
            PoolMapping(pool_id=pool_id, pool_name="Combined", pattern="5*"),
            PoolMapping(pool_id=pool_id, pool_name="Combined", pattern="6*"),
        ]

        splits = []  # No splits, just testing mapping initialization

        result = aggregate_with_splits(entries, mappings, splits)

        # Both entries go to same pool
        assert result[pool_id].total_amount == Decimal("800.00")

    def test_account_exists_in_both_split_and_standard(self):
        """Edge case: Same account appears in both split and standard results (line 435)."""
        utilities_id = uuid4()

        entries = [
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("1000.00")
            ),  # Split
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("500.00")
            ),  # Standard
        ]

        mappings = [
            PoolMapping(pool_id=utilities_id, pool_name="Utilities", pattern="5*")
        ]

        # Only first 5100 entry matches split
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("1.0"))],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Total: $1000 (split) + $500 (standard) = $1500
        assert result[utilities_id].total_amount == Decimal("1500.00")
        # matched_accounts should have "5100" only once (deduplicated)
        assert len(result[utilities_id].matched_accounts) == 1
        assert "5100" in result[utilities_id].matched_accounts

    def test_standard_aggregation_creates_new_pool(self):
        """Edge case: Standard aggregation returns pool not in split results (line 438)."""
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

        # Only utilities has split pattern
        splits = [
            SplitAllocation(
                account_pattern="5100",
                splits=[(utilities_id, Decimal("1.0"))],
            )
        ]

        result = aggregate_with_splits(entries, mappings, splits)

        # Utilities from split
        assert result[utilities_id].total_amount == Decimal("1000.00")
        # Maintenance created by standard aggregation
        assert maintenance_id in result
        assert result[maintenance_id].total_amount == Decimal("500.00")

    def test_three_mappings_same_entry_full_allocation(self):
        """Edge case: Entry matched by 3 patterns, first two allocate 100%, third skipped (line 168)."""
        pool_a = uuid4()
        pool_b = uuid4()
        pool_c = uuid4()
        entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]

        # Three patterns all match, with different priorities
        mappings = [
            PoolMapping(
                pool_id=pool_a,
                pool_name="Pool A",
                pattern="5*",
                allocation_percentage=Decimal("0.6"),  # 60%
                priority=30,
            ),
            PoolMapping(
                pool_id=pool_b,
                pool_name="Pool B",
                pattern="51*",
                allocation_percentage=Decimal("0.4"),  # 40%
                priority=20,
            ),
            PoolMapping(
                pool_id=pool_c,
                pool_name="Pool C",
                pattern="5100",
                allocation_percentage=Decimal("0.5"),  # 50% but no allocation left
                priority=10,
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        # Pool A gets 60%, Pool B gets 40%, Pool C gets 0 (100% already allocated)
        assert result[pool_a].total_amount == Decimal("600.00")
        assert result[pool_b].total_amount == Decimal("400.00")
        assert result[pool_c].total_amount == Decimal("0")
        assert result[pool_c].entry_count == 0

    def test_split_allocation_breaks_when_fully_allocated(self):
        """Should break loop when remaining_allocation reaches zero (line 168)."""
        pool_a = uuid4()
        pool_b = uuid4()
        pool_c = uuid4()

        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00")),
        ]

        # Three mappings, but only first two sum to 100%
        mappings = [
            PoolMapping(
                pool_id=pool_a,
                pool_name="Pool A",
                pattern="5100",
                allocation_percentage=Decimal("0.7"),  # 70%
                priority=30,
            ),
            PoolMapping(
                pool_id=pool_b,
                pool_name="Pool B",
                pattern="5100",
                allocation_percentage=Decimal("0.3"),  # 30% - now at 100%
                priority=20,
            ),
            PoolMapping(
                pool_id=pool_c,
                pool_name="Pool C",
                pattern="5100",
                allocation_percentage=Decimal(
                    "0.5"
                ),  # Should not process (line 168 break)
                priority=10,
            ),
        ]

        result = aggregate_by_pools(entries, mappings)

        # Pool C should get 0 because loop breaks at line 168
        assert result[pool_a].total_amount == Decimal("700.00")
        assert result[pool_b].total_amount == Decimal("300.00")
        assert result[pool_c].total_amount == Decimal("0")

    def test_duplicate_accounts_not_added_to_matched_list(self):
        """Should skip duplicate accounts in matched_accounts list (line 435)."""
        pool_id = uuid4()

        # Create entries that will match both split and standard patterns
        # This will trigger the merge logic at line 435
        entries = [
            GLEntry(id=uuid4(), account_code="5100", amount=Decimal("500.00")),
            GLEntry(
                id=uuid4(), account_code="5100", amount=Decimal("300.00")
            ),  # Same account
        ]

        # Mapping with allocation percentage (triggers split allocation)
        mappings = [
            PoolMapping(
                pool_id=pool_id,
                pool_name="Utilities",
                pattern="5100",
                allocation_percentage=Decimal("0.6"),  # 60% split
                priority=10,
            )
        ]

        # Split allocations to trigger split path
        split_allocations = [
            SplitAllocation(
                account_pattern="5100",
                splits=[
                    (pool_id, Decimal("100.0")),
                ],
            )
        ]

        # This will create a pool_total from split, then merge standard results
        # Line 435 prevents duplicate "5100" in matched_accounts
        result = aggregate_with_splits(entries, mappings, split_allocations)

        # Should have "5100" only once in matched_accounts, not twice
        assert "5100" in result[pool_id].matched_accounts
        # Count occurrences - should be 1
        count = result[pool_id].matched_accounts.count("5100")
        assert count == 1
