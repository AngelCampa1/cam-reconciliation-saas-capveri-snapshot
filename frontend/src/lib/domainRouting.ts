import { APP_URL, MARKETING_HOSTS } from './domains'

export const APP_DOMAIN = APP_URL
const APP_ONLY_PATH_PREFIXES = [
  '/dashboard',
  '/auth',
  '/settings',
  '/properties',
  '/reconciliations',
  '/admin',
  '/tenant',
  '/organization',
  '/portfolio',
]

export function isAppOnlyPath(pathname: string): boolean {
  return APP_ONLY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function getAppSubdomainRedirectUrl(currentUrl: string): string {
  const url = new URL(currentUrl)
  return `${APP_DOMAIN}${url.pathname}${url.search}${url.hash}`
}

export function enforceAppSubdomainForAppRoutes(
  windowObject: Window = window
): boolean {
  const hostname = windowObject.location.hostname.toLowerCase()
  if (!MARKETING_HOSTS.has(hostname)) {
    return false
  }

  if (!isAppOnlyPath(windowObject.location.pathname)) {
    return false
  }

  const destination = getAppSubdomainRedirectUrl(windowObject.location.href)
  windowObject.location.replace(destination)
  return true
}
