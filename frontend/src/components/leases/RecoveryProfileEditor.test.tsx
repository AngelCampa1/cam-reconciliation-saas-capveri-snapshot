/**
 * RecoveryProfileEditor Tests
 *
 * Tests for recovery profile editor including:
 * - Component rendering
 * - Conditional field rendering (base year, caps)
 * - Tooltip presence
 */
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { RecoveryProfileEditor } from './RecoveryProfileEditor'
import { leaseFormSchema } from '@/pages/leases/LeaseFormSchema'
import type { LeaseFormData } from '@/pages/leases/LeaseFormSchema'

// Wrapper component to provide form context
function TestWrapper({
  children,
  defaultValues,
}: {
  children: React.ReactNode
  defaultValues?: Partial<LeaseFormData>
}) {
  const form = useForm<LeaseFormData>({
    resolver: zodResolver(leaseFormSchema),
    defaultValues: {
      tenant_name: 'Test Tenant',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      status: 'draft',
      recovery_profile: {
        pro_rata_share: '5',
        base_year: null,
        base_year_amount: '',
        gross_up_base_year: false,
        cap_type: 'none',
        cap_rate: '',
        admin_fee_percentage: '15',
      },
      ...defaultValues,
    },
  })

  return <FormProvider {...form}>{children}</FormProvider>
}

describe('RecoveryProfileEditor', () => {
  it('renders all basic fields', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(screen.getByTestId('pro-rata-share-input')).toBeInTheDocument()
    expect(screen.getByTestId('base-year-input')).toBeInTheDocument()
    expect(screen.getByTestId('cap-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('admin-fee-input')).toBeInTheDocument()
  })

  it('hides base year amount when base year is not set', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(
      screen.queryByTestId('base-year-amount-input')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('gross-up-base-year-switch')
    ).not.toBeInTheDocument()
  })

  it('shows base year amount and gross-up when base year is set', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const baseYearInput = screen.getByTestId('base-year-input')
    await user.type(baseYearInput, '2024')

    await waitFor(() => {
      expect(screen.getByTestId('base-year-amount-input')).toBeInTheDocument()
      expect(
        screen.getByTestId('gross-up-base-year-switch')
      ).toBeInTheDocument()
    })
  })

  it('hides cap rate when cap type is none', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(screen.queryByTestId('cap-rate-input')).not.toBeInTheDocument()
  })

  it('shows cap rate when cap type is not none', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const capTypeSelect = screen.getByTestId('cap-type-select')
    await user.click(capTypeSelect)

    const cumulativeOption = await screen.findByRole('option', {
      name: 'Cumulative',
    })
    await user.click(cumulativeOption)

    await waitFor(() => {
      expect(screen.getByTestId('cap-rate-input')).toBeInTheDocument()
    })
  })

  it('displays tooltips for key fields', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    // Check that tooltip labels are present (they include help text)
    expect(screen.getByText('Pro-Rata Share (%)')).toBeInTheDocument()
    expect(screen.getByText('Base Year (Optional)')).toBeInTheDocument()
    expect(screen.getByText('Cap Type')).toBeInTheDocument()
    expect(screen.getByText('Admin Fee (%) (Optional)')).toBeInTheDocument()
  })

  it('renders with pre-filled values', () => {
    render(
      <TestWrapper
        defaultValues={{
          recovery_profile: {
            pro_rata_share: '10.5',
            base_year: 2024,
            base_year_amount: '50000',
            gross_up_base_year: true,
            cap_type: 'cumulative',
            cap_rate: '5',
            admin_fee_percentage: '20',
          },
        }}
      >
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(screen.getByTestId('pro-rata-share-input')).toHaveValue(10.5)
    expect(screen.getByTestId('base-year-input')).toHaveValue(2024)
    expect(screen.getByTestId('base-year-amount-input')).toHaveValue(50000)
    expect(screen.getByTestId('gross-up-base-year-switch')).toBeChecked()
    expect(screen.getByTestId('cap-rate-input')).toHaveValue(5)
    expect(screen.getByTestId('admin-fee-input')).toHaveValue(20)
  })

  it('renders help icons for tooltips', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    // Verify help buttons are rendered (tooltip triggers with accessible names)
    const helpButtons = screen.getAllByRole('button', { name: /^Help:/i })
    expect(helpButtons.length).toBeGreaterThan(0)
  })

  it('allows toggling gross-up base year switch', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper
        defaultValues={{
          recovery_profile: {
            base_year: 2024,
          },
        }}
      >
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const grossUpSwitch = screen.getByTestId('gross-up-base-year-switch')

    // Initially unchecked
    expect(grossUpSwitch).not.toBeChecked()

    // Toggle on
    await user.click(grossUpSwitch)
    await waitFor(() => {
      expect(grossUpSwitch).toBeChecked()
    })

    // Toggle off
    await user.click(grossUpSwitch)
    await waitFor(() => {
      expect(grossUpSwitch).not.toBeChecked()
    })
  })

  it('shows cap rate for non-cumulative cap type', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const capTypeSelect = screen.getByTestId('cap-type-select')
    await user.click(capTypeSelect)

    const nonCumulativeOption = await screen.findByRole('option', {
      name: 'Non-Cumulative',
    })
    await user.click(nonCumulativeOption)

    await waitFor(() => {
      expect(screen.getByTestId('cap-rate-input')).toBeInTheDocument()
    })
  })

  it('shows cap rate for cumulative compounding cap type', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const capTypeSelect = screen.getByTestId('cap-type-select')
    await user.click(capTypeSelect)

    const compoundingOption = await screen.findByRole('option', {
      name: 'Cumulative Compounding',
    })
    await user.click(compoundingOption)

    await waitFor(() => {
      expect(screen.getByTestId('cap-rate-input')).toBeInTheDocument()
    })
  })

  it('hides base year fields when base year is cleared', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper
        defaultValues={{
          recovery_profile: {
            base_year: 2024,
          },
        }}
      >
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    // Base year fields should be visible
    expect(screen.getByTestId('base-year-amount-input')).toBeInTheDocument()
    expect(screen.getByTestId('gross-up-base-year-switch')).toBeInTheDocument()

    // Clear base year
    const baseYearInput = screen.getByTestId('base-year-input')
    await user.clear(baseYearInput)

    await waitFor(() => {
      expect(
        screen.queryByTestId('base-year-amount-input')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('gross-up-base-year-switch')
      ).not.toBeInTheDocument()
    })
  })

  it('accepts decimal values for pro-rata share', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const proRataInput = screen.getByTestId('pro-rata-share-input')
    await user.clear(proRataInput)
    await user.type(proRataInput, '5.25')

    expect(proRataInput).toHaveValue(5.25)
  })

  it('accepts decimal values for cap rate', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper
        defaultValues={{
          recovery_profile: {
            cap_type: 'cumulative',
          },
        }}
      >
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const capRateInput = screen.getByTestId('cap-rate-input')
    await user.type(capRateInput, '3.75')

    expect(capRateInput).toHaveValue(3.75)
  })

  it('accepts decimal values for admin fee', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const adminFeeInput = screen.getByTestId('admin-fee-input')
    await user.clear(adminFeeInput)
    await user.type(adminFeeInput, '15.5')

    expect(adminFeeInput).toHaveValue(15.5)
  })

  it('displays form descriptions for key fields', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(
      screen.getByText(
        'Percentage of building expenses allocated to this tenant'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('Maximum allowable expense increase')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Administrative fee on recoverable expenses')
    ).toBeInTheDocument()
  })

  it('renders all cap type options', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const capTypeSelect = screen.getByTestId('cap-type-select')
    await user.click(capTypeSelect)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'No Cap' })).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Non-Cumulative' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Cumulative' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Cumulative Compounding' })
      ).toBeInTheDocument()
    })
  })

  it('has correct input constraints for pro-rata share', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const input = screen.getByTestId('pro-rata-share-input')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('step', '0.01')
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
  })

  it('has correct input constraints for base year', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const input = screen.getByTestId('base-year-input')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('min', '1900')
    expect(input).toHaveAttribute('max', '2100')
  })

  it('has correct input constraints for cap rate', async () => {
    render(
      <TestWrapper
        defaultValues={{
          recovery_profile: {
            cap_type: 'cumulative',
          },
        }}
      >
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const input = screen.getByTestId('cap-rate-input')
    expect(input).toHaveAttribute('type', 'number')
    expect(input).toHaveAttribute('step', '0.01')
    expect(input).toHaveAttribute('min', '0')
    expect(input).toHaveAttribute('max', '100')
  })

  it('renders accounting basis select', () => {
    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    expect(screen.getByTestId('accounting-basis-select')).toBeInTheDocument()
    expect(screen.getByText('Accounting Basis (Optional)')).toBeInTheDocument()
  })

  it('renders accounting basis options', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <RecoveryProfileEditor />
      </TestWrapper>
    )

    const select = screen.getByTestId('accounting-basis-select')
    await user.click(select)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Not specified' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Cash Basis' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: 'Accrual Basis' })
      ).toBeInTheDocument()
    })
  })
})
