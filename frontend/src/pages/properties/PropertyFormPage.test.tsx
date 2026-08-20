/**
 * PropertyFormPage Tests
 *
 * Tests for property create/edit form including:
 * - Form rendering in create and edit modes
 * - Form validation
 * - Form submission
 * - Loading states
 * - Navigation and cancellation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PropertyFormPage } from './PropertyFormPage'
import * as hooks from '@/api/hooks'
import type { Property } from '@/api/client'

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: trackEventMock,
}))

const { rentRollUploadProps } = vi.hoisted(() => ({
  rentRollUploadProps: {
    onSuccess: undefined as undefined | ((propertyId: string) => void),
  },
}))

vi.mock('@/components/rent-roll', () => ({
  RentRollUpload: (props: { onSuccess: (propertyId: string) => void }) => {
    rentRollUploadProps.onSuccess = props.onSuccess
    return <div data-testid="rent-roll-upload" />
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

// The create-mode form embeds RentRollUpload, which calls useUserRole ->
// useAuth. These tests don't wrap the tree in an AuthProvider, so stub useAuth
// with an owner context to keep the role-gated upload UI rendering.
vi.mock('@/contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('@/contexts/AuthContext')>(
    '@/contexts/AuthContext'
  )
  return {
    ...actual,
    useAuth: () => ({
      userRole: 'owner',
      isAdmin: true,
      isOwner: true,
    }),
  }
})

// Mock property data
const mockProperty: Property = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Test Plaza',
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
  initialRoute = '/properties/new'
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
          <Route path="/properties/:propertyId" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// Helper to click the Manual tab in create mode
async function clickManualTab(user: ReturnType<typeof userEvent.setup>) {
  const manualTab = screen.getByRole('tab', { name: /enter manually/i })
  await user.click(manualTab)
}

describe('PropertyFormPage', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    trackEventMock.mockClear()
    rentRollUploadProps.onSuccess = undefined
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
    vi.spyOn(hooks, 'useUpdateProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
  })

  describe('Create Mode', () => {
    it('renders tabs and create form with empty fields', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)

      // Should show upload/manual tabs
      expect(
        screen.getByRole('tab', { name: /upload rent roll/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('tab', { name: /enter manually/i })
      ).toBeInTheDocument()

      // Click manual tab to show form
      await clickManualTab(user)

      expect(
        screen.getByRole('heading', { name: /Create Property/i })
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/Property Name/i)).toHaveValue('')
      expect(screen.getByLabelText(/Address Line 1/i)).toHaveValue('')
      expect(
        screen.getByRole('button', { name: /Create Property/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /Cancel/i })
      ).toBeInTheDocument()
    })

    it('property form inputs have autocomplete attributes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      expect(screen.getByTestId('address-line1-input')).toHaveAttribute(
        'autocomplete',
        'street-address'
      )
      expect(screen.getByTestId('address-line2-input')).toHaveAttribute(
        'autocomplete',
        'address-line2'
      )
      expect(screen.getByTestId('city-input')).toHaveAttribute(
        'autocomplete',
        'address-level2'
      )
      expect(screen.getByTestId('postal-code-input')).toHaveAttribute(
        'autocomplete',
        'postal-code'
      )
      expect(screen.getByTestId('property-name-input')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(screen.getByTestId('total-rentable-sqft-input')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(screen.getByTestId('total-usable-sqft-input')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(screen.getByTestId('common-area-sqft-input')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(screen.getByTestId('target-occupancy-input')).toHaveAttribute(
        'autocomplete',
        'off'
      )
    })

    it('validates required fields on submit', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const submitButton = screen.getByRole('button', {
        name: /Create Property/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/Property name must be at least 2 characters/i)
        ).toBeInTheDocument()
        expect(screen.getByText(/Address is required/i)).toBeInTheDocument()
        expect(screen.getByText(/City is required/i)).toBeInTheDocument()
      })
    })

    it('validates property name min length', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const nameInput = screen.getByLabelText(/Property Name/i)
      await user.type(nameInput, 'A')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText(/Property name must be at least 2 characters/i)
        ).toBeInTheDocument()
      })
    })

    it('validates state as 2-letter uppercase code', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      await user.click(screen.getByRole('button', { name: /create property/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/State must be a 2-letter code/i)
        ).toBeInTheDocument()
      })
    })

    it('validates postal code format', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const postalCodeInput = screen.getByLabelText(/Postal Code/i)

      await user.type(postalCodeInput, '1234')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText(/Postal code must be 5 digits/i)
        ).toBeInTheDocument()
      })
    })

    it('validates total rentable sqft as positive number', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const sqftInput = screen.getByLabelText(/Total Rentable Sqft/i)

      await user.type(sqftInput, '-100')
      await user.tab()

      await waitFor(() => {
        expect(
          screen.getByText(/must be a positive number/i)
        ).toBeInTheDocument()
      })
    })

    it('submits form with valid data', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()

      vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any)

      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      // Fill in all required fields
      fireEvent.change(screen.getByLabelText(/Property Name/i), {
        target: { value: 'New Property' },
      })
      fireEvent.change(screen.getByLabelText(/Address Line 1/i), {
        target: { value: '123 Main St' },
      })
      fireEvent.change(screen.getByLabelText(/City/i), {
        target: { value: 'Los Angeles' },
      })
      await user.click(screen.getByTestId('state-input'))
      await user.click(
        screen.getByRole('option', { name: /CA .* California/i })
      )
      fireEvent.change(screen.getByLabelText(/Postal Code/i), {
        target: { value: '90001' },
      })
      fireEvent.change(screen.getByLabelText(/Total Rentable Sqft/i), {
        target: { value: '50000' },
      })
      fireEvent.change(screen.getByLabelText(/Total Usable Sqft/i), {
        target: { value: '45000' },
      })
      fireEvent.change(screen.getByLabelText(/Common Area Sqft/i), {
        target: { value: '5000' },
      })
      // Target Occupancy already has default value of 0.95, no need to type

      const submitButton = await screen.findByRole('button', {
        name: /Create Property/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'New Property',
            address_line1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postal_code: '90001',
          })
        )
      })
    })

    it('submits target occupancy as a drift-free decimal string (F-429)', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()

      vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any)

      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const fields: [RegExp, string][] = [
        [/Property Name/i, 'New Property'],
        [/Address Line 1/i, '123 Main St'],
        [/City/i, 'Los Angeles'],
        [/Postal Code/i, '90001'],
        [/Total Rentable Sqft/i, '50000'],
        [/Total Usable Sqft/i, '45000'],
        [/Common Area Sqft/i, '5000'],
      ]
      for (const [label, value] of fields) {
        fireEvent.change(screen.getByLabelText(label), { target: { value } })
      }
      await user.click(screen.getByTestId('state-input'))
      await user.click(
        screen.getByRole('option', { name: /CA .* California/i })
      )
      // 50.13 / 100 in IEEE-754 is 0.5013000000000001; the string helper must
      // submit the exact decimal "0.5013", not the drifted value.
      fireEvent.change(screen.getByTestId('target-occupancy-input'), {
        target: { value: '50.13' },
      })

      await user.click(
        await screen.findByRole('button', { name: /Create Property/i })
      )

      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({ target_occupancy: '0.5013' })
        )
      })
    })

    it('tracks successful manual property creation without raw property fields', () => {
      let onSuccessCallback: ((data: Property) => void) | undefined

      vi.spyOn(hooks, 'useCreateProperty').mockImplementation((options) => {
        onSuccessCallback = options?.onSuccess
        return {
          mutate: vi.fn(),
          isPending: false,
        } as never
      })

      renderWithProviders(<PropertyFormPage />)

      onSuccessCallback?.(mockProperty)

      expect(trackEventMock).toHaveBeenCalledWith('property_create_succeeded', {
        property_id: mockProperty.id,
        entry_method: 'manual',
        boma_standard_version: '2024',
        has_tax_protest_county: false,
        has_tax_protest_deadline_override: false,
      })
      expect(trackEventMock.mock.calls[0]?.[1]).not.toHaveProperty('name')
      expect(trackEventMock.mock.calls[0]?.[1]).not.toHaveProperty(
        'address_line1'
      )
    })

    it('tracks successful rent roll property import', () => {
      renderWithProviders(<PropertyFormPage />)

      rentRollUploadProps.onSuccess?.('property-from-rent-roll')

      expect(trackEventMock).toHaveBeenCalledWith(
        'property_rent_roll_import_succeeded',
        { property_id: 'property-from-rent-roll' }
      )
      expect(mockNavigate).toHaveBeenCalledWith(
        '/properties/property-from-rent-roll'
      )
    })

    it('shows loading state during submission', async () => {
      const user = userEvent.setup()
      vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
        mutate: vi.fn(),
        isPending: true,
      } as any)

      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      const submitButton = await screen.findByRole('button', {
        name: /Creating.../i,
      })
      expect(submitButton).toBeDisabled()
    })

    it('navigates to the properties list on cancel', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      await user.click(screen.getByRole('button', { name: /Cancel/i }))

      expect(mockNavigate).toHaveBeenCalledWith('/properties')
    })
  })

  describe('Edit Mode', () => {
    beforeEach(() => {
      vi.spyOn(hooks, 'useProperty').mockReturnValue({
        data: mockProperty,
        isLoading: false,
        error: null,
      } as any)
    })

    it('renders edit form with property data', async () => {
      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      await waitFor(() => {
        expect(screen.getByText(/Edit Property/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/Property Name/i)).toHaveValue(
          'Test Plaza'
        )
        expect(screen.getByLabelText(/Address Line 1/i)).toHaveValue(
          '123 Main St'
        )
        expect(screen.getByLabelText(/City/i)).toHaveValue('Los Angeles')
        expect(screen.getByLabelText(/Postal Code/i)).toHaveValue('90001')
      })
    })

    it('shows loading skeleton while fetching property', () => {
      vi.spyOn(hooks, 'useProperty').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      const pulsing = document.querySelectorAll('.animate-pulse')
      expect(pulsing.length).toBeGreaterThan(0)
    })

    it('shows a retryable error instead of a blank form when the property fails to load', async () => {
      const user = userEvent.setup()
      const refetch = vi.fn()
      vi.spyOn(hooks, 'useProperty').mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('boom'),
        refetch,
      } as any)

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      // A failed load must NOT render the editable form (submitting it would
      // overwrite the real property with blank values).
      expect(
        await screen.findByText(/couldn't load this property/i)
      ).toBeInTheDocument()
      expect(screen.queryByLabelText(/Property Name/i)).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /try again/i }))
      expect(refetch).toHaveBeenCalled()
    })

    it('reads back fractional target occupancy without rounding to a whole number', async () => {
      // F-015: a stored fraction of 0.955 used to round to "96" on read-back
      // (Math.round(95.4999...)). The fix preserves up to 2 decimal places.
      vi.spyOn(hooks, 'useProperty').mockReturnValue({
        data: { ...mockProperty, target_occupancy: '0.955' },
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      await waitFor(() => {
        expect(screen.getByTestId('target-occupancy-input')).toHaveValue(95.5)
      })
    })

    it('updates property on submit', async () => {
      const user = userEvent.setup()
      const mockMutate = vi.fn()

      vi.spyOn(hooks, 'useUpdateProperty').mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as any)

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      await waitFor(() => {
        expect(screen.getByLabelText(/Property Name/i)).toHaveValue(
          'Test Plaza'
        )
      })

      // Change the name
      const nameInput = screen.getByLabelText(/Property Name/i)
      fireEvent.change(nameInput, { target: { value: 'Updated Property' } })
      await user.click(screen.getByTestId('state-input'))
      await user.click(
        screen.getByRole('option', { name: /CA .* California/i })
      )

      const submitButton = await screen.findByRole('button', {
        name: /Update Property/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.queryByText(/State must be a 2-letter code/i)
        ).not.toBeInTheDocument()
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Updated Property',
          })
        )
      })
    })

    it('tracks successful property updates without raw property fields', () => {
      let onSuccessCallback: ((data: Property) => void) | undefined

      vi.spyOn(hooks, 'useUpdateProperty').mockImplementation(
        (_id, options) => {
          onSuccessCallback = options?.onSuccess
          return {
            mutate: vi.fn(),
            isPending: false,
          } as never
        }
      )

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      onSuccessCallback?.(mockProperty)

      expect(trackEventMock).toHaveBeenCalledWith('property_update_succeeded', {
        property_id: mockProperty.id,
        boma_standard_version: '2024',
        has_tax_protest_county: false,
        has_tax_protest_deadline_override: false,
      })
      expect(trackEventMock.mock.calls[0]?.[1]).not.toHaveProperty('name')
      expect(trackEventMock.mock.calls[0]?.[1]).not.toHaveProperty(
        'address_line1'
      )
    })

    it('scrolls to the Tax Protest section when arriving with the #tax-protest hash', async () => {
      // The Tax Protest page's "Configure" link deep-links here with
      // #tax-protest so the user lands on the County/Deadline fields rather
      // than the top of a long form.
      const scrollSpy = vi.fn()
      Element.prototype.scrollIntoView = scrollSpy

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}#tax-protest`
      )

      await waitFor(() => {
        expect(scrollSpy).toHaveBeenCalled()
      })
    })
  })

  describe('Breadcrumb Navigation', () => {
    it('shows breadcrumbs in create mode', async () => {
      const user = userEvent.setup()
      renderWithProviders(<PropertyFormPage />)
      await clickManualTab(user)

      expect(screen.getByText('Properties')).toBeInTheDocument()
      expect(screen.getByText('New Property')).toBeInTheDocument()
    })

    it('shows breadcrumbs in edit mode', async () => {
      vi.spyOn(hooks, 'useProperty').mockReturnValue({
        data: mockProperty,
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(
        <PropertyFormPage />,
        `/properties/${mockProperty.id}`
      )

      await waitFor(() => {
        expect(screen.getByText('Properties')).toBeInTheDocument()
        expect(screen.getByText('Test Plaza')).toBeInTheDocument()
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })
    })
  })
})
