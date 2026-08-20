import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RentRollPreview } from './RentRollPreview'
import type { RentRollPreviewResponse } from '@/api/hooks'

const preview: RentRollPreviewResponse = {
  success: true,
  source_system: 'yardi_rent_roll',
  property_metadata: {
    name: 'Market Center',
    address_line1: '100 Main St',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
  },
  units: [
    {
      unit_number: '101',
      rentable_sqft: '1250',
      usable_sqft: '1100',
      floor: 1,
      tenant_name: 'Acme Corp',
      lease_start: '2026-01-01',
      lease_end: '2026-12-31',
      base_rent: '2500',
      cam_share: '0.12',
    },
    {
      unit_number: '102',
      rentable_sqft: '900',
      usable_sqft: '850',
      floor: 1,
      tenant_name: null,
      lease_start: null,
      lease_end: null,
      base_rent: null,
      cam_share: null,
    },
  ],
  row_count: 2,
  error_count: 0,
  total_units: 2,
  occupied_units: 1,
  errors: [],
  warnings: [],
}

describe('RentRollPreview', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('renders mobile-friendly unit hierarchy alongside the table preview', () => {
    render(
      <RentRollPreview
        preview={preview}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getAllByText('Unit 101').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/1,250 RSF/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Vacant').length).toBeGreaterThan(0)
  })
})
