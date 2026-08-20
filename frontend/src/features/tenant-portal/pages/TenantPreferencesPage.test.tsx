/**
 * Tests for TenantPreferencesPage
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TenantPreferencesPage } from './TenantPreferencesPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
})

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </BrowserRouter>
  )
}

describe('TenantPreferencesPage', () => {
  it('renders page title', () => {
    renderWithProviders(<TenantPreferencesPage />)
    expect(screen.getByText('Email Preferences')).toBeInTheDocument()
  })

  it('renders page description', () => {
    renderWithProviders(<TenantPreferencesPage />)
    expect(
      screen.getByText('Manage your notification settings')
    ).toBeInTheDocument()
  })

  it('renders EmailPreferences component', () => {
    renderWithProviders(<TenantPreferencesPage />)
    // The page renders a plain <div> (TenantLayout owns the single <main>
    // landmark), so assert the EmailPreferences area instead: with no query
    // data it shows its loading spinner (role="status").
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
