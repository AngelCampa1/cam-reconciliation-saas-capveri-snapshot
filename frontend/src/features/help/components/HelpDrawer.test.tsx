import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HelpDrawer } from './HelpDrawer'

describe('HelpDrawer', () => {
  it('shows contextual help for lease upload routes', () => {
    render(
      <MemoryRouter initialEntries={['/leases/upload']}>
        <HelpDrawer open onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('Help guide')).toBeInTheDocument()
    expect(screen.getByText('Upload a lease PDF')).toBeInTheDocument()
    expect(screen.getByText('Open or download a PDF')).toBeInTheDocument()
  })

  it('searches across all help topics', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <HelpDrawer open onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    await user.type(screen.getByRole('searchbox'), 'tenant dispute')

    expect(screen.getByText('Help tenants ask a question')).toBeInTheDocument()
  })

  it('searches glossary terms', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <HelpDrawer open onOpenChange={vi.fn()} />
      </MemoryRouter>
    )

    await user.type(screen.getByRole('searchbox'), 'gross-up')

    expect(screen.getByText('Gross-up')).toBeInTheDocument()
    expect(
      screen.getByText(/adjusts certain variable expenses/i)
    ).toBeInTheDocument()
  })
})
