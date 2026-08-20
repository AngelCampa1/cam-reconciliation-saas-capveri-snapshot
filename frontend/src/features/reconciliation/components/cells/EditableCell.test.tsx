/**
 * Tests for EditableCell component.
 *
 * Validates inline editing, keyboard navigation, and validation.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EditableCell } from './EditableCell'

describe('EditableCell', () => {
  it('renders initial value in read-only mode', () => {
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('activates edit mode on double-click', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)

    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Should show input with value
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('100.00')
  })

  it('activates edit mode on Enter key', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)

    const cell = screen.getByRole('button')
    cell.focus()
    await user.keyboard('{Enter}')

    // Should show input
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
  })

  it('cancels edit on Escape key without saving', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EditableCell value="100.00" onSave={onSave} type="currency" />)

    // Activate edit mode
    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Change value
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '200.00')

    // Press Escape
    await user.keyboard('{Escape}')

    // Should exit edit mode without saving
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('saves on blur', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <div>
        <EditableCell value="100.00" onSave={onSave} type="currency" />
        <button>Other element</button>
      </div>
    )

    // Activate edit mode
    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Change value
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '200.00')

    // Click elsewhere to blur
    await user.click(screen.getByRole('button'))

    // Should save the new value
    expect(onSave).toHaveBeenCalledWith('200.00')
  })

  it('saves on Tab key', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EditableCell value="100.00" onSave={onSave} type="currency" />)

    // Activate edit mode
    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Change value
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '200.00')

    // Press Tab
    await user.keyboard('{Tab}')

    // Should save the new value
    expect(onSave).toHaveBeenCalledWith('200.00')
  })

  it('prevents saving invalid values with validation', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const validate = (value: string) => parseFloat(value) >= 0

    render(
      <EditableCell
        value="100.00"
        onSave={onSave}
        type="currency"
        validate={validate}
      />
    )

    // Activate edit mode
    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Try to set negative value
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '-50.00')

    // Press Enter to save
    await user.keyboard('{Enter}')

    // Should not save and remain in edit mode
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows visual indicator when in edit mode', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <EditableCell value="100.00" onSave={vi.fn()} type="currency" />
    )

    // Activate edit mode
    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    // Should have editing class
    const editingElement = container.querySelector('[data-editing="true"]')
    expect(editingElement).toBeInTheDocument()
  })

  it('uses numeric inputMode for currency type', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)

    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('inputMode', 'decimal')
  })

  it('uses numeric inputMode for number type', async () => {
    const user = userEvent.setup()
    render(<EditableCell value={75} onSave={vi.fn()} type="number" />)

    const cell = screen.getByText('75')
    await user.dblClick(cell)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('inputMode', 'decimal')
  })

  it('matches input width to cell', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)

    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('w-full')
  })

  it('handles text type correctly', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<EditableCell value="Test Value" onSave={onSave} type="text" />)

    const cell = screen.getByText('Test Value')
    await user.dblClick(cell)

    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'New Value')
    await user.keyboard('{Enter}')

    expect(onSave).toHaveBeenCalledWith('New Value')
  })

  it('auto-focuses input when entering edit mode', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="100.00" onSave={vi.fn()} type="currency" />)

    const cell = screen.getByText('$100.00')
    await user.dblClick(cell)

    const input = screen.getByRole('textbox')
    expect(input).toHaveFocus()
  })
})
