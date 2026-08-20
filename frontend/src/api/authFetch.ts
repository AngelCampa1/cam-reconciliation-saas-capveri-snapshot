import { getSession, signOut } from './client'
import { ApiError } from './errors'
import { resolveApiUrl } from './url'

function redirectToExpiredLogin(): void {
  if (typeof window === 'undefined') {
    return
  }
  const destination =
    window.location.pathname + window.location.search + window.location.hash
  window.location.href = `/auth/login?expired=true&returnUrl=${encodeURIComponent(destination)}`
}

/**
 * Shared authenticated fetch helper for protected endpoints.
 *
 * Uses the configured auth provider token when available and preserves
 * caller-provided headers/options.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const resolvedInput = typeof input === 'string' ? resolveApiUrl(input) : input
  const session = await getSession()

  if (!session?.access_token) {
    await signOut()
    redirectToExpiredLogin()
    throw new ApiError('Session expired', 401)
  }

  const headers = new Headers(init.headers ?? {})
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(resolvedInput, {
    ...init,
    headers,
  })
}
