# Story 6.4: Create Safety Valve Logic

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** property accountant
**I want** a safety valve on gross-up calculations
**So that** grossed-up expenses never exceed 100% occupancy equivalent

---

## Acceptance Criteria

- [ ] **AC1**: Limits grossed-up amount to 100% occupancy equivalent
- [ ] **AC2**: Triggers when factor would exceed safe threshold
- [ ] **AC3**: Logs when safety valve activates
- [ ] **AC4**: Preserves original calculation in trace
- [ ] **AC5**: Configurable threshold

---

## Technical Specifications

**Files to Extend**:
```
backend/app/services/calculation/
└── gross_up.py (add safety_valve function)
```

**Additional gross_up.py content**:
```python
def apply_safety_valve(
    original_amount: Decimal,
    grossed_up_amount: Decimal,
    actual_occupancy: Decimal,
    target_occupancy: Decimal,
    trace: Optional[CalculationTrace] = None,
) -> Decimal:
    """
    Apply safety valve to prevent over-grossing.

    The maximum grossed-up amount is what the expense would be
    at 100% occupancy. This prevents situations where grossing up
    would result in amounts exceeding full occupancy costs.

    Example:
    - Variable expenses at 50% occupancy: $100,000
    - Grossed up to 95%: $190,000 (factor 1.9)
    - Max at 100% occupancy: $200,000
    - Since $190,000 < $200,000, no valve needed

    Edge case:
    - Expenses at 40% occupancy: $100,000
    - Grossed up to 95%: $237,500 (factor 2.375)
    - Max at 100%: $250,000
    - Still OK, but getting close to valve

    Args:
        original_amount: Expense amount before gross-up
        grossed_up_amount: Calculated grossed-up amount
        actual_occupancy: Current occupancy (0-1)
        target_occupancy: Target occupancy (0-1)
        trace: Optional calculation trace

    Returns:
        Final amount after safety valve (may be reduced)
    """
    if actual_occupancy <= 0:
        # Can't calculate max - return original
        return original_amount

    # Calculate what 100% occupancy equivalent would be
    # If we have $100k at 50% occupancy, 100% would be $200k
    max_at_full_occupancy = original_amount / actual_occupancy

    # The grossed-up amount should never exceed this max
    if grossed_up_amount > max_at_full_occupancy:
        if trace:
            trace.add_step(
                name='Safety valve triggered',
                inputs={
                    'grossed_up_amount': grossed_up_amount,
                    'max_at_100_occupancy': max_at_full_occupancy,
                },
                operation='min(grossed_up, max_100)',
                output=max_at_full_occupancy,
                note='Grossed-up amount capped at 100% occupancy equivalent',
            )
        return max_at_full_occupancy.quantize(
            Decimal('0.01'), rounding=ROUND_HALF_UP
        )

    if trace:
        trace.add_step(
            name='Safety valve check',
            inputs={
                'grossed_up_amount': grossed_up_amount,
                'max_at_100_occupancy': max_at_full_occupancy,
            },
            operation='Check if gross-up exceeds max',
            output=grossed_up_amount,
            note='Within safe limits - no adjustment needed',
        )

    return grossed_up_amount


def calculate_grossed_up_expenses(
    variable_expenses: Decimal,
    actual_occupancy: Decimal,
    config: GrossUpConfig,
    trace: Optional[CalculationTrace] = None,
) -> Decimal:
    """
    Full gross-up calculation with safety valve.

    Args:
        variable_expenses: Total variable expenses to gross up
        actual_occupancy: Actual occupancy rate (0-1)
        config: Gross-up configuration
        trace: Optional calculation trace

    Returns:
        Final grossed-up amount
    """
    # Calculate factor
    factor = calculate_gross_up_factor(actual_occupancy, config, trace)

    # Apply factor
    grossed_up = variable_expenses * factor

    if trace:
        trace.add_step(
            name='Apply gross-up factor',
            inputs={
                'variable_expenses': variable_expenses,
                'factor': factor,
            },
            operation=f'{variable_expenses} * {factor}',
            output=grossed_up,
        )

    # Apply safety valve
    final_amount = apply_safety_valve(
        original_amount=variable_expenses,
        grossed_up_amount=grossed_up,
        actual_occupancy=actual_occupancy,
        target_occupancy=config.target_occupancy,
        trace=trace,
    )

    return final_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
```

---

## Definition of Done
- [ ] Safety valve triggers correctly
- [ ] Never exceeds 100% equivalent
- [ ] Original calc preserved
- [ ] Tests verify edge cases

---

## Estimated Time: 2 hours
