import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LeakageSummaryCard } from './LeakageSummaryCard'

vi.mock('@/api/client', () => ({
  getSession: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
}))

describe('LeakageSummaryCard', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  const renderCard = (propertyId?: string) =>
    render(
      <MemoryRouter>
        <LeakageSummaryCard propertyId={propertyId} />
      </MemoryRouter>
    )

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('shows card skeleton while loading instead of spinner', async () => {
    fetchSpy.mockImplementation(() => new Promise(() => {})) // never resolves

    renderCard('prop-123')

    await act(async () => {
      await Promise.resolve()
    })

    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.getByTestId('skeleton-card')).toBeInTheDocument()
  })

  it('renders under-bill card when leakage > 0', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        has_reconciliation_data: true,
        has_billing_data: true,
        leakage: 34200,
        leakage_pct: 12.5,
        capveri_calculated: 274200,
        actual_billed: 240000,
      }),
    } as Response)

    renderCard('prop-123')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText(/under-bill to fix/i)).toBeInTheDocument()
    expect(screen.getByText(/34,200/)).toBeInTheDocument()
    expect(screen.getByText(/12\.5%/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /view issue details/i })
    ).toHaveAttribute('href', '/properties/prop-123/reconciliations')
  })

  it('renders overbilling card when leakage < 0', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        has_reconciliation_data: true,
        has_billing_data: true,
        leakage: -71000,
        leakage_pct: -22.3,
        capveri_calculated: 247000,
        actual_billed: 318000,
      }),
    } as Response)

    renderCard('prop-123')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText(/over-bill to fix/i)).toBeInTheDocument()
    expect(screen.getByText(/71,000/)).toBeInTheDocument()
    expect(screen.getByText(/22\.3%/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /view overbilling details/i })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /view issue details/i })
    ).toHaveAttribute('href', '/properties/prop-123/reconciliations')
  })

  it('returns null when leakage === 0', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        has_reconciliation_data: true,
        has_billing_data: true,
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 240000,
        actual_billed: 240000,
      }),
    } as Response)

    const { container } = renderCard('prop-123')

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.innerHTML).toBe('')
  })

  it('returns null when no propertyId provided', async () => {
    const { container } = renderCard()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(container.innerHTML).toBe('')
  })
})
