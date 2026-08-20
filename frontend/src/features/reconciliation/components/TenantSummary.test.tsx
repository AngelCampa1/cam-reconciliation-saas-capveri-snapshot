/**
 * Tests for TenantSummary and TenantRow components.
 *
 * Validates tenant summary display, filtering, and totals.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  TenantRow,
  TenantSummary,
  type TenantSummaryData,
} from './TenantSummary'

const mockTenants: TenantSummaryData[] = [
  {
    id: 'tenant-1',
    name: 'Acme Corp',
    proRataShare: 0.25,
    totalBillable: 50000,
    priorYearTotal: 48000,
  },
  {
    id: 'tenant-2',
    name: 'TechStart Inc',
    proRataShare: 0.35,
    totalBillable: 70000,
    priorYearTotal: 75000,
  },
  {
    id: 'tenant-3',
    name: 'Global Services',
    proRataShare: 0.4,
    totalBillable: 80000,
  },
]

describe('TenantRow', () => {
  it('renders tenant name, pro-rata share, and total billable', () => {
    render(
      <TenantRow tenant={mockTenants[0]} isSelected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('25.00%')).toBeInTheDocument()
    expect(screen.getByText('$50,000.00')).toBeInTheDocument()
  })

  it('shows positive variance when total increased from prior year', () => {
    render(
      <TenantRow tenant={mockTenants[0]} isSelected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText(/\+\$2,000\.00/)).toBeInTheDocument()
    expect(screen.getByText(/\+4\.17%/)).toBeInTheDocument()
  })

  it('shows negative variance when total decreased from prior year', () => {
    render(
      <TenantRow tenant={mockTenants[1]} isSelected={false} onClick={vi.fn()} />
    )

    expect(screen.getByText(/-\$5,000\.00/)).toBeInTheDocument()
    expect(screen.getByText(/-6\.67%/)).toBeInTheDocument()
  })

  it('does not show variance when prior year data is missing', () => {
    render(
      <TenantRow tenant={mockTenants[2]} isSelected={false} onClick={vi.fn()} />
    )

    expect(screen.queryByText(/\$/)).toHaveTextContent('$80,000.00')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <TenantRow tenant={mockTenants[0]} isSelected={false} onClick={onClick} />
    )

    const button = screen.getByRole('button')
    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows selected state styling', () => {
    render(
      <TenantRow tenant={mockTenants[0]} isSelected={true} onClick={vi.fn()} />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-accent', 'border-primary')
  })
})

describe('TenantSummary', () => {
  it('renders all tenants', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
    expect(screen.getByText('Global Services')).toBeInTheDocument()
  })

  it('calculates and displays grand total', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(screen.getByText('Grand Total')).toBeInTheDocument()
    expect(screen.getByText('$200,000.00')).toBeInTheDocument()
  })

  it('shows grand total variance when prior year data available', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    // Grand variance: (50000 + 70000 + 80000) - (48000 + 75000 + 0) = 77000
    // Note: tenant-3 has no prior year, so it's excluded from prior total
    // Actual: 200000 - 123000 = 77000
    expect(screen.getByText(/\+\$77,000\.00/)).toBeInTheDocument()
  })

  it('calls onTenantSelect when tenant clicked', async () => {
    const user = userEvent.setup()
    const onTenantSelect = vi.fn()

    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={onTenantSelect}
        selectedTenantId={null}
      />
    )

    const tenantButton = screen.getByText('Acme Corp').closest('button')
    if (tenantButton) {
      await user.click(tenantButton)
    }

    expect(onTenantSelect).toHaveBeenCalledWith('tenant-1')
  })

  it('shows clear filter button when tenant selected', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId="tenant-1"
      />
    )

    expect(screen.getByLabelText('Clear filter')).toBeInTheDocument()
  })

  it('does not show clear filter button when no tenant selected', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(screen.queryByLabelText('Clear filter')).not.toBeInTheDocument()
  })

  it('calls onTenantSelect with null when clear filter clicked', async () => {
    const user = userEvent.setup()
    const onTenantSelect = vi.fn()

    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={onTenantSelect}
        selectedTenantId="tenant-1"
      />
    )

    const clearButton = screen.getByLabelText('Clear filter')
    await user.click(clearButton)

    expect(onTenantSelect).toHaveBeenCalledWith(null)
  })

  it('shows collapse button when onToggleCollapse provided', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Collapse tenant summary')).toBeInTheDocument()
  })

  it('does not show collapse button when onToggleCollapse not provided', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(
      screen.queryByLabelText('Collapse tenant summary')
    ).not.toBeInTheDocument()
  })

  it('calls onToggleCollapse when collapse button clicked', async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()

    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
        onToggleCollapse={onToggleCollapse}
      />
    )

    const collapseButton = screen.getByLabelText('Collapse tenant summary')
    await user.click(collapseButton)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('shows collapsed view when isCollapsed is true', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
        isCollapsed={true}
        onToggleCollapse={vi.fn()}
      />
    )

    expect(screen.getByLabelText('Expand tenant summary')).toBeInTheDocument()
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument()
  })

  it('calls onToggleCollapse when expand button clicked in collapsed view', async () => {
    const user = userEvent.setup()
    const onToggleCollapse = vi.fn()

    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
        isCollapsed={true}
        onToggleCollapse={onToggleCollapse}
      />
    )

    const expandButton = screen.getByLabelText('Expand tenant summary')
    await user.click(expandButton)

    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('handles empty tenant list', () => {
    render(
      <TenantSummary
        tenants={[]}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(screen.getByText('Grand Total')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('handles tenants without prior year data', () => {
    const tenantsWithoutPriorYear: TenantSummaryData[] = [
      {
        id: 'tenant-1',
        name: 'New Tenant',
        proRataShare: 0.5,
        totalBillable: 100000,
      },
    ]

    render(
      <TenantSummary
        tenants={tenantsWithoutPriorYear}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    expect(screen.getByText('New Tenant')).toBeInTheDocument()
    expect(screen.getByText('Grand Total')).toBeInTheDocument()
    // Should not show variance section for grand total
    expect(screen.queryByText(/\+\$/)).not.toBeInTheDocument()
  })

  it('F-288: panel title is an h2 (not h3) to maintain correct heading hierarchy under the page h1', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    const heading = screen.getByRole('heading', { name: 'Tenant Filter' })
    expect(heading.tagName).toBe('H2')
  })

  it('has data-testid="tenant-summary" on the expanded outer div and shows Grand Total', () => {
    render(
      <TenantSummary
        tenants={mockTenants}
        onTenantSelect={vi.fn()}
        selectedTenantId={null}
      />
    )

    const panel = document.querySelector('[data-testid="tenant-summary"]')
    expect(panel).toBeInTheDocument()
    expect(screen.getByText('Grand Total')).toBeInTheDocument()
  })

  describe('F-289: list semantics', () => {
    it('exposes the tenant rows as a labeled list with one item per tenant', () => {
      render(
        <TenantSummary
          tenants={mockTenants}
          onTenantSelect={vi.fn()}
          selectedTenantId={null}
        />
      )

      const list = screen.getByRole('list', { name: 'Tenants' })
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(mockTenants.length)
    })

    it('gives each row button a descriptive accessible name', () => {
      render(
        <TenantSummary
          tenants={mockTenants}
          onTenantSelect={vi.fn()}
          selectedTenantId={null}
        />
      )

      // The visible content is unlabeled columns; the aria-label spells out
      // the row so a screen reader announces tenant + share + amount.
      expect(
        screen.getByRole('button', {
          name: /Acme Corp: 25\.00% pro-rata share, \$50,000\.00 billable/,
        })
      ).toBeInTheDocument()
    })

    it('reflects the active filter via aria-pressed', () => {
      render(
        <TenantSummary
          tenants={mockTenants}
          onTenantSelect={vi.fn()}
          selectedTenantId="tenant-1"
        />
      )

      expect(
        screen.getByRole('button', { name: /Acme Corp/, pressed: true })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /TechStart Inc/, pressed: false })
      ).toBeInTheDocument()
    })

    it('does NOT expose a table role (rows are single controls, not cells)', () => {
      render(
        <TenantSummary
          tenants={mockTenants}
          onTenantSelect={vi.fn()}
          selectedTenantId={null}
        />
      )

      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByRole('cell')).not.toBeInTheDocument()
    })
  })
})
