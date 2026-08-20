import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { BackButton } from './BackButton'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

function renderWithRouter(ui: React.ReactElement) {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('BackButton', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
  })

  it('renders with default "Back" label', () => {
    renderWithRouter(<BackButton />)
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
    expect(screen.getByText('Back')).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    renderWithRouter(<BackButton label="Back to Properties" />)
    expect(screen.getByText('Back to Properties')).toBeInTheDocument()
  })

  it('calls navigate(-1) when clicked without "to" prop', async () => {
    const user = userEvent.setup()
    renderWithRouter(<BackButton />)

    await user.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith(-1)
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('navigates to explicit path when "to" prop provided', async () => {
    const user = userEvent.setup()
    renderWithRouter(<BackButton to="/properties" />)

    await user.click(screen.getByRole('button'))

    expect(mockNavigate).toHaveBeenCalledWith('/properties')
    expect(mockNavigate).toHaveBeenCalledTimes(1)
  })

  it('is keyboard accessible with Enter key', async () => {
    const user = userEvent.setup()
    renderWithRouter(<BackButton />)

    const button = screen.getByRole('button')
    button.focus()
    await user.keyboard('{Enter}')

    expect(mockNavigate).toHaveBeenCalled()
  })

  it('has proper ARIA label for screen readers', () => {
    renderWithRouter(<BackButton />)
    const button = screen.getByRole('button', { name: /navigate back/i })
    expect(button).toHaveAttribute('aria-label', 'Navigate back')
  })

  it('applies custom className', () => {
    renderWithRouter(<BackButton className="custom-class" />)
    const button = screen.getByRole('button')
    expect(button).toHaveClass('custom-class')
  })

  it('renders with different variants', () => {
    const { rerender } = renderWithRouter(<BackButton variant="ghost" />)
    let button = screen.getByRole('button')
    // Verify button renders (variant prop is passed to Button component)
    expect(button).toBeInTheDocument()

    rerender(
      <BrowserRouter>
        <BackButton variant="outline" />
      </BrowserRouter>
    )
    button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('renders ArrowLeft icon', () => {
    renderWithRouter(<BackButton />)
    const button = screen.getByRole('button')
    // Icon should be rendered inside the button
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
