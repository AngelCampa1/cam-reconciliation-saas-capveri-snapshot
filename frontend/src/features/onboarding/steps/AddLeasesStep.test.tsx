import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddLeasesStep } from './AddLeasesStep'

vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

vi.mock('@/api/hooks', () => ({
  useLeases: vi.fn(),
  useUnits: vi.fn(),
  useCreateLease: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding
const mockUseLeases = vi.mocked((await import('@/api/hooks')).useLeases)
const mockUseUnits = vi.mocked((await import('@/api/hooks')).useUnits)
const mockUseCreateLease = vi.mocked(
  (await import('@/api/hooks')).useCreateLease
)

const DEFAULT_ONBOARDING = {
  nextStep: mockNextStep,
  setStepData: mockSetStepData,
  state: { data: { propertyId: 'prop-1' }, currentStep: 3, totalSteps: 7 },
} as any

const EMPTY_UNITS = { data: { data: [], count: 0 }, isLoading: false } as any

describe('AddLeasesStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUnits.mockReturnValue(EMPTY_UNITS)
    mockUseCreateLease.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
  })

  it('renders warning when property is missing', () => {
    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      setStepData: mockSetStepData,
      state: { data: {}, currentStep: 3, totalSteps: 7 },
    } as any)
    mockUseLeases.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    expect(screen.getByText(/add your building first/i)).toBeInTheDocument()
  })

  it('shows spinner while leases query is loading', () => {
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isFetching: true,
    } as any)

    render(<AddLeasesStep />)
    // Should show a loading indicator, not the form
    expect(screen.queryByLabelText(/tenant name/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue/i })
    ).not.toBeInTheDocument()
  })

  it('shows inline form when lease count is 0', () => {
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    expect(screen.getByLabelText(/tenant name/i)).toBeInTheDocument()
  })

  it('surfaces a retryable note when the units load fails', async () => {
    const user = userEvent.setup()
    const refetchUnits = vi.fn()
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)
    mockUseUnits.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchUnits,
    } as any)

    render(<AddLeasesStep />)

    // A failed units load must not silently render an empty Unit dropdown.
    expect(
      screen.getByText(/could not load the spaces for this building/i)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetchUnits).toHaveBeenCalled()
  })

  it('does not render Open Property Leases button', () => {
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    expect(
      screen.queryByRole('button', { name: /open property leases/i })
    ).not.toBeInTheDocument()
  })

  it('shows offline notice and retry when leases query is paused', async () => {
    const user = userEvent.setup()
    const refetchLeases = vi.fn()
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: undefined,
      isLoading: false,
      isPaused: true,
      error: null,
      refetch: refetchLeases,
      isFetching: false,
    } as never)

    render(<AddLeasesStep />)

    // Offline notice must appear
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()

    // "Try again" must trigger refetch
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetchLeases).toHaveBeenCalled()

    // Misleading "Next" disabled button must not be the only control shown
    expect(
      screen.queryByText(/add your building first/i)
    ).not.toBeInTheDocument()
  })

  it('disables continue when no leases are found', () => {
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })

  it('shows existing lease list when leases exist', () => {
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: {
        data: [
          {
            id: 'lease-1',
            tenant_name: 'Acme Corp',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
          {
            id: 'lease-2',
            tenant_name: 'Beta LLC',
            start_date: '2023-06-01',
            end_date: '2025-05-31',
          },
        ],
        count: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Beta LLC')).toBeInTheDocument()
  })

  it('shows Add another lease button when leases exist; clicking reveals form', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: {
        data: [
          {
            id: 'lease-1',
            tenant_name: 'Acme Corp',
            start_date: '2024-01-01',
            end_date: '2024-12-31',
          },
        ],
        count: 1,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)

    // Form should be hidden initially
    expect(screen.queryByLabelText(/tenant name/i)).not.toBeInTheDocument()

    // "Add another" button should be present
    const addBtn = screen.getByRole('button', { name: /add another tenant/i })
    expect(addBtn).toBeInTheDocument()

    // Clicking reveals the form
    await user.click(addBtn)
    await waitFor(() => {
      expect(screen.getByLabelText(/tenant name/i)).toBeInTheDocument()
    })
  })

  it('enables continue when leases exist and advances', async () => {
    const user = userEvent.setup()
    mockUseOnboarding.mockReturnValue(DEFAULT_ONBOARDING)
    mockUseLeases.mockReturnValue({
      data: { data: [{ id: 'lease-1' }], count: 1 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    } as any)

    render(<AddLeasesStep />)
    const continueButton = screen.getByRole('button', { name: /next/i })
    expect(continueButton).toBeEnabled()
    await user.click(continueButton)

    expect(mockSetStepData).toHaveBeenCalledWith('hasLeases', true)
    expect(mockNextStep).toHaveBeenCalledTimes(1)
  })
})
