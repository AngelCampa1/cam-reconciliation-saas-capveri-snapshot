/**
 * Tests for AlertsCard component
 *
 * Following test minimalism: Test behavior with different alert states.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { AlertsCard, type AlertItem } from './AlertsCard'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

const mockAlerts: AlertItem[] = [
  {
    id: '1',
    type: 'warning',
    title: 'Overdue Reconciliation',
    description: '2 properties need reconciliation for Q4 2024',
    href: '/reconciliations',
    count: 2,
  },
  {
    id: '2',
    type: 'action',
    title: 'Review Extractions',
    description: '5 lease documents need verification',
    href: '/extractions',
    count: 5,
  },
  {
    id: '3',
    type: 'info',
    title: 'Upcoming Deadline',
    description: 'Tenant packets due next Monday',
    href: '/properties',
  },
]

describe('AlertsCard', () => {
  it('renders empty state when no alerts provided', () => {
    render(<AlertsCard alerts={[]} />, { wrapper: RouterWrapper })

    expect(screen.getByText(/All caught up!/i)).toBeInTheDocument()
    expect(screen.getByText(/No pending actions/i)).toBeInTheDocument()
  })

  it('renders alert count badge when alerts present', () => {
    render(<AlertsCard alerts={mockAlerts} />, { wrapper: RouterWrapper })

    expect(screen.getByText('3')).toBeInTheDocument() // Total count
  })

  it('renders all alert items with titles and descriptions', () => {
    render(<AlertsCard alerts={mockAlerts} />, { wrapper: RouterWrapper })

    expect(screen.getByText('Overdue Reconciliation')).toBeInTheDocument()
    expect(
      screen.getByText('2 properties need reconciliation for Q4 2024')
    ).toBeInTheDocument()

    expect(screen.getByText('Review Extractions')).toBeInTheDocument()
    expect(
      screen.getByText('5 lease documents need verification')
    ).toBeInTheDocument()

    expect(screen.getByText('Upcoming Deadline')).toBeInTheDocument()
  })

  it('renders count badges for alerts that have counts', () => {
    render(<AlertsCard alerts={mockAlerts} />, { wrapper: RouterWrapper })

    expect(screen.getByText('2')).toBeInTheDocument() // First alert count
    expect(screen.getByText('5')).toBeInTheDocument() // Second alert count
  })

  it('renders alerts as clickable links with correct hrefs', () => {
    render(<AlertsCard alerts={mockAlerts} />, { wrapper: RouterWrapper })

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/reconciliations')
    expect(links[1]).toHaveAttribute('href', '/extractions')
    expect(links[2]).toHaveAttribute('href', '/properties')
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <AlertsCard alerts={[]} className="custom-class" />,
      { wrapper: RouterWrapper }
    )

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})
