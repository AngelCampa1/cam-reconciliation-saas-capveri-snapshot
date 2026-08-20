import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox, CheckboxWithLabel, CheckboxGroup } from './checkbox'

describe('Checkbox', () => {
  describe('Basic Checkbox', () => {
    it('should render checkbox', () => {
      render(<Checkbox />)

      expect(screen.getByTestId('checkbox')).toBeInTheDocument()
    })

    it('should be unchecked by default', () => {
      render(<Checkbox />)

      expect(screen.getByTestId('checkbox')).not.toBeChecked()
    })

    it('should be checked when checked prop is true', () => {
      render(<Checkbox checked />)

      expect(screen.getByTestId('checkbox')).toHaveAttribute(
        'data-state',
        'checked'
      )
    })

    it('should call onCheckedChange when clicked', async () => {
      const user = userEvent.setup()
      const onCheckedChange = vi.fn()
      render(<Checkbox onCheckedChange={onCheckedChange} />)

      await user.click(screen.getByTestId('checkbox'))

      expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('should toggle state on click', async () => {
      const user = userEvent.setup()
      const onCheckedChange = vi.fn()
      render(<Checkbox checked onCheckedChange={onCheckedChange} />)

      await user.click(screen.getByTestId('checkbox'))

      expect(onCheckedChange).toHaveBeenCalledWith(false)
    })
  })

  describe('Indeterminate State', () => {
    it('should render indeterminate state', () => {
      render(<Checkbox checked="indeterminate" />)

      expect(screen.getByTestId('checkbox')).toHaveAttribute(
        'data-state',
        'indeterminate'
      )
    })

    it('should show minus icon when indeterminate', () => {
      render(<Checkbox checked="indeterminate" />)

      // The minus icon should be present in indeterminate state
      const checkbox = screen.getByTestId('checkbox')
      expect(checkbox.querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Checkbox disabled />)

      expect(screen.getByTestId('checkbox')).toBeDisabled()
    })

    it('should not call onCheckedChange when disabled', async () => {
      const user = userEvent.setup()
      const onCheckedChange = vi.fn()
      render(<Checkbox disabled onCheckedChange={onCheckedChange} />)

      await user.click(screen.getByTestId('checkbox'))

      expect(onCheckedChange).not.toHaveBeenCalled()
    })

    it('should have disabled styling', () => {
      render(<Checkbox disabled />)

      expect(screen.getByTestId('checkbox')).toHaveClass('disabled:opacity-50')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should toggle on Space key', async () => {
      const user = userEvent.setup()
      const onCheckedChange = vi.fn()
      render(<Checkbox onCheckedChange={onCheckedChange} />)

      screen.getByTestId('checkbox').focus()
      await user.keyboard(' ')

      expect(onCheckedChange).toHaveBeenCalledWith(true)
    })

    it('should be focusable', async () => {
      const user = userEvent.setup()
      render(<Checkbox />)

      await user.tab()

      expect(screen.getByTestId('checkbox')).toHaveFocus()
    })
  })

  describe('Accessibility', () => {
    it('should have correct role', () => {
      render(<Checkbox />)

      expect(screen.getByRole('checkbox')).toBeInTheDocument()
    })

    it('should have focus ring on focus', () => {
      render(<Checkbox />)

      expect(screen.getByTestId('checkbox')).toHaveClass('focus-visible:ring-2')
    })
  })
})

describe('CheckboxWithLabel', () => {
  it('should render label', () => {
    render(<CheckboxWithLabel label="Accept terms" />)

    expect(screen.getByText('Accept terms')).toBeInTheDocument()
  })

  it('should render description when provided', () => {
    render(
      <CheckboxWithLabel
        label="Accept terms"
        description="Please read our terms of service"
      />
    )

    expect(
      screen.getByText('Please read our terms of service')
    ).toBeInTheDocument()
  })

  it('should associate label with checkbox', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(
      <CheckboxWithLabel
        label="Accept terms"
        onCheckedChange={onCheckedChange}
      />
    )

    // Clicking the label should toggle the checkbox
    await user.click(screen.getByText('Accept terms'))

    expect(onCheckedChange).toHaveBeenCalled()
  })

  it('should have disabled styling when disabled', () => {
    render(<CheckboxWithLabel label="Accept terms" disabled />)

    const label = screen.getByText('Accept terms')
    expect(label).toHaveClass('opacity-70')
  })
})

describe('CheckboxGroup', () => {
  const options = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana', description: 'Yellow fruit' },
    { value: 'cherry', label: 'Cherry', disabled: true },
  ]

  it('should render all options', () => {
    render(<CheckboxGroup options={options} value={[]} onChange={() => {}} />)

    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('Banana')).toBeInTheDocument()
    expect(screen.getByText('Cherry')).toBeInTheDocument()
  })

  it('should show descriptions when provided', () => {
    render(<CheckboxGroup options={options} value={[]} onChange={() => {}} />)

    expect(screen.getByText('Yellow fruit')).toBeInTheDocument()
  })

  it('should check selected values', () => {
    render(
      <CheckboxGroup
        options={options}
        value={['apple', 'banana']}
        onChange={() => {}}
      />
    )

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[0]).toHaveAttribute('data-state', 'checked')
    expect(checkboxes[1]).toHaveAttribute('data-state', 'checked')
    expect(checkboxes[2]).not.toHaveAttribute('data-state', 'checked')
  })

  it('should call onChange with updated values when checking', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CheckboxGroup options={options} value={[]} onChange={onChange} />)

    await user.click(screen.getByText('Apple'))

    expect(onChange).toHaveBeenCalledWith(['apple'])
  })

  it('should call onChange with updated values when unchecking', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CheckboxGroup
        options={options}
        value={['apple', 'banana']}
        onChange={onChange}
      />
    )

    await user.click(screen.getByText('Apple'))

    expect(onChange).toHaveBeenCalledWith(['banana'])
  })

  it('should disable individual options', () => {
    render(<CheckboxGroup options={options} value={[]} onChange={() => {}} />)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes[2]).toBeDisabled() // Cherry is disabled
  })

  it('should disable all when group is disabled', () => {
    render(
      <CheckboxGroup
        options={options}
        value={[]}
        onChange={() => {}}
        disabled
      />
    )

    const checkboxes = screen.getAllByRole('checkbox')
    checkboxes.forEach((checkbox) => {
      expect(checkbox).toBeDisabled()
    })
  })

  it('should have role="group"', () => {
    render(<CheckboxGroup options={options} value={[]} onChange={() => {}} />)

    expect(screen.getByTestId('checkbox-group')).toHaveAttribute(
      'role',
      'group'
    )
  })

  it('should support custom className', () => {
    render(
      <CheckboxGroup
        options={options}
        value={[]}
        onChange={() => {}}
        className="custom-class"
      />
    )

    expect(screen.getByTestId('checkbox-group')).toHaveClass('custom-class')
  })
})
