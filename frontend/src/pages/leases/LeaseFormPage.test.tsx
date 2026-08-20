/**
 * LeaseFormPage Tests
 *
 * Tests for lease create/edit form including:
 * - Form rendering in create and edit modes
 * - Form validation (required fields, date validation)
 * - Unit dropdown functionality
 * - Form submission
 * - Loading states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LeaseFormPage } from './LeaseFormPage'
import * as hooks from '@/api/hooks'
import type { Lease, Unit, Property } from '@/api/client'
import { toast } from 'sonner'

const mockUnitOneId = '11111111-1111-4111-8111-111111111111'
const mockUnitTwoId = '22222222-2222-4222-8222-222222222222'

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
        remove: vi.fn(),
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

// Mock data
const mockProperty: Property = {
  id: 'prop-123',
  name: 'Test Plaza',
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
}

const mockUnits: Unit[] = [
  {
    id: mockUnitOneId,
    property_id: 'prop-123',
    unit_number: '101',
    rentable_sqft: '1000',
    usable_sqft: '900',
    is_active: true,
    organization_id: 'org-123',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: mockUnitTwoId,
    property_id: 'prop-123',
    unit_number: '102',
    rentable_sqft: '1500',
    usable_sqft: '1350',
    is_active: true,
    organization_id: 'org-123',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
]

const mockLease: Lease = {
  id: 'lease-123',
  property_id: 'prop-123',
  unit_id: mockUnitOneId,
  tenant_name: 'Acme Corporation',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  status: 'active',
  recovery_profile: {
    base_year: null,
    pro_rata_share: '0.15',
    admin_fee_percentage: '0.10',
    rsf_measurement_standard: '2024',
    accounting_basis: 'accrual',
    cap_type: 'none',
    cap_rate: null,
  },
  document_url: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
}

function renderWithProviders(
  ui: React.ReactElement,
  initialRoute = '/properties/prop-123/leases/new'
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/properties/:propertyId/leases/:leaseId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LeaseFormPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: mockProperty,
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useLease').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: mockUnits, total: 2, page: 1, limit: 50 },
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useCreateLease').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
    vi.spyOn(hooks, 'useUpdateLease').mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: mockLease.id }),
      isPending: false,
    } as any)
    vi.spyOn(hooks, 'useUpdateRecoveryProfile').mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: mockLease.id }),
      isPending: false,
    } as any)
  })

  describe('Create Mode', () => {
    it('renders create form with empty fields', () => {
      renderWithProviders(<LeaseFormPage />)

      expect(
        screen.getByRole('heading', { name: /Create Lease/i })
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue('')
      expect(
        screen.getByRole('button', { name: /Create Lease/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Cancel/i })
      ).toBeInTheDocument()
    })

    it('shows units in dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      const unitSelect = screen.getByTestId('unit-select')
      await user.click(unitSelect)

      await waitFor(() => {
        const options = screen.getAllByText(/101/)
        expect(options.length).toBeGreaterThan(0)
        expect(screen.getByRole('option', { name: /101/ })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: /102/ })).toBeInTheDocument()
      })
    })

    it('surfaces a retryable error when units fail to load', async () => {
      const refetchUnits = vi.fn()
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('boom'),
        refetch: refetchUnits,
      } as any)

      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      expect(
        screen.getByText(/couldn't load this property's units/i)
      ).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /Try again/i }))
      expect(refetchUnits).toHaveBeenCalledTimes(1)
    })

    it('validates required fields on submit', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      const submitButton = screen.getByRole('button', {
        name: /Create Lease/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Tenant name must be at least 2 characters/i)
        ).toBeInTheDocument()
        expect(screen.getByText(/Start date is required/i)).toBeInTheDocument()
        expect(screen.getByText(/End date is required/i)).toBeInTheDocument()
      })
    })

    it('validates tenant name min length', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      const nameInput = screen.getByLabelText(/Tenant Name/i)
      await user.type(nameInput, 'A')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText(/Tenant name must be at least 2 characters/i)
        ).toBeInTheDocument()
      })
    })

    it('validates end date must be after start date', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      const startDateInput = screen.getByTestId('start-date-input')
      const endDateInput = screen.getByTestId('end-date-input')

      await user.type(startDateInput, '2024-12-31')
      await user.type(endDateInput, '2024-01-01')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText(/End date must be after start date/i)
        ).toBeInTheDocument()
      })
    })

    it('submits form with valid data', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()

      vi.spyOn(hooks, 'useCreateLease').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any)

      renderWithProviders(<LeaseFormPage />)

      // Fill in form
      await user.type(screen.getByLabelText(/Tenant Name/i), 'New Tenant')

      // Fill dates
      await user.type(screen.getByTestId('start-date-input'), '2024-01-01')
      await user.type(screen.getByTestId('end-date-input'), '2024-12-31')

      // Select status
      const statusSelect = screen.getByTestId('status-select')
      await user.click(statusSelect)
      const statusOption = await screen.findByRole('option', {
        name: /Active/i,
      })
      await user.click(statusOption)

      // Fill in required recovery profile field. 2.9% exercises the F-010
      // precision path: 2.9 / 100 === 0.028999999999999998 as a JS float, but
      // the string conversion submits the exact "0.029".
      await user.type(screen.getByTestId('pro-rata-share-input'), '2.9')

      const submitButton = screen.getByRole('button', {
        name: /Create Lease/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            property_id: 'prop-123',
            tenant_name: 'New Tenant',
            unit_id: null,
            start_date: '2024-01-01',
            end_date: '2024-12-31',
            status: 'active',
            // FIX F-010: rates submitted as exact decimal strings, no float coercion.
            recovery_profile: expect.objectContaining({
              pro_rata_share: '0.029',
              admin_fee_percentage: '0.15',
            }),
          })
        )
      })
    })

    it('shows loading state during submission', () => {
      vi.spyOn(hooks, 'useCreateLease').mockReturnValue({
        mutate: vi.fn(),
        isPending: true,
      } as any)

      renderWithProviders(<LeaseFormPage />)

      const submitButton = screen.getByRole('button', {
        name: /Creating.../i,
      })
      expect(submitButton).toBeDisabled()
    })

    it('cancel returns to the property in create mode', async () => {
      const user = userEvent.setup()
      renderWithProviders(<LeaseFormPage />)

      await user.click(screen.getByRole('button', { name: /Cancel/i }))

      // Must land on a real route, not navigate(-1) (a dead-end on a fresh tab
      // or deep link with no history). Create mode has no lease yet, so the
      // property detail is the sensible destination.
      expect(mockNavigate).toHaveBeenCalledWith('/properties/prop-123')
    })

    it('shows success toast and navigates on successful creation', async () => {
      let capturedOnSuccess: (data: Lease) => void = () => {}

      vi.spyOn(hooks, 'useCreateLease').mockImplementation((options: any) => {
        capturedOnSuccess = options.onSuccess
        return {
          mutate: vi.fn().mockImplementation(() => {
            capturedOnSuccess({ ...mockLease, id: 'new-lease-123' })
          }),
          isPending: false,
        } as any
      })

      renderWithProviders(<LeaseFormPage />)

      // Fill in form
      fireEvent.change(screen.getByLabelText(/Tenant Name/i), {
        target: { value: 'New Tenant' },
      })
      fireEvent.change(screen.getByTestId('start-date-input'), {
        target: { value: '2024-01-01' },
      })
      fireEvent.change(screen.getByTestId('end-date-input'), {
        target: { value: '2024-12-31' },
      })

      // Fill in required recovery profile field
      fireEvent.change(screen.getByTestId('pro-rata-share-input'), {
        target: { value: '5' },
      })

      const submitButton = screen.getByRole('button', { name: /Create Lease/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Lease created successfully')
        expect(mockNavigate).toHaveBeenCalledWith(
          '/properties/prop-123/leases/new-lease-123'
        )
      })
    })

    it('shows error toast when creation fails', async () => {
      const user = userEvent.setup()
      let capturedOnError: (error: { message: string }) => void = () => {}

      vi.spyOn(hooks, 'useCreateLease').mockImplementation((options: any) => {
        capturedOnError = options.onError
        return {
          mutate: vi.fn().mockImplementation(() => {
            capturedOnError({ message: 'Failed to connect to server' })
          }),
          isPending: false,
        } as any
      })

      renderWithProviders(<LeaseFormPage />)

      // Fill in form
      await user.type(screen.getByLabelText(/Tenant Name/i), 'New Tenant')
      await user.type(screen.getByTestId('start-date-input'), '2024-01-01')
      await user.type(screen.getByTestId('end-date-input'), '2024-12-31')

      // Select status
      const statusSelect = screen.getByTestId('status-select')
      await user.click(statusSelect)
      const statusOption = await screen.findByRole('option', {
        name: /Active/i,
      })
      await user.click(statusOption)

      // Fill in required recovery profile field
      await user.type(screen.getByTestId('pro-rata-share-input'), '5')

      const submitButton = screen.getByRole('button', { name: /Create Lease/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          "We couldn't save this lease. Check your entries and try again."
        )
      })
    })
  })

  describe('Edit Mode', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: mockLease,
        isLoading: false,
        error: null,
      } as any)
    })

    it('renders edit form with lease data', async () => {
      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByText(/Edit Lease/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue(
          'Acme Corporation'
        )
        expect(screen.getByTestId('start-date-input')).toHaveValue('2024-01-01')
        expect(screen.getByTestId('end-date-input')).toHaveValue('2024-12-31')
      })
    })

    it('shows loading skeleton while fetching lease', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      const pulsing = document.querySelectorAll('.animate-pulse')
      expect(pulsing.length).toBeGreaterThan(0)
    })

    it('shows an error state with retry when the lease fails to load', () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('boom'),
        refetch: vi.fn(),
      } as any)

      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      expect(
        screen.getByText('We could not load this lease')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /back to property/i })
      ).toBeInTheDocument()
    })

    it('renders update form with correct button text', async () => {
      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue(
          'Acme Corporation'
        )
      })

      // Verify update button is present
      expect(
        screen.getByRole('button', { name: /Update Lease/i })
      ).toBeInTheDocument()

      // Verify form is pre-populated
      expect(screen.getByTestId('start-date-input')).toHaveValue('2024-01-01')
      expect(screen.getByTestId('end-date-input')).toHaveValue('2024-12-31')
    })

    it('pre-populates edit mode status, unit, and recovery profile selects', async () => {
      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue(
          'Acme Corporation'
        )
      })

      await waitFor(() => {
        expect(screen.getByTestId('status-select')).toHaveTextContent('Active')
        expect(screen.getByTestId('unit-select')).toHaveTextContent('101')
        expect(screen.getByTestId('admin-fee-input')).toHaveValue(10)
        expect(
          screen.getByTestId('rsf-measurement-standard-select')
        ).toHaveTextContent('BOMA 2024')
        expect(screen.getByTestId('accounting-basis-select')).toHaveTextContent(
          'Accrual Basis'
        )
      })
    })

    it('cancel returns to the lease detail in edit mode', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue(
          'Acme Corporation'
        )
      })

      await user.click(screen.getByRole('button', { name: /Cancel/i }))

      expect(mockNavigate).toHaveBeenCalledWith(
        `/properties/prop-123/leases/${mockLease.id}`
      )
    })

    it('preserves recovery profile selects when updating a lease', async () => {
      const user = userEvent.setup()
      // The basic-lease PUT endpoint ignores recovery_profile, so edit mode
      // splits the write: lease fields go through useUpdateLease and the
      // recovery profile goes through useUpdateRecoveryProfile's dedicated
      // endpoint. Assert each mutation receives the correct half of the form.
      const mockLeaseMutate = vi.fn().mockResolvedValue({ id: mockLease.id })
      const mockRecoveryMutate = vi.fn().mockResolvedValue({ id: mockLease.id })

      vi.spyOn(hooks, 'useUpdateLease').mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: mockLeaseMutate,
        isPending: false,
      } as any)
      vi.spyOn(hooks, 'useUpdateRecoveryProfile').mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: mockRecoveryMutate,
        isPending: false,
      } as any)

      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Tenant Name/i)).toHaveValue(
          'Acme Corporation'
        )
      })

      await user.click(screen.getByRole('button', { name: /Update Lease/i }))

      // Lease fields persist via the basic-lease endpoint (no recovery_profile).
      await waitFor(() => {
        expect(mockLeaseMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            tenant_name: 'Acme Corporation',
            unit_id: mockUnitOneId,
            status: 'active',
          })
        )
      })
      expect(mockLeaseMutate.mock.calls[0][0]).not.toHaveProperty(
        'recovery_profile'
      )

      // Recovery profile persists via its dedicated endpoint.
      // FIX F-010: rates are submitted as exact decimal STRINGS to preserve
      // precision (the backend accepts anyOf: [number, string]).
      expect(mockRecoveryMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          pro_rata_share: '0.15',
          admin_fee_percentage: '0.1',
          rsf_measurement_standard: '2024',
          accounting_basis: 'accrual',
        })
      )
    })
  })

  describe('Breadcrumb Navigation', () => {
    it('shows breadcrumbs in create mode', () => {
      renderWithProviders(<LeaseFormPage />)

      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('Test Plaza')).toBeInTheDocument()
      expect(screen.getByText('Leases')).toBeInTheDocument()
      expect(screen.getByText('New Lease')).toBeInTheDocument()
    })

    it('shows breadcrumbs in edit mode', async () => {
      vi.spyOn(hooks, 'useLease').mockReturnValue({
        data: mockLease,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(
        <LeaseFormPage />,
        `/properties/prop-123/leases/${mockLease.id}`
      )

      await waitFor(() => {
        expect(screen.getByText('Properties')).toBeInTheDocument()
        expect(screen.getByText('Test Plaza')).toBeInTheDocument()
        expect(screen.getByText('Leases')).toBeInTheDocument()
        expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })
    })
  })
})
