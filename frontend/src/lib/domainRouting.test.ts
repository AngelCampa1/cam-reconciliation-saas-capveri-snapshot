import { describe, expect, it, vi } from 'vitest'
import {
  APP_DOMAIN,
  enforceAppSubdomainForAppRoutes,
  getAppSubdomainRedirectUrl,
  isAppOnlyPath,
} from './domainRouting'

describe('isAppOnlyPath', () => {
  it('matches authenticated app paths', () => {
    expect(isAppOnlyPath('/dashboard')).toBe(true)
    expect(isAppOnlyPath('/auth/login')).toBe(true)
    expect(isAppOnlyPath('/settings/team')).toBe(true)
    expect(isAppOnlyPath('/tenant/dashboard')).toBe(true)
    expect(isAppOnlyPath('/properties/abc')).toBe(true)
  })

  it('does not match marketing paths', () => {
    expect(isAppOnlyPath('/')).toBe(false)
    expect(isAppOnlyPath('/pricing')).toBe(false)
    expect(isAppOnlyPath('/resources/sb-1103-compliance')).toBe(false)
    expect(isAppOnlyPath('/tools')).toBe(false)
  })
})

describe('getAppSubdomainRedirectUrl', () => {
  it('preserves path, query, and hash', () => {
    expect(
      getAppSubdomainRedirectUrl(
        'https://www.capveri.com/dashboard?tab=overview#summary'
      )
    ).toBe('https://app.capveri.com/dashboard?tab=overview#summary')
  })
})

describe('enforceAppSubdomainForAppRoutes', () => {
  it('redirects when app route is opened on marketing host', () => {
    const replace = vi.fn()
    const mockWindow = {
      location: {
        hostname: 'www.capveri.com',
        href: 'https://www.capveri.com/dashboard',
        pathname: '/dashboard',
        replace,
      },
    } as unknown as Window

    const redirected = enforceAppSubdomainForAppRoutes(mockWindow)
    expect(redirected).toBe(true)
    expect(replace).toHaveBeenCalledWith(`${APP_DOMAIN}/dashboard`)
  })

  it('does not redirect on app domain', () => {
    const replace = vi.fn()
    const mockWindow = {
      location: {
        hostname: 'app.capveri.com',
        href: 'https://app.capveri.com/dashboard',
        pathname: '/dashboard',
        replace,
      },
    } as unknown as Window

    const redirected = enforceAppSubdomainForAppRoutes(mockWindow)
    expect(redirected).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})
