import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { type AiCsApiConfig, type AiCsSignedAssertion } from '@ventora/ai-cs'
import { AiCsWidget, type AiCsWidgetProps } from '@ventora/ai-cs/react'
import { authenticatedFetch } from '@/api/authFetch'
import { getSession } from '@/api/client'
import { useAuth } from '@/hooks/useAuth'

type SessionRequest = AiCsWidgetProps['session']

const APP_ID = 'capveri'

/**
 * In-app AI-CS help chat for CapVeri. Renders the shared `@ventora/ai-cs`
 * widget and wires it to CapVeri's auth: the browser never holds the HMAC
 * secret, so each AI-CS worker call is signed by the authenticated
 * `POST /api/v1/ai-cs/sign` BFF. Renders nothing until the worker origin is
 * configured (`VITE_AI_CS_BASE_URL`), so the app shell stays unchanged in
 * environments where AI-CS is not provisioned.
 */
export function AiCsHelpWidget(): React.ReactElement | null {
  const { user } = useAuth()
  const location = useLocation()

  const baseUrl = import.meta.env.VITE_AI_CS_BASE_URL?.trim() ?? ''
  const userId = user?.id ?? null
  const currentPath = location.pathname

  // Stable API config: a fresh identity rebuilds the widget's session manager,
  // so memoize on the worker origin alone. `signRequest` proxies each canonical
  // request through CapVeri's authenticated BFF, which mints the HMAC assertion.
  // `fetch` is a custom fetcher that injects the user's Supabase JWT as an
  // Authorization header on every request to the AI-CS worker. The worker
  // forwards this header to the BFF's signed context endpoint, which requires
  // a valid Bearer JWT to authenticate the context fetch. Without this, the
  // BFF rejects the context request with 401 and the worker returns 502.
  const api = useMemo<AiCsApiConfig | null>(() => {
    if (baseUrl === '') {
      return null
    }
    return {
      baseUrl,
      fetch: async (input, init) => {
        const session = await getSession()
        const headers = new Headers(init?.headers)
        if (session?.access_token && !headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${session.access_token}`)
        }
        return globalThis.fetch(input, { ...init, headers })
      },
      signRequest: async ({ method, path, body }) => {
        const response = await authenticatedFetch('/api/v1/ai-cs/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, path, body }),
        })
        if (!response.ok) {
          throw new Error(`AI-CS sign request failed (${response.status})`)
        }
        return (await response.json()) as AiCsSignedAssertion
      },
    }
  }, [baseUrl])

  // Keep the session object stable per user so navigation does not reset the
  // conversation. currentPath is refreshed live below: the widget reads it on
  // each render and forwards it per send, so per-screen context tracks the
  // screen the user is actually on without rebuilding the session manager.
  const session = useMemo<SessionRequest | null>(() => {
    if (userId === null) {
      return null
    }
    return { appId: APP_ID, userId, currentPath }
    // currentPath is intentionally excluded: including it would change the
    // session identity on every navigation and drop the active chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (api === null || session === null) {
    return null
  }

  session.currentPath = currentPath

  return (
    <AiCsWidget
      api={api}
      session={session}
      brand={{ id: APP_ID }}
      copy={{ launcher: 'Questions?' }}
    />
  )
}
