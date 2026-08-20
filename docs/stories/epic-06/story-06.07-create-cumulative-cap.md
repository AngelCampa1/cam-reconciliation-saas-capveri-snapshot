# Story 6.7: Create Cumulative Cap

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** lease with a cumulative cap
**I want** unused cap capacity carried forward
**So that** I benefit from years with lower expenses

---

## Acceptance Criteria

- [ ] **AC1**: Unused capacity accumulates across years
- [ ] **AC2**: Bank of capacity can be used in high years
- [ ] **AC3**: Multi-year test verifies accumulation
- [ ] **AC4**: Cannot use more than banked capacity
- [ ] **AC5**: Trace shows bank balance
- [ ] **AC6**: Supports fixed dollar caps (base + fixed_amount * years)

---

## Technical Specifications

**Files to Extend**:
```
backend/app/services/calculation/
└── caps.py (add cumulative function)
```

**Additional caps.py content**:
```python
def calculate_cumulative_cap(
    current_amount: Decimal,
    base_amount: Decimal,
    cap_rate: Optional[Decimal] = None,
    cap_fixed_amount: Optional[Decimal] = None,
    years_since_base: int = 1,
    prior_year_amounts: List[Decimal] = None,
    trace: Optional[CalculationTrace] = None,
) -> CapResult:
    """
    Calculate cumulative cap with carry-forward.

    The cumulative cap allows unused capacity to be banked:
    - Each year, max increase is base * cap_rate (non-compounding)
    - Total max after N years: base + (base * cap_rate * N)
    - If actual is below max, difference is "banked"
    - Bank can be used in years where actual exceeds annual limit

    Example over 3 years (5% cap, $100k base):
    Year 1: Max=$105k, Actual=$102k, Bank=$3k
    Year 2: Max=$110k, Actual=$108k, Bank=$5k total
    Year 3: Max=$115k, Actual=$120k, Use $5k bank, Pay=$115k

    Args:
        current_amount: This year's calculated expense
        base_amount: Base year amount (year 0)
        cap_rate: Annual cap rate
        years_since_base: Years since base year
        prior_year_amounts: All prior year actual amounts
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount and bank info
    """
    if prior_year_amounts is None:
        prior_year_amounts = []

    # Calculate theoretical max (what could have been spent cumulatively)
    if cap_fixed_amount is not None:
        # Fixed dollar cap: linear growth by fixed amount
        cumulative_max = base_amount + (cap_fixed_amount * years_since_base)
        annual_increase_limit = cap_fixed_amount
    elif cap_rate is not None:
        # Percentage cap: linear growth by percentage of base
        cumulative_max = base_amount * (1 + (cap_rate * years_since_base))
        annual_increase_limit = base_amount * cap_rate
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")

    # Calculate cumulative actual spent
    cumulative_actual_prior = sum(prior_year_amounts)
    cumulative_actual_total = cumulative_actual_prior + current_amount

    if trace:
        trace.add_step(
            name='Calculate cumulative cap',
            inputs={
                'base_amount': base_amount,
                'cap_rate': cap_rate,
                'years_since_base': years_since_base,
            },
            operation=f'{base_amount} * (1 + {cap_rate} * {years_since_base})',
            output=cumulative_max,
        )

    # Calculate bank (unused capacity from prior years)
    # Year 1 has no bank - no prior years to accumulate from
    if years_since_base <= 1 or not prior_year_amounts:
        bank = Decimal('0')
        if trace:
            trace.add_step(
                name='Calculate cap bank',
                inputs={'years_since_base': years_since_base},
                operation='Year 1 - no prior years',
                output=bank,
                note='First year has no banked capacity',
            )
    else:
        if cap_fixed_amount is not None:
            cumulative_max_prior = base_amount + (cap_fixed_amount * (years_since_base - 1))
        else:
            cumulative_max_prior = base_amount * (1 + (cap_rate * (years_since_base - 1)))
        bank = cumulative_max_prior - cumulative_actual_prior
        bank = max(bank, Decimal('0'))  # Can't be negative

        if trace:
            trace.add_step(
                name='Calculate cap bank',
                inputs={
                    'max_prior': cumulative_max_prior,
                    'actual_prior': cumulative_actual_prior,
                },
                operation='max_prior - actual_prior',
                output=bank,
                note=f'Banked capacity: ${bank}',
            )

    # This year's limit = annual increase (calculated above) + bank
    max_this_year = annual_increase_limit + bank

    # Reference point is last year actual (or base if year 1)
    reference = prior_year_amounts[-1] if prior_year_amounts else base_amount
    max_allowed = reference + max_this_year

    if trace:
        trace.add_step(
            name='Calculate max allowed this year',
            inputs={
                'reference': reference,
                'annual_limit': annual_increase_limit,
                'bank': bank,
            },
            operation=f'{reference} + {annual_increase_limit} + {bank}',
            output=max_allowed,
        )

    # Apply cap
    if current_amount <= max_allowed:
        capped = current_amount
        cap_applied = False
        savings = Decimal('0')
        remaining_bank = max_allowed - current_amount
    else:
        capped = max_allowed
        cap_applied = True
        savings = current_amount - max_allowed
        remaining_bank = Decimal('0')

    if trace:
        trace.add_step(
            name='Apply cumulative cap',
            inputs={
                'current_amount': current_amount,
                'max_allowed': max_allowed,
            },
            operation='min(current, max_allowed)',
            output=capped,
            note=f'Cap {"applied" if cap_applied else "not needed"}, Bank remaining: ${remaining_bank}',
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=remaining_bank,
    )
```

---

## Definition of Done
- [ ] Cumulative bank accumulates
- [ ] Multi-year test passes
- [ ] Bank usage correct
- [ ] Trace shows bank balance

---

## Estimated Time: 4 hours
