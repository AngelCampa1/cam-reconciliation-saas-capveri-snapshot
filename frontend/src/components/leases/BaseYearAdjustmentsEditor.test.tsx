/**
 * BaseYearAdjustmentsEditor Tests
 *
 * Tests for the dynamic list editor for new-service base year adjustments.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { BaseYearAdjustmentsEditor } from './BaseYearAdjustmentsEditor'
import { BaseYearAdjustmentItemSchema } from '@/types/lease-recovery-profile'

const testSchema = z.object({
  recovery_profile: z.object({
    base_year_adjustments: z.array(BaseYearAdjustmentItemSchema).default([]),
  }),
})

type TestFormData = z.infer<typeof testSchema>

function TestWrapper({
  defaultAdjustments = [],
}: {
  defaultAdjustments?: TestFormData['recovery_profile']['base_year_adjustments']
}) {
  const form = useForm<TestFormData>({
    resolver: zodResolver(testSchema),
    defaultValues: {
      recovery_profile: {
        base_year_adjustments: defaultAdjustments,
      },
    },
  })

  return (
    <FormProvider {...form}>
      <BaseYearAdjustmentsEditor fieldPrefix="recovery_profile" />
    </FormProvider>
  )
}

describe('BaseYearAdjustmentsEditor', () => {
  it('renders empty state message when no adjustments', () => {
    render(<TestWrapper />)
    expect(screen.getByText(/No adjustments. Add one/i)).toBeInTheDocument()
  })

  it('renders add adjustment button', () => {
    render(<TestWrapper />)
    expect(screen.getByTestId('add-adjustment-button')).toBeInTheDocument()
  })

  it('adds a new adjustment row when clicking Add adjustment', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    await user.click(screen.getByTestId('add-adjustment-button'))

    expect(screen.getByTestId('adjustment-0-service-name')).toBeInTheDocument()
    expect(
      screen.getByTestId('adjustment-0-imputed-amount')
    ).toBeInTheDocument()
    expect(screen.getByTestId('adjustment-0-justification')).toBeInTheDocument()
  })

  it('renders pre-populated adjustments from default values', () => {
    render(
      <TestWrapper
        defaultAdjustments={[
          {
            service_name: '24/7 Security',
            imputed_amount: '18000',
            justification: 'Added July 2023',
          },
        ]}
      />
    )

    expect(screen.getByTestId('adjustment-0-service-name')).toBeInTheDocument()
    expect(
      screen.queryByText(/No adjustments. Add one/i)
    ).not.toBeInTheDocument()
  })

  it('removes an adjustment row when clicking remove', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    // Add an item
    await user.click(screen.getByTestId('add-adjustment-button'))
    expect(screen.getByTestId('adjustment-0-service-name')).toBeInTheDocument()

    // Remove it
    await user.click(screen.getByTestId('adjustment-0-remove'))
    expect(
      screen.queryByTestId('adjustment-0-service-name')
    ).not.toBeInTheDocument()
    expect(screen.getByText(/No adjustments. Add one/i)).toBeInTheDocument()
  })
})
