/**
 * Tests for TenantVarianceTable.
 *
 * Covers tenant row rendering (signed difference + direction badge), the
 * expand/collapse toggle for per-pool rows (via the toggle testid and
 * aria-expanded), and both empty states.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { TenantVariance } from '@/api/comparison'
import { TenantVarianceTable } from './TenantVarianceTable'

const overchargeTenant: TenantVariance = {
  lease_id: 'lease-1',
  tenant_name: 'Acme Corp',
  match_status: 'matched',
  match_note: null,
  capveri_correct: '1000.00',
  actual_charged: '1100.00',
  variance: '100.00',
  direction: 'overcharge',
  abs_variance: '100.00',
  variance_pct: '10',
  pool_breakdowns: [
    {
      pool_id: 'pool-1',
      pool_name: 'Utilities',
      capveri_correct: '600.00',
      actual_charged: '660.00',
      variance: '60.00',
      direction: 'overcharge',
      abs_variance: '60.00',
      variance_pct: '10',
    },
  ],
}

describe('TenantVarianceTable', () => {
  it('renders a tenant row with signed difference and direction badge', () => {
    render(<TenantVarianceTable tenants={[overchargeTenant]} />)

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('+$100.00')).toBeInTheDocument()
    expect(screen.getByText('Overcharged')).toBeInTheDocument()
    expect(screen.getByText('+10%')).toBeInTheDocument()
  })

  it('toggles pool rows open and closed via the toggle button', () => {
    render(<TenantVarianceTable tenants={[overchargeTenant]} />)

    const toggle = screen.getByTestId('toggle-pools-lease-1')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Utilities')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Utilities')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Utilities')).not.toBeInTheDocument()
  })

  it('shows a pool-level empty state when pool_breakdowns is an empty array', () => {
    const tenant: TenantVariance = {
      ...overchargeTenant,
      pool_breakdowns: [],
    }
    render(<TenantVarianceTable tenants={[tenant]} />)

    fireEvent.click(screen.getByTestId('toggle-pools-lease-1'))
    expect(
      screen.getByText('No pool-level detail for this tenant.')
    ).toBeInTheDocument()
  })

  it('renders no toggle when pool_breakdowns is null (pool mode off)', () => {
    const tenant: TenantVariance = {
      ...overchargeTenant,
      pool_breakdowns: null,
    }
    render(<TenantVarianceTable tenants={[tenant]} />)

    expect(screen.queryByTestId('toggle-pools-lease-1')).not.toBeInTheDocument()
  })

  it('shows a match review note for unmatched billed rows', () => {
    const tenant: TenantVariance = {
      ...overchargeTenant,
      lease_id: 'unmatched-name::Unknown Tenant',
      tenant_name: 'Unknown Tenant',
      match_status: 'needs_review',
      match_note: 'No lease matched this billed row.',
      pool_breakdowns: null,
    }

    render(<TenantVarianceTable tenants={[tenant]} />)

    expect(screen.getByText('Needs match')).toBeInTheDocument()
    expect(
      screen.getByText('No lease matched this billed row.')
    ).toBeInTheDocument()
  })

  it('does not show a match badge for old responses without match status', () => {
    const tenant = {
      ...overchargeTenant,
      match_status: undefined,
      match_note: undefined,
    } as unknown as TenantVariance

    render(<TenantVarianceTable tenants={[tenant]} />)

    expect(screen.queryByText('Needs match')).not.toBeInTheDocument()
  })

  it('shows the no-tenants empty state', () => {
    render(<TenantVarianceTable tenants={[]} />)
    expect(screen.getByText('No tenants to compare yet')).toBeInTheDocument()
    expect(
      screen.getByText('There are no tenants to compare for this period yet.')
    ).toBeInTheDocument()
  })
})
