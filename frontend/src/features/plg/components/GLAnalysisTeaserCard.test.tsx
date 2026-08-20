/**
 * Tests for GLAnalysisTeaserCard.
 *
 * This is a static CRO teaser shown to PLG users at the results paywall.
 * It does NOT run real GL analysis — it shows placeholder findings to
 * communicate the value of the paid GL Analysis feature.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

import { GLAnalysisTeaserCard } from './GLAnalysisTeaserCard'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('GLAnalysisTeaserCard', () => {
  it('renders the GL Narrative Analysis header with advisory badge', () => {
    render(<GLAnalysisTeaserCard />, { wrapper: Wrapper })

    expect(screen.getByText('GL Narrative Analysis')).toBeInTheDocument()
    expect(screen.getByText(/advisory/i)).toBeInTheDocument()
  })

  it('shows 3 blurred placeholder findings', () => {
    render(<GLAnalysisTeaserCard />, { wrapper: Wrapper })

    const findings = screen.getAllByTestId('gl-teaser-finding')
    expect(findings).toHaveLength(3)
  })

  it('renders an upgrade CTA link', () => {
    render(<GLAnalysisTeaserCard />, { wrapper: Wrapper })

    const link = screen.getByRole('link', { name: /unlock full gl analysis/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/pricing')
  })
})
