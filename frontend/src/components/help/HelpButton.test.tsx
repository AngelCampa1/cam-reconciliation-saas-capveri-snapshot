import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HelpButton } from './HelpButton'

describe('HelpButton', () => {
  it('renders with "Help" label', () => {
    render(<HelpButton onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<HelpButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: /help/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
