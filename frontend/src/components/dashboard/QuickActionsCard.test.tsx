/**
 * Tests for QuickActionsCard component
 *
 * Following test minimalism: Test action buttons and navigation.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QuickActionsCard } from './QuickActionsCard'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('QuickActionsCard', () => {
  it('renders card title', () => {
    render(<QuickActionsCard tier="paid" />, { wrapper: RouterWrapper })

    expect(screen.getByText('Quick Actions')).toBeInTheDocument()
  })

  it('renders paid tier actions', () => {
    render(<QuickActionsCard tier="paid" />, { wrapper: RouterWrapper })

    expect(screen.getByText('Add Property')).toBeInTheDocument()
    expect(screen.getByText('Upload GL')).toBeInTheDocument()
    expect(screen.getByText('Reconcile')).toBeInTheDocument()
    expect(screen.getByText('Portfolio')).toBeInTheDocument()
  })

  it('renders paid tier action links with correct hrefs', () => {
    render(<QuickActionsCard tier="paid" />, { wrapper: RouterWrapper })

    const addPropertyLink = screen.getByRole('link', { name: /Add Property/i })
    expect(addPropertyLink).toHaveAttribute('href', '/properties/new')

    const uploadLink = screen.getByRole('link', { name: /Upload GL/i })
    expect(uploadLink).toHaveAttribute('href', '/ingestion')

    const reconcileLink = screen.getByRole('link', { name: /Reconcile/i })
    expect(reconcileLink).toHaveAttribute('href', '/reconciliations')

    const portfolioLink = screen.getByRole('link', { name: /Portfolio/i })
    expect(portfolioLink).toHaveAttribute('href', '/portfolio')
  })

  it('renders free tier actions', () => {
    render(<QuickActionsCard tier="free" />, { wrapper: RouterWrapper })

    expect(screen.getByText('Run reconciliation')).toBeInTheDocument()
    const pricingLink = screen.getByRole('link', { name: /View Pricing/i })
    expect(pricingLink).toHaveAttribute('href', '/pricing')
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <QuickActionsCard tier="paid" className="custom-class" />,
      { wrapper: RouterWrapper }
    )

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})
