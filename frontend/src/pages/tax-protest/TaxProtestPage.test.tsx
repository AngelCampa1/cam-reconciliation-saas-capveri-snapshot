/**
 * Tests for TaxProtestPage
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TaxProtestPage } from './TaxProtestPage'

const mockUseDeadlines = vi.fn()
vi.mock('@/api/hooks', () => ({
  useTaxProtestDeadlines: () => mockUseDeadlines(),
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

vi.mock('@/components/layout', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

const items = [
  {
    property_id: 'p1',
    property_name: 'Harris Building',
    county: 'Harris',
    state: 'TX',
    effective_deadline: '2025-05-15',
    days_remaining: 45,
    is_past: false,
    is_configured: true,
  },
  {
    property_id: 'p2',
    property_name: 'Unconfigured Building',
    county: null,
    state: 'TX',
    effective_deadline: null,
    days_remaining: null,
    is_past: false,
    is_configured: false,
  },
]

describe('TaxProtestPage', () => {
  beforeEach(() => {
    mockUseDeadlines.mockReset()
    mockIsMobile = false
  })

  it('renders page title', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items, year: 2025 },
      isLoading: false,
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByText('Tax Protest')).toBeInTheDocument()
  })

  it('renders table with property deadlines', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items, year: 2025 },
      isLoading: false,
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByText('Harris Building')).toBeInTheDocument()
    expect(screen.getByText('Unconfigured Building')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockUseDeadlines.mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByTestId('deadlines-loading')).toBeInTheDocument()
  })

  it('shows empty state when no properties', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items: [], year: 2025 },
      isLoading: false,
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByTestId('deadlines-empty')).toBeInTheDocument()
  })

  it('shows the error state when the query errors', () => {
    mockUseDeadlines.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isPaused: false,
      refetch: vi.fn(),
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByTestId('deadlines-error')).toBeInTheDocument()
    expect(screen.getByText("Couldn't load deadlines")).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    // Must not masquerade the failure as "no properties".
    expect(screen.queryByTestId('deadlines-empty')).not.toBeInTheDocument()
  })

  it('shows an offline notice (not the empty state) when the fetch is paused', () => {
    // A paused fetch leaves isError false and data undefined; without the
    // isPaused guard the page falls through to a bare header over a void.
    mockUseDeadlines.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch: vi.fn(),
    })
    render(
      <Wrapper>
        <TaxProtestPage />
      </Wrapper>
    )
    expect(screen.getByTestId('deadlines-error')).toBeInTheDocument()
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('deadlines-empty')).not.toBeInTheDocument()
  })

  describe('mobile layout', () => {
    beforeEach(() => {
      mockIsMobile = true
    })

    it('shows mobile-cards-view with property name, county/state/deadline labels', () => {
      mockUseDeadlines.mockReturnValue({
        data: { items, year: 2025 },
        isLoading: false,
      })
      render(
        <Wrapper>
          <TaxProtestPage />
        </Wrapper>
      )

      expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
      expect(screen.getByText('Harris Building')).toBeInTheDocument()
      expect(screen.getByText('Harris')).toBeInTheDocument()
      expect(screen.getAllByText('TX').length).toBeGreaterThan(0)
      expect(screen.getByText('2025-05-15')).toBeInTheDocument()
    })

    it('renders Configure button full-width with min touch target', () => {
      mockUseDeadlines.mockReturnValue({
        data: { items, year: 2025 },
        isLoading: false,
      })
      render(
        <Wrapper>
          <TaxProtestPage />
        </Wrapper>
      )

      const configureBtns = screen.getAllByRole('link', { name: /configure/i })
      expect(configureBtns.length).toBeGreaterThan(0)
      expect(configureBtns[0].className).toMatch(/w-full/)
    })
  })
})
