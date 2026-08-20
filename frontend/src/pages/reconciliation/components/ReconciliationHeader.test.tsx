/**
 * Tests for ReconciliationHeader component.
 *
 * Validates header rendering, stat cards, currency formatting, and status badges.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReconciliationHeader } from './ReconciliationHeader'
import type { Property } from '@/api/client'

const mockProperty: Property = {
  id: 'prop-123',
  name: 'Sunset Plaza',
  organization_id: 'org-1',
  address: '456 Main St',
  city: 'Los Angeles',
  state: 'CA',
  zip_code: '90001',
  property_type: 'Retail',
  total_square_feet: 50000,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

describe('ReconciliationHeader', () => {
  it('displays property name in stat card', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={false}
      />
    )

    expect(screen.getByText('Property')).toBeInTheDocument()
    // Property name appears in stat card
    expect(screen.getByText('Sunset Plaza')).toBeInTheDocument()
  })

  it('displays tenant count in stat card', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={false}
      />
    )

    expect(screen.getByText('Tenants')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('formats tenant billable amount as currency', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={false}
      />
    )

    expect(screen.getByText('Tenant Billable')).toBeInTheDocument()
    expect(screen.getByText('$125,000.50')).toBeInTheDocument()
  })

  it('displays "Draft" badge when not finalized', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={false}
      />
    )

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.queryByText('Finalized')).not.toBeInTheDocument()
  })

  it('displays "Finalized" badge when finalized', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={true}
      />
    )

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Finalized')).toBeInTheDocument()
    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
  })

  it('handles zero tenants', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={0}
        totalRecovery={0}
        isFinalized={false}
      />
    )

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('handles zero tenant billable amount', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={5}
        totalRecovery={0}
        isFinalized={false}
      />
    )

    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('handles large tenant billable amounts with proper formatting', () => {
    render(
      <ReconciliationHeader
        property={mockProperty}
        year="2024"
        totalTenants={50}
        totalRecovery={1234567.89}
        isFinalized={false}
      />
    )

    expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
  })

  it('shows a long property name in full instead of clipping it (F-294)', () => {
    // A 22-char name was previously clipped to "Test Plaza Sho…" in the
    // fixed-width stat card. The property value now wraps to two lines.
    const longName = 'Test Plaza Shopping Ctr'
    render(
      <ReconciliationHeader
        property={{ ...mockProperty, name: longName }}
        year="2024"
        totalTenants={15}
        totalRecovery={125000.5}
        isFinalized={false}
      />
    )

    const nameEl = screen.getByText(longName)
    // Full name present and given a wrapping (non-truncate) presentation.
    expect(nameEl).toBeInTheDocument()
    expect(nameEl).toHaveClass('line-clamp-2')
    expect(nameEl).not.toHaveClass('truncate')
    // title tooltip still carries the full string as a fallback.
    expect(nameEl).toHaveAttribute('title', longName)
  })

  it('renders all four stat cards', () => {
    const { container } = render(
      <ReconciliationHeader
        property={mockProperty}
        year="2023"
        totalTenants={10}
        totalRecovery={50000}
        isFinalized={true}
      />
    )

    // Should have 4 stat cards: Property, Tenants, Tenant Billable, Status
    const statCards = container.querySelectorAll('.rounded-lg.border.bg-card')
    expect(statCards.length).toBe(4)
  })
})
