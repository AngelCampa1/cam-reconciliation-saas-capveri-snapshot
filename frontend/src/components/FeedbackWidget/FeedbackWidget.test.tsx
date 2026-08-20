import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FeedbackWidget } from './FeedbackWidget'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

// Mock window.location
const mockLocation = {
  pathname: '/test-path',
}
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
  configurable: true,
})

// Mock navigator
Object.defineProperty(window.navigator, 'userAgent', {
  value: 'test-agent',
  configurable: true,
})

// Mock window.innerWidth/innerHeight
Object.defineProperty(window, 'innerWidth', {
  value: 1920,
  configurable: true,
})
Object.defineProperty(window, 'innerHeight', {
  value: 1080,
  configurable: true,
})

describe('FeedbackWidget', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    queryClient.clear()
    fetchMock = vi.fn()
    global.fetch = fetchMock
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders floating button in bottom-right by default', () => {
    render(<FeedbackWidget />, { wrapper })
    const button = screen.getByRole('button', { name: /send feedback/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('bottom-4', 'right-4')
  })

  it('renders floating button in bottom-left when specified', () => {
    render(<FeedbackWidget position="bottom-left" />, { wrapper })
    const button = screen.getByRole('button', { name: /send feedback/i })
    expect(button).toHaveClass('bottom-4', 'left-4')
  })

  it('opens sheet when button clicked', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(screen.getByText('Send Feedback')).toBeInTheDocument()
    expect(
      screen.getByText(/help us improve by reporting bugs/i)
    ).toBeInTheDocument()
  })

  it('shows feedback type options when opened', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(screen.getByRole('radio', { name: /bug/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /feature/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /general/i })).toBeInTheDocument()
  })

  it('validates minimum message length', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    const submitBtn = screen.getByRole('button', {
      name: /submit feedback/i,
    })

    // Initially disabled (empty message)
    expect(submitBtn).toBeDisabled()

    // Still disabled with short message
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'Short')
    expect(submitBtn).toBeDisabled()

    // Enabled with sufficient message
    await user.type(textarea, ' message here')
    expect(submitBtn).toBeEnabled()
  })

  it('shows character count', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    expect(screen.getByText('(0/2000)')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox'), 'Test message')
    expect(screen.getByText('(12/2000)')).toBeInTheDocument()
  })

  it('enforces maximum message length of 2000 characters', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    // Simulate pasting a long message to avoid slow typing
    const textarea = screen.getByRole('textbox')
    const longMessage = 'a'.repeat(2500)

    // Use paste event instead of typing
    await user.click(textarea)
    await user.paste(longMessage)

    // Should truncate to 2000
    expect(screen.getByText('(2000/2000)')).toBeInTheDocument()
    expect(textarea).toHaveValue('a'.repeat(2000))
  })

  it('allows changing feedback type', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    const bugButton = screen.getByRole('radio', { name: /bug/i })
    const featureButton = screen.getByRole('radio', { name: /feature/i })

    // Default is 'general'
    expect(screen.getByRole('radio', { name: /general/i })).toBeChecked()

    // Click bug
    await user.click(bugButton)
    expect(bugButton).toBeChecked()

    // Click feature
    await user.click(featureButton)
    expect(featureButton).toBeChecked()
  })

  it('submits feedback successfully', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: '123',
        type: 'general',
        message: 'Test feedback message',
      }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[0]).toContain('/api/v1/feedback')
      expect(callArgs[1]?.method).toBe('POST')

      const body = JSON.parse(callArgs[1]?.body as string)
      expect(body.message).toBe('This is a test feedback message')
      expect(body.type).toBe('general')
    })
  })

  it('handles rate limit error for 429 response', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Rate limit exceeded' }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[0]).toContain('/api/v1/feedback')
    })

    // Sheet should remain open on error
    expect(screen.getByText('Send Feedback')).toBeInTheDocument()
  })

  it('handles generic error for failed submission', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Server error' }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[0]).toContain('/api/v1/feedback')
    })

    // Sheet should remain open on error
    expect(screen.getByText('Send Feedback')).toBeInTheDocument()
  })

  it('closes sheet after successful submission', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: '123',
        type: 'general',
        message: 'Test feedback message',
      }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    expect(screen.getByText('Send Feedback')).toBeInTheDocument()

    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument()
    })
  })

  it('clears form after successful submission', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: '123',
        type: 'general',
        message: 'Test feedback message',
      }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    // Re-open to check if form is cleared
    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByText('(0/2000)')).toBeInTheDocument()
  })

  it('shows screenshot capture button placeholder', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(
      screen.getByRole('button', { name: /attach screenshot/i })
    ).toBeInTheDocument()
  })

  it('handles screenshot button click with placeholder', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    const screenshotBtn = screen.getByRole('button', {
      name: /attach screenshot/i,
    })

    await user.click(screenshotBtn)

    // Button should still be visible (no screenshot captured yet)
    expect(screenshotBtn).toBeInTheDocument()
  })

  it('includes page_url in submission', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      const callArgs = fetchMock.mock.calls[0][1]
      const body = JSON.parse(callArgs?.body as string)
      expect(body.page_url).toBe('/test-path')
    })
  })

  it('includes metadata in submission', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '123' }),
    })

    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))
    await user.type(
      screen.getByRole('textbox'),
      'This is a test feedback message'
    )
    await user.click(screen.getByRole('button', { name: /submit feedback/i }))

    await waitFor(() => {
      const callArgs = fetchMock.mock.calls[0][1]
      const body = JSON.parse(callArgs?.body as string)
      expect(body.metadata).toEqual({
        user_agent: 'test-agent',
        viewport: { width: 1920, height: 1080 },
      })
    })
  })

  it('changes placeholder text based on feedback type', async () => {
    const user = userEvent.setup()
    render(<FeedbackWidget />, { wrapper })

    await user.click(screen.getByRole('button', { name: /send feedback/i }))

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
})
