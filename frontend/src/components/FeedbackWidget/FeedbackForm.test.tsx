/**
 * Tests for FeedbackForm component
 *
 * Covers feedback type selection, message input, screenshot capture, and form submission flows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FeedbackForm } from './FeedbackForm'
import { toast } from 'sonner'

// Mock dependencies
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const { captureMock } = vi.hoisted(() => ({
  captureMock: vi.fn(() => Promise.resolve('data:image/png;base64,mockimage')),
}))

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: trackEventMock,
}))

vi.mock('@/hooks/useScreenshotCapture', () => ({
  useScreenshotCapture: () => ({
    capturing: false,
    capture: captureMock,
    error: null,
  }),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('FeedbackForm', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient.clear()
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.clearAllMocks()
  })

  it('renders form with default values', () => {
    render(<FeedbackForm />, { wrapper })

    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText('(0/2000)')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /attach screenshot/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /submit feedback/i })
    ).toBeInTheDocument()
  })

  it('shows all feedback type options', () => {
    render(<FeedbackForm />, { wrapper })

    expect(screen.getByRole('radio', { name: /bug/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /feature/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /general/i })).toBeInTheDocument()
  })

  it('defaults to general feedback type', () => {
    render(<FeedbackForm />, { wrapper })

    expect(screen.getByRole('radio', { name: /general/i })).toBeChecked()
  })

  it('changes placeholder based on feedback type', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm />, { wrapper })

    // Default (general)
    expect(
      screen.getByPlaceholderText(/share your thoughts/i)
    ).toBeInTheDocument()

    // Bug
    await user.click(screen.getByRole('radio', { name: /bug/i }))
    expect(
      screen.getByPlaceholderText(/describe the bug and steps to reproduce/i)
    ).toBeInTheDocument()

    // Feature request
    await user.click(screen.getByRole('radio', { name: /feature/i }))
    expect(
      screen.getByPlaceholderText(/describe the feature you would like/i)
    ).toBeInTheDocument()
  })

  it('updates character count as user types', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm />, { wrapper })

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Hello world')

    expect(screen.getByText('(11/2000)')).toBeInTheDocument()
  })

  it('enforces maximum message length of 2000 characters', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm />, { wrapper })

    const textarea = screen.getByRole('textbox')
    const longMessage = 'a'.repeat(2500)

    await user.click(textarea)
    await user.paste(longMessage)

    expect(screen.getByText('(2000/2000)')).toBeInTheDocument()
    expect(textarea).toHaveValue('a'.repeat(2000))
  })

  it('disables submit button when message is too short', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm />, { wrapper })

    const submitButton = screen.getByRole('button', {
      name: /submit feedback/i,
    })
    expect(submitButton).toBeDisabled()

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Short')
    expect(submitButton).toBeDisabled()

    await user.type(textarea, ' message here')
    expect(submitButton).toBeEnabled()
  })

  it('shows error toast when submitting message too short', async () => {
    const user = userEvent.setup()
    render(<FeedbackForm />, { wrapper })

    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Short')

    const form = screen.getByRole('textbox').closest('form')!
    await user.click(form)
    // Trigger form submit event
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Message too short', {
        description: 'Please provide at least 10 characters.',
      })
    })
  })

  it('submits feedback successfully', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackForm onSuccess={onSuccess} />, { wrapper })

    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/feedback'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    const callArgs = fetchMock.mock.calls[0][1]
    const body = JSON.parse(callArgs?.body as string)
    expect(body.message).toBe('This is a test feedback message')
    expect(body.type).toBe('general')
    expect(body.page_url).toBe('/')
    expect(body.metadata).toMatchObject({
      user_agent: expect.any(String),
      viewport: {
        width: expect.any(Number),
        height: expect.any(Number),
      },
    })
    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith('feedback_submitted', {
        feedback_type: 'general',
        has_screenshot: false,
        message_length_bucket: '10-49',
      })
    })
  })

  it('shows success toast and clears form after submission', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackForm onSuccess={onSuccess} />, { wrapper })

    await user.type(screen.getByRole('textbox'), 'Test feedback message')
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Feedback submitted', {
        description: 'Thanks for sending that.',
      })
    })

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(onSuccess).toHaveBeenCalled()
  })

  it('handles rate limit error (429)', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Rate limit exceeded' }),
    })

    render(<FeedbackForm />, { wrapper })

    await user.type(screen.getByRole('textbox'), 'Test feedback message')
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to submit', {
        description: 'Rate limit exceeded. Please try again later.',
      })
    })
  })

  it('handles generic submission error', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    })

    render(<FeedbackForm />, { wrapper })

    await user.type(screen.getByRole('textbox'), 'Test feedback message')
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to submit', {
        description: 'Failed to submit feedback',
      })
    })
  })

  it('shows submitting state during mutation', async () => {
    const user = userEvent.setup()

    let resolveSubmit: (value: unknown) => void
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        })
    )

    render(<FeedbackForm />, { wrapper })

    await user.type(screen.getByRole('textbox'), 'Test feedback message')
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /submitting/i })
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled()
    })

    resolveSubmit!({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /submit feedback/i })
      ).toBeDisabled()
    })
  })
})

describe('FeedbackForm - Screenshot functionality', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient.clear()
    fetchMock = vi.fn()
    global.fetch = fetchMock
    vi.clearAllMocks()
  })

  it('shows screenshot button when no screenshot captured', () => {
    render(<FeedbackForm />, { wrapper })

    expect(
      screen.getByRole('button', { name: /attach screenshot/i })
    ).toBeInTheDocument()
  })

  it('captures screenshot and shows preview', async () => {
    const user = userEvent.setup()

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Screenshot captured')
      expect(screen.getByAltText('Screenshot preview')).toBeInTheDocument()
      expect(trackEventMock).toHaveBeenCalledWith(
        'feedback_screenshot_captured',
        {
          feedback_type: 'general',
        }
      )
      expect(
        screen.getByRole('button', { name: /remove/i })
      ).toBeInTheDocument()
    })
  })

  it('shows error toast when screenshot capture fails', async () => {
    const user = userEvent.setup()
    captureMock.mockResolvedValueOnce(null as unknown as string)

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to capture screenshot')
      expect(trackEventMock).toHaveBeenCalledWith(
        'feedback_screenshot_failed',
        {
          feedback_type: 'general',
        }
      )
    })
    // No preview rendered and the capture button remains available for retry.
    expect(screen.queryByAltText('Screenshot preview')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /attach screenshot/i })
    ).toBeInTheDocument()
  })

  it('hides capture button when screenshot is present', async () => {
    const user = userEvent.setup()

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /attach screenshot/i })
      ).not.toBeInTheDocument()
    })
  })

  it('removes screenshot when remove button clicked', async () => {
    const user = userEvent.setup()

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /remove/i })
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /remove/i }))

    expect(screen.queryByAltText('Screenshot preview')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /attach screenshot/i })
    ).toBeInTheDocument()
  })

  it('includes screenshot URL in submission', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))
    await waitFor(() => {
      expect(screen.getByAltText('Screenshot preview')).toBeInTheDocument()
    })

    await user.type(
      screen.getByRole('textbox'),
      'Test feedback with screenshot'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      const callArgs = fetchMock.mock.calls[0][1]
      const body = JSON.parse(callArgs?.body as string)
      expect(body.screenshot_url).toBe('data:image/png;base64,mockimage')
    })
  })

  it('clears screenshot on successful submission', async () => {
    const user = userEvent.setup()

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackForm />, { wrapper })

    await user.click(screen.getByRole('button', { name: /attach screenshot/i }))
    await waitFor(() => {
      expect(screen.getByAltText('Screenshot preview')).toBeInTheDocument()
    })

    await user.type(
      screen.getByRole('textbox'),
      'Test feedback with screenshot'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
      expect(
        screen.queryByAltText('Screenshot preview')
      ).not.toBeInTheDocument()
    })
  })
})
