import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './worker'

describe('Cloudflare frontend Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('proxies API requests to the backend origin', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 202 }))

    const response = await worker.fetch(
      new Request('https://app.capveri.com/api/v1/properties?limit=10', {
        headers: { Authorization: 'Bearer token' },
      }),
      createEnv()
    )

    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledOnce()
    const upstreamRequest = fetchMock.mock.calls[0]?.[0]
    expect(upstreamRequest).toBeInstanceOf(Request)
    expect((upstreamRequest as Request).url).toBe(
      'https://api.capveri.com/api/v1/properties?limit=10'
    )
    expect((upstreamRequest as Request).headers.get('Authorization')).toBe(
      'Bearer token'
    )
  })

  it('adds security headers to asset responses', async () => {
    const response = await worker.fetch(
      new Request('https://app.capveri.com/dashboard'),
      createEnv(new Response('<html></html>', { status: 200 }))
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "default-src 'self'"
    )
    // The in-app AI-CS help widget streams chat over fetch/SSE to the
    // ventora-ai-cs-worker, so its origin must be allowed by connect-src or the
    // browser blocks every AI-CS request.
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'connect-src'
    )
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'https://ventora-ai-cs-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev'
    )
    expect(response.headers.get('Content-Security-Policy')).toContain(
      'https://static.cloudflareinsights.com'
    )
  })

  it('delegates non-API routes to Workers static assets for SPA fallback', async () => {
    const assetFetch = vi.fn().mockResolvedValue(new Response('asset'))
    const request = new Request('https://app.capveri.com/settings/profile')

    await worker.fetch(request, { ASSETS: { fetch: assetFetch } })

    expect(assetFetch).toHaveBeenCalledWith(request)
  })
})

function createEnv(response = new Response('asset')): Env {
  return {
    ASSETS: {
      fetch: vi.fn().mockResolvedValue(response),
    },
  }
}
