/**
 * Tests for PoolPreview component.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PoolPreview } from './PoolPreview'
import type { PoolStructureNode } from '@/types'

describe('PoolPreview', () => {
  it('renders pool structure with parent and children', () => {
    const structure = {
      pools: [
        {
          name: 'Utilities',
          gross_up_enabled: true,
          children: [
            { name: 'Electric', gross_up_enabled: true, children: [] },
            { name: 'Water', gross_up_enabled: false, children: [] },
          ],
        } as PoolStructureNode,
        {
          name: 'Taxes',
          gross_up_enabled: false,
          children: [],
        } as PoolStructureNode,
      ],
    }

    render(<PoolPreview structure={structure} />)

    // Check parent pools
    expect(screen.getByText('Utilities')).toBeInTheDocument()
    expect(screen.getByText('Taxes')).toBeInTheDocument()

    // Check child pools
    expect(screen.getByText('Electric')).toBeInTheDocument()
    expect(screen.getByText('Water')).toBeInTheDocument()

    // Check pool count
    expect(
      screen.getByText(/2 parent pools, 4 total pools/)
    ).toBeInTheDocument()
  })

  it('shows gross-up badges for enabled pools', () => {
    const structure = {
      pools: [
        {
          name: 'Utilities',
          gross_up_enabled: true,
          children: [],
        } as PoolStructureNode,
      ],
    }

    render(<PoolPreview structure={structure} />)

    expect(screen.getByText('Gross-up')).toBeInTheDocument()
  })

  it('shows fixed badges for non-gross-up pools', () => {
    const structure = {
      pools: [
        {
          name: 'Taxes',
          gross_up_enabled: false,
          children: [],
        } as PoolStructureNode,
      ],
    }

    render(<PoolPreview structure={structure} />)

    expect(screen.getByText('Fixed')).toBeInTheDocument()
  })

  it('handles empty pool structure', () => {
    const structure = { pools: [] }

    render(<PoolPreview structure={structure} />)

    expect(screen.getByText('No pools defined.')).toBeInTheDocument()
  })
})
