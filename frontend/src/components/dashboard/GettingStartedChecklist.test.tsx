/**
 * Tests for GettingStartedChecklist component
 *
 * Following test minimalism: Test checklist logic and completion tracking.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import {
  GettingStartedChecklist,
  type ChecklistItem,
} from './GettingStartedChecklist'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

const mockItems: ChecklistItem[] = [
  {
    id: 'property',
    title: 'Add your first property',
    description: 'Create a property to start',
    completed: true,
    href: '/properties/new',
  },
  {
    id: 'unit',
    title: 'Add units',
    description: 'Add tenant spaces',
    completed: false,
    href: '/properties',
  },
  {
    id: 'import',
    title: 'Upload GL',
    description: 'Import data',
    completed: false,
    href: '/ingestion',
  },
]

describe('GettingStartedChecklist', () => {
  it('renders checklist title and description', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText('Start here')).toBeInTheDocument()
    expect(
      screen.getByText(/Start with the sample. Then check your own building./i)
    ).toBeInTheDocument()
  })

  it('displays completion progress correctly', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText('1 of 3 completed')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('renders all checklist items', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText('Add your first property')).toBeInTheDocument()
    expect(screen.getByText('Add units')).toBeInTheDocument()
    expect(screen.getByText('Upload GL')).toBeInTheDocument()
  })

  it('shows completed items with check icon', () => {
    const { container } = render(
      <GettingStartedChecklist items={mockItems} />,
      { wrapper: RouterWrapper }
    )

    // Completed item should have strikethrough
    const completedTitle = screen.getByText('Add your first property')
    expect(completedTitle).toHaveClass('line-through')
  })

  it('shows start button for next incomplete item', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    const startButton = screen.getByRole('link', { name: /Start/i })
    expect(startButton).toBeInTheDocument()
    expect(startButton).toHaveAttribute('href', '/properties')
  })

  it('renders dismiss button when onDismiss provided', () => {
    const handleDismiss = vi.fn()

    render(
      <GettingStartedChecklist items={mockItems} onDismiss={handleDismiss} />,
      { wrapper: RouterWrapper }
    )

    expect(screen.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button clicked', async () => {
    const user = userEvent.setup()
    const handleDismiss = vi.fn()

    render(
      <GettingStartedChecklist items={mockItems} onDismiss={handleDismiss} />,
      { wrapper: RouterWrapper }
    )

    await user.click(screen.getByRole('button', { name: /Dismiss/i }))
    expect(handleDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render dismiss button when onDismiss not provided', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    expect(
      screen.queryByRole('button', { name: /Dismiss/i })
    ).not.toBeInTheDocument()
  })

  it('uses default items when no items provided', () => {
    render(<GettingStartedChecklist />, { wrapper: RouterWrapper })

    // Should have default 4 items
    expect(screen.getByText('0 of 4 completed')).toBeInTheDocument()
  })

  it('does not render a setup-call affordance in the activation checklist', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    expect(
      screen.queryByRole('link', { name: /talk to a person/i })
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/setup call/i)).not.toBeInTheDocument()
  })

  it('renders checklist steps as an ordered list with correct item count', () => {
    render(<GettingStartedChecklist items={mockItems} />, {
      wrapper: RouterWrapper,
    })

    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(mockItems.length)
  })

  it('counts only the contiguous completed prefix, not out-of-order completions', () => {
    // Property done, units NOT done, but GL + import completed out of order.
    // The checklist must not claim a later step is done while an earlier step
    // is still open — it should report the contiguous prefix (1 of 3) and keep
    // the gapped completions visually incomplete.
    const outOfOrder: ChecklistItem[] = [
      { ...mockItems[0], completed: true },
      { ...mockItems[1], completed: false },
      { ...mockItems[2], completed: true },
    ]

    render(<GettingStartedChecklist items={outOfOrder} />, {
      wrapper: RouterWrapper,
    })

    expect(screen.getByText('1 of 3 completed')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
    // The out-of-order completed item (Upload GL) must NOT show as done.
    expect(screen.getByText('Upload GL')).not.toHaveClass('line-through')
    // Next action points at the first incomplete step (units).
    expect(screen.getByRole('link', { name: /Start/i })).toHaveAttribute(
      'href',
      '/properties'
    )
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <GettingStartedChecklist items={mockItems} className="custom-class" />,
      { wrapper: RouterWrapper }
    )

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})
