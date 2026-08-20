/**
 * PortfolioPipelinePage Tests
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

import { PortfolioPipelinePage } from './PortfolioPipelinePage'
import type { CampaignSummary } from '@/api'

// Mock the campaigns hooks
const mockCampaigns: CampaignSummary[] = []
const mockIsLoading = { value: false }
const mockUseCampaignsOverride: { value: Record<string, unknown> | null } = {
  value: null,
}
vi.mock('@/api', () => ({
  useCampaigns: () =>
    mockUseCampaignsOverride.value !== null
      ? mockUseCampaignsOverride.value
      : {
          data: mockCampaigns,
          isLoading: mockIsLoading.value,
          isError: false,
          isPaused: false,
          refetch: vi.fn(),
        },
  useSubmitForReview: () => ({ mutateAsync: vi.fn() }),
  useApproveCampaign: () => ({ mutateAsync: vi.fn() }),
  useRejectCampaign: () => ({ mutateAsync: vi.fn() }),
  useMarkSent: () => ({ mutateAsync: vi.fn() }),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock viewport - defaults to desktop; flip mockIsMobile for mobile tests.
let mockIsMobile = false
vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => ({
    width: mockIsMobile ? 375 : 1280,
    height: 800,
    isMobile: mockIsMobile,
    isTablet: false,
    isLaptop: false,
    isDesktop: !mockIsMobile,
    size: mockIsMobile ? 'mobile' : 'desktop',
    isTouch: mockIsMobile,
  }),
}))

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PortfolioPipelinePage />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function createCampaign(
  overrides: Partial<CampaignSummary> = {}
): CampaignSummary {
  return {
    id: 'camp-1',
    property_id: 'prop-1',
    property_name: 'Marina Plaza',
    period_year: 2025,
    status: 'draft',
    tenant_count: 10,
    finalized_tenant_count: 0,
    total_recovery: 42000,
    finalized_at: null,
    submitted_for_review_at: null,
    approved_at: null,
    sent_at: null,
    updated_at: '2025-01-15T00:00:00Z',
    ...overrides,
  }
}

function previousSelectableYear(): string {
  return String(new Date().getFullYear() - 1)
}

beforeEach(() => {
  mockCampaigns.length = 0
  mockIsLoading.value = false
  mockUseCampaignsOverride.value = null
  mockNavigate.mockClear()
  mockIsMobile = false
})

describe('PortfolioPipelinePage', () => {
  it('renders page heading', () => {
    renderPage()
    expect(screen.getByText('Portfolio Pipeline')).toBeInTheDocument()
  })

  it('shows year selector', () => {
    renderPage()
    expect(screen.getByTestId('year-selector')).toBeInTheDocument()
  })

  it('f275: year selector has accessible name "Filter by year"', () => {
    renderPage()
    expect(
      screen.getByRole('combobox', { name: /filter by year/i })
    ).toBeInTheDocument()
  })

  it('shows loading skeleton', () => {
    mockIsLoading.value = true
    renderPage()
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
  })

  it('shows empty state when no campaigns', () => {
    renderPage()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByText(/No campaigns/)).toBeInTheDocument()
  })

  it('shows status chips with counts', () => {
    mockCampaigns.push(
      createCampaign({ id: 'c1', status: 'draft' }),
      createCampaign({ id: 'c2', status: 'finalized' }),
      createCampaign({ id: 'c3', status: 'finalized' })
    )
    renderPage()
    const chips = screen.getByTestId('status-chips')
    expect(within(chips).getByText('Draft: 1')).toBeInTheDocument()
    expect(within(chips).getByText('Finalized: 2')).toBeInTheDocument()
    expect(within(chips).getByText('In Review: 0')).toBeInTheDocument()
  })

  it('renders campaign rows with property name and recovery', () => {
    mockCampaigns.push(
      createCampaign({
        property_name: 'Downtown Tower',
        total_recovery: 55000,
      })
    )
    renderPage()
    const rows = screen.getAllByTestId('campaign-row')
    expect(rows).toHaveLength(1)
    expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
    expect(screen.getByText('$55,000')).toBeInTheDocument()
  })

  it('labels the campaign total as variance instead of recovery', () => {
    mockCampaigns.push(createCampaign())
    renderPage()

    expect(screen.getByText('Total Variance')).toBeInTheDocument()
    expect(screen.queryByText('Total Recovery')).not.toBeInTheDocument()
  })

  it('shows Finalize button for draft campaigns', () => {
    mockCampaigns.push(createCampaign({ status: 'draft' }))
    renderPage()
    expect(
      screen.getByRole('button', { name: /finalize/i })
    ).toBeInTheDocument()
  })

  it('preserves the selected year when opening a draft campaign', async () => {
    const user = userEvent.setup()
    const targetYear = previousSelectableYear()
    mockCampaigns.push(
      createCampaign({
        status: 'draft',
        property_id: 'prop-2024',
      })
    )
    renderPage()

    await user.click(screen.getByTestId('year-selector'))
    await user.click(screen.getByRole('option', { name: targetYear }))
    await user.click(screen.getByRole('button', { name: /finalize/i }))

    expect(mockNavigate).toHaveBeenCalledWith(
      `/properties/prop-2024/reconciliations?year=${targetYear}`
    )
  })

  it('shows Submit for Review button for finalized campaigns', () => {
    mockCampaigns.push(createCampaign({ status: 'finalized' }))
    renderPage()
    expect(
      screen.getByRole('button', { name: /submit for review/i })
    ).toBeInTheDocument()
  })

  it('shows Approve and Reject buttons for in_review campaigns', () => {
    mockCampaigns.push(createCampaign({ status: 'in_review' }))
    renderPage()
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('shows Mark Sent button for approved campaigns', () => {
    mockCampaigns.push(createCampaign({ status: 'approved' }))
    renderPage()
    expect(
      screen.getByRole('button', { name: /mark sent/i })
    ).toBeInTheDocument()
  })

  it('preserves the selected year when viewing a sent campaign', async () => {
    const user = userEvent.setup()
    const targetYear = previousSelectableYear()
    mockCampaigns.push(
      createCampaign({
        status: 'sent',
        property_id: 'prop-2024',
      })
    )
    renderPage()

    await user.click(screen.getByTestId('year-selector'))
    await user.click(screen.getByRole('option', { name: targetYear }))
    await user.click(screen.getByRole('button', { name: /view/i }))

    expect(mockNavigate).toHaveBeenCalledWith(
      `/properties/prop-2024/reconciliations?year=${targetYear}`
    )
  })

  it('shows an offline notice (not the empty state) when the campaigns fetch is paused', () => {
    mockUseCampaignsOverride.value = {
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch: vi.fn(),
    }
    renderPage()

    // ErrorState with offline=true overrides the title to "Can't reach the server"
    const errorState = screen.getByTestId('error-state')
    expect(errorState).toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()

    // A "Try again" button must be present
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()

    // The empty state must NOT appear
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  describe('mobile layout', () => {
    beforeEach(() => {
      mockIsMobile = true
    })

    it('renders mobile-cards-view with property name and recovery', () => {
      mockCampaigns.push(
        createCampaign({
          property_name: 'Harbor Point',
          total_recovery: 30000,
          finalized_tenant_count: 2,
          tenant_count: 5,
        })
      )
      renderPage()

      expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
      expect(screen.getByText('Harbor Point')).toBeInTheDocument()
      expect(screen.getByText('$30,000')).toBeInTheDocument()
      expect(screen.getByText(/2\/5 tenants finalized/)).toBeInTheDocument()
    })

    it('renders action button full-width for draft campaign on mobile', () => {
      mockCampaigns.push(createCampaign({ status: 'draft' }))
      renderPage()

      const btn = screen.getByRole('button', { name: /finalize/i })
      expect(btn.className).toMatch(/w-full/)
      expect(btn.className).toMatch(/min-h-\[44px\]/)
    })

    it('stacks Approve/Reject vertically for in_review campaigns on mobile', () => {
      mockCampaigns.push(createCampaign({ status: 'in_review' }))
      renderPage()

      const approveBtn = screen.getByRole('button', { name: /approve/i })
      const rejectBtn = screen.getByRole('button', { name: /reject/i })
      expect(approveBtn.className).toMatch(/w-full/)
      expect(rejectBtn.className).toMatch(/w-full/)
    })
  })
})
