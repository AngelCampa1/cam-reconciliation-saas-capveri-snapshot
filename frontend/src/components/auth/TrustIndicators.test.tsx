import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TrustIndicators } from './TrustIndicators'

describe('TrustIndicators', () => {
  it('renders all four default badge labels', () => {
    render(<TrustIndicators />)

    expect(screen.getByText('Encrypted records')).toBeInTheDocument()
    expect(screen.getByText('BOMA 2024 aligned')).toBeInTheDocument()
    expect(screen.getByText('Audit trail for every change')).toBeInTheDocument()
    expect(screen.getByText('Logs never store PII')).toBeInTheDocument()
  })

  it('renders custom indicators when provided', () => {
    render(
      <TrustIndicators
        indicators={[{ icon: <span />, label: 'Custom badge' }]}
      />
    )

    expect(screen.getByText('Custom badge')).toBeInTheDocument()
    expect(screen.queryByText('Encrypted records')).not.toBeInTheDocument()
  })
})
