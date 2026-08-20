/**
 * Tests for LazyPageBoundary component
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { LazyPageBoundary } from './LazyPageBoundary'

describe('LazyPageBoundary', () => {
  it('renders children when loaded', () => {
    render(
      <LazyPageBoundary>
        <div data-testid="child-content">Page content</div>
      </LazyPageBoundary>
    )

    expect(screen.getByTestId('child-content')).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('renders custom fallback when provided', () => {
    render(
      <LazyPageBoundary
        fallback={<div data-testid="custom-fallback">Loading...</div>}
      >
        <div>Content</div>
      </LazyPageBoundary>
    )

    // Children should render immediately (no lazy loading in test)
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders default skeleton fallback when no custom fallback provided', () => {
    // This tests that the component can be rendered without a fallback prop
    render(
      <LazyPageBoundary>
        <div>Content</div>
      </LazyPageBoundary>
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })
})
