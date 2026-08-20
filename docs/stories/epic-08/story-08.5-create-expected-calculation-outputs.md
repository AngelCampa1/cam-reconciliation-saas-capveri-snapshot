# Story 8.5: Create Expected Calculation Outputs

## Story Info
- **Epic**: Test Fixture Generation
- **Estimated Hours**: 4
- **Dependencies**: None (foundational test data)
- **Status**: `pending`

## User Story
As a developer, I need hand-calculated expected results for calculation fixtures so that I can verify the calculation engine produces correct outputs.

## Acceptance Criteria
- JSON files with expected results for each test scenario
- Hand-calculated values verified by domain expert
- Includes all intermediate calculation steps
- Covers: gross-up scenarios, all three cap types, base year calculations
- Edge cases: zero base year, 100% occupancy, negative variances
- Values match to 2 decimal places

## Technical Specifications
Create `tests/fixtures/generators/calculation_expected_generator.py` with:
- CalculationExpectedGenerator class
- Gross-up scenario calculations
- Cap scenario calculations (non-cumulative, cumulative, cumulative-compounding)
- Base year scenario calculations
- Full reconciliation end-to-end scenario
- Edge case scenarios

Scenarios to generate:

Gross-up:
- Basic: 90% occupancy to 95% target
- High occupancy: 97% occupancy (no gross-up)
- Safety valve: Very low occupancy (50%) with cap

Caps (for 4-year period):
- Non-cumulative: Each year compared to prior year only
- Cumulative: Unused capacity carries forward
- Cumulative-compounding: Base grows by cap rate each year

Base year:
- Standard: With increase over base
- Decrease: Current year less than base (zero charge)
- Normalization: Base year normalized for low occupancy

Full reconciliation:
- Complete example with all adjustments
- Gross-up applied
- Cap applied
- Admin fee calculated

Edge cases:
- First year tenant (no base year)
- 100% occupancy (no gross-up)
- Zero pro-rata share (error case)
- Negative variance (credit due)

All values calculated by hand and documented with formulas.

## Test Cases
- All gross-up scenarios calculated correctly
- All cap scenarios calculated correctly
- All base year scenarios calculated correctly
- Full reconciliation scenario matches expected
- Edge cases documented with expected behavior
- All values match to 2 decimal places
- Formulas documented for each calculation
- Intermediate steps captured for debugging

## Definition of Done
- [ ] Gross-up scenarios with expected values created
- [ ] All three cap type scenarios documented
- [ ] Base year scenarios including normalization
- [ ] Full reconciliation example with all steps
- [ ] Edge cases documented with expected behavior
- [ ] All values verified by hand calculation
- [ ] Calculation engine tests use these fixtures
