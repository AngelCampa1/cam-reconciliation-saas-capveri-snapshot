/**
 * Tests for MissingMappingsWarning component.
 *
 * Validates warning banner behavior when expense pools lack GL mappings.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MissingMappingsWarning } from './MissingMappingsWarning'
import type { ExpensePool } from '@/types/expense-pool'

// Helper to create mock expense pools
const createMockPool = (id: string, name: string): ExpensePool => ({
  id,
  property_id: 'prop-1',
  name,
  pool_type: 'operating',
  is_gross_up_applicable: true,
  gross_up_target: '0.95',
  description: null,
  parent_pool_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
})

describe('MissingMappingsWarning', () => {
  it('renders nothing when all pools have mappings', () => {
    const pools = [
      createMockPool('pool-1', 'CAM'),
      createMockPool('pool-2', 'Insurance'),
    ]
    const mappingCounts = {
      'pool-1': 3,
      'pool-2': 2,
    }

    const { container } = render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders warning when some pools have 0 mappings', () => {
    const pools = [
      createMockPool('pool-1', 'CAM'),
      createMockPool('pool-2', 'Insurance'),
    ]
    const mappingCounts = {
      'pool-1': 0,
      'pool-2': 2,
    }

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Missing GL Account Mappings/i)).toBeInTheDocument()
  })

  it('displays correct count of unmapped pools', () => {
    const pools = [
      createMockPool('pool-1', 'CAM'),
      createMockPool('pool-2', 'Insurance'),
      createMockPool('pool-3', 'Taxes'),
    ]
    const mappingCounts = {
      'pool-1': 0,
      'pool-2': 0,
      'pool-3': 2,
    }

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(screen.getByText(/2 expense pool/i)).toBeInTheDocument()
  })

  it('lists pool names that are missing mappings', () => {
    const pools = [
      createMockPool('pool-1', 'Common Area Maintenance'),
      createMockPool('pool-2', 'Building Insurance'),
    ]
    const mappingCounts = {
      'pool-1': 0,
      'pool-2': 0,
    }

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(screen.getByText(/Common Area Maintenance/)).toBeInTheDocument()
    expect(screen.getByText(/Building Insurance/)).toBeInTheDocument()
  })

  it('includes button to navigate to Pools tab', async () => {
    const user = userEvent.setup()
    const onNavigateToPools = vi.fn()

    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        onNavigateToPools={onNavigateToPools}
      />
    )

    const button = screen.getByRole('button', { name: /Configure Mappings/i })
    await user.click(button)

    expect(onNavigateToPools).toHaveBeenCalled()
  })

  it('renders nothing when pools array is empty', () => {
    const { container } = render(
      <MissingMappingsWarning pools={[]} mappingCounts={{}} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('treats missing mapping counts as 0', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = {} // pool-1 not in counts = 0 mappings

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders "Show me how" button when onShowHelp provided', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        onShowHelp={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', { name: /show me how/i })
    ).toBeInTheDocument()
  })

  it('calls onShowHelp when "Show me how" button clicked', async () => {
    const user = userEvent.setup()
    const onShowHelp = vi.fn()
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        onShowHelp={onShowHelp}
      />
    )

    await user.click(screen.getByRole('button', { name: /show me how/i }))
    expect(onShowHelp).toHaveBeenCalledTimes(1)
  })

  it('does not render "Show me how" button when onShowHelp not provided', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    expect(
      screen.queryByRole('button', { name: /show me how/i })
    ).not.toBeInTheDocument()
  })

  it('uses a past-tense, informational message when finalized (F-270)', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        isFinalized
      />
    )

    // Past-tense title + body, not the alarming future-tense setup copy.
    expect(
      screen.getByText(/Some expense pools had no GL mappings/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/did not bill their costs/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/won't be allocated to tenants/i)
    ).not.toBeInTheDocument()
  })

  it('uses plural copy and lists all pools when finalized with multiple unmapped pools (F-270)', () => {
    const pools = [
      createMockPool('pool-1', 'Common Area Maintenance'),
      createMockPool('pool-2', 'Building Insurance'),
    ]
    const mappingCounts = { 'pool-1': 0, 'pool-2': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        isFinalized
      />
    )

    expect(screen.getByText(/2 expense pools had/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Common Area Maintenance, Building Insurance/)
    ).toBeInTheDocument()
  })

  it('F-288: alert title is not a heading element (no illegal h5 in document outline)', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning pools={pools} mappingCounts={mappingCounts} />
    )

    // The notice label must NOT be rendered as any heading level — it is a
    // contextual notice, not document structure. An h5 here caused an
    // illegal jump from h1 in the reconciliation workspace.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    // The text still appears visually
    expect(screen.getByText('Missing GL Account Mappings')).toBeInTheDocument()
  })

  it('hides setup actions when finalized even if callbacks provided (F-270)', () => {
    const pools = [createMockPool('pool-1', 'CAM')]
    const mappingCounts = { 'pool-1': 0 }

    render(
      <MissingMappingsWarning
        pools={pools}
        mappingCounts={mappingCounts}
        onNavigateToPools={vi.fn()}
        onShowHelp={vi.fn()}
        isFinalized
      />
    )

    // The run is locked, so the configure/help actions are pointless.
    expect(
      screen.queryByRole('button', { name: /configure mappings/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /show me how/i })
    ).not.toBeInTheDocument()
    // Still tells the reviewer which pools were left out.
    expect(screen.getByText(/Unmapped pools: CAM/)).toBeInTheDocument()
  })
})
