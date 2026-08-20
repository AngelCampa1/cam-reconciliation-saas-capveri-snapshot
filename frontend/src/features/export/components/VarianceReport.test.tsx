/**
 * Tests for VarianceReport component.
 *
 * Verifies variance report with summary, filters, and export.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VarianceReport } from './VarianceReport'
import type { VarianceComparisonResponse } from '../types'

// Mock the useVarianceComparison hook (keep the real VarianceComparisonError
// so `instanceof` checks in the component resolve correctly).
vi.mock('../hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks')>()
  return {
    ...actual,
    useVarianceComparison: vi.fn(),
  }
})

import { useVarianceComparison, VarianceComparisonError } from '../hooks'

const mockUseVarianceComparison = vi.mocked(useVarianceComparison)

describe('VarianceReport', () => {
  const mockOnExportPDF = vi.fn()
  const mockOnExportExcel = vi.fn()

  const mockComparisonData: VarianceComparisonResponse = {
    propertyId: 'property-1',
    propertyName: 'Test Property',
    years: [2023, 2024],
    baseYear: 2023,
    currentYear: 2024,
    currentPeriod: '2024',
    priorPeriod: '2023',
    items: [
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
    ],
    totalCurrentAmount: 100000,
    totalPriorAmount: 100000,
    totalVarianceAmount: 0,
    totalVariancePercent: 0,
    isTotalNew: false,
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  const renderWithQuery = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    )
  }

  beforeEach(() => {
    mockOnExportPDF.mockClear()
    mockOnExportExcel.mockClear()
    mockUseVarianceComparison.mockReturnValue({
      data: mockComparisonData,
      isLoading: false,
      error: null,
    } as any)
  })

  describe('Rendering', () => {
    it('renders statement check report header', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(screen.getByText('Statement Check Report')).toBeInTheDocument()
    })

    it('states what the report checked and found', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByText(
          /We checked 2023 vs 2024\. We found the billing total changed by \+0\.00%/i
        )
      ).toBeInTheDocument()
    })

    it('does not claim a percent change when the prior year has no total', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: {
          ...mockComparisonData,
          totalPriorAmount: 0,
          totalCurrentAmount: 100000,
          totalVarianceAmount: 100000,
          totalVariancePercent: 0,
          isTotalNew: true,
        },
        isLoading: false,
        error: null,
      } as any)

      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByText(
          /We did not find a prior-year billing total to compare/i
        )
      ).toBeInTheDocument()
      expect(screen.queryByText(/changed by \+0\.00%/i)).not.toBeInTheDocument()
    })

    it('renders summary cards with totals', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(screen.getByText('Prior Year Total')).toBeInTheDocument()
      expect(screen.getByText('Current Year Total')).toBeInTheDocument()
      expect(screen.getByText('Total Variance')).toBeInTheDocument()
    })

    it('displays formatted currency in summary cards', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const currencyValues = screen.getAllByText(/\$100,000\.00/)
      expect(currencyValues.length).toBeGreaterThan(0)
    })
  })

  describe('Loading State', () => {
    it('shows skeleton loader while loading', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      const { container } = renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const skeletons = container.querySelectorAll('[class*="animate-pulse"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('Error State', () => {
    it('displays error message on fetch failure', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('API error'),
      } as any)

      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByText(/Couldn't load the variance comparison/)
      ).toBeInTheDocument()
    })

    it('shows a friendly empty-state when there is nothing to compare', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new VarianceComparisonError(true),
      } as any)

      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByText(/No prior year to compare against 2024 yet/)
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/Couldn't load the variance comparison/)
      ).not.toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('shows message when no data available', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      } as any)

      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByText('No variance data available.')
      ).toBeInTheDocument()
    })
  })

  describe('Threshold Slider', () => {
    it('renders threshold slider with default value', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(screen.getByText(/Highlight threshold: 10%/)).toBeInTheDocument()
    })

    it('displays threshold value', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('aria-valuenow', '10')
    })

    it('updates threshold when slider changes', async () => {
      const user = userEvent.setup()
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const slider = screen.getByRole('slider')

      // Simulate slider change
      await user.click(slider)
      await user.keyboard('{ArrowRight}{ArrowRight}')

      await waitFor(() => {
        const updatedValue = parseInt(
          slider.getAttribute('aria-valuenow') || '10'
        )
        expect(updatedValue).toBeGreaterThan(10)
      })
    })
  })

  describe('Filter Controls', () => {
    it('renders show only significant checkbox', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.getByLabelText(/Show only significant variances/)
      ).toBeInTheDocument()
    })

    it('checkbox is unchecked by default', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()
    })

    it('toggles checkbox when clicked', async () => {
      const user = userEvent.setup()
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const checkbox = screen.getByRole('checkbox')
      await user.click(checkbox)

      expect(checkbox).toBeChecked()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })
  })

  describe('Export Buttons', () => {
    it('renders PDF export button when handler provided', () => {
      renderWithQuery(
        <VarianceReport
          propertyId="property-1"
          years={[2023, 2024]}
          onExportPDF={mockOnExportPDF}
        />
      )

      expect(
        screen.getByRole('button', { name: /Download PDF/i })
      ).toBeInTheDocument()
    })

    it('renders Excel export button when handler provided', () => {
      renderWithQuery(
        <VarianceReport
          propertyId="property-1"
          years={[2023, 2024]}
          onExportExcel={mockOnExportExcel}
        />
      )

      expect(
        screen.getByRole('button', { name: /Download Excel/i })
      ).toBeInTheDocument()
    })

    it('does not render PDF button when handler not provided', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(
        screen.queryByRole('button', { name: /Download PDF/i })
      ).not.toBeInTheDocument()
    })

    it('calls onExportPDF when PDF button clicked', async () => {
      const user = userEvent.setup()
      renderWithQuery(
        <VarianceReport
          propertyId="property-1"
          years={[2023, 2024]}
          onExportPDF={mockOnExportPDF}
        />
      )

      const pdfButton = screen.getByRole('button', { name: /Download PDF/i })
      await user.click(pdfButton)

      expect(mockOnExportPDF).toHaveBeenCalledTimes(1)
    })

    it('calls onExportExcel when Excel button clicked', async () => {
      const user = userEvent.setup()
      renderWithQuery(
        <VarianceReport
          propertyId="property-1"
          years={[2023, 2024]}
          onExportExcel={mockOnExportExcel}
        />
      )

      const excelButton = screen.getByRole('button', {
        name: /Download Excel/i,
      })
      await user.click(excelButton)

      expect(mockOnExportExcel).toHaveBeenCalledTimes(1)
    })
  })

  describe('Data Display', () => {
    it('renders VarianceTable with comparison data', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      expect(screen.getByText('Utilities')).toBeInTheDocument()
      expect(screen.getByText('Janitorial')).toBeInTheDocument()
      expect(screen.getByText('Insurance')).toBeInTheDocument()
    })

    it('passes threshold to VarianceTable', () => {
      renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      // Table should be present with default threshold
      const table = screen.getByRole('table')
      expect(table).toBeInTheDocument()
    })
  })

  describe('Color Coding', () => {
    it('applies red color to positive total variance', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: {
          ...mockComparisonData,
          totalVarianceAmount: 10000,
          totalVariancePercent: 10.0,
        },
        isLoading: false,
        error: null,
      } as any)

      const { container } = renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const redText = container.querySelectorAll('.text-destructive-strong')
      expect(redText.length).toBeGreaterThan(0)
    })

    it('applies green color to negative total variance', () => {
      mockUseVarianceComparison.mockReturnValue({
        data: {
          ...mockComparisonData,
          totalVarianceAmount: -10000,
          totalVariancePercent: -10.0,
        },
        isLoading: false,
        error: null,
      } as any)

      const { container } = renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      const greenText = container.querySelectorAll('.text-success-strong')
      expect(greenText.length).toBeGreaterThan(0)
    })

    it('shows "New" instead of a percentage when there is no prior-year total', () => {
      // Empty items so only the Total Variance summary card is under test
      // (populated rows get their own color coding, covered elsewhere).
      mockUseVarianceComparison.mockReturnValue({
        data: {
          ...mockComparisonData,
          items: [],
          totalPriorAmount: 0,
          totalCurrentAmount: 836300,
          totalVarianceAmount: 836300,
          totalVariancePercent: 0,
          isTotalNew: true,
        },
        isLoading: false,
        error: null,
      } as any)

      const { container } = renderWithQuery(
        <VarianceReport propertyId="property-1" years={[2023, 2024]} />
      )

      // The Total Variance card reads "$836,300.00 New", not "+0.00%".
      expect(screen.getByText('New')).toBeInTheDocument()
      expect(screen.queryByText(/\(\+0\.00%\)/)).not.toBeInTheDocument()
      // No red/green coloring is applied to a brand-new total.
      expect(
        container.querySelectorAll(
          '.text-destructive-strong, .text-success-strong'
        ).length
      ).toBe(0)
    })
  })
})
