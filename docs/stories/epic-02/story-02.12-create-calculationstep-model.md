# Story 2.12: Create CalculationStep Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As an** auditor
**I want** each calculation step recorded with inputs and outputs
**So that** I can verify the calculation logic and trace any discrepancies

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `step_order`: int
  - `step_name`: str (e.g., "Calculate Gross-Up Factor")
  - `input_values`: dict (inputs to calculation)
  - `operation`: str (formula or description)
  - `output_value`: Decimal or dict
  - `note`: Optional[str] (explanation or warning)
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Supports nested values in input/output for complex steps

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── calculation_step.py

frontend/src/types/
└── calculation-step.ts
```

**backend/app/models/calculation_step.py**:
```python
from decimal import Decimal
from typing import Any, Optional, Union

from pydantic import BaseModel, Field

class CalculationStep(BaseModel):
    """
    A single step in a reconciliation calculation.
    Used for audit trail and debugging.
    """
    step_order: int = Field(..., ge=1)
    step_name: str = Field(..., min_length=1, max_length=100)
    input_values: dict[str, Any] = Field(
        ...,
        description="Input values used in this step"
    )
    operation: str = Field(
        ...,
        max_length=500,
        description="Formula or description of the operation"
    )
    output_value: Union[Decimal, dict[str, Any]] = Field(
        ...,
        description="Result of the calculation step"
    )
    note: Optional[str] = Field(
        None,
        max_length=500,
        description="Explanation, warning, or clarification"
    )

# Example calculation trace:
# [
#   CalculationStep(
#     step_order=1,
#     step_name="Calculate Actual Occupancy",
#     input_values={"occupied_sqft": 45000, "total_sqft": 50000},
#     operation="occupied_sqft / total_sqft",
#     output_value=Decimal("0.90"),
#     note=None
#   ),
#   CalculationStep(
#     step_order=2,
#     step_name="Calculate Gross-Up Factor",
#     input_values={"target_occupancy": 0.95, "actual_occupancy": 0.90},
#     operation="target_occupancy / actual_occupancy",
#     output_value=Decimal("1.0556"),
#     note="Gross-up factor capped at 1.0556 (95% / 90%)"
#   ),
# ]
```

**frontend/src/types/calculation-step.ts**:
```typescript
import { z } from 'zod'

export const CalculationStepSchema = z.object({
  step_order: z.number().int().min(1),
  step_name: z.string().min(1).max(100),
  input_values: z.record(z.unknown()),
  operation: z.string().max(500),
  output_value: z.union([
    z.string(), // Decimal as string
    z.record(z.unknown()), // Complex output
  ]),
  note: z.string().max(500).nullable().optional(),
})

export type CalculationStep = z.infer<typeof CalculationStepSchema>
```

## Definition of Done

- [x] Steps can represent any calculation
- [x] Inputs and outputs are flexible
- [x] Notes provide audit context

## Estimated Time

2 hours
