/**
 * Tests for ContactPage component.
 *
 * Validates Contact page form and submission flow.
 * Enhanced for audit request functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { ContactPage } from './Contact'

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    login: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
  }),
}))

// Mock useSearchParams
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: vi.fn(),
  }
})

const mockUseSearchParams = vi.mocked(
  await import('react-router-dom')
).useSearchParams

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('ContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock - no search params
    mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()])
  })

  it('renders the page with heading', () => {
    render(<ContactPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { name: /contact us/i, level: 1 })
    ).toBeInTheDocument()
  })

  it('renders tagline', () => {
    render(<ContactPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/get in touch with our team/i)).toBeInTheDocument()
  })

  it('renders navigation with logo linking to home', () => {
    const { container } = render(<ContactPage />, { wrapper: RouterWrapper })

    // Logo in nav links to home
    const logoLink = container.querySelector('a[href="/"]')
    expect(logoLink).toBeInTheDocument()
  })

  it('renders contact form fields', () => {
    render(<ContactPage />, { wrapper: RouterWrapper })

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument()
    expect(screen.getByText(/how can we help/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('contact form inputs have name and autocomplete attributes', () => {
    render(<ContactPage />, { wrapper: RouterWrapper })

    const nameInput = screen.getByLabelText(/full name/i)
    expect(nameInput).toHaveAttribute('name', 'name')
    expect(nameInput).toHaveAttribute('autocomplete', 'name')

    const emailInput = screen.getByLabelText(/^email/i)
    expect(emailInput).toHaveAttribute('name', 'email')
    expect(emailInput).toHaveAttribute('autocomplete', 'email')

    const companyInput = screen.getByLabelText(/company/i)
    expect(companyInput).toHaveAttribute('name', 'company')
    expect(companyInput).toHaveAttribute('autocomplete', 'organization')

    const buildingCountInput = screen.getByLabelText(/number of buildings/i)
    expect(buildingCountInput).toHaveAttribute('name', 'buildingCount')
    expect(buildingCountInput).toHaveAttribute('autocomplete', 'off')

    const messageInput = screen.getByLabelText(/message/i)
    expect(messageInput).toHaveAttribute('name', 'message')
    expect(messageInput).toHaveAttribute('autocomplete', 'off')
  })

  it('updates form data when typing', async () => {
    const user = userEvent.setup()
    render(<ContactPage />, { wrapper: RouterWrapper })

    const nameInput = screen.getByLabelText(/name/i)
    const emailInput = screen.getByLabelText(/email/i)

    await user.type(nameInput, 'John Doe')
    await user.type(emailInput, 'john@example.com')

    expect(nameInput).toHaveValue('John Doe')
    expect(emailInput).toHaveValue('john@example.com')
  })

  it('submits general contact form to API and shows success message', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact-id', status: 'received' }),
    } as Response)
    global.fetch = mockFetch
    const user = userEvent.setup()
    const consoleSpy = vi.spyOn(console, 'debug')
    render(<ContactPage />, { wrapper: RouterWrapper })

    const nameInput = screen.getByLabelText(/name/i)
    const emailInput = screen.getByLabelText(/email/i)
    const messageInput = screen.getByLabelText(/message/i)

    await user.type(nameInput, 'Jane Smith')
    await user.type(emailInput, 'jane@example.com')
    await user.type(messageInput, 'I need help with CAM reconciliation')

    const submitButton = screen.getByRole('button', { name: /send message/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/contact-requests'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    // Body shape must match the backend ContactRequestCreate schema
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(requestBody).toMatchObject({
      name: 'Jane Smith',
      email: 'jane@example.com',
      inquiry_type: '',
      message: 'I need help with CAM reconciliation',
    })
    expect(requestBody).toHaveProperty('company', null)
    expect(requestBody).toHaveProperty('phone', null)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /thank you/i })
      ).toBeInTheDocument()
    })

    expect(screen.getByText(/we've received your message/i)).toBeInTheDocument()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('DEBUG:'),
      expect.objectContaining({
        hasMessage: true,
      })
    )

    consoleSpy.mockRestore()
  }, 20_000)

  it('shows return to home link after submission', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'contact-id', status: 'received' }),
    } as Response)
    global.fetch = mockFetch
    const user = userEvent.setup()
    render(<ContactPage />, { wrapper: RouterWrapper })

    const nameInput = screen.getByLabelText(/name/i)
    const emailInput = screen.getByLabelText(/email/i)

    await user.type(nameInput, 'Test User')
    await user.type(emailInput, 'test@example.com')

    const submitButton = screen.getByRole('button', { name: /send message/i })
    await user.click(submitButton)

    await waitFor(() => {
      const returnLink = screen.getByRole('link', { name: /return to home/i })
      expect(returnLink).toBeInTheDocument()
      expect(returnLink).toHaveAttribute('href', '/')
    })
  })

  it('shows error message when general contact submission fails', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Too many requests' }),
    } as Response)
    global.fetch = mockFetch
    const user = userEvent.setup()
    render(<ContactPage />, { wrapper: RouterWrapper })

    await user.type(screen.getByLabelText(/name/i), 'Test User')
    await user.type(screen.getByLabelText(/email/i), 'test@example.com')

    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(screen.getByText(/too many requests/i)).toBeInTheDocument()
    })
    // Should not advance to the success screen
    expect(
      screen.queryByRole('heading', { name: /thank you/i })
    ).not.toBeInTheDocument()
  })

  it('renders with URL source param', () => {
    const searchParams = new URLSearchParams('source=landing')
    mockUseSearchParams.mockReturnValue([searchParams, vi.fn()])

    render(<ContactPage />, { wrapper: RouterWrapper })

    // Should render form normally
    expect(
      screen.getByRole('heading', { name: /contact us/i })
    ).toBeInTheDocument()
  })

  it('renders with URL type param', () => {
    const searchParams = new URLSearchParams('type=demo')
    mockUseSearchParams.mockReturnValue([searchParams, vi.fn()])

    render(<ContactPage />, { wrapper: RouterWrapper })

    // Should render form normally
    expect(
      screen.getByRole('heading', { name: /contact us/i })
    ).toBeInTheDocument()
  })

  it('renders footer component', () => {
    const { container } = render(<ContactPage />, { wrapper: RouterWrapper })

    expect(container.querySelector('footer')).toBeInTheDocument()
  })

  describe('Audit Request Flow', () => {
    const mockFetch = vi.fn()

    beforeEach(() => {
      mockFetch.mockReset()
      global.fetch = mockFetch
    })

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('blocks audit submit when Turnstile configured but not completed', async () => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/full name/i), 'Test User')
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/company/i), 'Test Co')
      await user.type(screen.getByLabelText(/number of buildings/i), '10')

      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)
      await user.click(
        screen.getByRole('option', { name: /start free trial/i })
      )

      await user.click(screen.getByRole('button', { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText(/verification challenge/i)).toBeInTheDocument()
      })
      expect(mockFetch).not.toHaveBeenCalled()
    }, 20_000)

    it('shows additional fields when audit type is selected', async () => {
      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      // Click on the inquiry type select to open it
      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)

      // Select trial inquiry
      const auditOption = screen.getByRole('option', {
        name: /start free trial/i,
      })
      await user.click(auditOption)

      // Should now show additional audit-specific fields
      // Note: Radix UI Select doesn't work with getByLabelText, so we check for text and phone input
      await waitFor(() => {
        expect(screen.getByText(/current system/i)).toBeInTheDocument()
      })
      expect(screen.getByLabelText(/phone/i)).toBeInTheDocument()
    })

    it('submits audit request to API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          name: 'Test User',
          email: 'test@example.com',
          company: 'Test Co',
          building_count: 10,
          status: 'pending',
        }),
      } as Response)

      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      // Fill required fields
      await user.type(screen.getByLabelText(/full name/i), 'Test User')
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/company/i), 'Test Co')
      await user.type(screen.getByLabelText(/number of buildings/i), '10')

      // Select trial inquiry type
      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)
      const auditOption = screen.getByRole('option', {
        name: /start free trial/i,
      })
      await user.click(auditOption)

      // Submit
      const submitButton = screen.getByRole('button', {
        name: /send message/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/v1/audit-requests'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        )
      })
    }, 20_000)

    it('shows success message after audit request submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test-id',
          name: 'Test User',
          email: 'test@example.com',
          company: 'Test Co',
          building_count: 10,
          status: 'pending',
        }),
      } as Response)

      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      // Fill required fields
      await user.type(screen.getByLabelText(/full name/i), 'Test User')
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/company/i), 'Test Co')
      await user.type(screen.getByLabelText(/number of buildings/i), '10')

      // Select trial inquiry type
      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)
      const auditOption = screen.getByRole('option', {
        name: /start free trial/i,
      })
      await user.click(auditOption)

      // Submit
      const submitButton = screen.getByRole('button', {
        name: /send message/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /thank you/i })
        ).toBeInTheDocument()
      })
    }, 20_000)

    it('shows error message when API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          detail: 'Rate limit exceeded',
        }),
      } as Response)

      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      // Fill required fields
      await user.type(screen.getByLabelText(/full name/i), 'Test User')
      await user.type(screen.getByLabelText(/email/i), 'test@example.com')
      await user.type(screen.getByLabelText(/company/i), 'Test Co')
      await user.type(screen.getByLabelText(/number of buildings/i), '10')

      // Select trial inquiry type
      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)
      const auditOption = screen.getByRole('option', {
        name: /start free trial/i,
      })
      await user.click(auditOption)

      // Submit
      const submitButton = screen.getByRole('button', {
        name: /send message/i,
      })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/rate limit exceeded/i)).toBeInTheDocument()
      })
    }, 20_000)

    it('makes company field required for audit requests', async () => {
      const user = userEvent.setup()
      render(<ContactPage />, { wrapper: RouterWrapper })

      // Select trial inquiry type
      const selectTrigger = screen.getByRole('combobox')
      await user.click(selectTrigger)
      const auditOption = screen.getByRole('option', {
        name: /start free trial/i,
      })
      await user.click(auditOption)

      // Company field should now have required indicator
      await waitFor(() => {
        expect(screen.getByText(/company \*/i)).toBeInTheDocument()
      })
    })
  })
})
