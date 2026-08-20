import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { WelcomeTourOverlay } from './WelcomeTourOverlay'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

describe('WelcomeTourOverlay', () => {
  it('renders all three steps when open', () => {
    render(
      <WelcomeTourOverlay open={true} onSkip={vi.fn()} onStart={vi.fn()} />,
      { wrapper }
    )
    expect(screen.getByText('Welcome to CapVeri')).toBeInTheDocument()
    expect(screen.getByText('Add a building')).toBeInTheDocument()
    expect(screen.getByText('Add your expense file')).toBeInTheDocument()
    expect(screen.getByText('See what needs fixing')).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(
      <WelcomeTourOverlay open={false} onSkip={vi.fn()} onStart={vi.fn()} />,
      { wrapper }
    )
    expect(screen.queryByText('Welcome to CapVeri')).not.toBeInTheDocument()
  })

  it('calls onSkip when the explore-on-my-own button is clicked', async () => {
    const onSkip = vi.fn()
    const user = userEvent.setup()
    render(
      <WelcomeTourOverlay open={true} onSkip={onSkip} onStart={vi.fn()} />,
      { wrapper }
    )
    await user.click(
      screen.getByRole('button', { name: /look around on my own/i })
    )
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('calls onStart when the primary CTA is clicked', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()
    render(
      <WelcomeTourOverlay open={true} onSkip={vi.fn()} onStart={onStart} />,
      { wrapper }
    )
    await user.click(
      screen.getByRole('button', { name: /add my first building/i })
    )
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('calls onSkip when dialog is closed via onOpenChange (e.g. Escape)', async () => {
    const onSkip = vi.fn()
    const user = userEvent.setup()
    render(
      <WelcomeTourOverlay open={true} onSkip={onSkip} onStart={vi.fn()} />,
      { wrapper }
    )
    await user.keyboard('{Escape}')
    expect(onSkip).toHaveBeenCalledTimes(1)
  })
})
