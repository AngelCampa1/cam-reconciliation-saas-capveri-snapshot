/**
 * Tests for TrendAnalysisPage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TrendAnalysisPage } from './TrendAnalysisPage'
import {
  useAvailableYears,
  useYearOverYearComparison,
  useAnomalyDetection,
} from '@/features/analysis/hooks/useYearOverYear'

// Mock Recharts components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: ({ name }: { name?: string }) => <div data-testid="line">{name}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}))

// Mock the chart export hook
vi.mock('@/features/analysis/hooks/useChartExport', () => ({
  useChartExport: () => ({
    exportAsImage: vi.fn(),
    isExporting: false,
  }),
}))

// Mock the API client
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

// Mock the year over year hooks
vi.mock('@/features/analysis/hooks/useYearOverYear', () => ({
  useAvailableYears: vi.fn(() => ({
    data: [2023, 2024, 2025],
    isLoading: false,
  })),
  useYearOverYearComparison: vi.fn(() => ({
    mutate: vi.fn(),
    data: {
      property_id: 'prop-1',
      property_name: 'Test Property',
      years: [2023, 2024, 2025],
      base_year: 2023,
      pool_comparisons: [
        {
          pool_name: 'Utilities',
          amounts: { 2023: 100000, 2024: 110000, 2025: 120000 },
          base_year_amount: 100000,
          variance_amount: 20000,
          variance_percent: 20,
          variance_level: 'warning',
          matched_from: null,
        },
        {
          pool_name: 'Janitorial',
          amounts: { 2023: 50000, 2024: 52000, 2025: 55000 },
          base_year_amount: 50000,
          variance_amount: 5000,
          variance_percent: 10,
          variance_level: 'normal',
          matched_from: null,
        },
      ],
      total_amounts: { 2023: 150000, 2024: 162000, 2025: 175000 },
      total_variance_amount: 25000,
      total_variance_percent: 16.7,
    },
    isPending: false,
  })),
  useAnomalyDetection: vi.fn(() => ({
    mutate: vi.fn(),
    data: {
      property_id: 'prop-1',
      target_year: 2025,
      anomalies: [
        {
          pool_name: 'Utilities',
          anomaly_type: 'spike',
          severity: 'critical',
          current_value: 120000,
          expected_value: 100000,
          variance_percent: 20,
          explanation: 'Utilities spike detected in 2025',
          years_affected: [2025],
        },
        {
          pool_name: 'Janitorial',
          anomaly_type: 'drop',
          severity: 'warning',
          current_value: 55000,
          expected_value: 60000,
          variance_percent: -8.3,
          explanation: 'Janitorial drop detected in 2025',
          years_affected: [2025],
        },
      ],
      total_anomalies: 2,
      critical_count: 1,
      warning_count: 1,
      info_count: 0,
    },
  })),
}))

// Helper function to render with providers
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  )
}

describe('TrendAnalysisPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Mock properties API
    const { apiClient } = await import('@/api/client')
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [
          { id: 'prop-1', name: 'Test Property' },
          { id: 'prop-2', name: 'Another Property' },
        ],
        count: 2,
        has_more: false,
      },
      error: null,
    })
  })

  it('renders page title and description', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    expect(screen.getByText('Trend Analysis')).toBeInTheDocument()
    expect(
      screen.getByText(/See how your expenses have changed year to year/)
    ).toBeInTheDocument()
  })

  it('renders filters card with controls', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    expect(screen.getByText('Filters & Options')).toBeInTheDocument()
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByLabelText('Property')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Expense Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Y-Axis Scale')).toBeInTheDocument()
    expect(screen.getByLabelText('Show trendline')).toBeInTheDocument()
  })

  it('shows empty state when no property selected', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    expect(
      screen.getByText('Select a property to view expense trends')
    ).toBeInTheDocument()
  })

  it('renders export button', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    expect(
      screen.getByRole('button', { name: /Export PNG/i })
    ).toBeInTheDocument()
  })

  it('toggles trendline visibility', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TrendAnalysisPage />)

    const trendlineCheckbox = screen.getByLabelText('Show trendline')

    // Initially checked (default is true)
    expect(trendlineCheckbox).toBeChecked()

    // Uncheck
    await user.click(trendlineCheckbox)
    expect(trendlineCheckbox).not.toBeChecked()

    // Check again
    await user.click(trendlineCheckbox)
    expect(trendlineCheckbox).toBeChecked()
  })

  it('changes Y-axis mode', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TrendAnalysisPage />)

    const yAxisSelect = screen.getByLabelText('Y-Axis Scale')
    await user.click(yAxisSelect)

    // Should show percentage option
    const percentageOption = screen.getByRole('option', {
      name: /Percentage/i,
    })
    expect(percentageOption).toBeInTheDocument()
  })

  it('hides anomaly legend when anomaly data is empty', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    expect(screen.queryByText('Chart Legend')).not.toBeInTheDocument()
    expect(screen.queryByText(/Warning anomalies/)).not.toBeInTheDocument()
  })

  it('renders detected anomalies filtered to the selected pool', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TrendAnalysisPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('Property')).toBeInTheDocument()
    })

    const propertySelect = screen.getByLabelText('Property')
    await user.click(propertySelect)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Test Property/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Test Property/i }))

    // Default category is 'utilities' (first pool), so only the Utilities
    // anomaly should render, not the Janitorial one.
    await waitFor(() => {
      expect(screen.getByText('Detected Anomalies')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Utilities spike detected in 2025')
    ).toBeInTheDocument()
    // A spike must be headed "Spike Detected", never "Drop Detected".
    expect(screen.getByText(/^Spike Detected/)).toBeInTheDocument()
    expect(screen.queryByText(/Drop Detected/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Janitorial drop detected in 2025')
    ).not.toBeInTheDocument()
    // Legend appears once anomalies exist
    expect(screen.getByText('Chart Legend')).toBeInTheDocument()
  })

  it('labels a new-category anomaly "New Category", not "Drop Detected"', async () => {
    // Regression: every non-spike anomaly used to be headed "Drop Detected",
    // so a brand-new expense category (an increase from nothing) read as a
    // drop — the opposite of what happened.
    // The page re-renders several times, so use a persistent return value
    // (not ...Once) and restore the default afterwards so it doesn't leak.
    const original = vi.mocked(useAnomalyDetection).getMockImplementation()
    vi.mocked(useAnomalyDetection).mockReturnValue({
      mutate: vi.fn(),
      data: {
        property_id: 'prop-1',
        target_year: 2024,
        anomalies: [
          {
            pool_name: 'Utilities',
            anomaly_type: 'new_category',
            severity: 'warning',
            current_value: 285500,
            expected_value: 0,
            variance_percent: 0,
            explanation:
              'Utilities is a new expense category not present in prior years',
            years_affected: [2024],
          },
        ],
        total_anomalies: 1,
        critical_count: 0,
        warning_count: 1,
        info_count: 0,
      },
    } as unknown as ReturnType<typeof useAnomalyDetection>)

    try {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      await waitFor(() => {
        expect(screen.getByLabelText('Property')).toBeInTheDocument()
      })
      await user.click(screen.getByLabelText('Property'))
      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Test Property/i })
        ).toBeInTheDocument()
      })
      await user.click(screen.getByRole('option', { name: /Test Property/i }))

      await waitFor(() => {
        expect(screen.getByText(/^New Category/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/Drop Detected/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Spike Detected/)).not.toBeInTheDocument()
    } finally {
      if (original) {
        vi.mocked(useAnomalyDetection).mockImplementation(original)
      }
    }
  })

  it('updates rendered anomalies when category changes to another pool', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TrendAnalysisPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('Property')).toBeInTheDocument()
    })

    const propertySelect = screen.getByLabelText('Property')
    await user.click(propertySelect)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Test Property/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Test Property/i }))

    await waitFor(() => {
      expect(screen.getByLabelText('Expense Category')).not.toBeDisabled()
    })

    const categorySelect = screen.getByLabelText('Expense Category')
    await user.click(categorySelect)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Janitorial/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /Janitorial/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Janitorial drop detected in 2025')
      ).toBeInTheDocument()
    })
    expect(
      screen.queryByText('Utilities spike detected in 2025')
    ).not.toBeInTheDocument()
  })

  describe('User Interactions', () => {
    it('loads properties on mount', async () => {
      renderWithProviders(<TrendAnalysisPage />)

      const { apiClient } = await import('@/api/client')

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith({
          url: '/api/v1/properties',
        })
      })
    })

    it('shows property selector with loaded properties', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByLabelText('Property')).toBeInTheDocument()
      })

      const propertySelect = screen.getByLabelText('Property')
      await user.click(propertySelect)

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Test Property/i })
        ).toBeInTheDocument()
      })
    })

    it('updates Y-axis mode to percentage', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      const yAxisSelect = screen.getByLabelText('Y-Axis Scale')
      await user.click(yAxisSelect)

      const percentageOption = screen.getByRole('option', {
        name: /Percentage/i,
      })
      await user.click(percentageOption)

      expect(yAxisSelect).toHaveTextContent('Percentage (%)')
    })

    it('selects a property and shows chart with trend data', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      // Wait for properties to load
      await waitFor(() => {
        expect(screen.getByLabelText('Property')).toBeInTheDocument()
      })

      // Select a property
      const propertySelect = screen.getByLabelText('Property')
      await user.click(propertySelect)

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Test Property/i })
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('option', { name: /Test Property/i }))

      // Chart should now render (mocked data returns utilities as default category)
      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument()
      })
    })

    it('enables export button when chart has data', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      // Wait for properties and select one
      await waitFor(() => {
        expect(screen.getByLabelText('Property')).toBeInTheDocument()
      })

      const propertySelect = screen.getByLabelText('Property')
      await user.click(propertySelect)

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Test Property/i })
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('option', { name: /Test Property/i }))

      // Wait for chart to render
      await waitFor(() => {
        expect(screen.getByTestId('line-chart')).toBeInTheDocument()
      })

      // Export button should be enabled when chart has data
      const exportButton = screen.getByRole('button', { name: /Export PNG/i })
      expect(exportButton).not.toBeDisabled()
    })

    it('changes expense category', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TrendAnalysisPage />)

      // Wait for properties and select one
      await waitFor(() => {
        expect(screen.getByLabelText('Property')).toBeInTheDocument()
      })

      const propertySelect = screen.getByLabelText('Property')
      await user.click(propertySelect)

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Test Property/i })
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('option', { name: /Test Property/i }))

      // Wait for category selector to be enabled
      await waitFor(() => {
        expect(screen.getByLabelText('Expense Category')).not.toBeDisabled()
      })

      // Change category
      const categorySelect = screen.getByLabelText('Expense Category')
      await user.click(categorySelect)

      await waitFor(() => {
        expect(
          screen.getByRole('option', { name: /Janitorial/i })
        ).toBeInTheDocument()
      })

      await user.click(screen.getByRole('option', { name: /Janitorial/i }))

      // Verify category changed
      expect(categorySelect).toHaveTextContent('Janitorial')
    })
  })
})

describe('TrendAnalysisPage - Offline / paused', () => {
  // Properties load, but the available-years fetch is paused (unreachable
  // backend: no data, no error). Without the guard this falls through to a
  // misleading "No expense data" empty state instead of an offline notice.
  beforeEach(async () => {
    vi.clearAllMocks()
    const { apiClient } = await import('@/api/client')
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: [{ id: 'prop-1', name: 'Test Property' }] },
      error: null,
    })
    vi.mocked(useAvailableYears).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPaused: true,
    } as any)
    vi.mocked(useYearOverYearComparison).mockReturnValue({
      mutate: vi.fn(),
    } as any)
  })

  it('shows an offline notice instead of an empty state when the years fetch is paused', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TrendAnalysisPage />)

    await user.click(await screen.findByLabelText('Property'))
    await user.click(
      await screen.findByRole('option', { name: /Test Property/i })
    )

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText('No expense data')).not.toBeInTheDocument()
  })
})

describe('TrendAnalysisPage - Properties paused', () => {
  // The properties fetch itself is paused (unreachable backend) before any
  // property is selected: the selector must show an offline notice + retry
  // rather than a silent empty dropdown.
  beforeEach(() => {
    vi.clearAllMocks()
    onlineManager.setOnline(false)
  })
  afterEach(() => {
    onlineManager.setOnline(true)
  })

  it('shows an offline notice in the property selector when the fetch is paused', async () => {
    renderWithProviders(<TrendAnalysisPage />)

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
  })
})
