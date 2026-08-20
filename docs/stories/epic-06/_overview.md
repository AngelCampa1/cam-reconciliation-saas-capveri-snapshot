# Epic 6: Financial Calculation Engine

## Epic Overview

**Goal**: Build deterministic BOMA 2024-compliant calculation logic - the core intellectual property of CapVeri.

**Why This Matters**: This is where the magic happens. Every calculation must be auditable, reproducible, and compliant with commercial real estate accounting standards. This engine replaces error-prone Excel formulas with tested, transparent logic.

**Dependencies**: Epic 5 (gl_entries table must have data)

**Delivers**:
- Gross-up calculator with safety valve
- All three cap types (non-cumulative, cumulative, compounding)
- Base year normalization
- Expense pool aggregation
- Expense stop calculations (per-sqft thresholds)
- Pro-rata share calculations
- Complete calculation trace for audit trail

---

## Stories

- [Story 6.1: Create Occupancy Calculator](./story-06.01-create-occupancy-calculator.md)
- [Story 6.2: Create Gross-Up Factor Calculator](./story-06.02-create-gross-up-factor-calculator.md)
- [Story 6.3: Create Variable Expense Filter](./story-06.03-create-variable-expense-filter.md)
- [Story 6.4: Create Safety Valve Logic](./story-06.04-create-safety-valve-logic.md)
- [Story 6.5: Create Full Gross-Up Calculation](./story-06.05-create-full-gross-up-calculation.md)
- [Story 6.6: Create Non-Cumulative Cap](./story-06.06-create-non-cumulative-cap.md)
- [Story 6.7: Create Cumulative Cap](./story-06.07-create-cumulative-cap.md)
- [Story 6.8: Create Cumulative Compounding Cap](./story-06.08-create-cumulative-compounding-cap.md)
- [Story 6.9: Create Base Year Calculation](./story-06.09-create-base-year-calculation.md)
- [Story 6.10: Create Base Year Normalization](./story-06.10-create-base-year-normalization.md)
- [Story 6.11: Create Expense Pool Aggregator](./story-06.11-create-expense-pool-aggregator.md)
- [Story 6.12: Create Allocation Percentage Handler](./story-06.12-create-allocation-percentage-handler.md)
- [Story 6.13: Create Tenant Share Calculator](./story-06.13-create-tenant-share-calculator.md)
- [Story 6.14: Create Calculation Trace Logger](./story-06.14-create-calculation-trace-logger.md)
- [Story 6.15: Create Reconciliation Orchestrator](./story-06.15-create-reconciliation-orchestrator.md)
- [Story 6.16: Create Expense Stop Calculator](./story-06.16-create-expense-stop-calculator.md)

---

## Epic 6 Completion Checklist

When all stories are complete, verify:

- [ ] Occupancy calculates weighted average
- [ ] Gross-up factor never goes below 1.0
- [ ] Safety valve prevents over-grossing
- [ ] All three cap types work correctly
- [ ] Base year calculations accurate
- [ ] Pool aggregation handles patterns
- [ ] Split allocations work
- [ ] Tenant shares include all terms
- [ ] Expense stops work per-pool
- [ ] Traces capture every step
- [ ] Orchestrator produces complete results

## CLAUDE.md Additions After Epic 6

```markdown
## Financial Calculation Rules

### Accuracy Requirements
- ALL calculation functions MUST have tests with hand-calculated expected values
- NO mocking of calculation functions in tests
- Use Decimal for all intermediate calculations (not just final)
- Every calculation MUST log to calculation_trace for audit trail

### Business Rules
- Gross-up factor MUST be >= 1.0 (never "gross down")
- Safety valve: grossed-up cannot exceed 100% occupancy equivalent
- Base year: only positive increases are recoverable
- Caps: Year 1 has no cap (no prior year reference)

### Calculation Trace
- Every function accepts optional trace parameter
- Log inputs, operation, and output for each step
- Include notes for business context
- Store trace with reconciliation snapshot
```
