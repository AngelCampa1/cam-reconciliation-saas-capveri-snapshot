/**
 * Tests for RecentActivityCard component
 *
 * Following test minimalism: Test activity display and empty state.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentActivityCard, type ActivityItem } from './RecentActivityCard'

const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'upload',
    title: 'File uploaded',
    description: 'Yardi GL export for Q4 2024',
    timestamp: '2 hours ago',
  },
  {
    id: '2',
    type: 'reconciliation',
    title: 'Reconciliation completed',
    description: 'Downtown Tower - Q4 2024',
    timestamp: '1 day ago',
  },
  {
    id: '3',
    type: 'export',
    title: 'Tenant packets exported',
    description: '12 tenants',
    timestamp: '2 days ago',
  },
]

describe('RecentActivityCard', () => {
  it('renders empty state when no activities', () => {
    render(<RecentActivityCard activities={[]} />)

    expect(screen.getByText(/No recent activity/i)).toBeInTheDocument()
  })

  it('renders card title', () => {
    render(<RecentActivityCard activities={mockActivities} />)

    expect(screen.getByText('Recent Activity')).toBeInTheDocument()
  })

  it('renders all activity items', () => {
    render(<RecentActivityCard activities={mockActivities} />)

    expect(screen.getByText('File uploaded')).toBeInTheDocument()
    expect(screen.getByText('Reconciliation completed')).toBeInTheDocument()
    expect(screen.getByText('Tenant packets exported')).toBeInTheDocument()
  })

  it('displays activity descriptions', () => {
    render(<RecentActivityCard activities={mockActivities} />)

    expect(screen.getByText('Yardi GL export for Q4 2024')).toBeInTheDocument()
    expect(screen.getByText('Downtown Tower - Q4 2024')).toBeInTheDocument()
    expect(screen.getByText('12 tenants')).toBeInTheDocument()
  })

  it('displays activity timestamps', () => {
    render(<RecentActivityCard activities={mockActivities} />)

    expect(screen.getByText('2 hours ago')).toBeInTheDocument()
    expect(screen.getByText('1 day ago')).toBeInTheDocument()
    expect(screen.getByText('2 days ago')).toBeInTheDocument()
  })

  it('limits display to first 10 activities', () => {
    const manyActivities: ActivityItem[] = Array.from(
      { length: 15 },
      (_, i) => ({
        id: `${i}`,
        type: 'upload' as const,
        title: `Activity ${i}`,
        description: 'Description',
        timestamp: 'just now',
      })
    )

    render(<RecentActivityCard activities={manyActivities} />)

    // Should show first 10
    expect(screen.getByText('Activity 0')).toBeInTheDocument()
    expect(screen.getByText('Activity 9')).toBeInTheDocument()
    expect(screen.queryByText('Activity 10')).not.toBeInTheDocument()
  })

  it('applies custom className when provided', () => {
    const { container } = render(
      <RecentActivityCard activities={[]} className="custom-class" />
    )

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})
