import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoundingBoxOverlay, SourceHighlight } from './BoundingBoxOverlay'
import { TooltipProvider } from '@/components/ui/tooltip'

// Wrapper component to provide TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

const mockSources: SourceHighlight[] = [
  {
    field: 'proRataShare',
    text: '5.23%',
    boundingBox: { left: 0.1, top: 0.2, width: 0.1, height: 0.02 },
    confidence: 'high',
    page: 1,
  },
  {
    field: 'baseYear',
    text: '2024',
    boundingBox: { left: 0.3, top: 0.4, width: 0.08, height: 0.02 },
    confidence: 'medium',
    page: 1,
  },
  {
    field: 'capRate',
    text: '3%',
    boundingBox: { left: 0.5, top: 0.6, width: 0.05, height: 0.02 },
    confidence: 'low',
    page: 2,
  },
]

describe('BoundingBoxOverlay', () => {
  describe('Page Filtering', () => {
    it('renders boxes for current page only', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('bbox-proRataShare')).toBeInTheDocument()
      expect(screen.getByTestId('bbox-baseYear')).toBeInTheDocument()
      expect(screen.queryByTestId('bbox-capRate')).not.toBeInTheDocument()
    })

    it('does not render boxes for other pages', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={2}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      expect(screen.queryByTestId('bbox-proRataShare')).not.toBeInTheDocument()
      expect(screen.queryByTestId('bbox-baseYear')).not.toBeInTheDocument()
      expect(screen.getByTestId('bbox-capRate')).toBeInTheDocument()
    })

    it('returns null when no boxes on current page', () => {
      const { container } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={3}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      expect(container.firstChild).toBeNull()
    })

    it('handles empty sources array', () => {
      const { container } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={[]}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('Click Interaction', () => {
    it('calls onBoxClick when clicked', async () => {
      const user = userEvent.setup()
      const onBoxClick = vi.fn()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            onBoxClick={onBoxClick}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('bbox-proRataShare'))
      expect(onBoxClick).toHaveBeenCalledWith('proRataShare')
    })

    it('does not error when onBoxClick is not provided', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('bbox-proRataShare'))
      // Should not throw
    })

    it('calls onBoxClick for each box independently', async () => {
      const user = userEvent.setup()
      const onBoxClick = vi.fn()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            onBoxClick={onBoxClick}
          />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('bbox-proRataShare'))
      expect(onBoxClick).toHaveBeenCalledWith('proRataShare')

      await user.click(screen.getByTestId('bbox-baseYear'))
      expect(onBoxClick).toHaveBeenCalledWith('baseYear')
    })
  })

  describe('Active Field Highlighting', () => {
    it('highlights active field with ring', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            activeField="proRataShare"
          />
        </TestWrapper>
      )

      const activeBox = screen.getByTestId('bbox-proRataShare')
      expect(activeBox).toHaveClass('ring-2')
      expect(activeBox).toHaveClass('ring-primary')
      expect(activeBox).toHaveClass('border-primary')
    })

    it('does not highlight non-active fields', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            activeField="proRataShare"
          />
        </TestWrapper>
      )

      const inactiveBox = screen.getByTestId('bbox-baseYear')
      expect(inactiveBox).not.toHaveClass('ring-2')
      expect(inactiveBox).not.toHaveClass('border-primary')
    })

    it('handles activeField change', () => {
      const { rerender } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            activeField="proRataShare"
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('bbox-proRataShare')).toHaveClass('ring-2')
      expect(screen.getByTestId('bbox-baseYear')).not.toHaveClass('ring-2')

      rerender(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            activeField="baseYear"
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('bbox-proRataShare')).not.toHaveClass('ring-2')
      expect(screen.getByTestId('bbox-baseYear')).toHaveClass('ring-2')
    })
  })

  describe('Confidence Colors', () => {
    it('applies high confidence colors (success)', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const highConfBox = screen.getByTestId('bbox-proRataShare')
      expect(highConfBox).toHaveClass('border-success')
      expect(highConfBox).toHaveClass('bg-success/10')
    })

    it('applies medium confidence colors (warning)', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const mediumConfBox = screen.getByTestId('bbox-baseYear')
      expect(mediumConfBox).toHaveClass('border-warning')
      expect(mediumConfBox).toHaveClass('bg-warning/10')
    })

    it('applies low confidence colors (destructive)', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={2}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const lowConfBox = screen.getByTestId('bbox-capRate')
      expect(lowConfBox).toHaveClass('border-destructive')
      expect(lowConfBox).toHaveClass('bg-destructive/10')
    })
  })

  describe('Tooltip Display', () => {
    it('shows tooltip with field name on hover', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('bbox-proRataShare'))

      await waitFor(() => {
        const elements = screen.getAllByText('Pro Rata Share')
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('shows tooltip with extracted text on hover', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('bbox-proRataShare'))

      await waitFor(() => {
        const elements = screen.getAllByText('"5.23%"')
        expect(elements.length).toBeGreaterThan(0)
      })
    })

    it('shows confidence level in tooltip', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('bbox-proRataShare'))

      await waitFor(() => {
        const confidenceElements = screen.getAllByText(/Confidence:/)
        expect(confidenceElements.length).toBeGreaterThan(0)
        const highElements = screen.getAllByText('high')
        expect(highElements.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Positioning and Scaling', () => {
    it('positions boxes using percentage coordinates', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const box = screen.getByTestId('bbox-proRataShare')
      expect(box.style.left).toBe('10%') // 0.1 * 100
      expect(box.style.top).toBe('20%') // 0.2 * 100
      expect(box.style.width).toBe('10%') // 0.1 * 100
      expect(box.style.height).toBe('2%') // 0.02 * 100
    })

    it('scales with page dimensions', () => {
      const { container } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={1600}
            pageHeight={2000}
          />
        </TestWrapper>
      )

      const overlay = container.querySelector(
        '[data-testid="bounding-box-overlay"]'
      )
      expect(overlay).toHaveStyle({ width: '1600px', height: '2000px' })
    })
  })

  describe('Multiple Boxes', () => {
    it('renders multiple boxes on same page', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      expect(screen.getByTestId('bbox-proRataShare')).toBeInTheDocument()
      expect(screen.getByTestId('bbox-baseYear')).toBeInTheDocument()
    })

    it('handles duplicate field names with unique keys', () => {
      const duplicateSources: SourceHighlight[] = [
        {
          field: 'amount',
          text: '$100',
          boundingBox: { left: 0.1, top: 0.1, width: 0.1, height: 0.02 },
          confidence: 'high',
          page: 1,
        },
        {
          field: 'amount',
          text: '$200',
          boundingBox: { left: 0.3, top: 0.3, width: 0.1, height: 0.02 },
          confidence: 'high',
          page: 1,
        },
      ]

      const { container } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={duplicateSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const boxes = container.querySelectorAll('[data-testid="bbox-amount"]')
      expect(boxes).toHaveLength(2)
    })
  })

  describe('Accessibility', () => {
    it('includes aria-label with field and text', () => {
      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
          />
        </TestWrapper>
      )

      const box = screen.getByTestId('bbox-proRataShare')
      expect(box).toHaveAttribute(
        'aria-label',
        'Source for proRataShare: 5.23%'
      )
    })

    it('is keyboard accessible', async () => {
      const user = userEvent.setup()
      const onBoxClick = vi.fn()

      render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            onBoxClick={onBoxClick}
          />
        </TestWrapper>
      )

      const box = screen.getByTestId('bbox-proRataShare')
      await user.tab()
      expect(box).toHaveFocus()

      await user.keyboard('{Enter}')
      expect(onBoxClick).toHaveBeenCalledWith('proRataShare')
    })
  })

  describe('Custom ClassName', () => {
    it('applies custom className to overlay container', () => {
      const { container } = render(
        <TestWrapper>
          <BoundingBoxOverlay
            sources={mockSources}
            currentPage={1}
            pageWidth={800}
            pageHeight={1000}
            className="custom-overlay"
          />
        </TestWrapper>
      )

      const overlay = container.querySelector(
        '[data-testid="bounding-box-overlay"]'
      )
      expect(overlay).toHaveClass('custom-overlay')
    })
  })
})
