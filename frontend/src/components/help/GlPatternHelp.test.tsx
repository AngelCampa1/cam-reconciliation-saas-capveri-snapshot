import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlPatternHelp } from './GlPatternHelp'

describe('GlPatternHelp', () => {
  it('renders without error', () => {
    render(<GlPatternHelp />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('opens dialog with syntax table when trigger clicked', async () => {
    const user = userEvent.setup()
    render(<GlPatternHelp />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows all 4 pattern rows in the syntax table', async () => {
    const user = userEvent.setup()
    render(<GlPatternHelp />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByText('4*')).toBeInTheDocument()
    expect(screen.getByText('41??')).toBeInTheDocument()
    expect(screen.getByText('4100-4199')).toBeInTheDocument()
    expect(screen.getByText('4100')).toBeInTheDocument()
  })
})
