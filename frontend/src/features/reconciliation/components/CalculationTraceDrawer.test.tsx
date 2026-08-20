/**
 * Tests for CalculationTraceDrawer component.
 *
 * Validates calculation trace drawer display and interactions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalculationTraceDrawer } from './CalculationTraceDrawer'
import type { CalculationStep } from '@/types/calculation-step'

const mockSteps: CalculationStep[] = [
  {
    step_order: 1,
    step_name: 'Calculate Actual Occupancy',
    input_values: {
      occupied_area: 75000,
      total_area: 100000,
    },
    operation: 'occupied_area / total_area',
    output_value: '0.75',
  },
  {
    step_order: 2,
    step_name: 'Calculate Gross-Up Factor',
    input_values: {
      target_occupancy: 0.95,
      actual_occupancy: 0.75,
    },
    operation: 'target_occupancy / actual_occupancy',
    output_value: '1.2666666667',
  },
  {
    step_order: 3,
    step_name: 'Apply Gross-Up',
    input_values: {
      variable_expenses: 50000,
      gross_up_factor: 1.2666666667,
    },
    operation: 'variable_expenses * gross_up_factor',
    output_value: '63333.33',
    note: 'Applied to variable expenses only',
  },
]

describe('CalculationTraceDrawer', () => {
  beforeEach(() => {
    // Mock window.print
    vi.stubGlobal('print', vi.fn())
  })

  it('renders drawer when open', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(screen.getByText('Calculation Breakdown')).toBeInTheDocument()
  })

  it('does not render drawer when closed', () => {
    render(
      <CalculationTraceDrawer
        isOpen={false}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(screen.queryByText('Calculation Breakdown')).not.toBeInTheDocument()
  })

  it('displays all calculation steps', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(
      screen.getByText('Step 1: Calculate Actual Occupancy')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Step 2: Calculate Gross-Up Factor')
    ).toBeInTheDocument()
    expect(screen.getByText('Step 3: Apply Gross-Up')).toBeInTheDocument()
  })

  it('displays final calculated value', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(screen.getByText('Final Amount:')).toBeInTheDocument()
    // Multiple instances of the value (in steps and final), just check it exists
    expect(screen.getAllByText('$63,333.33').length).toBeGreaterThan(0)
  })

  it('displays tenant name and pool name when provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
        tenantName="Acme Corp"
        poolName="CAM Pool"
      />
    )

    expect(screen.getByText('Acme Corp - CAM Pool')).toBeInTheDocument()
  })

  it('displays an estimated lease terms note when provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
        termsNote="We used tenant SF divided by property SF. Add lease terms to firm this up."
      />
    )

    expect(screen.getByText('Starter lease terms')).toBeInTheDocument()
    expect(
      screen.getByText(
        'We used tenant SF divided by property SF. Add lease terms to firm this up.'
      )
    ).toBeInTheDocument()
  })

  it('displays only tenant name when pool name not provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
        tenantName="Acme Corp"
      />
    )

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('displays default description when neither tenant nor pool provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(
      screen.getByText('Step-by-step calculation details')
    ).toBeInTheDocument()
  })

  it('calls onClose when drawer is closed via Sheet', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={onClose}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    // Close button in Sheet component
    const closeButton = screen.getByRole('button', { name: /close/i })
    await user.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows print button when steps are available', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(screen.getByText('Print Summary')).toBeInTheDocument()
  })

  it('calls window.print when print button clicked', async () => {
    const user = userEvent.setup()
    const printMock = vi.fn()
    vi.stubGlobal('print', printMock)

    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    const printButton = screen.getByText('Print Summary')
    await user.click(printButton)

    expect(printMock).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no steps provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={[]}
        finalValue="0.00"
      />
    )

    expect(
      screen.getByText('No calculation steps available.')
    ).toBeInTheDocument()
  })

  it('does not show final value when no steps provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={[]}
        finalValue="0.00"
      />
    )

    expect(screen.queryByText('Final Amount:')).not.toBeInTheDocument()
  })

  it('does not show print button when no steps provided', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={[]}
        finalValue="0.00"
      />
    )

    expect(screen.queryByText('Print Summary')).not.toBeInTheDocument()
  })

  it('formats negative final values correctly', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="-5000.00"
      />
    )

    expect(screen.getByText('-$5,000.00')).toBeInTheDocument()
  })

  it('renders a final amount beyond MAX_SAFE_INTEGER without float drift (F-430)', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="9007199254740993.45"
      />
    )

    expect(screen.getByText('$9,007,199,254,740,993.45')).toBeInTheDocument()
    expect(
      screen.queryByText('$9,007,199,254,740,992.00')
    ).not.toBeInTheDocument()
  })

  it('handles numeric final values', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue={100000 as any} // Test numeric input
      />
    )

    // Multiple instances may exist in steps, just check final amount is displayed
    expect(screen.getByText('Final Amount:')).toBeInTheDocument()
    expect(screen.getAllByText('$100,000.00').length).toBeGreaterThan(0)
  })

  it('has data-testid="calculation-trace-drawer" on SheetContent', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
      />
    )

    expect(
      document.querySelector('[data-testid="calculation-trace-drawer"]')
    ).toBeInTheDocument()
  })

  it('shows support context for disputed calculation review', () => {
    render(
      <CalculationTraceDrawer
        isOpen={true}
        onClose={vi.fn()}
        steps={mockSteps}
        finalValue="63333.33"
        tenantName="Acme Corp"
        poolName="CAM Pool"
      />
    )

    expect(screen.getByText('Share with support')).toBeInTheDocument()
    expect(
      screen.getByText(/Acme Corp - CAM Pool - 3 calculation steps/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /send this trace when you escalate a disputed CAM charge/i
      )
    ).toBeInTheDocument()
  })
})
