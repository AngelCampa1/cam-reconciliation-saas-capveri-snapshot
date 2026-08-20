/**
 * Tests for CalculationStepCard component.
 *
 * Validates calculation step display and formatting.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalculationStepCard } from './CalculationStepCard'
import type { CalculationStep } from '@/types/calculation-step'

const mockStepBasic: CalculationStep = {
  step_order: 1,
  step_name: 'Calculate Tenant Share',
  input_values: {
    total_expenses: 100000,
    pro_rata_share: 0.25,
  },
  operation: 'total_expenses * pro_rata_share',
  output_value: '25000.00',
  note: null,
}

const mockStepWithWarning: CalculationStep = {
  step_order: 2,
  step_name: 'Apply Cap',
  input_values: {
    calculated_amount: 30000,
    cap_limit: 28000,
  },
  operation: 'min(calculated_amount, cap_limit)',
  output_value: '28000.00',
  note: 'Warning: Amount exceeded cap limit and was adjusted',
}

const mockStepGrossUp: CalculationStep = {
  step_order: 3,
  step_name: 'Apply Gross-Up',
  input_values: {
    variable_expenses: 50000,
    gross_up_factor: 1.2666666667,
  },
  operation: 'variable_expenses * gross_up_factor',
  output_value: '63333.33',
}

const mockStepComplexOutput: CalculationStep = {
  step_order: 4,
  step_name: 'Calculate Pool Totals',
  input_values: {
    pool_a: 10000,
    pool_b: 15000,
  },
  operation: 'aggregate_by_pool()',
  output_value: {
    total: 25000,
    pool_a: 10000,
    pool_b: 15000,
  },
}

describe('CalculationStepCard', () => {
  it('renders step number and name', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(
      screen.getByText('Step 1: Calculate Tenant Share')
    ).toBeInTheDocument()
  })

  it('displays input values with proper formatting', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(screen.getByText('Inputs:')).toBeInTheDocument()
    expect(screen.getByText('$100,000.00')).toBeInTheDocument()
    // pro_rata_share is a ratio: with no input_units map it is inferred from the
    // key, so it renders as 0.2500, not the misleading currency "$0.25".
    expect(screen.getByText('0.2500')).toBeInTheDocument()
  })

  it('displays formula/operation', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(screen.getByText('Formula:')).toBeInTheDocument()
    expect(
      screen.getByText('total_expenses * pro_rata_share')
    ).toBeInTheDocument()
  })

  it('displays result with currency formatting', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(screen.getByText('Result:')).toBeInTheDocument()
    expect(screen.getByText('$25,000.00')).toBeInTheDocument()
  })

  it('does not show note section when note is null', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(screen.queryByText(/Note:/)).not.toBeInTheDocument()
  })

  it('shows warning indicator for steps with warning notes', () => {
    render(<CalculationStepCard step={mockStepWithWarning} />)

    expect(screen.getAllByText(/Warning:/).length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Amount exceeded cap limit and was adjusted/)
    ).toBeInTheDocument()
  })

  it('applies warning styles to card with warning note', () => {
    const { container } = render(
      <CalculationStepCard step={mockStepWithWarning} />
    )

    const card = container.querySelector('.border-warning')
    expect(card).toBeInTheDocument()
  })

  it('displays step description when available', () => {
    render(<CalculationStepCard step={mockStepBasic} />)

    expect(
      screen.getByText("Computes tenant's pro-rata share of expenses")
    ).toBeInTheDocument()
  })

  it('handles gross-up calculations', () => {
    render(<CalculationStepCard step={mockStepGrossUp} />)

    expect(screen.getByText('Step 3: Apply Gross-Up')).toBeInTheDocument()
    expect(screen.getByText('$50,000.00')).toBeInTheDocument()
    // gross_up_factor is a multiplier ratio: inferred from the key when no
    // input_units map is present, so it shows 1.2667, not currency "$1.27".
    expect(screen.getByText('1.2667')).toBeInTheDocument()
    expect(screen.getByText('$63,333.33')).toBeInTheDocument()
  })

  it('handles complex object output values', () => {
    render(<CalculationStepCard step={mockStepComplexOutput} />)

    const resultText = screen.getByText(/"total": 25000/)
    expect(resultText).toBeInTheDocument()
  })

  it('renders legacy trace rows without crashing', () => {
    const legacyStep = {
      step: 'gross_up_applied',
      factor: 1.0526,
      amount: 57894.74,
    } as unknown as CalculationStep

    render(<CalculationStepCard step={legacyStep} />)

    expect(screen.getByText('Step 1: gross_up_applied')).toBeInTheDocument()
    expect(screen.getByText('factor:')).toBeInTheDocument()
    expect(screen.getAllByText('$57,894.74').length).toBeGreaterThan(0)
  })

  it('formats negative currency values correctly', () => {
    const negativeStep: CalculationStep = {
      step_order: 1,
      step_name: 'Calculate Adjustment',
      input_values: {
        amount: -5000,
      },
      operation: 'amount',
      output_value: '-5000.00',
    }

    render(<CalculationStepCard step={negativeStep} />)

    const negativeValues = screen.getAllByText('-$5,000.00')
    expect(negativeValues.length).toBeGreaterThanOrEqual(1)
  })

  it('displays alert icon for warning steps', () => {
    const { container } = render(
      <CalculationStepCard step={mockStepWithWarning} />
    )

    const alertIcon = container.querySelector('svg')
    expect(alertIcon).toBeInTheDocument()
  })

  it('handles steps with multiple input values', () => {
    const multiInputStep: CalculationStep = {
      step_order: 1,
      step_name: 'Sum Expenses',
      input_values: {
        utilities: 10000,
        janitorial: 5000,
        insurance: 8000,
        taxes: 12000,
      },
      operation: 'sum(utilities, janitorial, insurance, taxes)',
      output_value: '35000.00',
    }

    render(<CalculationStepCard step={multiInputStep} />)

    expect(screen.getByText('$10,000.00')).toBeInTheDocument()
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
    expect(screen.getByText('$8,000.00')).toBeInTheDocument()
    expect(screen.getByText('$12,000.00')).toBeInTheDocument()
  })

  it('handles non-numeric string output values', () => {
    const stringOutputStep: CalculationStep = {
      step_order: 1,
      step_name: 'Determine Status',
      input_values: {
        threshold: 100,
      },
      operation: 'check_status()',
      output_value: 'Active',
    }

    render(<CalculationStepCard step={stringOutputStep} />)

    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('has data-testid="calculation-step-card" on the Card', () => {
    const { container } = render(<CalculationStepCard step={mockStepBasic} />)
    expect(
      container.querySelector('[data-testid="calculation-step-card"]')
    ).toBeInTheDocument()
  })

  describe('unit-aware formatting', () => {
    it('renders ratio input as plain decimal (e.g. 0.9500) NOT as currency', () => {
      const ratioStep: CalculationStep = {
        step_order: 1,
        step_name: 'Calculate occupancy rate',
        input_values: {
          total_weighted_sqft: '9500',
          total_rentable_sqft: '10000',
        },
        input_units: {
          total_weighted_sqft: 'area',
          total_rentable_sqft: 'area',
        },
        operation: 'weighted / total',
        output_value: '0.9500',
        output_unit: 'ratio',
      }

      render(<CalculationStepCard step={ratioStep} />)

      // Output should render as "0.9500", NOT "$0.95"
      expect(screen.getByText('0.9500')).toBeInTheDocument()
      // Should NOT appear as currency
      expect(screen.queryByText('$0.95')).not.toBeInTheDocument()
    })

    it('renders area input as "sq ft" and not as currency', () => {
      const areaStep: CalculationStep = {
        step_order: 1,
        step_name: 'Lease: Acme',
        input_values: {
          sqft: '10000',
          overlap_days: '365',
          total_days: '365',
        },
        input_units: {
          sqft: 'area',
          overlap_days: 'count',
          total_days: 'count',
        },
        operation: 'sqft * (overlap / total)',
        output_value: '10000',
        output_unit: 'area',
      }

      render(<CalculationStepCard step={areaStep} />)

      // sqft input rendered with "sq ft"
      const sqftValues = screen.getAllByText('10,000 sq ft')
      expect(sqftValues.length).toBeGreaterThanOrEqual(1)
      // count inputs rendered without decimals or currency
      const dayValues = screen.getAllByText('365')
      expect(dayValues.length).toBeGreaterThanOrEqual(1)
    })

    it('renders count output as plain integer', () => {
      const countStep: CalculationStep = {
        step_order: 1,
        step_name: 'Calculate period days',
        input_values: {
          period_start: '2024-01-01',
          period_end: '2024-12-31',
        },
        input_units: {
          period_start: 'date',
          period_end: 'date',
        },
        operation: 'end - start + 1',
        output_value: '366',
        output_unit: 'count',
      }

      render(<CalculationStepCard step={countStep} />)

      expect(screen.getByText('366')).toBeInTheDocument()
      // Should NOT show as currency
      expect(screen.queryByText('$366.00')).not.toBeInTheDocument()
    })

    it('infers units for a legacy snapshot step that omits the input_units map', () => {
      // Real persisted/legacy snapshots use the canonical input_values shape but
      // carry NO input_units key. Currency-by-default would show ratios and the
      // year as dollars (year: $2,023.00, pro_rata_share: $0.05). Units must be
      // inferred from the keys instead.
      const legacyTaggedlessStep = {
        step_order: 1,
        step_name: 'Calculate Tenant Share',
        input_values: {
          year: 2023,
          recoverable_expenses: 50000,
          pro_rata_share: 0.05,
          gross_up_factor: 1.0526,
          admin_fee_rate: 0.15,
        },
        operation: 'recoverable_expenses * pro_rata_share',
        output_value: '2500.00',
      } as unknown as CalculationStep

      render(<CalculationStepCard step={legacyTaggedlessStep} />)

      // year is a label, not money
      expect(screen.getByText('2023')).toBeInTheDocument()
      expect(screen.queryByText('$2,023.00')).not.toBeInTheDocument()
      // ratios render as plain decimals, never currency
      expect(screen.getByText('0.0500')).toBeInTheDocument()
      expect(screen.getByText('1.0526')).toBeInTheDocument()
      expect(screen.getByText('0.1500')).toBeInTheDocument()
      expect(screen.queryByText('$0.05')).not.toBeInTheDocument()
      // genuine dollar inputs stay currency
      expect(screen.getByText('$50,000.00')).toBeInTheDocument()
    })

    it('respects an explicit empty input_units map (engine currency default)', () => {
      // The current engine always emits input_units (possibly {}). An explicit
      // empty map must NOT trigger inference — it signals "all currency".
      const engineEmptyUnitsStep = {
        step_order: 1,
        step_name: 'Sum Expenses',
        input_values: { recoverable_expenses: 50000 },
        input_units: {},
        operation: 'sum()',
        output_value: '50000.00',
      } as unknown as CalculationStep

      render(<CalculationStepCard step={engineEmptyUnitsStep} />)

      expect(screen.getAllByText('$50,000.00').length).toBeGreaterThanOrEqual(1)
    })

    it('renders currency value as $1,234.56 when no unit tag present', () => {
      const currencyStep: CalculationStep = {
        step_order: 1,
        step_name: 'Apply pro-rata share',
        input_values: {
          increase: '100000',
          pro_rata: '0.05',
        },
        input_units: {
          pro_rata: 'ratio',
        },
        operation: '100000 * 0.05',
        output_value: '5000',
        // no output_unit => defaults to currency
      }

      render(<CalculationStepCard step={currencyStep} />)

      expect(screen.getByText('$5,000.00')).toBeInTheDocument()
      // pro_rata rendered as ratio
      expect(screen.getByText('0.0500')).toBeInTheDocument()
      // increase rendered as currency (no unit tag → default)
      expect(screen.getByText('$100,000.00')).toBeInTheDocument()
    })
  })

  describe('exact-decimal money (F-430)', () => {
    it('renders a currency output beyond MAX_SAFE_INTEGER without float drift', () => {
      // The audit trail is the surface enterprise buyers scrutinize to verify the
      // math. Backend trace values are exact decimal strings; a parseFloat round-
      // trip would silently drop the cents on a large cumulative figure.
      const bigStep: CalculationStep = {
        step_order: 1,
        step_name: 'Total Recovery',
        input_values: {},
        operation: 'sum(all_pools)',
        output_value: '9007199254740993.45',
        // no output_unit => defaults to currency
      }

      render(<CalculationStepCard step={bigStep} />)

      expect(
        screen.getAllByText('$9,007,199,254,740,993.45').length
      ).toBeGreaterThan(0)
      // parseFloat('9007199254740993.45') === 9007199254740992 → wrong dollars
      expect(
        screen.queryByText('$9,007,199,254,740,992.00')
      ).not.toBeInTheDocument()
    })
  })

  describe('rich trace shape ({ step, name, calculation, outputs })', () => {
    // Some persisted/seed traces bundle the result and its factors into a single
    // `outputs` map and use `step`/`name`/`calculation` instead of the canonical
    // field names. The card normalizes these into a readable audit step.
    it('maps step/name/calculation and the headline output', () => {
      const richStep = {
        step: 2,
        name: 'Gross-Up Calculation',
        description: 'Adjusted expenses for occupancy variance',
        calculation: '150000.00 * (0.95 / 0.88) = 161290.32',
        outputs: {
          target_occupancy: '0.95',
          actual_occupancy: '0.88',
          grossed_total: '161290.32',
        },
      } as unknown as CalculationStep

      render(<CalculationStepCard step={richStep} />)

      expect(
        screen.getByText('Step 2: Gross-Up Calculation')
      ).toBeInTheDocument()
      expect(
        screen.getByText('150000.00 * (0.95 / 0.88) = 161290.32')
      ).toBeInTheDocument()
      // grossed_total is the headline result → rendered as currency
      expect(screen.getByText('$161,290.32')).toBeInTheDocument()
      // occupancy factors render as ratios, never as currency
      expect(screen.getByText('0.9500')).toBeInTheDocument()
      expect(screen.queryByText('$0.95')).not.toBeInTheDocument()
    })

    it('renders tenant_share_* outputs as currency, not as a ratio', () => {
      const shareStep = {
        step: 3,
        name: 'Tenant Share Calculation',
        calculation: '161290.32 * 0.05 = 8064.52',
        outputs: { tenant_share_before_cap: '8064.52' },
      } as unknown as CalculationStep

      render(<CalculationStepCard step={shareStep} />)

      expect(screen.getByText('$8,064.52')).toBeInTheDocument()
      expect(screen.queryByText('8064.5200')).not.toBeInTheDocument()
    })

    it('hides Inputs and Formula for a result-only step', () => {
      const resultOnly = {
        step: 7,
        name: 'Total Recovery',
        outputs: { total_recovery: '9274.20' },
      } as unknown as CalculationStep

      render(<CalculationStepCard step={resultOnly} />)

      expect(screen.getByText('Step 7: Total Recovery')).toBeInTheDocument()
      expect(screen.getByText('$9,274.20')).toBeInTheDocument()
      // no supporting factors and no formula → those sections are omitted,
      // never shown as "result: …" echoes or a literal "calculation" string
      expect(screen.queryByText('Inputs:')).not.toBeInTheDocument()
      expect(screen.queryByText('Formula:')).not.toBeInTheDocument()
      expect(screen.queryByText('calculation')).not.toBeInTheDocument()
    })

    it('renders a boolean factor as text and a rate factor as a ratio', () => {
      const capStep = {
        step: 5,
        name: 'Apply Expense Cap',
        calculation: 'Cap allows: 7800.00 * 1.10 = 8580.00',
        outputs: {
          was_capped: false,
          cap_rate: '0.10',
          tenant_share_after_cap: '8064.52',
        },
      } as unknown as CalculationStep

      render(<CalculationStepCard step={capStep} />)

      // headline result is the post-cap share, as currency
      expect(screen.getByText('$8,064.52')).toBeInTheDocument()
      // factors: boolean → "false", rate → ratio "0.1000"
      expect(screen.getByText('false')).toBeInTheDocument()
      expect(screen.getByText('0.1000')).toBeInTheDocument()
    })
  })
})
