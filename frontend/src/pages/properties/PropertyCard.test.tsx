import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyCard } from './PropertyCard'
import type { Property } from '@/api/client'

const mockProperty: Property = {
  id: 'prop-123',
  name: 'Test Plaza',
  address_line1: '123 Main St',
  address_line2: 'Suite 100',
  city: 'San Francisco',
  state: 'CA',
  postal_code: '94105',
  total_rentable_sqft: '10000',
  total_usable_sqft: '8500',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  organization_id: 'org-123',
}

describe('PropertyCard', () => {
  it('renders property information', () => {
    render(<PropertyCard property={mockProperty} />)

    expect(screen.getByText('Test Plaza')).toBeInTheDocument()
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    expect(screen.getByText(/10,000/)).toBeInTheDocument() // Formatted rentable sqft
    expect(screen.getByText(/8,500/)).toBeInTheDocument() // Formatted usable sqft
  })

  it('does not render raw UUID (F-285)', () => {
    render(<PropertyCard property={mockProperty} />)

    // The truncated UUID line must not appear; it has no user value and leaks internals
    expect(screen.queryByText(/ID:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/prop-123/)).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<PropertyCard property={mockProperty} onClick={onClick} />)

    const card = screen.getByRole('button')
    await user.click(card)

    expect(onClick).toHaveBeenCalledWith(mockProperty)
  })

  it('calls onClick when Enter key is pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<PropertyCard property={mockProperty} onClick={onClick} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard('{Enter}')

    expect(onClick).toHaveBeenCalledWith(mockProperty)
  })

  it('calls onClick when Space key is pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<PropertyCard property={mockProperty} onClick={onClick} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard(' ')

    expect(onClick).toHaveBeenCalledWith(mockProperty)
  })

  it('does not crash when onClick is undefined', async () => {
    const user = userEvent.setup()

    render(<PropertyCard property={mockProperty} />)

    const card = screen.getByRole('button')
    await user.click(card)

    // Should not throw error
    expect(card).toBeInTheDocument()
  })

  it('does not crash when onClick is undefined and Enter pressed', async () => {
    const user = userEvent.setup()

    render(<PropertyCard property={mockProperty} />)

    const card = screen.getByRole('button')
    card.focus()
    await user.keyboard('{Enter}')

    // Should not throw error
    expect(card).toBeInTheDocument()
  })

  it('formats invalid square footage gracefully', () => {
    const propertyWithInvalidSqft: Property = {
      ...mockProperty,
      total_rentable_sqft: 'invalid',
      total_usable_sqft: 'not-a-number',
    }

    render(<PropertyCard property={propertyWithInvalidSqft} />)

    expect(screen.getByText(/invalid/)).toBeInTheDocument()
    expect(screen.getByText(/not-a-number/)).toBeInTheDocument()
  })

  it('handles missing address fields', () => {
    const propertyWithPartialAddress: Property = {
      ...mockProperty,
      address_line2: null,
      postal_code: null,
    }

    render(<PropertyCard property={propertyWithPartialAddress} />)

    // Should still render with available fields
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument()
    expect(screen.getByText(/San Francisco/)).toBeInTheDocument()
  })

  it('formats created date correctly', () => {
    render(<PropertyCard property={mockProperty} />)

    // Date should be formatted as "Jan 15, 2024" or similar
    expect(screen.getByText(/Created/)).toBeInTheDocument()
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
  })
})
