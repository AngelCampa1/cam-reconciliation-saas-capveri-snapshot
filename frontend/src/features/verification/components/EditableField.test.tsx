import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditableField, type FieldSourceReference } from './EditableField'
import { TooltipProvider } from '@/components/ui/tooltip'

// Wrapper component to provide TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

describe('EditableField', () => {
  const mockSourceRef: FieldSourceReference = {
    field: 'testField',
    confidence: 0.95,
    text: 'Extracted from PDF',
    page: 1,
    boundingBox: { left: 0.1, top: 0.1, width: 0.5, height: 0.02 },
  }

  describe('Basic Rendering', () => {
    it('renders label and input', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="test value"
            originalValue="test value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByText('Test Field')).toBeInTheDocument()
      expect(screen.getByTestId('input-testField')).toHaveValue('test value')
    })

    it('handles null values', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value={null}
            originalValue={null}
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-testField')).toHaveValue('')
    })

    it('handles number values', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value={42}
            originalValue={42}
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-testField')).toHaveValue('42')
    })
  })

  describe('Empty (not extracted) flagging', () => {
    it('flags an empty unedited field as not extracted', () => {
      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value={null}
            originalValue={null}
            isChanged={false}
            onChange={vi.fn()}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-testField')).toHaveAttribute(
        'placeholder',
        'Not extracted'
      )
      expect(screen.getByTestId('not-extracted-testField')).toBeInTheDocument()
      expect(screen.getByTestId('editable-field-testField')).toHaveClass(
        'border-dashed'
      )
    })

    it('does not flag an empty field once the reviewer changes it', () => {
      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value={null}
            originalValue="prev"
            isChanged={true}
            onChange={vi.fn()}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('not-extracted-testField')
      ).not.toBeInTheDocument()
    })

    it('does not flag an empty field the reviewer confirmed', () => {
      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value={null}
            originalValue={null}
            isChanged={false}
            isConfirmed={true}
            onConfirm={vi.fn()}
            onChange={vi.fn()}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('not-extracted-testField')
      ).not.toBeInTheDocument()
    })

    it('does not flag a field that has a value', () => {
      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="present"
            originalValue="present"
            isChanged={false}
            onChange={vi.fn()}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('not-extracted-testField')
      ).not.toBeInTheDocument()
    })
  })

  describe('Change Highlighting', () => {
    it('applies warning highlighting when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="new value"
            originalValue="old value"
            isChanged={true}
            onChange={onChange}
          />
        </TestWrapper>
      )

      const container = screen.getByTestId('editable-field-testField')
      expect(container).toHaveClass('bg-warning/10')
      expect(container).toHaveClass('border-warning/20')
    })

    it('does not apply highlighting when unchanged', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="same value"
            originalValue="same value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      const container = screen.getByTestId('editable-field-testField')
      expect(container).not.toHaveClass('bg-warning/10')
      expect(container).not.toHaveClass('border-warning/20')
    })
  })

  describe('Original Value Display', () => {
    it('shows original value when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="new value"
            originalValue="old value"
            isChanged={true}
            onChange={onChange}
          />
        </TestWrapper>
      )

      const originalDisplay = screen.getByTestId('original-value-testField')
      expect(originalDisplay).toHaveTextContent('Original: old value')
      expect(originalDisplay.querySelector('.line-through')).toBeInTheDocument()
    })

    it('does not show original value when unchanged', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="same value"
            originalValue="same value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('original-value-testField')
      ).not.toBeInTheDocument()
    })
  })

  describe('Reset Functionality', () => {
    it('shows reset button when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="new value"
            originalValue="old value"
            isChanged={true}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('reset-testField')).toBeInTheDocument()
    })

    it('does not show reset button when unchanged', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="same value"
            originalValue="same value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.queryByTestId('reset-testField')).not.toBeInTheDocument()
    })

    it('calls onChange with original value when reset clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="new value"
            originalValue="old value"
            isChanged={true}
            onChange={onChange}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('reset-testField'))

      expect(onChange).toHaveBeenCalledWith('old value')
    })
  })

  describe('Input Change Handling', () => {
    it('calls onChange when input value changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value=""
            originalValue="initial"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-testField')
      await user.type(input, 'u')

      // Verify onChange was called with the typed character
      expect(onChange).toHaveBeenCalledWith('u')
    })

    it('converts empty string to null', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-testField')
      await user.clear(input)

      expect(onChange).toHaveBeenCalledWith(null)
    })
  })

  describe('Source Reference Integration', () => {
    it('shows confidence indicator when sourceRef provided', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            sourceRef={mockSourceRef}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('confidence-badge')).toBeInTheDocument()
    })

    it('does not show confidence indicator when no sourceRef', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument()
    })

    it('shows view source button when sourceRef and onFocus provided', () => {
      const onChange = vi.fn()
      const onFocus = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            sourceRef={mockSourceRef}
            onChange={onChange}
            onFocus={onFocus}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('view-source-testField')).toBeInTheDocument()
    })

    it('does not show view source button when no onFocus', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            sourceRef={mockSourceRef}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('view-source-testField')
      ).not.toBeInTheDocument()
    })

    it('calls onFocus when view source button clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onFocus = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            sourceRef={mockSourceRef}
            onChange={onChange}
            onFocus={onFocus}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('view-source-testField'))

      expect(onFocus).toHaveBeenCalled()
    })

    it('hides view source button when sourceRef has no boundingBox (F-179)', () => {
      const onChange = vi.fn()
      const onFocus = vi.fn()
      const nullBoxRef = { ...mockSourceRef, boundingBox: null }

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            sourceRef={nullBoxRef}
            onChange={onChange}
            onFocus={onFocus}
          />
        </TestWrapper>
      )

      expect(
        screen.queryByTestId('view-source-testField')
      ).not.toBeInTheDocument()
    })

    it('calls onFocus when input is focused', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onFocus = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            onChange={onChange}
            onFocus={onFocus}
          />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-testField')
      await user.click(input)

      expect(onFocus).toHaveBeenCalled()
    })
  })

  describe('Percentage Display (F-177)', () => {
    it('shows a stored decimal fraction as a percent number', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="pro_rata_share"
            label="Pro-Rata Share"
            value={0.05}
            originalValue={0.05}
            isChanged={false}
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-pro_rata_share')).toHaveValue('5')
    })

    it('renders without binary-float noise for tricky fractions', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={0.07}
            originalValue={0.07}
            isChanged={false}
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-cap_rate')).toHaveValue('7')
    })

    it('emits a decimal fraction when the reviewer types a percent', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      // Controlled harness: feed the emitted value back, like the real page.
      function Harness() {
        const [value, setValue] = useState<string | number | null>(null)
        return (
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={value}
            originalValue={null}
            isChanged={false}
            isPercentage
            onChange={(v) => {
              onChange(v)
              setValue(v)
            }}
          />
        )
      }

      render(
        <TestWrapper>
          <Harness />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-cap_rate')
      await user.type(input, '8')

      expect(onChange).toHaveBeenLastCalledWith('0.08')
      expect(input).toHaveValue('8')
    })

    it('keeps a trailing decimal point while typing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      function Harness() {
        const [value, setValue] = useState<string | number | null>(null)
        return (
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={value}
            originalValue={null}
            isChanged={false}
            isPercentage
            onChange={(v) => {
              onChange(v)
              setValue(v)
            }}
          />
        )
      }

      render(
        <TestWrapper>
          <Harness />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-cap_rate')
      await user.type(input, '7.')

      expect(input).toHaveValue('7.')
    })

    it('emits null when the percent input is cleared', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={0.07}
            originalValue={0.07}
            isChanged={false}
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-cap_rate')
      await user.clear(input)

      expect(onChange).toHaveBeenLastCalledWith(null)
    })

    it('shows the original value as a percent number when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={0.08}
            originalValue={0.05}
            isChanged
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      const originalDisplay = screen.getByTestId('original-value-cap_rate')
      expect(originalDisplay).toHaveTextContent('Original: 5%')
    })

    it('resyncs the display when the external value changes', () => {
      const onChange = vi.fn()
      const { rerender } = render(
        <TestWrapper>
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={0.05}
            originalValue={0.05}
            isChanged={false}
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-cap_rate')).toHaveValue('5')

      rerender(
        <TestWrapper>
          <EditableField
            field="cap_rate"
            label="Cap Rate"
            value={0.09}
            originalValue={0.05}
            isChanged
            isPercentage
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('input-cap_rate')).toHaveValue('9')
    })
  })

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="testField"
            label="Test Field"
            value="value"
            originalValue="value"
            isChanged={false}
            onChange={onChange}
            className="custom-class"
          />
        </TestWrapper>
      )

      const container = screen.getByTestId('editable-field-testField')
      expect(container).toHaveClass('custom-class')
    })
  })

  describe('Confirm affordance', () => {
    it('renders the confirm toggle when onConfirm is provided on an unedited field', () => {
      const onChange = vi.fn()
      const onConfirm = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="base_year"
            label="Base Year"
            value="2024"
            originalValue="2024"
            isChanged={false}
            onChange={onChange}
            onConfirm={onConfirm}
          />
        </TestWrapper>
      )

      const button = screen.getByTestId('confirm-base_year')
      expect(button).toBeInTheDocument()
      expect(button).toHaveTextContent('Looks right?')
      expect(button).toHaveAttribute('aria-pressed', 'false')
    })

    it('does not render the confirm toggle on a changed field', () => {
      const onChange = vi.fn()
      const onConfirm = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="base_year"
            label="Base Year"
            value="2025"
            originalValue="2024"
            isChanged
            onChange={onChange}
            onConfirm={onConfirm}
          />
        </TestWrapper>
      )

      expect(screen.queryByTestId('confirm-base_year')).not.toBeInTheDocument()
    })

    it('reflects the confirmed state with pressed styling and updated label', () => {
      const onChange = vi.fn()
      const onConfirm = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="base_year"
            label="Base Year"
            value="2024"
            originalValue="2024"
            isChanged={false}
            isConfirmed
            onChange={onChange}
            onConfirm={onConfirm}
          />
        </TestWrapper>
      )

      const button = screen.getByTestId('confirm-base_year')
      expect(button).toHaveTextContent('Looks right')
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveClass('bg-success')

      const container = screen.getByTestId('editable-field-base_year')
      expect(container).toHaveClass('bg-success/10')
    })

    it('calls onConfirm when the toggle is clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const onConfirm = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="base_year"
            label="Base Year"
            value="2024"
            originalValue="2024"
            isChanged={false}
            onChange={onChange}
            onConfirm={onConfirm}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('confirm-base_year'))
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })

  describe('Boolean fields (F-232)', () => {
    it('renders a Yes/No toggle instead of raw true/false text', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="gross_up_base_year"
            label="Gross-Up Base Year"
            value={true}
            originalValue={true}
            isChanged={false}
            isBoolean
            onChange={onChange}
          />
        </TestWrapper>
      )

      const toggle = screen.getByRole('switch', { name: 'Gross-Up Base Year' })
      expect(toggle).toBeChecked()
      expect(
        screen.getByTestId('boolean-gross_up_base_year')
      ).toHaveTextContent('Yes')
      // No free-text input is rendered for a boolean field.
      expect(
        screen.queryByTestId('input-gross_up_base_year')
      ).not.toBeInTheDocument()
    })

    it('emits a boolean when toggled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="gross_up_base_year"
            label="Gross-Up Base Year"
            value={false}
            originalValue={false}
            isChanged={false}
            isBoolean
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(
        screen.getByTestId('boolean-gross_up_base_year')
      ).toHaveTextContent('No')
      await user.click(screen.getByRole('switch'))
      expect(onChange).toHaveBeenCalledWith(true)
    })

    it('shows the boolean original value as Yes/No when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="gross_up_base_year"
            label="Gross-Up Base Year"
            value={false}
            originalValue={true}
            isChanged
            isBoolean
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(
        screen.getByTestId('original-value-gross_up_base_year')
      ).toHaveTextContent('Yes')
    })
  })

  describe('Enum select fields (F-232)', () => {
    const capTypeOptions = [
      { value: 'none', label: 'No Cap' },
      { value: 'non_cumulative', label: 'Non-Cumulative' },
      { value: 'cumulative', label: 'Cumulative' },
      { value: 'cumulative_compounding', label: 'Cumulative Compounding' },
    ]

    it('renders the human-readable label for the current enum value', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="cap_type"
            label="Cap Type"
            value="non_cumulative"
            originalValue="non_cumulative"
            isChanged={false}
            options={capTypeOptions}
            onChange={onChange}
          />
        </TestWrapper>
      )

      // The select exposes the field label as its accessible name.
      expect(
        screen.getByRole('combobox', { name: 'Cap Type' })
      ).toBeInTheDocument()
      // The raw enum value is never shown to the reviewer.
      expect(screen.getByTestId('select-cap_type')).toHaveTextContent(
        'Non-Cumulative'
      )
      expect(screen.queryByText('non_cumulative')).not.toBeInTheDocument()
      expect(screen.queryByTestId('input-cap_type')).not.toBeInTheDocument()
    })

    it('shows the enum original value as a label when changed', () => {
      const onChange = vi.fn()

      render(
        <TestWrapper>
          <EditableField
            field="cap_type"
            label="Cap Type"
            value="cumulative"
            originalValue="none"
            isChanged
            options={capTypeOptions}
            onChange={onChange}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('original-value-cap_type')).toHaveTextContent(
        'No Cap'
      )
    })
  })
})
