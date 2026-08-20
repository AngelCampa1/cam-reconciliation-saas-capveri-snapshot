/**
 * Tests for CancelSubscriptionWizard component
 *
 * Tests the 3-step cancellation wizard: exit survey, save offer, confirm.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CancelSubscriptionWizard } from './CancelSubscriptionWizard'

// Mock the generated API client
vi.mock('@/api/client', () => ({
  cancelSubscriptionApiV1BillingSubscriptionCancelPost: vi.fn(),
  apiClient: {},
}))

// Mock toast
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({
    data: {
      id: 'sub-1',
      organization_id: 'org-1',
      status: 'active',
      plan: 'growth',
      billing_interval: 'annual',
      building_count: 3,
    },
  }),
}))

vi.mock('@/lib/analytics', () => ({
  getAmountBucket: vi.fn(() => '0-10k'),
  trackEvent: vi.fn(),
}))

import { cancelSubscriptionApiV1BillingSubscriptionCancelPost } from '@/api/client'
import { toast } from '@/components/ui/sonner'

const mockCancelApi = vi.mocked(
  cancelSubscriptionApiV1BillingSubscriptionCancelPost
)

const MOCK_SUBSCRIPTION = { id: 'sub-1', status: 'active', plan: 'growth' }

const SURVEY_RESPONSE_DISCOUNT = {
  attempt_id: 'attempt-123',
  offer_type: 'discount_20pct_1inv',
  discount_percent: 20,
}

const SURVEY_RESPONSE_ROADMAP = {
  attempt_id: 'attempt-456',
  offer_type: 'feature_roadmap',
  discount_percent: null,
}

const SURVEY_RESPONSE_ANNUAL_DISCOUNT = {
  attempt_id: 'attempt-457',
  offer_type: 'discount_20pct_1inv',
  discount_percent: 20,
}

const SURVEY_RESPONSE_NONE = {
  attempt_id: 'attempt-789',
  offer_type: 'none',
  discount_percent: null,
}

describe('CancelSubscriptionWizard', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const renderWizard = (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
  }) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CancelSubscriptionWizard {...props} />
      </QueryClientProvider>
    )
  }

  // Ineligible response for the eligibility check — prepended by default so
  // existing tests that open the dialog don't need to be rewritten.
  const INELIGIBLE_RESPONSE = {
    eligible: false,
    days_remaining: 0,
    first_invoice_amount: null,
    first_invoice_currency: 'usd',
  }

  const eligibilityResponse = (eligible = false) =>
    new Response(
      JSON.stringify(
        eligible
          ? {
              eligible: true,
              days_remaining: 25,
              first_invoice_amount: 998.0,
              first_invoice_currency: 'usd',
            }
          : INELIGIBLE_RESPONSE
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  const requestUrl = (input: RequestInfo | URL) =>
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url

  // Mocks fetch by endpoint so the eligibility query and survey POST cannot race.
  const mockSurveyFetch = (
    response: object,
    status = 200,
    acceptStatus = 200
  ) =>
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = requestUrl(input)
      if (url.includes('/api/v1/billing/guarantee/eligibility')) {
        return eligibilityResponse(false)
      }
      if (
        url.includes(`/api/v1/billing/save-offer/`) &&
        url.includes('/accept')
      ) {
        return new Response(JSON.stringify(MOCK_SUBSCRIPTION), {
          status: acceptStatus,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/v1/billing/save-offer')) {
        return new Response(JSON.stringify(response), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({}), { status: 404 })
    })

  // --- Survey step ---

  it('renders survey step when opened', () => {
    renderWizard({ open: true, onOpenChange: vi.fn() })

    expect(screen.getByText(/before you go/i)).toBeInTheDocument()
    expect(
      screen.getByText(/your feedback helps us improve/i)
    ).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    renderWizard({ open: false, onOpenChange: vi.fn() })

    expect(screen.queryByText(/before you go/i)).not.toBeInTheDocument()
  })

  it('shows all 6 cancel reason options', () => {
    renderWizard({ open: true, onOpenChange: vi.fn() })

    expect(screen.getByText(/costs more than i'm getting/i)).toBeInTheDocument()
    expect(screen.getByText(/not logging in enough/i)).toBeInTheDocument()
    expect(
      screen.getByText(/something i need isn't there/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/switching to a different tool/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/shutting down or downsizing/i)).toBeInTheDocument()
    expect(screen.getByText(/something else/i)).toBeInTheDocument()
  })

  it('"Keep my subscription" closes without triggering any mutations', async () => {
    const user = userEvent.setup()
    // Mock eligibility check (read-only, doesn't affect cancel behavior)
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(eligibilityResponse(false))
    const onOpenChange = vi.fn()

    renderWizard({ open: true, onOpenChange })

    await user.click(
      screen.getByRole('button', { name: /keep my subscription/i })
    )

    expect(onOpenChange).toHaveBeenCalledWith(false)
    // Only the eligibility GET should have been called — no mutations
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('save-offer'),
      expect.anything()
    )
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('cancel'),
      expect.anything()
    )

    fetchSpy.mockRestore()
  })

  it('Continue is disabled until a reason is selected', () => {
    renderWizard({ open: true, onOpenChange: vi.fn() })

    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()
  })

  it('selecting a reason and continuing calls POST /billing/save-offer', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_DISCOUNT)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/billing/save-offer'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    fetchSpy.mockRestore()
  })

  it('shows textarea when "Something else" is selected', async () => {
    const user = userEvent.setup()

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/something else/i))

    expect(screen.getByPlaceholderText(/tell us more/i)).toBeInTheDocument()
  })

  it('submits other_text when "Something else" reason is selected', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_NONE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/something else/i))
    await user.type(
      screen.getByPlaceholderText(/tell us more/i),
      'Need an export format we do not have yet'
    )
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/billing/save-offer'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            reason: 'other',
            other_text: 'Need an export format we do not have yet',
          }),
        })
      )
    })

    fetchSpy.mockRestore()
  })

  // --- Offer step: discount ---

  it('shows annual discount offer when survey returns discount_20pct_1inv', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_DISCOUNT)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /how about 20% off your next annual renewal invoice\?/i,
        })
      ).toBeInTheDocument()
    })

    fetchSpy.mockRestore()
  })

  it('accepting the discount offer calls POST /save-offer/{id}/accept', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_DISCOUNT)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: /how about 20% off your next annual renewal invoice\?/i,
        })
      ).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /apply discount/i }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          `/api/v1/billing/save-offer/${SURVEY_RESPONSE_DISCOUNT.attempt_id}/accept`
        ),
        expect.objectContaining({ method: 'POST' })
      )
    })

    fetchSpy.mockRestore()
  })

  it('accepting offer shows success toast and closes wizard', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_DISCOUNT)

    renderWizard({ open: true, onOpenChange })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: /how about 20% off your next annual renewal invoice\?/i,
        })
      ).toBeInTheDocument()
    )
    await user.click(screen.getByRole('button', { name: /apply discount/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('20% off')
      )
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    fetchSpy.mockRestore()
  })

  it('"No thanks" on discount offer advances to confirm step', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_DISCOUNT)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: /how about 20% off your next annual renewal invoice\?/i,
        })
      ).toBeInTheDocument()
    )

    await user.click(
      screen.getByRole('button', { name: /no thanks, keep canceling/i })
    )

    expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()

    fetchSpy.mockRestore()
  })

  it('shows annual discount messaging when survey returns discount_20pct_1inv', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_ANNUAL_DISCOUNT)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /how about 20% off your next annual renewal invoice\?/i,
        })
      ).toBeInTheDocument()
    })

    fetchSpy.mockRestore()
  })

  it('shows error toast if accepting annual discount fails', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_ANNUAL_DISCOUNT, 200, 500)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: /next annual renewal invoice/i,
        })
      ).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /apply discount/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again or contact support.'
      )
    })

    fetchSpy.mockRestore()
  })

  // --- Offer step: feature roadmap ---

  it('shows feature roadmap when survey returns feature_roadmap', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_ROADMAP)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/something i need isn't there/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/that feature is on the way/i)
      ).toBeInTheDocument()
    })

    fetchSpy.mockRestore()
  })

  it('"Stay" on roadmap step closes the wizard', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_ROADMAP)

    renderWizard({ open: true, onOpenChange })

    await user.click(screen.getByLabelText(/something i need isn't there/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/that feature is on the way/i)
      ).toBeInTheDocument()
    )

    await user.click(
      screen.getByRole('button', { name: /stay and see what ships/i })
    )

    expect(onOpenChange).toHaveBeenCalledWith(false)

    fetchSpy.mockRestore()
  })

  it('"No thanks" on roadmap step advances to confirm step', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_ROADMAP)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/something i need isn't there/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/that feature is on the way/i)
      ).toBeInTheDocument()
    )

    await user.click(
      screen.getByRole('button', { name: /no thanks, keep canceling/i })
    )

    expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()

    fetchSpy.mockRestore()
  })

  // --- Offer skip: business_closed → confirm ---

  it('skips offer step and goes to confirm when offer_type is none', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_NONE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/shutting down or downsizing/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/20% off/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/on the way/i)).not.toBeInTheDocument()

    fetchSpy.mockRestore()
  })

  // --- Confirm step ---

  it('confirm step shows billing period messaging', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch(SURVEY_RESPONSE_NONE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/shutting down or downsizing/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()
    )

    expect(
      screen.getByText(
        /access continues through the end of your billing period/i
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/nothing stops working today/i)).toBeInTheDocument()

    fetchSpy.mockRestore()
  })

  it('confirming cancel calls subscription cancel API with attempt_id', async () => {
    const user = userEvent.setup()
    mockCancelApi.mockResolvedValue({ data: MOCK_SUBSCRIPTION, error: null })

    // survey → no offer → confirm
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(eligibilityResponse(false))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SURVEY_RESPONSE_NONE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(
        // decline call — non-critical, can resolve or reject
        new Response(JSON.stringify({}), { status: 200 })
      )

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/shutting down or downsizing/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()
    )

    await user.click(
      screen.getByRole('button', { name: /yes, cancel my subscription/i })
    )

    await waitFor(() => {
      expect(mockCancelApi).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            immediate: false,
            attempt_id: SURVEY_RESPONSE_NONE.attempt_id,
          }),
        })
      )
    })

    fetchSpy.mockRestore()
  })

  it('successful cancel shows toast and closes wizard', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    mockCancelApi.mockResolvedValue({ data: MOCK_SUBSCRIPTION, error: null })

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(eligibilityResponse(false))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SURVEY_RESPONSE_NONE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    renderWizard({ open: true, onOpenChange, onSuccess })

    await user.click(screen.getByLabelText(/shutting down or downsizing/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()
    )
    await user.click(
      screen.getByRole('button', { name: /yes, cancel my subscription/i })
    )

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('canceled')
      )
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(onSuccess).toHaveBeenCalled()
    })

    fetchSpy.mockRestore()
  })

  // --- Error handling ---

  it('shows error toast when survey API call fails', async () => {
    const user = userEvent.setup()
    const fetchSpy = mockSurveyFetch({}, 500)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again.'
      )
    })

    fetchSpy.mockRestore()
  })

  it('shows error toast when cancel API call fails', async () => {
    const user = userEvent.setup()
    mockCancelApi.mockResolvedValue({
      data: null,
      error: { detail: 'Failed to cancel subscription' },
    })

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(eligibilityResponse(false))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(SURVEY_RESPONSE_NONE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/shutting down or downsizing/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() =>
      expect(screen.getByText(/cancel your subscription/i)).toBeInTheDocument()
    )
    await user.click(
      screen.getByRole('button', { name: /yes, cancel my subscription/i })
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to cancel subscription')
    })

    fetchSpy.mockRestore()
  })

  it('shows loading state while survey is submitting', async () => {
    const user = userEvent.setup()
    let resolveResponse!: (value: Response) => void

    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(eligibilityResponse(false))
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveResponse = resolve
        })
      )

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await user.click(screen.getByLabelText(/costs more than/i))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /processing/i })
      ).toBeInTheDocument()
    })

    resolveResponse(
      new Response(JSON.stringify(SURVEY_RESPONSE_DISCOUNT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /processing/i })
      ).not.toBeInTheDocument()
    })

    fetchSpy.mockRestore()
  })

  it('closing via escape calls onOpenChange(false)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()

    renderWizard({ open: true, onOpenChange })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Guarantee Step tests
// ---------------------------------------------------------------------------

const GUARANTEE_ELIGIBLE_RESPONSE = {
  eligible: true,
  days_remaining: 25,
  first_invoice_amount: 998.0,
  first_invoice_currency: 'usd',
}

const GUARANTEE_INELIGIBLE_RESPONSE = {
  eligible: false,
  days_remaining: 0,
  first_invoice_amount: null,
  first_invoice_currency: 'usd',
}

const GUARANTEE_CLAIM_RESPONSE = {
  refund_id: 'rf_test123',
  amount_refunded: 998.0,
  currency: 'usd',
}

describe('CancelSubscriptionWizard — GuaranteeStep', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const renderWizard = (props: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess?: () => void
  }) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CancelSubscriptionWizard {...props} />
      </QueryClientProvider>
    )
  }

  const mockEligibilityFetch = (response: object, status = 200) =>
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    )

  it('shows guarantee step when eligibility returns eligible=true', async () => {
    mockEligibilityFetch(GUARANTEE_ELIGIBLE_RESPONSE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await waitFor(() => {
      expect(
        screen.getByText(/30-Day Money-Back Guarantee/i)
      ).toBeInTheDocument()
    })
    expect(screen.getByText(/25 days remaining/i)).toBeInTheDocument()
    expect(screen.getByText(/\$998\.00/)).toBeInTheDocument()
  })

  it('shows survey step (not guarantee) when eligibility returns eligible=false', async () => {
    mockEligibilityFetch(GUARANTEE_INELIGIBLE_RESPONSE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    // Should show survey; guarantee step should not appear
    await waitFor(() => {
      expect(
        screen.queryByText(/30-Day Money-Back Guarantee/i)
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText(/before you go/i)).toBeInTheDocument()
  })

  it('"Skip — I just want to cancel" advances to survey step', async () => {
    const user = userEvent.setup()
    mockEligibilityFetch(GUARANTEE_ELIGIBLE_RESPONSE)

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await waitFor(() =>
      expect(
        screen.getByText(/30-Day Money-Back Guarantee/i)
      ).toBeInTheDocument()
    )

    await user.click(
      screen.getByRole('button', { name: /skip\. i just want to cancel\./i })
    )

    expect(screen.getByText(/before you go/i)).toBeInTheDocument()
  })

  it('"Claim my refund" calls POST /billing/guarantee/claim and shows success toast', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(GUARANTEE_ELIGIBLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(GUARANTEE_CLAIM_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )

    renderWizard({ open: true, onOpenChange, onSuccess })

    await waitFor(() =>
      expect(
        screen.getByText(/30-Day Money-Back Guarantee/i)
      ).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /claim my refund/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('998.00')
      )
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error toast if claim POST fails', async () => {
    const user = userEvent.setup()

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(GUARANTEE_ELIGIBLE_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Already claimed' }), {
          status: 409,
        })
      )

    renderWizard({ open: true, onOpenChange: vi.fn() })

    await waitFor(() =>
      expect(
        screen.getByText(/30-Day Money-Back Guarantee/i)
      ).toBeInTheDocument()
    )

    await user.click(screen.getByRole('button', { name: /claim my refund/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Something went wrong. Please try again or contact support.'
      )
    })
  })
})
