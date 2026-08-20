import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Building2, Percent } from 'lucide-react'
import { StatCard } from './stat-card'

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Total Units" value="42" />)

    expect(screen.getByText('Total Units')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders without icon when icon prop is not provided', () => {
    const { container } = render(<StatCard title="Test Metric" value="100" />)

    // Should not have icon container when no icon provided
    const iconContainers = container.querySelectorAll(
      '.rounded-lg.flex.h-10.w-10'
    )
    expect(iconContainers.length).toBe(0)
  })

  it('renders with icon and color accent', () => {
    const { container } = render(
      <StatCard
        title="Total Sqft"
        value="50,000"
        icon={Building2}
        iconColor="chart-3"
      />
    )

    // Icon container should exist with colored background
    const iconContainer = container.querySelector('.rounded-lg.flex.h-10.w-10')
    expect(iconContainer).toBeInTheDocument()
    expect(iconContainer?.className).toContain('bg-[hsl(var(--chart-3))]/10')
    expect(iconContainer?.className).toContain('text-[hsl(var(--chart-3))]')
  })

  it('applies correct color classes for different iconColor variants', () => {
    const { container } = render(
      <StatCard
        title="Occupancy"
        value="95%"
        icon={Percent}
        iconColor="chart-1"
      />
    )

    const iconContainer = container.querySelector('.rounded-lg.flex.h-10.w-10')
    expect(iconContainer?.className).toContain('bg-[hsl(var(--chart-1))]/10')
    expect(iconContainer?.className).toContain('text-[hsl(var(--chart-1))]')
  })

  it('renders loading state with skeleton', () => {
    const { container } = render(
      <StatCard title="Test" value="123" isLoading={true} icon={Building2} />
    )

    // Should have animated pulse elements
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)

    // Should not show actual value when loading
    expect(screen.queryByText('123')).not.toBeInTheDocument()
  })

  it('renders a dash and caption instead of a value when isError is true', () => {
    render(<StatCard title="Unit Count" value="0" isError={true} />)

    // The misleading value must not show
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getByText("Couldn't load")).toBeInTheDocument()
    expect(
      screen.getByLabelText('Unit Count could not be loaded')
    ).toBeInTheDocument()
  })

  it('prefers the loading skeleton over the error state', () => {
    const { container } = render(
      <StatCard title="Unit Count" value="0" isLoading={true} isError={true} />
    )

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(
      0
    )
    expect(screen.queryByText("Couldn't load")).not.toBeInTheDocument()
  })

  it('applies elevated card variant and hover classes', () => {
    const { container } = render(
      <StatCard title="Test" value="42" icon={Building2} />
    )

    // Should use elevated card variant
    const card = container.querySelector('[class*="border-border-subtle"]')
    expect(card?.className).toContain('shadow-sm')
    expect(card?.className).toContain('hover:shadow-md')
  })

  it('applies fluid typography to value', () => {
    render(<StatCard title="Test" value="1,234" />)

    const value = screen.getByText('1,234')
    expect(value.className).toContain('text-fluid-2xl')
  })

  it('marks icon as aria-hidden', () => {
    const { container } = render(
      <StatCard title="Test" value="42" icon={Building2} iconColor="primary" />
    )

    // SVG icon should be aria-hidden
    const iconContainer = container.querySelector('.rounded-lg.flex.h-10.w-10')
    const icon = iconContainer?.querySelector('svg')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
  })
})
