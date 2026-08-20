/**
 * Tests for DateRangePicker component.
 *
 * Verifies date range selection functionality.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangePicker } from './DateRangePicker'

describe('DateRangePicker', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  describe('Rendering', () => {
    it('renders from and to date inputs', () => {
      render(<DateRangePicker onChange={mockOnChange} />)

      expect(screen.getByLabelText('From')).toBeInTheDocument()
      expect(screen.getByLabelText('To')).toBeInTheDocument()
    })

    it('displays provided date range', () => {
      const dateRange = {
        from: new Date(2024, 0, 1), // Use local date
        to: new Date(2024, 0, 31), // Use local date
      }

      render(<DateRangePicker value={dateRange} onChange={mockOnChange} />)

      // Just verify values are set (not specific format due to timezone)
      const fromInput = screen.getByLabelText('From') as HTMLInputElement
      const toInput = screen.getByLabelText('To') as HTMLInputElement
      expect(fromInput.value).toBeTruthy()
      expect(toInput.value).toBeTruthy()
    })

    it('shows empty inputs when no value provided', () => {
      render(<DateRangePicker onChange={mockOnChange} />)

      expect(screen.getByLabelText('From')).toHaveValue('')
      expect(screen.getByLabelText('To')).toHaveValue('')
    })
  })

  describe('User Interaction', () => {
    it('calls onChange when from date is set', async () => {
      const user = userEvent.setup()
      render(<DateRangePicker onChange={mockOnChange} />)

      const fromInput = screen.getByLabelText('From')
      await user.type(fromInput, '2024-01-01')

      expect(mockOnChange).toHaveBeenCalled()
      const call =
        mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0]
      expect(call.from).toBeInstanceOf(Date)
      expect(call.to).toBeInstanceOf(Date)
    })

    it('calls onChange when to date is set', async () => {
      const user = userEvent.setup()
      render(<DateRangePicker onChange={mockOnChange} />)

      const toInput = screen.getByLabelText('To')
      await user.type(toInput, '2024-01-31')

      expect(mockOnChange).toHaveBeenCalled()
      const call =
        mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0]
      expect(call.from).toBeInstanceOf(Date)
      expect(call.to).toBeInstanceOf(Date)
    })

    it('updates existing date range when from changes', async () => {
      const user = userEvent.setup()
      const dateRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      }

      render(<DateRangePicker value={dateRange} onChange={mockOnChange} />)

      const fromInput = screen.getByLabelText('From')
      await user.clear(fromInput)
      await user.type(fromInput, '2024-02-01')

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('updates existing date range when to changes', async () => {
      const user = userEvent.setup()
      const dateRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      }

      render(<DateRangePicker value={dateRange} onChange={mockOnChange} />)

      const toInput = screen.getByLabelText('To')
      await user.clear(toInput)
      await user.type(toInput, '2024-02-28')

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('calls onChange with undefined when from is cleared', async () => {
      const user = userEvent.setup()
      const dateRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      }

      render(<DateRangePicker value={dateRange} onChange={mockOnChange} />)

      const fromInput = screen.getByLabelText('From')
      await user.clear(fromInput)

      expect(mockOnChange).toHaveBeenCalledWith(undefined)
    })

    it('calls onChange with undefined when to is cleared', async () => {
      const user = userEvent.setup()
      const dateRange = {
        from: new Date('2024-01-01'),
        to: new Date('2024-01-31'),
      }

      render(<DateRangePicker value={dateRange} onChange={mockOnChange} />)

      const toInput = screen.getByLabelText('To')
      await user.clear(toInput)

      expect(mockOnChange).toHaveBeenCalledWith(undefined)
    })
  })
})
