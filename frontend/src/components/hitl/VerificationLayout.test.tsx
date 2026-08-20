import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VerificationLayout } from './VerificationLayout'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

describe('VerificationLayout', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Component Structure', () => {
    it('renders both panels', () => {
      render(
        <VerificationLayout
          pdfPanel={<div data-testid="pdf-content">PDF Content</div>}
          formPanel={<div data-testid="form-content">Form Content</div>}
        />
      )

      expect(screen.getByTestId('pdf-content')).toBeInTheDocument()
      expect(screen.getByTestId('form-content')).toBeInTheDocument()
    })

    it('renders resize handle with proper ARIA attributes', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      expect(handle).toBeInTheDocument()
      expect(handle).toHaveAttribute('aria-orientation', 'vertical')
      expect(handle).toHaveAttribute('aria-label', 'Resize panels')
      expect(handle).toHaveAttribute('aria-valuemin', '25')
      expect(handle).toHaveAttribute('aria-valuemax', '75')
      expect(handle).toHaveAttribute('aria-valuenow', '50')
      expect(handle).toHaveAttribute('tabIndex', '0')
    })

    it('applies custom className to wrapper', () => {
      const { container } = render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          className="custom-class"
        />
      )

      const wrapper = container.querySelector(
        '[data-testid="verification-layout"]'
      )
      expect(wrapper).toHaveClass('custom-class')
    })
  })

  describe('Initial Split Position', () => {
    it('uses default split position of 0.5 when no stored value', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
        />
      )

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('50%')
    })

    it('uses custom initial split position', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.6}
        />
      )

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('60%')
    })

    it('loads split position from localStorage', () => {
      localStorageMock.setItem('hitl-split-position', '0.4')

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
        />
      )

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('40%')
    })

    it('prioritizes localStorage over initialSplit prop', () => {
      localStorageMock.setItem('hitl-split-position', '0.3')

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.7}
        />
      )

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('30%')
    })
  })

  describe('Drag Resize', () => {
    it('changes split position on drag', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      const container = screen.getByTestId('verification-layout')

      // Mock getBoundingClientRect to return a 1000px wide container
      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Start drag
      fireEvent.mouseDown(handle)

      // Move to 60% position (600px)
      fireEvent.mouseMove(document, { clientX: 600 })

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('60%')
    })

    it('stops dragging on mouse up', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      const container = screen.getByTestId('verification-layout')

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      // Start and stop drag
      fireEvent.mouseDown(handle)
      fireEvent.mouseUp(document)

      // Moving mouse now should not change position
      const initialWidth = screen.getByTestId('pdf-panel').style.width
      fireEvent.mouseMove(document, { clientX: 700 })

      expect(screen.getByTestId('pdf-panel').style.width).toBe(initialWidth)
    })

    it('adds dragging styles during drag', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
        />
      )

      const handle = screen.getByRole('separator')

      expect(handle).not.toHaveClass('bg-primary')

      fireEvent.mouseDown(handle)
      expect(handle).toHaveClass('bg-primary')

      fireEvent.mouseUp(document)
      expect(handle).not.toHaveClass('bg-primary')
    })
  })

  describe('Width Constraints', () => {
    it('enforces minimum width of 25%', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      const container = screen.getByTestId('verification-layout')

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      fireEvent.mouseDown(handle)
      fireEvent.mouseMove(document, { clientX: 100 }) // Try to move to 10%

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('25%') // Should be clamped to 25%
    })

    it('enforces maximum width of 75%', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      const container = screen.getByTestId('verification-layout')

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      fireEvent.mouseDown(handle)
      fireEvent.mouseMove(document, { clientX: 900 }) // Try to move to 90%

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('75%') // Should be clamped to 75%
    })
  })

  describe('Keyboard Resize', () => {
    it('decreases split on ArrowLeft', async () => {
      const user = userEvent.setup()

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      handle.focus()

      await user.keyboard('{ArrowLeft}')

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('45%') // 50% - 5%
    })

    it('increases split on ArrowRight', async () => {
      const user = userEvent.setup()

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      handle.focus()

      await user.keyboard('{ArrowRight}')

      const pdfPanel = screen.getByTestId('pdf-panel')
      // Account for floating point precision
      const width = parseFloat(pdfPanel.style.width)
      expect(width).toBeCloseTo(55, 1) // 50% + 5%
    })

    it('respects minimum width on keyboard resize', async () => {
      const user = userEvent.setup()

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.25}
        />
      )

      const handle = screen.getByRole('separator')
      handle.focus()

      await user.keyboard('{ArrowLeft}')

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('25%') // Should stay at minimum
    })

    it('respects maximum width on keyboard resize', async () => {
      const user = userEvent.setup()

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.75}
        />
      )

      const handle = screen.getByRole('separator')
      handle.focus()

      await user.keyboard('{ArrowRight}')

      const pdfPanel = screen.getByTestId('pdf-panel')
      expect(pdfPanel.style.width).toBe('75%') // Should stay at maximum
    })
  })

  describe('LocalStorage Persistence', () => {
    it('persists split position to localStorage on change', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      const container = screen.getByTestId('verification-layout')

      vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        width: 1000,
        top: 0,
        bottom: 0,
        right: 0,
        height: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      })

      fireEvent.mouseDown(handle)
      fireEvent.mouseMove(document, { clientX: 600 })
      fireEvent.mouseUp(document)

      expect(localStorageMock.getItem('hitl-split-position')).toBe('0.6')
    })

    it('persists on keyboard resize', async () => {
      const user = userEvent.setup()

      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.5}
        />
      )

      const handle = screen.getByRole('separator')
      handle.focus()

      await user.keyboard('{ArrowLeft}')

      expect(localStorageMock.getItem('hitl-split-position')).toBe('0.45')
    })
  })

  describe('Panel Widths', () => {
    it('sets correct widths for both panels', () => {
      render(
        <VerificationLayout
          pdfPanel={<div>PDF</div>}
          formPanel={<div>Form</div>}
          initialSplit={0.4}
        />
      )

      const pdfPanel = screen.getByTestId('pdf-panel')
      const formPanel = screen.getByTestId('form-panel')

      expect(pdfPanel.style.width).toBe('40%')
      expect(formPanel.style.width).toBe('60%')
    })
  })
})
