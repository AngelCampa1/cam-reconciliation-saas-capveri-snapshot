import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TenantHelpPage } from './TenantHelpPage'

describe('TenantHelpPage', () => {
  it('explains statements, PDFs, and disputes', () => {
    render(
      <MemoryRouter>
        <TenantHelpPage />
      </MemoryRouter>
    )

    expect(
      screen.getByRole('heading', { name: 'Tenant Help' })
    ).toBeInTheDocument()
    expect(screen.getByText('Open your statement PDF')).toBeInTheDocument()
    expect(
      screen.getByText('Ask a question or dispute a charge')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Go to tenant dashboard' })
    ).toHaveAttribute('href', '/tenant/dashboard')
  })
})
