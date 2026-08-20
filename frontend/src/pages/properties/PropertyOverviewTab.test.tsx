/**
 * Tests for PropertyOverviewTab
 *
 * Covers BOMA area display, property details, utility functions, and conditional rendering.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PropertyOverviewTab } from './PropertyOverviewTab'
import type { Property } from '@/api/client'

const mockProperty: Property = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Sunset Plaza',
  address_line1: '123 Main St',
  address_line2: 'Suite 100',
  city: 'Los Angeles',
  state: 'CA',
  postal_code: '90001',
  total_rentable_sqft: '50000',
  total_usable_sqft: '45000',
  common_area_sqft: '5000',
  target_occupancy: '0.95',
  organization_id: 'org-123',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-02-20T14:30:00Z',
}

describe('PropertyOverviewTab', () => {
  it('renders BOMA area information card', () => {
    render(<PropertyOverviewTab property={mockProperty} />)

    expect(screen.getByText('BOMA Area Information')).toBeInTheDocument()
    expect(screen.getByText('Total Rentable Sqft')).toBeInTheDocument()
    expect(screen.getByText('50,000')).toBeInTheDocument()
    expect(screen.getByText('Total Usable Sqft')).toBeInTheDocument()
    expect(screen.getByText('45,000')).toBeInTheDocument()
    expect(screen.getByText('Common Area Sqft')).toBeInTheDocument()
    expect(screen.getByText('5,000')).toBeInTheDocument()
  })

  it('calculates and displays load factor', () => {
    render(<PropertyOverviewTab property={mockProperty} />)

    expect(screen.getByText('Load Factor (R/U Ratio)')).toBeInTheDocument()
    // 50000 / 45000 = 1.1111, displayed to 2 decimals
    expect(screen.getByText('1.11')).toBeInTheDocument()
  })

  it('formats target occupancy as percentage', () => {
    render(<PropertyOverviewTab property={mockProperty} />)

    expect(screen.getByText('Target Occupancy')).toBeInTheDocument()
    expect(screen.getByText('95.0%')).toBeInTheDocument()
  })

  it('renders property details card', () => {
    render(<PropertyOverviewTab property={mockProperty} />)

    expect(screen.getByText('Property Details')).toBeInTheDocument()
    expect(screen.queryByText('Property ID')).not.toBeInTheDocument()
    expect(screen.queryByText('Organization ID')).not.toBeInTheDocument()
    expect(screen.getByText('Address Line 1')).toBeInTheDocument()
    expect(screen.getByText('123 Main St')).toBeInTheDocument()
    expect(screen.getByText('Address Line 2')).toBeInTheDocument()
    expect(screen.getByText('Suite 100')).toBeInTheDocument()
    expect(screen.getByText('City')).toBeInTheDocument()
    expect(screen.getByText('Los Angeles')).toBeInTheDocument()
    expect(screen.getByText('State')).toBeInTheDocument()
    expect(screen.getByText('CA')).toBeInTheDocument()
    expect(screen.getByText('Postal Code')).toBeInTheDocument()
    expect(screen.getByText('90001')).toBeInTheDocument()
  })

  it('hides address line 2 when not provided', () => {
    const propertyWithoutLine2: Property = {
      ...mockProperty,
      address_line2: null as any,
    }

    render(<PropertyOverviewTab property={propertyWithoutLine2} />)

    expect(screen.queryByText('Address Line 2')).not.toBeInTheDocument()
  })

  it('renders metadata card with formatted dates', () => {
    render(<PropertyOverviewTab property={mockProperty} />)

    expect(screen.getByText('Metadata')).toBeInTheDocument()
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument()
    expect(screen.getByText('Last Updated')).toBeInTheDocument()
    expect(screen.getByText('Feb 20, 2024')).toBeInTheDocument()
  })

  it('handles invalid square footage gracefully', () => {
    const propertyWithInvalidSqft: Property = {
      ...mockProperty,
      total_rentable_sqft: 'invalid',
    }

    render(<PropertyOverviewTab property={propertyWithInvalidSqft} />)

    expect(screen.getByText('invalid')).toBeInTheDocument()
  })

  it('handles invalid target occupancy gracefully', () => {
    const propertyWithInvalidOccupancy: Property = {
      ...mockProperty,
      target_occupancy: 'not-a-number',
    }

    render(<PropertyOverviewTab property={propertyWithInvalidOccupancy} />)

    expect(screen.getByText('not-a-number')).toBeInTheDocument()
  })

  it('shows N/A for load factor when usable sqft is zero', () => {
    const propertyWithZeroUsable: Property = {
      ...mockProperty,
      total_usable_sqft: '0',
    }

    render(<PropertyOverviewTab property={propertyWithZeroUsable} />)

    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('shows N/A for load factor when sqft values are invalid', () => {
    const propertyWithInvalidValues: Property = {
      ...mockProperty,
      total_rentable_sqft: 'abc',
      total_usable_sqft: 'xyz',
    }

    render(<PropertyOverviewTab property={propertyWithInvalidValues} />)

    expect(screen.getByText('N/A')).toBeInTheDocument()
  })
})
