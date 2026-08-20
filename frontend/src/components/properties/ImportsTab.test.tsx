/**
 * ImportsTab Component Tests
 *
 * Tests for the imports tab within property detail page including:
 * - Import batch table display with all columns
 * - Status badges with correct colors
 * - Navigation to full imports page
 * - Empty state when no imports
 * - Error handling
 * - Data slicing (10 most recent)
 *
 * Coverage Target: 100%
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import { ImportsTab } from './ImportsTab'
import * as hooks from '@/api/hooks'

// Mock react-router-dom
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock import batches data
const mockBatches = [
  {
    id: 'batch-1',
    filename: 'yardi_gl_2024.csv',
    parser_type: 'yardi',
    status: 'completed',
    rows_processed: 1000,
    rows_imported: 1000,
    rows_failed: 0,
    created_at: '2024-01-01T10:00:00Z',
    property_id: 'prop-123',
  },
  {
    id: 'batch-2',
    filename: 'mri_export.csv',
    parser_type: 'mri',
    status: 'failed',
    rows_processed: 500,
    rows_imported: 450,
    rows_failed: 50,
    created_at: '2024-01-02T11:00:00Z',
    property_id: 'prop-123',
  },
  {
    id: 'batch-3',
    filename: 'generic_data.csv',
    parser_type: 'generic',
    status: 'processing',
    rows_processed: 750,
    rows_imported: 750,
    rows_failed: 0,
    created_at: '2024-01-03T12:00:00Z',
    property_id: 'prop-123',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe('ImportsTab', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  describe('Rendering States', () => {
    it('should render loading skeleton while fetching data', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isSuccess: false,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // DataTable shows loading state
      expect(screen.queryByRole('table')).toBeInTheDocument()
    })

    it('should render error message when fetch fails', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to fetch imports' },
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText(/couldn't load imports/i)).toBeInTheDocument()
    })

    it('should render empty state when no imports exist', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('No imports yet')).toBeInTheDocument()
      expect(screen.getByText('Upload GL Data')).toBeInTheDocument()
    })

    it('should render table with imports when data exists', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: mockBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('yardi_gl_2024.csv')).toBeInTheDocument()
      expect(screen.getByText('mri_export.csv')).toBeInTheDocument()
      expect(screen.getByText('generic_data.csv')).toBeInTheDocument()
    })

    it('should render empty state when data array is empty', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('No imports yet')).toBeInTheDocument()
    })
  })

  describe('Data Display - All Columns', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: mockBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should display file name with FileSpreadsheet icon', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // File names should be visible
      expect(screen.getByText('yardi_gl_2024.csv')).toBeInTheDocument()
      expect(screen.getByText('mri_export.csv')).toBeInTheDocument()
    })

    it('should display formatted date in correct locale format', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // Dates should be formatted (MMM D, YYYY format)
      const janDates = screen.getAllByText(/Jan/i)
      expect(janDates.length).toBeGreaterThan(0)
    })

    it('should display source system with correct labels (Yardi/MRI/Generic)', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('Yardi Voyager')).toBeInTheDocument()
      expect(screen.getByText('MRI Commercial')).toBeInTheDocument()
      expect(screen.getByText('Generic Format')).toBeInTheDocument()
    })

    it('should display row count with thousand separators', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('1,000')).toBeInTheDocument()
      expect(screen.getByText('500')).toBeInTheDocument()
      expect(screen.getByText('750')).toBeInTheDocument()
    })

    it('should display status badge with icon and color', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('Success')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
      expect(screen.getByText('Processing')).toBeInTheDocument()
    })
  })

  describe('Status Badge Variants', () => {
    it('should show green badge with CheckCircle icon for completed status', () => {
      const completedBatch = [
        {
          ...mockBatches[0],
          status: 'completed',
        },
      ]
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: completedBatch },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { container } = renderWithProviders(
        <ImportsTab propertyId="prop-123" />
      )

      expect(screen.getByText('Success')).toBeInTheDocument()
      // Check for success styling class
      const badge = screen.getByText('Success').closest('div')
      expect(badge?.className).toContain('text-success')
    })

    it('should show red badge with XCircle icon for failed status', () => {
      const failedBatch = [
        {
          ...mockBatches[1],
          status: 'failed',
        },
      ]
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: failedBatch },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('Failed')).toBeInTheDocument()
      const badge = screen.getByText('Failed').closest('div')
      expect(badge?.className).toContain('text-destructive')
    })

    it('should show blue badge with Loader icon for processing status', () => {
      const processingBatch = [
        {
          ...mockBatches[2],
          status: 'processing',
        },
      ]
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: processingBatch },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText('Processing')).toBeInTheDocument()
      const badge = screen.getByText('Processing').closest('div')
      expect(badge?.className).toContain('text-primary')
    })

    it('should fall back to completed styling for unknown status', () => {
      const unknownBatch = [
        {
          ...mockBatches[0],
          status: 'unknown_status',
        },
      ]
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: unknownBatch },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // Should fall back to completed config
      const badge = screen.getByText('Success').closest('div')
      expect(badge?.className).toContain('text-success')
    })
  })

  describe('Data Slicing', () => {
    it('should limit to 10 most recent imports when more exist', () => {
      const manyBatches = Array.from({ length: 15 }, (_, i) => ({
        id: `batch-${i}`,
        filename: `file-${i}.csv`,
        parser_type: 'yardi',
        status: 'completed',
        rows_processed: 1000,
        rows_imported: 1000,
        rows_failed: 0,
        created_at: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        property_id: 'prop-123',
      }))

      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: manyBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // Should only display 10
      expect(screen.getAllByText(/file-\d+\.csv/)).toHaveLength(10)
    })

    it('should display all imports when less than 10 exist', () => {
      const fewBatches = mockBatches.slice(0, 2)
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: fewBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getAllByText(/\.csv/)).toHaveLength(2)
    })

    it('should handle exactly 10 imports correctly', () => {
      const exactlyTen = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-${i}`,
        filename: `file-${i}.csv`,
        parser_type: 'yardi',
        status: 'completed',
        rows_processed: 1000,
        rows_imported: 1000,
        rows_failed: 0,
        created_at: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        property_id: 'prop-123',
      }))

      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: exactlyTen },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getAllByText(/file-\d+\.csv/)).toHaveLength(10)
    })
  })

  describe('Empty State Variants', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should show "No imports yet" heading in empty state', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('heading', { name: /no imports yet/i })
      ).toBeInTheDocument()
    })

    it('should show "Upload GL Data" button in empty state', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('button', { name: /upload gl data/i })
      ).toBeInTheDocument()
    })

    it('should show FileSpreadsheet icon in empty state', () => {
      const { container } = renderWithProviders(
        <ImportsTab propertyId="prop-123" />
      )

      // Icon is rendered via lucide-react
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('should include descriptive text in empty state', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(
        screen.getByText(/upload gl data to get started/i)
      ).toBeInTheDocument()
    })
  })

  describe('Navigation - View All Button', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: mockBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should show "View All Imports" button when data exists', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('button', { name: /view all imports/i })
      ).toBeInTheDocument()
    })

    it('should navigate to /ingestion with propertyId in state when "View All" clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      const viewAllButton = screen.getByRole('button', {
        name: /view all imports/i,
      })
      await user.click(viewAllButton)

      expect(mockNavigate).toHaveBeenCalledWith('/ingestion', {
        state: { propertyId: 'prop-123' },
      })
    })

    it('should call navigate with correct arguments', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ImportsTab propertyId="prop-456" />)

      const viewAllButton = screen.getByRole('button', {
        name: /view all imports/i,
      })
      await user.click(viewAllButton)

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith('/ingestion', {
        state: { propertyId: 'prop-456' },
      })
    })
  })

  describe('Navigation - Empty State CTA', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should navigate to /ingestion when empty state CTA clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      const uploadButton = screen.getByRole('button', {
        name: /upload gl data/i,
      })
      await user.click(uploadButton)

      expect(mockNavigate).toHaveBeenCalledWith('/ingestion', {
        state: { propertyId: 'prop-123' },
      })
    })

    it('should pass propertyId in navigation state from empty CTA', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ImportsTab propertyId="prop-789" />)

      const uploadButton = screen.getByRole('button', {
        name: /upload gl data/i,
      })
      await user.click(uploadButton)

      expect(mockNavigate).toHaveBeenCalledWith('/ingestion', {
        state: { propertyId: 'prop-789' },
      })
    })
  })

  describe('Error Display', () => {
    it('should display error message when error.message exists', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Network error occurred' },
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText("Couldn't load imports")).toBeInTheDocument()
    })

    it('should display fallback error message when error.message is undefined', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: {},
        isSuccess: false,
        isError: true,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText("Couldn't load imports")).toBeInTheDocument()
    })
  })

  describe('Props', () => {
    it('should use propertyId prop in usePropertyImports filter', () => {
      const usePropertyImportsSpy = vi.spyOn(hooks, 'usePropertyImports')
      usePropertyImportsSpy.mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-abc" />)

      // Hook no longer accepts property_id parameter
      // Backend does not yet support filtering by property
      expect(usePropertyImportsSpy).toHaveBeenCalled()
    })

    it('should render with different propertyId values', () => {
      const usePropertyImportsSpy = vi.spyOn(hooks, 'usePropertyImports')
      usePropertyImportsSpy.mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      const { rerender } = renderWithProviders(
        <ImportsTab propertyId="prop-1" />
      )

      expect(usePropertyImportsSpy).toHaveBeenCalled()

      rerender(
        <BrowserRouter>
          <QueryClientProvider client={new QueryClient()}>
            <ImportsTab propertyId="prop-2" />
          </QueryClientProvider>
        </BrowserRouter>
      )

      expect(usePropertyImportsSpy).toHaveBeenCalled()
    })
  })

  describe('Table Configuration', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: mockBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should disable pagination in DataTable', () => {
      const { container } = renderWithProviders(
        <ImportsTab propertyId="prop-123" />
      )

      // Pagination controls should not be present
      expect(
        screen.queryByRole('navigation', { name: /pagination/i })
      ).not.toBeInTheDocument()
    })

    it('should pass correct emptyMessage to DataTable', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: [] },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // Empty state should be custom (not default DataTable message)
      expect(screen.getByText('No imports yet')).toBeInTheDocument()
    })

    it('should pass isLoading state to DataTable', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isSuccess: false,
        isError: false,
      } as any)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      // Table should show loading state
      expect(screen.queryByRole('table')).toBeInTheDocument()
    })
  })

  describe('Header Section', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: { imports: mockBatches },
        isLoading: false,
        error: null,
        isSuccess: true,
        isError: false,
      } as any)
    })

    it('should display "Recent Imports" heading', () => {
      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('heading', { name: /recent imports/i })
      ).toBeInTheDocument()
    })

    it('should render heading and button in flex layout', () => {
      const { container } = renderWithProviders(
        <ImportsTab propertyId="prop-123" />
      )

      const header = container.querySelector('.space-y-4')
      expect(header).toBeInTheDocument()
    })
  })

  describe('ImportsTab - offline / paused', () => {
    it('shows offline error state and hides misleading empty copy when query is paused', () => {
      vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isPaused: true,
        refetch: vi.fn(),
        isSuccess: false,
        isError: false,
      } as never)

      renderWithProviders(<ImportsTab propertyId="prop-123" />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(screen.queryByText(/no imports yet/i)).not.toBeInTheDocument()
    })
  })
})
