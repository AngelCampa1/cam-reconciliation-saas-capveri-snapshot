/**
 * PropertyFormPage Tests - Focused on Story 10.3 Requirements
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropertyFormPage } from './PropertyFormPage'
import * as hooks from '@/api/hooks'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: true,
    isOwner: true,
    userRole: 'owner',
  }),
}))

function renderWithProviders(
  ui: React.ReactElement,
  initialRoute = '/properties/new'
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/properties/new" element={ui} />
          <Route path="/properties/:propertyId/edit" element={ui} />
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

describe('PropertyFormPage - Story 10.3', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useUpdateProperty').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('create form renders with empty fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyFormPage />)
    await clickManualTab(user)

    expect(screen.getByText('New Property')).toBeInTheDocument()
    expect(screen.getByTestId('property-name-input')).toHaveValue('')
    expect(
      screen.getByRole('button', { name: /Create Property/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
  })

  it('validates required fields', async () => {
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
    })
  })

  it('navigates to the properties list on cancel', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyFormPage />)
    await clickManualTab(user)

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/properties')
  })

  it('shows loading state during property fetch in edit mode', () => {
    vi.spyOn(hooks, 'useProperty').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never)

    renderWithProviders(<PropertyFormPage />, '/properties/123/edit')

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('submits create form with valid data', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()

    vi.spyOn(hooks, 'useCreateProperty').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(<PropertyFormPage />)
    await clickManualTab(user)

    // Fill in required fields using testids
    await user.type(screen.getByTestId('property-name-input'), 'Test Plaza')
    await user.type(screen.getByTestId('address-line1-input'), '123 Main St')
    await user.type(screen.getByTestId('city-input'), 'Los Angeles')
    await user.click(screen.getByTestId('state-input'))
    await user.click(screen.getByRole('option', { name: /CA .* California/i }))
    await user.type(screen.getByTestId('postal-code-input'), '90001')
    await user.type(screen.getByTestId('total-rentable-sqft-input'), '50000')
    await user.type(screen.getByTestId('total-usable-sqft-input'), '45000')
    await user.type(screen.getByTestId('common-area-sqft-input'), '5000')

    await user.click(screen.getByRole('button', { name: /Create Property/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Plaza',
          address_line1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postal_code: '90001',
        })
      )
    })
  }, 20000)

  it('validates name minimum length', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyFormPage />)
    await clickManualTab(user)

    await user.type(screen.getByTestId('property-name-input'), 'A')
    await user.tab()

    await waitFor(() => {
      expect(
        screen.getByText(/Property name must be at least 2 characters/i)
      ).toBeInTheDocument()
    })
  })

  it('validates state as 2-letter code', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PropertyFormPage />)
    await clickManualTab(user)

    await user.click(screen.getByRole('button', { name: /Create Property/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/State must be a 2-letter code/i)
      ).toBeInTheDocument()
    })
  })
})
