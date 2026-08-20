/**
 * OnboardFlowWizard Tests
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock useAnonSession — bypass Supabase bootstrap
vi.mock('../hooks/useAnonSession', () => ({
  useAnonSession: () => ({
    userId: 'anon-123',
    organizationId: 'org-123',
    isReady: true,
    error: null,
    shouldRedirectToDashboard: false,
  }),
}))

// Mock API hooks used by AddLeasesStep
vi.mock('@/api/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/hooks')>()
  return {
    ...actual,
    useLeases: () => ({
      data: { count: 0, data: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    }),
    useUnits: () => ({
      data: { data: [] },
      isLoading: false,
    }),
  }
})

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    isAdmin: true,
    isOwner: true,
    userRole: 'owner',
  }),
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { OnboardFlowWizard } from '../OnboardFlowWizard'

const STORAGE_KEY = 'capveri_plg_anon-123'
const SAMPLE_SEEN_KEY = 'capveri_onboarding_sample_result_seen:anon-123'

function renderWizard(ssoMode = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OnboardFlowWizard ssoMode={ssoMode} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('OnboardFlowWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('sample preview (?demo=1): shows the sample front door, not the form', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/onboard?demo=1']}>
          <OnboardFlowWizard ssoMode={false} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    // The dashboard "see a sample" entry lands a logged-in user on the
    // read-only sample (the $14,820 found), with the single start CTA.
    expect(await screen.findByText('$14,820')).toBeInTheDocument()
    expect(
      screen.getByText(/modeled sample building check/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /check my own building/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /talk to a person/i })
    ).not.toBeInTheDocument()
    expect(localStorage.getItem(SAMPLE_SEEN_KEY)).toBe('1')
  })

  it('sample preview (?demo=1): forces the sample even with stale flowStarted', async () => {
    // A returning user whose stored PLG state already started the flow must
    // still see the sample when they click "see a sample" from the dashboard.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentStep: 3,
        maxReachedStep: 3,
        completed: false,
        data: { flowStarted: true },
      })
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/onboard?demo=1']}>
          <OnboardFlowWizard ssoMode={false} />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(await screen.findByText('$14,820')).toBeInTheDocument()
  })

  it('SSO mode: accessible progress count is "step X of 5" (not 7)', async () => {
    renderWizard(true)

    // The visible label is calm ("Step N · Label"); the full count lives in the
    // progress group's accessible name.
    const group = await screen.findByRole('group', {
      name: /onboarding progress: step \d+ of 5/i,
    })
    expect(group).toBeInTheDocument()
    expect(
      screen.queryByRole('group', {
        name: /onboarding progress: step \d+ of 7/i,
      })
    ).not.toBeInTheDocument()
  })

  it('SSO mode: auto-completes and navigates to /dashboard when step advances past 5', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentStep: 6,
        maxReachedStep: 6,
        data: { propertyId: 'prop-abc' },
      })
    )

    renderWizard(true)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
  })

  it('non-SSO new user: shows the sample-first Welcome screen first', async () => {
    renderWizard(false)

    // The big sample number and primary CTA are the front door.
    expect(await screen.findByText('$14,820')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /check my own building/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/setup call/i)).not.toBeInTheDocument()
    // No step machine chrome while the Welcome screen is showing.
    expect(
      screen.queryByRole('group', { name: /onboarding progress/i })
    ).not.toBeInTheDocument()
  })

  it('Welcome screen: reveals the 3 findings on toggle', async () => {
    renderWizard(false)

    const toggle = await screen.findByRole('button', {
      name: /show me how we found it/i,
    })
    await userEvent.click(toggle)

    expect(screen.getByText(/roof repair over-billed/i)).toBeInTheDocument()
    expect(screen.getByText(/over-bill caught/i)).toBeInTheDocument()
    expect(screen.getByText(/missed empty space/i)).toBeInTheDocument()
    expect(screen.getAllByText(/under-bill caught/i).length).toBe(2)
    expect(screen.getByText(/late tax bill missed/i)).toBeInTheDocument()
  })

  it('non-SSO: "Check my own building" starts the real-data flow at step 1', async () => {
    renderWizard(false)

    const cta = await screen.findByRole('button', {
      name: /check my own building/i,
    })
    await userEvent.click(cta)

    // Real step machine begins: the progress group reports the full 7-step count.
    const group = await screen.findByRole('group', {
      name: /onboarding progress: step \d+ of 7/i,
    })
    expect(group).toBeInTheDocument()
    // Welcome screen does not reappear.
    expect(
      screen.queryByRole('button', { name: /check my own building/i })
    ).not.toBeInTheDocument()
  })

  it('renders AddLeasesStep content at step 2 when propertyId is set', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentStep: 2,
        maxReachedStep: 2,
        data: { propertyId: 'prop-abc' },
      })
    )

    renderWizard()

    // AddLeasesStep renders the "Add your tenants" heading when propertyId is present
    expect(
      await screen.findByRole('heading', { name: /add your tenants/i })
    ).toBeDefined()
  })
})
