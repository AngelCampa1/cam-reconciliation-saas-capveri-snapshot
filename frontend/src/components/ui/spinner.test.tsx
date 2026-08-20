import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner, SpinnerOverlay, InlineSpinner } from './spinner'

describe('Spinner', () => {
  describe('Rendering', () => {
    it('should render with default props', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      expect(spinner).toBeInTheDocument()
      expect(spinner).toHaveAttribute('role', 'status')
    })

    it('should have default aria-label', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      expect(spinner).toHaveAttribute('aria-label', 'Loading')
    })

    it('should accept custom label', () => {
      render(<Spinner label="Loading properties..." />)

      const spinner = screen.getByTestId('spinner')
      expect(spinner).toHaveAttribute('aria-label', 'Loading properties...')
    })

    it('should have screen reader text', () => {
      render(<Spinner label="Fetching data" />)

      expect(screen.getByText('Fetching data')).toBeInTheDocument()
      expect(screen.getByText('Fetching data')).toHaveClass('sr-only')
    })
  })

  describe('Sizes', () => {
    it('should render extra small size', () => {
      render(<Spinner size="xs" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-3')
      expect(circle).toHaveClass('w-3')
    })

    it('should render small size', () => {
      render(<Spinner size="sm" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-4')
      expect(circle).toHaveClass('w-4')
    })

    it('should render medium size (default)', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-6')
      expect(circle).toHaveClass('w-6')
    })

    it('should render large size', () => {
      render(<Spinner size="lg" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-8')
      expect(circle).toHaveClass('w-8')
    })

    it('should render extra large size', () => {
      render(<Spinner size="xl" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-12')
      expect(circle).toHaveClass('w-12')
    })
  })

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-primary')
    })

    it('should render muted variant', () => {
      render(<Spinner variant="muted" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-muted-foreground')
    })

    it('should render destructive variant', () => {
      render(<Spinner variant="destructive" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-destructive')
    })

    it('should render success variant', () => {
      render(<Spinner variant="success" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-success')
    })

    it('should render white variant', () => {
      render(<Spinner variant="white" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-primary-foreground')
    })
  })

  describe('Animation', () => {
    it('should have spin animation class', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('animate-spin')
    })

    it('should have reduced motion class', () => {
      render(<Spinner />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('motion-reduce:animate-none')
    })
  })

  describe('Custom Props', () => {
    it('should accept custom className', () => {
      render(<Spinner className="my-custom-class" />)

      const spinner = screen.getByTestId('spinner')
      expect(spinner).toHaveClass('my-custom-class')
    })

    it('should accept additional props', () => {
      render(<Spinner data-custom="test" />)

      const spinner = screen.getByTestId('spinner')
      expect(spinner).toHaveAttribute('data-custom', 'test')
    })
  })
})

describe('SpinnerOverlay', () => {
  describe('Rendering', () => {
    it('should render overlay', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toBeInTheDocument()
    })

    it('should be fixed positioned', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toHaveClass('fixed')
      expect(overlay).toHaveClass('inset-0')
    })

    it('should have high z-index', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toHaveClass('z-modal')
    })

    it('should have role status', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toHaveAttribute('role', 'status')
    })

    it('should accept custom label', () => {
      render(<SpinnerOverlay label="Processing..." />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toHaveAttribute('aria-label', 'Processing...')
    })
  })

  describe('Backdrop', () => {
    it('should show backdrop by default', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).toHaveClass('bg-background/80')
      expect(overlay).toHaveClass('backdrop-blur-sm')
    })

    it('should hide backdrop when showBackdrop is false', () => {
      render(<SpinnerOverlay showBackdrop={false} />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay).not.toHaveClass('bg-background/80')
      expect(overlay).not.toHaveClass('backdrop-blur-sm')
    })
  })

  describe('Text', () => {
    it('should not show text by default', () => {
      render(<SpinnerOverlay />)

      const overlay = screen.getByTestId('spinner-overlay')
      expect(overlay.querySelector('p')).not.toBeInTheDocument()
    })

    it('should show text when provided', () => {
      render(<SpinnerOverlay text="Please wait..." />)

      expect(screen.getByText('Please wait...')).toBeInTheDocument()
    })

    it('should have aria-live on text', () => {
      render(<SpinnerOverlay text="Loading data..." />)

      const text = screen.getByText('Loading data...')
      expect(text).toHaveAttribute('aria-live', 'polite')
    })
  })

  describe('Spinner Props', () => {
    it('should use large size by default', () => {
      render(<SpinnerOverlay />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-8')
      expect(circle).toHaveClass('w-8')
    })

    it('should pass size prop to spinner', () => {
      render(<SpinnerOverlay size="xl" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-12')
      expect(circle).toHaveClass('w-12')
    })

    it('should pass variant prop to spinner', () => {
      render(<SpinnerOverlay variant="success" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-success')
    })
  })
})

describe('InlineSpinner', () => {
  describe('Rendering', () => {
    it('should render inline spinner', () => {
      render(<InlineSpinner />)

      const container = screen.getByTestId('inline-spinner')
      expect(container).toBeInTheDocument()
    })

    it('should use small size by default', () => {
      render(<InlineSpinner />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-4')
      expect(circle).toHaveClass('w-4')
    })

    it('should be inline-flex', () => {
      render(<InlineSpinner />)

      const container = screen.getByTestId('inline-spinner')
      expect(container).toHaveClass('inline-flex')
    })
  })

  describe('Text', () => {
    it('should not show text by default', () => {
      render(<InlineSpinner />)

      const container = screen.getByTestId('inline-spinner')
      expect(container.querySelectorAll('span').length).toBe(1) // Only sr-only span
    })

    it('should show text when provided', () => {
      render(<InlineSpinner text="Loading..." />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should position text on right by default', () => {
      render(<InlineSpinner text="Loading..." />)

      const container = screen.getByTestId('inline-spinner')
      expect(container).not.toHaveClass('flex-row-reverse')
    })

    it('should position text on left when specified', () => {
      render(<InlineSpinner text="Loading..." textPosition="left" />)

      const container = screen.getByTestId('inline-spinner')
      expect(container).toHaveClass('flex-row-reverse')
    })
  })

  describe('Props Forwarding', () => {
    it('should accept custom className', () => {
      render(<InlineSpinner className="my-custom-class" />)

      const container = screen.getByTestId('inline-spinner')
      expect(container).toHaveClass('my-custom-class')
    })

    it('should pass size to spinner', () => {
      render(<InlineSpinner size="lg" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('h-8')
      expect(circle).toHaveClass('w-8')
    })

    it('should pass variant to spinner', () => {
      render(<InlineSpinner variant="muted" />)

      const spinner = screen.getByTestId('spinner')
      const circle = spinner.querySelector('div')
      expect(circle).toHaveClass('text-muted-foreground')
    })
  })
})

describe('Spinner Accessibility', () => {
  it('should have proper ARIA attributes for status', () => {
    render(<Spinner />)

    const spinner = screen.getByTestId('spinner')
    expect(spinner).toHaveAttribute('role', 'status')
    expect(spinner).toHaveAttribute('aria-label')
  })

  it('should have visually hidden text for screen readers', () => {
    render(<Spinner label="Loading content" />)

    const srText = screen.getByText('Loading content')
    expect(srText).toHaveClass('sr-only')
  })

  it('should have inner circle hidden from accessibility tree', () => {
    render(<Spinner />)

    const spinner = screen.getByTestId('spinner')
    const circle = spinner.querySelector('div')
    expect(circle).toHaveAttribute('aria-hidden', 'true')
  })
})
