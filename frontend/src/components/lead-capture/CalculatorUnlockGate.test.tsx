/**
 * Tests for CalculatorUnlockGate component.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { server } from '@/mocks/server'
import { resolveApiUrl } from '@/api/url'
import { CalculatorUnlockGate } from './CalculatorUnlockGate'

// Mock analytics
const mockTrackEvent = vi.fn()
vi.mock('@/lib/analytics', () => ({
  getEmailDomain: (email: string) => email.split('@')[1],
  identifyLeadForAnalytics: vi.fn(),
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}))

const STORAGE_KEY = 'boma_calculator_unlocked'
const SLUG = 'boma-2024-calculator'
const UNLOCK_URL = resolveApiUrl('/api/v1/leads/calculator-unlock')

const defaultProps = {
  slug: SLUG,
  onUnlock: vi.fn(),
  source: 'test',
}

function renderGate(props = defaultProps) {
  return render(<CalculatorUnlockGate {...props} />)
}

/** Open the unlock form and fill first_name + work_email. */
async function openAndFill(
  user: ReturnType<typeof userEvent.setup>,
  firstName = 'Jane',
  email = 'jane@example.com'
) {
  fireEvent.click(
    screen.getByRole('button', { name: /send email for dollar details/i })
  )
  await user.type(await screen.findByLabelText(/first name/i), firstName)
  await user.type(screen.getByLabelText(/work email/i), email)
}

describe('CalculatorUnlockGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllEnvs()
  })

  describe('initial render', () => {
    it('shows "Unlock" button initially (before form)', () => {
      renderGate()
      expect(
        screen.getByRole('button', { name: /send email for dollar details/i })
      ).toBeInTheDocument()
    })

    it('uses custom post-result copy when provided', () => {
      render(
        <CalculatorUnlockGate
          slug="cam-leakage-estimator"
          onUnlock={vi.fn()}
          teaserText="Send yourself the worksheet."
          buttonLabel="Send me the worksheet"
          submitLabel="Send me the worksheet"
        />
      )
      expect(
        screen.getByText('Send yourself the worksheet.')
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /send me the worksheet/i })
      ).toBeInTheDocument()
    })

    it('does not show form fields before button click', () => {
      renderGate()
      expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/work email/i)).not.toBeInTheDocument()
    })
  })

  describe('auto-unlock from localStorage', () => {
    it('calls onUnlock immediately if localStorage key is set', () => {
      localStorage.setItem(STORAGE_KEY, 'true')
      const onUnlock = vi.fn()
      render(<CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} />)
      expect(onUnlock).toHaveBeenCalledTimes(1)
    })

    it('uses a custom localStorage key when provided', () => {
      localStorage.setItem('cam_leakage_estimator_estimate_sent', 'true')
      const onUnlock = vi.fn()
      render(
        <CalculatorUnlockGate
          slug="cam-leakage-estimator"
          storageKey="cam_leakage_estimator_estimate_sent"
          onUnlock={onUnlock}
        />
      )
      expect(onUnlock).toHaveBeenCalledTimes(1)
    })

    it('does NOT call onUnlock when localStorage key is absent', () => {
      const onUnlock = vi.fn()
      render(<CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} />)
      expect(onUnlock).not.toHaveBeenCalled()
    })
  })

  describe('showing the form', () => {
    it('clicking button reveals first_name and work_email fields', async () => {
      renderGate()
      fireEvent.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )
      expect(await screen.findByLabelText(/first name/i)).toBeInTheDocument()
      expect(await screen.findByLabelText(/work email/i)).toBeInTheDocument()
    })

    it('fires lead_form_view with source when source is provided', async () => {
      renderGate()
      fireEvent.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )
      expect(mockTrackEvent).toHaveBeenCalledWith('lead_form_view', {
        slug: SLUG,
        source: 'test',
      })
    })
  })

  describe('successful submission', () => {
    it('calls /api/v1/leads/calculator-unlock with correct body', async () => {
      const user = userEvent.setup({ delay: null })
      const requestSpy = vi.fn()
      server.use(
        http.post(UNLOCK_URL, async ({ request }) => {
          requestSpy(await request.json())
          return HttpResponse.json({
            unlocked: true,
            message: 'Results unlocked.',
          })
        })
      )
      const onUnlock = vi.fn()
      render(
        <CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} source="test" />
      )

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() => {
        expect(requestSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            first_name: 'Jane',
            email: 'jane@example.com',
            slug: SLUG,
            source: 'test',
          })
        )
      })
    })

    it('calls onUnlock() after successful submit', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () =>
          HttpResponse.json({ unlocked: true, message: 'Results unlocked.' })
        )
      )
      const onUnlock = vi.fn()
      render(<CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} />)

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
    })

    it('sets localStorage key on success', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () =>
          HttpResponse.json({ unlocked: true, message: 'Results unlocked.' })
        )
      )
      const onUnlock = vi.fn()
      render(<CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} />)

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() =>
        expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
      )
    })

    it('sets custom localStorage key on success', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () =>
          HttpResponse.json({ unlocked: true, message: 'Results unlocked.' })
        )
      )
      const onUnlock = vi.fn()
      render(
        <CalculatorUnlockGate
          slug="cam-leakage-estimator"
          storageKey="cam_leakage_estimator_estimate_sent"
          onUnlock={onUnlock}
        />
      )

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() =>
        expect(
          localStorage.getItem('cam_leakage_estimator_estimate_sent')
        ).toBe('true')
      )
    })

    it('fires lead_form_submit analytics event on success', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () =>
          HttpResponse.json({ unlocked: true, message: 'Results unlocked.' })
        )
      )
      const onUnlock = vi.fn()
      render(
        <CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} source="test" />
      )

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() =>
        expect(mockTrackEvent).toHaveBeenCalledWith(
          'lead_form_submit',
          expect.objectContaining({ slug: SLUG })
        )
      )
    })
  })

  describe('429 rate limit handling', () => {
    it('treats 429 as already-unlocked and calls onUnlock', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () => new HttpResponse(null, { status: 429 }))
      )
      const onUnlock = vi.fn()
      render(<CalculatorUnlockGate slug={SLUG} onUnlock={onUnlock} />)

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
      expect(localStorage.getItem(STORAGE_KEY)).toBe('true')
    })
  })

  describe('error states', () => {
    it('shows generic error on non-429 error response', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(
        http.post(UNLOCK_URL, () => new HttpResponse(null, { status: 500 }))
      )
      renderGate()

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      expect(
        await screen.findByText(/something went wrong/i)
      ).toBeInTheDocument()
    })

    it('shows error on network failure', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(UNLOCK_URL, () => HttpResponse.error()))
      renderGate()

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      expect(await screen.findByText(/network error/i)).toBeInTheDocument()
    })
  })

  describe('turnstile gating', () => {
    it('blocks submit when Turnstile configured but not completed', async () => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '1x00000000000000000000AA')
      const fetchSpy = vi.fn()
      server.use(http.post(UNLOCK_URL, () => fetchSpy()))
      const user = userEvent.setup({ delay: null })
      renderGate()

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      expect(
        await screen.findByText(/verification challenge/i)
      ).toBeInTheDocument()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('loading state', () => {
    it('shows loading spinner while submitting', async () => {
      const user = userEvent.setup({ delay: null })
      server.use(http.post(UNLOCK_URL, () => new Promise<Response>(() => {})))
      renderGate()

      await openAndFill(user)
      await user.click(
        screen.getByRole('button', { name: /send email for dollar details/i })
      )

      await waitFor(() => {
        const submitBtn = screen.getByRole('button', {
          name: /send email for dollar details/i,
        })
        expect(submitBtn).toBeDisabled()
      })
    })
  })
})
