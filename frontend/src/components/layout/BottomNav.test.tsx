/**
 * BottomNav Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav } from './BottomNav'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('BottomNav', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders all 5 navigation items', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-properties')).toBeInTheDocument()
    expect(screen.getByTestId('nav-upload')).toBeInTheDocument()
    expect(screen.getByTestId('nav-reconcile')).toBeInTheDocument()
    expect(screen.getByTestId('nav-more')).toBeInTheDocument()
  })

  it('displays correct labels', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Properties')).toBeInTheDocument()
    expect(screen.getByText('Documents')).toBeInTheDocument()
    expect(screen.getByText('Reconcile')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('navigates to correct route when item is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const dashboardButton = screen.getByTestId('nav-dashboard')
    await user.click(dashboardButton)

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
  })

  it('navigates to properties route', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const propertiesButton = screen.getByTestId('nav-properties')
    await user.click(propertiesButton)

    expect(mockNavigate).toHaveBeenCalledWith('/properties')
  })

  it('calls onMoreClick when More button is clicked', async () => {
    const user = userEvent.setup()
    const mockOnMoreClick = vi.fn()

    render(
      <MemoryRouter>
        <BottomNav onMoreClick={mockOnMoreClick} />
      </MemoryRouter>
    )

    const moreButton = screen.getByTestId('nav-more')
    await user.click(moreButton)

    expect(mockOnMoreClick).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not navigate when More is clicked without an onMoreClick handler', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const moreButton = screen.getByTestId('nav-more')
    await user.click(moreButton)

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('highlights active route', () => {
    render(
      <MemoryRouter initialEntries={['/reconciliations']}>
        <BottomNav />
      </MemoryRouter>
    )

    const reconcileButton = screen.getByTestId('nav-reconcile')
    expect(reconcileButton).toHaveAttribute('aria-current', 'page')
  })

  it('does not highlight More button as active', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <BottomNav />
      </MemoryRouter>
    )

    const moreButton = screen.getByTestId('nav-more')
    expect(moreButton).not.toHaveAttribute('aria-current', 'page')
  })

  it('More button has aria-haspopup attribute', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const moreButton = screen.getByTestId('nav-more')
    expect(moreButton).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('has minimum 44px touch targets', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const buttons = [
      screen.getByTestId('nav-dashboard'),
      screen.getByTestId('nav-properties'),
      screen.getByTestId('nav-upload'),
      screen.getByTestId('nav-reconcile'),
      screen.getByTestId('nav-more'),
    ]

    buttons.forEach((button) => {
      expect(button).toHaveClass('min-h-[56px]')
      expect(button).toHaveClass('min-w-[44px]')
    })
  })

  it('has proper accessibility attributes', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(nav).toBeInTheDocument()

    const buttons = screen.getAllByRole('button')
    buttons.forEach((button) => {
      expect(button).toHaveAttribute('aria-label')
    })
  })

  it('is hidden on desktop (md breakpoint)', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const nav = screen.getByTestId('bottom-nav')
    expect(nav).toHaveClass('md:hidden')
  })

  it('has safe area support for notched devices', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const nav = screen.getByTestId('bottom-nav')
    expect(nav).toHaveStyle({
      paddingBottom: 'env(safe-area-inset-bottom)',
    })
  })

  it('nav buttons have pill corners (rounded-full)', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    )

    const buttons = [
      screen.getByTestId('nav-dashboard'),
      screen.getByTestId('nav-properties'),
      screen.getByTestId('nav-upload'),
      screen.getByTestId('nav-reconcile'),
      screen.getByTestId('nav-more'),
    ]

    buttons.forEach((button) => {
      expect(button).toHaveClass('rounded-full')
    })
  })
})
