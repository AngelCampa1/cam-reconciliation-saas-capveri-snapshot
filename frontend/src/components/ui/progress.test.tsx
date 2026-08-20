import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Progress, ProgressCircular } from './progress'

describe('Progress', () => {
  describe('Rendering', () => {
    it('should render progress bar', () => {
      render(<Progress value={50} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toBeInTheDocument()
    })

    it('should render indicator', () => {
      render(<Progress value={50} />)

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toBeInTheDocument()
    })
  })

  describe('Determinate Mode', () => {
    it('should show correct progress percentage', () => {
      render(<Progress value={75} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '75')
    })

    it('should clamp value to 0-100 range', () => {
      const { rerender } = render(<Progress value={-10} />)

      let progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '0')

      rerender(<Progress value={150} />)
      progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '100')
    })

    it('should set aria-valuetext with percentage', () => {
      render(<Progress value={45} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuetext', '45%')
    })

    it('should set indicator transform based on value', () => {
      render(<Progress value={60} />)

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveStyle({ transform: 'translateX(-40%)' })
    })

    it('should handle 0% progress', () => {
      render(<Progress value={0} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '0')

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' })
    })

    it('should handle 100% progress', () => {
      render(<Progress value={100} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '100')

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' })
    })
  })

  describe('Indeterminate Mode', () => {
    it('should render indeterminate state', () => {
      render(<Progress indeterminate />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('data-indeterminate', 'true')
    })

    it('should not have aria-valuenow in indeterminate mode', () => {
      render(<Progress indeterminate />)

      const progress = screen.getByTestId('progress')
      expect(progress).not.toHaveAttribute('aria-valuenow')
    })

    it('should have loading aria-valuetext', () => {
      render(<Progress indeterminate />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuetext', 'Loading')
    })

    it('should have animation class on indicator', () => {
      render(<Progress indeterminate />)

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveClass('animate-progress-indeterminate')
    })
  })

  describe('Sizes', () => {
    it('should render small size', () => {
      render(<Progress value={50} size="sm" />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveClass('h-1')
    })

    it('should render medium size (default)', () => {
      render(<Progress value={50} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveClass('h-2')
    })

    it('should render large size', () => {
      render(<Progress value={50} size="lg" />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveClass('h-3')
    })

    it('should render extra large size', () => {
      render(<Progress value={50} size="xl" />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveClass('h-4')
    })
  })

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<Progress value={50} />)

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveClass('bg-primary')
    })

    it('should render success variant', () => {
      render(<Progress value={50} variant="success" />)

      const indicator = screen.getByTestId('progress-indicator')
      // Uses semantic success color token
      expect(indicator).toHaveClass('bg-success')
    })

    it('should render warning variant', () => {
      render(<Progress value={50} variant="warning" />)

      const indicator = screen.getByTestId('progress-indicator')
      // Uses semantic warning color token
      expect(indicator).toHaveClass('bg-warning')
    })

    it('should render destructive variant', () => {
      render(<Progress value={50} variant="destructive" />)

      const indicator = screen.getByTestId('progress-indicator')
      expect(indicator).toHaveClass('bg-destructive')
    })

    it('should render info variant', () => {
      render(<Progress value={50} variant="info" />)

      const indicator = screen.getByTestId('progress-indicator')
      // Uses theme-aware primary color for info
      expect(indicator).toHaveClass('bg-primary')
    })
  })

  describe('Label', () => {
    it('should not show label by default', () => {
      render(<Progress value={50} />)

      expect(screen.queryByText(/.+/)).not.toBeInTheDocument()
    })

    it('should show label when provided', () => {
      render(<Progress value={50} label="Uploading..." />)

      expect(screen.getByText('Uploading...')).toBeInTheDocument()
    })

    it('should use label as aria-label', () => {
      render(<Progress value={50} label="Processing file" />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-label', 'Processing file')
    })
  })

  describe('Show Value', () => {
    it('should not show value by default', () => {
      render(<Progress value={50} />)

      expect(screen.queryByText('50%')).not.toBeInTheDocument()
    })

    it('should show value when showValue is true', () => {
      render(<Progress value={75} showValue />)

      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('should show both label and value', () => {
      render(<Progress value={45} label="Loading..." showValue />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
      expect(screen.getByText('45%')).toBeInTheDocument()
    })

    it('should not show value in indeterminate mode', () => {
      render(<Progress indeterminate showValue />)

      // The showValue only works when value is provided
      const percentText = screen.queryByText(/%/)
      expect(percentText).not.toBeInTheDocument()
    })
  })

  describe('Custom Max', () => {
    it('should calculate percentage based on max', () => {
      render(<Progress value={50} max={200} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuenow', '25')
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<Progress value={50} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-valuemin', '0')
      expect(progress).toHaveAttribute('aria-valuemax', '100')
      expect(progress).toHaveAttribute('aria-valuenow', '50')
    })

    it('should have default aria-label', () => {
      render(<Progress value={50} />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveAttribute('aria-label', 'Progress')
    })
  })

  describe('Custom Props', () => {
    it('should accept custom className', () => {
      render(<Progress value={50} className="my-custom-class" />)

      const progress = screen.getByTestId('progress')
      expect(progress).toHaveClass('my-custom-class')
    })
  })
})

describe('ProgressCircular', () => {
  describe('Rendering', () => {
    it('should render circular progress', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toBeInTheDocument()
    })

    it('should render SVG element', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      const svg = progress.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('should render background and progress circles', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      expect(circles).toHaveLength(2)
    })
  })

  describe('Determinate Mode', () => {
    it('should show correct progress', () => {
      render(<ProgressCircular value={75} />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('aria-valuenow', '75')
    })

    it('should clamp value to 0-100 range', () => {
      const { rerender } = render(<ProgressCircular value={-10} />)

      let progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('aria-valuenow', '0')

      rerender(<ProgressCircular value={150} />)
      progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('aria-valuenow', '100')
    })
  })

  describe('Indeterminate Mode', () => {
    it('should render indeterminate state', () => {
      render(<ProgressCircular indeterminate />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).not.toHaveAttribute('aria-valuenow')
    })

    it('should have spin animation on SVG', () => {
      render(<ProgressCircular indeterminate />)

      const progress = screen.getByTestId('progress-circular')
      const svg = progress.querySelector('svg')
      expect(svg).toHaveClass('animate-spin')
    })
  })

  describe('Size', () => {
    it('should use default size of 40', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      const svg = progress.querySelector('svg')
      expect(svg).toHaveAttribute('width', '40')
      expect(svg).toHaveAttribute('height', '40')
    })

    it('should accept custom size', () => {
      render(<ProgressCircular value={50} size={64} />)

      const progress = screen.getByTestId('progress-circular')
      const svg = progress.querySelector('svg')
      expect(svg).toHaveAttribute('width', '64')
      expect(svg).toHaveAttribute('height', '64')
    })
  })

  describe('Variants', () => {
    it('should render default variant', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      expect(circles[1]).toHaveClass('stroke-primary')
    })

    it('should render success variant', () => {
      render(<ProgressCircular value={50} variant="success" />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      // Uses semantic success color token
      expect(circles[1]).toHaveClass('stroke-success')
    })

    it('should render warning variant', () => {
      render(<ProgressCircular value={50} variant="warning" />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      // Uses semantic warning color token
      expect(circles[1]).toHaveClass('stroke-warning')
    })

    it('should render destructive variant', () => {
      render(<ProgressCircular value={50} variant="destructive" />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      expect(circles[1]).toHaveClass('stroke-destructive')
    })

    it('should render info variant', () => {
      render(<ProgressCircular value={50} variant="info" />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      // Uses theme-aware primary color for info
      expect(circles[1]).toHaveClass('stroke-primary')
    })
  })

  describe('Show Value', () => {
    it('should not show value by default', () => {
      render(<ProgressCircular value={50} />)

      expect(screen.queryByText('50%')).not.toBeInTheDocument()
    })

    it('should show value when showValue is true', () => {
      render(<ProgressCircular value={75} showValue />)

      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('should not show value in indeterminate mode', () => {
      render(<ProgressCircular indeterminate showValue />)

      expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('role', 'progressbar')
      expect(progress).toHaveAttribute('aria-valuemin', '0')
      expect(progress).toHaveAttribute('aria-valuemax', '100')
      expect(progress).toHaveAttribute('aria-valuenow', '50')
    })

    it('should have default aria-label', () => {
      render(<ProgressCircular value={50} />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('aria-label', 'Progress')
    })

    it('should accept custom label', () => {
      render(<ProgressCircular value={50} label="Uploading file" />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveAttribute('aria-label', 'Uploading file')
    })
  })

  describe('Custom Props', () => {
    it('should accept custom className', () => {
      render(<ProgressCircular value={50} className="my-custom-class" />)

      const progress = screen.getByTestId('progress-circular')
      expect(progress).toHaveClass('my-custom-class')
    })

    it('should accept custom strokeWidth', () => {
      render(<ProgressCircular value={50} strokeWidth={8} />)

      const progress = screen.getByTestId('progress-circular')
      const circles = progress.querySelectorAll('circle')
      expect(circles[0]).toHaveAttribute('stroke-width', '8')
      expect(circles[1]).toHaveAttribute('stroke-width', '8')
    })
  })
})

describe('Progress Accessibility', () => {
  it('should have progressbar role on linear progress', () => {
    render(<Progress value={50} />)

    // Radix Progress uses progressbar role internally
    const progress = screen.getByTestId('progress')
    expect(progress).toBeInTheDocument()
  })

  it('should have progressbar role on circular progress', () => {
    render(<ProgressCircular value={50} />)

    const progress = screen.getByTestId('progress-circular')
    expect(progress).toHaveAttribute('role', 'progressbar')
  })

  it('should communicate loading state accessibly', () => {
    render(<Progress indeterminate label="Loading data..." />)

    const progress = screen.getByTestId('progress')
    expect(progress).toHaveAttribute('aria-label', 'Loading data...')
    expect(progress).toHaveAttribute('aria-valuetext', 'Loading')
  })
})
