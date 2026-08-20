/**
 * PropertyFormPage Smoke Tests
 *
 * Minimal tests to verify component renders and basic functionality works
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropertyFormPage } from './PropertyFormPage'
import * as hooks from '@/api/hooks'
import type { Property } from '@/api/client'

// Mock hooks
vi.mock('@/api/hooks', () => ({
  useProperty: vi.fn(),
  useCreateProperty: vi.fn(),
  useUpdateProperty: vi.fn(),
  useRentRollPreview: vi.fn(),
  useRentRollImport: vi.fn(),
}))

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: true,
    isOwner: true,
    userRole: 'owner',
  }),
}))

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

// Renders the current pathname so navigation can be asserted after the form
// redirects (e.g. clicking Cancel).
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

function renderComponent(route = '/properties/new', property?: Property) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  vi.mocked(hooks.useProperty).mockReturnValue({
    data: property,
    isLoading: false,
    error: null,
  } as never)

  vi.mocked(hooks.useCreateProperty).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)

  vi.mocked(hooks.useUpdateProperty).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)

  vi.mocked(hooks.useRentRollPreview).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)

  vi.mocked(hooks.useRentRollImport).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/properties/new" element={<PropertyFormPage />} />
          <Route
            path="/properties/:propertyId/edit"
            element={<PropertyFormPage />}
          />
          <Route path="/properties" element={<LocationProbe />} />
          <Route path="/properties/:propertyId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PropertyFormPage', () => {
  it('renders the create workflow with upload and manual entry paths', async () => {
    const user = userEvent.setup()

    renderComponent('/properties/new')

    expect(
      screen.getByRole('heading', { name: /create property/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /upload rent roll/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /enter manually/i })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /enter manually/i }))

    expect(screen.getByLabelText(/property name/i)).toHaveValue('')
    expect(screen.getByLabelText(/address line 1/i)).toHaveValue('')
    expect(screen.getByLabelText(/city/i)).toHaveValue('')
    expect(screen.getByTestId('target-occupancy-input')).toHaveValue(95)
    expect(
      screen.getByRole('button', { name: /create property/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('renders edit mode with existing property values and no create tabs', async () => {
    renderComponent('/properties/123/edit', mockProperty)

    expect(
      screen.getByRole('heading', { name: /edit property/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: /upload rent roll/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: /enter manually/i })
    ).not.toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText(/property name/i)).toHaveValue('Test Plaza')
    })
    expect(screen.getByLabelText(/address line 1/i)).toHaveValue('123 Main St')
    expect(screen.getByLabelText(/address line 2/i)).toHaveValue('Suite 100')
    expect(screen.getByLabelText(/city/i)).toHaveValue('Los Angeles')
    expect(screen.getByLabelText(/postal code/i)).toHaveValue('90001')
    expect(screen.getByTestId('target-occupancy-input')).toHaveValue(95)
    expect(
      screen.getByRole('button', { name: /update property/i })
    ).toBeInTheDocument()
  })

  it('cancel in create mode returns to the properties list', async () => {
    const user = userEvent.setup()
    renderComponent('/properties/new')

    await user.click(screen.getByRole('tab', { name: /enter manually/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Must land on a real route, not rely on navigate(-1) (which is a dead-end
    // on a fresh tab or deep link with no history to go back to).
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/properties'
      )
    })
  })

  it('cancel in edit mode returns to the property detail', async () => {
    const user = userEvent.setup()
    renderComponent('/properties/123/edit', mockProperty)

    await waitFor(() => {
      expect(screen.getByLabelText(/property name/i)).toHaveValue('Test Plaza')
    })
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(
        '/properties/123'
      )
    })
  })

  it('shows loading state when fetching property', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

    vi.mocked(hooks.useProperty).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    vi.mocked(hooks.useCreateProperty).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(hooks.useUpdateProperty).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(hooks.useRentRollPreview).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    vi.mocked(hooks.useRentRollImport).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/properties/123/edit']}>
          <Routes>
            <Route
              path="/properties/:propertyId/edit"
              element={<PropertyFormPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    // Check for loading skeleton elements
    const pulsing = container.querySelectorAll('.animate-pulse')
    expect(pulsing.length).toBeGreaterThan(0)
  })

  it('has property form schema validation', async () => {
    // Import the live schema the form actually uses (single source of truth).
    const { propertyFormSchema } = await import('./PropertyFormSchema')

    // Valid data should pass. target_occupancy is a percentage (95 = 95%),
    // matching what the form actually collects and submits.
    const validData = {
      name: 'Test Property',
      address_line1: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90001',
      total_rentable_sqft: '50000',
      total_usable_sqft: '45000',
      common_area_sqft: '5000',
      target_occupancy: '95',
      boma_standard_version: '2024',
    }

    expect(() => propertyFormSchema.parse(validData)).not.toThrow()
  })

  it('validates required fields in schema', async () => {
    const { propertyFormSchema } = await import('./PropertyFormSchema')

    // Missing required fields should fail
    const invalidData = {
      name: '',
    }

    expect(() => propertyFormSchema.parse(invalidData)).toThrow()
  })

  it('validates state as 2-letter code', async () => {
    const { propertyFormSchema } = await import('./PropertyFormSchema')

    const invalidState = {
      name: 'Test',
      address_line1: '123 Main',
      city: 'LA',
      state: 'California', // Should be 2 letters
      postal_code: '90001',
      total_rentable_sqft: '50000',
      total_usable_sqft: '45000',
      common_area_sqft: '5000',
    }

    expect(() => propertyFormSchema.parse(invalidState)).toThrow()
  })

  it('validates postal code format', async () => {
    const { propertyFormSchema } = await import('./PropertyFormSchema')

    const invalidPostal = {
      name: 'Test',
      address_line1: '123 Main',
      city: 'LA',
      state: 'CA',
      postal_code: '123', // Should be 5 or 5+4 digits
      total_rentable_sqft: '50000',
      total_usable_sqft: '45000',
      common_area_sqft: '5000',
    }

    expect(() => propertyFormSchema.parse(invalidPostal)).toThrow()
  })
})
