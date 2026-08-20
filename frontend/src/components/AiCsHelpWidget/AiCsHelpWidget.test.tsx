/**
 * Unit tests for AiCsHelpWidget.
 *
 * External boundaries mocked:
 *   - @ventora/ai-cs/react  — AiCsWidget makes real network calls in jsdom;
 *     mocked minimally to capture the props AiCsHelpWidget passes so we can
 *     assert correct wiring (session, brand, copy, api.signRequest) without
 *     actually mounting the third-party widget.
 *   - @/api/authFetch       — authenticatedFetch is the BFF network boundary;
 *     mocked to verify the signing proxy calls the correct endpoint.
 *   - @/hooks/useAuth       — Supabase auth; mocked to control user presence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AiCsWidgetProps } from '@ventora/ai-cs/react'
import { AiCsHelpWidget } from './AiCsHelpWidget'

// ---------------------------------------------------------------------------
// Mock: @ventora/ai-cs/react
// Captures the latest props passed to <AiCsWidget> so tests can inspect them.
// ---------------------------------------------------------------------------
let capturedWidgetProps: AiCsWidgetProps | null = null

vi.mock('@ventora/ai-cs/react', () => ({
  AiCsWidget: (props: AiCsWidgetProps) => {
    capturedWidgetProps = props
    return <div data-testid="ai-cs-widget">{props.copy?.launcher}</div>
  },
}))

// ---------------------------------------------------------------------------
// Mock: @/hooks/useAuth
// External boundary — real Supabase auth makes network calls.
// ---------------------------------------------------------------------------
const mockUseAuth = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

// ---------------------------------------------------------------------------
// Mock: @/api/authFetch
// External boundary — controls outbound authenticated fetch to the BFF.
// ---------------------------------------------------------------------------
const mockAuthenticatedFetch = vi.fn()

vi.mock('@/api/authFetch', () => ({
  authenticatedFetch: (...args: Parameters<typeof mockAuthenticatedFetch>) =>
    mockAuthenticatedFetch(...args),
}))

// ---------------------------------------------------------------------------
// Mock: @/api/client getSession
// External boundary — the Supabase session that supplies the access token the
// custom api.fetch forwards to the AI-CS worker (and on to the BFF context
// endpoint, which requires a Bearer JWT). Real getSession hits Supabase.
// ---------------------------------------------------------------------------
const mockGetSession = vi.fn()

vi.mock('@/api/client', () => ({
  getSession: () => mockGetSession(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWidget() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AiCsHelpWidget />
    </MemoryRouter>
  )
}

const WIDGET_BASE_URL = 'https://ai-cs.example.com'

beforeEach(() => {
  vi.clearAllMocks()
  capturedWidgetProps = null

  // Default: env var unset, no user
  delete (import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL']
  mockUseAuth.mockReturnValue({ user: null })
  mockGetSession.mockResolvedValue(null)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AiCsHelpWidget', () => {
  describe('renders null when prerequisites are missing', () => {
    it('renders nothing when VITE_AI_CS_BASE_URL is unset (even with a user)', () => {
      mockUseAuth.mockReturnValue({ user: { id: 'user-abc' } })
      // env var already deleted in beforeEach

      const { container } = renderWidget()

      expect(container.firstChild).toBeNull()
      expect(capturedWidgetProps).toBeNull()
    })

    it('renders nothing when VITE_AI_CS_BASE_URL is an empty string', () => {
      ;(import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL'] =
        '   '
      mockUseAuth.mockReturnValue({ user: { id: 'user-abc' } })

      const { container } = renderWidget()

      expect(container.firstChild).toBeNull()
      expect(capturedWidgetProps).toBeNull()
    })

    it('renders nothing when there is no authenticated user (even with base URL set)', () => {
      ;(import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL'] =
        WIDGET_BASE_URL
      mockUseAuth.mockReturnValue({ user: null })

      const { container } = renderWidget()

      expect(container.firstChild).toBeNull()
      expect(capturedWidgetProps).toBeNull()
    })
  })

  describe('mounts the widget when all prerequisites are met', () => {
    beforeEach(() => {
      ;(import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL'] =
        WIDGET_BASE_URL
      mockUseAuth.mockReturnValue({ user: { id: 'user-xyz' } })
    })

    it('renders the AiCsWidget and shows the "Questions?" launcher label', () => {
      const { getByTestId } = renderWidget()

      expect(getByTestId('ai-cs-widget')).toBeInTheDocument()
      expect(getByTestId('ai-cs-widget').textContent).toBe('Questions?')
    })

    it('passes copy={{ launcher: "Questions?" }} to AiCsWidget', () => {
      renderWidget()

      expect(capturedWidgetProps?.copy?.launcher).toBe('Questions?')
    })

    it('passes session with appId="capveri" and the authenticated userId', () => {
      renderWidget()

      expect(capturedWidgetProps?.session.appId).toBe('capveri')
      expect(capturedWidgetProps?.session.userId).toBe('user-xyz')
    })

    it('sets currentPath on the session to the current route', () => {
      renderWidget()

      expect(capturedWidgetProps?.session.currentPath).toBe('/dashboard')
    })

    it('passes brand={{ id: "capveri" }} to AiCsWidget', () => {
      renderWidget()

      expect(capturedWidgetProps?.brand).toEqual({ id: 'capveri' })
    })

    it('wires api.baseUrl to VITE_AI_CS_BASE_URL', () => {
      renderWidget()

      expect(capturedWidgetProps?.api.baseUrl).toBe(WIDGET_BASE_URL)
    })
  })

  describe('signing proxy: api.signRequest calls BFF, never holds the secret', () => {
    beforeEach(() => {
      ;(import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL'] =
        WIDGET_BASE_URL
      mockUseAuth.mockReturnValue({ user: { id: 'user-xyz' } })
    })

    it('api.signRequest POST-s to /api/v1/ai-cs/sign via authenticatedFetch', async () => {
      const fakeAssertion = {
        timestamp: '2026-01-01T00:00:00Z',
        nonce: 'abc123',
        signature: 'sig-value',
      }
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => fakeAssertion,
      })

      renderWidget()

      // The signRequest function is wired through props — invoke it directly
      // to prove it hits the correct BFF route.
      const signRequest = capturedWidgetProps?.api.signRequest
      expect(typeof signRequest).toBe('function')

      const result = await signRequest!({
        method: 'POST',
        path: '/sessions',
        body: { appId: 'capveri', userId: 'user-xyz' },
        serializedBody: '{"appId":"capveri","userId":"user-xyz"}',
      })

      // Verify the BFF was called — not a direct secret-bearing fetch
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1)
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        '/api/v1/ai-cs/sign',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"path":"/sessions"'),
        })
      )

      // And the resolved assertion is returned to the caller
      expect(result).toEqual(fakeAssertion)
    })

    it('api.signRequest throws when the BFF returns a non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      renderWidget()

      const signRequest = capturedWidgetProps?.api.signRequest
      expect(typeof signRequest).toBe('function')

      await expect(
        signRequest!({
          method: 'GET',
          path: '/sessions/abc',
          body: null,
          serializedBody: 'null',
        })
      ).rejects.toThrow('AI-CS sign request failed (401)')
    })
  })

  // Regression guard for the prod 502 (app_context_unavailable): the worker's
  // signed context fetch to the BFF requires a Bearer JWT. The widget must
  // forward the user's Supabase access token on every worker request, or the
  // BFF rejects the context fetch with 401 and chat breaks for every user.
  describe('context fetch: api.fetch forwards the Supabase JWT to the worker', () => {
    beforeEach(() => {
      ;(import.meta.env as Record<string, string>)['VITE_AI_CS_BASE_URL'] =
        WIDGET_BASE_URL
      mockUseAuth.mockReturnValue({ user: { id: 'user-xyz' } })
    })

    it('injects Authorization: Bearer <access_token> from the current session', async () => {
      mockGetSession.mockResolvedValue({ access_token: 'jwt-token-123' })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}'))

      renderWidget()
      const customFetch = capturedWidgetProps?.api.fetch
      expect(typeof customFetch).toBe('function')

      await customFetch!(`${WIDGET_BASE_URL}/v1/chat`, { method: 'POST' })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const passedInit = fetchSpy.mock.calls[0]![1]
      const headers = new Headers(passedInit?.headers)
      expect(headers.get('Authorization')).toBe('Bearer jwt-token-123')

      fetchSpy.mockRestore()
    })

    it('does not overwrite an Authorization header the caller already set', async () => {
      mockGetSession.mockResolvedValue({ access_token: 'jwt-token-123' })
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}'))

      renderWidget()
      const customFetch = capturedWidgetProps?.api.fetch

      await customFetch!(`${WIDGET_BASE_URL}/v1/chat`, {
        method: 'POST',
        headers: { Authorization: 'Bearer caller-supplied' },
      })

      const headers = new Headers(fetchSpy.mock.calls[0]![1]?.headers)
      expect(headers.get('Authorization')).toBe('Bearer caller-supplied')
      expect(mockGetSession).toHaveBeenCalled()

      fetchSpy.mockRestore()
    })

    it('omits Authorization when there is no active session', async () => {
      mockGetSession.mockResolvedValue(null)
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}'))

      renderWidget()
      const customFetch = capturedWidgetProps?.api.fetch

      await customFetch!(`${WIDGET_BASE_URL}/v1/chat`, { method: 'POST' })

      const headers = new Headers(fetchSpy.mock.calls[0]![1]?.headers)
      expect(headers.has('Authorization')).toBe(false)

      fetchSpy.mockRestore()
    })
  })
})
