import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Textarea } from './textarea'

describe('Textarea', () => {
  describe('Rendering', () => {
    it('should render textarea', () => {
      render(<Textarea />)

      expect(screen.getByTestId('textarea')).toBeInTheDocument()
    })

    it('should render with placeholder', () => {
      render(<Textarea placeholder="Enter description" />)

      expect(
        screen.getByPlaceholderText('Enter description')
      ).toBeInTheDocument()
    })

    it('should display value', () => {
      render(<Textarea value="Hello world" onChange={() => {}} />)

      expect(screen.getByTestId('textarea')).toHaveValue('Hello world')
    })

    it('should have default minimum height', () => {
      render(<Textarea />)

      expect(screen.getByTestId('textarea')).toHaveClass('min-h-[80px]')
    })
  })

  describe('Interaction', () => {
    it('should call onChange when typing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Textarea onChange={onChange} />)

      await user.type(screen.getByTestId('textarea'), 'Hello')

      expect(onChange).toHaveBeenCalled()
    })

    it('should update value when typing', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      await user.type(screen.getByTestId('textarea'), 'Test message')

      expect(screen.getByTestId('textarea')).toHaveValue('Test message')
    })

    it('should support multiline input', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      await user.type(screen.getByTestId('textarea'), 'Line 1{enter}Line 2')

      expect(screen.getByTestId('textarea')).toHaveValue('Line 1\nLine 2')
    })
  })

  describe('Error State', () => {
    it('should have error styling when error prop is true', () => {
      render(<Textarea error />)

      expect(screen.getByTestId('textarea')).toHaveClass('border-destructive')
    })

    it('should have destructive focus ring when error', () => {
      render(<Textarea error />)

      expect(screen.getByTestId('textarea')).toHaveClass(
        'focus-visible:ring-destructive'
      )
    })

    it('should not have error styling when error is false', () => {
      render(<Textarea error={false} />)

      expect(screen.getByTestId('textarea')).not.toHaveClass(
        'border-destructive'
      )
    })
  })

  describe('Disabled State', () => {
    it('should be disabled when disabled prop is true', () => {
      render(<Textarea disabled />)

      expect(screen.getByTestId('textarea')).toBeDisabled()
    })

    it('should not allow typing when disabled', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Textarea disabled onChange={onChange} />)

      await user.type(screen.getByTestId('textarea'), 'Hello')

      expect(onChange).not.toHaveBeenCalled()
    })

    it('should have disabled styling', () => {
      render(<Textarea disabled />)

      expect(screen.getByTestId('textarea')).toHaveClass('disabled:opacity-50')
    })

    it('should have not-allowed cursor when disabled', () => {
      render(<Textarea disabled />)

      expect(screen.getByTestId('textarea')).toHaveClass(
        'disabled:cursor-not-allowed'
      )
    })
  })

  describe('Rows and Resize', () => {
    it('should support custom rows', () => {
      render(<Textarea rows={10} />)

      expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '10')
    })

    it('should support maxLength', () => {
      render(<Textarea maxLength={100} />)

      expect(screen.getByTestId('textarea')).toHaveAttribute('maxlength', '100')
    })
  })

  describe('Keyboard Navigation', () => {
    it('should be focusable', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      await user.tab()

      expect(screen.getByTestId('textarea')).toHaveFocus()
    })

    it('should focus on click', async () => {
      const user = userEvent.setup()
      render(<Textarea />)

      await user.click(screen.getByTestId('textarea'))

      expect(screen.getByTestId('textarea')).toHaveFocus()
    })
  })

  describe('Accessibility', () => {
    it('should have focus ring on focus', () => {
      render(<Textarea />)

      expect(screen.getByTestId('textarea')).toHaveClass('focus-visible:ring-2')
    })

    it('should support aria-label', () => {
      render(<Textarea aria-label="Description field" />)

      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'aria-label',
        'Description field'
      )
    })

    it('should support aria-describedby', () => {
      render(<Textarea aria-describedby="description-help" />)

      expect(screen.getByTestId('textarea')).toHaveAttribute(
        'aria-describedby',
        'description-help'
      )
    })
  })

  describe('Styling', () => {
    it('should support custom className', () => {
      render(<Textarea className="custom-class" />)

      expect(screen.getByTestId('textarea')).toHaveClass('custom-class')
    })

    it('should have muted placeholder styling', () => {
      render(<Textarea placeholder="Enter text" />)

      expect(screen.getByTestId('textarea')).toHaveClass(
        'placeholder:text-muted-foreground/60'
      )
    })

    it('should have ring offset on focus', () => {
      render(<Textarea />)

      expect(screen.getByTestId('textarea')).toHaveClass(
        'focus-visible:ring-offset-2'
      )
    })
  })

  describe('Required and ReadOnly', () => {
    it('should support required attribute', () => {
      render(<Textarea required />)

      expect(screen.getByTestId('textarea')).toBeRequired()
    })

    it('should support readOnly attribute', () => {
      render(<Textarea readOnly value="Read only content" />)

      expect(screen.getByTestId('textarea')).toHaveAttribute('readonly')
    })
  })
})
