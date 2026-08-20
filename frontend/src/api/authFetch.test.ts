import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./client', () => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
}))

const mockFetch = vi.fn()

describe('authenticatedFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('adds bearer token and resolves API url when session exists', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    const { getSession } = await import('./client')
    vi.mocked(getSession).mockResolvedValue({
      access_token: 'token-123',
    } as any)

    const response = {} as Response
    mockFetch.mockResolvedValue(response)

    const { authenticatedFetch } = await import('./authFetch')
    const result = await authenticatedFetch('/api/v1/ingestion/upload', {
      method: 'POST',
    })

    expect(result).toBe(response)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.capveri.com/api/v1/ingestion/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      })
    )
    const headers = mockFetch.mock.calls[0]?.[1]?.headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token-123')
  })

  it('fails closed and redirects when no session exists', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    const { getSession, signOut } = await import('./client')
    vi.mocked(getSession).mockResolvedValue(null)
    vi.mocked(signOut).mockResolvedValue(undefined)

    const { authenticatedFetch } = await import('./authFetch')
    await expect(
      authenticatedFetch('/api/v1/feedback', { method: 'POST' })
    ).rejects.toMatchObject({ statusCode: 401, message: 'Session expired' })

    expect(signOut).toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('does not fetch non-api paths without a session', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    const { getSession, signOut } = await import('./client')
    vi.mocked(getSession).mockResolvedValue(null)
    vi.mocked(signOut).mockResolvedValue(undefined)

    const { authenticatedFetch } = await import('./authFetch')
    await expect(authenticatedFetch('/health')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Session expired',
    })

    expect(signOut).toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
