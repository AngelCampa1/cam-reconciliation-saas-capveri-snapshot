import { useState, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { logger } from '@/lib/logger'
import { getSession } from '@/api/client'
import { resolveApiUrl } from '@/api/url'

interface UseScreenshotCaptureResult {
  capturing: boolean
  capture: () => Promise<string | null>
  error: string | null
}

export function useScreenshotCapture(): UseScreenshotCaptureResult {
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(async (): Promise<string | null> => {
    setCapturing(true)
    setError(null)
    const widget = document.querySelector('[data-feedback-widget]')

    try {
      // Hide the feedback widget during capture
      if (widget instanceof HTMLElement) {
        widget.style.visibility = 'hidden'
      }

      const canvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio * 0.5, // Reduce size
        ignoreElements: (element) => {
          // Ignore feedback widget and modals
          return (
            element.hasAttribute('data-feedback-widget') ||
            element.getAttribute('role') === 'dialog'
          )
        },
      })

      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              setError('Failed to create screenshot')
              resolve(null)
              return
            }

            // Upload to storage
            try {
              const url = await uploadScreenshot(blob)
              resolve(url)
            } catch (err) {
              setError('Failed to capture screenshot')
              logger.error('Screenshot upload failed', { error: err })
              resolve(null)
            }
          },
          'image/jpeg',
          0.8 // Quality
        )
      })
    } catch (err) {
      setError('Failed to capture screenshot')
      logger.error('Screenshot capture failed', { error: err })
      return null
    } finally {
      if (widget instanceof HTMLElement) {
        widget.style.visibility = 'visible'
      }
      setCapturing(false)
    }
  }, [])

  return { capturing, capture, error }
}

async function uploadScreenshot(blob: Blob): Promise<string | null> {
  const formData = new FormData()
  const filename = `screenshot-${Date.now()}.jpg`
  formData.append('file', blob, filename)

  // Get auth session for Bearer token
  const session = await getSession()

  const headers: Record<string, string> = {}

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`
  }

  const response = await fetch(resolveApiUrl('/api/v1/feedback/screenshot'), {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Failed to upload screenshot')
  }

  const data = await response.json()
  return data.url
}
