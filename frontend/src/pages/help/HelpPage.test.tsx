import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { HelpPage } from './HelpPage'

describe('HelpPage', () => {
  it('renders beginner task groups and guide cards', () => {
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Help' })).toBeInTheDocument()
    expect(screen.getByText('New to CapVeri? Start here.')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Upload files' })
    ).toBeInTheDocument()
    expect(screen.getByText('Upload a lease PDF')).toBeInTheDocument()
  })

  it('filters topics by search text', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <HelpPage />
      </MemoryRouter>
    )

    await user.type(screen.getByRole('searchbox'), 'tenant dispute')

    expect(screen.getByText('Search results')).toBeInTheDocument()
    expect(screen.getByText('Help tenants ask a question')).toBeInTheDocument()
    expect(screen.queryByText('Upload a lease PDF')).not.toBeInTheDocument()
  })
})
