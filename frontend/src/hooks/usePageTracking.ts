import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import posthog from 'posthog-js'
import {
  getAppRouteTelemetry,
  getPostHogContext,
  getSafePageSearch,
} from '@/lib/analytics'

const POSTHOG_LOAD_RETRY_DELAY_MS = 250
const POSTHOG_LOAD_MAX_RETRIES = 20

/**
 * Hook that tracks page views on route changes for SPA analytics.
 *
 * Pushes a page_view event to the GTM dataLayer whenever the pathname
 * or search query changes. Must be used within a Router context.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <Router>
 *       <AppContent />
 *     </Router>
 *   )
 * }
 *
 * function AppContent() {
 *   usePageTracking()
 *   return <Routes>...</Routes>
 * }
 * ```
 */
export function usePageTracking(): void {
  const location = useLocation()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const safePageSearch = getSafePageSearch(location.search)
    const routeTelemetry = getAppRouteTelemetry(location.pathname)
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({
      event: 'page_view',
      page_path: location.pathname,
      page_search: safePageSearch,
      page_title: document.title,
      ...routeTelemetry,
    })

    let retries = 0
    let timeoutId: number | undefined
    const capturePostHogPageview = () => {
      if (!posthog.__loaded) {
        if (retries < POSTHOG_LOAD_MAX_RETRIES) {
          retries += 1
          timeoutId = window.setTimeout(
            capturePostHogPageview,
            POSTHOG_LOAD_RETRY_DELAY_MS
          )
        }
        return
      }
      const postHogContext = {
        ...getPostHogContext('frontend', location.pathname),
        page_path: location.pathname,
        page_search: safePageSearch,
        page_title: document.title,
        ...routeTelemetry,
      }
      posthog.capture('$pageview', postHogContext)
      posthog.capture('app_route_viewed', postHogContext)
    }

    capturePostHogPageview()

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [location.pathname, location.search])
}
