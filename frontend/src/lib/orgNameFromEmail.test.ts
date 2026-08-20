import { describe, it, expect } from 'vitest'
import { orgNameFromEmail } from './orgNameFromEmail'

describe('orgNameFromEmail', () => {
  it('derives a title-cased name from a corporate domain', () => {
    expect(orgNameFromEmail('owner@acme.com')).toBe('Acme')
  })

  it('splits hyphenated domain segments into words', () => {
    expect(orgNameFromEmail('owner@acme-properties.com')).toBe(
      'Acme Properties'
    )
  })

  it('uses only the first domain segment for multi-part TLDs', () => {
    expect(orgNameFromEmail('jane@something.co.uk')).toBe('Something')
  })

  it('falls back to "My Workspace" for free-mail providers', () => {
    expect(orgNameFromEmail('jane@gmail.com')).toBe('My Workspace')
    expect(orgNameFromEmail('jane@outlook.com')).toBe('My Workspace')
    expect(orgNameFromEmail('jane@proton.me')).toBe('My Workspace')
    expect(orgNameFromEmail('jane@YAHOO.COM')).toBe('My Workspace')
  })

  it('handles malformed input safely', () => {
    expect(orgNameFromEmail('')).toBe('My Workspace')
    expect(orgNameFromEmail('no-at-sign')).toBe('My Workspace')
    expect(orgNameFromEmail('trailing-at@')).toBe('My Workspace')
  })

  it('falls back to "My Workspace" for punycode (IDN) domains', () => {
    expect(orgNameFromEmail('jane@xn--mnchen-3ya.de')).toBe('My Workspace')
  })

  it('caps the derived name at 64 characters', () => {
    const longSegment = 'a'.repeat(120)
    const result = orgNameFromEmail(`jane@${longSegment}.com`)
    expect(result.length).toBeLessThanOrEqual(64)
    expect(result.startsWith('A')).toBe(true)
  })
})
