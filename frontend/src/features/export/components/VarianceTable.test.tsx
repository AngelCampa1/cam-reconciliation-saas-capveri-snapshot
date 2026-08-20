/**
 * Tests for VarianceTable component.
 *
 * Verifies variance display with color coding and highlighting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VarianceTable } from './VarianceTable'
import type { VarianceItem } from '../types'

// Mock viewport — defaults to desktop; flip mockIsMobile for mobile tests.
let mockIsMobile = false
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    width: mockIsMobile ? 375 : 1280,
    height: 800,
    isMobile: mockIsMobile,
    isTablet: false,
    isLaptop: false,
    isDesktop: !mockIsMobile,
    size: mockIsMobile ? 'mobile' : 'desktop',
    isTouch: mockIsMobile,
  }),
}))

describe('VarianceTable', () => {
  beforeEach(() => {
    mockIsMobile = false
  })

  const mockData: VarianceItem[] = [
    {
      poolId: 'pool-1',
      poolName: 'Utilities',
      currentAmount: 50000,
      priorAmount: 45000,
      varianceAmount: 5000,
      variancePercent: 11.11,
      varianceType: 'increase',
      isNew: false,
    },
    {
      poolId: 'pool-2',
      poolName: 'Janitorial',
      currentAmount: 30000,
      priorAmount: 35000,
      varianceAmount: -5000,
      variancePercent: -14.29,
      varianceType: 'decrease',
      isNew: false,
    },
    {
      poolId: 'pool-3',
      poolName: 'Insurance',
      currentAmount: 20000,
      priorAmount: 20000,
      varianceAmount: 0,
      variancePercent: 0,
      varianceType: 'unchanged',
      isNew: false,
    },
    {
      poolId: 'pool-4',
      poolName: 'Security',
      currentAmount: 12000,
      priorAmount: 10000,
      varianceAmount: 2000,
      variancePercent: 20.0,
      varianceType: 'increase',
      isNew: false,
    },
  ]

  describe('Rendering', () => {
    it('renders variance table with all columns', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByText('Expense Pool')).toBeInTheDocument()
      expect(screen.getByText('Prior Year')).toBeInTheDocument()
      expect(screen.getByText('Current Year')).toBeInTheDocument()
      expect(screen.getByText('Variance ($)')).toBeInTheDocument()
      expect(screen.getByText('Variance (%)')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })

    it('renders all expense pool names', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByText('Utilities')).toBeInTheDocument()
      expect(screen.getByText('Janitorial')).toBeInTheDocument()
      expect(screen.getByText('Insurance')).toBeInTheDocument()
      expect(screen.getByText('Security')).toBeInTheDocument()
    })

    it('formats currency values correctly', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByText('$50,000.00')).toBeInTheDocument()
      expect(screen.getByText('$45,000.00')).toBeInTheDocument()
      expect(screen.getByText('$5,000.00')).toBeInTheDocument()
    })

    it('formats percentage values with + sign for increases', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      const percentCells = screen.getAllByText(/\+\d+\.\d+%/)
      expect(percentCells.length).toBeGreaterThan(0)
    })

    it('shows empty state when no data', () => {
      render(<VarianceTable data={[]} highlightThreshold={10} />)

      expect(
        screen.getByText('No variance data available.')
      ).toBeInTheDocument()
    })
  })

  describe('Status Badges', () => {
    it('displays Increase badge for positive variances', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      const increaseBadges = screen.getAllByText('Increase')
      expect(increaseBadges.length).toBe(2) // Utilities and Security
    })

    it('displays Decrease badge for negative variances', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByText('Decrease')).toBeInTheDocument()
    })

    it('displays No Change badge for zero variance', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByText('No Change')).toBeInTheDocument()
    })
  })

  describe('New pools (no prior-year amount)', () => {
    const newPool: VarianceItem[] = [
      {
        poolId: 'pool-new',
        poolName: 'Operating Expenses',
        currentAmount: 63900,
        priorAmount: 0,
        varianceAmount: 63900,
        variancePercent: 0,
        varianceType: 'new',
        isNew: true,
      },
    ]

    it('shows "New" in the variance % cell instead of a percentage', () => {
      render(<VarianceTable data={newPool} highlightThreshold={10} />)

      // "New" appears in both the % cell and the status badge.
      expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(1)
      // No misleading +0.00% for a pool that had no prior-year baseline.
      expect(screen.queryByText('+0.00%')).not.toBeInTheDocument()
    })

    it('renders a New status badge, not Increase/Decrease/No Change', () => {
      render(<VarianceTable data={newPool} highlightThreshold={10} />)

      expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Increase')).not.toBeInTheDocument()
      expect(screen.queryByText('Decrease')).not.toBeInTheDocument()
      expect(screen.queryByText('No Change')).not.toBeInTheDocument()
    })

    it('does not color or highlight a new pool', () => {
      const { container } = render(
        <VarianceTable data={newPool} highlightThreshold={10} />
      )

      expect(
        container.querySelectorAll(
          '.text-destructive-strong, .text-success-strong'
        ).length
      ).toBe(0)
      expect(container.querySelectorAll('.bg-muted\\/50').length).toBe(0)
    })

    it('keeps new pools visible when filtering to significant only', () => {
      render(
        <VarianceTable
          data={newPool}
          highlightThreshold={50}
          showOnlySignificant={true}
        />
      )

      expect(screen.getByText('Operating Expenses')).toBeInTheDocument()
    })
  })

  describe('Color Coding', () => {
    it('applies red color to increases above threshold', () => {
      const { container } = render(
        <VarianceTable data={mockData} highlightThreshold={10} />
      )

      const redCells = container.querySelectorAll('.text-destructive-strong')
      expect(redCells.length).toBeGreaterThan(0)
    })

    it('applies green color to decreases above threshold', () => {
      const { container } = render(
        <VarianceTable data={mockData} highlightThreshold={10} />
      )

      const greenCells = container.querySelectorAll('.text-success-strong')
      expect(greenCells.length).toBeGreaterThan(0)
    })

    it('does not color variances below threshold', () => {
      const smallVariance: VarianceItem[] = [
        {
          poolId: 'pool-1',
          poolName: 'Small Change',
          currentAmount: 10100,
          priorAmount: 10000,
          varianceAmount: 100,
          variancePercent: 1.0,
          varianceType: 'increase',
          isNew: false,
        },
      ]

      const { container } = render(
        <VarianceTable data={smallVariance} highlightThreshold={10} />
      )

      const coloredCells = container.querySelectorAll(
        '.text-destructive-strong, .text-success'
      )
      expect(coloredCells.length).toBe(0)
    })
  })

  describe('Threshold Highlighting', () => {
    it('highlights rows that exceed threshold', () => {
      const { container } = render(
        <VarianceTable data={mockData} highlightThreshold={10} />
      )

      const highlightedRows = container.querySelectorAll('.bg-muted\\/50')
      expect(highlightedRows.length).toBe(3) // Utilities, Janitorial, Security all > 10%
    })

    it('does not highlight rows below threshold', () => {
      render(<VarianceTable data={mockData} highlightThreshold={25} />)

      const table = screen.getByRole('table')
      const rows = table.querySelectorAll('tbody tr')

      // All rows should be below 25% threshold:
      // Utilities (11.11%), Janitorial (14.29%), Insurance (0%), Security (20%)
      const unhighlightedRows = Array.from(rows).filter(
        (row) => !row.classList.contains('bg-muted/50')
      )
      expect(unhighlightedRows.length).toBe(4)
    })
  })

  describe('Filtering', () => {
    it('shows only significant variances when showOnlySignificant is true', () => {
      render(
        <VarianceTable
          data={mockData}
          highlightThreshold={15}
          showOnlySignificant={true}
        />
      )

      expect(screen.getByText('Security')).toBeInTheDocument() // 20% variance
      expect(screen.queryByText('Insurance')).not.toBeInTheDocument() // 0% variance
    })

    it('shows all variances when showOnlySignificant is false', () => {
      render(
        <VarianceTable
          data={mockData}
          highlightThreshold={15}
          showOnlySignificant={false}
        />
      )

      expect(screen.getByText('Utilities')).toBeInTheDocument()
      expect(screen.getByText('Janitorial')).toBeInTheDocument()
      expect(screen.getByText('Insurance')).toBeInTheDocument()
      expect(screen.getByText('Security')).toBeInTheDocument()
    })

    it('shows message when no variances exceed threshold with showOnlySignificant', () => {
      render(
        <VarianceTable
          data={mockData}
          highlightThreshold={50}
          showOnlySignificant={true}
        />
      )

      expect(
        screen.getByText(/No variances exceed the 50% threshold/)
      ).toBeInTheDocument()
    })
  })

  describe('mobile layout', () => {
    beforeEach(() => {
      mockIsMobile = true
    })

    it('renders mobile-cards-view with pool names and status badges', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
      expect(screen.getByText('Utilities')).toBeInTheDocument()
      expect(screen.getByText('Janitorial')).toBeInTheDocument()
    })

    it('shows Prior Year / Current Year / Variance labels in mobile cards', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      expect(screen.getAllByText(/Prior Year/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Current Year/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Variance \(\$\)/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Variance \(%\)/i).length).toBeGreaterThan(0)
    })

    it('preserves signed percentage formatting on mobile', () => {
      render(<VarianceTable data={mockData} highlightThreshold={10} />)

      const percentCells = screen.getAllByText(/\+\d+\.\d+%/)
      expect(percentCells.length).toBeGreaterThan(0)
    })

    it('preserves color class for significant variances on mobile', () => {
      const { container } = render(
        <VarianceTable data={mockData} highlightThreshold={10} />
      )

      const redCells = container.querySelectorAll('.text-destructive-strong')
      expect(redCells.length).toBeGreaterThan(0)
    })
  })
})
