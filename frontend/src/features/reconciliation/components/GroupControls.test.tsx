/**
 * Tests for GroupControls component.
 *
 * Validates expand all / collapse all functionality.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupControls } from './GroupControls'

describe('GroupControls', () => {
  it('renders expand all and collapse all buttons', () => {
    render(<GroupControls onExpandAll={vi.fn()} onCollapseAll={vi.fn()} />)

    expect(screen.getByText('Expand All')).toBeInTheDocument()
    expect(screen.getByText('Collapse All')).toBeInTheDocument()
  })

  it('calls onExpandAll when expand all button clicked', async () => {
    const user = userEvent.setup()
    const onExpandAll = vi.fn()

    render(<GroupControls onExpandAll={onExpandAll} onCollapseAll={vi.fn()} />)

    const button = screen.getByText('Expand All')
    await user.click(button)

    expect(onExpandAll).toHaveBeenCalledTimes(1)
  })

  it('calls onCollapseAll when collapse all button clicked', async () => {
    const user = userEvent.setup()
    const onCollapseAll = vi.fn()

    render(
      <GroupControls onExpandAll={vi.fn()} onCollapseAll={onCollapseAll} />
    )

    const button = screen.getByText('Collapse All')
    await user.click(button)

    expect(onCollapseAll).toHaveBeenCalledTimes(1)
  })

  it('disables expand all when all groups are expanded', () => {
    render(
      <GroupControls
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        allExpanded={true}
      />
    )

    const expandButton = screen.getByText('Expand All')
    expect(expandButton).toBeDisabled()
  })

  it('disables collapse all when all groups are collapsed', () => {
    render(
      <GroupControls
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        allCollapsed={true}
      />
    )

    const collapseButton = screen.getByText('Collapse All')
    expect(collapseButton).toBeDisabled()
  })

  it('enables both buttons when groups are mixed state', () => {
    render(
      <GroupControls
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        allExpanded={false}
        allCollapsed={false}
      />
    )

    const expandButton = screen.getByText('Expand All')
    const collapseButton = screen.getByText('Collapse All')

    expect(expandButton).not.toBeDisabled()
    expect(collapseButton).not.toBeDisabled()
  })

  it('shows group count when provided', () => {
    render(
      <GroupControls
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        groupCount={5}
      />
    )

    expect(screen.getByText('5 groups')).toBeInTheDocument()
  })

  it('does not show group count when not provided', () => {
    render(<GroupControls onExpandAll={vi.fn()} onCollapseAll={vi.fn()} />)

    expect(screen.queryByText(/groups/)).not.toBeInTheDocument()
  })
})
