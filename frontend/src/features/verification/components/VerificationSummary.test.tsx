import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  VerificationSummary,
  type FieldSourceReference,
} from './VerificationSummary'

describe('VerificationSummary', () => {
  const mockReferences: FieldSourceReference[] = [
    { field: 'field1', confidence: 0.95, verified: true },
    { field: 'field2', confidence: 0.85, verified: true },
    { field: 'field3', confidence: 0.65, verified: false }, // Low confidence
    { field: 'field4', confidence: 0.5, verified: false }, // Low confidence
    { field: 'field5', confidence: 0.75, verified: false },
  ]

  describe('Progress Display', () => {
    it('shows correct verification progress count', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('progress-text')).toHaveTextContent('2/5')
    })

    it('shows 0/0 when no references', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={[]}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('progress-text')).toHaveTextContent('0/0')
    })

    it('shows 100% progress when all verified', () => {
      const onFilterChange = vi.fn()
      const allVerified: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.95, verified: true },
        { field: 'field2', confidence: 0.85, verified: true },
      ]

      render(
        <VerificationSummary
          sourceReferences={allVerified}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      const progressBar = screen.getByTestId('progress-bar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '100')
    })

    it('calculates correct progress percentage', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      // 2 verified out of 5 = 40%
      const progressBar = screen.getByTestId('progress-bar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '40')
    })

    it('shows 0% progress when none verified', () => {
      const onFilterChange = vi.fn()
      const noneVerified: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.95, verified: false },
        { field: 'field2', confidence: 0.85, verified: false },
      ]

      render(
        <VerificationSummary
          sourceReferences={noneVerified}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      const progressBar = screen.getByTestId('progress-bar')
      expect(progressBar).toHaveAttribute('aria-valuenow', '0')
    })
  })

  describe('Low Confidence Filter', () => {
    it('shows filter button when low-confidence fields exist', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      const filterButton = screen.getByTestId('low-confidence-filter')
      expect(filterButton).toBeInTheDocument()
      expect(filterButton).toHaveTextContent('2 need review') // 2 fields with confidence < 0.7
    })

    it('does not show filter button when no low-confidence fields', () => {
      const onFilterChange = vi.fn()
      const highConfidenceRefs: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.95, verified: true },
        { field: 'field2', confidence: 0.85, verified: false },
        { field: 'field3', confidence: 0.7, verified: false },
      ]

      render(
        <VerificationSummary
          sourceReferences={highConfidenceRefs}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(
        screen.queryByTestId('low-confidence-filter')
      ).not.toBeInTheDocument()
    })

    it('calls onFilterChange when filter button clicked', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      await user.click(screen.getByTestId('low-confidence-filter'))

      expect(onFilterChange).toHaveBeenCalledWith('low')
    })

    it('toggles filter when clicked while active', async () => {
      const user = userEvent.setup()
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="low"
        />
      )

      await user.click(screen.getByTestId('low-confidence-filter'))

      expect(onFilterChange).toHaveBeenCalledWith('all')
    })

    it('applies outline variant styling when filter not active', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      const filterButton = screen.getByTestId('low-confidence-filter')
      // Outline variant has border-input class
      expect(filterButton).toHaveClass('border-input')
      expect(filterButton).toHaveClass('bg-background')
    })

    it('applies default variant styling when filter is active', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="low"
        />
      )

      const filterButton = screen.getByTestId('low-confidence-filter')
      // Default variant does not have border-input class
      expect(filterButton).not.toHaveClass('border-input')
    })

    it('shows alert icon in filter button', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      const filterButton = screen.getByTestId('low-confidence-filter')
      const icon = filterButton.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Low Confidence Count', () => {
    it('counts fields with confidence < 0.7', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('low-confidence-filter')).toHaveTextContent(
        '2 need review'
      )
    })

    it('shows correct count with single low-confidence field', () => {
      const onFilterChange = vi.fn()
      const singleLow: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.95, verified: true },
        { field: 'field2', confidence: 0.6, verified: false },
      ]

      render(
        <VerificationSummary
          sourceReferences={singleLow}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('low-confidence-filter')).toHaveTextContent(
        '1 need review'
      )
    })

    it('treats exactly 0.7 confidence as medium', () => {
      const onFilterChange = vi.fn()
      const exactBoundary: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.7, verified: false },
      ]

      render(
        <VerificationSummary
          sourceReferences={exactBoundary}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(
        screen.queryByTestId('low-confidence-filter')
      ).not.toBeInTheDocument()
    })
  })

  describe('Custom Styling', () => {
    it('applies custom className', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
          className="custom-test-class"
        />
      )

      const summary = screen.getByTestId('verification-summary')
      expect(summary).toHaveClass('custom-test-class')
    })

    it('combines custom className with default styling', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={mockReferences}
          onFilterChange={onFilterChange}
          currentFilter="all"
          className="custom-test-class"
        />
      )

      const summary = screen.getByTestId('verification-summary')
      expect(summary).toHaveClass('custom-test-class')
      expect(summary).toHaveClass('bg-muted/50')
    })
  })

  describe('Edge Cases', () => {
    it('handles empty references array', () => {
      const onFilterChange = vi.fn()

      render(
        <VerificationSummary
          sourceReferences={[]}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('progress-text')).toHaveTextContent('0/0')
      expect(
        screen.queryByTestId('low-confidence-filter')
      ).not.toBeInTheDocument()
    })

    it('handles all low-confidence fields', () => {
      const onFilterChange = vi.fn()
      const allLow: FieldSourceReference[] = [
        { field: 'field1', confidence: 0.5, verified: false },
        { field: 'field2', confidence: 0.3, verified: false },
        { field: 'field3', confidence: 0.1, verified: false },
      ]

      render(
        <VerificationSummary
          sourceReferences={allLow}
          onFilterChange={onFilterChange}
          currentFilter="all"
        />
      )

      expect(screen.getByTestId('low-confidence-filter')).toHaveTextContent(
        '3 need review'
      )
    })
  })
})
