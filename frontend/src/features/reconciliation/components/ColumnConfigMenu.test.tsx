/**
 * Tests for ColumnConfigMenu component.
 *
 * Validates column visibility toggles and reset functionality.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnConfigMenu } from './ColumnConfigMenu'

describe('ColumnConfigMenu', () => {
  const mockColumns = [
    { id: 'pool_name', label: 'Pool Name' },
    { id: 'total_expenses', label: 'Total Expenses' },
    { id: 'recoverable_amount', label: 'Recoverable Amount' },
    { id: 'variance', label: 'Variance' },
  ]

  it('renders column config trigger button', () => {
    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{}}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument()
  })

  it('shows column list when opened', async () => {
    const user = userEvent.setup()
    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{}}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    expect(screen.getByText('Pool Name')).toBeInTheDocument()
    expect(screen.getByText('Total Expenses')).toBeInTheDocument()
    expect(screen.getByText('Recoverable Amount')).toBeInTheDocument()
    expect(screen.getByText('Variance')).toBeInTheDocument()
  })

  it('shows checked state for visible columns', async () => {
    const user = userEvent.setup()
    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{ pool_name: false }}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    const checkboxes = screen.getAllByRole('menuitemcheckbox')

    // pool_name should be unchecked (false)
    expect(checkboxes[0]).not.toBeChecked()

    // Others should be checked (true/undefined = visible)
    expect(checkboxes[1]).toBeChecked()
    expect(checkboxes[2]).toBeChecked()
    expect(checkboxes[3]).toBeChecked()
  })

  it('calls onVisibilityChange when toggling column', async () => {
    const user = userEvent.setup()
    const onVisibilityChange = vi.fn()

    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{}}
        onVisibilityChange={onVisibilityChange}
        onReset={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    const checkboxes = screen.getAllByRole('menuitemcheckbox')
    await user.click(checkboxes[0]) // Toggle pool_name

    expect(onVisibilityChange).toHaveBeenCalledWith('pool_name')
  })

  it('disables checkbox when at minimum visible columns', async () => {
    const user = userEvent.setup()

    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{ pool_name: false }}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
        minVisibleColumns={3}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    const checkboxes = screen.getAllByRole('menuitemcheckbox')

    // With 3 visible (minimum), can't hide more. Radix marks a disabled
    // menuitemcheckbox with aria-disabled rather than the DOM disabled prop.
    expect(checkboxes[1]).toHaveAttribute('aria-disabled', 'true')
    expect(checkboxes[2]).toHaveAttribute('aria-disabled', 'true')
    expect(checkboxes[3]).toHaveAttribute('aria-disabled', 'true')

    // Can still re-show the hidden one
    expect(checkboxes[0]).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('exposes each column toggle as an accessible checkbox menu item', async () => {
    const user = userEvent.setup()
    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{ pool_name: false }}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /columns/i }))

    const items = screen.getAllByRole('menuitemcheckbox')
    expect(items).toHaveLength(mockColumns.length)
    // Screen readers learn the on/off state from aria-checked, not just a glyph.
    expect(items[0]).toHaveAttribute('aria-checked', 'false')
    expect(items[1]).toHaveAttribute('aria-checked', 'true')
  })

  it('shows reset button', async () => {
    const user = userEvent.setup()
    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{}}
        onVisibilityChange={vi.fn()}
        onReset={vi.fn()}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    expect(screen.getByText(/reset/i)).toBeInTheDocument()
  })

  it('calls onReset when reset button clicked', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()

    render(
      <ColumnConfigMenu
        columns={mockColumns}
        columnVisibility={{ pool_name: false }}
        onVisibilityChange={vi.fn()}
        onReset={onReset}
      />
    )

    const trigger = screen.getByRole('button', { name: /columns/i })
    await user.click(trigger)

    const resetButton = screen.getByText(/reset/i)
    await user.click(resetButton)

    expect(onReset).toHaveBeenCalled()
  })
})
