type AssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface Env {
  ASSETS: AssetFetcher
}

const API_ORIGIN = 'https://api.capveri.com'

const SECURITY_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' https://us-assets.i.posthog.com https://static.cloudflareinsights.com https://widgets.ventoralabs.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.capveri.com https://ventora-ai-cs-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://*.ingest.sentry.io https://widgets.ventoralabs.com",
    "worker-src 'self' blob: https://cdn.jsdelivr.net",
    "child-src 'self' blob:",
    "frame-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; '),
}

function withSecurityHeaders(response: Response): Response {
  const nextResponse = new Response(response.body, response)

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    nextResponse.headers.set(key, value)
  }

  return nextResponse
}

function proxyApiRequest(request: Request, url: URL): Promise<Response> {
  const upstreamUrl = new URL(`${url.pathname}${url.search}`, API_ORIGIN)
  return fetch(new Request(upstreamUrl, request))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request, url)
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request))
  },
}
