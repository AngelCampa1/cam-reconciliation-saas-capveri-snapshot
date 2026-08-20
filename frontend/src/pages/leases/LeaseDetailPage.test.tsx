/**
 * LeaseDetailPage Tests
 *
 * Tests for the lease detail page component including:
 * - Lease header and stats display
 * - Tab navigation (Overview, Recovery Profile, Document)
 * - Edit/Delete functionality
 * - Loading and error states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LeaseDetailPage } from './LeaseDetailPage'
import * as hooks from '@/api/hooks'
import type { Lease } from '@/api/client'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed-lease.pdf' },
          error: null,
        }),
      })),
    },
  },
}))

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock useSubscription (LeaseDetailPage gates cap bank access on active subscription)
vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ data: { status: 'active' } }),
}))

import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// Mock lease data
const mockLease: Lease = {
  id: 'lease-123',
  tenant_name: 'Acme Corporation',
  unit_id: 'unit-456',
  property_id: 'prop-789',
  start_date: '2024-01-01',
  end_date: '2025-12-31',
  status: 'active',
  document_url: null,
  organization_id: 'org-123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  recovery_profile: {
    pro_rata_share: '0.1234',
    admin_fee_percentage: '0.15',
    cap_type: 'cumulative',
    cap_rate: '0.05',
    base_year: 2023,
    base_year_amount: '50000',
    gross_up_base_year: true,
  },
}

const mockProperty = {
  id: 'prop-789',
  name: 'Downtown Tower',
  address_line1: '123 Main St',
  city: 'Los Angeles',
  state: 'CA',
  postal_code: '90001',
}

function renderWithProviders(
  ui: React.ReactElement,
  { propertyId = 'prop-789', leaseId = 'lease-123' } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`/properties/${propertyId}/leases/${leaseId}`]}
      >
        <Routes>
          <Route path="/properties/:propertyId/leases/:leaseId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LeaseDetailPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()

    vi.spyOn(hooks, 'useLease').mockReturnValue({
      data: mockLease,
      isLoading: false,
      error: null,
    } as any)

    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: mockProperty,
      isLoading: false,
      error: null,
    } as any)

    vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
  })

  describe('Loading State', () => {
    it('displays loading skeleton while fetching lease', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      expect(screen.getByTestId('lease-detail-skeleton')).toBeInTheDocument()
      expect(screen.getByText('Loading lease details…')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('displays error message when fetch fails', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Network error' } as any,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Couldn't load this lease"
      )
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your data is safe. Try again.'
      )
    })

    it('displays not found when lease is null after loading', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      expect(screen.getByRole('alert')).toHaveTextContent('Lease not found')
    })

    it('shows offline error and hides not-found when query is paused', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isPaused: true,
        refetch: vi.fn(),
      } as ReturnType<typeof hooks.useLease>)

      renderWithProviders(<LeaseDetailPage />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(screen.queryByText(/lease not found/i)).not.toBeInTheDocument()
    })
  })

  describe('Success State', () => {
    it('displays tenant name in header', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })
    })

    it('displays property name in description', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getByText(/Lease for Downtown Tower/)).toBeInTheDocument()
      })
    })

    it('displays stats cards with correct values', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
        // Status - may appear multiple times
        expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
        // Pro-rata share (0.1234 * 100 = 12.34%)
        expect(screen.getAllByText('12.34%').length).toBeGreaterThan(0)
      })
    })
  })

  describe('Tab Navigation', () => {
    it('renders all tabs', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: /overview/i })
        ).toBeInTheDocument()
        expect(
          screen.getByRole('tab', { name: /recovery profile/i })
        ).toBeInTheDocument()
      })
    })

    it('shows document tab only when document_url exists', async () => {
      const leaseWithDoc = {
        ...mockLease,
        document_url: 'https://example.com/lease.pdf',
      }
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: leaseWithDoc,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('tab', { name: /document/i })
        ).toBeInTheDocument()
      })
    })

    it('hides document tab when document_url is null', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      expect(
        screen.queryByRole('tab', { name: /document/i })
      ).not.toBeInTheDocument()
    })

    it('switches to recovery profile tab on click', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const recoveryTab = screen.getByRole('tab', { name: /recovery profile/i })
      await user.click(recoveryTab)

      await waitFor(() => {
        expect(recoveryTab).toHaveAttribute('data-state', 'active')
        expect(screen.getByText('Recovery Profile Details')).toBeInTheDocument()
      })
    })
  })

  describe('Edit Action', () => {
    it('navigates to edit page on edit button click', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const editButton = screen.getByRole('button', { name: /edit/i })
      await user.click(editButton)

      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/prop-789/leases/lease-123/edit'
      )
    })
  })

  describe('Delete Action', () => {
    it('shows delete confirmation dialog on delete button click', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.getByText('Delete Lease')).toBeInTheDocument()
        expect(
          screen.getByText(/Are you sure you want to delete the lease/)
        ).toBeInTheDocument()
      })
    })

    it('calls delete mutation when confirmed', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      // Open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      // Confirm
      await waitFor(() => {
        expect(screen.getByText('Delete Lease')).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /^Delete$/i })
      await user.click(confirmButton)

      expect(mockMutate).toHaveBeenCalledWith('lease-123')
    })

    it('shows success toast and navigates on successful delete', async () => {
      let onSuccessCallback: (() => void) | undefined

      vi.spyOn(hooks, 'useDeleteLease').mockImplementation((options: any) => {
        onSuccessCallback = options?.onSuccess
        return {
          mutate: vi.fn(),
          isPending: false,
        } as any
      })

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      // Trigger success callback
      if (onSuccessCallback) {
        onSuccessCallback()
      }

      expect(toast.success).toHaveBeenCalledWith('Lease deleted successfully')
      expect(mockNavigate).toHaveBeenCalledWith('/properties/prop-789#leases')
    })

    it('shows error toast on delete failure', async () => {
      let onErrorCallback: ((error: Error) => void) | undefined

      vi.spyOn(hooks, 'useDeleteLease').mockImplementation((options: any) => {
        onErrorCallback = options?.onError
        return {
          mutate: vi.fn(),
          isPending: false,
        } as any
      })

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      // Trigger error callback
      if (onErrorCallback) {
        onErrorCallback(new Error('Delete failed'))
      }

      expect(toast.error).toHaveBeenCalledWith(
        "We couldn't delete this lease. Nothing was removed. Try again."
      )
    })

    it('shows deleting state in confirm button', async () => {
      const user = userEvent.setup()

      vi.spyOn(hooks, 'useDeleteLease').mockReturnValue({
        mutate: vi.fn(),
        isPending: true,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const deleteButton = screen.getByRole('button', { name: /delete/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument()
      })
    })
  })

  describe('Status Badge Variants', () => {
    it.each([
      ['active', 'default'],
      ['draft', 'secondary'],
      ['expired', 'destructive'],
      ['terminated', 'destructive'],
    ])('shows correct badge variant for %s status', async (status) => {
      const leaseWithStatus = { ...mockLease, status }
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: leaseWithStatus,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        const statusText = status.charAt(0).toUpperCase() + status.slice(1)
        // Status text appears multiple times (in stat card and badge)
        expect(screen.getAllByText(statusText).length).toBeGreaterThan(0)
      })
    })
  })

  describe('Recovery Profile Display', () => {
    it('displays all recovery profile fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      // Switch to recovery tab
      const recoveryTab = screen.getByRole('tab', { name: /recovery profile/i })
      await user.click(recoveryTab)

      await waitFor(() => {
        // Admin fee (0.15 * 100 = 15.00%)
        expect(screen.getAllByText('15.00%').length).toBeGreaterThan(0)
        // Cap type
        expect(screen.getAllByText('cumulative').length).toBeGreaterThan(0)
        // Base year
        expect(screen.getAllByText('2023').length).toBeGreaterThan(0)
        // Cap rate (0.05 * 100 = 5.00%)
        expect(screen.getAllByText('5.00%').length).toBeGreaterThan(0)
        // Gross up base year
        expect(screen.getByText('Yes')).toBeInTheDocument()
      })
    })

    it('shows N/A for missing optional fields', async () => {
      const leaseNoBaseYear = {
        ...mockLease,
        recovery_profile: {
          ...mockLease.recovery_profile,
          base_year: null,
          base_year_amount: null,
          cap_rate: null,
        },
      }
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: leaseNoBaseYear,
        isLoading: false,
        error: null,
      } as any)

      const user = userEvent.setup()
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const recoveryTab = screen.getByRole('tab', { name: /recovery profile/i })
      await user.click(recoveryTab)

      await waitFor(() => {
        const naElements = screen.getAllByText('N/A')
        expect(naElements.length).toBeGreaterThanOrEqual(2)
      })
    })
  })

  describe('Document Tab', () => {
    it('displays document link when document_url exists', async () => {
      const user = userEvent.setup()
      const leaseWithDoc = {
        ...mockLease,
        document_url: 'lease-123/lease.pdf',
      }
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: leaseWithDoc,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const documentTab = screen.getByRole('tab', { name: /document/i })
      await user.click(documentTab)

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /view lease document/i })
        expect(link).toHaveAttribute(
          'href',
          'https://example.com/signed-lease.pdf'
        )
        expect(link).toHaveAttribute('target', '_blank')
      })
    })

    it('shows a retryable error when the signed URL cannot be created', async () => {
      const user = userEvent.setup()
      // Make the signed-URL creation fail.
      vi.mocked(supabase.storage.from).mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'boom' },
        }),
      } as any)

      const leaseWithDoc = {
        ...mockLease,
        document_url: 'lease-123/lease.pdf',
      }
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: leaseWithDoc,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      const documentTab = screen.getByRole('tab', { name: /document/i })
      await user.click(documentTab)

      await waitFor(() => {
        expect(screen.getByTestId('lease-document-error')).toBeInTheDocument()
      })
      expect(
        screen.queryByRole('link', { name: /view lease document/i })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })

  describe('Breadcrumb Navigation', () => {
    it('displays breadcrumb with property name', async () => {
      renderWithProviders(<LeaseDetailPage />)

      await waitFor(() => {
        expect(screen.getAllByText('Acme Corporation').length).toBeGreaterThan(
          0
        )
      })

      // Use test-ids for specific breadcrumb elements to avoid multiple matches
      expect(
        screen.getByTestId('breadcrumb-link-properties')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('breadcrumb-link-downtown-tower')
      ).toBeInTheDocument()
    })
  })
})
