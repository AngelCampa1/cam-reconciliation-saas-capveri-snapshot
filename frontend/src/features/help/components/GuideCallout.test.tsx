import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideCallout } from './GuideCallout'

describe('GuideCallout', () => {
  it('renders the title and children', () => {
    render(
      <GuideCallout title="What file do I need?">
        <p>Export a CSV from your accounting system.</p>
      </GuideCallout>
    )

    expect(screen.getByText('What file do I need?')).toBeInTheDocument()
    expect(
      screen.getByText('Export a CSV from your accounting system.')
    ).toBeInTheDocument()
  })

  it('renders the title as a non-heading element (F-288)', () => {
    // A tip-callout label is a contextual notice, not document structure.
    // Rendering it as a heading created an illegal heading-level skip when the
    // callout sat directly under a page h1 (e.g. the reconciliation workspace).
    render(
      <GuideCallout title="Review before tenant packets">tip</GuideCallout>
    )

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Review before tenant packets').tagName).toBe('P')
  })
})
