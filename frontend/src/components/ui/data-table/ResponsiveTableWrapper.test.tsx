/**
 * Tests for ResponsiveTableWrapper component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResponsiveTableWrapper } from './ResponsiveTableWrapper'

// Mock useViewport hook
vi.mock('@/hooks/useViewport', () => ({
  useViewport: vi.fn(),
}))

import { useViewport } from '@/hooks/useViewport'

describe('ResponsiveTableWrapper', () => {
  const mockTable = <div data-testid="table-content">Table View</div>
  const mockCards = (
    <>
      <div data-testid="card-1">Card 1</div>
      <div data-testid="card-2">Card 2</div>
    </>
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders table view on desktop', () => {
    vi.mocked(useViewport).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isLaptop: true,
      isDesktop: false,
      size: 'laptop',
      width: 1024,
      height: 768,
      isTouch: false,
    })

    render(<ResponsiveTableWrapper table={mockTable} mobileCards={mockCards} />)

    expect(screen.getByTestId('desktop-table-view')).toBeInTheDocument()
    expect(screen.getByTestId('table-content')).toBeInTheDocument()
    expect(screen.queryByTestId('mobile-cards-view')).not.toBeInTheDocument()
  })

  it('renders card view on mobile', () => {
    vi.mocked(useViewport).mockReturnValue({
      isMobile: true,
      isTablet: false,
      isLaptop: false,
      isDesktop: false,
      size: 'mobile',
      width: 375,
      height: 667,
      isTouch: true,
    })

    render(<ResponsiveTableWrapper table={mockTable} mobileCards={mockCards} />)

    expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
    expect(screen.getByTestId('card-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-2')).toBeInTheDocument()
    expect(screen.queryByTestId('desktop-table-view')).not.toBeInTheDocument()
  })

  it('respects forceMobile prop', () => {
    vi.mocked(useViewport).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isLaptop: true,
      isDesktop: false,
      size: 'laptop',
      width: 1024,
      height: 768,
      isTouch: false,
    })

    render(
      <ResponsiveTableWrapper
        table={mockTable}
        mobileCards={mockCards}
        forceMobile={true}
      />
    )

    expect(screen.getByTestId('mobile-cards-view')).toBeInTheDocument()
    expect(screen.queryByTestId('desktop-table-view')).not.toBeInTheDocument()
  })

  it('applies custom className', () => {
    vi.mocked(useViewport).mockReturnValue({
      isMobile: false,
      isTablet: false,
      isLaptop: true,
      isDesktop: false,
      size: 'laptop',
      width: 1024,
      height: 768,
      isTouch: false,
    })

    const { container } = render(
      <ResponsiveTableWrapper
        table={mockTable}
        mobileCards={mockCards}
        className="custom-class"
      />
    )

    expect(container.firstChild).toHaveClass('w-full', 'custom-class')
  })
})
