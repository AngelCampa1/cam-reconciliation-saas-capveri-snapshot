import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
  type Mutation,
  type Query,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { isApiError, getErrorMessage } from './api/errors'
import { configureAuth } from './api/client'
import { supabase } from './lib/supabase'
import { ThemeProvider } from './hooks/useTheme'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  captureUnexpectedError,
  initSentry,
  shouldReportError,
} from './lib/sentry'
import { PostHogProvider } from '@posthog/react'
import { createCorrelationId } from './lib/correlationId'
import { logger } from './lib/logger'
import { writeBuildMetadataTag } from './lib/buildMetadata'
import {
  getAnalyticsErrorCategory,
  getAnalyticsErrorName,
  getAnalyticsKeyGroup,
  trackEvent,
} from './lib/analytics'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

const REPORTABLE_GENERIC_QUERY_ERROR_MESSAGES = [
  'network',
  'server',
  'internal',
  'unavailable',
  'timeout',
]

function shouldReportQueryError(error: unknown): boolean {
  if (isApiError(error)) return shouldReportError(error)
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (error instanceof TypeError && message === 'failed to fetch') return true

  return REPORTABLE_GENERIC_QUERY_ERROR_MESSAGES.some((pattern) =>
    message.includes(pattern)
  )
}

export function trackBackgroundQueryFailure(
  error: unknown,
  query: Query<unknown, unknown, unknown, readonly unknown[]>
): void {
  trackEvent('app_background_query_failed', {
    query_group: getAnalyticsKeyGroup(query.queryKey),
    error_name: getAnalyticsErrorName(error),
    error_category: getAnalyticsErrorCategory(error),
    has_cached_data: true,
  })
}

export function trackMutationFailure(
  error: unknown,
  mutation: Mutation<unknown, unknown, unknown, unknown>
): void {
  trackEvent('app_mutation_failed', {
    mutation_group: getAnalyticsKeyGroup(mutation.options.mutationKey),
    error_name: getAnalyticsErrorName(error),
    error_category: getAnalyticsErrorCategory(error),
  })
}

export function handleQueryFailure(
  error: unknown,
  query: Query<unknown, unknown, unknown, readonly unknown[]>
): void {
  if (shouldReportQueryError(error)) {
    captureUnexpectedError(error, {
      operation:
        query.state.data !== undefined
          ? 'react-query.background-query'
          : 'react-query.initial-query',
      path:
        typeof window !== 'undefined' ? window.location.pathname : undefined,
    })
  }

  // Only toast for background refetch failures (query has stale data). Initial
  // load failures are rendered by the route/query error UI instead.
  if (query.state.data !== undefined) {
    trackBackgroundQueryFailure(error, query)
    toast.error(getErrorMessage(error))
  }
}

// Create a client for TanStack Query
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      handleQueryFailure(error, query)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldReportError(error)) {
        captureUnexpectedError(error, {
          operation: 'react-query.mutation',
          path:
            typeof window !== 'undefined'
              ? window.location.pathname
              : undefined,
        })
      }
      trackMutationFailure(error, mutation)
    },
  }),
  defaultOptions: {
    queries: {
      // networkMode 'always' (vs the 'online' default) makes a fetch that fails
      // against an unreachable backend ERROR instead of silently PAUSING
      // (status 'pending', fetchStatus 'paused', isLoading false, error null).
      // The paused state made every page that maps only isLoading/error fall
      // through to its empty/not-found/spinner branch — telling the user "no
      // data" when the server is simply down. Erroring routes the failure
      // through the path the app already uses for HTTP errors: fail-open
      // queries (throwOnError:false) show their inline error state, and no-data
      // primary queries escalate to the global ErrorBoundary's graceful retry.
      networkMode: 'always',
      retry: 1,
      refetchOnWindowFocus: false,
      throwOnError: (_error, query) => query.state.data === undefined,
    },
  },
})

const CAPVERI_POSTHOG_KEY = 'phc_REPLACE_WITH_POSTHOG_PROJECT_KEY'
// Allow an explicit opt-out (set VITE_DISABLE_ANALYTICS=1 in .env.local) so local
// dev sessions don't beacon into the production PostHog project — the continuous
// beaconing also prevents the page from ever reaching network-idle.
const analyticsDisabled = import.meta.env.VITE_DISABLE_ANALYTICS === '1'
const posthogKey = analyticsDisabled
  ? undefined
  : (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ||
    CAPVERI_POSTHOG_KEY
const posthogOptions = {
  api_host:
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
    'https://us.i.posthog.com',
  capture_pageview: false,
  autocapture: true,
  rageclick: true,
  mask_all_element_attributes: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector:
      '[data-ph-mask], [data-sensitive], .ph-mask, input, textarea, [contenteditable="true"]',
    blockSelector: '[data-ph-block], .ph-no-capture',
  },
  // Pinned defaults snapshot --- locks SDK behaviour to a known-good set of
  // defaults. Update when intentionally upgrading PostHog SDK behaviour.
  defaults: '2025-05-24',
} as const

const BOOTSTRAP_FLAG = '__capveriAppBootstrapped__'
const BOOTSTRAP_IN_PROGRESS = 'in_progress'
const BOOTSTRAP_COMPLETE = 'complete'

function renderApp() {
  // PostHogProvider sits inside ErrorBoundary so SDK errors are caught and
  // reported rather than crashing the application.
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary context="App">
        {posthogKey ? (
          <PostHogProvider apiKey={posthogKey} options={posthogOptions}>
            <QueryClientProvider client={queryClient}>
              <ThemeProvider>
                <App />
              </ThemeProvider>
            </QueryClientProvider>
          </PostHogProvider>
        ) : (
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </QueryClientProvider>
        )}
      </ErrorBoundary>
    </React.StrictMode>
  )
}

function isTestEnvironment(): boolean {
  return import.meta.env.MODE === 'test'
}

export function resetBootstrapForTests(): void {
  if (isTestEnvironment()) {
    delete (globalThis as Record<string, unknown>)[BOOTSTRAP_FLAG]
  }
}

export function bootstrapApp(): void {
  const bootstrapState = globalThis as Record<string, unknown>
  if (
    bootstrapState[BOOTSTRAP_FLAG] === BOOTSTRAP_IN_PROGRESS ||
    bootstrapState[BOOTSTRAP_FLAG] === BOOTSTRAP_COMPLETE
  ) {
    return
  }
  bootstrapState[BOOTSTRAP_FLAG] = BOOTSTRAP_IN_PROGRESS

  try {
    writeBuildMetadataTag()

    // Initialise Sentry before anything else (no-op when VITE_SENTRY_DSN is unset)
    initSentry()

    // Service workers are not needed in the unit-test runtime.
    if (!isTestEnvironment()) {
      registerSW({
        onRegisterError(error) {
          logger.warn('Service worker registration failed', { error })
        },
      })
    }

    // Generate session-scoped correlation ID for request tracing
    createCorrelationId()

    // Configure API client with Supabase auth
    configureAuth({
      getSession: async () => {
        const { data } = await supabase.auth.getSession()

        // Debug logging for E2E tests
        logger.debug('API Client getSession called', {
          hasSession: !!data.session,
        })
        if (data.session) {
          logger.debug('API Client session details', {
            expiresAt: data.session.expires_at,
            userEmail: data.session.user?.email,
          })
        }

        if (!data.session) return null

        return {
          access_token: data.session.access_token,
          ...(data.session.refresh_token && {
            refresh_token: data.session.refresh_token,
          }),
          ...(data.session.expires_at !== undefined && {
            expires_at: data.session.expires_at,
          }),
          ...(data.session.user && {
            user: {
              id: data.session.user.id,
              ...(data.session.user.email && {
                email: data.session.user.email,
              }),
            },
          }),
        }
      },
      signOut: async () => {
        logger.debug('API Client signOut called')
        await supabase.auth.signOut()
      },
    })

    renderApp()
    bootstrapState[BOOTSTRAP_FLAG] = BOOTSTRAP_COMPLETE
  } catch (error) {
    delete bootstrapState[BOOTSTRAP_FLAG]
    throw error
  }
}

bootstrapApp()
