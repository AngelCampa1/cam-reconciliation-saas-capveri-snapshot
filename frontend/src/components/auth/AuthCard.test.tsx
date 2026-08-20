import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthCard, AuthCardHeader, AuthLogo } from './AuthCard'

describe('AuthCard', () => {
  it('renders children content', () => {
    render(
      <AuthCard>
        <div data-testid="child-content">Test Content</div>
      </AuthCard>
    )

    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders header when provided', () => {
    render(
      <AuthCard header={<div data-testid="header">Header Content</div>}>
        <div>Body</div>
      </AuthCard>
    )

    expect(screen.getByTestId('header')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <AuthCard className="custom-class">
        <div>Content</div>
      </AuthCard>
    )

    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('AuthCardHeader', () => {
  it('renders title and subtitle', () => {
    render(<AuthCardHeader title="Welcome" subtitle="Sign in to continue" />)

    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument()
  })

  it('renders logo when provided', () => {
    render(
      <AuthCardHeader
        logo={<img src="/test.svg" alt="Test Logo" />}
        title="Title"
      />
    )

    expect(screen.getByAltText('Test Logo')).toBeInTheDocument()
  })
})

describe('AuthLogo', () => {
  it('renders logo image with correct src and alt', () => {
    render(<AuthLogo />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', '/icons/icon.svg')
  })

  it('applies small size classes', () => {
    render(<AuthLogo size="sm" />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toHaveClass('h-10', 'w-10')
  })

  it('applies medium size classes (default)', () => {
    render(<AuthLogo size="md" />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toHaveClass('h-12', 'w-12')
  })

  it('applies large size classes', () => {
    render(<AuthLogo size="lg" />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo).toHaveClass('h-16', 'w-16')
  })

  it('applies custom className', () => {
    render(<AuthLogo className="custom-class" />)

    const logo = screen.getByAltText('CapVeri')
    expect(logo.parentElement).toHaveClass('custom-class')
  })
})
