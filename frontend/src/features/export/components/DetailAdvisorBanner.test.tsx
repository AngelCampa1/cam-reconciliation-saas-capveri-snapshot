import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DetailAdvisorBanner } from './DetailAdvisorBanner'
import type { DetailLevelAdvisoryResponse } from '../types'

const okData: DetailLevelAdvisoryResponse = {
  total_line_items: 4,
  total_categories: 2,
  overall_severity: 'ok',
  summary: 'Statement has 4 line items across 2 categories.',
  grouping_suggestions: [],
  immaterial_items: [],
  suggested_total_lines: 4,
}

const warningData: DetailLevelAdvisoryResponse = {
  total_line_items: 21,
  total_categories: 3,
  overall_severity: 'warning',
  summary:
    'Statement has 21 line items across 3 categories. Consider grouping.',
  grouping_suggestions: [
    {
      category_name: 'Landscaping',
      current_line_count: 12,
      suggested_label: 'Landscaping',
      severity: 'warning',
      explanation:
        'You have 12 individual line items in Landscaping. Consider presenting them as a single line.',
    },
    {
      category_name: 'Repairs',
      current_line_count: 7,
      suggested_label: 'Repairs',
      severity: 'suggestion',
      explanation:
        'You have 7 individual line items in Repairs. Consider presenting them as a single line.',
    },
  ],
  immaterial_items: [],
  suggested_total_lines: 4,
}

describe('DetailAdvisorBanner', () => {
  it('renders loading skeleton when isLoading', () => {
    render(
      <DetailAdvisorBanner data={undefined} isLoading={true} isError={false} />
    )
    expect(screen.getByTestId('detail-advisor-loading')).toBeInTheDocument()
  })

  it('renders nothing on error', () => {
    const { container } = render(
      <DetailAdvisorBanner data={undefined} isLoading={false} isError={true} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when no data', () => {
    const { container } = render(
      <DetailAdvisorBanner data={undefined} isLoading={false} isError={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders summary and severity badge for ok status', () => {
    render(
      <DetailAdvisorBanner data={okData} isLoading={false} isError={false} />
    )
    expect(screen.getByTestId('detail-advisor-banner')).toBeInTheDocument()
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Good')
    expect(screen.getByTestId('advisor-summary')).toHaveTextContent(
      'Statement has 4 line items'
    )
  })

  it('renders warning severity badge', () => {
    render(
      <DetailAdvisorBanner
        data={warningData}
        isLoading={false}
        isError={false}
      />
    )
    expect(screen.getByTestId('severity-badge')).toHaveTextContent('Warning')
  })

  it('does not show expand button when no suggestions', () => {
    render(
      <DetailAdvisorBanner data={okData} isLoading={false} isError={false} />
    )
    expect(screen.queryByTestId('toggle-suggestions')).not.toBeInTheDocument()
  })

  it('expands and shows suggestions on click', async () => {
    const user = userEvent.setup()
    render(
      <DetailAdvisorBanner
        data={warningData}
        isLoading={false}
        isError={false}
      />
    )
    expect(screen.queryByTestId('suggestions-list')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('toggle-suggestions'))

    expect(screen.getByTestId('suggestions-list')).toBeInTheDocument()
    expect(screen.getByText('Landscaping')).toBeInTheDocument()
    expect(screen.getByText('12 items')).toBeInTheDocument()
    expect(screen.getByText('Repairs')).toBeInTheDocument()
    expect(
      screen.getByText(/Grouping would reduce to 4 total lines/)
    ).toBeInTheDocument()
  })

  it('gives the icon-only toggle an accessible name and expanded state', async () => {
    const user = userEvent.setup()
    render(
      <DetailAdvisorBanner
        data={warningData}
        isLoading={false}
        isError={false}
      />
    )
    // Collapsed: screen readers announce the action + collapsed state.
    const toggle = screen.getByRole('button', { name: 'Show suggestions' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    // Expanded: label and state both flip.
    const expandedToggle = screen.getByRole('button', {
      name: 'Hide suggestions',
    })
    expect(expandedToggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses suggestions on second click', async () => {
    const user = userEvent.setup()
    render(
      <DetailAdvisorBanner
        data={warningData}
        isLoading={false}
        isError={false}
      />
    )
    await user.click(screen.getByTestId('toggle-suggestions'))
    expect(screen.getByTestId('suggestions-list')).toBeInTheDocument()

    await user.click(screen.getByTestId('toggle-suggestions'))
    expect(screen.queryByTestId('suggestions-list')).not.toBeInTheDocument()
  })
})
