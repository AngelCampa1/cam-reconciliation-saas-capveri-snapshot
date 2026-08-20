/**
 * Tests for ComparePage (Module B wiring).
 *
 * Following test minimalism: header render, the run-button enable gating, the
 * source toggle revealing the manual editor, and results rendering when the run
 * hook returns data. The comparison feature hooks are mocked at module level
 * (like the year-over-year page test); the property list goes through MSW.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { http, HttpResponse } from 'msw'
import { server } from '@/mocks'
import type { ComparisonResult } from '@/api/comparison'
import { ComparePage } from './ComparePage'

vi.mock('@/features/comparison/hooks/useComparison', async () => {
  const actual = await vi.importActual(
    '@/features/comparison/hooks/useComparison'
  )
  return {
    ...actual,
    useRunComparison: vi.fn(),
    useSaveComparisonRun: vi.fn(),
    useComparisonRuns: vi.fn(),
  }
})

import {
  useRunComparison,
  useSaveComparisonRun,
  useComparisonRuns,
} from '@/features/comparison/hooks/useComparison'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

const mockProperties = [
  { id: 'prop-1', name: 'Downtown Tower' },
  { id: 'prop-2', name: 'Suburban Plaza' },
]

const mockLeases = [
  { id: 'lease-1', tenant_name: 'Acme Corp' },
  { id: 'lease-2', tenant_name: 'Beta Shops' },
]

const sampleResult: ComparisonResult = {
  property_id: 'prop-1',
  period_start: '2024-01-01',
  period_end: '2024-12-31',
  tolerance: '0.01',
  tenants: [
    {
      lease_id: 'lease-1',
      tenant_name: 'Acme Corp',
      match_status: 'matched',
      match_note: null,
      capveri_correct: '1000.00',
      actual_charged: '1100.00',
      variance: '100.00',
      direction: 'overcharge',
      abs_variance: '100.00',
      variance_pct: '10',
      pool_breakdowns: null,
    },
  ],
  total_capveri_correct: '1000.00',
  total_actual_charged: '1100.00',
  total_net_variance: '100.00',
  total_overcharge: '100.00',
  total_undercharge: '0.00',
  overcharge_count: 1,
  undercharge_count: 0,
  match_count: 0,
}

/**
 * Mock useRunComparison. When `resolveWith` is provided, the returned `mutate`
 * synchronously invokes the caller's `onSuccess` with it — the page stores the
 * result in local state, so this is how results get rendered.
 */
function mockRunComparison(resolveWith?: ComparisonResult) {
  const mutate = vi.fn(
    (
      _input: unknown,
      opts?: { onSuccess?: (data: ComparisonResult) => void }
    ) => {
      if (resolveWith && opts?.onSuccess) {
        opts.onSuccess(resolveWith)
      }
    }
  )
  vi.mocked(useRunComparison).mockReturnValue({
    mutate,
    data: undefined,
    isPending: false,
  } as unknown as ReturnType<typeof useRunComparison>)
  return mutate
}

describe('ComparePage', () => {
  let saveMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockRunComparison(undefined)
    saveMutate = vi.fn()
    vi.mocked(useSaveComparisonRun).mockReturnValue({
      mutate: saveMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveComparisonRun>)
    vi.mocked(useComparisonRuns).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useComparisonRuns>)

    server.use(
      http.get('*/api/v1/properties', () =>
        HttpResponse.json({
          data: mockProperties,
          count: 2,
          has_more: false,
        })
      ),
      http.get('*/api/v1/leases', () =>
        HttpResponse.json({
          data: mockLeases,
          count: 2,
          has_more: false,
        })
      )
    )
  })

  it('renders the page header', () => {
    render(<ComparePage />, { wrapper: createWrapper() })

    expect(screen.getByText('Compare systems')).toBeInTheDocument()
    expect(
      screen.getByText(
        "Check another system's charges against the right amount, tenant by tenant."
      )
    ).toBeInTheDocument()
  })

  it('disables the run button until a property and valid period are set', async () => {
    render(<ComparePage />, { wrapper: createWrapper() })

    const runButton = screen.getByRole('button', { name: /Run comparison/i })
    expect(runButton).toBeDisabled()

    // Pick a property.
    await waitFor(() => {
      expect(screen.getByTestId('property-select-trigger')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('property-select-trigger'))
    await waitFor(() => {
      expect(document.querySelector('[role="option"]')).toBeInTheDocument()
    })
    fireEvent.click(document.querySelector('[role="option"]') as HTMLElement)

    // Property alone is not enough; still disabled without a period.
    expect(runButton).toBeDisabled()

    // Add a valid period (start before end).
    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2024-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-12-31' },
    })

    // The disabled-state button is wrapped in a tooltip; once enabled it is a
    // distinct (non-wrapped) node, so re-query rather than reuse the handle.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Run comparison/i })
      ).toBeEnabled()
    )
  })

  it('reveals the explicit charges editor when source is set to manual', async () => {
    const user = userEvent.setup()
    render(<ComparePage />, { wrapper: createWrapper() })

    expect(
      screen.queryByTestId('explicit-charges-editor')
    ).not.toBeInTheDocument()

    await user.click(screen.getByTestId('source-manual'))

    expect(screen.getByTestId('explicit-charges-editor')).toBeInTheDocument()
  })

  it('renders summary and tenant table after a successful run', async () => {
    mockRunComparison(sampleResult)

    render(<ComparePage />, { wrapper: createWrapper() })

    // Choose a property.
    await waitFor(() => {
      expect(screen.getByTestId('property-select-trigger')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('property-select-trigger'))
    await waitFor(() => {
      expect(document.querySelector('[role="option"]')).toBeInTheDocument()
    })
    fireEvent.click(document.querySelector('[role="option"]') as HTMLElement)

    // Set a valid period so the run button enables.
    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2024-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-12-31' },
    })

    const runButton = screen.getByRole('button', { name: /Run comparison/i })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(screen.getByTestId('comparison-summary')).toBeInTheDocument()
    })
    expect(screen.getByText('Tenant by tenant')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    // Save button only appears once a result exists.
    expect(
      screen.getByRole('button', { name: /Save this comparison/i })
    ).toBeInTheDocument()
  })

  it('warns when the result has rows that need matching', async () => {
    mockRunComparison({
      ...sampleResult,
      tenants: [
        {
          ...sampleResult.tenants[0],
          lease_id: 'unmatched-name::Unknown Tenant',
          tenant_name: 'Unknown Tenant',
          match_status: 'needs_review',
          match_note: 'No lease matched this billed row.',
        },
      ],
    })

    render(<ComparePage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('property-select-trigger')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('property-select-trigger'))
    await waitFor(() => {
      expect(document.querySelector('[role="option"]')).toBeInTheDocument()
    })
    fireEvent.click(document.querySelector('[role="option"]') as HTMLElement)

    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2024-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-12-31' },
    })

    const runButton = screen.getByRole('button', { name: /Run comparison/i })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(await screen.findByText('Match 1 row')).toBeInTheDocument()
    expect(
      screen.getByText('Check these rows before you use this result.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Save this comparison/i })
    ).toBeDisabled()
    expect(
      screen.getByText('Match all rows before you save.')
    ).toBeInTheDocument()
    expect(saveMutate).not.toHaveBeenCalled()
  })

  it('reruns with lease-scoped charges after matching review rows', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/leases', ({ request }) => {
        const skip = Number(new URL(request.url).searchParams.get('skip') ?? 0)
        if (skip === 0) {
          return HttpResponse.json({
            data: [mockLeases[0]],
            count: 2,
            has_more: true,
          })
        }
        return HttpResponse.json({
          data: [mockLeases[1]],
          count: 2,
          has_more: false,
        })
      })
    )
    const reviewResult: ComparisonResult = {
      ...sampleResult,
      tenants: [
        {
          ...sampleResult.tenants[0],
          lease_id: 'lease-1',
          tenant_name: 'Acme Corp',
          match_status: 'matched',
          match_note: null,
          actual_charged: '1100.00',
        },
        {
          ...sampleResult.tenants[0],
          lease_id: 'unmatched-name::Beta Shops',
          tenant_name: 'Beta Shops',
          match_status: 'needs_review',
          match_note: 'No lease matched this billed row.',
          capveri_correct: '0.00',
          actual_charged: '250.00',
        },
      ],
    }
    const resolvedResult: ComparisonResult = {
      ...sampleResult,
      tenants: [
        reviewResult.tenants[0],
        {
          ...reviewResult.tenants[1],
          lease_id: 'lease-2',
          match_status: 'matched',
          match_note: null,
        },
      ],
    }
    const mutate = vi.fn(
      (
        _input: unknown,
        opts?: { onSuccess?: (data: ComparisonResult) => void }
      ) => {
        opts?.onSuccess?.(
          mutate.mock.calls.length === 1 ? reviewResult : resolvedResult
        )
      }
    )
    vi.mocked(useRunComparison).mockReturnValue({
      mutate,
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useRunComparison>)
    const saveMutate = vi.fn()
    vi.mocked(useSaveComparisonRun).mockReturnValue({
      mutate: saveMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveComparisonRun>)

    render(<ComparePage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('property-select-trigger')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('property-select-trigger'))
    await waitFor(() => {
      expect(document.querySelector('[role="option"]')).toBeInTheDocument()
    })
    fireEvent.click(document.querySelector('[role="option"]') as HTMLElement)

    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2024-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-12-31' },
    })

    const runButton = screen.getByRole('button', { name: /Run comparison/i })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    expect(await screen.findByText('Match 1 row')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Lease match for Beta Shops'))
    await user.click(await screen.findByRole('option', { name: 'Beta Shops' }))
    await user.click(screen.getByRole('button', { name: /Apply matches/i }))

    expect(mutate).toHaveBeenCalledTimes(2)
    expect(mutate.mock.calls[1]?.[0]).toMatchObject({
      propertyId: 'prop-1',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      charges: [
        {
          lease_id: 'lease-1',
          tenant_name: 'Acme Corp',
          amount: '1100.00',
        },
        {
          lease_id: 'lease-2',
          tenant_name: 'Beta Shops',
          amount: '250.00',
        },
      ],
    })

    await user.click(
      screen.getByRole('button', { name: /Save this comparison/i })
    )
    expect(saveMutate.mock.calls[0]?.[0]).toMatchObject({
      propertyId: 'prop-1',
      body: {
        charges: [
          {
            lease_id: 'lease-1',
            tenant_name: 'Acme Corp',
            amount: '1100.00',
          },
          {
            lease_id: 'lease-2',
            tenant_name: 'Beta Shops',
            amount: '250.00',
          },
        ],
      },
    })
    expect(typeof saveMutate.mock.calls[0]?.[1]).toBe('object')
  })

  it('clears the shown result when the period changes after a run', async () => {
    mockRunComparison(sampleResult)

    render(<ComparePage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByTestId('property-select-trigger')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('property-select-trigger'))
    await waitFor(() => {
      expect(document.querySelector('[role="option"]')).toBeInTheDocument()
    })
    fireEvent.click(document.querySelector('[role="option"]') as HTMLElement)

    fireEvent.change(screen.getByLabelText('Period start'), {
      target: { value: '2024-01-01' },
    })
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-12-31' },
    })

    const runButton = screen.getByRole('button', { name: /Run comparison/i })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)

    await waitFor(() => {
      expect(screen.getByTestId('comparison-summary')).toBeInTheDocument()
    })

    // Editing the period must drop the stale result so it cannot be saved
    // against a period it was not computed for.
    fireEvent.change(screen.getByLabelText('Period end'), {
      target: { value: '2024-06-30' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('comparison-summary')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /Save this comparison/i })
    ).not.toBeInTheDocument()
  })

  it('surfaces a retryable error when the property list fails to load', async () => {
    server.use(
      http.get('*/api/v1/properties', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 })
      )
    )

    render(<ComparePage />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/We couldn't load your properties/i)
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /Try again/i })
    ).toBeInTheDocument()
    // The empty property select must not render in the error state.
    expect(
      screen.queryByTestId('property-select-trigger')
    ).not.toBeInTheDocument()
  })
})
