# Story 6.12: Create Allocation Percentage Handler

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** property accountant
**I want** to split GL accounts across multiple pools
**So that** mixed-use expenses are allocated correctly

---

## Acceptance Criteria

- [ ] **AC1**: Same account can map to multiple pools
- [ ] **AC2**: Percentages validated (sum <= 100%)
- [ ] **AC3**: Remainder goes to default pool
- [ ] **AC4**: 50/50 split test passes
- [ ] **AC5**: Trace shows split breakdown

---

## Technical Specifications

**Files to Extend**:
```
backend/app/services/calculation/
└── pool_aggregator.py (add split handling)
```

**Additional pool_aggregator.py content**:
```python
class SplitAllocation(BaseModel):
    """Configuration for splitting an account across pools."""
    account_pattern: str
    splits: List[tuple[UUID, Decimal]]  # (pool_id, percentage)
    default_pool_id: Optional[UUID] = None


def validate_split_allocation(split: SplitAllocation) -> List[str]:
    """
    Validate that a split allocation is configured correctly.

    Returns list of validation errors (empty if valid).
    """
    errors = []

    # Check total percentage
    total_pct = sum(pct for _, pct in split.splits)

    if total_pct > Decimal('1'):
        errors.append(
            f"Split percentages for {split.account_pattern} exceed 100% ({total_pct})"
        )

    if total_pct < Decimal('1') and split.default_pool_id is None:
        errors.append(
            f"Split percentages for {split.account_pattern} are {total_pct} "
            f"but no default pool specified for remainder"
        )

    # Check for duplicate pools
    pool_ids = [pid for pid, _ in split.splits]
    if len(pool_ids) != len(set(pool_ids)):
        errors.append(f"Duplicate pool IDs in split for {split.account_pattern}")

    return errors


def aggregate_with_splits(
    entries: List[GLEntry],
    mappings: List[PoolMapping],
    splits: List[SplitAllocation],
    trace: Optional[CalculationTrace] = None,
) -> Dict[UUID, PoolTotal]:
    """
    Aggregate GL entries with split allocations.

    First applies explicit splits, then uses standard pool mappings
    for remaining entries.

    Args:
        entries: GL entries to aggregate
        mappings: Standard pool mappings
        splits: Split allocation configurations
        trace: Optional calculation trace

    Returns:
        Dictionary of pool ID to totals
    """
    # Initialize pool totals
    pool_totals: Dict[UUID, PoolTotal] = {}
    for mapping in mappings:
        if mapping.pool_id not in pool_totals:
            pool_totals[mapping.pool_id] = PoolTotal(
                pool_id=mapping.pool_id,
                pool_name=mapping.pool_name,
                total_amount=Decimal('0'),
                entry_count=0,
                matched_accounts=[],
            )

    # Compile split patterns
    compiled_splits = [
        (split, re.compile(pattern_to_regex(split.account_pattern), re.IGNORECASE))
        for split in splits
    ]

    remaining_entries = []

    for entry in entries:
        split_applied = False

        for split_config, regex in compiled_splits:
            if regex.match(entry.account_code):
                # Apply split allocation
                for pool_id, pct in split_config.splits:
                    if pool_id in pool_totals:
                        allocated = entry.amount * pct
                        pool_totals[pool_id].total_amount += allocated
                        pool_totals[pool_id].entry_count += 1

                        if trace:
                            trace.add_step(
                                name=f'Split allocation: {entry.account_code}',
                                inputs={
                                    'amount': entry.amount,
                                    'percentage': pct,
                                    'pool': pool_totals[pool_id].pool_name,
                                },
                                operation=f'{entry.amount} * {pct}',
                                output=allocated,
                            )

                # Handle remainder
                total_split = sum(pct for _, pct in split_config.splits)
                if total_split < Decimal('1') and split_config.default_pool_id:
                    remainder_pct = Decimal('1') - total_split
                    remainder = entry.amount * remainder_pct
                    if split_config.default_pool_id in pool_totals:
                        pool_totals[split_config.default_pool_id].total_amount += remainder

                split_applied = True
                break

        if not split_applied:
            remaining_entries.append(entry)

    # Process remaining entries with standard mappings
    if remaining_entries:
        standard_totals = aggregate_by_pools(remaining_entries, mappings, trace)
        for pool_id, total in standard_totals.items():
            if pool_id in pool_totals:
                pool_totals[pool_id].total_amount += total.total_amount
                pool_totals[pool_id].entry_count += total.entry_count
                pool_totals[pool_id].matched_accounts.extend(total.matched_accounts)

    return pool_totals
```

---

## Definition of Done
- [ ] Split allocation works
- [ ] Percentages validated
- [ ] Remainder handled
- [ ] 50/50 split test passes

---

## Estimated Time: 2 hours
