import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/hooks/useTheme'
import { PricingPage } from './Pricing'

const authState = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
  }),
}))

const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <ThemeProvider>{children}</ThemeProvider>
  </BrowserRouter>
)

describe('PricingPage', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.isLoading = false
  })

  it('renders the Reconcile unit-count pricing heading', () => {
    render(<PricingPage />, { wrapper: AllProviders })

    expect(
      screen.getByRole('heading', {
        name: /price reconcile by unit count/i,
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/see your yearly price before billing/i)
    ).toBeInTheDocument()
  })

  it('shows the Reconcile launch price, list price, and unit bands without a sales wall', () => {
    const { container } = render(<PricingPage />, { wrapper: AllProviders })

    expect(screen.getAllByText(/\$998\/year/i).length).toBeGreaterThan(0)
    expect(screen.getByText('$4,990/year')).toHaveClass('line-through')
    expect(
      screen.getAllByText(/26-150 units: \$179 per extra unit\/year/i).length
    ).toBeGreaterThan(0)
    expect(container.textContent).toMatch(/Limited.*offer/i)
    expect(container.textContent).not.toContain('redemptions only')
    expect(container.textContent).toContain('80% off the first year')
    expect(screen.queryByText(/contact sales/i)).not.toBeInTheDocument()
    expect(screen.getByText(/contact support/i)).toBeInTheDocument()
  })

  it('shows the money-back guarantee before signup', () => {
    render(<PricingPage />, { wrapper: AllProviders })

    expect(screen.getByText('30-day money-back guarantee')).toBeInTheDocument()
    expect(
      screen.getAllByText(/refund from billing within 30 days/i).length
    ).toBeGreaterThan(0)
  })

  it('renders start free trial links for unauthenticated users', () => {
    render(<PricingPage />, { wrapper: AllProviders })

    const trialLinks = screen.getAllByRole('link', {
      name: /start free trial/i,
    })
    expect(trialLinks.length).toBeGreaterThanOrEqual(1)
    expect(
      trialLinks.some(
        (link) =>
          link.getAttribute('href') === '/auth/register?plan=reconcile&units=25'
      )
    ).toBe(true)
    for (const link of trialLinks) {
      expect(link).not.toHaveAttribute(
        'href',
        expect.stringContaining('checkout')
      )
    }
  })

  it('routes authenticated users to billing selection', () => {
    authState.isAuthenticated = true

    render(<PricingPage />, { wrapper: AllProviders })

    const billingLinks = screen.getAllByRole('link', {
      name: /add billing/i,
    })
    expect(billingLinks.length).toBeGreaterThanOrEqual(1)
    expect(
      billingLinks.some(
        (link) =>
          link.getAttribute('href') ===
          '/settings/billing?intent=select-plan&units=25'
      )
    ).toBe(true)
    expect(
      screen.queryByRole('link', {
        name: /start free trial/i,
      })
    ).not.toHaveAttribute('href', '/auth/register?plan=reconcile&units=25')
  })

  it('renders the faq section', () => {
    render(<PricingPage />, { wrapper: AllProviders })

    expect(
      screen.getByRole('heading', { name: /frequently asked questions/i })
    ).toBeInTheDocument()
    expect(document.querySelectorAll('details').length).toBeGreaterThan(0)
  })
})
