/**
 * ReconciliationStatusCard Component Tests
 *
 * Tests for the dashboard widget showing reconciliation status
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  ReconciliationStatusCard,
  type ReconciliationStatusItem,
} from './ReconciliationStatusCard'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockItems: ReconciliationStatusItem[] = [
  {
    id: '1',
    propertyId: 'prop-1',
    propertyName: 'Downtown Tower',
    status: 'draft',
    tenantName: 'Acme Corp',
    totalRecovery: 45230,
  },
  {
    id: '2',
    propertyId: 'prop-2',
    propertyName: 'Tech Plaza',
    status: 'needs_calculation',
    tenantName: 'TechStart Inc',
  },
  {
    id: '3',
    propertyId: 'prop-3',
    propertyName: 'Harbor View',
    status: 'needs_review',
    tenantName: 'Harbor LLC',
    totalRecovery: 32100,
  },
]

describe('ReconciliationStatusCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders card title', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    expect(screen.getByText('Reconciliation Status')).toBeInTheDocument()
  })

  it('displays property names', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
    expect(screen.getByText('Tech Plaza')).toBeInTheDocument()
    expect(screen.getByText('Harbor View')).toBeInTheDocument()
  })

  it('displays tenant names', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('TechStart Inc')).toBeInTheDocument()
    expect(screen.getByText('Harbor LLC')).toBeInTheDocument()
  })

  it('displays correct status badges', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Needs Reconciliation')).toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })

  it('displays correct CTA buttons', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    // Should have 2 "Review" buttons (draft and needs_review)
    const reviewButtons = screen.getAllByRole('button', { name: /review/i })
    expect(reviewButtons).toHaveLength(2)

    // Should have 1 "Run reconciliation" button (needs_calculation)
    expect(
      screen.getByRole('button', { name: /run reconciliation/i })
    ).toBeInTheDocument()
  })

  it('navigates to property reconciliation on CTA click', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    const calculateButton = screen.getByRole('button', {
      name: /run reconciliation/i,
    })
    await user.click(calculateButton)

    const defaultYear = new Date().getFullYear() - 1
    expect(mockNavigate).toHaveBeenCalledWith(
      `/properties/prop-2/reconciliations?year=${defaultYear}`
    )
  })

  it('displays "View All" link to /reconciliations', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    const viewAllLink = screen.getByRole('link', { name: /view all/i })
    expect(viewAllLink).toBeInTheDocument()
    expect(viewAllLink).toHaveAttribute('href', '/reconciliations')
  })

  it('limits display to 5 items', () => {
    const manyItems: ReconciliationStatusItem[] = [
      ...mockItems,
      {
        id: '4',
        propertyId: 'prop-4',
        propertyName: 'Property 4',
        status: 'draft',
        tenantName: 'Tenant 4',
      },
      {
        id: '5',
        propertyId: 'prop-5',
        propertyName: 'Property 5',
        status: 'draft',
        tenantName: 'Tenant 5',
      },
      {
        id: '6',
        propertyId: 'prop-6',
        propertyName: 'Property 6',
        status: 'draft',
        tenantName: 'Tenant 6',
      },
    ]

    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={manyItems} />
      </MemoryRouter>
    )

    // Should only show 5 properties
    expect(screen.getByText('Downtown Tower')).toBeInTheDocument()
    expect(screen.getByText('Property 5')).toBeInTheDocument()
    expect(screen.queryByText('Property 6')).not.toBeInTheDocument()
  })

  it('shows empty state when no items', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={[]} />
      </MemoryRouter>
    )

    expect(screen.getByText(/no pending reconciliations/i)).toBeInTheDocument()
  })

  it('displays item count badge', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('has minimum 44px touch targets on buttons', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    const buttons = screen.getAllByRole('button')
    buttons.forEach((button) => {
      expect(button).toHaveClass('min-h-[44px]')
    })
  })

  it('renders status rows as a list with correct item count', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    const list = screen.getByRole('list')
    expect(list).toBeInTheDocument()
    const listItems = screen.getAllByRole('listitem')
    // 3 status rows
    expect(listItems).toHaveLength(3)
  })

  it('uses text-warning-foreground (not text-warning) on draft and needs_review badges', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    const draftBadge = screen.getByText('Draft')
    const reviewBadge = screen.getByText('Needs Review')
    expect(draftBadge.className).toContain('text-warning-foreground')
    expect(reviewBadge.className).toContain('text-warning-foreground')
    expect(draftBadge.className).not.toContain('text-warning ')
    expect(reviewBadge.className).not.toContain('text-warning ')
  })

  it('applies custom className', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} className="custom-class" />
      </MemoryRouter>
    )

    const card = screen.getByTestId('reconciliation-status-card')
    expect(card).toHaveClass('custom-class')
  })

  it('displays formatted tenant billable amount when available', () => {
    render(
      <MemoryRouter>
        <ReconciliationStatusCard items={mockItems} />
      </MemoryRouter>
    )

    // $45,230 should be displayed for Downtown Tower
    expect(screen.getByText('$45,230.00')).toBeInTheDocument()
    // $32,100 for Harbor View
    expect(screen.getByText('$32,100.00')).toBeInTheDocument()
  })
})
