import { API_URL, PRODUCTION_FRONTEND_HOSTS } from '@/lib/domains'

const RAW_API_BASE_URL = import.meta.env.VITE_API_URL ?? ''
const API_BASE_URL = RAW_API_BASE_URL.trim().replace(/\/+$/, '')

function getWindowHostname(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.location.hostname.toLowerCase()
}

/**
 * Resolve API paths against configured backend URL in environments where
 * frontend and backend are on different origins.
 */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) {
    return path
  }

  // Only rewrite API calls. Non-API paths should remain app-relative.
  if (!path.startsWith('/api/')) {
    return path
  }

  const apiBaseUrl = getApiBaseUrl()
  if (!apiBaseUrl) {
    return path
  }

  return `${apiBaseUrl}${path}`
}

export function getApiBaseUrl(): string {
  if (API_BASE_URL) {
    return API_BASE_URL
  }

  const hostname = getWindowHostname()
  if (hostname && PRODUCTION_FRONTEND_HOSTS.has(hostname)) {
    return API_URL
  }

  return ''
}
