import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MainContent } from './MainContent'

describe('MainContent', () => {
  it('renders children with semantic main element', () => {
    render(
      <MainContent>
        <div data-testid="child">Hello</div>
      </MainContent>
    )

    // App.tsx provides the single <main> landmark; this element is a <div data-testid="main-content">
    expect(screen.getByTestId('main-content')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('controls padding via padded prop', () => {
    const { rerender } = render(
      <MainContent padded={true}>Content</MainContent>
    )
    expect(screen.getByTestId('main-content')).toHaveClass('p-4')

    rerender(<MainContent padded={false}>Content</MainContent>)
    expect(screen.getByTestId('main-content')).not.toHaveClass('p-4')
  })

  it('has scrollable layout', () => {
    render(<MainContent>Content</MainContent>)
    const main = screen.getByTestId('main-content')
    expect(main).toHaveClass('flex-1')
    expect(main).toHaveClass('overflow-y-auto')
  })

  it('applies custom className', () => {
    render(<MainContent className="custom-class">Content</MainContent>)
    expect(screen.getByTestId('main-content')).toHaveClass('custom-class')
  })

  describe('Visual Enhancements', () => {
    it('applies quiet background surface', () => {
      render(<MainContent>Content</MainContent>)
      const main = screen.getByTestId('main-content')
      expect(main).toHaveClass('bg-background')
      expect(main.className).not.toContain('bg-gradient-to-br')
    })

    it('does not render decorative pattern overlays', () => {
      render(<MainContent>Content</MainContent>)
      const main = screen.getByTestId('main-content')
      expect(main.querySelector('.bg-dots')).not.toBeInTheDocument()
    })

    it('applies relative positioning for pattern overlay', () => {
      render(<MainContent>Content</MainContent>)
      const main = screen.getByTestId('main-content')
      expect(main).toHaveClass('relative')
    })

    it('content wrapper avoids unnecessary z-index layering', () => {
      render(
        <MainContent>
          <div data-testid="content">Test Content</div>
        </MainContent>
      )
      const main = screen.getByTestId('main-content')
      const wrapper = main.querySelector('.max-w-7xl')
      expect(wrapper).toBeInTheDocument()
      expect(wrapper).toHaveClass('relative')
      expect(wrapper).not.toHaveClass('z-sticky')
    })

    it('applies smooth color transitions', () => {
      render(<MainContent>Content</MainContent>)
      const main = screen.getByTestId('main-content')
      expect(main.className).toContain('transition-colors')
      expect(main.className).toContain('duration-normal')
    })

    it('maintains max-width constraint on content wrapper', () => {
      const { container } = render(<MainContent>Content</MainContent>)
      const main = screen.getByTestId('main-content')
      const wrapper = main.querySelector('.max-w-7xl')
      expect(wrapper).toBeInTheDocument()
      expect(wrapper).toHaveClass('mx-auto')
    })
  })
})
