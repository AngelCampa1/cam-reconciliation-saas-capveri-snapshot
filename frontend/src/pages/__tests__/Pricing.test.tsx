import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { PRICING_FAQS, PricingPage } from '../Pricing'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}))

function renderPricing() {
  return render(
    <MemoryRouter>
      <PricingPage />
    </MemoryRouter>
  )
}

describe('PricingPage', () => {
  it('renders the Reconcile unit-count pricing heading', () => {
    renderPricing()
    expect(
      screen.getByRole('heading', {
        name: /price reconcile by unit count/i,
      })
    ).toBeDefined()
  })

  it('renders all faq questions', () => {
    renderPricing()
    PRICING_FAQS.forEach((faq) => {
      expect(screen.getByText(faq.question)).toBeDefined()
    })
  })

  it('renders faq answers in details elements', () => {
    renderPricing()
    const details = document.querySelectorAll('details')
    expect(details.length).toBe(PRICING_FAQS.length)
  })

  it('renders 80OFF Reconcile price with list-price framing', () => {
    const { container } = renderPricing()
    expect(screen.getAllByText(/\$998\/year/i).length).toBeGreaterThan(0)
    expect(screen.getByText('$4,990/year')).toHaveClass('line-through')
    expect(screen.getAllByText(/26-150 units/i).length).toBeGreaterThan(0)
    expect(container.textContent).toMatch(/Limited.*offer/i)
    expect(container.textContent).not.toContain('redemptions only')
    expect(container.textContent).toContain('80% off the first year')
  })

  it('shows the free trial badge without a contact sales wall', () => {
    renderPricing()
    expect(
      screen.getByText(/see your yearly price before billing/i)
    ).toBeDefined()
    expect(screen.queryByRole('link', { name: /contact sales/i })).toBeNull()
    expect(
      screen.getAllByRole('link', { name: /contact support/i }).length
    ).toBeGreaterThan(0)
  })

  it('shows the money-back guarantee before signup', () => {
    renderPricing()
    expect(screen.getByText('30-day money-back guarantee')).toBeDefined()
    expect(
      screen.getAllByText(/refund from billing within 30 days/i).length
    ).toBeGreaterThan(0)
  })

  it('shows start free trial links', () => {
    renderPricing()
    expect(
      screen.getAllByRole('link', { name: /start free trial/i }).length
    ).toBeGreaterThan(0)
  })
})
