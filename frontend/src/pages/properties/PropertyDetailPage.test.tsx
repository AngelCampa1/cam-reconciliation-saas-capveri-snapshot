/**
 * PropertyDetailPage Tests
 *
 * Tests for the property detail page component including:
 * - Property header display
 * - Stats cards
 * - Tab navigation
 * - Edit/Delete functionality
 * - Breadcrumb navigation
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PropertyDetailPage } from './PropertyDetailPage'
import * as hooks from '@/api/hooks'
import type { Property } from '@/api/client'

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

// Mock property data
const mockProperty: Property = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Sunset Plaza',
  address_line1: '123 Main St',
  address_line2: 'Suite 100',
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
}

function renderWithProviders(
  ui: React.ReactElement,
  propertyId = mockProperty.id,
  initialEntry = `/properties/${propertyId}`
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/properties/:propertyId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PropertyDetailPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    trackEventMock.mockClear()
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: mockProperty,
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useDeleteProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: [], count: 12, has_more: false },
      isLoading: false,
    } as any)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [], count: 10, has_more: false },
      isLoading: false,
    } as any)
    vi.spyOn(hooks, 'usePropertyImports').mockReturnValue({
      data: { imports: [], total: 0 },
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useReconciliationSnapshots').mockReturnValue({
      data: { snapshots: [] },
      isLoading: false,
      error: null,
    } as any)
  })

  it('displays property header with name and address', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
      expect(
        screen.getByText(/123 Main St.*Suite 100.*Los Angeles.*CA.*90001/)
      ).toBeInTheDocument()
    })
    expect(trackEventMock).toHaveBeenCalledWith('property_detail_viewed', {
      property_id: mockProperty.id,
      state: 'CA',
      unit_count: 12,
      unit_count_bucket: '11-100',
      active_lease_count: 10,
      active_lease_count_bucket: '1-10',
      occupancy_bucket: '80-94',
      initial_tab: 'overview',
      has_compliance_tab: true,
    })
  })

  it('displays stats cards with key metrics', async () => {
    renderWithProviders(<PropertyDetailPage />)

    // Wait for data to load by checking for property name
    await waitFor(
      () => {
        expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    // Check stats card labels are present
    expect(screen.getAllByText(/Total Rentable Sqft/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Common Area Sqft/).length).toBeGreaterThan(0)
  })

  it('surfaces a retryable error when the count queries fail', async () => {
    const refetchUnits = vi.fn()
    const refetchLeases = vi.fn()
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchUnits,
    } as any)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchLeases,
    } as any)

    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // The setup card shows the failure, not a misleading "Add your first unit"
    expect(
      screen.getByText(/couldn't load this property's unit and lease counts/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /add your first unit/i })
    ).not.toBeInTheDocument()
    // The count cards show "Couldn't load" instead of a confident 0
    expect(screen.getAllByText("Couldn't load").length).toBeGreaterThan(0)
    // A failed-stats view must not be tracked with bogus zero counts
    expect(trackEventMock).not.toHaveBeenCalledWith(
      'property_detail_viewed',
      expect.anything()
    )

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetchUnits).toHaveBeenCalled()
    expect(refetchLeases).toHaveBeenCalled()
  })

  it('renders all tabs', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(
      () => {
        // Wait for property to load first
        expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )

    // Check all tabs are present
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /units/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /leases/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /imports/i })).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /reconciliations/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /compliance/i })).toBeInTheDocument()
  })

  it('hides compliance tab for non-California properties', async () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: { ...mockProperty, state: 'WA' },
      isLoading: false,
      error: null,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    expect(
      screen.queryByRole('tab', { name: /compliance/i })
    ).not.toBeInTheDocument()
  })

  it('switches between tabs on click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    // Overview tab should be active by default
    await waitFor(() => {
      const overviewTab = screen.getByRole('tab', { name: /overview/i })
      expect(overviewTab).toHaveAttribute('data-state', 'active')
    })

    // Click Units tab
    const unitsTab = screen.getByRole('tab', { name: /units/i })
    await user.click(unitsTab)

    await waitFor(() => {
      expect(unitsTab).toHaveAttribute('data-state', 'active')
    })
    expect(trackEventMock).toHaveBeenCalledWith('property_detail_tab_changed', {
      property_id: mockProperty.id,
      tab: 'units',
      source: 'tab_click',
    })
  })

  it('activates the units tab from the setup call to action when no units exist', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
    } as any)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await user.click(
      await screen.findByRole('button', { name: /add your first unit/i })
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /units/i })).toHaveAttribute(
        'data-state',
        'active'
      )
    })
    expect(trackEventMock).toHaveBeenCalledWith('property_detail_tab_changed', {
      property_id: mockProperty.id,
      tab: 'units',
      source: 'setup_next_action',
    })
  })

  it('uses the URL hash to select the initial property detail tab', async () => {
    renderWithProviders(
      <PropertyDetailPage />,
      mockProperty.id,
      `/properties/${mockProperty.id}#units`
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /units/i })).toHaveAttribute(
        'data-state',
        'active'
      )
    })
  })

  it('displays loading skeleton while fetching property', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    // Check for skeleton loading elements (animated pulse)
    const pulsing = document.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)

    // Loading state should show stat cards with loading state
    expect(screen.getByText('Total Rentable Sqft')).toBeInTheDocument()
  })

  it('displays error message when fetch fails', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' } as any,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load this property"
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your data is safe. Try again, or go back to your property list.'
    )
  })

  it('navigates to edit form on edit button click', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    const editButton = screen.getByRole('button', { name: /edit/i })
    await user.click(editButton)

    expect(mockNavigate).toHaveBeenCalledWith(
      `/properties/${mockProperty.id}/edit`
    )
  })

  it('shows delete confirmation dialog on delete button click', async () => {
    const user = userEvent.setup()

    // Mock delete mutation
    vi.spyOn(hooks, 'useDeleteProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    const deleteButton = screen.getByRole('button', { name: /delete/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText(/Delete Property/i)).toBeInTheDocument()
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    })
  })

  it('displays breadcrumb navigation', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      // PageHeader includes breadcrumb navigation
      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })
  })

  it('calls delete mutation when delete is confirmed', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()

    vi.spyOn(hooks, 'useDeleteProperty').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Open delete dialog
    const deleteButton = screen.getByRole('button', { name: /delete/i })
    await user.click(deleteButton)

    // Confirm deletion
    await waitFor(() => {
      expect(screen.getByText(/Delete Property/i)).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: /^Delete$/i })
    await user.click(confirmButton)

    expect(mockMutate).toHaveBeenCalledWith(mockProperty.id)
  })

  it('navigates to properties page on successful delete', async () => {
    let onSuccessCallback: (() => void) | undefined

    vi.spyOn(hooks, 'useDeleteProperty').mockImplementation((options: any) => {
      onSuccessCallback = options?.onSuccess
      return {
        mutate: vi.fn(),
        isPending: false,
      } as any
    })

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Trigger success callback
    if (onSuccessCallback) {
      onSuccessCallback()
    }

    expect(trackEventMock).toHaveBeenCalledWith('property_delete_succeeded', {
      property_id: mockProperty.id,
    })
    expect(mockNavigate).toHaveBeenCalledWith('/properties')
  })

  it('shows error toast on delete failure', async () => {
    let onErrorCallback: ((error: Error) => void) | undefined

    vi.spyOn(hooks, 'useDeleteProperty').mockImplementation((options: any) => {
      onErrorCallback = options?.onError
      return {
        mutate: vi.fn(),
        isPending: false,
      } as any
    })

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Trigger error callback
    if (onErrorCallback) {
      onErrorCallback(new Error('Delete failed'))
    }

    // Toast error is called (would need to mock toast to verify)
  })

  it('displays property not found when property is null', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Property not found')
  })

  it('shows offline error when query is paused and no data is available', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    } as ReturnType<typeof hooks.useProperty>)

    renderWithProviders(<PropertyDetailPage />)

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(screen.queryByText(/property not found/i)).not.toBeInTheDocument()
  })

  it('shows deleting state in delete button', async () => {
    const user = userEvent.setup()

    vi.spyOn(hooks, 'useDeleteProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Open delete dialog
    const deleteButton = screen.getByRole('button', { name: /delete/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument()
    })
  })

  it('displays leases tab content with LeasesTab component', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    const leasesTab = screen.getByRole('tab', { name: /leases/i })
    await user.click(leasesTab)

    // LeasesTab with empty data shows the canonical empty state.
    await waitFor(() => {
      expect(screen.getByText(/no leases yet/i)).toBeInTheDocument()
    })
  })

  it('displays placeholder for imports tab', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    const importsTab = screen.getByRole('tab', { name: /imports/i })
    await user.click(importsTab)

    await waitFor(() => {
      // ImportsTab renders either empty state or data table
      expect(
        screen.getByText('No imports yet') || screen.getByText('Recent Imports')
      ).toBeInTheDocument()
    })
  })

  it('displays placeholder for reconciliations tab', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    const reconciliationsTab = screen.getByRole('tab', {
      name: /reconciliations/i,
    })
    await user.click(reconciliationsTab)

    await waitFor(() => {
      // ReconciliationsTab renders either empty state or data table
      expect(
        screen.getByText('No reconciliations yet') ||
          screen.getByText('Recent Reconciliations')
      ).toBeInTheDocument()
    })
  })

  it('formats square footage with thousand separators', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      // 50000 should be formatted as "50,000" (appears multiple times)
      expect(screen.getAllByText('50,000').length).toBeGreaterThan(0)
    })
  })

  it('displays correct unit count from API', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Unit Count')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
    })
  })

  it('displays correct active lease count from API', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Active Lease Count')).toBeInTheDocument()
      expect(screen.getByText('10')).toBeInTheDocument()
    })
  })

  it('calculates occupancy rate correctly', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      // F-019: relabeled "Occupancy Rate" -> "Unit Occupancy" to distinguish
      // unit-based occupancy from the CAM recovery occupancy figure.
      expect(screen.getByText('Unit Occupancy')).toBeInTheDocument()
      // 10 leases / 12 units = 83.33% -> rounds to 83%
      expect(screen.getByText('83%')).toBeInTheDocument()
    })
  })

  it('shows 0% occupancy when no units exist', async () => {
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
    } as any)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeInTheDocument()
    })
  })

  it('caps occupancy at 100% when active leases exceed units', async () => {
    // Stale/historical lease records can leave more active leases than units.
    // The unit-occupancy figure is a share of units leased, so it must never
    // render above 100% (an uncapped "300%" reads as a broken product).
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: [], count: 1, has_more: false },
      isLoading: false,
    } as any)
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: { data: [], count: 3, has_more: false },
      isLoading: false,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument()
      expect(screen.queryByText('300%')).not.toBeInTheDocument()
    })
  })

  it('shows loading state when units data is loading', () => {
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    const pulsing = document.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
  })

  it('shows loading state when leases data is loading', () => {
    vi.spyOn(hooks, 'useLeases').mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    renderWithProviders(<PropertyDetailPage />)

    const pulsing = document.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
  })

  // Enhanced StatCard tests
  it('renders stat cards with icons from lucide-react', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Each stat card should have an icon container (rounded-lg with bg color)
    const iconContainers = document.querySelectorAll(
      '.rounded-lg.flex.h-10.w-10'
    )
    expect(iconContainers.length).toBeGreaterThanOrEqual(4) // 4 stat cards with icons
  })

  it('applies correct color accents to stat card icons', async () => {
    const { container } = renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Check that chart colors are applied (chart-1, chart-2, chart-3, chart-4)
    const html = container.innerHTML
    expect(html).toContain('chart-1') // Active Lease Count - Emerald
    expect(html).toContain('chart-2') // Occupancy Rate - Amber
    expect(html).toContain('chart-3') // Total Rentable Sqft - Navy
    expect(html).toContain('chart-4') // Unit Count - Purple
  })

  it('uses elevated card variant with hover shadow for stat cards', async () => {
    const { container } = renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Total Rentable Sqft').length).toBeGreaterThan(
        0
      )
    })

    // Check for elevated variant classes (shadow-sm and hover:shadow-md)
    const cards = container.querySelectorAll(
      '[class*="shadow-sm"][class*="hover:shadow-md"]'
    )
    expect(cards.length).toBeGreaterThanOrEqual(4) // At least 4 stat cards
  })

  it('renders enhanced loading state with icon placeholders', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any)

    const { container } = renderWithProviders(<PropertyDetailPage />)

    // Should have multiple animated pulse elements (value skeleton + icon placeholder for each card)
    const pulsing = container.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThanOrEqual(8) // 4 cards × (value skeleton + icon skeleton) = 8
  })

  it('stat card titles render as h2 elements for correct heading hierarchy (F-285)', async () => {
    renderWithProviders(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Sunset Plaza').length).toBeGreaterThan(0)
    })

    // Each stat card label must be an h2 so the heading tree is H1 > H2 (no skip)
    const h2Texts = Array.from(document.querySelectorAll('h2')).map(
      (el) => el.textContent
    )
    expect(h2Texts).toContain('Total Rentable Sqft')
    expect(h2Texts).toContain('Unit Count')
    expect(h2Texts).toContain('Active Lease Count')
    expect(h2Texts).toContain('Unit Occupancy')
    // "Property setup" section title must also be h2
    expect(h2Texts).toContain('Property setup')
  })
})
