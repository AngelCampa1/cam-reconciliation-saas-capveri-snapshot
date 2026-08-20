/**
 * PropertyListPage Tests
 *
 * Tests for the property list page component including:
 * - Data display
 * - Search functionality
 * - Sorting
 * - Pagination
 * - Empty state
 * - Navigation
 * - Loading state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PropertyListPage } from './PropertyListPage'
import * as hooks from '@/api/hooks'
import type { PropertyListResponse, Property } from '@/api/client'
import * as freeAuditHooks from '@/hooks/use-free-audit-status'

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@/lib/analytics', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics')
  return {
    ...actual,
    trackEvent: trackEventMock,
  }
})

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock data
const mockProperties: Property[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Sunset Plaza',
    address_line1: '123 Main St',
    address_line2: null,
    city: 'Los Angeles',
    state: 'CA',
    postal_code: '90001',
    total_rentable_sqft: '50000',
    total_usable_sqft: '45000',
    common_area_sqft: '5000',
    target_occupancy: '0.95',
    organization_id: 'org-123',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: '223e4567-e89b-12d3-a456-426614174001',
    name: 'Downtown Center',
    address_line1: '456 Oak Ave',
    address_line2: 'Suite 100',
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94102',
    total_rentable_sqft: '75000',
    total_usable_sqft: '68000',
    common_area_sqft: '7000',
    target_occupancy: '0.93',
    organization_id: 'org-123',
    created_at: '2024-02-20T15:30:00Z',
    updated_at: '2024-02-20T15:30:00Z',
  },
  {
    id: '323e4567-e89b-12d3-a456-426614174002',
    name: 'Tech Campus',
    address_line1: '789 Innovation Dr',
    address_line2: null,
    city: 'Mountain View',
    state: 'CA',
    postal_code: '94043',
    total_rentable_sqft: '120000',
    total_usable_sqft: '110000',
    common_area_sqft: '10000',
    target_occupancy: '0.95',
    organization_id: 'org-123',
    created_at: '2024-03-10T08:00:00Z',
    updated_at: '2024-03-10T08:00:00Z',
  },
]

const mockResponse: PropertyListResponse = {
  data: mockProperties,
  count: 3,
  has_more: false,
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  )
}

describe('PropertyListPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    trackEventMock.mockClear()
    vi.spyOn(freeAuditHooks, 'useFreeAuditStatus').mockReturnValue({
      data: {
        has_subscription: false,
        free_audit_consumed: false,
        can_add_property: true,
        can_run_reconciliation: true,
      },
    } as never)
  })

  it('renders property list table with all columns', async () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Check column headers
    expect(screen.getByText('Property Name')).toBeInTheDocument()
    expect(screen.getByText('Address')).toBeInTheDocument()
    expect(screen.getByText('Total Rentable Sqft')).toBeInTheDocument()
    expect(screen.getByText('Total Usable Sqft')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()

    // Check data is displayed
    await waitFor(() => {
      expect(screen.getByText('Sunset Plaza')).toBeInTheDocument()
      expect(screen.getByText('Downtown Center')).toBeInTheDocument()
      expect(screen.getByText('Tech Campus')).toBeInTheDocument()
    })
    expect(trackEventMock).toHaveBeenCalledWith('properties_viewed', {
      property_count: 3,
      property_count_bucket: '1-10',
      has_more: false,
    })

    // Check formatted data
    expect(screen.getByText('50,000')).toBeInTheDocument() // Formatted sqft
    expect(
      screen.getByText(/123 Main St.*Los Angeles.*CA.*90001/)
    ).toBeInTheDocument()
  })

  it('filters properties by search term', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Initially shows all properties
    expect(screen.getByText('Sunset Plaza')).toBeInTheDocument()
    expect(screen.getByText('Downtown Center')).toBeInTheDocument()
    expect(screen.getByText('Tech Campus')).toBeInTheDocument()

    // Search for "downtown"
    const searchInput = screen.getByTestId('property-search-input')
    await user.type(searchInput, 'downtown')

    // Wait for debounce (300ms)
    await waitFor(
      () => {
        expect(screen.getByText('Downtown Center')).toBeInTheDocument()
        expect(screen.queryByText('Sunset Plaza')).not.toBeInTheDocument()
        expect(screen.queryByText('Tech Campus')).not.toBeInTheDocument()
      },
      { timeout: 500 }
    )
    expect(trackEventMock).toHaveBeenCalledWith('property_search_used', {
      result_count: 1,
      result_count_bucket: '1-10',
      total_count: 3,
      total_count_bucket: '1-10',
      has_results: true,
    })
  })

  it('sorts properties by column', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Get all rows
    const getRows = () => screen.getAllByRole('row').slice(1) // Skip header

    // Click sort on Property Name column
    const nameHeader = screen.getByText('Property Name')
    await user.click(nameHeader)

    // Check order changed (should be ascending alphabetically)
    await waitFor(() => {
      const rows = getRows()
      expect(within(rows[0]).getByText('Downtown Center')).toBeInTheDocument()
      expect(within(rows[1]).getByText('Sunset Plaza')).toBeInTheDocument()
      expect(within(rows[2]).getByText('Tech Campus')).toBeInTheDocument()
    })
  })

  it('displays loading skeleton while fetching', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Check for skeleton
    expect(screen.getByTestId('data-table-skeleton')).toBeInTheDocument()
  })

  it('displays empty state when no properties exist', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Check empty state
    expect(screen.getByText('No properties yet')).toBeInTheDocument()
    expect(
      screen.getByText('Get started by adding your first property.')
    ).toBeInTheDocument()
    // At least one "Add Property" button should be present
    expect(
      screen.getAllByRole('button', { name: /add property/i }).length
    ).toBeGreaterThan(0)
  })

  it('displays empty state for search with no results', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Search for non-existent property
    const searchInput = screen.getByTestId('property-search-input')
    await user.type(searchInput, 'nonexistent property name')

    // Wait for debounce and empty state
    await waitFor(
      () => {
        expect(screen.getByText('No properties found')).toBeInTheDocument()
        expect(
          screen.getByText('Try adjusting your search criteria.')
        ).toBeInTheDocument()
      },
      { timeout: 2000 }
    )
  })

  it('navigates to property detail on row click', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Click on first property row
    const firstPropertyRow = screen.getByText('Sunset Plaza').closest('tr')!
    await user.click(firstPropertyRow)

    // Check navigation
    expect(mockNavigate).toHaveBeenCalledWith(
      '/properties/123e4567-e89b-12d3-a456-426614174000'
    )
    expect(trackEventMock).toHaveBeenCalledWith('property_detail_opened', {
      property_id: '123e4567-e89b-12d3-a456-426614174000',
    })
  })

  it('navigates to new property form on add button click', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Click "Add Property" button
    const addButton = screen.getAllByRole('button', {
      name: /add property/i,
    })[0]
    await user.click(addButton)

    // Check navigation
    expect(mockNavigate).toHaveBeenCalledWith('/properties/new')
    expect(trackEventMock).toHaveBeenCalledWith('property_add_clicked', {
      can_add_property: true,
      has_subscription: false,
      free_audit_consumed: false,
    })
  })

  it('opens upgrade modal instead of navigating when add property is gated', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(freeAuditHooks, 'useFreeAuditStatus').mockReturnValue({
      data: {
        has_subscription: false,
        free_audit_consumed: true,
        can_add_property: false,
        can_run_reconciliation: false,
      },
    } as never)

    renderWithProviders(<PropertyListPage />)
    const addButton = screen.getAllByRole('button', {
      name: /add property/i,
    })[0]
    await user.click(addButton)

    expect(mockNavigate).not.toHaveBeenCalledWith('/properties/new')
    expect(trackEventMock).toHaveBeenCalledWith('property_add_blocked', {
      block_reason: 'free_audit_limit',
      has_subscription: false,
      free_audit_consumed: true,
    })
    expect(
      screen.getByText(/your free reconciliation is ready/i)
    ).toBeInTheDocument()
  })

  it('displays error message when fetch fails', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' } as never,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Check error message components
    expect(screen.getByText("Couldn't load properties")).toBeInTheDocument()
    expect(
      screen.getByText(
        'Connection failed. Please check your internet connection and try again.'
      )
    ).toBeInTheDocument()
  })

  it('shows a truncation notice when more properties exist than were loaded', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: { data: mockProperties, count: 250, has_more: true },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    const notice = screen.getByTestId('property-truncation-notice')
    expect(notice).toBeInTheDocument()
    expect(notice).toHaveTextContent(/Showing the first 3 of 250 properties/i)
  })

  it('does not show the truncation notice when all properties are loaded', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: mockResponse,
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    expect(
      screen.queryByTestId('property-truncation-notice')
    ).not.toBeInTheDocument()
  })

  it('handles pagination correctly', async () => {
    const user = userEvent.setup()

    // Create 25 mock properties to test pagination
    const manyProperties: Property[] = Array.from({ length: 25 }, (_, i) => ({
      id: `property-${i}`,
      name: `Property ${i + 1}`,
      address_line1: `${100 + i} Main St`,
      address_line2: null,
      city: 'Test City',
      state: 'CA',
      postal_code: '90001',
      total_rentable_sqft: '10000',
      total_usable_sqft: '9000',
      common_area_sqft: '1000',
      target_occupancy: '0.95',
      organization_id: 'org-123',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }))

    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: { data: manyProperties, count: 25, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Initial page should show first 10 properties
    await waitFor(() => {
      expect(screen.getByText('Property 1')).toBeInTheDocument()
      expect(screen.getByText('Property 10')).toBeInTheDocument()
      expect(screen.queryByText('Property 11')).not.toBeInTheDocument()
    })

    // Click next page button
    const nextButton = screen.getByRole('button', { name: /next page/i })
    await user.click(nextButton)

    // Should show next 10 properties
    await waitFor(() => {
      expect(screen.queryByText('Property 1')).not.toBeInTheDocument()
      expect(screen.getByText('Property 11')).toBeInTheDocument()
      expect(screen.getByText('Property 20')).toBeInTheDocument()
    })

    // Click previous button
    const prevButton = screen.getByRole('button', { name: /previous page/i })
    await user.click(prevButton)

    // Should go back to first page
    await waitFor(() => {
      expect(screen.getByText('Property 1')).toBeInTheDocument()
      expect(screen.queryByText('Property 11')).not.toBeInTheDocument()
    })
  })

  it('does not crash and filters correctly when a property has null address fields', async () => {
    const user = userEvent.setup()
    const propertiesWithNullAddress: Property[] = [
      {
        id: 'null-addr-1',
        name: 'No Address Building',
        address_line1: null as unknown as string,
        address_line2: null,
        city: null as unknown as string,
        state: null as unknown as string,
        postal_code: null as unknown as string,
        total_rentable_sqft: '10000',
        total_usable_sqft: '9000',
        common_area_sqft: '1000',
        target_occupancy: '0.95',
        organization_id: 'org-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'with-addr-2',
        name: 'Known Location',
        address_line1: '100 Commerce Dr',
        address_line2: null,
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        total_rentable_sqft: '20000',
        total_usable_sqft: '18000',
        common_area_sqft: '2000',
        target_occupancy: '0.90',
        organization_id: 'org-123',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      },
    ]

    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: { data: propertiesWithNullAddress, count: 2, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<PropertyListPage />)

    // Both properties render without crashing
    expect(screen.getByText('No Address Building')).toBeInTheDocument()
    expect(screen.getByText('Known Location')).toBeInTheDocument()

    // Searching should not throw even though first property has null fields
    const searchInput = screen.getByTestId('property-search-input')
    await user.type(searchInput, 'austin')

    await waitFor(
      () => {
        expect(screen.getByText('Known Location')).toBeInTheDocument()
        expect(
          screen.queryByText('No Address Building')
        ).not.toBeInTheDocument()
      },
      { timeout: 500 }
    )
  })

  it('shows an offline notice instead of the empty state when the query is paused', () => {
    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    } as never)

    renderWithProviders(<PropertyListPage />)

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/no properties yet/i)).not.toBeInTheDocument()
  })

  it('handles large datasets (1000+ properties) without lag', async () => {
    // Create 1000 mock properties
    const largeDataset: Property[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `property-${i}`,
      name: `Property ${i + 1}`,
      address_line1: `${100 + i} Main St`,
      address_line2: null,
      city: 'Test City',
      state: 'CA',
      postal_code: '90001',
      total_rentable_sqft: '10000',
      total_usable_sqft: '9000',
      common_area_sqft: '1000',
      target_occupancy: '0.95',
      organization_id: 'org-123',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }))

    vi.spyOn(hooks, 'useProperties').mockReturnValue({
      data: { data: largeDataset, count: 1000, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    const startTime = performance.now()
    renderWithProviders(<PropertyListPage />)
    const renderTime = performance.now() - startTime

    // Should render within reasonable time (< 1 second)
    expect(renderTime).toBeLessThan(1000)

    // Should only render current page (10 items by default)
    await waitFor(() => {
      const rows = screen.getAllByRole('row').slice(1) // Skip header
      expect(rows).toHaveLength(10)
    })

    // Verify first and last items of first page are visible
    expect(screen.getByText('Property 1')).toBeInTheDocument()
    expect(screen.getByText('Property 10')).toBeInTheDocument()
    expect(screen.queryByText('Property 11')).not.toBeInTheDocument()
  })
})
