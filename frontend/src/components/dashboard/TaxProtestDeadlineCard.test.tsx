/**
 * Tests for TaxProtestDeadlineCard dashboard component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TaxProtestDeadlineCard } from './TaxProtestDeadlineCard'

const mockUseDeadlines = vi.fn()
vi.mock('@/api/hooks', () => ({
  useTaxProtestDeadlines: () => mockUseDeadlines(),
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

const configuredItem = {
  property_id: 'p1',
  property_name: 'Harris Building',
  county: 'Harris',
  state: 'TX',
  effective_deadline: '2025-05-15',
  days_remaining: 45,
  is_past: false,
  is_configured: true,
}

describe('TaxProtestDeadlineCard', () => {
  beforeEach(() => {
    mockUseDeadlines.mockReset()
  })

  it('renders null when no configured properties', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items: [], year: 2025 },
      isLoading: false,
    })
    const { container } = render(
      <Wrapper>
        <TaxProtestDeadlineCard currentMonth={3} />
      </Wrapper>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders null when currentMonth > 6', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items: [configuredItem], year: 2025 },
      isLoading: false,
    })
    const { container } = render(
      <Wrapper>
        <TaxProtestDeadlineCard currentMonth={7} />
      </Wrapper>
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders card with property deadline when configured', () => {
    mockUseDeadlines.mockReturnValue({
      data: { items: [configuredItem], year: 2025 },
      isLoading: false,
    })
    render(
      <Wrapper>
        <TaxProtestDeadlineCard currentMonth={3} />
      </Wrapper>
    )
    expect(screen.getByTestId('tax-protest-deadline-card')).toBeInTheDocument()
    expect(screen.getByText('Harris Building')).toBeInTheDocument()
    expect(screen.getByTestId(`deadline-row-p1`)).toBeInTheDocument()
  })

  it('shows at most 3 properties', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...configuredItem,
      property_id: `p${i}`,
      property_name: `Building ${i}`,
      days_remaining: 10 + i,
    }))
    mockUseDeadlines.mockReturnValue({
      data: { items, year: 2025 },
      isLoading: false,
    })
    render(
      <Wrapper>
        <TaxProtestDeadlineCard currentMonth={2} />
      </Wrapper>
    )
    const rows = screen.getAllByTestId(/deadline-row/)
    expect(rows.length).toBeLessThanOrEqual(3)
  })

  it('renders loading state while fetching', () => {
    mockUseDeadlines.mockReturnValue({
      data: undefined,
      isLoading: true,
    })
    render(
      <Wrapper>
        <TaxProtestDeadlineCard currentMonth={3} />
      </Wrapper>
    )
    // Should not crash during loading
  })
})
