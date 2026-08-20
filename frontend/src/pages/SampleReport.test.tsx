/**
 * Tests for SampleReport page
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/hooks/useTheme'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

import { SampleReportPage } from './SampleReport'

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <ThemeProvider>{children}</ThemeProvider>
  </BrowserRouter>
)

describe('SampleReportPage', () => {
  it('renders sample report page with content', () => {
    render(<SampleReportPage />, { wrapper: Wrapper })

    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0)
  })

  it('renders CTA linking to /auth/register', () => {
    render(<SampleReportPage />, { wrapper: Wrapper })

    const cta = screen.getByRole('link', {
      name: /reconcile my portfolio/i,
    })
    expect(cta).toHaveAttribute('href', '/auth/register')
  })

  it('renders page title or heading', () => {
    render(<SampleReportPage />, { wrapper: Wrapper })

    expect(screen.getByRole('heading', { name: /sample/i })).toBeInTheDocument()
  })
})
