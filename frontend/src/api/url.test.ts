import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('resolveApiUrl', () => {
  it('prefixes API paths with VITE_API_URL when configured', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    vi.resetModules()
    const { resolveApiUrl } = await import('./url')

    expect(resolveApiUrl('/api/v1/ingestion/upload')).toBe(
      'https://api.capveri.com/api/v1/ingestion/upload'
    )
  })

  it('keeps API paths relative on localhost when VITE_API_URL is not configured', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubGlobal('window', {
      location: {
        hostname: 'localhost',
      },
    })
    vi.resetModules()
    const { resolveApiUrl } = await import('./url')

    expect(resolveApiUrl('/api/v1/ingestion/upload')).toBe(
      '/api/v1/ingestion/upload'
    )
  })

  it('falls back to api.capveri.com on marketing host when VITE_API_URL is missing', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubGlobal('window', {
      location: {
        hostname: 'www.capveri.com',
      },
    })
    vi.resetModules()
    const { resolveApiUrl } = await import('./url')

    expect(resolveApiUrl('/api/v1/feedback')).toBe(
      'https://api.capveri.com/api/v1/feedback'
    )
  })

  it.each(['app.capveri.com', 'www.capveri.com', 'capveri.com'])(
    'falls back to api.capveri.com on %s when VITE_API_URL is blank',
    async (hostname) => {
      vi.stubEnv('VITE_API_URL', '   ')
      vi.stubGlobal('window', {
        location: {
          hostname,
        },
      })
      vi.resetModules()
      const { resolveApiUrl, getApiBaseUrl } = await import('./url')

      expect(resolveApiUrl('/api/v1/campaigns/')).toBe(
        'https://api.capveri.com/api/v1/campaigns/'
      )
      expect(getApiBaseUrl()).toBe('https://api.capveri.com')
    }
  )

  it('does not rewrite non-API paths', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    vi.resetModules()
    const { resolveApiUrl } = await import('./url')

    expect(resolveApiUrl('/health')).toBe('/health')
  })

  it('leaves absolute URLs unchanged', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.capveri.com')
    vi.resetModules()
    const { resolveApiUrl } = await import('./url')

    expect(resolveApiUrl('https://example.com/api/v1/test')).toBe(
      'https://example.com/api/v1/test'
    )
  })
})
