import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RadioGroup, RadioGroupItem, RadioGroupWithLabels } from './radio-group'

describe('RadioGroup', () => {
  describe('Basic RadioGroup', () => {
    it('should render radio group', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-group')).toBeInTheDocument()
    })

    it('should render radio items with correct test ids', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-item-apple')).toBeInTheDocument()
      expect(screen.getByTestId('radio-item-banana')).toBeInTheDocument()
    })

    it('should have correct roles', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      )

      expect(screen.getByRole('radiogroup')).toBeInTheDocument()
      expect(screen.getAllByRole('radio')).toHaveLength(2)
    })
  })

  describe('Selection', () => {
    it('should select item on click', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(
        <RadioGroup onValueChange={onValueChange}>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
        </RadioGroup>
      )

      await user.click(screen.getByTestId('radio-item-apple'))

      expect(onValueChange).toHaveBeenCalledWith('apple')
    })

    it('should show selected state', () => {
      render(
        <RadioGroup value="banana">
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-item-banana')).toHaveAttribute(
        'data-state',
        'checked'
      )
      expect(screen.getByTestId('radio-item-apple')).toHaveAttribute(
        'data-state',
        'unchecked'
      )
    })

    it('should only allow one selection', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(
        <RadioGroup value="apple" onValueChange={onValueChange}>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
          <RadioGroupItem value="cherry" />
        </RadioGroup>
      )

      await user.click(screen.getByTestId('radio-item-cherry'))

      expect(onValueChange).toHaveBeenCalledWith('cherry')
      // Radio groups only allow one selection, previous selection is replaced
    })
  })

  describe('Disabled State', () => {
    it('should disable individual item', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" disabled />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-item-banana')).toBeDisabled()
      expect(screen.getByTestId('radio-item-apple')).not.toBeDisabled()
    })

    it('should not call onValueChange when clicking disabled item', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(
        <RadioGroup onValueChange={onValueChange}>
          <RadioGroupItem value="apple" disabled />
        </RadioGroup>
      )

      await user.click(screen.getByTestId('radio-item-apple'))

      expect(onValueChange).not.toHaveBeenCalled()
    })

    it('should have disabled styling', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" disabled />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-item-apple')).toHaveClass(
        'disabled:opacity-50'
      )
    })
  })

  describe('Keyboard Navigation', () => {
    it('should have keyboard navigable items', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
          <RadioGroupItem value="cherry" />
        </RadioGroup>
      )

      // All items should be focusable (have tabindex)
      const radios = screen.getAllByRole('radio')
      radios.forEach((radio) => {
        expect(radio).toHaveAttribute('type', 'button')
      })
    })

    it('should be focusable', async () => {
      const user = userEvent.setup()
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" />
          <RadioGroupItem value="banana" />
        </RadioGroup>
      )

      await user.tab()

      expect(screen.getByTestId('radio-item-apple')).toHaveFocus()
    })

    it('should select on Space key', async () => {
      const user = userEvent.setup()
      const onValueChange = vi.fn()
      render(
        <RadioGroup onValueChange={onValueChange}>
          <RadioGroupItem value="apple" />
        </RadioGroup>
      )

      await user.tab()
      await user.keyboard(' ')

      expect(onValueChange).toHaveBeenCalledWith('apple')
    })
  })

  describe('Accessibility', () => {
    it('should have focus ring on focus', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="apple" />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-item-apple')).toHaveClass(
        'focus-visible:ring-2'
      )
    })

    it('should support custom className', () => {
      render(
        <RadioGroup className="custom-class">
          <RadioGroupItem value="apple" />
        </RadioGroup>
      )

      expect(screen.getByTestId('radio-group')).toHaveClass('custom-class')
    })
  })
})

describe('RadioGroupWithLabels', () => {
  const options = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana', description: 'Yellow fruit' },
    { value: 'cherry', label: 'Cherry', disabled: true },
  ]

  it('should render all options with labels', () => {
    render(<RadioGroupWithLabels options={options} onValueChange={() => {}} />)

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText('Cherry')).toBeInTheDocument()
  })

  it('should show descriptions when provided', () => {
    render(<RadioGroupWithLabels options={options} onValueChange={() => {}} />)

    expect(screen.getByText('Yellow fruit')).toBeInTheDocument()
  })

  it('should call onValueChange when selecting', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <RadioGroupWithLabels options={options} onValueChange={onValueChange} />
    )

    await user.click(screen.getByText('Apple'))

    expect(onValueChange).toHaveBeenCalledWith('apple')
  })

  it('should show selected state', () => {
    render(
      <RadioGroupWithLabels
        options={options}
        value="banana"
        onValueChange={() => {}}
      />
    )

    expect(screen.getByTestId('radio-item-banana')).toHaveAttribute(
      'data-state',
      'checked'
    )
  })

  it('should disable individual options', () => {
    render(<RadioGroupWithLabels options={options} onValueChange={() => {}} />)

    expect(screen.getByTestId('radio-item-cherry')).toBeDisabled()
    expect(screen.getByTestId('radio-item-apple')).not.toBeDisabled()
  })

  it('should have disabled label styling', () => {
    render(<RadioGroupWithLabels options={options} onValueChange={() => {}} />)

    const cherryLabel = screen.getByText('Cherry')
    expect(cherryLabel).toHaveClass('opacity-70')
  })

  describe('Orientation', () => {
    it('should render vertically by default', () => {
      render(
        <RadioGroupWithLabels options={options} onValueChange={() => {}} />
      )

      expect(screen.getByTestId('radio-group')).toHaveClass('grid')
    })

    it('should render horizontally when orientation is horizontal', () => {
      render(
        <RadioGroupWithLabels
          options={options}
          orientation="horizontal"
          onValueChange={() => {}}
        />
      )

      expect(screen.getByTestId('radio-group')).toHaveClass('flex')
    })
  })

  it('should support custom className', () => {
    render(
      <RadioGroupWithLabels
        options={options}
        className="custom-class"
        onValueChange={() => {}}
      />
    )

    expect(screen.getByTestId('radio-group')).toHaveClass('custom-class')
  })

  it('should associate labels with radio items', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(
      <RadioGroupWithLabels
        name="fruits"
        options={options}
        onValueChange={onValueChange}
      />
    )

    // Clicking label should select the radio item
    await user.click(screen.getByText('Banana'))

    expect(onValueChange).toHaveBeenCalledWith('banana')
  })
})
