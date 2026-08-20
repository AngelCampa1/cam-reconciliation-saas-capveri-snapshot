import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfidenceIndicator, getConfidenceLevel } from './ConfidenceIndicator'
import { TooltipProvider } from '@/components/ui/tooltip'

// Wrapper component to provide TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

describe('ConfidenceIndicator', () => {
  describe('Confidence Level Classification', () => {
    it('classifies high confidence (≥90%)', () => {
      expect(getConfidenceLevel(1.0)).toBe('high')
      expect(getConfidenceLevel(0.95)).toBe('high')
      expect(getConfidenceLevel(0.9)).toBe('high')
    })

    it('classifies medium confidence (70-89%)', () => {
      expect(getConfidenceLevel(0.89)).toBe('medium')
      expect(getConfidenceLevel(0.8)).toBe('medium')
      expect(getConfidenceLevel(0.7)).toBe('medium')
    })

    it('classifies low confidence (<70%)', () => {
      expect(getConfidenceLevel(0.69)).toBe('low')
      expect(getConfidenceLevel(0.5)).toBe('low')
      expect(getConfidenceLevel(0.0)).toBe('low')
    })
  })

  describe('Badge Display', () => {
    it('displays confidence percentage', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.85} />
        </TestWrapper>
      )

      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('85%')
    })

    it('rounds percentage to nearest integer', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.856} />
        </TestWrapper>
      )

      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('86%')
    })

    it('handles 0% confidence', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0} />
        </TestWrapper>
      )

      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('0%')
    })

    it('handles 100% confidence', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={1.0} />
        </TestWrapper>
      )

      expect(screen.getByTestId('confidence-badge')).toHaveTextContent('100%')
    })
  })

  describe('Color Coding', () => {
    it('applies green styling for high confidence', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.95} />
        </TestWrapper>
      )

      const badge = screen.getByTestId('confidence-badge')
      // Uses semantic success color tokens
      expect(badge).toHaveClass('bg-success/10')
      expect(badge).toHaveClass('text-success-strong')
      expect(badge).toHaveClass('border-success/20')
      expect(badge).toHaveAttribute('data-confidence-level', 'high')
    })

    it('applies amber styling for medium confidence', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.8} />
        </TestWrapper>
      )

      const badge = screen.getByTestId('confidence-badge')
      // Uses semantic warning color tokens
      expect(badge).toHaveClass('bg-warning/10')
      expect(badge).toHaveClass('text-warning-foreground')
      expect(badge).toHaveClass('border-warning/20')
      expect(badge).toHaveAttribute('data-confidence-level', 'medium')
    })

    it('applies red styling for low confidence', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.5} />
        </TestWrapper>
      )

      const badge = screen.getByTestId('confidence-badge')
      // Uses theme-aware destructive color with opacity
      expect(badge).toHaveClass('bg-destructive/10')
      expect(badge).toHaveClass('text-destructive-strong')
      expect(badge).toHaveClass('border-destructive/20')
      expect(badge).toHaveAttribute('data-confidence-level', 'low')
    })
  })

  describe('Tooltip Display', () => {
    it('shows high confidence label on hover', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.95} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const labels = screen.getAllByTestId('confidence-label')
        expect(labels.length).toBeGreaterThan(0)
        expect(labels[0]).toHaveTextContent('High confidence')
      })
    })

    it('shows medium confidence label on hover', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.8} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const labels = screen.getAllByTestId('confidence-label')
        expect(labels.length).toBeGreaterThan(0)
        expect(labels[0]).toHaveTextContent('Medium confidence')
      })
    })

    it('shows low confidence label on hover', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.5} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const labels = screen.getAllByTestId('confidence-label')
        expect(labels.length).toBeGreaterThan(0)
        expect(labels[0]).toHaveTextContent('Low confidence - requires review')
      })
    })

    it('shows source text preview when provided', async () => {
      const user = userEvent.setup()
      const sourceText = 'This is the extracted text from the PDF document.'

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.95} sourceText={sourceText} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const previews = screen.getAllByTestId('source-preview')
        expect(previews.length).toBeGreaterThan(0)
        expect(previews[0]).toHaveTextContent(`Source: "${sourceText}"`)
      })
    })

    it('truncates long source text to 100 characters', async () => {
      const user = userEvent.setup()
      const longText = 'A'.repeat(150) // 150 character string

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.95} sourceText={longText} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const previews = screen.getAllByTestId('source-preview')
        expect(previews.length).toBeGreaterThan(0)
        expect(previews[0].textContent).toContain('...')
        expect(previews[0].textContent).toHaveLength(113) // "Source: " + 100 chars + "..." = 113
      })
    })

    it('does not show source preview when not provided', async () => {
      const user = userEvent.setup()

      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.95} />
        </TestWrapper>
      )

      await user.hover(screen.getByTestId('confidence-badge'))

      await waitFor(() => {
        const labels = screen.getAllByTestId('confidence-label')
        expect(labels.length).toBeGreaterThan(0)
      })

      expect(screen.queryByTestId('source-preview')).not.toBeInTheDocument()
    })
  })

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator
            confidence={0.95}
            className="custom-test-class"
          />
        </TestWrapper>
      )

      const badge = screen.getByTestId('confidence-badge')
      expect(badge).toHaveClass('custom-test-class')
    })

    it('combines custom className with confidence styling', () => {
      render(
        <TestWrapper>
          <ConfidenceIndicator confidence={0.5} className="custom-test-class" />
        </TestWrapper>
      )

      const badge = screen.getByTestId('confidence-badge')
      expect(badge).toHaveClass('custom-test-class')
      // Uses theme-aware destructive color for low confidence
      expect(badge).toHaveClass('bg-destructive/10')
    })
  })
})
