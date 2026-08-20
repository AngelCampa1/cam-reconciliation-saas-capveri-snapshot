import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { PricingTeaser } from './PricingTeaser'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('PricingTeaser', () => {
  it('renders the Reconcile unit pricing headline', () => {
    render(<PricingTeaser />, { wrapper: RouterWrapper })

    expect(
      screen.getByText(/price reconcile by unit count/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/30-day free trial/i)).toBeInTheDocument()
  })

  it('shows the launch price and annual unit pricing note', () => {
    const { container } = render(<PricingTeaser />, { wrapper: RouterWrapper })

    expect(screen.getAllByText(/\$998/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\$4,990/i).length).toBeGreaterThan(0)
    expect(container.textContent).toContain('Limited time offer')
    expect(container.textContent).not.toContain('redemptions only')
    expect(container.textContent).toContain('after the first year')
    expect(
      screen.getByText(/scales by rentable unit count/i)
    ).toBeInTheDocument()
  })

  it('renders the primary trial and full pricing links', () => {
    render(<PricingTeaser />, { wrapper: RouterWrapper })

    const trialLinks = screen.getAllByRole('link', {
      name: /start free trial/i,
    })
    expect(trialLinks).toHaveLength(1)
    for (const link of trialLinks) {
      expect(link).toHaveAttribute(
        'href',
        '/auth/register?plan=reconcile&units=25'
      )
    }
    expect(
      screen.getByRole('link', { name: /see full pricing/i })
    ).toHaveAttribute('href', '/pricing')
  })
})
