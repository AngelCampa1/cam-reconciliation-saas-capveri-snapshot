import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from './select'

describe('Select', () => {
  const renderSelect = (
    props: {
      value?: string
      onValueChange?: (value: string) => void
      placeholder?: string
      disabled?: boolean
      clearable?: boolean
      onClear?: () => void
    } = {}
  ) => {
    return render(
      <Select
        value={props.value}
        onValueChange={props.onValueChange}
        disabled={props.disabled}
      >
        <SelectTrigger clearable={props.clearable} onClear={props.onClear}>
          <SelectValue placeholder={props.placeholder || 'Select option'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="cherry">Cherry</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  describe('Rendering', () => {
    it('should render select trigger', () => {
      renderSelect()

      expect(screen.getByTestId('select-trigger')).toBeInTheDocument()
    })

    it('should display placeholder when no value selected', () => {
      renderSelect({ placeholder: 'Choose fruit' })

      expect(screen.getByText('Choose fruit')).toBeInTheDocument()
    })

    it('should display selected value', () => {
      renderSelect({ value: 'apple' })

      expect(screen.getByText('Apple')).toBeInTheDocument()
    })
  })

  describe('Interaction', () => {
    it('should open dropdown on click', async () => {
      const user = userEvent.setup()
      renderSelect()

      await user.click(screen.getByTestId('select-trigger'))

      expect(screen.getByTestId('select-content')).toBeInTheDocument()
    })

    it('should call onValueChange when option selected', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      renderSelect({ onValueChange })

      await user.click(screen.getByTestId('select-trigger'))
      await user.click(screen.getByTestId('select-item-banana'))

      expect(onValueChange).toHaveBeenCalledWith('banana')
    })

    it('should close dropdown after selection', async () => {
      const user = userEvent.setup()
      renderSelect({ onValueChange: vi.fn() })

      await user.click(screen.getByTestId('select-trigger'))
      await user.click(screen.getByTestId('select-item-apple'))

      expect(screen.queryByTestId('select-content')).not.toBeInTheDocument()
    })
  })

  describe('Disabled State', () => {
    it('should not open when disabled', async () => {
      const user = userEvent.setup()
      renderSelect({ disabled: true })

      await user.click(screen.getByTestId('select-trigger'))

      expect(screen.queryByTestId('select-content')).not.toBeInTheDocument()
    })

    it('should have disabled styling', () => {
      renderSelect({ disabled: true })

      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toBeDisabled()
    })
  })

  describe('Clear Button', () => {
    it('should render clear button when clearable and onClear provided', () => {
      renderSelect({ clearable: true, onClear: vi.fn(), value: 'apple' })

      expect(screen.getByTestId('select-clear')).toBeInTheDocument()
    })

    it('should call onClear when clear button clicked', async () => {
      const user = userEvent.setup()
      const onClear = vi.fn()
      renderSelect({ clearable: true, onClear, value: 'apple' })

      await user.click(screen.getByTestId('select-clear'))

      expect(onClear).toHaveBeenCalled()
    })

    it('should not open dropdown when clicking clear', async () => {
      const user = userEvent.setup()
      renderSelect({ clearable: true, onClear: vi.fn(), value: 'apple' })

      await user.click(screen.getByTestId('select-clear'))

      expect(screen.queryByTestId('select-content')).not.toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should open on Enter key', async () => {
      const user = userEvent.setup()
      renderSelect()

      screen.getByTestId('select-trigger').focus()
      await user.keyboard('{Enter}')

      expect(screen.getByTestId('select-content')).toBeInTheDocument()
    })

    it('should open on Space key', async () => {
      const user = userEvent.setup()
      renderSelect()

      screen.getByTestId('select-trigger').focus()
      await user.keyboard(' ')

      expect(screen.getByTestId('select-content')).toBeInTheDocument()
    })

    it('should close on Escape key', async () => {
      const user = userEvent.setup()
      renderSelect()

      await user.click(screen.getByTestId('select-trigger'))
      expect(screen.getByTestId('select-content')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      expect(screen.queryByTestId('select-content')).not.toBeInTheDocument()
    })
  })

  describe('SelectGroup and SelectLabel', () => {
    it('should render group with label', async () => {
      const user = userEvent.setup()
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      )

      await user.click(screen.getByTestId('select-trigger'))

      expect(screen.getByText('Fruits')).toBeInTheDocument()
    })
  })

  describe('SelectSeparator', () => {
    it('should render separator', async () => {
      const user = userEvent.setup()
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectSeparator data-testid="separator" />
            <SelectItem value="banana">Banana</SelectItem>
          </SelectContent>
        </Select>
      )

      await user.click(screen.getByTestId('select-trigger'))

      expect(screen.getByTestId('separator')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have correct aria attributes on trigger', () => {
      renderSelect()

      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveAttribute('role', 'combobox')
    })

    it('should be focusable', async () => {
      const user = userEvent.setup()
      renderSelect()

      await user.tab()

      expect(screen.getByTestId('select-trigger')).toHaveFocus()
    })

    it('clear button should have aria-label', () => {
      renderSelect({ clearable: true, onClear: vi.fn(), value: 'apple' })

      expect(screen.getByTestId('select-clear')).toHaveAttribute(
        'aria-label',
        'Clear selection'
      )
    })
  })

  describe('Styling', () => {
    it('should have focus ring on focus', () => {
      renderSelect()

      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('focus-visible:ring-2')
    })

    it('should show chevron icon', () => {
      renderSelect()

      // The chevron is inside the trigger
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger.querySelector('svg')).toBeInTheDocument()
    })

    it('truncates a long value instead of clipping or pushing out the chevron', () => {
      renderSelect()

      // The value span must be allowed to shrink (min-w-0) so line-clamp-1
      // can truncate long text, and the chevron must not shrink (shrink-0)
      // so it stays visible at narrow widths.
      const trigger = screen.getByTestId('select-trigger')
      expect(trigger).toHaveClass('[&>span]:line-clamp-1', '[&>span]:min-w-0')
      expect(trigger.querySelector('svg')).toHaveClass('shrink-0')
    })
  })
})
