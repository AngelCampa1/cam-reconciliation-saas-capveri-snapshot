# Story 6.8: Create Cumulative Compounding Cap

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** lease with a cumulative compounding cap
**I want** the base amount to grow each year
**So that** long-term leases have fair cap treatment

---

## Acceptance Criteria

- [ ] **AC1**: Base grows at compound rate each year
- [ ] **AC2**: Formula: base * (1 + rate)^years
- [ ] **AC3**: 5-year compound test passes
- [ ] **AC4**: Still tracks banked capacity
- [ ] **AC5**: Trace shows compounding calculation
- [ ] **AC6**: Supports fixed dollar caps for consistency

---

## Technical Specifications

**Files to Extend**:
```
backend/app/services/calculation/
└── caps.py (add compounding function)
```

**Additional caps.py content**:
```python
def calculate_cumulative_compounding_cap(
    current_amount: Decimal,
    base_amount: Decimal,
    cap_rate: Optional[Decimal] = None,
    cap_fixed_amount: Optional[Decimal] = None,
    years_since_base: int = 1,
    prior_year_amounts: List[Decimal] = None,
    trace: Optional[CalculationTrace] = None,
) -> CapResult:
    """
    Calculate cumulative compounding cap.

    Like cumulative cap, but the base grows exponentially:
    max_year_N = base * (1 + cap_rate)^N

    Example (5% cap, $100k base):
    Year 1: Max = $100k * 1.05 = $105.0k
    Year 2: Max = $100k * 1.05^2 = $110.25k
    Year 3: Max = $100k * 1.05^3 = $115.76k

    Args:
        current_amount: This year's calculated expense
        base_amount: Base year amount
        cap_rate: Annual cap rate
        years_since_base: Years since base year
        prior_year_amounts: All prior year actual amounts
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount
    """
    if prior_year_amounts is None:
        prior_year_amounts = []

    # Calculate compounded max
    if cap_fixed_amount is not None:
        # For fixed dollar caps, use additive compounding: base + N * fixed
        # This is less common but supported for consistency
        max_allowed = base_amount + (cap_fixed_amount * years_since_base)
        compound_factor = 1 + (cap_fixed_amount * years_since_base / base_amount) if base_amount > 0 else Decimal('1')
    elif cap_rate is not None:
        compound_factor = (1 + cap_rate) ** years_since_base
        max_allowed = base_amount * Decimal(str(compound_factor))
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")
    max_allowed = max_allowed.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Calculate compounding cap',
            inputs={
                'base_amount': base_amount,
                'cap_rate': cap_rate,
                'years': years_since_base,
            },
            operation=f'{base_amount} * (1 + {cap_rate})^{years_since_base}',
            output=max_allowed,
            note=f'Compound factor: {compound_factor:.4f}',
        )

    # Calculate bank from prior years
    cumulative_actual_prior = sum(prior_year_amounts)
    if cap_fixed_amount is not None:
        cumulative_max_prior = sum(
            base_amount + (cap_fixed_amount * y)
            for y in range(1, years_since_base)
        )
    else:
        cumulative_max_prior = sum(
            base_amount * Decimal(str((1 + cap_rate) ** y))
            for y in range(1, years_since_base)
        )
    bank = cumulative_max_prior - cumulative_actual_prior
    bank = max(bank, Decimal('0'))

    # This year's max includes any banked amount
    effective_max = max_allowed + bank

    if trace:
        trace.add_step(
            name='Add banked capacity',
            inputs={
                'max_allowed': max_allowed,
                'bank': bank,
            },
            operation='max_allowed + bank',
            output=effective_max,
        )

    # Apply cap
    if current_amount <= effective_max:
        capped = current_amount
        cap_applied = False
        savings = Decimal('0')
        remaining_bank = effective_max - current_amount
    else:
        capped = effective_max
        cap_applied = True
        savings = current_amount - effective_max
        remaining_bank = Decimal('0')

    if trace:
        trace.add_step(
            name='Apply compounding cap',
            inputs={
                'current_amount': current_amount,
                'effective_max': effective_max,
            },
            operation='min(current, effective_max)',
            output=capped,
            note=f'{"Capped" if cap_applied else "Under cap"}',
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=remaining_bank,
    )


def apply_cap(
    cap_input: CapInput,
    trace: Optional[CalculationTrace] = None,
) -> CapResult:
    """
    Apply the appropriate cap type.

    Router function that calls the correct cap calculator.
    """
    if cap_input.cap_type == CapType.NONE:
        return CapResult(
            original_amount=cap_input.current_year_amount,
            capped_amount=cap_input.current_year_amount,
            cap_applied=False,
            savings_from_cap=Decimal('0'),
            cap_headroom=Decimal('0'),
        )

    elif cap_input.cap_type == CapType.NON_CUMULATIVE:
        return calculate_non_cumulative_cap(
            current_amount=cap_input.current_year_amount,
            prior_amount=cap_input.prior_year_amount,
            cap_rate=cap_input.cap_rate,
            trace=trace,
        )

    elif cap_input.cap_type == CapType.CUMULATIVE:
        return calculate_cumulative_cap(
            current_amount=cap_input.current_year_amount,
            base_amount=cap_input.base_year_amount or Decimal('0'),
            cap_rate=cap_input.cap_rate,
            years_since_base=len(cap_input.all_prior_amounts or []) + 1,
            prior_year_amounts=cap_input.all_prior_amounts or [],
            trace=trace,
        )

    elif cap_input.cap_type == CapType.CUMULATIVE_COMPOUNDING:
        return calculate_cumulative_compounding_cap(
            current_amount=cap_input.current_year_amount,
            base_amount=cap_input.base_year_amount or Decimal('0'),
            cap_rate=cap_input.cap_rate,
            years_since_base=len(cap_input.all_prior_amounts or []) + 1,
            prior_year_amounts=cap_input.all_prior_amounts or [],
            trace=trace,
        )

    else:
        raise ValueError(f"Unknown cap type: {cap_input.cap_type}")
```

---

## Definition of Done
- [ ] Compounding formula correct
- [ ] 5-year test passes
- [ ] Bank still works
- [ ] Trace shows compound

---

## Estimated Time: 4 hours
