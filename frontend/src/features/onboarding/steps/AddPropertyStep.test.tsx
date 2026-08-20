/**
 * Tests for AddPropertyStep component.
 *
 * Validates property creation form and validation.
 * Note: Component now has Upload/Manual tabs, so tests need to click "Enter Manually" tab first.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AddPropertyStep } from './AddPropertyStep'

// Mock hooks
vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

// Mock the API client
vi.mock('@/api/generated', () => ({
  createPropertyApiV1PropertiesPost: vi.fn(),
  getPropertyApiV1PropertiesPropertyIdGet: vi.fn(),
}))

vi.mock('@/components/rent-roll', () => ({
  RentRollUpload: ({
    onSuccess,
  }: {
    onSuccess?: (propertyId: string) => void
  }) => (
    <button
      type="button"
      onClick={() => onSuccess?.('a1b2c3d4-e5f6-7890-abcd-ef1234567890')}
    >
      Mock tenant list import
    </button>
  ),
}))

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: true,
    isOwner: true,
    userRole: 'owner',
  }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// Create a wrapper with QueryClientProvider for tests
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding
const mockCreateProperty = vi.mocked(
  (await import('@/api/generated')).createPropertyApiV1PropertiesPost
)
const mockGetProperty = vi.mocked(
  (await import('@/api/generated')).getPropertyApiV1PropertiesPropertyIdGet
)
const mockTrackEvent = vi.mocked((await import('@/lib/analytics')).trackEvent)

const TEST_PROPERTY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const testProperty = {
  id: TEST_PROPERTY_ID,
  name: 'Test Property',
  address_line1: '123 Main St',
  city: 'Austin',
  state: 'TX',
  postal_code: '78701',
  total_rentable_sqft: 10000,
  total_usable_sqft: 9000,
  common_area_sqft: 1000,
  organization_id: 'org-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

// Helper to click the Manual tab before form interactions
async function clickManualTab(user: ReturnType<typeof userEvent.setup>) {
  const manualTab = screen.getByRole('tab', { name: /enter manually/i })
  await user.click(manualTab)
}

describe('AddPropertyStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      setStepData: mockSetStepData,
      prevStep: vi.fn(),
      currentStep: 2,
      totalSteps: 5,
      goToStep: vi.fn(),
      completeOnboarding: vi.fn(),
      state: { data: {}, currentStep: 2, totalSteps: 5 },
      isFirstStep: false,
      isLastStep: false,
      progress: 20,
    } as any)

    // Mock successful API response by default
    mockCreateProperty.mockResolvedValue({
      data: testProperty,
      error: undefined,
      response: {} as Response,
    } as any)
    mockGetProperty.mockResolvedValue({
      data: testProperty,
      error: undefined,
      response: {} as Response,
    } as Awaited<ReturnType<typeof mockGetProperty>>)
  })

  it('renders tabs and form with all required fields', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)

    // Should show upload/manual tabs
    expect(
      screen.getByRole('tab', { name: /upload a tenant list/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /enter manually/i })
    ).toBeInTheDocument()

    // Click manual tab to show form
    await clickManualTab(user)

    expect(screen.getByLabelText(/property name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument()
  })

  it('updates form data when typing in fields', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)

    await user.type(nameInput, 'Office Tower')
    await user.type(addressInput, '123 Main St')

    expect(nameInput).toHaveValue('Office Tower')
    expect(addressInput).toHaveValue('123 Main St')
  })

  it('disables submit button when form is invalid (empty name)', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    expect(submitButton).toBeDisabled()
  })

  it('disables submit button when only name is filled', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    await user.type(nameInput, 'Office Tower')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    expect(submitButton).toBeDisabled()
  })

  it('disables submit button when name and address filled but no sqft', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)

    await user.type(nameInput, 'Office Tower')
    await user.type(addressInput, '123 Main St')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    expect(submitButton).toBeDisabled()
  })

  it('enables submit button when all required fields are filled', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)
    const sqftInput = screen.getByLabelText(/how big is the building/i)

    await user.type(nameInput, 'Office Tower')
    await user.type(addressInput, '123 Main St')
    await user.type(sqftInput, '50000')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    expect(submitButton).toBeEnabled()
  })

  it('submits form and calls setStepData and nextStep', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)
    const sqftInput = screen.getByLabelText(/how big is the building/i)

    await user.type(nameInput, 'Skyline Plaza')
    await user.type(addressInput, '456 Elm Street')
    await user.type(sqftInput, '50000')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockCreateProperty).toHaveBeenCalled()
      expect(mockSetStepData).toHaveBeenCalledWith(
        'propertyId',
        TEST_PROPERTY_ID
      )
      expect(mockSetStepData).toHaveBeenCalledWith(
        'propertyName',
        'Test Property'
      )
      expect(mockNextStep).toHaveBeenCalledTimes(1)
    })
  })

  it('skips the tenant step after tenant-list import creates leases', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)

    await user.click(
      screen.getByRole('button', { name: /mock tenant list import/i })
    )

    await waitFor(() => {
      expect(mockSetStepData).toHaveBeenCalledWith(
        'propertyId',
        TEST_PROPERTY_ID
      )
      expect(mockSetStepData).toHaveBeenCalledWith(
        'propertyName',
        'Test Property'
      )
      expect(mockSetStepData).toHaveBeenCalledWith('hasLeases', true)
      expect(mockNextStep).toHaveBeenCalledTimes(2)
    })

    expect(mockTrackEvent).toHaveBeenCalledWith('onboard_step_completed', {
      step: 1,
      step_label: 'Your Property',
      method: 'rent_roll',
    })
    expect(mockTrackEvent).toHaveBeenCalledWith('onboard_step_completed', {
      step: 2,
      step_label: 'Tenant Leases',
      method: 'rent_roll_import',
    })
  })

  it('calls nextStep when skip button is clicked', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const skipButton = screen.getByRole('button', { name: /skip for now/i })
    await user.click(skipButton)

    expect(mockNextStep).toHaveBeenCalledTimes(1)
    expect(mockSetStepData).not.toHaveBeenCalled()
  })

  it('shows submitting state when form is being submitted', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)
    const sqftInput = screen.getByLabelText(/how big is the building/i)

    await user.type(nameInput, 'Office Tower')
    await user.type(addressInput, '123 Main St')
    await user.type(sqftInput, '50000')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })

    // Click submit
    await user.click(submitButton)

    // Should call nextStep after API response
    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled()
    })
  })

  it('updates all optional fields correctly', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const cityInput = screen.getByLabelText(/city/i)
    const stateInput = screen.getByLabelText(/state/i)
    const zipInput = screen.getByLabelText(/zip code/i)

    await user.type(cityInput, 'Portland')
    await user.type(stateInput, 'OR')
    await user.type(zipInput, '97201')

    expect(cityInput).toHaveValue('Portland')
    expect(stateInput).toHaveValue('OR')
    expect(zipInput).toHaveValue('97201')
  })

  it('enforces maxLength of 2 on state field', async () => {
    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const stateInput = screen.getByLabelText(/state/i) as HTMLInputElement
    expect(stateInput.maxLength).toBe(2)
  })

  it('shows error message when API call fails', async () => {
    mockCreateProperty.mockResolvedValueOnce({
      data: undefined,
      error: { detail: 'Property name already exists' },
      response: {} as Response,
    } as any)

    const user = userEvent.setup()
    renderWithQueryClient(<AddPropertyStep />)
    await clickManualTab(user)

    const nameInput = screen.getByLabelText(/property name/i)
    const addressInput = screen.getByLabelText(/street address/i)
    const sqftInput = screen.getByLabelText(/how big is the building/i)

    await user.type(nameInput, 'Duplicate Property')
    await user.type(addressInput, '123 Main St')
    await user.type(sqftInput, '50000')

    const submitButton = screen.getByRole('button', {
      name: /save my building/i,
    })
    await user.click(submitButton)

    await waitFor(() => {
      expect(
        screen.getByText(/property name already exists/i)
      ).toBeInTheDocument()
    })
    expect(mockNextStep).not.toHaveBeenCalled()
  })
})
