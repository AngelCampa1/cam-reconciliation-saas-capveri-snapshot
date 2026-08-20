import { useEffect } from 'react'

export function CrmFeedbackWidget() {
  const widgetKey =
    (import.meta.env.VITE_CRM_WIDGET_KEY as string | undefined) || undefined
  const loaderUrl =
    (import.meta.env.VITE_CRM_LOADER_URL as string | undefined) ||
    'https://widgets.ventoralabs.com/w/v1.js'

  useEffect(() => {
    if (!widgetKey) return

    // Guard against double-injection
    const existing = document.querySelector(
      `script[data-product="${widgetKey}"][data-widget="feedback-button"]`
    )
    if (existing) return

    const script = document.createElement('script')
    script.src = loaderUrl
    script.async = true
    script.setAttribute('data-product', widgetKey)
    script.setAttribute('data-widget', 'feedback-button')
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [widgetKey, loaderUrl])

  return null
}
