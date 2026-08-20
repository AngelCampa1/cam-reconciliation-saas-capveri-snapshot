import { publicKnowledge } from '@/generated/public-knowledge'

export const SITE_URL = publicKnowledge.company.siteUrl
export const APP_URL = publicKnowledge.company.appUrl
export const API_URL = publicKnowledge.company.apiUrl
export const TRIAL_COPY = publicKnowledge.pricing.display.trialLabel

export const SITE_HOST = new URL(SITE_URL).hostname
export const APEX_SITE_HOST = SITE_HOST.replace(/^www\./, '')
export const APP_HOST = new URL(APP_URL).hostname

export const MARKETING_HOSTS = new Set([SITE_HOST, APEX_SITE_HOST])
export const PRODUCTION_FRONTEND_HOSTS = new Set([
  APP_HOST,
  SITE_HOST,
  APEX_SITE_HOST,
])

export function buildSiteUrl(path = '/'): string {
  if (path === '' || path === '/') {
    return SITE_URL
  }
  return new URL(path, SITE_URL).toString()
}

export function buildAppUrl(path = '/'): string {
  return new URL(path, APP_URL).toString()
}
