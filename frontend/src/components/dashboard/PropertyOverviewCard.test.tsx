/**
 * Tests for PropertyOverviewCard component
 *
 * Following test minimalism: Test property display and empty state.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import {
  PropertyOverviewCard,
  type PropertySummary,
} from './PropertyOverviewCard'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

const mockProperties: PropertySummary[] = [
  {
    id: '1',
    name: 'Downtown Tower',
    unitCount: 25,
    lastReconciliation: '2 days ago',
  },
  {
    id: '2',
    name: 'Suburban Plaza',
    unitCount: 10,
    lastReconciliation: '1 week ago',
  },
  {
    id: '3',
    name: 'Business Park North',
    unitCount: 15,
  },
]

describe('PropertyOverviewCard', () => {
  it('renders empty state when no properties', () => {
    render(<PropertyOverviewCard properties={[]} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText(/No properties yet/i)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Add Property/i })
    ).toBeInTheDocument()
  })

  it('renders "View all" link when properties exist', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    const viewAllLink = screen.getByRole('link', { name: /View all/i })
    expect(viewAllLink).toHaveAttribute('href', '/properties')
  })

  it('renders all property summaries', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
    expect(screen.getByText('Suburban Plaza')).toBeInTheDocument()
    expect(screen.getByText('Business Park North')).toBeInTheDocument()
  })

  it('displays unit counts for properties', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    // Text may be split across elements, use flexible matcher
    expect(screen.getByText(/25 units/i)).toBeInTheDocument()
    expect(screen.getByText(/10 units/i)).toBeInTheDocument()
    expect(screen.getByText(/15 units/i)).toBeInTheDocument()
  })

  it('displays last reconciliation when available', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText(/Last reconciled 2 days ago/i)).toBeInTheDocument()
    expect(screen.getByText(/Last reconciled 1 week ago/i)).toBeInTheDocument()
  })

  it('does not display reconciliation when not available', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    // Business Park North has no last reconciliation
    const businessParkText = screen.getByText('15 units')
    expect(businessParkText.textContent).toBe('15 units')
    expect(businessParkText.textContent).not.toContain('Last reconciled')
  })

  it('renders properties as clickable links with correct hrefs', () => {
    render(<PropertyOverviewCard properties={mockProperties} />, {
      wrapper: RouterWrapper,
    })

    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/properties/'))

    expect(links[0]).toHaveAttribute('href', '/properties/1')
    expect(links[1]).toHaveAttribute('href', '/properties/2')
    expect(links[2]).toHaveAttribute('href', '/properties/3')
  })

  it('limits display to first 5 properties', () => {
    const manyProperties: PropertySummary[] = Array.from(
      { length: 10 },
      (_, i) => ({
        id: `${i}`,
        name: `Property ${i}`,
        unitCount: 5,
      })
    )

    render(<PropertyOverviewCard properties={manyProperties} />, {
      wrapper: RouterWrapper,
    })

    // Should only show first 5
    expect(screen.getByText('Property 0')).toBeInTheDocument()
    expect(screen.getByText('Property 4')).toBeInTheDocument()
    expect(screen.queryByText('Property 5')).not.toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <PropertyOverviewCard properties={[]} className="custom-class" />,
      { wrapper: RouterWrapper }
    )

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})
