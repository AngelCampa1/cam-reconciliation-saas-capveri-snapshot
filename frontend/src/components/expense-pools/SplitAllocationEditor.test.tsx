/**
 * Tests for SplitAllocationEditor component
 *
 * Covers:
 * - Rendering with no allocations
 * - Adding allocations
 * - Deleting allocations
 * - Form field interactions
 * - Percentage validation display
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'

import { SplitAllocationEditor } from './SplitAllocationEditor'
import type { ExpensePool } from '@/types'

// Mock expense pools for testing
const mockPools: ExpensePool[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    property_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Utilities Pool',
    pool_type: 'operating',
    is_gross_up_applicable: true,
    gross_up_target: '0.95',
    description: 'Utilities expenses',
    parent_pool_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    property_id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Janitorial Pool',
    pool_type: 'operating',
    is_gross_up_applicable: true,
    gross_up_target: '0.95',
    description: 'Janitorial expenses',
    parent_pool_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

// Wrapper component that provides form context
function TestWrapper({
  children,
  defaultValues = {},
}: {
  children: React.ReactNode
  defaultValues?: Record<string, unknown>
}) {
  const methods = useForm({
    defaultValues: {
      allocations: [],
      ...defaultValues,
    },
  })

  return <FormProvider {...methods}>{children}</FormProvider>
}

describe('SplitAllocationEditor', () => {
  it('renders empty state when no allocations', () => {
    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    expect(screen.getByText('No splits yet')).toBeInTheDocument()
    expect(
      screen.getByText('Add allocations to split expenses across pools.')
    ).toBeInTheDocument()
  })

  it('shows add allocation button', () => {
    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    expect(
      screen.getByRole('button', { name: /add allocation/i })
    ).toBeInTheDocument()
  })

  it('adds new allocation when add button clicked', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)

    // Check that allocation fields appear
    expect(screen.getByLabelText(/target pool/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/percentage/i)).toBeInTheDocument()
  })

  it('removes allocation when delete button clicked', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add an allocation
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)

    // Find and click delete button
    const deleteButton = screen.getByRole('button', {
      name: /remove allocation/i,
    })
    await user.click(deleteButton)

    // Empty state should reappear
    expect(screen.getByText('No splits yet')).toBeInTheDocument()
  })

  it('shows validation error when percentages do not sum to 100', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add two allocations
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)
    await user.click(addButton)

    // Get all percentage inputs
    const percentageInputs = screen.getAllByLabelText(/percentage/i)

    // Set values that don't sum to 100
    await user.clear(percentageInputs[0])
    await user.type(percentageInputs[0], '40')

    await user.clear(percentageInputs[1])
    await user.type(percentageInputs[1], '50')

    // Validation error should appear
    expect(
      screen.getByText(/percentage allocations must sum to 100%/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/current total: 90\.00%/i)).toBeInTheDocument()
  })

  it('does not show validation error when percentages sum to 100', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add two allocations
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)
    await user.click(addButton)

    // Get all percentage inputs
    const percentageInputs = screen.getAllByLabelText(/percentage/i)

    // Set values that sum to 100
    await user.clear(percentageInputs[0])
    await user.type(percentageInputs[0], '60')

    await user.clear(percentageInputs[1])
    await user.type(percentageInputs[1], '40')

    // No validation error should appear
    expect(
      screen.queryByText(/percentage allocations must sum to 100%/i)
    ).not.toBeInTheDocument()
  })

  it('shows available pools in target pool select', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add an allocation
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)

    // Click on the target pool select
    const targetPoolSelect = screen.getByRole('combobox', {
      name: /target pool/i,
    })
    await user.click(targetPoolSelect)

    // Check that pools appear in dropdown
    expect(screen.getByText('Utilities Pool')).toBeInTheDocument()
    expect(screen.getByText('Janitorial Pool')).toBeInTheDocument()
  })

  it('changes input label when allocation type changes to fixed amount', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add an allocation
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)

    // Initially should show percentage label
    expect(screen.getByLabelText(/percentage \(%\)/i)).toBeInTheDocument()

    // Change allocation type to fixed amount
    const typeSelect = screen.getByRole('combobox', { name: /type/i })
    await user.click(typeSelect)

    const fixedAmountOption = screen.getByText('Fixed Amount')
    await user.click(fixedAmountOption)

    // Label should change to amount
    expect(screen.getByLabelText(/amount \(\$\)/i)).toBeInTheDocument()
  })

  it('shows help text about precision handling for percentages', async () => {
    const user = userEvent.setup()

    render(
      <TestWrapper>
        <SplitAllocationEditor availablePools={mockPools} />
      </TestWrapper>
    )

    // Add an allocation (default is percentage type)
    const addButton = screen.getByRole('button', { name: /add allocation/i })
    await user.click(addButton)

    // Help text should appear
    expect(
      screen.getByText(
        /the last allocation will automatically receive any remainder/i
      )
    ).toBeInTheDocument()
  })
})
