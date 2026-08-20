import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { BillingWarningBanner } from './BillingWarningBanner'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('BillingWarningBanner', () => {
  it('does not render when usage is within the covered unit count', () => {
    const { container } = render(
      <BillingWarningBanner unitCount={50} coveredUnitCount={50} />,
      { wrapper: RouterWrapper }
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the unit overage warning when usage exceeds the covered units', () => {
    render(<BillingWarningBanner unitCount={120} coveredUnitCount={50} />, {
      wrapper: RouterWrapper,
    })

    expect(
      screen.getByRole('heading', { name: /rentable unit limit exceeded/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/you are tracking/i)).toHaveTextContent(
      'You are tracking 120 rentable units but your current subscription covers 50.'
    )
    expect(screen.getByText(/update billing to cover/i)).toHaveTextContent(
      'Update billing to cover 70 additional rentable units and avoid service disruption.'
    )
  })

  it('uses singular wording for a one-unit overage', () => {
    render(<BillingWarningBanner unitCount={51} coveredUnitCount={50} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText(/update billing to cover/i)).toHaveTextContent(
      'Update billing to cover 1 additional rentable unit and avoid service disruption.'
    )
  })

  it('links to billing settings', () => {
    render(<BillingWarningBanner unitCount={60} coveredUnitCount={50} />, {
      wrapper: RouterWrapper,
    })

    expect(
      screen.getByRole('link', { name: /update billing/i })
    ).toHaveAttribute('href', '/settings/billing')
  })
})
