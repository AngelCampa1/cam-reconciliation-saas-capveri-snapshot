/**
 * Tests for LeadCaptureForm component.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeadCaptureForm } from './LeadCaptureForm'

vi.mock('@/lib/analytics', () => ({
  getEmailDomain: (email: string) => email.split('@')[1],
  identifyLeadForAnalytics: vi.fn(),
  trackEvent: vi.fn(),
}))

const defaultProps = {
  assetSlug: 'cam-gross-up-calculator',
  onSuccess: vi.fn(),
}

describe('LeadCaptureForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders all three fields', () => {
    render(<LeadCaptureForm {...defaultProps} />)
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company/i)).toBeInTheDocument()
  })

  it('renders custom ctaLabel', () => {
    render(<LeadCaptureForm {...defaultProps} ctaLabel="Get Free Matrix" />)
    expect(
      screen.getByRole('button', { name: /get free matrix/i })
    ).toBeInTheDocument()
  })

  it('shows validation errors for empty required fields', async () => {
    render(<LeadCaptureForm {...defaultProps} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument()
    })
  })

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'not-an-email')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText(/valid work email/i)).toBeInTheDocument()
    })
  })

  it('disables button while submitting', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  it('calls onSuccess when API returns 200', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, message: 'Check your email' }),
      })
    ) as unknown as typeof fetch

    const onSuccess = vi.fn()
    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} onSuccess={onSuccess} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce()
    })
  })

  it('shows error message when API returns error', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: 'Server error' }),
      })
    ) as unknown as typeof fetch

    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument()
    })
  })

  it('renders a hidden honeypot field and sends turnstile_token', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    ) as unknown as typeof fetch
    global.fetch = fetchMock

    const { container } = render(<LeadCaptureForm {...defaultProps} />)
    expect(
      container.querySelector('input[name="company_website"]')
    ).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const body = JSON.parse(
      (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    )
    expect(body).toHaveProperty('turnstile_token')
  })

  it('blocks submission when Turnstile is configured but not completed', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button', { name: /download/i }))

    await waitFor(() => {
      expect(screen.getByText(/verification challenge/i)).toBeInTheDocument()
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows already requested message on 429', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () =>
          Promise.resolve({
            detail: 'You have already requested this download.',
          }),
      })
    ) as unknown as typeof fetch

    const user = userEvent.setup()
    render(<LeadCaptureForm {...defaultProps} />)
    await user.type(screen.getByLabelText(/first name/i), 'Jane')
    await user.type(screen.getByLabelText(/work email/i), 'jane@example.com')
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText(/already requested/i)).toBeInTheDocument()
    })
  })
})
