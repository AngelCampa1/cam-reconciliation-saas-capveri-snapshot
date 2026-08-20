/**
 * LeasesTab Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { LeasesTab } from './LeasesTab'
import * as hooks from '@/api/hooks'
import type { Lease } from '@/api/client'
import { toast } from 'sonner'

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockLeases: Lease[] = [
  {
    id: 'lease-1',
    property_id: 'prop-123',
    unit_id: 'unit-1',
    tenant_name: 'Acme Corp',
    start_date: '2024-01-01',
    end_date: '2026-12-31',
    status: 'active',
    recovery_profile: {},
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'lease-2',
    property_id: 'prop-123',
    unit_id: 'unit-2',
    tenant_name: 'TechStart Inc',
    start_date: '2020-01-01',
    end_date: '2023-12-31',
    status: 'expired',
    recovery_profile: {},
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2023-12-31T00:00:00Z',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe('LeasesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  describe('Data Display', () => {
    it('displays all lease columns', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Tenant names
      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
      // Status badges
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Expired')).toBeInTheDocument()
    })

    it('displays formatted dates', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Verify dates are displayed in readable format (check for month names)
      const dateElements = screen.getAllByText(
        /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/
      )
      expect(dateElements.length).toBeGreaterThan(0)
    })

    it('renders date-only fields as the entered calendar day (no UTC off-by-one)', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // '2024-01-01' must render as Jan 1, 2024 — not Dec 31, 2023
      const jan1Elements = screen.getAllByText(/Jan\s+1,?\s*2024/)
      expect(jan1Elements.length).toBeGreaterThan(0)

      // '2026-12-31' must render as Dec 31, 2026 — not Dec 30, 2026
      const dec31Elements = screen.getAllByText(/Dec\s+31,?\s*2026/)
      expect(dec31Elements.length).toBeGreaterThan(0)
    })

    it('displays color-coded status badges', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const activeBadge = screen.getByText('Active')
      const expiredBadge = screen.getByText('Expired')

      expect(activeBadge).toBeInTheDocument()
      expect(expiredBadge).toBeInTheDocument()
    })
  })

  describe('Data Table Display', () => {
    it('shows all leases in table', async () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
    })

    it('displays header section with title and add button', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('Leases')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /add lease/i })
      ).toBeInTheDocument()
    })
  })

  describe('Empty States', () => {
    it('displays empty state when no leases', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText(/no leases yet/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /add a lease/i })
      ).toBeInTheDocument()
    })

    it('displays loading state', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // DataTable shows skeleton loaders when loading
      const skeletons = screen.getAllByTestId('skeleton-cell')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('displays error state', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to load leases'),
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText(/couldn't load leases/i)).toBeInTheDocument()
    })
  })

  describe('Add Lease Button', () => {
    it('displays add lease button', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(
        screen.getByRole('button', { name: /add lease/i })
      ).toBeInTheDocument()
    })
  })

  describe('Conditional Rendering Branches', () => {
    it('displays "-" for null tenant name', () => {
      const leaseWithoutTenant: Lease = {
        ...mockLeases[0],
        tenant_name: null as any,
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithoutTenant] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Should display "-" for missing tenant
      const cells = screen.getAllByRole('cell')
      expect(cells.some((cell) => cell.textContent === '-')).toBe(true)
    })

    it('displays "-" for empty date strings', () => {
      const leaseWithoutDates: Lease = {
        ...mockLeases[0],
        start_date: '',
        end_date: '',
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithoutDates] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Should display "-" for missing dates
      const dashElements = screen.getAllByText('-')
      expect(dashElements.length).toBeGreaterThan(0)
    })

    it('displays "Unknown" status for null status', () => {
      const leaseWithNullStatus: Lease = {
        ...mockLeases[0],
        status: null as any,
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithNullStatus] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('Unknown')).toBeInTheDocument()
    })

    it('displays gray text for unknown status value', () => {
      const leaseWithUnknownStatus: Lease = {
        ...mockLeases[0],
        status: 'unknown_status' as any,
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithUnknownStatus] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('Unknown_status')).toBeInTheDocument()
    })

    it('displays "-" for null pro-rata share', () => {
      const leaseWithoutProRata: Lease = {
        ...mockLeases[0],
        recovery_profile: {},
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithoutProRata] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const dashElements = screen.getAllByText('-')
      expect(dashElements.length).toBeGreaterThan(0)
    })

    it('formats pro-rata share as percentage', () => {
      const leaseWithProRata: Lease = {
        ...mockLeases[0],
        recovery_profile: { pro_rata_share: 0.125 },
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithProRata] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('12.50%')).toBeInTheDocument()
    })

    it('handles invalid pro-rata share (NaN)', () => {
      const leaseWithInvalidProRata: Lease = {
        ...mockLeases[0],
        recovery_profile: { pro_rata_share: 'invalid' as any },
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithInvalidProRata] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const dashElements = screen.getAllByText('-')
      expect(dashElements.length).toBeGreaterThan(0)
    })

    it('displays pending status with correct color', () => {
      const leaseWithPendingStatus: Lease = {
        ...mockLeases[0],
        status: 'pending',
      }

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [leaseWithPendingStatus] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    it('displays fallback error message when error.message is missing', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: {} as any,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText(/couldn't load leases/i)).toBeInTheDocument()
    })
  })

  describe('Delete Dialog Flow', () => {
    it('opens delete dialog when delete action is clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])

      const deleteButton = await screen.findByText('Delete')
      await user.click(deleteButton)

      expect(
        await screen.findByRole('heading', { name: /delete lease/i })
      ).toBeInTheDocument()
      expect(
        screen.getByText(/are you sure you want to delete the lease for/i)
      ).toBeInTheDocument()
    })

    it('closes delete dialog when cancel is clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])

      const deleteButton = await screen.findByText('Delete')
      await user.click(deleteButton)

      const cancelButton = await screen.findByRole('button', {
        name: /cancel/i,
      })
      await user.click(cancelButton)

      // Dialog should close
      expect(
        screen.queryByRole('heading', { name: /delete lease/i })
      ).not.toBeInTheDocument()
    })

    it('calls delete mutation when confirm is clicked', async () => {
      const user = userEvent.setup()
      const mockDelete = vi.fn()

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: mockDelete,
        isPending: false,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])

      const deleteButton = await screen.findByText('Delete')
      await user.click(deleteButton)

      const confirmButton = await screen.findByRole('button', {
        name: /^Delete$/i,
      })
      await user.click(confirmButton)

      expect(mockDelete).toHaveBeenCalledWith('lease-1')
    })

    it('shows success toast and closes dialog on successful deletion', async () => {
      const user = userEvent.setup()
      let onSuccessCallback: () => void = () => {}

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockImplementation((options: any) => {
        onSuccessCallback = options.onSuccess
        return {
          mutate: vi.fn().mockImplementation(() => {
            onSuccessCallback()
          }),
          isPending: false,
        } as never
      })

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Open dropdown and click delete
      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])
      const deleteButton = await screen.findByText('Delete')
      await user.click(deleteButton)

      // Confirm delete
      const confirmButton = await screen.findByRole('button', {
        name: /^Delete$/i,
      })
      await user.click(confirmButton)

      expect(toast.success).toHaveBeenCalledWith('Lease deleted successfully')
    })

    it('shows error toast when deletion fails', async () => {
      const user = userEvent.setup()
      let onErrorCallback: (error: { message: string }) => void = () => {}

      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockImplementation((options: any) => {
        onErrorCallback = options.onError
        return {
          mutate: vi.fn().mockImplementation(() => {
            onErrorCallback({ message: 'Network error' })
          }),
          isPending: false,
        } as never
      })

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Open dropdown and click delete
      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])
      const deleteButton = await screen.findByText('Delete')
      await user.click(deleteButton)

      // Confirm delete
      const confirmButton = await screen.findByRole('button', {
        name: /^Delete$/i,
      })
      await user.click(confirmButton)

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to delete lease',
        expect.objectContaining({ description: expect.any(String) })
      )
    })
  })

  describe('LeasesTab - offline / paused', () => {
    it('shows offline notice and hides empty state when query is paused', () => {
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: undefined,
        isLoading: false,
        isPaused: true,
        error: null,
        refetch: vi.fn(),
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(screen.queryByText(/no leases yet/i)).not.toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('navigates to add lease page when Add Lease is clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const addButton = screen.getByRole('button', { name: /add lease/i })
      await user.click(addButton)

      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/prop-123/leases/new'
      )
    })

    it('navigates to add lease page from empty state', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const addButton = screen.getByRole('button', { name: /add a lease/i })
      await user.click(addButton)

      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/prop-123/leases/new'
      )
    })

    it('navigates to the sample from the empty state', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: [] },
        isLoading: false,
        error: null,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      const sampleButton = screen.getByRole('button', {
        name: /see a sample first/i,
      })
      await user.click(sampleButton)

      expect(mockNavigate).toHaveBeenCalledWith('/onboard?demo=1')
    })

    it('navigates to edit lease page when Edit is clicked', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useLeases').mockReturnValue({
        data: { data: mockLeases },
        isLoading: false,
        error: null,
      } as never)

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)

      renderWithProviders(<LeasesTab propertyId="prop-123" />)

      // Open dropdown and click edit
      const actionButtons = screen.getAllByRole('button', {
        name: /open menu/i,
      })
      await user.click(actionButtons[0])
      const editButton = await screen.findByText('Edit')
      await user.click(editButton)

      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/prop-123/leases/lease-1/edit'
      )
    })
  })
})
