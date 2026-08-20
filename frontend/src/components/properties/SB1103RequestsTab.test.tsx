/**
 * SB1103RequestsTab Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SB1103RequestsTab } from './SB1103RequestsTab'
import * as hooks from '@/api/hooks'

// SB1103RequestDialog triggers its own hook calls; stub it out
vi.mock('./SB1103RequestDialog', () => ({
  SB1103RequestDialog: () => null,
}))

// SB1103DeadlineBadge is a pure display component; stub to avoid date math
vi.mock('./SB1103DeadlineBadge', () => ({
  SB1103DeadlineBadge: () => null,
}))

// window.matchMedia is not available in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('SB1103RequestsTab', () => {
  beforeEach(() => {
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      error: null,
      isPaused: false,
      refetch: vi.fn(),
    } as never)
    vi.spyOn(hooks, 'useUpdateSB1103Request').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useExportSB1103Request').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders without crashing given empty data', () => {
    renderWithProviders(
      <SB1103RequestsTab propertyId="prop-123" propertyState="CA" />
    )
    expect(screen.getByText('SB 1103 Compliance Requests')).toBeInTheDocument()
    expect(
      screen.getByText(/No SB 1103 requests logged yet/i)
    ).toBeInTheDocument()
  })
})

describe('SB1103RequestsTab - offline / paused', () => {
  it('shows offline notice and Try again when query is paused, hides misleading empty copy', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.spyOn(hooks, 'useSB1103Requests').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch,
    } as never)
    vi.spyOn(hooks, 'useUpdateSB1103Request').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useExportSB1103Request').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    renderWithProviders(
      <SB1103RequestsTab propertyId="prop-123" propertyState="CA" />
    )

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    const tryAgainBtn = screen.getByRole('button', { name: /try again/i })
    expect(tryAgainBtn).toBeInTheDocument()
    await user.click(tryAgainBtn)
    expect(refetch).toHaveBeenCalled()
    expect(
      screen.queryByText(/No SB 1103 requests logged yet/i)
    ).not.toBeInTheDocument()
  })
})
