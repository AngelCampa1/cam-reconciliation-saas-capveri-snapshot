/**
 * Tests for the canonical ErrorState component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Wifi } from 'lucide-react'
import { ErrorState } from './ErrorState'

describe('ErrorState', () => {
  it('renders the title and a default Try again action', async () => {
    const onClick = vi.fn()
    render(<ErrorState title="Couldn't load units" action={{ onClick }} />)

    expect(screen.getByText("Couldn't load units")).toBeInTheDocument()
    const button = screen.getByRole('button', { name: /try again/i })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders a description when provided', () => {
    render(
      <ErrorState
        title="Couldn't load report"
        description="Something went wrong on our end."
      />
    )
    expect(
      screen.getByText('Something went wrong on our end.')
    ).toBeInTheDocument()
  })

  it('omits the action button when no action is given', () => {
    render(<ErrorState title="Couldn't load data" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('swaps in offline copy when offline is true', () => {
    render(
      <ErrorState
        title="Couldn't load notifications"
        description="This should be hidden."
        offline
        action={{ onClick: vi.fn() }}
      />
    )
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByText(/check your connection and try again/i)
    ).toBeInTheDocument()
    // Non-offline title/description must not show.
    expect(
      screen.queryByText("Couldn't load notifications")
    ).not.toBeInTheDocument()
    expect(screen.queryByText('This should be hidden.')).not.toBeInTheDocument()
  })

  it('supports a custom label and icon', () => {
    render(
      <ErrorState
        title="Offline"
        icon={Wifi}
        action={{ onClick: vi.fn(), label: 'Retry now' }}
      />
    )
    expect(
      screen.getByRole('button', { name: /retry now/i })
    ).toBeInTheDocument()
  })

  it('renders a secondary action beside the primary one', async () => {
    const onPrimary = vi.fn()
    const onSecondary = vi.fn()
    render(
      <ErrorState
        title="Couldn't load this property"
        action={{ onClick: onPrimary }}
        secondaryAction={{ label: 'Go back', onClick: onSecondary }}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    await userEvent.click(screen.getByRole('button', { name: /go back/i }))
    expect(onPrimary).toHaveBeenCalledOnce()
    expect(onSecondary).toHaveBeenCalledOnce()
  })

  it('exposes an alert role for assistive tech', () => {
    render(<ErrorState title="Couldn't load leases" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
