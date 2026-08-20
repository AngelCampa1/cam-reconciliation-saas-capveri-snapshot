# Story 6.10: Create Base Year Normalization

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** landlord
**I want** base year auto-grossed up if occupancy was low
**So that** tenants don't get unfair advantage from low base year

---

## Acceptance Criteria

- [ ] **AC1**: Normalizes base year if occupancy < target_occupancy (default 95%)
- [ ] **AC2**: Uses same gross-up formula as current year
- [ ] **AC3**: Only normalizes if `gross_up_base_year = true`
- [ ] **AC4**: Trace shows normalization
- [ ] **AC5**: Original base preserved in trace

---

## Technical Specifications

**Files to Extend**:
```
backend/app/services/calculation/
└── base_year.py (add normalization)
```

**Additional base_year.py content**:
```python
from app.services.calculation.gross_up import (
    GrossUpConfig,
    calculate_gross_up_factor,
)


class BaseYearNormalizationInput(BaseModel):
    """Input for base year normalization."""
    raw_base_year_amount: Decimal
    base_year_occupancy: Decimal
    target_occupancy: Decimal = Decimal('0.95')
    should_normalize: bool = False


def normalize_base_year(
    input_data: BaseYearNormalizationInput,
    trace: Optional[CalculationTrace] = None,
) -> Decimal:
    """
    Normalize (gross up) base year if needed.

    If the base year had lower occupancy than target,
    the expenses may have been artificially low. Normalizing
    brings them to what they "would have been" at target occupancy.

    Args:
        input_data: Base year info and normalization settings
        trace: Optional calculation trace

    Returns:
        Normalized base year amount
    """
    if not input_data.should_normalize:
        if trace:
            trace.add_step(
                name='Base year normalization',
                inputs={'should_normalize': False},
                operation='Skip normalization (not enabled)',
                output=input_data.raw_base_year_amount,
            )
        return input_data.raw_base_year_amount

    # Check if normalization is needed
    if input_data.base_year_occupancy >= input_data.target_occupancy:
        if trace:
            trace.add_step(
                name='Base year normalization',
                inputs={
                    'base_occupancy': input_data.base_year_occupancy,
                    'target': input_data.target_occupancy,
                },
                operation='No normalization needed (at target)',
                output=input_data.raw_base_year_amount,
            )
        return input_data.raw_base_year_amount

    # Calculate gross-up factor for base year
    config = GrossUpConfig(
        target_occupancy=input_data.target_occupancy,
        min_factor=Decimal('1.0'),
    )
    factor = calculate_gross_up_factor(
        input_data.base_year_occupancy,
        config,
        trace,
    )

    # Apply factor to base year
    normalized = input_data.raw_base_year_amount * factor
    normalized = normalized.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Normalize base year',
            inputs={
                'raw_base': input_data.raw_base_year_amount,
                'factor': factor,
            },
            operation=f'{input_data.raw_base_year_amount} * {factor}',
            output=normalized,
            note=f'Base year grossed up from {input_data.base_year_occupancy:.1%} to {input_data.target_occupancy:.1%}',
        )

    return normalized
```

---

## Definition of Done
- [ ] Normalization triggers correctly
- [ ] Uses gross-up formula
- [ ] Config flag respected
- [ ] Original preserved in trace

---

## Estimated Time: 3 hours
