import { render } from '@testing-library/react'
import { vi, describe, it, expect, afterEach } from 'vitest'
import { CrmFeedbackWidget } from './CrmFeedbackWidget'

// Helper to read the injected script (if any) by data-product attribute
function getInjectedScript(key: string): HTMLScriptElement | null {
  return document.querySelector(
    `script[data-product="${key}"][data-widget="feedback-button"]`
  ) as HTMLScriptElement | null
}

describe('CrmFeedbackWidget', () => {
  afterEach(() => {
    // Remove any injected scripts after each test
    document
      .querySelectorAll('script[data-widget="feedback-button"]')
      .forEach((el) => el.remove())
    vi.unstubAllEnvs()
  })

  it('renders null and injects nothing when VITE_CRM_WIDGET_KEY is unset', () => {
    vi.stubEnv('VITE_CRM_WIDGET_KEY', '')
    const { container } = render(<CrmFeedbackWidget />)
    expect(container.firstChild).toBeNull()
    expect(
      document.querySelector('script[data-widget="feedback-button"]')
    ).toBeNull()
  })

  it('injects exactly one script with correct attributes when key is set', () => {
    const key = 'wk_test1234'
    vi.stubEnv('VITE_CRM_WIDGET_KEY', key)
    vi.stubEnv('VITE_CRM_LOADER_URL', 'https://widgets.ventoralabs.com/w/v1.js')

    render(<CrmFeedbackWidget />)

    const script = getInjectedScript(key)
    expect(script).not.toBeNull()
    expect(script!.src).toBe('https://widgets.ventoralabs.com/w/v1.js')
    expect(script!.getAttribute('data-product')).toBe(key)
    expect(script!.getAttribute('data-widget')).toBe('feedback-button')
    expect(script!.async).toBe(true)

    // Only one script injected
    expect(
      document.querySelectorAll('script[data-widget="feedback-button"]')
    ).toHaveLength(1)
  })

  it('is idempotent — no duplicate on rerender', () => {
    const key = 'wk_test5678'
    vi.stubEnv('VITE_CRM_WIDGET_KEY', key)

    const { rerender } = render(<CrmFeedbackWidget />)
    rerender(<CrmFeedbackWidget />)

    expect(
      document.querySelectorAll(
        `script[data-product="${key}"][data-widget="feedback-button"]`
      )
    ).toHaveLength(1)
  })

  it('removes the script on unmount', () => {
    const key = 'wk_testunmount'
    vi.stubEnv('VITE_CRM_WIDGET_KEY', key)

    const { unmount } = render(<CrmFeedbackWidget />)
    expect(getInjectedScript(key)).not.toBeNull()

    unmount()
    expect(getInjectedScript(key)).toBeNull()
  })

  it('uses default loader URL when VITE_CRM_LOADER_URL is not set', () => {
    const key = 'wk_defaulturl'
    vi.stubEnv('VITE_CRM_WIDGET_KEY', key)
    vi.stubEnv('VITE_CRM_LOADER_URL', '')

    render(<CrmFeedbackWidget />)

    const script = getInjectedScript(key)
    expect(script).not.toBeNull()
    expect(script!.src).toBe('https://widgets.ventoralabs.com/w/v1.js')
  })
})
